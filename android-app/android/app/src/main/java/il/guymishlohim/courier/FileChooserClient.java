package il.guymishlohim.courier;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * File picking for the courier app (Android WebView).
 *
 * Capacitor's default chooser checks for a camera app with resolveActivity(), which returns null on
 * Android 11+ (package visibility), so "take a photo" fell back to a plain picker and photo uploads
 * failed. Here every input that accepts images is handled by us:
 *  - <input capture> (document photo, proof photo)  -> the camera opens directly
 *  - image input without capture (gallery/screenshot) -> one chooser: gallery / files / camera
 * Anything else (Excel, CSV...) still goes through Capacitor's own picker, which already works.
 */
public class FileChooserClient extends BridgeWebChromeClient {
    private static final String TAG = "GMFileChooser";

    private final MainActivity activity;
    private ValueCallback<Uri[]> pending;
    private Uri cameraUri;
    private File cameraFile;

    public FileChooserClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
        String[] accept = params.getAcceptTypes();
        if (!acceptsImages(accept)) {
            return super.onShowFileChooser(webView, callback, params); // Excel / CSV / PDF only
        }
        finishPending(null); // a previous chooser that never returned
        pending = callback;

        Intent camera = cameraIntent();
        try {
            if (params.isCaptureEnabled() && camera != null) {
                activity.launchChooser(camera);
                return true;
            }
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            String[] types = mimeTypes(accept);
            if (types.length == 1) {
                pick.setType(types[0]);
            } else {
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, types);
            }
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            Intent chooser = Intent.createChooser(pick, "בחר תמונה");
            if (camera != null) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { camera });
            }
            activity.launchChooser(chooser);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w(TAG, "chooser failed", e);
            pending = null; // hand the same callback to Capacitor's picker (must not be answered twice)
            return super.onShowFileChooser(webView, callback, params);
        }
    }

    /** Called by MainActivity with the chooser / camera result. */
    void onResult(int resultCode, Intent data) {
        Uri[] result = null;
        if (resultCode == Activity.RESULT_OK) {
            List<Uri> uris = new ArrayList<>();
            if (data != null && data.getClipData() != null) {
                ClipData clip = data.getClipData();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null && !u.equals(cameraUri)) uris.add(u);
                }
            }
            if (uris.isEmpty() && data != null && data.getData() != null && !data.getData().equals(cameraUri)) {
                uris.add(data.getData());
            }
            if (uris.isEmpty() && cameraFile != null && cameraFile.length() == 0 && data != null) {
                saveThumbnail(data); // a camera app that ignored EXTRA_OUTPUT and returned a small bitmap
            }
            if (uris.isEmpty() && cameraFile != null && cameraFile.exists() && cameraFile.length() > 0) {
                uris.add(cameraUri); // photo taken with the camera
            }
            if (!uris.isEmpty()) result = uris.toArray(new Uri[0]);
        }
        finishPending(result);
    }

    private void finishPending(Uri[] result) {
        if (pending != null) {
            try {
                pending.onReceiveValue(result);
            } catch (Exception e) {
                Log.w(TAG, "callback", e);
            }
        }
        pending = null;
    }

    private void saveThumbnail(Intent data) {
        try {
            Object bmp = data.getExtras() != null ? data.getExtras().get("data") : null;
            if (bmp instanceof android.graphics.Bitmap) {
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(cameraFile)) {
                    ((android.graphics.Bitmap) bmp).compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, out);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "thumbnail", e);
        }
    }

    private Intent cameraIntent() {
        try {
            File dir = new File(activity.getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File[] old = dir.listFiles();
            if (old != null) {
                long cut = System.currentTimeMillis() - 24L * 3600 * 1000;
                for (File f : old) if (f.lastModified() < cut) f.delete();
            }
            cameraFile = File.createTempFile("photo_", ".jpg", dir);
            cameraUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", cameraFile);
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            i.setClipData(ClipData.newRawUri("", cameraUri));
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return i;
        } catch (Exception e) {
            Log.w(TAG, "camera file", e);
            cameraFile = null;
            cameraUri = null;
            return null;
        }
    }

    private static boolean acceptsImages(String[] accept) {
        if (accept == null) return false;
        for (String a : accept) {
            String t = a == null ? "" : a.trim().toLowerCase();
            if (t.startsWith("image/") || t.matches("\\.(jpe?g|png|gif|webp|heic|heif|bmp)")) return true;
        }
        return false;
    }

    private static String[] mimeTypes(String[] accept) {
        List<String> out = new ArrayList<>();
        MimeTypeMap map = MimeTypeMap.getSingleton();
        for (String a : accept) {
            String t = a == null ? "" : a.trim().toLowerCase();
            if (t.isEmpty()) continue;
            if (t.startsWith(".")) t = map.getMimeTypeFromExtension(t.substring(1));
            if (t != null && t.contains("/") && !out.contains(t)) out.add(t);
        }
        if (out.isEmpty()) out.add("image/*");
        return out.toArray(new String[0]);
    }
}

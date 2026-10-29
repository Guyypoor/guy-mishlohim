package il.guymishlohim.courier;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FileChooserClient fileChooser;

    // Registered while the activity is being created (required by the Activity Result API).
    private final ActivityResultLauncher<Intent> chooserLauncher = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
            if (fileChooser != null) fileChooser.onResult(result.getResultCode(), result.getData());
        }
    );

    void launchChooser(Intent intent) {
        chooserLauncher.launch(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Camera / gallery for the address-photo and proof-of-delivery inputs (see FileChooserClient).
        if (bridge != null && bridge.getWebView() != null) {
            fileChooser = new FileChooserClient(bridge, this);
            bridge.getWebView().setWebChromeClient(fileChooser);
        }
        // Android 13+: the shift's "location on" notification needs this permission,
        // otherwise background tracking can stop when the screen is off.
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7101);
        }
    }
}

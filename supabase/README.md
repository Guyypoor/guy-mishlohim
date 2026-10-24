# שרת (Supabase) – שינויים שהורצו ידנית ב-SQL Editor / Edge Functions

## 24/10/2026
- deliveries: עמודות pkg, pkgs, spot, stop_type ('delivery'|'pickup'), last_stop, svc_min, pod (jsonb: where, recipient, note, photo, sig, photo_path, sig_path).
- storage bucket `pod` (פרטי, עד 2MB, jpeg/png). מדיניות: שליח פעיל מעלה/מעדכן רק בתיקייה `<uid>/`; קריאה – מנהל, או השליח עצמו.
- Edge Function `tomtom-route` (הקוד בתיקייה functions/tomtom-route). סוד נדרש: `TOMTOM_KEY`. בלי הסוד האפליקציה ממשיכה לעבוד לפי OSRM (בלי תנועה).

# מסלול שליח – אפליקציית אנדרואיד (APK)

עטיפת Capacitor לאתר החי (https://guyypoor.github.io/guy-mishlohim/).
האפליקציה טוענת את האתר, כך שכל שינוי באתר מגיע לשליחים בלי להתקין מחדש.
APK חדש נדרש רק כשמשנים משהו בתיקייה הזו (הרשאות, תוספים, אייקון).

- מה ה-APK מוסיף: מיקום ברקע בזמן משמרת (גם כשהמסך כבוי, עם התראה קבועה), מצלמה, אייקון ומסך מלא.
- בנייה: GitHub Actions (`.github/workflows/android-apk.yml`) בכל שינוי ב-`android-app/`, או ידנית (Run workflow).
- הקובץ המוכן: ענף `apk` – `guy-mishlohim.apk` + `version.txt`.
- חתימה: `signing/release.p12.enc` מוצפן; הסיסמה רק בסוד הריפו `ANDROID_SIGNING_PASS` (וגיבוי במחשב H.A). אותו מפתח בכל בנייה = עדכון מעל הגרסה הקודמת. לא להחליף את המפתח.
- מזהה האפליקציה: `il.guymishlohim.courier`.

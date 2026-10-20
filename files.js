/* גיא שליחויות – קריאת קבצים שהשליח/המנהל מעלה: אקסל, CSV, טקסט, PDF ותמונות.
   הכול נקרא כאן בדפדפן ולא נשלח לשום מקום. */
window.FileIn = (function(){
  const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/";
  const SHEET_EXT = /\.(xlsx|xlsm|xlsb|xls|ods|csv|tsv|txt)$/i;
  const SHEET_MIME = /spreadsheet|excel|csv|tab-separated|opendocument\.spreadsheet|^text\/plain$/i;
  // מה מותר לבחור. גם סיומות וגם סוגי MIME – אייפון לפעמים "מאפיר" קבצים כשיש רק סיומות.
  const SHEETS = ".xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.oasis.opendocument.spreadsheet,text/csv,text/comma-separated-values,text/tab-separated-values,text/plain";
  const PDF = ".pdf,application/pdf";
  const IMAGES = "image/*,.heic,.heif";
  const ACCEPT = { all: [IMAGES, PDF, SHEETS].join(","), sheets: [SHEETS, PDF, IMAGES].join(",") };

  function kind(f){
    const n = String(f && f.name || ""), t = String(f && f.type || "");
    if (/\.numbers$/i.test(n)) return "numbers";
    if (/\.pdf$/i.test(n) || t === "application/pdf") return "pdf";
    if (/^image\//.test(t) || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(n)) return "image";
    if (/\.(csv|tsv|txt)$/i.test(n) || /^text\//.test(t)) return "text";
    if (SHEET_EXT.test(n) || SHEET_MIME.test(t)) return "sheet";
    return "unknown";
  }
  // טקסט: קודם UTF-8; אם לא תקין – קידוד עברית של אקסל ישן (windows-1255)
  async function decodeText(buf){
    const u = new Uint8Array(buf);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u).replace(/^﻿/, ""); }
    catch(e) { try { return new TextDecoder("windows-1255").decode(u); } catch(e2) { return new TextDecoder("utf-8").decode(u); } }
  }
  function readBuf(f){
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error || new Error("read")); r.readAsArrayBuffer(f); });
  }
  // מחזיר את שורות הגיליון הראשון שיש בו תוכן (מערך של מערכים)
  async function sheetRows(f){
    if (typeof XLSX === "undefined") throw Object.assign(new Error("nolib"), { code: "nolib" });
    const buf = await readBuf(f);
    let wb;
    if (kind(f) === "text") {
      const txt = await decodeText(buf);
      wb = XLSX.read(txt, { type: "string", raw: false, FS: /\.tsv$/i.test(f.name || "") || (txt.split("\t").length > txt.split(",").length) ? "\t" : undefined });
    } else wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: false });
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false, blankrows: false })
        .filter(r => r.some(c => String(c).trim()));
      if (rows.length) return rows;
    }
    return [];
  }
  // טקסט עברי ב-PDF לפעמים יוצא הפוך (סדר ויזואלי). אם אותיות סופיות מופיעות בתחילת מילים – הופכים את השורה.
  function fixRtl(line){
    const words = line.split(/\s+/).filter(w => /[א-ת]{2,}/.test(w));
    let start = 0, end = 0;
    for (const w of words) { const h = w.replace(/[^א-ת]/g, ""); if (/^[ךםןףץ]/.test(h)) start++; if (/[ךםןףץ]$/.test(h)) end++; }
    if (start <= end) return line;
    return line.split(/(\s+)/).reverse().map(w => /[א-ת]/.test(w) ? [...w].reverse().join("") : w).join("");
  }
  let pdfLib = null;
  async function pdfjs(){
    if (pdfLib) return pdfLib;
    const lib = await import(PDFJS + "pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
    return (pdfLib = lib);
  }
  // PDF: הטקסט (שורה לכל שורה בדף) + תמונה של כל דף לקריאה מתמונה אם אין טקסט
  async function pdf(f, opt){
    opt = opt || {};
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await readBuf(f)), isEvalSupported: false }).promise;
    const max = Math.min(doc.numPages, opt.maxPages || 10), lines = [], images = [], table = [];
    let cols = null; // עמודות הטבלה לפי שורת הכותרת, אם יש
    for (let p = 1; p <= max; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 3);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: it.transform[4], c: it.transform[4] + (it.width || 0) / 2, s: it.str });
      }
      [...rows.keys()].sort((a, b) => b - a).forEach(y => {
        const parts = rows.get(y), heb = parts.some(o => /[א-ת]/.test(o.s));
        parts.sort((a, b) => heb ? b.x - a.x : a.x - b.x);
        lines.push(fixRtl(parts.map(o => o.s.trim()).join(" ").replace(/\s+/g, " ")));
        // טבלה: שורת כותרת עם "כתובת"/"רחוב" קובעת את העמודות, וכל שורה אחריה מתחלקת לפיהן
        if (!cols && parts.length > 1 && parts.some(o => /כתובת|רחוב|address|street/i.test(fixRtl(o.s)))) {
          cols = parts.map(o => o.c); table.push(parts.map(o => fixRtl(o.s.trim())));
        } else if (cols) {
          const cells = cols.map(() => "");
          for (const o of parts) { let b = 0; cols.forEach((c, i) => { if (Math.abs(c - o.c) < Math.abs(cols[b] - o.c)) b = i; }); cells[b] = (cells[b] ? cells[b] + " " : "") + fixRtl(o.s.trim()); }
          table.push(cells);
        }
      });
      if (opt.images !== false) {
        const vp0 = page.getViewport({ scale: 1 }), scale = Math.min(3, 2000 / Math.max(vp0.width, vp0.height));
        const vp = page.getViewport({ scale }), c = document.createElement("canvas");
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: x, viewport: vp }).promise;
        const blob = await new Promise(r => c.toBlob(r, "image/png"));
        if (blob) images.push(new File([blob], (f.name || "pdf").replace(/\.pdf$/i, "") + "-עמוד" + p + ".png", { type: "image/png" }));
      }
      page.cleanup && page.cleanup();
    }
    return { text: lines.join("\n"), table: table.length > 1 ? table : null, images, pages: doc.numPages, read: max };
  }
  // הודעת שגיאה ברורה לפי סוג הקובץ
  function why(e, f){
    const k = kind(f);
    if (k === "numbers") return "קובץ Numbers של אייפון לא נתמך. ב-Numbers: שתף > ייצוא > Excel, ואז בחר את קובץ ה-xlsx.";
    if (e && e.code === "nolib") return "לא הצלחתי לטעון את קורא הקבצים. בדוק שיש אינטרנט ונסה שוב.";
    if (e && /password|encrypt/i.test(String(e.message || e))) return "הקובץ מוגן בסיסמה. פתח אותו ושמור עותק בלי סיסמה.";
    if (k === "pdf") return "לא הצלחתי לפתוח את ה-PDF. נסה שוב, או צלם מסך של הדף והעלה את התמונה.";
    return "לא הצלחתי לקרוא את הקובץ " + (f && f.name ? "\"" + f.name + "\"" : "") + ". שמור אותו כ-xlsx או csv ונסה שוב.";
  }
  return { ACCEPT, kind, sheetRows, pdf, fixRtl, decodeText, why };
})();

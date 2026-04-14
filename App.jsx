import { useState, useEffect, useRef, useCallback } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

// Load SheetJS from CDN
let XLSX_LOADED = null;
async function loadXLSX() {
  if (XLSX_LOADED) return XLSX_LOADED;
  return new Promise((resolve, reject) => {
    if (window.XLSX) { XLSX_LOADED = window.XLSX; resolve(window.XLSX); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => { XLSX_LOADED = window.XLSX; resolve(window.XLSX); };
    s.onerror = () => reject(new Error("שגיאה בטעינת ספריית Excel"));
    document.head.appendChild(s);
  });
}

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = ["מנויים", "הזמנות באינטרנט", "הזמנות אוכל", "בגדים", "מש-קר", "יציאות", "אוכל בדרך", "כוורת", "חיסכון", 'בלת"ם', "הוצאה גדולה", "שכר דירה", "ביטוחים", "ציוד צבאי", "הוצאה לא רלוונטית", "אחר"];
const EXCLUDED_CATS = ["הוצאה לא רלוונטית"]; // לא נספרות בסך ההוצאות
const CAT_COLORS = {
  "מנויים":           "#6366f1",
  "הזמנות באינטרנט": "#f59e0b",
  "הזמנות אוכל":     "#14b8a6",
  "בגדים":            "#ec4899",
  "מש-קר":            "#06b6d4",
  "יציאות":           "#f97316",
  "כוורת":            "#3b82f6",
  "חיסכון":           "#8b5cf6",
  'בלת"ם':            "#e11d48",
  "הוצאה גדולה":      "#0ea5e9",
  "שכר דירה":         "#84cc16",
  "ביטוחים":          "#f43f5e",
  "ציוד צבאי":        "#65a30d",
  "אוכל בדרך":        "#fb923c",
  "הוצאה לא רלוונטית":"#4b5563",
  "אחר":              "#94a3b8",
};
const CAT_ICONS = {
  "מנויים":"📺","הזמנות באינטרנט":"🛒","הזמנות אוכל":"🛵","בגדים":"👗",
  "מש-קר":"🧃","יציאות":"🎉","כוורת":"🐝","חיסכון":"💜",
  'בלת"ם':"⚡","הוצאה גדולה":"💸","שכר דירה":"🏠","ביטוחים":"🛡️","ציוד צבאי":"🎖️","אוכל בדרך":"🌯","הוצאה לא רלוונטית":"🚫","אחר":"📌",
};
const MONTH_NAMES = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// ── Custom categories support ────────────────────────────────────────────
const CUSTOM_CATS_KEY = "expense_tracker_custom_cats";
const CUSTOM_COLOR_POOL = ["#d946ef","#eab308","#22d3ee","#a3e635","#f472b6","#818cf8","#fb7185","#34d399","#fbbf24","#c084fc","#38bdf8","#f87171"];
const CUSTOM_ICON_POOL = ["🏷️","📎","🔖","🎯","🛍️","🎁","✨","🔧","🚗","🏥","📚","🎓","🍽️","🏋️","💊","🎮","📱","✈️","🐾","🎨"];

async function loadCustomCats() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) || "[]"); } catch { return []; }
}
async function saveCustomCats(cats) {
  localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(cats));
}
function getCustomCatColor(i) { return CUSTOM_COLOR_POOL[i % CUSTOM_COLOR_POOL.length]; }
function getCustomCatIcon(i) { return CUSTOM_ICON_POOL[i % CUSTOM_ICON_POOL.length]; }

// ── Income helper — handles both old (income) and new (salary+extraIncome) data ──
function getIncome(d) {
  if (!d) return 0;
  // New format: salary + extraIncome
  if (d.salary !== undefined || d.extraIncome !== undefined) {
    return (d.salary || 0) + (d.extraIncome || 0);
  }
  // Legacy format: income field
  return d.income || 0;
}

// ── Persistent storage via localStorage ──────────────────────────────────
const STORAGE_KEY = "expense_tracker_data";

async function persistLoad() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

async function persistSave(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getMonthLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m)-1]} ${y}`;
}
function getShortLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m)-1].slice(0,3)} '${y.slice(2)}`;
}

// Load PDF.js from CDN for local PDF parsing
let PDFJS_LOADED = null;
async function loadPDFJS() {
  if (PDFJS_LOADED) return PDFJS_LOADED;
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { PDFJS_LOADED = window.pdfjsLib; resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      PDFJS_LOADED = window.pdfjsLib;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("שגיאה בטעינת ספריית PDF"));
    document.head.appendChild(s);
  });
}

async function extractPDFText(file) {
  const pdfjsLib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }
  return fullText;
}

function parsePDFLocally(text) {
  const transactions = [];
  // Match Israeli credit card statement patterns:
  // DD/MM/YY or DD/MM/YYYY followed by business name, then amounts
  const txRegex = /(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+(?:חיוב עסק(?:ו|ות) מייד[יה]|הוראת קבע|רגילה)\s+([\d,.]+)\s+([\d,.]+)/g;

  let match;
  while ((match = txRegex.exec(text)) !== null) {
    const rawDate = match[1];
    const desc = match[2].trim();
    const amount = parseFloat(match[4].replace(/,/g, ""));

    if (isNaN(amount) || amount <= 0) continue;

    // Normalize date to DD/MM/YYYY
    let dateStr = rawDate;
    const parts = rawDate.split("/");
    if (parts.length === 3) {
      let [dd, mm, yy] = parts;
      if (yy.length === 2) yy = (parseInt(yy) > 50 ? "19" : "20") + yy;
      dateStr = `${dd}/${mm}/${yy}`;
    }

    const category = classifyTransaction(desc, "");
    transactions.push({ date: dateStr, description: desc, amount, category });
  }

  // If regex didn't work, try line-by-line approach for different format
  if (transactions.length === 0) {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const m = line.match(/(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+([\d,.]+)\s+([\d,.]+)/);
      if (m) {
        const rawDate = m[1];
        const desc = m[2].trim().replace(/\s+חיוב.*$/, "").replace(/\s+רגילה.*$/, "").trim();
        const amount = parseFloat(m[4].replace(/,/g, ""));
        if (isNaN(amount) || amount <= 0 || desc.includes("סה\"כ") || desc.includes("חיוב לחשבון")) continue;

        let dateStr = rawDate;
        const parts = rawDate.split("/");
        if (parts.length === 3) {
          let [dd, mm, yy] = parts;
          if (yy.length === 2) yy = (parseInt(yy) > 50 ? "19" : "20") + yy;
          dateStr = `${dd}/${mm}/${yy}`;
        }

        const category = classifyTransaction(desc, "");
        transactions.push({ date: dateStr, description: desc, amount, category });
      }
    }
  }

  // Detect month by majority vote
  const monthCounts = {};
  transactions.forEach(t => {
    const p = t.date.split("/");
    if (p.length === 3) {
      const m = `${p[2]}-${p[1]}`;
      monthCounts[m] = (monthCounts[m] || 0) + 1;
    }
  });
  const sorted = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
  const month = sorted.length > 0 ? sorted[0][0] : null;

  return { month, transactions };
}

// ── Claude API ─────────────────────────────────────────────────────────────
function buildAnalysisPrompt(customCats = []) {
  const customLines = customCats.map(c => `- ${c.name}: ${c.keywords || "קטגוריה מותאמת אישית"}`).join("\n");
  return `נתח את פירוט ההוצאות וחלץ את כל העסקאות.

עבור כל עסקה זהה: תאריך (DD/MM/YYYY), תיאור, סכום חיובי, וקטגוריה מהרשימה:

- מנויים: נטפליקס, ספוטיפאי, גוגל, אפל, דיסני, Wolt+, iCloud, מנוי חודשי
- הזמנות באינטרנט: אמזון, אליאקספרס, SHEIN, TEMU, Zara Online, רכישה מקוונת
- הזמנות אוכל: וולט, Wolt, תן ביס, 10bis, ג׳אחנון פלוס, משלוח אוכל, הזמנת אוכל
- בגדים: זארה, H&M, קסטרו, ACE, חנות בגדים
- מש-קר: מכונות חטיפים, מכונות שתיה, קנטינה, מש-קר, vending machine, חטיפים ממכונה
- אוכל בדרך: שווארמה, פלאפל, מזון מהיר, אוכל ברחוב, ארוחה בדרך, חומוס, פיתה, שניצל, בורגר
- יציאות: מסעדות, קפה, בתי קפה, ברים, פאבים, בילוי, בידור, סרטים, קונצרטים, טיולים
- כוורת: כוורת (אם מצוין במפורש)
- חיסכון: העברה לחיסכון, קרן השתלמות, פנסיה, ביטוח חיים
- בלת"ם: הוצאה בלתי מתוכננת, חירום, תיקון פתאומי, קנס, רפואה דחופה
- הוצאה גדולה: רכישה יקרה חד פעמית, ריהוט, מכשיר חשמלי, טיסה, נסיעה ארוכה
- ציוד צבאי: ציוד צבאי, מדים, נעליים צבאיות, תיק צבאי, ציוד שטח, ציוד לחיילים
- הוצאה לא רלוונטית: הוצאה שאינה רלוונטית, טעות, החזר, לא מובן${customLines ? "\n" + customLines : ""}
- אחר: כל דבר אחר שלא מתאים לשום קטגוריה

חשוב מאוד: זהה את החודש והשנה הרלוונטיים מהמסמך עצמו.
החזר JSON בלבד ללא backticks ולא טקסט נוסף:
{"month":"YYYY-MM","transactions":[{"date":"DD/MM/YYYY","description":"שם","amount":123.45,"category":"קטגוריה"}]}`;
}

async function parseExpensesWithClaude(base64PDF, retries = 5, customCats = []) {
  const prompt = buildAnalysisPrompt(customCats);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64PDF } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    const data = await res.json();
    if (data.error) {
      const msg = data.error.message || "";
      const isOverload = res.status === 429 || res.status === 529 || msg.toLowerCase().includes("overload") || msg.toLowerCase().includes("rate");
      if (isOverload && attempt < retries) {
        const wait = (attempt + 1) * 15000; // 15s, 30s, 45s, 60s, 75s
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(data.error.message);
    }
    const text = data.content.map(b => b.text || "").join("");
    try {
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      throw new Error("התשובה מ-AI לא הייתה בפורמט תקין. נסה שוב.");
    }
  }
}

// ── Local Excel parser for Israeli credit card statements ──────────────────
// Classifies transactions locally by keyword matching, no AI needed
const CATEGORY_KEYWORDS = {
  "מנויים": ["spotify","נטפליקס","netflix","disney","דיסני","google storage","icloud","apple.com/bill","wolt+","סלקום","פרטנר","hot mobile"],
  "הזמנות באינטרנט": ["amazon","אמזון","aliexpress","אליאקספרס","shein","temu","zara online","ebay","אי ביי"],
  "הזמנות אוכל": ["wolt","וולט","10bis","תן ביס","ג׳אחנון","jahnun","משלוח","cibus","סיבוס","תפנית"],
  "בגדים": ["זארה","zara","h&m","קסטרו","castro","ace","fox","רנואר","גולף","אמריקן איגל"],
  "מש-קר": ["מש - קר","מש-קר","נאייקס","vending","מכונת"],
  "אוכל בדרך": ["שווארמה","פלאפל","שלום פלאפל","מאפה","פיצה","בורגר","שניצל","חומוס","סנדוויץ","מזון מהיר"],
  "יציאות": ["מסעדה","מסעדות","קפה","קפה ","בית קפה","אודליש","המשביע","ארומה","גרג","רולדין","מקדונלד","בורגרנצ","סרט","קולנוע","סינמה"],
  "כוורת": ["כוורת"],
  "חיסכון": ["חיסכון","קרן השתלמות","פנסיה","ביטוח חיים"],
  'בלת"ם': ["חירום","קנס","רפואה דחופה"],
  "הוצאה גדולה": ["טיסה","אל על","ריהוט","איקאה","מכשיר חשמלי"],
  "שכר דירה": ["שכר דירה","שכ\"ד","דמי שכירות"],
  "ביטוחים": ["ביטוח","הראל","מגדל","כלל ביטוח","הפניקס"],
  "ציוד צבאי": ["ציוד צבאי","מדים","צבאי","מחנה"],
};

function classifyTransaction(description, branch) {
  const text = `${description} ${branch || ""}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) return cat;
  }
  // Fallback by branch name
  if (branch) {
    const b = branch.toLowerCase();
    if (b.includes("מזון") || b.includes("משקאות") || b.includes("סופרמרקט")) return "אוכל בדרך";
    if (b.includes("מסעדות") || b.includes("בילוי") || b.includes("פנאי")) return "יציאות";
    if (b.includes("ביגוד") || b.includes("הלבשה") || b.includes("אופנה")) return "בגדים";
    if (b.includes("אנרגיה") || b.includes("דלק")) return "אחר";
  }
  return "אחר";
}

function parseExcelDirectly(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const xlsx = await loadXLSX();
      const r = new FileReader();
      r.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = xlsx.read(data, { type: "array" });
          const transactions = [];
          let detectedMonth = null;

          for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

            // Find the header row (contains "תאריך" and "סכום" or "בית עסק")
            let headerIdx = -1;
            let colDate = -1, colDesc = -1, colAmount = -1, colBranch = -1;

            for (let i = 0; i < Math.min(rows.length, 10); i++) {
              const row = rows[i].map(c => String(c).replace(/\n/g, " ").trim());
              const dateCol = row.findIndex(c => c.includes("תאריך"));
              const descCol = row.findIndex(c => c.includes("בית עסק") || c.includes("שם"));
              const amtCol = row.findIndex(c => c.includes("סכום חיוב") || c.includes("סכום עסקה") || c.includes("סכום"));
              if (dateCol !== -1 && (descCol !== -1 || amtCol !== -1)) {
                headerIdx = i;
                colDate = dateCol;
                colDesc = descCol !== -1 ? descCol : dateCol + 1;
                colAmount = amtCol !== -1 ? amtCol : colDesc + 1;
                colBranch = row.findIndex(c => c.includes("ענף"));
                break;
              }
            }

            if (headerIdx === -1) continue;

            // Parse data rows
            for (let i = headerIdx + 1; i < rows.length; i++) {
              const row = rows[i];
              const rawDate = row[colDate];
              const desc = String(row[colDesc] || "").trim();
              const rawAmt = row[colAmount];
              const branch = colBranch !== -1 ? String(row[colBranch] || "").trim() : "";

              if (!rawDate || !desc) continue;

              // Parse date — could be "2026-03-31 00:00:00" or "31/03/2026" or Date object
              let dateStr = "";
              if (rawDate instanceof Date || (typeof rawDate === "number")) {
                // Excel serial date or Date object
                const d = typeof rawDate === "number" ? new Date((rawDate - 25569) * 86400000) : rawDate;
                dateStr = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
              } else {
                const s = String(rawDate).trim();
                const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                  dateStr = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
                } else {
                  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                  if (dmyMatch) dateStr = `${dmyMatch[1].padStart(2,"0")}/${dmyMatch[2].padStart(2,"0")}/${dmyMatch[3]}`;
                  else continue; // Skip non-date rows
                }
              }

              // Parse amount
              const amt = parseFloat(String(rawAmt).replace(/[^\d.-]/g, ""));
              if (isNaN(amt) || amt <= 0) continue;

              const category = classifyTransaction(desc, branch);
              transactions.push({ date: dateStr, description: desc, amount: amt, category });
            }
          }

          if (transactions.length === 0) {
            reject(new Error("לא נמצאו עסקאות בקובץ. ייתכן שהמבנה לא מוכר."));
            return;
          }

          // Detect month from the most common month across all transactions
          if (!detectedMonth) {
            const monthCounts = {};
            transactions.forEach(t => {
              const parts = t.date.split("/");
              if (parts.length === 3) {
                const m = `${parts[2]}-${parts[1]}`;
                monthCounts[m] = (monthCounts[m] || 0) + 1;
              }
            });
            const sorted = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) detectedMonth = sorted[0][0];
          }

          resolve({
            month: detectedMonth || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`,
            transactions
          });
        } catch (err) {
          reject(new Error("שגיאה בקריאת קובץ האקסל: " + err.message));
        }
      };
      r.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"));
      r.readAsArrayBuffer(file);
    } catch (err) {
      reject(err);
    }
  });
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Failed"));
    r.readAsDataURL(file);
  });
}

// ── Tooltip style ──────────────────────────────────────────────────────────
function getTT() {
  const s = getComputedStyle(document.documentElement);
  return {
    contentStyle: { background:s.getPropertyValue('--tooltip-bg').trim(), border:`1px solid ${s.getPropertyValue('--tooltip-border').trim()}`, borderRadius:8, fontSize:12, color:s.getPropertyValue('--tooltip-text').trim(), boxShadow:"0 4px 12px rgba(0,0,0,0.3)" },
    itemStyle: { color:s.getPropertyValue('--tooltip-text').trim(), fontWeight:600 },
    labelStyle: { color:s.getPropertyValue('--tooltip-label').trim(), fontWeight:700 },
    formatter: v => `₪${Math.round(Number(v)).toLocaleString("he-IL")}`,
    itemSorter: item => -Number(item.value),
  };
}

// Round Y-axis to nice steps (supports negative values too)
function niceYAxis(data, keys) {
  const allVals = data.flatMap(d => keys.map(k => d[k]||0));
  const maxVal = Math.max(0, ...allVals);
  const minVal = Math.min(0, ...allVals);
  if (maxVal === 0 && minVal === 0) return { domain:[0,1000], ticks:[0,250,500,750,1000] };
  const absMax = Math.max(maxVal, Math.abs(minVal));
  const step = absMax <= 500 ? 100 : absMax <= 1000 ? 250 : absMax <= 3000 ? 500 : absMax <= 6000 ? 1000 : 2000;
  const max = Math.ceil(maxVal / step) * step;
  const min = minVal < 0 ? Math.floor(minVal / step) * step : 0;
  const ticks = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { domain:[min, max], ticks };
}

// ── Expense Pie (by category) ──────────────────────────────────────────────
function ExpensePie({ transactions, allCategories, allColors, allIcons }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const icons = allIcons || CAT_ICONS;
  const relevantTxs = transactions.filter(t => !EXCLUDED_CATS.includes(t.category));
  const pieData = cats
    .filter(cat => !EXCLUDED_CATS.includes(cat))
    .map(cat => ({ name: cat, value: relevantTxs.filter(t => t.category === cat).reduce((s,t) => s+t.amount, 0) }))
    .filter(d => d.value > 0)
    .sort((a,b) => b.value - a.value);

  const total = pieData.reduce((s,d) => s+d.value, 0);

  if (pieData.length === 0) return (
    <div className="chart-card empty-chart">
      <div style={{fontSize:28}}>🧾</div>
      <p>אין עסקאות להציג</p>
    </div>
  );

  return (
    <div className="chart-card">
      <h3>התפלגות הוצאות לפי קטגוריה</h3>
      <div style={{display:"flex", alignItems:"center", gap:16}}>
        {/* Donut */}
        <div style={{flexShrink:0}}>
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                innerRadius={42} outerRadius={65} paddingAngle={2} startAngle={90} endAngle={-270}>
                {pieData.map(e => <Cell key={e.name} fill={colors[e.name] || "#94a3b8"} stroke="none" />)}
              </Pie>
              <Tooltip {...getTT()} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend rows */}
        <div style={{flex:1, display:"flex", flexDirection:"column", gap:7}}>
          {pieData.map(d => {
            const pct = total > 0 ? (d.value/total*100) : 0;
            return (
              <div key={d.name}>
                <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:3}}>
                  <span style={{fontSize:11}}>{icons[d.name] || "🏷️"}</span>
                  <span style={{fontSize:11, color:"var(--text)", flex:1}}>{d.name}</span>
                  <span style={{fontSize:11, fontWeight:700, color: colors[d.name] || "#94a3b8"}}>{pct.toFixed(0)}%</span>
                  <span style={{fontSize:10, color:"var(--text2)", minWidth:72, textAlign:"left"}}>₪{Math.round(d.value).toLocaleString("he-IL")}</span>
                </div>
                <div style={{height:4, borderRadius:2, background:"var(--border)"}}>
                  <div style={{height:4, borderRadius:2, width:`${pct}%`, background: colors[d.name] || "#94a3b8", transition:"width 0.4s ease"}} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Income Pie (savings / expenses / remaining) ────────────────────────────
function IncomePie({ income, totalExpenses, actualSavings }) {
  const remaining = income - totalExpenses - actualSavings;
  const overSpent = remaining < 0;

  const remainingLabel = remaining >= 0 ? 'נשאר בעו"ש' : 'ירד מהעו"ש';
  const remainingColor = remaining >= 0 ? "#10b981" : "#ef4444";

  // Only positive items go into the pie chart slices
  const pieData = [
    { name: "הוצאות", value: totalExpenses, color: "#ef4444" },
    { name: "חסכתי", value: actualSavings, color: "#8b5cf6" },
    ...(remaining > 0 ? [{ name: remainingLabel, value: remaining, color: remainingColor }] : []),
  ].filter(d => d.value > 0);

  // Legend rows include ירד מהעו"ש even when negative (shown outside pie)
  const legendData = [
    { name: "הוצאות", value: totalExpenses, color: "#ef4444", inPie: true },
    { name: "חסכתי", value: actualSavings, color: "#8b5cf6", inPie: true },
    ...(remaining !== 0 ? [{ name: remainingLabel, value: Math.abs(remaining), color: remainingColor, inPie: remaining > 0 }] : []),
  ].filter(d => d.value > 0);

  if (income === 0) return (
    <div className="chart-card empty-chart">
      <div style={{fontSize:28}}>💰</div>
      <p>הזן הכנסה חודשית<br/>לראות חלוקת התקציב</p>
    </div>
  );

  const total = pieData.reduce((s,d) => s+d.value, 0);

  const [hovering, setHovering] = useState(false);

  return (
    <div className="chart-card">
      <h3>חלוקת ההכנסה</h3>
      {overSpent && <p className="overspend-note">⚠️ ההוצאות עולות על ההכנסה</p>}
      <div style={{display:"flex", alignItems:"center", gap:16}}>
        <div className="income-pie-donut"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{flexShrink:0, position:"relative"}}>
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                innerRadius={42} outerRadius={65} paddingAngle={2} startAngle={90} endAngle={-270}>
                {pieData.map(e => <Cell key={e.name} fill={e.color} stroke="none" />)}
              </Pie>
              <Tooltip {...getTT()} />
            </PieChart>
          </ResponsiveContainer>
          {!hovering && (
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
              <div style={{fontSize:9,color:"var(--text2)",lineHeight:1}}>הכנסה</div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text)",lineHeight:1.3}}>₪{(income/1000).toFixed(1)}k</div>
            </div>
          )}
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:9}}>
          {legendData.map(d => {
            const pct = d.inPie && total > 0 ? (d.value/total*100) : 0;
            return (
              <div key={d.name}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}} />
                  <span style={{fontSize:11,color:"var(--text)",flex:1}}>{d.name}</span>
                  {d.inPie
                    ? <span style={{fontSize:11,fontWeight:700,color:d.color}}>{pct.toFixed(0)}%</span>
                    : <span style={{fontSize:10,color:d.color,fontWeight:700}}>לא בעוגה</span>
                  }
                  <span style={{fontSize:10,color:d.color,minWidth:72,textAlign:"left",fontWeight:700}}>₪{Math.round(d.value).toLocaleString("he-IL")}</span>
                </div>
                <div style={{height:4,borderRadius:2,background:"var(--border)"}}>
                  <div style={{height:4,borderRadius:2,width:`${pct}%`,background:d.color,transition:"width 0.4s ease"}} />
                </div>
              </div>
            );
          })}
          <div style={{paddingTop:6,borderTop:"1px solid #252b3b",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:10,color:"var(--text2)"}}>סה״כ הכנסה</span>
            <span style={{fontSize:10,fontWeight:700,color:"var(--text2)"}}>₪{Math.round(income).toLocaleString("he-IL")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trends chart ───────────────────────────────────────────────────────────
function TrendsChart({ monthData, allCategories, allColors }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const sorted = Object.keys(monthData).sort();
  if (sorted.length < 2) return (
    <div className="chart-card empty-chart" style={{minHeight:180}}>
      <div style={{fontSize:28}}>📈</div>
      <p>העלה לפחות שני חודשים<br/>לצפייה במגמות</p>
    </div>
  );

  const lineData = sorted.map(key => {
    const txs = monthData[key]?.transactions || [];
    return {
      month: getShortLabel(key),
      "הוצאה": txs.filter(t => !EXCLUDED_CATS.includes(t.category)).reduce((s,t) => s+t.amount, 0),
      "הכנסה": getIncome(monthData[key]),
      "חיסכון": monthData[key]?.actualSavings || 0,
    };
  });

  const barData = sorted.map(key => {
    const txs = monthData[key]?.transactions || [];
    const row = { month: getShortLabel(key) };
    cats.filter(c => c !== "חיסכון" && !EXCLUDED_CATS.includes(c)).forEach(cat => {
      row[cat] = txs.filter(t => t.category === cat).reduce((s,t) => s+t.amount, 0);
    });
    return row;
  });

  const lineAxis = niceYAxis(lineData, ["הוצאה","הכנסה","חיסכון"]);
  const barAxis  = niceYAxis(barData, cats.filter(c => c !== "חיסכון" && !EXCLUDED_CATS.includes(c)));
  const fmt = v => v>=1000 ? `₪${(v/1000).toFixed(1)}k` : `₪${v}`;

  return (
    <div className="chart-card trends-card">
      <h3>📈 מגמות לאורך זמן</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={lineData} margin={{top:5,right:10,left:0,bottom:5}}>
          <XAxis dataKey="month" tick={{fontSize:11,fill:"var(--text2)"}} />
          <YAxis tick={{fontSize:10,fill:"var(--text2)"}} width={58}
            domain={lineAxis.domain} ticks={lineAxis.ticks} tickFormatter={fmt} />
          <Tooltip {...getTT()} />
          <Legend wrapperStyle={{fontSize:11}} />
          <Line type="monotone" dataKey="הוצאה" stroke="#ef4444" strokeWidth={2.5} dot={{r:4}} />
          <Line type="monotone" dataKey="הכנסה" stroke="#10b981" strokeWidth={2} strokeDasharray="6 3" dot={{r:3}} />
          <Line type="monotone" dataKey="חיסכון" stroke="#a78bfa" strokeWidth={2} dot={{r:3}} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{fontSize:11,color:"var(--text2)",margin:"12px 0 8px"}}>פירוט קטגוריות לפי חודש</p>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={barData} margin={{top:0,right:10,left:0,bottom:5}}>
          <XAxis dataKey="month" tick={{fontSize:11,fill:"var(--text2)"}} />
          <YAxis tick={{fontSize:10,fill:"var(--text2)"}} width={58}
            domain={barAxis.domain} ticks={barAxis.ticks} tickFormatter={fmt} />
          <Tooltip {...getTT()} />
          {cats.filter(c => c !== "חיסכון" && !EXCLUDED_CATS.includes(c)).map(cat => (
            <Bar key={cat} dataKey={cat} stackId="a" fill={colors[cat] || "#94a3b8"} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Date sort helper ─────────────────────────────────────────────────────
function parseDateForSort(dateStr) {
  if (!dateStr) return "0000-00-00";
  const parts = dateStr.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

// ── Transactions Table with filter ────────────────────────────────────────
function TransactionsTable({ transactions, onCategoryChange, onDelete, onEdit, editMode, onToggleEdit, allCategories, allColors, allIcons, onAddCategory }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const icons = allIcons || CAT_ICONS;
  const [filter, setFilter] = useState("הכל");
  const usedCats = ["הכל", ...cats.filter(c => transactions.some(t => t.category === c))];
  const visible = filter === "הכל" ? transactions : transactions.filter(t => t.category === filter);
  const filterTotal = visible.reduce((s,t) => s + t.amount, 0);

  // Add category modal state
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatKeywords, setNewCatKeywords] = useState("");

  // Local edit state per row
  const [editVals, setEditVals] = useState({});
  const getVal = (id, field, fallback) => editVals[id]?.[field] ?? fallback;
  const setVal = (id, field, val) => setEditVals(prev => ({...prev, [id]: {...(prev[id]||{}), [field]: val}}));

  return (
    <div className="table-card">
      <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <h3 style={{margin:0}}>עסקאות</h3>
        <div style={{display:"flex", gap:6, flexWrap:"wrap", flex:1}}>
          {usedCats.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              style={{padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                fontSize:11, fontWeight:700, transition:"all 0.15s",
                background: filter===cat ? (cat==="הכל" ? "#6366f1" : (colors[cat] || "#94a3b8")) : "var(--surface2)",
                color: filter===cat ? "#fff" : "var(--text2)",
                outline: filter===cat ? "none" : "1px solid #252b3b"}}>
              {cat === "הכל" ? "הכל" : `${icons[cat] || "🏷️"} ${cat}`}
            </button>
          ))}
        </div>
        <span style={{fontSize:12, color:"var(--text2)", whiteSpace:"nowrap"}}>
          {visible.length} עסקאות · ₪{Math.round(filterTotal).toLocaleString("he-IL")}
        </span>
        {editMode && onAddCategory && (
          <button onClick={() => setShowAddCat(true)}
            style={{padding:"4px 12px", borderRadius:8, border:"none", cursor:"pointer",
              fontSize:11, fontWeight:700,
              background:"#10b98122", color:"#10b981",
              outline:"1px solid #10b98166"}}>
            ＋ הוסף קטגוריה
          </button>
        )}
        {onToggleEdit && (
          <button onClick={() => { onToggleEdit(); setEditVals({}); }}
            style={{padding:"4px 12px", borderRadius:8, border:"none", cursor:"pointer",
              fontSize:11, fontWeight:700,
              background: editMode ? "#ef444422" : "var(--surface2)",
              color: editMode ? "#ef4444" : "var(--text2)",
              outline: editMode ? "1px solid #ef444466" : "1px solid #252b3b"}}>
            {editMode ? "✓ סיום עריכה" : "✏️ ערוך"}
          </button>
        )}
      </div>

      {/* Add Category Modal */}
      {showAddCat && (
        <div style={{marginBottom:14, background:"var(--bg)", border:"1px solid #10b981", borderRadius:12, padding:16}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
            <span style={{fontSize:13, fontWeight:700, color:"#10b981"}}>🏷️ הוסף קטגוריה חדשה</span>
            <button onClick={() => { setShowAddCat(false); setNewCatName(""); setNewCatKeywords(""); }}
              style={{background:"none", border:"none", color:"var(--text2)", fontSize:16, cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end"}}>
            <div style={{display:"flex", flexDirection:"column", gap:5, flex:1, minWidth:140}}>
              <label style={{fontSize:11, color:"var(--text2)", fontWeight:600}}>שם הקטגוריה</label>
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                placeholder="למשל: דלק, ספורט, חינוך..."
                style={{background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8,
                  color:"var(--text)", fontFamily:"inherit", fontSize:13, padding:"8px 12px", outline:"none", direction:"rtl"}} />
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:5, flex:2, minWidth:200}}>
              <label style={{fontSize:11, color:"var(--text2)", fontWeight:600}}>מילות מפתח (אופציונלי — עוזר ל-AI לזהות)</label>
              <input value={newCatKeywords} onChange={e => setNewCatKeywords(e.target.value)}
                placeholder="למשל: תדלוק, סונול, פז, דור אלון"
                style={{background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8,
                  color:"var(--text)", fontFamily:"inherit", fontSize:13, padding:"8px 12px", outline:"none", direction:"rtl"}} />
            </div>
            <button onClick={() => {
                if (!newCatName.trim()) return;
                if (cats.includes(newCatName.trim())) { alert("קטגוריה בשם זה כבר קיימת"); return; }
                onAddCategory({ name: newCatName.trim(), keywords: newCatKeywords.trim() });
                setNewCatName(""); setNewCatKeywords(""); setShowAddCat(false);
              }}
              style={{padding:"9px 18px", background:"#10b981", color:"#fff", border:"none",
                borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer", alignSelf:"flex-end"}}>
              ＋ הוסף
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {editMode && <th style={{width:30}}></th>}
              <th>תאריך</th><th>תיאור</th><th>סכום</th><th>קטגוריה</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(tx => (
              <tr key={tx.id}>
                {editMode && (
                  <td style={{width:28, padding:"0 4px"}}>
                    <button onClick={() => onDelete(tx.id)}
                      style={{width:22, height:22, borderRadius:"50%", background:"#ef4444", border:"none",
                        color:"#fff", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center",
                        justifyContent:"center", padding:0}}>✕</button>
                  </td>
                )}
                <td style={{whiteSpace:"nowrap"}}>
                  {editMode
                    ? <input value={getVal(tx.id,"date",tx.date)}
                        onChange={e => setVal(tx.id,"date",e.target.value)}
                        onBlur={e => onEdit(tx.id, "date", e.target.value)}
                        style={{width:88, background:"var(--bg)", border:"1px solid #252b3b", borderRadius:6,
                          color:"var(--text2)", fontFamily:"inherit", fontSize:11, padding:"3px 6px", outline:"none"}} />
                    : <span style={{color:"var(--text2)", fontSize:12}}>{tx.date}</span>
                  }
                </td>
                <td className="desc">{tx.description}</td>
                <td className="amount">
                  {editMode
                    ? <input type="number" value={getVal(tx.id,"amount",tx.amount)}
                        onChange={e => setVal(tx.id,"amount",e.target.value)}
                        onBlur={e => onEdit(tx.id, "amount", parseFloat(e.target.value)||0)}
                        style={{width:80, background:"var(--bg)", border:"1px solid #252b3b", borderRadius:6,
                          color:"#ef4444", fontFamily:"monospace", fontSize:13, fontWeight:700,
                          padding:"3px 6px", outline:"none"}} />
                    : `₪${tx.amount.toLocaleString("he-IL",{minimumFractionDigits:2})}`
                  }
                </td>
                <td>
                  <select value={tx.category} onChange={e => onCategoryChange(tx.id, e.target.value)}
                    style={{background:(colors[tx.category] || "#94a3b8")+"22", color:colors[tx.category] || "#94a3b8"}}>
                    {cats.map(c => <option key={c} value={c}>{icons[c] || "🏷️"} {c}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Add + Delete Bar ──────────────────────────────────────────────────────
function AddDeleteBar({ onAdd, onDelete, onEdit, transactions, onCategoryChange, allCategories, allColors, allIcons, onAddCategory }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const icons = allIcons || CAT_ICONS;
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState(cats[0]);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  });

  const submit = () => {
    if (!desc.trim() || !amount || isNaN(parseFloat(amount))) return;
    // Validate date format DD/MM/YYYY
    const dateParts = date.split("/");
    if (dateParts.length !== 3 || dateParts[0].length !== 2 || dateParts[1].length !== 2 || dateParts[2].length !== 4) {
      alert("תאריך לא תקין — יש להזין בפורמט DD/MM/YYYY");
      return;
    }
    const [dd, mm, yyyy] = dateParts.map(Number);
    if (isNaN(dd) || isNaN(mm) || isNaN(yyyy) || dd < 1 || dd > 31 || mm < 1 || mm > 12) {
      alert("תאריך לא תקין — יש להזין בפורמט DD/MM/YYYY");
      return;
    }
    onAdd({ id:`manual-${Date.now()}`, date, description:desc.trim(), amount:parseFloat(amount), category:cat });
    setDesc(""); setAmount(""); setCat(cats[0]); setAddOpen(false);
  };

  return (
    <>
      <div style={{display:"flex", gap:10, marginBottom:12}}>
        <button onClick={() => { setAddOpen(o => !o); setEditMode(false); }}
          style={{display:"flex", alignItems:"center", gap:7, padding:"9px 16px",
            background: addOpen ? "#6366f1" : "var(--surface2)",
            border: addOpen ? "none" : "1px dashed #252b3b",
            borderRadius:9, color: addOpen ? "#fff" : "var(--text2)",
            fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer", transition:"all 0.15s"}}>
          ＋ הוסף הוצאה ידנית
        </button>
      </div>

      {addOpen && (
        <div style={{marginBottom:16, background:"var(--surface)", border:"1px solid #6366f1", borderRadius:12, padding:16}}>
          <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end"}}>
            <div style={{display:"flex", flexDirection:"column", gap:5, flex:2, minWidth:150}}>
              <label style={{fontSize:11, color:"var(--text2)", fontWeight:600}}>תיאור</label>
              <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="שם ההוצאה..."
                onKeyDown={e => e.key==="Enter" && submit()}
                style={{background:"var(--bg)", border:"1px solid #252b3b", borderRadius:8,
                  color:"var(--text)", fontFamily:"inherit", fontSize:13, padding:"8px 12px", outline:"none", direction:"rtl"}} />
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:5, width:105}}>
              <label style={{fontSize:11, color:"var(--text2)", fontWeight:600}}>סכום ₪</label>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
                onKeyDown={e => e.key==="Enter" && submit()}
                style={{background:"var(--bg)", border:"1px solid #252b3b", borderRadius:8,
                  color:"#10b981", fontFamily:"inherit", fontSize:13, fontWeight:700, padding:"8px 12px", outline:"none"}} />
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:5, width:108}}>
              <label style={{fontSize:11, color:"var(--text2)", fontWeight:600}}>תאריך</label>
              <input value={date} onChange={e=>setDate(e.target.value)} placeholder="DD/MM/YYYY"
                style={{background:"var(--bg)", border:"1px solid #252b3b", borderRadius:8,
                  color:"var(--text)", fontFamily:"inherit", fontSize:12, padding:"8px 12px", outline:"none"}} />
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:5, flex:1, minWidth:120}}>
              <label style={{fontSize:11, color:"var(--text2)", fontWeight:600}}>קטגוריה</label>
              <select value={cat} onChange={e=>setCat(e.target.value)}
                style={{background:"var(--bg)", border:"1px solid #252b3b", borderRadius:8,
                  color:colors[cat] || "#94a3b8", fontFamily:"inherit", fontSize:12, fontWeight:700,
                  padding:"8px 10px", outline:"none", cursor:"pointer"}}>
                {cats.map(c => <option key={c} value={c}>{icons[c] || "🏷️"} {c}</option>)}
              </select>
            </div>
            <button onClick={submit}
              style={{padding:"9px 18px", background:"#6366f1", color:"#fff", border:"none",
                borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer", alignSelf:"flex-end"}}>
              ＋ הוסף
            </button>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <TransactionsTable transactions={transactions} onCategoryChange={onCategoryChange}
          onDelete={onDelete} editMode={editMode} onToggleEdit={() => setEditMode(o=>!o)}
          onEdit={onEdit} allCategories={cats} allColors={colors} allIcons={icons} onAddCategory={onAddCategory} />
      )}
    </>
  );
}

// ── Month Slide ────────────────────────────────────────────────────────────
function MonthSlide({ monthKey, monthRecord, onUpdate, allMonthData, onPrev, onNext, hasPrev, hasNext, slideIndex, total, allCategories, allColors, allIcons, onAddCategory }) {
  const { transactions = [], salary = 0, extraIncome = 0, actualSavings = 0 } = monthRecord;
  const income = getIncome(monthRecord);
  // For display in input fields, show salary from record (may be 0 for legacy data that stored in income)
  const displaySalary = salary || (monthRecord.income && !salary ? monthRecord.income : 0);
  const [salaryVal, setSalaryVal] = useState(displaySalary.toString());
  const [extraVal, setExtraVal] = useState(extraIncome.toString());
  const [savingsVal, setSavingsVal] = useState(actualSavings.toString());

  useEffect(() => setSalaryVal(displaySalary.toString()), [displaySalary]);
  useEffect(() => setExtraVal(extraIncome.toString()), [extraIncome]);
  useEffect(() => setSavingsVal(actualSavings.toString()), [actualSavings]);

  const totalExp = transactions.filter(t => !EXCLUDED_CATS.includes(t.category)).reduce((s,t) => s+t.amount, 0);
  const balance = income - totalExp - actualSavings;

  const saveField = (field, val) => onUpdate(monthKey, { ...monthRecord, [field]: parseFloat(val)||0 });
  const changeCat = (id, cat) =>
    onUpdate(monthKey, { ...monthRecord, transactions: transactions.map(t => t.id===id ? {...t,category:cat} : t) });

  return (
    <div className="slide">
      {/* Nav */}
      <div className="slide-nav">
        <button className="nav-arrow" onClick={onPrev} disabled={!hasPrev} title="חודש קודם">‹</button>
        <div className="slide-title-block">
          <h2 className="slide-title">{getMonthLabel(monthKey)}</h2>
          <div className="slide-dots">
            {Array.from({length:total}).map((_,i) => (
              <span key={i} className={`slide-dot ${i===slideIndex?"active":""}`} />
            ))}
          </div>
        </div>
        <button className="nav-arrow" onClick={onNext} disabled={!hasNext} title="חודש הבא">›</button>
      </div>

      {/* Input fields */}
      <div className="fields-row">
        <div className="field-group">
          <label>💼 משכורת</label>
          <div className="field-input">
            <span>₪</span>
            <input type="number" value={salaryVal}
              onChange={e => setSalaryVal(e.target.value)}
              onBlur={() => saveField("salary", salaryVal)} placeholder="0" />
          </div>
        </div>
        <div className="field-group">
          <label>➕ הכנסות נוספות</label>
          <div className="field-input">
            <span>₪</span>
            <input type="number" value={extraVal}
              onChange={e => setExtraVal(e.target.value)}
              onBlur={() => saveField("extraIncome", extraVal)} placeholder="0" />
          </div>
        </div>
        <div className="field-group">
          <label>🏦 חסכתי החודש</label>
          <div className="field-input savings-input">
            <span>₪</span>
            <input type="number" value={savingsVal}
              onChange={e => setSavingsVal(e.target.value)}
              onBlur={() => saveField("actualSavings", savingsVal)} placeholder="0" />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        {[
          { label:"סה״כ הוצאות", val:`₪${Math.round(totalExp).toLocaleString("he-IL")}`, cls:"red" },
          { label:"הכנסה",       val:`₪${Math.round(income).toLocaleString("he-IL")}`,   cls:"green" },
          { label:"חסכתי",       val:`₪${Math.round(actualSavings).toLocaleString("he-IL")}`, cls:"purple" },
          { label:"מאזן", val: balance < 0 ? `-₪${Math.round(Math.abs(balance)).toLocaleString("he-IL")}` : `₪${Math.round(balance).toLocaleString("he-IL")}`, cls: balance>=0?"green":"red" },
          { label:"עסקאות",      val:transactions.length, cls:"" },
        ].map(k => (
          <div key={k.label} className="kpi">
            <span className="kpi-label">{k.label}</span>
            <span className={`kpi-value ${k.cls}`}>{k.val}</span>
          </div>
        ))}
      </div>

      {/* Two pie charts side by side */}
      <div className="pies-row">
        <ExpensePie transactions={transactions} allCategories={allCategories} allColors={allColors} allIcons={allIcons} />
        <IncomePie income={income} totalExpenses={totalExp} actualSavings={actualSavings} />
      </div>

      {/* Add transaction button + edit mode */}
      <AddDeleteBar
        onAdd={(tx) => {
          const updated = [...transactions, tx].sort((a,b) => parseDateForSort(a.date).localeCompare(parseDateForSort(b.date)));
          onUpdate(monthKey, { ...monthRecord, transactions: updated });
        }}
        onDelete={(id) => onUpdate(monthKey, { ...monthRecord, transactions: transactions.filter(t => t.id !== id) })}
        onEdit={(id, field, val) => {
          const updated = transactions.map(t => t.id===id ? {...t, [field]: val} : t)
            .sort((a,b) => parseDateForSort(a.date).localeCompare(parseDateForSort(b.date)));
          onUpdate(monthKey, { ...monthRecord, transactions: updated });
        }}
        transactions={transactions}
        onCategoryChange={changeCat}
        allCategories={allCategories}
        allColors={allColors}
        allIcons={allIcons}
        onAddCategory={onAddCategory}
      />
    </div>
  );
}

// ── Category Comparison Chart ──────────────────────────────────────────────
const EXTRA_SERIES = [
  { key:"הכנסה",   label:"💰 הכנסה",       color:"#10b981" },
  { key:"חסכתי",   label:"🏦 חסכתי",       color:"#a78bfa" },
  { key:"נשאר",    label:'🏦 נשאר בעו"ש', color:"#06b6d4" },
];

function CategoryCompareChart({ monthData, allCategories, allColors, allIcons }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const icons = allIcons || CAT_ICONS;
  const [selectedCat, setSelectedCat] = useState(cats[0]);
  const sorted = Object.keys(monthData).sort();

  if (sorted.length < 2) return null;

  const isExtra = EXTRA_SERIES.find(e => e.key === selectedCat);

  const chartData = sorted.map(key => {
    const d = monthData[key] || {};
    const txs = d.transactions || [];
    const totalExp = txs.filter(t => !EXCLUDED_CATS.includes(t.category)).reduce((s,t) => s+t.amount, 0);
    const inc = getIncome(d);
    const sav = Number(d.actualSavings) || 0;
    let value = 0;
    if (selectedCat === "הכנסה") value = inc;
    else if (selectedCat === "חסכתי") value = sav;
    else if (selectedCat === "נשאר") value = inc - totalExp - sav;
    else value = txs.filter(t => t.category === selectedCat).reduce((s,t) => s+t.amount, 0);
    return { month: getShortLabel(key), value, rawKey: key };
  });

  const color = isExtra ? isExtra.color : (colors[selectedCat] || "#6366f1");
  const axis = niceYAxis(chartData, ["value"]);

  return (
    <div className="chart-card trends-card" style={{marginTop:16}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10}}>
        <h3 style={{margin:0}}>🔍 השוואה בין חודשים לפי בחירה</h3>
        <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
          {cats.map(cat => (
            <button key={cat} onClick={() => setSelectedCat(cat)}
              style={{
                padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                fontSize:11, fontWeight:700, transition:"all 0.15s",
                background: selectedCat===cat ? (colors[cat] || "#94a3b8") : "var(--surface2)",
                color: selectedCat===cat ? "#fff" : "var(--text2)",
                outline: selectedCat===cat ? "none" : "1px solid #252b3b",
              }}>
              {icons[cat] || "🏷️"} {cat}
            </button>
          ))}
          {EXTRA_SERIES.map(e => (
            <button key={e.key} onClick={() => setSelectedCat(e.key)}
              style={{
                padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                fontSize:11, fontWeight:700, transition:"all 0.15s",
                background: selectedCat===e.key ? e.color : "var(--surface2)",
                color: selectedCat===e.key ? "#fff" : "var(--text2)",
                outline: selectedCat===e.key ? "none" : `1px solid #252b3b`,
              }}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{top:5,right:10,left:0,bottom:5}}>
          <XAxis dataKey="month" tick={{fontSize:11,fill:"var(--text2)"}} />
          <YAxis tick={{fontSize:10,fill:"var(--text2)"}} width={58}
            domain={axis.domain} ticks={axis.ticks}
            tickFormatter={v => v>=1000 ? `₪${(v/1000).toFixed(1)}k` : `₪${v}`} />
          <Tooltip {...getTT()} />
          <Line type="monotone" dataKey="value" name={isExtra ? isExtra.label : selectedCat}
            stroke={color} strokeWidth={2.5} dot={{r:5, fill:color, strokeWidth:2, stroke:"var(--bg)"}}
            activeDot={{r:7, fill:color}} />
        </LineChart>
      </ResponsiveContainer>

    </div>
  );
}

// ── AI Analysis ───────────────────────────────────────────────────────────
function AIAnalysis({ monthData }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [question, setQuestion] = useState("");
  const [qLoading, setQLoading] = useState(false);
  const [qAnswer, setQAnswer] = useState(null);

  const months = Object.keys(monthData).sort();
  if (months.length === 0) return null;

  const buildSummary = () => {
    return months.map(key => {
      const d = monthData[key];
      const txs = d.transactions || [];
      const total = txs.reduce((s,t) => s + (t.amount > 0 ? t.amount : 0), 0);
      const cats = {};
      txs.forEach(t => { if (t.amount > 0) cats[t.category] = (cats[t.category]||0) + t.amount; });
      const inc = getIncome(d); return `${key}: הכנסה=₪${inc}, חיסכון=₪${d.actualSavings||0}, סה"כ הוצאות=₪${total.toFixed(0)}, קטגוריות: ${Object.entries(cats).map(([c,v])=>`${c}=₪${v.toFixed(0)}`).join(', ')}`;
    }).join("\n");
  };

  const callAPI = async (prompt, maxTokens=1000) => {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  };

  const generate = async () => {
    setLoading(true); setGenerated(true);
    try {
      const text = await callAPI(`אתה יועץ פיננסי אישי. הנה נתוני ההוצאות של המשתמש לאורך מספר חודשים:\n\n${buildSummary()}\n\nכתוב ניתוח קצר, חכם ואישי בעברית. כלול:\n1. תובנה עיקרית אחת על דפוס ההוצאות\n2. קטגוריה אחת שבולטת לטובה ואחת שדורשת תשומת לב\n3. שני טיפים מעשיים וספציפיים לשיפור\n\nכתוב בצורה חמה, ישירה וקצרה. אל תשתמש בכותרות גדולות - רק פסקאות קצרות. אל תחרוג מ-200 מילים.`);
      setAnalysis(text);
    } catch(e) { setAnalysis("שגיאה: " + e.message); }
    finally { setLoading(false); }
  };

  const askQuestion = async () => {
    if (!question.trim()) return;
    setQLoading(true); setQAnswer(null);
    try {
      const text = await callAPI(`אתה יועץ פיננסי אישי. הנה נתוני ההוצאות של המשתמש:\n\n${buildSummary()}\n\nשאלת המשתמש: ${question}\n\nענה בעברית, בצורה ישירה וממוקדת. אל תחרוג מ-150 מילים.`, 600);
      setQAnswer(text);
    } catch(e) { setQAnswer("שגיאה: " + e.message); }
    finally { setQLoading(false); }
  };

  const spinner = <span style={{display:"inline-block",width:13,height:13,border:"2px solid var(--spinner-ring)",borderTop:"2px solid var(--spinner-top)",borderRadius:"50%",animation:"spin 0.75s linear infinite"}} />;

  return (
    <div style={{marginTop:20, background:"var(--surface)", border:"1px solid #252b3b", borderRadius:14, padding:24}}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16}}>
        <div>
          <h3 style={{fontSize:16, fontWeight:800, color:"var(--text)", margin:0}}>🧠 ניתוח AI</h3>
          <p style={{fontSize:11, color:"var(--text2)", margin:"4px 0 0"}}>תובנות וטיפים מבוססי הנתונים שלך</p>
        </div>
        <button onClick={generate} disabled={loading}
          style={{padding:"9px 18px", background: loading ? "var(--border)" : "#6366f1", color:"#fff",
            border:"none", borderRadius:9, fontFamily:"inherit", fontSize:13, fontWeight:700,
            cursor: loading ? "default" : "pointer", display:"flex", alignItems:"center", gap:8}}>
          {loading ? <>{spinner} מנתח...</> : generated ? "🔄 נתח מחדש" : "✨ נתח את הנתונים"}
        </button>
      </div>

      {/* Analysis result */}
      {!generated && !qAnswer && (
        <div style={{textAlign:"center", padding:"24px 0", color:"var(--text2)", fontSize:13}}>
          <div style={{fontSize:36, marginBottom:10}}>💡</div>
          <p>לחץ על "נתח את הנתונים" לקבלת תובנות, או שאל שאלה ספציפית למטה</p>
        </div>
      )}
      {loading && (
        <div style={{textAlign:"center", padding:"24px 0", color:"var(--text2)", fontSize:13}}>
          <div style={{width:32,height:32,border:"3px solid #252b3b",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin 0.75s linear infinite",margin:"0 auto 12px"}} />
          <p>קורא את הנתונים ומנתח...</p>
        </div>
      )}
      {analysis && !loading && (
        <div style={{background:"var(--bg)", borderRadius:10, padding:"18px 20px",
          borderRight:"3px solid #6366f1", lineHeight:1.8, fontSize:14, color:"var(--text3)", whiteSpace:"pre-wrap", marginBottom:20}}>
          {analysis}
        </div>
      )}

      {/* Question input */}
      <div style={{borderTop:"1px solid #252b3b", paddingTop:16, marginTop: analysis ? 0 : 8}}>
        <p style={{fontSize:12, color:"var(--text2)", marginBottom:10, fontWeight:600}}>💬 שאל שאלה ספציפית על הנתונים שלך</p>
        <div style={{display:"flex", gap:8}}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key==="Enter" && !qLoading && askQuestion()}
            placeholder="למשל: כמה הוצאתי על יציאות בדצמבר? באיזה חודש הוצאתי הכי הרבה?"
            style={{flex:1, background:"var(--bg)", border:"1px solid #252b3b", borderRadius:8,
              color:"var(--text)", fontFamily:"inherit", fontSize:13, padding:"9px 14px", outline:"none",
              direction:"rtl"}}
          />
          <button onClick={askQuestion} disabled={qLoading || !question.trim()}
            style={{padding:"9px 16px", background: qLoading ? "var(--border)" : "var(--surface2)", color:"var(--text2)",
              border:"1px solid #252b3b", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700,
              cursor: qLoading || !question.trim() ? "default" : "pointer",
              display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap",
              ...((!qLoading && question.trim()) ? {color:"var(--text)", borderColor:"#6366f1"} : {})}}>
            {qLoading ? <>{spinner} שואל...</> : "שאל ➜"}
          </button>
        </div>
        {qLoading && (
          <div style={{textAlign:"center", padding:"16px 0", color:"var(--text2)", fontSize:12}}>
            <div style={{width:24,height:24,border:"2px solid #252b3b",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin 0.75s linear infinite",margin:"0 auto 8px"}} />
            מחפש תשובה...
          </div>
        )}
        {qAnswer && !qLoading && (
          <div style={{marginTop:12, background:"var(--bg)", borderRadius:10, padding:"14px 18px",
            borderRight:"3px solid #f59e0b", lineHeight:1.8, fontSize:13, color:"var(--text3)", whiteSpace:"pre-wrap"}}>
            {qAnswer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────────
function ExportModal({ monthData, onClose }) {
  const [tab, setTab] = useState("csv"); // "csv" | "json"
  const [copied, setCopied] = useState(false);

  const csvText = (() => {
    const rows = ["חודש,תאריך,תיאור,סכום,קטגוריה,הכנסה,חיסכון"];
    Object.keys(monthData).sort().forEach(key => {
      const d = monthData[key];
      (d.transactions||[]).forEach(t => {
        const inc = getIncome(d); rows.push([getMonthLabel(key), t.date, '"'+t.description.replace(/"/g,'""')+'"', t.amount, t.category, inc, d.actualSavings||0].join(","));
      });
    });
    return rows.join("\n");
  })();

  const jsonText = JSON.stringify(monthData, null, 2);
  const activeText = tab === "csv" ? csvText : jsonText;
  const filename = tab === "csv" ? `הוצאות_${new Date().toISOString().slice(0,10)}.csv` : `הוצאות_גיבוי_${new Date().toISOString().slice(0,10)}.json`;

  const copy = () => {
    navigator.clipboard.writeText(activeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const tabBtn = (id, label, color) => (
    <button onClick={() => { setTab(id); setCopied(false); }}
      style={{flex:1, padding:"9px 0", border:"none", borderRadius:8, fontFamily:"inherit",
        fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.15s",
        background: tab===id ? color : "var(--surface2)",
        color: tab===id ? "#fff" : "var(--text2)",
        outline: tab===id ? "none" : "1px solid #252b3b"}}>
      {label}
    </button>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"var(--surface)",border:"1px solid #252b3b",borderRadius:14,padding:24,width:"100%",maxWidth:560,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"var(--text)",margin:0}}>💾 ייצוא נתונים</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text2)",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{display:"flex",gap:8}}>
          {tabBtn("csv","📊 CSV — Excel / Google Sheets","#f59e0b")}
          {tabBtn("json","🔒 JSON — גיבוי לאפליקציה","#6366f1")}
        </div>

        <p style={{fontSize:11,color:"var(--text2)",margin:0}}>
          {tab==="csv"
            ? "העתק ← פתח Excel או Google Sheets ← הדבק (Ctrl+V) ← שמור כ-.csv"
            : "העתק ← פתח פנקס רשימות ← הדבק ← שמור בשם הוצאות.json"}
        </p>

        <div style={{position:"relative"}}>
          <textarea readOnly value={activeText}
            style={{width:"100%",height:200,background:"var(--bg)",border:"1px solid #252b3b",
              borderRadius:8,color: tab==="csv" ? "#f59e0b" : "#10b981",fontFamily:"monospace",
              fontSize:11,padding:12,resize:"none",outline:"none",direction:"ltr",display:"block"}}
          />
        </div>

        <button onClick={copy}
          style={{padding:"11px 0",background: copied ? "#10b981" : (tab==="csv" ? "#f59e0b" : "#6366f1"),
            color: copied ? "#fff" : (tab==="csv" ? "#000" : "#fff"),
            border:"none",borderRadius:9,fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>
          {copied ? "✓ הועתק ללוח!" : "📋 העתק הכל"}
        </button>

        <p style={{fontSize:10,color:"#4b5563",textAlign:"center",margin:0}}>
          שם קובץ מוצע: <span style={{color:"#6b7280",fontFamily:"monospace"}}>{filename}</span>
        </p>
      </div>
    </div>
  );
}

// ── Yearly Summary ────────────────────────────────────────────────────────
function YearlySummary({ monthData, allCategories, allColors, allIcons }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const icons = allIcons || CAT_ICONS;
  const allKeys = Object.keys(monthData).sort();
  const years = [...new Set(allKeys.map(k => k.split("-")[0]))].sort().reverse();
  const [selectedYear, setSelectedYear] = useState(years[0] || "");

  if (years.length === 0) return null;

  const yearKeys = allKeys.filter(k => k.startsWith(selectedYear));
  const yearMonths = yearKeys.map(k => {
    const d = monthData[k];
    const txs = d.transactions || [];
    const totalExp = txs.filter(t => !EXCLUDED_CATS.includes(t.category)).reduce((s,t) => s+t.amount, 0);
    const income = getIncome(d);
    const savings = d.actualSavings || 0;
    return { key: k, txs, totalExp, income, savings, balance: income - totalExp - savings };
  });

  const totals = {
    income: yearMonths.reduce((s,m) => s + m.income, 0),
    expenses: yearMonths.reduce((s,m) => s + m.totalExp, 0),
    savings: yearMonths.reduce((s,m) => s + m.savings, 0),
    transactions: yearMonths.reduce((s,m) => s + m.txs.length, 0),
  };
  totals.balance = totals.income - totals.expenses - totals.savings;
  const avgMonthly = yearMonths.length > 0 ? totals.expenses / yearMonths.length : 0;

  // Category breakdown for the year
  const allTxs = yearKeys.flatMap(k => (monthData[k].transactions || []));
  const catBreakdown = cats
    .filter(c => !EXCLUDED_CATS.includes(c))
    .map(cat => ({
      name: cat,
      total: allTxs.filter(t => t.category === cat).reduce((s,t) => s+t.amount, 0),
      avg: yearMonths.length > 0
        ? allTxs.filter(t => t.category === cat).reduce((s,t) => s+t.amount, 0) / yearMonths.length
        : 0,
    }))
    .filter(c => c.total > 0)
    .sort((a,b) => b.total - a.total);

  // Most expensive month
  const topMonth = yearMonths.length > 0 ? yearMonths.reduce((a,b) => a.totalExp > b.totalExp ? a : b) : null;
  const cheapMonth = yearMonths.length > 0 ? yearMonths.reduce((a,b) => a.totalExp < b.totalExp ? a : b) : null;

  const fmtN = n => `₪${Math.round(n).toLocaleString("he-IL")}`;

  return (
    <div className="overview">
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,flexWrap:"wrap"}}>
        <h2 style={{margin:0}}>📅 סיכום שנתי</h2>
        <div style={{display:"flex",gap:6}}>
          {years.map(y => (
            <button key={y} onClick={() => setSelectedYear(y)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",
                fontSize:13,fontWeight:700,transition:"all 0.15s",
                background: selectedYear===y ? "#6366f1" : "var(--surface2)",
                color: selectedYear===y ? "#fff" : "var(--text2)",
                outline: selectedYear===y ? "none" : "1px solid #252b3b"}}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Year KPIs */}
      <div className="kpi-row" style={{gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))"}}>
        {[
          {label:"סה״כ הכנסות", val:fmtN(totals.income), cls:"green"},
          {label:"סה״כ הוצאות", val:fmtN(totals.expenses), cls:"red"},
          {label:"סה״כ חיסכון", val:fmtN(totals.savings), cls:"purple"},
          {label:"מאזן שנתי", val: totals.balance < 0 ? `-${fmtN(Math.abs(totals.balance))}` : fmtN(totals.balance), cls: totals.balance >= 0 ? "green" : "red"},
          {label:"ממוצע חודשי הוצאות", val:fmtN(avgMonthly), cls:"red"},
          {label:"חודשים", val: yearMonths.length, cls:""},
          {label:"עסקאות", val: totals.transactions, cls:""},
        ].map(k => (
          <div key={k.label} className="kpi">
            <span className="kpi-label">{k.label}</span>
            <span className={`kpi-value ${k.cls}`}>{k.val}</span>
          </div>
        ))}
      </div>

      {/* Highlights */}
      {topMonth && cheapMonth && yearMonths.length > 1 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
          <div style={{background:"#ef444412",border:"1px solid #ef444433",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,color:"#ef4444",fontWeight:700,marginBottom:4}}>💸 החודש הכי יקר</div>
            <div style={{fontSize:16,fontWeight:800,color:"#ef4444"}}>{getMonthLabel(topMonth.key)}</div>
            <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{fmtN(topMonth.totalExp)}</div>
          </div>
          <div style={{background:"#10b98112",border:"1px solid #10b98133",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,color:"#10b981",fontWeight:700,marginBottom:4}}>✨ החודש הכי חסכוני</div>
            <div style={{fontSize:16,fontWeight:800,color:"#10b981"}}>{getMonthLabel(cheapMonth.key)}</div>
            <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{fmtN(cheapMonth.totalExp)}</div>
          </div>
        </div>
      )}

      {/* Month-by-month table */}
      <div className="table-card" style={{marginBottom:20}}>
        <h3>פירוט חודשי</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>חודש</th><th>הכנסה</th><th>הוצאות</th><th>חיסכון</th><th>מאזן</th><th>עסקאות</th></tr>
            </thead>
            <tbody>
              {yearMonths.map(m => (
                <tr key={m.key}>
                  <td style={{fontWeight:600}}>{getMonthLabel(m.key)}</td>
                  <td style={{color:"#10b981",fontWeight:700,fontFamily:"monospace"}}>{fmtN(m.income)}</td>
                  <td style={{color:"#ef4444",fontWeight:700,fontFamily:"monospace"}}>{fmtN(m.totalExp)}</td>
                  <td style={{color:"#a78bfa",fontWeight:700,fontFamily:"monospace"}}>{fmtN(m.savings)}</td>
                  <td style={{color: m.balance >= 0 ? "#10b981" : "#ef4444",fontWeight:700,fontFamily:"monospace"}}>
                    {m.balance < 0 ? `-${fmtN(Math.abs(m.balance))}` : fmtN(m.balance)}
                  </td>
                  <td style={{color:"var(--text2)"}}>{m.txs.length}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{borderTop:"2px solid #252b3b"}}>
                <td style={{fontWeight:800,color:"var(--text)"}}>סה״כ</td>
                <td style={{color:"#10b981",fontWeight:800,fontFamily:"monospace"}}>{fmtN(totals.income)}</td>
                <td style={{color:"#ef4444",fontWeight:800,fontFamily:"monospace"}}>{fmtN(totals.expenses)}</td>
                <td style={{color:"#a78bfa",fontWeight:800,fontFamily:"monospace"}}>{fmtN(totals.savings)}</td>
                <td style={{color: totals.balance >= 0 ? "#10b981" : "#ef4444",fontWeight:800,fontFamily:"monospace"}}>
                  {totals.balance < 0 ? `-${fmtN(Math.abs(totals.balance))}` : fmtN(totals.balance)}
                </td>
                <td style={{color:"var(--text2)",fontWeight:800}}>{totals.transactions}</td>
              </tr>
              {/* Averages row */}
              <tr>
                <td style={{fontWeight:600,color:"var(--text2)",fontSize:11}}>ממוצע חודשי</td>
                <td style={{color:"#10b98199",fontFamily:"monospace",fontSize:12}}>{fmtN(yearMonths.length ? totals.income/yearMonths.length : 0)}</td>
                <td style={{color:"#ef444499",fontFamily:"monospace",fontSize:12}}>{fmtN(avgMonthly)}</td>
                <td style={{color:"#a78bfa99",fontFamily:"monospace",fontSize:12}}>{fmtN(yearMonths.length ? totals.savings/yearMonths.length : 0)}</td>
                <td></td>
                <td style={{color:"var(--text2)",fontSize:12}}>{yearMonths.length ? Math.round(totals.transactions/yearMonths.length) : 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="table-card">
        <h3>פירוט לפי קטגוריה — {selectedYear}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>קטגוריה</th><th>סה״כ</th><th>ממוצע חודשי</th><th>אחוז מהוצאות</th></tr>
            </thead>
            <tbody>
              {catBreakdown.map(c => {
                const pct = totals.expenses > 0 ? (c.total / totals.expenses * 100) : 0;
                return (
                  <tr key={c.name}>
                    <td>
                      <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
                        <span>{icons[c.name] || "🏷️"}</span>
                        <span style={{fontWeight:600}}>{c.name}</span>
                      </span>
                    </td>
                    <td style={{color:colors[c.name] || "#94a3b8",fontWeight:700,fontFamily:"monospace"}}>{fmtN(c.total)}</td>
                    <td style={{color:"var(--text2)",fontFamily:"monospace"}}>{fmtN(c.avg)}</td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{flex:1,height:6,borderRadius:3,background:"var(--border)",maxWidth:120}}>
                          <div style={{height:6,borderRadius:3,width:`${pct}%`,background:colors[c.name] || "#94a3b8",transition:"width 0.3s"}} />
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:colors[c.name] || "#94a3b8",minWidth:36}}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Global Search across all months ───────────────────────────────────────
function GlobalSearch({ monthData, onNavigate, onCategoryChange, onMoveTransaction, sortedMonths, allCategories, allColors, allIcons }) {
  const cats = allCategories || CATEGORIES;
  const colors = allColors || CAT_COLORS;
  const icons = allIcons || CAT_ICONS;
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("הכל");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [showAmtFilter, setShowAmtFilter] = useState(false);

  const allTxs = Object.entries(monthData).flatMap(([key, d]) =>
    (d.transactions || []).map(t => ({ ...t, monthKey: key }))
  );

  const usedCats = ["הכל", ...cats.filter(c => allTxs.some(t => t.category === c))];

  const results = allTxs.filter(t => {
    const matchQ = !query.trim() || t.description.toLowerCase().includes(query.trim().toLowerCase())
      || t.amount.toString().includes(query.trim())
      || (t.date && t.date.includes(query.trim()));
    const matchCat = catFilter === "הכל" || t.category === catFilter;
    const matchMin = !minAmt || t.amount >= parseFloat(minAmt);
    const matchMax = !maxAmt || t.amount <= parseFloat(maxAmt);
    return matchQ && matchCat && matchMin && matchMax;
  }).sort((a, b) => parseDateForSort(b.date).localeCompare(parseDateForSort(a.date)));

  const totalAmount = results.reduce((s, t) => s + t.amount, 0);

  const amtInputStyle = {width:80,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,
    color:"var(--text)",fontFamily:"inherit",fontSize:12,padding:"6px 10px",outline:"none",textAlign:"center"};

  return (
    <div className="overview">
      <h2>🔍 חיפוש עסקאות</h2>
      <div style={{marginBottom:16}}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפש לפי תיאור, סכום, או תאריך..."
          style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,
            color:"var(--text)",fontFamily:"inherit",fontSize:14,padding:"12px 16px",outline:"none",
            direction:"rtl",marginBottom:12}}
        />
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
          {usedCats.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              style={{padding:"4px 10px",borderRadius:20,border:"none",cursor:"pointer",
                fontSize:11,fontWeight:700,transition:"all 0.15s",
                background: catFilter===cat ? (cat==="הכל" ? "#6366f1" : (colors[cat] || "#94a3b8")) : "var(--surface2)",
                color: catFilter===cat ? "#fff" : "var(--text2)",
                outline: catFilter===cat ? "none" : "1px solid var(--border)"}}>
              {cat === "הכל" ? "הכל" : `${icons[cat] || "🏷️"} ${cat}`}
            </button>
          ))}
          <button onClick={() => setShowAmtFilter(o => !o)}
            style={{padding:"4px 10px",borderRadius:20,border:"none",cursor:"pointer",
              fontSize:11,fontWeight:700,transition:"all 0.15s",
              background: showAmtFilter || minAmt || maxAmt ? "#f59e0b" : "var(--surface2)",
              color: showAmtFilter || minAmt || maxAmt ? "#fff" : "var(--text2)",
              outline: showAmtFilter || minAmt || maxAmt ? "none" : "1px solid var(--border)"}}>
            💰 טווח סכומים
          </button>
          <span style={{fontSize:12,color:"var(--text2)",marginRight:"auto"}}>
            {results.length} תוצאות · ₪{Math.round(totalAmount).toLocaleString("he-IL")}
          </span>
        </div>
        {showAmtFilter && (
          <div style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",
            background:"var(--surface2)",borderRadius:10,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"var(--text2)",fontWeight:600}}>סכום:</span>
            <span style={{fontSize:11,color:"var(--text2)"}}>מ-</span>
            <input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)}
              placeholder="₪0" style={amtInputStyle} />
            <span style={{fontSize:11,color:"var(--text2)"}}>עד</span>
            <input type="number" value={maxAmt} onChange={e => setMaxAmt(e.target.value)}
              placeholder="∞" style={amtInputStyle} />
            {(minAmt || maxAmt) && (
              <button onClick={() => { setMinAmt(""); setMaxAmt(""); }}
                style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",
                  fontSize:11,fontWeight:700,background:"var(--bg)",color:"var(--text2)"}}>
                ✕ נקה
              </button>
            )}
          </div>
        )}
      </div>
      {results.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text2)",fontSize:13}}>
          <div style={{fontSize:36,marginBottom:10}}>🔍</div>
          <p>{query.trim() || minAmt || maxAmt ? "לא נמצאו תוצאות" : "הקלד כדי לחפש בכל העסקאות"}</p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>חודש</th><th>תאריך</th><th>תיאור</th><th>סכום</th><th>קטגוריה</th><th style={{width:40}}>העבר</th></tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map((tx, i) => (
                  <tr key={tx.id || i}>
                    <td style={{whiteSpace:"nowrap",fontSize:11,color:"var(--text2)",cursor:"pointer"}}
                      onClick={() => onNavigate(tx.monthKey)}>
                      <span style={{textDecoration:"underline",textDecorationStyle:"dotted"}}>{getMonthLabel(tx.monthKey)}</span>
                    </td>
                    <td style={{whiteSpace:"nowrap",fontSize:12,color:"var(--text2)"}}>{tx.date}</td>
                    <td className="desc">{query.trim() ? highlightMatch(tx.description, query.trim()) : tx.description}</td>
                    <td className="amount">₪{tx.amount.toLocaleString("he-IL",{minimumFractionDigits:2})}</td>
                    <td>
                      <select value={tx.category}
                        onChange={e => onCategoryChange(tx.monthKey, tx.id, e.target.value)}
                        style={{background:(colors[tx.category] || "#94a3b8")+"22", color:colors[tx.category] || "#94a3b8"}}>
                        {cats.map(c => <option key={c} value={c}>{icons[c] || "🏷️"} {c}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"4px"}}>
                      <select value="" onChange={e => {
                          if (e.target.value) onMoveTransaction(tx.monthKey, tx.id, e.target.value);
                        }}
                        style={{background:"var(--surface2)",color:"var(--text2)",border:"1px solid var(--border)",
                          borderRadius:6,fontSize:10,padding:"3px 4px",cursor:"pointer",fontFamily:"inherit",width:50}}>
                        <option value="">↔</option>
                        {sortedMonths.filter(m => m !== tx.monthKey).map(m => (
                          <option key={m} value={m}>{getShortLabel(m)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 100 && (
              <p style={{textAlign:"center",padding:"12px 0",fontSize:12,color:"var(--text2)"}}>
                מציג 100 מתוך {results.length} תוצאות. צמצם את החיפוש.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function highlightMatch(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{background:"#f59e0b33",color:"#f59e0b",borderRadius:3,padding:"0 2px"}}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Empty drop zone ────────────────────────────────────────────────────────
function EmptyDropZone({ onUpload }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);
  const VALID_EXTS = [".pdf",".xlsx",".xls",".xlsm",".ods"];
  const isValid = f => f && VALID_EXTS.some(ext => f.name.toLowerCase().endsWith(ext));
  const handle = f => { if (isValid(f)) onUpload(f); else alert("יש להעלות PDF או Excel"); };
  return (
    <div className={`empty-state ${drag?"drag":""}`}
      onClick={() => inputRef.current.click()}
      onDragOver={e=>{e.preventDefault();setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0]);}}>
      <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.xlsm,.ods" style={{display:"none"}}
        onChange={e=>handle(e.target.files[0])} />
      <div className="icon">📄</div>
      <h2>גרור קובץ לכאן</h2>
      <p>PDF או Excel — או לחץ לבחירת קובץ</p>
      <p style={{marginTop:8,fontSize:11,color:"var(--text2)"}}>כל קובץ = חודש נפרד</p>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [monthData, setMonthData] = useState({});
  const [slideIdx, setSlideIdx] = useState(0);
  const [view, setView] = useState("months");
  const [loading, setLoading] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [customCats, setCustomCats] = useState([]);

  // Merged categories
  const allCategories = [...CATEGORIES, ...customCats.map(c => c.name)];
  const allColors = { ...CAT_COLORS };
  const allIcons = { ...CAT_ICONS };
  customCats.forEach((c, i) => {
    allColors[c.name] = c.color || getCustomCatColor(i);
    allIcons[c.name] = c.icon || getCustomCatIcon(i);
  });

  // Sync body background with theme
  useEffect(() => {
    document.body.style.background = theme === "light" ? "#ffffff" : "#0b0d13";
    document.body.style.color = theme === "light" ? "#1a202c" : "#e8ecf5";
  }, [theme]);
  const inputRef = useRef();

  // Load persisted data on mount
  useEffect(() => {
    Promise.all([persistLoad(), loadCustomCats()]).then(([data, cats]) => {
      setMonthData(data);
      setCustomCats(cats);
      setStorageReady(true);
    });
  }, []);

  // Save whenever data changes (after initial load) — debounced + flush on unload
  const saveTimerRef = useRef(null);
  const monthDataRef = useRef(monthData);
  monthDataRef.current = monthData;

  useEffect(() => {
    if (storageReady) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persistSave(monthData), 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [monthData, storageReady]);

  // Flush save on page close to prevent data loss
  useEffect(() => {
    const flush = () => {
      if (storageReady) persistSave(monthDataRef.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [storageReady]);

  const sortedMonths = Object.keys(monthData).sort().reverse(); // newest first

  useEffect(() => {
    if (slideIdx >= sortedMonths.length && sortedMonths.length > 0)
      setSlideIdx(sortedMonths.length - 1);
  }, [sortedMonths.length]);

  const [batchProgress, setBatchProgress] = useState(null); // {done, total, current}

  const EXCEL_EXTS = [".xlsx", ".xls", ".xlsm", ".ods"];
  const isExcel = (f) => EXCEL_EXTS.some(ext => f.name.toLowerCase().endsWith(ext));
  const isPDF = (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  const isAnalyzable = (f) => isPDF(f) || isExcel(f);

  const processSingleFile = async (file, prevData) => {
    let result;
    if (isExcel(file)) {
      result = await parseExcelDirectly(file);
    } else {
      // Try local PDF parsing first (fast, no API needed)
      try {
        const pdfText = await extractPDFText(file);
        const localResult = parsePDFLocally(pdfText);
        if (localResult.transactions.length > 0) {
          result = localResult;
        }
      } catch(e) { /* local parsing failed, will fallback to AI */ }

      // Fallback to Claude API if local parsing found nothing
      if (!result) {
        const base64 = await fileToBase64(file);
        result = await parseExpensesWithClaude(base64, 5, customCats);
      }
    }
    const monthKey = result.month ||
      `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
    const newTxs = (result.transactions || []).map((t, i) => ({
      ...t,
      id: `${monthKey}-${Date.now()}-${i}`,
      amount: parseFloat(t.amount) || 0,
    }));
    return {
      monthKey,
      record: {
        salary: prevData[monthKey]?.salary || prevData[monthKey]?.income || 0,
        extraIncome: prevData[monthKey]?.extraIncome || 0,
        actualSavings: prevData[monthKey]?.actualSavings || 0,
        ...prevData[monthKey],
        transactions: newTxs,
      }
    };
  };

  const handleUpload = useCallback(async (file) => {
    if (!file || !isAnalyzable(file)) return alert("אנא העלה קובץ PDF או Excel");
    if (file.size > 20 * 1024 * 1024) return alert("הקובץ גדול מדי (מקסימום 20MB)");
    setLoading(true); setError(null); setBatchProgress(null);
    try {
      const { monthKey, record } = await processSingleFile(file, monthData);
      if (monthData[monthKey]?.transactions?.length > 0) {
        const ans = confirm(`כבר קיימים נתונים עבור ${getMonthLabel(monthKey)} (${monthData[monthKey].transactions.length} עסקאות).\n\nלהחליף את הנתונים הקיימים?`);
        if (!ans) { setLoading(false); return; }
      }
      setMonthData(prev => ({ ...prev, [monthKey]: record }));
      const newSorted = [...new Set([...sortedMonths, monthKey])].sort().reverse();
      setSlideIdx(newSorted.indexOf(monthKey));
      setView("months");
    } catch(e) {
      setError("שגיאה בניתוח PDF: " + e.message);
    } finally { setLoading(false); }
  }, [sortedMonths, monthData]);

  const handleUploadMultiple = useCallback(async (files) => {
    const analyzable = Array.from(files).filter(f => isAnalyzable(f));
    if (analyzable.length === 0) return alert("לא נמצאו קבצי PDF או Excel");
    const tooBig = analyzable.find(f => f.size > 20 * 1024 * 1024);
    if (tooBig) return alert(`הקובץ ${tooBig.name} גדול מדי (מקסימום 20MB)`);
    setLoading(true); setError(null);
    setBatchProgress({ done: 0, total: analyzable.length, current: analyzable[0].name });
    let accumulated = { ...monthData };
    let lastKey = null;
    for (let i = 0; i < analyzable.length; i++) {
      setBatchProgress({ done: i, total: analyzable.length, current: analyzable[i].name });
      try {
        const { monthKey, record } = await processSingleFile(analyzable[i], accumulated);
        accumulated = { ...accumulated, [monthKey]: record };
        lastKey = monthKey;
      } catch(e) {
        setError(`שגיאה ב-${analyzable[i].name}: ${e.message}`);
      }
      // Delay between PDF files to avoid API rate limiting
      if (i < analyzable.length - 1 && isPDF(analyzable[i])) {
        await new Promise(r => setTimeout(r, 8000));
      }
    }
    setMonthData(accumulated);
    setBatchProgress({ done: analyzable.length, total: analyzable.length, current: "" });
    if (lastKey) {
      const newSorted = Object.keys(accumulated).sort().reverse();
      setSlideIdx(newSorted.indexOf(lastKey));
      setView("months");
    }
    setTimeout(() => setBatchProgress(null), 2000);
    setLoading(false);
  }, [monthData]);

  const handleUpdate = useCallback((key, record) => {
    setMonthData(prev => ({ ...prev, [key]: record }));
  }, []);

  const handleAddCategory = useCallback(({ name, keywords }) => {
    const newCat = { name, keywords: keywords || "", color: getCustomCatColor(customCats.length), icon: getCustomCatIcon(customCats.length) };
    const updated = [...customCats, newCat];
    setCustomCats(updated);
    saveCustomCats(updated);
  }, [customCats]);

  const [deleteConfirm, setDeleteConfirm] = useState(null); // monthKey to confirm delete

  const handleDelete = (key) => {
    setDeleteConfirm(key);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      setMonthData(prev => { const n={...prev}; delete n[deleteConfirm]; return n; });
      setSlideIdx(0);
      setDeleteConfirm(null);
    }
  };

  const [showExport, setShowExport] = useState(false);

  const handleExport = () => {
    setShowExport(true);
  };

  const handleImport = useCallback((file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      const text = e.target.result;
      try {
        if (file.name.endsWith(".json")) {
          const data = JSON.parse(text);
          if (typeof data !== "object") throw new Error("פורמט לא תקין");
          const existingCount = Object.keys(monthData).length;
          if (existingCount > 0) {
            const ans = confirm(`יש כרגע ${existingCount} חודשים בנתונים.\nהייבוא יחליף את כל הנתונים הקיימים.\n\nלהמשיך?`);
            if (!ans) return;
          }
          setMonthData(data);
          setSlideIdx(0);
          setView("months");
          alert("הנתונים נטענו בהצלחה ✓");
        } else if (file.name.endsWith(".csv")) {
          const lines = text.replace(/\r/g,"").split("\n").filter(l => l.trim());
          const accumulated = {};
          const monthKeyMap = {};
          const yearRange = Array.from({length:21}, (_,i) => 2020+i);
          MONTH_NAMES.forEach((name, mi) => {
            yearRange.forEach(y => {
              monthKeyMap[`${name} ${y}`] = `${y}-${String(mi+1).padStart(2,"0")}`;
            });
          });
          lines.slice(1).forEach((line, i) => {
            const cols = [];
            let cur = "", inQ = false;
            for (let ch of line) {
              if (ch === '"') { inQ = !inQ; }
              else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
              else cur += ch;
            }
            cols.push(cur);
            if (cols.length < 5) return;
            const [monthLabel, date, description, amountStr, category, incomeStr, savingsStr] = cols;
            const monthKey = monthKeyMap[monthLabel.trim()];
            if (!monthKey) return;
            if (!accumulated[monthKey]) {
              accumulated[monthKey] = { salary: parseFloat(incomeStr)||0, extraIncome: 0, actualSavings: parseFloat(savingsStr)||0, transactions: [] };
            }
            accumulated[monthKey].transactions.push({ id: `${monthKey}-import-${i}`, date: date.trim(), description: description.trim(), amount: parseFloat(amountStr)||0, category: category.trim() });
          });
          if (Object.keys(accumulated).length === 0) throw new Error("לא נמצאו נתונים תקינים בקובץ");
          const existingCount = Object.keys(monthData).length;
          if (existingCount > 0) {
            const ans = confirm(`יש כרגע ${existingCount} חודשים בנתונים.\nהייבוא יחליף את כל הנתונים הקיימים.\n\nלהמשיך?`);
            if (!ans) return;
          }
          setMonthData(accumulated);
          setSlideIdx(0);
          setView("months");
          alert(`הנתונים נטענו בהצלחה ✓\n${Object.keys(accumulated).length} חודשים`);
        } else {
          alert("סוג קובץ לא נתמך — יש להעלות PDF, JSON או CSV");
        }
      } catch(err) { alert("שגיאה בטעינת הקובץ: " + err.message); }
    };
    r.readAsText(file);
  }, [monthData]);

  const handleUnifiedImport = useCallback(async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    // Separate by type
    const analyzable = files.filter(f => isAnalyzable(f));
    const jsons = files.filter(f => f.name.toLowerCase().endsWith(".json"));
    const csvs = files.filter(f => f.name.toLowerCase().endsWith(".csv"));

    // Handle JSON/CSV import first (only first one)
    if (jsons.length > 0) {
      handleImport(jsons[0]);
    }
    if (csvs.length > 0 && jsons.length === 0) {
      handleImport(csvs[0]);
    }

    // Handle PDFs and Excel files for AI analysis
    if (analyzable.length === 1) {
      await handleUpload(analyzable[0]);
    } else if (analyzable.length > 1) {
      await handleUploadMultiple(analyzable);
    }
  }, [handleUpload, handleUploadMultiple, handleImport]);

  const activeMonth = sortedMonths[slideIdx];

  if (!storageReady) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",
      fontFamily:"Heebo,sans-serif",color:"var(--text2)",fontSize:14}}>
      טוען נתונים...
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root, .theme-dark{
          --bg:#0b0d13;--surface:#13161f;--surface2:#1a1e2a;--border:#252b3b;--border-alpha:#252b3b55;
          --text:#e8ecf5;--text2:#7a86a0;--text3:#c8d0e0;--accent:#6366f1;
          --red:#ef4444;--green:#10b981;--purple:#a78bfa;--radius:14px;
          --tooltip-bg:#ffffff;--tooltip-text:#1a1e2a;--tooltip-label:#475569;--tooltip-border:#e2e8f0;
          --overlay:rgba(0,0,0,0.5);--shadow:rgba(0,0,0,0.4);
          --spinner-ring:#fff4;--spinner-top:#fff;
        }
        .theme-light{
          --bg:#ffffff;--surface:#ffffff;--surface2:#f5f7fa;--border:#e2e8f0;--border-alpha:#e2e8f055;
          --text:#1a202c;--text2:#64748b;--text3:#374151;--accent:#6366f1;
          --red:#ef4444;--green:#10b981;--purple:#8b5cf6;--radius:14px;
          --tooltip-bg:#1e293b;--tooltip-text:#f1f5f9;--tooltip-label:#cbd5e1;--tooltip-border:#334155;
          --overlay:rgba(0,0,0,0.3);--shadow:rgba(0,0,0,0.12);
          --spinner-ring:#6366f133;--spinner-top:#6366f1;
        }
        body{font-family:'Heebo',sans-serif;background:var(--bg);color:var(--text);direction:rtl;min-height:100vh;}
        .app{min-height:100vh;}

        /* ── Floating hamburger ── */
        .fab-menu{
          position:fixed;top:14px;right:14px;z-index:55;
          width:42px;height:42px;background:var(--surface);border:1px solid var(--border);
          border-radius:11px;color:var(--text);font-size:20px;cursor:pointer;
          display:flex;align-items:center;justify-content:center;transition:all 0.2s;
          box-shadow:0 2px 12px var(--shadow);
        }
        .fab-menu:hover{background:var(--accent);color:#fff;border-color:var(--accent);}
        .fab-menu.hidden{opacity:0;pointer-events:none;}

        /* ── Sidebar ── */
        .sidebar{
          width:260px;background:var(--surface);border-left:1px solid var(--border);
          display:flex;flex-direction:column;position:fixed;right:0;top:0;bottom:0;
          overflow-y:auto;z-index:50;padding-bottom:24px;
          transition:transform 0.25s ease;
          transform:translateX(100%);
        }
        .sidebar.open{transform:translateX(0);}
        .sidebar-logo{padding:20px 18px 16px;border-bottom:1px solid var(--border);}
        .sidebar-logo h1{font-size:17px;font-weight:900;color:var(--accent);}
        .sidebar-logo p{font-size:11px;color:var(--text2);margin-top:2px;}

        .upload-btn{
          margin:14px 12px 4px;padding:11px;background:var(--accent);color:#fff;
          border:none;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;
          cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.15s;
        }
        .upload-btn:hover{opacity:0.88;}.upload-btn:disabled{opacity:0.5;cursor:default;}
        .io-row{display:flex;gap:6px;margin:4px 12px 2px;}
        .io-btn{flex:1;padding:8px 4px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.15s;}
        .io-btn:hover{background:var(--border);color:var(--text);}

        .sidebar-section{padding:6px 10px;}
        .sidebar-label{font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;
          letter-spacing:1px;padding:10px 8px 4px;}
        .sidebar-item{
          display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;
          border-radius:8px;border:none;background:none;color:var(--text2);
          font-family:inherit;font-size:13px;cursor:pointer;text-align:right;transition:all 0.15s;
        }
        .sidebar-item:hover{background:var(--surface2);color:var(--text);}
        .sidebar-item.active{background:var(--accent)22;color:var(--accent);font-weight:600;}
        .sidebar-item .del{margin-right:auto;background:none;border:none;color:var(--red);
          cursor:pointer;font-size:13px;opacity:0;padding:0 2px;}
        .sidebar-item:hover .del{opacity:0.6;}.sidebar-item .del:hover{opacity:1;}

        /* ── Main ── */
        .main{flex:1;padding:28px 32px;min-height:100vh;}

        .error-bar{
          background:#ef444418;border:1px solid #ef444440;color:var(--red);
          padding:12px 16px;border-radius:10px;margin-bottom:20px;font-size:13px;
          display:flex;align-items:center;gap:8px;
        }
        .error-bar button{margin-right:auto;background:none;border:none;color:inherit;cursor:pointer;font-size:16px;}

        .empty-state{
          max-width:440px;margin:100px auto;text-align:center;
          border:2px dashed var(--border);border-radius:var(--radius);
          padding:56px 40px;background:var(--surface);cursor:pointer;transition:all 0.2s;
        }
        .empty-state:hover,.empty-state.drag{border-color:var(--accent);background:#6366f110;}
        .empty-state .icon{font-size:52px;margin-bottom:14px;}
        .empty-state h2{font-size:20px;font-weight:700;}
        .empty-state p{font-size:13px;color:var(--text2);margin-top:6px;}

        /* ── Slide ── */
        .slide{animation:fadeUp 0.25s ease;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

        .slide-nav{display:flex;align-items:center;gap:16px;margin-bottom:22px;padding-right:52px;}
        .nav-arrow{
          width:42px;height:42px;background:var(--surface);border:1px solid var(--border);
          border-radius:11px;color:var(--text);font-size:24px;cursor:pointer;
          display:flex;align-items:center;justify-content:center;transition:all 0.15s;flex-shrink:0;
        }
        .nav-arrow:hover:not(:disabled){background:#6366f122;border-color:var(--accent);color:var(--accent);}
        .nav-arrow:disabled{opacity:0.2;cursor:default;}
        .slide-title-block{}
        .slide-title{font-size:26px;font-weight:900;letter-spacing:-0.5px;}
        .slide-dots{display:flex;gap:5px;margin-top:6px;}
        .slide-dot{width:6px;height:6px;border-radius:50%;background:var(--border);transition:all 0.2s;}
        .slide-dot.active{background:var(--accent);width:18px;border-radius:3px;}

        .fields-row{display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap;}
        .field-group{display:flex;flex-direction:column;gap:6px;}
        .field-group label{font-size:12px;font-weight:600;color:var(--text2);}
        .field-input{
          display:flex;align-items:center;gap:6px;
          background:var(--surface);border:1px solid var(--border);border-radius:10px;
          padding:8px 14px;transition:border-color 0.15s;
        }
        .field-input:focus-within{border-color:var(--accent);}
        .field-input.savings-input:focus-within{border-color:var(--purple);}
        .field-input span{font-size:13px;color:var(--text2);}
        .field-input input{
          background:none;border:none;color:var(--green);font-family:inherit;
          font-size:17px;font-weight:700;width:130px;outline:none;
        }
        .savings-input input{color:var(--purple);}

        .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;}
        .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
          padding:16px;display:flex;flex-direction:column;gap:5px;}
        .kpi-label{font-size:11px;color:var(--text2);font-weight:600;}
        .kpi-value{font-size:19px;font-weight:800;}
        .kpi-value.red{color:var(--red);}.kpi-value.green{color:var(--green);}.kpi-value.purple{color:var(--purple);}

        .pies-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;}
        .chart-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;}
        .chart-card h3{font-size:13px;font-weight:700;color:var(--text2);margin-bottom:12px;}
        .trends-card{overflow:hidden;}
        .chart-card.empty-chart{display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:10px;color:var(--text2);font-size:12px;text-align:center;min-height:180px;}
        .overspend-note{font-size:11px;color:#f97316;margin-bottom:8px;}

        .cat-summary{margin-top:14px;display:flex;flex-direction:column;gap:5px;}
        .cat-row{display:flex;align-items:center;gap:7px;font-size:12px;}
        .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
        .cat-amt{margin-right:auto;font-weight:700;font-size:12px;}

        .table-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;}
        .table-card h3{font-size:13px;font-weight:700;color:var(--text2);margin-bottom:14px;}
        .table-wrap{overflow-x:auto;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th{text-align:right;padding:8px 12px;font-weight:700;color:var(--text2);
          border-bottom:1px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:0.6px;}
        td{padding:9px 12px;border-bottom:1px solid #252b3b55;vertical-align:middle;}
        tr:last-child td{border-bottom:none;}
        tr:hover td{background:var(--surface2);}
        td.desc{max-width:260px;}
        td.amount{font-weight:700;font-family:monospace;color:var(--red);white-space:nowrap;}
        select{font-family:'Heebo',sans-serif;font-size:12px;font-weight:700;
          border-radius:6px;border:none;padding:4px 8px;cursor:pointer;outline:none;}

        .overview h2{font-size:24px;font-weight:900;margin-bottom:20px;padding-right:52px;}
        .spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);
          border-radius:50%;animation:spin 0.75s linear infinite;margin:0 auto 12px;}
        @keyframes spin{to{transform:rotate(360deg);}}

        .sidebar-overlay{
          display:block;position:fixed;inset:0;background:var(--overlay);
          z-index:40;opacity:0;pointer-events:none;transition:opacity 0.25s;
        }
        .sidebar-overlay.open{opacity:1;pointer-events:auto;}

        @media(max-width:900px){
          .main{padding:16px !important;}
          .kpi-row{grid-template-columns:repeat(2,1fr) !important;}
          .pies-row{grid-template-columns:1fr !important;}
          .fields-row{flex-direction:column !important;}
          .slide-title{font-size:20px !important;}
          .nav-arrow{width:36px !important;height:36px !important;font-size:20px !important;}
        }
      `}</style>

      <div className={`app theme-${theme}`}>
        {/* Floating menu button — hides when sidebar is open */}
        <button className={`fab-menu ${mobileSidebar ? "hidden" : ""}`}
          onClick={() => setMobileSidebar(true)}>
          ☰
        </button>

        {/* Overlay */}
        <div className={`sidebar-overlay ${mobileSidebar ? "open" : ""}`}
          onClick={() => setMobileSidebar(false)} />

        <aside className={`sidebar ${mobileSidebar ? "open" : ""}`}>
          <div className="sidebar-logo">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <h1>💰 תפריט</h1>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                  style={{width:30,height:30,background:"var(--surface2)",border:"1px solid var(--border)",
                    borderRadius:7,color:"var(--text2)",fontSize:14,cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center"}}
                  title={theme === "dark" ? "מצב בהיר" : "מצב כהה"}>
                  {theme === "dark" ? "☀️" : "🌙"}
                </button>
                <button onClick={() => setMobileSidebar(false)}
                style={{width:30,height:30,background:"var(--surface2)",border:"1px solid var(--border)",
                  borderRadius:7,color:"var(--text2)",fontSize:16,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
            </div>
          </div>

          <input ref={inputRef} type="file" accept="application/pdf,.pdf,application/json,.json,.csv,.xlsx,.xls,.xlsm,.ods" multiple style={{display:"none"}}
            onChange={e => { handleUnifiedImport(e.target.files); e.target.value=""; }} />
          <button className="upload-btn" onClick={() => { !loading && inputRef.current.click(); }} disabled={loading}>
            {loading
              ? <><span style={{display:"inline-block",width:14,height:14,border:"2px solid var(--spinner-ring)",
                  borderTop:"2px solid var(--spinner-top)",borderRadius:"50%",animation:"spin 0.75s linear infinite"}} />
                {batchProgress ? `${batchProgress.done}/${batchProgress.total}` : "מנתח..."}</>
              : <>📂 ייבוא</>
            }
          </button>
          {batchProgress && batchProgress.done < batchProgress.total && (
            <div style={{margin:"4px 12px",padding:"8px 10px",background:"var(--surface2)",borderRadius:8,fontSize:11,color:"var(--text2)"}}>
              <div style={{marginBottom:4}}>מנתח: {batchProgress.current}</div>
              <div style={{height:3,borderRadius:2,background:"var(--border)"}}>
                <div style={{height:3,borderRadius:2,width:`${(batchProgress.done/batchProgress.total)*100}%`,background:"#6366f1",transition:"width 0.3s"}} />
              </div>
            </div>
          )}
          {batchProgress && batchProgress.done === batchProgress.total && (
            <div style={{margin:"4px 12px",padding:"6px 10px",background:"#10b98122",borderRadius:8,fontSize:11,color:"#10b981",textAlign:"center"}}>
              ✓ {batchProgress.total} קבצים עובדו בהצלחה
            </div>
          )}
          <div className="io-row">
            <button className="io-btn" onClick={handleExport} title="שמור גיבוי JSON למחשב">💾 ייצוא</button>
          </div>

          {sortedMonths.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-label">תצוגות</div>
              <button className={`sidebar-item ${view==="overview"?"active":""}`}
                onClick={() => { setView("overview"); setMobileSidebar(false); }}>
                📊 סקירה כוללת
              </button>
              <button className={`sidebar-item ${view==="yearly"?"active":""}`}
                onClick={() => { setView("yearly"); setMobileSidebar(false); }}>
                📅 סיכום שנתי
              </button>
              <button className={`sidebar-item ${view==="search"?"active":""}`}
                onClick={() => { setView("search"); setMobileSidebar(false); }}>
                🔍 חיפוש עסקאות
              </button>
              <div className="sidebar-label" style={{marginTop:8}}>חודשים ({sortedMonths.length})</div>
              {sortedMonths.map((key, i) => (
                <div key={key}
                  className={`sidebar-item ${slideIdx===i && view==="months" ? "active" : ""}`}
                  onClick={() => { setSlideIdx(i); setView("months"); setMobileSidebar(false); }}>
                  📅 {getMonthLabel(key)}
                  <button className="del" onClick={e => { e.stopPropagation(); handleDelete(key); }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {showExport && (
          <ExportModal monthData={monthData} onClose={() => setShowExport(false)} />
        )}

        <main className="main">
          {error && (
            <div className="error-bar">⚠️ {error}
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {loading && (
            <div style={{textAlign:"center",padding:40}}>
              <div className="spinner" />
              <p style={{color:"var(--text2)",fontSize:13}}>מנתח PDF עם AI...</p>
            </div>
          )}

          {!loading && sortedMonths.length === 0 && <EmptyDropZone onUpload={handleUpload} />}

          {!loading && view === "months" && activeMonth && monthData[activeMonth] && (
            <MonthSlide
              key={activeMonth}
              monthKey={activeMonth}
              monthRecord={monthData[activeMonth]}
              onUpdate={handleUpdate}
              allMonthData={monthData}
              slideIndex={slideIdx}
              total={sortedMonths.length}
              hasPrev={slideIdx < sortedMonths.length - 1}
              hasNext={slideIdx > 0}
              onPrev={() => setSlideIdx(i => i + 1)}
              onNext={() => setSlideIdx(i => i - 1)}
              allCategories={allCategories}
              allColors={allColors}
              allIcons={allIcons}
              onAddCategory={handleAddCategory}
            />
          )}

          {!loading && view === "overview" && (
            <div className="overview">
              <h2>📊 סקירה כוללת — כל החודשים</h2>
              <TrendsChart monthData={monthData} allCategories={allCategories} allColors={allColors} />
              <CategoryCompareChart monthData={monthData} allCategories={allCategories} allColors={allColors} allIcons={allIcons} />
              <AIAnalysis monthData={monthData} />
            </div>
          )}

          {!loading && view === "yearly" && (
            <YearlySummary monthData={monthData} allCategories={allCategories} allColors={allColors} allIcons={allIcons} />
          )}

          {!loading && view === "search" && (
            <GlobalSearch monthData={monthData} sortedMonths={sortedMonths} allCategories={allCategories} allColors={allColors} allIcons={allIcons} onNavigate={(monthKey) => {
              const idx = sortedMonths.indexOf(monthKey);
              if (idx !== -1) { setSlideIdx(idx); setView("months"); }
            }} onCategoryChange={(monthKey, txId, newCat) => {
              const d = monthData[monthKey];
              if (!d) return;
              handleUpdate(monthKey, {
                ...d,
                transactions: (d.transactions || []).map(t => t.id === txId ? { ...t, category: newCat } : t)
              });
            }} onMoveTransaction={(fromMonth, txId, toMonth) => {
              const fromData = monthData[fromMonth];
              const toData = monthData[toMonth];
              if (!fromData) return;
              const tx = (fromData.transactions || []).find(t => t.id === txId);
              if (!tx) return;
              // Remove from source month
              handleUpdate(fromMonth, {
                ...fromData,
                transactions: (fromData.transactions || []).filter(t => t.id !== txId)
              });
              // Add to target month
              const toTxs = [...(toData?.transactions || []), { ...tx, id: `${toMonth}-moved-${Date.now()}` }]
                .sort((a, b) => parseDateForSort(a.date).localeCompare(parseDateForSort(b.date)));
              handleUpdate(toMonth, {
                salary: toData?.salary || 0,
                extraIncome: toData?.extraIncome || 0,
                actualSavings: toData?.actualSavings || 0,
                ...toData,
                transactions: toTxs,
              });
            }} />
          )}

          {deleteConfirm && (
            <div style={{position:"fixed",inset:0,background:"var(--overlay)",zIndex:200,
              display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
              <div style={{background:"var(--surface)",border:"1px solid #252b3b",borderRadius:14,
                padding:28,maxWidth:360,textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
                <h3 style={{fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:8}}>
                  למחוק את {getMonthLabel(deleteConfirm)}?
                </h3>
                <p style={{fontSize:13,color:"var(--text2)",marginBottom:20}}>
                  כל העסקאות של החודש הזה יימחקו לצמיתות.
                </p>
                <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                  <button onClick={() => setDeleteConfirm(null)}
                    style={{padding:"9px 20px",background:"var(--surface2)",color:"var(--text2)",border:"1px solid #252b3b",
                      borderRadius:8,fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    ביטול
                  </button>
                  <button onClick={confirmDelete}
                    style={{padding:"9px 20px",background:"#ef4444",color:"#fff",border:"none",
                      borderRadius:8,fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    מחק
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

# 💰 ניהול תקציב חודשי

אפליקציית ניהול הוצאות אישית עם ניתוח AI.

## התקנה מהירה

### 1. התקנת Node.js
אם אין לכם, הורידו מ: https://nodejs.org (גרסה 18+)

### 2. התקנת הפרויקט
```bash
cd budget-app
npm install
```

### 3. הגדרת מפתח API (נדרש רק לפיצ'רים של AI)
צרו קובץ `.env` בתיקייה הראשית:
```
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```
ניתן להשיג מפתח מ: https://console.anthropic.com/settings/keys

> **ללא מפתח API** — האפליקציה עובדת מצוין! רק ניתוח PDF אוטומטי עם AI ו"ניתוח AI" בסקירה לא יפעלו. ייבוא Excel, עריכה ידנית, גרפים, ייצוא — הכל עובד.

### 4. הרצה
```bash
npm start
```
ייפתח בדפדפן בכתובת: http://localhost:5173

## פריסה באינטרנט (Deploy)

### אפשרות א: Vercel (הכי פשוט, חינם)
1. העלו את הפרויקט ל-GitHub
2. היכנסו ל-https://vercel.com ←  Import project
3. הגדירו Environment Variable: `ANTHROPIC_API_KEY`
4. צרו קובץ `api/claude.js` ל-Serverless Function (ראו למטה)

### אפשרות ב: Netlify
דומה ל-Vercel — העלאה ל-GitHub + Netlify Functions

### Vercel Serverless Function
צרו קובץ `api/claude.js`:
```js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req.body),
  });
  
  const data = await response.json();
  res.status(response.status).json(data);
}
```

## מבנה הפרויקט
```
budget-app/
├── index.html          # דף HTML ראשי
├── src/
│   ├── main.jsx        # נקודת כניסה של React
│   └── App.jsx         # כל האפליקציה
├── server/
│   └── index.js        # שרת proxy ל-API (פיתוח מקומי)
├── package.json
├── vite.config.js
├── .env.example        # דוגמה לקובץ הגדרות
└── .gitignore
```

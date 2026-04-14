// ── שרת proxy ל-Claude API ──────────────────────────────────────────────
// מריצים: node server/index.js
// השרת מאזין בפורט 3001 ומעביר בקשות ל-Anthropic API
//
// הגדרת מפתח API:
//   - הכי פשוט: צרו קובץ .env בתיקייה הראשית עם: ANTHROPIC_API_KEY=sk-ant-...
//   - או: הגדירו משתנה סביבה: export ANTHROPIC_API_KEY=sk-ant-...

import { createServer } from "http";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env file if exists
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = resolve(__dirname, "..", ".env");
  const env = readFileSync(envPath, "utf-8");
  env.split("\n").forEach((line) => {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  });
} catch {}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("❌ חסר ANTHROPIC_API_KEY!");
  console.error("   צרו קובץ .env בתיקייה הראשית:");
  console.error("   ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/claude") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body,
        });

        const data = await response.text();
        res.writeHead(response.status, { "Content-Type": "application/json" });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`✅ שרת API רץ על http://localhost:${PORT}`);
});

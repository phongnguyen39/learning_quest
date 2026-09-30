// Learning Quest — local sync server
// Zero dependencies: uses only Node's built-in `http` and `node:sqlite` (Node 22.5+).
// Run with: node server.js
//
// This replaces Supabase entirely. Every device (kids' tablets, phones, etc.)
// talks to this server over the internet via a tunnel URL (see SETUP.md),
// and this server is the single source of truth stored in learning-quest.db
// right here on this computer.

const http = require("http");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const PORT = process.env.PORT || 3131;
// Change this to your own secret before exposing this server to the internet.
// The deployed app must send this exact value in the X-API-Key header.
// This is a LIGHT deterrent (keeps random internet bots from writing junk
// data), not bank-grade security — don't store anything truly sensitive here.
const API_KEY = process.env.LQ_API_KEY || "change-me-please";

const DB_PATH = path.join(__dirname, "learning-quest.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    grade INTEGER NOT NULL DEFAULT 3,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS topic_progress (
    student_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    times_played INTEGER NOT NULL DEFAULT 0,
    best_percent REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, topic_id)
  );
  CREATE TABLE IF NOT EXISTS unit_progress (
    student_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    practice_count INTEGER NOT NULL DEFAULT 0,
    test_best REAL NOT NULL DEFAULT 0,
    test_times_taken INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, topic_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    session_type TEXT NOT NULL,
    correct INTEGER NOT NULL,
    total INTEGER NOT NULL,
    percent REAL NOT NULL,
    played_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      if (!data) return resolve(null);
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function upsert(table, keyCols, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => "?").join(", ");
  const updateSet = cols.filter((c) => !keyCols.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
  const sql = `
    INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})
    ON CONFLICT(${keyCols.join(", ")}) DO UPDATE SET ${updateSet}
  `;
  db.prepare(sql).run(...cols.map((c) => row[c]));
}

const routes = {
  "GET /api/students": () => db.prepare("SELECT * FROM students ORDER BY name").all(),
  "GET /api/topic-progress": () => db.prepare("SELECT * FROM topic_progress").all(),
  "GET /api/unit-progress": () => db.prepare("SELECT * FROM unit_progress").all(),
  "GET /api/sessions": () => db.prepare("SELECT * FROM sessions ORDER BY played_at DESC LIMIT 500").all(),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const routeKey = `${req.method} ${url.pathname}`;

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  // GET /health is unauthenticated, handy for checking the tunnel works at all.
  if (routeKey === "GET /health") {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }

  const providedKey = req.headers["x-api-key"];
  if (providedKey !== API_KEY) {
    return sendJson(res, 401, { error: "Missing or incorrect X-API-Key header" });
  }

  try {
    if (routes[routeKey]) {
      return sendJson(res, 200, routes[routeKey]());
    }

    if (routeKey === "POST /api/students") {
      const body = await readBody(req);
      upsert("students", ["id"], {
        id: body.id, name: body.name, avatar: body.avatar || null,
        grade: body.grade || 3, updated_at: new Date().toISOString(),
      });
      return sendJson(res, 200, { ok: true });
    }

    if (routeKey === "POST /api/topic-progress") {
      const body = await readBody(req);
      upsert("topic_progress", ["student_id", "topic_id"], {
        student_id: body.student_id, topic_id: body.topic_id,
        times_played: body.times_played || 0, best_percent: body.best_percent || 0,
        updated_at: new Date().toISOString(),
      });
      return sendJson(res, 200, { ok: true });
    }

    if (routeKey === "POST /api/unit-progress") {
      const body = await readBody(req);
      upsert("unit_progress", ["student_id", "topic_id"], {
        student_id: body.student_id, topic_id: body.topic_id, subject: body.subject,
        practice_count: body.practice_count || 0, test_best: body.test_best || 0,
        test_times_taken: body.test_times_taken || 0, passed: body.passed ? 1 : 0,
        updated_at: new Date().toISOString(),
      });
      return sendJson(res, 200, { ok: true });
    }

    if (routeKey === "POST /api/sessions") {
      const body = await readBody(req);
      db.prepare(`
        INSERT INTO sessions (student_id, topic_id, subject, session_type, correct, total, percent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(body.student_id, body.topic_id, body.subject, body.session_type, body.correct, body.total, body.percent);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "Not found", route: routeKey });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Learning Quest local server running at http://localhost:${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
  console.log(`API key required (X-API-Key header): ${API_KEY === "change-me-please" ? "⚠️  still the default — change it!" : "set"}`);
});

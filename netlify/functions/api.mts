// Learning Quest sync API — runs on Netlify (no home server or tunnel needed).
// Data lives in Netlify Blobs (store "learning-quest"). Same routes and data
// shape as the old self-hosted server.js, so the app and dashboards work as-is.
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

// The app sends this in the X-API-Key header. It ships inside the public page,
// so it is a light deterrent against random bots, not a real secret. To rotate
// it, set LQ_API_KEY in Netlify env vars and update the same constant in
// index.html and admin.html.
const DEFAULT_KEY = "lq-9f3c2a7e5b1d4c8a";

const MAX_SESSIONS = 500;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function k(s: unknown) {
  return encodeURIComponent(String(s));
}

function isId(v: unknown) {
  return typeof v === "string" && v.length > 0 && v.length <= 100;
}

async function listValues(store: ReturnType<typeof getStore>, prefix: string) {
  const { blobs } = await store.list({ prefix });
  const values = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return { keys: blobs.map((b) => b.key), values: values.filter((v) => v != null) };
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const route = `${req.method} ${url.pathname.replace(/\/+$/, "")}`;

  if (route === "GET /api/health") {
    return json(200, { ok: true, time: new Date().toISOString() });
  }

  const expected = Netlify.env.get("LQ_API_KEY") || DEFAULT_KEY;
  if (req.headers.get("x-api-key") !== expected) {
    return json(401, { error: "Missing or incorrect X-API-Key header" });
  }

  const store = getStore({ name: "learning-quest", consistency: "strong" });
  const now = new Date().toISOString();

  try {
    switch (route) {
      case "GET /api/students": {
        const { values } = await listValues(store, "students/");
        values.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
        return json(200, values);
      }
      case "GET /api/topic-progress":
        return json(200, (await listValues(store, "topic/")).values);
      case "GET /api/unit-progress":
        return json(200, (await listValues(store, "unit/")).values);
      case "GET /api/sessions": {
        const { blobs } = await store.list({ prefix: "sessions/" });
        const newest = blobs.map((b) => b.key).sort().reverse().slice(0, MAX_SESSIONS);
        const values = await Promise.all(newest.map((key) => store.get(key, { type: "json" })));
        return json(200, values.filter((v) => v != null));
      }
    }

    if (req.method !== "POST") return json(404, { error: "Not found", route });

    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "Body must be JSON" }); }
    if (!body || typeof body !== "object") return json(400, { error: "Body must be a JSON object" });

    switch (route) {
      case "POST /api/students": {
        if (!isId(body.id) || typeof body.name !== "string") return json(400, { error: "id and name required" });
        await store.setJSON(`students/${k(body.id)}`, {
          id: body.id, name: body.name.slice(0, 60), avatar: body.avatar || null,
          grade: Number(body.grade) || 3, updated_at: now,
        });
        return json(200, { ok: true });
      }
      case "POST /api/topic-progress": {
        if (!isId(body.student_id) || !isId(body.topic_id)) return json(400, { error: "student_id and topic_id required" });
        await store.setJSON(`topic/${k(body.student_id)}/${k(body.topic_id)}`, {
          student_id: body.student_id, topic_id: body.topic_id,
          times_played: Number(body.times_played) || 0, best_percent: Number(body.best_percent) || 0,
          updated_at: now,
        });
        return json(200, { ok: true });
      }
      case "POST /api/unit-progress": {
        if (!isId(body.student_id) || !isId(body.topic_id)) return json(400, { error: "student_id and topic_id required" });
        await store.setJSON(`unit/${k(body.student_id)}/${k(body.topic_id)}`, {
          student_id: body.student_id, topic_id: body.topic_id, subject: String(body.subject || ""),
          practice_count: Number(body.practice_count) || 0, test_best: Number(body.test_best) || 0,
          test_times_taken: Number(body.test_times_taken) || 0, passed: body.passed ? 1 : 0,
          updated_at: now,
        });
        return json(200, { ok: true });
      }
      case "POST /api/sessions": {
        if (!isId(body.student_id) || !isId(body.topic_id)) return json(400, { error: "student_id and topic_id required" });
        const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        await store.setJSON(`sessions/${id}`, {
          id, student_id: body.student_id, topic_id: body.topic_id, subject: String(body.subject || ""),
          session_type: String(body.session_type || ""), correct: Number(body.correct) || 0,
          total: Number(body.total) || 0, percent: Number(body.percent) || 0,
          played_at: now.replace("T", " ").slice(0, 19),
        });
        return json(200, { ok: true });
      }
    }
    return json(404, { error: "Not found", route });
  } catch (e: any) {
    console.error(e);
    return json(500, { error: e?.message || "Server error" });
  }
};

export const config: Config = {
  path: "/api/*",
};

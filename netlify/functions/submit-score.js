"use strict";

const { createClient } = require("@supabase/supabase-js");

/* =========================================================
   Must stay identical to SCORE_BANDS in game.js — this is the
   AUTHORITATIVE score calculation. The client's score is only
   a preview; whatever the server computes from x/y is what
   actually gets stored.
   ========================================================= */
const SCORE_BANDS = [
  { maxR: 0.05, score: 100 },
  { maxR: 0.12, score: 80 },
  { maxR: 0.22, score: 60 },
  { maxR: 0.36, score: 40 },
  { maxR: 0.56, score: 20 },
  { maxR: 0.80, score: 10 },
  { maxR: Infinity, score: 0 },
];

function scoreFromNormalized(x, y) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const r = dist / 0.5;
  for (const band of SCORE_BANDS) {
    if (r <= band.maxR) return band.score;
  }
  return 0;
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  let name = raw.trim();
  name = name.replace(/<[^>]*>/g, ""); // strip any tags
  name = name.replace(/[\u0000-\u001F\u007F]/g, ""); // strip control chars
  name = name.replace(/\s+/g, " ");
  if (name.length > 20) name = name.slice(0, 20).trim();
  return name;
}

// Very lightweight, best-effort in-memory rate limiting.
// NOTE: serverless functions are not guaranteed to reuse the same
// container between requests, so this is a soft speed bump against
// accidental double-taps/scripted spam, not a hard guarantee. For a
// few-hundred-person orientation booth this is sufficient; it is
// intentionally simple per the "don't overengineer" requirement.
const recentSubmissions = new Map(); // ip -> last submit timestamp
const MIN_INTERVAL_MS = 1500;

function isRateLimited(ip) {
  const now = Date.now();
  const last = recentSubmissions.get(ip);
  recentSubmissions.set(ip, now);
  // Opportunistic cleanup so the map doesn't grow unbounded
  if (recentSubmissions.size > 500) {
    for (const [key, ts] of recentSubmissions) {
      if (now - ts > 60000) recentSubmissions.delete(key);
    }
  }
  return last !== undefined && now - last < MIN_INTERVAL_MS;
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Malformed request." }) };
  }

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "unknown";
  if (isRateLimited(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ success: false, error: "Please slow down and try again in a moment." }) };
  }

  const name = sanitizeName(body.name);
  const x = Number(body.x);
  const y = Number(body.y);

  if (!name) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Please enter a valid name." }) };
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid throw data." }) };
  }

  const score = scoreFromNormalized(x, y);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Invalid score." }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "Server is not configured correctly." }) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  try {
    const { data: inserted, error: insertError } = await supabase
      .from("leaderboard")
      .insert({ name, score })
      .select("id, name, score, created_at")
      .single();

    if (insertError) throw insertError;

    // Rank = 1 + number of entries that beat this one
    // (higher score first; for ties, earlier submission wins)
    const { count, error: rankError } = await supabase
      .from("leaderboard")
      .select("id", { count: "exact", head: true })
      .or(`score.gt.${score},and(score.eq.${score},created_at.lt.${inserted.created_at})`);

    const rank = rankError ? null : (count || 0) + 1;

    const { data: top, error: topError } = await supabase
      .from("leaderboard")
      .select("id, name, score, created_at")
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(5);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        score,
        rank,
        top: topError ? [] : top,
      }),
    };
  } catch (err) {
    console.error("submit-score error:", err.message || err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Couldn't submit your score. Please try again." }),
    };
  }
};

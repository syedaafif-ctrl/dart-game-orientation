"use strict";

const { createClient } = require("@supabase/supabase-js");

/* =========================================================
   AUTHORITATIVE SCORE CALCULATION
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
  name = name.replace(/<[^>]*>/g, "");
  name = name.replace(/[\u0000-\u001F\u007F]/g, "");
  name = name.replace(/\s+/g, " ");

  if (name.length > 20) {
    name = name.slice(0, 20).trim();
  }

  return name;
}

function sanitizeStudentId(raw) {
  if (typeof raw !== "string") return "";

  let studentId = raw.trim().toUpperCase();

  studentId = studentId.replace(/<[^>]*>/g, "");
  studentId = studentId.replace(/[\u0000-\u001F\u007F]/g, "");
  studentId = studentId.replace(/\s+/g, "");

  if (studentId.length > 30) {
    studentId = studentId.slice(0, 30);
  }

  return studentId;
}

/* =========================================================
   LIGHTWEIGHT RATE LIMITING
   ========================================================= */
const recentSubmissions = new Map();
const MIN_INTERVAL_MS = 1500;

function isRateLimited(ip) {
  const now = Date.now();
  const last = recentSubmissions.get(ip);

  recentSubmissions.set(ip, now);

  if (recentSubmissions.size > 500) {
    for (const [key, ts] of recentSubmissions) {
      if (now - ts > 60000) {
        recentSubmissions.delete(key);
      }
    }
  }

  return last !== undefined && now - last < MIN_INTERVAL_MS;
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Method not allowed.",
      }),
    };
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Malformed request.",
      }),
    };
  }

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    "unknown";

  if (isRateLimited(ip)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Please slow down and try again in a moment.",
      }),
    };
  }

  const name = sanitizeName(body.name);
  const studentId = sanitizeStudentId(body.student_id);

  const x = Number(body.x);
  const y = Number(body.y);

  if (!name) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Please enter a valid name.",
      }),
    };
  }

  if (!studentId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Please enter your Student ID.",
      }),
    };
  }

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Invalid throw data.",
      }),
    };
  }

  const score = scoreFromNormalized(x, y);

  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Invalid score.",
      }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Server is not configured correctly.",
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  });

  try {
    /* =====================================================
       FIND EXISTING STUDENT
       ===================================================== */

    const { data: existing, error: findError } = await supabase
      .from("leaderboard")
      .select("id, name, score, play_number, created_at")
      .eq("student_id", studentId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    /* =====================================================
       DETERMINE PLAY NUMBER
       ===================================================== */

    const currentPlays = existing?.play_number || 0;

    if (currentPlays >= 5) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          error: "You have already used all 5 of your plays.",
          playsUsed: currentPlays,
          playsRemaining: 0,
        }),
      };
    }

    const playNumber = currentPlays + 1;

    /* =====================================================
       EXISTING STUDENT
       UPDATE SAME ROW
       ===================================================== */

    let saved;

    if (existing) {
      // Keep the original name.
      // Only update the score if the new score is better.
      const bestScore = Math.max(existing.score, score);

      const { data: updated, error: updateError } = await supabase
        .from("leaderboard")
        .update({
          score: bestScore,
          play_number: playNumber,
        })
        .eq("id", existing.id)
        .select("id, name, score, created_at")
        .single();

      if (updateError) {
        throw updateError;
      }

      saved = updated;
    }

    /* =====================================================
       NEW STUDENT
       INSERT ONE ROW
       ===================================================== */

    else {
      const { data: inserted, error: insertError } = await supabase
        .from("leaderboard")
        .insert({
          name,
          student_id: studentId,
          play_number: playNumber,
          score,
        })
        .select("id, name, score, created_at")
        .single();

      if (insertError) {
        throw insertError;
      }

      saved = inserted;
    }

    /* =====================================================
       CALCULATE RANK
       ===================================================== */

    const { count, error: rankError } = await supabase
      .from("leaderboard")
      .select("id", {
        count: "exact",
        head: true,
      })
      .or(
        `score.gt.${saved.score},and(score.eq.${saved.score},created_at.lt.${saved.created_at})`
      );

    const rank = rankError ? null : (count || 0) + 1;

    /* =====================================================
       GET TOP 5
       ===================================================== */

    const { data: top, error: topError } = await supabase
      .from("leaderboard")
      .select("id, name, score, created_at")
      .order("score", {
        ascending: false,
      })
      .order("created_at", {
        ascending: true,
      })
      .limit(5);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        score,
        bestScore: saved.score,
        rank,
        playNumber,
        playsUsed: playNumber,
        playsRemaining: 5 - playNumber,
        top: topError ? [] : top,
      }),
    };
  } catch (err) {
    console.error("submit-score error:", err.message || err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Couldn't submit your score. Please try again.",
      }),
    };
  }
};
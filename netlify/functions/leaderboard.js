"use strict";

const { createClient } = require("@supabase/supabase-js");

const TOP_LIMIT = 30;

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Method not allowed." }) };
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
    const { data, error } = await supabase
      .from("leaderboard")
      .select("id, name, score, created_at")
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(TOP_LIMIT);

    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, top: data }),
    };
  } catch (err) {
    console.error("leaderboard error:", err.message || err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Couldn't load the leaderboard." }),
    };
  }
};

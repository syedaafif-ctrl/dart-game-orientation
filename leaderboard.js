"use strict";

const ORGANIZATION_NAME = "YOUR ORGANIZATION NAME";
const REFRESH_MS = 5000;

document.getElementById("orgNameFooterLb").textContent = ORGANIZATION_NAME;

const listEl = document.getElementById("lbList");
let lastTopId = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function medalFor(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return String(i + 1) + ".";
}

function render(rows) {
  if (!rows || rows.length === 0) {
    listEl.innerHTML = '<div class="lb-empty">No scores yet — be the first to play!</div>';
    return;
  }

  const currentTopId = rows[0].id;
  const isNewTop = lastTopId !== null && currentTopId !== lastTopId;
  lastTopId = currentTopId;

  listEl.innerHTML = rows.map((row, i) => {
    const topClass = i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "";
    const newClass = isNewTop && i === 0 ? " new-entry" : "";
    return `<div class="lb-row${topClass}${newClass}">
      <div class="lb-rank">${i < 3 ? "" : i + 1}</div>
      <div class="lb-medal">${i < 3 ? medalFor(i) : ""}</div>
      <div class="lb-name">${escapeHtml(row.name)}</div>
      <div class="lb-score">${row.score}</div>
    </div>`;
  }).join("");
}

async function loadLeaderboard() {
  try {
    const res = await fetch("/.netlify/functions/leaderboard", { cache: "no-store" });
    if (!res.ok) throw new Error("Request failed");
    const data = await res.json();
    render(data.top || []);
  } catch (err) {
    if (listEl.children.length === 0) {
      listEl.innerHTML = '<div class="lb-empty">Couldn\u2019t load the leaderboard. Retrying\u2026</div>';
    }
  }
}

loadLeaderboard();
setInterval(loadLeaderboard, REFRESH_MS);

"use strict";

/* =========================================================
   CONFIG — the only things you should need to edit
   ========================================================= */
const ORGANIZATION_NAME = "NSU ACM SC";

/* =========================================================
   Dartboard scoring rings, expressed as normalized radius
   (fraction of board radius, where 0 = bullseye, 1 = board edge).
   The server (netlify/functions/submit-score.js) uses the exact
   same bands — keep both files in sync if you tune these.
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

// Ring radii (as fraction of board radius) purely for drawing the board art.
const VISUAL_RINGS = [
  { r: 1.00, fill: "#14171f", stroke: "#262b38" }, // outer rim / 0 zone
  { r: 0.80, fill: "#7a2323" },                      // 10 zone
  { r: 0.56, fill: "#e8e2d3" },                      // 20 zone
  { r: 0.36, fill: "#ff4b4b" },                      // 40 zone
  { r: 0.22, fill: "#e8e2d3" },                      // 60 zone
  { r: 0.12, fill: "#ff4b4b" },                      // 80 zone
  { r: 0.05, fill: "#ffb703" },                      // 100 / bullseye
];

// Standard dartboard number sequence, clockwise starting at the top (12 o'clock).
const BOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function scoreFromNormalized(x, y) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy); // 0 -> center, 0.5 -> edge of a 0..1 square
  const r = dist / 0.5; // normalize so 1.0 == board edge
  for (const band of SCORE_BANDS) {
    if (r <= band.maxR) return band.score;
  }
  return 0;
}

function resultLabelFor(score) {
  if (score >= 100) return "BULLSEYE!";
  if (score >= 80) return "GREAT SHOT!";
  if (score >= 60) return "NICE THROW!";
  if (score >= 40) return "NOT BAD!";
  if (score >= 20) return "SO CLOSE!";
  if (score >= 10) return "KEEP TRYING!";
  return "MISSED THE BOARD!";
}

/* =========================================================
   Dartboard SVG renderer (used on every screen)
   ========================================================= */
function renderDartboard(svgEl) {
  const cx = 50, cy = 50;
  const ns = "http://www.w3.org/2000/svg";
  svgEl.innerHTML = "";
  VISUAL_RINGS.forEach((ring) => {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", (ring.r * 50).toFixed(2));
    circle.setAttribute("fill", ring.fill);
    if (ring.stroke) {
      circle.setAttribute("stroke", ring.stroke);
      circle.setAttribute("stroke-width", "1");
    }
    svgEl.appendChild(circle);
  });
  // thin dividing rings for extra polish
  [0.80, 0.56, 0.36, 0.22, 0.12].forEach((r) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", (r * 50).toFixed(2));
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "rgba(12,14,19,0.35)");
    c.setAttribute("stroke-width", "0.6");
    svgEl.appendChild(c);
  });
  // center dot outline
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", cx);
  dot.setAttribute("cy", cy);
  dot.setAttribute("r", 1.4);
  dot.setAttribute("fill", "#3a2a00");
  svgEl.appendChild(dot);

  // Traditional dartboard number ring, sitting in the outer (0-score) band.
  const numRadius = 45;
  BOARD_NUMBERS.forEach((num, i) => {
    const angleRad = ((-90 + i * 18) * Math.PI) / 180;
    const nx = cx + numRadius * Math.cos(angleRad);
    const ny = cy + numRadius * Math.sin(angleRad);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", nx.toFixed(2));
    text.setAttribute("y", ny.toFixed(2));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", "4.4");
    text.setAttribute("font-family", "Rajdhani, sans-serif");
    text.setAttribute("font-weight", "700");
    text.setAttribute("fill", "#f1eee6");
    text.textContent = String(num);
    svgEl.appendChild(text);
  });
}

/* =========================================================
   State
   ========================================================= */
const state = {
  lockedX: null,
  lockedY: null,
  score: 0,
  submitted: false,
  animFrameId: null,
};

/* =========================================================
   DOM refs
   ========================================================= */
const screens = {
  start: document.getElementById("screen-start"),
  horizontal: document.getElementById("screen-horizontal"),
  vertical: document.getElementById("screen-vertical"),
  throw: document.getElementById("screen-throw"),
  result: document.getElementById("screen-result"),
};

const el = {
  orgFooter: document.getElementById("orgNameFooter"),
  btnStart: document.getElementById("btnStart"),
  hDart: document.getElementById("hDart"),
  hReadout: document.getElementById("hReadout"),
  btnLockH: document.getElementById("btnLockH"),
  vDart: document.getElementById("vDart"),
  vReadout: document.getElementById("vReadout"),
  btnThrow: document.getElementById("btnThrow"),
  throwLabel: document.getElementById("throwLabel"),
  dartEl: document.getElementById("dartEl"),
  impactRing: document.getElementById("impactRing"),
  resultScoreVal: document.getElementById("resultScoreVal"),
  resultLabel: document.getElementById("resultLabel"),
  nameForm: document.getElementById("nameForm"),
  nameInput: document.getElementById("nameInput"),
  nameMsg: document.getElementById("nameMsg"),
  btnSubmitScore: document.getElementById("btnSubmitScore"),
  miniBoard: document.getElementById("miniBoard"),
  miniBoardRows: document.getElementById("miniBoardRows"),
  yourRank: document.getElementById("yourRank"),
  btnPlayAgain: document.getElementById("btnPlayAgain"),
  toast: document.getElementById("toast"),
};

el.orgFooter.textContent = ORGANIZATION_NAME;

renderDartboard(document.getElementById("startBoardSvg"));
renderDartboard(document.getElementById("hBoardSvg"));
renderDartboard(document.getElementById("vBoardSvg"));
renderDartboard(document.getElementById("throwBoardSvg"));

/* =========================================================
   Screen navigation
   ========================================================= */
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  const isAiming = name === "horizontal" || name === "vertical";
  document.body.classList.toggle("locking", isAiming);
}

/* =========================================================
   Toast
   ========================================================= */
let toastTimer = null;
function showToast(message, type = "") {
  el.toast.textContent = message;
  el.toast.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove("show");
  }, 3200);
}

/* =========================================================
   STEP 1 — Horizontal aim loop
   ========================================================= */
let hPos = 0.08; // normalized 0..1
let hDir = 1;
const H_SPEED = 0.011; // fraction of board per frame (~60fps)

function updateHorizontalVisual() {
  el.hDart.style.left = (hPos * 100) + "%";
  el.hDart.style.top = "50%";
  el.hReadout.innerHTML = `X: <span class="val">${Math.round(hPos * 100)}</span>`;
}

function horizontalTick() {
  hPos += hDir * H_SPEED;
  if (hPos >= 1) { hPos = 1; hDir = -1; }
  if (hPos <= 0) { hPos = 0; hDir = 1; }
  updateHorizontalVisual();
  state.animFrameId = requestAnimationFrame(horizontalTick);
}

function startHorizontalAim() {
  hPos = 0.08;
  hDir = 1;
  updateHorizontalVisual();
  cancelAnimationFrame(state.animFrameId);
  state.animFrameId = requestAnimationFrame(horizontalTick);
}

/* =========================================================
   STEP 2 — Vertical aim loop
   ========================================================= */
let vPos = 0.08;
let vDir = 1;
const V_SPEED = 0.013;

function updateVerticalVisual() {
  el.vDart.style.left = (state.lockedX * 100) + "%";
  el.vDart.style.top = (vPos * 100) + "%";
  el.vReadout.innerHTML = `Y: <span class="val">${Math.round(vPos * 100)}</span>`;
}

function verticalTick() {
  vPos += vDir * V_SPEED;
  if (vPos >= 1) { vPos = 1; vDir = -1; }
  if (vPos <= 0) { vPos = 0; vDir = 1; }
  updateVerticalVisual();
  state.animFrameId = requestAnimationFrame(verticalTick);
}

function startVerticalAim() {
  vPos = 0.08;
  vDir = 1;
  updateVerticalVisual();
  cancelAnimationFrame(state.animFrameId);
  state.animFrameId = requestAnimationFrame(verticalTick);
}

/* =========================================================
   Throw + impact animation
   ========================================================= */
function playThrowAnimation() {
  showScreen("throw");
  el.throwLabel.textContent = "RELEASING…";

  const dart = el.dartEl;
  const ring = el.impactRing;
  dart.classList.remove("flying", "landed");
  ring.classList.remove("pop");
  dart.style.opacity = "0";
  dart.style.left = "50%";
  dart.style.top = "-8%";

  // brief pause before the throw
  setTimeout(() => {
    dart.classList.add("flying");
    // force reflow so the transition applies
    void dart.offsetWidth;
    dart.style.left = (state.lockedX * 100) + "%";
    dart.style.top = (state.lockedY * 100) + "%";

    setTimeout(() => {
      dart.classList.remove("flying");
      dart.classList.add("landed");
      ring.style.left = (state.lockedX * 100) + "%";
      ring.style.top = (state.lockedY * 100) + "%";
      ring.classList.add("pop");
      el.throwLabel.textContent = "IMPACT!";

      setTimeout(() => {
        finishThrow();
      }, 750);
    }, 1200);
  }, 400);
}

function finishThrow() {
  state.score = scoreFromNormalized(state.lockedX, state.lockedY);
  el.resultScoreVal.textContent = state.score;
  el.resultLabel.textContent = resultLabelFor(state.score);
  state.submitted = false;
  el.nameInput.value = "";
  el.nameMsg.textContent = "";
  el.miniBoard.classList.remove("show");
  el.btnSubmitScore.disabled = false;
  el.btnSubmitScore.textContent = "SUBMIT SCORE";
  showScreen("result");
}

/* =========================================================
   Name validation / sanitization
   ========================================================= */
function sanitizeName(raw) {
  let name = String(raw || "").trim();
  // Strip any HTML tags defensively; the server also escapes on render.
  name = name.replace(/<[^>]*>/g, "");
  // Collapse excess whitespace
  name = name.replace(/\s+/g, " ");
  if (name.length > 20) name = name.slice(0, 20).trim();
  return name;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   Submit score
   ========================================================= */
async function submitScore(name) {
  const res = await fetch("/.netlify/functions/submit-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, x: state.lockedX, y: state.lockedY }),
  });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("Unexpected response from server.");
  }

  if (!res.ok || !data.success) {
    throw new Error((data && data.error) || "Couldn't submit your score. Please try again.");
  }
  return data;
}

function renderMiniLeaderboard(data, playerName) {
  const rows = Array.isArray(data.top) ? data.top : [];
  const medals = ["🥇", "🥈", "🥉"];
  el.miniBoardRows.innerHTML = rows.slice(0, 5).map((row, i) => {
    const isMe = data.rank && (i + 1) === data.rank;
    return `<div class="rank-row${isMe ? " me" : ""}">
      <span class="rank-medal">${medals[i] || (i + 1)}</span>
      <span class="rank-name">${escapeHtml(row.name)}</span>
      <span class="rank-score">${row.score}</span>
    </div>`;
  }).join("");

  if (data.rank) {
    el.yourRank.innerHTML = `YOUR RANK: <strong>#${data.rank}</strong>`;
  } else {
    el.yourRank.textContent = "";
  }
  el.miniBoard.classList.add("show");
}

/* =========================================================
   Event wiring
   ========================================================= */
el.btnStart.addEventListener("click", () => {
  showScreen("horizontal");
  startHorizontalAim();
});

el.btnLockH.addEventListener("click", () => {
  cancelAnimationFrame(state.animFrameId);
  state.lockedX = hPos;
  showScreen("vertical");
  startVerticalAim();
});

el.btnThrow.addEventListener("click", () => {
  cancelAnimationFrame(state.animFrameId);
  state.lockedY = vPos;
  playThrowAnimation();
});

el.nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.submitted) return; // guard against double submit

  const name = sanitizeName(el.nameInput.value);
  if (!name) {
    el.nameMsg.textContent = "Please enter your name.";
    el.nameMsg.classList.remove("ok");
    el.nameInput.focus();
    return;
  }

  el.nameMsg.textContent = "";
  el.btnSubmitScore.disabled = true;
  el.btnSubmitScore.textContent = "SUBMITTING…";

  try {
    const data = await submitScore(name);
    state.submitted = true;
    el.btnSubmitScore.textContent = "SUBMITTED ✓";
    renderMiniLeaderboard(data, name);
    showToast("Score submitted!", "success");
  } catch (err) {
    el.btnSubmitScore.disabled = false;
    el.btnSubmitScore.textContent = "SUBMIT SCORE";
    showToast(err.message || "Couldn't submit your score. Please try again.", "error");
  }
});

el.btnPlayAgain.addEventListener("click", () => {
  state.lockedX = null;
  state.lockedY = null;
  state.score = 0;
  showScreen("horizontal");
  startHorizontalAim();
});

// Defensive: stop any stray animation loop if the tab is hidden a long time
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAnimationFrame(state.animFrameId);
});
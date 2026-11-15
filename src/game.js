import { sb } from "./supabase.js";
import { state } from "./state.js";
import { $, esc, plural, setFeedback, friendlyError, onCleanup } from "./ui.js";
import { playPop } from "./bottle.js";

// Mini-Spiel: Weihnachtskugeln mit Sektkorken abschießen.
// Gespeichert wird der beste Punktestand als „Antwort“ (Tabelle answers), bis Mitternacht beliebig oft spielbar.
const W = 360, H = 540;
const INK = "#1b1030", PAPER = "#fffaf0";
const COLORS = ["#ff3ea5", "#00bfc4", "#7b4dff", "#3ddc84", "#ff7a1a", "#e0245e"];

export function buildGame({ day, door, body, overview }) {
  const secs = door.seconds || 60;
  const revealed = !!overview.is_revealed;
  body.innerHTML =
    '<div class="emoji small">' + esc(door.emoji || "🍾") + "</div>" +
    '<p class="question">' + esc(door.question || "Schieß in " + secs + " Sekunden so viele Kugeln ab wie möglich!") + "</p>" +
    '<div class="game-wrap"><canvas id="game" width="' + W * 2 + '" height="' + H * 2 + '" aria-label="Spielfeld"></canvas>' +
      '<div class="game-hud"><span id="hudScore">0</span><span id="hudTime">' + secs + " s</span></div>" +
      '<div class="game-over" id="overlay"><p id="overText">Tippe irgendwo hin: Der Korken fliegt dorthin.<br>Goldene Kugeln zählen 3 Punkte.</p>' +
        (revealed ? '<p class="small">Die Runde ist vorbei, spielen geht trotzdem (zählt nicht mehr).</p>' : "") +
        '<button class="btn" id="startBtn" type="button">Los!</button></div>' +
    "</div>" +
    '<p class="feedback" id="feedback" aria-live="polite"></p>' +
    '<div class="gallery-head"><h3>Bestenliste</h3><span id="gcount"></span></div>' +
    '<ol class="answers board" id="board"><li class="note">Lädt …</li></ol>';

  const cv = $("#game", body), cx = cv.getContext("2d");
  cx.scale(2, 2);
  const fb = $("#feedback", body), overlay = $("#overlay", body), overText = $("#overText", body);
  const startBtn = $("#startBtn", body), hudScore = $("#hudScore", body), hudTime = $("#hudTime", body);
  const board = $("#board", body), gcount = $("#gcount", body);

  let best = null; // eigener bester Wert aus der Datenbank
  let raf = null, alive = true;
  onCleanup(() => { alive = false; cancelAnimationFrame(raf); });

  // ---------- Spielzustand ----------
  let balls, corks, bits, texts, score, left, aim, lastShot, spawnIn, running, lastTs;
  function reset() {
    balls = []; corks = []; bits = []; texts = [];
    score = 0; left = secs; aim = -Math.PI / 2; lastShot = 0; spawnIn = 0; lastTs = null;
    hudScore.textContent = "0"; hudTime.textContent = secs + " s";
  }
  reset();

  const BX = W / 2, BY = H - 18; // Flaschenboden (Drehpunkt)
  const NECK = 78;               // Abstand Drehpunkt → Flaschenhals

  function spawn() {
    const gold = Math.random() < 0.12;
    const fromLeft = Math.random() < 0.5;
    const r = gold ? 12 : 15 + Math.random() * 8;
    const speed = (gold ? 170 : 55 + Math.random() * 90) * (1 + (secs - left) / secs * 0.6); // wird schneller
    balls.push({
      x: fromLeft ? -r : W + r, y0: 50 + Math.random() * 280, y: 0,
      vx: fromLeft ? speed : -speed, r, gold, phase: Math.random() * 6, amp: 6 + Math.random() * 16,
      color: gold ? "#ffcc1a" : COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }

  function shoot(tx, ty) {
    const now = performance.now();
    if (now - lastShot < 220) return;
    lastShot = now;
    aim = Math.max(-Math.PI + 0.25, Math.min(-0.25, Math.atan2(ty - BY, tx - BX)));
    const sx = BX + Math.cos(aim) * NECK, sy = BY + Math.sin(aim) * NECK;
    corks.push({ x: sx, y: sy, vx: Math.cos(aim) * 620, vy: Math.sin(aim) * 620, rot: 0 });
    playPop();
  }

  function hit(b) {
    const pts = b.gold ? 3 : 1;
    score += pts; hudScore.textContent = String(score);
    texts.push({ x: b.x, y: b.y, t: 0, s: "+" + pts });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
      bits.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, color: b.color });
    }
    ting(b.gold);
  }

  function update(dt) {
    left -= dt;
    hudTime.textContent = Math.max(0, Math.ceil(left)) + " s";
    if (left <= 0) return finish();
    spawnIn -= dt;
    if (spawnIn <= 0 && balls.length < 7) { spawn(); spawnIn = 0.45 + Math.random() * 0.6; }
    const t = performance.now() / 1000;
    balls.forEach(b => { b.x += b.vx * dt; b.y = b.y0 + Math.sin(t * 2 + b.phase) * b.amp; });
    corks.forEach(c => { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 260 * dt; c.rot += dt * 14; });
    // Treffer
    for (const c of corks) for (const b of balls) {
      if (!b.dead && !c.dead && Math.hypot(c.x - b.x, c.y - b.y) < b.r + 6) { b.dead = c.dead = true; hit(b); }
    }
    balls = balls.filter(b => !b.dead && b.x > -40 && b.x < W + 40);
    corks = corks.filter(c => !c.dead && c.y > -30 && c.x > -30 && c.x < W + 30 && c.y < H + 30);
    bits.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; });
    bits = bits.filter(p => p.t < 0.6);
    texts.forEach(x => { x.t += dt; x.y -= 40 * dt; });
    texts = texts.filter(x => x.t < 0.7);
  }

  // ---------- Zeichnen ----------
  function drawBall(b) {
    cx.save(); cx.translate(b.x, b.y);
    cx.strokeStyle = INK; cx.lineWidth = 2.5;
    cx.beginPath(); cx.moveTo(0, -b.r - 4); cx.lineTo(0, -b.r - 14); cx.stroke(); // Faden
    cx.fillStyle = "#c9a227"; cx.fillRect(-4, -b.r - 5, 8, 6); cx.strokeRect(-4, -b.r - 5, 8, 6); // Kappe
    cx.fillStyle = b.color; cx.beginPath(); cx.arc(0, 0, b.r, 0, Math.PI * 2); cx.fill(); cx.stroke();
    cx.fillStyle = "rgba(255,255,255,.55)"; cx.beginPath(); cx.arc(-b.r * .35, -b.r * .35, b.r * .25, 0, Math.PI * 2); cx.fill();
    if (b.gold) { cx.fillStyle = INK; cx.font = "bold 11px Figtree, sans-serif"; cx.textAlign = "center"; cx.fillText("3", 0, 4); }
    cx.restore();
  }
  function drawBottle() {
    cx.save(); cx.translate(BX, BY); cx.rotate(aim + Math.PI / 2);
    cx.strokeStyle = INK; cx.lineWidth = 3; cx.lineJoin = "round";
    cx.fillStyle = "#1f7a52";
    cx.beginPath();
    cx.moveTo(-7, -NECK); cx.lineTo(7, -NECK); cx.lineTo(7, -50);
    cx.bezierCurveTo(7, -40, 20, -38, 20, -26); cx.lineTo(20, -4); cx.quadraticCurveTo(20, 2, 14, 2);
    cx.lineTo(-14, 2); cx.quadraticCurveTo(-20, 2, -20, -4); cx.lineTo(-20, -26);
    cx.bezierCurveTo(-20, -38, -7, -40, -7, -50); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = "#ffcc1a"; cx.fillRect(-8, -NECK, 16, 20); cx.strokeRect(-8, -NECK, 16, 20);
    cx.fillStyle = "#ff3ea5"; cx.fillRect(-15, -26, 30, 16); cx.strokeRect(-15, -26, 30, 16);
    cx.restore();
  }
  function draw() {
    cx.fillStyle = PAPER; cx.fillRect(0, 0, W, H);
    // dezente Schneeflocken im Hintergrund
    cx.fillStyle = "rgba(0,191,196,.18)";
    for (let i = 0; i < 18; i++) cx.fillRect((i * 97) % W, (i * 61 + (performance.now() / 40)) % H, 4, 4);
    balls.forEach(drawBall);
    corks.forEach(c => {
      cx.save(); cx.translate(c.x, c.y); cx.rotate(c.rot);
      cx.fillStyle = "#d39a5b"; cx.strokeStyle = INK; cx.lineWidth = 2;
      cx.beginPath(); cx.roundRect(-5, -6, 10, 12, 3); cx.fill(); cx.stroke(); cx.restore();
    });
    bits.forEach(p => { cx.globalAlpha = 1 - p.t / 0.6; cx.fillStyle = p.color; cx.fillRect(p.x - 3, p.y - 3, 6, 6); });
    cx.globalAlpha = 1;
    texts.forEach(x => {
      cx.globalAlpha = 1 - x.t / 0.7; cx.font = "20px Bungee, sans-serif"; cx.textAlign = "center";
      cx.lineWidth = 4; cx.strokeStyle = INK; cx.strokeText(x.s, x.x, x.y); cx.fillStyle = "#ffcc1a"; cx.fillText(x.s, x.x, x.y);
    });
    cx.globalAlpha = 1;
    drawBottle();
  }

  function loop(ts) {
    if (!alive || !running) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    update(dt);
    if (running) { draw(); raf = requestAnimationFrame(loop); }
  }

  function toCanvas(e) {
    const rc = cv.getBoundingClientRect();
    return [(e.clientX - rc.left) * W / rc.width, (e.clientY - rc.top) * H / rc.height];
  }
  cv.addEventListener("pointerdown", e => { if (!running) return; e.preventDefault(); shoot(...toCanvas(e)); });

  startBtn.addEventListener("click", () => {
    reset(); running = true; overlay.hidden = true; setFeedback(fb, "");
    raf = requestAnimationFrame(loop);
  });

  async function finish() {
    running = false; cancelAnimationFrame(raf); draw();
    overText.innerHTML = "Zeit um!<br><b>" + plural(score, "Punkt", "Punkte") + "</b>" +
      (best !== null ? "<br>Dein Bestwert: " + Math.max(best, score) : "");
    startBtn.textContent = "Nochmal";
    overlay.hidden = false;
    if (revealed) return;
    if (best !== null && score <= best) { setFeedback(fb, "Kein neuer Bestwert. Versuch's nochmal!"); return; }
    const { error } = await sb.from("answers").upsert({ day, user_id: state.userId, answer: String(score) }, { onConflict: "day,user_id" });
    if (error) { setFeedback(fb, friendlyError(error), "no"); return; }
    best = score;
    setFeedback(fb, "Neuer Bestwert gespeichert! 🎉", "yes");
    load();
  }

  // ---------- Bestenliste ----------
  async function load() {
    const { data, error } = await sb.rpc("get_answers", { d: day });
    if (error) { board.innerHTML = '<li class="note">Die Bestenliste lässt sich gerade nicht laden.</li>'; return; }
    const rows = (data || []).map(r => ({ ...r, pts: parseInt(r.answer, 10) || 0 }));
    const mine = rows.find(r => r.is_me);
    if (mine) best = mine.pts;
    const canSee = mine || revealed || state.isAdmin;
    board.innerHTML = "";
    if (!canSee) {
      const n = overview.count || 0;
      gcount.textContent = n ? plural(n, "Person", "Personen") : "";
      board.innerHTML = '<li class="note locked-gal">' + (n ? plural(n, "Person hat", "Personen haben") + " schon gespielt. Spiel erst selbst, dann siehst du die Liste."
        : "Noch hat niemand gespielt. Sei die oder der Erste!") + "</li>";
      return;
    }
    gcount.textContent = rows.length ? plural(rows.length, "Person", "Personen") : "";
    rows.sort((a, b) => b.pts - a.pts);
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      const medal = ["🥇", "🥈", "🥉"][i] || (i + 1) + ".";
      li.innerHTML = '<b class="rank">' + medal + "</b><span>" + esc(r.is_me ? "Du" : r.name) + "</span><i>" + r.pts + "</i>";
      if (r.is_me) li.classList.add("me");
      if (state.isAdmin) {
        const del = document.createElement("button");
        del.type = "button"; del.className = "linkbtn"; del.textContent = "🗑"; del.title = "Eintrag löschen";
        del.addEventListener("click", async () => {
          if (!confirm("Eintrag von " + r.name + " löschen?")) return;
          const { error: e } = await sb.from("answers").delete().eq("day", day).eq("user_id", r.user_id);
          if (e) setFeedback(fb, friendlyError(e), "no"); else load();
        });
        li.append(del);
      }
      board.append(li);
    });
  }

  draw();
  load();
}

// Heller „Ting“, wenn eine Kugel zerspringt
let ctx;
function ting(gold) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(gold ? 1760 : 1320, t);
    o.frequency.exponentialRampToValueAtTime(gold ? 2400 : 1800, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.26);
  } catch { /* ohne Ton */ }
}

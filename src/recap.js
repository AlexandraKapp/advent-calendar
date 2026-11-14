import { sb, BUCKET } from "./supabase.js";
import { $, colorFor, setFeedback, onCleanup } from "./ui.js";

// Türchen 24: Rückblick-Video aus allen Fotos und Zeichnungen.
export function buildRecap({ body }) {
  body.innerHTML =
    '<p class="question">Der Brunchies-Rückblick 2026 🎬</p>' +
    '<div class="stage"><canvas id="film" width="720" height="720" aria-label="Rückblick-Video"></canvas>' +
    '<div class="bar"><span id="barFill"></span></div></div>' +
    '<div class="row"><button class="btn" id="playBtn" type="button" disabled>▶ Abspielen</button>' +
    '<button class="btn ghost" id="againBtn" type="button" disabled>↺ Von vorn</button></div>' +
    '<button class="btn ghost" id="recBtn" type="button" disabled>⬇️ Als Video-Datei speichern</button>' +
    '<p class="feedback" id="feedback" aria-live="polite">Lädt alle Bilder …</p>' +
    '<div id="dlBox" class="stack" style="display:grid" hidden></div>';

  const cv = $("#film", body), cx = cv.getContext("2d");
  const fb = $("#feedback", body), playBtn = $("#playBtn", body), againBtn = $("#againBtn", body);
  const recBtn = $("#recBtn", body), fill = $("#barFill", body), dlBox = $("#dlBox", body);
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = 720, SLIDE = 3200, TITLE = 2600;
  let slides = [], total = 0, t = 0, playing = false, raf = null, lastTs = null, alive = true;
  let recorder = null, recording = false, objectUrls = [];
  onCleanup(() => {
    alive = false; cancelAnimationFrame(raf);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    objectUrls.forEach(u => URL.revokeObjectURL(u));
  });

  // ---------- Zeichnen ----------
  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(" "); let line = ""; const lines = [];
    words.forEach(w => { const test = line ? line + " " + w : w; if (cx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; });
    lines.push(line);
    const startY = y - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => cx.fillText(l, x, startY + i * lh));
  }
  function drawTitle(s, p) {
    cx.fillStyle = s.bg; cx.fillRect(0, 0, W, W);
    cx.save();
    cx.fillStyle = "rgba(27,16,48,.12)";
    for (let y = 9; y < W; y += 18) for (let x = 9; x < W; x += 18) { cx.beginPath(); cx.arc(x, y, 2, 0, 7); cx.fill(); }
    const k = reduce ? 1 : Math.min(1, p * 4);
    cx.translate(W / 2, W / 2); cx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); cx.rotate((reduce ? 0 : (1 - k) * -0.08) - 0.03);
    cx.globalAlpha = k;
    cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.font = "120px system-ui, sans-serif"; cx.fillText(s.emoji || "", 0, -150);
    cx.fillStyle = "#1b1030";
    let fs = 60;
    const setF = () => { cx.font = fs + "px Bungee, 'Arial Black', sans-serif"; };
    setF();
    while (fs > 26 && Math.max(...s.title.split(" ").map(w => cx.measureText(w).width)) > 600) { fs -= 4; setF(); }
    wrapText(s.title, 0, 10, 600, fs * 1.15);
    cx.font = "700 30px Figtree, system-ui, sans-serif"; cx.fillText(s.sub, 0, 170);
    cx.restore();
  }
  function drawImg(s, p) {
    cx.fillStyle = s.bg; cx.fillRect(0, 0, W, W);
    const pop = reduce ? 1 : Math.min(1, p * 5);
    const box = 560, bx = (W - box) / 2, by = 46;
    cx.save();
    cx.translate(W / 2, by + box / 2); cx.rotate(s.tilt * pop); cx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop); cx.translate(-W / 2, -(by + box / 2));
    cx.fillStyle = "#1b1030"; cx.fillRect(bx + 12, by + 12, box, box);
    cx.fillStyle = "#fffaf0"; cx.fillRect(bx, by, box, box);
    cx.save(); cx.beginPath(); cx.rect(bx + 14, by + 14, box - 28, box - 28); cx.clip();
    const im = s.img, inner = box - 28;
    const z = reduce ? 1 : 1 + 0.12 * p;
    const sc = Math.max(inner / im.width, inner / im.height) * z;
    const dw = im.width * sc, dh = im.height * sc;
    cx.drawImage(im, bx + 14 + (inner - dw) / 2 + (reduce ? 0 : s.pan * 20 * p), by + 14 + (inner - dh) / 2, dw, dh);
    cx.restore();
    cx.lineWidth = 6; cx.strokeStyle = "#1b1030"; cx.strokeRect(bx, by, box, box);
    cx.restore();
    cx.globalAlpha = Math.min(1, p * 4);
    cx.fillStyle = "#1b1030"; cx.fillRect(0, W - 100, W, 100);
    cx.textAlign = "left"; cx.textBaseline = "middle";
    cx.fillStyle = "#ffcc1a"; cx.font = "30px Bungee, 'Arial Black', sans-serif";
    cx.fillText(s.name, 28, W - 66);
    cx.fillStyle = "#fffaf0"; cx.font = "600 24px Figtree, system-ui, sans-serif";
    cx.fillText(s.label, 28, W - 30);
    cx.globalAlpha = 1;
  }
  function frame(time) {
    let acc = 0, i = 0;
    while (i < slides.length - 1 && time >= acc + slides[i].dur) { acc += slides[i].dur; i++; }
    const s = slides[i], p = Math.min(1, (time - acc) / s.dur);
    if (s.type === "img") drawImg(s, p); else drawTitle(s, p);
    fill.style.width = (100 * Math.min(1, time / total)) + "%";
  }

  // ---------- Abspielen ----------
  function loop(ts) {
    if (!alive) return;
    if (lastTs != null) t += ts - lastTs;
    lastTs = ts;
    if (t >= total) {
      t = total; playing = false; frame(total - 1);
      playBtn.textContent = "▶ Nochmal";
      if (recording) finishRecording();
      return;
    }
    frame(t);
    if (playing) raf = requestAnimationFrame(loop);
  }
  function play() {
    if (!slides.length) return;
    if (t >= total) t = 0;
    playing = true; lastTs = null; playBtn.textContent = "⏸ Pause";
    raf = requestAnimationFrame(loop);
  }
  function pause() { playing = false; cancelAnimationFrame(raf); playBtn.textContent = "▶ Weiter"; }
  playBtn.addEventListener("click", () => { if (!recording) (playing ? pause() : play()); });
  againBtn.addEventListener("click", () => { if (recording) return; cancelAnimationFrame(raf); t = 0; play(); });

  // ---------- Als Datei speichern (nimmt das Video in Echtzeit auf) ----------
  function pickMime() {
    if (!window.MediaRecorder) return null;
    const options = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return options.find(m => MediaRecorder.isTypeSupported(m)) || null;
  }
  const mime = pickMime();
  if (!mime || !cv.captureStream) recBtn.hidden = true;

  recBtn.addEventListener("click", () => {
    if (recording || !slides.length) return;
    const stream = cv.captureStream(30);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(tr => tr.stop());
      if (!alive) return;
      const type = mime.split(";")[0];
      const ext = type === "video/mp4" ? "mp4" : "webm";
      const blob = new Blob(chunks, { type });
      offerDownload(blob, "Brunchies-2026." + ext);
    };
    recording = true;
    recBtn.disabled = true; playBtn.disabled = true; againBtn.disabled = true;
    recBtn.textContent = "⏺ Nehme auf … (" + Math.round(total / 1000) + " s)";
    setFeedback(fb, "Das Video wird aufgenommen. Lass den Bildschirm an und die App offen.");
    dlBox.hidden = true; dlBox.innerHTML = "";
    cancelAnimationFrame(raf); t = 0;
    recorder.start(500);
    play();
  });

  function finishRecording() {
    recording = false;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recBtn.disabled = false; playBtn.disabled = false; againBtn.disabled = false;
    recBtn.textContent = "⬇️ Als Video-Datei speichern";
  }

  function offerDownload(blob, filename) {
    const url = URL.createObjectURL(blob); objectUrls.push(url);
    dlBox.hidden = false;
    dlBox.innerHTML = "";
    const file = new File([blob], filename, { type: blob.type });
    // Auf dem Handy: Teilen-Menü (dort "Video sichern" oder an WhatsApp schicken)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      const share = document.createElement("button");
      share.type = "button"; share.className = "btn"; share.textContent = "📤 Video teilen oder sichern";
      share.addEventListener("click", () => navigator.share({ files: [file], title: "Brunchies 2026" }).catch(() => {}));
      dlBox.append(share);
    }
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.className = "btn ghost dl"; a.textContent = "⬇️ " + filename + " herunterladen";
    dlBox.append(a);
    setFeedback(fb, "Fertig! Dein Video ist bereit (" + (blob.size / 1e6).toFixed(1) + " MB).", "yes");
  }

  // ---------- Bilder laden und Folien bauen ----------
  function assemble(items) {
    slides = [{ type: "title", dur: TITLE, bg: "#ffcc1a", emoji: "🥂", title: "Brunchies 2026", sub: items.length + " Momente von euch" }];
    let lastDay = null;
    items.forEach((it, i) => {
      if (it.day !== lastDay) {
        slides.push({ type: "title", dur: 1800, bg: colorFor(it.day), emoji: it.emoji, title: it.short || "Challenge", sub: it.day + ". Dezember" });
        lastDay = it.day;
      }
      slides.push({ type: "img", dur: SLIDE, bg: colorFor(it.day + i + 1), img: it.img, name: it.name,
        label: it.day + ". Dez · " + (it.short || ""), tilt: (i % 2 ? 1 : -1) * 0.035, pan: i % 2 ? 1 : -1 });
    });
    slides.push({ type: "title", dur: TITLE + 600, bg: "#ff3ea5", emoji: "🎄", title: "Frohe Weihnachten, Brunchies!", sub: "Wir sehen uns beim nächsten Brunch 🥞" });
    total = slides.reduce((a, s) => a + s.dur, 0);
    t = 0; frame(0);
  }

  async function loadImage(url) {
    // Erst als Datei holen, damit das Video später gespeichert werden darf
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const u = URL.createObjectURL(blob); objectUrls.push(u);
      return await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = u; });
    } catch (e) { return null; }
  }

  (async () => {
    try { await document.fonts.ready; } catch (e) { /* egal */ }
    const { data: rows, error } = await sb.from("posts")
      .select("day, user_id, path, created_at, profiles(name), doors(short, emoji)")
      .order("day").order("created_at");
    if (!alive) return;
    if (error) { setFeedback(fb, "Die Bilder lassen sich gerade nicht laden.", "no"); return; }
    if (!rows.length) { setFeedback(fb, "Noch keine Fotos oder Zeichnungen gepostet. 🥲"); return; }
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(rows.map(r => r.path), 60 * 60);
    const urlFor = {};
    (signed || []).forEach(s => { if (s.signedUrl) urlFor[s.path] = s.signedUrl; });
    let done = 0;
    const imgs = await Promise.all(rows.map(async r => {
      const im = urlFor[r.path] ? await loadImage(urlFor[r.path]) : null;
      done++; if (alive) setFeedback(fb, "Lädt Bilder … " + done + " / " + rows.length);
      return im;
    }));
    if (!alive) return;
    const items = rows.map((r, k) => ({
      day: r.day, img: imgs[k],
      name: r.profiles ? r.profiles.name : "Jemand", // echte Namen, weil das Video geteilt wird
      short: r.doors ? r.doors.short : "", emoji: r.doors ? r.doors.emoji : "",
    })).filter(i => i.img);
    if (!items.length) { setFeedback(fb, "Die Bilder lassen sich gerade nicht laden.", "no"); return; }
    assemble(items);
    playBtn.disabled = false; againBtn.disabled = false; recBtn.disabled = false;
    setFeedback(fb, items.length + (items.length === 1 ? " Bild" : " Bilder") + " von euch. Viel Spaß!", "yes");
  })();
}

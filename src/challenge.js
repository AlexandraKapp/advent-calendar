import { sb, BUCKET } from "./supabase.js";
import { state } from "./state.js";
import { loadReactions, reactionBar } from "./reactions.js";
import { $, esc, plural, setFeedback, friendlyError, onCleanup } from "./ui.js";
import { shrinkImage, exportCanvas } from "./images.js";
import { isPersonal, showTask, targetsFor } from "./person.js";

export function buildChallenge({ day, door, body, overview }) {
  // foto: nur Foto · zeichnen: nur Zeichnen mit Countdown · frei: Foto, Zeichnen (ohne Countdown) oder Text
  const isFree = door.kind === "frei";
  const personal = isPersonal(door.question);
  const secs = door.kind === "zeichnen" ? (door.seconds || 30) : 0;
  let mode = door.kind === "zeichnen" ? "draw" : "foto";

  const fotoHtml =
    '<div data-mode="foto"><label class="btn upload" for="photo">📸 Foto machen oder auswählen</label><input type="file" id="photo" accept="image/*" class="sr">' +
    '<img id="photoPrev" class="prev" alt="Deine Vorschau" hidden></div>';
  const drawHtml =
    '<div data-mode="draw" class="stack"><div class="pad-wrap"><canvas id="pad" width="800" height="800" aria-label="Zeichenfläche"></canvas><span class="timer" id="timer">' + secs + " s</span></div>" +
    '<div class="tools" id="tools"></div>' +
    (secs ? '<p class="small">Der Countdown startet mit deinem ersten Strich.</p>' : "") +
    '<button class="btn ghost" id="clearBtn" type="button">Nochmal von vorn</button></div>';
  const textHtml =
    '<div data-mode="text" class="stack"><label for="cardText" class="sr">Dein Text</label>' +
    '<textarea id="cardText" maxlength="160" placeholder="Dein Text …"></textarea>' +
    '<canvas id="card" width="800" height="800" hidden aria-hidden="true"></canvas></div>';

  body.innerHTML =
    '<div class="emoji small">' + esc(door.emoji) + "</div>" +
    '<p class="question" id="task"></p>' +
    '<div id="maker" class="stack">' +
      (isFree ? '<div class="modes" role="tablist">' +
        '<button type="button" class="on" data-pick="foto">📸 Foto</button>' +
        '<button type="button" data-pick="draw">✏️ Zeichnen</button>' +
        '<button type="button" data-pick="text">Aa Text</button></div>' : "") +
      (door.kind === "zeichnen" ? drawHtml : door.kind === "foto" ? fotoHtml : fotoHtml + drawHtml + textHtml) +
      '<button class="btn" id="postBtn" type="button"' + (door.kind === "foto" ? " hidden" : "") + ">Posten</button>" +
    "</div>" +
    '<p class="feedback" id="feedback" aria-live="polite"></p>' +
    '<div class="gallery-head"><h3>Galerie</h3><span id="gcount"></span></div>' +
    '<div class="gallery" id="gallery"><p class="note">Lädt …</p></div>';

  const fb = $("#feedback", body);

  showTask($("#task", body), day, door.question || "");
  const maker = $("#maker", body);
  // Frühere Tage: nur noch ansehen und reagieren (die Datenbank lässt auch nichts mehr hochladen)
  const over = !!overview.is_revealed && !(state.isAdmin && state.preview); // Admin nur in der Vorschau
  if (over) {
    maker.hidden = true;
    maker.insertAdjacentHTML("afterend", '<p class="note-inline">Dieser Tag ist vorbei. Mitmachen geht nicht mehr, aber du kannst dir alles ansehen und reagieren.</p>');
  }
  const postBtn = $("#postBtn", body);
  let pending = null; // Blob, der hochgeladen wird (Foto)
  let pad = null;

  // Umschalten zwischen Foto / Zeichnen / Text (nur Kreativ-Challenge)
  function showMode(m) {
    mode = m;
    maker.querySelectorAll("[data-mode]").forEach(el => { el.hidden = el.dataset.mode !== m; });
    maker.querySelectorAll("[data-pick]").forEach(b => b.classList.toggle("on", b.dataset.pick === m));
    setFeedback(fb, "");
  }
  if (isFree) {
    maker.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => showMode(b.dataset.pick)));
    showMode("foto");
  }

  if ($("#pad", body)) pad = setupPad(body, secs);
  if ($("#photo", body)) {
    const input = $("#photo", body), prev = $("#photoPrev", body);
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      setFeedback(fb, "Bild wird vorbereitet …");
      try {
        pending = await shrinkImage(f);
        if (prev.src) URL.revokeObjectURL(prev.src);
        prev.src = URL.createObjectURL(pending); prev.hidden = false; postBtn.hidden = false;
        setFeedback(fb, "");
      } catch (e) {
        setFeedback(fb, "Das Bild konnte nicht geladen werden. Probier ein anderes.", "no");
      }
    });
  }
  if ($("#cardText", body)) {
    const ta = $("#cardText", body), card = $("#card", body);
    const redraw = () => drawTextCard(card, ta.value, day);
    ta.addEventListener("input", redraw);
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(redraw);
  }

  postBtn.addEventListener("click", async () => {
    if (mode === "draw") pending = pad.isDirty() ? await exportCanvas($("#pad", body)) : null;
    if (mode === "text") pending = $("#cardText", body).value.trim() ? await exportCanvas($("#card", body)) : null;
    if (!pending) { setFeedback(fb, mode === "draw" ? "Erst zeichnen!" : mode === "text" ? "Erst etwas schreiben!" : "Erst ein Foto auswählen.", "no"); return; }
    postBtn.disabled = true; postBtn.textContent = "Wird gepostet …";
    const path = day + "/" + state.userId + "/" + crypto.randomUUID() + ".jpg";
    const up = await sb.storage.from(BUCKET).upload(path, pending, { contentType: "image/jpeg", upsert: false });
    let error = up.error;
    if (!error) {
      const ins = await sb.from("posts").insert({ day, user_id: state.userId, path });
      error = ins.error;
      if (error) await sb.storage.from(BUCKET).remove([path]); // aufräumen
    }
    postBtn.disabled = false; postBtn.textContent = "Posten";
    if (error) {
      setFeedback(fb, /duplicate|unique/i.test(error.message || "")
        ? "Du hast hier schon etwas gepostet. Lösch es zuerst, wenn du es ersetzen willst."
        : friendlyError(error), "no");
      return;
    }
    pending = null;
    setFeedback(fb, "Gepostet! 🎉 Jetzt siehst du, was die anderen gemacht haben.", "yes");
    loadGallery();
  });

  // ---------- Galerie ----------
  const gal = $("#gallery", body);
  const gcount = $("#gcount", body);

  async function loadGallery() {
    const { data: rows, error } = await sb.from("posts")
      .select("id, day, user_id, path, created_at, profiles(name)")
      .eq("day", day).order("created_at");
    // Bei persönlichen Aufgaben: wer wen gezogen hat
    const targetOf = personal ? await targetsFor(day) : {};
    if (error) { gal.innerHTML = '<p class="note">Die Galerie lässt sich gerade nicht laden.</p>'; return; }
    const mine = rows.find(r => r.user_id === state.userId);
    maker.hidden = !!mine || over; // eigener Beitrag da oder Tag vorbei: Werkzeuge ausblenden
    if (!mine && !state.isAdmin && !overview.is_revealed && !(state.overview[24] && state.overview[24].is_open)) {
      const n = overview.count || 0;
      gcount.textContent = n ? plural(n, "Beitrag", "Beiträge") : "";
      gal.innerHTML = '<p class="note locked-gal">' + (n
        ? plural(n, "Beitrag wartet", "Beiträge warten") + ". Poste zuerst selbst, dann siehst du alle."
        : "Noch keine Beiträge. Sei die oder der Erste!") + "</p>";
      return;
    }
    gcount.textContent = rows.length ? plural(rows.length, "Beitrag", "Beiträge") : "";
    if (!rows.length) { gal.innerHTML = '<p class="note">Noch keine Beiträge. Sei die oder der Erste!</p>'; return; }

    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(rows.map(r => r.path), 60 * 60);
    const reactMap = await loadReactions(day);
    const urlFor = {};
    (signed || []).forEach(s => { if (s.signedUrl) urlFor[s.path] = s.signedUrl; });

    gal.innerHTML = "";
    rows.forEach(r => {
      const fig = document.createElement("figure");
      const im = document.createElement("img");
      im.src = urlFor[r.path] || ""; im.alt = "Beitrag von " + (r.profiles ? r.profiles.name : "jemandem"); im.loading = "lazy";
      const cap = document.createElement("figcaption");
      cap.textContent = (r.user_id === state.userId ? "Du" : (r.profiles ? r.profiles.name : "Jemand")) +
        (targetOf[r.user_id] ? " → " + targetOf[r.user_id] : "");
      fig.append(im, cap, reactionBar(day, r.user_id, r.id, reactMap));
      if (r.user_id === state.userId || state.isAdmin) {
        const del = document.createElement("button");
        del.className = "del"; del.type = "button"; del.textContent = "Löschen";
        del.setAttribute("aria-label", "Beitrag löschen");
        del.addEventListener("click", async () => {
          if (!confirm("Diesen Beitrag wirklich löschen?")) return;
          del.disabled = true;
          const { error: e1 } = await sb.from("posts").delete().eq("id", r.id);
          if (e1) { del.disabled = false; del.textContent = "Ging nicht"; return; }
          await sb.storage.from(BUCKET).remove([r.path]);
          if (r.user_id === state.userId) { overview.count = Math.max(0, (overview.count || 1) - 1); }
          setFeedback(fb, "Gelöscht.");
          loadGallery();
        });
        fig.append(del);
      }
      gal.append(fig);
    });
  }

  loadGallery();
}

// ---------- Zeichenfläche mit Countdown ----------
function setupPad(body, secs) {
  const cv = $("#pad", body);
  const cx = cv.getContext("2d");
  const timerEl = $("#timer", body);
  const tools = $("#tools", body);
  const pens = ["#1b1030", "#ff3ea5", "#00bfc4", "#ffcc1a", "#3ddc84", "#7b4dff"];
  let color = pens[0], drawing = false, last = null, started = false, over = false, left = secs, iv = null, dirty = false;

  function clear() { cx.fillStyle = "#fffaf0"; cx.fillRect(0, 0, cv.width, cv.height); }
  clear();
  pens.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pen" + (i === 0 ? " on" : ""); b.style.background = p;
    b.setAttribute("aria-label", "Farbe " + (i + 1));
    b.addEventListener("click", () => { color = p; tools.querySelectorAll(".pen").forEach(x => x.classList.remove("on")); b.classList.add("on"); });
    tools.append(b);
  });

  if (!secs) timerEl.hidden = true;
  function startTimer() {
    if (started) return; started = true;
    if (!secs) return; // Kreativ-Challenge: ohne Countdown
    iv = setInterval(() => {
      left--; timerEl.textContent = left + " s";
      if (left <= 3) timerEl.classList.add("hot");
      if (left <= 0) { clearInterval(iv); over = true; drawing = false; timerEl.textContent = "Zeit um! ⏰"; cv.classList.add("done"); }
    }, 1000);
  }
  function pos(e) {
    const rc = cv.getBoundingClientRect();
    return { x: (e.clientX - rc.left) * cv.width / rc.width, y: (e.clientY - rc.top) * cv.height / rc.height };
  }
  cv.addEventListener("pointerdown", e => {
    if (over) return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    drawing = true; last = pos(e); startTimer(); dirty = true;
    cx.fillStyle = color; cx.beginPath(); cx.arc(last.x, last.y, 5, 0, Math.PI * 2); cx.fill();
  });
  cv.addEventListener("pointermove", e => {
    if (!drawing || over) return;
    const p = pos(e);
    cx.strokeStyle = color; cx.lineWidth = 11; cx.lineCap = "round"; cx.lineJoin = "round";
    cx.beginPath(); cx.moveTo(last.x, last.y); cx.lineTo(p.x, p.y); cx.stroke();
    last = p;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => cv.addEventListener(t, () => { drawing = false; }));
  $("#clearBtn", body).addEventListener("click", () => {
    clearInterval(iv); clear(); started = false; over = false; left = secs; dirty = false;
    timerEl.textContent = left + " s"; timerEl.classList.remove("hot"); cv.classList.remove("done");
  });
  onCleanup(() => clearInterval(iv));
  return { isDirty: () => dirty };
}

// ---------- Text als gestaltete Karte ----------
const CARD_COLORS = ["#ff3ea5", "#00bfc4", "#ffcc1a", "#3ddc84", "#9d7bff", "#ff7a1a"];
function drawTextCard(cv, text, day) {
  const cx = cv.getContext("2d"), W = cv.width, pad = 70;
  cx.fillStyle = CARD_COLORS[day % CARD_COLORS.length]; cx.fillRect(0, 0, W, W);
  cx.fillStyle = "rgba(255,255,255,.25)";
  for (let y = 20; y < W; y += 40) for (let x = (y / 40) % 2 ? 20 : 40; x < W; x += 40) cx.fillRect(x, y, 4, 4);
  cx.fillStyle = "#fffaf0"; cx.strokeStyle = "#1b1030"; cx.lineWidth = 10;
  cx.beginPath(); cx.roundRect(40, 40, W - 80, W - 80, 30); cx.fill(); cx.stroke();
  const t = (text || "").trim() || "Dein Text …";
  cx.fillStyle = (text || "").trim() ? "#1b1030" : "rgba(27,16,48,.35)";
  cx.textAlign = "center"; cx.textBaseline = "middle";
  // Größte Schrift suchen, bei der alles passt
  let size = 96, lines;
  for (; size >= 28; size -= 4) {
    cx.font = "800 " + size + "px Figtree, system-ui, sans-serif";
    lines = wrap(cx, t, W - 2 * pad - 40);
    if (lines.length * size * 1.2 <= W - 2 * pad - 40) break;
  }
  const lh = size * 1.2, y0 = W / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => cx.fillText(l, W / 2, y0 + i * lh));
}
function wrap(cx, text, maxW) {
  const out = [];
  text.split("\n").forEach(par => {
    let line = "";
    par.split(/\s+/).forEach(w => {
      const test = line ? line + " " + w : w;
      if (cx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    });
    out.push(line);
  });
  return out;
}

// Kleine Helfer, die überall gebraucht werden.

export const COLORS = ["#ff3ea5", "#ffcc1a", "#00bfc4", "#ff7a1a", "#3ddc84", "#9d7bff"];
export const TILTS = [-3, 2, -1.5, 3, -2.5, 1, 2.5, -1, 1.5, -3.5];
export const colorFor = day => COLORS[day % COLORS.length];

export const KIND_LABEL = {
  emoji: "Emoji-Rätsel", wort: "Worträtsel", aufgabe: "Emoji-Challenge", frage: "Frage", meme: "Caption this", schaetzen: "Schätzfrage", spiel: "Mini-Spiel", raten: "Wer ist das?", foto: "Foto-Challenge", frei: "Kreativ-Challenge",
  zeichnen: "Zeichen-Challenge", rueckblick: "Rückblick",
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

// ---------- Toast ----------
let toastTimer = null;
export function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Popup (Windows-95-Fenster) ----------
const backdrop = $("#backdrop");
const card = $("#card");
let lastFocus = null;
let cleanups = [];
let onCloseCb = null;

export function onCleanup(fn) { cleanups.push(fn); }
export function dialogIsOpen() { return backdrop.classList.contains("open"); }

export function closeDialog() {
  if (!dialogIsOpen()) return;
  cleanups.forEach(fn => { try { fn(); } catch (e) { /* egal */ } });
  cleanups = [];
  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");
  card.innerHTML = "";
  if (lastFocus) lastFocus.focus();
  const cb = onCloseCb; onCloseCb = null;
  if (cb) cb();
}

/** Öffnet das Popup und gibt den Inhaltsbereich zurück. */
export function openDialog({ title, chip = "", color = "#ff3ea5", onClose = null }) {
  if (dialogIsOpen()) closeDialog();
  lastFocus = document.activeElement;
  onCloseCb = onClose;
  card.style.setProperty("--c", color);
  card.innerHTML =
    '<div class="card-top"><span class="day" id="dlgDay">' + esc(title) + "</span>" +
    (chip ? '<span class="chip">' + esc(chip) + "</span>" : "") +
    '<button class="close" id="closeBtn" aria-label="Schließen">×</button></div>' +
    '<div class="card-body" id="cardBody"><p class="feedback">Lädt …</p></div>';
  $("#closeBtn", card).addEventListener("click", closeDialog);
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  $("#closeBtn", card).focus();
  return $("#cardBody", card);
}

backdrop.addEventListener("click", e => { if (e.target === backdrop) closeDialog(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDialog(); });

export function setFeedback(el, text, kind = "") {
  el.textContent = text;
  el.className = "feedback" + (kind ? " " + kind : "");
}

/** Verständliche Fehlermeldung statt Technik-Kauderwelsch. */
export function friendlyError(err) {
  const msg = (err && (err.message || err.error_description)) || "";
  if (/row-level security|violates|permission|not allowed|Unauthorized/i.test(msg))
    return "Das ist gerade nicht erlaubt (vielleicht ist die Zeit abgelaufen?).";
  if (/Failed to fetch|NetworkError|network/i.test(msg))
    return "Keine Verbindung. Bist du online?";
  if (/rate limit|too many/i.test(msg))
    return "Zu viele Versuche. Warte kurz und probier es dann nochmal.";
  if (/expired|invalid/i.test(msg))
    return "Der Code ist abgelaufen oder falsch. Fordere einen neuen an.";
  return "Das hat nicht geklappt. Versuch es gleich nochmal.";
}

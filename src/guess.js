import { sb } from "./supabase.js";
import { state } from "./state.js";
import { $, esc, plural, setFeedback, friendlyError, onCleanup } from "./ui.js";

// „Wer ist das?“: Fotos werden alle 3 Sekunden schärfer. Der Server bestimmt die Schärfe und prüft die Antwort.
export function buildGuess({ day, door, body, overview }) {
  body.innerHTML =
    '<div class="emoji small">' + esc(door.emoji || "🕵️") + "</div>" +
    '<p class="question">' + esc(door.question || "Wer ist das?") + "</p>" +
    '<div id="stage" class="stack"><p class="note">Lädt …</p></div>' +
    '<p class="feedback" id="feedback" aria-live="polite"></p>' +
    '<div id="boardBox" hidden><div class="gallery-head"><h3>Bestenliste</h3><span id="gcount"></span></div>' +
    '<ol class="answers board" id="board"></ol></div>';

  const stageEl = $("#stage", body), fb = $("#feedback", body);
  let poll = null, alive = true, total = 0, count = 0;
  onCleanup(() => { alive = false; clearInterval(poll); });

  async function init() {
    // Frühere Tage: nicht mehr spielen, aber Auflösung und Bestenliste ansehen
    if (overview && overview.is_revealed && !state.isAdmin) return showOver();
    const { data, error } = await sb.rpc("raten_status", { d: day });
    if (error) { stageEl.innerHTML = '<p class="note">Konnte nicht geladen werden.</p>'; return; }
    count = data && data[0] ? data[0].anzahl : 0;
    if (!count) { stageEl.innerHTML = '<p class="note">Hier sind noch keine Fotos drin.</p>'; return; }
    const done = new Set((data || []).filter(r => r.fertig).map(r => r.nr));
    total = (data || []).reduce((s, r) => s + (r.points || 0), 0);
    const next = [...Array(count).keys()].map(i => i + 1).find(n => !done.has(n));
    if (!next) return finished();
    stageEl.innerHTML =
      '<div class="guess-intro"><p>' + count + " Fotos. Sie werden alle 4 Sekunden schärfer. Tipp den Namen ein, sobald du die Person erkennst. " +
      "Je früher, desto mehr Punkte: <b>4</b> ganz am Anfang, <b>0</b> wenn das Bild schon scharf ist.</p><p><b>Ein Versuch pro Foto!</b></p>" +
      '<button class="btn" id="goBtn" type="button">' + (done.size ? "Weiterspielen (Foto " + next + ")" : "Los!") + "</button></div>";
    $("#goBtn", body).addEventListener("click", () => round(next));
  }

  async function round(n) {
    setFeedback(fb, "");
    const { data, error } = await sb.rpc("raten_start", { d: day, n });
    if (!alive) return;
    if (error || !data || !data[0]) { setFeedback(fb, friendlyError(error || {}), "no"); return; }
    let { stufe, bild } = data[0];
    stageEl.innerHTML =
      '<div class="guess-head"><span>Foto ' + n + " / " + count + '</span><span id="pts"></span></div>' +
      '<div class="guess-img"><img id="gImg" alt="Verschwommenes Foto"></div>' +
      '<form class="guess-form" id="gForm"><label for="gName" class="sr">Name</label>' +
      '<input type="text" id="gName" maxlength="40" autocomplete="off" autocapitalize="words" placeholder="Wer ist das?">' +
      '<button class="btn" type="submit">Tippen</button></form>';
    const img = $("#gImg", body), pts = $("#pts", body), input = $("#gName", body);
    const show = (s, src) => {
      if (src) img.src = src;
      img.className = "s" + s;
      pts.textContent = s < 5 ? "Jetzt " + plural(5 - s, "Punkt", "Punkte") : "Jetzt 0 Punkte";
    };
    show(stufe, bild);

    clearInterval(poll);
    poll = setInterval(async () => {
      if (stufe >= 5) { clearInterval(poll); return; }
      const { data: d2 } = await sb.rpc("raten_bild", { d: day, n, habe: stufe });
      if (!alive || !d2 || !d2[0]) return;
      if (d2[0].stufe !== stufe) {
        stufe = d2[0].stufe; show(stufe, d2[0].bild);
        // Scharf = keine Punkte mehr: Runde automatisch beenden, Lösung zeigen
        if (stufe >= 5) tipp(n, "", $("#gForm", body));
      }
    }, 700);

    const form = $("#gForm", body);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) { input.focus(); return; }
      tipp(n, t, form);
    });
    input.focus();
    if (stufe >= 5) tipp(n, "", form); // schon scharf (z. B. nach langer Pause): gleich auflösen
  }

  async function tipp(n, name, form) {
    clearInterval(poll);
    const ctrls = [...form.querySelectorAll("input, button")];
    ctrls.forEach(c => { c.disabled = true; });
    const { data, error } = await sb.rpc("raten_tipp", { d: day, n, t: name });
    if (!alive) return;
    if (error || !data || !data[0]) { setFeedback(fb, friendlyError(error || {}), "no"); ctrls.forEach(c => { c.disabled = false; }); return; }
    const r = data[0];
    total = r.gesamt;
    const img = $("#gImg", body);
    img.src = r.bild; img.className = "s5"; img.alt = r.solution;
    form.classList.add(r.correct ? "right" : "wrong");
    if (!name) form.hidden = true; // automatisch aufgelöst: leeres Feld ausblenden
    $("#pts", body).textContent = "";
    setFeedback(fb, r.correct ? (r.points ? "Richtig! +" + plural(r.points, "Punkt", "Punkte") : "Richtig, aber zu spät: 0 Punkte") : (name ? "Leider nein. " : "Zu spät! ") + "Das ist " + r.solution + ".", r.correct ? "yes" : "no");
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn"; nextBtn.type = "button";
    nextBtn.textContent = n < count ? "Nächstes Foto" : "Ergebnis";
    nextBtn.addEventListener("click", () => (n < count ? round(n + 1) : finished()));
    stageEl.append(nextBtn);
  }

  async function showOver() {
    const { data } = await sb.rpc("raten_aufloesung", { d: day });
    stageEl.innerHTML = '<p class="note-inline">Dieser Tag ist vorbei. Mitmachen geht nicht mehr, aber du kannst dir alles ansehen.</p>' +
      '<div class="guess-solved">' + (data || []).map(r =>
        '<figure><img src="' + esc(r.bild) + '" alt=""><figcaption>' + esc(r.solution) + "</figcaption></figure>").join("") + "</div>";
    loadBoard();
  }

  async function finished() {
    setFeedback(fb, "");
    stageEl.innerHTML = '<div class="guess-intro"><p>Fertig! Du hast</p><p class="big-score">' + plural(total, "Punkt", "Punkte") + "</p></div>";
    if (state.isAdmin) {
      const reset = document.createElement("button");
      reset.className = "linkbtn"; reset.type = "button"; reset.textContent = "Meinen Spielstand zurücksetzen (nur Admin, zum Testen)";
      reset.addEventListener("click", async () => { await sb.rpc("raten_reset", { d: day }); init(); $("#boardBox", body).hidden = true; });
      stageEl.append(reset);
    }
    loadBoard();
  }

  async function loadBoard() {
    const { data, error } = await sb.rpc("get_answers", { d: day });
    if (error || !alive) return;
    const rows = (data || []).map(r => ({ ...r, pts: parseInt(r.answer, 10) || 0 })).sort((a, b) => b.pts - a.pts);
    const board = $("#board", body);
    $("#gcount", body).textContent = plural(rows.length, "Person", "Personen");
    board.innerHTML = "";
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      li.innerHTML = '<b class="rank">' + (["🥇", "🥈", "🥉"][i] || (i + 1) + ".") + "</b><span>" + esc(r.is_me ? "Du" : r.name) + "</span><i>" + r.pts + "</i>";
      if (r.is_me) li.classList.add("me");
      board.append(li);
    });
    $("#boardBox", body).hidden = false;
  }

  init();
}

import { sb } from "./supabase.js";
import { state } from "./state.js";
import { $, esc, plural, setFeedback, friendlyError } from "./ui.js";

export async function buildRiddle({ day, door, body, overview }) {
  const revealed = !!overview.is_revealed;
  // Admin-Vorschau: Lösung schon vorher zeigen
  const showSolution = revealed || (state.isAdmin && state.preview);

  body.innerHTML =
    (door.kind === "wort"
      ? '<p class="question">' + esc(door.question) + "</p>"
      : '<div class="emoji" aria-label="Emoji-Rätsel">' + esc(door.emoji) + "</div>" +
        '<p class="ask">' + esc(door.question || "Welcher Film, welche Serie?") + "</p>") +
    '<p class="solution" id="solution" hidden></p>' +
    (revealed ? "" :
      '<form id="answerForm"><label for="answer" class="sr">Deine Antwort</label>' +
      '<input type="text" id="answer" maxlength="120" autocomplete="off" placeholder="Deine Antwort">' +
      '<button class="btn" type="submit" id="sendBtn">Abschicken</button></form>' +
      '<p class="note-inline">Die Lösung gibt es morgen um 0:00. Bis dahin kannst du deine Antwort noch ändern.</p>') +
    '<p class="feedback" id="feedback" aria-live="polite"></p>' +
    '<div class="gallery-head"><h3>Antworten</h3><span id="gcount"></span></div>' +
    '<ul class="answers" id="answers"><li class="note">Lädt …</li></ul>';

  const fb = $("#feedback", body);
  const list = $("#answers", body);
  const gcount = $("#gcount", body);
  const input = $("#answer", body);
  let totalCount = overview.count || 0;

  if (showSolution) {
    const { data: sol } = await sb.from("door_solutions").select("solution").eq("day", day).maybeSingle();
    if (sol && sol.solution) {
      const el = $("#solution", body);
      el.innerHTML = (revealed ? "" : "👀 Nur in der Vorschau: ") + "Lösung: <b>" + esc(sol.solution) + "</b>";
      el.hidden = false;
      if (!revealed) el.className = "hint";
    }
  }

  async function load() {
    const { data, error } = await sb.rpc("get_answers", { d: day });
    if (error) { list.innerHTML = '<li class="note">Die Antworten lassen sich gerade nicht laden.</li>'; return; }
    paint(data || []);
  }

  function paint(rows) {
    const mine = rows.find(r => r.is_me);
    if (input && mine && !input.value) input.value = mine.answer;
    const canSeeAll = mine || revealed || state.isAdmin;
    const count = canSeeAll ? rows.length : totalCount;
    gcount.textContent = count ? plural(count, "Antwort", "Antworten") : "";
    list.innerHTML = "";

    if (!canSeeAll) {
      list.innerHTML = '<li class="note locked-gal">🙈 ' + (totalCount
        ? plural(totalCount, "Antwort wartet", "Antworten warten") + ". Tipp erst selbst etwas ein."
        : "Noch keine Antworten. Sei die oder der Erste!") + "</li>";
      return;
    }
    if (!rows.length) { list.innerHTML = '<li class="note">Niemand hat geantwortet.</li>'; return; }

    // Eigene Antwort zuerst
    rows.sort((a, b) => (b.is_me ? 1 : 0) - (a.is_me ? 1 : 0));
    rows.forEach(r => {
      const li = document.createElement("li");
      const marked = r.correct !== null && r.correct !== undefined;
      if (marked) li.className = r.correct ? "right" : "wrong";
      const who = document.createElement("b");
      who.textContent = r.is_me ? "Du" : r.name;
      const txt = document.createElement("span"); txt.textContent = r.answer;
      li.append(who, txt);
      if (marked) {
        const m = document.createElement("i");
        m.textContent = r.correct ? "✔" : "✘";
        m.setAttribute("aria-label", r.correct ? "richtig" : "falsch");
        li.append(m);
      }
      if (state.isAdmin) { li.classList.add("has-adm"); li.append(adminControls(r)); }
      list.append(li);
    });
  }

  // Admin: Bewertung von Hand überschreiben oder Antwort löschen
  function adminControls(r) {
    {
      const box = document.createElement("span");
      box.className = "adm";
      const mk = (label, val, title) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = label; b.title = title;
        if (r.override === val) b.classList.add("on");
        b.addEventListener("click", async () => {
          const { error } = await sb.from("answers").update({ override: val }).eq("day", day).eq("user_id", r.user_id);
          if (error) setFeedback(fb, friendlyError(error), "no"); else load();
        });
        return b;
      };
      box.append(mk("✔", true, "Von Hand richtig"), mk("✘", false, "Von Hand falsch"), mk("auto", null, "Automatisch prüfen"));
      const del = document.createElement("button");
      del.type = "button"; del.textContent = "🗑"; del.title = "Antwort löschen";
      del.addEventListener("click", async () => {
        if (!confirm("Antwort von " + r.name + " löschen?")) return;
        const { error } = await sb.from("answers").delete().eq("day", day).eq("user_id", r.user_id);
        if (error) setFeedback(fb, friendlyError(error), "no"); else load();
      });
      box.append(del);
      return box;
    }
  }

  if (input) {
    $("#answerForm", body).addEventListener("submit", async e => {
      e.preventDefault();
      const val = input.value.trim().slice(0, 120);
      if (!val) { setFeedback(fb, "Tipp erst eine Antwort ein.", "no"); return; }
      const btn = $("#sendBtn", body); btn.disabled = true;
      const { error } = await sb.from("answers").upsert({ day, user_id: state.userId, answer: val }, { onConflict: "day,user_id" });
      btn.disabled = false;
      if (error) { setFeedback(fb, friendlyError(error), "no"); return; }
      setFeedback(fb, "Abgeschickt! Morgen siehst du, wer richtig lag.", "yes");
      load();
    });
    if (!state.isAdmin || !state.preview) input.focus();
  }

  load();
}

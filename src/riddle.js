import { sb } from "./supabase.js";
import { state } from "./state.js";
import { $, esc, plural, setFeedback, friendlyError } from "./ui.js";
import { isPersonal, showTask, targetsFor, emojiCount } from "./person.js";
import { hasReactions, loadReactions, reactionBar } from "./reactions.js";

export async function buildRiddle({ day, door, body, overview }) {
  const revealed = !!overview.is_revealed;
  // Ohne Lösung und ohne ✔/✘: „aufgabe“ = genau 3 Emojis, „frage“ = freier Text,
  // „meme“ = Bildunterschrift zu einem Foto (Foto im geschützten Speicher „tuerchen“)
  const isTask = door.kind === "aufgabe" || door.kind === "frage" || door.kind === "meme";
  const isMeme = door.kind === "meme";
  const isEmojiTask = door.kind === "aufgabe";
  // Schätzfrage: Antwort ist eine Zahl; wer am nächsten dran ist, steht oben.
  // Für alle gilt: ein Versuch. Nach dem Abschicken kommen sofort Lösung und Antworten der anderen.
  const isGuess = door.kind === "schaetzen";
  let target = null;
  const personal = isPersonal(door.question);

  body.innerHTML =
    (isMeme
      ? '<p class="question" id="task"></p><figure class="meme" id="memeMain"><img id="memeImg" alt="Foto zum Beschriften"></figure>'
      : isTask
      ? '<div class="emoji small">' + esc(door.emoji) + '</div><p class="question" id="task"></p>'
      : door.kind === "wort" || isGuess
      ? (isGuess ? '<div class="emoji small">' + esc(door.emoji) + "</div>" : "") + '<p class="question">' + esc(door.question) + "</p>"
      : '<div class="emoji" aria-label="Emoji-Rätsel">' + esc(door.emoji) + "</div>" +
        '<p class="ask">' + esc(door.question || "Welcher Film, welche Serie?") + "</p>") +
    '<p class="solution" id="solution" hidden></p>' +
    (revealed ? '<p class="note-inline" id="overNote">Dieser Tag ist vorbei. Mitmachen geht nicht mehr, aber du kannst dir alles ansehen und reagieren.</p>' :
      '<form id="answerForm"><label for="answer" class="sr">Deine Antwort</label>' +
      (door.kind === "frage"
        ? '<textarea id="answer" maxlength="300" rows="3" placeholder="Deine Antwort"></textarea>'
        : '<input type="text" id="answer" maxlength="120" autocomplete="off" placeholder="' + (isEmojiTask ? "Deine 3 Emojis" : isMeme ? "Deine Caption" : isGuess ? "Deine Schätzung (Zahl)" : "Deine Antwort") + '"' + (isEmojiTask ? ' class="emoji-input"' : isGuess ? ' inputmode="decimal"' : "") + ">") +
      '<button class="btn" type="submit" id="sendBtn">Abschicken</button></form>' +
      '<p class="note-inline" id="onceNote">Du hast einen Versuch. ' + (isTask ? "Danach siehst du die Antworten der anderen." : isGuess ? "Danach siehst du die richtige Zahl und die Schätzungen der anderen." : "Danach siehst du die Lösung und die Antworten der anderen.") + "</p>") +
    '<p class="feedback" id="feedback" aria-live="polite"></p>' +
    '<div class="gallery-head"><h3>' + (isMeme ? "Captions" : isGuess ? "Schätzungen" : "Antworten") + '</h3><span id="gcount"></span></div>' +
    '<ul class="answers" id="answers"><li class="note">Lädt …</li></ul>';

  const fb = $("#feedback", body);
  const list = $("#answers", body);
  const gcount = $("#gcount", body);
  const input = $("#answer", body);
  let totalCount = overview.count || 0;
  let targetOf = {};
  let reactMap = {};
  if (isTask) showTask($("#task", body), day, door.question || (isMeme ? "Caption this!" : ""));

  // Meme: Foto einmal oben anzeigen; die Captions stehen als Text in der Liste darunter
  if (isMeme) {
    const { data: img } = await sb.storage.from("tuerchen").createSignedUrl(day + ".jpg", 60 * 60 * 3);
    if (img) $("#memeImg", body).src = img.signedUrl;
    else $("#memeMain", body).hidden = true;
  }

  // Lösung: erst nach der eigenen Antwort (die Datenbank gibt sie vorher auch nicht heraus)
  let solLoaded = false;
  async function loadSolution() {
    if (solLoaded || isTask) return;
    const { data: sol } = await sb.from("door_solutions").select("solution, accepted").eq("day", day).maybeSingle();
    if (!sol) return;
    solLoaded = true;
    if (isGuess && sol.accepted && sol.accepted.length) target = toNumber(sol.accepted[0]);
    if (sol.solution) {
      const el = $("#solution", body);
      el.innerHTML = "Lösung: <b>" + esc(sol.solution) + "</b>";
      el.hidden = false;
    }
  }
  let justSent = false;

  async function load() {
    const { data, error } = await sb.rpc("get_answers", { d: day });
    if (!error && (revealed || (data || []).some(r => r.is_me))) await loadSolution();
    if (personal) targetOf = await targetsFor(day);
    if (hasReactions(door.kind)) reactMap = await loadReactions(day);
    if (error) { list.innerHTML = '<li class="note">Die Antworten lassen sich gerade nicht laden.</li>'; return; }
    paint(data || []);
  }

  function paint(rows) {
    const mine = rows.find(r => r.is_me);
    // Schon geantwortet: kein zweiter Versuch
    if (mine && $("#answerForm", body)) { $("#answerForm", body).hidden = true; $("#onceNote", body).hidden = true; }
    if (mine && $("#overNote", body)) $("#overNote", body).hidden = true;
    const canSeeAll = mine || revealed || state.isAdmin;
    const count = canSeeAll ? rows.length : totalCount;
    gcount.textContent = count ? plural(count, "Antwort", "Antworten") : "";
    list.innerHTML = "";

    if (!canSeeAll) {
      list.innerHTML = '<li class="note locked-gal">' + (totalCount
        ? plural(totalCount, "Antwort wartet", "Antworten warten") + ". Tipp erst selbst etwas ein."
        : "Noch keine Antworten. Sei die oder der Erste!") + "</li>";
      return;
    }
    if (!rows.length) { list.innerHTML = '<li class="note">Niemand hat geantwortet.</li>'; return; }

    // Eigene Antwort zuerst; bei der Schätzfrage nach der Auflösung: wer am nächsten dran ist
    if (isGuess && target !== null) {
      const off = r => { const n = toNumber(r.answer); return n === null ? Infinity : Math.round(Math.abs(n - target) * 1e6) / 1e6; };
      rows.sort((a, b) => off(a) - off(b));
      let rank = 0, last = null;
      rows.forEach((r, i) => { const o = off(r); if (o !== last) { rank = i + 1; last = o; } r.rank = rank; r.off = o; });
    } else rows.sort((a, b) => (b.is_me ? 1 : 0) - (a.is_me ? 1 : 0));
    if (justSent && mine) {
      justSent = false;
      if (isGuess && mine.off !== undefined && mine.off !== Infinity) setFeedback(fb, mine.off === 0 ? "Genau richtig! 🎯" : "Abgeschickt! Du liegst " + fmt(mine.off) + " daneben.", "yes");
      else if (!isTask && !isGuess && mine.correct !== null && mine.correct !== undefined) setFeedback(fb, mine.correct ? "Richtig! 🎉" : "Leider falsch.", mine.correct ? "yes" : "no");
      else setFeedback(fb, "Abgeschickt! Jetzt siehst du die Antworten der anderen.", "yes");
    }
    rows.forEach(r => {
      const li = document.createElement("li");
      const marked = !isTask && !isGuess && r.correct !== null && r.correct !== undefined;
      if (marked) li.className = r.correct ? "right" : "wrong";
      const who = document.createElement("b");
      who.textContent = (r.rank ? (["🥇", "🥈", "🥉"][r.rank - 1] || r.rank + ".") + " " : "") +
        (r.is_me ? "Du" : r.name) + (targetOf[r.user_id] ? " → " + targetOf[r.user_id] : "");
      const txt = document.createElement("span"); txt.textContent = r.answer;
      if (isEmojiTask) txt.className = "emoji-answer";
      li.append(who, txt);
      if (r.rank && r.off !== Infinity) {
        const d = document.createElement("small");
        d.className = "off";
        d.textContent = r.off === 0 ? "genau richtig!" : fmt(r.off) + " daneben";
        li.append(d);
      }
      if (marked) {
        const m = document.createElement("i");
        m.textContent = r.correct ? "✔" : "✘";
        m.setAttribute("aria-label", r.correct ? "richtig" : "falsch");
        li.append(m);
      }
      if (hasReactions(door.kind)) { li.classList.add("has-react"); li.append(reactionBar(day, r.user_id, null, reactMap)); }
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
      if (!isTask && !isGuess) box.append(mk("✔", true, "Von Hand richtig"), mk("✘", false, "Von Hand falsch"), mk("auto", null, "Automatisch prüfen"));
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
      const val = input.value.trim().slice(0, door.kind === "frage" ? 300 : 120);
      if (!val) { setFeedback(fb, "Tipp erst eine Antwort ein.", "no"); return; }
      if (isGuess && toNumber(val) === null) { setFeedback(fb, "Bitte nur eine Zahl eintippen, zum Beispiel 7 oder 3,5.", "no"); return; }
      if (isEmojiTask) {
        const n = emojiCount(val);
        if (n !== 3) { setFeedback(fb, n === -1 ? "Bitte nur Emojis, kein Text." : "Genau 3 Emojis, bitte (du hast " + n + ").", "no"); return; }
      }
      const btn = $("#sendBtn", body); btn.disabled = true;
      const { error } = await sb.from("answers").insert({ day, user_id: state.userId, answer: val });
      btn.disabled = false;
      if (error) {
        setFeedback(fb, /duplicate|unique/i.test(error.message || "") ? "Du hast hier schon geantwortet." : friendlyError(error), "no");
        if (/duplicate|unique/i.test(error.message || "")) load();
        return;
      }
      justSent = true;
      load();
    });
    if (!state.isAdmin || !state.preview) input.focus();
  }

  load();
}

// „3,5“, „3.5“, „ca. 7 Stück“ → Zahl (oder null)
function toNumber(v) {
  const m = String(v ?? "").replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}
function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString("de-DE"); }

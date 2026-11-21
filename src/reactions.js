import { sb } from "./supabase.js";
import { state } from "./state.js";
import { toast, friendlyError } from "./ui.js";

// Reaktionen mit beliebigem Emoji unter Antworten und Beiträgen ohne richtig/falsch.
// Jede Reaktion = 1 Punkt für die Person. Pro Person und Antwort höchstens 3 verschiedene Emojis.
const QUICK = ["😂", "❤️", "🔥", "👏", "😮", "🤯", "🥂", "🎄"];
const MAX_PER_ITEM = 3;

export const hasReactions = kind => ["aufgabe", "frage", "meme", "foto", "zeichnen", "frei"].includes(kind);

// Ist das ein Emoji (und kein Text)? Gleiche Regel wie in der Datenbank.
export const isEmoji = e => !!e && e.length <= 16 && !/[\p{L}\p{N}\s<>"'&]/u.test(e) && /\p{Extended_Pictographic}/u.test(e);

// Lädt alle Reaktionen eines Türchens: key → { "😂": {n, mine}, "🔥": {n, mine}, … }
export async function loadReactions(day) {
  const { data } = await sb.rpc("get_reactions", { d: day });
  const map = {};
  (data || []).forEach(r => {
    const k = key(r.author_id, r.post_id);
    (map[k] ||= {})[r.emoji] = { n: r.anzahl, mine: r.mine };
  });
  return map;
}

const key = (author, post) => post || "a:" + author;

// Leiste für eine Antwort (post = null) oder einen Beitrag: vorhandene Emojis + „+“ zum Auswählen
export function reactionBar(day, author, post, map) {
  const bar = document.createElement("span");
  bar.className = "react";
  const own = author === state.userId;
  const cur = (map[key(author, post)] ||= {});

  async function toggle(e) {
    const mineCount = Object.values(cur).filter(x => x.mine).length;
    if (!(cur[e] && cur[e].mine) && mineCount >= MAX_PER_ITEM) { toast("Höchstens " + MAX_PER_ITEM + " Reaktionen pro Antwort"); return; }
    const { data, error } = await sb.rpc("react", { d: day, a: author, p: post, e });
    if (error) { toast(friendlyError(error)); return; }
    const r = (cur[e] ||= { n: 0, mine: false });
    r.mine = !!data; r.n += r.mine ? 1 : -1;
    if (r.n <= 0) delete cur[e];
    paint();
  }

  function paint() {
    bar.innerHTML = "";
    Object.entries(cur).sort((a, b) => b[1].n - a[1].n).forEach(([e, r]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = e + " " + r.n;
      b.classList.toggle("on", r.mine);
      b.setAttribute("aria-pressed", r.mine ? "true" : "false");
      if (own) { b.disabled = true; b.title = "Eigene Antwort"; }
      else b.addEventListener("click", () => toggle(e));
      bar.append(b);
    });
    if (!own) {
      const add = document.createElement("button");
      add.type = "button"; add.className = "react-add"; add.textContent = "+";
      add.setAttribute("aria-label", "Mit Emoji reagieren");
      add.addEventListener("click", () => openPicker(add));
      bar.append(add);
    }
  }

  // Kleine Auswahl: häufige Emojis zum Antippen, oder ein eigenes über die Emoji-Tastatur
  function openPicker(anchor) {
    document.querySelectorAll(".react-pick").forEach(p => p.remove());
    const pick = document.createElement("span");
    pick.className = "react-pick";
    QUICK.forEach(e => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = e;
      b.addEventListener("click", () => { pick.remove(); toggle(e); });
      pick.append(b);
    });
    const form = document.createElement("form");
    form.innerHTML = '<input type="text" maxlength="16" placeholder="anderes" aria-label="Eigenes Emoji"><button type="submit">OK</button>';
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const v = form.querySelector("input").value.trim();
      if (!isEmoji(v)) { toast("Bitte nur ein Emoji"); return; }
      pick.remove(); toggle(v);
    });
    pick.append(form);
    anchor.after(pick);
  }

  paint();
  return bar;
}

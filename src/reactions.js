import { sb } from "./supabase.js";
import { state } from "./state.js";
import { toast, friendlyError } from "./ui.js";

// 😂 / ❤️ unter Antworten und Beiträgen ohne richtig/falsch. Jede Reaktion = 1 Punkt für die Person.
const EMOJI = { lol: "😂", herz: "❤️" };
const TITLE = { lol: "Lustig", herz: "Schön" };

export const hasReactions = kind => ["aufgabe", "frage", "meme", "foto", "zeichnen", "frei"].includes(kind);

// Lädt alle Reaktionen eines Türchens: key → { lol: {n, mine}, herz: {n, mine} }
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

// Knopfleiste für eine Antwort (post = null) oder einen Beitrag
export function reactionBar(day, author, post, map) {
  const bar = document.createElement("span");
  bar.className = "react";
  const own = author === state.userId;
  const cur = map[key(author, post)] || {};
  for (const e of ["lol", "herz"]) {
    const b = document.createElement("button");
    b.type = "button";
    let { n = 0, mine = false } = cur[e] || {};
    const paint = () => {
      b.textContent = EMOJI[e] + (n ? " " + n : "");
      b.classList.toggle("on", mine);
      b.setAttribute("aria-pressed", mine ? "true" : "false");
      b.setAttribute("aria-label", TITLE[e] + (n ? ", " + n : ""));
    };
    paint();
    if (own) { b.disabled = true; b.title = "Eigene Antwort"; }
    else b.addEventListener("click", async () => {
      b.disabled = true;
      const { data, error } = await sb.rpc("react", { d: day, a: author, p: post, e });
      b.disabled = false;
      if (error) { toast(friendlyError(error)); return; }
      mine = !!data; n += mine ? 1 : -1;
      paint();
    });
    bar.append(b);
  }
  return bar;
}

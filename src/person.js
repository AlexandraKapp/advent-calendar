import { sb } from "./supabase.js";
import { esc } from "./ui.js";

// Persönliche Aufgaben: {person} in der Aufgabe wird durch die zugeloste Person ersetzt.
export const isPersonal = text => (text || "").includes("{person}");

// Zeigt die Aufgabe sofort mit „…“ an und setzt den Namen ein, sobald der Server gelost hat.
export function showTask(el, day, text) {
  el.textContent = isPersonal(text) ? text.replaceAll("{person}", "…") : text;
  if (!isPersonal(text)) return;
  sb.rpc("my_person", { d: day }).then(({ data }) => {
    const who = data && data[0] ? data[0].name : null;
    el.innerHTML = esc(text).replaceAll("{person}",
      who ? '<b class="who">' + esc(who) + "</b>" : "jemanden aus der Gruppe");
  });
}

// Wer hat wen gezogen? { user_id: Name der gezogenen Person }
export async function targetsFor(day) {
  const { data } = await sb.from("door_assignments")
    .select("user_id, target:profiles!door_assignments_target_id_fkey(name)").eq("day", day);
  const map = {};
  (data || []).forEach(a => { if (a.target) map[a.user_id] = a.target.name; });
  return map;
}

// Genau n Emojis? (Leerzeichen sind egal)
export function emojiCount(text) {
  const clean = (text || "").replace(/\s+/g, "");
  if (!clean) return 0;
  const seg = typeof Intl !== "undefined" && Intl.Segmenter
    ? [...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(clean)].map(s => s.segment)
    : Array.from(clean);
  const isEmoji = g => /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g);
  return seg.every(isEmoji) ? seg.length : -1; // -1: es steckt Text drin
}

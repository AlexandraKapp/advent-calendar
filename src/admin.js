import { sb } from "./supabase.js";
import { state } from "./state.js";
import { $, esc, KIND_LABEL, toast, friendlyError } from "./ui.js";

// Admin-Bereich: Türchen und Lösungen bearbeiten, Leute verwalten.
// Nur sichtbar für Admins, und die Datenbank lässt auch nur Admins speichern.
export async function renderAdmin(app) {
  app.innerHTML = '<div class="admin"><p class="pill" style="justify-self:start">Lädt …</p></div>';
  const [doorsRes, solRes, peopleRes] = await Promise.all([
    sb.from("doors").select("*").order("day"),
    sb.from("door_solutions").select("*"),
    sb.from("profiles").select("id, name, created_at").order("created_at"),
  ]);
  if (doorsRes.error || solRes.error || peopleRes.error) {
    app.innerHTML = '<p class="lede">Admin-Daten konnten nicht geladen werden.</p>';
    return;
  }
  const doors = {}; doorsRes.data.forEach(d => { doors[d.day] = d; });
  const sols = {}; solRes.data.forEach(s => { sols[s.day] = s; });

  const root = document.createElement("div");
  root.className = "admin";
  root.innerHTML =
    '<p class="lede">🛠️ <b>Admin-Bereich.</b> Hier bearbeitest du Türchen und Lösungen. ' +
    "Rätsel und Lösungen liegen nur in der Datenbank. Freunde sehen ein Türchen erst an seinem Tag und die Lösung erst am Tag danach um 0:00.</p>" +
    "<h2>Türchen</h2>";
  for (let day = 1; day <= 24; day++) root.append(doorEditor(day, doors[day], sols[day]));

  root.insertAdjacentHTML("beforeend", "<h2>Brunchies (" + peopleRes.data.length + ")</h2>");
  const ul = document.createElement("ul"); ul.className = "people";
  peopleRes.data.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = "<span>" + esc(p.name) + (p.id === state.userId ? " (du)" : "") + "</span>";
    if (p.id !== state.userId) {
      const b = document.createElement("button");
      b.className = "linkbtn"; b.type = "button"; b.textContent = "Entfernen";
      b.title = "Löscht Name, Antworten und Beiträge";
      b.addEventListener("click", async () => {
        if (!confirm(p.name + " mit allen Antworten und Beiträgen entfernen? Das lässt sich nicht rückgängig machen. (Anmelden kann sich die Person danach trotzdem wieder.)")) return;
        const { error } = await sb.from("profiles").delete().eq("id", p.id);
        if (error) toast(friendlyError(error)); else { li.remove(); toast("Entfernt"); }
      });
      li.append(b);
    }
    ul.append(li);
  });
  root.append(ul);
  app.innerHTML = "";
  app.append(root);
}

function doorEditor(day, d, s) {
  d = d || { day, kind: "emoji", category: "", emoji: "", question: "", short: "", seconds: null };
  s = s || { solution: "", accepted: [] };
  const det = document.createElement("details");
  const summary = () =>
    '<span class="n">' + day + '</span><span class="em">' + esc(d.emoji || "·") + "</span>" +
    "<span>" + esc(d.short || d.category || (d.question || "").slice(0, 30) || "(leer)") + "</span>" +
    '<span class="k">' + esc(KIND_LABEL[d.kind] || d.kind) + "</span>";
  det.innerHTML = "<summary>" + summary() + "</summary>";

  const f = document.createElement("form");
  f.innerHTML =
    '<div class="two"><div class="stack"><label class="lbl">Typ</label><select name="kind">' +
      Object.entries(KIND_LABEL).map(([k, v]) => '<option value="' + k + '"' + (k === d.kind ? " selected" : "") + ">" + v + "</option>").join("") +
    '</select></div><div class="stack"><label class="lbl">Kategorie (Schild oben)</label><input type="text" name="category" value="' + esc(d.category) + '" placeholder="Film, Serie, …"></div></div>' +
    '<div class="stack"><label class="lbl">Emoji(s)</label><input type="text" name="emoji" value="' + esc(d.emoji) + '"></div>' +
    '<div class="stack"><label class="lbl" data-for="question"></label><textarea name="question">' + esc(d.question) + "</textarea>" +
      '<p class="small" style="text-align:left">Tipp: Schreib <b>{person}</b> in die Aufgabe, z. B. „Stelle {person} auf einem Foto nach.“ Dann bekommt jede Person beim Öffnen jemand anderen aus der Gruppe zugelost.</p></div>' +
    '<div class="stack" data-only="challenge"><label class="lbl">Kurztitel fürs Rückblick-Video</label><input type="text" name="short" value="' + esc(d.short) + '"></div>' +
    '<div class="stack" data-only="zeichnen"><label class="lbl">Sekunden (Zeichnen / Spiel)</label><input type="number" name="seconds" min="3" max="600" value="' + (d.seconds ?? 30) + '"></div>' +
    '<div class="stack" data-only="riddle"><label class="lbl">Lösung (wird am Folgetag angezeigt)</label><input type="text" name="solution" value="' + esc(s.solution) + '"></div>' +
    '<div class="stack" data-only="riddle"><label class="lbl">Gilt als richtig (mit Komma getrennt)</label><input type="text" name="accepted" value="' + esc((s.accepted || []).join(", ")) + '">' +
      '<p class="small" style="text-align:left">Groß/klein, Leerzeichen und Umlaute sind egal. Begriffe ab 4 Buchstaben dürfen irgendwo in der Antwort stehen („schirm“ passt zu „ein Regenschirm“), kürzere müssen genau passen.</p></div>' +
    '<button class="btn" type="submit">💾 Speichern</button>';
  det.append(f);

  function updateVisibility() {
    const kind = f.kind.value;
    const isRiddle = kind === "emoji" || kind === "wort";
    f.querySelectorAll("[data-only]").forEach(el => {
      const only = el.dataset.only;
      el.hidden = !(only === "riddle" ? isRiddle : only === "challenge" ? (kind === "foto" || kind === "zeichnen" || kind === "frei") : only === "zeichnen" ? (kind === "zeichnen" || kind === "spiel") : kind === only);
    });
    f.querySelector('[data-for="question"]').textContent =
      kind === "wort" ? "Rätselfrage" : kind === "aufgabe" ? "Aufgabe (Antwort: genau 3 Emojis, keine Lösung)" : kind === "frage" ? "Frage (freie Antwort, keine Lösung)" : kind === "spiel" ? "Spielanleitung (leer = Standardtext)" : kind === "raten" ? "Text oben (Fotos und Namen kommen über tools/wer-ist-das.swift)" : kind === "emoji" ? "Frage (leer = „Welcher Film, welche Serie?“)" : kind === "rueckblick" ? "Text (wird nicht angezeigt)" : "Aufgabe";
  }
  f.kind.addEventListener("change", updateVisibility);
  updateVisibility();

  f.addEventListener("submit", async e => {
    e.preventDefault();
    const kind = f.kind.value;
    const row = {
      day, kind,
      category: f.category.value.trim(),
      emoji: f.emoji.value.trim(),
      question: f.question.value.trim(),
      short: f.short.value.trim(),
      seconds: kind === "zeichnen" || kind === "spiel" ? Math.min(600, Math.max(3, parseInt(f.seconds.value, 10) || 30)) : null,
    };
    const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
    let { error } = await sb.from("doors").upsert(row);
    if (!error && (kind === "emoji" || kind === "wort")) {
      const accepted = f.accepted.value.split(",").map(x => x.trim()).filter(Boolean);
      ({ error } = await sb.from("door_solutions").upsert({ day, solution: f.solution.value.trim(), accepted }));
    }
    btn.disabled = false;
    if (error) { toast(friendlyError(error)); return; }
    d = row;
    det.querySelector("summary").innerHTML = summary();
    toast("Türchen " + day + " gespeichert ✔");
  });
  return det;
}

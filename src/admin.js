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
    '<p class="lede"><b>Admin-Bereich.</b> Hier bearbeitest du Türchen und Lösungen. ' +
    "Rätsel und Lösungen liegen nur in der Datenbank. Freunde sehen ein Türchen erst an seinem Tag und die Lösung erst, nachdem sie selbst geantwortet haben.</p>" +
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
  root.append(resetBox());
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
    '<div class="stack" data-only="riddle"><label class="lbl" data-for="solution">Lösung (wird nach der eigenen Antwort angezeigt)</label><input type="text" name="solution" value="' + esc(s.solution) + '"></div>' +
    '<div class="stack" data-only="riddle"><label class="lbl" data-for="accepted">Gilt als richtig (mit Komma getrennt)</label><input type="text" name="accepted" value="' + esc((s.accepted || []).join(", ")) + '">' +
      '<p class="small" data-for="acchint" style="text-align:left">Groß/klein, Leerzeichen und Umlaute sind egal. Begriffe ab 4 Buchstaben dürfen irgendwo in der Antwort stehen („schirm“ passt zu „ein Regenschirm“), kürzere müssen genau passen.</p></div>' +
    '<button class="btn" type="submit">Speichern</button>';
  det.append(f);
  const fotos = document.createElement("div");
  fotos.className = "raten-admin";
  det.append(fotos);
  let fotosLoaded = null;
  const loadFotos = () => {
    fotos.hidden = f.kind.value !== "raten" && f.kind.value !== "meme";
    if (!det.open || fotos.hidden || fotosLoaded === f.kind.value) return;
    fotosLoaded = f.kind.value;
    (fotosLoaded === "raten" ? ratenAdmin : memeAdmin)(day, fotos);
  };
  det.addEventListener("toggle", loadFotos);

  function updateVisibility() {
    const kind = f.kind.value;
    const isRiddle = kind === "emoji" || kind === "wort" || kind === "schaetzen";
    f.querySelector('[data-for="solution"]').textContent = kind === "schaetzen" ? "Auflösung (Text, wird nach der eigenen Schätzung angezeigt)" : "Lösung (wird nach der eigenen Antwort angezeigt)";
    f.querySelector('[data-for="accepted"]').textContent = kind === "schaetzen" ? "Richtige Zahl (für die Rangliste)" : "Gilt als richtig (mit Komma getrennt)";
    f.querySelector('[data-for="acchint"]').hidden = kind === "schaetzen";
    f.querySelectorAll("[data-only]").forEach(el => {
      const only = el.dataset.only;
      el.hidden = !(only === "riddle" ? isRiddle : only === "challenge" ? (kind === "foto" || kind === "zeichnen" || kind === "frei") : only === "zeichnen" ? (kind === "zeichnen" || kind === "spiel") : kind === only);
    });
    f.querySelector('[data-for="question"]').textContent =
      kind === "wort" ? "Rätselfrage" : kind === "aufgabe" ? "Aufgabe (Antwort: genau 3 Emojis, keine Lösung)" : kind === "frage" ? "Frage (freie Antwort, keine Lösung)" : kind === "schaetzen" ? "Schätzfrage (Antwort ist eine Zahl)" : kind === "meme" ? "Text über dem Foto (das Foto steht unter dem Speichern-Knopf)" : kind === "spiel" ? "Spielanleitung (leer = Standardtext)" : kind === "raten" ? "Text oben (die Fotos stehen unter dem Speichern-Knopf)" : kind === "emoji" ? "Frage (leer = „Welcher Film, welche Serie?“)" : kind === "rueckblick" ? "Text (wird nicht angezeigt)" : "Aufgabe";
  }
  f.kind.addEventListener("change", () => { updateVisibility(); loadFotos(); });
  updateVisibility();
  fotos.hidden = f.kind.value !== "raten" && f.kind.value !== "meme";

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
    if (!error && (kind === "emoji" || kind === "wort" || kind === "schaetzen")) {
      // Bei der Schätzfrage ist „Richtige Zahl“ genau eine Zahl (Komma = Dezimalkomma)
      const accepted = kind === "schaetzen"
        ? [f.accepted.value.trim().replace(",", ".")].filter(Boolean)
        : f.accepted.value.split(",").map(x => x.trim()).filter(Boolean);
      ({ error } = await sb.from("door_solutions").upsert({ day, solution: f.solution.value.trim(), accepted }));
    }
    btn.disabled = false;
    if (error) { toast(friendlyError(error)); return; }
    d = row;
    det.querySelector("summary").innerHTML = summary();
    toast("Türchen " + day + " gespeichert");
  });
  return det;
}

// „Wer ist das?“: Fotos ansehen, Namen ändern, austauschen, hinzufügen, löschen
async function ratenAdmin(day, box) {
  box.innerHTML = '<h3>Fotos</h3><p class="small" style="text-align:left">Lädt …</p>';
  const { data, error } = await sb.rpc("raten_admin_list", { d: day });
  if (error) { box.innerHTML = '<p class="small">Fotos konnten nicht geladen werden.</p>'; return; }
  box.innerHTML = '<h3>Fotos (' + data.length + ')</h3>' +
    '<p class="small" style="text-align:left">Die Reihenfolge hier ist die Reihenfolge im Spiel. Weitere Schreibweisen mit Komma trennen. ' +
    "Neue Fotos am besten als JPG; das Foto wird für das Spiel automatisch verkleinert und unscharf gemacht.</p>";
  const reload = () => ratenAdmin(day, box);
  data.forEach(r => box.append(ratenCard(day, r, reload)));
  if (data.length < 20) box.append(ratenCard(day, null, reload));
}

function ratenCard(day, r, reload) {
  const card = document.createElement("form");
  card.className = "raten-card" + (r ? "" : " new");
  card.innerHTML =
    '<div class="raten-thumb">' + (r ? '<img alt="">' : "<span>+</span>") + "</div>" +
    '<div class="stack">' +
      "<b>" + (r ? "Foto " + r.nr : "Neues Foto") + "</b>" +
      '<input type="text" name="sol" placeholder="Name" value="' + esc(r ? r.solution : "") + '">' +
      '<input type="text" name="acc" placeholder="Andere Schreibweisen (Komma)" value="' + esc(r ? (r.accepted || []).filter(a => a !== r.solution).join(", ") : "") + '">' +
      '<label class="linkbtn raten-file">' + (r ? "Foto austauschen" : "Foto auswählen") + '<input type="file" name="file" accept="image/*" hidden></label>' +
      '<span class="small raten-chosen"></span>' +
      '<div class="raten-btns"><button class="btn small-btn" type="submit">' + (r ? "Speichern" : "Hinzufügen") + "</button>" +
      (r ? '<button class="linkbtn" type="button" name="del">Löschen</button>' : "") + "</div>" +
    "</div>";
  if (r) card.querySelector("img").src = r.bild;
  let stages = null;
  card.file.addEventListener("change", async () => {
    const file = card.file.files[0];
    if (!file) return;
    card.querySelector(".raten-chosen").textContent = "Wird vorbereitet …";
    try {
      stages = await makeStages(file);
      const thumb = card.querySelector(".raten-thumb");
      thumb.innerHTML = '<img alt="">'; thumb.querySelector("img").src = stages[4];
      card.querySelector(".raten-chosen").textContent = "Neues Foto gewählt – jetzt " + (r ? "speichern" : "hinzufügen") + ".";
    } catch {
      stages = null;
      card.querySelector(".raten-chosen").textContent = "Dieses Foto kann der Browser nicht lesen. Bitte als JPG oder PNG.";
    }
  });
  card.addEventListener("submit", async e => {
    e.preventDefault();
    const sol = card.sol.value.trim();
    if (!sol) { toast("Bitte einen Namen eintragen"); return; }
    if (!r && !stages) { toast("Bitte erst ein Foto auswählen"); return; }
    const acc = card.acc.value.split(",").map(x => x.trim()).filter(Boolean);
    const btn = card.querySelector("button[type=submit]"); btn.disabled = true;
    const { error } = await sb.rpc("raten_admin_save", { d: day, n: r ? r.nr : null, sol, acc, st: stages });
    btn.disabled = false;
    if (error) { toast(friendlyError(error)); return; }
    toast(r ? "Foto " + r.nr + " gespeichert" : "Foto hinzugefügt");
    reload();
  });
  if (r) card.querySelector('[name="del"]').addEventListener("click", async () => {
    if (!confirm("Foto " + r.nr + " (" + r.solution + ") löschen? Die Fotos dahinter rücken auf.")) return;
    const { error } = await sb.rpc("raten_admin_delete", { d: day, n: r.nr });
    if (error) toast(friendlyError(error)); else { toast("Gelöscht"); reload(); }
  });
  return card;
}

// 5 Stufen wie in tools/wer-ist-das.swift: winzige Bilder wirken groß gezogen unscharf
async function makeStages(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const sizes = [14, 26, 50, 100, 900], quality = [0.7, 0.7, 0.75, 0.75, 0.8];
  return sizes.map((px, i) => {
    const k = Math.min(1, px / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality[i]);
  });
}

// „Caption this“: das Foto des Tages ansehen und austauschen (Speicher „tuerchen“, Datei <tag>.jpg)
async function memeAdmin(day, box) {
  box.innerHTML =
    "<h3>Foto</h3>" +
    '<div class="meme-admin"><img alt="Foto zum Beschriften" hidden><p class="small" style="text-align:left">Lädt …</p></div>' +
    '<label class="btn raten-file">Foto austauschen<input type="file" accept="image/*" hidden></label>' +
    '<p class="small" style="text-align:left">Das neue Foto ersetzt das alte sofort. Am besten als JPG.</p>';
  const img = box.querySelector("img"), msg = box.querySelector(".meme-admin p"), input = box.querySelector("input");
  async function show() {
    const { data } = await sb.storage.from("tuerchen").createSignedUrl(day + ".jpg", 600);
    if (data) { img.src = data.signedUrl + "&t=" + Date.now(); img.hidden = false; msg.hidden = true; }
    else { img.hidden = true; msg.hidden = false; msg.textContent = "Noch kein Foto hochgeladen."; }
  }
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    msg.hidden = false; msg.textContent = "Wird hochgeladen …";
    let blob;
    try { blob = await toJpeg(file, 1600, 0.85); }
    catch { msg.textContent = "Dieses Foto kann der Browser nicht lesen. Bitte als JPG oder PNG."; return; }
    const { error } = await sb.storage.from("tuerchen").upload(day + ".jpg", blob, { upsert: true, contentType: "image/jpeg" });
    input.value = "";
    if (error) { msg.textContent = friendlyError(error); return; }
    toast("Foto für Türchen " + day + " ausgetauscht");
    show();
  });
  show();
}

async function toJpeg(file, maxPx, q) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("leer"))), "image/jpeg", q));
}

// Nach dem Testen: alles auf 0 (Antworten, Fotos/Zeichnungen, Zulosungen, Spielstände, geknallte Korken)
function resetBox() {
  const box = document.createElement("div");
  box.className = "reset-box";
  box.innerHTML =
    "<h2>Zurücksetzen</h2>" +
    '<p class="small" style="text-align:left">Löscht alle Antworten, hochgeladenen Fotos und Zeichnungen, Zulosungen bei {person} und Spielstände. ' +
    "Alle Flaschen sind danach wieder zu. Türchen, Lösungen, Fotos für die Rätsel und die Leute bleiben. Das lässt sich nicht rückgängig machen.</p>" +
    '<button class="btn danger" type="button">Alles zurücksetzen</button>';
  const btn = box.querySelector("button");
  btn.addEventListener("click", async () => {
    const word = prompt("Wirklich alles löschen? Dann tippe RESET ein.");
    if ((word || "").trim().toUpperCase() !== "RESET") { toast("Nichts gelöscht"); return; }
    btn.disabled = true; btn.textContent = "Wird zurückgesetzt …";
    // Erst die Dateien im Speicher löschen, dann die Einträge in der Datenbank
    let error = null;
    const paths = [];
    try { await collectFiles("", paths); } catch (e) { error = e; }
    for (let i = 0; !error && i < paths.length; i += 100) {
      ({ error } = await sb.storage.from("posts").remove(paths.slice(i, i + 100)));
    }
    if (!error) ({ error } = await sb.rpc("admin_reset"));
    btn.disabled = false; btn.textContent = "Alles zurücksetzen";
    if (error) { toast(friendlyError(error)); return; }
    const { data: settings } = await sb.from("app_settings").select("reset_at").maybeSingle();
    if (settings) state.resetAt = settings.reset_at;
    toast("Alles zurückgesetzt");
  });
  return box;
}

// Alle Dateien im Speicher „posts“ einsammeln (Ordner: Tag/Person/Datei)
async function collectFiles(prefix, out) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from("posts").list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? prefix + "/" + item.name : item.name;
      if (item.id) out.push(path);            // Datei
      else await collectFiles(path, out);     // Ordner
    }
    if (data.length < 1000) return;
  }
}

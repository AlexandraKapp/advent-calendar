import { sb } from "./supabase.js";
import { $, esc, setFeedback, friendlyError } from "./ui.js";

function windowCard(title, body, color = "#ff3ea5") {
  return '<div class="screen"><div class="card" style="--c:' + color + '">' +
    '<div class="card-top"><span class="day">' + esc(title) + "</span></div>" +
    '<div class="card-body">' + body + "</div></div></div>";
}

// ---------- Anmelden per Magic Link (oder Code aus der Mail) ----------
export function renderLogin(app) {
  let email = "";
  try { email = localStorage.getItem("brunchies-email") || ""; } catch (e) { /* egal */ }

  app.innerHTML = windowCard("Anmelden.exe",
    '<p class="emoji small" aria-hidden="true">🥂🎄</p>' +
    '<p class="question">Willkommen, Brunchie!</p>' +
    '<p class="small">Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du direkt drin bist. Kein Passwort nötig.</p>' +
    '<form id="mailForm" class="stack" style="display:grid">' +
      '<label class="lbl" for="email">E-Mail</label>' +
      '<input type="email" id="email" required autocomplete="email" inputmode="email" placeholder="du@beispiel.de" value="' + esc(email) + '">' +
      '<button class="btn" type="submit" id="sendBtn">✉️ Login-Link schicken</button>' +
    "</form>" +
    '<form id="codeForm" class="stack" style="display:grid" hidden>' +
      '<p class="small" id="sentMsg"></p>' +
      '<label class="lbl" for="code">Oder den Code aus der Mail eingeben</label>' +
      '<input type="text" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456">' +
      '<button class="btn" type="submit" id="codeBtn">Anmelden</button>' +
      '<button class="btn ghost" type="button" id="backBtn">Andere E-Mail-Adresse</button>' +
    "</form>" +
    '<p class="feedback" id="fb" aria-live="polite"></p>');

  const mailForm = $("#mailForm"), codeForm = $("#codeForm"), fb = $("#fb");

  mailForm.addEventListener("submit", async e => {
    e.preventDefault();
    email = $("#email").value.trim().toLowerCase();
    if (!email) return;
    const btn = $("#sendBtn"); btn.disabled = true;
    setFeedback(fb, "Wird verschickt …");
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
    });
    btn.disabled = false;
    if (error) { setFeedback(fb, friendlyError(error), "no"); return; }
    try { localStorage.setItem("brunchies-email", email); } catch (e2) { /* egal */ }
    mailForm.hidden = true; codeForm.hidden = false;
    $("#sentMsg").innerHTML = "📬 Schau in dein Postfach (<b>" + esc(email) + "</b>), auch im Spam-Ordner. Tipp auf den Link in der Mail.";
    setFeedback(fb, "");
  });

  codeForm.addEventListener("submit", async e => {
    e.preventDefault();
    const token = $("#code").value.replace(/\D/g, "");
    if (token.length < 6) { setFeedback(fb, "Der Code hat mindestens 6 Ziffern.", "no"); return; }
    const btn = $("#codeBtn"); btn.disabled = true;
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    btn.disabled = false;
    if (error) setFeedback(fb, friendlyError(error), "no");
    // Bei Erfolg schaltet main.js automatisch weiter.
  });

  $("#backBtn").addEventListener("click", () => {
    codeForm.hidden = true; mailForm.hidden = false; setFeedback(fb, "");
  });
}

// ---------- Namen festlegen (beim ersten Mal oder zum Ändern) ----------
export function renderName(app, { current = "", userId, onDone, onCancel = null }) {
  app.innerHTML = windowCard("Name.exe",
    '<p class="emoji small" aria-hidden="true">🧇</p>' +
    '<p class="question">' + (current ? "Neuer Name?" : "Wie sollen dich die anderen sehen?") + "</p>" +
    '<form id="nameForm" class="stack" style="display:grid">' +
      '<label class="lbl" for="name">Dein Name</label>' +
      '<input type="text" id="name" maxlength="30" required autocomplete="nickname" placeholder="z. B. Alex" value="' + esc(current) + '">' +
      '<button class="btn" type="submit" id="saveBtn">Los geht\'s 🎄</button>' +
      (onCancel ? '<button class="btn ghost" type="button" id="cancelBtn">Abbrechen</button>' : "") +
    "</form>" +
    '<p class="feedback" id="fb" aria-live="polite"></p>', "#00bfc4");

  $("#name").focus();
  if (onCancel) $("#cancelBtn").addEventListener("click", onCancel);
  $("#nameForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#name").value.trim().slice(0, 30);
    if (!name) return;
    const btn = $("#saveBtn"); btn.disabled = true;
    const { data, error } = await sb.from("profiles").upsert({ id: userId, name }).select().single();
    btn.disabled = false;
    if (error) { setFeedback($("#fb"), friendlyError(error), "no"); return; }
    onDone(data);
  });
}

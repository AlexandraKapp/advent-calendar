import "./style.css";
import { sb } from "./supabase.js";
import { state } from "./state.js";
import { renderLogin, renderName } from "./auth.js";
import { $, esc, colorFor, TILTS, KIND_ICON, KIND_LABEL, openDialog, closeDialog, toast } from "./ui.js";
import { buildRiddle } from "./riddle.js";
import { buildChallenge } from "./challenge.js";
import { buildRecap } from "./recap.js";
import { renderAdmin } from "./admin.js";

const app = $("#app");
const headExtra = $("#headExtra");

// Reihenfolge der Türchen im Raster (bunt gemischt wie im Prototyp)
const ORDER = [7, 15, 2, 19, 11, 24, 4, 22, 13, 1, 17, 9, 20, 6, 14, 3, 23, 10, 18, 5, 12, 21, 8, 16];

// ---------- Ablauf: angemeldet? Name da? ----------
let routing = false;
async function route() {
  if (routing) return;
  routing = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    state.session = session;
    if (!session) {
      state.profile = null; state.isAdmin = false;
      headExtra.innerHTML = "";
      renderLogin(app);
      return;
    }
    // Login-Reste aus der Adresszeile entfernen
    if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname);

    state.userId = session.user.id;
    if (!state.profile || state.profile.id !== state.userId) {
      const [{ data: profile }, { data: isAdmin }] = await Promise.all([
        sb.from("profiles").select("*").eq("id", state.userId).maybeSingle(),
        sb.rpc("is_admin"),
      ]);
      state.profile = profile;
      state.isAdmin = !!isAdmin;
    }
    if (!state.profile) {
      headExtra.innerHTML = "";
      renderName(app, { userId: state.userId, onDone: p => { state.profile = p; show(); } });
      return;
    }
    show();
  } finally {
    routing = false;
  }
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") { closeDialog(); setTimeout(route, 0); }
  // SIGNED_IN kommt auch beim Zurückwechseln in den Tab, dann nichts neu zeichnen
  if (event === "SIGNED_IN" && (!state.profile || !session || session.user.id !== state.userId)) setTimeout(route, 0);
});
window.addEventListener("hashchange", () => { if (state.profile) show(); });

// ---------- Kopfzeile ----------
function renderHeader() {
  headExtra.innerHTML =
    '<div class="userbar">' +
      '<span class="pill">👋 ' + esc(state.profile.name) + "</span>" +
      '<button class="linkbtn" id="renameBtn" type="button">Name ändern</button>' +
      (state.isAdmin
        ? '<button class="linkbtn' + (state.preview ? " on" : "") + '" id="previewBtn" type="button">👀 Vorschau ' + (state.preview ? "an" : "aus") + "</button>" +
          '<button class="linkbtn' + (location.hash === "#admin" ? " on" : "") + '" id="adminBtn" type="button">🛠️ Admin</button>'
        : "") +
      '<button class="linkbtn" id="logoutBtn" type="button">Abmelden</button>' +
    "</div>";
  $("#renameBtn").addEventListener("click", () => {
    renderName(app, {
      current: state.profile.name, userId: state.userId,
      onDone: p => { state.profile = p; toast("Name gespeichert"); show(); },
      onCancel: show,
    });
  });
  $("#logoutBtn").addEventListener("click", async () => {
    if (!confirm("Wirklich abmelden? Zum Wiederkommen brauchst du einen neuen Link per Mail.")) return;
    await sb.auth.signOut();
  });
  if (state.isAdmin) {
    $("#previewBtn").addEventListener("click", () => {
      state.preview = !state.preview;
      toast(state.preview ? "Vorschau an: alle Türchen offen" : "Vorschau aus");
      show();
    });
    $("#adminBtn").addEventListener("click", () => {
      location.hash = location.hash === "#admin" ? "" : "#admin";
    });
  }
}

function show() {
  renderHeader();
  if (location.hash === "#admin" && state.isAdmin) renderAdmin(app);
  else renderCalendar();
}

// ---------- Kalender-Raster ----------
async function renderCalendar() {
  if (!app.querySelector("#grid")) {
    app.innerHTML =
      '<div class="wrap" style="gap:22px">' +
      '<p class="lede">24 Türchen voller Emoji-Rätsel zu Filmen und Serien, klassischer Worträtsel und schneller Foto- und Zeichen-Challenges 📸✏️. Was die anderen geantwortet oder gepostet haben, siehst du, sobald du selbst mitgemacht hast. Die Lösung gibt\'s immer am nächsten Tag, und am 24. wartet euer Rückblick als Video 🎬.</p>' +
      '<div class="status"><span class="pill" id="progress">… / 24 erledigt</span>' +
      '<span class="pill preview" id="previewPill" hidden>👀 Vorschau: alles offen</span></div>' +
      '<div class="grid" id="grid"></div></div>';
  }
  $("#previewPill").hidden = !state.preview;
  const { data, error } = await sb.rpc("door_overview");
  if (error) { toast("Kalender konnte nicht geladen werden"); return; }
  state.overview = {};
  (data || []).forEach(d => { state.overview[d.day] = d; });
  paintGrid();
}

function paintGrid() {
  const grid = $("#grid");
  if (!grid) return;
  grid.innerHTML = "";
  let done = 0;
  ORDER.forEach(day => {
    const o = state.overview[day] || { day, kind: null, is_open: false, done: false };
    const open = o.is_open || state.preview;
    if (o.done) done++;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "door" + (day === 24 ? " big" : "") + (open ? "" : " locked") + (o.done ? " solved" : "");
    b.style.setProperty("--c", colorFor(day));
    b.style.setProperty("--tilt", TILTS[day % TILTS.length] + "deg");
    const icon = KIND_ICON[o.kind];
    if (o.done) {
      b.innerHTML = '<span class="num">' + day + '</span><span class="emo">' + (o.kind === "foto" || o.kind === "zeichnen" ? "Gepostet ✔" : "Beantwortet ✔") + "</span>";
      b.setAttribute("aria-label", "Türchen " + day + ", erledigt");
    } else {
      b.innerHTML = day + (icon ? '<span class="tag" aria-hidden="true">' + icon + "</span>" : "");
      b.setAttribute("aria-label", "Türchen " + day + (open ? "" : ", noch verschlossen"));
    }
    b.addEventListener("click", () => openDoor(day));
    grid.appendChild(b);
  });
  $("#progress").textContent = done + " / 24 erledigt";
}

export function refreshGrid() { if ($("#grid")) renderCalendar(); }

// ---------- Türchen öffnen ----------
async function openDoor(day) {
  const o = state.overview[day] || {};
  const open = o.is_open || state.preview;
  const color = colorFor(day);
  if (!open) {
    const body = openDialog({ title: day + ". Dezember", color });
    body.innerHTML = '<p class="locked-msg">Nicht schummeln! 🙈<br>Dieses Türchen öffnet sich am <b>' + day + ". Dezember</b>.</p>";
    return;
  }
  const body = openDialog({ title: day + ". Dezember", chip: KIND_LABEL[o.kind] || "", color, onClose: refreshGrid });
  // Der Server liefert das Türchen nur, wenn es offen ist (oder du Admin bist).
  const { data: door, error } = await sb.from("doors").select("*").eq("day", day).maybeSingle();
  if (error || !door) {
    body.innerHTML = '<p class="locked-msg">' + (error ? "Konnte nicht geladen werden. Bist du online?" : "Hier ist noch nichts drin. 🤷") + "</p>";
    return;
  }
  const chip = $(".chip", $("#card"));
  if (chip && door.category) chip.textContent = door.category;
  const ctx = { day, door, body, overview: o };
  if (door.kind === "rueckblick") buildRecap(ctx);
  else if (door.kind === "foto" || door.kind === "zeichnen") buildChallenge(ctx);
  else buildRiddle(ctx);
}

// Wenn der Tag wechselt, während die App offen ist: Raster neu laden
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.profile && !location.hash) refreshGrid();
});

route();

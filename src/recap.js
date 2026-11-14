import { sb } from "./supabase.js";
import { $, onCleanup } from "./ui.js";

// Türchen 24: das Video der Brunchies.
// Es liegt nicht im Code, sondern geschützt im Supabase-Speicher („videos“).
// Die Datenbank gibt es erst ab dem 24. Dezember heraus (Admins vorher schon).
const VIDEO_BUCKET = "videos";
const VIDEO_PATH = "rueckblick-2026.mp4";

export async function buildRecap({ body }) {
  body.innerHTML =
    '<div class="video-frame"><video id="recapVideo" controls playsinline preload="metadata"></video></div>' +
    '<a class="btn ghost" id="dlBtn" hidden>Video speichern</a>' +
    '<p class="feedback" id="feedback" aria-live="polite">Lädt …</p>';

  const video = $("#recapVideo", body), dl = $("#dlBtn", body), fb = $("#feedback", body);
  onCleanup(() => { video.pause(); video.removeAttribute("src"); video.load(); });

  const store = sb.storage.from(VIDEO_BUCKET);
  const [view, save] = await Promise.all([
    store.createSignedUrl(VIDEO_PATH, 60 * 60 * 3),
    store.createSignedUrl(VIDEO_PATH, 60 * 60 * 3, { download: "Brunchies-2026.mp4" }),
  ]);
  if (view.error) {
    fb.textContent = "Das Video ist noch nicht da. Schau später noch mal vorbei.";
    $(".video-frame", body).hidden = true;
    return;
  }
  video.src = view.data.signedUrl;
  fb.textContent = "";
  if (!save.error) { dl.href = save.data.signedUrl; dl.hidden = false; }
}

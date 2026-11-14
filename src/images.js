// Bilder vor dem Hochladen verkleinern (spart Speicher und mobiles Datenvolumen).

const MAX_SIDE = 1280;     // längste Seite in Pixeln
const MAX_BYTES = 450_000; // Ziel: höchstens ~450 KB pro Bild

function canvasToBlob(cv, quality) {
  return new Promise(res => cv.toBlob(b => res(b), "image/jpeg", quality));
}

async function decode(file) {
  // createImageBitmap dreht Handyfotos automatisch richtig herum
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* Fallback */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild nicht lesbar")); };
    im.src = url;
  });
}

export async function shrinkImage(file) {
  const im = await decode(file);
  const w = im.width, h = im.height;
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * s); cv.height = Math.round(h * s);
  const cx = cv.getContext("2d");
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
  cx.drawImage(im, 0, 0, cv.width, cv.height);
  if (im.close) im.close();
  let q = 0.82;
  let blob = await canvasToBlob(cv, q);
  while (blob && blob.size > MAX_BYTES && q > 0.4) { q -= 0.1; blob = await canvasToBlob(cv, q); }
  if (!blob) throw new Error("Bild konnte nicht umgewandelt werden");
  return blob;
}

export function exportCanvas(cv) { return canvasToBlob(cv, 0.88); }

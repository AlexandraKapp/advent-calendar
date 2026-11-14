// Sektflaschen als Türchen: Zeichnung, Korken-Knall und Merken, welche Flasche schon offen ist.

// Die Flasche als SVG. Das Etikett bekommt die Türchen-Farbe (--c), die Zahl steht darauf.
export function bottleSVG(day) {
  return (
    '<svg class="bottle" viewBox="0 0 60 124" aria-hidden="true" focusable="false">' +
      // Sprudel, der aus offenen Flaschen aufsteigt
      '<g class="fizz">' +
        '<circle cx="27" cy="14" r="3.4"/><circle cx="34" cy="8" r="2.8"/><circle cx="28" cy="1" r="2.3"/>' +
      "</g>" +
      // Korken mit Drahtkörbchen (fliegt beim Öffnen weg)
      '<g class="cork">' +
        '<path class="cork-body" d="M24.5 19 L24 9 Q24 3 30 3 Q36 3 36 9 L35.5 19 Z"/>' +
        '<path class="wire" d="M24.5 13 H35.5 M27 19 L28 4.5 M33 19 L32 4.5"/>' +
      "</g>" +
      // Glas
      '<path class="glass" d="M24 19 H36 V45 C36 54 51 57 51 70 V112 Q51 120 44 120 H16 Q9 120 9 112 V70 C9 57 24 54 24 45 Z"/>' +
      '<rect class="shine" x="13" y="66" width="4.5" height="40" rx="2.25"/>' +
      // Goldfolie am Hals
      '<path class="foil" d="M23 18 H37 V40 L34.7 43 L32.3 40 L30 43 L27.7 40 L25.3 43 L23 40 Z"/>' +
      // Etikett mit Zahl
      '<rect class="label" x="12" y="74" width="36" height="30" rx="5"/>' +
      '<text class="label-num" x="30" y="96" text-anchor="middle">' + day + "</text>" +
    "</svg>"
  );
}

// ---------- Merken, welche Flaschen schon geknallt haben (nur Komfort, pro Gerät) ----------
const KEY = "brunchies-korken";
function readPopped(userId) {
  try { return JSON.parse(localStorage.getItem(KEY + ":" + userId) || "[]"); } catch { return []; }
}
export function wasPopped(userId, day) { return readPopped(userId).includes(day); }
export function rememberPopped(userId, day) {
  try {
    const list = readPopped(userId);
    if (!list.includes(day)) { list.push(day); localStorage.setItem(KEY + ":" + userId, JSON.stringify(list)); }
  } catch { /* privater Modus o. ä.: dann knallt es eben beim nächsten Mal noch einmal */ }
}

// ---------- Korken knallen lassen ----------
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Spielt Animation + Geräusch und löst auf, wenn man das Türchen öffnen kann.
export function popCork(btn) {
  playPop();
  if (reduceMotion()) { btn.classList.add("uncorked"); return Promise.resolve(); }
  btn.classList.add("popping");
  // Ein paar Spritzer/Konfetti aus dem Flaschenhals
  const burst = document.createElement("span");
  burst.className = "burst";
  burst.setAttribute("aria-hidden", "true");
  const colors = ["#ffcc1a", "#ff3ea5", "#00bfc4", "#fffaf0", "#9d7bff", "#3ddc84"];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("i");
    const ang = (-90 + (Math.random() * 120 - 60)) * Math.PI / 180;
    const dist = 50 + Math.random() * 70;
    s.style.setProperty("--x", Math.cos(ang) * dist + "px");
    s.style.setProperty("--y", Math.sin(ang) * dist + "px");
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 60 + "ms";
    burst.append(s);
  }
  const plopp = document.createElement("span");
  plopp.className = "plopp"; plopp.textContent = "PLOPP!"; plopp.setAttribute("aria-hidden", "true");
  btn.append(burst, plopp);
  return new Promise(res => setTimeout(() => {
    btn.classList.remove("popping");
    btn.classList.add("uncorked");
    burst.remove(); plopp.remove();
    res();
  }, 620));
}

// „Plopp!“ – kurz synthetisiert, keine Audiodatei nötig.
let audioCtx;
export function playPop() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx, t = ctx.currentTime;
    // dumpfer Plopp
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.18);
    // Zischen danach
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "highpass"; bp.frequency.value = 3500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    noise.connect(bp).connect(ng).connect(ctx.destination);
    noise.start(t + 0.04);
  } catch { /* ohne Ton geht's auch */ }
}

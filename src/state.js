// Gemeinsamer Zustand der App (wer ist angemeldet, ist sie Admin, …)
export const state = {
  session: null,
  userId: null,
  profile: null,   // { id, name }
  isAdmin: false,
  preview: false,  // Admin-Vorschau: alle Türchen offen
  overview: {},    // day -> { kind, is_open, is_revealed, done, count }
};

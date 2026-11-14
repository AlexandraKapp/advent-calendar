import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  document.getElementById("app").innerHTML =
    '<p class="lede">Die App ist noch nicht mit Supabase verbunden. Trag VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY ein (siehe ANLEITUNG.md).</p>';
  throw new Error("Supabase-Zugangsdaten fehlen");
}

export const sb = createClient(url, key, {
  auth: {
    // Angemeldet bleiben: Die Sitzung liegt im Browser und wird automatisch
    // erneuert. So muss sich niemand im Dezember neu anmelden.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // "implicit": Der Link aus der Mail funktioniert auch, wenn er in einem
    // anderen Browser aufgeht als dem, in dem die Mail angefordert wurde.
    flowType: "implicit",
    storageKey: "brunchies-login",
  },
});

export const BUCKET = "posts";

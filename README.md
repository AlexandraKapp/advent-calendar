# 🥂🎄 Brunchies-Adventskalender

Ein Online-Adventskalender für unsere Brunch-Gruppe: 24 Türchen im Dezember 2026 mit
Emoji-Rätseln, Worträtseln, Foto- und Zeichen-Challenges und am 24. einem automatischen
Video-Rückblick aus allen Fotos und Zeichnungen der Gruppe.

Gestaltet im Stil **Brunch × Weihnachten × 90er**: Memphis-Muster, knallige Farben,
Popups im Windows-95-Look und Retro-Schriften. Gebaut für das Handy, läuft aber auch am Rechner.

## So funktioniert's

| Türchen | Was man macht | Was man sieht |
|---|---|---|
| 🧩 **Emoji-Rätsel** (Filme & Serien) und 📝 **Worträtsel** | Antwort eintippen, bis Mitternacht änderbar | Die Antworten der anderen (mit Namen) erst nach der eigenen. Am nächsten Tag um 0:00 die Lösung, jede Antwort mit ✔ oder ✘ |
| 📸 **Foto-Challenge** | Foto aufnehmen oder aus der Galerie wählen; es wird vor dem Hochladen verkleinert | Die Galerie der anderen erst nach dem eigenen Beitrag. Eigene Beiträge lassen sich löschen |
| ✏️ **Zeichen-Challenge** | Im Browser mit dem Finger zeichnen, mit Countdown ab dem ersten Strich | wie bei der Foto-Challenge |
| 🎬 **Rückblick (24.)** | Video abspielen, als Datei speichern oder teilen | alle Fotos und Zeichnungen der Gruppe |

- **Anmeldung ohne Passwort:** E-Mail eingeben, auf den Link in der Mail tippen (oder den Code eingeben), Namen wählen, fertig. Man bleibt den ganzen Monat angemeldet.
- **Admin-Bereich:** Türchen und Lösungen bearbeiten, Vorschau mit allen offenen Türchen, alles löschen, Bewertungen von Hand korrigieren.

## Keine Chance zum Spicken 🙈

Rätsel und Lösungen stehen **nicht** in diesem Repository und auch nicht im Code, den der
Browser lädt. Sie liegen nur in der Datenbank. Die Datenbank entscheidet selbst
(Row Level Security, Zeitzone Europe/Berlin), was jemand sehen darf:

- ein Türchen erst ab 0:00 an seinem Tag
- die Lösung erst ab 0:00 am Folgetag
- fremde Antworten und Fotos erst nach dem eigenen Beitrag

Wer im Browser herumtrickst, bekommt trotzdem nichts zu sehen.

## Technik

Kostenlos für eine Gruppe von 10 bis 20 Leuten:

- **[Vite](https://vite.dev)** mit schlichtem HTML, CSS und JavaScript, ohne Framework
- **[Supabase](https://supabase.com)**: Postgres-Datenbank, Login per Magic Link, Bilder-Speicher
- **[Vercel](https://vercel.com)**: Hosting; jede Änderung auf GitHub geht automatisch online

```
index.html              Grundgerüst der Seite
src/
  main.js               Ablauf: Login → Name → Kalender
  auth.js               Anmeldung per Magic Link / Code, Name festlegen
  riddle.js             Rätsel-Türchen
  challenge.js          Foto- und Zeichen-Challenges
  recap.js              Video-Rückblick (Tür 24) inkl. Download
  admin.js              Admin-Bereich
  images.js             Bilder verkleinern
  style.css             Das komplette Design
supabase/
  migrations/           Datenbank-Tabellen und Sicherheitsregeln
  templates/            Login-Mail auf Deutsch
private/                (nicht im Repo) Türchen-Inhalte und Lösungen
```

## Online stellen

Die Schritt-für-Schritt-Anleitung (Supabase, Vercel, Freunde einladen, Rätsel bearbeiten)
steht in **[ANLEITUNG.md](ANLEITUNG.md)**.

## Lokal entwickeln

Voraussetzungen: Node.js, Docker Desktop, [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
npm install
supabase start          # lokale Test-Datenbank (inkl. Test-Postfach unter http://127.0.0.1:54324)
cp .env.example .env    # API-URL und anon key aus "supabase status" eintragen
npm run dev             # http://localhost:5173
```

---

Gemacht mit ☕, 🥞 und 🎄 für die Brunchies.

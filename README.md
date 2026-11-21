# Brunchies-Adventskalender

Ein Online-Adventskalender für unsere Brunch-Gruppe: 24 Türchen im Dezember 2026 mit
Emoji-Rätseln, Worträtseln, Foto- und Zeichen-Challenges. Was hinter welchem Türchen steckt,
bleibt bis zum Öffnen eine Überraschung.

Online unter **<https://brunchies-advent.vercel.app>**. Gebaut für das Handy, läuft aber auch am Rechner.

## So sieht es aus

Jedes Türchen ist eine Sektflasche. Vergangene Tage sind schon offen und sprudeln, zukünftige
sind verkorkt und haben ein Schloss. Öffnet man das Türchen des Tages, knallt der Korken
(mit Konfetti und Plopp-Geräusch). Dahinter liegt ein Pixel-Muster mit Weihnachtsmotiven.

## So funktioniert's

| Türchen | Was man macht | Was man sieht |
|---|---|---|
| **Emoji-Rätsel** (Filme & Serien) und **Worträtsel** | Antwort eintippen, ein Versuch | Direkt nach der eigenen Antwort die Lösung und die Antworten der anderen (mit Namen), jede mit ✔ oder ✘ |
| **Foto-Challenge** | Foto aufnehmen oder aus der Galerie wählen; es wird vor dem Hochladen verkleinert | Die Galerie der anderen erst nach dem eigenen Beitrag. Eigene Beiträge lassen sich löschen |
| **Zeichen-Challenge** | Im Browser mit dem Finger zeichnen, mit Countdown ab dem ersten Strich | wie bei der Foto-Challenge |
| **Schätzfrage** | Eine Zahl schätzen, ein Versuch | Direkt danach die richtige Zahl und eine Rangliste, wer am nächsten dran ist |

- **Anmeldung ohne Passwort:** E-Mail eingeben, auf den Link in der Mail tippen (oder den Code eingeben), Namen wählen, fertig. Man bleibt den ganzen Monat angemeldet.
- **Reaktionen:** Auf Antworten und Beiträge ohne richtig oder falsch (Fotos, Zeichnungen, Captions, freie Fragen) kann man mit beliebigen Emojis reagieren (höchstens 3 pro Person und Antwort), aber nicht auf die eigenen.
- **Gesamtwertung:** Rätsel richtig 2 Punkte, Platz 1–3 bei Schätzfrage und Spielen 3/2/1, jede Challenge 1 Punkt, jede bekommene Reaktion 1 Punkt.
- **Admin-Bereich:** Türchen und Lösungen bearbeiten, Vorschau mit allen offenen Türchen, nach dem Testen alles zurücksetzen, Bewertungen von Hand korrigieren.

## Keine Chance zum Spicken

Rätsel, Lösungen und Überraschungen stehen **nicht** in diesem Repository und auch nicht im Code,
den der Browser lädt. Sie liegen nur in Supabase. Die Datenbank entscheidet selbst
(Row Level Security, Zeitzone Europe/Berlin), was jemand sehen darf:

- ein Türchen (auch welche Art es ist) erst ab 0:00 an seinem Tag
- die Lösung erst, nachdem man selbst geantwortet hat (danach lässt sich die Antwort nicht mehr ändern)
- fremde Antworten und Fotos erst nach dem eigenen Beitrag

Wer im Browser herumtrickst, bekommt trotzdem nichts zu sehen.

## Technik

Kostenlos für eine Gruppe von 10 bis 20 Leuten:

- **[Vite](https://vite.dev)** mit schlichtem HTML, CSS und JavaScript, ohne Framework
- **[Supabase](https://supabase.com)**: Postgres-Datenbank, Login per Magic Link, Speicher für Bilder
- **[Vercel](https://vercel.com)**: Hosting
- **GitHub Actions**: Bei jedem Push auf `main` werden erst neue Datenbank-Migrationen zu Supabase gebracht, danach wird die Seite auf Vercel veröffentlicht

```
index.html              Grundgerüst der Seite
src/
  main.js               Ablauf: Login → Name → Kalender
  bottle.js             Sektflaschen-Türchen mit Korkenknall
  auth.js               Anmeldung per Magic Link / Code, Name festlegen
  riddle.js             Rätsel-Türchen
  challenge.js          Foto- und Zeichen-Challenges
  recap.js              Tür 24
  admin.js              Admin-Bereich
  images.js             Bilder verkleinern
  style.css             Das komplette Design
public/bg-pixel.svg     Pixel-Hintergrund
supabase/
  migrations/           Datenbank-Tabellen, Speicher und Sicherheitsregeln
  templates/            Login-Mail auf Deutsch
.github/workflows/      Pipeline: erst Supabase, dann Vercel
vercel.json             Vercel-Einstellungen (veröffentlicht wird nur über die Pipeline)
private/                (nicht im Repo) Türchen-Inhalte und Lösungen
```

## Online stellen

Die Schritt-für-Schritt-Anleitung (Supabase, Pipeline, Freunde einladen, Rätsel bearbeiten) steht in **[ANLEITUNG.md](ANLEITUNG.md)**.

## Lokal entwickeln

Voraussetzungen: Node.js, Docker Desktop, [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
npm install
supabase start          # lokale Test-Datenbank (inkl. Test-Postfach unter http://127.0.0.1:54324)
cp .env.example .env    # API-URL und anon key aus "supabase status" eintragen
npm run dev             # http://localhost:5173
```

---

Gemacht für die Brunchies.

# 🥂 Brunchies-Adventskalender – Schritt-für-Schritt-Anleitung

Diese Anleitung bringt den Kalender online. Du brauchst etwa 30–45 Minuten.
Alles ist für eure Gruppe kostenlos.

**So hängt alles zusammen:**

- **GitHub** speichert den Code der App. Das Repo ist öffentlich, deshalb stehen dort **keine Rätsel und keine Lösungen**.
- **Supabase** ist die Datenbank. Dort liegen Türchen, Lösungen, Antworten, Fotos und die Logins. Supabase entscheidet auch, wer wann was sehen darf.
- **Vercel** stellt die Webseite ins Internet. Jede Änderung auf GitHub geht automatisch online.

---

## Teil 1: Supabase einrichten

### 1.1 Projekt anlegen
1. Geh auf <https://supabase.com/dashboard> und klick auf **New project**.
2. Name: `brunchies`. Region: **Central EU (Frankfurt)**. Das Datenbank-Passwort brauchst du nicht weiter, notier es dir aber sicherheitshalber.
3. Warte etwa 2 Minuten, bis das Projekt fertig ist.

### 1.2 Datenbank-Tabellen anlegen
1. Links im Menü: **SQL Editor** → **New query**.
2. Öffne im Projektordner die Datei `supabase/migrations/20261114000000_kalender.sql`, kopiere den **ganzen** Inhalt und füge ihn ein.
3. Klick auf **Run**. Unten sollte „Success“ stehen.

> Alternativ im Terminal (wenn Claude das für dich macht): `supabase login`, `supabase link`, `supabase db push`.

### 1.3 Türchen-Inhalte einspielen
1. Wieder im **SQL Editor** → **New query**.
2. Öffne die Datei `private/tuerchen.sql`. Sie liegt nur auf deinem Rechner und nicht auf GitHub. Kopiere ihren Inhalt hinein → **Run**.
3. Später kannst du alles bequem im Admin-Bereich der App ändern.

### 1.4 E-Mail-Versand (dein SMTP-Server)
Der eingebaute Mailversand von Supabase schafft nur wenige Mails pro Stunde. Darum nimmst du deinen eigenen SMTP-Server:
1. **Authentication** → **Emails** → Reiter **SMTP Settings** → **Enable Custom SMTP** einschalten.
2. Trag Absender-Adresse, Absender-Name (z. B. `Brunchies-Adventskalender`), Host, Port, Benutzername und Passwort deines Mailanbieters ein. Das machst du selbst, Claude bekommt das Passwort nicht. → **Save**.
3. **Authentication** → **Rate Limits**: Setz „Rate limit for sending emails“ auf z. B. `60` pro Stunde.

### 1.5 Login-Mail auf Deutsch
1. **Authentication** → **Emails** → Reiter **Templates** → **Magic Link**.
2. Betreff: `Dein Login für den Brunchies-Adventskalender 🎄`
3. Inhalt: Kopiere den Inhalt von `supabase/templates/magic_link.html` hinein → **Save**.
   Die Mail enthält dann einen Knopf **und** einen 6-stelligen Code. Der Code hilft, wenn der Link im falschen Browser aufgeht.

### 1.6 Wie lange man angemeldet bleibt
Supabase merkt sich die Anmeldung im Browser und erneuert sie automatisch. Wer sich einmal angemeldet hat, bleibt angemeldet, solange er nicht auf „Abmelden“ tippt oder die Browserdaten löscht.
- Prüf unter **Authentication** → **Sessions**, dass **Time-box user sessions** und **Inactivity timeout** auf `0` (aus) stehen. Das ist der Normalfall.
- Der Link in der Mail selbst gilt 1 Stunde. Das ist gewollt, er ist nur zum ersten Anmelden da.

### 1.7 Die zwei Verbindungswerte holen
**Project Settings** → **API** (bzw. **API Keys**). Du brauchst:
- **Project URL**, z. B. `https://abcdefgh.supabase.co`
- **anon / publishable key**, eine lange Zeichenkette

Diese beiden Werte sind **nicht geheim** und dürfen im Browser stehen. Den Schutz übernehmen die Regeln in der Datenbank.
⚠️ Den **service_role / secret key** gibst du niemals heraus und trägst ihn nirgends ein.

---

## Teil 2: Code auf GitHub hochladen

Im Terminal im Projektordner (oder Claude macht das für dich):
```bash
git add .
git commit -m "Adventskalender-App"
git push
```
Kontrolle: Auf <https://github.com/AlexandraKapp/advent-calendar> darf **kein** Ordner `private` auftauchen.

---

## Teil 3: Auf Vercel online stellen

1. Geh auf <https://vercel.com/new> und wähl dein Repo **advent-calendar** → **Import**.
2. Framework: **Vite**. Das erkennt Vercel normalerweise selbst.
3. Klapp **Environment Variables** auf und trag ein:
   - `VITE_SUPABASE_URL` = deine Project URL
   - `VITE_SUPABASE_ANON_KEY` = dein anon key
4. Klick auf **Deploy**. Nach etwa einer Minute bekommst du eine Adresse wie `https://advent-calendar-xyz.vercel.app`.
   Unter **Settings → Domains** kannst du sie kostenlos in etwas Schöneres ändern, z. B. `brunchies-advent.vercel.app`.

### 3.1 Supabase die Adresse verraten
Sonst führt der Link in der Mail ins Leere.
1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: deine Vercel-Adresse, z. B. `https://brunchies-advent.vercel.app`
3. **Redirect URLs** → **Add URL**: dieselbe Adresse noch einmal mit `/**` dahinter, z. B. `https://brunchies-advent.vercel.app/**` → **Save**.

---

## Teil 4: Dich zur Admin machen

1. Öffne deine Vercel-Adresse und melde dich mit deiner E-Mail an. Leg deinen Namen fest.
2. Supabase → **SQL Editor** → **New query**. Füg das ein und ersetz die E-Mail durch deine:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'deine@email.de';
   ```
   → **Run**.
3. Lad die App neu. Oben erscheinen jetzt **👀 Vorschau** (alle Türchen offen) und **🛠️ Admin** (Türchen bearbeiten, Leute entfernen).

**Testen vor Dezember:** Mit eingeschalteter Vorschau kannst du jedes Türchen öffnen, antworten und posten. Lösch deine Test-Beiträge danach wieder. Test-Antworten löschst du im Rätsel über 🗑.

---

## Teil 5: Freunde einladen

Schick der Gruppe einfach den Link, z. B. per WhatsApp:

> 🎄🥂 Unser Brunchies-Adventskalender ist da!
> 👉 https://brunchies-advent.vercel.app
> E-Mail eingeben, auf den Link in der Mail tippen, Namen wählen, fertig. Ab 1. Dezember geht jeden Tag ein Türchen auf!

**Gut zu wissen:**
- Jede Person mit dem Link kann sich anmelden. Wer nicht dazugehört, kannst du im Admin-Bereich wieder entfernen.
- Kommt keine Mail an: Spam-Ordner prüfen. Oder in der App den 6-stelligen Code aus der Mail eingeben.
- Tipp fürs Handy: Im Browser „Zum Home-Bildschirm hinzufügen“. Dann gibt es ein Symbol wie bei einer App.

---

## Rätsel bearbeiten

- **Am einfachsten:** In der App auf **🛠️ Admin** tippen, ein Türchen aufklappen, ändern, **Speichern**.
- **Lösung:** Wird am Folgetag um 0:00 angezeigt.
- **Gilt als richtig:** Begriffe mit Komma getrennt, z. B. `regenschirm, schirm, umbrella`. Umlaute, Groß/klein und Leerzeichen sind egal.
- Lag jemand „fast richtig“? Nach der Auflösung siehst du als Admin bei jeder Antwort ✔ / ✘ / auto und kannst die Bewertung von Hand ändern.
- Typ ändern geht jederzeit: Emoji-Rätsel, Worträtsel, Foto-Challenge, Zeichen-Challenge, Rückblick (Tür 24).

## Lokal ausprobieren (optional, für Technik-Neugierige)

Voraussetzung: Docker Desktop läuft.
```bash
npm install
supabase start          # lokale Test-Datenbank
cp .env.example .env    # dann die lokalen Werte aus "supabase status" eintragen
npm run dev             # App unter http://localhost:5173
```
Die Login-Mails landen lokal im Test-Postfach unter <http://127.0.0.1:54324>.

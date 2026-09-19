# J & J Wedding Quiz

A live dinner quiz for the wedding. Guests scan a QR code at their table, type a
team name, and answer on their phones. No login, no app, no accounts for anyone
but the two of you.

Three pages:

| Page | Who opens it | What it does |
| --- | --- | --- |
| `index.html` | guests, by scanning the QR | join with a team name, then answer |
| `host.html` | the laptop driving the projector | the big screen — QR, questions, timer, leaderboard |
| `admin.html` | you | build the quiz, then drive the evening |

Same palette and typefaces as the main wedding site (burgundy `#683240`, gold
`#C6A882`, dusty blue `#96B1C0`, Cormorant Garamond + Jost + Noto Sans KR), with
a deep burgundy treatment on the big screen and team colours drawn from the same
family. The guest pages are in English, French and Korean and share the language
choice with the main site. The admin console is English only.

---

## Try it right now, with no setup

Static pages with ES modules need to be served over HTTP, not opened from disk:

```sh
python -m http.server 8765
```

Then open <http://localhost:8765/admin.html>. With no Firebase configured the app
runs in **offline rehearsal mode**: everything works on this one device, shared
across browser tabs, so you can write the whole quiz and play it through before
you set anything up. Open `host.html` in a second tab and `index.html` in a third
to see all three sides at once.

Add `?offline=1` to any URL to force offline mode even after Firebase is
configured — useful for rehearsing without touching the real game.

Offline mode keeps everything in this browser's `localStorage`. It is for
rehearsal only: guests on their own phones need the Firebase setup below.

---

## Setting up Firebase (about ten minutes)

1. **Create a project** at <https://console.firebase.google.com>. The free
   Spark plan is far more than enough for one dinner.

2. **Create a Realtime Database** (not Firestore): Build → Realtime Database →
   Create database. Pick the region nearest the venue and start in *locked mode*
   — the rules below replace whatever it starts with.

3. **Turn on two sign-in methods**: Build → Authentication → Sign-in method →
   enable **Anonymous** (this is how guests join without a login) and
   **Email/Password** (this is how you sign in to the admin).

4. **Create your admin user**: Authentication → Users → Add user. Use any email
   and a password you will remember. Nobody ever emails this address.

5. **Register a web app**: Project settings → Your apps → Web (`</>`). Copy the
   `firebaseConfig` values into [`js/config.js`](js/config.js), and put the admin
   email in `ADMIN_EMAIL`:

   ```js
   export const FIREBASE = {
     apiKey: 'AIza…',
     authDomain: 'your-project.firebaseapp.com',
     databaseURL: 'https://your-project-default-rtdb.europe-west1.firebasedatabase.app',
     projectId: 'your-project',
     appId: '1:…:web:…'
   };
   export const ADMIN_EMAIL = 'you@example.com';
   ```

   These values are not secrets — they ship in every Firebase web app. The rules
   in the next step are what actually protects the data.

6. **Publish the rules**: open [`firebase-rules.json`](firebase-rules.json),
   replace every `ADMIN_EMAIL_HERE` with the same email, and paste the file into
   Realtime Database → Rules → Publish.

7. **Host the pages**: GitHub Pages works, same as the other two wedding sites.
   Firebase will refuse connections from an unknown domain until you add it under
   Authentication → Settings → Authorized domains.

---

## What the rules guarantee

- The quiz **with the answers in it** lives at `quiz` and only your signed-in
  account can read it. Guests read `pub`, a copy with every correct answer
  stripped out — so nobody can read ahead by opening developer tools.
- A guest can write **their own** team record and **their own** answer, and
  nothing else. They cannot write `pts` or `state`, so no phone can award itself
  points. All grading happens in the admin console.
- Answers are only accepted while you have a question open. A timed question
  closes itself at the buzzer even if you are looking the other way.
- Knowingly accepted: answers are world-readable, because the big screen is not
  signed in and needs to show who got it right. Someone with developer tools open
  could read another table's answer during a question. At a wedding dinner this
  seemed a fair trade for a projector that needs no password.

---

## Writing the quiz

**Build the quiz** → add rounds, add questions. Three kinds:

- **Multiple choice** — two to eight options, tap the circle to mark the right
  one. Scored automatically.
- **Exact answer** — guests type it. Scored automatically, ignoring case,
  accents, punctuation and a leading *the* / *le*, and forgiving small typos
  (answers under five letters still have to be exact). Put genuinely different
  acceptable answers on their own lines.
- **Free text** — anything goes. These queue up in the Run pane and you award
  the points yourself: nothing, half, or full.

Each question has its own points and its own timer (`0` seconds = no timer).
English is the only language you have to fill in; French and Korean fall back to
English on the guest's phone when left empty.

**Save & publish** is what makes changes visible to guests. **Export** writes a
JSON file you can keep as a backup or hand-edit; **Import** reads it back.
[`samples/sample-quiz.json`](samples/sample-quiz.json) is a three-round starter
in all three languages — import it and edit the facts.

---

## Running it on the night

Open `admin.html` on your phone or a laptop, and `host.html` on whatever is
driving the projector (press <kbd>F</kbd> there for fullscreen). The big screen
shows the QR code until you start.

The console always offers one obvious next step:

```
Start the quiz → Show the first question → Close answers → Reveal the answer
              → Next question → … → Show the round scores → Start the next round
              → … → Show the final scores → Finish the quiz
```

Underneath it is a row of escape hatches — Previous, Next, Reopen answers,
Reveal, Round scores, Final scores, Lobby, End quiz — so you can jump anywhere if
the evening does not go to plan.

**Reveal** is what scores the automatic questions, so always press it, even if
you have already read the answer out.

The **Tables** pane has the join link and QR code to print on table cards, lets
you rename or remove a table, nudge anyone's score by a point, and clear
everything between the rehearsal and the real thing.

---

## Layout

```
index.html      guest phone
host.html       big screen
admin.html      build + run console
css/
  quiz.css      palette, shared chrome, guest screens
  host.css      the dark big-screen treatment
  admin.css     console
js/
  config.js     ← the only file you have to edit
  model.js      quiz shape, answer matching, scoring
  store.js      Firebase and offline drivers behind one interface
  i18n.js       EN / FR / KO for the guest pages
  ui.js         team colours, countdown ring, confetti, toasts
  play.js       guest phone
  host.js       big screen
  admin.js      auth, tabs, publishing
  admin-build.js
  admin-run.js  running the game, judging, tables
firebase-rules.json
samples/sample-quiz.json
tests/          open these in a browser; they print pass/fail
```

`tests/game.html` plays a whole quiz through the real admin code — joining,
answering, auto-grading, hand-judging, scores. `tests/guest.html` does the same
for the guest page. Serve the folder and open them; every line should start with
`ok`.

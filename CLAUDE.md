# CLAUDE.md — j-j-wedding-quiz

A live quiz guests play on their phones during the J&J wedding dinner
(10·10·2026, Provence). Third sibling of `j-j-wedding` (the guest info site) and
`j-j-wedding-onsite` (room lookup), all by the same couple, all static sites.

## The shape of it

Three entry points, no build step, no framework, ES modules served as files.

| Page | Opened by | Controller |
| --- | --- | --- |
| `index.html` | guests, via QR | `js/play.js` |
| `host.html` | the projector laptop | `js/host.js` |
| `admin.html` | the couple | `js/admin.js` + `admin-build.js` + `admin-run.js` |

Shared: `model.js` (quiz shape, answer matching, scoring), `store.js` (data
layer), `i18n.js` (EN/FR/KO, guest pages only), `ui.js` (team identity,
countdown ring, confetti, toasts), `config.js` (the only file with settings).

## Two invariants — do not break these

**1. The answers never reach a guest's browser.** The full quiz lives at
`rooms/<room>/quiz` and only the admin UID can read it. `admin.js` publishes a
stripped projection to `rooms/<room>/pub` — same prompts and options, with
`correct`, `accept`, `fuzzy` and `note` removed. `play.js` and `host.js` read
**only** `pub`. If you add a field to a question, decide deliberately whether it
belongs in `projection()` in `admin.js`.

**2. Guests never score themselves.** A phone writes only `{name, value, at}` to
`answers/<r>-<q>/<uid>`. `pts`, `state` and `manual` are admin-only, enforced in
`database.rules.json`. Grading happens in `doReveal()` in `admin-run.js`.
Re-revealing must never overwrite a hand-judged answer (the `manual` flag).

`tests/live-rules.mjs` proves both against the live database. Run it after any
rules change.

## Data model

```
rooms/<ROOM>/
  quiz     full quiz incl. answers      admin read+write only
  pub      stripped projection          world read, admin write
  state    { phase, r, q, open, startedAt, endsAt, scope, reveal }
  teams/<uid>         { name, at }      own uid write; admin write
  answers/<r>-<q>/<uid>  { name, value, at, pts?, state?, manual? }
  adjust/<uid>        manual +/- points admin only
```

`phase` is one of `lobby | ready | question | reveal | scores | ended`.
Scores are **always derived** (`computeScores`) from answers + adjust — there is
no stored total, so re-judging can never leave a stale number.

## Store layer

`store.js` presents one interface with two drivers, chosen automatically:

- **firebase** when `config.js` has an `apiKey` — Realtime Database, guests sign
  in anonymously, admin with email/password.
- **offline** otherwise, or with `?offline=1` on any URL — localStorage +
  BroadcastChannel, everything works on one device across tabs.

`?offline=1` is the fastest way to work on this repo: no network, no account,
and it cannot touch the real game. Prefer it for everything except rules work.

## Rendering discipline (easy to break)

- `play.js` and `host.js` repaint only when a **signature** changes, and patch
  live bits (scores, answer counts) in place. Repainting on every data change
  would wipe a half-typed answer and restart the countdown ring.
- `admin.js`'s `refresh(reason)` takes `'quiz' | 'game' | 'all'`. A team joining
  is `'game'` and must **not** rebuild the Build pane — that would yank the
  cursor out of the question being typed. Text inputs in the builder write
  straight into `ctx.quiz` and call `markDirty()`, which never re-renders.
- `i18n.js`: `apply()` translates the DOM and must **not** dispatch
  `jj:langchange`. Only `setLang()` does. (Dispatching from `apply()` caused an
  infinite recursion with `play.js`'s listener.)
- `normalise()` in `model.js` ends with `.normalize('NFC')` on purpose: NFD
  splits Hangul into jamo, which breaks Korean comparison and typo distance.

## Firebase

Project `jj-wedding-quiz` (europe-west1), owned by aerojim92@gmail.com, Spark
plan. Rules gate on the admin **UID** `nVysUWEmeiRNEPmUqD0KUnnR31T2`, not an
email, so nothing personal sits in a public repo. `spykkee.github.io` is an
authorized domain already.

```sh
firebase deploy --only database                       # after editing rules
JJQ_ADMIN_PW="…" node tests/live-rules.mjs            # re-prove the boundaries
```

## Tests

```sh
python -m http.server 8765
# then open:
#   http://localhost:8765/tests/game.html    38 checks, admin + game loop
#   http://localhost:8765/tests/guest.html   18 checks, guest page
node tests/live-rules.mjs                  # 25 checks, live rules (needs the pw)
```

The browser tests print `ok` / `FAIL` lines into a `<pre>`; they drive the real
modules with real DOM events rather than mocking. Headless:

```sh
"$HOME/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe" \
  --no-sandbox --disable-gpu --user-data-dir=/tmp/p --virtual-time-budget=12000 \
  --dump-dom http://127.0.0.1:8765/tests/game.html
```

(The Playwright MCP server is configured for a Chrome install that isn't on this
machine; the bundled headless shell above works.)

## Conventions

- Vanilla ES modules, no dependencies, no build. The only external scripts are
  the Firebase SDK from gstatic and `qrcodejs` from cdnjs.
- Match the existing comment style: a block at the top of each file saying what
  it is for and why, then sparse inline comments that explain reasoning, not
  mechanics.
- British spelling in code comments (`normalise`, `colour` in prose) but
  American in CSS properties obviously.
- Escape anything user-authored with `escapeHtml` before putting it in
  `innerHTML` — team names come from guests.
- The palette is inherited from `../j-j-wedding/css/styles.css`. Don't invent
  new hues; extend from `--burg`, `--gold`, `--blue`, and the team colours in
  `ui.js`.
- Guest pages are EN/FR/KO via `data-i18n`; the admin console is English only,
  deliberately.

## Still open

- No git remote yet. The user's convention (see their memory) is that "push" or
  "merge" means land on `main` and go live — not open a PR.
- The real quiz content has not been written; `samples/sample-quiz.json` is a
  placeholder starter with invented facts.
- Answers are world-readable by design, so the unauthenticated big screen can
  show who got it right. Accepted trade-off, documented in the rules file.

/* ---------------------------------------------------------------------------
   Admin console — the couple's side of the quiz.

   Three panes:
     Run      drive the evening: show a question, close it, reveal, judge, score
     Build    write the quiz: rounds, questions, answers, points, timers
     Tables   the teams that joined, their scores, and the join link

   The full quiz (with the correct answers in it) is stored at 'quiz' and is
   readable only by this signed-in account. A stripped copy without any answers
   is published to 'pub' for the guests and the big screen — so nobody can read
   the answers out of the database before the question is asked.
   --------------------------------------------------------------------------- */

import { openStore, firebaseConfigured, forcedOffline } from './store.js';
import { ADMIN_EMAIL } from './config.js';
import { newQuiz, normaliseQuiz, countQuestions } from './model.js';
import { toast } from './ui.js';
import { renderBuild } from './admin-build.js';
import { renderRun, renderTables, maybeAutoClose } from './admin-run.js';

const store = openStore();

const gate = document.getElementById('gate');
const consolePane = document.getElementById('console');

export const ctx = {
  store,
  db: { state: null, teams: {}, answers: {}, adjust: {}, quiz: null },
  quiz: newQuiz(),          // working copy, may be ahead of what is published
  dirty: false,
  loaded: false,
  openCards: new Set(),     // which question cards are expanded in Build
  markDirty,
  publish,
  refresh,
  panes: {
    run: document.getElementById('pane-run'),
    build: document.getElementById('pane-build'),
    tables: document.getElementById('pane-tables')
  }
};

let activeTab = 'run';

boot();

/* --------------------------------------------------------------------- auth */

async function boot() {
  await store.ready();

  if (store.mode === 'offline') {
    /* No accounts offline — this is your own machine and your own browser. */
    start('offline rehearsal');
    return;
  }

  wireGate();
  store.onAdmin((email) => {
    if (email) start(email);
    else showGate();
  });
}

function showGate() {
  gate.classList.remove('hidden');
  consolePane.classList.add('hidden');
  const email = document.getElementById('gate-email');
  if (ADMIN_EMAIL && !email.value) email.value = ADMIN_EMAIL;
}

function wireGate() {
  const email = document.getElementById('gate-email');
  const pw = document.getElementById('gate-pw');
  const go = document.getElementById('gate-go');
  const err = document.getElementById('gate-err');

  async function signIn() {
    err.classList.remove('is-on');
    go.disabled = true;
    go.textContent = 'Signing in…';
    try {
      await store.signInAdmin(email.value.trim(), pw.value);
    } catch (e) {
      err.textContent = friendlyAuthError(e);
      err.classList.add('is-on');
    } finally {
      go.disabled = false;
      go.textContent = 'Sign in';
    }
  }

  go.addEventListener('click', signIn);
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') pw.focus(); });
}

function friendlyAuthError(e) {
  const code = (e && e.code) || '';
  if (code.indexOf('invalid-credential') !== -1 || code.indexOf('wrong-password') !== -1 ||
      code.indexOf('user-not-found') !== -1) {
    return 'That email and password did not match. Check them in the Firebase console, under Authentication.';
  }
  if (code.indexOf('too-many-requests') !== -1) return 'Too many attempts. Wait a minute and try again.';
  if (code.indexOf('network') !== -1) return 'No connection to Firebase. Check the network and try again.';
  return 'Could not sign in' + (code ? ' (' + code + ')' : '') + '.';
}

let started = false;

function start(who) {
  gate.classList.add('hidden');
  consolePane.classList.remove('hidden');
  document.getElementById('who').textContent =
    store.mode === 'offline' ? 'Offline rehearsal' : who;

  if (started) return;
  started = true;

  document.getElementById('signout').addEventListener('click', async () => {
    if (store.mode === 'offline') return toast('Offline mode has no sign-out.');
    if (ctx.dirty && !confirm('You have unsaved changes to the quiz. Sign out anyway?')) return;
    await store.signOutAdmin();
  });

  document.querySelectorAll('.tabbar__tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.getAttribute('data-tab');
      document.querySelectorAll('.tabbar__tab').forEach((other) =>
        other.classList.toggle('is-on', other === tab));
      Object.entries(ctx.panes).forEach(([name, pane]) =>
        pane.classList.toggle('is-on', name === activeTab));
      refresh('all');
    });
  });

  window.addEventListener('beforeunload', (e) => {
    if (!ctx.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  watchEverything();

  /* The clock is the only thing that changes without anyone touching a key.
     Closing writes to state, and the watcher redraws from there — so there is
     no periodic re-render fighting the buttons. */
  setInterval(() => maybeAutoClose(ctx), 1000);
}

/* ----------------------------------------------------------------- watching */

function watchEverything() {
  store.watch('quiz', (v) => {
    ctx.db.quiz = v;
    /* Never stomp on edits in progress — adopt the stored quiz only when this
       console has nothing unsaved. */
    if (!ctx.dirty) {
      ctx.quiz = v ? normaliseQuiz(v) : newQuiz();
      ctx.loaded = true;
      refresh('all');
    }
  });

  store.watch('state', (v) => {
    ctx.db.state = v;
    if (!v) initState();
    else refresh('game');
  });

  store.watch('teams', (v) => { ctx.db.teams = v || {}; refresh('game'); });
  store.watch('answers', (v) => { ctx.db.answers = v || {}; refresh('game'); });
  store.watch('adjust', (v) => { ctx.db.adjust = v || {}; refresh('game'); });

  store.onConnection((ok) => {
    if (!ok && store.mode === 'firebase') toast('Lost connection — reconnecting…', 'bad');
  });
}

async function initState() {
  try {
    await store.write('state', { phase: 'lobby', r: 0, q: 0, open: false });
  } catch (e) {
    console.error('[quiz] could not create the game state', e);
  }
}

/* ---------------------------------------------------------------- rendering */

let pendingFrame = null;
let pendingReason = null;

/* Several watchers fire in a burst; coalesce them into one repaint. The reason
   matters: a team joining must not rebuild the Build pane and yank the cursor
   out of whatever question is being typed. */
export function refresh(reason) {
  const why = reason || 'all';
  pendingReason = (pendingReason && pendingReason !== why) ? 'all' : why;
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    const now = pendingReason;
    pendingFrame = null;
    pendingReason = null;
    try {
      if (activeTab === 'build') {
        if (now !== 'game') renderBuild(ctx);
      } else if (activeTab === 'tables') {
        renderTables(ctx);
      } else {
        renderRun(ctx);
      }
    } catch (e) {
      console.error('[quiz] render failed', e);
    }
  });
}

/* ------------------------------------------------------------------- saving */

/* Called on every keystroke in the builder, so it must not re-render: it only
   flips the flag and updates the save bar in place. */
function markDirty() {
  ctx.dirty = true;
  const label = document.getElementById('savebar-state');
  if (label) label.textContent = 'Unsaved changes';
  const btn = document.getElementById('savebar-go');
  if (btn) btn.disabled = false;
}

/* Everything the guests and the big screen are allowed to see: prompts,
   options, points and timers — and nothing that gives the answer away. */
function projection(quiz) {
  return {
    title: quiz.title,
    rounds: quiz.rounds.map((round) => ({
      id: round.id,
      title: round.title,
      blurb: round.blurb,
      questions: round.questions.map((q) => {
        const out = {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          image: q.image || '',
          points: q.points,
          time: q.time
        };
        if (q.type === 'mc') out.options = q.options.map((o) => ({ id: o.id, text: o.text }));
        return out;
      })
    }))
  };
}

export async function publish() {
  const clean = normaliseQuiz(ctx.quiz);
  ctx.quiz = clean;
  try {
    await store.write('quiz', clean);
    await store.write('pub', projection(clean));
    ctx.dirty = false;
    toast('Saved · ' + countQuestions(clean) + ' questions live', 'good');
    refresh('all');
  } catch (e) {
    console.error('[quiz] save failed', e);
    toast('Could not save: ' + ((e && e.code) || 'unknown error'), 'bad');
  }
}

/* A visible nudge when the app is not actually talking to Firebase. */
if (!firebaseConfigured() || forcedOffline()) {
  const note = document.createElement('div');
  note.className = 'mode-flag';
  note.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50';
  note.textContent = forcedOffline() ? 'Forced offline' : 'Offline rehearsal mode';
  document.body.appendChild(note);
}

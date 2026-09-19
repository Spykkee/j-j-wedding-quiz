/* ---------------------------------------------------------------------------
   The guest phone: join with a team name, then answer whatever the admin puts
   on screen. No login, no install, no page changes — one document that follows
   the game state.

   Guests only ever read 'pub', the public projection of the quiz that carries
   no correct answers, and only ever write their own team record and their own
   answer value. Grading is done by the admin, so nothing here can award itself
   a point.
   --------------------------------------------------------------------------- */

import { openStore } from './store.js';
import { MAX_TEAM_NAME } from './config.js';
import { t, lang, apply as applyI18n, mountLangSwitch, points } from './i18n.js';
import {
  pick, answerKey, leaderboard, computeScores, normaliseQuiz
} from './model.js';
import {
  identity, escapeHtml, ring, ringMarkup, confetti, toast, show, suggestName
} from './ui.js';

const store = openStore();
const app = document.getElementById('app');
const standing = document.getElementById('standing');

const LETTERS = 'ABCDEFGH';

const db = {
  pub: null,
  state: null,
  teams: {},
  answers: {},
  adjust: {}
};

let me = null;                 // my team id
let joining = false;
let renameMode = false;
let sig = null;                // what is currently painted
let stopRing = null;
let lastVerdictShown = null;   // so confetti fires once per question

boot();

async function boot() {
  mountLangSwitch();
  document.addEventListener('jj:langchange', () => { sig = null; render(); });

  try {
    await store.ready();
    me = await store.signInGuest();
  } catch (e) {
    console.error('[quiz] sign-in failed', e);
    app.innerHTML = panelError(t('join.err.failed'));
    return;
  }

  store.watch('pub', (v) => { db.pub = v ? normaliseQuiz(v) : null; render(); });
  store.watch('state', (v) => { db.state = v || null; render(); });
  store.watch('teams', (v) => { db.teams = v || {}; render(); });
  store.watch('answers', (v) => { db.answers = v || {}; render(); });
  store.watch('adjust', (v) => { db.adjust = v || {}; render(); });

  store.onConnection((ok) => {
    if (!ok && store.mode === 'firebase') toast(t('ui.reconnecting'));
  });
}

/* ------------------------------------------------------------------ helpers */

function myTeam() { return me ? db.teams[me] : null; }
function phase() { return (db.state && db.state.phase) || 'lobby'; }
function pos() {
  const s = db.state || {};
  return { r: Number(s.r) || 0, q: Number(s.q) || 0 };
}
function currentQuestion() {
  if (!db.pub) return null;
  const { r, q } = pos();
  const round = db.pub.rounds[r];
  return round ? (round.questions[q] || null) : null;
}
function currentRound() {
  if (!db.pub) return null;
  return db.pub.rounds[pos().r] || null;
}
function myAnswer() {
  const { r, q } = pos();
  const byTeam = db.answers[answerKey(r, q)] || {};
  return me ? (byTeam[me] || null) : null;
}
function isOpen() {
  const s = db.state || {};
  if (!s.open) return false;
  if (s.endsAt && store.now() >= s.endsAt) return false;
  return true;
}

/* ----------------------------------------------------------------- painting */

/* Only repaint when the view genuinely changes — otherwise a half-typed answer
   would be wiped every time another table submits. */
function signature() {
  const s = db.state || {};
  const a = myAnswer();
  return [
    myTeam() ? 'in' : (renameMode ? 'rename' : 'out'),
    s.phase || 'lobby', s.r, s.q, s.open ? 1 : 0,
    s.endsAt || 0,
    s.reveal ? 1 : 0,
    a ? (a.state || 'sent') : 'none',
    a ? (a.pts == null ? '' : a.pts) : '',
    db.pub ? 'q' : 'noq',
    lang()
  ].join('|');
}

function render() {
  const next = signature();
  if (next !== sig) {
    sig = next;
    if (stopRing) { stopRing(); stopRing = null; }
    paint();
    applyI18n(app);
  }
  patchStanding();
}

function paint() {
  if (!myTeam() || renameMode) return paintJoin();
  switch (phase()) {
    case 'question': return paintQuestion();
    case 'reveal':   return paintReveal();
    case 'scores':   return paintScores();
    case 'ended':    return paintEnded();
    default:         return paintLobby();
  }
}

/* ---------------------------------------------------------------------- join */

function paintJoin() {
  const existing = renameMode && myTeam() ? myTeam().name : '';
  show(app,
    '<section class="panel">' +
      '<h1 class="h-display" data-i18n="join.h1">Pick a team name</h1>' +
      '<p class="lead" style="margin-top:.6rem" data-i18n="join.lead"></p>' +
      '<div style="margin-top:1.3rem">' +
        '<label class="field">' +
          '<span class="field__label" data-i18n="join.label">Your team name</span>' +
          '<input id="name" class="input" type="text" autocomplete="off" ' +
            'autocapitalize="words" enterkeyhint="go" maxlength="' + MAX_TEAM_NAME + '" ' +
            'data-i18n-attr="placeholder:join.ph" value="' + escapeHtml(existing) + '">' +
        '</label>' +
        '<div id="err" class="error" role="alert"></div>' +
        '<div class="row" style="margin-top:1rem;gap:9px">' +
          '<button id="go" class="btn btn--primary" style="flex:1" data-i18n="join.cta">Join the quiz</button>' +
          '<button id="shuffle" class="btn btn--ghost btn--sm" type="button" data-i18n="join.shuffle">Surprise me</button>' +
        '</div>' +
      '</div>' +
      (store.mode === 'offline'
        ? '<div style="margin-top:1rem"><span class="mode-flag" data-i18n="ui.offline"></span></div>'
        : '') +
    '</section>'
  );

  const input = app.querySelector('#name');
  const go = app.querySelector('#go');

  app.querySelector('#shuffle').addEventListener('click', () => {
    input.value = suggestName();
    input.focus();
  });
  go.addEventListener('click', submitJoin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoin(); });
  input.addEventListener('input', () => hideError());
  if (renameMode) input.focus();

  async function submitJoin() {
    if (joining) return;
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return showError(t('join.err.empty'));
    if (phase() === 'ended') return showError(t('join.err.closed'));

    const taken = Object.entries(db.teams).some(([id, team]) =>
      id !== me && String(team && team.name || '').toLowerCase() === name.toLowerCase());
    if (taken) return showError(t('join.err.taken'));

    joining = true;
    go.disabled = true;
    go.textContent = t('join.joining');
    try {
      await store.write('teams/' + me, { name, at: store.now() });
      renameMode = false;
      sig = null;
      render();
    } catch (e) {
      console.error('[quiz] join failed', e);
      showError(t('join.err.failed'));
      go.disabled = false;
      go.textContent = t('join.cta');
    } finally {
      joining = false;
    }
  }

  function showError(msg) {
    const box = app.querySelector('#err');
    box.textContent = msg;
    box.classList.add('is-on');
  }
  function hideError() {
    const box = app.querySelector('#err');
    if (box) box.classList.remove('is-on');
  }
}

/* --------------------------------------------------------------------- lobby */

function paintLobby() {
  const mine = myTeam();
  const id = identity(me);
  const others = Object.entries(db.teams)
    .sort((a, b) => (a[1].at || 0) - (b[1].at || 0));

  show(app,
    '<section class="panel" style="text-align:center">' +
      '<div style="font-size:42px;line-height:1">' + id.emoji + '</div>' +
      '<h1 class="h-display" style="margin-top:.4rem" data-i18n="lobby.in">You are in!</h1>' +
      '<div style="margin:.7rem 0 .2rem">' +
        '<span class="chip chip--solid" style="--chip:' + id.color + '">' +
          '<span class="chip__name">' + escapeHtml(mine.name) + '</span></span>' +
      '</div>' +
      '<p class="lead" style="margin-top:.8rem" data-i18n="lobby.wait"></p>' +
      '<button id="rename" class="btn btn--ghost btn--sm" style="margin-top:1rem" data-i18n="lobby.rename"></button>' +
    '</section>' +
    (others.length > 1
      ? '<section class="panel panel--quiet">' +
          '<div class="h-section" data-i18n="lobby.teams"></div>' +
          '<div class="chip-cloud">' + others.map(([tid, team]) => {
            const ident = identity(tid);
            return '<span class="chip" style="--chip:' + ident.color + '">' +
              '<span class="chip__emoji">' + ident.emoji + '</span>' +
              '<span class="chip__name">' + escapeHtml(team.name) + '</span></span>';
          }).join('') + '</div>' +
        '</section>'
      : '')
  );

  app.querySelector('#rename').addEventListener('click', () => {
    renameMode = true;
    sig = null;
    render();
  });
}

/* ------------------------------------------------------------------ question */

function paintQuestion() {
  const q = currentQuestion();
  if (!q) return paintWaiting();

  const round = currentRound();
  const mine = myAnswer();
  const open = isOpen();
  const s = db.state || {};
  const showClock = !!(s.endsAt && s.startedAt);

  show(app,
    '<section class="panel">' +
      '<div class="qmeta">' +
        '<div class="qmeta__where">' +
          '<span class="qmeta__round">' + escapeHtml(pick(round && round.title, lang())) + '</span>' +
          '<span>' + t('play.question') + ' ' + (pos().q + 1) + ' ' + t('play.of') + ' ' +
            ((round && round.questions.length) || 1) + '</span>' +
        '</div>' +
        '<span class="qmeta__pts">' + escapeHtml(points(q.points)) + '</span>' +
      '</div>' +

      (showClock
        ? '<div class="row" style="justify-content:center;margin-bottom:1rem">' +
            '<span class="ring-wrap">' + ringMarkup(72) + '<span class="ring__label">–</span></span>' +
          '</div>'
        : '') +

      '<h1 class="qprompt">' + escapeHtml(pick(q.prompt, lang())) + '</h1>' +
      (q.image ? '<img class="qimage" src="' + escapeHtml(q.image) + '" alt="">' : '') +

      (q.type === 'mc' ? mcMarkup(q, mine, open) : textMarkup(q, mine, open)) +

      (!open
        ? '<p class="fine" style="margin-top:1rem;text-align:center" data-i18n="play.closed"></p>'
        : '') +
    '</section>'
  );

  if (showClock) {
    const svg = app.querySelector('.ring');
    stopRing = ring(svg, {
      start: s.startedAt,
      deadline: s.endsAt,
      now: () => store.now(),
      onDone: () => { sig = null; render(); }
    });
  }

  if (q.type === 'mc') wireOptions(q, open);
  else wireText(q, open);
}

function mcMarkup(q, mine, open) {
  return '<div class="options">' + q.options.map((o, i) => {
    const picked = mine && mine.value === o.id;
    return '<button class="option' + (picked ? ' is-picked' : '') + '" ' +
      'data-opt="' + escapeHtml(o.id) + '"' + (open ? '' : ' disabled') + '>' +
      '<span class="option__key">' + (LETTERS[i] || (i + 1)) + '</span>' +
      '<span class="option__text">' + escapeHtml(pick(o.text, lang())) + '</span>' +
      '</button>';
  }).join('') + '</div>' +
  (mine
    ? '<p class="fine" style="margin-top:.8rem;text-align:center">' +
        t('play.sent') + (open ? ' · ' + t('play.sentNote') : '') + '</p>'
    : '');
}

function textMarkup(q, mine, open) {
  const value = mine ? String(mine.value || '') : '';
  return '<label class="field" style="margin-bottom:.6rem">' +
      '<input id="answer" class="input" type="text" autocomplete="off" ' +
        'enterkeyhint="send" maxlength="160" data-i18n-attr="placeholder:play.ph" ' +
        'value="' + escapeHtml(value) + '"' + (open ? '' : ' disabled') + '>' +
    '</label>' +
    (open
      ? '<button id="send" class="btn btn--primary btn--block">' +
          (mine ? t('play.change') : t('play.submit')) + '</button>'
      : '') +
    (mine
      ? '<p class="fine" style="margin-top:.8rem;text-align:center">' +
          t('play.sent') + (open ? ' · ' + t('play.sentNote') : '') + '</p>'
      : '');
}

function wireOptions(q, open) {
  if (!open) return;
  app.querySelectorAll('.option').forEach((btn) => {
    btn.addEventListener('click', () => {
      app.querySelectorAll('.option').forEach((b) => b.classList.remove('is-picked'));
      btn.classList.add('is-picked');
      sendAnswer(btn.getAttribute('data-opt'));
    });
  });
}

function wireText(q, open) {
  if (!open) return;
  const input = app.querySelector('#answer');
  const send = app.querySelector('#send');
  const fire = () => {
    const v = input.value.trim();
    if (!v) return;
    sendAnswer(v);
  };
  send.addEventListener('click', fire);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fire(); } });
}

async function sendAnswer(value) {
  if (!isOpen()) return toast(t('play.closed'), 'bad');
  const { r, q } = pos();
  const mine = myTeam();
  try {
    /* Only value/at/name — pts and state belong to the admin, and the database
       rules say so too. */
    await store.write('answers/' + answerKey(r, q) + '/' + me, {
      name: mine ? mine.name : '',
      value: value,
      at: store.now()
    });
    toast(t('play.sent'), 'good');
  } catch (e) {
    console.error('[quiz] answer failed', e);
    toast(t('join.err.failed'), 'bad');
  }
}

/* -------------------------------------------------------------------- reveal */

function paintReveal() {
  const q = currentQuestion();
  if (!q) return paintWaiting();

  const mine = myAnswer();
  const reveal = (db.state && db.state.reveal) || {};
  const verdictState = mine ? (mine.state || 'pending') : 'none';

  let box;
  if (verdictState === 'correct' || verdictState === 'partial') {
    box = verdict('good', '✓', t('play.correct'), t('play.gotPts') + ' ' + points(mine.pts || 0));
  } else if (verdictState === 'wrong') {
    box = verdict('bad', '·', t('play.wrong'), '');
  } else if (verdictState === 'none') {
    box = verdict('bad', '·', t('play.noAnswer'), '');
  } else {
    box = verdict('wait', '…', t('play.pending'), t('play.pendingNote'));
  }

  const answerText = reveal.text ? String(reveal.text) : '';

  show(app,
    '<section class="panel">' +
      box +
      (answerText
        ? '<div class="answer-was">' +
            '<div class="answer-was__label" data-i18n="play.answerWas"></div>' +
            '<div class="answer-was__value">' + escapeHtml(answerText) + '</div>' +
          '</div>'
        : '') +
      '<h2 class="qprompt" style="font-size:20px;opacity:.72">' +
        escapeHtml(pick(q.prompt, lang())) + '</h2>' +
      (q.type === 'mc' ? revealOptions(q, mine, reveal) : revealMine(mine)) +
      '<p class="fine" style="margin-top:1rem;text-align:center" data-i18n="play.waitNext"></p>' +
    '</section>'
  );

  /* One burst per question, and only for the tables that got it right. */
  const key = answerKey(pos().r, pos().q);
  if ((verdictState === 'correct' || verdictState === 'partial') && lastVerdictShown !== key) {
    lastVerdictShown = key;
    confetti({ count: 70 });
  }
}

function revealOptions(q, mine, reveal) {
  return '<div class="options">' + q.options.map((o, i) => {
    const right = o.id === reveal.optionId;
    const mistaken = mine && mine.value === o.id && !right;
    const cls = right ? ' is-right' : (mistaken ? ' is-wrong' : ' is-dim');
    return '<div class="option' + cls + '">' +
      '<span class="option__key">' + (LETTERS[i] || (i + 1)) + '</span>' +
      '<span class="option__text">' + escapeHtml(pick(o.text, lang())) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

function revealMine(mine) {
  if (!mine || !mine.value) return '';
  return '<div class="option is-dim" style="margin-top:.6rem">' +
    '<span class="option__key">✎</span>' +
    '<span class="option__text">' + escapeHtml(String(mine.value)) + '</span></div>';
}

function verdict(kind, icon, title, note) {
  return '<div class="verdict verdict--' + kind + '">' +
    '<span class="verdict__icon">' + icon + '</span>' +
    '<div><div class="verdict__title">' + escapeHtml(title) + '</div>' +
    (note ? '<div class="verdict__note">' + escapeHtml(note) + '</div>' : '') +
    '</div></div>';
}

/* -------------------------------------------------------------------- scores */

function paintScores() {
  const final = (db.state && db.state.scope) === 'final';
  const rows = leaderboard(db.teams, computeScores(db.teams, db.answers, db.adjust));
  show(app,
    '<section class="panel">' +
      '<div class="h-section">' + escapeHtml(t(final ? 'scores.final' : 'scores.round')) + '</div>' +
      boardMarkup(rows) +
      '<p class="fine" style="margin-top:1rem;text-align:center" data-i18n="play.waitNext"></p>' +
    '</section>'
  );
}

function paintEnded() {
  const rows = leaderboard(db.teams, computeScores(db.teams, db.answers, db.adjust));
  const winner = rows[0];
  show(app,
    '<section class="panel" style="text-align:center">' +
      '<div class="h-section" data-i18n="end.winner"></div>' +
      (winner
        ? '<div style="font-size:40px;line-height:1.2">' + identity(winner.id).emoji + '</div>' +
          '<h1 class="h-display">' + escapeHtml(winner.name) + '</h1>' +
          '<p class="lead" style="margin-top:.3rem">' + escapeHtml(points(winner.score)) + '</p>'
        : '') +
      '<hr class="divider">' +
      '<div style="text-align:left">' + boardMarkup(rows) + '</div>' +
      '<p class="lead" style="margin-top:1.2rem" data-i18n="end.thanks"></p>' +
    '</section>'
  );
  if (winner && winner.id === me) confetti({ count: 140 });
}

function boardMarkup(rows) {
  if (!rows.length) return '<div class="empty" data-i18n="host.waiting"></div>';
  return '<div class="board">' + rows.map((row, i) => {
    const id = identity(row.id);
    const medal = row.place <= 3 ? ' board__row--' + row.place : '';
    return '<div class="board__row' + medal + (row.id === me ? ' board__row--you' : '') + '" ' +
      'style="animation-delay:' + Math.min(i * 45, 600) + 'ms">' +
      '<span class="board__place">' + row.place + '</span>' +
      '<span class="board__emoji">' + id.emoji + '</span>' +
      '<span class="board__name">' + escapeHtml(row.name) +
        (row.id === me ? ' <span class="fine">· ' + escapeHtml(t('scores.you')) + '</span>' : '') +
      '</span>' +
      '<span class="board__score">' + row.score + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

/* ------------------------------------------------------------------- waiting */

function paintWaiting() {
  show(app,
    '<section class="panel" style="text-align:center">' +
      '<div class="empty">' +
        '<span class="empty__mark">✦</span>' +
        '<span data-i18n="play.waitNext"></span>' +
      '</div>' +
    '</section>'
  );
}

function panelError(msg) {
  return '<section class="panel"><div class="error is-on">' + escapeHtml(msg) + '</div></section>';
}

/* ------------------------------------------------------------- standing bar */

function patchStanding() {
  const mine = myTeam();
  if (!mine || phase() === 'lobby' || renameMode) {
    standing.classList.add('hidden');
    return;
  }
  standing.classList.remove('hidden');

  const totals = computeScores(db.teams, db.answers, db.adjust);
  const rows = leaderboard(db.teams, totals);
  const row = rows.find((r) => r.id === me);
  const id = identity(me);

  document.getElementById('standing-team').innerHTML =
    '<span style="color:' + id.color + '">' + id.emoji + '</span> ' + escapeHtml(mine.name);
  document.getElementById('standing-score').textContent = row ? row.score : 0;
  document.getElementById('standing-place').textContent =
    row && rows.length > 1 ? t('play.rank') + ' ' + row.place + '/' + rows.length : '';
}

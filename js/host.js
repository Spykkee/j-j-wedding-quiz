/* ---------------------------------------------------------------------------
   The big screen. Read-only: it never writes to the database, it just follows
   whatever the admin is doing and makes it legible from the back of the room.

   Open it on the laptop driving the projector, press F for fullscreen, and
   leave it alone for the rest of the evening.
   --------------------------------------------------------------------------- */

import { openStore } from './store.js';
import { PUBLIC_URL } from './config.js';
import { t, lang, apply as applyI18n, points } from './i18n.js';
import {
  pick, answerKey, leaderboard, computeScores, normaliseQuiz
} from './model.js';
import { identity, escapeHtml, ring, ringMarkup, confetti } from './ui.js';

const store = openStore();
const stage = document.getElementById('stage');
const LETTERS = 'ABCDEFGH';

const db = { pub: null, state: null, teams: {}, answers: {}, adjust: {} };

let sig = null;
let stopRing = null;
let celebrated = false;

boot();

async function boot() {
  applyI18n();
  await store.ready();

  store.watch('pub', (v) => { db.pub = v ? normaliseQuiz(v) : null; render(); });
  store.watch('state', (v) => { db.state = v || null; render(); });
  store.watch('teams', (v) => { db.teams = v || {}; render(); });
  store.watch('answers', (v) => { db.answers = v || {}; render(); });
  store.watch('adjust', (v) => { db.adjust = v || {}; render(); });

  /* F toggles fullscreen — the only interaction this screen has. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  });
}

/* ------------------------------------------------------------------ helpers */

function phase() { return (db.state && db.state.phase) || 'lobby'; }
function pos() {
  const s = db.state || {};
  return { r: Number(s.r) || 0, q: Number(s.q) || 0 };
}
function currentRound() { return db.pub ? (db.pub.rounds[pos().r] || null) : null; }
function currentQuestion() {
  const round = currentRound();
  return round ? (round.questions[pos().q] || null) : null;
}
function answersHere() {
  const { r, q } = pos();
  return db.answers[answerKey(r, q)] || {};
}
function teamCount() { return Object.keys(db.teams).length; }

function joinUrl() {
  if (PUBLIC_URL) return PUBLIC_URL;
  const url = new URL('index.html', location.href);
  url.search = '';
  return url.href;
}

/* ----------------------------------------------------------------- painting */

function signature() {
  const s = db.state || {};
  return [
    s.phase || 'lobby', s.r, s.q, s.open ? 1 : 0, s.endsAt || 0,
    s.reveal ? JSON.stringify(s.reveal) : '', s.scope || '',
    db.pub ? 'q' : 'noq', lang()
  ].join('|');
}

function render() {
  const next = signature();
  if (next !== sig) {
    sig = next;
    if (stopRing) { stopRing(); stopRing = null; }
    paint();
    applyI18n();
  }
  patchLive();
  patchChrome();
}

function paint() {
  stage.classList.remove('is-entering');
  void stage.offsetWidth;
  stage.classList.add('is-entering');

  switch (phase()) {
    case 'question': return paintQuestion();
    case 'reveal':   return paintReveal();
    case 'scores':   return paintScores();
    case 'ended':    return paintEnded();
    case 'ready':    return paintReady();
    default:         return paintLobby();
  }
}

/* --------------------------------------------------------------------- lobby */

function paintLobby() {
  const url = joinUrl();
  stage.innerHTML =
    '<div class="joinsplit">' +
      '<div>' +
        '<div class="joinsplit__hello">' + escapeHtml(pick(db.pub && db.pub.title, lang()) || t('brand.title')) + '</div>' +
        '<div class="joinsplit__lead" data-i18n="join.lead"></div>' +
        '<div class="fine" style="margin-top:1.4vmin;color:rgba(250,244,239,.5)" data-i18n="host.joinAt"></div>' +
        '<div class="joinsplit__url">' + escapeHtml(url.replace(/^https?:\/\//, '')) + '</div>' +
        '<div id="joiners" class="joiners"></div>' +
      '</div>' +
      '<div>' +
        '<div class="qr" id="qr"></div>' +
        '<div class="qr__caption" data-i18n="host.join"></div>' +
      '</div>' +
    '</div>';
  drawQr(document.getElementById('qr'), url);
  celebrated = false;
}

function drawQr(box, url) {
  if (!box) return;
  box.innerHTML = '';
  if (typeof window.QRCode !== 'function') {
    /* The QR library did not load — the printed link still works. */
    box.innerHTML = '<div style="padding:1rem;color:#5A4E44;font-size:14px;max-width:16em">' +
      escapeHtml(url) + '</div>';
    return;
  }
  const size = Math.round(Math.max(150, Math.min(330, Math.min(window.innerWidth, window.innerHeight) * 0.26)));
  new window.QRCode(box, {
    text: url,
    width: size,
    height: size,
    colorDark: '#35191F',
    colorLight: '#FAF4EF',
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

/* --------------------------------------------------------------- get ready */

function paintReady() {
  const round = currentRound();
  stage.innerHTML =
    '<div class="getready">' +
      '<div class="getready__round" data-i18n="host.roundAhead"></div>' +
      '<div class="getready__title">' + escapeHtml(pick(round && round.title, lang())) + '</div>' +
      (round && pick(round.blurb, lang())
        ? '<div class="getready__blurb">' + escapeHtml(pick(round.blurb, lang())) + '</div>'
        : '') +
    '</div>';
}

/* ------------------------------------------------------------------ question */

function paintQuestion() {
  const q = currentQuestion();
  if (!q) return paintLobby();

  const s = db.state || {};
  const showClock = !!(s.endsAt && s.startedAt);

  stage.innerHTML =
    '<div class="hq' + (showClock ? '' : ' hq--noclock') + '">' +
      '<div>' +
        '<div class="hq__prompt">' + escapeHtml(pick(q.prompt, lang())) + '</div>' +
        (q.image ? '<img class="hq__image" src="' + escapeHtml(q.image) + '" alt="">' : '') +
        (q.type === 'mc'
          ? '<div class="hq__options" data-n="' + q.options.length + '">' + q.options.map((o, i) =>
              '<div class="hopt">' +
                '<span class="hopt__key">' + (LETTERS[i] || (i + 1)) + '</span>' +
                '<span>' + escapeHtml(pick(o.text, lang())) + '</span>' +
              '</div>').join('') + '</div>'
          : '') +
      '</div>' +
      (showClock
        ? '<div class="hclock">' +
            '<span class="ring-wrap">' + ringMarkup(Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.22)) +
              '<span class="ring__label">–</span></span>' +
            '<div class="tally"><span class="tally__n" id="tally-n">0</span>' +
              '<span data-i18n="host.answersIn"></span></div>' +
            '<div class="inbox" id="inbox"></div>' +
          '</div>'
        : '') +
    '</div>';

  if (showClock) {
    stopRing = ring(stage.querySelector('.ring'), {
      start: s.startedAt,
      deadline: s.endsAt,
      now: () => store.now()
    });
  }
}

/* -------------------------------------------------------------------- reveal */

function paintReveal() {
  const q = currentQuestion();
  const reveal = (db.state && db.state.reveal) || {};
  const here = answersHere();

  /* Anyone who scored counts as having got it — that includes half marks on a
     free-text answer. */
  const winners = Object.entries(here)
    .filter(([, a]) => a && (Number(a.pts) || 0) > 0)
    .map(([id, a]) => ({ id, name: a.name || (db.teams[id] && db.teams[id].name) || '—' }));

  const free = reveal.kind === 'free' || (q && q.type === 'free');

  stage.innerHTML =
    '<div>' +
      '<div class="reveal__label">' +
        escapeHtml(t(free ? 'host.awarded' : 'host.correctAnswer')) + '</div>' +
      (free
        ? '<div class="reveal__answer" style="font-size:clamp(22px,4vmin,54px);opacity:.8">' +
            escapeHtml(pick(q && q.prompt, lang())) + '</div>'
        : '') +
      (q && q.type === 'mc'
        ? '<div class="hq__options" style="margin-top:0">' + q.options.map((o, i) =>
            '<div class="hopt' + (o.id === reveal.optionId ? ' is-right' : ' is-dim') + '">' +
              '<span class="hopt__key">' + (LETTERS[i] || (i + 1)) + '</span>' +
              '<span>' + escapeHtml(pick(o.text, lang())) + '</span>' +
            '</div>').join('') + '</div>'
        : free
          ? ''
          : '<div class="reveal__answer">' + escapeHtml(reveal.text || '—') + '</div>') +
      '<div class="reveal__who">' +
        (winners.length
          ? winners.map((w) => {
              const id = identity(w.id);
              return '<span class="joiner"><span>' + id.emoji + '</span>' +
                '<span class="joiner__name">' + escapeHtml(w.name) + '</span></span>';
            }).join('') +
            '<span class="reveal__none" style="font-style:normal;margin-left:.6em">' +
              escapeHtml(t('host.gotIt')) + '</span>'
          : '<span class="reveal__none" data-i18n="host.nobody"></span>') +
      '</div>' +
    '</div>';
}

/* -------------------------------------------------------------------- scores */

function paintScores() {
  const final = (db.state && db.state.scope) === 'final';
  const rows = leaderboard(db.teams, computeScores(db.teams, db.answers, db.adjust));
  stage.innerHTML =
    '<div>' +
      '<div class="reveal__label">' + escapeHtml(t(final ? 'scores.final' : 'scores.round')) + '</div>' +
      '<div class="hboard">' + rows.slice(0, 10).map((row, i) => hostRow(row, i)).join('') + '</div>' +
    '</div>';
}

function hostRow(row, i) {
  const id = identity(row.id);
  const medal = row.place <= 3 ? ' hrow--' + row.place : '';
  return '<div class="hrow' + medal + '" style="animation-delay:' + Math.min(i * 70, 900) + 'ms">' +
    '<span class="hrow__place">' + row.place + '</span>' +
    '<span class="hrow__emoji">' + id.emoji + '</span>' +
    '<span class="hrow__name">' + escapeHtml(row.name) + '</span>' +
    '<span class="hrow__score">' + row.score + '</span>' +
    '</div>';
}

/* ----------------------------------------------------------------------- end */

function paintEnded() {
  const rows = leaderboard(db.teams, computeScores(db.teams, db.answers, db.adjust));
  const winner = rows[0];
  stage.innerHTML =
    '<div class="finale">' +
      '<div class="finale__label" data-i18n="end.winner"></div>' +
      (winner
        ? '<div style="font-size:clamp(34px,6vmin,78px)">' + identity(winner.id).emoji + '</div>' +
          '<div class="finale__winner">' + escapeHtml(winner.name) + '</div>' +
          '<div class="finale__score">' + escapeHtml(points(winner.score)) + '</div>'
        : '<div class="finale__winner">—</div>') +
      '<div class="finale__thanks" data-i18n="end.thanks"></div>' +
    '</div>';

  if (winner && !celebrated) {
    celebrated = true;
    confetti({ count: 200 });
    setTimeout(() => confetti({ count: 140 }), 1400);
  }
}

/* ----------------------------------------------- live bits (no full repaint) */

/* These change constantly — teams arriving, answers landing — so they are
   patched in place rather than triggering a repaint that would restart the
   entrance animation and the countdown ring. */
function patchLive() {
  const joiners = document.getElementById('joiners');
  if (joiners) {
    const teams = Object.entries(db.teams).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    joiners.innerHTML = teams.map(([id, team]) => {
      const ident = identity(id);
      return '<span class="joiner"><span>' + ident.emoji + '</span>' +
        '<span class="joiner__name">' + escapeHtml(team.name) + '</span></span>';
    }).join('');
  }

  const tally = document.getElementById('tally-n');
  const inbox = document.getElementById('inbox');
  if (tally || inbox) {
    const answered = Object.keys(answersHere()).length;
    const total = teamCount();
    if (tally) tally.textContent = answered + '/' + total;
    if (inbox) {
      const ids = Object.keys(db.teams);
      const here = answersHere();
      inbox.innerHTML = ids.map((id) =>
        '<span class="inbox__dot' + (here[id] ? ' is-in' : '') + '"></span>').join('');
    }
  }
}

function patchChrome() {
  const round = currentRound();
  const s = db.state || {};
  const playing = ['question', 'reveal'].indexOf(phase()) !== -1;

  document.getElementById('top-round').textContent =
    round && playing ? pick(round.title, lang()) : '';
  document.getElementById('top-question').textContent =
    playing && round
      ? t('play.question') + ' ' + (pos().q + 1) + ' ' + t('play.of') + ' ' + round.questions.length
      : '';
  document.getElementById('top-title').textContent =
    playing ? '' : pick(db.pub && db.pub.title, lang());

  const pips = document.getElementById('top-pips');
  if (playing && round) {
    pips.innerHTML = round.questions.map((_, i) => {
      const cls = i < pos().q ? ' is-done' : (i === pos().q ? ' is-now' : '');
      return '<span class="pip' + cls + '"></span>';
    }).join('');
  } else {
    pips.innerHTML = '';
  }

  const left = document.getElementById('foot-left');
  const right = document.getElementById('foot-right');
  left.textContent = teamCount() + ' ' + t('host.teamsIn');
  if (phase() === 'question') {
    const q = currentQuestion();
    right.textContent = q ? points(q.points) : '';
  } else if (phase() === 'lobby') {
    right.textContent = t('host.waiting');
  } else {
    right.textContent = pick(db.pub && db.pub.title, lang());
  }
  /* Keep state.open out of the footer — the ring already says it. */
  void s;
}

window.addEventListener('resize', () => {
  if (phase() === 'lobby') { sig = null; render(); }
});

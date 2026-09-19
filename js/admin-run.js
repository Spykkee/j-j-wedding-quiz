/* ---------------------------------------------------------------------------
   Run pane — driving the game on the night — and the Tables pane.

   One console at the top with a single obvious next step, a row of escape
   hatches under it, and the live answers below. Grading happens here, never on
   a guest's phone: Reveal scores every automatic answer, and free-text answers
   wait with their marks until someone presses one.
   --------------------------------------------------------------------------- */

import { PUBLIC_URL } from './config.js';
import {
  questionAt, roundAt, nextPosition, prevPosition, answerKey, grade, pick,
  computeScores, leaderboard, countQuestions
} from './model.js';
import { identity, escapeHtml, toast } from './ui.js';

const LETTERS = 'ABCDEFGH';
let wiredRun = null;
let wiredTables = null;

/* ================================================================= run pane */

export function renderRun(ctx) {
  const pane = ctx.panes.run;
  const s = ctx.db.state || { phase: 'lobby', r: 0, q: 0 };
  const r = Number(s.r) || 0;
  const q = Number(s.q) || 0;
  const round = roundAt(ctx.quiz, r);
  const question = questionAt(ctx.quiz, r, q);
  const total = countQuestions(ctx.quiz);

  pane.innerHTML =
    (total === 0
      ? '<div class="panel" style="margin-bottom:1rem"><div class="empty">' +
          '<span class="empty__mark">✦</span>There are no questions yet. ' +
          'Head to <strong>Build the quiz</strong> first.</div></div>'
      : '') +
    (ctx.dirty
      ? '<div class="panel panel--quiet" style="margin-bottom:1rem;border-color:var(--wait)">' +
          '<span class="mode-flag">Unsaved</span> ' +
          '<span class="fine">The Build pane has changes that guests cannot see yet. ' +
          'Save &amp; publish before you start.</span></div>'
      : '') +

    consoleMarkup(ctx, s, round, question, r, q) +
    answersMarkup(ctx, s, question, r, q) +
    standingsMarkup(ctx);

  if (wiredRun !== pane) {
    wiredRun = pane;
    pane.addEventListener('click', (e) => onRunClick(ctx, e));
  }
}

function consoleMarkup(ctx, s, round, question, r, q) {
  const phase = s.phase || 'lobby';
  const answered = Object.keys(currentAnswers(ctx, r, q)).length;
  const teams = Object.keys(ctx.db.teams).length;
  const primary = primaryAction(ctx, s, round, r, q);

  return '<div class="console">' +
    '<div class="console__where">' +
      '<div class="row row--tight">' +
        '<span class="console__phase phase--' + phase + '">' + phaseLabel(phase, s) + '</span>' +
        (round
          ? '<span class="fine">' + escapeHtml(round.title.en || 'Round ' + (r + 1)) +
            (question ? ' · Q' + (q + 1) + '/' + round.questions.length : '') + '</span>'
          : '') +
      '</div>' +
      '<span class="fine tnum">' + answered + ' / ' + teams + ' answered</span>' +
    '</div>' +

    '<div class="meterbar"><div class="meterbar__fill" style="width:' +
      (teams ? Math.round((answered / teams) * 100) : 0) + '%"></div></div>' +

    (question
      ? '<div class="console__prompt">' + escapeHtml(question.prompt.en || '(no question text)') + '</div>' +
        answerCrib(question)
      : '<div class="console__prompt console__prompt--none">' +
          (phase === 'lobby' ? 'Waiting in the lobby — guests can join.'
            : phase === 'ended' ? 'The quiz is finished.'
            : 'No question on screen.') +
        '</div>') +

    '<div class="console__actions">' +
      '<button class="btn btn--primary" data-act="' + primary.act + '">' + primary.label + '</button>' +
    '</div>' +

    '<hr class="divider" style="margin:.9rem 0 .7rem">' +
    '<div class="row row--tight">' +
      '<button class="btn btn--ghost btn--sm" data-act="prev">◀ Previous</button>' +
      '<button class="btn btn--ghost btn--sm" data-act="next">Next ▶</button>' +
      (s.open
        ? '<button class="btn btn--ghost btn--sm" data-act="close">Close answers</button>'
        : '<button class="btn btn--ghost btn--sm" data-act="open">Reopen answers</button>') +
      '<button class="btn btn--ghost btn--sm" data-act="reveal">Reveal</button>' +
      '<button class="btn btn--ghost btn--sm" data-act="roundScores">Round scores</button>' +
      '<button class="btn btn--ghost btn--sm" data-act="finalScores">Final scores</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn--ghost btn--sm" data-act="lobby">Lobby</button>' +
      '<button class="btn btn--danger btn--sm" data-act="end">End quiz</button>' +
    '</div>' +
  '</div>';
}

function phaseLabel(phase, s) {
  if (phase === 'question') return s.open ? 'Answering' : 'Closed';
  if (phase === 'scores') return (s.scope === 'final' ? 'Final scores' : 'Round scores');
  if (phase === 'ready') return 'Round intro';
  if (phase === 'reveal') return 'Reveal';
  if (phase === 'ended') return 'Finished';
  return 'Lobby';
}

/* What the couple sees on their own screen so they can read the answer out. */
function answerCrib(question) {
  if (question.type === 'mc') {
    const i = question.options.findIndex((o) => o.id === question.correct);
    const o = question.options[i];
    return '<div class="fine" style="margin-bottom:.7rem">Correct: <strong>' +
      (LETTERS[i] || (i + 1)) + ' · ' + escapeHtml(pick(o && o.text, 'en')) + '</strong></div>';
  }
  if (question.type === 'exact') {
    return '<div class="fine" style="margin-bottom:.7rem">Accepts: <strong>' +
      escapeHtml((question.accept || []).join(' / ') || '(nothing set)') + '</strong></div>';
  }
  return question.note
    ? '<div class="fine" style="margin-bottom:.7rem">Judging note: <strong>' +
      escapeHtml(question.note) + '</strong></div>'
    : '<div class="fine" style="margin-bottom:.7rem">You judge this one by hand.</div>';
}

function primaryAction(ctx, s, round, r, q) {
  const phase = s.phase || 'lobby';
  if (phase === 'lobby') return { act: 'ready', label: 'Start the quiz' };
  if (phase === 'ready') return { act: 'showQ', label: 'Show the first question' };
  if (phase === 'question') {
    return s.open
      ? { act: 'close', label: 'Close answers' }
      : { act: 'reveal', label: 'Reveal the answer' };
  }
  if (phase === 'reveal') {
    const last = !round || q >= round.questions.length - 1;
    return last
      ? { act: 'roundScores', label: 'Show the round scores' }
      : { act: 'next', label: 'Next question' };
  }
  if (phase === 'scores') {
    if (s.scope === 'final') return { act: 'end', label: 'Finish the quiz' };
    const more = ctx.quiz.rounds.length > r + 1;
    return more
      ? { act: 'nextRound', label: 'Start the next round' }
      : { act: 'finalScores', label: 'Show the final scores' };
  }
  return { act: 'lobby', label: 'Back to the lobby' };
}

/* -------------------------------------------------------------- answer list */

function currentAnswers(ctx, r, q) {
  return ctx.db.answers[answerKey(r, q)] || {};
}

function answersMarkup(ctx, s, question, r, q) {
  if (!question) return '';
  const here = currentAnswers(ctx, r, q);
  const rows = Object.entries(here)
    .sort((a, b) => (a[1].at || 0) - (b[1].at || 0));

  const pending = rows.filter(([, a]) => !a.state || a.state === 'pending').length;
  const missing = Object.keys(ctx.db.teams).filter((id) => !here[id]);

  return '<section class="panel">' +
    '<div class="row" style="margin-bottom:.8rem">' +
      '<div class="h-section" style="margin:0">Answers' +
        (question.type === 'free' ? ' — yours to judge' : '') + '</div>' +
      '<div class="spacer"></div>' +
      (pending ? '<span class="mode-flag">' + pending + ' waiting</span>' : '') +
    '</div>' +

    (rows.length
      ? rows.map(([id, a]) => judgeMarkup(ctx, question, id, a, r, q)).join('')
      : '<div class="empty"><span class="empty__mark">✦</span>No answers in yet.</div>') +

    (missing.length
      ? '<div class="fine" style="margin-top:.7rem">Nothing yet from: ' +
        missing.map((id) => escapeHtml((ctx.db.teams[id] || {}).name || '—')).join(', ') + '</div>'
      : '') +
  '</section>';
}

function judgeMarkup(ctx, question, id, a, r, q) {
  const team = ctx.db.teams[id] || {};
  const ident = identity(id);
  const max = Number(question.points) || 0;
  const half = max >= 2 ? Math.floor(max / 2) : 0;
  const state = a.state || 'pending';
  const pts = Number(a.pts) || 0;

  let shown = String(a.value == null ? '' : a.value);
  if (question.type === 'mc') {
    const i = (question.options || []).findIndex((o) => o.id === a.value);
    const o = question.options && question.options[i];
    shown = o ? (LETTERS[i] || (i + 1)) + ' · ' + pick(o.text, 'en') : '(unknown option)';
  }

  const marks = [
    { key: 'wrong', pts: 0, label: '✗ 0', cls: 'mark--bad' }
  ];
  if (half > 0 && half < max) marks.push({ key: 'partial', pts: half, label: '½ ' + half, cls: '' });
  marks.push({ key: 'correct', pts: max, label: '✓ ' + max, cls: 'mark--good' });

  return '<div class="judge' + (state !== 'pending' ? ' is-done' : '') + '">' +
    '<div class="judge__top">' +
      '<span class="chip" style="--chip:' + ident.color + '">' +
        '<span class="chip__emoji">' + ident.emoji + '</span>' +
        '<span class="chip__name">' + escapeHtml(team.name || a.name || '—') + '</span></span>' +
      '<span class="fine tnum">' + (state === 'pending' ? 'not scored' : pts + 'p') +
        (a.manual ? ' · by hand' : '') + '</span>' +
    '</div>' +
    '<div class="judge__answer' + (shown ? '' : ' judge__answer--empty') + '">' +
      escapeHtml(shown || '(left blank)') + '</div>' +
    '<div class="judge__marks">' +
      marks.map((m) =>
        '<button class="mark ' + m.cls + (state === m.key && state !== 'pending' ? ' is-on' : '') + '" ' +
          'data-act="mark" data-id="' + escapeHtml(id) + '" data-state="' + m.key + '" ' +
          'data-pts="' + m.pts + '" data-r="' + r + '" data-q="' + q + '">' + m.label + '</button>'
      ).join('') +
    '</div>' +
  '</div>';
}

function standingsMarkup(ctx) {
  const rows = leaderboard(ctx.db.teams, computeScores(ctx.db.teams, ctx.db.answers, ctx.db.adjust));
  if (!rows.length) return '';
  return '<section class="panel panel--quiet">' +
    '<div class="h-section">Standings</div>' +
    rows.map((row) => {
      const ident = identity(row.id);
      return '<div class="teamrow">' +
        '<span class="board__place">' + row.place + '</span>' +
        '<span class="teamrow__emoji">' + ident.emoji + '</span>' +
        '<span class="teamrow__name">' + escapeHtml(row.name) + '</span>' +
        '<span class="teamrow__score">' + row.score + '</span>' +
      '</div>';
    }).join('') +
  '</section>';
}

/* ------------------------------------------------------------------ actions */

async function onRunClick(ctx, e) {
  const node = e.target.closest('[data-act]');
  if (!node) return;
  const act = node.getAttribute('data-act');
  const s = ctx.db.state || { phase: 'lobby', r: 0, q: 0 };
  const r = Number(s.r) || 0;
  const q = Number(s.q) || 0;

  try {
    switch (act) {
      case 'ready':      return showReady(ctx, 0);
      case 'nextRound':  return showReady(ctx, r + 1);
      case 'showQ':      return showQuestion(ctx, r, 0);
      case 'open':       return setOpen(ctx, true);
      case 'close':      return setOpen(ctx, false);
      case 'reveal':     return doReveal(ctx);
      case 'next':       return goNext(ctx);
      case 'prev':       return goPrev(ctx);
      case 'roundScores': return showScores(ctx, 'round');
      case 'finalScores': return showScores(ctx, 'final');
      case 'lobby':      return ctx.store.write('state', { phase: 'lobby', r: 0, q: 0, open: false });
      case 'end':        return endGame(ctx);
      case 'mark':       return markAnswer(ctx, node);
      default: return;
    }
  } catch (err) {
    console.error('[quiz] action failed', act, err);
    toast('That did not go through: ' + ((err && err.code) || 'unknown error'), 'bad');
  }
}

function showReady(ctx, r) {
  if (!roundAt(ctx.quiz, r)) return showScores(ctx, 'final');
  return ctx.store.write('state', { phase: 'ready', r: r, q: 0, open: false });
}

function showQuestion(ctx, r, q) {
  const question = questionAt(ctx.quiz, r, q);
  if (!question) {
    toast('There is no question there.', 'bad');
    return Promise.resolve();
  }
  const now = ctx.store.now();
  const secs = Number(question.time) || 0;
  return ctx.store.write('state', {
    phase: 'question',
    r: r,
    q: q,
    open: true,
    startedAt: now,
    endsAt: secs > 0 ? now + secs * 1000 : null,
    reveal: null
  });
}

/* When a timed question runs out, close it here rather than trusting every
   phone to stop on its own — the database rules only accept answers while
   state.open is true, so this is what actually shuts the door. Called on a
   short interval by admin.js. */
let autoClosing = false;

export function maybeAutoClose(ctx) {
  const s = ctx.db.state;
  if (!s || s.phase !== 'question' || !s.open || !s.endsAt) return;
  if (ctx.store.now() < s.endsAt) return;
  if (autoClosing) return;
  autoClosing = true;
  ctx.store.merge('state', { open: false })
    .catch((e) => console.error('[quiz] auto-close failed', e))
    .then(() => { autoClosing = false; });
}

function setOpen(ctx, open) {
  const s = ctx.db.state || {};
  if (s.phase !== 'question') {
    /* "Reopen" from a reveal puts the same question back on screen. */
    if (open) return showQuestion(ctx, Number(s.r) || 0, Number(s.q) || 0);
    return Promise.resolve();
  }
  const now = ctx.store.now();
  if (open) {
    const question = questionAt(ctx.quiz, Number(s.r) || 0, Number(s.q) || 0);
    const secs = Number(question && question.time) || 0;
    return ctx.store.merge('state', {
      open: true,
      startedAt: now,
      endsAt: secs > 0 ? now + secs * 1000 : null
    });
  }
  /* Closing early: end the ring now rather than leaving it mid-sweep. */
  return ctx.store.merge('state', { open: false, endsAt: now });
}

/* Score every automatic answer, leave hand-judged ones alone, then put the
   answer on the big screen. */
async function doReveal(ctx) {
  const s = ctx.db.state || {};
  const r = Number(s.r) || 0;
  const q = Number(s.q) || 0;
  const question = questionAt(ctx.quiz, r, q);
  if (!question) {
    toast('There is no question to reveal.', 'bad');
    return;
  }

  const key = answerKey(r, q);
  const here = ctx.db.answers[key] || {};
  const updates = {};

  Object.entries(here).forEach(([id, a]) => {
    if (a && a.manual) return;                 // never undo a human decision
    if (question.type === 'free') {
      if (a && a.state) return;                // already sitting in the queue
      updates[id + '/state'] = 'pending';
      updates[id + '/pts'] = 0;
    } else {
      const g = grade(question, a && a.value);
      updates[id + '/state'] = g.state;
      updates[id + '/pts'] = g.pts;
    }
  });

  if (Object.keys(updates).length) await ctx.store.merge('answers/' + key, updates);

  await ctx.store.write('state', {
    phase: 'reveal',
    r: r,
    q: q,
    open: false,
    startedAt: s.startedAt || null,
    endsAt: s.endsAt || null,
    reveal: revealPayload(question)
  });
}

function revealPayload(question) {
  if (question.type === 'mc') {
    const o = (question.options || []).find((x) => x.id === question.correct);
    return { kind: 'mc', optionId: question.correct || '', text: pick(o && o.text, 'en') };
  }
  if (question.type === 'exact') {
    return { kind: 'exact', optionId: '', text: (question.accept || [])[0] || '' };
  }
  return { kind: 'free', optionId: '', text: '' };
}

function goNext(ctx) {
  const s = ctx.db.state || {};
  const r = Number(s.r) || 0;
  const q = Number(s.q) || 0;
  const at = nextPosition(ctx.quiz, r, q);
  if (!at) return showScores(ctx, 'final');
  /* Crossing into a new round shows its intro card first. */
  if (at.r !== r) return showReady(ctx, at.r);
  return showQuestion(ctx, at.r, at.q);
}

function goPrev(ctx) {
  const s = ctx.db.state || {};
  const at = prevPosition(ctx.quiz, Number(s.r) || 0, Number(s.q) || 0);
  if (!at) return ctx.store.write('state', { phase: 'lobby', r: 0, q: 0, open: false });
  return showQuestion(ctx, at.r, at.q);
}

function showScores(ctx, scope) {
  const s = ctx.db.state || {};
  return ctx.store.write('state', {
    phase: 'scores',
    r: Number(s.r) || 0,
    q: Number(s.q) || 0,
    open: false,
    scope: scope
  });
}

function endGame(ctx) {
  const s = ctx.db.state || {};
  return ctx.store.write('state', {
    phase: 'ended', r: Number(s.r) || 0, q: Number(s.q) || 0, open: false
  });
}

function markAnswer(ctx, node) {
  const id = node.getAttribute('data-id');
  const r = Number(node.getAttribute('data-r'));
  const q = Number(node.getAttribute('data-q'));
  const key = answerKey(r, q);
  return ctx.store.merge('answers/' + key + '/' + id, {
    state: node.getAttribute('data-state'),
    pts: Number(node.getAttribute('data-pts')) || 0,
    manual: true
  });
}

/* ============================================================== tables pane */

export function renderTables(ctx) {
  const pane = ctx.panes.tables;
  const url = joinUrl();
  const totals = computeScores(ctx.db.teams, ctx.db.answers, ctx.db.adjust);
  const rows = leaderboard(ctx.db.teams, totals);

  pane.innerHTML =
    '<section class="panel">' +
      '<div class="h-section">Join link</div>' +
      '<div class="linkbox">' +
        '<span class="linkbox__url">' + escapeHtml(url) + '</span>' +
        '<button class="btn btn--ghost btn--sm" data-act="copy">Copy</button>' +
      '</div>' +
      '<div class="row" style="margin-top:1rem;align-items:flex-start;gap:14px">' +
        '<div class="qr" id="admin-qr" style="background:#fff;padding:10px;border-radius:12px"></div>' +
        '<div class="fine" style="flex:1;min-width:160px">Print this on the table cards, or ' +
          'leave <strong>host.html</strong> on the big screen — it shows the same code much larger.' +
          '<div style="margin-top:.6rem"><a class="btn btn--ghost btn--sm" href="host.html" ' +
            'target="_blank" rel="noopener">Open the big screen ↗</a></div>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="panel">' +
      '<div class="row" style="margin-bottom:.8rem">' +
        '<div class="h-section" style="margin:0">Tables playing</div>' +
        '<div class="spacer"></div>' +
        '<span class="fine tnum">' + rows.length + '</span>' +
      '</div>' +
      (rows.length
        ? rows.map((row) => {
            const ident = identity(row.id);
            return '<div class="teamrow">' +
              '<span class="teamrow__emoji">' + ident.emoji + '</span>' +
              '<span class="teamrow__name">' + escapeHtml(row.name) + '</span>' +
              '<button class="iconbtn" data-act="minus" data-id="' + escapeHtml(row.id) + '" ' +
                'title="Take a point away">−</button>' +
              '<span class="teamrow__score">' + row.score + '</span>' +
              '<button class="iconbtn" data-act="plus" data-id="' + escapeHtml(row.id) + '" ' +
                'title="Give a point">+</button>' +
              '<button class="iconbtn" data-act="rename" data-id="' + escapeHtml(row.id) + '" ' +
                'title="Rename">✎</button>' +
              '<button class="iconbtn iconbtn--danger" data-act="kick" data-id="' +
                escapeHtml(row.id) + '" title="Remove table">✕</button>' +
            '</div>';
          }).join('')
        : '<div class="empty"><span class="empty__mark">✦</span>Nobody has joined yet.</div>') +
    '</section>' +

    '<section class="panel panel--quiet">' +
      '<div class="h-section">Starting over</div>' +
      '<p class="fine">Use these between the rehearsal and the real thing. Neither one touches ' +
        'the questions you wrote.</p>' +
      '<div class="row row--tight" style="margin-top:.8rem">' +
        '<button class="btn btn--ghost btn--sm" data-act="clearAnswers">Clear answers &amp; scores</button>' +
        '<button class="btn btn--danger btn--sm" data-act="clearAll">Clear answers and remove all tables</button>' +
      '</div>' +
    '</section>';

  drawQr(document.getElementById('admin-qr'), url);

  if (wiredTables !== pane) {
    wiredTables = pane;
    pane.addEventListener('click', (e) => onTablesClick(ctx, e));
  }
}

function joinUrl() {
  if (PUBLIC_URL) return PUBLIC_URL;
  const url = new URL('index.html', location.href);
  url.search = '';
  return url.href;
}

function drawQr(box, url) {
  if (!box) return;
  box.innerHTML = '';
  if (typeof window.QRCode !== 'function') {
    box.innerHTML = '<div class="fine" style="max-width:150px">QR library did not load — ' +
      'the link above still works.</div>';
    return;
  }
  new window.QRCode(box, {
    text: url, width: 150, height: 150,
    colorDark: '#35191F', colorLight: '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

async function onTablesClick(ctx, e) {
  const node = e.target.closest('[data-act]');
  if (!node) return;
  const act = node.getAttribute('data-act');
  const id = node.getAttribute('data-id');

  try {
    switch (act) {
      case 'copy': {
        const url = joinUrl();
        try {
          await navigator.clipboard.writeText(url);
          toast('Join link copied', 'good');
        } catch (err) {
          window.prompt('Copy the join link:', url);
        }
        return;
      }

      case 'plus':
      case 'minus': {
        const current = Number((ctx.db.adjust || {})[id]) || 0;
        await ctx.store.write('adjust/' + id, current + (act === 'plus' ? 1 : -1));
        return;
      }

      case 'rename': {
        const team = ctx.db.teams[id];
        if (!team) return;
        const next = window.prompt('Rename this table:', team.name || '');
        if (next == null) return;
        const name = next.trim().replace(/\s+/g, ' ');
        if (!name) return toast('A table needs a name.', 'bad');
        await ctx.store.merge('teams/' + id, { name: name });
        return;
      }

      case 'kick': {
        const team = ctx.db.teams[id] || {};
        if (!confirm('Remove "' + (team.name || 'this table') + '"? Their answers stay in the ' +
          'record but they drop off the leaderboard.')) return;
        await ctx.store.erase('teams/' + id);
        await ctx.store.erase('adjust/' + id);
        return;
      }

      case 'clearAnswers': {
        if (!confirm('Clear every answer and every manual point adjustment? The tables stay ' +
          'joined and the questions are untouched.')) return;
        await ctx.store.erase('answers');
        await ctx.store.erase('adjust');
        await ctx.store.write('state', { phase: 'lobby', r: 0, q: 0, open: false });
        toast('Answers cleared', 'good');
        return;
      }

      case 'clearAll': {
        if (!confirm('Clear the answers AND remove every table? Guests will have to scan and ' +
          'pick a name again.')) return;
        await ctx.store.erase('answers');
        await ctx.store.erase('adjust');
        await ctx.store.erase('teams');
        await ctx.store.write('state', { phase: 'lobby', r: 0, q: 0, open: false });
        toast('Back to a blank room', 'good');
        return;
      }

      default: return;
    }
  } catch (err) {
    console.error('[quiz] tables action failed', act, err);
    toast('That did not go through: ' + ((err && err.code) || 'unknown error'), 'bad');
  }
}

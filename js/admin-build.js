/* ---------------------------------------------------------------------------
   Build pane — writing the quiz.

   Rounds hold questions; questions come in three kinds:

     Multiple choice   tap an option, scored automatically
     Exact answer      type it, scored automatically, forgiving about accents,
                       case, punctuation and small typos
     Free text         anything goes, and you award the points yourself from
                       the Run pane while the next course is being served

   Text fields write straight into the working copy without a re-render, so
   typing is never interrupted. Anything structural (adding a question,
   changing its type, picking the correct option) redraws the pane.
   --------------------------------------------------------------------------- */

import {
  newRound, newQuestion, newOption, countQuestions, pick, normaliseQuiz, LANGS
} from './model.js';
import { escapeHtml, toast } from './ui.js';

const LETTERS = 'ABCDEFGH';
const LANG_LABEL = { en: 'EN', fr: 'FR', ko: 'KR' };

let wired = null;

export function renderBuild(ctx) {
  const pane = ctx.panes.build;
  const quiz = ctx.quiz;

  pane.innerHTML =
    '<section class="panel">' +
      '<div class="h-section">Quiz title</div>' +
      langInputs('title', quiz.title, {}) +
    '</section>' +

    '<div style="margin-top:1rem">' +
      quiz.rounds.map((round, r) => roundMarkup(ctx, round, r)).join('') +
    '</div>' +

    '<button class="btn btn--ghost btn--block" data-act="addRound" style="margin-top:.4rem">' +
      '+ Add a round</button>' +

    savebar(ctx);

  if (wired !== pane) {
    wired = pane;
    pane.addEventListener('input', (e) => onInput(ctx, e));
    pane.addEventListener('change', (e) => onChange(ctx, e));
    pane.addEventListener('click', (e) => onClick(ctx, e));
  }
}

/* ------------------------------------------------------------------ markup  */

function roundMarkup(ctx, round, r) {
  const n = round.questions.length;
  return '<section class="round">' +
    '<div class="round__head">' +
      '<span class="round__n">' + (r + 1) + '</span>' +
      '<div class="round__title">' +
        '<input class="input input--sm" data-act="rtitle" data-r="' + r + '" data-lang="en" ' +
          'value="' + escapeHtml(round.title.en || '') + '" placeholder="Round name">' +
      '</div>' +
      '<span class="round__count">' + n + (n === 1 ? ' question' : ' questions') + '</span>' +
      '<button class="iconbtn" data-act="roundUp" data-r="' + r + '" title="Move up"' +
        (r === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
      '<button class="iconbtn" data-act="roundDown" data-r="' + r + '" title="Move down"' +
        (r === ctx.quiz.rounds.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
      '<button class="iconbtn iconbtn--danger" data-act="delRound" data-r="' + r + '" ' +
        'title="Delete round">' + icon('trash') + '</button>' +
    '</div>' +

    '<div class="round__body">' +
      '<details style="margin-bottom:.8rem">' +
        '<summary class="fine" style="cursor:pointer">Translations and intro text</summary>' +
        '<div style="margin-top:.6rem">' +
          langInputs('rtitle', round.title, { r: r }, 'Round name') +
          '<div class="h-section" style="margin:.8rem 0 .4rem">Intro shown on the big screen</div>' +
          langInputs('rblurb', round.blurb, { r: r }, 'Optional intro', true) +
        '</div>' +
      '</details>' +

      (n
        ? round.questions.map((q, qi) => questionMarkup(ctx, q, r, qi, n)).join('')
        : '<div class="empty"><span class="empty__mark">✦</span>No questions in this round yet.</div>') +

      '<div class="row row--tight" style="margin-top:.6rem">' +
        '<button class="btn btn--ghost btn--sm" data-act="addQ" data-r="' + r + '" data-type="mc">+ Multiple choice</button>' +
        '<button class="btn btn--ghost btn--sm" data-act="addQ" data-r="' + r + '" data-type="exact">+ Exact answer</button>' +
        '<button class="btn btn--ghost btn--sm" data-act="addQ" data-r="' + r + '" data-type="free">+ Free text</button>' +
      '</div>' +
    '</div>' +
  '</section>';
}

function questionMarkup(ctx, q, r, qi, total) {
  const open = ctx.openCards.has(q.id);
  const peek = q.prompt.en || pick(q.prompt, 'en');
  const label = { mc: 'Choice', exact: 'Exact', free: 'Free' }[q.type];

  return '<article class="qcard' + (open ? ' is-open' : '') + '" data-qid="' + q.id + '">' +
    '<div class="qcard__head" data-act="toggle" data-qid="' + q.id + '">' +
      '<span class="qcard__n">' + (qi + 1) + '</span>' +
      '<span class="tag tag--' + q.type + '">' + label + '</span>' +
      '<span class="qcard__peek' + (peek ? '' : ' qcard__peek--empty') + '">' +
        escapeHtml(peek || 'Untitled question') + '</span>' +
      '<span class="round__count">' + q.points + 'p</span>' +
      '<span class="qcard__chev">' + icon('down') + '</span>' +
    '</div>' +

    '<div class="qcard__body">' +
      '<div class="h-section" style="margin-top:.9rem">Question</div>' +
      langInputs('prompt', q.prompt, { r: r, q: qi }, 'What is the question?', true) +

      (q.type === 'mc' ? mcEditor(q, r, qi) : '') +
      (q.type === 'exact' ? exactEditor(q, r, qi) : '') +
      (q.type === 'free' ? freeEditor(q, r, qi) : '') +

      '<div class="grid2" style="margin-top:.9rem">' +
        '<label class="field" style="margin:0">' +
          '<span class="field__label">Points</span>' +
          '<input class="input input--sm" type="number" min="0" max="50" ' +
            'data-act="points" data-r="' + r + '" data-q="' + qi + '" value="' + q.points + '">' +
        '</label>' +
        '<label class="field" style="margin:0">' +
          '<span class="field__label">Seconds (0 = no timer)</span>' +
          '<input class="input input--sm" type="number" min="0" max="900" ' +
            'data-act="time" data-r="' + r + '" data-q="' + qi + '" value="' + q.time + '">' +
        '</label>' +
      '</div>' +

      '<label class="field" style="margin-top:.7rem">' +
        '<span class="field__label">Image URL (optional)</span>' +
        '<input class="input input--sm" type="url" data-act="image" data-r="' + r + '" ' +
          'data-q="' + qi + '" value="' + escapeHtml(q.image || '') + '" ' +
          'placeholder="https://…">' +
      '</label>' +

      '<hr class="divider" style="margin:.9rem 0">' +
      '<div class="row">' +
        '<label class="field" style="margin:0;flex:1;min-width:150px">' +
          '<span class="field__label">Type</span>' +
          '<select class="select select--sm" data-act="type" data-r="' + r + '" data-q="' + qi + '">' +
            opt('mc', 'Multiple choice', q.type) +
            opt('exact', 'Exact answer', q.type) +
            opt('free', 'Free text — you judge', q.type) +
          '</select>' +
        '</label>' +
        '<div class="spacer"></div>' +
        '<button class="iconbtn" data-act="qUp" data-r="' + r + '" data-q="' + qi + '" ' +
          'title="Move up"' + (qi === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
        '<button class="iconbtn" data-act="qDown" data-r="' + r + '" data-q="' + qi + '" ' +
          'title="Move down"' + (qi === total - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
        '<button class="iconbtn iconbtn--danger" data-act="delQ" data-r="' + r + '" ' +
          'data-q="' + qi + '" title="Delete question">' + icon('trash') + '</button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

function mcEditor(q, r, qi) {
  return '<div class="h-section" style="margin-top:.9rem">Options — tap the circle to mark the right one</div>' +
    q.options.map((o, oi) =>
      '<div class="optrow' + (o.id === q.correct ? ' is-correct' : '') + '">' +
        '<button class="optrow__pick" data-act="correct" data-r="' + r + '" data-q="' + qi + '" ' +
          'data-o="' + escapeHtml(o.id) + '" title="Mark as correct">' +
          (o.id === q.correct ? '✓' : (LETTERS[oi] || (oi + 1))) + '</button>' +
        '<div class="optrow__fields">' +
          langInputs('opt', o.text, { r: r, q: qi, o: o.id }, 'Option ' + (LETTERS[oi] || (oi + 1))) +
        '</div>' +
        '<button class="iconbtn iconbtn--danger" data-act="delOpt" data-r="' + r + '" ' +
          'data-q="' + qi + '" data-o="' + escapeHtml(o.id) + '" title="Remove option"' +
          (q.options.length <= 2 ? ' disabled' : '') + '>' + icon('trash') + '</button>' +
      '</div>').join('') +
    (q.options.length < 8
      ? '<button class="btn btn--ghost btn--sm" data-act="addOpt" data-r="' + r + '" ' +
        'data-q="' + qi + '">+ Add option</button>'
      : '');
}

function exactEditor(q, r, qi) {
  return '<label class="field" style="margin-top:.9rem">' +
      '<span class="field__label">Accepted answers — one per line</span>' +
      '<textarea class="textarea" data-act="accept" data-r="' + r + '" data-q="' + qi + '" ' +
        'placeholder="Avignon&#10;Avinhon">' + escapeHtml((q.accept || []).join('\n')) + '</textarea>' +
      '<div class="hint">Case, accents, punctuation and a leading “the” or “le” are ignored, ' +
        'so one spelling is usually enough. Add a line for genuinely different answers.</div>' +
    '</label>' +
    '<label class="row" style="gap:8px;cursor:pointer">' +
      '<input type="checkbox" data-act="fuzzy" data-r="' + r + '" data-q="' + qi + '"' +
        (q.fuzzy !== false ? ' checked' : '') + '>' +
      '<span class="fine">Forgive small typos (recommended — answers under five letters ' +
        'still have to be exact)</span>' +
    '</label>';
}

function freeEditor(q, r, qi) {
  return '<label class="field" style="margin-top:.9rem">' +
      '<span class="field__label">Note to yourself when judging</span>' +
      '<input class="input input--sm" data-act="note" data-r="' + r + '" data-q="' + qi + '" ' +
        'value="' + escapeHtml(q.note || '') + '" ' +
        'placeholder="Full points for anything mentioning the flat tyre">' +
      '<div class="hint">Answers to this question wait in the Run pane until you award ' +
        'the points.</div>' +
    '</label>';
}

/* One input per language: English is the one that matters, the other two are
   optional and fall back to English on the guest's phone. */
function langInputs(act, field, keys, placeholder, big) {
  const attrs = Object.entries(keys).map(([k, v]) => ' data-' + k + '="' + escapeHtml(String(v)) + '"').join('');
  return LANGS.map((l) => {
    const optional = l !== 'en';
    const value = escapeHtml((field && field[l]) || '');
    const ph = optional ? '(optional)' : (placeholder || '');
    const tag = big
      ? '<textarea class="textarea" style="min-height:' + (optional ? '46px' : '62px') + '"' +
        ' data-act="' + act + '"' + attrs + ' data-lang="' + l + '" placeholder="' +
        escapeHtml(ph) + '">' + value + '</textarea>'
      : '<input class="input input--sm" data-act="' + act + '"' + attrs +
        ' data-lang="' + l + '" value="' + value + '" placeholder="' + escapeHtml(ph) + '">';
    return '<div class="langrow' + (optional ? ' langrow--optional' : '') + '">' +
      '<span class="langrow__code">' + LANG_LABEL[l] + '</span>' + tag + '</div>';
  }).join('');
}

function savebar(ctx) {
  const n = countQuestions(ctx.quiz);
  return '<div class="savebar">' +
    '<span class="savebar__state" id="savebar-state">' +
      (ctx.dirty ? 'Unsaved changes' : n + (n === 1 ? ' question saved' : ' questions saved')) +
    '</span>' +
    '<button class="btn btn--ghost btn--sm" data-act="export">Export</button>' +
    '<button class="btn btn--ghost btn--sm" data-act="import">Import</button>' +
    '<button class="btn btn--gold btn--sm" id="savebar-go" data-act="save">Save &amp; publish</button>' +
  '</div>';
}

function opt(value, label, current) {
  return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' +
    label + '</option>';
}

function icon(kind) {
  const p = {
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'
  }[kind];
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

/* ------------------------------------------------------------------ events  */

function target(ctx, e) {
  const node = e.target.closest('[data-act]');
  if (!node) return null;
  const r = node.getAttribute('data-r');
  const q = node.getAttribute('data-q');
  const round = r == null ? null : ctx.quiz.rounds[Number(r)];
  const question = (round && q != null) ? round.questions[Number(q)] : null;
  return {
    node,
    act: node.getAttribute('data-act'),
    r: r == null ? null : Number(r),
    q: q == null ? null : Number(q),
    o: node.getAttribute('data-o'),
    lang: node.getAttribute('data-lang'),
    round,
    question
  };
}

function onInput(ctx, e) {
  const hit = target(ctx, e);
  if (!hit) return;
  const v = hit.node.value;

  switch (hit.act) {
    case 'title': ctx.quiz.title[hit.lang] = v; break;
    case 'rtitle': if (hit.round) hit.round.title[hit.lang] = v; break;
    case 'rblurb': if (hit.round) hit.round.blurb[hit.lang] = v; break;
    case 'prompt': if (hit.question) hit.question.prompt[hit.lang] = v; break;
    case 'image': if (hit.question) hit.question.image = v; break;
    case 'note': if (hit.question) hit.question.note = v; break;
    case 'points': if (hit.question) hit.question.points = clamp(v, 0, 50, 1); break;
    case 'time': if (hit.question) hit.question.time = clamp(v, 0, 900, 0); break;
    case 'accept':
      if (hit.question) {
        hit.question.accept = v.split('\n').map((s) => s.trim()).filter(Boolean);
      }
      break;
    case 'opt': {
      if (!hit.question) break;
      const option = (hit.question.options || []).find((o) => o.id === hit.o);
      if (option) option.text[hit.lang] = v;
      break;
    }
    default: return;
  }

  /* The round header shows the question count and the card header shows a
     preview of the prompt — keep those honest without a full redraw. */
  if (hit.act === 'prompt' && hit.lang === 'en') {
    const card = hit.node.closest('.qcard');
    const peek = card && card.querySelector('.qcard__peek');
    if (peek) {
      peek.textContent = v || 'Untitled question';
      peek.classList.toggle('qcard__peek--empty', !v);
    }
  }
  if (hit.act === 'points') {
    const card = hit.node.closest('.qcard');
    const badge = card && card.querySelector('.qcard__head .round__count');
    if (badge) badge.textContent = hit.question.points + 'p';
  }
  ctx.markDirty();
}

function onChange(ctx, e) {
  const hit = target(ctx, e);
  if (!hit) return;

  if (hit.act === 'fuzzy' && hit.question) {
    hit.question.fuzzy = hit.node.checked;
    ctx.markDirty();
    return;
  }

  if (hit.act === 'type' && hit.question) {
    retype(hit.question, hit.node.value);
    ctx.markDirty();
    renderBuild(ctx);
  }
}

/* Changing a question's kind keeps the prompt, points and timer, and swaps in
   whatever the new kind needs. */
function retype(q, type) {
  if (q.type === type) return;
  q.type = type;
  if (type === 'mc') {
    if (!q.options || q.options.length < 2) q.options = [newOption(), newOption()];
    if (!q.options.some((o) => o.id === q.correct)) q.correct = q.options[0].id;
    delete q.accept; delete q.fuzzy; delete q.note;
  } else if (type === 'exact') {
    if (!Array.isArray(q.accept)) q.accept = [];
    if (q.fuzzy === undefined) q.fuzzy = true;
    delete q.options; delete q.correct; delete q.note;
  } else {
    if (typeof q.note !== 'string') q.note = '';
    delete q.options; delete q.correct; delete q.accept; delete q.fuzzy;
  }
}

function onClick(ctx, e) {
  const hit = target(ctx, e);
  if (!hit) return;
  const quiz = ctx.quiz;

  switch (hit.act) {
    case 'toggle': {
      const id = hit.node.getAttribute('data-qid');
      if (ctx.openCards.has(id)) ctx.openCards.delete(id);
      else ctx.openCards.add(id);
      const card = hit.node.closest('.qcard');
      if (card) card.classList.toggle('is-open', ctx.openCards.has(id));
      return;
    }

    case 'addRound':
      quiz.rounds.push(newRound(quiz.rounds.length + 1));
      break;

    case 'delRound': {
      const round = hit.round;
      if (!round) return;
      const n = round.questions.length;
      if (n && !confirm('Delete "' + (round.title.en || 'this round') + '" and its ' +
        n + (n === 1 ? ' question' : ' questions') + '?')) return;
      quiz.rounds.splice(hit.r, 1);
      if (!quiz.rounds.length) quiz.rounds.push(newRound(1));
      break;
    }

    case 'roundUp': swap(quiz.rounds, hit.r, hit.r - 1); break;
    case 'roundDown': swap(quiz.rounds, hit.r, hit.r + 1); break;

    case 'addQ': {
      if (!hit.round) return;
      const q = newQuestion(hit.node.getAttribute('data-type'));
      hit.round.questions.push(q);
      ctx.openCards.add(q.id);
      break;
    }

    case 'delQ': {
      if (!hit.question) return;
      if (hit.question.prompt.en &&
          !confirm('Delete "' + hit.question.prompt.en + '"?')) return;
      hit.round.questions.splice(hit.q, 1);
      break;
    }

    case 'qUp': swap(hit.round.questions, hit.q, hit.q - 1); break;
    case 'qDown': swap(hit.round.questions, hit.q, hit.q + 1); break;

    case 'addOpt':
      if (hit.question && hit.question.options.length < 8) hit.question.options.push(newOption());
      break;

    case 'delOpt': {
      if (!hit.question || hit.question.options.length <= 2) return;
      hit.question.options = hit.question.options.filter((o) => o.id !== hit.o);
      if (!hit.question.options.some((o) => o.id === hit.question.correct)) {
        hit.question.correct = hit.question.options[0].id;
      }
      break;
    }

    case 'correct':
      if (hit.question) hit.question.correct = hit.o;
      break;

    case 'save':
      ctx.publish();
      return;

    case 'export':
      exportQuiz(ctx);
      return;

    case 'import':
      importQuiz(ctx);
      return;

    default:
      return;
  }

  ctx.markDirty();
  renderBuild(ctx);
}

function swap(arr, a, b) {
  if (b < 0 || b >= arr.length) return;
  const tmp = arr[a];
  arr[a] = arr[b];
  arr[b] = tmp;
}

function clamp(v, min, max, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------ import/export */

function exportQuiz(ctx) {
  const blob = new Blob([JSON.stringify(normaliseQuiz(ctx.quiz), null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jj-quiz.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Exported jj-quiz.json', 'good');
}

function importQuiz(ctx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const quiz = normaliseQuiz(parsed);
        if (!confirm('Replace the quiz you have open with ' + countQuestions(quiz) +
          ' imported questions? Nothing is published until you press Save.')) return;
        ctx.quiz = quiz;
        ctx.openCards.clear();
        ctx.markDirty();
        renderBuild(ctx);
        toast('Imported — press Save & publish when you are happy', 'good');
      } catch (err) {
        console.error('[quiz] import failed', err);
        toast('That file is not a quiz export.', 'bad');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

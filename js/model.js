/* ---------------------------------------------------------------------------
   Quiz data model, answer normalisation and scoring.

   A quiz is plain JSON so it can be exported, edited by hand and re-imported:

     { title, rounds: [ { id, title:{en,fr,ko}, blurb:{...},
                          questions: [ Question ] } ] }

     Question = {
       id, type: 'mc' | 'exact' | 'free',
       prompt: {en,fr,ko},
       image: '',                              // optional URL
       points: 1,
       time: 45,                               // seconds, 0 = untimed
       options: [ { id, text:{en,fr,ko} } ],   // mc only
       correct: 'optionId',                    // mc only
       accept: ['answer', 'other spelling'],   // exact only
       fuzzy: true,                            // exact only - tolerate typos
       note: ''                                // free only - judging guidance
     }
   --------------------------------------------------------------------------- */

import { DEFAULT_TIME_LIMIT } from './config.js';

export const LANGS = ['en', 'fr', 'ko'];

export const QUESTION_TYPES = {
  mc:    { key: 'mc',    auto: true  },
  exact: { key: 'exact', auto: true  },
  free:  { key: 'free',  auto: false }
};

let seq = 0;
export function uid(prefix) {
  seq += 1;
  return (prefix || 'id') + '_' + Date.now().toString(36) + seq.toString(36) +
         Math.random().toString(36).slice(2, 6);
}

export function emptyI18n() {
  return { en: '', fr: '', ko: '' };
}

/* Pick the best available language for a translated field: asked-for language,
   then English, then anything non-empty. Lets you write a quiz in English only
   and still have it read sensibly on a Korean phone. */
export function pick(field, lang) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (field[lang]) return field[lang];
  if (field.en) return field.en;
  for (const l of LANGS) if (field[l]) return field[l];
  return '';
}

export function newQuestion(type) {
  const q = {
    id: uid('q'),
    type: type || 'mc',
    prompt: emptyI18n(),
    image: '',
    points: 1,
    time: DEFAULT_TIME_LIMIT
  };
  if (q.type === 'mc') {
    q.options = [newOption(), newOption()];
    q.correct = q.options[0].id;
  }
  if (q.type === 'exact') {
    q.accept = [];
    q.fuzzy = true;
  }
  if (q.type === 'free') q.note = '';
  return q;
}

export function newOption() {
  return { id: uid('o'), text: emptyI18n() };
}

export function newRound(n) {
  return {
    id: uid('r'),
    title: { en: 'Round ' + n, fr: 'Manche ' + n, ko: n + '라운드' },
    blurb: emptyI18n(),
    questions: []
  };
}

export function newQuiz() {
  return {
    title: { en: 'J & J Wedding Quiz', fr: 'Quiz du mariage J & J', ko: 'J & J 결혼식 퀴즈' },
    rounds: [newRound(1), newRound(2), newRound(3)]
  };
}

/* Repair anything missing after a hand-edit or an older export, so one bad
   field can never take the whole evening down. */
export function normaliseQuiz(raw) {
  const quiz = (raw && typeof raw === 'object') ? raw : {};
  const out = {
    title: fixI18n(quiz.title, 'J & J Wedding Quiz'),
    rounds: []
  };
  const rounds = Array.isArray(quiz.rounds) ? quiz.rounds : [];
  rounds.forEach((r, i) => {
    const round = {
      id: (r && r.id) || uid('r'),
      title: fixI18n(r && r.title, 'Round ' + (i + 1)),
      blurb: fixI18n(r && r.blurb, ''),
      questions: []
    };
    const qs = (r && Array.isArray(r.questions)) ? r.questions : [];
    qs.forEach((q) => {
      const t = QUESTION_TYPES[q && q.type] ? q.type : 'mc';
      const item = {
        id: (q && q.id) || uid('q'),
        type: t,
        prompt: fixI18n(q && q.prompt, ''),
        image: (q && typeof q.image === 'string') ? q.image : '',
        points: clampInt(q && q.points, 1, 0, 50),
        time: clampInt(q && q.time, DEFAULT_TIME_LIMIT, 0, 900)
      };
      if (t === 'mc') {
        const opts = (q && Array.isArray(q.options) ? q.options : []).map((o) => ({
          id: (o && o.id) || uid('o'),
          text: fixI18n(o && o.text, '')
        }));
        while (opts.length < 2) opts.push(newOption());
        item.options = opts;
        item.correct = opts.some((o) => o.id === (q && q.correct)) ? q.correct : opts[0].id;
      } else if (t === 'exact') {
        item.accept = (q && Array.isArray(q.accept) ? q.accept : [])
          .map((s) => String(s || '').trim()).filter(Boolean);
        item.fuzzy = (q && q.fuzzy) !== false;
      } else {
        item.note = (q && typeof q.note === 'string') ? q.note : '';
      }
      round.questions.push(item);
    });
    out.rounds.push(round);
  });
  if (!out.rounds.length) out.rounds.push(newRound(1));
  return out;
}

function fixI18n(v, fallback) {
  const base = emptyI18n();
  if (typeof v === 'string') { base.en = v; return base; }
  if (v && typeof v === 'object') {
    for (const l of LANGS) if (typeof v[l] === 'string') base[l] = v[l];
  }
  if (!base.en && fallback) base.en = fallback;
  return base;
}

function clampInt(v, dflt, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/* ---------------------------------------------------------------- questions */

export function questionAt(quiz, r, q) {
  const round = quiz && quiz.rounds && quiz.rounds[r];
  if (!round) return null;
  return (round.questions && round.questions[q]) || null;
}

export function roundAt(quiz, r) {
  return (quiz && quiz.rounds && quiz.rounds[r]) || null;
}

/* Walk to the next question, rolling into the next round. Returns null at the
   end of the quiz. */
export function nextPosition(quiz, r, q) {
  const rounds = (quiz && quiz.rounds) || [];
  let ri = r, qi = q + 1;
  while (ri < rounds.length) {
    const qs = (rounds[ri] && rounds[ri].questions) || [];
    if (qi < qs.length) return { r: ri, q: qi };
    ri += 1; qi = 0;
  }
  return null;
}

export function prevPosition(quiz, r, q) {
  const rounds = (quiz && quiz.rounds) || [];
  let ri = r, qi = q - 1;
  while (ri >= 0) {
    if (qi >= 0) return { r: ri, q: qi };
    ri -= 1;
    if (ri < 0) return null;
    qi = ((rounds[ri] && rounds[ri].questions) || []).length - 1;
  }
  return null;
}

export function countQuestions(quiz) {
  return ((quiz && quiz.rounds) || [])
    .reduce((n, r) => n + ((r.questions || []).length), 0);
}

export function answerKey(r, q) { return r + '-' + q; }

/* ------------------------------------------------------------ normalisation */

const ARTICLES = /^(the|le|la|les|l|un|une|des|a|an|el|il)\s+/;
const APOSTROPHE = /'/g;

/* Make two answers comparable: case, accents, punctuation, spacing and a
   leading article are all noise. */
export function normalise(s) {
  let v = String(s == null ? '' : s);
  v = v.normalize('NFD').replace(/[̀-ͯ]/g, '');
  v = v.toLowerCase();
  v = v.replace(/[^\p{L}\p{N}\s']/gu, ' ');
  v = v.replace(APOSTROPHE, ' ');
  v = v.replace(/\s+/g, ' ').trim();
  v = v.replace(ARTICLES, '');
  /* NFD split Hangul syllables into jamo; put them back so Korean compares
     (and measures typo distance) one syllable at a time. */
  return v.trim().normalize('NFC');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/* Typo tolerance scaled to the length of the expected answer: short answers
   must be spot on, longer ones get a character of slack every six or so. */
function tolerance(len) {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return Math.min(3, Math.floor(len / 6));
}

export function matchesExact(question, value) {
  const given = normalise(value);
  if (!given) return false;
  const accepted = (question.accept || []).map(normalise).filter(Boolean);
  for (const a of accepted) {
    if (given === a) return true;
    if (question.fuzzy !== false && levenshtein(given, a) <= tolerance(a.length)) return true;
  }
  return false;
}

/* Grade a submitted answer. Auto types resolve immediately; 'free' comes back
   pending so the admin can judge it. */
export function grade(question, value) {
  if (!question) return { state: 'pending', pts: 0 };
  const max = Number(question.points) || 0;
  if (question.type === 'mc') {
    const ok = !!value && value === question.correct;
    return { state: ok ? 'correct' : 'wrong', pts: ok ? max : 0 };
  }
  if (question.type === 'exact') {
    const ok = matchesExact(question, value);
    return { state: ok ? 'correct' : 'wrong', pts: ok ? max : 0 };
  }
  return { state: 'pending', pts: 0 };
}

/* -------------------------------------------------------------------- score */

/* Totals are always derived from the answer records plus any manual nudge, so
   a re-judged answer or an edited question can never leave a stale total. */
export function computeScores(teams, answers, adjust) {
  const totals = {};
  Object.keys(teams || {}).forEach((id) => { totals[id] = 0; });
  Object.values(answers || {}).forEach((byTeam) => {
    Object.entries(byTeam || {}).forEach(([id, a]) => {
      if (!(id in totals)) return;
      totals[id] += Number(a && a.pts) || 0;
    });
  });
  Object.entries(adjust || {}).forEach(([id, v]) => {
    if (!(id in totals)) return;
    totals[id] += Number(v) || 0;
  });
  return totals;
}

export function scoresForRound(teams, answers, roundIdx) {
  const totals = {};
  Object.keys(teams || {}).forEach((id) => { totals[id] = 0; });
  Object.entries(answers || {}).forEach(([key, byTeam]) => {
    if (Number(String(key).split('-')[0]) !== roundIdx) return;
    Object.entries(byTeam || {}).forEach(([id, a]) => {
      if (!(id in totals)) return;
      totals[id] += Number(a && a.pts) || 0;
    });
  });
  return totals;
}

/* Ranked leaderboard with shared places for ties (1, 2, 2, 4). */
export function leaderboard(teams, totals) {
  const rows = Object.entries(teams || {}).map(([id, t]) => ({
    id,
    name: (t && t.name) || '—',
    emoji: (t && t.emoji) || '✦',
    color: (t && t.color) || '#683240',
    score: Number(totals && totals[id]) || 0
  }));
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let place = 0, prev = null;
  rows.forEach((row, i) => {
    if (prev === null || row.score !== prev) place = i + 1;
    row.place = place;
    prev = row.score;
  });
  return rows;
}

/* ---------------------------------------------------------------------------
   Language state and translation for the guest-facing pages, following the
   same markup hooks as the main wedding site (js/site.js):

     [data-i18n]       -> textContent
     [data-i18n-html]  -> innerHTML
     [data-i18n-attr]  -> "attr:key" pairs, e.g. "placeholder:join.ph"
     [data-i18n-aria]  -> aria-label
     .lang-btn[data-lang] -> language buttons

   The choice is stored under the same localStorage key as the main site, so a
   guest who browsed the wedding site in French lands on the quiz in French.

   The admin console is deliberately English-only - it is for the two of you,
   and keeping it untranslated keeps the builder simple.
   --------------------------------------------------------------------------- */

const STORAGE_KEY = 'jj-lang';
const DEFAULT_LANG = 'en';
export const LANGS = ['en', 'fr', 'ko'];
const LANG_CODE = { en: 'EN', fr: 'FR', ko: 'KR' };

const STR = {
  en: {
    'doc.join': 'J&J Wedding Quiz',
    'doc.host': 'J&J Wedding Quiz — Big Screen',
    'doc.admin': 'J&J Wedding Quiz — Admin',

    'brand.title': 'The J & J Quiz',
    'brand.sub': '10 · 10 · 2026 · Provence',

    /* joining */
    'join.h1': 'Pick a team name',
    'join.lead': 'One phone per table is plenty — gather round, agree on a name, and you are in.',
    'join.label': 'Your team name',
    'join.ph': 'The Lavender Legends',
    'join.cta': 'Join the quiz',
    'join.joining': 'Joining…',
    'join.err.empty': 'Your team needs a name first.',
    'join.err.taken': 'Another table already took that one. Try a different name.',
    'join.err.failed': 'Could not join. Check your connection and try again.',
    'join.err.closed': 'The quiz is already under way — find one of us and we will add you.',
    'join.shuffle': 'Surprise me',

    /* lobby / waiting */
    'lobby.in': 'You are in!',
    'lobby.wait': 'Keep this page open. The first question will appear here.',
    'lobby.teams': 'Tables already playing',
    'lobby.rename': 'Change name',

    /* playing */
    'play.round': 'Round',
    'play.question': 'Question',
    'play.of': 'of',
    'play.pts': 'pt',
    'play.pts.plural': 'pts',
    'play.ph': 'Your answer',
    'play.submit': 'Lock it in',
    'play.change': 'Change answer',
    'play.sent': 'Answer locked',
    'play.sentNote': 'You can change it until the time runs out.',
    'play.closed': 'Answers are closed',
    'play.timeup': 'Time!',
    'play.waitNext': 'Sit tight — the next question is coming.',
    'play.correct': 'Correct!',
    'play.wrong': 'Not this time',
    'play.pending': 'With the judges',
    'play.pendingNote': 'A human is reading this one. Points shortly.',
    'play.noAnswer': 'No answer from your table',
    'play.gotPts': 'You scored',
    'play.answerWas': 'The answer was',
    'play.yourScore': 'Your score',
    'play.rank': 'Place',

    /* scores */
    'scores.title': 'Scores',
    'scores.round': 'After this round',
    'scores.final': 'Final scores',
    'scores.you': 'you',

    /* end */
    'end.title': 'That is a wrap',
    'end.thanks': 'Thank you for playing — now back to the dancing.',
    'end.winner': 'Winning table',

    /* host screen */
    'host.join': 'Scan to join',
    'host.joinAt': 'or go to',
    'host.waiting': 'Waiting for tables to join…',
    'host.teamsIn': 'tables in',
    'host.answersIn': 'answers in',
    'host.getReady': 'Get ready',
    'host.roundAhead': 'Coming up',
    'host.correctAnswer': 'The answer',
    'host.awarded': 'Points awarded',
    'host.nobody': 'Nobody got it',
    'host.gotIt': 'got it',
    'host.podium': 'Leaderboard',

    /* shared chrome */
    'ui.lang': 'Language',
    'ui.offline': 'Offline rehearsal mode',
    'ui.reconnecting': 'Reconnecting…',
    'ui.back': 'Back'
  },

  fr: {
    'doc.join': 'Quiz du mariage J&J',
    'doc.host': 'Quiz du mariage J&J — Grand écran',
    'doc.admin': 'Quiz du mariage J&J — Admin',

    'brand.title': 'Le Quiz de J & J',
    'brand.sub': '10 · 10 · 2026 · Provence',

    'join.h1': 'Choisissez un nom d’équipe',
    'join.lead': 'Un téléphone par table suffit — rassemblez-vous, trouvez un nom, et c’est parti.',
    'join.label': 'Le nom de votre équipe',
    'join.ph': 'Les Légendes de Lavande',
    'join.cta': 'Rejoindre le quiz',
    'join.joining': 'Connexion…',
    'join.err.empty': 'Votre équipe a d’abord besoin d’un nom.',
    'join.err.taken': 'Une autre table a déjà pris ce nom. Essayez-en un autre.',
    'join.err.failed': 'Impossible de rejoindre. Vérifiez votre connexion et réessayez.',
    'join.err.closed': 'Le quiz a déjà commencé — faites-nous signe et on vous ajoute.',
    'join.shuffle': 'Surprenez-moi',

    'lobby.in': 'Vous êtes inscrits !',
    'lobby.wait': 'Gardez cette page ouverte. La première question apparaîtra ici.',
    'lobby.teams': 'Tables déjà en jeu',
    'lobby.rename': 'Changer de nom',

    'play.round': 'Manche',
    'play.question': 'Question',
    'play.of': 'sur',
    'play.pts': 'pt',
    'play.pts.plural': 'pts',
    'play.ph': 'Votre réponse',
    'play.submit': 'Valider',
    'play.change': 'Modifier',
    'play.sent': 'Réponse validée',
    'play.sentNote': 'Vous pouvez la modifier jusqu’à la fin du temps.',
    'play.closed': 'Les réponses sont closes',
    'play.timeup': 'Terminé !',
    'play.waitNext': 'Un instant — la prochaine question arrive.',
    'play.correct': 'Bonne réponse !',
    'play.wrong': 'Pas cette fois',
    'play.pending': 'Chez les juges',
    'play.pendingNote': 'Un humain lit votre réponse. Les points arrivent.',
    'play.noAnswer': 'Pas de réponse de votre table',
    'play.gotPts': 'Vous marquez',
    'play.answerWas': 'La réponse était',
    'play.yourScore': 'Votre score',
    'play.rank': 'Place',

    'scores.title': 'Scores',
    'scores.round': 'Après cette manche',
    'scores.final': 'Scores finaux',
    'scores.you': 'vous',

    'end.title': 'C’est terminé',
    'end.thanks': 'Merci d’avoir joué — retour sur la piste de danse.',
    'end.winner': 'Table gagnante',

    'host.join': 'Scannez pour jouer',
    'host.joinAt': 'ou rendez-vous sur',
    'host.waiting': 'En attente des tables…',
    'host.teamsIn': 'tables inscrites',
    'host.answersIn': 'réponses reçues',
    'host.getReady': 'Préparez-vous',
    'host.roundAhead': 'À suivre',
    'host.correctAnswer': 'La réponse',
    'host.awarded': 'Points attribués',
    'host.nobody': 'Personne n’a trouvé',
    'host.gotIt': 'ont trouvé',
    'host.podium': 'Classement',

    'ui.lang': 'Langue',
    'ui.offline': 'Mode répétition hors ligne',
    'ui.reconnecting': 'Reconnexion…',
    'ui.back': 'Retour'
  },

  ko: {
    'doc.join': 'J&J 결혼식 퀴즈',
    'doc.host': 'J&J 결혼식 퀴즈 — 큰 화면',
    'doc.admin': 'J&J 결혼식 퀴즈 — 관리자',

    'brand.title': 'J & J 퀴즈',
    'brand.sub': '2026 · 10 · 10 · 프로방스',

    'join.h1': '팀 이름을 정해 주세요',
    'join.lead': '테이블당 휴대폰 한 대면 충분해요. 다 같이 모여 이름을 정하면 준비 완료입니다.',
    'join.label': '우리 팀 이름',
    'join.ph': '라벤더 레전드',
    'join.cta': '퀴즈 참여하기',
    'join.joining': '참여하는 중…',
    'join.err.empty': '먼저 팀 이름을 지어 주세요.',
    'join.err.taken': '다른 테이블이 이미 사용 중이에요. 다른 이름을 골라 주세요.',
    'join.err.failed': '참여하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    'join.err.closed': '퀴즈가 이미 시작됐어요 — 저희에게 알려 주시면 추가해 드릴게요.',
    'join.shuffle': '랜덤으로 지어 주세요',

    'lobby.in': '참여 완료!',
    'lobby.wait': '이 페이지를 열어 두세요. 첫 문제가 여기에 나타납니다.',
    'lobby.teams': '참여 중인 테이블',
    'lobby.rename': '이름 바꾸기',

    'play.round': '라운드',
    'play.question': '문제',
    'play.of': '/',
    'play.pts': '점',
    'play.pts.plural': '점',
    'play.ph': '답을 입력하세요',
    'play.submit': '제출하기',
    'play.change': '답 바꾸기',
    'play.sent': '제출 완료',
    'play.sentNote': '시간이 끝나기 전까지 바꿀 수 있어요.',
    'play.closed': '답안 제출이 마감됐어요',
    'play.timeup': '시간 종료!',
    'play.waitNext': '잠시만요 — 다음 문제가 곧 나옵니다.',
    'play.correct': '정답입니다!',
    'play.wrong': '아쉬워요',
    'play.pending': '심사 중',
    'play.pendingNote': '사람이 직접 읽고 있어요. 곧 점수가 나옵니다.',
    'play.noAnswer': '우리 테이블은 답하지 않았어요',
    'play.gotPts': '획득 점수',
    'play.answerWas': '정답은',
    'play.yourScore': '우리 점수',
    'play.rank': '순위',

    'scores.title': '점수',
    'scores.round': '이번 라운드 후',
    'scores.final': '최종 점수',
    'scores.you': '우리 팀',

    'end.title': '퀴즈 끝!',
    'end.thanks': '함께해 주셔서 고맙습니다 — 이제 다시 춤추러 가요.',
    'end.winner': '우승 테이블',

    'host.join': '스캔해서 참여',
    'host.joinAt': '또는 이 주소로',
    'host.waiting': '테이블 참여를 기다리는 중…',
    'host.teamsIn': '팀 참여',
    'host.answersIn': '답안 도착',
    'host.getReady': '준비하세요',
    'host.roundAhead': '다음 순서',
    'host.correctAnswer': '정답',
    'host.awarded': '점수 부여',
    'host.nobody': '아무도 맞히지 못했어요',
    'host.gotIt': '팀 정답',
    'host.podium': '순위표',

    'ui.lang': '언어',
    'ui.offline': '오프라인 리허설 모드',
    'ui.reconnecting': '다시 연결하는 중…',
    'ui.back': '뒤로'
  }
};

function stored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGS.indexOf(v) !== -1 ? v : DEFAULT_LANG;
  } catch (e) {
    return DEFAULT_LANG;
  }
}

let current = stored();

export function lang() { return current; }

export function t(key) {
  const d = STR[current] || STR.en;
  if (d[key] != null) return d[key];
  if (STR.en[key] != null) return STR.en[key];
  return key;
}

/* "3 pts" / "1 pt", and Korean where the unit never pluralises. */
export function points(n) {
  const unit = Math.abs(Number(n)) === 1 ? t('play.pts') : t('play.pts.plural');
  return n + ' ' + unit;
}

export function apply(root) {
  const scope = root || document;
  document.documentElement.lang = current;

  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
  scope.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === current);
  });
  scope.querySelectorAll('[data-lang-code]').forEach((el) => {
    el.textContent = LANG_CODE[current] || current.toUpperCase();
  });
}

export function setLang(next) {
  if (LANGS.indexOf(next) === -1 || next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode */ }
  apply();
  /* Announced only on a real change, never from apply() itself: page scripts
     repaint on this event and then re-translate what they painted, which would
     otherwise loop forever. */
  document.dispatchEvent(new CustomEvent('jj:langchange', { detail: { lang: current } }));
}

/* Wire the language menu once per page. */
export function mountLangSwitch() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    const btn = e.target.closest('.lang-btn');
    if (btn) {
      setLang(btn.getAttribute('data-lang'));
      closeMenus();
      return;
    }
    if (!e.target.closest('.lang-menu')) closeMenus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  apply();
}

function closeMenus() {
  document.querySelectorAll('.lang-menu[open]').forEach((d) => { d.open = false; });
}

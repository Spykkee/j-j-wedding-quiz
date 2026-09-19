/* Live check against the real Firebase project: does the app work, and do the
   deployed rules actually stop a guest doing what a guest should not?

   Run it after any change to database.rules.json:

     JJQ_ADMIN_PW="your-admin-password" node tests/live-rules.mjs

   It works in its own room ('ruletest') and deletes everything it wrote, so it
   never touches the real game. It does create two throwaway anonymous users
   each run; clear them out in Authentication > Users if they pile up.        */

const KEY = 'AIzaSyDwfclCjARJ47hA7egEpwKCXRz-Fe7xRec';
const DB = 'https://jj-wedding-quiz-default-rtdb.europe-west1.firebasedatabase.app';
const ROOM = 'ruletest';
const PW = process.env.JJQ_ADMIN_PW;
const EMAIL = process.env.JJQ_ADMIN_EMAIL || 'aerojim92@gmail.com';
if (!PW) {
  console.error('Set the admin password first, e.g.');
  console.error('  JJQ_ADMIN_PW="your-password" node tests/live-rules.mjs');
  process.exit(2);
}

let fails = 0;
function ok(label, cond, extra) {
  if (cond) console.log('ok    ' + label);
  else { fails++; console.log('FAIL  ' + label + (extra ? '  :: ' + extra : '')); }
}

async function idToken(body) {
  const url = body.email
    ? 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY
    : 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true })
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return { token: j.idToken, uid: j.localId };
}

const db = async (method, path, token, body) => {
  const r = await fetch(DB + '/rooms/' + ROOM + '/' + path + '.json?auth=' + token, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: r.status, ok: r.ok, body: await r.text() };
};

const admin = await idToken({ email: EMAIL, password: PW });
console.log('signed in as admin, uid', admin.uid);
const guest = await idToken({});
const guest2 = await idToken({});
console.log('two anonymous guests:', guest.uid.slice(0, 8), guest2.uid.slice(0, 8));
console.log('');

/* ---- admin can publish ------------------------------------------------ */
ok('admin writes the private quiz',
   (await db('PUT', 'quiz', admin.token, { title: { en: 'T' }, rounds: [] })).ok);
ok('admin writes the public projection',
   (await db('PUT', 'pub', admin.token, { title: { en: 'T' }, rounds: [] })).ok);
ok('admin writes the game state',
   (await db('PUT', 'state', admin.token, { phase: 'question', r: 0, q: 0, open: false })).ok);

/* ---- the answer leak this whole design exists to prevent --------------- */
const peek = await db('GET', 'quiz', guest.token);
ok('GUEST CANNOT READ THE QUIZ (answers stay secret)', peek.status === 401 || peek.status === 403,
   'status ' + peek.status);
ok('guest can read the public projection', (await db('GET', 'pub', guest.token)).ok);
ok('guest can read the game state', (await db('GET', 'state', guest.token)).ok);

/* ---- team records ------------------------------------------------------ */
ok('guest joins under its own uid',
   (await db('PUT', 'teams/' + guest.uid, guest.token, { name: 'Alpha', at: Date.now() })).ok);
const hijack = await db('PUT', 'teams/' + guest2.uid, guest.token, { name: 'Stolen', at: Date.now() });
ok('GUEST CANNOT WRITE ANOTHER TABLE\'S RECORD', !hijack.ok, 'status ' + hijack.status);
const longName = await db('PUT', 'teams/' + guest.uid, guest.token,
  { name: 'x'.repeat(40), at: Date.now() });
ok('over-long team name rejected', !longName.ok, 'status ' + longName.status);

/* ---- answers are only accepted while a question is open ---------------- */
const closed = await db('PUT', 'answers/0-0/' + guest.uid, guest.token,
  { name: 'Alpha', value: 'sneaky', at: Date.now() });
ok('ANSWER REFUSED WHILE THE QUESTION IS CLOSED', !closed.ok, 'status ' + closed.status);

await db('PATCH', 'state', admin.token, { open: true });
ok('answer accepted once the admin opens it',
   (await db('PUT', 'answers/0-0/' + guest.uid, guest.token,
     { name: 'Alpha', value: 'Mistral', at: Date.now() })).ok);

/* ---- the scoring boundary --------------------------------------------- */
const selfScore = await db('PUT', 'answers/0-0/' + guest.uid, guest.token,
  { name: 'Alpha', value: 'Mistral', at: Date.now(), pts: 999, state: 'correct' });
ok('GUEST CANNOT AWARD ITSELF POINTS', !selfScore.ok, 'status ' + selfScore.status);

const patchPts = await db('PATCH', 'answers/0-0/' + guest.uid, guest.token, { pts: 50 });
ok('guest cannot patch points in either', !patchPts.ok, 'status ' + patchPts.status);

ok('admin can award points',
   (await db('PATCH', 'answers/0-0/' + guest.uid, admin.token,
     { pts: 2, state: 'correct', manual: true })).ok);

const adjust = await db('PUT', 'adjust/' + guest.uid, guest.token, 99);
ok('GUEST CANNOT TOUCH THE MANUAL SCORE ADJUSTMENTS', !adjust.ok, 'status ' + adjust.status);

const overLong = await db('PUT', 'answers/0-1/' + guest.uid, guest.token,
  { name: 'Alpha', value: 'y'.repeat(400), at: Date.now() });
ok('over-long answer rejected', !overLong.ok, 'status ' + overLong.status);

const junk = await db('PATCH', 'answers/0-0/' + guest.uid, guest.token, { evil: true });
ok('unknown fields rejected', !junk.ok, 'status ' + junk.status);

/* ---- guest cannot drive the game -------------------------------------- */
const drive = await db('PATCH', 'state', guest.token, { phase: 'ended' });
ok('GUEST CANNOT DRIVE THE GAME STATE', !drive.ok, 'status ' + drive.status);
const publish = await db('PUT', 'pub', guest.token, { title: { en: 'hacked' }, rounds: [] });
ok('guest cannot rewrite the questions', !publish.ok, 'status ' + publish.status);

/* ---- the Tables pane's reset buttons ----------------------------------- */
const wipeTeams = await db('DELETE', 'teams', guest.token);
ok('GUEST CANNOT WIPE EVERY TABLE', !wipeTeams.ok, 'status ' + wipeTeams.status);
const wipeAnswers = await db('DELETE', 'answers', guest.token);
ok('guest cannot wipe every answer', !wipeAnswers.ok, 'status ' + wipeAnswers.status);

ok('admin can clear all answers', (await db('DELETE', 'answers', admin.token)).ok);
ok('admin can clear all adjustments', (await db('DELETE', 'adjust', admin.token)).ok);
ok('admin can remove all tables', (await db('DELETE', 'teams', admin.token)).ok);

/* ---- tidy up ----------------------------------------------------------- */
for (const p of ['quiz', 'pub', 'state']) await db('DELETE', p, admin.token);
const leftovers = [];
for (const p of ['quiz', 'pub', 'state', 'teams', 'answers', 'adjust']) {
  const r = await db('GET', p, admin.token);
  if (r.body.trim() !== 'null') leftovers.push(p + '=' + r.body.trim().slice(0, 40));
}
ok('test room is empty again', leftovers.length === 0, leftovers.join(', '));

console.log('');
console.log(fails ? fails + ' FAILURES' : 'all live checks passed');
process.exit(fails ? 1 : 0);

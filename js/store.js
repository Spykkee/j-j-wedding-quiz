/* ---------------------------------------------------------------------------
   The one place that knows where the game lives.

   Two interchangeable drivers behind the same tiny interface:

     firebase  - Realtime Database. Guests sign in anonymously, the admin signs
                 in with the email/password account you created in the console.
     offline   - localStorage + BroadcastChannel. Everything works on a single
                 device across browser tabs, so you can build the quiz and
                 rehearse the whole evening with no network and no account.

   The driver is chosen automatically: Firebase if config.js has an apiKey,
   offline otherwise. Add ?offline=1 to any URL to force offline mode.

   Interface
     mode                     'firebase' | 'offline'
     ready()                  -> Promise, resolves once connected/loaded
     now()                    -> ms, corrected against the server clock
     watch(path, cb)          -> unsubscribe(); cb(value) on every change
     read(path)               -> Promise<value>
     write(path, value)       -> Promise
     merge(path, object)      -> Promise (shallow update)
     erase(path)              -> Promise
     signInGuest()            -> Promise<uid>
     signInAdmin(email, pw)   -> Promise
     signOutAdmin()           -> Promise
     onAdmin(cb)              -> unsubscribe(); cb(emailOrNull)
     onConnection(cb)         -> unsubscribe(); cb(bool)

   Paths are '/'-joined and relative to the room, e.g. 'teams/abc123'.
   --------------------------------------------------------------------------- */

import { FIREBASE, ROOM } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';

export function firebaseConfigured() {
  return !!(FIREBASE && FIREBASE.apiKey && FIREBASE.databaseURL);
}

export function forcedOffline() {
  try {
    return new URLSearchParams(location.search).get('offline') === '1';
  } catch (e) {
    return false;
  }
}

let singleton = null;

export function openStore() {
  if (!singleton) {
    singleton = (firebaseConfigured() && !forcedOffline())
      ? firebaseDriver()
      : offlineDriver();
  }
  return singleton;
}

/* ============================================================== firebase === */

function firebaseDriver() {
  const root = 'rooms/' + ROOM;
  const full = (p) => (p ? root + '/' + p : root);

  let fb = null;                 // resolved SDK bindings
  let offset = 0;                // server clock - local clock, in ms
  let adminUser = null;
  const adminSubs = new Set();
  const connSubs = new Set();
  let connected = false;

  const boot = (async () => {
    const [appMod, dbMod, authMod] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-database.js'),
      import(SDK + 'firebase-auth.js')
    ]);
    const app = appMod.initializeApp(FIREBASE);
    const db = dbMod.getDatabase(app);
    const auth = authMod.getAuth(app);
    fb = { db, auth, d: dbMod, a: authMod };

    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), (snap) => {
      offset = Number(snap.val()) || 0;
    });
    dbMod.onValue(dbMod.ref(db, '.info/connected'), (snap) => {
      connected = snap.val() === true;
      connSubs.forEach((cb) => cb(connected));
    });
    authMod.onAuthStateChanged(auth, (user) => {
      /* Anonymous guests are users too - only a signed-in email counts as the
         admin, which is exactly what the database rules check. */
      adminUser = (user && !user.isAnonymous && user.email) ? user.email : null;
      adminSubs.forEach((cb) => cb(adminUser));
    });
    return fb;
  })();

  return {
    mode: 'firebase',
    ready: () => boot,
    now: () => Date.now() + offset,

    watch(path, cb) {
      let off = null, dead = false;
      boot.then(({ db, d }) => {
        if (dead) return;
        off = d.onValue(d.ref(db, full(path)), (snap) => cb(snap.val()),
          (err) => { console.warn('[quiz] watch failed on', path, err.code || err); });
      });
      return () => { dead = true; if (off) off(); };
    },

    async read(path) {
      const { db, d } = await boot;
      const snap = await d.get(d.ref(db, full(path)));
      return snap.val();
    },

    async write(path, value) {
      const { db, d } = await boot;
      return d.set(d.ref(db, full(path)), value);
    },

    async merge(path, obj) {
      const { db, d } = await boot;
      return d.update(d.ref(db, full(path)), obj);
    },

    async erase(path) {
      const { db, d } = await boot;
      return d.remove(d.ref(db, full(path)));
    },

    async signInGuest() {
      const { auth, a } = await boot;
      if (auth.currentUser) return auth.currentUser.uid;
      const cred = await a.signInAnonymously(auth);
      return cred.user.uid;
    },

    async signInAdmin(email, password) {
      const { auth, a } = await boot;
      /* An anonymous session would shadow the admin sign-in, so clear it. */
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        await a.signOut(auth);
      }
      await a.signInWithEmailAndPassword(auth, email, password);
    },

    async signOutAdmin() {
      const { auth, a } = await boot;
      await a.signOut(auth);
    },

    onAdmin(cb) {
      adminSubs.add(cb);
      boot.then(() => cb(adminUser));
      return () => adminSubs.delete(cb);
    },

    onConnection(cb) {
      connSubs.add(cb);
      boot.then(() => cb(connected));
      return () => connSubs.delete(cb);
    }
  };
}

/* =============================================================== offline === */

function offlineDriver() {
  const KEY = 'jjq:' + ROOM;
  const subs = [];                 // { path, cb }
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* full or private */ }
  }

  const channel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('jjq-' + ROOM)
    : null;

  /* Another tab changed something: reload and re-fire every watcher. Cheap,
     and the whole room is a few kilobytes. */
  function adopt() {
    data = load();
    subs.forEach((s) => s.cb(clone(at(data, s.path))));
  }
  if (channel) channel.onmessage = adopt;
  window.addEventListener('storage', (e) => { if (e.key === KEY) adopt(); });

  function announce(changedPath) {
    save();
    subs.forEach((s) => {
      if (overlaps(s.path, changedPath)) s.cb(clone(at(data, s.path)));
    });
    if (channel) channel.postMessage(1);
  }

  return {
    mode: 'offline',
    ready: () => Promise.resolve(),
    now: () => Date.now(),

    watch(path, cb) {
      const entry = { path, cb };
      subs.push(entry);
      /* Match Firebase: the first value arrives asynchronously, so callers can
         finish wiring up before it lands. */
      Promise.resolve().then(() => {
        if (subs.indexOf(entry) !== -1) cb(clone(at(data, path)));
      });
      return () => {
        const i = subs.indexOf(entry);
        if (i !== -1) subs.splice(i, 1);
      };
    },

    read(path) { return Promise.resolve(clone(at(data, path))); },

    write(path, value) {
      put(data, path, clone(value));
      announce(path);
      return Promise.resolve();
    },

    merge(path, obj) {
      Object.entries(obj || {}).forEach(([k, v]) => {
        /* Firebase update() treats 'a/b' keys as deep paths - do the same. */
        put(data, path ? path + '/' + k : k, clone(v));
      });
      announce(path);
      return Promise.resolve();
    },

    erase(path) {
      put(data, path, null);
      announce(path);
      return Promise.resolve();
    },

    signInGuest() {
      /* sessionStorage, not localStorage: each tab is its own team, which is
         what you want when rehearsing several teams on one laptop. */
      let id = null;
      try { id = sessionStorage.getItem('jjq-uid'); } catch (e) { /* private */ }
      if (!id) {
        id = 'local_' + Math.random().toString(36).slice(2, 10);
        try { sessionStorage.setItem('jjq-uid', id); } catch (e) { /* private */ }
      }
      return Promise.resolve(id);
    },

    signInAdmin() { return Promise.resolve(); },
    signOutAdmin() { return Promise.resolve(); },
    onAdmin(cb) { Promise.resolve().then(() => cb('offline')); return () => {}; },
    onConnection(cb) { Promise.resolve().then(() => cb(true)); return () => {}; }
  };
}

/* ---------------------------------------------------------------- helpers - */

function segments(path) {
  return String(path || '').split('/').filter(Boolean);
}

function at(obj, path) {
  let node = obj;
  for (const seg of segments(path)) {
    if (node == null || typeof node !== 'object') return null;
    node = node[seg];
  }
  return node === undefined ? null : node;
}

function put(obj, path, value) {
  const segs = segments(path);
  if (!segs.length) return;
  let node = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (node[seg] == null || typeof node[seg] !== 'object') node[seg] = {};
    node = node[seg];
  }
  const last = segs[segs.length - 1];
  /* null means "delete", the way Firebase does it - otherwise empty branches
     would pile up and watchers would see {} where they expect nothing. */
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
}

/* A watcher fires when its path is the changed one, an ancestor of it, or a
   descendant of it. */
function overlaps(watchPath, changedPath) {
  const a = segments(watchPath), b = segments(changedPath);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

function clone(v) {
  return v == null ? null : JSON.parse(JSON.stringify(v));
}

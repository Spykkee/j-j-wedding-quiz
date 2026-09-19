/* ---------------------------------------------------------------------------
   J&J Quiz — configuration.

   Fill in FIREBASE once (Firebase console > Project settings > Your apps > Web).
   Everything else has a sensible default.

   Until FIREBASE.apiKey is filled in, the app runs in OFFLINE mode: everything
   works on a single device (across browser tabs) so you can build the quiz and
   rehearse the whole evening without a network. Nothing is lost when you switch
   to Firebase later — the quiz exports/imports as JSON.
   --------------------------------------------------------------------------- */

export const FIREBASE = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: ''
};

/* The email of the Firebase user allowed to edit the quiz and drive the game.
   Create it in Firebase console > Authentication > Users > Add user.
   This same address goes into firebase-rules.json. */
export const ADMIN_EMAIL = '';

/* One room per evening. Change it if you want a clean slate while keeping the
   old game's data around (e.g. 'rehearsal', 'wedding'). */
export const ROOM = 'wedding';

/* Where guests land when they scan the QR code. Leave '' to use the URL this
   page is served from — only set it if you print QR codes pointing elsewhere. */
export const PUBLIC_URL = '';

/* Default seconds per question when you don't set one. 0 = no timer. */
export const DEFAULT_TIME_LIMIT = 45;

export const MAX_TEAM_NAME = 26;

/* ---------------------------------------------------------------------------
   J&J Quiz — configuration.

   These values belong to the Firebase project 'jj-wedding-quiz' (europe-west1).
   They are not secrets: every Firebase web app ships them to the browser. What
   actually protects the data is firebase-rules.json, which only lets the admin
   UID touch the quiz and the game state.

   Add ?offline=1 to any URL to ignore Firebase and run offline rehearsal mode
   instead — everything works on one device, across browser tabs.
   --------------------------------------------------------------------------- */

export const FIREBASE = {
  apiKey: 'AIzaSyDwfclCjARJ47hA7egEpwKCXRz-Fe7xRec',
  authDomain: 'jj-wedding-quiz.firebaseapp.com',
  databaseURL: 'https://jj-wedding-quiz-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'jj-wedding-quiz',
  appId: '1:457639788499:web:4083eba631997833b0f926'
};

/* Optional: prefills the email box on the admin sign-in screen. Left empty on
   purpose so a public repo carries no personal address — type it at sign-in, or
   fill it in if you would rather not. The rules never read this; they check the
   admin's UID. */
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

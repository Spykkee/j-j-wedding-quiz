/* ---------------------------------------------------------------------------
   Small shared UI pieces: team identity, escaping, the countdown ring, a
   confetti burst and a toast. Nothing here knows about the quiz rules.
   --------------------------------------------------------------------------- */

import { lang } from './i18n.js';

/* Eight hues that all sit inside the wedding palette — burgundy and dusty blue
   are the originals, the rest are their neighbours. Every one of them stays
   legible with ivory text on top. */
export const TEAM_COLORS = [
  '#683240', // burgundy
  '#A85A4A', // terracotta
  '#9C8348', // antique gold
  '#6F7F4F', // olive
  '#5B7C8D', // deep dusty blue
  '#7A5C78', // plum
  '#4E7A6E', // pine
  '#A56A82'  // dusty rose
];

export const TEAM_EMOJI = [
  '🍇', '🌿', '🐝', '🫒', '🌻', '🍷', '🥖', '🪻',
  '🌰', '🦋', '🍑', '🧀', '🌾', '🕯️', '🍐', '🐞'
];

/* Same team, same colour and emoji everywhere — derived from the id rather
   than stored, so the guest phone, the big screen and the admin list always
   agree without an extra write. */
export function identity(teamId) {
  const h = hash(String(teamId || ''));
  return {
    color: TEAM_COLORS[h % TEAM_COLORS.length],
    emoji: TEAM_EMOJI[Math.floor(h / TEAM_COLORS.length) % TEAM_EMOJI.length]
  };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------- team name suggest - */

const NAMES = {
  en: {
    adj: ['Lavender', 'Golden', 'Midnight', 'Wandering', 'Velvet', 'Sunlit', 'Restless', 'Gentle', 'Rowdy', 'Marvellous'],
    noun: ['Legends', 'Olives', 'Cicadas', 'Bottles', 'Swifts', 'Apricots', 'Mistrals', 'Corks', 'Figs', 'Boules']
  },
  fr: {
    adj: ['Lavande', 'Dorés', 'Nocturnes', 'Vagabonds', 'Velours', 'Ensoleillés', 'Fringants', 'Tendres', 'Joyeux', 'Merveilleux'],
    noun: ['Légendes', 'Olives', 'Cigales', 'Bouteilles', 'Martinets', 'Abricots', 'Mistrals', 'Bouchons', 'Figues', 'Boules']
  },
  ko: {
    adj: ['라벤더', '황금', '한밤의', '떠도는', '벨벳', '햇살', '들썩이는', '다정한', '유쾌한', '멋진'],
    noun: ['전설', '올리브', '매미', '와인병', '제비', '살구', '미스트랄', '코르크', '무화과', '공놀이']
  }
};

export function suggestName() {
  const set = NAMES[lang()] || NAMES.en;
  const a = set.adj[Math.floor(Math.random() * set.adj.length)];
  const n = set.noun[Math.floor(Math.random() * set.noun.length)];
  return lang() === 'ko' ? a + ' ' + n : 'The ' + a + ' ' + n;
}

/* ------------------------------------------------------------ countdown ring */

/* Drives an <svg class="ring"> built by ringMarkup(). onTick gets the seconds
   remaining; onDone fires once when it hits zero. Returns a stop() function. */
export function ring(svg, { start, deadline, now, onTick, onDone }) {
  const circle = svg.querySelector('.ring__value');
  const len = Number(circle.getAttribute('data-len')) || 100;
  const label = svg.parentElement && svg.parentElement.querySelector('.ring__label');
  const total = Math.max(1, deadline - start);
  let raf = null, done = false, lastShown = null;

  function frame() {
    const left = Math.max(0, deadline - now());
    const frac = Math.max(0, Math.min(1, left / total));
    circle.style.strokeDashoffset = String(len * (1 - frac));
    const secs = Math.ceil(left / 1000);
    if (secs !== lastShown) {
      lastShown = secs;
      if (label) label.textContent = String(secs);
      svg.classList.toggle('is-urgent', secs <= 5 && secs > 0);
      if (onTick) onTick(secs);
    }
    if (left <= 0) {
      if (!done) { done = true; if (onDone) onDone(); }
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  frame();
  return () => { if (raf) cancelAnimationFrame(raf); };
}

export function ringMarkup(size) {
  const s = size || 76;
  const r = s / 2 - 5;
  const len = 2 * Math.PI * r;
  return '<svg class="ring" viewBox="0 0 ' + s + ' ' + s + '" width="' + s + '" height="' + s + '" aria-hidden="true">' +
    '<circle class="ring__track" cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '"/>' +
    '<circle class="ring__value" cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '"' +
    ' data-len="' + len.toFixed(2) + '"' +
    ' style="stroke-dasharray:' + len.toFixed(2) + ';stroke-dashoffset:0"/>' +
    '</svg>';
}

/* ------------------------------------------------------------------ confetti */

export function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

/* A short, soft burst of petals in the wedding palette. Skipped entirely when
   the guest asked for reduced motion. */
export function confetti(opts) {
  if (reducedMotion()) return;
  const count = (opts && opts.count) || 90;
  const colors = (opts && opts.colors) || ['#683240', '#C6A882', '#96B1C0', '#A85A4A', '#FAF4EF'];

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-layer';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const bits = [];
  for (let i = 0; i < count; i++) {
    bits.push({
      x: w * (0.15 + Math.random() * 0.7),
      y: -20 - Math.random() * h * 0.4,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 1.4 + Math.random() * 2.4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.14,
      w: 5 + Math.random() * 6,
      h: 7 + Math.random() * 8,
      c: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  const until = performance.now() + 3400;
  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.015;
      b.rot += b.vr;
      if (b.y < h + 30) alive++;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (alive && t < until) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------- toast */

let toastTimer = null;

export function toast(message, kind) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast is-on' + (kind ? ' toast--' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ------------------------------------------------------------------ helpers */

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

/* Swap a panel's contents and re-run the entrance animation. */
export function show(container, html) {
  container.innerHTML = html;
  container.classList.remove('is-entering');
  void container.offsetWidth;
  container.classList.add('is-entering');
}

export function teamChip(name, teamId, extra) {
  const id = identity(teamId);
  return '<span class="chip" style="--chip:' + id.color + '">' +
    '<span class="chip__emoji">' + id.emoji + '</span>' +
    '<span class="chip__name">' + escapeHtml(name) + '</span>' +
    (extra ? '<span class="chip__extra">' + escapeHtml(extra) + '</span>' : '') +
    '</span>';
}

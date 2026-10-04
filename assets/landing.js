/*
  Sabily — accueil en 3D.

  Un telephone modelise en code (Three.js r170, copie locale, licence MIT)
  traverse les scenes au fil du defilement. Son ecran affiche :
   - une vraie capture si `assets/screens/<ecran>.png` existe (voir build_site.dart) ;
   - sinon un ecran DESSINE ICI, dans le style de l'app, avec les libelles
     lus dans les fichiers ARB de l'app et, pour le Coran, le texte
     d'Al-Fatiha lu dans quran_full.json (jamais retape a la main).

  Aucune requete vers un tiers : pas de CDN, pas de police distante, pas de
  mesure d'audience.

  Repli « images fixes » (classe html.no3d) : decide dans <head> pour les cas
  evidents, ou ici si Three.js ne se charge pas, si le contexte WebGL est
  perdu, ou si les premieres images s'affichent trop lentement.
*/

const data = JSON.parse(document.getElementById('site-data').textContent);
const root = document.documentElement;
const RTL = data.dir === 'rtl';
const L = data.labels;
const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));

const header = document.querySelector('.site-header');
const progressBar = document.querySelector('.progress');
const sections = [...document.querySelectorAll('.scene')];
const copies = sections.map((s) => s.querySelector('.copy'));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// `?og` : mode « image d'apercu » (1200 x 630), photographie par l'outil de
// generation pour les partages sur les reseaux. Jamais vu des visiteurs.
const OG = new URLSearchParams(location.search).has('og');
if (OG) {
  root.classList.add('og');
  const card = document.createElement('div');
  card.className = 'og-card';
  const hero = document.querySelector('.scene-hero');
  card.innerHTML = `<img src="${data.base}assets/logo-192.png" alt=""><h1>${hero.querySelector('h1').innerHTML}</h1>`
    + `<p>${hero.querySelector('.pill').textContent}</p><span class="pill">${data.countdown.date}</span>`;
  document.body.appendChild(card);
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Doit rester identique a la media query « mobile » de landing.css.
const isMobile = () => innerWidth < 760 || innerWidth / innerHeight < 0.85;

/* ════════════════════════════════════════════════════════════════════
   1. Ecrans dessines
   ════════════════════════════════════════════════════════════════════ */

// Proportions de l'ecran du telephone 3D (0,93 x 1,99).
const SW = 720;
const SH = 1541;
const UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", Tahoma, sans-serif';
const QURAN_FONT = '"Amiri Quran", "Amiri", serif';
const C = {
  bg: '#0f0f0f', card: '#1a1a1a', card2: '#232323', line: '#2e2e2e',
  gold: '#d4af37', goldSoft: '#e8c960', text: '#f2f0ea', muted: '#a8a39a',
  red: '#e27462', ink: '#0f0f0f',
};
const goldA = (a) => `rgba(212, 175, 55, ${a})`;

function rrPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Dessin en coordonnees « logiques » : x = 0 est le bord de debut de ligne
 *  (gauche en francais, droite en arabe). Tout est miroite pour l'arabe. */
class Painter {
  constructor(g) { this.g = g; }
  X(x, w = 0) { return RTL ? SW - x - w : x; }
  font(size, weight = 500, family = UI) { this.g.font = `${weight} ${size}px ${family}`; }

  rr(x, y, w, h, r, fill, stroke, lw = 2) {
    const g = this.g;
    rrPath(g, this.X(x, w), y, w, h, r);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }

  circle(cx, cy, r, fill, stroke, lw = 2) {
    const g = this.g;
    g.beginPath();
    g.arc(this.X(cx), cy, r, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }

  /** `x` = bord de debut (align start), de fin (end) ou centre ; `y` = ligne de base. */
  text(s, x, y, { size = 30, weight = 500, color = C.text, align = 'start', maxW = 0, family = UI } = {}) {
    const g = this.g;
    let sz = size;
    this.font(sz, weight, family);
    if (maxW) {
      while (g.measureText(s).width > maxW && sz > size * 0.55) this.font(--sz, weight, family);
    }
    g.fillStyle = color;
    g.direction = RTL ? 'rtl' : 'ltr';
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(s, this.X(x), y);
    return sz;
  }

  wrap(s, maxW, size, weight = 500, family = UI) {
    this.font(size, weight, family);
    const words = s.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (this.g.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
}

// ── Petites icones (coordonnees deja miroitees) ───────────────────────────

function stroke(g, color, lw) { g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }

const ICONS = {
  home(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x - s, y - s * 0.05); g.lineTo(x, y - s * 0.9); g.lineTo(x + s, y - s * 0.05);
    g.moveTo(x - s * 0.72, y - s * 0.3); g.lineTo(x - s * 0.72, y + s * 0.8);
    g.lineTo(x + s * 0.72, y + s * 0.8); g.lineTo(x + s * 0.72, y - s * 0.3);
    stroke(g, c, s * 0.16);
  },
  book(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x, y - s * 0.55); g.lineTo(x - s, y - s * 0.8); g.lineTo(x - s, y + s * 0.65);
    g.lineTo(x, y + s * 0.9); g.lineTo(x + s, y + s * 0.65); g.lineTo(x + s, y - s * 0.8);
    g.closePath(); g.moveTo(x, y - s * 0.55); g.lineTo(x, y + s * 0.9);
    stroke(g, c, s * 0.15);
  },
  check(g, x, y, s, c) {
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2);
    g.moveTo(x - s * 0.45, y + s * 0.02); g.lineTo(x - s * 0.1, y + s * 0.38); g.lineTo(x + s * 0.5, y - s * 0.32);
    stroke(g, c, s * 0.16);
  },
  shield(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + s * 0.85, y - s * 0.62); g.lineTo(x + s * 0.8, y + s * 0.05);
    g.quadraticCurveTo(x + s * 0.62, y + s * 0.72, x, y + s);
    g.quadraticCurveTo(x - s * 0.62, y + s * 0.72, x - s * 0.8, y + s * 0.05);
    g.lineTo(x - s * 0.85, y - s * 0.62); g.closePath();
    stroke(g, c, s * 0.15);
  },
  grid(g, x, y, s, c) {
    g.fillStyle = c;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      rrPath(g, x + dx * s * 0.5 - s * 0.36, y + dy * s * 0.5 - s * 0.36, s * 0.72, s * 0.72, s * 0.2);
      g.fill();
    }
  },
  bell(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x - s * 0.8, y + s * 0.55);
    g.quadraticCurveTo(x - s * 0.6, y + s * 0.3, x - s * 0.6, y - s * 0.1);
    g.quadraticCurveTo(x - s * 0.6, y - s * 0.85, x, y - s * 0.85);
    g.quadraticCurveTo(x + s * 0.6, y - s * 0.85, x + s * 0.6, y - s * 0.1);
    g.quadraticCurveTo(x + s * 0.6, y + s * 0.3, x + s * 0.8, y + s * 0.55);
    g.closePath(); g.moveTo(x - s * 0.22, y + s * 0.8); g.lineTo(x + s * 0.22, y + s * 0.8);
    stroke(g, c, s * 0.15);
  },
  star(g, x, y, s, c, fill = false) {
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const r = k % 2 ? s * 0.62 : s;
      const a = (k * Math.PI) / 8 - Math.PI / 2;
      k ? g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.closePath();
    if (fill) { g.fillStyle = c; g.fill(); } else stroke(g, c, s * 0.13);
  },
  crescent(g, x, y, s, c) {
    g.save();
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.clip();
    g.beginPath(); g.rect(x - s, y - s, s * 2, s * 2); g.arc(x + s * 0.42, y - s * 0.22, s * 0.82, 0, Math.PI * 2);
    g.fillStyle = c; g.fill('evenodd');
    g.restore();
  },
  beads(g, x, y, s, c) {
    g.fillStyle = c;
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 0.15 + (k / 8) * Math.PI * 1.7;
      g.beginPath(); g.arc(x + Math.cos(a) * s * 0.78, y - Math.sin(a) * s * 0.78, s * 0.17, 0, Math.PI * 2); g.fill();
    }
    g.fillRect(x - s * 0.06, y + s * 0.6, s * 0.12, s * 0.4);
  },
  calendar(g, x, y, s, c) {
    rrPath(g, x - s * 0.9, y - s * 0.7, s * 1.8, s * 1.6, s * 0.25);
    g.moveTo(x - s * 0.9, y - s * 0.2); g.lineTo(x + s * 0.9, y - s * 0.2);
    g.moveTo(x - s * 0.45, y - s); g.lineTo(x - s * 0.45, y - s * 0.5);
    g.moveTo(x + s * 0.45, y - s); g.lineTo(x + s * 0.45, y - s * 0.5);
    stroke(g, c, s * 0.14);
  },
  compass(g, x, y, s, c) {
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); stroke(g, c, s * 0.13);
    g.beginPath(); g.moveTo(x + s * 0.42, y - s * 0.42); g.lineTo(x - s * 0.12, y - s * 0.12); g.lineTo(x - s * 0.42, y + s * 0.42); g.lineTo(x + s * 0.12, y + s * 0.12); g.closePath();
    g.fillStyle = c; g.fill();
  },
  people(g, x, y, s, c) {
    g.beginPath(); g.arc(x - s * 0.35, y - s * 0.35, s * 0.32, 0, Math.PI * 2);
    g.moveTo(x + s * 0.72, y - s * 0.3); g.arc(x + s * 0.45, y - s * 0.3, s * 0.27, 0, Math.PI * 2);
    g.moveTo(x - s * 0.95, y + s * 0.8); g.quadraticCurveTo(x - s * 0.35, y - s * 0.15, x + s * 0.25, y + s * 0.8);
    g.moveTo(x + s * 0.35, y + s * 0.2); g.quadraticCurveTo(x + s * 0.95, y + s * 0.1, x + s, y + s * 0.75);
    stroke(g, c, s * 0.14);
  },
  trophy(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x - s * 0.6, y - s * 0.85); g.lineTo(x + s * 0.6, y - s * 0.85);
    g.quadraticCurveTo(x + s * 0.6, y + s * 0.25, x, y + s * 0.3);
    g.quadraticCurveTo(x - s * 0.6, y + s * 0.25, x - s * 0.6, y - s * 0.85);
    g.moveTo(x - s * 0.6, y - s * 0.6); g.quadraticCurveTo(x - s, y - s * 0.6, x - s * 0.95, y - s * 0.3); g.quadraticCurveTo(x - s * 0.85, y, x - s * 0.45, y + s * 0.02);
    g.moveTo(x + s * 0.6, y - s * 0.6); g.quadraticCurveTo(x + s, y - s * 0.6, x + s * 0.95, y - s * 0.3); g.quadraticCurveTo(x + s * 0.85, y, x + s * 0.45, y + s * 0.02);
    g.moveTo(x, y + s * 0.3); g.lineTo(x, y + s * 0.7); g.moveTo(x - s * 0.45, y + s * 0.85); g.lineTo(x + s * 0.45, y + s * 0.85);
    stroke(g, c, s * 0.14);
  },
  trash(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x - s * 0.85, y - s * 0.55); g.lineTo(x + s * 0.85, y - s * 0.55);
    g.moveTo(x - s * 0.3, y - s * 0.55); g.lineTo(x - s * 0.22, y - s * 0.85); g.lineTo(x + s * 0.22, y - s * 0.85); g.lineTo(x + s * 0.3, y - s * 0.55);
    g.moveTo(x - s * 0.62, y - s * 0.4); g.lineTo(x - s * 0.5, y + s * 0.85); g.lineTo(x + s * 0.5, y + s * 0.85); g.lineTo(x + s * 0.62, y - s * 0.4);
    stroke(g, c, s * 0.14);
  },
  lock(g, x, y, s, c) {
    rrPath(g, x - s * 0.75, y - s * 0.15, s * 1.5, s * 1.1, s * 0.22);
    g.moveTo(x - s * 0.45, y - s * 0.15); g.lineTo(x - s * 0.45, y - s * 0.45);
    g.arc(x, y - s * 0.45, s * 0.45, Math.PI, 0); g.lineTo(x + s * 0.45, y - s * 0.15);
    stroke(g, c, s * 0.15);
  },
  question(g, x, y, s, c) {
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); stroke(g, c, s * 0.13);
    g.beginPath(); g.arc(x, y - s * 0.22, s * 0.32, Math.PI * 1.1, Math.PI * 0.45); g.lineTo(x, y + s * 0.25);
    stroke(g, c, s * 0.14);
    g.beginPath(); g.arc(x, y + s * 0.55, s * 0.09, 0, Math.PI * 2); g.fillStyle = c; g.fill();
  },
  layers(g, x, y, s, c) {
    g.beginPath();
    g.moveTo(x, y - s * 0.8); g.lineTo(x + s, y - s * 0.3); g.lineTo(x, y + s * 0.2); g.lineTo(x - s, y - s * 0.3); g.closePath();
    g.moveTo(x - s, y + s * 0.15); g.lineTo(x, y + s * 0.65); g.lineTo(x + s, y + s * 0.15);
    stroke(g, c, s * 0.14);
  },
};
const icon = (p, name, x, y, s, c = C.gold, fill) => ICONS[name](p.g, p.X(x), y, s, c, fill);

// ── Elements communs ──────────────────────────────────────────────────────

function statusBar(p) {
  p.text('12:30', 52, 62, { size: 27, weight: 600, maxW: 0 });
  // Batterie + barres de reseau, cote fin de ligne.
  p.rr(SW - 52 - 46, 41, 46, 23, 7, null, C.text, 2.5);
  p.rr(SW - 52 - 42, 45, 32, 15, 4, C.text);
  for (let k = 0; k < 4; k++) p.rr(SW - 52 - 70 - (3 - k) * 11, 61 - (k + 1) * 5 - 3, 7, (k + 1) * 5 + 3, 2, C.text);
  // Poinçon de la camera frontale.
  p.g.beginPath(); p.g.arc(SW / 2, 52, 15, 0, Math.PI * 2); p.g.fillStyle = '#000'; p.g.fill();
}

const NAV = [
  ['home', 'navHome'], ['book', 'navQuran'], ['check', 'navHabits'], ['shield', 'navSos'], ['grid', 'navMore'],
];
function navBar(p, active) {
  const y0 = SH - 128;
  p.g.fillStyle = '#131313'; p.g.fillRect(0, y0, SW, 128);
  p.g.fillStyle = C.line; p.g.fillRect(0, y0, SW, 2);
  NAV.forEach(([ic, key], k) => {
    const cx = (SW / 5) * (k + 0.5);
    const on = ic === active;
    if (on) p.rr(cx - 44, y0 + 22, 88, 50, 25, goldA(0.16));
    icon(p, ic, cx, y0 + 47, 15, on ? C.gold : C.muted);
    p.text(L[key], cx, y0 + 104, { size: 20, weight: on ? 700 : 500, color: on ? C.gold : C.muted, align: 'center', maxW: SW / 5 - 10 });
  });
}

function title(p, s, sub) {
  if (sub) p.text(sub, 44, 132, { size: 27, color: C.muted, maxW: SW - 88 });
  p.text(s, 44, sub ? 190 : 182, { size: 52, weight: 800, maxW: SW - 88 });
}

function background(p, glowY = 0.25) {
  const g = p.g;
  g.fillStyle = C.bg; g.fillRect(0, 0, SW, SH);
  const r = g.createRadialGradient(SW / 2, SH * glowY, 0, SW / 2, SH * glowY, SW * 0.95);
  r.addColorStop(0, goldA(0.1)); r.addColorStop(1, goldA(0));
  g.fillStyle = r; g.fillRect(0, 0, SW, SH);
}

function goldFill(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#f3d77a'); gr.addColorStop(0.45, '#d4af37'); gr.addColorStop(1, '#a8821f');
  return gr;
}

// ── Les ecrans ────────────────────────────────────────────────────────────

const assets = {};

const SCREENS = {
  splash(p) {
    const g = p.g;
    g.fillStyle = '#0b0a08'; g.fillRect(0, 0, SW, SH);
    const r = g.createRadialGradient(SW / 2, SH * 0.42, 0, SW / 2, SH * 0.42, SW);
    r.addColorStop(0, goldA(0.24)); r.addColorStop(0.5, goldA(0.05)); r.addColorStop(1, goldA(0));
    g.fillStyle = r; g.fillRect(0, 0, SW, SH);
    // Rosace discrete.
    g.save(); g.globalAlpha = 0.22;
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(SW / 2, SH * 0.42); g.rotate((k * Math.PI) / 8);
      g.strokeStyle = C.gold; g.lineWidth = 1.5; g.strokeRect(-250, -250, 500, 500); g.restore();
    }
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const r = k % 2 ? 205 : 330, a = (k * Math.PI) / 8 - Math.PI / 2;
      g.lineTo(SW / 2 + r * Math.cos(a), SH * 0.42 + r * Math.sin(a));
    }
    g.closePath(); stroke(g, C.gold, 2);
    g.restore();
    if (assets.logo) {
      g.save(); g.shadowColor = goldA(0.55); g.shadowBlur = 80;
      rrPath(g, SW / 2 - 140, SH * 0.42 - 140, 280, 280, 64); g.clip();
      g.drawImage(assets.logo, SW / 2 - 140, SH * 0.42 - 140, 280, 280);
      g.restore();
    }
    g.fillStyle = goldFill(g, 0, SH * 0.6, SW, SH * 0.66);
    g.font = `800 92px ${UI}`; g.textAlign = 'center'; g.direction = 'ltr';
    g.fillText('Sabily', SW / 2, SH * 0.6);
    p.text(data.tagline, SW / 2, SH * 0.6 + 64, { size: 32, color: C.muted, align: 'center', maxW: SW - 120 });
    statusBar(p);
  },

  habits(p) {
    background(p, 0.2);
    statusBar(p);
    title(p, L.yourHabits, L.goodMorning);
    // Serie du jour.
    const g = p.g;
    p.rr(36, 232, SW - 72, 236, 30, goldA(0.1), goldA(0.4), 2);
    p.text(L.dailyStreak, 70, 290, { size: 27, color: C.muted, maxW: SW - 140 });
    p.text(fmt(L.streakDaysInARow, { n: 12 }), 70, 356, { size: 44, weight: 800, color: C.gold, maxW: SW - 140 });
    for (let k = 0; k < 7; k++) {
      const cx = 92 + k * 88;
      p.circle(cx, 418, 24, k < 6 ? C.gold : null, k < 6 ? null : goldA(0.5), 3);
      if (k < 6) { g.beginPath(); const X = p.X(cx); g.moveTo(X - 10, 418); g.lineTo(X - 3, 426); g.lineTo(X + 11, 410); stroke(g, C.ink, 4); }
    }
    // Habitudes.
    const rows = [
      ['star', L.habitPrayer, '5/5', 1],
      ['book', L.habitQuran, L.completedToday, 1],
      ['beads', L.habitDhikr, '60/100', 0.6],
    ];
    rows.forEach(([ic, name, sub, prog], k) => {
      const y = 506 + k * 158;
      p.rr(36, y, SW - 72, 138, 28, C.card, C.line, 2);
      p.circle(108, y + 69, 40, goldA(0.14));
      icon(p, ic, 108, y + 69, 20);
      p.text(name, 172, y + 62, { size: 33, weight: 700, maxW: SW - 340 });
      p.text(sub, 172, y + 102, { size: 24, color: prog >= 1 ? C.gold : C.muted, maxW: SW - 340 });
      const cx = SW - 104;
      if (prog >= 1) {
        p.circle(cx, y + 69, 30, C.gold);
        g.beginPath(); const X = p.X(cx); g.moveTo(X - 12, y + 69); g.lineTo(X - 3, y + 79); g.lineTo(X + 14, y + 59); stroke(g, C.ink, 5);
      } else {
        p.circle(cx, y + 69, 28, null, C.line, 6);
        g.beginPath(); g.arc(p.X(cx), y + 69, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog * (RTL ? -1 : 1), RTL);
        stroke(g, C.gold, 6);
      }
    });
    // Calendrier d'activite.
    p.rr(36, 990, SW - 72, 270, 28, C.card, C.line, 2);
    p.text(L.today, 70, 1042, { size: 25, color: C.muted });
    const levels = [0.25, 0.9, 0.6, 1, 0.4, 0.8, 1, 0.55, 1, 0.9, 0.3, 1, 0.7, 1, 0.85, 1, 0.6, 1, 1, 0.45, 0.9, 1, 0.75, 1, 1, 0.95, 1, 1];
    levels.forEach((lv, k) => {
      const col = k % 14, row = Math.floor(k / 14);
      p.rr(70 + col * 42, 1072 + row * 42, 34, 34, 8, goldA(0.12 + lv * 0.78));
    });
    p.rr(70, 1172, SW - 140, 16, 8, C.card2);
    p.rr(70, 1172, (SW - 140) * 0.82, 16, 8, goldFill(g, 70, 0, SW - 70, 0));
    p.text('82%', SW - 70, 1230, { size: 24, weight: 700, color: C.gold, align: 'end' });
    navBar(p, 'check');
  },

  sos(p) {
    const g = p.g;
    g.fillStyle = '#0c0b09'; g.fillRect(0, 0, SW, SH);
    const cy = 760;
    const r = g.createRadialGradient(SW / 2, cy, 0, SW / 2, cy, SW * 0.8);
    r.addColorStop(0, goldA(0.28)); r.addColorStop(1, goldA(0));
    g.fillStyle = r; g.fillRect(0, 0, SW, SH);
    statusBar(p);
    p.font(24, 700);
    const tagW = g.measureText(L.sosPurposeTag).width + 48;
    p.rr(SW / 2 - tagW / 2, 112, tagW, 46, 23, null, goldA(0.55), 2);
    p.text(L.sosPurposeTag, SW / 2, 144, { size: 24, weight: 700, color: C.gold, align: 'center' });
    p.text(L.sosTitle, SW / 2, 262, { size: 64, weight: 800, align: 'center', maxW: SW - 80 });
    p.text(L.sosBreatheIn, SW / 2, 322, { size: 30, color: C.muted, align: 'center', maxW: SW - 80 });
    [300, 248, 200].forEach((rad, k) => {
      g.beginPath(); g.arc(SW / 2, cy, rad, 0, Math.PI * 2);
      g.fillStyle = goldA(0.05 + k * 0.05); g.fill();
      g.strokeStyle = goldA(0.25 + k * 0.15); g.lineWidth = 2; g.stroke();
    });
    g.save(); g.shadowColor = goldA(0.7); g.shadowBlur = 60;
    g.beginPath(); g.arc(SW / 2, cy, 156, 0, Math.PI * 2);
    g.fillStyle = goldFill(g, SW / 2 - 156, cy - 156, SW / 2 + 156, cy + 156); g.fill();
    g.restore();
    ICONS.shield(g, SW / 2, cy - 42, 30, C.ink);
    p.text(L.sosButtonWord, SW / 2, cy + 46, { size: 46, weight: 800, color: C.ink, align: 'center', maxW: 260 });
    p.rr(56, 1140, SW - 112, 120, 30, C.card, goldA(0.3), 2);
    icon(p, 'trophy', 122, 1200, 24);
    p.text(fmt(L.sosVictories, { n: 27 }), 170, 1212, { size: 32, weight: 700, color: C.goldSoft, maxW: SW - 270 });
    navBar(p, 'shield');
  },

  prayer(p) {
    background(p, 0.2);
    statusBar(p);
    title(p, L.prayerTimes, L.today);
    const g = p.g;
    const times = ['06:12', '13:41', '16:52', '19:24', '20:51'];
    const next = 2;
    p.rr(36, 236, SW - 72, 270, 32, goldFill(g, 0, 236, SW, 506));
    g.save(); g.globalAlpha = 0.16; ICONS.star(g, p.X(SW - 130), 371, 150, C.ink); g.restore();
    p.text(L.nextPrayer, 76, 296, { size: 27, weight: 600, color: 'rgba(15,15,15,0.72)', maxW: SW - 300 });
    p.text(data.prayerNames[next], 76, 384, { size: 74, weight: 800, color: C.ink, maxW: SW - 300 });
    p.text(fmt(L.inTime, { time: RTL ? '1:24' : '1h 24min' }), 76, 450, { size: 29, weight: 600, color: 'rgba(15,15,15,0.75)', maxW: SW - 300 });
    p.text(times[next], SW - 76, 450, { size: 44, weight: 800, color: C.ink, align: 'end' });
    data.prayerNames.forEach((name, k) => {
      const y = 540 + k * 104;
      const on = k === next;
      p.rr(36, y, SW - 72, 90, 24, on ? goldA(0.14) : C.card, on ? C.gold : C.line, 2);
      icon(p, k < next ? 'check' : 'bell', 92, y + 45, 16, on ? C.gold : k < next ? C.gold : C.muted);
      p.text(name, 136, y + 56, { size: 31, weight: on ? 800 : 600, color: on ? C.gold : C.text, maxW: SW - 340 });
      p.text(times[k], SW - 76, y + 56, { size: 31, weight: 700, color: on ? C.gold : C.text, align: 'end' });
    });
    // Qibla.
    p.rr(36, 1076, SW - 72, 190, 30, C.card, C.line, 2);
    const cx = 136, cy = 1171;
    p.circle(cx, cy, 64, null, goldA(0.45), 3);
    g.save(); g.translate(p.X(cx), cy); g.rotate(((RTL ? -1 : 1) * 118 * Math.PI) / 180);
    g.beginPath(); g.moveTo(0, -54); g.lineTo(13, 0); g.lineTo(0, 10); g.lineTo(-13, 0); g.closePath(); g.fillStyle = C.gold; g.fill();
    g.beginPath(); g.moveTo(0, 54); g.lineTo(13, 0); g.lineTo(-13, 0); g.closePath(); g.fillStyle = C.muted; g.fill();
    g.restore();
    p.text(L.qibla, 236, 1160, { size: 36, weight: 800, maxW: SW - 320 });
    p.text('118°', 236, 1210, { size: 28, color: C.gold, weight: 600 });
    navBar(p, 'home');
  },

  quran(p) {
    const g = p.g;
    background(p, 0.35);
    statusBar(p);
    title(p, data.surahNames[0], `${fmt(L.surahNumber, { n: 1 })} · ${fmt(L.juzLabel, { n: 1 })}`);
    // Bandeau du titre de la sourate.
    p.rr(44, 232, SW - 88, 112, 22, goldA(0.08), goldA(0.6), 2);
    p.rr(56, 244, SW - 112, 88, 16, null, goldA(0.3), 1.5);
    ICONS.star(g, 96, 288, 20, C.gold); ICONS.star(g, SW - 96, 288, 20, C.gold);
    g.font = `400 50px ${QURAN_FONT}`; g.fillStyle = C.goldSoft; g.textAlign = 'center'; g.direction = 'rtl';
    g.fillText(data.fatihaTitle, SW / 2, 304);
    // Texte coranique, justifie, de droite a gauche, mot par mot.
    const top = 410, bottom = SH - 168, left = 52, right = SW - 52;
    let size = 50, lines;
    const layout = (sz) => {
      g.font = `400 ${sz}px ${QURAN_FONT}`;
      const space = g.measureText(' ').width;
      const marker = sz * 1.05;
      const tokens = [];
      data.fatiha.forEach((ayah, k) => {
        for (const w of ayah.split(/\s+/)) tokens.push({ w, width: g.measureText(w).width });
        tokens.push({ n: k + 1, width: marker });
      });
      const out = [];
      let line = [], width = 0;
      for (const t of tokens) {
        const add = (line.length ? space : 0) + t.width;
        if (width + add > right - left && line.length) { out.push(line); line = [t]; width = t.width; } else { line.push(t); width += add; }
      }
      if (line.length) out.push(line);
      return { out, space };
    };
    let lh;
    for (;;) {
      lines = layout(size);
      lh = size * 1.95;
      if (top + lines.out.length * lh <= bottom || size <= 30) break;
      size -= 2;
    }
    const digits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    lines.out.forEach((line, li) => {
      const y = top + li * lh + size;
      const total = line.reduce((s, t) => s + t.width, 0);
      const last = li === lines.out.length - 1;
      const gap = last || line.length < 2 ? lines.space : (right - left - total) / (line.length - 1);
      let x = last ? SW / 2 + (total + gap * (line.length - 1)) / 2 : right;
      for (const t of line) {
        if (t.n) {
          const cx = x - t.width / 2, cy = y - size * 0.32;
          g.beginPath(); g.arc(cx, cy, size * 0.44, 0, Math.PI * 2); g.strokeStyle = C.gold; g.lineWidth = 2; g.stroke();
          g.beginPath(); g.arc(cx, cy, size * 0.36, 0, Math.PI * 2); g.strokeStyle = goldA(0.45); g.lineWidth = 1; g.stroke();
          g.font = `400 ${Math.round(size * 0.5)}px ${QURAN_FONT}`; g.fillStyle = C.gold; g.textAlign = 'center';
          g.fillText(digits(t.n), cx, cy + size * 0.16);
        } else {
          g.font = `400 ${size}px ${QURAN_FONT}`; g.fillStyle = C.text; g.textAlign = 'right'; g.direction = 'rtl';
          g.fillText(t.w, x, y);
        }
        x -= t.width + gap;
      }
    });
    navBar(p, 'book');
  },

  quiz(p) {
    const g = p.g;
    background(p, 0.25);
    statusBar(p);
    title(p, L.quiz);
    p.font(24, 700);
    const chipW = Math.min(g.measureText(L.catQuran).width + 48, SW - 260);
    p.rr(44, 220, chipW, 48, 24, goldA(0.14), goldA(0.5), 2);
    p.text(L.catQuran, 44 + chipW / 2, 253, { size: 24, weight: 700, color: C.gold, align: 'center', maxW: chipW - 24 });
    p.text('3/10', SW - 44, 253, { size: 26, weight: 700, color: C.muted, align: 'end' });
    p.rr(44, 296, SW - 88, 12, 6, C.card2);
    p.rr(44, 296, (SW - 88) * 0.3, 12, 6, C.gold);
    p.rr(36, 340, SW - 72, 260, 30, C.card, C.line, 2);
    const qLines = p.wrap(data.quiz.q, SW - 150, 42, 800);
    const qTop = 470 - (qLines.length - 1) * 27;
    qLines.forEach((l, k) => p.text(l, SW / 2, qTop + k * 54, { size: 42, weight: 800, align: 'center', maxW: SW - 130 }));
    data.quiz.options.forEach((opt, k) => {
      const y = 640 + k * 128;
      const ok = k === data.quiz.correct;
      p.rr(36, y, SW - 72, 108, 26, ok ? goldA(0.16) : C.card, ok ? C.gold : C.line, ok ? 3 : 2);
      p.circle(100, y + 54, 26, ok ? C.gold : C.card2);
      p.text('ABCD'[k], 100, y + 64, { size: 26, weight: 800, color: ok ? C.ink : C.muted, align: 'center' });
      p.text(opt, 150, y + 66, { size: 34, weight: 700, color: ok ? C.gold : C.text });
      if (ok) {
        p.text(L.correct, SW - 110, y + 64, { size: 24, weight: 700, color: C.gold, align: 'end', maxW: 220 });
        icon(p, 'check', SW - 80, y + 54, 18);
      }
    });
    navBar(p, 'grid');
  },

  more(p) {
    const g = p.g;
    background(p, 0.2);
    statusBar(p);
    title(p, L.moreTitle);
    const items = [
      ['beads', L.duasTitle], ['beads', L.tasbeeh], ['star', L.asmaTitle],
      ['book', L.hadithTitle], ['calendar', L.hijriTitle], ['crescent', L.fastTitle],
      ['layers', L.qadaTitle], ['trophy', L.challenges], ['people', L.myCircle],
      ['question', L.quiz], ['book', L.hifzTracker], ['compass', L.qibla],
    ];
    const cols = 3, gap = 18, w = (SW - 72 - gap * 2) / cols, h = 228;
    items.forEach(([ic, label], k) => {
      const x = 36 + (k % cols) * (w + gap), y = 236 + Math.floor(k / cols) * (h + gap);
      p.rr(x, y, w, h, 26, C.card, C.line, 2);
      p.circle(x + w / 2, y + 78, 44, goldA(0.13));
      if (ic === 'crescent') ICONS.crescent(g, p.X(x + w / 2), y + 78, 22, C.gold);
      else icon(p, ic, x + w / 2, y + 78, 22);
      const lines = p.wrap(label, w - 26, 23, 600).slice(0, 2);
      lines.forEach((l, i) => p.text(l, x + w / 2, y + 160 + i * 30 - (lines.length - 1) * 8, { size: 23, weight: 600, align: 'center', maxW: w - 20 }));
    });
    navBar(p, 'grid');
  },
};

// ── Compte a rebours jusqu'a la sortie ────────────────────────────────────

const LAUNCH = new Date(data.countdown.target);

/** [jours, heures, minutes, secondes] restants (zero une fois la date passee). */
function countdownParts() {
  let s = Math.max(0, Math.floor((LAUNCH - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return [d, h, m, s - m * 60];
}

/** Ecran de la derniere scene. Le telephone y est tourne en paysage (d'un
 *  quart de tour vers la gauche) : le contenu est donc dessine pivote, pour
 *  apparaitre droit a l'ecran. */
SCREENS.countdown = (p) => {
  const g = p.g;
  const W = SH, H = SW; // dimensions vues par le visiteur
  g.save();
  g.translate(SW, 0);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#0a0907'; g.fillRect(0, 0, W, H);
  const r = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.6);
  r.addColorStop(0, goldA(0.2)); r.addColorStop(1, goldA(0));
  g.fillStyle = r; g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.direction = RTL ? 'rtl' : 'ltr';
  g.fillStyle = C.muted;
  g.font = `600 40px ${UI}`;
  // Date passee : « Disponible sur Google Play » si le lien existe, sinon
  // « Tres bientot » (Google a pu retarder la sortie) — jamais « 00 00 00 00 ».
  if (LAUNCH <= Date.now()) {
    g.fillStyle = goldFill(g, 0, 250, W, 420);
    g.font = `800 120px ${UI}`;
    g.fillText(data.countdown.available || data.countdown.soon, W / 2, 400, W - 140);
    g.restore();
    return;
  }
  g.fillText(data.countdown.title, W / 2, 128);
  const parts = countdownParts();
  const bw = 290, gap = 36, x0 = (W - (bw * 4 + gap * 3)) / 2;
  parts.forEach((n, k) => {
    const slot = RTL ? 3 - k : k;
    const x = x0 + slot * (bw + gap);
    rrPath(g, x, 186, bw, 330, 40);
    g.fillStyle = C.card; g.fill();
    g.strokeStyle = goldA(0.45); g.lineWidth = 3; g.stroke();
    g.fillStyle = goldFill(g, x, 220, x + bw, 420);
    g.font = `800 ${n >= 100 ? 140 : 160}px ${UI}`;
    g.direction = 'ltr';
    g.fillText(String(n).padStart(2, '0'), x + bw / 2, 410);
    g.fillStyle = C.muted;
    g.font = `600 34px ${UI}`;
    g.direction = RTL ? 'rtl' : 'ltr';
    g.fillText(data.countdown.units[k], x + bw / 2, 474, bw - 30);
  });
  g.fillStyle = C.goldSoft;
  g.font = `700 38px ${UI}`;
  g.fillText(data.countdown.date, W / 2, 616);
  g.restore();
};

/** Dessine un ecran (ou la vraie capture) dans un canvas, a l'echelle `s`. */
function drawScreen(name, s = 1) {
  const c = document.createElement('canvas');
  c.width = Math.round(SW * s);
  c.height = Math.round(SH * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  const shot = assets.shots[name];
  if (shot) {
    // Capture reelle : remplit l'ecran sans deformation (recadrage centre).
    const k = Math.max(SW / shot.width, SH / shot.height);
    const w = shot.width * k, h = shot.height * k;
    g.drawImage(shot, (SW - w) / 2, (SH - h) / 2, w, h);
  } else {
    SCREENS[name](new Painter(g));
  }
  return c;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAssets() {
  assets.shots = {};
  const jobs = [
    loadImage(`${data.base}assets/logo-512.png`).then((img) => { assets.logo = img; }),
    ...Object.entries(data.screens).map(([name, src]) =>
      loadImage(data.base + src).then((img) => { if (img) assets.shots[name] = img; })),
  ];
  try {
    const font = new FontFace('Amiri Quran', `url(${data.base}assets/fonts/AmiriQuran-Regular.ttf)`);
    jobs.push(font.load().then((f) => document.fonts.add(f)).catch(() => {}));
  } catch { /* police par defaut */ }
  await Promise.all(jobs);
}

/* ════════════════════════════════════════════════════════════════════
   2. Defilement : positions des scenes
   ════════════════════════════════════════════════════════════════════ */

// Sur telephone, la barre d'adresse apparait et disparait en defilant, ce qui
// change innerHeight sans cesse : le telephone 3D sautait et tout etait
// recalcule. On mesure plutot la hauteur « grande » de l'ecran (100lvh),
// qui, elle, ne bouge pas.
const vhProbe = document.createElement('div');
vhProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
document.body.appendChild(vhProbe);
const stableHeight = () => vhProbe.offsetHeight || innerHeight;

let vw = innerWidth, vh = stableHeight(), mobile = isMobile();
let stops = [], centers = [], tops = [], maxScroll = 1;

// Point de repos de chaque texte : sur ordinateur, son centre au milieu de
// l'ecran ; sur telephone, son HAUT juste sous le telephone 3D (le texte
// occupe le bas de l'ecran). Valeurs identiques aux padding-top de
// landing.css (section mobile).
const MOBILE_TOP = { more: 0.33, cta: 0.4 };
const mobileTop = (k) => MOBILE_TOP[sections[k].id] ?? 0.47;
/** Ecart (en hauteurs d'ecran) entre le texte k et son point de repos. */
const offsetOf = (k, y) => (mobile
  ? (tops[k] - y) / vh - mobileTop(k)
  : (centers[k] - y) / vh - 0.5);

function measure() {
  vw = innerWidth; vh = stableHeight(); mobile = isMobile();
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
  const y = scrollY;
  // Les textes sont decales par l'animation : on retire ce decalage pour
  // mesurer leur vraie place (sinon les scenes lointaines sont mal reperees).
  const saved = copies.map((c) => c.style.transform);
  copies.forEach((c) => { c.style.transform = 'none'; });
  const rects = copies.map((c) => c.getBoundingClientRect());
  centers = rects.map((r) => r.top + y + r.height / 2);
  tops = rects.map((r) => r.top + y);
  copies.forEach((c, k) => { c.style.transform = saved[k]; });
  stops = copies.map((_, k) => clamp(y + offsetOf(k, y) * vh, 0, maxScroll));
  for (let i = 1; i < stops.length; i++) stops[i] = Math.max(stops[i], stops[i - 1] + 1);
}

/** Position continue dans le recit : 2,4 = entre la scene 2 et la scene 3. */
function sceneFloat(y) {
  if (y <= stops[0]) return 0;
  for (let i = 0; i < stops.length - 1; i++) {
    if (y < stops[i + 1]) return i + (y - stops[i]) / (stops[i + 1] - stops[i]);
  }
  return stops.length - 1;
}

function updateChrome(y) {
  header.classList.toggle('scrolled', y > 24);
  progressBar.style.setProperty('--p', (y / maxScroll).toFixed(4));
}

/* ════════════════════════════════════════════════════════════════════
   3. Repli « images fixes »
   ════════════════════════════════════════════════════════════════════ */

let fallbackStarted = false;

async function startFallback() {
  if (fallbackStarted) return;
  fallbackStarted = true;
  root.classList.remove('is3d');
  root.classList.add('no3d');
  copies.forEach((c) => { c.style.opacity = ''; c.style.transform = ''; c.style.visibility = ''; });

  // Apparition des scenes.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px' });
  sections.forEach((s) => io.observe(s));
  // Compte a rebours en texte (en 3D, il est sur l'ecran du telephone).
  const cd = document.querySelectorAll('.countdown [data-unit]');
  const box = document.querySelector('.countdown');
  const tick = () => {
    if (LAUNCH <= Date.now()) { // date passee : texte a la place des chiffres
      if (box) { box.textContent = data.countdown.available || data.countdown.soon; box.classList.add('done'); }
      return;
    }
    countdownParts().forEach((n, k) => { if (cd[k]) cd[k].textContent = String(n).padStart(2, '0'); });
  };
  tick();
  setInterval(tick, 1000);


  await assetsReady;
  // Ecrans dessines a 75 % puis convertis en images : moins de memoire que
  // dix grands canvas sur les appareils modestes, ceux qui arrivent ici.
  for (const fig of document.querySelectorAll('.still')) {
    const holder = fig.querySelector('.still-screen');
    if (holder.querySelector('img')) continue;
    // Le compte a rebours se dessine en paysage : en image fixe, on montre l'accueil.
    const name = fig.dataset.screen === 'countdown' ? 'splash' : fig.dataset.screen;
    const canvas = drawScreen(name, 0.75);
    const img = new Image();
    img.alt = '';
    canvas.toBlob((blob) => { if (blob) img.src = URL.createObjectURL(blob); }, 'image/png');
    holder.appendChild(img);
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY;
      updateChrome(y);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measure(); onScroll(); });
  measure();
  onScroll();
}

/* ════════════════════════════════════════════════════════════════════
   4. Scene 3D
   ════════════════════════════════════════════════════════════════════ */

// Dimensions du telephone (unites du monde).
const PW = 1.0, PH = 2.06, PD = 0.11, PR = 0.16, BEV = 0.026;
const SCW = 0.93, SCH = 1.99;

// Une pose par scene. side : +1 = telephone a droite (en francais).
const SCENE_MAG = { hero: 0.55, habits: 0.32, sos: 0.38, prayer: 0.34, quran: 0.22, learn: 0.34, more: 0.4, cta: 0.42 };
const SCENE_SPIN = { prayer: 1, more: -1 };

function poseFor(i) {
  if (OG) return { nx: RTL ? -0.5 : 0.5, ny: 0, h: 0.8, ry: RTL ? 0.42 : -0.42, rx: 0.05, rz: RTL ? -0.05 : 0.05, spin: 0 };
  const s = sections[i];
  const id = s.id;
  const side = s.dataset.side;
  let ps = side === 'start' ? 1 : side === 'end' ? -1 : 0;
  if (RTL) ps = -ps;
  // Derniere scene : le telephone pivote en paysage pour le compte a rebours.
  if (id === 'cta') {
    return mobile
      ? { nx: 0, ny: 0.5, h: Math.min(0.42, (0.86 * vw) / vh), ry: 0.18, rx: 0.08, rz: Math.PI / 2, spin: 0 }
      : { nx: ps * 0.42, ny: 0.02, h: Math.min(0.66, (0.44 * vw) / vh), ry: -ps * 0.2, rx: 0.08, rz: Math.PI / 2, spin: 0 };
  }
  if (mobile) {
    // Telephone en haut, texte en bas. La liste « et bien plus » est longue :
    // le telephone s'y fait plus petit pour lui laisser la place.
    const alt = i % 2 ? 1 : -1;
    const small = id === 'more';
    return {
      nx: 0,
      ny: small ? 0.62 : 0.49,
      h: small ? 0.22 : 0.36,
      ry: alt * (small ? 0.3 : 0.24), rx: 0.06, rz: 0,
      spin: SCENE_SPIN[id] || 0,
    };
  }
  const wide = clamp((vw / vh - 1.2) / 1.2, 0, 1); // ecrans tres larges : plus loin du centre
  return {
    nx: ps * lerp(0.4, 0.46, wide),
    ny: id === 'hero' ? -0.02 : 0,
    h: id === 'hero' ? 0.8 : id === 'more' ? 0.7 : 0.74,
    ry: -ps * SCENE_MAG[id],
    rx: 0.05,
    rz: ps * (id === 'hero' ? 0.07 : 0.025),
    spin: SCENE_SPIN[id] || 0,
  };
}

function shapeRR(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Plan arrondi dont les coordonnees de texture couvrent exactement [0,1]. */
function roundedPlane(THREE, w, h, r) {
  const geo = new THREE.ShapeGeometry(shapeRR(THREE, w, h, r), 24);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}

function backTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1096;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 512, 1096);
  gr.addColorStop(0, '#2a2418'); gr.addColorStop(0.5, '#15120d'); gr.addColorStop(1, '#221d14');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 1096);
  // Aspect brosse.
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(255, 230, 170, ${Math.random() * 0.025})`;
    g.fillRect(0, Math.random() * 1096, 512, 1);
  }
  if (assets.logo) {
    g.globalAlpha = 0.95;
    g.save(); rrPath(g, 256 - 70, 548 - 70, 140, 140, 32); g.clip();
    g.drawImage(assets.logo, 256 - 70, 548 - 70, 140, 140); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Studio virtuel (panneaux lumineux) : il ne sert qu'aux reflets. */
function studio(THREE, renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0x0a0907, side: THREE.BackSide }));
  env.add(room);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(10, 3, 0xfff4dc, 6, [0, 7, 2], [0, 0, 0]);
  panel(2, 10, 0xffe2a0, 5, [-7, 1, 3], [0, 0, 0]);
  panel(2, 10, 0xf0c060, 4, [7, -1, 4], [0, 0, 0]);
  panel(6, 2, 0xffffff, 2.2, [0, -1, 9], [0, 0, 0]);
  panel(4, 4, 0x806020, 2, [0, -7, -2], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

const SCREEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Passage d'un ecran a l'autre : un balayage montant, souligne d'un fil d'or,
// et un reflet de vitre qui glisse quand le telephone tourne.
const SCREEN_FRAG = /* glsl */`
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uMix;
  uniform float uSheen;
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    vec3 a = texture2D(uA, vUv).rgb;
    vec3 b = texture2D(uB, vUv).rgb;
    float th = mix(-0.15, 1.15, uMix);
    float d = vUv.y + (vUv.x - 0.5) * 0.22;
    float m = 1.0 - smoothstep(th - 0.04, th + 0.04, d);
    vec3 col = mix(a, b, m);
    float live = step(0.002, uMix) * step(uMix, 0.998);
    col += vec3(0.95, 0.76, 0.28) * (1.0 - smoothstep(0.0, 0.035, abs(d - th))) * live * 0.85;
    float s = vUv.x * 0.9 + vUv.y * 0.55 - uSheen;
    col += vec3(1.0) * 0.04 * (1.0 - smoothstep(0.0, 0.16, abs(s)));
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <colorspace_fragment>
  }`;

async function start3D() {
  let THREE;
  try {
    [THREE] = await Promise.all([import('./vendor/three.module.min.js'), assetsReady]);
  } catch {
    return startFallback();
  }
  if (fallbackStarted) return;

  const canvas = document.getElementById('stage');
  let renderer;
  try {
    // Ecran tres dense (telephones) : l'anticrenelage ne se voit plus, mais coute cher.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !(isMobile() && devicePixelRatio >= 2), alpha: true, powerPreference: 'high-performance' });
  } catch {
    return startFallback();
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); teardown(); startFallback(); });

  const scene = new THREE.Scene();
  scene.environment = studio(THREE, renderer);
  const camera = new THREE.PerspectiveCamera(30, vw / vh, 0.1, 60);
  camera.position.set(0, 0, 8);
  const halfH = Math.tan(THREE.MathUtils.degToRad(15)) * 8;

  // ── Telephone ──
  const phone = new THREE.Group();
  const tilt = new THREE.Group(); // mouvement « vivant », separe de la pose
  tilt.add(phone);
  scene.add(tilt);

  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.22 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x030303, metalness: 0.4, roughness: 0.1 });
  const depth = PD - 2 * BEV;
  const bodyGeo = new THREE.ExtrudeGeometry(shapeRR(THREE, PW - 2 * BEV, PH - 2 * BEV, PR - BEV), {
    depth, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 5, curveSegments: 18,
  });
  bodyGeo.translate(0, 0, -depth / 2);
  phone.add(new THREE.Mesh(bodyGeo, [glass, gold]));

  // Ecran.
  const textures = {};
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const texFor = (name) => {
    if (!textures[name]) {
      const t = new THREE.CanvasTexture(drawScreen(name));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      textures[name] = t;
    }
    return textures[name];
  };
  const screenNames = sections.map((s) => s.dataset.screen);
  function refreshCountdown() {
    const t = textures.countdown;
    if (!t) return;
    const g = t.image.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    SCREENS.countdown(new Painter(g));
    t.needsUpdate = true;
  }
  const screenMat = new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: texFor(screenNames[0]) },
      uB: { value: texFor(screenNames[0]) },
      uMix: { value: 0 }, uSheen: { value: 0.6 }, uFade: { value: 0 },
    },
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(roundedPlane(THREE, SCW, SCH, PR - 0.035), screenMat);
  screen.position.z = PD / 2 + 0.0012;
  phone.add(screen);
  if (OG) screenNames.fill('habits');

  // Dos : panneau brosse avec le logo, bloc photo, boutons.
  const back = new THREE.Mesh(roundedPlane(THREE, SCW, SCH, PR - 0.035),
    new THREE.MeshStandardMaterial({ map: backTexture(THREE), metalness: 0.6, roughness: 0.4 }));
  back.rotation.y = Math.PI;
  back.position.z = -PD / 2 - 0.0012;
  phone.add(back);

  const bumpGeo = new THREE.ExtrudeGeometry(shapeRR(THREE, 0.36, 0.36, 0.1), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 4, curveSegments: 16 });
  const bump = new THREE.Mesh(bumpGeo, [glass, gold]);
  bump.position.set(0.24, 0.73, -PD / 2 - 0.022);
  phone.add(bump);
  const lensGlass = new THREE.MeshStandardMaterial({ color: 0x020206, metalness: 0.5, roughness: 0.06 });
  for (const [x, y] of [[0.17, 0.81], [0.31, 0.65]]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 32), lensGlass);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, y, -PD / 2 - 0.035);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 12, 40), gold);
    ring.position.set(x, y, -PD / 2 - 0.045);
    phone.add(lens, ring);
  }
  const btn = (h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.022, h, 0.045), gold);
    m.position.set(x, y, 0);
    phone.add(m);
  };
  btn(0.2, PW / 2 + 0.006, 0.42);
  btn(0.32, -PW / 2 - 0.006, 0.52);

  // ── Taille ──
  let dirty = true; // une image a redessiner (redimensionnement, compte a rebours)
  // Plafond de resolution : au-dela de 1,5, le gain est invisible a l'oeil
  // mais le cout pour la carte graphique double. Abaisse a 1 si l'appareil
  // peine (voir la surveillance plus bas).
  let pixelCap = 1.5;
  let lastW = -1, lastH = -1;
  function resize() {
    // Telephone : la barre d'adresse qui bouge ne change ni la largeur ni la
    // hauteur stable — rien a refaire.
    if (innerWidth === lastW && stableHeight() === lastH) return;
    lastW = innerWidth; lastH = stableHeight();
    measure();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixelCap));
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  resize();
  addEventListener('resize', resize);
  new ResizeObserver(() => { measure(); dirty = true; }).observe(document.querySelector('main'));
  document.fonts.ready.then(() => { measure(); dirty = true; });

  // ── Pointeur (ordinateur) ──
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / vw) * 2 - 1;
      pointer.ty = (e.clientY / vh) * 2 - 1;
    }, { passive: true });
  }

  // Tout est prepare des le depart : chaque ecran est dessine et envoye a la
  // carte graphique, et les effets de rendu sont compiles. Sans cela, chaque
  // ecran decouvert en plein defilement (et le premier tour du telephone)
  // provoquait un a-coup.
  for (const name of new Set(screenNames)) renderer.initTexture(texFor(name));
  renderer.initTexture(back.material.map);
  renderer.compile(scene, camera);

  // ── Boucle ──
  // On ne dessine une image que si quelque chose a bouge : immobile, la page
  // ne coute rien, et le defilement garde toute la puissance disponible.
  let fCur = sceneFloat(scrollY);
  let last = performance.now();
  const t0 = last;
  let frames = 0, slowSum = 0, running = true, lastSecond = -1;
  const ctaIndex = sections.findIndex((s) => s.id === 'cta');
  const lastStyle = copies.map(() => ({ o: -1, ty: 1e9 }));

  function teardown() {
    running = false;
    renderer.setAnimationLoop(null);
    Object.values(textures).forEach((t) => t.dispose());
    renderer.dispose();
  }

  renderer.setAnimationLoop(() => {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const time = (now - t0) / 1000;

    const y = scrollY;
    const fTarget = sceneFloat(y);
    const intro = reduceMotion || OG ? 1 : smooth(0, 1, time / 1.6);
    const moving = Math.abs(fTarget - fCur) > 1e-4
      || Math.abs(pointer.tx - pointer.x) > 1e-3 || Math.abs(pointer.ty - pointer.y) > 1e-3;

    // Compte a rebours : l'ecran est redessine une fois par seconde, et
    // seulement quand la derniere scene est en vue.
    if (Math.floor(fCur) >= ctaIndex - 1) {
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSecond) { lastSecond = sec; refreshCountdown(); dirty = true; }
    }
    if (!moving && intro >= 1 && !dirty) return;
    dirty = false;

    // Surveillance : si les premieres images sont trop lentes, repli.
    // (`?force3d` dans l'adresse la desactive, pour les tests.)
    frames++;
    // Premier signe de lenteur : on baisse la resolution et on remesure ;
    // le repli en images fixes ne vient qu'en second recours.
    if (frames > 20 && frames <= 80) slowSum += dt;
    if (frames === 80 && slowSum / 60 > 1 / 24 && !OG && !location.search.includes('force3d')) {
      if (pixelCap > 1) {
        pixelCap = 1; lastW = -1; resize();
        frames = 0; slowSum = 0;
      } else {
        teardown(); startFallback(); return;
      }
    }

    updateChrome(y);
    fCur += (fTarget - fCur) * (1 - Math.exp(-dt * 8));
    if (Math.abs(fTarget - fCur) < 1e-4) fCur = fTarget;

    const i = Math.min(Math.floor(fCur), sections.length - 1);
    const j = Math.min(i + 1, sections.length - 1);
    const t = fCur - i;
    const e = smooth(0.18, 0.82, t);
    const A = poseFor(i), B = poseFor(j);
    const introE = 1 - Math.pow(1 - intro, 3);

    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));

    const halfW = halfH * (vw / vh);
    const h = lerp(A.h, B.h, e);
    const scale = (h * 2 * halfH) / PH;
    phone.scale.setScalar(scale);
    tilt.position.set(
      lerp(A.nx, B.nx, e) * halfW,
      lerp(A.ny, B.ny, e) * halfH - (1 - introE) * 2.2,
      0,
    );
    const spin = j !== i ? B.spin * Math.PI * 2 * e : 0;
    tilt.rotation.set(
      lerp(A.rx, B.rx, e) + pointer.y * 0.07,
      lerp(A.ry, B.ry, e) + spin + pointer.x * 0.14 + (1 - introE) * 1.4,
      lerp(A.rz, B.rz, e),
      'YXZ',
    );

    // Ecran : balayage entre l'ecran de la scene i et celui de la suivante.
    const u = screenMat.uniforms;
    u.uA.value = texFor(screenNames[i]);
    u.uB.value = texFor(screenNames[j]);
    u.uMix.value = j === i ? 0 : smooth(0.4, 0.62, t);
    u.uSheen.value = 0.55 + tilt.rotation.y * 0.7;
    u.uFade.value = smooth(0.15, 0.9, intro);

    // Textes : chacun apparait quand sa scene est au centre. On n'ecrit dans
    // la page que ce qui a vraiment change.
    for (let k = 0; k < copies.length; k++) {
      const d = offsetOf(k, y);
      // Sur telephone, le texte s'efface vite en montant (il passerait sous
      // le telephone 3D) mais apparait tot en arrivant par le bas.
      const o = mobile
        ? 1 - (d < 0 ? smooth(0.05, 0.15, -d) : smooth(0.28, 0.48, d))
        : 1 - smooth(0.2, 0.42, Math.abs(d));
      const ty = Math.round(-clamp(d, -1, 1) * (mobile ? 30 : 70));
      const ls = lastStyle[k];
      if (Math.abs(o - ls.o) < 0.004 && ty === ls.ty) continue;
      const st = copies[k].style;
      if (Math.abs(o - ls.o) >= 0.004) {
        st.opacity = o.toFixed(3);
        st.visibility = o < 0.01 ? 'hidden' : '';
        ls.o = o;
      }
      if (o >= 0.01 && ty !== ls.ty) { st.transform = `translate3d(0, ${ty}px, 0)`; ls.ty = ty; }
    }

    renderer.render(scene, camera);
  });
}

/* ════════════════════════════════════════════════════════════════════
   5. Demarrage
   ════════════════════════════════════════════════════════════════════ */

const assetsReady = loadAssets();
measure();
updateChrome(scrollY);
if (root.classList.contains('is3d')) start3D();
else startFallback();

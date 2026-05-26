'use strict';

// break_eternity.js exposes Decimal as a strict class. Wrap it so D(x) coerces
// to a Decimal whether x is a number, string, or already a Decimal.
function D(x) { return (x instanceof Decimal) ? x : new Decimal(x); }
D.min = (a, b) => Decimal.min(a, b);

/* =================== DATA =================== */
const COLORS  = ['#f5f5f5', '#ffd500', '#d92b2b', '#ff7a1a', '#2b6fd9', '#28a745'];
const CUBES   = ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7'];
const PUZZLES = [...CUBES, 'pyraminx', 'megaminx', 'sq1', 'skewb', 'clock'];

const SHINY_COLORS = ['#ffd24a', '#ffc21a', '#ffe07a', '#f5b700'];
const SHINY_CHANCE = 0.0025;                              // base: 1 in 400 clicks
const SHINY_UP_COST = 5e12;                               // Shiny Magnet: flat 5 trillion per level
const AC_BASE = 5000;                                     // Auto-Clicker: base cost (x1.6 per level)
const SHINY = {
  '2x2': 500000,  '3x3': 1200000, '4x4': 2500000,
  '5x5': 4500000, '6x6': 7000000, '7x7': 10000000,
  pyraminx: 800000, megaminx: 6000000, sq1: 1800000,
  skewb: 900000, clock: 2000000,
};

const BUILDINGS = [
  { id:'novice',  name:'Novice Cuber', desc:'Solves slowly, but tries hard.',         baseCost:15,        cps:0.3 },
  { id:'speed',   name:'Speedcuber',   desc:'Sub-10 averages, all day long.',         baseCost:120,       cps:1.7 },
  { id:'shop',    name:'Cube Shop',    desc:'Sells cubes while you sleep.',           baseCost:1400,      cps:9   },
  { id:'factory', name:'Cube Factory', desc:'Mass-produces puzzles non-stop.',        baseCost:15000,     cps:55  },
  { id:'robot',   name:'Solver Robot', desc:'Never gets tired, never blinks.',        baseCost:170000,    cps:340 },
  { id:'arena',   name:'WCA Arena',    desc:'An arena packed with cubers.',           baseCost:2200000,   cps:2100 },
  { id:'ai',      name:'Cubing A.I.',  desc:'Invents new puzzles, then solves them.', baseCost:28000000,  cps:14000 },
  { id:'lab',     name:'Cube Lab',     desc:'Researches optimal solutions 24/7.',     baseCost:350000000, cps:90000 },
  { id:'portal',  name:'Cube Portal',  desc:'Harvests cubes from parallel dimensions.', baseCost:5e9,    cps:600000 },
  { id:'planet',  name:'Cube Planet',  desc:'An entire world devoted to cubing.',     baseCost:75e9,      cps:4000000 },
  { id:'galaxy',  name:'Cube Galaxy',  desc:'Billions of stars, all solving cubes.',  baseCost:1e12,      cps:28000000 },
  { id:'void',    name:'The Void Cube',desc:'Solves itself across spacetime.',        baseCost:15e12,     cps:200000000 },
];

const BOOSTS = [
  { id:'dblclick', name:'Double Click Power', desc:'×2 the cubes you earn per click.', baseCost:120,  growth:5 },
  { id:'cf15',     name:'Magnetic Cube',      desc:'+15 cubes every click.',           baseCost:250,  growth:3, clickFlat:15 },
  { id:'cf20',     name:'Flagship Cube',      desc:'+20 cubes every click.',           baseCost:600,  growth:3, clickFlat:20 },
  { id:'dblcps',   name:'Double Auto Income', desc:'×2 the cubes your solvers make.',   baseCost:2500, growth:9 },
  { id:'x5click',  name:'Penta Click Power', desc:'×5 the cubes you earn per click.',  baseCost:50000, growth:12 },
  { id:'x5cps',    name:'Penta Auto Income', desc:'×5 the cubes your solvers make.',   baseCost:75000, growth:15 },
  { id:'flow',     name:'Steady Flow',        desc:'+1 cube per second, no clicking.',  baseCost:200,  growth:4 },
  { id:'x10all',   name:'Decuple Everything', desc:'×10 cubes from clicks AND auto income.', baseCost:1e9, growth:100 },
  { id:'x20all',   name:'Vigecuple Everything', desc:'×20 cubes from clicks AND auto income.', baseCost:1e15, growth:400 },
];

// Cube Gear — the per-click counterpart to the Auto-Solvers (each adds flat cubes/click).
const GEAR = [
  { id:'lube',     name:'Cube Lube',          desc:'Smoother turns — faster clicks.',        baseCost:60,        perClick:3 },
  { id:'spring',   name:'Spring Swap',        desc:'Custom tensions for a crisp feel.',      baseCost:700,       perClick:14 },
  { id:'magnet',   name:'Magnet Mod',         desc:'Magnets snap every layer into place.',   baseCost:8000,      perClick:70 },
  { id:'sticker',  name:'Stickerless Cube',   desc:'No stickers to peel — pure speed.',      baseCost:95000,     perClick:380 },
  { id:'flagship', name:'Flagship Speedcube', desc:'Competition-grade hardware.',            baseCost:1100000,   perClick:1900 },
  { id:'maglev',   name:'Maglev Core',        desc:'Frictionless magnetic levitation.',      baseCost:13000000,  perClick:9500 },
  { id:'smart',    name:'Smart Cube',         desc:'A fully tricked-out main.',              baseCost:160000000, perClick:52000 },
];

const SAVE_KEY = 'cubeClickerSave';

let state = { cubes:D(0), total:D(0), clickLevel:0, shinies:0, shinyBonus:D(0), shinyLevel:0, autoClicker:0, autoRate:0, prestige:0, wins:0, buildings:{}, boosts:{}, gear:{}, lastSeen:Date.now() };
BUILDINGS.forEach(b => state.buildings[b.id] = 0);
BOOSTS.forEach(b => state.boosts[b.id] = 0);
GEAR.forEach(g => state.gear[g.id] = 0);

let buyMode = 1;                                          // 1 / 2 / 5 / 10 / 50, or 'max'
let autoAcc = 0;                                          // fractional auto-click accumulator
let resetting = false;                                    // blocks autosave once a reset is in progress
let lastFloatAt = 0;                                      // throttles the floating +N popups
let autoRenderAt = 0;                                     // throttles the cube redraw from auto-clicks

/* =================== DERIVED VALUES =================== */
const clickFlat    = () => BOOSTS.reduce((s, b) => s + (b.clickFlat || 0) * state.boosts[b.id], 0);
const gearFlat     = () => GEAR.reduce((s, g) => s + g.perClick * state.gear[g.id], 0);
const gearCost     = g  => D(g.baseCost).mul(D(1.15).pow(state.gear[g.id])).floor();
const prestigeMult = () => Math.pow(2, state.prestige);
const winMult      = () => D(100).pow(state.wins);   // each Restart-from-win adds a permanent ×100.
const perClick     = () => cap(
  D(1).add(2 * state.clickLevel).add(clickFlat()).add(gearFlat()).add(state.shinyBonus)
    .mul(D(2).pow(state.boosts.dblclick))
    .mul(D(5).pow(state.boosts.x5click))
    .mul(D(10).pow(state.boosts.x10all))
    .mul(D(20).pow(state.boosts.x20all))
    .mul(prestigeMult())
    .mul(winMult())
);
const clickCost    = () => D(15).mul(D(1.4).pow(state.clickLevel)).floor();
const buildingCost = b  => D(b.baseCost).mul(D(1.15).pow(state.buildings[b.id])).floor();
const boostCost    = b  => D(b.baseCost).mul(D(b.growth).pow(state.boosts[b.id])).floor();
const baseCps      = () => BUILDINGS.reduce((s, b) => s.add(D(b.cps).mul(state.buildings[b.id])), D(0));
const cps          = () => cap(
  baseCps().add(state.boosts.flow).add(state.shinyBonus)
    .mul(D(2).pow(state.boosts.dblcps))
    .mul(D(5).pow(state.boosts.x5cps))
    .mul(D(10).pow(state.boosts.x10all))
    .mul(D(20).pow(state.boosts.x20all))
    .mul(prestigeMult())
    .mul(winMult())
);
const shinyChance  = () => SHINY_CHANCE + state.shinyLevel * 0.01;
const autoClickerCost = () => D(AC_BASE).mul(D(1.6).pow(state.autoClicker)).floor();

/* =================== HELPERS =================== */
// Conway-Wechsler-ish naming for the N-th -illion (short scale, N >= 1).
const _ILL_SPECIAL_NAME = ['', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion',
                           'sextillion', 'septillion', 'octillion', 'nonillion'];
const _ILL_SPECIAL_ABBR = ['', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];
const _ILL_ONES_P = ['', 'un', 'duo', 'tre', 'quattuor', 'quin', 'sex', 'septen', 'octo', 'novem'];
const _ILL_TENS_P = ['', 'deci', 'viginti', 'triginta', 'quadraginta', 'quinquaginta',
                     'sexaginta', 'septuaginta', 'octoginta', 'nonaginta'];
const _ILL_HUND_P = ['', 'centi', 'ducenti', 'trecenti', 'quadringenti', 'quingenti',
                     'sescenti', 'septingenti', 'octingenti', 'nongenti'];
const _ILL_ONES_A = ['', 'U', 'D', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];
const _ILL_TENS_A = ['', 'Dc', 'Vg', 'Tg', 'Qd', 'Qq', 'Sg', 'St', 'Og', 'Ng'];
const _ILL_HUND_A = ['', 'Ce', 'DuC', 'TrC', 'QaC', 'QiC', 'SxC', 'SpC', 'OcC', 'NoC'];

function illionAbbr(n) {
  if (n < 1) return '';
  if (n < 10) return _ILL_SPECIAL_ABBR[n];
  const u = n % 10, t = Math.floor(n / 10) % 10, h = Math.floor(n / 100) % 10;
  return _ILL_ONES_A[u] + _ILL_TENS_A[t] + _ILL_HUND_A[h];
}
function illionName(n) {
  if (n < 1) return '';
  if (n < 10) return _ILL_SPECIAL_NAME[n];
  const u = n % 10, t = Math.floor(n / 10) % 10, h = Math.floor(n / 100) % 10;
  return (_ILL_ONES_P[u] + _ILL_TENS_P[t] + _ILL_HUND_P[h]).replace(/[ia]$/, '') + 'illion';
}

// UNITS[i] = abbreviation for 10^(3i); NAMES[i] = full name. Suffix table
// covers up to tier 333 (10^999); past 1e1000 fmt switches to scientific.
const UNITS = [];
const NAMES = [];
for (let i = 0; i <= 333; i++) {
  if (i === 0)      { UNITS.push('');  NAMES.push(''); }
  else if (i === 1) { UNITS.push('K'); NAMES.push('thousand'); }
  else              { UNITS.push(illionAbbr(i - 1)); NAMES.push(illionName(i - 1)); }
}

const SCI_THRESHOLD = D(10).pow(1000);   // ≥ 1e1000 → scientific notation.

// Returns { i, mantissa } for a Decimal d >= 1000. Handles the FP edge where
// log10/floor underestimates the exponent and mantissa lands ≥ 1000.
function _tier(d) {
  const expFloor = d.log10().floor().toNumber();
  let i = Math.floor(expFloor / 3);
  if (i >= UNITS.length) i = UNITS.length - 1;
  let mantissa = d.div(D(10).pow(i * 3)).toNumber();
  while (mantissa >= 1000 && i < UNITS.length - 1) {
    i++;
    mantissa = d.div(D(10).pow(i * 3)).toNumber();
  }
  return { i, mantissa };
}

// For values past the suffix table, emit Decimal's own big-number form
// (scientific for "small" megabignums, tower notation for absurd ones).
// Exponents are comma-grouped so 1e3450 reads as 1e+3,450.
function _bigFallback(d) {
  const s = d.toExponential(2).replace(/\.?0+e/, 'e');
  return s.replace(/e([+-])(\d+)/, (_, sign, exp) => 'e' + sign + Number(exp).toLocaleString('en-US'));
}

// Thousand-separator form for the K-range (1,000 ... 999,999); suffixes kick in at 1 M.
const _COMMA_MAX = 1e6;
function _comma(d) {
  return d.toNumber().toLocaleString('en-US', { maximumFractionDigits: 1 });
}

// fmt accepts either a Decimal or a plain Number. Returns a plain string (no HTML).
function fmt(n) {
  if (n == null) return '0';
  const d = D(n);
  if (!d.isFinite()) return '0';
  if (d.gte(SCI_THRESHOLD)) return _bigFallback(d);
  if (d.lt(1000)) {
    const x = Math.floor(d.toNumber() * 10) / 10;
    return (x % 1 === 0 ? String(x) : x.toFixed(1));
  }
  if (d.lt(_COMMA_MAX)) return _comma(d);
  const { i, mantissa } = _tier(d);
  return mantissa.toFixed(2).replace(/\.?0+$/, '') + UNITS[i];
}

// HTML version: wraps the suffix in a span carrying the full name as a tooltip.
function fmtHTML(n) {
  if (n == null) return '0';
  const d = D(n);
  if (!d.isFinite()) return '0';
  if (d.gte(SCI_THRESHOLD)) return _bigFallback(d);
  if (d.lt(1000)) {
    const x = Math.floor(d.toNumber() * 10) / 10;
    return (x % 1 === 0 ? String(x) : x.toFixed(1));
  }
  if (d.lt(_COMMA_MAX)) return _comma(d);
  const { i, mantissa } = _tier(d);
  const num  = mantissa.toFixed(2).replace(/\.?0+$/, '');
  const name = NAMES[i];
  return name ? `${num}<span class="num-suffix" title="${name}">${UNITS[i]}</span>` : num + UNITS[i];
}

// No hard cap — break_eternity.js handles arbitrarily large values. cap() just
// coerces to Decimal so callers can keep using `state.cubes = cap(...)`.
const cap      = n => D(n);
const pick     = arr => arr[(Math.random() * arr.length) | 0];
const polyStr  = pts => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const add      = (p, q) => [p[0] + q[0], p[1] + q[1]];
const scale    = (v, k) => [v[0] * k, v[1] * k];
const lerp     = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function insetPoly(pts, f) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(p => [p[0] + (cx - p[0]) * f, p[1] + (cy - p[1]) * f]);
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function sticker(pts, color, f) {
  return `<polygon points="${polyStr(insetPoly(pts, f))}" fill="${color}" `
       + `stroke="#15151c" stroke-width="2" stroke-linejoin="round"/>`;
}

/* =================== PUZZLE DRAWING =================== */
// N×N cube, drawn in isometric with 3 visible faces and scrambled colors.
function isoCube(N, pal, shiny) {
  const u  = 224 / (2 * N);            // cell width
  const vd = u * 1.16;                 // vertical cell edge
  const C  = [150, 35 + N * u];        // shared front-top corner
  const RIGHT = [u, u * 0.5], LEFT = [-u, u * 0.5], DOWN = [0, vd];
  const FACE = shiny ? { top: 1, right: 0.88, left: 0.74 }   // softer so gold stays gold
                     : { top: 1, right: 0.78, left: 0.58 };

  const topPt   = (a, b) => add(add(C, scale(RIGHT, -a)), scale(LEFT, -b));
  const rightPt = (a, c) => add(add(C, scale(LEFT,  -a)), scale(DOWN,  c));
  const leftPt  = (b, c) => add(add(C, scale(RIGHT, -b)), scale(DOWN,  c));

  let out = '';
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    out += sticker([topPt(i,j), topPt(i+1,j), topPt(i+1,j+1), topPt(i,j+1)],
                   shade(pick(pal), FACE.top), 0.13);
  for (let a = 0; a < N; a++) for (let c = 0; c < N; c++)
    out += sticker([rightPt(a,c), rightPt(a+1,c), rightPt(a+1,c+1), rightPt(a,c+1)],
                   shade(pick(pal), FACE.right), 0.13);
  for (let b = 0; b < N; b++) for (let c = 0; c < N; c++)
    out += sticker([leftPt(b,c), leftPt(b+1,c), leftPt(b+1,c+1), leftPt(b,c+1)],
                   shade(pick(pal), FACE.left), 0.13);
  return out;
}

function pyraminxShape() {
  const T = [150, 54], BL = [58, 224], BR = [242, 224];
  const L = [(BL[0]-T[0])/3, (BL[1]-T[1])/3];
  const R = [(BR[0]-T[0])/3, (BR[1]-T[1])/3];
  const pt = (i, j) => [T[0] + (i-j)*L[0] + j*R[0], T[1] + (i-j)*L[1] + j*R[1]];
  const st = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c <= r; c++) st.push([pt(r,c), pt(r+1,c), pt(r+1,c+1)]);
    for (let c = 0; c < r;  c++) st.push([pt(r,c), pt(r,c+1), pt(r+1,c+1)]);
  }
  return { outline: [T, BR, BL], stickers: st };
}

function megaminxShape() {
  const cx = 150, cy = 152, R = 116, ri = R * 0.42;
  const V = [], P = [];
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI/2 + k * 2*Math.PI/5;
    V.push([cx + R  * Math.cos(ang), cy + R  * Math.sin(ang)]);
    P.push([cx + ri * Math.cos(ang), cy + ri * Math.sin(ang)]);
  }
  const A = [], B = [];
  for (let k = 0; k < 5; k++) {
    A.push(lerp(V[k], V[(k+1)%5], 1/3));
    B.push(lerp(V[k], V[(k+1)%5], 2/3));
  }
  const st = [ P.slice() ];                          // center sticker
  for (let k = 0; k < 5; k++) {
    st.push([V[k], A[k], P[k], B[(k+4)%5]]);          // corner sticker
    st.push([A[k], B[k], P[(k+1)%5], P[k]]);          // edge sticker
  }
  return { outline: V.slice(), stickers: st };
}

function square1Shape() {
  const cx = 150, cy = 150;
  const widths = [60, 30, 60, 30, 60, 30, 60, 30];
  const radii  = [122, 86, 122, 86, 122, 86, 122, 86];
  let ang = -105, outline = [], st = [];
  for (let i = 0; i < 8; i++) {
    const a0 = ang * Math.PI/180, a1 = (ang + widths[i]) * Math.PI/180, r = radii[i];
    const p0 = [cx + r*Math.cos(a0), cy + r*Math.sin(a0)];
    const p1 = [cx + r*Math.cos(a1), cy + r*Math.sin(a1)];
    st.push([[cx, cy], p0, p1]);
    outline.push(p0, p1);
    ang += widths[i];
  }
  return { outline, stickers: st };
}

function flatPuzzle(type, pal, shiny) {
  const shape = type === 'pyraminx' ? pyraminxShape()
              : type === 'megaminx' ? megaminxShape()
              : square1Shape();
  const back = shape.outline.map(p => [p[0], p[1] + 11]);   // extruded depth
  let out = `<polygon points="${polyStr(back)}" fill="${shiny ? '#5a3f00' : '#0b0b11'}"/>`;
  for (const s of shape.stickers) out += sticker(s, pick(pal), 0.11);
  return out;
}

// Skewb: a cube whose faces split into a centre diamond + 4 corner triangles.
function skewbFace(quad, shadeF, pal) {
  const [P0, P1, P2, P3] = quad;
  const M0 = lerp(P0,P1,0.5), M1 = lerp(P1,P2,0.5),
        M2 = lerp(P2,P3,0.5), M3 = lerp(P3,P0,0.5);
  const pieces = [
    [M0,M1,M2,M3],                                       // centre diamond
    [P0,M0,M3], [P1,M1,M0], [P2,M2,M1], [P3,M3,M2],      // corner triangles
  ];
  let out = '';
  for (const p of pieces) out += sticker(p, shade(pick(pal), shadeF), 0.1);
  return out;
}
function skewbCube(pal, shiny) {
  const u = 112, vd = u * 1.16;
  const C = [150, 35 + u];
  const RIGHT = [u, u*0.5], LEFT = [-u, u*0.5], DOWN = [0, vd];
  const FACE = shiny ? { top:1, right:0.88, left:0.74 }
                     : { top:1, right:0.78, left:0.58 };
  const topFace   = [C, add(C,scale(RIGHT,-1)), add(add(C,scale(RIGHT,-1)),scale(LEFT,-1)), add(C,scale(LEFT,-1))];
  const rightFace = [C, add(C,scale(LEFT,-1)),  add(add(C,scale(LEFT,-1)),scale(DOWN,1)),   add(C,scale(DOWN,1))];
  const leftFace  = [C, add(C,scale(RIGHT,-1)), add(add(C,scale(RIGHT,-1)),scale(DOWN,1)),  add(C,scale(DOWN,1))];
  return skewbFace(topFace,   FACE.top,   pal)
       + skewbFace(rightFace, FACE.right, pal)
       + skewbFace(leftFace,  FACE.left,  pal);
}

// Rubik's Clock: a 3x3 grid of clock dials with randomly-pointing hands.
function clockPuzzle(pal, shiny) {
  const body = shiny ? '#e8b400' : shade(pick(pal), 0.82);
  const dial = shiny ? '#fff2b8' : '#ece3c8';
  const ink  = '#15151c';
  const grid = [92, 150, 208];
  const ln = (x1,y1,x2,y2,w) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" `
    + `stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`;
  let out = `<rect x="58" y="68" width="184" height="184" rx="30" fill="${shade(body,0.5)}"/>`
          + `<rect x="58" y="58" width="184" height="184" rx="30" fill="${body}" stroke="${ink}" stroke-width="3"/>`;
  for (const cy of grid) for (const cx of grid) {
    out += `<circle cx="${cx}" cy="${cy}" r="26" fill="${dial}" stroke="${ink}" stroke-width="2"/>`;
    for (let t = 0; t < 12; t++) {
      const a = t * Math.PI / 6;
      out += ln(cx+21*Math.sin(a), cy-21*Math.cos(a), cx+25*Math.sin(a), cy-25*Math.cos(a), 1.4);
    }
    const h = ((Math.random()*12)|0) * Math.PI / 6;
    out += ln(cx, cy, cx+16*Math.sin(h), cy-16*Math.cos(h), 3.6);
    out += `<circle cx="${cx}" cy="${cy}" r="3" fill="${ink}"/>`;
  }
  for (const py of [121, 179]) for (const px of [121, 179])
    out += `<circle cx="${px}" cy="${py}" r="6.5" fill="${shiny ? '#fff6d0' : '#c8c8d2'}" stroke="${ink}" stroke-width="1.5"/>`;
  return out;
}

function prettyName(t) {
  if (CUBES.includes(t)) return t.replace('x', '×');
  return { pyraminx: 'Pyraminx', megaminx: 'Megaminx', sq1: 'Square-1',
           skewb: 'Skewb', clock: 'Clock' }[t];
}
// Throttled puzzle rendering: clicks are counted at full speed, but the SVG is
// only redrawn ~12x/sec so fast tapping doesn't strobe or glitch on mobile.
let pendingPuzzle = null, renderScheduled = false;
function renderPuzzle(type, shiny) {
  if (shiny) {                            // shinies always draw right away — they're special
    pendingPuzzle = null;
    drawPuzzle(type, shiny);
    return;
  }
  pendingPuzzle = { type, shiny };
  if (renderScheduled) return;            // a render window is open; trailing flush will catch it
  flushPuzzle();                          // leading edge: draw immediately
  renderScheduled = true;
  setTimeout(() => {
    renderScheduled = false;
    if (pendingPuzzle) flushPuzzle();     // draw the latest puzzle from clicks during the window
  }, 80);
}
function flushPuzzle() {
  if (!pendingPuzzle) return;
  const { type, shiny } = pendingPuzzle;
  pendingPuzzle = null;
  drawPuzzle(type, shiny);
}
let cubeLayers = null, frontLayer = 0;
function drawPuzzle(type, shiny) {
  if (!cubeLayers) cubeLayers = document.querySelectorAll('.cube-layer');
  const pal = shiny ? SHINY_COLORS : COLORS;
  const back = cubeLayers[frontLayer ^ 1];          // render into the hidden layer...
  back.innerHTML =
      CUBES.includes(type) ? isoCube(parseInt(type, 10), pal, shiny)
    : type === 'skewb'     ? skewbCube(pal, shiny)
    : type === 'clock'     ? clockPuzzle(pal, shiny)
    :                        flatPuzzle(type, pal, shiny);
  cubeLayers[frontLayer].classList.remove('show');  // ...then cross-fade to it, so any
  back.classList.add('show');                       // render glitch stays off-screen
  frontLayer ^= 1;
  const nameEl = document.getElementById('puzzle-name');
  nameEl.textContent = (shiny ? '✨ Shiny ' : '') + prettyName(type);
  nameEl.classList.toggle('shiny', !!shiny);
  document.getElementById('cube').classList.toggle('shiny', !!shiny);
}

/* =================== SHOP UI =================== */
function buildShop() {
  const su = document.getElementById('shiny-up');
  su.innerHTML = `
    <div class="card-info">
      <div class="name">✨ Shiny Magnet</div>
      <div class="desc">+1% shiny chance on every click.</div>
      <div class="owned" id="shiny-lvl">Level 0</div>
    </div>
    <div class="card-cost">
      <div class="cost" id="su-cost">0</div>
      <div class="sub">cubes</div>
    </div>`;
  su.addEventListener('click', buyShinyUp);

  const ac = document.getElementById('auto-clicker');
  ac.innerHTML = `
    <div class="card-info">
      <div class="name">🤖 Auto-Clicker</div>
      <div class="desc">Clicks the cube for you — puzzle swaps &amp; shiny rolls included.</div>
      <div class="owned"><span id="ac-owned">0</span> owned &middot; <span id="ac-rate">0</span> clicks/sec</div>
    </div>
    <div class="card-cost">
      <div class="cost" id="ac-cost">0</div>
      <div class="sub">cubes</div>
    </div>`;
  ac.addEventListener('click', buyAutoClicker);

  const cu = document.getElementById('click-upgrade');
  cu.innerHTML = `
    <div class="card-info">
      <div class="name">Finger Training</div>
      <div class="desc">+2 cubes per click, every level.</div>
      <div class="owned" id="cu-owned">Level 0</div>
    </div>
    <div class="card-cost">
      <div class="cost" id="cu-cost">0</div>
      <div class="sub">cubes</div>
    </div>`;
  cu.addEventListener('click', buyClick);

  const boostWrap = document.getElementById('boosts');
  BOOSTS.forEach(b => {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'boost-' + b.id;
    card.innerHTML = `
      <div class="card-info">
        <div class="name">${b.name}</div>
        <div class="desc">${b.desc}</div>
        <div class="owned">bought <span id="bought-${b.id}">0</span>&times;</div>
      </div>
      <div class="card-cost">
        <div class="cost" id="bcost-${b.id}">0</div>
        <div class="sub">cubes</div>
      </div>`;
    card.addEventListener('click', () => buyBoost(b.id));
    boostWrap.appendChild(card);
  });

  const gearWrap = document.getElementById('gear');
  GEAR.forEach(g => {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'gear-' + g.id;
    card.innerHTML = `
      <div class="card-info">
        <div class="name">${g.name}</div>
        <div class="desc">${g.desc}</div>
        <div class="owned"><span id="gowned-${g.id}">0</span> owned &middot; +${g.perClick}/click each</div>
      </div>
      <div class="card-cost">
        <div class="cost" id="gcost-${g.id}">0</div>
        <div class="sub">cubes</div>
      </div>`;
    card.addEventListener('click', () => buyGear(g.id));
    gearWrap.appendChild(card);
  });

  const wrap = document.getElementById('buildings');
  BUILDINGS.forEach(b => {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'b-' + b.id;
    card.innerHTML = `
      <div class="card-info">
        <div class="name">${b.name}</div>
        <div class="desc">${b.desc}</div>
        <div class="owned"><span id="owned-${b.id}">0</span> owned &middot; +${b.cps}/sec each</div>
      </div>
      <div class="card-cost">
        <div class="cost" id="cost-${b.id}">0</div>
        <div class="sub">cubes</div>
      </div>`;
    card.addEventListener('click', () => buyBuilding(b.id));
    wrap.appendChild(card);
  });
}

function toggleCard(card, costEl, affordable) {
  card.classList.toggle('locked', !affordable);
  costEl.classList.toggle('ok', affordable);
  costEl.classList.toggle('no', !affordable);
}

// Closed-form for exponential cost series. Total cost of N levels starting at
// `owned` is firstCost * (r^N - 1) / (r - 1), so the max N affordable is
// floor(log_r(1 + budget * (r-1) / firstCost)). Cap at Number.MAX_SAFE_INTEGER
// so the level counter (a plain Number) never loses integer precision.
const HARD_BUY_CAP = Number.MAX_SAFE_INTEGER;
function maxAfford(baseCost, ratio, owned) {
  if (ratio === 1) {
    const flat = state.cubes.div(baseCost).floor().toNumber();
    return Math.min(isFinite(flat) ? Math.max(0, flat) : HARD_BUY_CAP, HARD_BUY_CAP);
  }
  const r = D(ratio);
  const firstCost = D(baseCost).mul(r.pow(owned));
  if (state.cubes.lt(firstCost)) return 0;
  const inner = state.cubes.mul(r.sub(1)).div(firstCost).add(1);
  const n = inner.log10().div(r.log10()).floor().toNumber();
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, HARD_BUY_CAP);
}
function maxAffordFlat(cost) {
  const n = state.cubes.div(cost).floor().toNumber();
  return Math.min(isFinite(n) ? Math.max(0, n) : HARD_BUY_CAP, HARD_BUY_CAP);
}

function updateUI() {
  document.getElementById('cube-count').innerHTML = fmtHTML(state.cubes);
  document.getElementById('per-second').innerHTML = fmtHTML(cps());
  document.getElementById('per-click').innerHTML  = fmtHTML(perClick());
  document.getElementById('shiny-count').textContent = state.shinies;

  const isMax = buyMode === 'max';

  const suMax = isMax ? maxAffordFlat(SHINY_UP_COST) : 0;
  document.getElementById('su-cost').innerHTML = isMax ? fmtHTML(SHINY_UP_COST) + ' (×' + fmtHTML(suMax) + ')' : fmtHTML(SHINY_UP_COST);
  document.getElementById('shiny-lvl').textContent =
    'Level ' + state.shinyLevel + '  ·  now ' + (shinyChance() * 100).toFixed(2) + '%';
  toggleCard(document.getElementById('shiny-up'),
             document.getElementById('su-cost'), state.cubes.gte(SHINY_UP_COST));

  const acC = autoClickerCost();
  const acMax = isMax ? maxAfford(AC_BASE, 1.6, state.autoClicker) : 0;
  document.getElementById('ac-cost').innerHTML    = isMax ? fmtHTML(acC) + ' (×' + fmtHTML(acMax) + ')' : fmtHTML(acC);
  document.getElementById('ac-owned').textContent = state.autoClicker;
  document.getElementById('ac-rate').textContent  = state.autoClicker;
  toggleCard(document.getElementById('auto-clicker'),
             document.getElementById('ac-cost'), state.cubes.gte(acC));

  const cc = clickCost();
  const ccMax = isMax ? maxAfford(15, 1.4, state.clickLevel) : 0;
  document.getElementById('cu-cost').innerHTML    = isMax ? fmtHTML(cc) + ' (×' + fmtHTML(ccMax) + ')' : fmtHTML(cc);
  document.getElementById('cu-owned').textContent = 'Level ' + state.clickLevel;
  toggleCard(document.getElementById('click-upgrade'),
             document.getElementById('cu-cost'), state.cubes.gte(cc));

  BOOSTS.forEach(b => {
    const c = boostCost(b);
    const bMax = isMax ? maxAfford(b.baseCost, b.growth, state.boosts[b.id]) : 0;
    document.getElementById('bcost-' + b.id).innerHTML    = isMax ? fmtHTML(c) + ' (×' + fmtHTML(bMax) + ')' : fmtHTML(c);
    document.getElementById('bought-' + b.id).textContent = state.boosts[b.id];
    toggleCard(document.getElementById('boost-' + b.id),
               document.getElementById('bcost-' + b.id), state.cubes.gte(c));
  });

  GEAR.forEach(g => {
    const c = gearCost(g);
    const gMax = isMax ? maxAfford(g.baseCost, 1.15, state.gear[g.id]) : 0;
    document.getElementById('gcost-' + g.id).innerHTML    = isMax ? fmtHTML(c) + ' (×' + fmtHTML(gMax) + ')' : fmtHTML(c);
    document.getElementById('gowned-' + g.id).textContent = state.gear[g.id];
    toggleCard(document.getElementById('gear-' + g.id),
               document.getElementById('gcost-' + g.id), state.cubes.gte(c));
  });

  BUILDINGS.forEach(b => {
    const c = buildingCost(b);
    const bMax = isMax ? maxAfford(b.baseCost, 1.15, state.buildings[b.id]) : 0;
    document.getElementById('cost-' + b.id).innerHTML    = isMax ? fmtHTML(c) + ' (×' + fmtHTML(bMax) + ')' : fmtHTML(c);
    document.getElementById('owned-' + b.id).textContent = state.buildings[b.id];
    toggleCard(document.getElementById('b-' + b.id),
               document.getElementById('cost-' + b.id), state.cubes.gte(c));
  });

  const pBox = document.getElementById('prestige-box');
  const pCount = document.getElementById('prestige-count');
  const wBtn = document.getElementById('win-btn');
  const prestigeReady = state.cubes.gte('1e300');
  pBox.style.display = (prestigeReady || state.prestige > 0) ? '' : 'none';
  document.getElementById('prestige-btn').disabled = !prestigeReady;
  pCount.textContent = '⭐ Prestiges: ' + state.prestige + ' / 10'
    + (state.wins > 0 ? '   🏆 Wins: ' + state.wins + ' (×' + fmt(winMult()) + ')' : '');
  wBtn.style.display = state.prestige >= 10 ? '' : 'none';
}

/* =================== ACTIONS =================== */
// How many levels does the player want, given the current buyMode?
// 'max' → Infinity; numeric (including the custom value) → that number.
const desiredCount = () => buyMode === 'max' ? Infinity
                       : (typeof buyMode === 'number' && buyMode > 0 ? buyMode : 1);

// Exponential cost: applies `count` levels in one shot using the geometric-
// series total cost. Avoids looping at extreme MAX scales.
function bulkBuyExp(baseCost, ratio, get, set) {
  const affordable = maxAfford(baseCost, ratio, get());
  const count = Math.min(desiredCount(), affordable);
  if (count <= 0) return;
  const r = D(ratio);
  const firstCost = D(baseCost).mul(r.pow(get()));
  const totalCost = ratio === 1
    ? firstCost.mul(count)
    : firstCost.mul(r.pow(count).sub(1)).div(r.sub(1)).ceil();
  state.cubes = state.cubes.sub(totalCost);
  set(get() + count);
  updateUI();
  save();
}

// Flat cost: budget / cost, applied as one batched subtract + level set.
function bulkBuyFlat(cost, get, set) {
  const affordable = maxAffordFlat(cost);
  const count = Math.min(desiredCount(), affordable);
  if (count <= 0) return;
  state.cubes = state.cubes.sub(D(cost).mul(count));
  set(get() + count);
  updateUI();
  save();
}

function buyClick() {
  bulkBuyExp(15, 1.4, () => state.clickLevel, n => { state.clickLevel = n; });
}
function buyShinyUp() {
  bulkBuyFlat(SHINY_UP_COST, () => state.shinyLevel, n => { state.shinyLevel = n; });
}
function buyAutoClicker() {
  const before = state.autoClicker;
  bulkBuyExp(AC_BASE, 1.6, () => state.autoClicker, n => { state.autoClicker = n; });
  if (state.autoClicker > before) state.autoRate = state.autoClicker;  // run new clickers by default
  refreshAutoRate();
}
function refreshAutoRate() {
  if (state.autoRate > state.autoClicker) state.autoRate = state.autoClicker;
  const box = document.getElementById('auto-rate-box');
  const sl  = document.getElementById('auto-rate');
  box.style.display = state.autoClicker > 0 ? '' : 'none';
  sl.max   = state.autoClicker;
  sl.value = state.autoRate;
  document.getElementById('ar-val').textContent = state.autoRate;
  document.getElementById('ar-max').textContent = state.autoClicker;
}
function buyBuilding(id) {
  const b = BUILDINGS.find(x => x.id === id);
  bulkBuyExp(b.baseCost, 1.15, () => state.buildings[id], n => { state.buildings[id] = n; });
}
function buyGear(id) {
  const g = GEAR.find(x => x.id === id);
  bulkBuyExp(g.baseCost, 1.15, () => state.gear[id], n => { state.gear[id] = n; });
}
function buyBoost(id) {
  const b = BOOSTS.find(x => x.id === id);
  bulkBuyExp(b.baseCost, b.growth, () => state.boosts[id], n => { state.boosts[id] = n; });
}
function setBuyMode(amt) {
  buyMode = amt;
  document.querySelectorAll('#buy-modes button').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.amt === String(amt)));
  updateUI();
}
function setCustomBuyMode() {
  const seed = (typeof buyMode === 'number' && buyMode >= 100) ? String(buyMode) : '100';
  const input = prompt('How many levels per buy?', seed);
  if (input === null) return;
  const n = Math.max(1, Math.floor(Number(input)));
  if (!isFinite(n) || n <= 0) return;
  buyMode = n;
  const customBtn = document.querySelector('#buy-modes button[data-amt="custom"]');
  customBtn.textContent = '×' + n;
  document.querySelectorAll('#buy-modes button').forEach(btn => btn.classList.toggle('active', btn === customBtn));
  updateUI();
}

// Prestige reward tiers: cubes threshold → stars gained. Highest match wins.
const PRESTIGE_TIERS = [
  { threshold: '1e100000000', stars: 6, label: '1e100M' },
  { threshold: '1e10000000',  stars: 5, label: '1e10M'  },
  { threshold: '1e1000000',   stars: 4, label: '1e1M'   },
  { threshold: '1e100000',    stars: 3, label: '1e100K' },
  { threshold: '1e10000',     stars: 2, label: '1e10K'  },
  { threshold: '1e300',       stars: 1, label: '1e300'  },
];
function doPrestige() {
  if (state.cubes.lt('1e300')) return;
  const tier = PRESTIGE_TIERS.find(t => state.cubes.gte(t.threshold));
  const gain = tier ? tier.stars : 1;
  const bonusMsg = gain > 1
    ? ` — but gain ${gain} prestige stars (${tier.label} bonus)!`
    : ' — but gain a prestige star!';
  if (!confirm('Prestige? You\'ll reset all cubes, upgrades, and buildings' + bonusMsg)) return;
  state.prestige += gain;
  state.cubes = D(0);
  state.total = D(0);
  state.clickLevel = 0;
  state.shinies = 0;
  state.shinyBonus = D(0);
  state.shinyLevel = 0;
  state.autoClicker = 0;
  state.autoRate = 0;
  BUILDINGS.forEach(b => state.buildings[b.id] = 0);
  BOOSTS.forEach(b => state.boosts[b.id] = 0);
  GEAR.forEach(g => state.gear[g.id] = 0);
  autoAcc = 0;
  refreshAutoRate();
  renderPuzzle('3x3');
  toast((gain > 1 ? '⭐'.repeat(gain) + ' +' + gain + ' Prestige! ' : '⭐ Prestige ') + state.prestige + '! Everything reset — can you do it again?');
  updateUI();
  save();
}

function winGame() {
  if (state.prestige < 10) return;
  const nextMult = D(100).pow(state.wins + 1);
  const overlay = document.createElement('div');
  overlay.id = 'win-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(14,14,22,.96);color:#ececf2;text-align:center;padding:20px;z-index:9999;';
  overlay.innerHTML =
      '<h1 style="font-size:3rem;margin-bottom:16px;">🏆 You Win! 🏆</h1>'
    + '<p style="font-size:1.3rem;color:#9a9ab0;">You prestiged ' + state.prestige + ' times and conquered Cube Clicker!</p>'
    + '<p style="font-size:1rem;color:#7c5cff;margin:12px 0 24px;">Restart for a permanent ×100 to everything (total ×' + fmt(nextMult) + ').</p>'
    + '<div style="display:flex;gap:14px;">'
    +   '<button id="win-continue" class="win-btn" style="margin:0;">Continue playing</button>'
    +   '<button id="win-restart"  class="win-btn" style="margin:0;background:linear-gradient(135deg,#d92b2b,#ff7a1a);">Restart (×100 bonus)</button>'
    + '</div>';
  document.body.appendChild(overlay);
  document.getElementById('win-continue').addEventListener('click', () => overlay.remove());
  document.getElementById('win-restart').addEventListener('click', () => {
    if (!confirm('Restart? You\'ll lose all progress but gain a permanent ×100 multiplier (stacking with previous wins).')) return;
    restartFromWin();
    overlay.remove();
  });
}

function restartFromWin() {
  state.wins++;
  state.prestige = 0;
  state.cubes = D(0);
  state.total = D(0);
  state.clickLevel = 0;
  state.shinies = 0;
  state.shinyBonus = D(0);
  state.shinyLevel = 0;
  state.autoClicker = 0;
  state.autoRate = 0;
  BUILDINGS.forEach(b => state.buildings[b.id] = 0);
  BOOSTS.forEach(b => state.boosts[b.id] = 0);
  GEAR.forEach(g => state.gear[g.id] = 0);
  autoAcc = 0;
  refreshAutoRate();
  renderPuzzle('3x3');
  toast('🏆 Win #' + state.wins + '! Permanent ×' + fmt(winMult()) + ' to clicks and auto income.');
  updateUI();
  save();
}

// One click of the cube — manual or automatic. Applies cube/shiny gains, returns what happened.
function clickGain() {
  const type  = PUZZLES[(Math.random() * PUZZLES.length) | 0];
  const shiny = Math.random() < shinyChance();
  let gain = perClick();

  if (shiny) {
    const reward = SHINY[type];
    gain = gain.add(reward);
    state.shinies++;
    state.shinyBonus = cap(state.shinyBonus.add(reward));
    toast(`✨ SHINY ${prettyName(type)}!  +${fmt(reward)} cubes — and +${fmt(reward)}/click & /sec forever! ✨`, 'shiny');
  }

  state.cubes = cap(state.cubes.add(gain));
  state.total = cap(state.total.add(gain));
  return { type, shiny, gain };
}
function handleClick(e) {
  const r = clickGain();
  renderPuzzle(r.type, r.shiny);
  popAnim();
  if (r.shiny) spawnFloat(e.clientX, e.clientY, '✨ +' + fmt(SHINY[r.type]) + ' ✨', 'shiny');
  else         spawnFloat(e.clientX, e.clientY, '+' + fmt(r.gain));
  updateUI();
}
function popAnim() {
  const c = document.getElementById('cube');
  c.classList.remove('pop');
  void c.offsetWidth;          // restart the animation
  c.classList.add('pop');
}
function spawnFloat(x, y, text, cls) {
  const now = performance.now();
  if (!cls && now - lastFloatAt < 80) return;   // throttle ordinary floats; shiny floats always show
  lastFloatAt = now;
  const el = document.createElement('div');
  el.className = 'float' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
function toast(msg, cls) {
  const t = document.createElement('div');
  t.className = 'toast' + (cls ? ' ' + cls : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

/* =================== TICK & SAVE =================== */
function tick() {
  const gain = cps().div(10);     // runs 10× per second
  if (!gain.isFinite()) return;
  state.cubes = cap(state.cubes.add(gain));
  state.total = cap(state.total.add(gain));

  autoAcc += state.autoRate / 10;           // auto-clicker performs real clicks (rate set by slider)
  let last = null, shinyHit = null;
  while (autoAcc >= 1) {
    autoAcc--;
    last = clickGain();
    if (last.shiny) shinyHit = last;
  }
  const show = shinyHit || last;            // prefer showing a shiny if one was hit this tick
  if (show) {                               // redraw the cube calmly — not at the full click rate
    const now = performance.now();
    if (show.shiny || now - autoRenderAt >= 300) {
      autoRenderAt = now;
      renderPuzzle(show.type, show.shiny);
    }
  }

  updateUI();
}

function save() {
  if (resetting) return;
  state.lastSeen = Date.now();
  // Decimals serialize as strings so big values survive a JSON round-trip.
  const data = Object.assign({}, state, {
    cubes:      state.cubes.toString(),
    total:      state.total.toString(),
    shinyBonus: state.shinyBonus.toString(),
  });
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  document.getElementById('save-status').textContent = 'saved ✓';
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d) return;
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
    const dec = v => {
      if (v == null) return D(0);
      try { const r = D(v); return r.isFinite() ? r : D(0); }
      catch (_) { return D(0); }
    };
    state.cubes      = dec(d.cubes);
    state.total      = dec(d.total);
    state.shinyBonus = dec(d.shinyBonus);
    state.clickLevel = num(d.clickLevel);
    state.shinies    = num(d.shinies);
    state.shinyLevel = num(d.shinyLevel);
    state.autoClicker = num(d.autoClicker);
    state.autoRate   = d.autoRate !== undefined ? num(d.autoRate) : num(d.autoClicker);
    state.prestige   = num(d.prestige);
    state.wins       = num(d.wins);
    state.lastSeen   = num(d.lastSeen) || Date.now();
    BUILDINGS.forEach(b =>
      state.buildings[b.id] = num(d.buildings && d.buildings[b.id]));
    BOOSTS.forEach(b =>
      state.boosts[b.id] = num(d.boosts && d.boosts[b.id]));
    GEAR.forEach(g =>
      state.gear[g.id] = num(d.gear && d.gear[g.id]));
  } catch (e) { /* corrupt save: ignore and start fresh */ }
}
function offlineEarnings() {
  const dt = Math.min((Date.now() - state.lastSeen) / 1000, 7200);  // cap 2h
  if (dt > 5 && cps().gt(0)) {
    const earned = cap(cps().mul(dt));
    state.cubes = cap(state.cubes.add(earned));
    state.total = cap(state.total.add(earned));
    toast(`Welcome back! Your solvers earned ${fmt(earned)} cubes while you were away.`);
  }
}

/* =================== INIT =================== */
function init() {
  load();
  offlineEarnings();
  buildShop();
  renderPuzzle('3x3');
  updateUI();

  document.getElementById('cube').addEventListener('click', handleClick);
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      const box = document.getElementById('cube').getBoundingClientRect();
      handleClick({ clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 });
    }
  });
  document.getElementById('secret-emoji').addEventListener('click', () => {
    const bonus = 1e24;
    const rateBonus = 2.5e23;
    state.cubes = cap(state.cubes.add(bonus));
    state.total = cap(state.total.add(bonus));
    state.shinyBonus = cap(state.shinyBonus.add(rateBonus));
    toast('🧩 You found a secret! +1Sp cubes & +250Sx/click & /sec forever!');
    updateUI();
    save();
  });
  document.querySelectorAll('#buy-modes button').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.dataset.amt === 'custom')   setCustomBuyMode();
      else if (btn.dataset.amt === 'max') setBuyMode('max');
      else                                setBuyMode(parseInt(btn.dataset.amt, 10));
    }));
  const arSlider = document.getElementById('auto-rate');
  arSlider.addEventListener('input', () => {
    state.autoRate = parseInt(arSlider.value, 10) || 0;
    document.getElementById('ar-val').textContent = state.autoRate;
  });
  arSlider.addEventListener('change', save);
  refreshAutoRate();
  document.getElementById('prestige-btn').addEventListener('click', doPrestige);
  document.getElementById('win-btn').addEventListener('click', winGame);
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset everything and start over?')) {
      resetting = true;                       // stop autosave/beforeunload from re-writing the save
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  });

  setInterval(tick, 100);
  setInterval(save, 5000);
  window.addEventListener('beforeunload', save);
}
init();

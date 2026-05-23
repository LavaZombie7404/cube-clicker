'use strict';

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
];

const BOOSTS = [
  { id:'dblclick', name:'Double Click Power', desc:'×2 the cubes you earn per click.', baseCost:120,  growth:5 },
  { id:'cf15',     name:'Magnetic Cube',      desc:'+15 cubes every click.',           baseCost:250,  growth:3, clickFlat:15 },
  { id:'cf20',     name:'Flagship Cube',      desc:'+20 cubes every click.',           baseCost:600,  growth:3, clickFlat:20 },
  { id:'dblcps',   name:'Double Auto Income', desc:'×2 the cubes your solvers make.',   baseCost:2500, growth:9 },
  { id:'flow',     name:'Steady Flow',        desc:'+1 cube per second, no clicking.',  baseCost:200,  growth:4 },
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

let state = { cubes:0, total:0, clickLevel:0, shinies:0, shinyBonus:0, shinyLevel:0, autoClicker:0, autoRate:0, buildings:{}, boosts:{}, gear:{}, lastSeen:Date.now() };
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
const gearCost     = g  => Math.floor(g.baseCost * Math.pow(1.15, state.gear[g.id]));
const perClick     = () => (1 + 2 * state.clickLevel + clickFlat() + gearFlat() + state.shinyBonus) * Math.pow(2, state.boosts.dblclick);
const clickCost    = () => Math.floor(15 * Math.pow(1.4, state.clickLevel));
const buildingCost = b  => Math.floor(b.baseCost * Math.pow(1.15, state.buildings[b.id]));
const boostCost    = b  => Math.floor(b.baseCost * Math.pow(b.growth, state.boosts[b.id]));
const baseCps      = () => BUILDINGS.reduce((s, b) => s + b.cps * state.buildings[b.id], 0);
const cps          = () => (baseCps() + state.boosts.flow + state.shinyBonus) * Math.pow(2, state.boosts.dblcps);
const shinyChance  = () => SHINY_CHANCE + state.shinyLevel * 0.01;
const autoClickerCost = () => Math.floor(AC_BASE * Math.pow(1.6, state.autoClicker));

/* =================== HELPERS =================== */
function fmt(n) {
  n = Math.floor(n * 10) / 10;
  if (n < 1000) return (n % 1 === 0 ? String(n) : n.toFixed(1));
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return n.toFixed(2).replace(/\.?0+$/, '') + units[i];
}
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

function updateUI() {
  document.getElementById('cube-count').textContent = fmt(state.cubes);
  document.getElementById('per-second').textContent = fmt(cps());
  document.getElementById('per-click').textContent  = fmt(perClick());
  document.getElementById('shiny-count').textContent = state.shinies;

  document.getElementById('su-cost').textContent = fmt(SHINY_UP_COST);
  document.getElementById('shiny-lvl').textContent =
    'Level ' + state.shinyLevel + '  ·  now ' + (shinyChance() * 100).toFixed(2) + '%';
  toggleCard(document.getElementById('shiny-up'),
             document.getElementById('su-cost'), state.cubes >= SHINY_UP_COST);

  const acC = autoClickerCost();
  document.getElementById('ac-cost').textContent  = fmt(acC);
  document.getElementById('ac-owned').textContent = state.autoClicker;
  document.getElementById('ac-rate').textContent  = state.autoClicker;
  toggleCard(document.getElementById('auto-clicker'),
             document.getElementById('ac-cost'), state.cubes >= acC);

  const cc = clickCost();
  document.getElementById('cu-cost').textContent  = fmt(cc);
  document.getElementById('cu-owned').textContent = 'Level ' + state.clickLevel;
  toggleCard(document.getElementById('click-upgrade'),
             document.getElementById('cu-cost'), state.cubes >= cc);

  BOOSTS.forEach(b => {
    const c = boostCost(b);
    document.getElementById('bcost-' + b.id).textContent  = fmt(c);
    document.getElementById('bought-' + b.id).textContent = state.boosts[b.id];
    toggleCard(document.getElementById('boost-' + b.id),
               document.getElementById('bcost-' + b.id), state.cubes >= c);
  });

  GEAR.forEach(g => {
    const c = gearCost(g);
    document.getElementById('gcost-' + g.id).textContent  = fmt(c);
    document.getElementById('gowned-' + g.id).textContent = state.gear[g.id];
    toggleCard(document.getElementById('gear-' + g.id),
               document.getElementById('gcost-' + g.id), state.cubes >= c);
  });

  BUILDINGS.forEach(b => {
    const c = buildingCost(b);
    document.getElementById('cost-' + b.id).textContent  = fmt(c);
    document.getElementById('owned-' + b.id).textContent = state.buildings[b.id];
    toggleCard(document.getElementById('b-' + b.id),
               document.getElementById('cost-' + b.id), state.cubes >= c);
  });
}

/* =================== ACTIONS =================== */
function bulkBuy(costFn, applyFn) {
  const limit = buyMode === 'max' ? Infinity : buyMode;
  let bought = 0;
  while (bought < limit && state.cubes >= costFn()) {
    state.cubes -= costFn();
    applyFn();
    bought++;
  }
  if (bought) { updateUI(); save(); }
}
function buyClick() {
  bulkBuy(clickCost, () => state.clickLevel++);
}
function buyShinyUp() {
  bulkBuy(() => SHINY_UP_COST, () => state.shinyLevel++);
}
function buyAutoClicker() {
  const before = state.autoClicker;
  bulkBuy(autoClickerCost, () => state.autoClicker++);
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
  bulkBuy(() => buildingCost(b), () => state.buildings[id]++);
}
function buyGear(id) {
  const g = GEAR.find(x => x.id === id);
  bulkBuy(() => gearCost(g), () => state.gear[id]++);
}
function buyBoost(id) {
  const b = BOOSTS.find(x => x.id === id);
  bulkBuy(() => boostCost(b), () => state.boosts[id]++);
}
function setBuyMode(amt) {
  buyMode = amt;
  document.querySelectorAll('#buy-modes button').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.amt === String(amt)));
}

// One click of the cube — manual or automatic. Applies cube/shiny gains, returns what happened.
function clickGain() {
  const type  = PUZZLES[(Math.random() * PUZZLES.length) | 0];
  const shiny = Math.random() < shinyChance();
  let gain = perClick();

  if (shiny) {
    const reward = SHINY[type];
    gain += reward;
    state.shinies++;
    state.shinyBonus += reward;          // permanent: +reward to /click and /sec forever
    toast(`✨ SHINY ${prettyName(type)}!  +${fmt(reward)} cubes — and +${fmt(reward)}/click & /sec forever! ✨`, 'shiny');
  }

  state.cubes += gain;
  state.total += gain;
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
  const gain = cps() / 10;        // runs 10× per second
  state.cubes += gain;
  state.total += gain;

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
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  document.getElementById('save-status').textContent = 'saved ✓';
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d) return;
    state.cubes      = d.cubes || 0;
    state.total      = d.total || 0;
    state.clickLevel = d.clickLevel || 0;
    state.shinies    = d.shinies || 0;
    state.shinyBonus = d.shinyBonus || 0;
    state.shinyLevel = d.shinyLevel || 0;
    state.autoClicker = d.autoClicker || 0;
    state.autoRate   = d.autoRate !== undefined ? d.autoRate : (d.autoClicker || 0);
    state.lastSeen   = d.lastSeen || Date.now();
    BUILDINGS.forEach(b =>
      state.buildings[b.id] = (d.buildings && d.buildings[b.id]) || 0);
    BOOSTS.forEach(b =>
      state.boosts[b.id] = (d.boosts && d.boosts[b.id]) || 0);
    GEAR.forEach(g =>
      state.gear[g.id] = (d.gear && d.gear[g.id]) || 0);
  } catch (e) { /* corrupt save: ignore and start fresh */ }
}
function offlineEarnings() {
  const dt = Math.min((Date.now() - state.lastSeen) / 1000, 7200);  // cap 2h
  if (dt > 5 && cps() > 0) {
    const earned = cps() * dt;
    state.cubes += earned;
    state.total += earned;
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
  document.querySelectorAll('#buy-modes button').forEach(btn =>
    btn.addEventListener('click', () =>
      setBuyMode(btn.dataset.amt === 'max' ? 'max' : parseInt(btn.dataset.amt, 10))));
  const arSlider = document.getElementById('auto-rate');
  arSlider.addEventListener('input', () => {
    state.autoRate = parseInt(arSlider.value, 10) || 0;
    document.getElementById('ar-val').textContent = state.autoRate;
  });
  arSlider.addEventListener('change', save);
  refreshAutoRate();
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

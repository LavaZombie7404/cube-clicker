'use strict';

/* =================== DATA =================== */
const COLORS  = ['#f5f5f5', '#ffd500', '#d92b2b', '#ff7a1a', '#2b6fd9', '#28a745'];
const CUBES   = ['2x2', '3x3', '4x4', '5x5', '6x6', '7x7'];
const PUZZLES = [...CUBES, 'pyraminx', 'megaminx', 'sq1'];

const SHINY_COLORS = ['#ffd24a', '#ffc21a', '#ffe07a', '#f5b700'];
const SHINY_CHANCE = 0.1;                                 // TEMP testing: 1 in 10 (real value: 0.0025 = 1 in 400)
const SHINY = {
  '2x2': 500000,  '3x3': 1200000, '4x4': 2500000,
  '5x5': 4500000, '6x6': 7000000, '7x7': 10000000,
  pyraminx: 800000, megaminx: 6000000, sq1: 1800000,
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

const SAVE_KEY = 'cubeClickerSave';

let state = { cubes:0, total:0, clickLevel:0, shinies:0, buildings:{}, boosts:{}, lastSeen:Date.now() };
BUILDINGS.forEach(b => state.buildings[b.id] = 0);
BOOSTS.forEach(b => state.boosts[b.id] = 0);

/* =================== DERIVED VALUES =================== */
const clickFlat    = () => BOOSTS.reduce((s, b) => s + (b.clickFlat || 0) * state.boosts[b.id], 0);
const perClick     = () => (1 + 2 * state.clickLevel + clickFlat()) * Math.pow(2, state.boosts.dblclick);
const clickCost    = () => Math.floor(15 * Math.pow(1.4, state.clickLevel));
const buildingCost = b  => Math.floor(b.baseCost * Math.pow(1.15, state.buildings[b.id]));
const boostCost    = b  => Math.floor(b.baseCost * Math.pow(b.growth, state.boosts[b.id]));
const baseCps      = () => BUILDINGS.reduce((s, b) => s + b.cps * state.buildings[b.id], 0);
const cps          = () => (baseCps() + state.boosts.flow) * Math.pow(2, state.boosts.dblcps);

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

function prettyName(t) {
  if (CUBES.includes(t)) return t.replace('x', '×');
  return { pyraminx: 'Pyraminx', megaminx: 'Megaminx', sq1: 'Square-1' }[t];
}
function renderPuzzle(type, shiny) {
  const pal = shiny ? SHINY_COLORS : COLORS;
  document.getElementById('cube-svg').innerHTML =
    CUBES.includes(type) ? isoCube(parseInt(type, 10), pal, shiny) : flatPuzzle(type, pal, shiny);
  const nameEl = document.getElementById('puzzle-name');
  nameEl.textContent = (shiny ? '✨ Shiny ' : '') + prettyName(type);
  nameEl.classList.toggle('shiny', !!shiny);
  document.getElementById('cube').classList.toggle('shiny', !!shiny);
}

/* =================== SHOP UI =================== */
function buildShop() {
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

  BUILDINGS.forEach(b => {
    const c = buildingCost(b);
    document.getElementById('cost-' + b.id).textContent  = fmt(c);
    document.getElementById('owned-' + b.id).textContent = state.buildings[b.id];
    toggleCard(document.getElementById('b-' + b.id),
               document.getElementById('cost-' + b.id), state.cubes >= c);
  });
}

/* =================== ACTIONS =================== */
function buyClick() {
  const c = clickCost();
  if (state.cubes < c) return;
  state.cubes -= c;
  state.clickLevel++;
  updateUI();
  save();
}
function buyBuilding(id) {
  const b = BUILDINGS.find(x => x.id === id);
  const c = buildingCost(b);
  if (state.cubes < c) return;
  state.cubes -= c;
  state.buildings[id]++;
  updateUI();
  save();
}
function buyBoost(id) {
  const b = BOOSTS.find(x => x.id === id);
  const c = boostCost(b);
  if (state.cubes < c) return;
  state.cubes -= c;
  state.boosts[id]++;
  updateUI();
  save();
}

function handleClick(e) {
  const type  = PUZZLES[(Math.random() * PUZZLES.length) | 0];
  const shiny = Math.random() < SHINY_CHANCE;
  let gain = perClick();
  if (shiny) gain += SHINY[type];

  state.cubes += gain;
  state.total += gain;
  if (shiny) state.shinies++;

  renderPuzzle(type, shiny);
  popAnim();

  if (shiny) {
    spawnFloat(e.clientX, e.clientY, '✨ +' + fmt(SHINY[type]) + ' ✨', 'shiny');
    toast(`✨ SHINY ${prettyName(type)}!  +${fmt(SHINY[type])} cubes! ✨`, 'shiny');
  } else {
    spawnFloat(e.clientX, e.clientY, '+' + fmt(gain));
  }
  updateUI();
}
function popAnim() {
  const c = document.getElementById('cube');
  c.classList.remove('pop');
  void c.offsetWidth;          // restart the animation
  c.classList.add('pop');
}
function spawnFloat(x, y, text, cls) {
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
  updateUI();
}

function save() {
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
    state.lastSeen   = d.lastSeen || Date.now();
    BUILDINGS.forEach(b =>
      state.buildings[b.id] = (d.buildings && d.buildings[b.id]) || 0);
    BOOSTS.forEach(b =>
      state.boosts[b.id] = (d.boosts && d.boosts[b.id]) || 0);
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
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset everything and start over?')) {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  });

  setInterval(tick, 100);
  setInterval(save, 5000);
  window.addEventListener('beforeunload', save);
}
init();

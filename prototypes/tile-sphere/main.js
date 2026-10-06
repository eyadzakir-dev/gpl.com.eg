// Tile-sphere home prototype: boots the WebGL scene after first paint and maps scroll to the story.
// Story (motion + WebGL2): hero sphere assembles from the wordmark's green full stop -> migrates onto a globe in
// the routes figure -> Egypt and its ports -> west lanes -> east lanes -> overview -> collapses into one point.
// Otherwise (.ts--flat): the SVG mark and the flat route diagram stay, and nothing heavy is downloaded.
import { ORIGINS, PIN_PLACES } from '../../assets/js/globe/globe-data.js';

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const NARROW = matchMedia('(max-width: 899px)');
const DEG = Math.PI / 180;
const MAX_DT = 0.05;
const DAMPING = 5.5;
const INTRO_SECONDS = 2.8;
const INTRO_END = 1.32;
const SPIN_RATE = (18 * DEG) / 16;
const GLINT = { period: 7, sweep: 1.8 };
const ORB_FILL = 0.98;
const FIG_FILL = { wide: 0.78, narrow: 0.8 };
const PIN_MIN_Z = 0.12;
const PIN_PAD = 4;
const HUD_BAND = 30;

// Story keyframes, one value per chapter (0 hero, 1 one point, 2 ports, 3 west, 4 east, 5 overview, 6 collapse).
const KEYS = {
  morph: [0, 1, 1, 1, 1, 1, 1],
  dock: [0, 1, 1, 1, 1, 1, 1],
  lon: [31, 31, 31, -14, 66, 31, 30],
  tilt: [24, 24, 28, 36, 17, 24, 28],
  zoom: [1, 1, 1.95, 1.18, 1.16, 1, 1],
  egypt: [0, 0.2, 1, 1, 1, 1, 1],
  mute: [0, 0, 0.32, 0.3, 0.3, 0.26, 0.26],
  ocean: [0, 1, 1, 1, 1, 1, 0],
  origins: [0, 0, 1, 1, 1, 1, 0],
  collapse: [0, 0, 0, 0, 0, 0, 1],
};
// Lane draw windows on the eased chapter value, per region (order matches sphere.js REGIONS).
const DRAW = {
  northEurope: [2.4, 3.0], westMed: [2.3, 2.8], eastMed: [2.25, 2.65], usEast: [2.5, 3.05],
  china: [3.3, 3.95], india: [3.3, 3.85], gulf: [3.45, 4.0],
};
const PIN_DIRS = { e: 0, ne: -45, n: -90, nw: -135, w: 180, sw: 135, s: 90, se: 45 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const keyAt = (values, c) => {
  const i = clamp(Math.floor(c), 0, values.length - 1);
  const j = Math.min(values.length - 1, i + 1);
  return lerp(values[i], values[j], c - i);
};

function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function afterFirstPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/* ---------- Scroll -> chapter float ---------- */

// Desktop: a chapter is "on" when its centre meets the viewport centre. Narrow: when its top meets the bottom
// of the sticky globe figure, so the card is read just below the globe.
function measureChapters(chapters, fig) {
  const vh = window.innerHeight;
  const figBottom = (parseFloat(getComputedStyle(fig).top) || 0) + fig.offsetHeight + 16;
  return chapters.map((el) => {
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    return NARROW.matches ? top - figBottom : top + rect.height / 2 - vh / 2;
  });
}

function chapterAt(stops, y) {
  if (y <= 0) return 0;
  let prev = 0;
  for (let k = 0; k < stops.length; k++) {
    if (y < stops[k]) return k + (y - prev) / Math.max(1, stops[k] - prev);
    prev = stops[k];
  }
  return stops.length;
}

// Each chapter holds still for the first and last 12% of its scroll span; motion happens in between.
const easeChapter = (c) => Math.floor(c) + smooth(0.12, 0.88, c - Math.floor(c));

/* ---------- Pins ---------- */

function createPins(layer) {
  return [...layer.querySelectorAll('.ts-pin[data-pin]')].map((el) => ({
    el,
    key: el.dataset.pin,
    place: PIN_PLACES[el.dataset.pin],
    origin: el.classList.contains('ts-pin--origin'),
    tag: el.querySelector('.ts-pin__tag'),
    dirs: (el.dataset.dirs || 'e').split(/\s+/).filter((d) => d in PIN_DIRS),
    lead: Number(el.dataset.lead) || 0,
    dir: null,
    w: 0,
    h: 0,
  }));
}

function measurePins(pins) {
  pins.forEach((pin) => { pin.w = pin.tag.offsetWidth; pin.h = pin.tag.offsetHeight; });
}

function tagRect(pin, p, dir, lead) {
  const ang = PIN_DIRS[dir];
  const ux = Math.cos(ang * DEG), uy = Math.sin(ang * DEG);
  let tx = ux * lead - pin.w / 2, ty = uy * lead - pin.h / 2;
  if (ux > 0.3) tx = ux * lead + 2;
  if (ux < -0.3) tx = ux * lead - pin.w - 2;
  if (uy < -0.3) ty = uy * lead - pin.h;
  if (uy > 0.3) ty = uy * lead;
  return { dir, ang, tx, ty, left: p.x + tx, top: p.y + ty, right: p.x + tx + pin.w, bottom: p.y + ty + pin.h };
}

const overlaps = (a, b) => a.left < b.right + PIN_PAD && b.left < a.right + PIN_PAD && a.top < b.bottom + PIN_PAD && b.top < a.bottom + PIN_PAD;

// Greedy layout: keep the current side while it fits, otherwise take the first listed side that fits.
function choosePinRect(pin, p, lead, placed, bounds) {
  const inBounds = (r) => r.left >= bounds.left && r.right <= bounds.right && r.top >= bounds.top && r.bottom <= bounds.bottom;
  const order = pin.dir ? [pin.dir, ...pin.dirs.filter((d) => d !== pin.dir)] : pin.dirs;
  const rects = order.map((dir) => tagRect(pin, p, dir, lead));
  const best = rects.find((r) => inBounds(r) && !placed.some((q) => overlaps(r, q)));
  // Alexandria (the head office port) always keeps a tag, even if it has to overlap another one.
  return best || (pin.key === 'alex' ? rects.find(inBounds) || null : null);
}

function applyPin(pin, p, rect, lead) {
  pin.el.classList.toggle('is-on', Boolean(rect));
  if (!rect) return;
  pin.dir = rect.dir;
  pin.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  pin.el.style.setProperty('--tx', `${rect.tx.toFixed(1)}px`);
  pin.el.style.setProperty('--ty', `${rect.ty.toFixed(1)}px`);
  pin.el.style.setProperty('--lead', `${lead}px`);
  pin.el.style.setProperty('--ang', `${rect.ang}deg`);
}

/* ---------- Story ---------- */

function mountStory(root, api) {
  const canvas = root.querySelector('.ts__canvas');
  const orb = root.querySelector('[data-ts-orb]');
  const fig = root.querySelector('[data-ts-slot]');
  const over = root.querySelector('[data-ts-over]');
  const dot = root.querySelector('[data-ts-dot]');
  const count = root.querySelector('[data-ts-count]');
  const coord = root.querySelector('[data-ts-coord]');
  const chapterLabel = root.querySelector('[data-ts-chapter]');
  const point = root.querySelector('[data-ts-point]');
  const chapters = [...root.querySelectorAll('.ts-ch[data-ch]')];
  const pins = createPins(over);
  // The logo's C-shaped cut for the wordmark is on by default; ?cut=0 shows the full sphere, slowly turning.
  const cut = new URLSearchParams(location.search).get('cut') === '0' ? 0 : 1;
  const state = { c: 0, target: 0, time: 0, intro: 0, introDone: false, visible: false, raf: 0, last: 0, stops: [], active: -1 };
  const regionIndex = Object.fromEntries(api.regions.map((key, i) => [key, i]));
  const draw = api.regions.map(() => 0);
  let canvasRect = canvas.getBoundingClientRect();

  const relayout = () => {
    canvasRect = canvas.getBoundingClientRect();
    api.resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight));
    state.stops = measureChapters(chapters, fig);
    measurePins(pins);
  };

  const box = (el, fill) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - canvasRect.left, y: r.top - canvasRect.top, w: r.width, h: r.height, cx: r.left - canvasRect.left + r.width / 2, cy: r.top - canvasRect.top + r.height / 2, r: (Math.min(r.width, r.height) / 2) * fill };
  };

  function frameState(dt) {
    state.target = chapterAt(state.stops, window.scrollY);
    state.c += (state.target - state.c) * (1 - Math.exp(-DAMPING * dt));
    if (Math.abs(state.target - state.c) < 1e-4) state.c = state.target;
    const c = easeChapter(state.c);
    const hero = box(orb, ORB_FILL);
    const slot = box(fig, NARROW.matches ? FIG_FILL.narrow : FIG_FILL.wide);
    const dock = smooth(0, 1, keyAt(KEYS.dock, c));
    const zoom = keyAt(KEYS.zoom, c);
    const s = {
      cx: lerp(hero.cx, slot.cx, dock),
      cy: lerp(hero.cy, slot.cy, dock),
      r: lerp(hero.r, slot.r * zoom, dock),
      lon: keyAt(KEYS.lon, c),
      tilt: keyAt(KEYS.tilt, c),
      morph: keyAt(KEYS.morph, c),
      egypt: keyAt(KEYS.egypt, c),
      mute: keyAt(KEYS.mute, c),
      ocean: keyAt(KEYS.ocean, c) * smooth(0.55, 1, keyAt(KEYS.morph, c)),
      collapse: keyAt(KEYS.collapse, c),
      cut,
      spin: cut ? 0 : state.time * SPIN_RATE,
      intro: state.intro,
      draw,
      clip: dock > 0.995 ? { x: slot.x + 1, y: slot.y + 1, w: slot.w - 2, h: slot.h - 2 } : null,
    };
    const glintT = (state.time % GLINT.period) / GLINT.sweep;
    s.glint = state.introDone && glintT < 1 ? lerp(-0.3, 1.3, glintT) : -1;
    s.glint = s.morph > 0.02 ? -1 : s.glint;
    api.regions.forEach((key, i) => { draw[i] = smooth(DRAW[key][0], DRAW[key][1], c); });
    s.lanes = smooth(2.15, 2.35, c) * (1 - smooth(0, 0.6, s.collapse));
    const dotRect = dot.getBoundingClientRect();
    s.dot = [
      (dotRect.left - canvasRect.left + dotRect.width / 2 - hero.cx) / hero.r,
      -(dotRect.top - canvasRect.top + dotRect.height * 0.72 - hero.cy) / hero.r,
      1.3,
    ];
    const alex = api.project(ORIGINS.alex.lat, ORIGINS.alex.lon, s);
    s.point = alex.v.map((v) => v * 1.01);
    return { s, c, slot };
  }

  function updateOverlay({ s, c, slot }) {
    const origins = keyAt(KEYS.origins, c);
    const bounds = { left: 8, top: HUD_BAND, right: slot.w - 8, bottom: slot.h - HUD_BAND };
    const projected = pins.map((pin) => {
      const p = api.project(pin.place.lat, pin.place.lon, s);
      const local = { x: p.x - slot.x, y: p.y - slot.y };
      const wanted = pin.origin ? origins > 0.6 && s.morph > 0.99 : s.lanes > 0.6 && draw[regionIndex[pin.key]] > 0.97;
      const inside = local.x > bounds.left && local.x < bounds.right && local.y > bounds.top && local.y < bounds.bottom;
      return { pin, local, on: wanted && p.z > PIN_MIN_Z && inside };
    });
    const placed = projected.filter((q) => q.on).map(({ local }) => ({ left: local.x - 5, right: local.x + 5, top: local.y - 5, bottom: local.y + 5 }));
    projected.forEach(({ pin, local, on }) => {
      const lead = Math.round((pin.lead || (pin.origin ? 24 : 12)) * (NARROW.matches ? 0.7 : 1));
      const rect = on ? choosePinRect(pin, local, lead, placed, bounds) : null;
      if (rect) placed.push(rect);
      else pin.dir = null;
      applyPin(pin, local, rect, lead);
    });
    const alex = api.project(ORIGINS.alex.lat, ORIGINS.alex.lon, s);
    const pointOn = s.collapse > 0.85;
    point.classList.toggle('is-on', pointOn);
    if (pointOn) {
      point.style.transform = `translate(${(alex.x - slot.x).toFixed(1)}px, ${(alex.y - slot.y).toFixed(1)}px)`;
      point.style.setProperty('--s', `${(10 + 8 * smooth(0.85, 1, s.collapse)).toFixed(1)}px`);
    }
    coord.textContent = `View ${s.tilt.toFixed(1)}°N · ${Math.abs(s.lon).toFixed(1)}°${s.lon < 0 ? 'W' : 'E'}`;
    const active = clamp(Math.round(state.c), 0, chapters.length);
    if (active !== state.active) {
      state.active = active;
      chapters.forEach((el, i) => el.classList.toggle('is-active', i + 1 === active || (active === 0 && i === 0)));
      chapterLabel.textContent = chapters[Math.max(0, active - 1)].dataset.label;
    }
  }

  function updateIntro(dt) {
    if (state.introDone) return;
    if (state.intro === 0) dot.classList.add('is-emit');
    state.intro = Math.min(INTRO_END, state.intro + (dt / INTRO_SECONDS) * INTRO_END);
    const landed = Math.round(api.counts.logo * smooth(0.05, INTRO_END, state.intro));
    count.textContent = `${landed.toLocaleString('en-US')} tiles · 20 × 10 lattice`;
    if (state.intro >= INTRO_END) state.introDone = true;
  }

  function frame(dt) {
    state.time += dt;
    updateIntro(dt);
    const f = frameState(dt);
    api.render(f.s);
    updateOverlay(f);
  }

  const tick = (now) => {
    state.raf = requestAnimationFrame(tick);
    const dt = state.last ? Math.min(MAX_DT, (now - state.last) / 1000) : 0;
    state.last = now;
    frame(dt);
  };
  const sync = () => {
    const run = state.visible && !document.hidden;
    canvas.classList.toggle('is-on', state.visible);
    if (run && !state.raf) { state.last = 0; state.raf = requestAnimationFrame(tick); }
    if (!run && state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  };
  const io = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; sync(); });
  const ro = new ResizeObserver(relayout);
  const onContextLost = (event) => { event.preventDefault(); destroy(); root.classList.add('ts--flat'); };

  function destroy() {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    api.dispose();
    root.classList.remove('is-story', 'is-gl');
  }

  // A visitor who lands mid-page (reload, anchor) skips the fly-in.
  if (window.scrollY > window.innerHeight * 0.6) { state.intro = INTRO_END; state.introDone = true; }
  relayout();
  state.c = state.target = chapterAt(state.stops, window.scrollY);
  root.classList.add('is-gl');
  ro.observe(root);
  ro.observe(canvas);
  io.observe(root);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', onContextLost);
  document.fonts?.ready.then(relayout);
  window.addEventListener('load', relayout, { once: true });
  frame(0);
  return { destroy, state };
}

async function boot() {
  const root = document.querySelector('[data-ts]');
  if (!root) return;
  if (REDUCED_MOTION.matches || !hasWebGL2()) {
    root.classList.add('ts--flat');
    return;
  }
  root.classList.add('is-story');
  await afterFirstPaint();
  try {
    const { createTileSphere } = await import('./sphere.js');
    const api = createTileSphere(root.querySelector('.ts__canvas'), { narrow: NARROW.matches, themeEl: root });
    root.tileSphere = mountStory(root, api);
  } catch (error) {
    root.classList.remove('is-story', 'is-gl');
    root.classList.add('ts--flat');
    console.warn('Tile sphere unavailable; keeping the SVG mark and flat diagram.', error);
  }
}

boot();

// Tile-sphere controller shared by the home page (mode "hero") and the network page (mode "story").
// hero:  tiles stream out of the wordmark's green full stop and assemble the GPL logo sphere beside it; the sphere
//        then idles with a slow turn (Pause button) and scrolls away with the hero. Nothing morphs.
// story: the same hero sphere migrates onto a tile globe in the routes figure as the chapters scroll past: Egypt
//        and its ports, lanes west, lanes east, an overview, then a collapse into one green point at Alexandria.
// The SVG mark is on screen first. three.js and the scene load only after first paint and engagement (or idle), and
// only with motion, WebGL2 without a performance caveat and no Save-Data; otherwise, or if the context is lost, the
// root gets .ts--flat.
// Home only: with a `flight` (assets/js/home/orb-flight.js) the hero canvas is fixed, the sphere rests at the flight's
// hero spot and its tiles take the flight's per-tile affines as they come apart and reassemble in the "GPL at a
// glance." bullet; the flight also says when the sphere can sleep.
// Strings (count, pause, play, view, east, west) come from the page's strings block; chapter labels are HTML.

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
const NARROW = matchMedia("(max-width: 899px)");
const DEG = Math.PI / 180;
const MAX_DT = 0.05;
const DAMPING = 5.5;
const INTRO_SECONDS = 2.8;
const INTRO_END = 1.32;
const GLINT = { period: 7, sweep: 1.8 };
const IDLE_TURN = { amplitude: 12 * DEG, period: 18 };
// Home flight: the idle turn settles into the logo's orientation over the first stretch of scroll, before any tile
// lifts off; a sphere that mounts mid-flight skips its fly-in.
const FLIGHT_SETTLE = 0.03;
const FLIGHT_SKIPS_INTRO = 0.02;
const ORB_FILL = 0.98;
const FIG_FILL = { wide: 0.78, narrow: 0.8 };
const PIN_MIN_Z = 0.12;
const PIN_PAD = 4;
const HUD_BAND = 30;
const IDLE_TIMEOUT_MS = 1200;
const LOAD_FALLBACK_MS = 4000;

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
const fill = (template, values) => String(template ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
const keyAt = (values, c) => {
  const i = clamp(Math.floor(c), 0, values.length - 1);
  const j = Math.min(values.length - 1, i + 1);
  return lerp(values[i], values[j], c - i);
};

let fastWebGL2 = null;

function hasFastWebGL2() {
  if (fastWebGL2 !== null) return fastWebGL2;
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    fastWebGL2 = Boolean(gl);
  } catch {
    fastWebGL2 = false;
  }
  return fastWebGL2;
}

// The WebGL sphere runs only with motion, no Save-Data and WebGL2 without a performance caveat.
function isSphereSupported() {
  return !REDUCED_MOTION.matches && navigator.connection?.saveData !== true && hasFastWebGL2();
}

// three.js is ~690 KB, so the scene waits until after first paint and for a sign of engagement (pointer, key, touch,
// wheel or scroll), or a few idle seconds after load. The SVG mark stands in until then, and the first view stays fast.
// Touch-first devices skip the idle fallback: parsing three.js on a phone CPU blocks the main thread for seconds.
const CAN_PRELOAD_ON_IDLE = window.matchMedia("(pointer: fine)").matches;

function whenEngaged() {
  return new Promise((resolve) => {
    const events = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel", "scroll"];
    let isDone = false;
    const go = () => {
      if (isDone) return;
      isDone = true;
      events.forEach((type) => window.removeEventListener(type, go));
      resolve();
    };
    const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: IDLE_TIMEOUT_MS }) : go());
    const fallback = () => setTimeout(idle, LOAD_FALLBACK_MS);
    requestAnimationFrame(() => setTimeout(() => {
      events.forEach((type) => window.addEventListener(type, go, { passive: true }));
      if (!CAN_PRELOAD_ON_IDLE) return;
      if (document.readyState === "complete") fallback();
      else window.addEventListener("load", fallback, { once: true });
    }, 0));
  });
}

/* ---------- Scroll -> chapter float (story) ---------- */

// Desktop: a chapter is "on" when its centre meets the viewport centre. Narrow: when its top meets the bottom of the
// sticky globe figure, so the card is read just below the globe.
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

/* ---------- Pins (story) ---------- */

function createPins(layer, places) {
  if (!layer) return [];
  return [...layer.querySelectorAll(".ts-pin[data-pin]")].map((el) => ({
    el,
    key: el.dataset.pin,
    place: places[el.dataset.pin],
    origin: el.classList.contains("ts-pin--origin"),
    tag: el.querySelector(".ts-pin__tag"),
    dirs: (el.dataset.dirs || "e").split(/\s+/).filter((d) => d in PIN_DIRS),
    lead: Number(el.dataset.lead) || 0,
    dir: null,
    w: 0,
    h: 0,
  })).filter((pin) => pin.place);
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
  return best || (pin.key === "alex" ? rects.find(inBounds) || null : null);
}

function applyPin(pin, p, rect, lead) {
  pin.el.classList.toggle("is-on", Boolean(rect));
  if (!rect) return;
  pin.dir = rect.dir;
  pin.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  pin.el.style.setProperty("--tx", `${rect.tx.toFixed(1)}px`);
  pin.el.style.setProperty("--ty", `${rect.ty.toFixed(1)}px`);
  pin.el.style.setProperty("--lead", `${lead}px`);
  pin.el.style.setProperty("--ang", `${rect.ang}deg`);
}

/* ---------- Mount ---------- */

function mount(root, api, { mode, strings, places, origins, flight }) {
  const isStory = mode === "story";
  const canvas = root.querySelector(".ts__canvas");
  const orb = root.querySelector("[data-ts-orb]");
  const dot = root.querySelector("[data-ts-dot]");
  const count = root.querySelector("[data-ts-count]");
  const pause = root.querySelector("[data-ts-pause]");
  const fig = root.querySelector("[data-ts-slot]");
  const coord = root.querySelector("[data-ts-coord]");
  const chapterLabel = root.querySelector("[data-ts-chapter]");
  const point = root.querySelector("[data-ts-point]");
  const chapters = [...root.querySelectorAll(".ts-ch[data-ch]")];
  const pins = isStory ? createPins(root.querySelector("[data-ts-over]"), places) : [];
  const regionIndex = Object.fromEntries(api.regions.map((key, i) => [key, i]));
  const draw = api.regions.map(() => 0);
  const format = new Intl.NumberFormat(strings.locale || document.documentElement.lang || "en").format;
  const state = {
    c: 0, target: 0, time: 0, idle: 0, intro: 0, introDone: false, visible: false, inView: false, paused: false,
    raf: 0, last: 0, stops: [], active: -1, coordText: "",
  };
  const isFlying = () => Boolean(flight?.isEnabled());
  let canvasRect = canvas.getBoundingClientRect();

  const relayout = () => {
    canvasRect = canvas.getBoundingClientRect();
    api.resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight));
    if (isStory) {
      state.stops = measureChapters(chapters, fig);
      measurePins(pins);
    }
  };

  const box = (el, scale) => {
    const r = el.getBoundingClientRect();
    const x = r.left - canvasRect.left, y = r.top - canvasRect.top;
    return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2, r: (Math.min(r.width, r.height) / 2) * scale };
  };

  // Home hero with the flight: the sphere rests at the flight's hero spot (viewport px), which holds on screen.
  const heroBox = () => {
    const spot = isFlying() ? flight.frame() : null;
    if (!spot) return box(orb, ORB_FILL);
    return { cx: spot.x - canvasRect.left, cy: spot.y - canvasRect.top, r: (spot.size / 2) * ORB_FILL };
  };

  // In flight the tiles take the flight's affines (swarm). The sphere first settles into the logo's own orientation
  // (no idle turn, no glint), so its tiles leave from, and land in, the same lattice as the SVG mark's.
  function heroState(hero) {
    const glintT = (state.idle % GLINT.period) / GLINT.sweep;
    const p = isFlying() ? flight.frame()?.p ?? 0 : 0;
    const settle = smooth(0, FLIGHT_SETTLE, p);
    const idleYaw = state.introDone ? Math.sin((state.idle / IDLE_TURN.period) * Math.PI * 2) * IDLE_TURN.amplitude : 0;
    return {
      cx: hero.cx, cy: hero.cy, r: hero.r, morph: 0, cut: 1, spin: 0, intro: state.intro,
      yaw: idleYaw * (1 - settle),
      glint: state.introDone && p === 0 && glintT < 1 ? lerp(-0.3, 1.3, glintT) : -1,
      lanes: 0, ocean: 0, collapse: 0, egypt: 0, mute: 0,
      swarm: p > 0 ? flight.swarmUniforms(ORB_FILL) : null,
    };
  }

  function storyState(hero) {
    state.target = chapterAt(state.stops, window.scrollY);
    const c = easeChapter(state.c);
    // The figure's box is read before canvasRect moves (the story canvas is fixed, so it never does).
    const slot = box(fig, NARROW.matches ? FIG_FILL.narrow : FIG_FILL.wide);
    const dock = smooth(0, 1, keyAt(KEYS.dock, c));
    const zoom = keyAt(KEYS.zoom, c);
    const morph = keyAt(KEYS.morph, c);
    const glintT = (state.idle % GLINT.period) / GLINT.sweep;
    const s = {
      cx: lerp(hero.cx, slot.cx, dock),
      cy: lerp(hero.cy, slot.cy, dock),
      r: lerp(hero.r, slot.r * zoom, dock),
      lon: keyAt(KEYS.lon, c),
      tilt: keyAt(KEYS.tilt, c),
      morph,
      egypt: keyAt(KEYS.egypt, c),
      mute: keyAt(KEYS.mute, c),
      ocean: keyAt(KEYS.ocean, c) * smooth(0.55, 1, morph),
      collapse: keyAt(KEYS.collapse, c),
      cut: 1,
      spin: 0,
      intro: state.intro,
      glint: state.introDone && morph < 0.02 && glintT < 1 ? lerp(-0.3, 1.3, glintT) : -1,
      draw,
      clip: dock > 0.995 ? { x: slot.x + 1, y: slot.y + 1, w: slot.w - 2, h: slot.h - 2 } : null,
    };
    api.regions.forEach((key, i) => { draw[i] = smooth(DRAW[key][0], DRAW[key][1], c); });
    s.lanes = smooth(2.15, 2.35, c) * (1 - smooth(0, 0.6, s.collapse));
    s.point = api.project(origins.alex.lat, origins.alex.lon, s).v.map((v) => v * 1.01);
    return { s, c, slot };
  }

  function frameState(dt) {
    const hero = isStory ? box(orb, ORB_FILL) : heroBox();
    const f = isStory ? storyState(hero) : { s: heroState(hero) };
    const dotRect = dot.getBoundingClientRect();
    f.s.dot = [
      (dotRect.left - canvasRect.left + dotRect.width / 2 - hero.cx) / hero.r,
      -(dotRect.top - canvasRect.top + dotRect.height * 0.72 - hero.cy) / hero.r,
      1.3,
    ];
    if (isStory) state.c += (state.target - state.c) * (1 - Math.exp(-DAMPING * dt));
    return f;
  }

  function updateOverlay({ s, c, slot }) {
    const originsOn = keyAt(KEYS.origins, c);
    const bounds = { left: 8, top: HUD_BAND, right: slot.w - 8, bottom: slot.h - HUD_BAND };
    const projected = pins.map((pin) => {
      const p = api.project(pin.place.lat, pin.place.lon, s);
      const local = { x: p.x - slot.x, y: p.y - slot.y };
      const wanted = pin.origin ? originsOn > 0.6 && s.morph > 0.99 : s.lanes > 0.6 && draw[regionIndex[pin.key]] > 0.97;
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
    const alex = api.project(origins.alex.lat, origins.alex.lon, s);
    const pointOn = s.collapse > 0.85;
    point?.classList.toggle("is-on", pointOn);
    if (point && pointOn) {
      point.style.transform = `translate(${(alex.x - slot.x).toFixed(1)}px, ${(alex.y - slot.y).toFixed(1)}px)`;
      point.style.setProperty("--s", `${(10 + 8 * smooth(0.85, 1, s.collapse)).toFixed(1)}px`);
    }
    const text = fill(strings.view, { lat: s.tilt.toFixed(1), lon: Math.abs(s.lon).toFixed(1), hemi: s.lon < 0 ? strings.west : strings.east });
    if (coord && text !== state.coordText) { state.coordText = text; coord.textContent = text; }
    const active = clamp(Math.round(state.c), 0, chapters.length);
    if (active !== state.active && chapters.length) {
      state.active = active;
      chapters.forEach((el, i) => el.classList.toggle("is-active", i + 1 === active || (active === 0 && i === 0)));
      if (chapterLabel) chapterLabel.textContent = chapters[Math.max(0, active - 1)].dataset.label;
    }
  }

  function updateIntro(dt) {
    if (state.introDone) return;
    if (state.intro === 0) dot.classList.add("is-emit");
    state.intro = Math.min(INTRO_END, state.intro + (dt / INTRO_SECONDS) * INTRO_END);
    const landed = Math.round(api.counts.logo * smooth(0.05, INTRO_END, state.intro));
    if (count) count.textContent = fill(strings.count, { n: format(landed) });
    if (state.intro >= INTRO_END) state.introDone = true;
  }

  function frame(dt) {
    state.time += dt;
    if (!state.paused) state.idle += dt;
    updateIntro(dt);
    const f = frameState(dt);
    api.render(f.s);
    if (isStory) updateOverlay(f);
  }

  // The hero loop sleeps when paused after the intro; the story loop keeps following the scroll.
  const tick = (now) => {
    const dt = state.last ? Math.min(MAX_DT, (now - state.last) / 1000) : 0;
    state.last = now;
    frame(dt);
    const asleep = !isStory && state.paused && state.introDone;
    state.raf = asleep ? 0 : requestAnimationFrame(tick);
  };
  const sync = () => {
    const run = state.visible && !document.hidden;
    canvas.classList.toggle("is-on", state.visible);
    if (run && !state.raf) { state.last = 0; state.raf = requestAnimationFrame(tick); }
    if (!run && state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  };
  const setPaused = (paused) => {
    state.paused = paused;
    pause.setAttribute("aria-pressed", String(paused));
    pause.textContent = paused ? strings.play ?? "" : strings.pause ?? "";
    sync();
  };
  // With the orb flight the canvas is fixed, and the sphere is wanted until it has landed on the bullet.
  const isWanted = () => (isFlying() ? flight.wantsSphere() : state.inView);
  const io = new IntersectionObserver(([entry]) => { state.inView = entry.isIntersecting; state.visible = isWanted(); sync(); });
  // Called on every flight update. A canvas coming back draws the current pose before it shows; a paused loop
  // (asleep) gets one frame per update, so the sphere still follows the scroll.
  const onFlight = () => {
    const wanted = isWanted();
    if (wanted && !state.visible && !document.hidden) frame(0);
    state.visible = wanted;
    sync();
  };
  const ro = new ResizeObserver(relayout);
  const onPause = () => setPaused(!state.paused);
  const onScroll = () => { if (!isStory && !isFlying()) canvasRect = canvas.getBoundingClientRect(); };
  const onContextLost = (event) => {
    event.preventDefault();
    destroy();
    root.classList.add("ts--flat");
    console.warn("Tile sphere: WebGL context lost; showing the SVG mark.");
  };

  function destroy() {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    io.disconnect();
    ro.disconnect();
    flight?.unsubscribe(onFlight);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", sync);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    pause?.removeEventListener("click", onPause);
    if (pause) pause.hidden = true;
    api.dispose();
    root.classList.remove("is-story", "is-gl");
  }

  // A visitor who lands mid-page (reload, anchor), or whose orb is already flying, skips the fly-in.
  const isMidFlight = isFlying() && (flight.frame()?.p ?? 0) > FLIGHT_SKIPS_INTRO;
  if (window.scrollY > window.innerHeight * 0.6 || isMidFlight) { state.intro = INTRO_END; state.introDone = true; }
  root.classList.add("is-gl");
  relayout();
  state.c = state.target = isStory ? chapterAt(state.stops, window.scrollY) : 0;
  if (pause) {
    pause.hidden = false;
    pause.addEventListener("click", onPause);
    setPaused(false);
  }
  ro.observe(root);
  ro.observe(canvas);
  io.observe(isStory || flight ? root : canvas);
  flight?.subscribe(onFlight);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", sync);
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.fonts?.ready.then(relayout);
  window.addEventListener("load", relayout, { once: true });
  frame(0);
  return { destroy, state };
}

/** Boots the sphere on root ([data-sphere]); mode "hero" or "story". Resolves once mounted or left flat. */
export async function bootSphere(root, { mode = "hero", strings = {}, flight = null } = {}) {
  if (!root) return null;
  if (!isSphereSupported()) {
    root.classList.add("ts--flat");
    return null;
  }
  if (mode === "story") root.classList.add("is-story");
  await whenEngaged();
  try {
    const loads = [import("./sphere.js")];
    if (mode === "story") loads.push(import("../globe/globe-data.js"));
    const [{ createTileSphere }, geo] = await Promise.all(loads);
    const slots = mode === "hero" ? flight?.slots ?? [] : [];
    const api = createTileSphere(root.querySelector(".ts__canvas"), { narrow: NARROW.matches, themeEl: root, heroOnly: mode === "hero", slots });
    const places = geo?.PIN_PLACES ?? {};
    root.tileSphere = mount(root, api, { mode, strings, places, origins: geo?.ORIGINS ?? api.origins, flight: mode === "hero" ? flight : null });
    return root.tileSphere;
  } catch (error) {
    root.classList.remove("is-story", "is-gl");
    root.classList.add("ts--flat");
    console.warn("Tile sphere unavailable; keeping the SVG mark.", error);
    return null;
  }
}

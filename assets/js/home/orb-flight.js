// Hero-to-bullet flight (home page). As the visitor scrolls from the hero to "GPL at a glance.", the hero's tile
// sphere comes apart, its tiles stream down and re-form the globe tile by tile, and the formed globe settles into
// that section title's bullet, which then takes over. It is driven by the scroll position, so it reverses on the way
// back up. The re-forming is the main event, so it gets the largest share of the scroll and a size that shows it.
//
// - Progress p is 0 at the top of the page and 1 when the title's top reaches TARGET_LINE of the viewport height.
// - The forming globe sits in the empty band between the hero's buttons and the rule over the title, above the
//   bullet, as large as the band allows; it scrolls with the page. Over SETTLE it slides and shrinks into the bullet.
// - Each of the mark's 78 tiles has its own progress q. Tiles lift off in the logo's sweep order (forest edge first,
//   DEPART) and land in the forming globe in the same order (ARRIVE), with seeded jitter. In flight a tile rides a
//   spine shared by all: on screen it eases from the hero spot towards the forming globe, and its scale eases from
//   the hero sphere's to the globe's. On top of that each tile has an outward kick at lift-off, a seeded swirl and
//   drift that vanish on landing; most make a full turn and some flip like a card. A tile at q = 0 sits in the hero
//   sphere and at q = 1 in the forming globe's lattice, so the globe is whole before it settles and at p = 1 the
//   swarm is the bullet exactly.
// - Both renderers share the choreography. Before three.js (or without it) the tiles are clones of #gpl-mark's paths
//   in a fixed overlay (.ts-swarm), one transform matrix each per frame. story.js gives the WebGL sphere
//   swarmUniforms(): every kept sub-tile follows the SVG tile nearest its centre (slots), so the two match tile for
//   tile and three.js arriving mid-flight is a plain crossfade.
// - .ts--fly fixes the canvas (and the overlay) to the viewport, so the hero's overflow cannot clip them and
//   compositor scrolling cannot shake them. Rects are read only when the layout changes; scroll frames only write.
// - At p = 1 (.is-landed) the title's real bullet (.sec__globe, which replaces its ::before) shows under the tiles,
//   which fade out over it.
// home.js starts the flight whenever motion is allowed; a flat hero (no WebGL2, Save-Data) flies its SVG tiles.
// With reduced motion there is no flight and the bullet is simply there.

const TARGET_LINE = 0.32;
const MIN_TRAVEL = 0.2;
const NARROW = matchMedia("(max-width: 899px)");
// Spine. lead: share of q the x travel takes. spread: how fast the swarm's footprint shrinks (< 1 earlier, so the
// stream stays tight); grain: how fast each tile shrinks (> 1 later, so tiles stay legible in flight and visibly
// snap into the forming globe's lattice). anchored: the resting sphere scrolls away with the hero (under 900px,
// where the copy runs full width below it) instead of holding on screen beside the copy.
const PATH = {
  wide: { lead: 0.95, spread: 0.85, grain: 1.35, anchored: false },
  narrow: { lead: 0.9, spread: 0.75, grain: 1.5, anchored: true },
};
// Forming globe. fill: its radius as a share of the band's height; max: cap as a share of the hero sphere's
// radius; pad: px kept clear of the viewport's side edges.
const FORM = { fill: 0.46, max: 0.5, pad: 8 };
// Tiles: lift-off and landing windows (by sweep order, mixed with a seeded share), and the loose motion in units of
// the current spine radius. kickEnd: share of q by which the outward kick has settled back; still: share of tiles
// that do not turn. SETTLE: the formed globe's slide into the bullet, after the last tile has landed.
const DEPART = [0.03, 0.26];
const ARRIVE = [0.42, 0.8];
const SETTLE = [0.84, 1];
const ORDER_MIX = 0.3;
const LOOSE = { kick: 0.32, kickEnd: 0.55, swirl: 0.55, drift: 0.45, still: 0.3, flipShare: 0.25 };
const LAND_FADE_MS = 340;
const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easePath = (t) => t * t * t * (t * (6 * t - 15) + 10);
const num = (v) => v.toFixed(3);

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Tiles: the mark's paths, their centroids and seeded plans ---------- */

// The sprite's paths are "M x y" followed by relative "l" steps; the vertex mean is the tile's centroid.
function centroid(d) {
  const n = d.match(/-?\d*\.?\d+/g).map(Number);
  let x = n[0], y = n[1], sx = x, sy = y;
  for (let k = 2; k + 1 < n.length; k += 2) { x += n[k]; y += n[k + 1]; sx += x; sy += y; }
  const count = Math.floor(n.length / 2);
  return [sx / count, sy / count];
}

function planTile(path, i) {
  const d = path.getAttribute("d");
  const [mx, my] = centroid(d);
  const order = Number(path.style.getPropertyValue("--t")) || mx / 100;
  const rand = mulberry(i * 7919 + 17);
  const r = [rand(), rand(), rand(), rand(), rand(), rand()];
  const depart = lerp(DEPART[0], DEPART[1], lerp(order, r[0], ORDER_MIX));
  const arrive = lerp(ARRIVE[0], ARRIVE[1], lerp(order, r[1], ORDER_MIX));
  return {
    d, mx, my, cx: mx / 50 - 1, cy: my / 50 - 1, depart, span: arrive - depart,
    swirl: (2 * r[2] - 1) * LOOSE.swirl,
    driftX: Math.cos(TAU * r[3]) * LOOSE.drift,
    driftY: Math.sin(TAU * r[3]) * LOOSE.drift,
    spin: r[4] < LOOSE.still ? 0 : r[4] < (1 + LOOSE.still) / 2 ? -1 : 1,
    flip: r[5] < LOOSE.flipShare,
  };
}

function createSwarm(orb, tiles) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ts-swarm");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const paths = tiles.map((tile) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", tile.d);
    svg.append(path);
    return path;
  });
  orb.append(svg);
  return paths;
}

function createBullet(title) {
  const bullet = document.createElement("span");
  bullet.className = "sec__globe is-orb-wait";
  bullet.setAttribute("aria-hidden", "true");
  title.prepend(bullet);
  title.classList.add("has-globe");
  return bullet;
}

/** Starts the flight from the hero ([data-sphere="hero"]) to the bullet of `title`. Returns the controller or null. */
export function initOrbFlight(hero, title) {
  const orb = hero.querySelector("[data-ts-orb]");
  const markPaths = [...document.querySelectorAll("#gpl-mark path")];
  if (!orb || !title || !markPaths.length) return null;
  const tiles = markPaths.map(planTile);
  const paths = createSwarm(orb, tiles);
  const placed = tiles.map(() => ({ fx: 0, fy: 0, r: 1, g: 1, ox: 0, oy: 0, a: 1, b: 0, c: 0, d: 1 }));
  const gl = { a: new Float32Array(tiles.length * 4), b: new Float32Array(tiles.length * 4), y: NaN, fill: 0 };
  const bullet = createBullet(title);
  const listeners = new Set();
  const geo = { from: null, to: null, form: null, end: 1 };
  const state = { enabled: false, landed: false, flying: false, fadeUntil: 0, p: 0, y: NaN, raf: 0, onScreen: true };
  const notify = () => listeners.forEach((fn) => fn());

  // The forming globe on screen (viewport px) at progress p and scroll y: in the band until SETTLE, then sliding
  // into the bullet while its radius shrinks geometrically to the bullet's.
  function globeAt(p, y) {
    const { form, to } = geo;
    const s = easePath(clamp((p - SETTLE[0]) / (SETTLE[1] - SETTLE[0]), 0, 1));
    return { x: lerp(form.x, to.x, s), y: lerp(form.y, to.y, s) - y, r: form.r * (to.r / form.r) ** s };
  }

  // The shared path at tile progress q, for a frame ({ rest, globe }): centre (viewport px), footprint radius r and
  // tile radius g (the sphere radius a tile is drawn at).
  function spine(q, { rest, globe }) {
    const { from } = geo;
    const path = NARROW.matches ? PATH.narrow : PATH.wide;
    const ex = easePath(clamp(q / path.lead, 0, 1));
    const ey = easePath(q);
    const shrink = (skew) => from.r * (globe.r / from.r) ** easePath(q ** skew);
    return { x: lerp(from.x, globe.x, ex), y: lerp(rest, globe.y, ey), r: shrink(path.spread), g: shrink(path.grain) };
  }

  // Tile i on screen: centre F + r·(c + loose offset), drawn at radius g with the 2×2 turn/flip A (identity at rest
  // and on landing, where r = g).
  function placeTile(tile, out, frame) {
    const q = clamp((frame.p - tile.depart) / tile.span, 0, 1);
    const f = spine(q, frame);
    const bump = Math.sin(Math.PI * q);
    const kick = LOOSE.kick * Math.sin(Math.PI * Math.min(1, q / LOOSE.kickEnd));
    const turn = tile.spin * TAU * easePath(q);
    const flip = tile.flip ? Math.cos(TAU * easePath(clamp((q - 0.1) / 0.8, 0, 1))) : 1;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    out.fx = f.x;
    out.fy = f.y;
    out.r = f.r;
    out.g = f.g;
    out.ox = tile.cx * (1 + kick) + (-tile.cy * tile.swirl + tile.driftX) * bump;
    out.oy = tile.cy * (1 + kick) + (tile.cx * tile.swirl + tile.driftY) * bump;
    Object.assign(out, { a: cos, b: sin, c: -sin * flip, d: cos * flip });
  }

  // SVG: the path keeps its mark coordinates (so the userSpace logo gradient stays on the tile); the matrix maps
  // them to the screen: x' = k·A·(m − m_c) + centre, k = g / 50.
  function writeSvg() {
    tiles.forEach((tile, i) => {
      const t = placed[i];
      const k = t.g / 50;
      const a = k * t.a, b = k * t.b, c = k * t.c, d = k * t.d;
      const x = t.fx + t.r * t.ox, y = t.fy + t.r * t.oy;
      const e = x - (a * tile.mx + c * tile.my), f = y - (b * tile.mx + d * tile.my);
      paths[i].setAttribute("transform", `matrix(${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(e)} ${num(f)})`);
    });
  }

  function setLanded(landed) {
    state.landed = landed;
    hero.classList.toggle("is-landed", landed);
    bullet.classList.toggle("is-orb-wait", !landed);
    if (!landed) return;
    state.fadeUntil = performance.now() + LAND_FADE_MS;
    setTimeout(notify, LAND_FADE_MS + 20);
  }

  function update() {
    if (!state.enabled) return false;
    const y = window.scrollY;
    if (y === state.y) return true;
    state.y = y;
    state.p = clamp(y / geo.end, 0, 1);
    const flying = state.p > 0 && state.p < 1;
    if (flying !== state.flying) {
      state.flying = flying;
      hero.classList.toggle("is-flying", flying);
    }
    if (state.p >= 1 !== state.landed) setLanded(state.p >= 1);
    if (flying || performance.now() < state.fadeUntil) {
      const frame = { p: state.p, rest: restY(y), globe: globeAt(state.p, y) };
      tiles.forEach((tile, i) => placeTile(tile, placed[i], frame));
      writeSvg();
    }
    notify();
    return true;
  }

  function setEnabled(on) {
    const changed = on !== state.enabled;
    state.enabled = on;
    hero.classList.toggle("ts--fly", on);
    if (on && changed) {
      bullet.classList.add("is-orb-wait");
      state.landed = false;
    }
    if (!on) {
      hero.classList.remove("is-flying", "is-landed");
      bullet.classList.remove("is-orb-wait");
      Object.assign(state, { landed: false, flying: false, p: 0 });
    }
    if (changed) notify();
  }

  // The forming globe (document px): centred in the band from the hero's buttons down to the rule over the title,
  // above the bullet but kept inside the viewport; geo.from and geo.to must be measured first.
  function measureForm(y) {
    const top = (hero.querySelector(".ts-hero__actions") ?? hero).getBoundingClientRect().bottom + y;
    const bottom = (title.closest("header") ?? title).getBoundingClientRect().top + y;
    const r = clamp(FORM.fill * (bottom - top), geo.to.r, FORM.max * geo.from.r);
    const vw = document.documentElement.clientWidth;
    return { x: clamp(geo.to.x, r + FORM.pad, vw - r - FORM.pad), y: (top + bottom) / 2, r };
  }

  function measure() {
    const y = window.scrollY;
    const vh = document.documentElement.clientHeight;
    const o = orb.getBoundingClientRect();
    const b = bullet.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    geo.from = { x: o.left + o.width / 2, y: o.top + y + o.height / 2, r: Math.min(o.width, o.height) / 2 };
    geo.to = { x: b.left + b.width / 2, y: b.top + y + b.height / 2, r: b.width / 2 };
    geo.end = t.top + y - vh * TARGET_LINE;
    geo.form = measureForm(y);
    setEnabled(geo.end > vh * MIN_TRAVEL && b.width > 0 && o.width > 0);
    state.y = NaN;
    gl.y = NaN;
  }

  // WebGL: the sphere is drawn at the hero spot with radius fill·r_h (story.js). A sub-tile vertex v (unit sphere,
  // y up) goes to C + T + M·(v − C), C the slot pivot: the SVG tile's motion, re-expressed in sphere units.
  function swarmUniforms(fill) {
    if (!state.enabled || state.p <= 0) return null;
    update();
    if (gl.y === state.y && gl.fill === fill) return gl;
    const h = heroSpot(), rg = fill * geo.from.r;
    tiles.forEach((tile, i) => {
      const t = placed[i];
      const s = t.g / geo.from.r;
      const px = t.fx + fill * t.r * t.ox - h.x, py = t.fy + fill * t.r * t.oy - h.y;
      gl.a.set([px / rg - tile.cx, -py / rg + tile.cy, tile.cx, -tile.cy], i * 4);
      gl.b.set([s * t.a, -s * t.c, -s * t.b, s * t.d], i * 4);
    });
    gl.y = state.y;
    gl.fill = fill;
    return gl;
  }

  // Where the resting sphere sits on screen; overscroll above the top (rubber band) always drags it with the hero.
  const restY = (y) => geo.from.y - ((NARROW.matches ? PATH.narrow : PATH.wide).anchored ? y : Math.min(0, y));
  const heroSpot = () => ({ x: geo.from.x, y: restY(window.scrollY) });
  const remeasure = () => { measure(); update(); };
  const onFrame = () => { state.raf = 0; update(); };
  const request = () => { if (!state.raf) state.raf = requestAnimationFrame(onFrame); };
  const seen = new Map();
  // Frames are only requested while the hero or the numbers section is on screen.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => seen.set(entry.target, entry.isIntersecting));
    state.onScreen = [...seen.values()].some(Boolean);
    if (state.onScreen) request();
  });

  remeasure();
  io.observe(hero);
  io.observe(title.closest("section") ?? title);
  window.addEventListener("scroll", () => { if (state.onScreen) request(); }, { passive: true });
  window.addEventListener("resize", remeasure);
  new ResizeObserver(remeasure).observe(document.body);
  document.fonts?.ready.then(remeasure);
  window.addEventListener("load", remeasure, { once: true });

  return {
    /** Unit-disc pivots (x right, y down) of the 78 SVG tiles; story.js hands them to the WebGL scene. */
    slots: tiles.map((tile) => [tile.cx, tile.cy]),
    isEnabled: () => state.enabled,
    /** Hero spot (viewport px, where the resting sphere sits), its size and the progress p; null when off. */
    frame: () => (update() ? { ...heroSpot(), size: geo.from.r * 2, p: state.p } : null),
    swarmUniforms,
    /** The WebGL sphere is needed until the swarm has landed and faded into the bullet. */
    wantsSphere: () => state.enabled && (!state.landed || performance.now() < state.fadeUntil),
    subscribe: (fn) => listeners.add(fn),
    unsubscribe: (fn) => listeners.delete(fn),
  };
}

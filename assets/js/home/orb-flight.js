// Hero-to-bullet flight (home page). As the visitor scrolls from the hero to "GPL at a glance.", the hero's tile
// sphere shrinks and flies into the globe bullet of that section title, then hands over to it. It is driven by the
// scroll position, so it reverses on the way back up.
//
// - Progress p is 0 at the top of the page and 1 when the title's top reaches TARGET_LINE of the viewport height.
// - The orb eases (on screen) from its spot in the hero towards an aim that moves with the page: first the seam
//   between the hero and the numbers section (the empty band under the hero's buttons, so it threads past the copy
//   in a shallow arc), then, late in the flight, the bullet itself. It reaches the bullet's column a little early,
//   so the title rises into it. It leaves the hero at rest and arrives moving with the page, so the hand-off has
//   no kink. The size shrinks geometrically, which reads as even to the eye.
// - .ts--fly fixes the SVG mark and the WebGL canvas to the viewport: the hero's overflow cannot clip them and
//   compositor scrolling cannot shake them. Rects are read only when the layout changes; each scroll frame writes
//   one transform. story.js draws the WebGL sphere at pose() and asks wantsSphere() whether to keep drawing.
// - At p = 1 (.is-landed) the title's real bullet (.sec__globe, which replaces its ::before) shows under the orb
//   and the orb fades out over it.
// home.js only starts the flight when the WebGL sphere may run (motion allowed, WebGL2, no Save-Data); otherwise
// the hero stays flat and the bullet is simply there.

const TARGET_LINE = 0.32;
const MIN_TRAVEL = 0.2;
const NARROW = matchMedia("(max-width: 899px)");
// Under 900px the hero copy runs full width below the orb, so the orb shrinks sooner and reaches the margin column
// sooner, keeping its passage over the copy short. lead: share of the flight the x travel takes; skew < 1 shrinks
// earlier.
const PATH = { wide: { lead: 0.95, skew: 0.85 }, narrow: { lead: 0.72, skew: 0.5 } };
const CATCH_UP = 0.6;
const SETTLE = [0.6, 0.97];
const LAND_FADE_MS = 340;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const easePath = (t) => t * t * t * (t * (6 * t - 15) + 10);
const px = (v) => `${v.toFixed(2)}px`;

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
  const mark = orb?.querySelector(".ts-hero__mark");
  if (!mark || !title) return null;
  const bullet = createBullet(title);
  const listeners = new Set();
  const geo = { from: null, to: null, end: 1, base: 1, left: 0, top: 0, lift: 0 };
  const state = { enabled: false, landed: false, flying: false, fadeUntil: 0, pose: null, y: NaN, raf: 0, onScreen: true };
  const notify = () => listeners.forEach((fn) => fn());

  function computePose(y) {
    const { from, to } = geo;
    const p = clamp(y / geo.end, 0, 1);
    const path = NARROW.matches ? PATH.narrow : PATH.wide;
    const ex = easePath(clamp(p / path.lead, 0, 1));
    const ey = easePath(p);
    const es = easePath(p ** path.skew);
    // Overscroll above the top (rubber band) drags the resting orb along with the hero.
    const startY = from.y - Math.min(0, y);
    const aimY = to.y - y - geo.lift * (1 - smooth(CATCH_UP, 1, p));
    return {
      p,
      x: lerp(from.x, to.x, ex),
      y: lerp(startY, aimY, ey),
      size: from.size * (to.size / from.size) ** es,
      turn: Math.sin(Math.PI * ex),
      settle: smooth(SETTLE[0], SETTLE[1], p),
    };
  }

  function setLanded(landed) {
    state.landed = landed;
    hero.classList.toggle("is-landed", landed);
    bullet.classList.toggle("is-orb-wait", !landed);
    if (!landed) return;
    state.fadeUntil = performance.now() + LAND_FADE_MS;
    setTimeout(notify, LAND_FADE_MS + 20);
  }

  function write(pose) {
    const scale = pose.size / geo.base;
    const tx = pose.x - pose.size / 2 - geo.left;
    const ty = pose.y - pose.size / 2 - geo.top;
    mark.style.transform = `translate(${px(tx)}, ${px(ty)}) scale(${scale.toFixed(5)})`;
    const flying = pose.p > 0 && pose.p < 1;
    if (flying !== state.flying) {
      state.flying = flying;
      hero.classList.toggle("is-flying", flying);
    }
    if (pose.p >= 1 !== state.landed) setLanded(pose.p >= 1);
  }

  function update() {
    if (!state.enabled) return null;
    const y = window.scrollY;
    if (y === state.y) return state.pose;
    state.y = y;
    state.pose = computePose(y);
    write(state.pose);
    notify();
    return state.pose;
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
      mark.removeAttribute("style");
      hero.classList.remove("is-flying", "is-landed");
      bullet.classList.remove("is-orb-wait");
      Object.assign(state, { landed: false, flying: false, pose: null });
    }
    if (changed) notify();
  }

  // The orb's box in the hero is unaffected by the fixed mark (its size comes from width and aspect-ratio).
  function measure() {
    const y = window.scrollY;
    const vh = document.documentElement.clientHeight;
    const o = orb.getBoundingClientRect();
    const b = bullet.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    geo.base = o.width;
    geo.left = o.left;
    geo.top = o.top + y;
    geo.from = { x: o.left + o.width / 2, y: o.top + y + o.height / 2, size: Math.min(o.width, o.height) };
    geo.to = { x: b.left + b.width / 2, y: b.top + y + b.height / 2, size: b.width };
    geo.end = t.top + y - vh * TARGET_LINE;
    geo.lift = Math.max(0, geo.to.y - (hero.getBoundingClientRect().bottom + y));
    setEnabled(geo.end > vh * MIN_TRAVEL && b.width > 0 && o.width > 0);
    if (state.enabled) Object.assign(mark.style, { left: px(geo.left), top: px(geo.top), width: px(geo.base), height: px(geo.base) });
    state.y = NaN;
  }

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
    isEnabled: () => state.enabled,
    /** Current pose in viewport px: centre x/y, size, progress p, turn (0…1) and settle (0…1); null when off. */
    pose: () => update() ?? state.pose,
    /** The WebGL sphere is needed until the orb has landed and faded into the bullet. */
    wantsSphere: () => state.enabled && (!state.landed || performance.now() < state.fadeUntil),
    subscribe: (fn) => listeners.add(fn),
    unsubscribe: (fn) => listeners.delete(fn),
  };
}

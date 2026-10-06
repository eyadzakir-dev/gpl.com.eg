/* Home page wiring: the tile-sphere hero, the key-figure count-ups and the clearance line. Kept small: the hero's
 * WebGL sphere (three.js) loads only after first paint, and the line module only as its section approaches.
 *
 * Strings contract (for the Arabic page, ar/index.html, which reuses these scripts unchanged)
 * ------------------------------------------------------------------------------------------
 * Every user-facing string that JS writes comes from <script type="application/json" id="home-strings">;
 * everything else (headings, stations, captions, sr-only text, rail labels) is in the HTML. Translate the values,
 * keep the keys and the {name} placeholders.
 *   locale         BCP 47 tag for numbers (en-GB). Arabic: "ar-EG", or "ar-EG-u-nu-latn" to keep Latin digits.
 *   sphere.count   hero caption while the tiles land, e.g. "{n} tiles · 20 × 10 lattice"
 *   sphere.pause   label of the hero's pause button while the sphere idles
 *   sphere.play    label of the same button while paused
 * Direction: the clearance line's horizontal track reads --dir (home.css) and the rail's arrow keys read
 * document.dir; the sphere canvas is a drawing and never mirrors.
 */
import { getStrings } from "./home/strings.js";

const root = document.documentElement;
const strings = getStrings();
const hasMotion = () => root.classList.contains("motion");
const COUNT_MS = 1100;
const COUNT_THRESHOLD = 0.3;
const LINE_MARGIN = "200% 0px";

const failed = (name) => (error) => console.error(`Home: the ${name} module failed to load.`, error);

/* ---------- Hero: the tile sphere (SVG mark first; WebGL after first paint) ---------- */

// The sphere also flies into the globe bullet of "GPL at a glance." ([data-orb-target]) as the visitor scrolls
// (home/orb-flight.js). Only with the WebGL sphere: a flat hero keeps its mark and the bullet simply shows.
const hero = document.querySelector('[data-sphere="hero"]');
const orbTarget = document.querySelector("[data-orb-target]");
const loadFlight = () => (orbTarget ? import("./home/orb-flight.js").catch(failed("orb flight")) : null);

function startHero([{ bootSphere, isSphereSupported }, flightModule]) {
  const flight = isSphereSupported() ? flightModule?.initOrbFlight(hero, orbTarget) ?? null : null;
  if (!flight) orbTarget?.removeAttribute("data-orb-target");
  return bootSphere(hero, { mode: "hero", strings: { locale: strings.locale, ...strings.sphere }, flight });
}

if (hero && hasMotion()) {
  Promise.all([import("./sphere/story.js"), loadFlight()])
    .then(startHero)
    .catch((error) => {
      orbTarget?.removeAttribute("data-orb-target");
      failed("tile sphere")(error);
    });
} else {
  hero?.classList.add("ts--flat");
}

/* ---------- Key figures count up as the cells rise in ---------- */

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

function countUp(el, format) {
  const target = Number(el.dataset.countTo);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    el.textContent = format(Math.round(target * easeOutCubic(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCountUps() {
  const box = document.querySelector(".cl-nums");
  if (!box || !hasMotion()) return;
  const counters = [...box.querySelectorAll("[data-count-to]")];
  const format = new Intl.NumberFormat(strings.locale || root.lang).format;
  counters.forEach((el) => { el.textContent = format(0); });
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    counters.forEach((el) => countUp(el, format));
  }, { threshold: COUNT_THRESHOLD });
  observer.observe(box);
}

initCountUps();

/* ---------- The clearance line: rail and scroll fallback, loaded on approach ---------- */

const line = document.querySelector(".cl");
if (line) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    import("./home/line.js").then(({ initLine }) => initLine(line)).catch(failed("clearance line"));
  }, { rootMargin: LINE_MARGIN });
  observer.observe(line);
}

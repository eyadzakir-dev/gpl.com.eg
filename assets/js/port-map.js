// Interactive Egypt port map (component). Markup: scripts/templates/port-map.{en,ar}.html; styles: assets/css/port-map.css.
// The port selector works as soon as the module runs. The map SVG fetch, the lanes and the ships start only when the
// figure is about one viewport away; ships move only while the map is on screen and only under html.motion.
// The map is drawn in its own 960×960 user space and never mirrors; in RTL only the arrow keys follow reading order.

const SVG_NS = "http://www.w3.org/2000/svg";
// Port nodes in the map's user space (see data-node in port-map-egypt*.svg); used to find their leader lines.
const PORT_POINTS = [[424.2, 187.1], [419.1, 191.1], [552.1, 164.9], [588.6, 181.6], [592, 310.7]];
const LEADER_SNAP = 15;
const SHIP_SPEED = 46; // user units per second
const SHIP_GAP_S = 1.4;
const SHIP_RADIUS = 3.6;
const SHIP_FADE = 8;
const MAX_FRAME_S = 0.05;
const NEAR_MARGIN = "100% 0px";
const DRAW_THRESHOLD = 0.25;
const NARROW = matchMedia("(max-width: 899px)");

// Main trade lanes in map user space. The Suez lane follows the map's own canal route.
const LANES = [
  { id: "eu-alx", from: "alexandria dekheila", pts: [[424.2, 187.1], [421, 158], [405, 116], [384, 74], [366, 30]] },
  { id: "us-alx", from: "alexandria dekheila", pts: [[419.1, 191.1], [398, 178], [356, 160], [298, 146], [238, 134], [180, 124]] },
  { id: "eu-dam", from: "damietta", pts: [[552.1, 164.9], [547, 128], [530, 84], [508, 30]] },
  { id: "eu-psd", from: "port-said", pts: [[588.6, 181.6], [590.3, 154.2], [578.2, 106.4], [566, 70], [553, 30]] },
  { id: "asia-psd", from: "port-said", pts: [[588.6, 181.6], [589.5, 216.5], [589.6, 236], [594.9, 253.9], [604.4, 261.3], [607.1, 279.5], [605.2, 300], [610.6, 323.2], [626.2, 354.2], [641.8, 385.1], [661.2, 415.9], [683, 446.6], [722.3, 477.2], [764.1, 507.6], [778.2, 538], [793.7, 568.2], [806.5, 598.4], [815, 630]] },
  { id: "gulf-sok", from: "sokhna", pts: [[592, 310.7], [601, 324], [617, 354], [632, 385], [651, 416], [673, 449], [713, 482], [754, 512], [768, 542], [783, 572], [796, 602], [804, 630]] },
];
// Lane labels per view: [x, y, text-anchor] in map user space; null hides the label in that view.
const LANE_LABELS = [
  { key: "europe", lanes: "eu-alx eu-dam eu-psd", wide: [456, 60, "middle"], narrow: [520, 80, "middle"] },
  { key: "us", lanes: "us-alx", wide: [240, 108, "start"], narrow: [336, 98, "start"] },
  { key: "asia", lanes: "asia-psd", wide: [796, 498, "start"], narrow: [638, 398, "end"] },
  { key: "gulf", lanes: "gulf-sok", wide: [744, 528, "end"], narrow: [652, 446, "end"] },
  { key: "sea", lanes: "", sea: true, wide: [306, 76, "middle"], narrow: null },
];
// Geographic arrows: they point on the map, so they are the same in both languages.
const LABEL_TEXT = {
  en: {
    europe: ["↑ Europe"],
    us: ["← US East Coast", "via Gibraltar"],
    asia: ["Asia via Suez ↘", "India · China"],
    gulf: ["↓ Gulf · East Africa", "via the Red Sea"],
    sea: ["Mediterranean Sea"],
  },
  ar: {
    europe: ["↑ أوروبا"],
    us: ["← الساحل الشرقي الأمريكي", "عبر جبل طارق"],
    asia: ["آسيا عبر السويس ↘", "الهند · الصين"],
    gulf: ["↓ الخليج · شرق أفريقيا", "عبر البحر الأحمر"],
    sea: ["البحر المتوسط"],
  },
};

// Blink lays out SVG text with the first strong character as base direction; a leading LRM keeps the arrows in place.
const LRM = "\u200E";

const isMotion = () => document.documentElement.classList.contains("motion");
const getLabelText = () => LABEL_TEXT[document.documentElement.lang.slice(0, 2)] || LABEL_TEXT.en;

function createSvg(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

// Catmull-Rom through the points, written as cubic Béziers.
function toSmoothPath(pts) {
  const d = [`M${pts[0][0]} ${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [pts[i - 1] || pts[i], pts[i], pts[i + 1], pts[i + 2] || pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d.push(`C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`);
  }
  return d.join("");
}

const isNearPort = ([x, y]) => PORT_POINTS.some(([px, py]) => Math.hypot(px - x, py - y) < LEADER_SNAP);
const getStart = (subpath) => subpath.slice(1).split(/[\s,LHVC]+/).slice(0, 2).map(Number);

// Keeps only the leader subpaths that do not start at a port node (Cairo's stays).
function keepReferenceLeaders(path) {
  const subpaths = (path.getAttribute("d") || "").match(/M[^M]*/g) || [];
  path.setAttribute("d", subpaths.filter((subpath) => !isNearPort(getStart(subpath))).join(""));
}

function removePortLabel(svg, label) {
  if (svg.querySelector(`.illo-node--ref[data-node="${label.dataset.node}"]`)) return;
  const coords = label.nextElementSibling;
  if (coords && !coords.hasAttribute("data-node") && !coords.hasAttribute("data-label")) coords.remove();
  label.remove();
}

// Removes the baked port labels, their leaders and dots, the sea names and the single route; keeps Cairo and the rest.
function stripMap(svg) {
  svg.querySelectorAll(".illo-labels text[data-node]").forEach((label) => removePortLabel(svg, label));
  svg.querySelectorAll('[data-label="sea"], .illo-node:not(.illo-node--ref), .illo-route, title, desc').forEach((node) => node.remove());
  svg.querySelectorAll(".illo-leaders").forEach(keepReferenceLeaders);
}

// Waits for the browser's own lazy load of the image, so the fetch below is answered from the HTTP cache.
function whenImageSettled(img) {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  });
}

async function inlineMap(img) {
  await whenImageSettled(img);
  const response = await fetch(img.currentSrc || img.src, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Map ${response.status}`);
  const svg = new DOMParser().parseFromString(await response.text(), "image/svg+xml").documentElement;
  if (svg.nodeName !== "svg") throw new Error("Map is not an SVG");
  stripMap(svg);
  svg.removeAttribute("aria-labelledby");
  svg.setAttribute("aria-label", img.alt);
  svg.setAttribute("class", "pmap__img pmap__img--inline");
  svg.setAttribute("focusable", "false");
  img.replaceWith(document.importNode(svg, true));
}

function buildLane(layer, lane) {
  const d = toSmoothPath(lane.pts);
  const group = createSvg("g", { class: "lane", "data-lane": lane.id });
  const path = createSvg("path", { class: "lane__base", d, pathLength: "1" });
  const ship = createSvg("circle", { class: "lane__ship", r: SHIP_RADIUS, cx: lane.pts[0][0], cy: lane.pts[0][1] });
  group.append(path, createSvg("path", { class: "lane__flow", d }), ship);
  layer.append(group);
  return { ...lane, ports: lane.from.split(" "), group, path, ship, length: path.getTotalLength(), t: Math.random() * 3 };
}

function buildLabel(layer, def, [main, sub]) {
  const text = createSvg("text", { class: def.sea ? "lane__lbl lane__lbl--sea" : "lane__lbl" });
  const mainSpan = createSvg("tspan", { class: "lane__lbl-main" });
  mainSpan.textContent = LRM + main;
  text.append(mainSpan);
  if (sub) {
    const subSpan = createSvg("tspan", { class: "lane__lbl-sub", dy: "1.25em" });
    subSpan.textContent = sub;
    text.append(subSpan);
  }
  layer.append(text);
  return { def, text, sub: text.querySelector(".lane__lbl-sub"), laneIds: def.lanes.split(" ").filter(Boolean) };
}

function buildLanes(layer) {
  layer.setAttribute("viewBox", "0 0 960 960");
  const strings = getLabelText();
  const lanes = LANES.map((lane) => buildLane(layer, lane));
  const labels = LANE_LABELS.map((def) => buildLabel(layer, def, strings[def.key]));
  return { lanes, labels };
}

function placeLabels(labels) {
  const view = NARROW.matches ? "narrow" : "wide";
  labels.forEach(({ def, text, sub }) => {
    text.style.display = def[view] ? "" : "none";
    if (!def[view]) return;
    const [x, y, anchor] = def[view];
    text.setAttribute("x", x);
    text.setAttribute("y", y);
    text.setAttribute("text-anchor", anchor);
    sub?.setAttribute("x", x);
  });
}

function highlightLanes({ lanes, labels }, port) {
  const onIds = new Set(lanes.filter((lane) => lane.ports.includes(port)).map((lane) => lane.id));
  lanes.forEach((lane) => lane.group.classList.toggle("is-on", onIds.has(lane.id)));
  labels.forEach(({ text, laneIds }) => text.classList.toggle("is-on", laneIds.some((id) => onIds.has(id))));
}

function moveShips(lanes, dt) {
  lanes.forEach((lane) => {
    const travel = lane.length / SHIP_SPEED;
    lane.t = (lane.t + dt) % (travel + SHIP_GAP_S);
    const progress = Math.min(1, lane.t / travel);
    const point = lane.path.getPointAtLength(progress * lane.length);
    lane.ship.setAttribute("cx", point.x.toFixed(1));
    lane.ship.setAttribute("cy", point.y.toFixed(1));
    const fade = Math.min(1, progress * SHIP_FADE, (1 - progress) * SHIP_FADE);
    lane.ship.style.opacity = lane.t > travel ? 0 : fade.toFixed(2);
  });
}

// Runs the ship loop only while the stage is on screen and the tab is visible.
function startShips(stage, lanes) {
  const loop = { raf: 0, last: 0, visible: false };
  const frame = (now) => {
    const dt = loop.last ? Math.min(MAX_FRAME_S, (now - loop.last) / 1000) : 0;
    loop.last = now;
    moveShips(lanes, dt);
    loop.raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    const shouldRun = loop.visible && !document.hidden;
    if (shouldRun && !loop.raf) { loop.last = 0; loop.raf = requestAnimationFrame(frame); }
    if (!shouldRun && loop.raf) { cancelAnimationFrame(loop.raf); loop.raf = 0; }
  };
  new IntersectionObserver(([entry]) => { loop.visible = entry.isIntersecting; sync(); }).observe(stage);
  document.addEventListener("visibilitychange", sync);
}

function armDraw(root, stage) {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    root.classList.add("is-drawn");
    observer.disconnect();
  }, { threshold: DRAW_THRESHOLD });
  observer.observe(stage);
}

function whenNear(target, callback) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    callback();
  }, { rootMargin: NEAR_MARGIN });
  observer.observe(target);
}

async function enhance(root, state) {
  const img = root.querySelector("[data-pmap-img]");
  try {
    await inlineMap(img);
  } catch (error) {
    root.classList.add("is-fallback");
    console.warn("Port map: keeping the image version.", error);
    return;
  }
  Object.assign(state, buildLanes(root.querySelector("[data-pmap-lanes]")));
  placeLabels(state.labels);
  NARROW.addEventListener("change", () => placeLabels(state.labels));
  highlightLanes(state, root.dataset.portCurrent);
  root.classList.add("is-inline");
  if (!isMotion()) return;
  const stage = root.querySelector("[data-pmap-stage]");
  startShips(stage, state.lanes);
  armDraw(root, stage);
}

function createSelector(root, state) {
  const nodes = [...root.querySelectorAll(".pnode")];
  const buttons = [...root.querySelectorAll("button[data-port]")];
  const panels = [...root.querySelectorAll("[data-port-panel]")];
  return function select(port, { focus = false } = {}) {
    if (port !== root.dataset.portCurrent) {
      root.dataset.portCurrent = port;
      buttons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.port === port)));
      nodes.forEach((btn) => { btn.tabIndex = btn.dataset.port === port ? 0 : -1; });
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.portPanel === port));
      highlightLanes(state, port);
    }
    if (focus) nodes.find((btn) => btn.dataset.port === port)?.focus();
  };
}

// Arrow keys follow reading order: in RTL, ArrowLeft moves forward.
function getNextIndex(key, index, count) {
  const forward = document.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = document.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === forward || key === "ArrowDown") return (index + 1) % count;
  if (key === back || key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

function bindKeys(group, select) {
  const order = [...group.querySelectorAll(".pnode")].map((btn) => btn.dataset.port);
  group.addEventListener("keydown", (event) => {
    const btn = event.target.closest(".pnode");
    if (!btn) return;
    const next = getNextIndex(event.key, order.indexOf(btn.dataset.port), order.length);
    if (next === null) return;
    event.preventDefault();
    select(order[next], { focus: true });
  });
}

function getDefaultPort(root) {
  const keys = [...root.querySelectorAll("[data-port-panel]")].map((panel) => panel.dataset.portPanel);
  return keys.includes(root.dataset.portDefault) ? root.dataset.portDefault : keys[0];
}

export function initPortMap(root) {
  const state = { lanes: [], labels: [] };
  const select = createSelector(root, state);
  root.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-port]");
    if (btn) select(btn.dataset.port);
  });
  bindKeys(root.querySelector("[data-pmap-nodes]"), select);
  select(getDefaultPort(root));
  root.classList.add("is-live");
  whenNear(root.querySelector("[data-pmap-stage]"), () => enhance(root, state));
}

document.querySelectorAll("[data-pmap]").forEach(initPortMap);

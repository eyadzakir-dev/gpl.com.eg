// Interactive port map: inlines the shared Egypt map, swaps its baked port labels for real buttons,
// draws the main trade lanes leaving Egypt and shows each port's facts panel.
import { createField, setField } from "./flap.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PORT_ORDER = ["alx", "dek", "dam", "psd", "sok"];
// Port nodes in the map's 960×960 user space (from port-map-egypt.svg); used to find its leader lines.
const PORT_POINTS = [[424.2, 187.1], [419.1, 191.1], [552.1, 164.9], [588.6, 181.6], [592, 310.7]];
const LEADER_SNAP = 15;
const SHIP_SPEED = 46; // user units per second
const SHIP_GAP_S = 1.4;
const NARROW = matchMedia("(max-width: 899px)");

// Main trade lanes, in map user space. The Suez lane follows the map's own canal route.
const LANES = [
  { id: "eu-alx", from: "alx dek", pts: [[424.2, 187.1], [421, 158], [405, 116], [384, 74], [366, 30]] },
  { id: "us-alx", from: "alx dek", pts: [[419.1, 191.1], [398, 178], [356, 160], [298, 146], [238, 134], [180, 124]] },
  { id: "eu-dam", from: "dam", pts: [[552.1, 164.9], [547, 128], [530, 84], [508, 30]] },
  { id: "eu-psd", from: "psd", pts: [[588.6, 181.6], [590.3, 154.2], [578.2, 106.4], [566, 70], [553, 30]] },
  { id: "asia-psd", from: "psd", pts: [[588.6, 181.6], [589.5, 216.5], [589.6, 236], [594.9, 253.9], [604.4, 261.3], [607.1, 279.5], [605.2, 300], [610.6, 323.2], [626.2, 354.2], [641.8, 385.1], [661.2, 415.9], [683, 446.6], [722.3, 477.2], [764.1, 507.6], [778.2, 538], [793.7, 568.2], [806.5, 598.4], [815, 630]] },
  { id: "gulf-sok", from: "sok", pts: [[592, 310.7], [601, 324], [617, 354], [632, 385], [651, 416], [673, 449], [713, 482], [754, 512], [768, 542], [783, 572], [796, 602], [804, 630]] },
];
// Lane labels per view: [x, y, anchor] in map user space.
const LANE_LABELS = [
  { lanes: "eu-alx eu-dam eu-psd", text: "↑ Europe", wide: [456, 60, "middle"], narrow: [520, 80, "middle"] },
  { lanes: "us-alx", text: "← US East Coast", sub: "via Gibraltar", wide: [240, 108, "start"], narrow: [336, 98, "start"] },
  { lanes: "asia-psd", text: "Asia via Suez ↘", sub: "India · China", wide: [796, 498, "start"], narrow: [638, 398, "end"] },
  { lanes: "gulf-sok", text: "↓ Gulf · East Africa", sub: "via the Red Sea", wide: [744, 528, "end"], narrow: [652, 446, "end"] },
  { lanes: "", text: "Mediterranean Sea", sea: true, wide: [306, 76, "middle"], narrow: null },
];
// Baked sea labels that the crop would cut; the lane layer redraws the Mediterranean one where it fits.
const BAKED_SEA_LABELS = ["MEDITERRANEAN SEA", "RED SEA"];

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

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

function isNearPort(x, y) {
  return PORT_POINTS.some(([px, py]) => Math.hypot(px - x, py - y) < LEADER_SNAP);
}

// Removes the illustration's port labels, leader lines, port dots and its single route; keeps seas, Cairo and furniture.
function stripMap(svg) {
  svg.querySelectorAll("#labels text[data-node]").forEach((label) => {
    if (label.dataset.node === "cairo") return;
    const coords = label.nextElementSibling;
    if (coords && !coords.hasAttribute("data-node")) coords.remove();
    label.remove();
  });
  svg.querySelectorAll("#labels text").forEach((label) => {
    if (BAKED_SEA_LABELS.includes(label.textContent.trim())) label.remove();
  });
  svg.querySelectorAll(".illo-node:not(.illo-node--ref), .illo-route").forEach((node) => node.remove());
  svg.querySelectorAll('path[stroke-width=".8"]').forEach((path) => {
    const match = /^M\s*([\d.]+)[ ,]([\d.]+)/.exec(path.getAttribute("d") || "");
    if (match && isNearPort(Number(match[1]), Number(match[2]))) path.remove();
  });
}

async function inlineMap(img) {
  const response = await fetch(img.currentSrc || img.src);
  if (!response.ok) throw new Error(`Map ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName !== "svg") throw new Error("Map is not an SVG");
  stripMap(svg);
  svg.setAttribute("class", "pmap__img pmap__img--inline");
  svg.setAttribute("focusable", "false");
  img.replaceWith(document.importNode(svg, true));
}

function buildLanes(layer) {
  layer.setAttribute("viewBox", "0 0 960 960");
  const lanes = LANES.map((lane) => {
    const d = toSmoothPath(lane.pts);
    const group = el("g", { class: "lane", "data-lane": lane.id, "data-from": lane.from });
    const base = el("path", { class: "lane__base", d, pathLength: "1" });
    const flow = el("path", { class: "lane__flow", d });
    const ship = el("circle", { class: "lane__ship", r: "3.6", cx: lane.pts[0][0], cy: lane.pts[0][1] });
    group.append(base, flow, ship);
    layer.append(group);
    return { ...lane, group, path: base, ship, length: base.getTotalLength(), t: Math.random() * 3 };
  });
  const labels = LANE_LABELS.map((def) => {
    const text = el("text", { class: def.sea ? "lane__lbl lane__lbl--sea" : "lane__lbl", "data-lanes": def.lanes });
    const main = el("tspan", { class: "lane__lbl-main" });
    main.textContent = def.text;
    text.append(main);
    if (def.sub) {
      const sub = el("tspan", { class: "lane__lbl-sub", dy: "1.25em" });
      sub.textContent = def.sub;
      text.append(sub);
    }
    layer.append(text);
    return { def, text, main, sub: text.querySelector(".lane__lbl-sub") };
  });
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

function moveShips(lanes, dt) {
  lanes.forEach((lane) => {
    const travel = lane.length / SHIP_SPEED;
    lane.t = (lane.t + dt) % (travel + SHIP_GAP_S);
    const progress = Math.min(1, lane.t / travel);
    const point = lane.path.getPointAtLength(progress * lane.length);
    lane.ship.setAttribute("cx", point.x.toFixed(1));
    lane.ship.setAttribute("cy", point.y.toFixed(1));
    const fade = Math.min(1, progress * 8, (1 - progress) * 8);
    lane.ship.style.opacity = lane.t > travel ? 0 : fade.toFixed(2);
  });
}

function startShips(stage, lanes) {
  const loop = { raf: 0, last: 0, visible: false };
  const frame = (now) => {
    const dt = loop.last ? Math.min(0.05, (now - loop.last) / 1000) : 0;
    loop.last = now;
    moveShips(lanes, dt);
    loop.raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    const run = loop.visible && !document.hidden;
    if (run && !loop.raf) { loop.last = 0; loop.raf = requestAnimationFrame(frame); }
    if (!run && loop.raf) { cancelAnimationFrame(loop.raf); loop.raf = 0; }
  };
  new IntersectionObserver(([entry]) => { loop.visible = entry.isIntersecting; sync(); }).observe(stage);
  document.addEventListener("visibilitychange", sync);
}

function createSelector(root, { motion, lanes, labels }) {
  const nodes = [...root.querySelectorAll(".pnode")];
  const items = [...root.querySelectorAll(".pmap__item")];
  const panels = Object.fromEntries([...root.querySelectorAll("[data-port-panel]")].map((p) => [p.dataset.portPanel, p]));
  const codes = Object.fromEntries(Object.entries(panels).map(([key, panel]) => [key, createField(panel.querySelector("[data-port-code]"), 3)]));
  let current = null;

  return function select(port, { focus = false } = {}) {
    if (port === current) return;
    current = port;
    [...nodes, ...items].forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.port === port)));
    nodes.forEach((btn) => { btn.tabIndex = btn.dataset.port === port ? 0 : -1; });
    Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle("is-active", key === port));
    lanes?.forEach((lane) => lane.group.classList.toggle("is-on", lane.from.split(" ").includes(port)));
    labels?.forEach(({ def, text }) => text.classList.toggle("is-on", lanes.some((l) => def.lanes.split(" ").includes(l.id) && l.from.split(" ").includes(port))));
    root.dataset.port = port;
    if (motion) {
      setField(codes[port], "", { animate: false });
      setField(codes[port], port.toUpperCase(), { stagger: 1.5 });
    }
    if (focus) nodes.find((btn) => btn.dataset.port === port)?.focus();
  };
}

function bindKeys(group, select) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  group.addEventListener("keydown", (event) => {
    const btn = event.target.closest(".pnode");
    if (!btn) return;
    const index = PORT_ORDER.indexOf(btn.dataset.port);
    let next = null;
    if (event.key in step) next = (index + step[event.key] + PORT_ORDER.length) % PORT_ORDER.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = PORT_ORDER.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(PORT_ORDER[next], { focus: true });
  });
}

export async function initPortMap(root, { motion }) {
  if (!root) return;
  const stage = root.querySelector("[data-pmap-stage]");
  const { lanes, labels } = buildLanes(root.querySelector("[data-pmap-lanes]"));
  placeLabels(labels);
  NARROW.addEventListener("change", () => placeLabels(labels));
  const select = createSelector(root, { motion, lanes, labels });
  root.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-port]");
    if (btn) select(btn.dataset.port);
  });
  bindKeys(root.querySelector("[data-pmap-nodes]"), select);
  select("alx");
  root.classList.add("is-live");
  if (motion) {
    startShips(stage, lanes);
    new IntersectionObserver(([entry], observer) => {
      if (!entry.isIntersecting) return;
      root.classList.add("is-drawn");
      observer.disconnect();
    }, { threshold: 0.25 }).observe(stage);
  }
  try {
    await inlineMap(root.querySelector("[data-pmap-img]"));
    root.classList.add("is-inline");
  } catch (error) {
    console.warn("Port map: keeping the image version.", error);
  }
}

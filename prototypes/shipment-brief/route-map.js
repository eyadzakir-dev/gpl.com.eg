// Plan-card route map: the chosen move drawn over land rendered as GPL diamond tiles (the logo's checkerboard).
// Land tiles come from the shared globe data; the waypoints below are copied from it and extended for Africa,
// Turkey, air and road. Routes are illustrative, never a sailing schedule.
import { TILE_SETS, landTiles } from "../../assets/js/globe/globe-data.js";

const VIEW_MS = 700;
const DRAW_MS = 1200;
const PULSE_MS = 3800;
const DPR_CAP = 2;
const FRAME_PAD = 0.12;
const MIN_SPAN_DEG = { sea: 70, air: 70, land: 40 };
const X_SCALE = Math.cos((32 * Math.PI) / 180);
const TILE_FILL = 0.8;
const LIT_RADIUS_DEG = 7;
const LABEL_FONT = '500 10.5px "IBM Plex Mono", ui-monospace, monospace';

// [lat, lon] of named points: Egyptian ends, far-end hubs and open-sea turning points.
const P = {
  alexandria: [31.19, 29.87], dekheila: [31.14, 29.8], damietta: [31.47, 31.76], "port-said": [31.26, 32.31], sokhna: [29.62, 32.36],
  cai: [30.12, 31.41], hbe: [30.92, 29.7],
  rotterdam: [51.95, 4.05], mersin: [36.78, 34.64], jebelAli: [25.01, 55.06], shanghai: [30.63, 122.07], newYork: [40.62, -73.95], mombasa: [-4.06, 39.67],
  frankfurt: [50.03, 8.56], istanbul: [41.26, 28.74], dubai: [25.25, 55.36], nairobi: [-1.32, 36.93],
  cairo: [30.04, 31.24], matruh: [31.35, 27.24], salloum: [31.55, 25.15], tobruk: [32.08, 23.96], benghazi: [32.12, 20.07],
  safaga: [26.75, 33.94], duba: [27.35, 35.69], riyadh: [24.71, 46.68],
  alexOff: [31.75, 30.6], dekOff: [31.6, 29.8], damOff: [31.65, 32.0], portSaidOff: [31.45, 32.33], nileOff: [32.3, 31.0], westOff: [32.2, 29.6],
  suezCanal: [30.6, 32.33], suez: [29.9, 32.56], gulfOfSuez: [28.4, 33.15], shadwan: [27.4, 34.0],
  redSeaNorth: [24.0, 36.5], redSeaMid: [19.5, 39.0], redSeaSouth: [15.2, 41.7], babElMandeb: [12.6, 43.4], aden: [12.4, 46.5],
  socotraNorth: [13.4, 52.0], omanSouth: [17.0, 57.8], rasAlHadd: [22.7, 60.3], hormuz: [26.4, 56.7], gulfWest: [25.9, 55.5],
  laccadive: [9.0, 66.0], dondra: [5.5, 80.6], andaman: [6.1, 94.5], malacca: [3.0, 100.7], singapore: [1.2, 104.0],
  southChinaSea: [10.0, 110.2], luzonWest: [18.5, 115.0], taiwanStrait: [23.8, 119.2], zhoushan: [28.9, 122.9],
  guardafui: [12.2, 52.2], somaliaEast: [5.5, 50.2], kenyaOff: [-1.5, 43.8],
  creteSouth: [34.3, 25.0], sicily: [37.3, 11.6], sardiniaSouth: [38.3, 7.0], balearicSouth: [38.6, 1.2], alboran: [36.1, -2.6],
  gibraltar: [35.95, -5.6], stVincent: [36.6, -9.9], finisterre: [43.3, -10.1], ushant: [48.6, -5.9], channel: [50.2, -1.0], dover: [51.1, 1.7],
  atlanticEast: [36.9, -16.0], atlanticMid: [39.6, -42.0], atlanticWest: [40.3, -66.0],
  levant: [33.4, 33.9], cyprusEast: [35.6, 35.25],
};

const CANAL_SOUTH = ["portSaidOff", "suezCanal", "suez", "gulfOfSuez"];
const RED_SEA = ["shadwan", "redSeaNorth", "redSeaMid", "redSeaSouth", "babElMandeb", "aden"];
const MED_WEST = ["creteSouth", "sicily", "sardiniaSouth", "balearicSouth", "alboran", "gibraltar"];

// From each Egyptian port: the legs that reach the Red Sea (east), the western Med (west) and the Levant (north).
const PORT_LEGS = {
  alexandria: { east: ["alexOff", ...CANAL_SOUTH], west: ["westOff"], north: ["alexOff", "nileOff"] },
  dekheila: { east: ["dekOff", "alexOff", ...CANAL_SOUTH], west: ["westOff"], north: ["dekOff", "nileOff"] },
  damietta: { east: ["damOff", ...CANAL_SOUTH], west: ["nileOff"], north: ["damOff"] },
  "port-said": { east: CANAL_SOUTH, west: ["portSaidOff", "nileOff"], north: ["portSaidOff"] },
  sokhna: { east: ["gulfOfSuez"], west: ["suez", "suezCanal", "portSaidOff", "nileOff"], north: ["suez", "suezCanal", "portSaidOff"] },
};

const SEA_TAILS = {
  europe: { via: "west", points: [...MED_WEST, "stVincent", "finisterre", "ushant", "channel", "dover", "rotterdam"] },
  "us-east-coast": { via: "west", points: [...MED_WEST, "atlanticEast", "atlanticMid", "atlanticWest", "newYork"] },
  "turkey-east-med": { via: "north", points: ["levant", "cyprusEast", "mersin"] },
  gulf: { via: "east", points: [...RED_SEA, "socotraNorth", "omanSouth", "rasAlHadd", "hormuz", "gulfWest", "jebelAli"] },
  asia: { via: "east", points: [...RED_SEA, "socotraNorth", "laccadive", "dondra", "andaman", "malacca", "singapore", "southChinaSea", "luzonWest", "taiwanStrait", "zhoushan", "shanghai"] },
  africa: { via: "east", points: [...RED_SEA, "guardafui", "somaliaEast", "kenyaOff", "mombasa"] },
};

const AIR_HUBS = { europe: "frankfurt", "turkey-east-med": "istanbul", gulf: "dubai", asia: "shanghai", "us-east-coast": "newYork", africa: "nairobi" };
const DELTA_PORTS = new Set(["damietta", "port-said", "sokhna"]);

function landPoints(port, region) {
  if (region === "egypt") return [port, "cairo"];
  if (region === "gulf") return [port, ...(port === "sokhna" ? [] : ["cairo"]), "safaga", "duba", "riyadh"];
  return [port, ...(DELTA_PORTS.has(port) ? ["cairo", "alexandria"] : []), "matruh", "salloum", "tobruk", "benghazi"];
}

/** Geometry for a brief: kind, [lat, lon] points in travel order, and the two labelled ends. */
export function buildRoute({ mode, port, region, direction }) {
  let kind = "sea";
  let names;
  if (mode === "air") {
    kind = "air";
    names = [port, AIR_HUBS[region] ?? "frankfurt"];
  } else if (mode === "land") {
    kind = "land";
    names = landPoints(port, region);
  } else {
    const tail = SEA_TAILS[region] ?? SEA_TAILS.europe;
    names = [port, ...PORT_LEGS[port][tail.via], ...tail.points];
  }
  const points = names.map((name) => P[name]);
  const inbound = (direction === "import") !== (region === "egypt");
  return {
    kind,
    points: inbound ? points.reverse() : points,
    egyptAtStart: !inbound,
    key: `${kind}:${names.join(">")}:${inbound}`,
  };
}

/* ---------- Geometry helpers ---------- */

function catmullRom(points, samples) {
  const out = [];
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function arcPoints([a, b], samples) {
  const lift = Math.hypot(b[0] - a[0], (b[1] - a[1]) * X_SCALE) * 0.22;
  const mid = [(a[0] + b[0]) / 2 + lift, (a[1] + b[1]) / 2];
  const out = [];
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1]]);
  }
  return out;
}

function densify(route) {
  if (route.kind === "air") return arcPoints(route.points, 64);
  if (route.kind === "sea") return catmullRom(route.points, 10);
  return route.points;
}

function withLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return { points, lengths, total: lengths[lengths.length - 1] || 1 };
}

function pointAt(path, fraction) {
  const target = path.total * fraction;
  let i = 1;
  while (i < path.lengths.length - 1 && path.lengths[i] < target) i++;
  const span = path.lengths[i] - path.lengths[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (target - path.lengths[i - 1]) / span));
  const [a, b] = [path.points[i - 1], path.points[i]];
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, index: i };
}

function strokePartial(ctx, path, to) {
  const end = pointAt(path, to);
  ctx.beginPath();
  ctx.moveTo(path.points[0][0], path.points[0][1]);
  for (let i = 1; i < end.index; i++) ctx.lineTo(path.points[i][0], path.points[i][1]);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function frameFor(points, kind) {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const minSpan = MIN_SPAN_DEG[kind];
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    spanLat: Math.max(Math.max(...lats) - Math.min(...lats), minSpan * 0.42),
    spanLon: Math.max(Math.max(...lons) - Math.min(...lons), minSpan),
  };
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readPalette(el) {
  const css = getComputedStyle(el);
  const rgb = (name) => hexToRgb(css.getPropertyValue(name).trim() || "#111111");
  return { ink: rgb("--ink"), forest: rgb("--forest"), green: rgb("--green"), greenInk: rgb("--green-ink"), lime: rgb("--lime"), paper: rgb("--paper-hi") };
}

const rgba = ([r, g, b], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

/* ---------- Map ---------- */

export function createRouteMap(canvas, { reducedMotion }) {
  const ctx = canvas.getContext("2d");
  const tiles = landTiles(TILE_SETS.fine);
  const tileStep = TILE_SETS.fine.step;
  const tilesLayer = document.createElement("canvas");
  const palette = readPalette(canvas);
  const state = {
    w: 0, h: 0, dpr: 1,
    view: null, fromView: null, toView: null, viewAt: 0,
    route: null, path: null, geo: null, drawAt: 0, labels: { start: "", end: "" },
    tilesKey: "",
  };
  let raf = 0;
  let isVisible = true;

  const scaleFor = (v) => Math.min((state.w * (1 - 2 * FRAME_PAD)) / (v.spanLon * X_SCALE), (state.h * (1 - 2 * FRAME_PAD)) / v.spanLat);
  const project = (v, s, lat, lon) => [state.w / 2 + (lon - v.lon) * X_SCALE * s, state.h / 2 - (lat - v.lat) * s];

  function layout() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    state.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    state.w = rect.width;
    state.h = rect.height;
    canvas.width = tilesLayer.width = Math.round(state.w * state.dpr);
    canvas.height = tilesLayer.height = Math.round(state.h * state.dpr);
    state.tilesKey = "";
    return true;
  }

  function currentView(now) {
    if (!state.fromView || reducedMotion) return state.toView;
    const t = easeInOut(clamp01((now - state.viewAt) / VIEW_MS));
    const a = state.fromView;
    const b = state.toView;
    return { lat: lerp(a.lat, b.lat, t), lon: lerp(a.lon, b.lon, t), spanLat: Math.exp(lerp(Math.log(a.spanLat), Math.log(b.spanLat), t)), spanLon: Math.exp(lerp(Math.log(a.spanLon), Math.log(b.spanLon), t)) };
  }

  function paintTiles(view, s) {
    const key = `${view.lat.toFixed(3)}|${view.lon.toFixed(3)}|${s.toFixed(3)}|${state.w}|${state.route?.key}`;
    if (key === state.tilesKey) return;
    state.tilesKey = key;
    const c = tilesLayer.getContext("2d");
    c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    c.clearRect(0, 0, state.w, state.h);
    paintGraticule(c, view, s);
    const pts = state.route ? state.route.points : null;
    const foreignEnd = pts ? (state.route.egyptAtStart ? pts[pts.length - 1] : pts[0]) : null;
    const hy = tileStep * s * TILE_FILL;
    for (const tile of tiles) {
      const [x, y] = project(view, s, tile.lat, tile.lon);
      const hx = (tileStep / Math.cos((tile.lat * Math.PI) / 180)) * X_SCALE * s * TILE_FILL;
      if (x < -hx || x > state.w + hx || y < -hy || y > state.h + hy) continue;
      c.fillStyle = tileColour(tile, foreignEnd);
      c.beginPath();
      c.moveTo(x, y - hy);
      c.lineTo(x + hx, y);
      c.lineTo(x, y + hy);
      c.lineTo(x - hx, y);
      c.closePath();
      c.fill();
    }
  }

  function tileColour(tile, foreignEnd) {
    if (tile.egypt) return rgba(palette.green, 0.9);
    const d = foreignEnd ? Math.hypot(tile.lat - foreignEnd[0], (tile.lon - foreignEnd[1]) * X_SCALE) : Infinity;
    const lit = 1 - d / LIT_RADIUS_DEG;
    if (lit > 0) return rgba(palette.lime, 0.3 + lit * 0.55);
    return rgba(palette.ink, [0, 0.14, 0.22, 0.3][tile.level]);
  }

  function paintGraticule(c, view, s) {
    c.strokeStyle = rgba(palette.ink, 0.08);
    c.lineWidth = 1;
    c.beginPath();
    for (let lon = -180; lon <= 180; lon += 15) {
      const [x] = project(view, s, 0, lon);
      if (x < 0 || x > state.w) continue;
      c.moveTo(Math.round(x) + 0.5, 0);
      c.lineTo(Math.round(x) + 0.5, state.h);
    }
    for (let lat = -60; lat <= 75; lat += 15) {
      const [, y] = project(view, s, lat, 0);
      if (y < 0 || y > state.h) continue;
      c.moveTo(0, Math.round(y) + 0.5);
      c.lineTo(state.w, Math.round(y) + 0.5);
    }
    c.stroke();
  }

  function routePath(view, s) {
    return withLengths(state.geo.map(([lat, lon]) => project(view, s, lat, lon)));
  }

  function drawRoute(path, progress) {
    const dashed = state.route.kind !== "sea";
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(palette.lime, 0.5);
    ctx.lineWidth = 7;
    strokePartial(ctx, path, progress);
    ctx.strokeStyle = rgba(palette.forest, 1);
    ctx.lineWidth = 2.25;
    if (dashed) ctx.setLineDash(state.route.kind === "air" ? [7, 5] : [3, 4]);
    strokePartial(ctx, path, progress);
    ctx.restore();
  }

  function drawNode(x, y, size, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawLabel(x, y, text, other) {
    ctx.save();
    ctx.font = LABEL_FONT;
    const width = ctx.measureText(text).width;
    const towardStart = other ? other.x > x : x > state.w / 2;
    let tx = towardStart ? x - 12 - width : x + 12;
    tx = Math.min(Math.max(tx, 6), state.w - width - 6);
    const above = other ? other.y >= y : true;
    const ty = Math.min(Math.max(y + (above ? -12 : 18), 14), state.h - 8);
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(palette.paper, 0.92);
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = rgba(palette.ink, 1);
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  function drawPulse(path, fraction) {
    const head = pointAt(path, fraction);
    ctx.save();
    ctx.fillStyle = rgba(palette.lime, 1);
    ctx.strokeStyle = rgba(palette.forest, 1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    if (!state.w || !state.route) return false;
    const view = currentView(now);
    const s = scaleFor(view);
    paintTiles(view, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tilesLayer, 0, 0);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    const path = routePath(view, s);
    const drawT = reducedMotion ? 1 : easeInOut(clamp01((now - state.drawAt) / DRAW_MS));
    if (drawT > 0) drawRoute(path, drawT);
    const start = path.points[0];
    const end = path.points[path.points.length - 1];
    const isEgyptStart = state.route.egyptAtStart;
    drawNode(start[0], start[1], 9, rgba(isEgyptStart ? palette.forest : palette.paper), rgba(palette.ink));
    if (drawT > 0.92) drawNode(end[0], end[1], 9, rgba(isEgyptStart ? palette.paper : palette.forest), rgba(palette.ink));
    drawLabel(start[0], start[1], state.labels.start, { x: end[0], y: end[1] });
    if (drawT > 0.92) drawLabel(end[0], end[1], state.labels.end, { x: start[0], y: start[1] });
    if (reducedMotion) return false;
    const pulseT = ((now - state.drawAt - DRAW_MS) % PULSE_MS) / PULSE_MS;
    drawPulse(path, drawT < 1 ? drawT : pulseT);
    return true;
  }

  function tick(now) {
    const animating = render(now);
    raf = animating && isVisible && !document.hidden ? requestAnimationFrame(tick) : 0;
  }

  function kick() {
    if (reducedMotion || !isVisible || document.hidden) {
      render(performance.now());
      return;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /** Draws a new route (re-framing and re-drawing only when the geometry changed). */
  function setRoute(route, labels) {
    state.labels = labels;
    if (state.route?.key === route.key) {
      state.tilesKey = "";
      kick();
      return;
    }
    const now = performance.now();
    const next = frameFor(route.points, route.kind);
    state.fromView = state.toView ? currentView(now) : null;
    state.toView = next;
    state.viewAt = now;
    state.drawAt = state.fromView ? now + VIEW_MS * 0.55 : now;
    state.route = route;
    state.geo = densify(route);
    kick();
  }

  new ResizeObserver(() => { if (layout()) kick(); }).observe(canvas);
  new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; kick(); }).observe(canvas);
  document.addEventListener("visibilitychange", kick);
  document.fonts?.ready.then(() => { state.tilesKey = ""; kick(); });

  return { setRoute };
}

// GPL route globe: Egypt's ports and the main sea trade lanes on a sphere of diamond land tiles that echoes the
// GPL mark (forest -> green -> lime across the visible hemisphere, paper ocean, ink lanes with green pulses).
// Progressive enhancement of `figure[data-globe]`: the flat SVG diagram stays visible until the first WebGL
// frame is drawn, and stays for good if WebGL2 is unavailable or fails. Styles: ./globe.css (linked or injected).
import { landTiles, latLonToVec, LANES, ORIGINS, DESTINATIONS, PIN_PLACES, TILE_SETS } from './globe-data.js';
import {
  BEZEL_FRAGMENT, BEZEL_VERTEX, LANE_BASE_FRAGMENT, LANE_PULSE_FRAGMENT, LANE_VERTEX, MARKER_FRAGMENT, MARKER_VERTEX,
  OCEAN_FRAGMENT, OCEAN_VERTEX, RIPPLE_FRAGMENT, RIPPLE_VERTEX, TILE_FRAGMENT, TILE_VERTEX,
} from './globe-shaders.js';

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const NARROW = matchMedia('(max-width: 899px)');
const COARSE_POINTER = matchMedia('(pointer: coarse)');
const STYLE_URL = new URL('./globe.css', import.meta.url).href;
const STYLE_TIMEOUT_MS = 8000;
const DEG = Math.PI / 180;

const HOME = { lon: 31, tilt: 28 };
const INTRO = { seconds: 3.6, lon: HOME.lon - 120, tilt: 8 };
const TILT_LIMITS = [-25, 65];
const SWAY = { deg: 9, period: 40 };
const RETURN_DELAY = 3;
const RETURN_RATE = 1.2;
const INERTIA_DAMPING = 2.6;
const MIN_SPIN = 0.6;
const DRAG_STALE_MS = 90;
const TOUCH_TILT_SCALE = 0.5;
const MAX_DT = 0.05;
const STILL_TIME = 6.5;

const RADIUS_FRACTION = { wide: 0.43, narrow: 0.42 };
const DPR_CAP = { wide: 2, narrow: 1.5 };
const ADAPT = { frames: 40, slowMs: 34 };
const OCEAN_RADIUS = 0.997;
const TILE_RADIUS = 1.0015;
const TILE_FILL = 0.9;
const LEVEL_SCALE = [0, 0.5, 0.74, 1];
const LANE = { alt: 1.006, endAlt: 1.003, taper: 0.03, smoothing: 3, stepRad: 0.6 * DEG };
const LANE_PX = { line: 1.25, pulse: 3 };
const PULSE = { speed: 0.24, tail: 0.3, rest: 1.2 };
const MARKER_ALT = 1.007;
const MARKER_PX = { origin: 8, destination: 6.5, ripple: 72 };
const PIN = { minZ: 0.1, gap: 4, pad: 3, obstacle: 7, narrowLead: 0.7, settleFrames: 30, reach: [1, 1.8, 3] };
const BEZEL = { ring: 1.075, tick: 0.022, major: 0.042 };

// Logo samples, used only when the page has not defined the design tokens.
const THEME_FALLBACK = {
  '--forest': '#00451F', '--green': '#0A8A41', '--lime': '#8CC63F',
  '--ink': '#111111', '--paper': '#F3F1EC', '--paper-hi': '#FAF9F5',
};
const DIRS = {
  e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1],
  ne: [Math.SQRT1_2, -Math.SQRT1_2], nw: [-Math.SQRT1_2, -Math.SQRT1_2],
  se: [Math.SQRT1_2, Math.SQRT1_2], sw: [-Math.SQRT1_2, Math.SQRT1_2],
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutQuart = (t) => 1 - (1 - t) ** 4;
const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
const vecOf = ({ lat, lon }) => latLonToVec(lat, lon);

/* ---------- Projection shared by the WebGL scene and the HTML pins ---------- */

// Same rotation as three.js Euler(tilt, -lon, 0): Ry(-lon) first, then Rx(tilt). View centre = (tilt, lon).
function rotateView([x, y, z], lonDeg, tiltDeg) {
  const cy = Math.cos(lonDeg * DEG), sy = Math.sin(lonDeg * DEG);
  const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
  const cx = Math.cos(tiltDeg * DEG), sx = Math.sin(tiltDeg * DEG);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

function toScreen(v, view, box) {
  const [x, y, z] = rotateView(v, view.lon, view.tilt);
  return { x: box.cx + x * box.r * MARKER_ALT, y: box.cy - y * box.r * MARKER_ALT, z };
}

function measure(figure) {
  const w = figure.clientWidth, h = figure.clientHeight;
  const fraction = NARROW.matches ? RADIUS_FRACTION.narrow : RADIUS_FRACTION.wide;
  return { w, h, cx: w / 2, cy: h / 2, r: Math.min(w, h) * fraction };
}

/* ---------- Theme: design tokens read from the page ---------- */

function readTheme(THREE, figure) {
  const style = getComputedStyle(figure);
  const color = (name) => {
    const value = style.getPropertyValue(name).trim() || THEME_FALLBACK[name];
    // Tagged linear so three.js keeps the raw sRGB numbers; the shaders mix and output in sRGB like CSS does.
    return new THREE.Color().setStyle(value, THREE.LinearSRGBColorSpace);
  };
  return {
    forest: color('--forest'), green: color('--green'), lime: color('--lime'),
    ink: color('--ink'), paper: color('--paper'), paperHi: color('--paper-hi'),
  };
}

/* ---------- Lane geometry: smoothed sea lanes on the sphere ---------- */

const normalize = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const mix3 = (a, b, t) => a.map((c, k) => c + (b[k] - c) * t);
const angleBetween = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));

function chaikin(points, rounds) {
  let out = points;
  for (let r = 0; r < rounds; r++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      next.push(normalize(mix3(out[i], out[i + 1], 0.25)), normalize(mix3(out[i], out[i + 1], 0.75)));
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

function slerpDense(points) {
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const angle = angleBetween(a, b);
    const steps = Math.max(1, Math.ceil(angle / LANE.stepRad));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const wa = Math.sin((1 - t) * angle) / Math.sin(angle), wb = Math.sin(t * angle) / Math.sin(angle);
      out.push(angle < 1e-6 ? b : a.map((c, k) => c * wa + b[k] * wb));
    }
  }
  return out;
}

function laneSamples(lane) {
  const smooth = slerpDense(chaikin(lane.points.map(([lat, lon]) => latLonToVec(lat, lon)), LANE.smoothing));
  const dist = [0];
  for (let i = 1; i < smooth.length; i++) dist.push(dist[i - 1] + angleBetween(smooth[i - 1], smooth[i]));
  const length = dist[dist.length - 1];
  const ramp = (d) => clamp01(d / LANE.taper) ** 0.5;
  const points = smooth.map((v, i) => {
    const lift = (lane.fromPort ? ramp(dist[i]) : 1) * (lane.toPort ? ramp(length - dist[i]) : 1);
    return v.map((c) => c * lerp(LANE.endAlt, LANE.alt, lift));
  });
  return { points, t: dist.map((d) => d / length), length };
}

/* ---------- Scene parts ---------- */

function overlayMaterial(THREE, options) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, ...options });
}

function createOcean(THREE, theme) {
  const material = new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    uniforms: { uPaper: { value: theme.paper }, uPaperHi: { value: theme.paperHi }, uInk: { value: theme.ink } },
  });
  return new THREE.Mesh(new THREE.SphereGeometry(OCEAN_RADIUS, 96, 64), material);
}

function createTiles(THREE, theme, set) {
  const tiles = landTiles(set);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(tiles.flatMap((t) => latLonToVec(t.lat, t.lon))), 3));
  geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(tiles.map((t) => LEVEL_SCALE[t.level])), 1));
  geometry.setAttribute('aEgypt', new THREE.InstancedBufferAttribute(new Float32Array(tiles.map((t) => (t.egypt ? 1 : 0))), 1));
  geometry.instanceCount = tiles.length;
  const material = new THREE.ShaderMaterial({
    vertexShader: TILE_VERTEX,
    fragmentShader: TILE_FRAGMENT,
    transparent: true,
    uniforms: {
      uHalf: { value: set.step * DEG * TILE_FILL }, uRadius: { value: TILE_RADIUS },
      uForest: { value: theme.forest }, uGreen: { value: theme.green }, uLime: { value: theme.lime }, uInk: { value: theme.ink },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

function laneTiming(length, index) {
  const period = (length + PULSE.tail) / PULSE.speed + PULSE.rest;
  return [length, (index * 2.37) % period, period];
}

function pushLane(buffers, lane, index) {
  const { points, t, length } = laneSamples(lane);
  const timing = laneTiming(length, index);
  const base = buffers.position.length / 3;
  points.forEach((p, i) => {
    const next = i < points.length - 1 ? points[i + 1] : p.map((c, k) => 2 * c - points[i - 1][k]);
    for (const side of [-1, 1]) {
      buffers.position.push(...p);
      buffers.next.push(...next);
      buffers.side.push(side);
      buffers.t.push(t[i]);
      buffers.lane.push(...timing);
    }
    if (i < points.length - 1) {
      const v = base + i * 2;
      buffers.index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  });
}

function createLanes(THREE, theme) {
  const buffers = { position: [], next: [], side: [], t: [], lane: [], index: [] };
  LANES.forEach((lane, i) => pushLane(buffers, lane, i));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.position, 3));
  geometry.setAttribute('aNext', new THREE.Float32BufferAttribute(buffers.next, 3));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(buffers.side, 1));
  geometry.setAttribute('aT', new THREE.Float32BufferAttribute(buffers.t, 1));
  geometry.setAttribute('aLane', new THREE.Float32BufferAttribute(buffers.lane, 3));
  geometry.setIndex(buffers.index);
  const time = { value: 0 };
  const colors = { uInk: { value: theme.ink }, uGreen: { value: theme.green }, uLime: { value: theme.lime } };
  const make = (fragmentShader, width, pulseWidth, order) => {
    const mesh = new THREE.Mesh(geometry, overlayMaterial(THREE, {
      vertexShader: LANE_VERTEX,
      fragmentShader,
      uniforms: {
        ...colors, uTime: time, uWidth: { value: width }, uPulseWidth: { value: pulseWidth },
        uSpeed: { value: PULSE.speed }, uTail: { value: PULSE.tail },
      },
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    return mesh;
  };
  return {
    meshes: [make(LANE_BASE_FRAGMENT, LANE_PX.line, 0, 2), make(LANE_PULSE_FRAGMENT, LANE_PX.line, LANE_PX.pulse, 3)],
    time,
  };
}

function markerPoints() {
  const origins = Object.values(ORIGINS).map((p) => ({ v: vecOf(p), kind: 1 }));
  const destinations = Object.values(DESTINATIONS).map((p) => ({ v: vecOf(p), kind: 0 }));
  return [...destinations, ...origins];
}

function createMarkers(THREE, theme) {
  const points = markerPoints();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => p.v.map((c) => c * MARKER_ALT)), 3));
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(points.map((p) => p.kind), 1));
  const material = overlayMaterial(THREE, {
    vertexShader: MARKER_VERTEX,
    fragmentShader: MARKER_FRAGMENT,
    depthTest: false,
    uniforms: {
      uInk: { value: theme.ink }, uPaperHi: { value: theme.paperHi }, uGreen: { value: theme.green },
      uOriginPx: { value: MARKER_PX.origin }, uDestPx: { value: MARKER_PX.destination }, uDpr: { value: 1 },
    },
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

// Two staggered rings on the centre of Egypt's port cluster.
function createRipples(THREE, theme, time) {
  const hub = normalize(Object.values(ORIGINS).map(vecOf).reduce((sum, v) => sum.map((c, k) => c + v[k]), [0, 0, 0]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...hub, ...hub].map((c) => c * MARKER_ALT), 3));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute([0, 0.5], 1));
  const material = overlayMaterial(THREE, {
    vertexShader: RIPPLE_VERTEX,
    fragmentShader: RIPPLE_FRAGMENT,
    depthTest: false,
    uniforms: { uGreen: { value: theme.green }, uTime: time, uPx: { value: MARKER_PX.ripple }, uOn: { value: 1 } },
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

function createBezel(THREE, theme) {
  const size = 2 * (BEZEL.ring + BEZEL.major + 0.02);
  const material = overlayMaterial(THREE, {
    vertexShader: BEZEL_VERTEX,
    fragmentShader: BEZEL_FRAGMENT,
    depthTest: false,
    uniforms: {
      uInk: { value: theme.ink }, uRadiusPx: { value: 100 },
      uRing: { value: BEZEL.ring }, uTick: { value: BEZEL.tick }, uMajor: { value: BEZEL.major },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.renderOrder = 6;
  return mesh;
}

/* ---------- Renderer ---------- */

function pixelRatio(limit) {
  const cap = NARROW.matches || COARSE_POINTER.matches ? DPR_CAP.narrow : DPR_CAP.wide;
  return Math.min(window.devicePixelRatio || 1, cap, limit);
}

function createRenderer(THREE, canvas, theme) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  const globe = new THREE.Group();
  const spin = new THREE.Group();
  const lanes = createLanes(THREE, theme);
  const markers = createMarkers(THREE, theme);
  const ripples = createRipples(THREE, theme, lanes.time);
  const bezel = createBezel(THREE, theme);
  const tileSet = NARROW.matches ? TILE_SETS.coarse : TILE_SETS.fine;
  spin.add(createOcean(THREE, theme), createTiles(THREE, theme, tileSet), ...lanes.meshes, ripples, markers);
  globe.add(spin, bezel);
  scene.add(globe);

  let dprLimit = Infinity;
  return {
    get pixelRatio() { return renderer.getPixelRatio(); },
    limitPixelRatio(limit) { dprLimit = limit; },
    resize(box) {
      const dpr = pixelRatio(dprLimit);
      renderer.setPixelRatio(dpr);
      renderer.setSize(box.w, box.h, false);
      Object.assign(camera, { left: -box.w / 2, right: box.w / 2, top: box.h / 2, bottom: -box.h / 2 });
      camera.updateProjectionMatrix();
      const u = markers.material.uniforms;
      u.uOriginPx.value = MARKER_PX.origin * dpr;
      u.uDestPx.value = MARKER_PX.destination * dpr;
      u.uDpr.value = dpr;
      ripples.material.uniforms.uPx.value = MARKER_PX.ripple * dpr;
      bezel.material.uniforms.uRadiusPx.value = box.r;
    },
    render(view, box, time, motion) {
      globe.position.set(box.cx - box.w / 2, box.h / 2 - box.cy, 0);
      globe.scale.setScalar(box.r);
      spin.rotation.set(view.tilt * DEG, -view.lon * DEG, 0);
      lanes.time.value = time;
      ripples.material.uniforms.uOn.value = motion ? 1 : 0;
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/* ---------- HTML pins: tags with leader lines, laid out greedily so they never overlap ---------- */

function createPins(figure) {
  return [...figure.querySelectorAll('.globe__pin[data-pin]')]
    .filter((el) => PIN_PLACES[el.dataset.pin])
    .map((el) => ({
      el,
      tag: el.querySelector('.globe__tag'),
      v: vecOf(PIN_PLACES[el.dataset.pin]),
      spots: candidateSpots(el.dataset.dirs),
      lead: Number(el.dataset.lead) || 10,
      w: 0, h: 0, spot: null,
    }));
}

// `data-dirs` tokens are tried in order ("s", or "s:1.8" for a longer leader), then every listed direction at
// each PIN.reach multiple.
function candidateSpots(dirList = 'e w') {
  const tokens = dirList.trim().split(/\s+/).map((token) => token.split(':')).filter(([dir]) => DIRS[dir]);
  const explicit = tokens.map(([dir, reach]) => [dir, Number(reach) || 1]);
  const dirs = [...new Set(tokens.map(([dir]) => dir))];
  const spread = PIN.reach.flatMap((reach) => dirs.map((dir) => [dir, reach]));
  const seen = new Set();
  return [...explicit, ...spread].filter(([dir, reach]) => !seen.has(`${dir}${reach}`) && seen.add(`${dir}${reach}`));
}

function measurePins(pins) {
  pins.forEach((pin) => { pin.w = pin.tag.offsetWidth; pin.h = pin.tag.offsetHeight; });
}

function tagRect(pin, p, [dir, reach]) {
  const [ux, uy] = DIRS[dir];
  const lead = pin.lead * reach * (NARROW.matches ? PIN.narrowLead : 1);
  const ex = ux * lead, ey = uy * lead;
  let x = ex - pin.w / 2;
  if (ux > 0.3) x = ex + PIN.gap * 0.5;
  if (ux < -0.3) x = ex - pin.w - PIN.gap * 0.5;
  let y = ey - pin.h / 2;
  if (uy < -0.3) y = ey - pin.h;
  if (uy > 0.3) y = ey;
  return { dir, reach, lead, x, y, left: p.x + x, top: p.y + y, right: p.x + x + pin.w, bottom: p.y + y + pin.h };
}

const overlaps = (a, b) => a.left < b.right + PIN.pad && b.left < a.right + PIN.pad && a.top < b.bottom + PIN.pad && b.top < a.bottom + PIN.pad;
const fitsBox = (r, box) => r.left >= PIN.gap && r.top >= PIN.gap && r.right <= box.w - PIN.gap && r.bottom <= box.h - PIN.gap;

function anchorObstacles(spots, skip) {
  const half = PIN.obstacle / 2;
  return spots.filter((s) => s !== skip && s.visible).map(({ p }) => ({ left: p.x - half, right: p.x + half, top: p.y - half, bottom: p.y + half }));
}

function firstFit(pin, p, spots, placed, box) {
  for (const spot of spots) {
    const rect = tagRect(pin, p, spot);
    if (fitsBox(rect, box) && !placed.some((q) => overlaps(rect, q))) return rect;
  }
  return null;
}

// Keeps the current direction while it fits, so tags do not flicker during rotation; switches back to a more
// preferred direction only after it has fitted for PIN.settleFrames frames in a row.
function chooseRect(pin, p, placed, box) {
  const best = firstFit(pin, p, pin.spots, placed, box);
  const same = (rect) => rect && pin.spot && rect.dir === pin.spot[0] && rect.reach === pin.spot[1];
  const current = pin.spot && !same(best) ? firstFit(pin, p, [pin.spot], placed, box) : null;
  if (!current) { pin.better = 0; return best; }
  pin.better = (pin.better || 0) + 1;
  if (pin.better < PIN.settleFrames) return current;
  pin.better = 0;
  return best;
}

function applyPin(pin, p, rect) {
  const { el } = pin;
  el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  el.classList.toggle('is-hidden', !rect);
  if (!rect) return;
  pin.spot = [rect.dir, rect.reach];
  const [ux, uy] = DIRS[rect.dir];
  el.style.setProperty('--tx', `${rect.x.toFixed(1)}px`);
  el.style.setProperty('--ty', `${rect.y.toFixed(1)}px`);
  el.style.setProperty('--lead', `${rect.lead.toFixed(1)}px`);
  el.style.setProperty('--ang', `${(Math.atan2(uy, ux) / DEG).toFixed(1)}deg`);
}

function placePins(pins, view, box) {
  const spots = pins.map((pin) => {
    const p = toScreen(pin.v, view, box);
    return { pin, p, visible: p.z > PIN.minZ && p.x > 0 && p.x < box.w && p.y > 0 && p.y < box.h };
  });
  const placed = [];
  spots.forEach((spot) => {
    const rect = spot.visible ? chooseRect(spot.pin, spot.p, [...placed, ...anchorObstacles(spots, spot)], box) : null;
    if (rect) placed.push(rect);
    applyPin(spot.pin, spot.p, rect);
  });
}

function resetPins(pins) {
  pins.forEach(({ el }) => {
    el.classList.remove('is-hidden');
    ['transform', '--tx', '--ty', '--lead', '--ang'].forEach((prop) => el.style.removeProperty(prop));
  });
}

/* ---------- Motion: intro settle, sway, drag with inertia, drift home ---------- */

function createMotion(still) {
  const s = {
    still, lon: still ? HOME.lon : INTRO.lon, tilt: still ? HOME.tilt : INTRO.tilt,
    vLon: 0, vTilt: 0, phase: still ? 'rest' : 'intro', clock: 0, idle: 0, sway: 0, lastMove: 0,
  };
  const setTilt = (tilt) => { s.tilt = clamp(tilt, ...TILT_LIMITS); };
  return {
    get view() { return { lon: s.lon, tilt: s.tilt }; },
    get dragging() { return s.phase === 'drag'; },
    setStill(value) {
      s.still = value;
      if (value) s.phase = 'rest';
      else if (s.phase === 'rest') { s.phase = 'idle'; s.idle = 0; }
    },
    grab() { s.phase = 'drag'; s.vLon = 0; s.vTilt = 0; },
    drag(dLon, dTilt, dt, now) {
      s.lon = wrap180(s.lon + dLon);
      setTilt(s.tilt + dTilt);
      const k = clamp01(dt * 18);
      s.vLon = lerp(s.vLon, dLon / dt, k);
      s.vTilt = lerp(s.vTilt, dTilt / dt, k);
      s.lastMove = now;
    },
    release(now, fling) {
      if (!fling || now - s.lastMove > DRAG_STALE_MS) { s.vLon = 0; s.vTilt = 0; }
      s.phase = s.still ? 'rest' : 'coast';
      s.idle = 0;
    },
    step(dt) {
      if (s.phase === 'intro') stepIntro(s, dt);
      else if (s.phase === 'coast') stepCoast(s, dt, setTilt);
      else if (s.phase === 'idle') stepIdle(s, dt);
    },
  };
}

function stepIntro(s, dt) {
  s.clock += dt;
  const k = easeOutQuart(clamp01(s.clock / INTRO.seconds));
  s.lon = lerp(INTRO.lon, HOME.lon, k);
  s.tilt = lerp(INTRO.tilt, HOME.tilt, k);
  if (s.clock >= INTRO.seconds) { s.phase = 'idle'; s.idle = RETURN_DELAY; }
}

function stepCoast(s, dt, setTilt) {
  s.lon = wrap180(s.lon + s.vLon * dt);
  setTilt(s.tilt + s.vTilt * dt);
  const damp = Math.exp(-INERTIA_DAMPING * dt);
  s.vLon *= damp;
  s.vTilt *= damp;
  if (Math.hypot(s.vLon, s.vTilt) < MIN_SPIN) { s.phase = 'idle'; s.idle = 0; }
}

function stepIdle(s, dt) {
  s.idle += dt;
  if (s.idle < RETURN_DELAY) return;
  s.sway += dt;
  const target = HOME.lon + SWAY.deg * Math.sin((2 * Math.PI * s.sway) / SWAY.period);
  const k = 1 - Math.exp(-RETURN_RATE * dt);
  s.lon = wrap180(s.lon + wrap180(target - s.lon) * k);
  s.tilt += (HOME.tilt - s.tilt) * k;
}

/* ---------- Pointer input: drag to rotate; vertical touch swipes keep scrolling the page ---------- */

function bindDrag(stage, motion, box, onChange) {
  let active = null;
  const down = (e) => {
    if (active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    active = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, touch: e.pointerType !== 'mouse' };
    stage.setPointerCapture?.(e.pointerId);
    motion.grab();
    onChange(true);
  };
  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const r = box().r || 1;
    const dt = Math.max(0.008, (e.timeStamp - active.t) / 1000);
    const dLon = -((e.clientX - active.x) / r) / DEG;
    const dTilt = ((e.clientY - active.y) / r / DEG) * (active.touch ? TOUCH_TILT_SCALE : 1);
    Object.assign(active, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    motion.drag(dLon, dTilt, dt, e.timeStamp);
    onChange(true);
  };
  const up = (e) => {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    motion.release(e.timeStamp, e.type === 'pointerup');
    onChange(false);
  };
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, lostpointercapture: up };
  Object.entries(events).forEach(([type, fn]) => stage.addEventListener(type, fn));
  return () => Object.entries(events).forEach(([type, fn]) => stage.removeEventListener(type, fn));
}

/* ---------- Frame loop: runs only while the figure is on screen and the tab is visible ---------- */

function createLoop(figure, frame) {
  const state = { raf: 0, last: 0, visible: false, running: false };
  const tick = (now) => {
    state.raf = requestAnimationFrame(tick);
    const rawDt = state.last ? (now - state.last) / 1000 : 0;
    state.last = now;
    frame(Math.min(MAX_DT, rawDt), rawDt);
  };
  const sync = () => {
    const go = state.running && state.visible && !document.hidden;
    if (go && !state.raf) { state.last = 0; state.raf = requestAnimationFrame(tick); }
    if (!go && state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  };
  const observer = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; sync(); });
  observer.observe(figure);
  document.addEventListener('visibilitychange', sync);
  return {
    set running(value) { state.running = value; sync(); },
    get active() { return Boolean(state.raf); },
    dispose() {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    },
  };
}

/* ---------- Styles ---------- */

function ensureStyles() {
  const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find((link) => link.href === STYLE_URL);
  if (existing?.sheet) return Promise.resolve();
  const link = existing || Object.assign(document.createElement('link'), { rel: 'stylesheet', href: STYLE_URL });
  if (!existing) document.head.append(link);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('globe.css timed out')), STYLE_TIMEOUT_MS);
    link.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    link.addEventListener('error', () => { clearTimeout(timer); reject(new Error('globe.css failed to load')); }, { once: true });
  });
}

function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/* ---------- Lifecycle ---------- */

// One-shot: if the first frames average slower than ~30 fps at a high pixel ratio, render at 1x from then on.
function createResolutionGuard(renderer, onLowered) {
  let frames = 0, time = 0, done = false;
  return (rawDt) => {
    if (done || !rawDt) return;
    frames += 1;
    time += rawDt;
    if (frames < ADAPT.frames) return;
    done = true;
    if ((time / frames) * 1000 < ADAPT.slowMs || renderer.pixelRatio <= 1) return;
    renderer.limitPixelRatio(1);
    onLowered();
  };
}

function mountGlobe(THREE, figure) {
  const canvas = figure.querySelector('.globe__canvas');
  const renderer = createRenderer(THREE, canvas, readTheme(THREE, figure));
  try {
    return startGlobe(figure, canvas, renderer);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

function startGlobe(figure, canvas, renderer) {
  const stage = figure.querySelector('.globe__stage') || canvas.parentElement;
  const pins = createPins(figure);
  const motion = createMotion(REDUCED_MOTION.matches);
  let box = measure(figure);
  let elapsed = REDUCED_MOTION.matches ? STILL_TIME : 0;
  let pending = 0;

  const draw = () => {
    const animated = !REDUCED_MOTION.matches;
    renderer.render(motion.view, box, animated ? elapsed : STILL_TIME, animated);
    placePins(pins, motion.view, box);
  };
  const requestDraw = () => {
    if (pending || loop.active) return;
    pending = requestAnimationFrame(() => { pending = 0; draw(); });
  };
  const loop = createLoop(figure, (dt, rawDt) => {
    elapsed += dt;
    motion.step(dt);
    draw();
    guardResolution(rawDt);
  });
  const guardResolution = createResolutionGuard(renderer, () => resize());
  const resize = () => {
    box = measure(figure);
    renderer.resize(box);
    measurePins(pins);
    draw();
  };
  const onMotionPreference = () => {
    motion.setStill(REDUCED_MOTION.matches);
    loop.running = !REDUCED_MOTION.matches;
    requestDraw();
  };
  const onDrag = (isDragging) => {
    figure.classList.toggle('is-dragging', isDragging && motion.dragging);
    requestDraw();
  };
  const unbindDrag = bindDrag(stage, motion, () => box, onDrag);
  const resizeObserver = new ResizeObserver(resize);
  const onContextLost = () => destroy();
  let destroyed = false;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    loop.dispose();
    cancelAnimationFrame(pending);
    resizeObserver.disconnect();
    unbindDrag();
    REDUCED_MOTION.removeEventListener('change', onMotionPreference);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    renderer.dispose();
    resetPins(pins);
    figure.classList.remove('is-live', 'is-gl', 'is-dragging');
    delete figure.globe;
  }

  // Same task as the first draw, so the diagram never disappears before the globe has painted.
  figure.classList.add('is-live', 'is-gl');
  resize();
  resizeObserver.observe(figure);
  REDUCED_MOTION.addEventListener('change', onMotionPreference);
  canvas.addEventListener('webglcontextlost', onContextLost);
  document.fonts?.ready.then(() => { if (!destroyed) { measurePins(pins); requestDraw(); } });
  loop.running = !REDUCED_MOTION.matches;
  return { destroy, get view() { return motion.view; } };
}

/**
 * Turns `figure[data-globe]` into the live globe. Resolves to a controller `{ destroy(), view }`, or `null`
 * when the flat diagram is kept (no WebGL2, styles or three.js failed to load, or a WebGL error).
 */
export async function initGlobe(figure) {
  if (figure.globe) return figure.globe;
  if (!figure.querySelector('.globe__canvas') || !hasWebGL2()) return null;
  try {
    const [THREE] = await Promise.all([import('../vendor/three.module.min.js'), ensureStyles()]);
    figure.globe = mountGlobe(THREE, figure);
    return figure.globe;
  } catch (error) {
    figure.classList.remove('is-live', 'is-gl');
    console.warn('Route globe unavailable; keeping the flat diagram.', error);
    return null;
  }
}

/** Tears the globe down and restores the flat diagram. */
export function destroyGlobe(figure) {
  figure.globe?.destroy();
}

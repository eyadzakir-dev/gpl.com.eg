// Tile sphere scene: one instanced mesh of diamond tiles that flies in from a point, assembles the GPL logo
// sphere, migrates onto the land of a route globe and finally collapses into a single point.
// Every tile carries two shapes (logo lattice cell, land cell); the vertex shader blends between them, so the
// CPU only updates a handful of uniforms per frame. Only ever loaded with dynamic import (three.js is heavy).
import * as THREE from '../../assets/js/vendor/three.module.min.js';
import { landTiles, latLonToVec, LANES, ORIGINS, TILE_SETS } from '../../assets/js/globe/globe-data.js';
import { LOGO, logoSubTiles } from './logo-model.js';

const DEG = Math.PI / 180;
const SUB = 3;
const PAIR_VIEW = { lon: 31, tilt: 24 };
const HUB = { lat: 30.6, lon: 31.2 };
const TILE_FILL = 0.88;
const LEVEL_SCALE = [0, 0.5, 0.74, 1];
const SEAM_OVERLAP = 1.025;
const LANE = { alt: 1.008, endAlt: 1.004, taper: 0.03, smoothing: 3, stepRad: 0.6 * DEG };
const LANE_PX = { line: 1.4, head: 4 };
const REGIONS = ['northEurope', 'westMed', 'eastMed', 'usEast', 'china', 'india', 'gulf'];
const BEZEL = { ring: 1.06, tick: 0.02, major: 0.04 };
const DPR_CAP = { wide: 2, narrow: 1.5 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const normalize = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const mix3 = (a, b, t) => a.map((c, k) => c + (b[k] - c) * t);
const angleBetween = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));

/* ---------- View rotation shared with the HTML pins (same convention as assets/js/globe/globe.js) ---------- */

export function rotateView([x, y, z], lonDeg, tiltDeg) {
  const cy = Math.cos(lonDeg * DEG), sy = Math.sin(lonDeg * DEG);
  const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
  const cx = Math.cos(tiltDeg * DEG), sx = Math.sin(tiltDeg * DEG);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

function viewMatrix(THREEmat, lon, tilt) {
  const ex = rotateView([1, 0, 0], lon, tilt), ey = rotateView([0, 1, 0], lon, tilt), ez = rotateView([0, 0, 1], lon, tilt);
  return THREEmat.set(ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]);
}

/* ---------- Pairing logo tiles with land tiles: Hilbert order on the view-frame map keeps flights short ---------- */

function hilbertIndex(n, x, y) {
  let d = 0;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
  }
  return d;
}

function mapKey([x, y, z]) {
  const n = 1024;
  const u = (Math.atan2(x, z) / Math.PI + 1) / 2, v = (Math.asin(clamp(y, -1, 1)) / Math.PI) + 0.5;
  return hilbertIndex(n, Math.min(n - 1, Math.floor(u * n)), Math.min(n - 1, Math.floor(v * n)));
}

function logoCentre(frame, t) {
  const s = Math.sin(t.theta), c = Math.cos(t.theta), cp = Math.cos(t.phi), sp = Math.sin(t.phi);
  return [0, 1, 2].map((k) => frame.axis[k] * c + s * (frame.e1[k] * cp + frame.e2[k] * sp));
}

function buildInstances(narrow) {
  const { frame, tiles: sources } = logoSubTiles(SUB);
  const set = narrow ? TILE_SETS.coarse : TILE_SETS.fine;
  const land = landTiles(set);
  const hub = latLonToVec(HUB.lat, HUB.lon);
  const srcKeyed = sources.map((t) => ({ t, key: mapKey(logoCentre(frame, t)) })).sort((a, b) => a.key - b.key);
  const dstKeyed = land.map((t) => {
    const v = latLonToVec(t.lat, t.lon);
    return { t, v, key: mapKey(rotateView(v, PAIR_VIEW.lon, PAIR_VIEW.tilt)) };
  }).sort((a, b) => a.key - b.key);
  const nS = srcKeyed.length, nT = dstKeyed.length;
  const count = Math.max(nS, nT);
  const pairs = [];
  if (nT >= nS) {
    for (let j = 0; j < nT; j++) pairs.push([srcKeyed[Math.floor((j * nS) / nT)], dstKeyed[j]]);
  } else {
    const taken = new Map();
    for (let j = 0; j < nT; j++) taken.set(Math.floor((j * nS) / nT), dstKeyed[j]);
    for (let i = 0; i < nS; i++) pairs.push([srcKeyed[i], taken.get(i) || null]);
  }
  const maxDist = Math.max(...dstKeyed.map((d) => angleBetween(d.v, hub)));
  const rand = mulberry(7);
  const data = {
    logo: new Float32Array(count * 4), geo: new Float32Array(count * 4),
    time: new Float32Array(count * 4), flag: new Float32Array(count * 3),
  };
  pairs.forEach(([src, dst], i) => {
    const s = src.t;
    data.logo.set([s.phi, s.theta, s.halfPhi, s.halfTheta], i * 4);
    const seed = rand();
    if (dst) {
      const half = set.step * DEG * TILE_FILL * LEVEL_SCALE[dst.t.level];
      const lat = dst.t.lat * DEG;
      data.geo.set([lat, dst.t.lon * DEG, half, half / Math.max(0.2, Math.cos(lat))], i * 4);
    }
    const reach = dst ? angleBetween(dst.v, hub) / maxDist : 0.15 * seed;
    const introDelay = s.front < -0.25 ? -1 : s.sweep * 0.62 + seed * 0.2;
    data.time.set([introDelay, reach * 0.58 + seed * 0.04, seed, (dst ? reach : seed) * 0.5], i * 4);
    data.flag.set([s.cut ? 1 : 0, dst?.t.egypt ? 1 : 0, dst ? 0 : 1], i * 3);
  });
  return { frame, data, count, nS, nT, step: set.step };
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Shaders ---------- */

const TILE_VERTEX = /* glsl */ `
  attribute vec4 aLogo; attribute vec4 aGeo; attribute vec4 aTime; attribute vec3 aFlag;
  uniform vec3 uAxis; uniform vec3 uE1; uniform vec3 uE2; uniform mat3 uGeo;
  uniform float uSpin; uniform float uIntro; uniform float uMorph; uniform float uCut; uniform float uCollapse;
  uniform float uLift; uniform vec3 uDot; uniform vec3 uPoint;
  varying float vX; varying float vEgypt; varying float vShade;

  vec3 logoAt(vec2 d) {
    float th = max(aLogo.y + d.y * aLogo.w, 0.0);
    float ph = aLogo.x + uSpin + d.x * aLogo.z;
    return uAxis * cos(th) + sin(th) * (uE1 * cos(ph) + uE2 * sin(ph));
  }
  vec3 geoAt(vec2 d) {
    float lat = aGeo.x + d.y * aGeo.z;
    float lon = aGeo.y + d.x * aGeo.w;
    return uGeo * vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  }
  vec3 slerpLen(vec3 a, vec3 b, float t) {
    float la = max(length(a), 1e-4), lb = max(length(b), 1e-4);
    vec3 na = a / la, nb = b / lb;
    float ang = acos(clamp(dot(na, nb), -1.0, 1.0));
    float s = sin(ang);
    vec3 dir = s < 1e-3 ? normalize(mix(na, nb, t) + vec3(0.0, 1e-4, 0.0)) : (sin((1.0 - t) * ang) * na + sin(t * ang) * nb) / s;
    return dir * mix(la, lb, t);
  }
  float ease(float t) { return t * t * (3.0 - 2.0 * t); }

  void main() {
    vec2 corner = position.xy;
    float vanish = aFlag.z;
    vec3 sc = logoAt(vec2(0.0));
    vec3 sv = sc + (logoAt(corner * ${SEAM_OVERLAP.toFixed(3)}) - sc) * (1.0 - uCut * aFlag.x);

    // Fly-in: a quadratic arc out of the green point, growing from a speck to the logo cell.
    float ki = clamp((uIntro - aTime.x) / 0.42, 0.0, 1.0);
    float ei = 1.0 - pow(1.0 - ki, 3.0);
    vec3 jitter = fract(aTime.z * vec3(13.17, 7.71, 3.37)) - 0.5;
    vec3 ctrl = mix(uDot, sc, 0.5) + sc * 0.7 + jitter * 0.8;
    vec3 fc = mix(mix(uDot, ctrl, ei), mix(ctrl, sc, ei), ei);
    vec3 pv = fc + (sv - sc) * mix(0.06, 1.0, ei);
    vec3 pc = fc;

    // Migration: each tile slerps from its logo cell to its land cell, lifting off the surface mid-flight.
    // The cell shrinks to its land size early in the flight, so the swarm reads as fine tiles, not debris.
    float km = ease(clamp((uMorph - aTime.y) / 0.38, 0.0, 1.0));
    float ks = smoothstep(0.0, 0.42, km);
    vec3 tc = vanish > 0.5 ? sc : geoAt(vec2(0.0));
    vec3 tv = vanish > 0.5 ? sc : geoAt(corner);
    float lift = 1.0 + uLift * sin(3.14159265 * km) * (0.55 + aTime.z * 0.9) * (1.0 - vanish);
    vec3 offset = mix(pv - pc, tv - tc, ks);
    pc = slerpLen(pc, tc, km) * lift;
    pv = pc + offset * lift;

    // Collapse: everything falls into one point.
    float kc = ease(clamp((uCollapse - aTime.w) / 0.5, 0.0, 1.0));
    vec3 cc = mix(pc, uPoint, kc);
    vec3 p = cc + (pv - pc) * (1.0 - kc);

    vX = pc.x;
    vEgypt = aFlag.y;
    vShade = clamp(pc.z, -1.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const TILE_FRAGMENT = /* glsl */ `
  uniform vec3 uForest; uniform vec3 uGreen; uniform vec3 uLime; uniform vec3 uInk; uniform vec3 uPaper;
  uniform float uEgypt; uniform float uMute; uniform float uGlint;
  varying float vX; varying float vEgypt; varying float vShade;
  vec3 logoGradient(float t) {
    return t < ${LOGO.stops[1].toFixed(2)}
      ? mix(uForest, uGreen, clamp(t / ${LOGO.stops[1].toFixed(2)}, 0.0, 1.0))
      : mix(uGreen, uLime, clamp((t - ${LOGO.stops[1].toFixed(2)}) / ${(LOGO.stops[2] - LOGO.stops[1]).toFixed(2)}, 0.0, 1.0));
  }
  void main() {
    float t = vX * 0.5 + 0.5;
    vec3 col = logoGradient(t);
    float glint = exp(-pow((t - uGlint) * 7.0, 2.0)) * 0.14;
    col = mix(col, vec3(1.0), glint);
    float egypt = vEgypt * uEgypt;
    col = mix(col, uPaper, uMute * (1.0 - egypt) * smoothstep(0.0, 0.6, vShade + 0.3));
    col = mix(col, uInk, egypt * 0.94);
    gl_FragColor = vec4(col, 1.0);
  }`;

const OCEAN_VERTEX = /* glsl */ `
  varying vec3 vNormal; varying vec3 vObj;
  void main() {
    vNormal = normalize(normalMatrix * normal); vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const OCEAN_FRAGMENT = /* glsl */ `
  uniform vec3 uPaper; uniform vec3 uPaperHi; uniform vec3 uInk; uniform float uAlpha;
  varying vec3 vNormal; varying vec3 vObj;
  float gridLine(float coord, float fw) {
    float d = abs(fract(coord + 0.5) - 0.5);
    return 1.0 - smoothstep(0.35 * fw, 1.25 * fw, d);
  }
  void main() {
    vec3 p = normalize(vObj);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float cells = 12.0 / 3.14159265;
    float latC = lat * cells;
    float lonA = atan(p.x, p.z) * cells, lonB = atan(-p.x, -p.z) * cells;
    float fwLon = min(fwidth(lonA), fwidth(lonB));
    float grid = max(gridLine(latC, fwidth(latC)), gridLine(lonA, fwLon) * (1.0 - smoothstep(1.2, 1.4, abs(lat))));
    float facing = clamp(vNormal.z, 0.0, 1.0);
    vec3 col = mix(uPaper, uPaperHi, smoothstep(0.0, 0.7, facing));
    col = mix(col, uInk, grid * 0.08);
    gl_FragColor = vec4(col, uAlpha);
  }`;

const LANE_VERTEX = /* glsl */ `
  attribute vec3 aNext; attribute float aSide; attribute float aDist; attribute float aRegion;
  uniform float uWidth; uniform float uHeadWidth; uniform float uDraw[${REGIONS.length}];
  varying float vSide; varying float vAhead; varying float vFacing;
  void main() {
    float reach = uDraw[int(aRegion + 0.5)];
    vAhead = aDist - reach;
    float head = exp(-abs(vAhead) / 0.02);
    vec4 a = modelViewMatrix * vec4(position, 1.0);
    vec4 b = modelViewMatrix * vec4(aNext, 1.0);
    vec2 dir = b.xy - a.xy;
    dir = length(dir) > 1e-5 ? normalize(dir) : vec2(1.0, 0.0);
    float width = uWidth + uHeadWidth * head;
    a.xy += vec2(-dir.y, dir.x) * aSide * width * 0.5;
    vSide = aSide;
    vFacing = normalize((modelViewMatrix * vec4(position, 0.0)).xyz).z;
    gl_Position = projectionMatrix * a;
  }`;

const LANE_FRAGMENT = /* glsl */ `
  uniform vec3 uInk; uniform vec3 uGreen; uniform float uAlpha;
  varying float vSide; varying float vAhead; varying float vFacing;
  void main() {
    if (vAhead > 0.0) discard;
    float head = exp(vAhead / 0.03);
    vec3 col = mix(uInk, uGreen, head);
    float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
    float alpha = uAlpha * mix(0.85, 1.0, head) * edge * smoothstep(-0.02, 0.12, vFacing);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }`;

const BEZEL_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BEZEL_FRAGMENT = /* glsl */ `
  uniform vec3 uInk; uniform float uRadiusPx; uniform float uAlpha;
  varying vec2 vPos;
  float band(float d, float halfPx) { return 1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, abs(d)); }
  void main() {
    float r = length(vPos);
    float px = uRadiusPx;
    float limb = band((r - 1.0) * px, 0.6);
    float ring = band((r - ${BEZEL.ring.toFixed(3)}) * px, 0.4) * 0.45;
    float ang = atan(vPos.y, vPos.x) / 6.2831853 * 72.0;
    float tickD = abs(fract(ang + 0.5) - 0.5) / 72.0 * 6.2831853 * r * px;
    bool major = abs(fract(ang / 6.0 + 0.5) - 0.5) * 6.0 < 0.5;
    float reach = major ? ${BEZEL.major.toFixed(3)} : ${BEZEL.tick.toFixed(3)};
    float inBand = step(${BEZEL.ring.toFixed(3)}, r) * step(r, ${BEZEL.ring.toFixed(3)} + reach);
    float tick = band(tickD, 0.4) * inBand * (major ? 0.55 : 0.3);
    float alpha = max(limb * 0.85, max(ring, tick)) * uAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uInk, alpha);
  }`;

/* ---------- Lanes: smoothed sea lanes with a distance-from-port attribute for the draw-on ---------- */

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

// A spur lane starts at a sea point of a trunk lane; its distances continue from the trunk's distance there.
function laneOffsets() {
  const key = ([lat, lon]) => `${lat},${lon}`;
  const offsets = LANES.map(() => 0);
  LANES.forEach((lane, i) => {
    if (lane.fromPort) return;
    const start = key(lane.points[0]);
    const trunk = LANES.find((other) => other !== lane && other.fromPort && other.points.some((p) => key(p) === start));
    if (!trunk) return;
    let d = 0;
    for (let k = 1; k < trunk.points.length; k++) {
      d += angleBetween(latLonToVec(...trunk.points[k - 1]), latLonToVec(...trunk.points[k]));
      if (key(trunk.points[k]) === start) break;
    }
    offsets[i] = d;
  });
  return offsets;
}

function createLanes(theme) {
  const buffers = { position: [], next: [], side: [], dist: [], region: [], index: [] };
  const reach = REGIONS.map(() => 0);
  const offsets = laneOffsets();
  LANES.forEach((lane, li) => {
    const region = REGIONS.indexOf(lane.region);
    const smooth = slerpDense(chaikin(lane.points.map(([lat, lon]) => latLonToVec(lat, lon)), LANE.smoothing));
    const dist = [0];
    for (let i = 1; i < smooth.length; i++) dist.push(dist[i - 1] + angleBetween(smooth[i - 1], smooth[i]));
    const length = dist[dist.length - 1];
    const ramp = (d) => clamp(d / LANE.taper, 0, 1) ** 0.5;
    const pts = smooth.map((v, i) => {
      const lift = (lane.fromPort ? ramp(dist[i]) : 1) * (lane.toPort ? ramp(length - dist[i]) : 1);
      return v.map((c) => c * (LANE.endAlt + (LANE.alt - LANE.endAlt) * lift));
    });
    reach[region] = Math.max(reach[region], offsets[li] + length);
    const base = buffers.position.length / 3;
    pts.forEach((p, i) => {
      const next = i < pts.length - 1 ? pts[i + 1] : p.map((c, k) => 2 * c - pts[i - 1][k]);
      for (const side of [-1, 1]) {
        buffers.position.push(...p);
        buffers.next.push(...next);
        buffers.side.push(side);
        buffers.dist.push(offsets[li] + dist[i]);
        buffers.region.push(region);
      }
      if (i < pts.length - 1) {
        const v = base + i * 2;
        buffers.index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.position, 3));
  geometry.setAttribute('aNext', new THREE.Float32BufferAttribute(buffers.next, 3));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(buffers.side, 1));
  geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(buffers.dist, 1));
  geometry.setAttribute('aRegion', new THREE.Float32BufferAttribute(buffers.region, 1));
  geometry.setIndex(buffers.index);
  const material = new THREE.ShaderMaterial({
    vertexShader: LANE_VERTEX,
    fragmentShader: LANE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uInk: { value: theme.ink }, uGreen: { value: theme.green }, uAlpha: { value: 0 },
      uWidth: { value: LANE_PX.line }, uHeadWidth: { value: LANE_PX.head },
      uDraw: { value: REGIONS.map(() => 0) },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, reach };
}

/* ---------- Scene ---------- */

function readTheme(el) {
  const style = getComputedStyle(el);
  const color = (name, fallback) => new THREE.Color().setStyle(style.getPropertyValue(name).trim() || fallback, THREE.LinearSRGBColorSpace);
  return {
    forest: color('--forest', '#00451F'), green: color('--green', '#0A8A41'), lime: color('--lime', '#8CC63F'),
    ink: color('--ink', '#111111'), paper: color('--paper', '#F3F1EC'), paperHi: color('--paper-hi', '#FAF9F5'),
  };
}

function createTiles(theme, built) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aLogo', new THREE.InstancedBufferAttribute(built.data.logo, 4));
  geometry.setAttribute('aGeo', new THREE.InstancedBufferAttribute(built.data.geo, 4));
  geometry.setAttribute('aTime', new THREE.InstancedBufferAttribute(built.data.time, 4));
  geometry.setAttribute('aFlag', new THREE.InstancedBufferAttribute(built.data.flag, 3));
  geometry.instanceCount = built.count;
  const { axis, e1, e2 } = built.frame;
  const material = new THREE.ShaderMaterial({
    vertexShader: TILE_VERTEX,
    fragmentShader: TILE_FRAGMENT,
    side: THREE.DoubleSide,
    uniforms: {
      uAxis: { value: new THREE.Vector3(...axis) }, uE1: { value: new THREE.Vector3(...e1) }, uE2: { value: new THREE.Vector3(...e2) },
      uGeo: { value: new THREE.Matrix3() },
      uSpin: { value: 0 }, uIntro: { value: 2 }, uMorph: { value: 0 }, uCut: { value: 0 }, uCollapse: { value: 0 },
      uLift: { value: 0.32 }, uDot: { value: new THREE.Vector3(0, -1.4, 1.2) }, uPoint: { value: new THREE.Vector3(0, 0, 1) },
      uForest: { value: theme.forest }, uGreen: { value: theme.green }, uLime: { value: theme.lime },
      uInk: { value: theme.ink }, uPaper: { value: theme.paperHi },
      uEgypt: { value: 0 }, uMute: { value: 0 }, uGlint: { value: -1 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

function createOcean(theme) {
  const sphere = new THREE.SphereGeometry(0.996, 96, 64);
  const occluder = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ colorWrite: false }));
  occluder.renderOrder = -1;
  const material = new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: { uPaper: { value: theme.paper }, uPaperHi: { value: theme.paperHi }, uInk: { value: theme.ink }, uAlpha: { value: 0 } },
  });
  const surface = new THREE.Mesh(sphere, material);
  surface.renderOrder = 2;
  return { occluder, surface };
}

function createBezel(theme) {
  const size = 2 * (BEZEL.ring + BEZEL.major + 0.02);
  const material = new THREE.ShaderMaterial({
    vertexShader: BEZEL_VERTEX,
    fragmentShader: BEZEL_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uInk: { value: theme.ink }, uRadiusPx: { value: 100 }, uAlpha: { value: 0 } },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.renderOrder = 6;
  return mesh;
}

/**
 * Creates the tile sphere on `canvas`. `render(state)` draws one frame; state fields (all optional):
 * cx, cy, r (CSS px in canvas space), spin (rad), intro (0 → 1.3), morph, cut, collapse, egypt, mute, ocean,
 * lanes (alpha), draw (0–1 per REGIONS entry), lon, tilt (geo view, degrees), dot/point (sphere units), clip.
 */
export function createTileSphere(canvas, { narrow = false, themeEl = canvas } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const theme = readTheme(themeEl);
  const built = buildInstances(narrow);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000);
  const group = new THREE.Group();
  const spin = new THREE.Group();
  const tiles = createTiles(theme, built);
  const ocean = createOcean(theme);
  const lanes = createLanes(theme);
  const bezel = createBezel(theme);
  spin.add(ocean.surface, lanes.mesh);
  group.add(ocean.occluder, tiles, spin, bezel);
  scene.add(group);
  const size = { w: 1, h: 1 };
  const geoMat = new THREE.Matrix3();
  const tu = tiles.material.uniforms;

  function resize(w, h) {
    const cap = narrow ? DPR_CAP.narrow : DPR_CAP.wide;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false);
    size.w = w; size.h = h;
    Object.assign(camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    camera.updateProjectionMatrix();
  }

  function render(s) {
    const lon = s.lon ?? PAIR_VIEW.lon, tilt = s.tilt ?? PAIR_VIEW.tilt;
    group.position.set(s.cx - size.w / 2, size.h / 2 - s.cy, 0);
    group.scale.setScalar(s.r);
    viewMatrix(geoMat, lon, tilt);
    tu.uGeo.value.copy(geoMat);
    spin.rotation.set(tilt * DEG, -lon * DEG, 0, 'XYZ');
    tu.uSpin.value = s.spin ?? 0;
    tu.uIntro.value = s.intro ?? 2;
    tu.uMorph.value = s.morph ?? 0;
    tu.uCut.value = s.cut ?? 0;
    tu.uCollapse.value = s.collapse ?? 0;
    tu.uEgypt.value = s.egypt ?? 0;
    tu.uMute.value = s.mute ?? 0;
    tu.uGlint.value = s.glint ?? -1;
    if (s.dot) tu.uDot.value.set(...s.dot);
    if (s.point) tu.uPoint.value.set(...s.point);
    ocean.surface.material.uniforms.uAlpha.value = s.ocean ?? 0;
    bezel.material.uniforms.uAlpha.value = s.ocean ?? 0;
    bezel.material.uniforms.uRadiusPx.value = s.r;
    const lu = lanes.mesh.material.uniforms;
    lu.uAlpha.value = s.lanes ?? 0;
    REGIONS.forEach((key, i) => { lu.uDraw.value[i] = (s.draw?.[i] ?? 0) * (lanes.reach[i] + 0.05) - (s.draw?.[i] ? 0 : 1); });
    lanes.mesh.visible = (s.lanes ?? 0) > 0.001;
    ocean.surface.visible = bezel.visible = (s.ocean ?? 0) > 0.001;
    renderer.setScissorTest(false);
    renderer.clear();
    if (s.clip) {
      renderer.setScissorTest(true);
      renderer.setScissor(s.clip.x, size.h - s.clip.y - s.clip.h, s.clip.w, s.clip.h);
    }
    renderer.render(scene, camera);
  }

  /** Screen position (CSS px) and facing (z) of a lat/lon for the given state. */
  function project(lat, lon, s) {
    const v = rotateView(latLonToVec(lat, lon), s.lon ?? PAIR_VIEW.lon, s.tilt ?? PAIR_VIEW.tilt);
    return { x: s.cx + v[0] * s.r * 1.008, y: s.cy - v[1] * s.r * 1.008, z: v[2], v };
  }

  function dispose() {
    scene.traverse((node) => { node.geometry?.dispose(); node.material?.dispose(); });
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { resize, render, project, dispose, regions: REGIONS, origins: ORIGINS, counts: { tiles: built.count, logo: built.nS, land: built.nT } };
}

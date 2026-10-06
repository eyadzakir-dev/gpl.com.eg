// GLSL for the GPL route globe (three.js ShaderMaterial, WebGL2). Colours arrive as raw sRGB uniforms.

export const OCEAN_VERTEX = `
  varying vec3 vNormal; varying vec3 vObj;
  void main() {
    vNormal = normalize(normalMatrix * normal); vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
export const OCEAN_FRAGMENT = `
  uniform vec3 uPaper; uniform vec3 uPaperHi; uniform vec3 uInk;
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
    col = mix(col, uInk, grid * 0.085);
    gl_FragColor = vec4(col, 1.0);
  }`;
export const TILE_VERTEX = `
  attribute vec3 aCenter; attribute float aScale; attribute float aEgypt;
  uniform float uHalf; uniform float uRadius;
  varying vec3 vView; varying vec2 vLocal; varying float vEgypt;
  void main() {
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), aCenter));
    vec3 north = cross(aCenter, east);
    vec3 p = aCenter * uRadius + (east * position.x + north * position.y) * uHalf * aScale;
    vView = normalize(normalMatrix * aCenter);
    vLocal = position.xy; vEgypt = aEgypt;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
export const TILE_FRAGMENT = `
  uniform vec3 uForest; uniform vec3 uGreen; uniform vec3 uLime; uniform vec3 uInk;
  varying vec3 vView; varying vec2 vLocal; varying float vEgypt;
  vec3 logoGradient(float t) {
    return t < 0.5 ? mix(uForest, uGreen, t * 2.0) : mix(uGreen, uLime, t * 2.0 - 1.0);
  }
  void main() {
    float t = clamp(vView.x * 0.56 + 0.5 + (vLocal.x - vLocal.y) * 0.035, 0.0, 1.0);
    vec3 col = logoGradient(t) * mix(0.84, 1.0, smoothstep(0.0, 0.55, vView.z));
    col = mix(col, uInk, vEgypt * 0.92);
    float alpha = smoothstep(0.015, 0.14, vView.z);
    gl_FragColor = vec4(col, alpha);
  }`;
export const LANE_VERTEX = `
  attribute vec3 aNext; attribute float aSide; attribute float aT; attribute vec3 aLane;
  uniform float uTime; uniform float uWidth; uniform float uPulseWidth; uniform float uSpeed; uniform float uTail;
  varying float vSide; varying float vPulse; varying float vHead; varying float vFacing;
  // aLane = (length in radians, phase in seconds, period in seconds)
  void main() {
    float s = aT * aLane.x;
    float head = mod(uTime + aLane.y, aLane.z) * uSpeed;
    float behind = head - s;
    vPulse = behind < 0.0 ? 0.0 : exp(-behind / (uTail / 3.0));
    vHead = behind < 0.0 ? exp(behind / 0.004) : exp(-behind / 0.012);
    vec4 a = modelViewMatrix * vec4(position, 1.0);
    vec4 b = modelViewMatrix * vec4(aNext, 1.0);
    vec2 dir = b.xy - a.xy;
    dir = length(dir) > 1e-5 ? normalize(dir) : vec2(1.0, 0.0);
    float width = uWidth + uPulseWidth * max(pow(vPulse, 1.6), vHead);
    a.xy += vec2(-dir.y, dir.x) * aSide * width * 0.5;
    vSide = aSide;
    vFacing = normalize((modelViewMatrix * vec4(position, 0.0)).xyz).z;
    gl_Position = projectionMatrix * a;
  }`;
export const LANE_BASE_FRAGMENT = `
  uniform vec3 uInk; varying float vFacing;
  void main() {
    gl_FragColor = vec4(uInk, 0.82 * smoothstep(-0.02, 0.1, vFacing));
  }`;
export const LANE_PULSE_FRAGMENT = `
  uniform vec3 uGreen; uniform vec3 uLime;
  varying float vSide; varying float vPulse; varying float vHead; varying float vFacing;
  void main() {
    float glow = max(vPulse, vHead);
    if (glow < 0.03) discard;
    vec3 col = mix(uGreen, uLime, clamp(vHead + vPulse * vPulse * 0.6, 0.0, 1.0));
    float edge = 1.0 - smoothstep(0.6, 1.0, abs(vSide));
    gl_FragColor = vec4(col, smoothstep(0.03, 0.35, glow) * edge * smoothstep(-0.02, 0.1, vFacing));
  }`;
export const MARKER_VERTEX = `
  attribute float aKind;
  uniform float uOriginPx; uniform float uDestPx;
  varying float vKind; varying float vFacing; varying float vSize;
  void main() {
    vKind = aKind;
    vFacing = normalize(normalMatrix * position).z;
    vSize = aKind > 0.5 ? uOriginPx : uDestPx;
    gl_PointSize = vSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
export const MARKER_FRAGMENT = `
  uniform vec3 uInk; uniform vec3 uPaperHi; uniform vec3 uGreen; uniform float uDpr;
  varying float vKind; varying float vFacing; varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * vSize;
    float outer = vSize * 0.5 - 0.5;
    float ring = (vKind > 0.5 ? 1.4 : 1.25) * uDpr;
    float inside = 1.0 - smoothstep(outer - 0.75, outer + 0.25, r);
    float fill = 1.0 - smoothstep(outer - ring - 0.75, outer - ring + 0.25, r);
    vec3 col = mix(uInk, vKind > 0.5 ? uGreen : uPaperHi, fill);
    gl_FragColor = vec4(col, inside * smoothstep(0.05, 0.2, vFacing));
  }`;
export const RIPPLE_VERTEX = `
  attribute float aPhase;
  uniform float uPx;
  varying float vPhase; varying float vFacing;
  void main() {
    vPhase = aPhase;
    vFacing = normalize(normalMatrix * position).z;
    gl_PointSize = uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
export const RIPPLE_FRAGMENT = `
  uniform vec3 uGreen; uniform float uTime; uniform float uPx; uniform float uOn;
  varying float vPhase; varying float vFacing;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float t = fract(uTime * 0.3 + vPhase);
    float band = 1.0 - smoothstep(0.0, 2.5 / uPx, abs(r - mix(0.12, 1.0, t)));
    float alpha = band * (1.0 - t) * (1.0 - t) * 0.9 * uOn * smoothstep(0.1, 0.3, vFacing);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uGreen, alpha);
  }`;
export const BEZEL_VERTEX = `
  varying vec2 vPos;
  void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const BEZEL_FRAGMENT = `
  uniform vec3 uInk; uniform float uRadiusPx; uniform float uRing; uniform float uTick; uniform float uMajor;
  varying vec2 vPos;
  float band(float d, float halfPx) { return 1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, abs(d)); }
  void main() {
    float r = length(vPos);
    float px = uRadiusPx;
    float limb = band((r - 1.0) * px, 0.65);
    float ring = band((r - uRing) * px, 0.4) * 0.45;
    float ang = atan(vPos.y, vPos.x) / 6.2831853 * 72.0;
    float tickD = abs(fract(ang + 0.5) - 0.5) / 72.0 * 6.2831853 * r * px;
    bool major = abs(fract(ang / 6.0 + 0.5) - 0.5) * 6.0 < 0.5;
    float reach = major ? uMajor : uTick;
    float inBand = step(uRing, r) * step(r, uRing + reach);
    float tick = band(tickD, 0.4) * inBand * (major ? 0.55 : 0.32);
    float alpha = max(limb * 0.9, max(ring, tick));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uInk, alpha);
  }`;

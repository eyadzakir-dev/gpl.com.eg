// The GPL logo sphere as a 3D lattice. No three.js dependency, so the numbers can be reused by any renderer.
// Fitted to assets/img/brand/gpl-mark.svg (itself fitted to logo.webp): a checkerboard of diamond tiles on a
// polar grid whose pole sits just inside the left limb. 20 tiles per ring, rings every 17.85 degrees of
// colatitude, each tile a diamond inscribed in its cell with a 4% gap. Orthographic view, +z towards the viewer.

const DEG = Math.PI / 180;

export const LOGO = {
  pole: [-0.954, 0.112],
  around: 20,
  phi0: 8.4,
  ringStep: 17.85,
  theta0: 6.9,
  rings: 10,
  fill: 0.96,
  // Screen-x stops of the logo gradient on the unit disc: forest at the left limb, lime from 58% across.
  stops: [0, 0.35, 0.58],
};

// Lattice tiles the logo keeps (ring * 20 + index); the missing front tiles are the C-shaped cut for the wordmark.
const KEEP = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85,
  95, 96, 97, 98, 99, 101, 102, 103, 104, 115, 116, 117, 118, 123, 135, 136, 137, 155, 156, 157,
]);
const CUT_MIN_X = 0.12;
const CUT_MIN_Z = -0.4;

const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Pole axis and the two equator axes (e1 faces the viewer as far as the pole allows, e2 points up). */
export function logoFrame() {
  const [px, py] = LOGO.pole;
  const axis = [px, py, Math.sqrt(Math.max(0, 1 - px * px - py * py))];
  const e1 = unit([-axis[2] * axis[0], -axis[2] * axis[1], 1 - axis[2] * axis[2]]);
  return { axis, e1, e2: cross(axis, e1) };
}

/** Point on the unit sphere at lattice azimuth phi and colatitude theta (degrees). */
export function logoPoint(frame, phiDeg, thetaDeg) {
  const th = Math.max(0, thetaDeg) * DEG, ph = phiDeg * DEG;
  const s = Math.sin(th), c = Math.cos(th), cp = Math.cos(ph), sp = Math.sin(ph);
  return [0, 1, 2].map((k) => frame.axis[k] * c + s * (frame.e1[k] * cp + frame.e2[k] * sp));
}

/**
 * Logo tiles split into sub x sub smaller diamonds that tile each logo diamond exactly, so thousands of
 * instances can assemble one crisp logo. Angles in radians. sweep: 0 at the forest limb, 1 at the lime side.
 */
export function logoSubTiles(sub) {
  const frame = logoFrame();
  const step = 360 / LOGO.around;
  const halfPhi = (step / 2) * LOGO.fill, halfTheta = (LOGO.ringStep / 2) * LOGO.fill;
  const tiles = [];
  for (let ring = 0; ring < LOGO.rings; ring++) {
    const theta = LOGO.theta0 + ring * LOGO.ringStep;
    for (let i = 0; i < LOGO.around; i++) {
      const phi = LOGO.phi0 + i * step;
      const centre = logoPoint(frame, phi, theta);
      const sweep = Math.min(1, Math.max(0, (centre[0] + 1) / 2));
      const cut = !KEEP.has(ring * LOGO.around + i) && centre[2] > CUT_MIN_Z && centre[0] > CUT_MIN_X;
      for (let a = 0; a < sub; a++) {
        for (let b = 0; b < sub; b++) {
          const s = -1 + (2 * a + 1) / sub, t = -1 + (2 * b + 1) / sub;
          tiles.push({
            phi: (phi + (halfPhi * (s + t)) / 2) * DEG,
            theta: (theta + (halfTheta * (t - s)) / 2) * DEG,
            halfPhi: (halfPhi / sub) * DEG,
            halfTheta: (halfTheta / sub) * DEG,
            front: centre[2],
            sweep,
            cut,
          });
        }
      }
    }
  }
  return { frame, tiles };
}


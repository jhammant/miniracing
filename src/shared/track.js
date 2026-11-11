// Track baking: a closed Catmull-Rom spline through the control points becomes
// evenly spaced samples carrying position, tangent, left normal and curvature.
// Coordinates are (x, z) on the surface; heading h has forward = (sin h, cos h).

export const STEP = 1;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function bakeTrack(path, width) {
  const m = path.length, SUB = 24;
  const dense = [];
  for (let i = 0; i < m; i++) {
    const p0 = path[(i - 1 + m) % m], p1 = path[i], p2 = path[(i + 1) % m], p3 = path[(i + 2) % m];
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB;
      dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  const D = dense.length;
  const cum = new Float64Array(D + 1);
  for (let i = 1; i <= D; i++) {
    const a = dense[i - 1], b = dense[i % D];
    cum[i] = cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const len = cum[D];
  const n = Math.round(len / STEP);
  const step = len / n;
  const sx = new Float64Array(n), sz = new Float64Array(n);
  const tx = new Float64Array(n), tz = new Float64Array(n);
  const nx = new Float64Array(n), nz = new Float64Array(n);
  const curv = new Float64Array(n), head = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j], b = dense[(j + 1) % D];
    sx[i] = a[0] + (b[0] - a[0]) * f;
    sz[i] = a[1] + (b[1] - a[1]) * f;
  }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = sx[b] - sx[a], dz = sz[b] - sz[a], d = Math.hypot(dx, dz) || 1;
    tx[i] = dx / d; tz[i] = dz / d;
    nx[i] = tz[i]; nz[i] = -tx[i]; // driver's left
    head[i] = Math.atan2(tx[i], tz[i]);
  }
  // Signed curvature (positive = turning left), smoothed over a few samples.
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = wrapAngle(head[(i + 1) % n] - head[(i - 1 + n) % n]) / (2 * step);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let o = -3; o <= 3; o++) s += raw[(i + o + n) % n];
    curv[i] = s / 7;
  }

  const track = {
    n, len, step, width, hw: width / 2, sx, sz, tx, tz, nx, nz, curv, head,
    wrap: (i) => ((i % n) + n) % n,
    // Nearest sample within a window around a known index. The window keeps
    // progress local, so cutting across to another part of the lap doesn't count.
    nearest(x, z, hint, back = 8, fwd = 14) {
      let best = hint, bd = Infinity;
      for (let o = -back; o <= fwd; o++) {
        const i = ((hint + o) % n + n) % n;
        const dx = x - sx[i], dz = z - sz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    locate(x, z) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = x - sx[i], dz = z - sz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    lat: (i, x, z) => (x - sx[i]) * nx[i] + (z - sz[i]) * nz[i],
    along: (i, x, z) => (x - sx[i]) * tx[i] + (z - sz[i]) * tz[i],
    // Point at s metres along the lap, offset `lat` to the left.
    pointAt(s, lat = 0) {
      const u = (((s % len) + len) % len) / step;
      const i = Math.floor(u) % n, k = (i + 1) % n, f = u - Math.floor(u);
      const x = sx[i] + (sx[k] - sx[i]) * f, z = sz[i] + (sz[k] - sz[i]) * f;
      const ax = tx[i] + (tx[k] - tx[i]) * f, az = tz[i] + (tz[k] - tz[i]) * f;
      const d = Math.hypot(ax, az) || 1;
      return { x: x + (az / d) * lat, z: z - (ax / d) * lat, h: Math.atan2(ax, az), i };
    },
  };
  return track;
}

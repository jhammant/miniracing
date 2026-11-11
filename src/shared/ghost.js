// A ghost is one lap as a list of whole numbers: where the car was every
// tenth of a second. Four numbers a sample: x and z in tenths of a unit,
// heading in hundredths of a radian, height in tenths. The same check runs
// in the browser (before a ghost is shown) and on the server (before one is kept).

import { getWorld } from './world.js';
import { TRACKS } from './tracks.js';

export const GHOST = { step: 100, maxMs: 90000, per: 4 };

export function validGhost(trackId, ms, d) {
  const def = TRACKS.find((t) => t.id === trackId);
  if (!def || !Number.isFinite(ms) || ms < def.minLap || ms > GHOST.maxMs || !Array.isArray(d)) return false;
  const n = d.length / GHOST.per;
  if (!Number.isInteger(n) || Math.abs(n - (ms / GHOST.step + 1)) > 2.5) return false;
  const w = getWorld(def.id), mx = (w.hx + 40) * 10, mz = (w.hz + 40) * 10;
  for (let i = 0; i < d.length; i += GHOST.per) {
    const x = d[i], z = d[i + 1], h = d[i + 2], y = d[i + 3];
    if (!Number.isInteger(x) || !Number.isInteger(z) || !Number.isInteger(h) || !Number.isInteger(y)) return false;
    if (Math.abs(x) > mx || Math.abs(z) > mz || Math.abs(h) > 320 || y < -400 || y > 400) return false;
  }
  return true;
}

// Records the lap in progress. Feed it the car and the time into the lap every
// frame; when the time jumps back a new lap has begun and the old one is set
// aside until `finish` is asked for it.
export class GhostRecorder {
  constructor() { this.d = []; this.done = null; this.last = -1; }

  sample(car, lapMs) {
    if (lapMs < 0) return;
    if (lapMs < this.last) { this.done = this.d; this.d = []; }
    this.last = lapMs;
    while (this.d.length / GHOST.per <= lapMs / GHOST.step && this.d.length < (GHOST.maxMs / GHOST.step + 2) * GHOST.per) {
      const h = Math.atan2(Math.sin(car.h), Math.cos(car.h));
      this.d.push(Math.round(car.x * 10), Math.round(car.z * 10), Math.round(h * 100), Math.round(car.y * 10));
    }
  }

  // The lap that has just been timed at `ms`, or null if what was recorded does not fit it.
  finish(trackId, ms) {
    const d = this.done || this.d;
    if (!this.done) { this.d = []; this.last = -1; }
    this.done = null;
    ms = Math.round(ms);
    return validGhost(trackId, ms, d) ? { ms, d } : null;
  }
}

// Where the ghost is `ms` into its lap, eased between samples. False once it has finished.
export function ghostAt(g, ms, out) {
  const n = g.d.length / GHOST.per, f = ms / GHOST.step, i = Math.floor(f);
  if (ms < 0 || i >= n - 1) return false;
  const k = f - i, a = i * GHOST.per, b = a + GHOST.per, d = g.d;
  let dh = (d[b + 2] - d[a + 2]) / 100;
  if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
  out.x = (d[a] + (d[b] - d[a]) * k) / 10;
  out.z = (d[a + 1] + (d[b + 1] - d[a + 1]) * k) / 10;
  out.h = d[a + 2] / 100 + dh * k;
  out.y = (d[a + 3] + (d[b + 3] - d[a + 3]) * k) / 10;
  return true;
}

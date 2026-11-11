// Turns a track definition into everything the simulation needs: the baked
// lap, solid colliders, zones, movers, item box and grid positions.

import { bakeTrack } from './track.js';
import { PROPS } from './props.js';
import { trackById } from './tracks.js';
import { vehicleOf } from './vehicles.js';

const cache = new Map();

export function getWorld(id) {
  const def = trackById(id);
  if (!cache.has(def.id)) cache.set(def.id, buildWorld(def));
  return cache.get(def.id);
}

export function buildWorld(def) {
  const track = bakeTrack(def.path, def.width);
  const solids = [], zones = [], props = [];

  for (const p of def.props) {
    const spec = PROPS[p.m];
    if (!spec) throw new Error(`unknown prop model: ${p.m}`);
    let { x, z } = p, rot = p.rot || 0;
    if (p.at) {
      const q = track.pointAt(p.at[0] * track.len, p.at[1]);
      x = q.x; z = q.z;
      if (p.face) rot += q.h;
    }
    props.push({ ...p, x, z, rot, spec });
    const cos = Math.cos(rot), sin = Math.sin(rot);
    if (spec.shape === 'circle') solids.push({ shape: 'circle', x, z, r: spec.r, low: !!spec.low });
    else if (spec.shape === 'box') solids.push({ shape: 'box', x, z, hw: spec.hw, hd: spec.hd, cos, sin, low: !!spec.low });
    else if (spec.shape === 'zone') zones.push({ kind: spec.kind, x, z, r: spec.r, hw: spec.hw, hd: spec.hd, cos, sin });
  }

  const pads = def.pads.map(([f, lat]) => {
    const q = track.pointAt(f * track.len, lat);
    return { x: q.x, z: q.z, h: q.h };
  });
  for (const p of pads) zones.push({ kind: 'boost', x: p.x, z: p.z, hw: 2.8, hd: 3.4, cos: Math.cos(p.h), sin: Math.sin(p.h) });

  const boxes = [];
  for (const [f, lats] of def.boxes) {
    for (const lat of lats) {
      const q = track.pointAt(f * track.len, lat);
      boxes.push({ x: q.x, z: q.z });
    }
  }

  const movers = (def.movers || []).map((m) => {
    if (!PROPS[m.m] || !PROPS[m.m].r) throw new Error(`mover ${m.m} needs a round prop`);
    return { ...m, r: PROPS[m.m].r, x: 0, z: 0, y: 0, vx: 0, vz: 0, h: 0, on: true, hidden: false, slam: false };
  });
  const cuts = (def.cuts || []).map((c) => bakeCut(c, track));

  const world = {
    def, track, solids, zones, props, pads, boxes, movers, cuts, veh: vehicleOf(def),
    hx: def.size.w / 2, hz: def.size.d / 2,
    // Grid slot → metres behind the line and lateral offset. Two columns, staggered.
    grid(slot) {
      const rowN = Math.floor(slot / 2);
      return { s: -(4 + rowN * 3.3 + (slot % 2) * 1.4), lat: slot % 2 ? -2.6 : 2.6 };
    },
  };
  updateMovers(world, 0);
  return world;
}

// A shortcut: an open line of points, a metre apart, that leaves the road at
// its first point and rejoins it further round the lap at its last. Progress
// along it counts as progress between those two places on the lap.
function bakeCut(c, track) {
  const x = [], z = [];
  for (let k = 0; k < c.path.length - 1; k++) {
    const [ax, az] = c.path[k], [bx, bz] = c.path[k + 1];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
    for (let j = 0; j < steps; j++) { x.push(ax + (bx - ax) * j / steps); z.push(az + (bz - az) * j / steps); }
  }
  const last = c.path[c.path.length - 1];
  x.push(last[0]); z.push(last[1]);
  const i0 = track.locate(x[0], z[0]), i1 = track.locate(last[0], last[1]);
  const samples = (i1 - i0 + track.n) % track.n, MARGIN = 30;
  return {
    x, z, n: x.length, hw: (c.width || 7) / 2, i0, i1, look: c.look || null,
    s0: i0 * track.step, span: samples * track.step,
    // Only a car that is on the stretch of lap the cut bypasses may use it.
    spans: (idx) => (idx - i0 + MARGIN + track.n) % track.n <= samples + 2 * MARGIN,
  };
}

// Movers are a pure function of race time (seconds).
//   line   back and forth between a and b
//   orbit  round a circle
//   pop    thrown from `from` to land at `to`, sits there a while, then is gone
//          until the next time round: a slice of toast out of the toaster
export function updateMovers(world, t) {
  for (const m of world.movers) {
    const w = 2 * Math.PI * (t / m.period + (m.phase || 0));
    if (m.kind === 'pop') {
      const cyc = t / m.period + (m.phase || 0), u = (cyc - Math.floor(cyc)) * m.period;
      const air = m.air || 0.9, stay = m.stay || 2.6;
      m.vx = 0; m.vz = 0; m.y = 0;
      m.x = m.to[0]; m.z = m.to[1];
      m.on = u >= air && u < air + stay;
      m.hidden = u >= air + stay;
      m.slam = m.on && u < air + 0.07;
      m.fly = u < air ? u / air : 1;
      if (u < air) {
        const k = u / air;
        m.x = m.from[0] + (m.to[0] - m.from[0]) * k; m.z = m.from[1] + (m.to[1] - m.from[1]) * k;
        m.y = (m.lift || 5) * (1 - k) + (m.high || 12) * 4 * k * (1 - k);
      }
      m.h = cyc * 7;
    } else if (m.kind === 'orbit') {
      m.x = m.cx + m.rad * Math.sin(w);
      m.z = m.cz + m.rad * Math.cos(w);
      const sp = (2 * Math.PI * m.rad) / m.period;
      m.vx = sp * Math.cos(w); m.vz = -sp * Math.sin(w);
      m.h = w + Math.PI / 2;
    } else {
      const u = 0.5 - 0.5 * Math.cos(w);
      const dx = m.b[0] - m.a[0], dz = m.b[1] - m.a[1];
      m.x = m.a[0] + dx * u; m.z = m.a[1] + dz * u;
      const du = (Math.PI / m.period) * Math.sin(w);
      m.vx = dx * du; m.vz = dz * du;
      m.h = Math.atan2(dx, dz);
    }
  }
}

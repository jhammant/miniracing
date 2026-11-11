// Turns a track definition into everything the simulation needs: the baked
// lap, solid colliders, zones, movers, item box and grid positions.

import { bakeTrack } from './track.js';
import { PROPS } from './props.js';
import { trackById } from './tracks.js';

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

  const movers = def.movers.map((m) => ({ ...m, r: PROPS[m.m].r, x: 0, z: 0, vx: 0, vz: 0, h: 0 }));

  const world = {
    def, track, solids, zones, props, pads, boxes, movers,
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

// Movers are a pure function of race time (seconds).
export function updateMovers(world, t) {
  for (const m of world.movers) {
    const w = 2 * Math.PI * (t / m.period + (m.phase || 0));
    if (m.kind === 'orbit') {
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

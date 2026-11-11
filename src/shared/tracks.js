// The rooms you can race in, one module each under rooms/. Shared by the
// browser, the server and the tests. A room definition has:
//   id, name, room, blurb, color
//   vehicle what races here: car | boat | tank | heli (see vehicles.js)
//   size    { w, d } of the surface; edge: 'fall' (a drop) or 'wall'
//   width   of the road; offMult: top speed off the road, as a fraction
//   path    closed loop of [x, z] control points; the first point is the start line
//   shapes  collision shapes for props only this room has (see props.js)
//   props   { m: model, x, z, rot?, c? } or { m, at: [lapFraction, lateral], face? }
//   movers  solids that follow a fixed path as a function of race time, so every
//           client agrees on where they are without any syncing (see world.js):
//           { m, kind: 'line', a, b, period } back and forth,
//           { m, kind: 'orbit', cx, cz, rad, period } round a circle,
//           { m, kind: 'pop', from, to, period, lift, high } thrown onto the road.
//           phase (0..1) offsets one; roll: true draws it rolling along
//   cuts    shortcuts: { path: [[x, z]…], width } leaving the road and rejoining it later
//   boxes   rows of item boxes: [lapFraction, [laterals]]
//   pads    boost pads: [lapFraction, lateral]
//   minLap  fastest lap the server will believe, in ms

import { PROPS } from './props.js';
import breakfast from './rooms/breakfast.js';
import snooker from './rooms/snooker.js';
import kitchen from './rooms/kitchen.js';
import bedroom from './rooms/bedroom.js';
import bathtub from './rooms/bathtub.js';
import garden from './rooms/garden.js';
import workbench from './rooms/workbench.js';
import desk from './rooms/desk.js';
import pool from './rooms/pool.js';

export const TRACKS = [breakfast, snooker, kitchen, bedroom, bathtub, garden, workbench, desk, pool];

for (const def of TRACKS) {
  for (const [name, spec] of Object.entries(def.shapes || {})) {
    if (PROPS[name]) throw new Error(`${def.id}: prop ${name} is already in the catalogue`);
    PROPS[name] = spec;
  }
}

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];

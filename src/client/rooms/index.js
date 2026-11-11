// How each room looks. The simulation side of a room is shared/rooms/<id>.js;
// this side is everything drawn around the track. A look is:
//   theme    { bg, sky, ground, sun, dust }  background and fog, the two
//            hemisphere light colours, the sun, and the dust the cars kick up
//   ribbon   (ctx, w, h) paints one 128 x 128 tile of road: u runs across the
//            track, v along it. Leave it see-through where the surface should show
//   cut      optional, the same for a shortcut (default: a faint dashed strip)
//   models   { name: (opts) => THREE.Group } mesh builders for the room's own
//            props (its `shapes`), built from the parts in models.js `kit`.
//            Origin on the surface, y up; opts.color is the prop's `c`
//   build    (room) lays the surface and whatever stands round it. `room` is
//            { THREE, g, world, w, d, hx, hz, theme, own, lam, box, plane, tex }:
//            g is the group to add to; lam(opts) a Lambert material, box(sx, sy,
//            sz, x, y, z, mat, shadow) and plane(sx, sz, y, mat) add static
//            meshes, tex(w, h, painter, opts) a canvas texture; anything else
//            you create that needs disposing goes through own()
//   dress    optional, the same arguments, run after the road is laid

import { registerModels } from '../models.js';
import breakfast from './breakfast.js';
import snooker from './snooker.js';
import kitchen from './kitchen.js';
import bedroom from './bedroom.js';
import bathtub from './bathtub.js';
import garden from './garden.js';
import workbench from './workbench.js';
import desk from './desk.js';
import pool from './pool.js';

export const LOOKS = { breakfast, snooker, kitchen, bedroom, bathtub, garden, workbench, desk, pool };
for (const look of Object.values(LOOKS)) registerModels(look.models || {});

export const lookOf = (id) => LOOKS[id] || LOOKS.kitchen;

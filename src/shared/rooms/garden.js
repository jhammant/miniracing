// Garden Path: placeholder layout, to be replaced by the real room.

import { row } from './util.js';

export default {
  id: 'garden',
  name: 'Garden Path',
  room: 'Garden',
  blurb: 'Helicopters over the flower beds.',
  vehicle: 'heli',
  size: { w: 220, d: 140 },
  edge: 'wall',
  width: 12,
  offMult: 0.7,
  color: '#8ac926',
  minLap: 9000,
  path: [
    [-40, 50], [40, 50], [82, 40], [92, 0], [82, -40], [40, -50], [-40, -50], [-82, -40], [-92, 0], [-82, 40],
  ],
  shapes: {},
  props: [],
  movers: [],
  cuts: [],
  boxes: [row(0.1), row(0.35), row(0.6), row(0.85)],
  pads: [[0.5, 0]],
};

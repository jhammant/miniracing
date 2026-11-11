// Pool Table: placeholder layout, to be replaced by the real room.

import { row } from './util.js';

export default {
  id: 'pool',
  name: 'Pool Table',
  room: 'Games Room',
  blurb: 'Blue cloth, loose balls and six hungry pockets.',
  vehicle: 'car',
  size: { w: 220, d: 140 },
  edge: 'wall',
  width: 12,
  offMult: 0.7,
  color: '#3a86ff',
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

// School Desk: placeholder layout, to be replaced by the real room.

import { row } from './util.js';

export default {
  id: 'desk',
  name: 'School Desk',
  room: 'Classroom',
  blurb: 'Tanks among the pencils. Take the ruler jump.',
  vehicle: 'tank',
  size: { w: 220, d: 140 },
  edge: 'wall',
  width: 12,
  offMult: 0.7,
  color: '#7e57c2',
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

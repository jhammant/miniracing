// The drivers' faces: 12 by 12 pixel portraits drawn as SVG rectangles from the
// driver list, with a mood for the results screen. Nothing here comes from a
// player: the driver is a number already checked against the list.

import { DRIVERS, cleanDriver } from '../shared/drivers.js';

const INK = '#14101f', SHIRT = '#251b45';

// Hair, as [x, y, w, h] blocks. The head is the block from (3,3) to (8,9).
const HAIR = {
  bob: [[3, 2, 6, 2], [2, 3, 1, 5], [9, 3, 1, 5]],
  flat: [[3, 1, 6, 2], [3, 3, 1, 1], [8, 3, 1, 1]],
  spikes: [[3, 2, 6, 1], [3, 1, 1, 1], [5, 0, 1, 2], [7, 1, 1, 1], [8, 0, 1, 2], [3, 3, 1, 1], [8, 3, 1, 1]],
  bun: [[5, 0, 2, 2], [3, 2, 6, 1], [3, 3, 1, 1], [8, 3, 1, 1]],
  mohawk: [[5, 0, 2, 4]],
  puffs: [[3, 2, 6, 1], [1, 1, 2, 3], [9, 1, 2, 3]],
  bald: [[2, 4, 1, 2], [9, 4, 1, 2]],
  long: [[3, 2, 6, 1], [2, 2, 1, 9], [9, 2, 1, 9], [3, 3, 1, 1], [8, 3, 1, 1]],
  cap: [[3, 1, 6, 2], [3, 3, 8, 1]],
  helmet: [[2, 1, 8, 3], [2, 4, 1, 5], [9, 4, 1, 5], [3, 9, 6, 1]],
};

const MOUTH = {
  happy: [[4, 7, 1, 1], [7, 7, 1, 1], [5, 8, 2, 1]],
  neutral: [[5, 8, 2, 1]],
  sad: [[5, 7, 2, 1], [4, 8, 1, 1], [7, 8, 1, 1]],
};

const r = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const blocks = (list, fill) => list.map((b) => r(...b, fill)).join('');

// mood: 'happy' | 'neutral' | 'sad'. `bg` is the tile behind the face (the car's colour).
export function face(driver, mood = 'neutral', bg = '') {
  const d = DRIVERS[cleanDriver(driver)], x = d.extra;
  let s = bg ? r(0, 0, 12, 12, bg) : '';
  s += r(3, 11, 6, 1, SHIRT) + r(5, 10, 2, 1, d.skin);                      // shoulders, neck
  s += r(3, 3, 6, 7, d.skin) + r(2, 5, 1, 2, d.skin) + r(9, 5, 1, 2, d.skin); // head, ears
  s += r(6, 6, 1, 1, 'rgba(0,0,0,0.16)');                                   // nose
  if (x === 'glasses') s += r(3, 5, 6, 1, '#dfe9ff');
  s += x === 'shades' ? r(3, 5, 6, 1, INK) + r(5, 5, 2, 1, '#3a3350') : r(4, 5, 1, 1, INK) + r(7, 5, 1, 1, INK);
  if (mood === 'happy' && x !== 'shades') s += r(4, 4, 1, 1, 'rgba(0,0,0,0.22)') + r(7, 4, 1, 1, 'rgba(0,0,0,0.22)');
  if (mood === 'sad') s += r(3, 6, 1, 2, '#6fd3ff');                         // a tear
  if (x === 'freckles') s += r(3, 7, 1, 1, '#c9805a') + r(8, 6, 1, 1, '#c9805a');
  s += blocks(MOUTH[mood] || MOUTH.neutral, mood === 'happy' ? '#7a1f2b' : INK);
  if (x === 'tache') s += r(4, 7, 4, 1, d.hair);
  s += blocks(HAIR[d.style] || [], d.hair);
  if (x === 'band') s += r(3, 3, 6, 1, '#ff4f79');
  if (d.style === 'helmet') s += r(2, 2, 8, 1, '#e63946');
  return `<svg class="face" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}

export const driverName = (driver) => DRIVERS[cleanDriver(driver)].name;

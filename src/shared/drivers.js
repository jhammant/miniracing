// The drivers. A driver is a face and a horn: it changes nothing about how the
// car goes. `hair` is a style the face painter knows, `extra` something worn.

export const DRIVERS = [
  { name: 'DOT', skin: '#f2c9a0', hair: '#c0392b', style: 'bob', extra: 'freckles', horn: 0 },
  { name: 'MAX', skin: '#8d5a3b', hair: '#1c1c22', style: 'flat', extra: 'shades', horn: 1 },
  { name: 'PIP', skin: '#f7dcc0', hair: '#f4c542', style: 'spikes', extra: null, horn: 2 },
  { name: 'NAN', skin: '#e9c3a2', hair: '#d9d9e3', style: 'bun', extra: 'glasses', horn: 3 },
  { name: 'ZED', skin: '#c68a5c', hair: '#3ddc97', style: 'mohawk', extra: null, horn: 1 },
  { name: 'IVY', skin: '#5c3b28', hair: '#2b1b12', style: 'puffs', extra: null, horn: 2 },
  { name: 'GUS', skin: '#f0b890', hair: '#7a4a21', style: 'bald', extra: 'tache', horn: 3 },
  { name: 'KIT', skin: '#e8b98a', hair: '#1c1c22', style: 'long', extra: 'band', horn: 0 },
  { name: 'REX', skin: '#a9714b', hair: '#e63946', style: 'cap', extra: null, horn: 1 },
  { name: 'BEA', skin: '#f7dcc0', hair: '#8338ec', style: 'bob', extra: 'glasses', horn: 2 },
  { name: 'OLLIE', skin: '#d9a273', hair: '#fb5607', style: 'spikes', extra: 'freckles', horn: 0 },
  { name: 'ACE', skin: '#6f4630', hair: '#f5f1e6', style: 'helmet', extra: null, horn: 3 },
];

export const HORNS = 4;

export function cleanDriver(d, fallback = 0) {
  return Number.isInteger(d) && d >= 0 && d < DRIVERS.length ? d : ((fallback % DRIVERS.length) + DRIVERS.length) % DRIVERS.length;
}

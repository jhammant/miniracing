// Garden Path: placeholder look until the room is built.

import { drawTiles } from './paint.js';
import { skirting } from './shell.js';

export default {
  theme: { bg: '#1d3320', sky: '#eaf7ff', ground: '#4c8a3f', sun: '#fff8e0', dust: '#d9c9a0' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(214,190,140,0.75)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, 0, 5, h); g.fillRect(w - 7, 0, 5, h);
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(256, 256, drawTiles('#5aa64a', '#4f9a41', '#3f7f35'), { repeat: [w / 44, d / 44] }) }));
    skirting(kit, { skirt: '#8a6a45', wall: '#6b8f4e' });
  },
};

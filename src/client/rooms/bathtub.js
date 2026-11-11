// Bathtub: placeholder look until the room is built.

import { drawTiles } from './paint.js';
import { skirting } from './shell.js';

export default {
  theme: { bg: '#16323a', sky: '#f0fbff', ground: '#3aa7b5', sun: '#ffffff', dust: '#e8fbff' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, 0, 5, h); g.fillRect(w - 7, 0, 5, h);
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(256, 256, drawTiles('#3fb6c6', '#35a7b8', '#2a8f9f'), { repeat: [w / 44, d / 44] }) }));
    skirting(kit, { skirt: '#f4fbfb', wall: '#bfe6ea' });
  },
};

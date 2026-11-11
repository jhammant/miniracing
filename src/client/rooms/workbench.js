// Garage Workbench: placeholder look until the room is built.

import { drawTiles } from './paint.js';
import { skirting } from './shell.js';

export default {
  theme: { bg: '#22201e', sky: '#fff6e6', ground: '#8a6a45', sun: '#fff2d6', dust: '#e0cfae' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(40,40,46,0.35)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, 0, 5, h); g.fillRect(w - 7, 0, 5, h);
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(256, 256, drawTiles('#c79a63', '#bb8d57', '#8f6a3e'), { repeat: [w / 44, d / 44] }) }));
    skirting(kit, { skirt: '#6b4a2a', wall: '#8a8f96' });
  },
};

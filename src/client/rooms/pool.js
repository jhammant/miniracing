// Pool Table: placeholder look until the room is built.

import { drawTiles } from './paint.js';
import { skirting } from './shell.js';

export default {
  theme: { bg: '#10141f', sky: '#eef4ff', ground: '#1f4f9a', sun: '#fff6e0', dust: '#cfe0ff' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, 0, 5, h); g.fillRect(w - 7, 0, 5, h);
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(256, 256, drawTiles('#2a6fd6', '#2767c8', '#1f58ad'), { repeat: [w / 44, d / 44] }) }));
    skirting(kit, { skirt: '#5a3418', wall: '#3b2413' });
  },
};

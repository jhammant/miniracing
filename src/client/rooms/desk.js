// School Desk: placeholder look until the room is built.

import { drawTiles } from './paint.js';
import { skirting } from './shell.js';

export default {
  theme: { bg: '#2a2338', sky: '#fff7ea', ground: '#b98a5a', sun: '#fff4dc', dust: '#ead9bd' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, 0, 5, h); g.fillRect(w - 7, 0, 5, h);
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(256, 256, drawTiles('#d6a970', '#cc9d63', '#a67a45'), { repeat: [w / 44, d / 44] }) }));
    skirting(kit, { skirt: '#7a5632', wall: '#9aa7c7' });
  },
};

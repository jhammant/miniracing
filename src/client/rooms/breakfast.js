// Breakfast Table: gingham cloth, a road marked out in cereal hoops.

import * as THREE from 'three';
import { speckle, drawTiles, seeded } from './paint.js';

const drawGingham = (g, w, h) => {
  g.fillStyle = '#f8f1e3'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(211, 62, 52, 0.5)';
  g.fillRect(0, 0, w / 2, h); g.fillRect(0, 0, w, h / 2);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
};

export default {
  theme: { bg: '#3a211b', sky: '#fff3dc', ground: '#a9805c', sun: '#fff1d6', dust: '#f3e3c2' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(255,250,235,0.34)'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 260, ['rgba(255,255,255,0.35)', 'rgba(190,150,90,0.25)'], 2);
  },

  models: {},

  build({ plane, box, lam, tex, w, d, hx, hz }) {
    plane(w, d, 0, lam({ map: tex(64, 64, drawGingham, { repeat: [w / 20, d / 20] }) }));
    // The cloth hangs over the edge; the kitchen floor is a long way down.
    const cloth = lam({ color: '#f1e6d2' });
    box(w, 14, 0.6, 0, -7, hz + 0.3, cloth, false); box(w, 14, 0.6, 0, -7, -hz - 0.3, cloth, false);
    box(0.6, 14, d, hx + 0.3, -7, 0, cloth, false); box(0.6, 14, d, -hx - 0.3, -7, 0, cloth, false);
    box(w - 6, 4, d - 6, 0, -2.1, 0, lam({ color: '#8a5a33' }), false);
    const floor = plane(1600, 1600, -95, lam({ color: '#b98a6a', map: tex(256, 256, drawTiles('#e9d9c2', '#c98f6b', '#8f7a66'), { repeat: [22, 22] }) }));
    floor.receiveShadow = false;
  },

  // Cereal hoops down both sides of the road.
  dress({ g, own, world }) {
    const { track } = world, gap = 2.1, count = Math.floor(track.len / gap) * 2;
    const hoops = new THREE.InstancedMesh(own(new THREE.TorusGeometry(0.52, 0.22, 5, 9).rotateX(Math.PI / 2)),
      own(new THREE.MeshLambertMaterial({ color: '#e0a94a' })), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const rnd = seeded(3);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1, p = track.pointAt(Math.floor(i / 2) * gap + rnd() * 0.5, side * (track.hw + 0.35 + rnd() * 0.35));
      e.set((rnd() - 0.5) * 0.3, rnd() * 6.3, (rnd() - 0.5) * 0.3);
      m.compose(v.set(p.x, 0.22, p.z), q.setFromEuler(e), one);
      hoops.setMatrixAt(i, m);
    }
    hoops.castShadow = true; hoops.receiveShadow = true;
    g.add(hoops);
  },
};

// Pool Table: blue cloth under the lamp, leather pockets, diamond sights on a walnut rail.

import { kit, buildProp } from '../models.js';
import { speckle, mapper } from './paint.js';
import { BALL } from '../../shared/rooms/pool.js';

const { THREE, TAU, HALF, INK, WHITE, STEEL, memo, geos, box, cyl, sphere, torus, disc, ring, quad, plan, slab, mat, add, lay, sized } = kit;
const R = 2.4; // ball radius, the same as the layout's colliders

// 3 x 5 pixel digits for the numbers on the balls.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

// A white spot on the top and bottom of the ball with the number printed on it;
// runs of pixels share a box.
function spots(g, n) {
  const cap = memo(geos, 'poolSpot', () => new THREE.SphereGeometry(R + 0.015, 14, 2, 0, TAU, 0, 0.42));
  const white = mat(WHITE, { gloss: 100, flat: false }), ink = mat(INK), px = 0.18, digits = String(n).split('').map(Number);
  for (const flip of [0, Math.PI]) {
    const s = new THREE.Group();
    add(s, cap, white);
    digits.forEach((d, i) => {
      const ox = (i - (digits.length - 1) / 2) * 4 * px;
      for (let j = 0; j < 5; j++) {
        for (let k = 0; k < 3; k++) {
          if (DIGITS[d][j * 3 + k] !== '1') continue;
          let run = 1;
          while (k + run < 3 && DIGITS[d][j * 3 + k + run] === '1') run++;
          add(s, box(run * px, 0.05, px), ink, ox + (k + run / 2 - 1.5) * px, R + 0.02, (j - 2) * px);
          k += run - 1;
        }
      }
    });
    s.position.y = R; s.rotation.x = flip;
    g.add(s);
  }
}

// The colour says which ball it is: 1 to 8 solid, the same colours striped are 9 to 15.
const numberOf = (color, striped) => { const n = BALL.indexOf(color); return n > 0 ? n + (striped ? 8 : 0) : 0; };

function drawCloth(world) {
  return (g, w, h) => {
    const { k, X, Z } = mapper(world, w), head = -world.hx / 2, foot = world.hx / 2;
    g.fillStyle = '#2366c8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 16000, ['rgba(255,255,255,0.05)', 'rgba(0,12,50,0.08)', 'rgba(130,190,255,0.06)'], 2);
    // The lamp over the table: bright in the middle, falling off towards the cushions.
    const lamp = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.62);
    lamp.addColorStop(0, 'rgba(255,250,235,0.12)'); lamp.addColorStop(0.6, 'rgba(0,0,0,0)'); lamp.addColorStop(1, 'rgba(0,10,50,0.3)');
    g.fillStyle = lamp; g.fillRect(0, 0, w, h);
    // Head string and head spot at one end, the foot spot (under the rack) at the other.
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(head), 0); g.lineTo(X(head), h); g.stroke();
    g.beginPath(); g.arc(X(foot), Z(0), 3.4 * k, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const x of [head, foot]) { g.beginPath(); g.arc(X(x), Z(0), 1 * k, 0, 7); g.fill(); }
  };
}

// A cardboard beer mat: an eight ball on a red ring.
const drawMat = (g, w, h) => {
  g.fillStyle = '#f3e7cf'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c62f2f'; g.lineWidth = 9; g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, 7); g.stroke();
  g.fillStyle = '#151515'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.24, 0, 7); g.fill();
  g.fillStyle = '#f8f5ec'; g.beginPath(); g.arc(w / 2, h / 2 - 4, w * 0.1, 0, 7); g.fill();
  g.fillStyle = '#151515'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('8', w / 2, h / 2 - 3);
};

export default {
  theme: { bg: '#16100e', sky: '#fff1dc', ground: '#1f4a8f', sun: '#fff3dd', dust: '#cfe2ff' },

  // Dark lane with white edges and a pearl diamond down the middle, like the rail sights.
  ribbon(g, w, h) {
    g.fillStyle = 'rgba(6,18,58,0.46)'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 300, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.08)'], 2);
    g.fillStyle = '#f4f1e8'; g.fillRect(2, 0, 5, h); g.fillRect(w - 7, 0, 5, h);
    g.fillStyle = 'rgba(244,239,225,0.75)';
    g.beginPath(); g.moveTo(w / 2, 52); g.lineTo(w / 2 + 5, 64); g.lineTo(w / 2, 76); g.lineTo(w / 2 - 5, 64); g.fill();
  },

  // The cue ball's lane: an aiming line of dots either side.
  cut(g, w, h) {
    g.fillStyle = 'rgba(6,18,58,0.3)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(244,239,225,0.85)';
    for (const x of [6, w - 6]) for (let y = 8; y < h; y += 32) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  },

  models: {
    poolPocket() {
      // A wide drop pocket: stitched leather apron round a dark throat.
      const g = new THREE.Group(), stitch = mat('#e9d3a8', { decal: 3 });
      lay(g, ring(4.9, 6.6, 28), mat('#5c3219', { decal: 1 }), 0, 0.02);
      lay(g, disc(4.9, 28), mat('#140d09', { decal: 2 }), 0, 0.021);
      lay(g, disc(3.5, 24), mat('#040303', { decal: 3 }), 0, 0.022);
      sized(add(g, torus(5.15, 0.5, 5, 28), mat('#7a4522', { gloss: 25 }), 0, 0.18, 0, HALF), 1, 1, 0.45);
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        sized(lay(g, quad(), stitch, Math.cos(a) * 6.1, 0.03, Math.sin(a) * 6.1, -a), 0.16, 1, 0.7);
      }
      return g;
    },

    poolSolid(o) {
      const g = new THREE.Group();
      add(g, sphere(R, 20, 14), mat(o.color || BALL[1], { gloss: 100, flat: false }), 0, R, 0);
      const n = numberOf(o.color, false);
      if (n) spots(g, n);
      return g;
    },

    poolStripe(o) {
      // White ball with a band of colour running over the top.
      const g = new THREE.Group(), white = mat(WHITE, { gloss: 100, flat: false }), w = 0.62;
      const band = memo(geos, 'poolBand', () => new THREE.SphereGeometry(R, 20, 6, 0, TAU, HALF - w, 2 * w).rotateZ(HALF));
      const capA = memo(geos, 'poolCapA', () => new THREE.SphereGeometry(R, 20, 5, 0, TAU, 0, HALF - w).rotateZ(HALF));
      const capB = memo(geos, 'poolCapB', () => new THREE.SphereGeometry(R, 20, 5, 0, TAU, HALF + w, HALF - w).rotateZ(HALF));
      add(g, band, mat(o.color || BALL[1], { gloss: 100, flat: false }), 0, R, 0);
      add(g, capA, white, 0, R, 0);
      add(g, capB, white, 0, R, 0);
      const n = numberOf(o.color, true);
      if (n) spots(g, n);
      return g;
    },

    poolCueBall() {
      // Plain white, with blue chalk marks where the cue has hit it.
      const g = new THREE.Group(), smudge = memo(geos, 'poolSmudge', () => new THREE.SphereGeometry(R + 0.012, 10, 2, 0, TAU, 0, 0.2));
      add(g, sphere(R, 20, 14), mat('#fbf8f0', { gloss: 110, flat: false }), 0, R, 0);
      for (const [rx, rz] of [[0.5, 0.3], [-1.9, 1.1], [2.4, -2]]) {
        const s = new THREE.Group();
        add(s, smudge, mat('#7fa9e6', { flat: false }));
        s.position.y = R; s.rotation.set(rx, 0, rz);
        g.add(s);
      }
      return g;
    },

    poolRack() {
      // Maple triangle round a ten ball rack: apex at the origin, rows towards +X.
      const g = new THREE.Group(), wood = mat('#d39b5c', { gloss: 20 }), cx = 8.4, rho = 7.25, len = 2 * Math.sqrt(3) * rho;
      for (let k = 0; k < 3; k++) {
        const a = (k * TAU) / 3;
        add(g, box(1, 1.2, len), wood, cx + Math.cos(a) * rho, 0.6, Math.sin(a) * rho, 0, -a);
        add(g, cyl(0.7, 0.7, 1.2, 10), wood, cx - Math.cos(a) * 2 * rho, 0.6, -Math.sin(a) * 2 * rho);
      }
      return g;
    },

    poolCue() {
      // American two-piece cue lying on the cloth, tip towards +Z: rubber bumper,
      // black butt, blue wrap, maple forearm with ebony points, then the long shaft.
      const g = new THREE.Group(), r = (z) => 0.62 - 0.35 * (z + 32) / 64;
      const parts = [[-32, -31.5, '#1b1b1b'], [-31.5, -22, INK], [-22, -11, '#1f3f86'], [-11, 0, '#d9a35f'],
        [0, 0.7, '#e8e4da'], [0.7, 31.2, '#efd9a7'], [31.2, 31.8, WHITE], [31.8, 32, '#2f6fd6']];
      for (const [z0, z1, c] of parts) {
        const r0 = r(z0), r1 = r(z1);
        add(g, cyl(r1, r0, z1 - z0, 10), mat(c, { gloss: 30 }), 0, (r0 + r1) / 2, (z0 + z1) / 2, HALF);
      }
      const pearl = mat('#f3efe2', { gloss: 60 });
      for (const z of [-29.6, -23, -11.2]) add(g, cyl(r(z) + 0.03, r(z) + 0.03, 0.35, 10), pearl, 0, r(z), z, HALF);
      for (let i = 0; i < 4; i++) {
        const a = (i + 0.5) * HALF, rr = r(-6) * 0.93;
        add(g, cyl(0.01, 0.17, 9, 4), mat(INK), Math.cos(a) * rr, r(-6) + Math.sin(a) * rr, -6, HALF);
      }
      return g;
    },

    poolBridge() {
      // The bridge, for shots out of reach: a long stick and a notched chrome head at +Z.
      const g = new THREE.Group(), chrome = mat('#d9dde3', { gloss: 90 });
      add(g, cyl(0.3, 0.36, 40, 8), mat('#3b2416', { gloss: 30 }), 0, 0.36, -1.6, HALF);
      add(g, cyl(0.42, 0.42, 0.8, 8), mat('#1b1b1b'), 0, 0.42, -21.6, HALF);
      add(g, cyl(0.45, 0.45, 1.8, 8), chrome, 0, 0.45, 19.2, HALF);
      add(g, box(4, 1.3, 0.5), chrome, 0, 0.65, 20.6);
      for (const x of [-1.75, -0.58, 0.58, 1.75]) add(g, box(0.5, 1.1, 0.5), chrome, x, 1.85, 20.6);
      return g;
    },
  },

  build({ g, own, plane, box: block, lam, tex, world, w, d, hx, hz }) {
    plane(w, d, 0, lam({ map: tex(1024, Math.round(1024 * d / w), drawCloth(world), { clampEdge: true }) }));
    const cushion = lam({ color: '#1c56b2' }), wood = lam({ color: '#3a2116' }), leather = lam({ color: '#4e2a14' });
    const cw = 4.5, ch = 2.4, rw = 12, rh = 3.6, mid = hz + cw + rw / 2;
    // Cushions, broken at the six pockets.
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) block(hx - 17, ch, cw, sx * (hx - 4) / 2, ch / 2, sz * (hz + cw / 2), cushion);
      block(w + 2 * (cw + rw), rh, rw, 0, rh / 2, sz * mid, wood);
    }
    for (const sx of [-1, 1]) {
      block(cw, ch, d - 20, sx * (hx + cw / 2), ch / 2, 0, cushion);
      block(rw, rh, d + 2 * cw, sx * (hx + cw + rw / 2), rh / 2, 0, wood);
    }
    // Leather over the rail behind each pocket.
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 1]) block(sx ? 9 : 14, rh + 0.3, sx ? 9 : 6, sx * (hx + cw + 4), (rh + 0.3) / 2, sz * (hz + cw + 3), leather);
    }
    // Diamond sights: three between each pair of pockets.
    const diamond = memo(geos, 'poolDiamond', () => slab(plan([[0, 1.1], [0.55, 0], [0, -1.1], [-0.55, 0]])));
    const pearl = mat('#f6f1e4', { glow: 0.2 });
    for (const sz of [-1, 1]) for (const k of [-3, -2, -1, 1, 2, 3]) lay(g, diamond, pearl, (k * hx) / 4, rh + 0.01, sz * mid, HALF);
    for (const sx of [-1, 1]) for (const z of [-hz / 2, 0, hz / 2]) lay(g, diamond, pearl, sx * (hx + cw + rw / 2), rh + 0.01, z);
    // Left on the rail: a beer mat, somebody's coins for the next game and a spare chalk.
    const card = lam({ color: '#e9dcc1' });
    const beerMat = new THREE.Mesh(own(new THREE.BoxGeometry(6.4, 0.14, 6.4)), [card, card, lam({ map: tex(128, 128, drawMat) }), card, card, card]);
    beerMat.position.set(-66, rh + 0.07, mid); beerMat.rotation.y = 0.35; beerMat.castShadow = beerMat.receiveShadow = true;
    g.add(beerMat);
    const coin = mat(STEEL, { gloss: 80 });
    for (let i = 0; i < 4; i++) add(g, cyl(1.2, 1.2, 0.22, 16), coin, -50 + (i % 2) * 0.12, rh + 0.11 + i * 0.23, mid + 0.6);
    add(g, cyl(1.2, 1.2, 0.22, 16), coin, -46.5, rh + 0.11, mid - 1.4);
    const chalk = buildProp('chalk');
    chalk.position.set(70, rh, -mid); chalk.rotation.y = 0.5;
    g.add(chalk);
    // Dark under the table, so the gaps in the cushions read as holes.
    block(w + 2 * (cw + rw), 30, d + 2 * (cw + rw), 0, -15.2, 0, lam({ color: '#070505' }), false);
    plane(1600, 1600, -70, lam({ color: '#2a1a20' })).receiveShadow = false;
  },
};

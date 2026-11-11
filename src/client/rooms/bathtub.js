// Bathtub: enamel, rippled water and a channel marked out with little floats.

import { kit } from '../models.js';
import { drawTiles, seeded, mapper } from './paint.js';

const { THREE, TAU, HALF, box, cyl, sphere, torus, disc, ring, rounded, blobGeo, mat, add, lay, sized } = kit;
const WHITE = '#f6fffc', CORAL = '#ef7e6a', STEEL = '#b9d2d8';

function soapBar(o = {}) {
  const g = new THREE.Group(), color = o.color || '#b2e9ce';
  add(g, rounded(8, 5.2, 1.1, 1.2), mat(color, { gloss: 45 }), 0, 0.12);
  add(g, rounded(7.5, 4.7, 1, 0.3), mat(color, { gloss: 45 }), 0, 1.32);
  sized(lay(g, ring(0.9, 1.04, 16), mat('#ffffff', { see: 0.5 }), 0, 1.64), 1.7, 1, 1);
  for (const x of [-0.6, 0, 0.6]) lay(g, disc(0.16, 8), mat(WHITE), x, 1.65);
  return g;
}

function drawWater(world) {
  return (g, w, h) => {
    const rnd = seeded(29), { k, X, Z } = mapper(world, w);
    const wash = g.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, '#79d6d2'); wash.addColorStop(0.5, '#45bcc1'); wash.addColorStop(1, '#78d3ca');
    g.fillStyle = wash; g.fillRect(0, 0, w, h);
    // Soft caustics beneath the water, with short white ripples above them.
    for (let i = 0; i < 180; i++) {
      const x = rnd() * w, y = rnd() * h, r = (2 + rnd() * 7) * k;
      g.strokeStyle = i % 3 ? 'rgba(224,255,241,0.13)' : 'rgba(17,123,148,0.08)';
      g.lineWidth = (0.2 + rnd() * 0.6) * k;
      g.beginPath(); g.ellipse(x, y, r * 1.8, r * 0.5, -0.4, rnd() * 2, 4.5); g.stroke();
    }
    for (const p of world.props) {
      if (p.spec.shape === 'none' || p.spec.shape === 'zone') continue;
      const r = (p.spec.r || Math.max(p.spec.hw, p.spec.hd)) + 1.4;
      g.strokeStyle = 'rgba(226,255,250,0.4)'; g.lineWidth = 0.18 * k;
      g.beginPath(); g.ellipse(X(p.x), Z(p.z), r * k, r * k * 0.75, 0, 0.3, 5.5); g.stroke();
    }
    g.strokeStyle = 'rgba(237,255,248,0.6)'; g.lineWidth = 1.5 * k;
    g.beginPath(); g.roundRect(k, k, w - 2 * k, h - 2 * k, 12 * k); g.stroke();
  };
}

// Sweep the rolled lip through several rounded outlines, leaving the water open.
function tubShell(w, d) {
  const profiles = [[0, -1.2, 12], [3, 2.8, 13.5], [8, 5.1, 16], [15, 6, 19.5], [23, 5.8, 23.5], [27, 4.5, 25.5], [27, -7, 25.5]];
  const pos = [], idx = [], count = 36;
  for (const [extra, y, radius] of profiles) {
    for (let corner = 0; corner < 4; corner++) {
      const sx = corner === 0 || corner === 3 ? 1 : -1, sz = corner < 2 ? 1 : -1;
      for (let i = 0; i < 9; i++) {
        const a = (corner + i / 8) * HALF;
        pos.push(sx * ((w + extra) / 2 - radius) + Math.cos(a) * radius, y,
          sz * ((d + extra) / 2 - radius) + Math.sin(a) * radius);
      }
    }
  }
  for (let j = 0; j < profiles.length - 1; j++) for (let i = 0; i < count; i++) {
    const a = j * count + i, b = j * count + (i + 1) % count;
    idx.push(a, b, a + count, b, b + count, a + count);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

export default {
  theme: { bg: '#527d87', sky: '#eafcff', ground: '#4a929d', sun: '#fff8eb', dust: '#d9fffa' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(5,91,120,0.66)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(183,242,238,0.18)'; g.lineWidth = 2;
    for (const y of [24, 84]) { g.beginPath(); g.ellipse(w / 2, y, 28, 7, -0.2, 0.3, 2.8); g.stroke(); }
    g.fillStyle = '#eefcf2'; g.fillRect(3, 0, 2, h); g.fillRect(w - 5, 0, 2, h);
  },

  cut(g, w, h) {
    g.fillStyle = 'rgba(179,255,222,0.35)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f5fff0'; g.lineWidth = 2;
    for (const x of [7, w - 7]) for (let y = 8; y < h; y += 24) { g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.stroke(); }
  },

  models: {
    bathDuck() {
      const g = new THREE.Group(), yellow = mat('#ffd344', { gloss: 55 }), wing = mat('#efb832', { gloss: 35 });
      sized(add(g, sphere(2.5, 12, 8), yellow, 0, 1.65, -0.25), 1, 0.65, 1.12);
      sized(add(g, sphere(1, 8, 6), yellow, 0, 1.9, -2.5), 0.8, 0.6, 0.85);
      add(g, sphere(1.35, 12, 8), yellow, 0, 3.3, 1.25);
      add(g, rounded(1.7, 1.3, 0.4, 0.45), mat('#f58c32'), 0, 2.9, 2.65);
      for (const s of [-1, 1]) {
        sized(add(g, sphere(1, 8, 5), wing, s * 2.05, 1.9, -0.45), 0.38, 0.55, 1.3);
        add(g, sphere(0.18, 8, 6), mat('#25333c'), s * 0.94, 3.7, 2.12);
        add(g, sphere(0.06, 6, 4), mat(WHITE), s * 0.93, 3.76, 2.25);
      }
      return g;
    },

    bathSoap: soapBar,

    bathDish() {
      const g = new THREE.Group(), ceramic = mat('#f2eee3', { gloss: 65 });
      add(g, rounded(16, 9.4, 2, 1), ceramic);
      add(g, rounded(14, 7.4, 1.4, 0.15), mat('#99c7cb'), 0, 1);
      for (let x = -5; x <= 5; x += 2) add(g, box(0.3, 0.25, 6.2), ceramic, x, 1.25);
      const soap = soapBar({ color: '#f2b7ae' }); soap.position.set(1, 1.4, 0); soap.rotation.y = 0.15; g.add(soap);
      return g;
    },

    bathBottle(o) {
      const g = new THREE.Group(), color = o.color || '#a38bd4';
      add(g, kit.lathe('bathBottle', [[0, 0], [3, 0], [3.2, 0.4], [3.1, 5.6], [2.6, 6.7], [1.2, 7.4], [1.2, 7.8], [0, 7.8]], 16), mat(color, { gloss: 65 }));
      add(g, cyl(1.4, 1.4, 0.7, 12), mat('#f6f3e9'), 0, 8.1);
      add(g, box(1.7, 0.12, 0.45), mat('#9bb8ba'), 0, 8.5);
      for (const s of [-1, 1]) {
        add(g, box(3.9, 3.4, 0.16), mat('#fff8e7'), 0, 4, s * 2.9);
        add(g, box(2.8, 0.45, 0.18), mat(color), 0, 4.95, s * 2.99);
        for (const y of [3, 3.5]) add(g, box(2, 0.16, 0.18), mat('#769795'), 0, y, s * 2.99);
        add(g, disc(0.45, 10), mat(color), 0, 4.15, s * 3.02, s * HALF);
      }
      return g;
    },

    bathSponge() {
      const g = new THREE.Group(), rnd = seeded(17);
      add(g, rounded(14, 9.4, 1.2, 0.45), mat('#458d79'), 0, 0.1);
      add(g, rounded(13.7, 9.1, 1.2, 2.3), mat('#f4d56b'), 0, 0.55);
      for (let i = 0; i < 34; i++) {
        const x = (rnd() - 0.5) * 12, z = (rnd() - 0.5) * 7.4;
        lay(g, disc(0.18 + rnd() * 0.3, 7), mat(i % 3 ? '#d3ae48' : '#fff0a4'), x, 2.87, z);
      }
      return g;
    },

    bathLoofah() {
      const g = new THREE.Group(), rnd = seeded(31);
      sized(add(g, sphere(4.4, 10, 6), mat('#d880a9'), 0, 1.2), 1, 0.25, 1);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU, x = Math.cos(a) * 2.9, z = Math.sin(a) * 2.9;
        sized(add(g, sphere(1.8, 8, 5), mat(i % 2 ? '#f7b5cd' : '#ed9cbe'), x, 1.4, z), 1, 0.65 + rnd() * 0.2, 1);
        add(g, torus(1.05, 0.08, 3, 10), mat('#ffe0e7'), x, 2.3, z, HALF, 0.3, a);
      }
      add(g, torus(1.1, 0.13, 4, 12), mat('#fff8e9'), 0, 0.25, -5.2, HALF);
      return g;
    },

    bathFlannel() {
      const g = new THREE.Group(), cloth = mat('#f1a9a1'), stripe = mat('#fff0da');
      add(g, rounded(17, 11, 0.9, 0.14), cloth, 0, 0.06);
      for (let x = -7; x <= 7; x += 1.4) add(g, box(0.14, 0.04, 10), stripe, x, 0.22);
      for (let z = -4; z <= 4; z += 1.4) add(g, box(16, 0.04, 0.14), stripe, 0, 0.24, z);
      add(g, rounded(17, 2.3, 0.6, 0.17), cloth, 0, 0.21, -4.4);
      for (const z of [-4.7, 4.7]) add(g, box(16, 0.05, 0.35), stripe, 0, 0.4, z);
      return g;
    },

    bathFoam() {
      const g = new THREE.Group(), rnd = seeded(45);
      lay(g, blobGeo(5, 19, 0, 24, 0.1), mat('#d5f7f0', { see: 0.85 }), 0, 0.09);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU, r = 1.1 + rnd() * 2.4, size = 0.85 + rnd() * 0.75;
        sized(add(g, sphere(1, 8, 5), mat(i % 3 ? WHITE : '#d2eee9', { gloss: 45 }), Math.cos(a) * r, 0.35, Math.sin(a) * r), size, 0.4, size);
      }
      for (const [x, z, r] of [[-2, 1, 0.8], [1, -2, 0.6], [2.6, 1.4, 0.9]]) lay(g, ring(r - 0.1, r, 12), mat(WHITE), x, 0.82, z);
      return g;
    },

    bathWhirlpool() {
      const g = new THREE.Group();
      lay(g, disc(6.3, 36), mat('#247f9b', { see: 0.8 }), 0, 0.08);
      const swirl = kit.memo(kit.geos, 'bathWhirlpoolSwirl', () => {
        const outer = [], inner = [];
        for (let i = 0; i <= 72; i++) {
          const a = i / 72 * TAU * 2, r = 5.9 - i / 72 * 4.6;
          outer.push([Math.cos(a) * (r + 0.17), Math.sin(a) * (r + 0.17)]);
          inner.push([Math.cos(a) * (r - 0.17), Math.sin(a) * (r - 0.17)]);
        }
        return kit.slab(kit.plan([...outer, ...inner.reverse()]));
      });
      lay(g, swirl, mat('#c1f9ed'), 0, 0.1);
      lay(g, disc(1.4, 16), mat(STEEL, { gloss: 80 }), 0, 0.12);
      for (let i = 0; i < 6; i++) lay(g, disc(0.18, 8), mat('#225066'), Math.cos(i * TAU / 6) * 0.8, 0.14, Math.sin(i * TAU / 6) * 0.8);
      return g;
    },

    bathSubmarine() {
      const g = new THREE.Group(), yellow = mat('#f9bc43', { gloss: 60 }), blue = mat('#326379');
      sized(add(g, sphere(2.1, 12, 8), yellow, 0, 1.45), 1, 0.67, 1.45);
      add(g, box(5.8, 0.25, 1.3), yellow, 0, 1, -1.1);
      add(g, box(0.25, 1.2, 1.2), blue, 0, 2, -2.2);
      add(g, cyl(0.25, 0.25, 1.6, 8), blue, 0, 3, 0.1);
      add(g, cyl(0.35, 0.35, 0.9, 8), blue, 0, 3.65, 0.45, HALF);
      for (const s of [-1, 1]) for (const z of [-0.9, 0.6]) {
        add(g, disc(0.5, 12), mat('#f5f3d9'), s * 1.98, 1.7, z, 0, 0, -s * HALF);
        add(g, disc(0.33, 12), blue, s * 2, 1.7, z, 0, 0, -s * HALF);
      }
      return g;
    },

    bathPlug() {
      const g = new THREE.Group();
      add(g, cyl(2.3, 1.9, 0.6, 16), mat('#36505a'), 0, 0.3);
      add(g, torus(0.65, 0.14, 4, 10), mat(STEEL, { gloss: 100 }), 0, 0.9);
      return g;
    },

    bathBubbles() {
      const g = new THREE.Group();
      for (const [x, z, r] of [[0, 0, 0.8], [1.7, 0.8, 0.5], [-1, 1.9, 0.4], [-1.8, -0.8, 0.6]]) {
        lay(g, disc(r, 12), mat('#c4f2ee', { see: 0.3 }), x, 0.09, z);
        lay(g, ring(r - 0.09, r, 12), mat('#f3fffa'), x, 0.1, z);
        lay(g, disc(r * 0.18, 8), mat(WHITE), x - r * 0.3, 0.12, z - r * 0.3);
      }
      return g;
    },
  },

  build({ g, own, plane, lam, tex, world, w, d, hx }) {
    plane(w, d, 0, lam({ map: tex(1024, Math.round(1024 * d / w), drawWater(world), { clampEdge: true }) }));
    const enamel = own(new THREE.MeshPhongMaterial({ color: '#f5fbf7', shininess: 70, specular: '#d4ebe9', side: THREE.DoubleSide }));
    const tub = add(g, own(tubShell(w, d)), enamel); tub.castShadow = false;
    plane(1600, 1600, -7.5, lam({ map: tex(256, 256, drawTiles('#d7e7df', '#91b9b5', '#edf1e7'), { repeat: [40, 40] }) }));
    // Two porcelain-handled taps and a curved spout at the plughole end.
    const metal = mat(STEEL, { gloss: 100 }), porcelain = mat(WHITE, { gloss: 60 });
    for (const z of [-20, 20]) {
      add(g, cyl(3.8, 4.3, 0.5, 16), metal, hx + 7, 6.2, z);
      add(g, cyl(1.2, 1.6, 5, 12), metal, hx + 7, 8.8, z);
      add(g, box(6, 0.9, 1.4), porcelain, hx + 7, 11.5, z);
      add(g, box(1.4, 0.9, 6), porcelain, hx + 7, 11.5, z);
      lay(g, disc(0.65, 12), mat(z < 0 ? '#ed887d' : '#83bedc'), hx + 7, 12, z);
    }
    add(g, cyl(1.4, 1.8, 6, 12), metal, hx + 7, 8.5, 0);
    add(g, torus(4, 1.35, 8, 16, Math.PI), metal, hx + 3, 11.5, 0);
    add(g, cyl(1.35, 1.35, 2.5, 12), metal, hx - 1, 10.3, 0);
    add(g, cyl(1.05, 1.05, 0.2, 12), mat('#3b626f'), hx - 1, 9, 0);
    // The chain hangs over the enamel; the rubber plug floats beside the drain.
    for (let i = 0; i < 23; i++) {
      const t = i / 22;
      add(g, torus(0.42, 0.11, 4, 8), metal, hx + 4 - t * 8, 6 * (1 - t) * (1 - t) + 0.2, -27 - t * 10, i % 2 ? HALF : 0, 0.4);
    }
  },

  dress({ g, own, world }) {
    const { track } = world, gap = 3.5, count = Math.floor(track.len / gap) * 2;
    const floats = new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 8, 5)), own(new THREE.MeshLambertMaterial({ color: WHITE })), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), scale = new THREE.Vector3(0.5, 0.36, 0.95);
    const color = new THREE.Color(), axis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const s = Math.floor(i / 2) * gap, p = track.pointAt(s, (i % 2 ? 1 : -1) * (track.hw + 0.2));
      const mouth = world.cuts.some((c) => Math.abs(s - c.s0) < 4 || Math.abs(s - c.s0 - c.span) < 4);
      m.compose(v.set(p.x, 0.35, p.z), q.setFromAxisAngle(axis, p.h), mouth ? new THREE.Vector3(0, 0, 0) : scale);
      floats.setMatrixAt(i, m); floats.setColorAt(i, color.set(Math.floor(i / 2) % 4 < 2 ? CORAL : WHITE));
    }
    floats.receiveShadow = true; g.add(floats);
  },
};

// Procedural low-poly meshes for the game: every prop in shared/props.js, the
// cars and the pickups. Primitives only (no textures), so it also loads in Node.
// Materials and geometries are cached and shared, so clone a material before
// changing it. Car paint and boost pad chevrons are the exceptions: one per copy.

import * as THREE from 'three';

const TAU = Math.PI * 2, HALF = Math.PI / 2;
const geos = new Map(), mats = new Map();
const memo = (map, key, make) => { let v = map.get(key); if (!v) map.set(key, (v = make())); return v; };
const rand = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const INK = '#1c1b24', WHITE = '#f8f5ec', CREAM = '#fff3d6', STEEL = '#c9ced6', GOLD = '#e9c46a';
const HOOPS = ['#ff9f1c', '#e63946', '#ffd23f', '#8ac926', '#b388ff'];

// ---- geometry -----------------------------------------------------------------

const box = (w, h, d) => memo(geos, `box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, n = 12, open = false) =>
  memo(geos, `cyl${rt},${rb},${h},${n},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, n, 1, open));
const sphere = (r, w = 10, h = 8) => memo(geos, `sph${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
const torus = (r, t, rs = 4, ts = 12, arc = TAU) =>
  memo(geos, `tor${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
// Flat pieces lie in the XZ plane, facing up.
const disc = (r, n = 16) => memo(geos, `disc${r},${n}`, () => new THREE.CircleGeometry(r, n).rotateX(-HALF));
const ring = (ri, ro, n = 24) => memo(geos, `ring${ri},${ro},${n}`, () => new THREE.RingGeometry(ri, ro, n).rotateX(-HALF));
const quad = () => memo(geos, 'quad', () => new THREE.PlaneGeometry(1, 1).rotateX(-HALF));
const lathe = (key, pts, n = 20) => memo(geos, key, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), n));

// A plan-view outline from [x, z] points (Shape y is -z, so it lands the right way round).
function plan(pts, holes = []) {
  const v = (p) => p.map(([x, z]) => new THREE.Vector2(x, -z));
  const s = new THREE.Shape(v(pts));
  for (const h of holes) s.holes.push(new THREE.Path(v(h)));
  return s;
}
// A plan outline laid flat (depth 0) or extruded upwards from y = 0.
function slab(shape, depth = 0, extra = {}) {
  const g = depth ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4, ...extra }) : new THREE.ShapeGeometry(shape, 4);
  return g.rotateX(-HALF);
}
// A side-view outline from [z, y] points, extruded w wide across X and centred.
const side = (key, pts, w) => memo(geos, key, () => new THREE.ExtrudeGeometry(
  new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y))), { depth: w, bevelEnabled: false },
).rotateY(HALF).translate(-w / 2, 0, 0));
// Ramp: y = 0 along the -Z edge, rising to h at +Z.
const wedge = (w, d, h) => side(`wedge${w},${d},${h}`, [[-d / 2, 0], [d / 2, 0], [d / 2, h]], w);
// Roof prism, ridge along Z.
const gable = (w, h, d) => memo(geos, `gable${w},${h},${d}`, () => new THREE.ExtrudeGeometry(
  new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]), { depth: d, bevelEnabled: false },
).translate(0, 0, -d / 2));

function roundRect(w, d, r) {
  const pts = [];
  [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], k) => {
    for (let i = 0; i <= 3; i++) {
      const a = (k + i / 3) * HALF;
      pts.push([sx * (w / 2 - r) + Math.cos(a) * r, sz * (d / 2 - r) + Math.sin(a) * r]);
    }
  });
  return plan(pts);
}
const rounded = (w, d, r, depth = 0) => memo(geos, `rr${w},${d},${r},${depth}`, () => slab(roundRect(w, d, r), depth));

// Wobbly closed outline for spills and puddles: the same seed gives the same shape.
function blob(r, seed, n, wob) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (Math.sin(3 * a + seed) + 0.6 * Math.sin(5 * a + seed * 2.1) + 0.4 * Math.sin(2 * a + seed * 3.7)) / 2;
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  return plan(pts);
}
const blobGeo = (r, seed, depth = 0, n = 20, wob = 0.2) =>
  memo(geos, `blob${r},${seed},${depth},${n},${wob}`, () => slab(blob(r, seed, n, wob), depth));
const star = (ro, ri, n = 5) => plan(Array.from({ length: n * 2 }, (_, i) => {
  const a = (i / (n * 2)) * TAU - HALF, r = i % 2 ? ri : ro;
  return [Math.cos(a) * r, Math.sin(a) * r];
}));

// ---- materials and parts --------------------------------------------------------

// Shared material by colour and finish. gloss: Phong shininess; glow: emissive
// strength; see: opacity; decal: pulls a flat piece forward so it never z-fights.
function mat(color, { gloss = 0, flat = true, see = 1, glow = 0, decal = 0 } = {}) {
  return memo(mats, [color, gloss, flat, see, glow, decal].join(), () => {
    const p = { color, flatShading: flat };
    if (see < 1) Object.assign(p, { transparent: true, opacity: see, depthWrite: false });
    if (glow) Object.assign(p, { emissive: color, emissiveIntensity: glow });
    if (decal) Object.assign(p, { polygonOffset: true, polygonOffsetFactor: -decal, polygonOffsetUnits: -decal });
    return gloss ? new THREE.MeshPhongMaterial({ ...p, shininess: gloss, specular: 0x555555 }) : new THREE.MeshLambertMaterial(p);
  });
}
const shade = (css, k) => `#${new THREE.Color(css).multiplyScalar(k).getHexString()}`;
const pale = (css, k) => `#${new THREE.Color(css).lerp(new THREE.Color(1, 1, 1), k).getHexString()}`;
// Dark trim on light paint, light trim on dark paint.
function contrast(css) {
  const c = new THREE.Color(css);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.33 ? '#1d1d2b' : WHITE;
}

// A solid part at (x, y, z) with an optional rotation: it casts and takes shadows.
function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
// A flat decal on the surface: takes shadows, casts none.
function lay(parent, geo, material, x = 0, y = 0.02, z = 0, ry = 0) {
  const m = add(parent, geo, material, x, y, z, 0, ry);
  m.castShadow = false;
  return m;
}
const sized = (m, x, y = x, z = x) => { m.scale.set(x, y, z); return m; };

// 3 x 5 pixel font, in keeping with the 16-bit look.
const FONT = {
  '?': ['111', '001', '010', '000', '010'],
  A: ['111', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
};
// A chunky pixel character facing +Z with its back on z = 0; runs of pixels share a box.
function glyph(ch, px, depth, material) {
  const g = new THREE.Group(), rows = FONT[ch];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== '1') continue;
      let n = 1;
      while (row[i + n] === '1') n++;
      add(g, box(n * px, px, depth), material, (i + n / 2 - row.length / 2) * px, (rows.length / 2 - j - 0.5) * px, depth / 2);
      i += n - 1;
    }
  });
  return g;
}
// Faces of a cube of half-size h: [position, rotation] that turn +Z outwards.
const cubeFaces = (h, y) => [
  [[0, y + h, 0], [-HALF, 0, 0]], [[0, y, h], [0, 0, 0]], [[0, y, -h], [0, Math.PI, 0]],
  [[h, y, 0], [0, HALF, 0]], [[-h, y, 0], [0, -HALF, 0]],
];

// Little bits (crumbs, kibble, flakes) scattered over a disc.
function scatter(g, seed, count, radius, sizes, colors, y = 0, tilt = 0.4) {
  const rnd = rand(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * TAU, r = radius * Math.sqrt(rnd()), [w, h, d] = sizes(rnd);
    add(g, box(w, h, d), mat(colors[i % colors.length]), Math.cos(a) * r, y + h / 2, Math.sin(a) * r,
      (rnd() - 0.5) * tilt, rnd() * TAU, (rnd() - 0.5) * tilt);
  }
}
// Flat cereal hoops scattered over a disc at height y.
function hoops(g, seed, count, radius, y, tilt = 0.5) {
  const rnd = rand(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * TAU, r = radius * Math.sqrt(rnd());
    add(g, torus(0.5, 0.21, 3, 8), mat(HOOPS[i % HOOPS.length]), Math.cos(a) * r, y, Math.sin(a) * r, HALF + (rnd() - 0.5) * tilt, 0, rnd() * TAU);
  }
}

const toastSlice = () => memo(geos, 'toast', () => slab(plan([[-2.7, 3], [2.7, 3], [2.8, -1.4], [3, -2.3], [2.5, -3], [1.4, -3.1],
  [0.5, -2.9], [0, -2.85], [-0.5, -2.9], [-1.4, -3.1], [-2.5, -3], [-3, -2.3], [-2.8, -1.4]]), 0.8));
let houses = 0;

// ---- props -------------------------------------------------------------------------

const BUILDERS = {
  // Breakfast table
  cerealBox() {
    const g = new THREE.Group(), red = mat('#e63946'), yellow = mat('#ffd23f'), z = 2.45;
    add(g, box(14, 12, 4.8), red, 0, 6, 0);
    add(g, box(13.6, 0.06, 0.16), mat('#a4161a'), 0, 12.03, 0); // where the top flaps meet
    for (const s of [-1, 1]) {
      add(g, box(13.6, 0.05, 0.5), yellow, 0, 12.02, s * 1.9);
      add(g, box(0.1, 12, 1.6), yellow, s * 7.02, 6, 0);
    }
    // Front panel: a made-up brand in coloured blocks over a bowl of hoops.
    const front = new THREE.Group();
    add(front, box(12.4, 2.8, 0.1), yellow, 0, 9.9, z - 0.04);
    ['#3a86ff', '#e63946', '#8ac926', '#8338ec', '#ff9f1c'].forEach((c, i) => add(front, box(1.7, 1.8, 0.1), mat(c), (i - 2) * 2.3, 9.9, z));
    add(front, memo(geos, 'bowlPicture', () => new THREE.CircleGeometry(3.6, 10, Math.PI, Math.PI)), mat('#4cc9f0'), -1.2, 4.6, z);
    add(front, box(7.2, 0.5, 0.06), mat(WHITE), -1.2, 4.75, z + 0.02);
    [[-3.4, 5.6], [-2, 6.3], [-0.5, 5.7], [0.9, 6.4], [-2.6, 7.3], [0.2, 7.4]]
      .forEach(([x, y], i) => add(front, ring(0.25, 0.65, 8), mat(HOOPS[i % 5]), x, y, z, HALF));
    add(front, disc(1.5, 8), yellow, 4.6, 6.6, z, HALF);
    add(front, box(14, 0.7, 0.06), mat(WHITE), 0, 1.1, z - 0.02);
    g.add(front, front.clone().rotateY(Math.PI));
    return g;
  },

  milkCarton() {
    const g = new THREE.Group(), white = mat(WHITE), blue = mat('#3a86ff'), spot = mat(INK, { decal: 1 });
    add(g, box(5.2, 6.8, 5.2), white, 0, 3.4, 0);
    add(g, box(5.26, 1.5, 5.26), blue, 0, 1.2, 0);
    add(g, gable(5.2, 1.8, 5.2), [white, blue], 0, 6.8, 0);
    add(g, box(0.3, 0.5, 5.4), white, 0, 8.75, 0);
    add(g, cyl(0.5, 0.5, 0.4, 10), mat('#e63946'), 1.5, 7.79, 0, 0, 0, -0.606); // screw cap on the slope
    // Cow spots round the sides.
    const faces = [[(u, v) => [u, v, 2.61], HALF, 0], [(u, v) => [u, v, -2.61], -HALF, 0],
      [(u, v) => [2.61, v, u], 0, -HALF], [(u, v) => [-2.61, v, u], 0, HALF]];
    faces.forEach(([at, rx, rz], k) => {
      for (const [u, v, r] of [[1.1, 5.2, 0.8], [-1.2, 3.4, 0.6]]) add(g, blobGeo(r, k + 2, 0, 9, 0.3), spot, ...at(u * (k % 2 ? -1 : 1), v), rx, 0, rz);
    });
    return g;
  },

  mug(o) {
    const g = new THREE.Group(), glaze = mat(o.color || '#e63946', { gloss: 40 });
    add(g, lathe('mug', [[0, 0], [2.9, 0], [3, 0.2], [3.1, 6], [2.75, 6], [2.65, 0.6], [0, 0.6]]), glaze);
    add(g, cyl(3.12, 3.11, 0.7, 20, true), mat(WHITE), 0, 4.6, 0);
    add(g, torus(1.3, 0.38, 6, 10, Math.PI), glaze, 3.05, 3.1, 0, 0, 0, -HALF);
    lay(g, disc(2.72, 20), mat('#5b3a21'), 0, 5);
    lay(g, blobGeo(1.4, 7, 0, 12, 0.3), mat('#c08a5b', { decal: 1 }), 0.2, 5.01, 0.2); // a swirl of milk
    return g;
  },

  glass() {
    const g = new THREE.Group();
    add(g, cyl(2.17, 2.02, 5, 16), mat('#ffa62b'), 0, 3, 0);
    lay(g, disc(1.9, 16), mat('#ffc15e', { decal: 1 }), 0, 5.51);
    add(g, cyl(0.16, 0.16, 6.4, 6), mat('#f72585'), 0.9, 4.7, -0.4, 0, 0, -0.15); // bendy straw
    add(g, cyl(0.16, 0.16, 1.4, 6), mat('#f72585'), 2, 8.18, -0.4, 0, 0, -1.1);
    add(g, lathe('glass', [[0, 0], [2.15, 0], [2.4, 7], [2.25, 7], [2, 0.5], [0, 0.5]]), mat('#d8f1ff', { gloss: 100, see: 0.35 }));
    return g;
  },

  plate() {
    const g = new THREE.Group();
    add(g, lathe('plate', [[0, 0], [4.8, 0], [5, 0.25], [7.5, 0.65], [7.5, 0.8], [7.2, 0.8], [5, 0.42], [0, 0.42]], 24), mat('#d6e8fa', { gloss: 30 }));
    lay(g, ring(4.4, 4.7, 24), mat('#3a86ff', { decal: 1 }), 0, 0.43);
    // Fried egg and a small slice of toast.
    add(g, blobGeo(2.3, 3, 0.12, 14, 0.2), mat('#ffffff'), -1.4, 0.42, 0.9);
    sized(add(g, sphere(1, 8, 6), mat('#ffb703', { gloss: 60 }), -1.2, 0.54, 0.7), 1, 0.55, 1);
    sized(add(g, toastSlice(), [mat('#e3a857'), mat('#9c5a22')], 2.3, 0.42, -1.6, 0, 0.5), 0.5, 0.75, 0.5);
    return g;
  },

  bowl() {
    const g = new THREE.Group();
    add(g, lathe('bowl', [[0, 0], [3, 0], [3.2, 0.5], [5.4, 1.6], [6.5, 4], [6.1, 4], [5, 1.8], [2.8, 0.7], [0, 0.7]]), mat('#2ec4b6', { gloss: 40 }));
    lay(g, disc(5.72, 20), mat('#fbfbf2'), 0, 3.2);
    hoops(g, 7, 10, 4.6, 3.25);
    const spoon = add(g, box(0.5, 0.14, 5), mat(STEEL, { gloss: 90 }), 2.76, 4.3, 3.68, -0.35, 0.64);
    spoon.rotation.order = 'YXZ'; // tilt the handle up out of the milk, then turn it
    return g;
  },

  toast() {
    const g = new THREE.Group();
    add(g, toastSlice(), [mat('#e3a857'), mat('#9c5a22')]);
    for (const x of [-1.2, 1.2]) sized(lay(g, quad(), mat('#c98a3c', { decal: 1 }), x, 0.81, 0, 0.3), 0.35, 1, 5); // grill marks
    lay(g, blobGeo(1.2, 5, 0, 10), mat('#ffe680', { decal: 1 }), 0.2, 0.81, 0.3);
    add(g, box(1.5, 0.22, 1.3), mat('#fff1a8'), 0.3, 0.91, 0.2, 0, 0.5); // a pat of butter
    return g;
  },

  butter() {
    const g = new THREE.Group();
    add(g, rounded(6.4, 3.8, 0.6, 0.35), mat('#a8dadc', { gloss: 40 }));
    add(g, box(3.8, 1.5, 2.3), mat('#ffe66d'), -0.7, 1.1, 0);
    add(g, box(0.35, 0.08, 2.4), mat(STEEL, { gloss: 90 }), 2.1, 0.39, -0.5); // knife
    add(g, box(0.5, 0.25, 1.2), mat('#1d3557'), 2.1, 0.48, 1.3);
    sized(add(g, sphere(0.4, 6, 4), mat('#ffe66d'), 2.1, 0.5, -1.2), 1, 0.6, 1.2);
    return g;
  },

  jamJar() {
    const g = new THREE.Group(), jam = mat('#9d0208', { gloss: 80 }), check = mat('#e63946', { decal: 1 });
    add(g, cyl(2.5, 2.4, 4.2, 16), jam, 0, 2.1, 0);
    add(g, cyl(2.1, 2.5, 0.4, 16), jam, 0, 4.4, 0);
    add(g, cyl(2.53, 2.48, 1.8, 16, true), mat(CREAM), 0, 2.2, 0);
    add(g, cyl(2.54, 2.54, 0.3, 16, true), mat('#e63946'), 0, 2.2, 0);
    add(g, cyl(2.35, 2.75, 0.6, 16, true), mat('#e63946'), 0, 4.85, 0); // gingham cloth over the lid
    add(g, cyl(2.35, 2.35, 0.12, 16), mat(WHITE), 0, 5.2, 0);
    add(g, torus(2.3, 0.1, 4, 16), mat(WHITE), 0, 4.75, 0, HALF);
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        if ((i + j) % 2 || Math.hypot(i, j) * 0.6 > 2.05) continue;
        sized(lay(g, quad(), check, i * 0.6, 5.27, j * 0.6), 0.6);
      }
    }
    return g;
  },

  teapot() {
    const g = new THREE.Group(), pot = mat('#2a9d8f', { gloss: 50 }), dot = mat(WHITE);
    sized(add(g, sphere(4, 14, 10), pot, 0, 3.35, 0), 1, 0.78, 1);
    add(g, cyl(2.8, 2.6, 0.4, 14), pot, 0, 0.2, 0);
    add(g, cyl(1.9, 2.2, 0.5, 14), pot, 0, 6.5, 0);
    add(g, sphere(0.55, 8, 6), mat('#ffd23f'), 0, 7.25, 0);
    add(g, cyl(0.35, 0.75, 4.2, 8), pot, 0, 4.1, 4.8, Math.PI / 4); // spout
    add(g, torus(1.6, 0.4, 6, 10, Math.PI), pot, 0, 3.6, -3.6, 0, HALF, -HALF); // handle
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * TAU / 8, e = i % 2 ? 0.45 : -0.15;
      add(g, sphere(0.42, 6, 4), dot, 3.9 * Math.cos(e) * Math.cos(a), 3.35 + 3.04 * Math.sin(e), 3.9 * Math.cos(e) * Math.sin(a));
    }
    return g;
  },

  orange() {
    const g = new THREE.Group();
    sized(add(g, sphere(2.5, 12, 9), mat('#ff8c1a'), 0, 2.3, 0), 1, 0.92, 1);
    add(g, cyl(0.15, 0.2, 0.3, 5), mat('#6b4226'), 0, 4.65, 0);
    sized(add(g, sphere(1, 6, 4), mat('#2d6a4f'), 0.5, 4.6, 0.6, 0.2, 0.7), 0.45, 0.12, 1.1);
    return g;
  },

  sugarCube() {
    const g = new THREE.Group(), sugar = mat('#fdfcf7', { gloss: 10 });
    add(g, box(1.8, 1.8, 1.8), sugar, 0, 0.9, 0);
    for (const [x, z] of [[1.1, 0.5], [-0.6, 1.15], [0.4, -1.15]]) add(g, box(0.25, 0.25, 0.25), sugar, x, 0.12, z, 0, x * 2);
    return g;
  },

  spoon() {
    const g = new THREE.Group(), steel = mat(STEEL, { gloss: 90 });
    sized(add(g, sphere(1, 10, 6), steel, 0, 0.22, 4.95), 0.9, 0.22, 1.45);
    sized(lay(g, disc(1, 16), mat('#eef1f4', { gloss: 90, decal: 1 }), 0, 0.45, 4.95), 0.72, 1, 1.2);
    add(g, box(0.32, 0.14, 4.6), steel, 0, 0.25, 1.2);
    add(g, memo(geos, 'spoonHandle', () => slab(plan([[-0.3, -1.1], [0.3, -1.1], [0.55, -6], [0, -6.5], [-0.55, -6]]), 0.16)), steel, 0, 0.18, 0);
    return g;
  },

  milkPuddle() {
    const g = new THREE.Group(), milk = mat('#fbfbf2', { gloss: 60, decal: 2 });
    lay(g, blobGeo(4.6, 2, 0, 28, 0.22), milk, 0, 0.03);
    lay(g, blobGeo(1.6, 5, 0, 12, 0.3), mat('#ffffff', { glow: 0.3, decal: 3 }), 1.2, 0.035, -1.4);
    lay(g, blobGeo(0.7, 9, 0, 10), milk, 5.2, 0.03, 1.5);
    lay(g, blobGeo(0.5, 4, 0, 10), milk, -4.7, 0.03, -2.6);
    return g;
  },

  jamBlob() {
    const g = new THREE.Group();
    lay(g, blobGeo(3.3, 4, 0.12, 22, 0.25), mat('#7a0b16', { gloss: 90 }), 0, 0);
    lay(g, blobGeo(1.2, 8, 0, 10, 0.3), mat('#c1121f', { gloss: 90, decal: 2 }), -0.8, 0.125, -0.9);
    for (const [x, z] of [[1.2, 0.6], [-1.3, 1.1], [0.4, -1.6]]) sized(add(g, sphere(0.5, 6, 4), mat('#5c0711', { gloss: 90 }), x, 0.12, z), 1, 0.45, 0.8);
    return g;
  },

  crumbs() {
    const g = new THREE.Group();
    scatter(g, 11, 12, 3, (r) => [0.2 + r() * 0.35, 0.15 + r() * 0.2, 0.2 + r() * 0.3], ['#c98a3c', '#e3a857', '#9c5a22']);
    return g;
  },

  // Snooker table
  ball(o) {
    const g = new THREE.Group();
    add(g, sphere(2, 20, 14), mat(o.color || '#c0261c', { gloss: 100, flat: false }), 0, 2, 0);
    return g;
  },

  chalk() {
    const g = new THREE.Group();
    add(g, box(2.4, 2.2, 2.4), mat('#2f6fd6'), 0, 1.1, 0);
    add(g, box(2.44, 1.3, 2.44), mat('#1d4fa0'), 0, 0.75, 0); // paper wrapper
    add(g, box(2.46, 0.18, 2.46), mat(WHITE), 0, 1.15, 0);
    add(g, cyl(0.75, 0.6, 0.06, 10), mat('#5fa8d3'), 0.1, 2.2, -0.1); // worn hollow in the top
    sized(lay(g, quad(), mat('#8ecae6', { decal: 1 }), 0, 2.21), 1.9, 1, 1.9);
    return g;
  },

  cue() {
    const g = new THREE.Group(), r = (z) => 0.65 - 0.37 * (z + 34) / 68;
    const parts = [[-34, -33, INK], [-33, -14, '#5a3311'], [-14, -13.4, GOLD], [-13.4, 32.8, '#e9c98b'], [32.8, 33.6, WHITE], [33.6, 34, '#3a7bd5']];
    for (const [z0, z1, c] of parts) {
      const r0 = r(z0), r1 = r(z1);
      add(g, cyl(r1, r0, z1 - z0, 10), mat(c, { gloss: 30 }), 0, (r0 + r1) / 2, (z0 + z1) / 2, HALF);
    }
    return g;
  },

  rack() {
    // Wooden triangle that fits the 15 reds; flat side towards -Z.
    const g = new THREE.Group(), wood = mat('#9c6644', { gloss: 20 }), d = 7.06, len = 2 * Math.sqrt(3) * d;
    for (let k = 0; k < 3; k++) {
      const a = -HALF + k * TAU / 3;
      add(g, box(len, 1, 0.9), wood, Math.cos(a) * d, 0.5, Math.sin(a) * d, 0, HALF - a);
      add(g, cyl(0.6, 0.6, 1, 8), wood, -Math.cos(a) * 2 * d, 0.5, -Math.sin(a) * 2 * d);
    }
    return g;
  },

  pocket() {
    const g = new THREE.Group();
    lay(g, ring(4.3, 5.2, 24), mat('#262626', { decal: 1 }), 0, 0.02);
    lay(g, disc(4.3, 24), mat('#050505', { decal: 2 }), 0, 0.021);
    sized(add(g, torus(5.6, 0.55, 5, 24), mat('#4a2c17', { gloss: 20 }), 0, 0.2, 0, HALF), 1, 1, 0.5); // leather rim
    return g;
  },

  chalkDust() {
    const g = new THREE.Group(), speck = mat('#9ccbef', { decal: 3 }), rnd = rand(5);
    lay(g, blobGeo(4.2, 6, 0, 24, 0.25), mat('#b9dcf5', { decal: 1 }), 0, 0.02);
    lay(g, blobGeo(2.6, 11, 0, 18, 0.3), mat('#dcefff', { decal: 2 }), 0.6, 0.025, -0.4);
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU, r = 1 + rnd() * 3.8;
      lay(g, disc(0.18 + rnd() * 0.25, 6), speck, Math.cos(a) * r, 0.03, Math.sin(a) * r);
    }
    return g;
  },

  // Kitchen floor
  tableLeg() {
    const g = new THREE.Group(), wood = mat('#b5793f'), dark = mat('#8b5a2b');
    add(g, box(5.2, 17.2, 5.2), wood, 0, 9.4, 0);
    add(g, box(4.8, 0.8, 4.8), dark, 0, 0.4, 0);
    add(g, box(5.4, 0.5, 5.4), dark, 0, 15.6, 0);
    for (const s of [-1, 1]) {
      for (const u of [-1.2, 0.9]) {
        add(g, box(0.15, 13, 0.06), dark, u, 8, s * 2.61);
        add(g, box(0.06, 13, 0.15), dark, s * 2.61, 7.5, u);
      }
    }
    // Sawn top: end grain and growth rings.
    sized(lay(g, quad(), mat('#d9a066', { decal: 1 }), 0, 18.01), 5);
    for (const r of [0.9, 1.8]) lay(g, ring(r, r + 0.18, 16), mat('#a0673a', { decal: 2 }), 0.3, 18.02, -0.2);
    return g;
  },

  chairLeg() {
    const g = new THREE.Group(), wood = mat('#c98b4f'), dark = mat('#8b5a2b');
    add(g, cyl(1.35, 1.15, 13.2, 12), wood, 0, 7, 0);
    for (const y of [3, 11]) add(g, cyl(1.42, 1.42, 0.35, 12), dark, 0, y, 0);
    add(g, cyl(1.5, 1.5, 0.4, 12), mat('#3d405b'), 0, 0.2, 0); // felt foot pad
    lay(g, disc(1.2, 12), mat('#e0b07a', { decal: 1 }), 0, 13.61);
    return g;
  },

  petBowl() {
    const g = new THREE.Group();
    add(g, lathe('petBowl', [[0, 0], [6, 0], [6, 0.3], [5.2, 3], [4.6, 3], [4.3, 1], [0, 1]]), mat('#e63946', { gloss: 50 }));
    lay(g, ring(4.65, 5.15, 24), mat(WHITE, { decal: 1 }), 0, 3.01);
    sized(add(g, sphere(4.3, 14, 6), mat('#8b5a2b'), 0, 1.6, 0), 1, 0.18, 1);
    const rnd = rand(3), kib = ['#8b5a2b', '#a0522d', '#6f4518', '#c68642'];
    for (let i = 0; i < 18; i++) {
      const a = rnd() * TAU, r = 3.8 * Math.sqrt(rnd()), s = 0.5 + rnd() * 0.25;
      add(g, box(s, s * 0.7, s), mat(kib[i % 4]), Math.cos(a) * r, 1.65 + 0.77 * Math.sqrt(1 - (r / 4.3) ** 2), Math.sin(a) * r, rnd(), rnd() * TAU, rnd());
    }
    return g;
  },

  bucket() {
    const g = new THREE.Group(), plastic = mat('#ffbe0b', { gloss: 30 }), dark = mat('#c98a00');
    add(g, lathe('bucket', [[0, 0.25], [6.8, 0], [8, 9.6], [8.35, 9.65], [8.35, 10], [7.75, 10], [6.55, 0.6], [0, 0.6]]), plastic);
    lay(g, disc(7.45, 20), mat('#7fb3c8', { gloss: 80 }), 0, 8);
    const rnd = rand(9);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, r = 3 + rnd() * 4;
      sized(add(g, sphere(0.4 + rnd() * 0.4, 6, 4), mat(WHITE), Math.cos(a) * r, 8.05, Math.sin(a) * r), 1, 0.4, 1); // soap suds
    }
    for (const s of [-1, 1]) add(g, cyl(0.5, 0.5, 0.6, 8), dark, s * 8.2, 9.3, 0, 0, 0, HALF);
    // The handle has flopped down over the +Z side.
    add(g, torus(8.3, 0.15, 4, 24, Math.PI), mat('#8d99ae'), 0, 9.3, 0, 1.66);
    add(g, cyl(0.35, 0.35, 3, 8), mat(INK), 0, 8.56, 8.27, 0, 0, HALF);
    return g;
  },

  sponge() {
    const g = new THREE.Group(), rnd = rand(4), pore = mat('#e0b42a', { decal: 1 });
    add(g, rounded(6.8, 4.4, 0.4, 0.6), mat('#2d9e4a'));
    add(g, rounded(6.8, 4.4, 0.6, 1.4), mat('#ffd23f'), 0, 0.6, 0);
    for (let i = 0; i < 9; i++) lay(g, disc(0.15 + rnd() * 0.15, 6), pore, (rnd() - 0.5) * 5.6, 2.01, (rnd() - 0.5) * 3.4);
    return g;
  },

  bottleCap() {
    const g = new THREE.Group();
    const crimp = memo(geos, 'bottleCap', () => slab(plan(Array.from({ length: 42 }, (_, i) => {
      const a = (i / 42) * TAU, r = i % 2 ? 1.06 : 1.2;
      return [Math.cos(a) * r, Math.sin(a) * r];
    })), 0.45));
    add(g, crimp, mat('#d62828', { gloss: 60 }));
    lay(g, disc(0.85, 16), mat(WHITE, { decal: 1 }), 0, 0.455);
    lay(g, disc(0.42, 5), mat('#d62828', { decal: 2 }), 0, 0.46);
    return g;
  },

  tin() {
    const g = new THREE.Group(), steel = mat(STEEL, { gloss: 80 }), groove = mat('#9aa3ad', { decal: 1 });
    add(g, cyl(3.3, 3.3, 7.6, 18), steel, 0, 3.9, 0);
    for (const y of [0.15, 7.75]) add(g, torus(3.25, 0.15, 4, 18), steel, 0, y, 0, HALF);
    add(g, cyl(3.36, 3.36, 5.6, 18, true), mat('#e63946'), 0, 3.9, 0); // label
    add(g, cyl(3.38, 3.38, 0.6, 18, true), mat('#ffd23f'), 0, 5.6, 0);
    add(g, cyl(3.38, 3.38, 0.4, 18, true), mat('#2d6a4f'), 0, 2, 0);
    for (const r of [1.2, 2.2]) lay(g, ring(r, r + 0.15, 18), groove, 0, 7.71);
    add(g, torus(0.55, 0.12, 4, 10), steel, 0, 7.8, 1.7, HALF); // ring pull
    add(g, box(0.6, 0.06, 1.3), steel, 0, 7.74, 0.85);
    return g;
  },

  broom() {
    const g = new THREE.Group(), red = mat('#e63946');
    add(g, cyl(0.32, 0.32, 30, 8), mat('#3a86ff'), 0, 0.5, -7, HALF);
    add(g, cyl(0.4, 0.4, 0.8, 8), red, 0, 0.5, -21.6, HALF);
    add(g, memo(geos, 'broomStock', () => slab(plan([[-0.9, 8], [0.9, 8], [1.6, 11], [-1.6, 11]]), 1.4)), red, 0, 0.05, 0);
    const tips = [];
    for (let i = 0; i <= 8; i++) tips.push([2.2 - i * 0.55, i % 2 ? 21.4 : 22]);
    add(g, memo(geos, 'broomBristles', () => slab(plan([[-1.5, 11], [1.5, 11], ...tips]), 1)), mat('#f4d35e'), 0, 0.15, 0);
    for (const x of [-1, 0, 1]) sized(lay(g, quad(), mat('#c9a227', { decal: 1 }), x * 1.1, 1.16, 16.4, x * 0.06), 0.12, 1, 9.5);
    return g;
  },

  waterPuddle() {
    const g = new THREE.Group(), water = mat('#5ab4e5', { gloss: 100, see: 0.55, decal: 2 });
    lay(g, blobGeo(5, 3, 0, 28, 0.22), water, 0, 0.025);
    lay(g, blobGeo(1.8, 6, 0, 12), mat('#e8f7ff', { see: 0.7, decal: 3 }), -1.2, 0.03, -1);
    lay(g, ring(2.6, 2.8, 24), mat('#bfe6fa', { see: 0.6, decal: 3 }), 1.4, 0.03, 1.2);
    lay(g, blobGeo(0.6, 2, 0, 10), water, 5.6, 0.025, -1.4);
    return g;
  },

  cerealSpill() {
    const g = new THREE.Group();
    lay(g, blobGeo(4.5, 12, 0, 24, 0.25), mat('#f1dfb8', { gloss: 40, decal: 1 }), 0, 0.02);
    hoops(g, 21, 9, 4, 0.22, 0.15);
    scatter(g, 8, 8, 4, (r) => [0.9 + r() * 0.4, 0.1, 0.7 + r() * 0.3], ['#e0a43a', '#c98a2c'], 0.03, 0.3);
    return g;
  },

  dustpan() {
    // Jump ramp: the scoop is the slope, the handle sticks out behind the lip.
    const g = new THREE.Group(), red = mat('#e63946'), dark = mat('#c1121f'), a = Math.atan2(1.2, 6);
    add(g, wedge(8.4, 6, 1.2), red);
    for (const s of [-1, 1]) add(g, wedge(0.3, 6, 1.5), dark, s * 4.05, 0, 0);
    for (const z of [-1.6, -0.2, 1.2]) add(g, box(7.2, 0.06, 0.18), dark, 0, 1.2 * (z + 3) / 6 + 0.02, z, -a);
    sized(lay(g, quad(), mat('#2b2d42', { decal: 1 }), 0, 0.02, -3.3), 8.4, 1, 0.6); // rubber lip
    add(g, box(1, 0.5, 2.3), dark, 0, 0.7, 4.1);
    lay(g, disc(0.25, 8), mat(INK, { decal: 1 }), 0, 0.951, 4.6);
    return g;
  },

  magnet(o) {
    const g = new THREE.Group(), c = o.color || '#f2c230';
    const pick = [...c].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 4;
    const shape = memo(geos, `magnet${pick}`, () => slab([
      () => star(1.6, 0.75),
      () => plan(Array.from({ length: 20 }, (_, i) => {
        const t = (i / 20) * TAU, k = 1.5 / 17;
        return [16 * Math.sin(t) ** 3 * k, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k];
      })),
      () => plan([[-1.5, 1.5], [-0.5, -1.5], [0.5, -1.5], [1.5, 1.5], [0.7, 1.5], [0.45, 0.8], [-0.45, 0.8], [-0.7, 1.5]],
        [[[0, -0.75], [0.25, 0.15], [-0.25, 0.15]]]),
      () => plan([[-1.4, -1.5], [1.4, -1.5], [1.4, -0.8], [-0.3, 0.8], [1.4, 0.8], [1.4, 1.5], [-1.4, 1.5], [-1.4, 0.8], [0.3, -0.8], [-1.4, -0.8]]),
    ][pick](), 0.3, { bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 }));
    add(g, shape, mat(c, { gloss: 60 }), 0, 0.1, 0);
    return g;
  },

  rugMat() {
    // Flat enough for the track to be painted over it (top at y = 0.012).
    const g = new THREE.Group(), oval = (m, y, k) => sized(lay(g, disc(1, 32), m, 0, y), 15 * k, 1, 9 * k);
    oval(mat('#c1440e', { decal: 1 }), 0.004, 1);
    sized(lay(g, ring(0.8, 0.9, 32), mat('#f2cc8f', { decal: 2 }), 0, 0.008), 15, 1, 9);
    oval(mat('#e07a5f', { decal: 2 }), 0.008, 0.7);
    const dot = mat('#3d405b', { decal: 3 });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      lay(g, disc(0.35, 4), dot, Math.cos(a) * 15 * 0.85, 0.012, Math.sin(a) * 9 * 0.85);
    }
    lay(g, disc(2.2, 4), mat('#f2cc8f', { decal: 3 }), 0, 0.012);
    return g;
  },

  // Bedroom rug
  block(o) {
    const g = new THREE.Group(), panel = mat(o.color || '#e8503a'), letter = mat('#fff8e7');
    add(g, box(4.8, 4.8, 4.8), mat('#f1d5a5'), 0, 2.4, 0);
    cubeFaces(2.4, 2.4).forEach(([p, r], i) => {
      const f = new THREE.Group();
      add(f, box(4, 4, 0.1), panel, 0, 0, 0.05);
      f.add(glyph('ABCDE'[i], 0.7, 0.12, letter).translateZ(0.1));
      f.position.set(...p);
      f.rotation.set(...r);
      g.add(f);
    });
    return g;
  },

  brick(o) {
    const g = new THREE.Group(), plastic = mat(o.color || '#e63946', { gloss: 60 });
    add(g, box(6.3, 1.55, 3.1), plastic, 0, 0.775, 0);
    for (let i = 0; i < 4; i++) for (const z of [-0.79, 0.79]) add(g, cyl(0.48, 0.48, 0.35, 12), plastic, (i - 1.5) * 1.575, 1.725, z);
    return g;
  },

  crayon(o) {
    const g = new THREE.Group(), c = o.color || '#3a86ff', wax = mat(c), band = mat(INK);
    add(g, cyl(0.6, 0.6, 8.2, 8), wax, 0, 0.6, -0.9, HALF);
    add(g, cyl(0.14, 0.6, 1.8, 8), wax, 0, 0.6, 4.1, HALF);
    add(g, cyl(0.63, 0.63, 6.2, 8, true), mat(shade(c, 0.75)), 0, 0.6, -1, HALF); // paper wrapper
    for (const [z, len] of [[-3.7, 0.35], [-1, 1.8], [1.7, 0.35]]) add(g, cyl(0.65, 0.65, len, 8, true), band, 0, 0.6, z, HALF);
    return g;
  },

  teddy() {
    // Sitting bear facing +Z, arms out for a hug.
    const g = new THREE.Group(), fur = mat('#c68642'), light = mat('#f1d1a1'), dark = mat('#2b1d14', { gloss: 60 });
    const blobby = (m, x, y, z, sx, sy, sz, w = 8, h = 6, rx = 0, ry = 0, rz = 0) => sized(add(g, sphere(1, w, h), m, x, y, z, rx, ry, rz), sx, sy, sz);
    blobby(fur, 0, 3.2, 0, 3.2, 3.2, 3, 10, 8);
    blobby(light, 0, 3, 1.4, 2.2, 2.4, 1.6);
    blobby(fur, 0, 6.6, 0.3, 2.4, 2.1, 2.2, 10, 8);
    for (const s of [-1, 1]) {
      blobby(fur, s * 1.75, 8, 0, 0.85, 0.85, 0.6, 6, 5);
      blobby(light, s * 1.75, 8, 0.32, 0.5, 0.5, 0.3, 6, 4);
      blobby(fur, s * 3.4, 4.3, 0.4, 1, 2.2, 1, 7, 5, 0, 0, -s * 0.9);
      blobby(fur, s * 1.8, 1.2, 2.8, 1.2, 1.2, 2.2, 7, 5, 0, s * 0.3);
      add(g, cyl(0.9, 0.9, 0.2, 8), light, s * 2.45, 1.2, 4.95, HALF);
      add(g, sphere(0.28, 6, 4), dark, s * 0.8, 7.2, 2.1);
      add(g, cyl(0, 0.7, 1, 6), mat('#e63946'), s * 0.55, 5.0, 2.55, 0, 0, s * HALF); // bow tie
    }
    blobby(light, 0, 6.2, 2.2, 1, 0.75, 0.8);
    add(g, sphere(0.38, 6, 4), dark, 0, 6.5, 2.95);
    add(g, sphere(0.3, 6, 4), mat('#e63946'), 0, 5, 2.6);
    return g;
  },

  toyBall(o) {
    const g = new THREE.Group(), colors = [o.color || '#e8503a', WHITE, '#ffd23f', WHITE, '#2ec4b6', WHITE];
    colors.forEach((c, i) => add(g, memo(geos, `beachBall${i}`, () => new THREE.SphereGeometry(4, 3, 10, (i * TAU) / 6, TAU / 6)),
      mat(c, { gloss: 60, flat: false }), 0, 4, 0));
    add(g, memo(geos, 'beachBallCap', () => new THREE.SphereGeometry(4.03, 12, 1, 0, TAU, 0, 0.28)), mat(WHITE, { gloss: 60 }), 0, 4, 0);
    return g;
  },

  marble(o) {
    const g = new THREE.Group(), c = o.color || '#3a86ff';
    sized(add(g, sphere(1, 8, 6), mat(c), 0, 1.3, 0, 0.4, 0.6, 0.3), 1, 0.18, 0.45); // the twist inside
    sized(add(g, sphere(1, 8, 6), mat(WHITE), 0, 1.3, 0, -0.5, -0.8, 0.2), 0.9, 0.15, 0.4);
    add(g, sphere(1.3, 14, 10), mat(pale(c, 0.3), { gloss: 120, see: 0.45, flat: false }), 0, 1.3, 0);
    sized(add(g, sphere(0.22, 6, 4), mat('#ffffff', { glow: 1 }), -0.4, 2.3, -0.4), 1, 0.5, 1);
    return g;
  },

  robot() {
    // Tin wind-up robot facing +Z.
    const g = new THREE.Group(), steel = mat('#b8c0c8', { gloss: 70 }), red = mat('#e63946'), dark = mat('#2b2d42');
    for (const s of [-1, 1]) {
      add(g, box(0.9, 0.5, 2), dark, s * 0.7, 0.25, 1);
      add(g, box(0.7, 1.4, 0.8), steel, s * 0.7, 1.2, 0.3);
      add(g, box(0.6, 1.8, 0.7), steel, s * 1.8, 3.1, 0.3, -0.5);
      add(g, box(0.7, 0.5, 0.7), dark, s * 1.8, 2.05, 0.9, -0.5);
      add(g, cyl(0.3, 0.3, 0.12, 10), mat('#ffd23f', { glow: 0.8 }), s * 0.5, 5.35, 0.92, HALF); // eyes
      add(g, cyl(0.25, 0.25, 0.25, 8), red, s * 1.2, 5.2, 0, 0, 0, HALF);
      add(g, torus(0.4, 0.12, 4, 8), mat(GOLD, { gloss: 60 }), s * 0.42, 3.2, -1.65); // wind-up key
    }
    add(g, box(2.8, 2.3, 2), red, 0, 3.05, 0);
    add(g, box(1.6, 1, 0.08), dark, 0, 3.2, 1.04);
    ['#ffd23f', '#8ac926', '#4cc9f0'].forEach((c, i) => add(g, cyl(0.15, 0.15, 0.1, 8), mat(c, { glow: 0.5 }), (i - 1) * 0.45, 3.2, 1.1, HALF));
    add(g, cyl(0.4, 0.4, 0.3, 8), dark, 0, 4.35, 0);
    add(g, box(2.2, 1.5, 1.8), steel, 0, 5.2, 0);
    add(g, box(1.1, 0.3, 0.06), dark, 0, 4.8, 0.91);
    add(g, cyl(0.06, 0.06, 0.6, 5), dark, 0, 6.25, 0);
    add(g, sphere(0.25, 6, 4), mat('#e63946', { glow: 0.5 }), 0, 6.65, 0);
    add(g, cyl(0.12, 0.12, 0.6, 6), mat(GOLD), 0, 3.2, -1.3, HALF);
    return g;
  },

  bookRamp() {
    // An open book propped up at the +Z end: pages are the slope, page edges show at the sides.
    const g = new THREE.Group(), a = Math.atan2(1.05, 6.8), len = Math.hypot(1.05, 6.8);
    add(g, wedge(9, 6.8, 1.05), mat('#efe6d2'));
    const tilt = new THREE.Group();
    tilt.position.set(0, 0, -3.4);
    tilt.rotation.x = -a;
    g.add(tilt);
    add(tilt, box(9.2, 0.12, len + 0.1), mat('#c1121f'), 0, 0.06, len / 2);
    const line = mat('#9a8c98', { decal: 1 });
    for (const s of [-1, 1]) {
      const page = add(tilt, box(4.4, 0.22, len - 0.4), mat('#fbf6ea'), s * 2.25, 0.23, len / 2, 0, 0, s * 0.04);
      for (let i = 0; i < 7; i++) sized(lay(page, quad(), line, s * 0.1, 0.115, -2.6 + i * 0.85), 3.4, 1, 0.12);
    }
    sized(lay(tilt, quad(), mat('#ffd23f', { decal: 2 }), 0, 0.35, len * 0.55), 0.35, 1, 3.2); // ribbon bookmark
    return g;
  },

  book(o) {
    const g = new THREE.Group(), cover = mat(o.color || '#7e57c2'), gold = mat(GOLD), edge = mat('#cbbf9f');
    add(g, box(12, 0.2, 8.8), cover, 0, 0.1, 0);
    add(g, box(11.3, 1.6, 8.4), mat('#f3ead8'), 0.05, 1, 0);
    for (const y of [0.7, 1.3]) add(g, box(11.32, 0.04, 8.42), edge, 0.05, y, 0);
    add(g, box(12, 0.2, 8.8), cover, 0, 1.9, 0);
    add(g, box(0.3, 2, 8.8), cover, -5.95, 1, 0); // spine
    for (const z of [-3.2, 3.2]) add(g, box(0.32, 2.02, 0.3), gold, -5.95, 1, z);
    add(g, box(5, 0.04, 2), mat(CREAM), 0.6, 2.02, -1.8); // title label
    add(g, box(0.15, 0.04, 8.8), gold, -4.8, 2.02, 0);
    add(g, memo(geos, 'bookStar', () => slab(star(1.4, 0.6), 0.05)), gold, 0.6, 2, 1.6);
    return g;
  },

  toyTrain() {
    // Wooden locomotive facing +Z.
    const g = new THREE.Group(), red = mat('#e63946'), yellow = mat('#ffd23f'), black = mat(INK);
    add(g, box(2, 0.5, 4.4), mat('#e0b77a'), 0, 0.85, 0);
    for (const s of [-1, 1]) {
      for (const z of [1.4, 0, -1.4]) {
        add(g, cyl(0.55, 0.55, 0.3, 10), black, s * 1.15, 0.55, z, 0, 0, HALF);
        add(g, cyl(0.2, 0.2, 0.34, 6), yellow, s * 1.15, 0.55, z, 0, 0, HALF);
      }
    }
    add(g, cyl(0.85, 0.85, 2.4, 12), red, 0, 1.95, 0.9, HALF); // boiler
    add(g, cyl(0.6, 0.6, 0.06, 12), black, 0, 1.95, 2.13, HALF);
    for (const z of [0.4, 1.6]) add(g, cyl(0.88, 0.88, 0.15, 12, true), yellow, 0, 1.95, z, HALF);
    add(g, cyl(0.45, 0.32, 0.9, 10), black, 0, 3.05, 1.6); // chimney
    add(g, cyl(0.5, 0.5, 0.15, 10), yellow, 0, 3.42, 1.6);
    add(g, sphere(0.35, 8, 6), yellow, 0, 2.85, 0.5);
    add(g, box(2, 1.6, 1.7), mat('#3a86ff'), 0, 1.9, -1.35); // cab
    add(g, box(2.04, 0.6, 0.8), mat('#1d2633'), 0, 2.2, -1.25);
    add(g, box(3.3, 0.25, 2.1), yellow, 0, 2.85, -1.35);
    add(g, box(2.2, 0.35, 0.25), red, 0, 0.8, 2.25);
    add(g, box(0.3, 0.3, 0.3), black, 0, 0.85, -2.3);
    return g;
  },

  pond() {
    // Painted on the rug, so it stays flat.
    const g = new THREE.Group(), pad = mat('#52b788', { decal: 4 });
    lay(g, blobGeo(4.9, 21, 0, 24, 0.2), mat('#e9d8a6', { decal: 1 }), 0, 0.015);
    lay(g, blobGeo(4.2, 21, 0, 24, 0.2), mat('#3a8fd6', { decal: 2 }), 0, 0.02);
    lay(g, blobGeo(2.4, 5, 0, 16), mat('#5fb0ea', { decal: 3 }), -0.6, 0.025, 0.4);
    lay(g, ring(1, 1.15, 16), mat('#d7f0ff', { decal: 4 }), 1.4, 0.03, -1.2);
    const lily = memo(geos, 'lilyPad', () => new THREE.CircleGeometry(0.8, 10, 0.4, TAU - 0.8).rotateX(-HALF));
    for (const [x, z, r] of [[-2.2, -1.2, 0.3], [2.1, 1.6, 2.2], [-0.8, 2.4, 4]]) lay(g, lily, pad, x, 0.035, z, r);
    lay(g, disc(0.25, 6), mat('#ff99c8', { decal: 5 }), -2.2, 0.04, -1.2);
    return g;
  },

  house(o) {
    // Toy village house; consecutive houses take turns with the colours.
    const k = (o.variant ?? houses++) % 4, g = new THREE.Group();
    const wall = mat(['#fff3d6', '#ffd6e0', '#d7f0ff', '#e2f5d0'][k]), glass = mat('#9bd5ff', { glow: 0.15 });
    add(g, box(4.4, 3, 4.4), wall, 0, 1.5, 0);
    add(g, gable(5.2, 2, 4.6), [wall, mat(['#e63946', '#3a86ff', '#2a9d8f', '#8338ec'][k])], 0, 3, 0);
    add(g, box(0.6, 1.2, 0.6), mat('#b23a48'), 1.2, 4.3, -1);
    add(g, box(1, 1.7, 0.1), mat('#8b5a2b'), 0.6, 0.85, 2.22);
    add(g, box(0.9, 0.9, 0.1), glass, -1.1, 1.8, 2.22);
    add(g, box(0.9, 0.9, 0.1), glass, 0, 1.8, -2.22);
    for (const s of [-1, 1]) for (const z of [-1, 1]) add(g, box(0.1, 0.9, 0.9), glass, s * 2.22, 1.8, z);
    return g;
  },
};

export const MODEL_NAMES = Object.keys(BUILDERS);

export function buildProp(name, opts = {}) {
  const make = BUILDERS[name];
  let g;
  if (make) g = make(opts);
  else {
    g = new THREE.Group();
    add(g, box(1, 1, 1), mat('#ff00ff'), 0, 0.5, 0);
  }
  g.name = name;
  return g;
}

// ---- cars -----------------------------------------------------------------------

// A wheel on its own pivot (rotation.y steers it) at axle height r.
function wheel(parent, x, z, r, w) {
  const pivot = new THREE.Group();
  pivot.position.set(x, r, z);
  add(pivot, cyl(r, r, w, 10), mat('#1f1f26'), 0, 0, 0, 0, 0, HALF);
  add(pivot, cyl(r * 0.55, r * 0.55, w + 0.02, 6), mat('#d9dde3'), 0, 0, 0, 0, 0, HALF);
  parent.add(pivot);
  return pivot;
}
// Front left, front right, rear left, rear right. Facing +Z, the car's left is +X.
const wheels = (g, x, zf, zr, rf, rr, wf, wr = wf) =>
  [wheel(g, x, zf, rf, wf), wheel(g, -x, zf, rf, wf), wheel(g, x, zr, rr, wr), wheel(g, -x, zr, rr, wr)];

const CARS = [
  // Sports racer: low wedge, glass canopy, twin stripes, rear wing.
  ({ g, paint, trim, glass, dark, lamp, tail }) => {
    const body = side('car0', [[-0.95, 0.12], [0.95, 0.12], [0.97, 0.22], [0.6, 0.34], [-0.3, 0.42], [-0.95, 0.45]], 1);
    add(g, body, paint);
    for (const s of [-1, 1]) sized(add(g, body, trim, s * 0.13), 0.12, 1.025, 1.008);
    add(g, side('car0cab', [[-0.5, 0.36], [0.38, 0.3], [0.08, 0.62], [-0.32, 0.63]], 0.7), glass);
    add(g, box(0.62, 0.04, 0.36), paint, 0, 0.64, -0.12);
    add(g, box(1.04, 0.05, 0.22), paint, 0, 0.62, -0.85);
    for (const s of [-1, 1]) {
      add(g, box(0.12, 0.045, 0.36), trim, s * 0.13, 0.64, -0.12);
      add(g, box(0.05, 0.16, 0.1), dark, s * 0.3, 0.53, -0.82);
      add(g, box(0.24, 0.04, 0.14), lamp, s * 0.3, 0.262, 0.86, 0.314);
      add(g, box(0.25, 0.06, 0.03), tail, s * 0.3, 0.38, -0.96);
    }
    return wheels(g, 0.5, 0.58, -0.6, 0.21, 0.21, 0.18);
  },
  // Buggy: open tub, roll cage in the trim colour, driver in a helmet, big wheels.
  ({ g, paint, trim, glass, dark, lamp, tail }) => {
    add(g, side('car1', [[-0.7, 0.2], [0.75, 0.2], [0.9, 0.38], [0.4, 0.42], [-0.7, 0.45]], 0.75), paint);
    add(g, box(0.9, 0.08, 0.08), dark, 0, 0.3, 0.97);
    add(g, box(0.5, 0.25, 0.35), mat('#7a7f87'), 0, 0.5, -0.65); // engine
    add(g, box(0.45, 0.3, 0.08), dark, 0, 0.6, -0.3);
    add(g, sphere(0.17, 8, 6), trim, 0, 0.72, -0.1);
    add(g, box(0.2, 0.06, 0.05), glass, 0, 0.73, 0.06);
    lay(g, disc(0.16, 12), trim, 0, 0.43, 0.6);
    lay(g, disc(0.08, 8), mat(INK, { decal: 1 }), 0, 0.431, 0.6);
    for (const z of [0.25, -0.35]) add(g, box(0.69, 0.05, 0.05), trim, 0, 0.87, z);
    for (const s of [-1, 1]) {
      for (const z of [0.25, -0.35]) add(g, box(0.05, 0.42, 0.05), trim, s * 0.32, 0.66, z);
      add(g, box(0.05, 0.05, 0.65), trim, s * 0.32, 0.87, -0.05);
      add(g, cyl(0.04, 0.04, 0.3, 6), dark, s * 0.15, 0.55, -0.92, HALF);
      add(g, cyl(0.06, 0.06, 0.06, 8), lamp, s * 0.18, 0.92, 0.27);
      add(g, box(0.12, 0.05, 0.03), tail, s * 0.25, 0.4, -0.71);
    }
    return wheels(g, 0.5, 0.62, -0.62, 0.3, 0.3, 0.24);
  },
  // Pickup: tall cab, open bed with a crate, stripe over the roof and bonnet.
  ({ g, paint, trim, glass, dark, lamp, tail }) => {
    add(g, box(1.04, 0.3, 1.94), paint, 0, 0.33, 0);
    add(g, side('car2cab', [[-0.25, 0.48], [0.42, 0.48], [0.3, 0.82], [-0.25, 0.84]], 0.98), paint);
    add(g, box(0.86, 0.3, 0.03), glass, 0, 0.65, 0.39, -0.34);
    add(g, box(1, 0.18, 0.4), glass, 0, 0.7, 0.02);
    add(g, box(0.8, 0.16, 0.03), glass, 0, 0.7, -0.26);
    add(g, box(0.3, 0.02, 0.5), trim, 0, 0.85, 0.02);
    add(g, box(0.3, 0.02, 0.55), trim, 0, 0.49, 0.67);
    add(g, box(0.9, 0.02, 0.7), dark, 0, 0.49, -0.6);
    add(g, box(1.04, 0.18, 0.07), paint, 0, 0.57, -0.935);
    add(g, box(0.4, 0.22, 0.3), mat('#c68642'), 0.15, 0.61, -0.62);
    add(g, box(1.06, 0.08, 0.06), mat(STEEL, { gloss: 60 }), 0, 0.22, 0.98);
    for (const s of [-1, 1]) {
      add(g, box(0.07, 0.18, 0.72), paint, s * 0.485, 0.57, -0.6);
      add(g, box(0.2, 0.08, 0.03), lamp, s * 0.33, 0.4, 0.975);
      add(g, box(0.15, 0.08, 0.03), tail, s * 0.38, 0.4, -0.975);
    }
    return wheels(g, 0.5, 0.62, -0.62, 0.22, 0.22, 0.2);
  },
  // Open-wheel formula car: needle nose, sidepods, wings in the trim colour.
  ({ g, paint, trim, glass, dark, lamp, tail }) => {
    add(g, cyl(0.08, 0.2, 0.75, 4), paint, 0, 0.24, 0.62, HALF, Math.PI / 4);
    add(g, box(0.42, 0.26, 0.9), paint, 0, 0.3, -0.2);
    add(g, cyl(0.08, 0.2, 0.5, 4), paint, 0, 0.38, -0.85, -HALF, Math.PI / 4);
    add(g, box(0.26, 0.02, 0.3), dark, 0, 0.435, 0);
    add(g, sphere(0.13, 8, 6), trim, 0, 0.48, -0.05);
    add(g, box(0.16, 0.05, 0.04), glass, 0, 0.5, 0.07);
    add(g, box(1.2, 0.04, 0.22), trim, 0, 0.12, 1);
    add(g, box(0.95, 0.05, 0.22), trim, 0, 0.62, -0.95);
    add(g, box(0.06, 0.24, 0.06), dark, 0, 0.48, -0.9);
    add(g, box(0.08, 0.06, 0.03), tail, 0, 0.3, -1.06);
    for (const s of [-1, 1]) {
      add(g, box(0.22, 0.18, 0.6), paint, s * 0.32, 0.25, -0.25);
      add(g, box(0.03, 0.12, 0.24), paint, s * 0.6, 0.14, 1);
      add(g, box(0.03, 0.26, 0.26), paint, s * 0.475, 0.52, -0.95);
      add(g, box(0.1, 0.05, 0.03), lamp, s * 0.32, 0.28, 0.06);
    }
    return wheels(g, 0.5, 0.62, -0.62, 0.2, 0.24, 0.18, 0.24);
  },
];

export function buildCar(color, variant = 0) {
  const g = new THREE.Group();
  // Paint and trim belong to this car alone so setColor doesn't recolour the field.
  const paint = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const trim = new THREE.MeshLambertMaterial({ color: contrast(color), flatShading: true });
  g.userData.wheels = CARS[((variant % 4) + 4) % 4]({
    g, paint, trim, glass: mat('#1d2633', { gloss: 80 }), dark: mat('#23232b'),
    lamp: mat('#fff4c2', { glow: 0.8 }), tail: mat('#ff3b3b', { glow: 0.6 }),
  });
  g.userData.setColor = (css) => { paint.color.set(css); trim.color.set(contrast(css)); };
  return g;
}

// ---- pickups ----------------------------------------------------------------------

// Rainbow mystery box with a pixel '?' on the top and sides, centred at y = 1.3.
export function buildItemBox() {
  const g = new THREE.Group(), core = new THREE.Group(), edge = mat('#ffffff', { glow: 0.6 }), q = mat('#ffffff', { glow: 0.8 });
  core.position.y = 1.3;
  g.add(core);
  add(core, box(1.36, 1.36, 1.36), ['#ff5d8f', '#4cc9f0', '#ffd23f', '#ff9f1c', '#8ac926', '#b388ff'].map((c) => mat(c, { glow: 0.45 })));
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      add(core, box(1.56, 0.12, 0.12), edge, 0, a * 0.72, b * 0.72);
      add(core, box(0.12, 1.56, 0.12), edge, a * 0.72, 0, b * 0.72);
      add(core, box(0.12, 0.12, 1.56), edge, a * 0.72, b * 0.72, 0);
    }
  }
  for (const [p, r] of cubeFaces(0.68, 0)) {
    const mark = glyph('?', 0.2, 0.08, q);
    mark.position.set(...p);
    mark.rotation.set(...r);
    core.add(mark);
  }
  return g;
}

// Toy firework rocket, nose to +Z, centred at y = 0.7.
export function buildRocket() {
  const g = new THREE.Group(), r = new THREE.Group(), yellow = mat('#ffd23f');
  r.position.y = 0.7;
  g.add(r);
  add(r, cyl(0.2, 0.2, 0.9, 10), mat('#e63946'), 0, 0, -0.05, HALF);
  for (const z of [0.25, -0.3]) add(r, cyl(0.205, 0.205, 0.1, 10, true), yellow, 0, 0, z, HALF);
  add(r, cyl(0, 0.21, 0.4, 10), mat(WHITE), 0, 0, 0.6, HALF);
  const fin = memo(geos, 'fin', () => slab(plan([[0.15, -0.25], [0.4, -0.55], [0.4, -0.76], [0.15, -0.5]]), 0.05).translate(0, -0.025, 0));
  for (let k = 0; k < 4; k++) add(r, fin, mat('#3a86ff'), 0, 0, 0, 0, 0, k * HALF);
  add(r, cyl(0.17, 0, 0.35, 8), mat('#ff9f1c', { glow: 1 }), 0, 0, -0.68, HALF).castShadow = false;
  add(r, cyl(0.1, 0, 0.25, 6), mat('#fff3b0', { glow: 1 }), 0, 0, -0.6, HALF).castShadow = false;
  return g;
}

// Glossy black oil slick, radius about 2.2, top at y = 0.055.
export function buildOil() {
  const g = new THREE.Group(), oil = mat('#111018', { gloss: 120 });
  lay(g, blobGeo(2, 17, 0.05, 22, 0.2), oil, 0, 0.005);
  lay(g, blobGeo(0.9, 4, 0, 12, 0.3), mat('#3b3355', { gloss: 120, decal: 2 }), 0.5, 0.057, -0.5);
  lay(g, blobGeo(0.4, 6, 0, 10, 0.3), mat('#2d4a6b', { gloss: 120, decal: 3 }), -0.6, 0.058, 0.7);
  for (const [x, z] of [[2.3, 0.8], [-2.1, -1.2]]) lay(g, blobGeo(0.35, 8, 0.04, 8), oil, x, 0.005, z);
  return g;
}

// See-through bubble round a car, radius 1.5, centred at y = 0.5.
export function buildShield() {
  const g = new THREE.Group(), band = mat('#bdf3ff', { see: 0.7, glow: 0.8 });
  g.add(new THREE.Mesh(sphere(1.5, 20, 14), mat('#4cc9f0', { gloss: 100, see: 0.3, glow: 0.3, flat: false })));
  g.add(new THREE.Mesh(torus(1.5, 0.04, 4, 32), band));
  g.add(new THREE.Mesh(torus(1.5, 0.04, 4, 32), band));
  g.children.forEach((m, i) => { m.position.y = 0.5; m.rotation.set(i === 1 ? HALF : 0.5, 0, i === 2 ? 0.9 : 0); });
  return g;
}

// Flat boost pad, 5.6 x 6.8, chevrons pointing +Z. The chevrons have their own
// materials so the caller can pulse them through group.userData.chevrons.
export function buildBoostPad() {
  const g = new THREE.Group();
  lay(g, rounded(5.6, 6.8, 0.6, 0.03), mat('#ff9f1c'), 0, 0);
  lay(g, rounded(5, 6.2, 0.4), mat('#2b2440', { decal: 1 }), 0, 0.032);
  const shape = memo(geos, 'chevron', () => slab(plan([[-2, -0.55], [0, 0.85], [2, -0.55], [2, -1.25], [0, 0.15], [-2, -1.25]])));
  g.userData.chevrons = ['#ff9f1c', '#ffb627', '#ffd23f'].map((c, i) => lay(g, shape, new THREE.MeshLambertMaterial({
    color: c, emissive: c, emissiveIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), 0, 0.05, (i - 1) * 1.9));
  return g;
}

// Checks that client/models.js has a sane mesh for every prop in the catalogue.
// Runs in Node (no DOM), so the builders must not need a canvas to work.

import * as THREE from 'three';
import { PROPS } from '../src/shared/props.js';
import * as models from '../src/client/models.js';

const TALL = { cerealBox: 13, tableLeg: 20, chairLeg: 16, bucket: 11, milkCarton: 10 };
let failed = 0;
const fail = (msg) => { failed++; console.error(`FAIL ${msg}`); };

function measure(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  let tris = 0, meshes = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
    tris += (n / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return { box, tris, meshes };
}

for (const [name, spec] of Object.entries(PROPS)) {
  let obj;
  try { obj = models.buildProp(name, { color: '#3a7bd5' }); } catch (err) { fail(`${name}: threw ${err.message}`); continue; }
  if (!obj || !obj.isObject3D) { fail(`${name}: not an Object3D`); continue; }
  const { box, tris, meshes } = measure(obj);
  if (!meshes) { fail(`${name}: no meshes`); continue; }
  if (tris > 1600) fail(`${name}: ${tris} triangles (max 1600)`);
  const ex = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), ez = Math.max(Math.abs(box.min.z), Math.abs(box.max.z));
  const zone = spec.shape === 'zone', maxH = zone ? 1.6 : TALL[name] || 9.5;
  if (box.max.y > maxH) fail(`${name}: ${box.max.y.toFixed(1)} tall (max ${maxH})`);
  if (box.min.y < (name === 'pocket' ? -8 : -0.2)) fail(`${name}: goes below the surface (${box.min.y.toFixed(2)})`);
  if (spec.shape === 'none') continue;
  const hw = spec.r ?? spec.hw, hd = spec.r ?? spec.hd;
  if (ex > hw * 1.3 + 1.6 || ez > hd * 1.3 + 1.6) fail(`${name}: footprint ${ex.toFixed(1)} x ${ez.toFixed(1)} is bigger than its collider ${hw} x ${hd}`);
  if (ex < hw * 0.65 || ez < hd * 0.65) fail(`${name}: footprint ${ex.toFixed(1)} x ${ez.toFixed(1)} is much smaller than its collider ${hw} x ${hd}`);
}

for (let variant = 0; variant < 4; variant++) {
  const car = models.buildCar('#e63946', variant), { box, tris } = measure(car);
  const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
  if (sx < 0.9 || sx > 1.5 || sz < 1.6 || sz > 2.3 || box.max.y > 1.1) fail(`car ${variant}: size ${sx.toFixed(2)} x ${sz.toFixed(2)} x ${box.max.y.toFixed(2)}`);
  if (tris > 1000) fail(`car ${variant}: ${tris} triangles (max 1000)`);
  if (!Array.isArray(car.userData.wheels) || car.userData.wheels.length !== 4) fail(`car ${variant}: userData.wheels must list 4 wheels`);
  if (typeof car.userData.setColor !== 'function') fail(`car ${variant}: userData.setColor missing`);
}
for (const fn of ['buildItemBox', 'buildRocket', 'buildOil', 'buildShield', 'buildBoostPad']) {
  try {
    const { meshes } = measure(models[fn]());
    if (!meshes) fail(`${fn}: no meshes`);
  } catch (err) { fail(`${fn}: ${err.message}`); }
}

console.log(failed ? `${failed} problem(s)` : `models ok: ${Object.keys(PROPS).length} props, 4 cars`);
process.exit(failed ? 1 : 0);

// Headless race: bots lap every track so layouts and physics can be checked
// and tuned without a browser.  node scripts/sim.js [trackId] [--bots 16] [--laps 3] [--difficulty normal]

import { TRACKS } from '../src/shared/tracks.js';
import { getWorld, updateMovers } from '../src/shared/world.js';
import { makeCar, placeCar, stepCar, collideCars, updateSlipstream, DT } from '../src/shared/physics.js';
import { bakeAI, makeBot, botInput } from '../src/shared/ai.js';

export function simulate(trackId, { bots = 16, laps = 3, difficulty = 'normal', maxTime = 300 } = {}) {
  const world = getWorld(trackId);
  bakeAI(world);
  const stats = { fall: 0, respawn: 0, bump: 0, jump: 0, pad: 0, stuck: 0, off: 0, steps: 0 };
  const cars = [], drivers = [];
  for (let i = 0; i < bots; i++) {
    const car = makeCar(i + 1), g = world.grid(i);
    placeCar(car, world, g.s, g.lat);
    car.frozen = false; car.lapT = 0; car.laps = [];
    cars.push(car); drivers.push(makeBot(i + 1, difficulty));
  }
  let t = 0;
  const emit = (type, car) => {
    if (type === 'lap') {
      car.lapsDone++; car.laps.push(t - car.lapT); car.lapT = t;
      if (car.lapsDone >= laps) { car.finished = true; car.finishT = t; }
    } else if (type in stats) stats[type]++;
  };
  const inp = { steer: 0, throttle: 0, brake: 0 };
  while (t < maxTime && cars.some((c) => !c.finished)) {
    updateMovers(world, t);
    cars.forEach((car, i) => {
      if (car.finished) { inp.steer = 0; inp.throttle = 0; inp.brake = 1; } else {
        const before = drivers[i].stuckCount || 0;
        botInput(car, drivers[i], world, cars, DT, null, inp);
        if ((drivers[i].stuckCount || 0) > before) stats.stuck++;
      }
      stepCar(car, inp, DT, world, emit);
      if (Math.abs(car.lat) > world.track.hw) stats.off++;
      stats.steps++;
    });
    collideCars(cars, cars, emit);
    updateSlipstream(cars, cars, DT);
    t += DT;
  }
  const lapTimes = cars.flatMap((c) => c.laps.slice(1)).sort((a, b) => a - b); // flying laps only
  return {
    track: trackId, len: world.track.len, time: t, finished: cars.filter((c) => c.finished).length, bots,
    best: lapTimes[0], median: lapTimes[Math.floor(lapTimes.length / 2)], worst: lapTimes[lapTimes.length - 1],
    stats, cars,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const ids = args[0] && !args[0].startsWith('--') ? [args[0]] : TRACKS.map((t) => t.id);
  for (const id of ids) {
    const r = simulate(id, { bots: +opt('bots', 16), laps: +opt('laps', 3), difficulty: opt('difficulty', 'normal') });
    const f = (v) => (v == null ? '  -  ' : v.toFixed(2));
    console.log(`${id.padEnd(10)} len ${r.len.toFixed(0).padStart(4)}  finished ${r.finished}/${r.bots} in ${r.time.toFixed(0)}s  lap best ${f(r.best)} median ${f(r.median)} worst ${f(r.worst)}  `
      + `falls ${r.stats.fall} respawns ${r.stats.respawn} stuck ${r.stats.stuck} bumps ${r.stats.bump} jumps ${r.stats.jump} pads ${r.stats.pad} off ${(100 * r.stats.off / r.stats.steps).toFixed(1)}%`);
  }
}

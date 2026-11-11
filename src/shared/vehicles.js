// What a room's vehicles handle like. Every room races one kind, so a race is
// always like against like.
//   maxSpeed, accel, brake, reverse   metres per second (per second)
//   turn     steering rate, radians per second
//   grip     how fast sideways slide dies away; low = drifty
//   loose    0..1, how much of that grip goes at top speed, so the tail comes
//            round in a fast corner
//   carry    0..1, how much of the speed a slide scrubs off is kept
//   slide    0..1, how hard it powerslides (brake tap while turning); 0 = never
//   drag     how fast it slows with nothing pressed
//   pivot    can turn on the spot (tanks)
//   rough    0..1, how much of the off-road slowdown it shrugs off
//   gun      fires shells from the item button when it holds no power-up
//   hover    flies this high: passes over low props and anything on the ground
//   caution  how much extra room the bots leave in corners

export const VEHICLES = {
  car: { name: 'Cars', maxSpeed: 30, accel: 26, brake: 42, reverse: 9, turn: 3.7, grip: 10, loose: 0.45, carry: 0.65, slide: 1, drag: 0.7, pivot: false, rough: 0, gun: false, hover: 0, caution: 1.1 },
  boat: { name: 'Boats', maxSpeed: 28, accel: 16, brake: 22, reverse: 7, turn: 3.1, grip: 3.4, loose: 0, carry: 0.4, slide: 0.6, drag: 0.5, pivot: false, rough: 0, gun: false, hover: 0, caution: 1.5 },
  tank: { name: 'Tanks', maxSpeed: 25, accel: 34, brake: 60, reverse: 14, turn: 2.5, grip: 16, loose: 0, carry: 0, slide: 0, drag: 1.6, pivot: true, rough: 0.75, gun: true, hover: 0, caution: 1 },
  heli: { name: 'Helicopters', maxSpeed: 31, accel: 18, brake: 28, reverse: 10, turn: 3.2, grip: 4.6, loose: 0, carry: 0, slide: 0, drag: 0.5, pivot: false, rough: 0, gun: false, hover: 1.7, caution: 1.35 },
};

export const vehicleOf = (def) => VEHICLES[def.vehicle] || VEHICLES.car;

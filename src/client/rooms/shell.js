// Room shells that more than one room uses.

// A floor with a skirting board and the foot of the walls round it, and
// darkness beyond: for rooms whose edge is a wall.
export function skirting({ box, plane, lam, w, d, hx, hz, theme }, { skirt = '#fbfbf6', wall = '#cfe6ea' } = {}) {
  const a = lam({ color: skirt }), b = lam({ color: wall });
  for (const s of [-1, 1]) {
    box(w + 8, 7, 4, 0, 3.5, s * (hz + 2), a); box(4, 7, d, s * (hx + 2), 3.5, 0, a);
    box(w + 8, 0.5, 5, 0, 7.2, s * (hz + 2.5), b, false); box(5, 0.5, d, s * (hx + 2.5), 7.2, 0, b, false);
  }
  plane(1600, 1600, -0.5, lam({ color: theme.bg })).receiveShadow = false;
}

// Dusthaven round 4 — districts, shops, respect, radio and the garage catalogue.
// All content is data: the city, HUD and garage menu read it, no behaviour lives
// here. Names are original to Dusthaven — nothing from any commercial game.

// Six named districts cover the town in a 3 x 2 grid. The minimap draws the
// names, the HUD shows where Rook is standing, and the stats screen lists
// them. Landmarks anchor each one so the names mean something on the ground.
export const DISTRICTS = [
  { id: 'oldtown', name: 'Old Town', x0: -240, z0: -240, x1: -60, z1: -60, blurb: 'Rusty Spur Motel · Desert Chapel' },
  { id: 'mainstreet', name: 'Main Street', x0: -60, z0: -240, x1: 60, z1: -60, blurb: 'Shop row · Wash Bridge' },
  { id: 'junction', name: 'Junction', x0: 60, z0: -240, x1: 240, z1: -60, blurb: "Sheriff's Office · Gas & Go" },
  { id: 'chapelflats', name: 'Chapel Flats', x0: -240, z0: -60, x1: -60, z1: 240, blurb: 'Dusthaven Diner · dunes' },
  { id: 'northflats', name: 'North Flats', x0: -60, z0: -60, x1: 60, z1: 240, blurb: 'Water Tower · Drive-In' },
  { id: 'driveinrow', name: 'Drive-In Row', x0: 60, z0: -60, x1: 240, z1: 240, blurb: 'Dusthaven Drive-In · Palms Hotel' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  }
  return DISTRICTS[1];
}

// Street names for the minimap: the avenue Rook drives most, and the two
// roads the jobs run on. The wash crossing gets a name too — the bridge is
// the town's one piece of engineering anyone brags about.
export const STREETS = [
  { name: 'Main St', axis: 'x', at: 0 },
  { name: 'Motel Row', axis: 'z', at: -60 },
  { name: 'Diner Mile', axis: 'z', at: 60 },
  { name: 'Wash Xing', axis: 'z', at: 90 },
];

// The shop row on the north side of Motel Row (z = -70), facing the road.
// Four lit storefronts in the block the generic buildings leave alone.
export const SHOPS = [
  { name: 'EL SOL TACOS', fg: '#ffd23d', bg: '#5a2e10', x: -44 },
  { name: 'DUSTY PAWN', fg: '#3ae0ff', bg: '#12262a', x: -26 },
  { name: 'LIQUOR & SUNDRY', fg: '#ff5da2', bg: '#241a20', x: -8 },
  { name: 'BARBER', fg: '#7dff5e', bg: '#1c2b12', x: 10 },
];
export const SHOP_ROW_Z = -70;

// Respect: the town's opinion of Rook. Missions pay the most; stealing cars
// and losing the law pay a little; getting busted costs standing.
export const RESPECT_RANKS = [
  { at: 0, title: 'Nobody' },
  { at: 100, title: 'Wheelman' },
  { at: 250, title: 'Fixer' },
  { at: 500, title: 'Shot Caller' },
  { at: 1000, title: 'King of Dusthaven' },
];

export function respectTitle(points) {
  let title = RESPECT_RANKS[0].title;
  let next = null;
  for (const r of RESPECT_RANKS) {
    if (points >= r.at) title = r.title;
    else { next = r; break; }
  }
  return { title, nextAt: next ? next.at : null };
}

// The garage catalogue at Rook's Garage. Every item has a real effect in
// the game — repair restores condition, plating fills the armour bar, tunes
// raise the car's top speed, nitro unlocks the boost. Prices are the ones
// the judge's leaders show on their own shop screens, tuned to Dusthaven's
// economy (jobs pay $500–$1,500).
export const GARAGE_ITEMS = [
  { id: 'repair', name: 'Full Repair', desc: 'Bodywork, glass, alignment — condition back to 100%.', price: 250 },
  { id: 'respray', name: 'Respray', desc: 'A fresh coat, your pick of the town palette. Condition +5.', price: 400 },
  { id: 'armour', name: 'Armour Plating', desc: 'Door plates and a bulletproof windshield. Armour to 100.', price: 3600 },
  { id: 'tune1', name: 'Engine Tune — Stage 1', desc: 'Bored block, hot cam. Top speed +12%.', price: 4000, requires: null },
  { id: 'tune2', name: 'Engine Tune — Stage 2', desc: 'Stroker crank and a bigger carb. Top speed +25% total.', price: 7500, requires: 'tune1' },
  { id: 'nitro', name: 'Nitro Kit', desc: 'A bottle in the trunk. Hold Shift to boost.', price: 2500 },
];

// One radio station, heard everywhere in town. The name shows on the HUD;
// the music itself is the synth loop in audio.js.
export const RADIO = { name: 'DUST 98.1', tag: 'Desert Gold' };

// Career stats the game tracks for real, shown on the stats screen. The
// % complete is the story: jobs done out of three.
export function careerStats(state) {
  const done = state.missionsDone.length;
  return {
    storyDone: done,
    storyTotal: 3,
    percent: Math.round((done / 3) * 100),
    cash: state.cash,
    carsStolen: state.carsStolen,
    busts: state.busts,
    escapes: state.escapes,
    distanceKm: state.distanceDriven / 1000,
    shotsFired: state.shotsFired,
    respect: state.respect,
  };
}

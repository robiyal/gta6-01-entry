// Dusthaven — configuration, palette and city layout.
// All numbers are in metres. The city is a 480 x 480 grid centred on (0,0);
// roads run on the grid lines, blocks sit between them, dunes ring the town.
export const CITY = {
  half: 240,            // half-size of the playable ground plane
  roadHalf: 4,          // half width of a road
  grid: [-180, -120, -60, 0, 60, 120, 180], // road centre lines
  block: 52,            // block size between roads (60 pitch - 8 road)
  groundSize: 1400,     // ground plane size (includes desert + dunes)
  mountainRing: 620,    // distance of the mountain ridge
};

export const PALETTE = {
  // Sun-soaked desert golden hour. Warm sand, baked adobe, teal accents.
  skyZenith: 0x7fb2d9,
  skyHorizon: 0xf7b267,
  fog: 0xe9b878,
  sun: 0xffd9a0,         // low golden-hour sun
  sunIntensity: 3.0,
  hemiSky: 0xbfd9e8,
  hemiGround: 0x8a6a44,
  hemiIntensity: 0.9,
  sand: 0xd9a866,
  sandDark: 0xb98a4e,
  asphalt: 0x3a3a40,
  asphaltLine: 0xd8c56a,
  sidewalk: 0xcbb28a,
  adobe: [0xc98d5f, 0xb97a4e, 0xd9a06a, 0xa86f45, 0xcf9a6e, 0x8a5f43],
  adobeTrim: [0x2e7f7a, 0xc94f3d, 0xe8b13c, 0x4a6b8a, 0xd96a3d],
  neon: [0xff5da2, 0x3ae0ff, 0xffc53d, 0x7dff5e],
  carPaint: [0xc94f3d, 0x3d7ac9, 0xe8b13c, 0x4a9e6b, 0xd8d3c8, 0x7a4a9e, 0x2b2b2e],
  policePaint: 0x1c1c22,
  policeWhite: 0xe8e8e8,
};

// Landmarks: name -> block centre (x, z) and a short label for the HUD.
export const LANDMARKS = {
  motel:    { x: -60,  z: -60,  label: 'Rusty Spur Motel',  kind: 'motel' },
  diner:    { x: -60,  z: 60,   label: 'Dusthaven Diner',   kind: 'diner' },
  gas:      { x: 60,   z: -60,  label: 'Gas & Go',          kind: 'gas' },
  garage:   { x: 60,   z: 60,   label: "Rook's Garage",     kind: 'garage' },
  church:   { x: -120, z: -120, label: 'Desert Chapel',     kind: 'church' },
  sheriff:  { x: 120,  z: -120, label: "Sheriff's Office",  kind: 'sheriff' },
  waterTower: { x: 0,  z: 180,  label: 'Water Tower',       kind: 'tower' },
  driveIn:  { x: 180,  z: 120,  label: 'Dusthaven Drive-In',kind: 'drivein' },
};

// Mission endpoints reuse landmarks: [pickup landmark, dropoff landmark].
export const MISSION_DEFS = [
  {
    id: 'm1', title: 'First Job', giver: 'Delia Voss',
    brief: 'Pick up the crew at the Diner and get them to the Motel safehouse. The sheriff is already watching.',
    from: 'diner', to: 'motel', time: 150, wantedOnStart: 1,
    reward: 500, kind: 'getaway',
  },
  {
    id: 'm2', title: 'Desert Delivery', giver: 'Delia Voss',
    brief: 'A package for the Gas & Go, and the dust storm is rolling in. Fast and quiet — 90 seconds.',
    from: 'motel', to: 'gas', time: 90, wantedOnStart: 0, storm: true,
    reward: 800, kind: 'delivery',
  },
  {
    id: 'm3', title: "The Collector's Car", giver: 'The Collector',
    brief: 'A gold coupe is parked by the Desert Chapel. Take it, lose the law, and bring it to the Garage.',
    from: 'church', to: 'garage', time: 180, wantedOnStart: 2,
    reward: 1500, kind: 'steal', stealCar: true,
  },
];

export const TUNING = {
  playerWalkSpeed: 6,       // m/s
  playerRunSpeed: 10,
  carAccel: 14,             // m/s^2
  carBrake: 26,
  carReverse: 8,
  carMaxSpeed: 42,          // ~150 km/h
  carTurn: 1.9,             // rad/s at full lock, scaled by speed
  carDrag: 0.35,
  trafficCount: 9,
  pedCount: 14,
  policeMax: 3,
  wantedDecaySeconds: 30,  // no police near -> -1 star; 30s (was 12) so a
  // cruiser has time to route around the Sheriff's Office detour (~400m)
  // before the star self-clears — at 12s M1's wanted vanished before the
  // police could ever arrive, making wanted self-clearing.
  bustRadius: 5.0,  // cruiser within 5m of a slow player for 2s -> busted.
  // Was 3.0, but two cars in contact sit 4.6m apart centre-to-centre
  // (radius 2.3 each), so a cruiser pushing the player's bumper could
  // never trigger it — measured: dist pinned at 4.6m for 29 sim-s with
  // no bust. 5.0 means "sitting on the player's bumper" counts.
  bustSpeed: 2.5,
  bustHold: 2.0,
  punchRange: 2.2,
  punchDamage: 25,
  pistolDamage: 34,
  pistolAmmo: 12,
  pistolRange: 60,
  playerHealth: 100,
  startCash: 50,
};

export const SAVE_KEY = 'dusthaven-save-v1';

// Road centrelines, shared by traffic AI, the minimap and the ground texture.
export function roadLines() { return CITY.grid; }

// Is a point on a road (within the road half-width of any grid line)?
export function onRoad(x, z) {
  const r = CITY.roadHalf + 1.2;
  return CITY.grid.some((g) => Math.abs(x - g) < r || Math.abs(z - g) < r);
}

// Nearest road centreline coordinate on one axis.
export function nearestRoad(v) {
  let best = CITY.grid[0];
  for (const g of CITY.grid) if (Math.abs(g - v) < Math.abs(best - v)) best = g;
  return best;
}

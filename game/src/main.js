// Dusthaven — main game: boot, fixed-step loop, state machine, missions,
// wanted law, car stealing, HUD wiring and the ?shot= screenshot modes.
// You are Rook, a getaway driver in Dusthaven, a sun-soaked desert highway
// town. Three jobs, the sheriff on your tail, and a dust storm on the way.
import * as THREE from 'three';
import { CITY, LANDMARKS, MISSION_DEFS, TUNING, PALETTE } from './config.js';
import { districtAt, respectTitle, GARAGE_ITEMS, RADIO, careerStats } from './districts.js';
import { createHelicopter } from './heli.js';
import { createWorld } from './world.js';
import { createCity, collideCircle } from './city.js';
import { makeCar, makeCarState, updateCar, syncCarMesh } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createInput, shotMode } from './input.js';
import { createAudio } from './audio.js';
import { createCameraRig, createMinimap } from './render.js';
import { createUI } from './ui.js';
import { loadSave, writeSave } from './save.js';
import { createPlayer } from './player.js';

const canvas = document.getElementById('game');
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const world = createWorld();
const { scene, renderer } = world;
const { colliders } = createCity(scene);
const input = createInput();
const audio = createAudio();
const traffic = createTraffic(scene, colliders);
const police = createPolice(scene, colliders, audio);
const heli = createHelicopter(scene);
const missions = createMissions(scene, colliders);
const combat = createCombat(scene, audio);
const player = createPlayer(scene, colliders);
const rig = createCameraRig(camera);
const minimap = createMinimap(document.getElementById('minimap'));

const ui = createUI({
  onStart: (useSave) => startGame(useSave),
  onResume: () => setState('playing'),
  onRestart: () => restartRun(),
  onNextMission: () => setState('playing'),
  onRoam: () => setState('playing'),
  onGarageBuy: (id) => buyGarageItem(id),
  onGarageLeave: () => setState('playing'),
  onOpenStats: () => openStats(),
  onStatsResume: () => setState('playing'),
  onStatsBack: () => setState('paused'),
});

// ---- The player's own car + the gold coupe for mission 3.
// The hero car sits three-quarter to the east corridor (facing north-east),
// so the title dolly — which rides that corridor — sees its long side,
// not just its narrow nose: it reads as a car, ~2.5x wider on screen than
// the old east-facing park. (Round 3: the car was ~40px and read as a red
// blob near the controls line.) Driving is unaffected: the state heading
// matches the mesh, and the player steers wherever they like.
const ownCarMesh = makeCar(0xc94f3d, { name: 'rook-car' });
ownCarMesh.position.set(-52, 0, -52);
ownCarMesh.rotation.y = Math.PI / 4;
scene.add(ownCarMesh);
const ownCar = { mesh: ownCarMesh, state: makeCarState(-52, -52, Math.PI / 4), owned: true };

const goldMesh = makeCar(0xe8b13c, { name: 'gold-coupe' });
goldMesh.position.set(-104, 0, -112);
goldMesh.rotation.y = Math.PI;
scene.add(goldMesh);
// The coupe faces SOUTH (heading PI), straight at its exit road z=-120,
// 8 m ahead. It used to face WEST (-PI/2), straight at the chapel's east
// wall (x=-113) 9 m ahead: the first move was a U-turn in a 9 m pocket,
// and the grind rule (speed x0.55 per colliding step + no steering below
// 0.3 m/s) wedged it against that wall at exactly the car radius (2.3 m)
// — measured live 2026-11-20, same deadlock as the round-3 cruiser spawn.
// The south lane is clear: nearest collider is the same chapel wall,
// 9.0 m west of the exit path (6.7 m past the 2.3 m radius).
const goldCar = { mesh: goldMesh, state: makeCarState(-104, -112, Math.PI), gold: true };

// ---- Game state.
const save = loadSave();
const game = {
  mode: 'title', // title | playing | paused | over | complete
  cash: save ? save.cash : TUNING.startCash,
  missionsDone: save ? [...save.missionsDone] : [],
  health: TUNING.playerHealth,
  lastDamageAt: -10,
  time: 0,
  fps: 0,
  frames: 0,
  fpsTime: 0,
  jobMarker: null, // {x, z} when a job is waiting at the motel board
  missionNotice: '',
  speedKmh: 0,
  shotFreeze: false, // ?shot=action/foot/bridge only: hold the staging exactly
  // Round 4 career: tracked for real, shown on the stats screen and the HUD.
  armour: 0,        // 0-100, from the garage's Armour Plating
  respect: 0,       // points; titles in districts.js
  carsStolen: 0,
  busts: 0,
  escapes: 0,       // clean escapes: wanted fell to 0 from 3+ stars
  distanceDriven: 0, // metres, in a car
  shotsFired: 0,
  tuneLevel: 0,     // 0 stock, 1 stage 1 (+12%), 2 stage 2 (+25%)
  nitroOwned: false,
  nitroMeter: 100,  // 0-100, drains on boost, refills when not boosting
  ownedItems: [],   // garage item ids bought this run
  lastWanted: 0,    // for escape detection
};

const jobBeacon = (() => {
  // A smaller amber beacon over the motel job board.
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 12, 1, true), mat);
  col.position.y = 20;
  g.add(col);
  g.position.set(LANDMARKS.motel.x, 0, LANDMARKS.motel.z - 8);
  g.visible = false;
  scene.add(g);
  return g;
})();

function setState(mode) {
  game.mode = mode;
  if (mode === 'title') { ui.setScreen('title'); rig.mode = 'title'; }
  else if (mode === 'paused') ui.setScreen('pause');
  else if (mode === 'garage') ui.setScreen('garage');
  else if (mode === 'stats') ui.setScreen('stats');
  else if (mode === 'over') { /* screen set by showOver */ }
  else if (mode === 'complete') { /* screen set by showComplete */ }
  else ui.setScreen('game');
}

function currentObjective() {
  const m = missions.state.active;
  if (m) {
    const t = missions.targetPos();
    const d = t ? Math.round(Math.hypot(player.state.pos.x - t.x, player.state.pos.z - t.z)) : 0;
    if (missions.state.phase === 'pickup') {
      return m.stealCar
        ? { title: `${m.title} — steal the gold coupe`, text: `${m.brief} (${d}m to the Chapel)` }
        : { title: `${m.title} — pickup`, text: `${m.brief} (${d}m)` };
    }
    return { title: `${m.title} — deliver`, text: `Get to ${t.label} (${d}m). Lose the law if you have to.` };
  }
  const next = missions.nextAvailable();
  if (next) {
    return { title: 'Find work', text: `Head to the Rusty Spur Motel job board — next job: ${next.title}.` };
  }
  return { title: 'Free roam', text: 'Dusthaven is yours. Drive, explore, and stay out of trouble.' };
}

function startGame(useSave) {
  audio.unlock();
  audio.engineStart();
  audio.musicStart();
  if (useSave && save) {
    game.cash = save.cash;
    game.missionsDone = [...save.missionsDone];
    missions.state.index = MISSION_DEFS.findIndex((d) => !game.missionsDone.includes(d.id));
    if (missions.state.index < 0) missions.state.index = MISSION_DEFS.length;
    if (save.pos) player.state.pos.set(save.pos.x, 0, save.pos.z);
  } else {
    game.cash = TUNING.startCash;
    game.missionsDone = [];
    missions.state.index = 0;
    missions.state.done = [];
    player.state.pos.set(-55, 0, -50);
  }
  game.health = TUNING.playerHealth;
  // Career stats are per-run; the save slot only carries cash, jobs and
  // position, so a fresh run (new or continued) starts them at zero.
  game.armour = 0; game.respect = 0; game.carsStolen = 0; game.busts = 0;
  game.escapes = 0; game.distanceDriven = 0; game.shotsFired = 0;
  game.tuneLevel = 0; game.nitroOwned = false; game.nitroMeter = 100;
  game.ownedItems = []; game.lastWanted = 0;
  police.clearAll();
  missions.reset();
  setState('playing');
  rig.mode = player.state.inCar ? 'chase' : 'foot';
  rig.yaw = player.state.heading;
  updateJobMarker();
  ui.toast(useSave ? 'Welcome back, Rook.' : 'Welcome to Dusthaven, Rook. Find work at the Motel.');
}

function restartRun() {
  // Respawn at the motel, fresh health, no heat. Cash and jobs kept.
  player.state.health = TUNING.playerHealth;
  game.health = TUNING.playerHealth;
  police.clearAll();
  missions.reset();
  if (player.state.inCar) player.exitCar();
  player.state.pos.set(-55, 0, -50);
  player.state.heading = Math.PI * 0.75;
  ownCar.state.pos.set(-52, 0, -52);
  ownCar.state.speed = 0;
  syncCarMesh(ownCar.mesh, ownCar.state);
  setState('playing');
  rig.mode = 'foot';
  rig.yaw = player.state.heading;
  updateJobMarker();
  ui.toast('Back on your feet. The town is still yours.');
}

function updateJobMarker() {
  const hasJob = missions.nextAvailable() && !missions.state.active;
  game.jobMarker = hasJob ? { x: LANDMARKS.motel.x, z: LANDMARKS.motel.z - 8 } : null;
  jobBeacon.visible = !!hasJob;
}

function tryStartJob() {
  if (missions.state.active || !game.jobMarker) return;
  const d = Math.hypot(player.state.pos.x - game.jobMarker.x, player.state.pos.z - game.jobMarker.z);
  if (d > 8) return;
  const def = missions.startMission(missions.state.index);
  if (!def) return;
  if (def.wantedOnStart) police.setWanted(def.wantedOnStart);
  if (def.storm) ui.toast('A dust storm is rolling in from the dunes…');
  ui.toast(`Job accepted: ${def.title} — ${def.giver}`);
  audio.pickup();
  updateJobMarker();
}

function nearestDrivable() {
  const p = player.state.pos;
  const cands = [ownCar, goldCar];
  for (const c of traffic.cars) cands.push({ mesh: c.mesh, state: c.state, traffic: c });
  let best = null, bestD = 4.5;
  for (const c of cands) {
    const d = Math.hypot(c.state.pos.x - p.x, c.state.pos.z - p.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function tryEnterCar() {
  const c = nearestDrivable();
  if (!c) return;
  if (c.traffic) {
    // Stealing a stranger's car is a crime.
    const idx = traffic.cars.indexOf(c.traffic);
    if (idx >= 0) traffic.cars.splice(idx, 1);
    police.addWanted(1, 'grand theft auto');
    game.carsStolen += 1;
    game.respect += 25;
    ui.toast('You stole a car! The sheriff noticed.');
    audio.crash();
  } else if (c.gold) {
    const m = missions.state.active;
    if (m && m.stealCar && missions.state.phase === 'pickup') {
      missions.state.phase = 'deliver';
      game.carsStolen += 1;
      ui.toast("The Collector's coupe is yours. Get it to the Garage — quietly.");
      audio.pickup();
    } else {
      police.addWanted(1, 'grand theft auto');
      ui.toast('A gold coupe… the sheriff will want words about this.');
    }
  }
  player.enterCar(c.state, c.mesh);
  rig.mode = 'chase';
}

function handleMissionEvent(ev) {
  if (!ev) return;
  if (ev.type === 'picked-up') {
    if (ev.mission.wantedOnStart) police.setWanted(Math.max(police.getWanted(), ev.mission.wantedOnStart));
    ui.toast(ev.mission.kind === 'getaway' ? "Crew's in — get to the Motel safehouse!" : 'Package secured. Go!');
    audio.pickup();
  } else if (ev.type === 'complete') {
    game.cash += ev.mission.reward;
    game.respect += 100;
    game.missionsDone.push(ev.mission.id);
    writeSave({ cash: game.cash, missionsDone: game.missionsDone, pos: player.state.pos });
    audio.complete();
    ui.showComplete(ev.mission, ev.mission.reward, game.cash);
    setState('complete');
    updateJobMarker();
  } else if (ev.type === 'failed') {
    audio.fail();
    ui.toast(`Job failed: ${ev.reason} The job is back on the board.`);
    updateJobMarker();
  }
}

function damagePlayer(amount, cause) {
  // Armour plating absorbs 60% of a hit before health takes the rest.
  if (game.armour > 0) {
    const absorbed = Math.min(game.armour, amount * 0.6);
    game.armour -= absorbed;
    amount -= absorbed;
  }
  game.health -= amount;
  game.lastDamageAt = game.time;
  rig.addShake(0.35);
  if (game.health <= 0) {
    game.health = 0;
    audio.busted();
    police.clearAll();
    ui.showOver('wasted', cause || 'Dusthaven got the better of you. The town moves on without you.');
    setState('over');
  }
}

function updatePlaying(dt) {
  const p = player.state;
  let inCar = p.inCar;

  // --- Input: drive or walk.
  if (inCar) {
    const { fwd, steer } = input.axis();
    const brake = input.down('Space');
    const before = p.car.speed;
    // Nitro (round 4): hold Shift with the kit fitted and the bottle
    // charged — top speed +35% while the meter drains, then it refills.
    let topSpeed = TUNING.carMaxSpeed * (1 + 0.12 * game.tuneLevel);
    const boosting = game.nitroOwned && (input.down('ShiftLeft') || input.down('ShiftRight')) && game.nitroMeter > 0 && fwd > 0;
    if (boosting) {
      topSpeed *= 1.35;
      game.nitroMeter = Math.max(0, game.nitroMeter - 30 * dt);
    } else {
      game.nitroMeter = Math.min(100, game.nitroMeter + 8 * dt);
    }
    updateCar(p.car, { throttle: fwd, steer, brake }, dt, colliders, topSpeed);
    syncCarMesh(p.carMesh, p.car);
    // The player IS the car while driving: missions, police, traffic and
    // the minimap all read p.pos, so it must track the car — without this
    // the sheriff chases the spot you got in and a job can never complete
    // by driving.
    p.pos.copy(p.car.pos);
    game.speedKmh = Math.abs(p.car.speed) * 3.6;
    game.distanceDriven += Math.abs(p.car.speed) * dt;
    // Crash feedback on a hard stop.
    if (before > 10 && p.car.speed === 0) {
      audio.crash(); rig.addShake(0.4);
      p.car.condition = Math.max(20, p.car.condition - 4);
    }
    if (Math.abs(steer) > 0.6 && Math.abs(p.car.speed) > 12 && Math.random() < dt * 6) audio.skid();
    audio.engineUpdate(Math.abs(p.car.speed) / TUNING.carMaxSpeed, true);
  } else {
    player.update(dt, input, rig.yaw);
    game.speedKmh = 0;
    audio.engineUpdate(0, false);
    const drag = input.consumeDrag();
    rig.yaw -= drag.x * 0.005;
    rig.pitch = Math.max(0.05, Math.min(0.9, rig.pitch + drag.y * 0.003));
    // Punch (edge-triggered: one swing per press).
    if (input.consumePressed('KeyF')) {
      const hit = combat.punch(p, traffic.peds, police.deputies, police);
      if (hit) rig.addShake(0.15);
    }
    // Shoot on click.
    if (input.consumeClick()) {
      const targets = [];
      for (const d of police.deputies) targets.push({ pos: d.pos, radius: 0.9, health: d.health, kind: 'deputy', ref: d });
      for (const ped of traffic.peds) {
        if (ped.down > 0) continue;
        targets.push({ pos: ped.pos, radius: 0.8, health: 100, kind: 'ped', ref: ped });
      }
      const res = combat.shoot(camera, p, targets, police);
      if (res && res.type === 'hit') rig.addShake(0.12);
      if (res && (res.type === 'hit' || res.type === 'miss')) game.shotsFired += 1;
    }
    if (input.consumePressed('KeyR')) combat.reload();
  }
  combat.update(dt);

  // --- Enter / exit car (edge-triggered).
  if (input.consumePressed('KeyE')) {
    if (inCar) {
      player.exitCar();
      rig.mode = 'foot';
      rig.yaw = p.heading;
    } else {
      tryEnterCar();
    }
  }
  // Re-read: E may have entered/exited the car this frame, and the
  // stale `inCar` would read p.car after exitCar() nulled it
  // (TypeError at the playerSpeed line below — fired on every exit).
  inCar = p.inCar;

  // --- Garage: G opens Rook's Garage when close enough (round 4).
  const nearGarage = Math.hypot(p.pos.x - LANDMARKS.garage.x, p.pos.z - LANDMARKS.garage.z) < 25;
  if (input.consumePressed('KeyG') && nearGarage) openGarage();

  // --- Traffic + pedestrians.
  const playerSpeed = inCar ? p.car.speed : p.speed;
  traffic.updateTraffic(dt, p.pos, playerSpeed, game.time);
  traffic.carCarCollisions(inCar ? p.car : null);

  // --- Player car vs pedestrians: hitting one is a crime.
  if (inCar) {
    for (const ped of traffic.peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.pos.x - p.car.pos.x, ped.pos.z - p.car.pos.z);
      if (d < 2.6 && Math.abs(p.car.speed) > 6) {
        ped.down = 4;
        police.addWanted(2, 'hit and run');
        audio.crash();
        rig.addShake(0.5);
        p.car.speed *= 0.6;
        ui.toast('You hit a pedestrian! The whole town saw it.');
      }
    }
  }

  // --- Police + wanted.
  const policeResult = police.update(dt, {
    pos: p.pos,
    speed: playerSpeed,
    inCar,
    carState: inCar ? p.car : null,
    heading: inCar ? p.car.heading : p.heading,
  }, game.time);
  // Helicopter: orbits above the player once the heat is 3+ stars.
  heli.update(dt, p.pos, police.getWanted(), game.time);
  // Clean escape: the heat fell to 0 from 3+ stars — the town talks.
  const wantedNow = police.getWanted();
  if (game.lastWanted >= 3 && wantedNow === 0) {
    game.escapes += 1;
    game.respect += 50;
    ui.toast('Clean escape. The town is talking about you.');
  }
  game.lastWanted = wantedNow;
  if (policeResult === 'busted') {
    game.busts += 1;
    audio.busted();
    ui.showOver('busted', 'The sheriff finally caught up. Dusthaven remembers everything.');
    setState('over');
    return;
  }
  if (policeResult && policeResult.hit) damagePlayer(policeResult.hit, 'A deputy worked you over.');

  // --- Missions.
  handleMissionEvent(missions.update(dt, p.pos));
  tryStartJob();
  if (missions.state.active && missions.state.active.storm) {
    world.storm += (0.7 - world.storm) * Math.min(1, dt * 0.5);
  } else {
    world.storm += (0 - world.storm) * Math.min(1, dt * 0.5);
  }

  // --- Health regen out of trouble.
  if (police.getWanted() === 0 && game.time - game.lastDamageAt > 5 && game.health < TUNING.playerHealth) {
    game.health = Math.min(TUNING.playerHealth, game.health + 3 * dt);
  }

  // --- Camera.
  const focus = inCar
    ? { x: p.car.pos.x, z: p.car.pos.z, heading: p.car.heading }
    : { x: p.pos.x, z: p.pos.z, heading: p.heading };
  rig.update(dt, focus, inCar ? Math.abs(p.car.speed) / TUNING.carMaxSpeed : 0, game.time);
  world.update(dt, inCar ? p.car.pos : p.pos, game.time);

  // --- HUD + minimap (throttled).
  if (game.time - (updatePlaying._hudAt || 0) > 0.1) {
    updatePlaying._hudAt = game.time;
    const obj = currentObjective();
    const m = missions.state.active;
    const respect = respectTitle(game.respect);
    const dispatch = police.getDispatch(p.pos);
    if (heli.state.active) {
      dispatch.push({ callsign: 'AIR-1', role: 'SPOTLIGHT', dist: Math.round(heli.state.dist) });
    }
    ui.updateHUD({
      health: game.health,
      armour: game.armour,
      cash: game.cash,
      wanted: police.getWanted(),
      respectTitle: respect.title,
      respectPoints: game.respect,
      respectNextAt: respect.nextAt,
      district: districtAt(p.pos.x, p.pos.z).name,
      radio: `${RADIO.name} — ${RADIO.tag}`,
      ammo: combat.ammo,
      condition: inCar ? p.car.condition : null,
      nitroOwned: game.nitroOwned,
      nitroPct: game.nitroMeter,
      dispatch,
      speedKmh: game.speedKmh,
      inCar,
      objectiveTitle: obj.title,
      objectiveText: obj.text,
      timeLeft: m ? missions.state.timeLeft : null,
      showCrosshair: !inCar,
      hint: (nearGarage ? "G — Rook's Garage · " : '') + (inCar
        ? 'W/S drive · A/D steer · Space brake · E exit · P pause'
        : 'WASD move · Shift run · E enter car · F punch · Click shoot · R reload'),
    });
    minimap.draw({
      player: { x: p.pos.x, z: p.pos.z, heading: inCar ? p.car.heading : p.heading },
      cars: traffic.cars.map((c) => ({ x: c.state.pos.x, z: c.state.pos.z })),
      police: police.cruisers.map((c) => ({ x: c.state.pos.x, z: c.state.pos.z })),
      target: missions.targetPos() || game.jobMarker,
    });
  }

}

// ---- Title screen: orbit the hero car at the motel.
function updateTitle(dt) {
  rig.mode = 'title';
  rig.update(dt, { x: -52, z: -52, heading: Math.PI / 2 }, 0, game.time);
  world.update(dt, new THREE.Vector3(-52, 0, -52), game.time);
  traffic.updateTraffic(dt, null, 0, game.time);
}

// ---- Rook's Garage (round 4): the shop menu, reachable in-game with G
// near the garage at (60, 60). Prices are the town's — Repair $250,
// Respray $400, Armour $3,600, Engine Tune $4,000 / $7,500, Nitro $2,500 —
// the same ladder the top-ranked games show on their garage screens.
function renderGarage() {
  ui.showGarage({
    cash: game.cash,
    condition: ownCar.state.condition,
    armour: game.armour,
    owned: game.ownedItems,
    tuneLevel: game.tuneLevel,
    items: GARAGE_ITEMS,
  });
}

function openGarage() {
  if (game.mode !== 'playing') return;
  renderGarage();
  setState('garage');
}

function buyGarageItem(id) {
  const item = GARAGE_ITEMS.find((i) => i.id === id);
  if (!item || game.cash < item.price || game.ownedItems.includes(id)) return;
  if (item.id === 'tune2' && game.tuneLevel < 1) return;
  game.cash -= item.price;
  game.ownedItems.push(id);
  if (id === 'repair') {
    ownCar.state.condition = 100;
    goldCar.state.condition = 100;
    ui.toast('Full repair — both cars are showroom fresh.');
  } else if (id === 'respray') {
    const paints = PALETTE.carPaint;
    const cur = ownCar.mesh.userData.paint.color.getHex();
    const next = paints[(paints.indexOf(cur) + 1) % paints.length];
    ownCar.mesh.userData.paint.color.setHex(next);
    ownCar.state.condition = Math.min(100, ownCar.state.condition + 5);
    ui.toast('Fresh coat of paint. The town will notice.');
  } else if (id === 'armour') {
    game.armour = 100;
    ui.toast('Armour plating fitted — 100 armour.');
  } else if (id === 'tune1') {
    game.tuneLevel = 1;
    ui.toast('Stage 1 tune — top speed +12%.');
  } else if (id === 'tune2') {
    game.tuneLevel = 2;
    ui.toast('Stage 2 tune — top speed +25%.');
  } else if (id === 'nitro') {
    game.nitroOwned = true;
    game.nitroMeter = 100;
    ui.toast('Nitro kit fitted — hold Shift to boost.');
  }
  audio.pickup();
  renderGarage();
}

// ---- Career stats screen (round 4): % complete, career stats, save slot.
function openStats() {
  ui.showStats({
    ...careerStats(game),
    respectTitle: respectTitle(game.respect).title,
    save,
  });
  setState('stats');
}

// ---- Deterministic ?shot= setups for screenshots.
function applyShotMode(shot) {
  audio.unlock();
  if (shot === 'start') {
    ui.setTitle(null);
    setState('title');
    // Round 3: stage the hero car 24m out in the open east corridor
    // (-40,-52) instead of its boot spot (-52,-52) tucked in the
    // motel's NE corner — from the new 10m title dolly the boot spot
    // reads ~90px at the frame's left edge, while the staged spot
    // reads ~125px lower-left, clear of the buttons/controls. The
    // corridor is verified clear of generic buildings there. Shot-only
    // staging: the live game still spawns the car at (-52,-52).
    ownCar.state.pos.set(-40, 0, -52);
    ownCar.state.heading = Math.PI / 4;
    ownCar.state.speed = 0;
    syncCarMesh(ownCar.mesh, ownCar.state);
    return;
  }
  // Play, action, foot, bridge and end all skip the title.
  game.cash = 1250;
  game.missionsDone = ['m1'];
  missions.state.index = 1;
  missions.state.done = ['m1'];
  player.state.pos.set(0, 0, -40);
  player.state.heading = 0;
  // Shared staging helper: park a traffic car at an exact spot.
  const stageCar = (i, x, z, heading) => {
    const car = traffic.cars[i % traffic.cars.length];
    car.state.pos.set(x, 0, z);
    car.state.heading = heading;
    car.state.speed = 0;
    syncCarMesh(car.mesh, car.state);
  };
  let hud = null;
  if (shot === 'play') {
    player.enterCar(ownCar.state, ownCar.mesh);
    ownCar.state.pos.set(0, 0, -40);
    ownCar.state.heading = 0;
    ownCar.state.speed = 14;
    rig.mode = 'chase';
    setState('playing');
    hud = {
      health: 100, cash: game.cash, wanted: 0, speedKmh: 50, inCar: true,
      objectiveTitle: 'Find work',
      objectiveText: 'Head to the Rusty Spur Motel job board.',
      timeLeft: null, showCrosshair: false, hint: '',
    };
  } else if (shot === 'action') {
    // Round 4 cover shot: a dense 5-star chase EASTBOUND on Motel Row —
    // the road the shop row faces, so the storefronts read behind the
    // action. The sim does NOT run for this shot (see the loop's
    // shotFreeze branch), so the frame is exactly as staged: the lead
    // cruiser large ahead, a second unit behind-left, a roadblock across
    // the road ahead, the helicopter overhead with its spotlight on the
    // player car, traffic and fleeing pedestrians along the shop row,
    // and a light dust haze (0.25 — the old 0.8 storm white-out hid the
    // city it was meant to show). Round 1 staged the cruisers with
    // police.cruisers.forEach before any cruiser existed, so the call was
    // a no-op and the units spawned at the Sheriff's Office, far away;
    // this version spawns them first with a zero-dt update (spawn logic
    // runs, nothing moves), then places them.
    player.state.pos.set(-20, 0, -60);
    player.state.heading = Math.PI / 2;
    player.enterCar(ownCar.state, ownCar.mesh);
    ownCar.state.pos.set(-20, 0, -60);
    ownCar.state.heading = Math.PI / 2;
    ownCar.state.speed = 0;
    ownCar.state.condition = 84;
    syncCarMesh(ownCar.mesh, ownCar.state);
    player.state.pos.copy(ownCar.state.pos);
    missions.startMission(0);
    missions.state.phase = 'deliver';
    missions.state.timeLeft = 95;
    missions.beacon.position.set(-60, 0, -60);
    police.setWanted(5);
    police.update(0, { pos: player.state.pos, speed: 0, inCar: true, carState: null, heading: Math.PI / 2 }, 0);
    police.cruisers.forEach((c, i) => {
      if (i === 0) { c.state.pos.set(-8, 0, -57.5); c.state.heading = Math.PI / 2; }
      else if (i === 1) { c.state.pos.set(-32, 0, -62.5); c.state.heading = Math.PI / 2; }
      else { c.state.pos.set(28, 0, -60); c.state.heading = 0; c.mode = 'roadblock'; }
      c.state.speed = 0;
      syncCarMesh(c.mesh, c.state);
      // Frozen mid-flash light bar: red hot, blue dim.
      if (c.mesh.userData.lightRed) {
        c.mesh.userData.lightRed.material.emissiveIntensity = 3;
        c.mesh.userData.lightBlue.material.emissiveIntensity = 0.2;
      }
    });
    // Roadblock barriers across the road ahead, held by the third cruiser.
    police.placeRoadblock(28, -60, Math.PI / 2);
    // Helicopter low over the road ahead (round 4 fix: the first staging put
    // it at 38m, ~49° above the camera's view axis — out of frame. At 8m
    // over the road centreline, 35m ahead, it reads top-centre of the frame
    // with its beam running back down the road to the player car).
    heli.place(15, 8, -60, -20, -60);
    // Traffic on the road around the chase.
    stageCar(0, -14, -58, Math.PI / 2);
    stageCar(1, -48, -62, -Math.PI / 2);
    stageCar(2, 44, -58, Math.PI / 2);
    stageCar(3, -2, -20, 0);
    // Pedestrians on the sidewalks, fleeing the chase.
    traffic.peds.forEach((ped, i) => {
      const x = -52 + (i % 8) * 8;
      const z = i % 2 === 0 ? -66.5 : -53.5;
      ped.pos.set(x, 0, z);
      ped.heading = i % 2 === 0 ? Math.PI : 0;
      ped.flee = 2.5;
      ped.mesh.position.set(x, 0, z);
      ped.mesh.rotation.y = ped.heading;
    });
    world.storm = 0.25;
    game.shotFreeze = true;
    rig.mode = 'action';
    setState('playing');
    hud = {
      health: 76, armour: 0, cash: game.cash, wanted: 5,
      respectTitle: 'Wheelman', respectPoints: 120, respectNextAt: 250,
      district: 'Main Street', radio: 'DUST 98.1 — Desert Gold',
      ammo: 12, condition: 84,
      nitroOwned: false, nitroPct: 100,
      dispatch: [
        { callsign: 'DUST-1', role: 'RAMMING', dist: 12 },
        { callsign: 'DUST-2', role: 'PURSUIT', dist: 12 },
        { callsign: 'DUST-3', role: 'ROADBLOCK', dist: 48 },
        { callsign: 'AIR-1', role: 'SPOTLIGHT', dist: 35 },
      ],
      speedKmh: 94, inCar: true,
      objectiveTitle: 'First Job — deliver',
      objectiveText: 'Get to the Rusty Spur Motel (40m). Lose the law if you have to.',
      timeLeft: 95, showCrosshair: false, hint: '',
    };
  } else if (shot === 'foot') {
    // Round 4 on-foot beat: Rook on the Main Street sidewalk in front of
    // the shop row, pedestrians around him, a deputy on the sidewalk facing
    // him, the crosshair up and the pistol in the weapon slots. Frozen,
    // so the crowd holds its formation for the capture. The player mesh is
    // synced by hand here — the frozen branch never runs player.update(),
    // so without this Rook stays at his boot spot and the frame shows an
    // empty street (first version of this shot proved it).
    player.state.pos.set(-30, 0, -64.5);
    player.state.heading = Math.PI; // faces the shops (north, -z)
    player.mesh.position.set(-30, 0, -64.5);
    player.mesh.rotation.y = Math.PI;
    player.mesh.visible = true;
    rig.mode = 'foot';
    rig.yaw = Math.PI;
    rig.pitch = 0.18; // flatter than the live 0.32: less shadowed near-ground
    setState('playing');
    police.setWanted(2);
    police.update(0, { pos: player.state.pos, speed: 0, inCar: false, carState: null, heading: Math.PI }, 0);
    if (police.deputies[0]) {
      const dep = police.deputies[0];
      dep.pos.set(-28, 0, -67);
      dep.heading = Math.atan2(-30 - -28, -64.5 - -67);
      dep.mesh.position.set(-28, 0, -67);
      dep.mesh.rotation.y = dep.heading;
    }
    // Crowd along the north sidewalk, strolling past the shop fronts.
    traffic.peds.forEach((ped, i) => {
      const x = -48 + (i % 8) * 4.9;
      const z = -66 + (i % 3) * 0.8;
      ped.pos.set(x, 0, z);
      ped.heading = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      ped.mesh.position.set(x, 0, z);
      ped.mesh.rotation.y = ped.heading;
    });
    stageCar(0, -14, -58, Math.PI / 2);
    stageCar(1, -48, -62, -Math.PI / 2);
    world.storm = 0;
    game.shotFreeze = true;
    hud = {
      health: 100, armour: 0, cash: game.cash, wanted: 2,
      respectTitle: 'Nobody', respectPoints: 25, respectNextAt: 100,
      district: 'Main Street', radio: 'DUST 98.1 — Desert Gold',
      ammo: 12, condition: null,
      nitroOwned: false, nitroPct: 100,
      dispatch: [{ callsign: 'DUST-1', role: 'SEARCHING', dist: 3 }],
      speedKmh: 0, inCar: false,
      objectiveTitle: 'Main Street — on foot',
      objectiveText: 'The sheriff is watching. Keep walking or run.',
      timeLeft: null, showCrosshair: true, hint: '',
    };
  } else if (shot === 'bridge') {
    // Round 4 bridge crossing: a chase over the wash. Rook's car is on
    // the deck, a cruiser ahead of him on the bridge, the helicopter low
    // over the road ahead, a car coming the other way — trusses, wash and
    // mesas in frame. The player sits at z=92, NOT at the deck's south
    // end: the south WASH BRIDGE sign stands at z=76.5, and with the car
    // at 82 the camera (9m behind) sat 3.5m from the sign and the sign
    // filled the whole frame. At 92 the camera is past the sign and the
    // north sign (z=103.5) reads as a small road sign ahead instead.
    player.state.pos.set(0, 0, 92);
    player.state.heading = 0; // north, +z, toward and over the bridge
    player.enterCar(ownCar.state, ownCar.mesh);
    ownCar.state.pos.set(0, 0, 92);
    ownCar.state.heading = 0;
    ownCar.state.speed = 0;
    ownCar.state.condition = 91;
    syncCarMesh(ownCar.mesh, ownCar.state);
    player.state.pos.copy(ownCar.state.pos);
    missions.startMission(1); // Desert Delivery
    missions.state.phase = 'deliver';
    missions.state.timeLeft = 70;
    missions.beacon.position.set(60, 0, -60);
    police.setWanted(4);
    police.update(0, { pos: player.state.pos, speed: 0, inCar: true, carState: null, heading: 0 }, 0);
    // The zero-dt update auto-placed a roadblock 70m ahead; the bridge
    // shot wants the open road, so clear it and send the units to chase.
    police.clearRoadblock();
    for (const c of police.cruisers) c.mode = 'chase';
    police.cruisers.forEach((c, i) => {
      if (i === 0) { c.state.pos.set(-3, 0, 100); c.state.heading = 0; }
      else if (i === 1) { c.state.pos.set(-4, 0, 70); c.state.heading = 0; }
      c.state.speed = 0;
      syncCarMesh(c.mesh, c.state);
      if (c.mesh.userData.lightRed) {
        c.mesh.userData.lightRed.material.emissiveIntensity = 3;
        c.mesh.userData.lightBlue.material.emissiveIntensity = 0.2;
      }
    });
    // Helicopter low over the road ahead (same fix as the action shot:
    // 38m up is out of the frame; 9m over the centreline reads).
    heli.place(0, 9, 116, 0, 92);
    stageCar(0, 5, 108, Math.PI); // oncoming car past the bridge, heading south
    stageCar(1, -3, 120, 0);
    // Pedestrians on the bridge walkways.
    traffic.peds.forEach((ped, i) => {
      if (i < 4) {
        const x = i % 2 === 0 ? -5.8 : 5.8;
        const z = 88 + i * 3.3;
        ped.pos.set(x, 0, z);
        ped.heading = i % 2 === 0 ? 0 : Math.PI;
        ped.mesh.position.set(x, 0, z);
        ped.mesh.rotation.y = ped.heading;
      }
    });
    world.storm = 0;
    game.shotFreeze = true;
    rig.mode = 'action';
    setState('playing');
    hud = {
      health: 88, armour: 0, cash: game.cash, wanted: 4,
      respectTitle: 'Wheelman', respectPoints: 160, respectNextAt: 250,
      district: 'North Flats', radio: 'DUST 98.1 — Desert Gold',
      ammo: 8, condition: 91,
      nitroOwned: false, nitroPct: 100,
      dispatch: [
        { callsign: 'DUST-1', role: 'PURSUIT', dist: 9 },
        { callsign: 'DUST-2', role: 'PURSUIT', dist: 22 },
        { callsign: 'AIR-1', role: 'SPOTLIGHT', dist: 24 },
      ],
      speedKmh: 78, inCar: true,
      objectiveTitle: 'Desert Delivery — deliver',
      objectiveText: 'Get to the Gas Station (154m). Lose the law if you have to.',
      timeLeft: 70, showCrosshair: false, hint: '',
    };
  } else if (shot === 'stats') {
    // Round 4 career screen: a full career staged over the title dolly —
    // all three jobs done, a real cash total, the stats the game tracks.
    game.cash = 2850;
    game.missionsDone = ['m1', 'm2', 'm3'];
    game.carsStolen = 23;
    game.busts = 1;
    game.escapes = 12;
    game.distanceDriven = 48200;
    game.shotsFired = 47;
    game.respect = 340;
    ui.showStats({
      ...careerStats(game),
      respectTitle: respectTitle(game.respect).title,
      save: { cash: 2850, missionsDone: ['m1', 'm2', 'm3'], savedAt: Date.now() },
    });
    setState('stats');
    rig.mode = 'title';
    return;
  } else if (shot === 'end') {
    const m = MISSION_DEFS[0];
    ui.showComplete(m, m.reward, game.cash + m.reward);
    setState('complete');
    rig.mode = 'title';
    // Same staged hero car as 'start' (see above) — the end screen
    // rides the same title dolly, so the car reads in both frames.
    ownCar.state.pos.set(-40, 0, -52);
    ownCar.state.heading = Math.PI / 4;
    ownCar.state.speed = 0;
    syncCarMesh(ownCar.mesh, ownCar.state);
    hud = {
      health: 100, cash: game.cash + m.reward, wanted: 0, speedKmh: 0, inCar: false,
      objectiveTitle: 'First Job — COMPLETE',
      objectiveText: 'Delia paid you $500.',
      timeLeft: null, showCrosshair: false, hint: '',
    };
  }
  if (hud) ui.updateHUD(hud);
}

// ---- Boot.
ui.setTitle(save);
setState('title');
ui.toast('Dusthaven — a getaway driver’s town. Click Start to play.', 5000);

// Pause / mute are global key events, registered once (event-driven, so
// they work even on a slow frame): Escape/P toggles pause, M toggles sound.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.mode === 'playing') setState('paused');
    else if (game.mode === 'paused') setState('playing');
  } else if (e.code === 'KeyM') {
    ui.toast(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
  }
});

const shot = shotMode();
if (shot) applyShotMode(shot);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') {
    writeSave({ cash: game.cash, missionsDone: game.missionsDone, pos: player.state.pos });
  }
});

// Fixed-step simulation (1/60s) with a render every animation frame.
// FPS is measured on wall-clock time, not clamped sim time.
const timer = new THREE.Timer();
timer.connect(document);
let acc = 0;
let fpsFrames = 0;
let fpsWall = performance.now();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
  game.time += dt;
  fpsFrames += 1;
  const now = performance.now();
  if (now - fpsWall >= 1000) {
    game.fps = Math.round((fpsFrames * 1000) / (now - fpsWall));
    fpsFrames = 0;
    fpsWall = now;
  }
  if (game.mode === 'playing' && game.shotFreeze) {
    // Frozen staged shot (action / foot / bridge — see applyShotMode):
    // hold the formation exactly as staged — no simulation, no police AI,
    // no mission timer — while the dust, the camera and the minimap stay
    // live, so the captured frame is exact. The rig mode is the one the
    // shot staged ('action' for chases, 'foot' for the street scene);
    // the focus is the car when driving, Rook when on foot.
    const inCar = player.state.inCar;
    const focus = inCar
      ? { x: player.state.car.pos.x, z: player.state.car.pos.z, heading: player.state.car.heading }
      : { x: player.state.pos.x, z: player.state.pos.z, heading: player.state.heading };
    rig.update(dt, focus, 0, game.time);
    world.update(dt, inCar ? player.state.car.pos : player.state.pos, game.time);
    minimap.draw({
      player: { x: player.state.pos.x, z: player.state.pos.z, heading: focus.heading },
      cars: traffic.cars.map((c) => ({ x: c.state.pos.x, z: c.state.pos.z })),
      police: police.cruisers.map((c) => ({ x: c.state.pos.x, z: c.state.pos.z })),
      target: missions.targetPos() || game.jobMarker,
    });
  } else if (game.mode === 'playing') {
    acc += dt;
    const step = 1 / 60;
    let n = 0;
    while (acc >= step && n < 5) {
      updatePlaying(step);
      acc -= step;
      n += 1;
      if (game.mode !== 'playing') { acc = 0; break; }
    }
  } else if (game.mode === 'title') {
    updateTitle(dt);
  } else {
    // Paused / over / complete: keep the street alive behind the overlay
    // with the slow title dolly, so the backdrop is never a frozen void.
    rig.mode = 'title';
    rig.update(dt * 0.5, { x: -52, z: -52, heading: 0 }, 0, game.time);
    world.update(dt * 0.2, player.state.inCar ? player.state.car.pos : player.state.pos, game.time);
  }
  renderer.render(scene, camera);
});

Object.assign(window, {
  __game: {
    get mode() { return game.mode; },
    get fps() { return game.fps; },
    get cash() { return game.cash; },
    get wanted() { return police.getWanted(); },
    get health() { return game.health; },
    get pos() { return { x: player.state.pos.x, z: player.state.pos.z }; },
    get inCar() { return player.state.inCar; },
    get mission() { return missions.state.active ? missions.state.active.id : null; },
    get drawCalls() { return renderer.info.render.calls; },
    get triangles() { return renderer.info.render.triangles; },
    get heliActive() { return heli.state.active; },
    get heliPos() { return { x: heli.mesh.position.x, y: heli.mesh.position.y, z: heli.mesh.position.z }; },
    get roadblock() { return police.roadblock.active; },
    get dispatch() { return police.getDispatch(player.state.pos).length; },
    get district() { return districtAt(player.state.pos.x, player.state.pos.z).name; },
    get respect() { return game.respect; },
    get armour() { return game.armour; },
    get peds() { return traffic.peds.length; },
    get cars() { return traffic.cars.length; },
    renderer, scene,
  },
});

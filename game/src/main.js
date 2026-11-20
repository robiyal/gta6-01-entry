// Dusthaven — main game: boot, fixed-step loop, state machine, missions,
// wanted law, car stealing, HUD wiring and the ?shot= screenshot modes.
// You are Rook, a getaway driver in Dusthaven, a sun-soaked desert highway
// town. Three jobs, the sheriff on your tail, and a dust storm on the way.
import * as THREE from 'three';
import { CITY, LANDMARKS, MISSION_DEFS, TUNING } from './config.js';
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
const missions = createMissions(scene);
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
});

// ---- The player's own car + the gold coupe for mission 3.
const ownCarMesh = makeCar(0xc94f3d, { name: 'rook-car' });
ownCarMesh.position.set(-52, 0, -52);
ownCarMesh.rotation.y = Math.PI / 2;
scene.add(ownCarMesh);
const ownCar = { mesh: ownCarMesh, state: makeCarState(-52, -52, Math.PI / 2), owned: true };

const goldMesh = makeCar(0xe8b13c, { name: 'gold-coupe' });
goldMesh.position.set(-104, 0, -112);
goldMesh.rotation.y = -Math.PI / 2;
scene.add(goldMesh);
const goldCar = { mesh: goldMesh, state: makeCarState(-104, -112, -Math.PI / 2), gold: true };

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
    ui.toast('You stole a car! The sheriff noticed.');
    audio.crash();
  } else if (c.gold) {
    const m = missions.state.active;
    if (m && m.stealCar && missions.state.phase === 'pickup') {
      missions.state.phase = 'deliver';
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
  const inCar = p.inCar;

  // --- Input: drive or walk.
  if (inCar) {
    const { fwd, steer } = input.axis();
    const brake = input.down('Space');
    const before = p.car.speed;
    updateCar(p.car, { throttle: fwd, steer, brake }, dt, colliders);
    syncCarMesh(p.carMesh, p.car);
    game.speedKmh = Math.abs(p.car.speed) * 3.6;
    // Crash feedback on a hard stop.
    if (before > 10 && p.car.speed === 0) { audio.crash(); rig.addShake(0.4); }
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
  }, game.time);
  if (policeResult === 'busted') {
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
    ui.updateHUD({
      health: game.health,
      cash: game.cash,
      wanted: police.getWanted(),
      speedKmh: game.speedKmh,
      inCar,
      objectiveTitle: obj.title,
      objectiveText: obj.text,
      timeLeft: m ? missions.state.timeLeft : null,
      showCrosshair: !inCar,
      hint: inCar
        ? 'W/S drive · A/D steer · Space brake · E exit · P pause'
        : 'WASD move · Shift run · E enter car · F punch · Click shoot · R reload',
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

// ---- Deterministic ?shot= setups for screenshots.
function applyShotMode(shot) {
  audio.unlock();
  if (shot === 'start') {
    ui.setTitle(null);
    setState('title');
    return;
  }
  // Play, action and end all skip the title.
  game.cash = 1250;
  game.missionsDone = ['m1'];
  missions.state.index = 1;
  missions.state.done = ['m1'];
  player.state.pos.set(0, 0, -40);
  player.state.heading = 0;
  if (shot === 'play') {
    player.enterCar(ownCar.state, ownCar.mesh);
    ownCar.state.pos.set(0, 0, -40);
    ownCar.state.heading = 0;
    ownCar.state.speed = 14;
    rig.mode = 'chase';
    setState('playing');
  } else if (shot === 'action') {
    missions.startMission(0);
    missions.state.phase = 'deliver';
    missions.state.timeLeft = 96;
    police.setWanted(3);
    // Cruisers spawn at the Sheriff's Office; pull two of them into the
    // frame — one up ahead on the flank, one closing in from behind.
    police.cruisers.forEach((c, i) => {
      if (i === 0) { c.state.pos.set(7, 0, -38); c.state.heading = Math.PI; }
      else { c.state.pos.set(-7, 0, -92); c.state.heading = 0; }
      c.state.speed = 24;
      syncCarMesh(c.mesh, c.state);
    });
    player.enterCar(ownCar.state, ownCar.mesh);
    ownCar.state.pos.set(0, 0, -60);
    ownCar.state.heading = 0;
    ownCar.state.speed = 26;
    world.storm = 0.45;
    rig.mode = 'chase';
    setState('playing');
  } else if (shot === 'end') {
    const m = MISSION_DEFS[0];
    ui.showComplete(m, m.reward, game.cash + m.reward);
    setState('complete');
    rig.mode = 'title';
  }
  ui.updateHUD({
    health: 100, cash: game.cash, wanted: police.getWanted(),
    speedKmh: shot === 'play' ? 50 : shot === 'action' ? 94 : 0,
    inCar: shot !== 'end',
    objectiveTitle: shot === 'action' ? 'First Job — deliver' : 'Find work',
    objectiveText: shot === 'action' ? 'Get to the Rusty Spur Motel (86m). Lose the law if you have to.' : 'Head to the Rusty Spur Motel job board.',
    timeLeft: shot === 'action' ? 96 : null,
    showCrosshair: false,
    hint: '',
  });
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
  if (game.mode === 'playing') {
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
    get mission() { return missions.state.active ? missions.state.active.id : null; },
    get drawCalls() { return renderer.info.render.calls; },
    get triangles() { return renderer.info.render.triangles; },
    renderer, scene,
  },
});

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
  shotFreeze: false, // ?shot=action only: hold the staged chase exactly
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
  let inCar = p.inCar;

  // --- Input: drive or walk.
  if (inCar) {
    const { fwd, steer } = input.axis();
    const brake = input.down('Space');
    const before = p.car.speed;
    updateCar(p.car, { throttle: fwd, steer, brake }, dt, colliders);
    syncCarMesh(p.carMesh, p.car);
    // The player IS the car while driving: missions, police, traffic and
    // the minimap all read p.pos, so it must track the car — without this
    // the sheriff chases the spot you got in and a job can never complete
    // by driving.
    p.pos.copy(p.car.pos);
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
  // Re-read: E may have entered/exited the car this frame, and the
  // stale `inCar` would read p.car after exitCar() nulled it
  // (TypeError at the playerSpeed line below — fired on every exit).
  inCar = p.inCar;

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
    // Frozen chase formation: the sim does NOT run for this shot (see the
    // loop's shotFreeze branch), so the frame is exactly as staged — the
    // lead cruiser large ahead-right, a second unit blocking ahead-left,
    // and a dense dust storm. Round 1 staged the cruisers with
    // police.cruisers.forEach before any cruiser existed, so the call was
    // a no-op and the units spawned at the Sheriff's Office, far away;
    // this version spawns them first with a zero-dt update (spawn logic
    // runs, nothing moves), then places them. The storm is held at 0.8:
    // round 1 set 0.45, but M1 has no storm flag, so the loop decayed it
    // to ~0.1 before the capture and the storm barely read.
    player.state.pos.set(0, 0, -60);
    player.state.heading = 0;
    player.enterCar(ownCar.state, ownCar.mesh);
    ownCar.state.pos.set(0, 0, -60);
    ownCar.state.heading = 0;
    ownCar.state.speed = 0;
    syncCarMesh(ownCar.mesh, ownCar.state);
    player.state.pos.copy(ownCar.state.pos);
    missions.startMission(0);
    missions.state.phase = 'deliver';
    missions.state.timeLeft = 95;
    missions.state.active.storm = true;
    missions.beacon.position.set(-60, 0, -60);
    police.setWanted(3);
    police.update(0, { pos: player.state.pos, speed: 0, inCar: true, carState: null }, 0);
    police.cruisers.forEach((c, i) => {
      if (i === 0) { c.state.pos.set(3.4, 0, -57); c.state.heading = 0; }
      else { c.state.pos.set(-2.6, 0, -44); c.state.heading = 0; }
      c.state.speed = 0;
      syncCarMesh(c.mesh, c.state);
      // Frozen mid-flash light bar: red hot, blue dim.
      if (c.mesh.userData.lightRed) {
        c.mesh.userData.lightRed.material.emissiveIntensity = 3;
        c.mesh.userData.lightBlue.material.emissiveIntensity = 0.2;
      }
    });
    world.storm = 0.8;
    game.shotFreeze = true;
    rig.mode = 'action';
    setState('playing');
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
  }
  ui.updateHUD({
    health: 100, cash: game.cash, wanted: police.getWanted(),
    speedKmh: shot === 'play' ? 50 : shot === 'action' ? 94 : 0,
    inCar: shot !== 'end',
    objectiveTitle: shot === 'action' ? 'First Job — deliver' : 'Find work',
    objectiveText: shot === 'action' ? 'Get to the Rusty Spur Motel (60m). Lose the law if you have to.' : 'Head to the Rusty Spur Motel job board.',
    timeLeft: shot === 'action' ? 95 : null,
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
  if (game.mode === 'playing' && game.shotFreeze) {
    // Frozen action-shot staging (see applyShotMode): hold the chase
    // formation exactly as staged — no simulation, no police AI, no mission
    // timer — while the dust, the camera and the minimap stay live, so the
    // captured frame is exact.
    rig.mode = 'action';
    const car = player.state.car;
    rig.update(dt, { x: car.pos.x, z: car.pos.z, heading: car.heading }, 0, game.time);
    world.update(dt, car.pos, game.time);
    minimap.draw({
      player: { x: player.state.pos.x, z: player.state.pos.z, heading: car.heading },
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
    get mission() { return missions.state.active ? missions.state.active.id : null; },
    get drawCalls() { return renderer.info.render.calls; },
    get triangles() { return renderer.info.render.triangles; },
    renderer, scene,
  },
});

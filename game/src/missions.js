// Dusthaven missions: a three-job story arc plus free roam.
// Delia Voss hires Rook, a getaway driver. Each mission has a pickup point,
// a drop-off point, a timer and a scripted wanted level. A 3D beacon marks
// the target and the minimap + HUD arrow point the way. Completing a job
// pays cash and saves the game.
import * as THREE from 'three';
import { LANDMARKS, MISSION_DEFS } from './config.js';

function makeBeacon(color) {
  // A tall glowing column + a bouncing ring so the target reads from afar.
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), mat);
  col.position.y = 30;
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.6, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(col, ring);
  g.userData.ring = ring;
  g.userData.col = col;
  return g;
}

export function createMissions(scene) {
  const beacon = makeBeacon(0xffc53d);
  beacon.visible = false;
  scene.add(beacon);

  const state = {
    index: 0,           // next mission to run
    active: null,       // running mission def + runtime
    phase: 'idle',      // idle | pickup | deliver | done
    timeLeft: 0,
    done: [],           // completed mission ids
    boardOpen: false,
  };

  function targetPos() {
    if (!state.active) return null;
    const lm = state.phase === 'pickup'
      ? LANDMARKS[state.active.from]
      : LANDMARKS[state.active.to];
    return { x: lm.x, z: lm.z, label: lm.label };
  }

  function startMission(idx) {
    const def = MISSION_DEFS[idx];
    if (!def) return null;
    state.active = { ...def };
    state.phase = 'pickup';
    state.timeLeft = def.time;
    state.index = idx;
    beacon.visible = true;
    return def;
  }

  function update(dt, playerPos) {
    if (!state.active) return null;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      const failed = state.active;
      state.active = null;
      state.phase = 'idle';
      beacon.visible = false;
      return { type: 'failed', mission: failed, reason: 'Time ran out.' };
    }
    const t = targetPos();
    if (!t) return null;
    const d = Math.hypot(playerPos.x - t.x, playerPos.z - t.z);
    beacon.position.set(t.x, 0, t.z);
    beacon.userData.ring.position.y = 0.15 + Math.sin(performance.now() * 0.004) * 0.25;
    beacon.userData.ring.rotation.z += dt * 0.6;
    // Steal missions complete their pickup by taking the car, not by arriving.
    if (state.active.stealCar && state.phase === 'pickup') return null;
    // Arrival radius 12m: mission targets are landmark CENTRES, and the
    // landmarks are solid buildings — the closest a car can get to the
    // Garage centre is 11.3m (9m half-depth + 2.3m radius), 10.3m at the
    // Diner, 9.3m at the Gas & Go, 8.3m at the Motel. With radius 6 no
    // mission could ever complete in live play (measured 2026-11-20).
    // 12m means "pulled up at the place", not "inside the walls".
    if (d < 12) {
      if (state.phase === 'pickup') {
        state.phase = 'deliver';
        return { type: 'picked-up', mission: state.active };
      }
      const done = state.active;
      state.done.push(done.id);
      state.active = null;
      state.phase = 'idle';
      state.index += 1;
      beacon.visible = false;
      return { type: 'complete', mission: done };
    }
    return null;
  }

  function nextAvailable() {
    return state.index < MISSION_DEFS.length ? MISSION_DEFS[state.index] : null;
  }

  function reset() {
    state.active = null;
    state.phase = 'idle';
    state.timeLeft = 0;
    beacon.visible = false;
  }

  return { state, beacon, targetPos, startMission, update, nextAvailable, reset };
}

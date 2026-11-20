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

export function createMissions(scene, colliders) {
  const beacon = makeBeacon(0xffc53d);
  beacon.visible = false;
  scene.add(beacon);

  // Arrival is measured against the target landmark's SOLID FOOTPRINT,
  // not its centre. The centre-distance rule (radius 12, round 3) only
  // worked on the near faces: the Garage centre is 11.3 m from its
  // north/south faces but 17.3 m from its west/east faces (15 m
  // half-width + 2.3 m car radius), so a car pulling up to the west
  // face — the natural approach from the Chapel — could never complete
  // M3, and the only completable zone was a 0.7 m sliver on the
  // north/south faces (measured live 2026-11-20: the probe drove the
  // whole route, clamped at x=42.7 against the west face, 17.3 m from
  // the centre, and oscillated there for 1200 frames). The target box
  // is the collider whose centre is nearest the landmark centre (the
  // Motel has a second wing box, the Chapel a tower box — the
  // nearest-centre box is the main building in both cases). ARRIVE_BOX
  // 6.3 m from the wall is the same parking slack the old 12 m centre
  // radius allowed on the near faces: the car centre is never closer
  // than the 2.3 m radius, so it means "parked at the place, edge
  // within 4 m of the wall" — from ANY face, and no drive-by can
  // trigger it (roads are 60 m apart; the only road close to a box
  // is the one that runs into it).
  const ARRIVE_BOX = 6.3;
  const targetBox = {};
  for (const [id, lm] of Object.entries(LANDMARKS)) {
    let best = null, bestD = 1e9;
    for (const b of colliders || []) {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const dd = Math.hypot(cx - lm.x, cz - lm.z);
      if (dd < bestD) { bestD = dd; best = b; }
    }
    if (best) targetBox[id] = best;
  }
  function distToBox(px, pz, box) {
    const dx = Math.max(box.x0 - px, 0, px - box.x1);
    const dz = Math.max(box.z0 - pz, 0, pz - box.z1);
    return Math.hypot(dx, dz);
  }

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
    const lmId = state.phase === 'pickup' ? state.active.from : state.active.to;
    const box = targetBox[lmId] || null;
    const d = box ? distToBox(playerPos.x, playerPos.z, box)
      : Math.hypot(playerPos.x - t.x, playerPos.z - t.z);
    beacon.position.set(t.x, 0, t.z);
    beacon.userData.ring.position.y = 0.15 + Math.sin(performance.now() * 0.004) * 0.25;
    beacon.userData.ring.rotation.z += dt * 0.6;
    // Steal missions complete their pickup by taking the car, not by arriving.
    if (state.active.stealCar && state.phase === 'pickup') return null;
    // Arrival: within ARRIVE_BOX of the target's walls (or 12 m of its
    // centre if no footprint was found). See the note at the top of
    // createMissions for why the centre rule could never complete M3.
    if (d < (box ? ARRIVE_BOX : 12)) {
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

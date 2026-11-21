// Dusthaven traffic: cars that follow the road grid and pedestrians on the
// sidewalks. Traffic cars pick a road, drive its lane, and turn at
// intersections; pedestrians stroll the sidewalks and flee from a fast car.
import * as THREE from 'three';
import { CITY, PALETTE, TUNING, nearestRoad, onRoad } from './config.js';
import { makeCar, makeCarState, updateCar, syncCarMesh, pushCars } from './vehicles.js';
import { collideCircle } from './city.js';

const PED_SHIRTS = [0xd8c8a8, 0x7a9e6b, 0xc98d5f, 0x5a7a9e, 0x9e5a6b, 0xd8d3c8, 0x4a8a7a, 0xc96a3d, 0x8a6a9e, 0xd8b13c, 0x5a8a4a, 0xb85a5a];
const PED_PANTS = [0x2e4a5a, 0x4a3a28, 0x2b2b2e, 0x6b5a3a, 0x3a4a3a, 0x5a5a6b];
const PED_SKINS = [0xc98d6a, 0x8a5a3b, 0xe8b88a, 0x6b4530];
const PED_HATS = [0x6b4a2f, 0x8a6a3a, 0x2b2b2e, 0xd8c8a8];

// A pedestrian that reads as a person, not a pin: legs and arms on hip /
// shoulder pivots so they swing with the walk cycle, a torso with real
// width, and per-ped variation — height, build, shirt, trousers, skin and
// headwear (wide-brim hat, cap, or hair). The deputy (police.js) keeps its
// own sheriff build, so no ped can be mistaken for law.
function makePedestrian() {
  const g = new THREE.Group();
  const scale = 0.92 + Math.random() * 0.18; // height 0.92..1.10
  const build = 0.85 + Math.random() * 0.3;  // torso / limb thickness
  const shirt = new THREE.MeshStandardMaterial({
    color: PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)],
    roughness: 0.9, metalness: 0,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: PED_PANTS[Math.floor(Math.random() * PED_PANTS.length)],
    roughness: 0.95, metalness: 0,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: PED_SKINS[Math.floor(Math.random() * PED_SKINS.length)],
    roughness: 0.7, metalness: 0,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * build, 0.62, 4, 8), shirt);
  torso.position.y = 1.12;
  torso.scale.x = build;
  torso.castShadow = true;
  g.add(torso);
  // Legs: capsule children of hip pivots, so rotation.x swings from the hip.
  const legGeo = new THREE.CapsuleGeometry(0.12 * build, 0.5, 4, 8);
  const legL = new THREE.Group();
  legL.position.set(-0.15 * build, 0.85, 0);
  const legLMesh = new THREE.Mesh(legGeo, pants);
  legLMesh.position.y = -0.42;
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  const legR = new THREE.Group();
  legR.position.set(0.15 * build, 0.85, 0);
  const legRMesh = new THREE.Mesh(legGeo, pants);
  legRMesh.position.y = -0.42;
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  g.add(legL, legR);
  // Arms: capsule children of shoulder pivots, counter-swinging the legs.
  const armGeo = new THREE.CapsuleGeometry(0.1 * build, 0.42, 4, 8);
  const armL = new THREE.Group();
  armL.position.set(-0.4 * build, 1.42, 0);
  const armLMesh = new THREE.Mesh(armGeo, shirt);
  armLMesh.position.y = -0.32;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  const armR = new THREE.Group();
  armR.position.set(0.4 * build, 1.42, 0);
  const armRMesh = new THREE.Mesh(armGeo, shirt);
  armRMesh.position.y = -0.32;
  armRMesh.castShadow = true;
  armR.add(armRMesh);
  g.add(armL, armR);
  // Hands: small skin spheres at the arm ends so the arms read as arms.
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
    hand.position.y = -0.62;
    arm.add(hand);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.82;
  head.castShadow = true;
  g.add(head);
  // Headwear: wide-brim hat, cap, or hair — never the same silhouette twice.
  const h = Math.random();
  if (h < 0.5) {
    const hatMat = new THREE.MeshStandardMaterial({
      color: PED_HATS[Math.floor(Math.random() * PED_HATS.length)], roughness: 0.9,
    });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.06, 12), hatMat);
    brim.position.y = 1.98;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.2, 10), hatMat);
    crown.position.y = 2.08;
    g.add(brim, crown);
  } else if (h < 0.7) {
    const capMat = new THREE.MeshStandardMaterial({
      color: PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)], roughness: 0.9,
    });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 1.84;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), capMat);
    peak.position.set(0, 1.95, 0.26);
    g.add(cap, peak);
  } else {
    const hairMat = new THREE.MeshStandardMaterial({
      color: [0x2b1d12, 0x1c1c22, 0x6b6b6b, 0x4a2e18][Math.floor(Math.random() * 4)],
      roughness: 0.95,
    });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), hairMat);
    hair.position.y = 1.9;
    hair.scale.set(1, 0.75, 1);
    g.add(hair);
  }
  g.scale.setScalar(scale);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

export function createTraffic(scene, colliders) {
  const cars = [];
  const peds = [];
  const grid = CITY.grid;

  function randomRoadPoint() {
    const vertical = Math.random() < 0.5;
    const line = grid[Math.floor(Math.random() * grid.length)];
    const along = -CITY.half + 20 + Math.random() * (CITY.half * 2 - 40);
    const lane = (Math.random() < 0.5 ? -1 : 1) * 2;
    if (vertical) return { x: line + lane, z: along, heading: along > 0 ? Math.PI : 0 };
    return { x: along, z: line + lane, heading: along > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }

  for (let i = 0; i < TUNING.trafficCount; i++) {
    const p = randomRoadPoint();
    const color = PALETTE.carPaint[Math.floor(Math.random() * PALETTE.carPaint.length)];
    const mesh = makeCar(color, { name: `traffic-${i}` });
    scene.add(mesh);
    const state = makeCarState(p.x, p.z, p.heading);
    state.speed = 7 + Math.random() * 5;
    cars.push({
      mesh, state,
      cruise: state.speed,
      turnCooldown: 0,
      honkAt: 0,
    });
  }

  for (let i = 0; i < TUNING.pedCount; i++) {
    const line = grid[Math.floor(Math.random() * grid.length)];
    const vertical = Math.random() < 0.5;
    const along = -CITY.half + 20 + Math.random() * (CITY.half * 2 - 40);
    const side = (Math.random() < 0.5 ? -1 : 1) * (CITY.roadHalf + 2.5);
    const x = vertical ? line + side : along;
    const z = vertical ? along : line + side;
    const mesh = makePedestrian();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: Math.random() * Math.PI * 2,
      speed: 1 + Math.random() * 0.8,
      flee: 0, // seconds of fleeing left
      down: 0, // seconds knocked down left
      walkPhase: Math.random() * 6,
    });
  }

  function updateTraffic(dt, playerPos, playerSpeed, time) {
    for (const car of cars) {
      // Grid following: at an intersection, sometimes turn left/right.
      const { state } = car;
      const nearX = Math.abs(state.pos.x - nearestRoad(state.pos.x)) < 1.2;
      const nearZ = Math.abs(state.pos.z - nearestRoad(state.pos.z)) < 1.2;
      car.turnCooldown -= dt;
      if (nearX && nearZ && car.turnCooldown <= 0) {
        car.turnCooldown = 2 + Math.random() * 3;
        const r = Math.random();
        if (r < 0.3) state.heading += Math.PI / 2;
        else if (r < 0.6) state.heading -= Math.PI / 2;
        // Snap onto the lane after a turn.
        state.pos.x = nearestRoad(state.pos.x) + (Math.random() < 0.5 ? -2 : 2);
        state.pos.z = nearestRoad(state.pos.z) + (Math.random() < 0.5 ? -2 : 2);
      }
      // Slow down if the player is right ahead.
      let throttle = 0.55;
      if (playerPos) {
        const dx = playerPos.x - state.pos.x, dz = playerPos.z - state.pos.z;
        const d = Math.hypot(dx, dz);
        const ahead = Math.sin(state.heading) * dx + Math.cos(state.heading) * dz;
        if (d < 12 && ahead > 0) throttle = 0;
      }
      // Ease toward cruise speed.
      if (state.speed < car.cruise) state.speed += 3 * dt;
      if (state.speed > car.cruise + 2) state.speed -= 4 * dt;
      updateCar(state, { throttle, steer: 0, brake: throttle === 0 }, dt, colliders);
      syncCarMesh(car.mesh, state);
    }
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        ped.mesh.rotation.x = ped.down > 0 ? -Math.PI / 2 : 0;
        ped.mesh.position.y = ped.down > 0 ? 0.3 : 0;
        continue;
      }
      // Flee from a fast player car or a nearby gunshot.
      if (playerPos) {
        const d = Math.hypot(playerPos.x - ped.pos.x, playerPos.z - ped.pos.z);
        if (d < 8 && Math.abs(playerSpeed) > 6) ped.flee = 2.5;
      }
      let speed = ped.speed;
      if (ped.flee > 0) {
        ped.flee -= dt;
        speed = 4.5;
        const dx = ped.pos.x - playerPos.x, dz = ped.pos.z - playerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
      } else if (Math.random() < dt * 0.1) {
        ped.heading += (Math.random() - 0.5) * 1.5;
      }
      ped.walkPhase += dt * speed * 2.2;
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      collideCircle(colliders, ped.pos, 0.5);
      // Keep pedestrians on the sidewalks: if one wanders onto the asphalt
      // (and is not fleeing), steer it back to the nearest sidewalk edge
      // instead of letting it jaywalk down the middle of a road.
      if (ped.flee <= 0) {
        const lx = nearestRoad(ped.pos.x);
        const lz = nearestRoad(ped.pos.z);
        const dxR = ped.pos.x - lx, dzR = ped.pos.z - lz;
        const onX = Math.abs(dxR) < CITY.roadHalf + 1.2;
        const onZ = Math.abs(dzR) < CITY.roadHalf + 1.2;
        if (onX || onZ) {
          let tx = ped.pos.x, tz = ped.pos.z;
          if (onX && (!onZ || Math.abs(dxR) <= Math.abs(dzR))) {
            tx = lx + (dxR >= 0 ? 1 : -1) * (CITY.roadHalf + 2.5);
          } else {
            tz = lz + (dzR >= 0 ? 1 : -1) * (CITY.roadHalf + 2.5);
          }
          const want = Math.atan2(tx - ped.pos.x, tz - ped.pos.z);
          let dh = want - ped.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          ped.heading += Math.max(-1, Math.min(1, dh * 2)) * dt * 2;
        }
      }
      // Keep pedestrians inside the town and near sidewalks.
      if (Math.abs(ped.pos.x) > CITY.half - 8 || Math.abs(ped.pos.z) > CITY.half - 8) {
        ped.heading += Math.PI;
      }
      ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
      ped.mesh.rotation.y = ped.heading;
      // Walk cycle: legs swing from the hips, arms counter-swing from the
      // shoulders, torso bobs. Fleeing peds swing harder (their walkPhase
      // already advances faster); strolling peds get a gentle swing.
      const sw = Math.sin(ped.walkPhase) * (ped.flee > 0 ? 0.65 : 0.45);
      const u = ped.mesh.userData;
      u.legL.rotation.x = sw;
      u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.75;
      u.armR.rotation.x = sw * 0.75;
      u.torso.position.y = 1.12 + Math.abs(Math.sin(ped.walkPhase)) * 0.05;
    }
  }

  function carCarCollisions(playerCar) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) pushCars(cars[i].state, cars[j].state);
      if (playerCar) pushCars(cars[i].state, playerCar);
    }
  }

  function nearestCar(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.state.pos.x - pos.x, car.state.pos.z - pos.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  function nearestPed(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const ped of peds) {
      if (ped.down > 0) continue;
      const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
      if (d < bestD) { best = ped; bestD = d; }
    }
    return best;
  }

  function removeCarMesh(mesh) {
    scene.remove(mesh);
  }

  return { cars, peds, updateTraffic, carCarCollisions, nearestCar, nearestPed, removeCarMesh };
}

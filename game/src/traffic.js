// Dusthaven traffic: cars that follow the road grid and pedestrians on the
// sidewalks. Traffic cars pick a road, drive its lane, and turn at
// intersections; pedestrians stroll the sidewalks and flee from a fast car.
import * as THREE from 'three';
import { CITY, PALETTE, TUNING, nearestRoad, onRoad } from './config.js';
import { makeCar, makeCarState, updateCar, syncCarMesh, pushCars } from './vehicles.js';
import { collideCircle } from './city.js';

const PED_COLORS = [0xd8c8a8, 0x7a9e6b, 0xc98d5f, 0x5a7a9e, 0x9e5a6b, 0xd8d3c8];

function makePedestrian(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d6a, roughness: 0.7, metalness: 0 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), bodyMat);
  body.position.y = 1.0;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.85;
  head.castShadow = true;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }));
  hat.position.y = 2.05;
  g.add(body, head, hat);
  g.userData.body = body;
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
    const mesh = makePedestrian(PED_COLORS[i % PED_COLORS.length]);
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
      ped.mesh.userData.body.position.y = 1.0 + Math.abs(Math.sin(ped.walkPhase)) * 0.06;
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

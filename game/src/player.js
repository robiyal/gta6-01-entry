// Dusthaven player on foot: Rook, the getaway driver.
// A simple procedural character (jacket, hat, boots) with a walk bob and a
// run lean. Movement is WASD relative to the camera yaw; Shift runs.
// E enters the nearest car (stealing a traffic car raises the wanted level).
import * as THREE from 'three';
import { TUNING } from './config.js';
import { collideCircle } from './city.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  g.name = 'rook';
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8a5f43, roughness: 0.85 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2e4a5a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d6a, roughness: 0.7 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), jacket);
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.18, 10), hatMat);
  hatTop.position.y = 2.06;
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), hatMat);
  hatBrim.position.y = 1.98;
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 8), jeans);
  legL.position.set(-0.16, 0.55, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), jacket);
  armL.position.set(-0.45, 1.2, 0);
  const armR = armL.clone();
  armR.position.x = 0.45;
  g.add(torso, head, hatTop, hatBrim, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

export function createPlayer(scene, colliders) {
  const mesh = makePlayerMesh();
  scene.add(mesh);
  const state = {
    pos: new THREE.Vector3(-60, 0, -52), // outside the Rusty Spur Motel
    heading: Math.PI * 0.75,
    speed: 0,
    health: TUNING.playerHealth,
    inCar: false,
    car: null,          // the car state object when driving
    carMesh: null,
    walkPhase: 0,
    radius: 0.6,
  };

  function update(dt, input, camYaw) {
    if (state.inCar) return;
    const { fwd, steer } = input.axis();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpeed = running ? TUNING.playerRunSpeed : TUNING.playerWalkSpeed;
    // Movement relative to the camera yaw.
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let mx = 0, mz = 0;
    if (fwd !== 0) { mx += sin * fwd; mz += cos * fwd; }
    if (steer !== 0) { mx += cos * steer; mz += -sin * steer; }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      state.speed = maxSpeed;
      state.heading = Math.atan2(mx, mz);
      state.pos.x += mx * maxSpeed * dt;
      state.pos.z += mz * maxSpeed * dt;
      collideCircle(colliders, state.pos, state.radius);
      state.walkPhase += dt * maxSpeed * 1.6;
    } else {
      state.speed = 0;
    }
    // Walk cycle: legs swing, arms counter-swing, torso bobs.
    const sw = state.speed > 0 ? Math.sin(state.walkPhase) * 0.5 : 0;
    const u = mesh.userData;
    u.legL.rotation.x = sw;
    u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.8;
    u.armR.rotation.x = sw * 0.8;
    u.torso.position.y = 1.15 + (state.speed > 0 ? Math.abs(Math.sin(state.walkPhase)) * 0.05 : 0);
    mesh.position.copy(state.pos);
    mesh.rotation.y = state.heading;
  }

  function enterCar(carState, carMesh) {
    state.inCar = true;
    state.car = carState;
    state.carMesh = carMesh;
    mesh.visible = false;
  }

  function exitCar() {
    if (!state.car) return;
    // Step out to the driver's side.
    const side = new THREE.Vector3(Math.cos(state.car.heading), 0, -Math.sin(state.car.heading));
    state.pos.set(
      state.car.pos.x + side.x * 2.6,
      0,
      state.car.pos.z + side.z * 2.6,
    );
    collideCircle(colliders, state.pos, state.radius);
    state.heading = state.car.heading;
    state.inCar = false;
    state.car = null;
    state.carMesh = null;
    mesh.visible = true;
    mesh.position.copy(state.pos);
  }

  return { mesh, state, update, enterCar, exitCar };
}

// Dusthaven vehicles: procedural low-poly cars and arcade driving physics.
// A car is a Group: body + cabin + 4 wheels + lights, all MeshStandardMaterial
// with PBR paint (metalness ~0.6, roughness ~0.35 with clearcoat feel via low
// roughness), dark glass, and worn bumpers. No external models.
import * as THREE from 'three';
import { PALETTE, TUNING } from './config.js';
import { collideCircle } from './city.js';

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.2);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
const bumperGeo = new THREE.BoxGeometry(2.02, 0.22, 0.3);

export function makeCar(color, opts = {}) {
  const g = new THREE.Group();
  g.name = opts.name || 'car';
  const paint = new THREE.MeshStandardMaterial({
    color, roughness: 0.32, metalness: 0.55,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x2a3a48, roughness: 0.18, metalness: 0.7,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.8, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.2, metalness: 0.9 });

  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glass);
  cabin.position.set(0, 1.05, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  // Paint-coloured roof panel over the glass cabin: from behind and above
  // the car reads as paint, not a black box.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 2.0), paint);
  roof.position.set(0, 1.36, -0.25);
  roof.castShadow = true;
  g.add(roof);
  // Bumpers with edge wear (chrome strip catches the sun).
  for (const z of [2.2, -2.2]) {
    const b = new THREE.Mesh(bumperGeo, chrome);
    b.position.set(0, 0.32, z);
    g.add(b);
  }
  // Wheels.
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // Headlights (warm) and taillights (red emissive).
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 0.9, roughness: 0.3,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.7, roughness: 0.3,
  });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(lightGeo, headMat);
    h.position.set(x, 0.62, 2.22);
    g.add(h);
    const t = new THREE.Mesh(lightGeo, tailMat);
    t.position.set(x, 0.62, -2.22);
    g.add(t);
  }
  if (opts.police) {
    // Black-and-white sheriff livery + light bar.
    body.material = new THREE.MeshStandardMaterial({ color: PALETTE.policeWhite, roughness: 0.35, metalness: 0.5 });
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.42), new THREE.MeshStandardMaterial({ color: PALETTE.policePaint, roughness: 0.5, metalness: 0.4 }));
    skirt.position.y = 0.32;
    g.add(skirt);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.3), dark);
    barBase.position.set(0, 1.42, -0.25);
    g.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xff2222, emissiveIntensity: 2 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1111aa, emissive: 0x2244ff, emissiveIntensity: 2 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), redMat);
    red.position.set(-0.28, 1.5, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), blueMat);
    blue.position.set(0.28, 1.5, -0.25);
    g.add(red, blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  g.userData.paint = paint;
  return g;
}

// Arcade car state: position on the ground plane, heading, speed.
// `condition` is the car's health (100 new): hard crashes and police rams
// wear it down, the garage restores it, and the HUD shows it next to the
// speed. Only the player's driven car is ever displayed.
export function makeCarState(x, z, heading) {
  return {
    pos: new THREE.Vector3(x, 0, z),
    heading, speed: 0, steer: 0,
    radius: 2.3,
    condition: 100,
  };
}

// One fixed-step arcade update. `drive` = {throttle -1..1, steer -1..1, brake bool}.
// Steering authority fades with speed so the car stays controllable at 40 m/s.
// `maxSpeed` overrides the tuning cap (engine tunes / nitro); callers that do
// not pass it get TUNING.carMaxSpeed.
export function updateCar(state, drive, dt, colliders, maxSpeed) {
  const t = TUNING;
  const topSpeed = maxSpeed || t.carMaxSpeed;
  const targetSteer = drive.steer * t.carTurn * Math.min(1, 6 / (Math.abs(state.speed) + 3));
  state.steer += (targetSteer - state.steer) * Math.min(1, dt * 8);
  state.heading += state.steer * dt * Math.sign(state.speed || 1) * (Math.abs(state.speed) > 0.3 ? 1 : 0);
  if (drive.brake) {
    state.speed -= Math.sign(state.speed) * t.carBrake * dt;
    if (Math.abs(state.speed) < 0.5) state.speed = 0;
  } else if (drive.throttle > 0) {
    state.speed += t.carAccel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    state.speed += t.carReverse * drive.throttle * dt;
  }
  // Drag + rolling resistance.
  state.speed -= state.speed * t.carDrag * dt * 0.4;
  if (Math.abs(state.speed) < 0.05 && drive.throttle === 0) state.speed = 0;
  state.speed = Math.max(-12, Math.min(topSpeed, state.speed));

  const prev = state.pos.clone();
  state.pos.x += Math.sin(state.heading) * state.speed * dt;
  state.pos.z += Math.cos(state.heading) * state.speed * dt;
  if (collideCircle(colliders, state.pos, state.radius)) {
    // Slide along the wall: keep the tangential component, kill the rest.
    const hitSpeed = state.speed;
    state.speed *= 0.55;
    if (Math.abs(hitSpeed) > 8) {
      // Hard hit: stop and nudge back out.
      state.pos.copy(prev);
      state.speed = 0;
    }
  }
  return state;
}

export function syncCarMesh(mesh, state) {
  mesh.position.set(state.pos.x, 0, state.pos.z);
  mesh.rotation.y = state.heading;
  // Wheel spin + front-wheel steer.
  const spin = (state.speed * 0.016) / 0.36;
  const wheels = mesh.userData.wheels;
  if (wheels) {
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += spin;
      if (i < 2) wheels[i].rotation.y = state.steer * 0.4;
    }
  }
}

// Circle-vs-circle push for car-car contact (traffic, police rams).
export function pushCars(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  const min = a.radius + b.radius;
  if (d > 0.001 && d < min) {
    const push = (min - d) / 2;
    const nx = dx / d, nz = dz / d;
    a.pos.x -= nx * push; a.pos.z -= nz * push;
    b.pos.x += nx * push; b.pos.z += nz * push;
    return true;
  }
  return false;
}

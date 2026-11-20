// Dusthaven law: the wanted system and police AI.
// Wanted 0-5 stars. Crimes raise it; police cruisers spawn at the Sheriff's
// Office and chase. A bust happens when a cruiser holds the player slow and
// close; escape decays the heat when no cruiser is near. On foot, deputies
// chase and punch. Sirens wail while any cruiser is in pursuit.
import * as THREE from 'three';
import { LANDMARKS, TUNING } from './config.js';
import { makeCar, makeCarState, updateCar, syncCarMesh, pushCars } from './vehicles.js';

export function createPolice(scene, colliders, audio) {
  const cruisers = [];
  const deputies = [];
  let wanted = 0;
  let decayTimer = 0;
  let bustTimer = 0;
  let sirenOn = false;

  function spawnCruiser() {
    const s = LANDMARKS.sheriff;
    const mesh = makeCar(0x1c1c22, { police: true, name: `police-${cruisers.length}` });
    scene.add(mesh);
    const state = makeCarState(s.x + 10, s.z + 8, Math.PI / 2);
    cruisers.push({ mesh, state, mode: 'chase', stuck: 0 });
  }

  function spawnDeputy(x, z) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d6a, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.95, 4, 8), bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skinMat);
    head.position.y = 1.9;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.7 }));
    hat.position.y = 2.1;
    g.add(body, head, hat);
    g.position.set(x, 0, z);
    scene.add(g);
    deputies.push({
      mesh: g, pos: new THREE.Vector3(x, 0, z),
      heading: 0, speed: 4.2, punchAt: 0, health: 50,
    });
  }

  function addWanted(n, reason) {
    const before = wanted;
    wanted = Math.max(0, Math.min(5, wanted + n));
    if (wanted > before) decayTimer = 0;
    return { before, after: wanted, reason };
  }

  function update(dt, player, time) {
    // Keep cruiser count matched to wanted (max 3 on the road).
    const wantCruisers = Math.min(TUNING.policeMax, Math.ceil(wanted / 2));
    while (cruisers.length < wantCruisers) spawnCruiser();
    while (cruisers.length > wantCruisers) {
      const c = cruisers.pop();
      scene.remove(c.mesh);
    }
    // Deputies only hunt a player on foot at wanted 2+.
    if (wanted >= 2 && !player.inCar && deputies.length < 2) {
      spawnDeputy(player.pos.x + 12, player.pos.z + 8);
    }
    if (wanted < 2 || player.inCar) {
      for (const d of deputies.splice(0)) scene.remove(d.mesh);
    }

    const chasing = wanted > 0;
    // Siren follows pursuit.
    if (chasing && !sirenOn) { audio.siren(true); sirenOn = true; }
    if (!chasing && sirenOn) { audio.siren(false); sirenOn = false; }

    let nearestDist = Infinity;
    for (const c of cruisers) {
      const dx = player.pos.x - c.state.pos.x;
      const dz = player.pos.z - c.state.pos.z;
      const dist = Math.hypot(dx, dz);
      nearestDist = Math.min(nearestDist, dist);
      // Pursuit steering: aim at the player, with a little weave so the
      // chase reads as a chase, not a magnet.
      const wantHeading = Math.atan2(dx, dz) + Math.sin(time * 0.7 + c.state.pos.x) * 0.08;
      let dh = wantHeading - c.state.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.4));
      const targetSpeed = Math.min(38, Math.abs(player.speed || 0) + 9);
      const throttle = c.state.speed < targetSpeed ? 1 : 0.2;
      updateCar(c.state, { throttle, steer, brake: false }, dt, colliders);
      // Ram: shove the player's car on contact.
      if (player.carState && dist < c.state.radius + player.carState.radius) {
        pushCars(c.state, player.carState);
        c.state.speed *= 0.92;
        if (Math.abs(player.carState.speed) < 1) c.state.speed *= 0.9;
      }
      // Light bar flash.
      const phase = Math.floor(time * 6) % 2 === 0;
      if (c.mesh.userData.lightRed) {
        c.mesh.userData.lightRed.material.emissiveIntensity = phase ? 3 : 0.2;
        c.mesh.userData.lightBlue.material.emissiveIntensity = phase ? 0.2 : 3;
      }
      syncCarMesh(c.mesh, c.state);
    }

    // Bust: a cruiser sits on a slow player for 2 seconds.
    if (wanted > 0 && nearestDist < TUNING.bustRadius && Math.abs(player.speed || 0) < TUNING.bustSpeed) {
      bustTimer += dt;
      if (bustTimer >= TUNING.bustHold) return 'busted';
    } else {
      bustTimer = 0;
    }
    // Escape: heat decays when no cruiser is anywhere near.
    if (wanted > 0 && nearestDist > 50) {
      decayTimer += dt;
      if (decayTimer >= TUNING.wantedDecaySeconds) {
        wanted -= 1;
        decayTimer = 0;
      }
    } else {
      decayTimer = 0;
    }

    // Deputies on foot: run at the player, punch in range.
    for (const d of deputies) {
      const dx = player.pos.x - d.pos.x, dz = player.pos.z - d.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      d.heading = Math.atan2(dx, dz);
      d.pos.x += Math.sin(d.heading) * d.speed * dt;
      d.pos.z += Math.cos(d.heading) * d.speed * dt;
      d.mesh.position.set(d.pos.x, 0, d.pos.z);
      d.mesh.rotation.y = d.heading;
      d.punchAt -= dt;
      if (dist < 1.6 && d.punchAt <= 0) {
        d.punchAt = 1.1;
        return { hit: 12, from: 'deputy' };
      }
    }
    return null;
  }

  function getWanted() { return wanted; }
  function setWanted(n) { wanted = Math.max(0, Math.min(5, n)); decayTimer = 0; }
  function clearAll() {
    for (const c of cruisers.splice(0)) scene.remove(c.mesh);
    for (const d of deputies.splice(0)) scene.remove(d.mesh);
    wanted = 0;
    if (sirenOn) { audio.siren(false); sirenOn = false; }
  }

  return {
    cruisers, deputies, update, addWanted, getWanted, setWanted, clearAll,
  };
}

// Dusthaven combat: fists on foot and one hitscan pistol.
// Punch is a short-range arc with knockback; the pistol is a centre-screen
// raycast with a muzzle flash, tracer, ammo and a reload. Hits on police
// raise the wanted level; hitting a pedestrian is a crime too.
import * as THREE from 'three';
import { TUNING } from './config.js';

export function createCombat(scene, audio) {
  const raycaster = new THREE.Raycaster();
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
  const tracer = new THREE.Mesh(tracerGeo, tracerMat);
  tracer.visible = false;
  scene.add(tracer);
  const flash = new THREE.PointLight(0xffe9a8, 0, 12, 2);
  scene.add(flash);
  let tracerLife = 0;
  let flashLife = 0;

  let ammo = TUNING.pistolAmmo;
  let reloading = 0;
  let punchCooldown = 0;

  function punch(player, peds, deputies, police) {
    if (punchCooldown > 0) return null;
    punchCooldown = 0.45;
    audio.punch();
    const px = player.pos.x, pz = player.pos.z;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let hitAny = null;
    const tryHit = (pos, radius, damage, kind, ref) => {
      const dx = pos.x - px, dz = pos.z - pz;
      const d = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (d < TUNING.punchRange + radius && facing > 0.2) {
        ref.health -= damage;
        pos.x += (dx / (d || 1)) * 1.2;
        pos.z += (dz / (d || 1)) * 1.2;
        hitAny = { kind, damage };
        return true;
      }
      return false;
    };
    for (const ped of peds) {
      if (ped.down > 0) continue;
      if (tryHit(ped.pos, 0.5, TUNING.punchDamage, 'ped', ped)) {
        ped.down = 4;
        police.addWanted(1, 'assault');
        break;
      }
    }
    if (!hitAny) {
      for (const dep of deputies) {
        if (tryHit(dep.pos, 0.5, TUNING.punchDamage, 'deputy', dep)) {
          if (dep.health <= 0) {
            dep.pos.set(player.pos.x + 60, 0, player.pos.z + 60);
            dep.health = 50;
          }
          police.addWanted(1, 'assault on a deputy');
          break;
        }
      }
    }
    return hitAny;
  }

  function shoot(camera, player, targets, police) {
    // targets: [{pos, radius, health, kind, ref}] — police cruisers, deputies, peds.
    if (reloading > 0) return null;
    if (ammo <= 0) {
      reload();
      return { type: 'empty' };
    }
    ammo -= 1;
    audio.gunshot();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = TUNING.pistolRange;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    raycaster.ray.direction.normalize();
    dir.copy(raycaster.ray.direction);
    let best = null, bestT = Infinity;
    for (const t of targets) {
      const to = new THREE.Vector3(t.pos.x - origin.x, (t.pos.y || 1.2) - origin.y, t.pos.z - origin.z);
      const along = to.dot(dir);
      if (along < 0 || along > TUNING.pistolRange) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < (t.radius || 1.2) + 0.4 && along < bestT) {
        best = t; bestT = along;
      }
    }
    // Tracer from the muzzle to the hit point (or max range).
    const end = origin.clone().addScaledVector(dir, best ? bestT : TUNING.pistolRange);
    const mid = origin.clone().add(end).multiplyScalar(0.5);
    tracer.position.copy(mid);
    tracer.scale.set(1, origin.distanceTo(end), 1);
    tracer.lookAt(end);
    tracer.rotateX(Math.PI / 2);
    tracer.visible = true;
    tracerLife = 0.07;
    flash.position.copy(origin).addScaledVector(dir, 1.2);
    flash.intensity = 24;
    flashLife = 0.06;
    if (best) {
      best.ref.health -= TUNING.pistolDamage;
      if (best.kind === 'deputy' && best.ref.health <= 0) {
        best.ref.pos.set(player.pos.x + 60, 0, player.pos.z + 60);
        best.ref.health = 50;
      }
      if (best.kind === 'ped' && best.ref.down !== undefined) best.ref.down = 4;
      police.addWanted(1, 'shooting');
      return { type: 'hit', kind: best.kind };
    }
    return { type: 'miss' };
  }

  function reload() {
    if (reloading > 0 || ammo === TUNING.pistolAmmo) return;
    reloading = 1.1;
    audio.reload();
  }

  function update(dt) {
    if (tracerLife > 0) {
      tracerLife -= dt;
      if (tracerLife <= 0) tracer.visible = false;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flash.intensity = Math.max(0, flash.intensity - dt * 400);
      if (flashLife <= 0) flash.intensity = 0;
    }
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) ammo = TUNING.pistolAmmo;
    }
    if (punchCooldown > 0) punchCooldown -= dt;
  }

  return {
    punch, shoot, reload, update,
    get ammo() { return ammo; },
    get reloading() { return reloading > 0; },
  };
}

// Dusthaven round 4 — the sheriff's air unit and the roadblock.
// The helicopter is a real flying object: it orbits the player once the heat
// hits 3 stars, its rotor spins, and a visible spotlight cone tracks the
// player car. It never collides with anything — it is eyes in the sky, and
// the dispatch list shows it as AIR-1 SPOTLIGHT. The roadblock is two
// striped barriers + cones placed across the road ahead of the player at 4
// stars, with one cruiser parked across the lane behind them.
import * as THREE from 'three';

export function makeHelicopter() {
  const g = new THREE.Group();
  g.name = 'heli';
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5, metalness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3a48, roughness: 0.15, metalness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 4.6), whiteMat);
  body.position.y = 0;
  body.castShadow = true;
  g.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 3.4), bodyMat);
  belly.position.y = -1.0;
  g.add(belly);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.2), glassMat);
  nose.position.set(0, 0.1, 2.6);
  g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5.2), bodyMat);
  boom.position.set(0, 0.3, -4.4);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 1.2), bodyMat);
  fin.position.set(0, 0.9, -6.8);
  g.add(fin);
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.6, metalness: 0.5 });
  for (const x of [-1.2, 1.2]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), skidMat);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(x, -1.7, 0.4);
    g.add(skid);
  }
  // Main rotor: two long blades on a mast, spinning. A translucent disc
  // sells the blur without a texture.
  const rotor = new THREE.Group();
  rotor.position.y = 1.3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 8), bodyMat);
  mast.position.y = 0.2;
  rotor.add(mast);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5, metalness: 0.3 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.45), bladeMat);
    blade.rotation.y = a;
    blade.position.y = 0.6;
    rotor.add(blade);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.62;
  rotor.add(disc);
  g.add(rotor);
  g.userData.rotor = rotor;

  // Spotlight cone: apex at the helicopter, base on the player. The cone
  // geometry is unit-height; update() scales and aims it every frame. The
  // cone and its ground pool are NOT children of the heli group — they live
  // in world space, so the group's yaw never skews them.
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c8, transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 1, 20, 1, true), coneMat);
  cone.name = 'heli-spotlight';
  cone.visible = false;
  // A bright pool where the beam lands, so the spotlight reads on the ground.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(6, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.name = 'heli-pool';
  pool.visible = false;
  return { group: g, cone, pool };
}

// The air unit's flight model: orbit the player at ~38 m, one slow circle,
// rotor always spinning. `update` returns the helicopter's ground distance
// to the player for the dispatch list, or null when it is not flying.
export function createHelicopter(scene) {
  const { group: mesh, cone, pool } = makeHelicopter();
  mesh.visible = false;
  scene.add(mesh, cone, pool);
  const state = { active: false, angle: 0, dist: 0 };
  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  // Aim the beam in world space: apex at the helicopter, base at the player.
  // The cone's local +Y runs base -> apex, so aim +Y from the player toward
  // the heli; the cone sits at the midpoint and stretches to the distance.
  function aimBeam(hx, hy, hz, tx, tz) {
    tmp.set(hx - tx, hy, hz - tz);
    const len = tmp.length();
    cone.visible = true;
    pool.visible = true;
    cone.quaternion.setFromUnitVectors(UP, tmp.clone().normalize());
    cone.position.set((hx + tx) / 2, hy / 2, (hz + tz) / 2);
    cone.scale.set(1, len, 1);
    pool.position.set(tx, 0.15, tz);
    return len;
  }

  function update(dt, playerPos, wanted, time) {
    const want = wanted >= 3;
    if (want && !state.active) {
      state.active = true;
      mesh.visible = true;
      // Enter from the sheriff's side of town so it does not pop in overhead.
      state.angle = Math.atan2(playerPos.x - 120, playerPos.z - (-120));
    } else if (!want && state.active) {
      state.active = false;
      mesh.visible = false;
      cone.visible = false;
      pool.visible = false;
      return null;
    }
    if (!state.active) return null;
    state.angle += dt * 0.12;
    const R = 36;
    const x = playerPos.x + Math.sin(state.angle) * R;
    const z = playerPos.z + Math.cos(state.angle) * R;
    const y = 38 + Math.sin(time * 0.5) * 1.5;
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(playerPos.x - x, playerPos.z - z);
    mesh.userData.rotor.rotation.y += dt * 22;
    aimBeam(x, y, z, playerPos.x, playerPos.z);
    state.dist = Math.hypot(x - playerPos.x, z - playerPos.z);
    return state.dist;
  }

  // Place the helicopter exactly (frozen screenshot staging): no orbit, no
  // spin-up — the caller sets the position and the spotlight target.
  function place(x, y, z, targetX, targetZ) {
    state.active = true;
    mesh.visible = true;
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(targetX - x, targetZ - z);
    aimBeam(x, y, z, targetX, targetZ);
    state.dist = Math.hypot(x - targetX, z - targetZ);
    return state.dist;
  }

  return { mesh, state, update, place };
}

// ---- Roadblock props: two striped barriers + four cones across a road.
// The barriers are the visual; the cruiser parked behind them is the wall.
export function makeRoadblock() {
  const g = new THREE.Group();
  g.name = 'roadblock';
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256; stripeCanvas.height = 64;
  const sg = stripeCanvas.getContext('2d');
  sg.fillStyle = '#e8e2d2';
  sg.fillRect(0, 0, 256, 64);
  sg.fillStyle = '#c94f3d';
  for (let i = -2; i < 8; i++) {
    sg.beginPath();
    sg.moveTo(i * 48, 64); sg.lineTo(i * 48 + 24, 0);
    sg.lineTo(i * 48 + 48, 0); sg.lineTo(i * 48 + 24, 64);
    sg.fill();
  }
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  const barMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.1 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7, metalness: 0.4 });
  for (const z of [-2.2, 2.2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.7, 0.12), barMat);
    bar.position.set(0, 1.0, z);
    bar.castShadow = true;
    g.add(bar);
    for (const x of [-3.6, 3.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.5), legMat);
      leg.position.set(x, 0.5, z);
      g.add(leg);
    }
  }
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xe86a1c, roughness: 0.6 });
  for (const [x, z] of [[-5.2, -1.4], [-5.2, 1.4], [5.2, -1.4], [5.2, 1.4]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 10), coneMat);
    cone.position.set(x, 0.45, z);
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

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
  // Sheriff air unit: white fuselage with a glass canopy, red tail band,
  // SHERIFF decals, tail boom + tail rotor, skids on struts, and a
  // searchlight under the nose. The old box read as a black slab from
  // below because the whole underside was dark paint in shadow — the new
  // body is white all round with a faint emissive lift, so no face ever
  // goes to black, and the glass canopy carries its own glow.
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8, roughness: 0.35, metalness: 0.35,
    emissive: 0x2a2a2a, emissiveIntensity: 0.5,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.4 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xc94f3d, roughness: 0.45, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6a9ab8, roughness: 0.08, metalness: 0.9,
    emissive: 0x1a2a38, emissiveIntensity: 0.6,
  });

  // Rounded fuselage: a squashed sphere reads as an airframe from every
  // angle; the old sharp box read as a crate.
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), whiteMat);
  body.scale.set(1, 0.72, 1.55);
  body.castShadow = true;
  g.add(body);
  // Glass canopy: a second squashed sphere, forward and high, wrapping the
  // nose — the pilot's greenhouse, not a flat dark panel.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12), glassMat);
  canopy.scale.set(0.92, 0.62, 1.0);
  canopy.position.set(0, 0.35, 1.35);
  g.add(canopy);
  // SHERIFF decals on both flanks, with a gold star.
  const decalCanvas = document.createElement('canvas');
  decalCanvas.width = 256; decalCanvas.height = 64;
  const dg = decalCanvas.getContext('2d');
  dg.fillStyle = '#e8e8e8'; dg.fillRect(0, 0, 256, 64);
  dg.fillStyle = '#c9a227';
  dg.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 16 : 7, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    dg[i === 0 ? 'moveTo' : 'lineTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  dg.closePath(); dg.fill();
  dg.fillStyle = '#1c1c22';
  dg.font = 'bold 34px system-ui, sans-serif';
  dg.textAlign = 'left'; dg.textBaseline = 'middle';
  dg.fillText('SHERIFF', 58, 34);
  const decalTex = new THREE.CanvasTexture(decalCanvas);
  decalTex.colorSpace = THREE.SRGBColorSpace;
  const decalMat = new THREE.MeshStandardMaterial({
    map: decalTex, roughness: 0.4, metalness: 0.2,
    emissive: 0xffffff, emissiveMap: decalTex, emissiveIntensity: 0.25,
  });
  for (const s of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), decalMat);
    decal.position.set(s * 1.42, -0.05, 0.1);
    decal.rotation.y = s * Math.PI / 2;
    g.add(decal);
  }
  // Tail boom: tapered, with a red band and a vertical fin.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 4.6, 10), darkMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.25, -4.2);
  boom.castShadow = true;
  g.add(boom);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 10), redMat);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 0.25, -3.4);
  g.add(band);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.3), darkMat);
  fin.position.set(0, 0.9, -6.4);
  g.add(fin);
  // Tail rotor: two small blades on the fin, spinning with the main rotor.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.25, 1.0, -6.5);
  const trBladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5, metalness: 0.3 });
  for (const a of [0, Math.PI / 2]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.16), trBladeMat);
    b.rotation.z = a;
    tailRotor.add(b);
  }
  g.add(tailRotor);
  g.userData.tailRotor = tailRotor;
  // Skids on four struts — the old heli floated on two bare tubes.
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.6, metalness: 0.5 });
  for (const x of [-1.2, 1.2]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), skidMat);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(x, -1.7, 0.4);
    g.add(skid);
    for (const z of [-0.9, 1.6]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), skidMat);
      strut.position.set(x, -1.25, z);
      strut.rotation.z = x > 0 ? 0.35 : -0.35;
      g.add(strut);
    }
  }
  // Searchlight bulb under the nose (the cone + ground pool already exist
  // below and are aimed by update()/place()).
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 2.2, roughness: 0.3 }),
  );
  lamp.position.set(0, -0.95, 1.9);
  g.add(lamp);
  // Main rotor: two long blades on a mast, spinning. A translucent disc
  // sells the blur without a texture — two discs now, so the blur reads
  // from below as well as from the side.
  const rotor = new THREE.Group();
  rotor.position.y = 1.3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 8), darkMat);
  mast.position.y = 0.2;
  rotor.add(mast);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5, metalness: 0.3 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xffc53d, roughness: 0.5, emissive: 0xcc8800, emissiveIntensity: 0.4 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.45), bladeMat);
    blade.rotation.y = a;
    blade.position.y = 0.6;
    rotor.add(blade);
    for (const s of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.46), tipMat);
      tip.position.set(Math.sin(a) * s * 4.55, 0.6, Math.cos(a) * s * 4.55);
      tip.rotation.y = a;
      rotor.add(tip);
    }
  }
  const discMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.8, 24), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.62;
  rotor.add(disc);
  const disc2 = new THREE.Mesh(new THREE.CircleGeometry(4.8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
  disc2.rotation.x = -Math.PI / 2;
  disc2.position.y = 0.45;
  rotor.add(disc2);
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
    if (mesh.userData.tailRotor) mesh.userData.tailRotor.rotation.x += dt * 30;
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

// Dusthaven city: procedural buildings, landmarks, props and colliders.
// Buildings are one InstancedMesh (per-instance colour tint) with a shared
// procedural window texture — PBR standard material, roughness variation in
// the texture, warm adobe palette with teal/red/ochre trim. Landmarks are
// individual hero meshes with neon signs and their own three-point lighting
// from the sun + hemisphere + bounce rig in world.js.
import * as THREE from 'three';
import { CITY, PALETTE, LANDMARKS } from './config.js';
import { SHOPS, SHOP_ROW_Z } from './districts.js';

// Deterministic RNG so the city is identical on every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture(base = '#c98d5f') {
  // Wall with a grid of windows; a few windows glow warm (lit rooms).
  // `base` tints the wall: adobe for generic buildings, teal for the diner,
  // blue-grey for the garage, grey for the sheriff's office — one texture
  // function, one lit-window language across the whole town.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Dirt mask: grime near the bottom, sun-bleach near the top.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,220,170,0.18)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(90,55,25,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let y = 24; y < 240; y += 44) {
    for (let x = 20; x < 236; x += 52) {
      const lit = Math.random() < 0.28;
      g.fillStyle = '#4a3423';
      g.fillRect(x - 2, y - 2, 32, 38);
      g.fillStyle = lit ? '#ffd98a' : '#2e4a5a';
      g.fillRect(x, y, 28, 34);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 28, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSign(text, fg, bg, w, h) {
  const mat = new THREE.MeshStandardMaterial({
    map: signTexture(text, fg, bg), emissive: 0xffffff,
    emissiveMap: signTexture(text, fg, bg), emissiveIntensity: 0.55,
    roughness: 0.4, metalness: 0.1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.name = `sign:${text}`;
  return mesh;
}

export function createCity(scene) {
  const rng = mulberry32(20261120);
  const colliders = []; // {x0,z0,x1,z1} axis-aligned boxes
  const group = new THREE.Group();
  group.name = 'city';

  // ---- Generic buildings: one instanced box mass + one instanced roof trim.
  const winTex = windowTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: winTex, roughness: 0.85, metalness: 0.0,
    emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.12,
  });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const placements = [];
  const grid = CITY.grid;
  // Blocks are the cells between neighbouring road lines; skip landmark cells.
  const landmarkCells = new Set(Object.values(LANDMARKS).map((l) => `${l.x},${l.z}`));
  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < grid.length - 1; j++) {
      const cx = (grid[i] + grid[i + 1]) / 2;
      const cz = (grid[j] + grid[j + 1]) / 2;
      if (landmarkCells.has(`${cx},${cz}`)) continue;
      // Round 4: the wash band and the two reserved blocks stay clear.
      // The wash (z 79..101) is the arroyo corridor — no building stands in
      // a riverbed. The hotel block (30,-30) and the shop block (-30,-90)
      // are built by hand below, so the generic scatter leaves them alone.
      if (cz > CITY.washZ - CITY.washHalf - 14 && cz < CITY.washZ + CITY.washHalf + 14) continue;
      if (cx === 30 && cz === -30) continue;
      if (cx === -30 && cz === -90) continue;
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = 12 + rng() * 16;
        const d = 12 + rng() * 16;
        // Height variety (round 4): most buildings stay 7–16 m, a fifth rise
        // to 16–24 m, and one in ten is a 24–32 m tower — the old flat
        // 7–21 m range is what made the skyline read as one brown slab.
        const hr = rng();
        const h = hr < 0.7 ? 7 + rng() * 9 : hr < 0.9 ? 16 + rng() * 8 : 24 + rng() * 8;
        const x = cx + (rng() - 0.5) * (CITY.block - w - 4);
        const z = cz + (rng() - 0.5) * (CITY.block - d - 4);
        placements.push({ x, z, w, d, h });
        colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
      }
    }
  }
  const inst = new THREE.InstancedMesh(boxGeo, wallMat, placements.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.set(p.w, p.h, p.d);
    dummy.rotation.y = 0;
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    col.setHex(PALETTE.adobe[Math.floor(rng() * PALETTE.adobe.length)]);
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.name = 'buildings';
  group.add(inst);

  // Roof trims: thin coloured slabs on top of each building (parapet accent).
  const trimMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
  const trim = new THREE.InstancedMesh(boxGeo, trimMat, placements.length);
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.h, p.z);
    dummy.scale.set(p.w + 0.6, 0.7, p.d + 0.6);
    dummy.rotation.y = 0;
    dummy.updateMatrix();
    trim.setMatrixAt(i, dummy.matrix);
    col.setHex(PALETTE.adobeTrim[Math.floor(rng() * PALETTE.adobeTrim.length)]);
    trim.setColorAt(i, col);
  });
  trim.instanceMatrix.needsUpdate = true;
  if (trim.instanceColor) trim.instanceColor.needsUpdate = true;
  trim.castShadow = true;
  group.add(trim);

  // ---- Landmark hero buildings (individual meshes, own materials).
  const hero = (mat) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, ...mat });
    return m;
  };
  // Landmark walls carry the same window grid as the generic buildings, so
  // no hero facade is a flat coloured slab (the round-3 complaint was the
  // motel's windowless brown south face). The texture goes on the four
  // sides only — the roof stays plain — and the window base tints per
  // building. `winBase` null keeps the old flat material.
  function blockBuilding(cx, cz, w, d, h, mat, label, winBase) {
    let material = hero(mat);
    if (winBase) {
      const tex = windowTexture(winBase);
      const side = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.85, metalness: 0.0,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12,
      });
      material = [side, side, material, material, side, side];
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = label;
    group.add(mesh);
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    return mesh;
  }

  // Rusty Spur Motel: two wings + neon sign on a pole.
  blockBuilding(-60, -60, 34, 12, 8, { color: 0xb97a4e }, 'motel-main', '#b97a4e');
  blockBuilding(-60, -44, 12, 12, 8, { color: 0xa86f45 }, 'motel-wing', '#a86f45');
  const motelSign = makeSign('RUSTY SPUR', '#ff5da2', '#241a20', 14, 3.5);
  // Angled 45° to face south-east, toward the corner where the x=-60 road
  // meets the z=-60 road — a real motel sign on a corner reads from both
  // approaches. (Face-on south, it was edge-on and invisible from the
  // east, which is the one clear sightline to the hero car parked beside
  // the motel; the wing blocks every southern view of the car below 30m.)
  // Moved 6m west (round 3): from the title dolly the sign's right end
  // sat behind the "F" of the "First Job — COMPLETE" heading in shot 4
  // (~90% readable); the shift puts the whole sign clear of the centred
  // overlay text in both the title and complete framings.
  motelSign.rotation.y = Math.PI / 4;
  motelSign.position.set(-66, 12, -52);
  group.add(motelSign);
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 8), hero({ color: 0x3a3a40, metalness: 0.6, roughness: 0.4 }));
  signPole.position.set(-66, 4.5, -52);
  signPole.castShadow = true;
  group.add(signPole);
  // VACANCY neon on the motel's south face — the flat brown wall the
  // round-3 review called out now reads as a motel at a glance.
  const vacancySign = makeSign('VACANCY', '#7dff5e', '#1c2b12', 6, 1.5);
  vacancySign.position.set(-48, 4.5, -53.9);
  group.add(vacancySign);

  // Dusthaven Diner: low wide building + teal sign.
  blockBuilding(-60, 60, 26, 16, 6, { color: 0x2e7f7a }, 'diner', '#2e7f7a');
  const dinerSign = makeSign('DINER', '#3ae0ff', '#12262a', 10, 2.5);
  dinerSign.position.set(-60, 7.5, 52);
  group.add(dinerSign);

  // Gas & Go: canopy on pillars + pumps.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 14), hero({ color: 0xe8e2d2, roughness: 0.5 }));
  canopy.position.set(60, 6, -60);
  canopy.castShadow = true;
  group.add(canopy);
  for (const [px, pz] of [[52, -64], [68, -64], [52, -56], [68, -56]]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 8), hero({ color: 0xc94f3d, metalness: 0.3, roughness: 0.5 }));
    pillar.position.set(px, 3, pz);
    pillar.castShadow = true;
    group.add(pillar);
  }
  for (const [px, pz] of [[56, -60], [64, -60]]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.8), hero({ color: 0xc94f3d, roughness: 0.4, metalness: 0.4 }));
    pump.position.set(px, 1, pz);
    pump.castShadow = true;
    group.add(pump);
    colliders.push({ x0: px - 0.7, z0: pz - 0.5, x1: px + 0.7, z1: pz + 0.5 });
  }
  colliders.push({ x0: 50, z0: -67, x1: 70, z1: -53 });
  const gasSign = makeSign('GAS', '#ffc53d', '#241d10', 8, 2);
  gasSign.position.set(60, 8, -52);
  group.add(gasSign);

  // Rook's Garage: big shed with a wide door.
  blockBuilding(60, 60, 30, 18, 9, { color: 0x4a6b8a }, 'garage', '#4a6b8a');
  const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), hero({ color: 0x2b2b2e, roughness: 0.6, metalness: 0.5 }));
  door.position.set(60, 3, 50.8);
  group.add(door);

  // Desert Chapel: small church + tower + cross.
  blockBuilding(-120, -120, 14, 20, 8, { color: 0xe8e2d2 }, 'chapel');
  const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 16, 5), hero({ color: 0xe8e2d2 }));
  tower.position.set(-120, 8, -132);
  tower.castShadow = true;
  group.add(tower);
  const crossMat = hero({ color: 0x8a5f43, roughness: 0.9 });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), crossMat);
  crossV.position.set(-120, 17.5, -132);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.5), crossMat);
  crossH.position.set(-120, 17, -132);
  group.add(crossV, crossH);
  colliders.push({ x0: -122.5, z0: -134.5, x1: -117.5, z1: -129.5 });

  // Sheriff's Office.
  blockBuilding(120, -120, 20, 14, 7, { color: 0x8a8a7a }, 'sheriff', '#8a8a7a');
  const sheriffSign = makeSign("SHERIFF", '#e8e2d2', '#2b2b2e', 9, 2.2);
  sheriffSign.position.set(120, 8.5, -112.5);
  group.add(sheriffSign);

  // Palms Hotel (round 4): the town's one tall building — 26 m, eight
  // storeys of lit windows, a rooftop sign. It anchors the Drive-In Row
  // skyline and gives the chase shots a vertical element the old flat town
  // never had. Its block (30,-30) is reserved from the generic scatter.
  blockBuilding(30, -30, 24, 20, 26, { color: 0xd9a06a }, 'palms-hotel', '#d9a06a');
  const hotelSign = makeSign('PALMS HOTEL', '#ffd23d', '#3a2410', 16, 3);
  hotelSign.position.set(30, 24, -19.8);
  group.add(hotelSign);

  // Shop row (round 4): four lit storefronts on the north side of Motel
  // Row, facing the road. Each unit has an awning, a glowing sign and a
  // door; the row sits 3 m behind the sidewalk, so pedestrians stroll past
  // lit windows instead of blank walls. Its block (-30,-90) is reserved
  // from the generic scatter.
  for (const shop of SHOPS) {
    const sx = shop.x, sz = SHOP_ROW_Z;
    const shopTex = windowTexture('#c98d5f');
    const shopMat = new THREE.MeshStandardMaterial({
      map: shopTex, roughness: 0.85, metalness: 0.0,
      emissive: 0xffffff, emissiveMap: shopTex, emissiveIntensity: 0.2,
    });
    const unit = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 6), shopMat);
    unit.position.set(sx, 2.5, sz);
    unit.castShadow = true;
    unit.receiveShadow = true;
    unit.name = `shop:${shop.name}`;
    group.add(unit);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.25, 2.2),
      hero({ color: 0xc94f3d, roughness: 0.7 }));
    awning.position.set(sx, 3.4, sz + 3.8);
    awning.rotation.x = 0.35;
    awning.castShadow = true;
    group.add(awning);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3),
      hero({ color: 0x2b2b2e, roughness: 0.6, metalness: 0.5 }));
    door.position.set(sx - 3, 1.5, sz + 3.05);
    group.add(door);
    const sSign = makeSign(shop.name, shop.fg, shop.bg, 8, 2);
    sSign.position.set(sx, 4.6, sz + 3.05);
    group.add(sSign);
    colliders.push({ x0: sx - 5, z0: sz - 3, x1: sx + 5, z1: sz + 3 });
  }

  // Wash Bridge (round 4): the one bridge in town, carrying Main Street
  // (x=0) over the dry wash at z=90. The deck is flat at road level so cars
  // drive it on the same physics as the road — the bridge reads through its
  // rust-red trusses, parapets and signs, and the wash below is painted
  // into the ground texture (see world.js). Pedestrians cross on the
  // walkway strips inside the parapets.
  const bZ = CITY.washZ, bX = CITY.bridgeX, bH = CITY.bridgeHalf;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(bH * 2, 0.1, CITY.washHalf * 2 + 4),
    new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9, metalness: 0.0 }),
  );
  deck.position.set(bX, -0.03, bZ);
  deck.receiveShadow = true;
  deck.name = 'wash-bridge-deck';
  group.add(deck);
  // Centre line, so the road reads as continuing over the bridge.
  const deckLine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, CITY.washHalf * 2 + 4),
    hero({ color: 0xb8a44a, roughness: 0.8 }));
  deckLine.position.set(bX, 0.03, bZ);
  group.add(deckLine);
  const trussMat = hero({ color: 0x8a3d2b, metalness: 0.5, roughness: 0.5 });
  const parapetMat = hero({ color: 0x9a8a76, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const tx = bX + s * (bH - 0.4);
    const topChord = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, CITY.washHalf * 2 + 4), trussMat);
    topChord.position.set(tx, 2.6, bZ);
    topChord.castShadow = true;
    group.add(topChord);
    const botChord = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, CITY.washHalf * 2 + 4), trussMat);
    botChord.position.set(tx, 0.5, bZ);
    group.add(botChord);
    for (let k = 0; k < 5; k++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), trussMat);
      post.position.set(tx, 1.55, bZ - CITY.washHalf - 2 + k * ((CITY.washHalf * 2 + 4) / 4));
      post.castShadow = true;
      group.add(post);
    }
    // Low concrete parapet the cars brush against; it is also the collider.
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, CITY.washHalf * 2 + 4), parapetMat);
    parapet.position.set(bX + s * (bH - 0.2), 0.45, bZ);
    parapet.castShadow = true;
    group.add(parapet);
    colliders.push({
      x0: bX + s * (bH - 0.2) - 0.2, z0: bZ - CITY.washHalf - 2,
      x1: bX + s * (bH - 0.2) + 0.2, z1: bZ + CITY.washHalf + 2,
    });
  }
  const bridgeSignS = makeSign('WASH BRIDGE', '#ffd23d', '#3a2410', 7, 1.6);
  bridgeSignS.rotation.y = Math.PI; // faces south, at drivers heading north
  bridgeSignS.position.set(bX, 3.4, bZ - CITY.washHalf - 2.5);
  group.add(bridgeSignS);
  const bridgeSignN = makeSign('WASH BRIDGE', '#ffd23d', '#3a2410', 7, 1.6);
  bridgeSignN.position.set(bX, 3.4, bZ + CITY.washHalf + 2.5);
  group.add(bridgeSignN);
  // Sign posts: the boards stand on the roadside, they do not float.
  const postMat = hero({ color: 0x3a3a40, metalness: 0.6, roughness: 0.4 });
  for (const [px, pz] of [[-3, bZ - CITY.washHalf - 2.5], [3, bZ - CITY.washHalf - 2.5], [-3, bZ + CITY.washHalf + 2.5], [3, bZ + CITY.washHalf + 2.5]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), postMat);
    post.position.set(px, 1.3, pz);
    post.castShadow = true;
    group.add(post);
  }

  // Water tower: four legs + a tank.
  const legMat = hero({ color: 0x6b4a2f, metalness: 0.5, roughness: 0.5 });
  for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 16, 6), legMat);
    leg.position.set(lx, 8, 180 + lz);
    leg.castShadow = true;
    group.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 8, 16), hero({ color: 0xc94f3d, roughness: 0.6, metalness: 0.2 }));
  tank.position.set(0, 20, 180);
  tank.castShadow = true;
  group.add(tank);
  colliders.push({ x0: -4, z0: 176, x1: 4, z1: 184 });

  // Drive-In: giant screen facing the road.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(24, 13), new THREE.MeshStandardMaterial({
    color: 0xd8e4ea, roughness: 0.35, metalness: 0.1,
    emissive: 0x8899aa, emissiveIntensity: 0.25,
  }));
  screen.position.set(180, 9, 132);
  screen.rotation.y = Math.PI;
  group.add(screen);
  const screenBase = new THREE.Mesh(new THREE.BoxGeometry(26, 2, 2), hero({ color: 0x3a3a40 }));
  screenBase.position.set(180, 1, 133);
  group.add(screenBase);
  colliders.push({ x0: 167, z0: 130, x1: 193, z1: 134 });

  // ---- Props: cacti, rocks, palms, telephone poles along the roads.
  const cactusMat = hero({ color: 0x4a7a3d, roughness: 0.9 });
  const cactusGeo = new THREE.CylinderGeometry(0.5, 0.6, 3, 8);
  const cactusArm = new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8);
  const cacti = new THREE.InstancedMesh(cactusGeo, cactusMat, 26);
  const cactusArms = new THREE.InstancedMesh(cactusArm, cactusMat, 26);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 250 + rng() * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.8 + rng() * 1.2;
    dummy.position.set(x, 1.5 * s, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.y = rng() * Math.PI;
    dummy.updateMatrix();
    cacti.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x + 0.7 * s, 1.8 * s, z);
    dummy.rotation.z = Math.PI / 2.5;
    dummy.updateMatrix();
    cactusArms.setMatrixAt(i, dummy.matrix);
  }
  cacti.instanceMatrix.needsUpdate = true;
  cactusArms.instanceMatrix.needsUpdate = true;
  cacti.castShadow = true;
  group.add(cacti, cactusArms);

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = hero({ color: 0x9a7a55, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 40);
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 255 + rng() * 150;
    const s = 1 + rng() * 3;
    dummy.position.set(Math.cos(a) * r, s * 0.4, Math.sin(a) * r);
    dummy.scale.set(s, s * 0.7, s);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  group.add(rocks);

  // Telephone poles along the main avenue (x = 0). No pole at z = 90: the
  // Wash Bridge stands there, and a pole on the deck would read as a mistake.
  const poleMat = hero({ color: 0x5a4028, roughness: 1 });
  for (let z = -180; z <= 180; z += 30) {
    if (z === CITY.washZ) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 9, 6), poleMat);
    pole.position.set(5.5, 4.5, z);
    pole.castShadow = true;
    group.add(pole);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3.4), poleMat);
    cross.position.set(5.5, 8.2, z);
    group.add(cross);
  }

  scene.add(group);
  return { group, colliders };
}

// Circle vs AABB resolution: push a circle (x, z, radius) out of every
// collider it overlaps. Returns true if any push happened.
export function collideCircle(colliders, p, radius) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1));
    const cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * radius;
        p.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = p.x - b.x0, pr = b.x1 - p.x, pt = p.z - b.z0, pb = b.z1 - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = b.x0 - radius;
        else if (m === pr) p.x = b.x1 + radius;
        else if (m === pt) p.z = b.z0 - radius;
        else p.z = b.z1 + radius;
      }
    }
  }
  // Invisible walls at the playable edge.
  const lim = CITY.half - 2;
  if (p.x < -lim) { p.x = -lim; hit = true; }
  if (p.x > lim) { p.x = lim; hit = true; }
  if (p.z < -lim) { p.z = -lim; hit = true; }
  if (p.z > lim) { p.z = lim; hit = true; }
  return hit;
}

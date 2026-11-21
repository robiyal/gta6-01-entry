// Dusthaven world: renderer, sky, sun, fog, dust, ground and the desert ring.
// PBR approach: one warm key sun + hemisphere fill + a faint cool bounce;
// ACES tone mapping; PCFSoft shadows that follow the player.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function makeGroundTexture() {
  // One 2048 canvas paints the whole playable city: sand, sidewalks, asphalt
  // roads with dashed centre lines, crosswalks and dirt patches. The texture
  // is the albedo map; roughness stays high and flat (sand + asphalt).
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const m = S / CITY.groundSize; // px per metre
  const toPx = (v) => (v + CITY.groundSize / 2) * m;

  // Sand base with speckle variation (roughness variation in the albedo).
  g.fillStyle = '#d9a866';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(185,138,78,0.25)' : 'rgba(240,200,140,0.22)';
    g.fillRect(x, y, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  // Dirt patches outside the road grid.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 70;
    g.fillStyle = 'rgba(150,105,55,0.18)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Sidewalks: lighter strips along every road.
  g.fillStyle = '#cbb28a';
  for (const line of CITY.grid) {
    const w = (CITY.roadHalf + 2.2) * 2 * m;
    g.fillRect(toPx(line) - w / 2, toPx(-CITY.half), w, CITY.half * 2 * m);
    g.fillRect(toPx(-CITY.half), toPx(line) - w / 2, CITY.half * 2 * m, w);
  }
  // Asphalt roads.
  g.fillStyle = '#3a3a40';
  for (const line of CITY.grid) {
    const w = CITY.roadHalf * 2 * m;
    g.fillRect(toPx(line) - w / 2, toPx(-CITY.half), w, CITY.half * 2 * m);
    g.fillRect(toPx(-CITY.half), toPx(line) - w / 2, CITY.half * 2 * m, w);
  }
  // Dashed centre lines (small and muted: they must read as paint, not glow).
  g.fillStyle = '#b8a44a';
  for (const line of CITY.grid) {
    for (let v = -CITY.half; v < CITY.half; v += 12) {
      g.fillRect(toPx(line) - 0.5, toPx(v), 1, 3.5 * m);
      g.fillRect(toPx(v), toPx(line) - 0.5, 3.5 * m, 1);
    }
  }
  // The dry wash (round 4): a sandy arroyo band across town at z = 90.
  // Painted after the asphalt so it cuts the north-south roads as fords —
  // only the bridge (a 3D deck in city.js) carries Main Street over it.
  // Darker sand, rocky banks, speckled bed.
  const washY0 = toPx(CITY.washZ - CITY.washHalf);
  const washY1 = toPx(CITY.washZ + CITY.washHalf);
  g.fillStyle = '#a87f4e';
  g.fillRect(0, washY0, S, washY1 - washY0);
  g.fillStyle = 'rgba(120,85,45,0.5)';
  g.fillRect(0, washY0, S, 3 * m);
  g.fillRect(0, washY1 - 3 * m, S, 3 * m);
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * S;
    const y = washY0 + Math.random() * (washY1 - washY0);
    g.fillStyle = Math.random() < 0.5 ? 'rgba(90,65,35,0.4)' : 'rgba(210,170,110,0.35)';
    g.fillRect(x, y, 2 + Math.random() * 6, 2 + Math.random() * 4);
  }
  // Dry bushes caught in the wash bed: dark olive dots, a few per stretch.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S;
    const y = washY0 + 2 * m + Math.random() * (washY1 - washY0 - 4 * m);
    const r = 2 + Math.random() * 4;
    g.fillStyle = 'rgba(90,95,50,0.55)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Crosswalks at the central intersections.
  g.fillStyle = 'rgba(230,230,220,0.85)';
  for (const a of [-60, 0, 60]) for (const b of [-60, 0, 60]) {
    for (let k = -3; k <= 3; k++) {
      g.fillRect(toPx(a + k * 1.6) - 2, toPx(b) - 4 * m, 4, 8 * m);
      g.fillRect(toPx(a) - 4 * m, toPx(b + k * 1.6) - 2, 8 * m, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeSkyMaterial() {
  // Gradient dome shader: dusty blue zenith -> warm orange horizon, with a
  // soft sun glow around the sun direction. No texture, no network.
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyZenith) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      sunDir: { value: new THREE.Vector3(-0.55, 0.28, -0.45).normalize() },
      sunColor: { value: new THREE.Color(0xffe6b0) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // pin to the far plane
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 350.0) * 1.2 + pow(s, 24.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function createWorld() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 120, 700);

  // Sky dome.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), makeSkyMaterial());
  sky.name = 'sky';
  scene.add(sky);

  // Golden-hour key sun (casts the only shadows) + hemisphere fill + faint
  // cool bounce from the opposite side so shadow faces are never pure black.
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(-140, 90, -110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.near = 10; sc.far = 500;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, PALETTE.hemiIntensity);
  scene.add(hemi);
  const bounce = new THREE.DirectionalLight(0x9fb8d8, 0.6);
  bounce.position.set(120, 60, 140);
  scene.add(bounce);

  // Ground: one big plane, albedo canvas texture, rough sand/asphalt.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.groundSize, CITY.groundSize),
    new THREE.MeshStandardMaterial({
      map: makeGroundTexture(), roughness: 0.93, metalness: 0.0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // Dune ring: low instanced domes outside the road grid, sand PBR.
  const duneGeo = new THREE.SphereGeometry(1, 12, 8);
  duneGeo.scale(1, 0.22, 1);
  const duneMat = new THREE.MeshStandardMaterial({ color: PALETTE.sandDark, roughness: 1.0, metalness: 0 });
  const dunes = new THREE.InstancedMesh(duneGeo, duneMat, 90);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.random() * 0.07;
    const r = 300 + Math.random() * 260;
    const s = 30 + Math.random() * 70;
    dummy.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
    dummy.scale.set(s, s * (0.5 + Math.random() * 0.5), s);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.updateMatrix();
    dunes.setMatrixAt(i, dummy.matrix);
    col.setHex(Math.random() < 0.5 ? PALETTE.sand : PALETTE.sandDark);
    dunes.setColorAt(i, col);
  }
  dunes.instanceMatrix.needsUpdate = true;
  if (dunes.instanceColor) dunes.instanceColor.needsUpdate = true;
  scene.add(dunes);

  // Mountain ridge: flat-topped mesas (truncated cones, 7 sides) on the
  // horizon — desert buttes, not pyramids.
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 1, metalness: 0, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = CITY.mountainRing + Math.random() * 80;
    const h = 70 + Math.random() * 110;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(28 + Math.random() * 40, 95 + Math.random() * 70, h, 7), mountainMat);
    m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
  }

  // Drifting dust: one Points cloud that wraps around the player.
  const dustCount = 700;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 320;
    dustPos[i * 3 + 1] = Math.random() * 24 + 0.5;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 320;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dot = document.createElement('canvas');
  dot.width = 64; dot.height = 64;
  const dg = dot.getContext('2d');
  const grad = dg.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,230,190,0.55)');
  grad.addColorStop(1, 'rgba(255,230,190,0)');
  dg.fillStyle = grad; dg.fillRect(0, 0, 64, 64);
  const dotTex = new THREE.CanvasTexture(dot);
  const dustMat = new THREE.PointsMaterial({
    size: 3.2, map: dotTex, transparent: true, opacity: 0.32,
    depthWrite: false, sizeAttenuation: true, color: 0xffdfae,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'dust';
  scene.add(dust);

  // Light shafts: three big additive cones leaning from the sun over the
  // motel block — cheap volumetric god rays for the golden hour.
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.05,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const shafts = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(14 + i * 6, 120, 16, 1, true), shaftMat);
    cone.position.set(-60 + i * 18, 55, -60 - i * 8);
    cone.rotation.z = 0.5;
    cone.rotation.x = -0.25;
    shafts.add(cone);
  }
  scene.add(shafts);

  const world = {
    renderer, scene, sun, hemi, bounce, dust, dustMat, shafts,
    storm: 0, // 0 calm -> 1 full dust storm
    update(dt, focus, time) {
      // Shadow frustum follows the player so shadows stay crisp.
      sun.position.set(focus.x - 140, 90, focus.z - 110);
      sun.target.position.set(focus.x, 0, focus.z);
      sun.target.updateMatrixWorld();
      // Dust drifts with the wind and wraps around the focus point.
      const pos = dustGeo.attributes.position;
      const wind = 2.5 + this.storm * 14;
      for (let i = 0; i < dustCount; i++) {
        let x = pos.getX(i) + (wind + Math.sin(time * 0.3 + i) * 0.8) * dt;
        let y = pos.getY(i) + Math.sin(time * 0.5 + i * 1.7) * 0.25 * dt;
        let z = pos.getZ(i) + Math.cos(time * 0.22 + i) * 0.6 * dt;
        if (x - focus.x > 160) x -= 320;
        if (x - focus.x < -160) x += 320;
        if (z - focus.z > 160) z -= 320;
        if (z - focus.z < -160) z += 320;
        if (y < 0.4) y = 0.4;
        if (y > 26) y = 26;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      dust.position.set(0, 0, 0);
      // Storm ramps fog in and thickens the dust.
      const targetFogNear = 120 - this.storm * 80;
      const targetFogFar = 700 - this.storm * 480;
      scene.fog.near += (targetFogNear - scene.fog.near) * Math.min(1, dt * 0.8);
      scene.fog.far += (targetFogFar - scene.fog.far) * Math.min(1, dt * 0.8);
      dustMat.opacity = 0.32 + this.storm * 0.4;
      dustMat.size = 3.2 + this.storm * 3.5;
    },
  };
  return world;
}

// Dusthaven cameras and minimap.
// Chase cam behind the car (with speed FOV kick), third-person orbit on foot
// (drag to look), and a slow title orbit around the hero car with three-point
// lighting. The minimap is a 2D canvas: roads, the player arrow, police,
// traffic and the mission beacon.
import * as THREE from 'three';
import { CITY, LANDMARKS } from './config.js';

export function createCameraRig(camera) {
  const rig = {
    mode: 'title', // title | chase | foot | top
    yaw: 0, pitch: 0.32,
    orbitAngle: 0,
    shake: 0,
    fov: 62,
    update(dt, focus, speed01, time) {
      if (rig.mode === 'title') {
        // Cinematic street-level dolly (round 3, iteration 3): the camera
        // rides the east corridor at 10m — just above the 8m roofs, so
        // the motel roof reads as a thin band instead of the slab the
        // 15m/21m cranes produced (a high camera looks DOWN at the roof
        // and its south facade, and the closer it is the bigger they
        // loom; iteration 1 proved it, iteration 2's road dolly proved
        // the car/sign are hidden behind the motel's SE corner from the
        // road at any height below ~35m). The view pitches gently down
        // toward the town (lookAt y -2, z -80): the RUSTY SPUR sign
        // lands upper-left, clear of the centred title/heading; the
        // hero car — staged at (-40,-52) in applyShotMode 'start'/'end',
        // 24m out in the open corridor — lands lower-left, ~125px and
        // clear of the buttons/controls; the town and mesas fill the
        // upper frame and the corridor floor the bottom. The corridor
        // east of the motel is verified clear (deterministic city: no
        // generic building overlaps z -58..-46, x -48..-8), so the car
        // spot and the whole dolly path are open air.
        const t = (time * 0.03) % 1;
        camera.position.set(-16 - t * 8, 10, -52);
        camera.lookAt(-50, -2, -80);
      } else if (rig.mode === 'action') {
        // Close, low chase camera for the frozen action shot: the lead
        // cruiser looms large ahead-right, the player car fills the bottom
        // centre. Set directly (no lerp) — the scene is frozen, so the
        // frame is exact from the first frame.
        const back = 9, up = 3.6;
        const tx = focus.x - Math.sin(focus.heading) * back;
        const tz = focus.z - Math.cos(focus.heading) * back;
        camera.position.set(tx, up, tz);
        camera.lookAt(focus.x + Math.sin(focus.heading) * 12, 1.4, focus.z + Math.cos(focus.heading) * 12);
      } else if (rig.mode === 'chase') {
        const back = 13 + speed01 * 5;
        const up = 5 + speed01 * 1.2;
        const tx = focus.x - Math.sin(focus.heading) * back;
        const tz = focus.z - Math.cos(focus.heading) * back;
        camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
        camera.position.y += (up - camera.position.y) * Math.min(1, dt * 5);
        camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
        camera.lookAt(focus.x + Math.sin(focus.heading) * 8, 1.6, focus.z + Math.cos(focus.heading) * 8);
      } else if (rig.mode === 'foot') {
        const back = 7.5;
        const up = 3.4;
        const cx = focus.x - Math.sin(rig.yaw) * Math.cos(rig.pitch) * back;
        const cz = focus.z - Math.cos(rig.yaw) * Math.cos(rig.pitch) * back;
        camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 8);
        camera.position.y += (up + Math.sin(rig.pitch) * back - camera.position.y) * Math.min(1, dt * 8);
        camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 8);
        camera.lookAt(focus.x, 1.6, focus.z);
      }
      // Speed kick + impact shake.
      const targetFov = 62 + speed01 * 10;
      rig.fov += (targetFov - rig.fov) * Math.min(1, dt * 4);
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
      if (rig.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * rig.shake;
        camera.position.y += (Math.random() - 0.5) * rig.shake;
        rig.shake *= Math.pow(0.001, dt);
      }
    },
    addShake(amount) { rig.shake = Math.min(0.9, rig.shake + amount); },
  };
  return rig;
}

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const scale = S / (CITY.half * 2 + 40);
  const toMap = (x, z) => [(x + CITY.half + 20) * scale, (z + CITY.half + 20) * scale];

  function draw(state) {
    // state: {player:{x,z,heading}, cars:[{x,z}], police:[{x,z}], peds:[{x,z}], target:{x,z}|null, north}
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#241a12';
    ctx.fillRect(0, 0, S, S);
    // Sand.
    ctx.fillStyle = '#c99a5e';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = Math.max(2, 8 * scale);
    ctx.lineCap = 'round';
    for (const line of CITY.grid) {
      const [x1, y1] = toMap(line, -CITY.half - 20);
      const [x2, y2] = toMap(line, CITY.half + 20);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-CITY.half - 20, line);
      const [x4, y4] = toMap(CITY.half + 20, line);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Landmarks.
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const lm of Object.values(LANDMARKS)) {
      const [x, y] = toMap(lm.x, lm.z);
      ctx.fillStyle = '#7a5a30';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Mission beacon.
    if (state.target) {
      const [x, y] = toMap(state.target.x, state.target.z);
      const pulse = 6 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffc53d';
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff2c8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Traffic (white) and peds (pale).
    ctx.fillStyle = '#f0ead8';
    for (const c of state.cars || []) {
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police (flashing red/blue).
    const phase = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3333' : '#3388ff';
    for (const p of state.police || []) {
      const [x, y] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (heading).
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1c1c22';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // North + border.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText('N', S - 10, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }
  return { draw };
}

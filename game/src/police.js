// Dusthaven law: the wanted system and police AI.
// Wanted 0-5 stars. Crimes raise it; police cruisers spawn at the Sheriff's
// Office and chase. A bust happens when a cruiser holds the player slow and
// close; escape decays the heat when no cruiser is near. On foot, deputies
// chase and punch. Sirens wail while any cruiser is in pursuit.
import * as THREE from 'three';
import { CITY, TUNING, nearestRoad } from './config.js';
import { makeCar, makeCarState, updateCar, syncCarMesh, pushCars } from './vehicles.js';
import { makeRoadblock } from './heli.js';

export function createPolice(scene, colliders, audio) {
  const cruisers = [];
  const deputies = [];
  let wanted = 0;
  let decayTimer = 0;
  let bustTimer = 0;
  let sirenOn = false;
  let nextUnit = 1; // callsign counter: DUST-1, DUST-2, ... never reused
  // The roadblock: barriers across the road ahead of the player at 4+ stars.
  const roadblock = { active: false, mesh: null, x: 0, z: 0, heading: 0 };

  // ---- Road-graph pursuit (round 3) ----
  // Cruisers steer ALONG ROADS toward the player (BFS over the 7x7 grid
  // of intersections) instead of beelining through buildings. Beelining
  // wedged the cruiser against a generic building at (106,-92) — measured
  // 0.1 m/s for 4.5 sim-s after the spawn fix, even though the spawn
  // itself was clear. Landmarks straddle intersections (the Sheriff's
  // Office sits on (120,-120), the Motel on (-60,-60)), so nodes and
  // edges touching a landmark collider are impassable and the route goes
  // around them. Generic buildings never block a road: their faces sit
  // >=6m from a road centreline, past the 2.8m clearance margin. A cruiser
  // that has arrived at its goal node does not rebuild a route to the same
  // node (see the settled check in update) — it drives the final stretch
  // directly at the player, or it would orbit the node whenever the player
  // stops more than 25m from it (the direct-aim threshold).
  const GRID = CITY.grid; // [-180,-120,-60,0,60,120,180], pitch 60
  const CLEAR = 2.8; // node/edge clearance past the 2.3m car radius
  function nodeBlocked(x, z) {
    for (const b of colliders) {
      if (x >= b.x0 - CLEAR && x <= b.x1 + CLEAR && z >= b.z0 - CLEAR && z <= b.z1 + CLEAR) return true;
    }
    return false;
  }
  function edgeBlocked(ax, az, bx, bz) {
    for (const b of colliders) {
      if (ax === bx) { // vertical segment, x = ax
        if (ax < b.x0 - CLEAR || ax > b.x1 + CLEAR) continue;
        const lo = Math.min(az, bz), hi = Math.max(az, bz);
        if (b.z1 + CLEAR >= lo && b.z0 - CLEAR <= hi) return true;
      } else { // horizontal segment, z = az
        if (az < b.z0 - CLEAR || az > b.z1 + CLEAR) continue;
        const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
        if (b.x1 + CLEAR >= lo && b.x0 - CLEAR <= hi) return true;
      }
    }
    return false;
  }
  // Nearest UNBLOCKED intersection (Manhattan) to a point.
  function nearestOpenNode(x, z) {
    let best = null, bestD = Infinity;
    for (const gx of GRID) for (const gz of GRID) {
      if (nodeBlocked(gx, gz)) continue;
      const d = Math.abs(gx - x) + Math.abs(gz - z);
      if (d < bestD) { bestD = d; best = [gx, gz]; }
    }
    return best;
  }
  // BFS over intersections; returns [node, node, ...] from start to goal,
  // or null when unreachable.
  function findRoute(sx, sz, tx, tz) {
    const key = (x, z) => `${x},${z}`;
    if (sx === tx && sz === tz) return [[tx, tz]];
    const prev = new Map([[key(sx, sz), null]]);
    const queue = [[sx, sz]];
    while (queue.length) {
      const [cx, cz] = queue.shift();
      for (const [dx, dz] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < -180 || nx > 180 || nz < -180 || nz > 180) continue;
        const k = key(nx, nz);
        if (prev.has(k) || nodeBlocked(nx, nz) || edgeBlocked(cx, cz, nx, nz)) continue;
        prev.set(k, [cx, cz]);
        if (nx === tx && nz === tz) {
          const path = [[nx, nz]];
          let cur = [cx, cz];
          while (cur) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
          return path;
        }
        queue.push([nx, nz]);
      }
    }
    return null;
  }

  function spawnCruiser() {
    // Spawn on the x=120 road 13m south of the Sheriff's Office, heading
    // into town (+z) — NOT at the office door. The old spot (office +
    // (10,8) = (130,-112)) sat INSIDE a generic building (x[128..151]
    // z[-113..-86]) and 1m from the office corner, so the cruiser ground
    // against both colliders and never moved (measured 3m in 5.8 sim-s).
    // (120,-100) is verified clear against the live collider set:
    // nearest collider 8.40m away (6.10m past the 2.3m radius), on road.
    const mesh = makeCar(0x1c1c22, { police: true, name: `police-${cruisers.length}` });
    scene.add(mesh);
    const state = makeCarState(120, -100, 0);
    cruisers.push({
      mesh, state, mode: 'chase', stuck: 0, route: null, routeIdx: 0,
      replanAt: 0, reverseUntil: 0, goalNode: null,
      callsign: `DUST-${nextUnit++}`,
    });
  }

  // Place the roadblock barriers across the road at (x, z), facing the
  // player's heading. The barriers' long axis is X; a road running
  // north-south needs them unrotated, an east-west road needs a quarter turn.
  function placeRoadblock(x, z, heading) {
    clearRoadblock();
    const mesh = makeRoadblock();
    const fx = Math.sin(heading), fz = Math.cos(heading);
    mesh.rotation.y = Math.abs(fx) > Math.abs(fz) ? Math.PI / 2 : 0;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    roadblock.active = true;
    roadblock.mesh = mesh;
    roadblock.x = x;
    roadblock.z = z;
    roadblock.heading = heading;
  }

  function clearRoadblock() {
    if (roadblock.mesh) scene.remove(roadblock.mesh);
    roadblock.active = false;
    roadblock.mesh = null;
  }

  // Sheriff uniform (revision, round 4): a deputy must read as LAW at a
  // glance, not as another pedestrian — pedestrians wear varied coloured
  // shirts and brown hats, so the deputy gets a tan sheriff's shirt, dark
  // trousers and belt, a cream campaign hat with a dark band, and a gold
  // star badge on the chest. Slightly taller than a ped.
  function starShape(points, outer, inner) {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
    }
    s.closePath();
    return s;
  }

  function spawnDeputy(x, z) {
    const g = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d6a, roughness: 0.7 });
    for (const lx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8), darkMat);
      leg.position.set(lx, 0.35, 0);
      leg.castShadow = true;
      g.add(leg);
    }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 8), shirtMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    g.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.09, 10), darkMat);
    belt.position.y = 0.82;
    g.add(belt);
    const star = new THREE.Mesh(
      new THREE.ShapeGeometry(starShape(5, 0.13, 0.055)),
      new THREE.MeshBasicMaterial({ color: 0xffc53d }),
    );
    star.position.set(-0.12, 1.38, 0.35);
    g.add(star);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skinMat);
    head.position.y = 1.95;
    head.castShadow = true;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.8 }));
    hat.position.y = 2.16;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 10), darkMat);
    band.position.y = 2.11;
    g.add(head, hat, band);
    g.scale.setScalar(1.06);
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
    // Roadblock at 4+ stars: barriers across the road 70 m ahead of the
    // player, and the farthest cruiser is sent to hold the post. It clears
    // when the heat drops — the town does not blockade itself for a 1-star
    // joyride.
    if (wanted >= 4 && !roadblock.active && cruisers.length > 0) {
      const h = player.heading || 0;
      const fx = Math.sin(h), fz = Math.cos(h);
      let px = player.pos.x + fx * 70, pz = player.pos.z + fz * 70;
      // Snap onto the road the player is travelling.
      if (Math.abs(fx) > Math.abs(fz)) pz = nearestRoad(pz);
      else px = nearestRoad(px);
      px = Math.max(-170, Math.min(170, px));
      pz = Math.max(-170, Math.min(170, pz));
      placeRoadblock(px, pz, h);
      let far = null, farD = -1;
      for (const c of cruisers) {
        const d = Math.hypot(c.state.pos.x - px, c.state.pos.z - pz);
        if (d > farD) { farD = d; far = c; }
      }
      if (far) { far.mode = 'roadblock'; far.route = null; }
    }
    if (wanted < 4 && roadblock.active) {
      clearRoadblock();
      for (const c of cruisers) c.mode = 'chase';
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
      // A roadblock cruiser drives to its post, not to the player — the
      // BFS route, the aim and the arrival all use the post as the goal.
      const goalPos = (c.mode === 'roadblock' && roadblock.active)
        ? { x: roadblock.x, z: roadblock.z } : player.pos;
      const dx = goalPos.x - c.state.pos.x;
      const dz = goalPos.z - c.state.pos.z;
      const dist = Math.hypot(dx, dz);
      // nearestDist tracks the PLAYER for the bust and escape rules, not
      // the post — a cruiser sitting at its post is not "on" the player.
      const distPlayer = Math.hypot(player.pos.x - c.state.pos.x, player.pos.z - c.state.pos.z);
      nearestDist = Math.min(nearestDist, distPlayer);
      // Aim: the goal directly when close (final ram/bust) or when no
      // route exists; otherwise the next node of the BFS road route.
      let aimX = goalPos.x, aimZ = goalPos.z, direct = true;
      if (dist >= 25) {
        if (!c.route || time >= c.replanAt) {
          c.replanAt = time + 1;
          const goal = nearestOpenNode(goalPos.x, goalPos.z);
          const goalChanged = !c.goalNode || !goal || goal[0] !== c.goalNode[0] || goal[1] !== c.goalNode[1];
          // Round 4 — settled at the goal node: once the cruiser has ARRIVED
          // at the goal node, do NOT rebuild a route to the same node. A
          // rebuilt route from the node to itself is a single node the
          // cruiser already sits on, so it aims back at its own position
          // and orbits the node forever — the player at (-60,-74) is 44m
          // from its nearest open node (-60,-120) while the direct-aim
          // threshold is 25m, so without this the cruiser never closes the
          // last stretch (measured: it orbited (-60,-112) at 28-42m for a
          // full minute). With no route, the aim stays direct at the player
          // and the cruiser drives the final stretch up the road. The goal
          // node only changes when the player moves to another node's area,
          // and then the route rebuilds as before.
          const atGoalNode = goal && Math.hypot(c.state.pos.x - goal[0], c.state.pos.z - goal[1]) < 12;
          const settled = c.goalNode && goal && !goalChanged && atGoalNode;
          if ((!c.route || goalChanged) && !settled) {
            c.goalNode = goal;
            // Route FROM the node the cruiser is already heading to — NOT
            // from the nearest node. Replanning every second from the
            // nearest node reset the route to (120,0) while the cruiser
            // was already 20m west of it, so it U-turned back every
            // second and oscillated around the intersection for 30 sim-s
            // (measured: stuck between (94,9) and (120,0), never past).
            const from = (c.route && c.routeIdx < c.route.length)
              ? c.route[c.routeIdx]
              : nearestOpenNode(c.state.pos.x, c.state.pos.z);
            c.route = (from && goal) ? findRoute(from[0], from[1], goal[0], goal[1]) : null;
            c.routeIdx = 0;
          }
        }
        if (c.route) {
          while (c.routeIdx < c.route.length) {
            const [nx, nz] = c.route[c.routeIdx];
            if (Math.hypot(nx - c.state.pos.x, nz - c.state.pos.z) < 8) c.routeIdx++;
            else break;
          }
          if (c.routeIdx < c.route.length) {
            [aimX, aimZ] = c.route[c.routeIdx];
            direct = false;
          } else {
            c.route = null; // route done — rebuild if the player moves on
          }
        }
      }
      // Pursuit steering: aim at the target, with a little weave on the
      // direct chase so it reads as a chase, not a magnet. No weave on
      // route legs — a +/-0.08 rad wobble over 60m would push the car off
      // the 8m road into roadside buildings.
      const weave = direct ? Math.sin(time * 0.7 + c.state.pos.x) * 0.08 : 0;
      const wantHeading = Math.atan2(aimX - c.state.pos.x, aimZ - c.state.pos.z) + weave;
      let dh = wantHeading - c.state.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.4));
      const targetSpeed = Math.min(38, Math.max(18, Math.abs(player.speed || 0) + 9));
      // Minimum pursuit speed 18 m/s (was playerSpeed+9, i.e. 9 for a
      // parked player — a 400m office detour then took ~50s, longer than
      // the wanted decay, so the star cleared before the police arrived).
      // A fleeing player still sets the pace (playerSpeed+9 above 18).
      // Slow down for turns: the turn rate scales down with speed, so at
      // 17+ m/s the car cannot make a 90-degree intersection turn — it
      // overshoots 10-40m into the blocks (measured: the cruiser blew
      // past (120,0) to (134,-19.8) and past (0,0) to (-34,-12), grinding
      // on a generic building each time). Cap speed by heading error, the
      // same way the clip pilot drives the player car — and BRAKE to reach
      // the cap: cutting throttle to 0.2 only coasts (drag ~2.5 m/s^2 vs
      // 2.8 accel), so the car never slowed for the turn.
      const turnCap = Math.abs(dh) > 0.4 ? 6 : Math.abs(dh) > 0.15 ? 12 : 38;
      let target = Math.min(targetSpeed, turnCap);
      // Final approach: ease onto the goal instead of blowing past at
      // 18 m/s — a bust needs the cruiser to SIT within 5m for 2s. Gentle
      // (2 m/s at contact) so the ram push stays well under bustSpeed 2.5.
      if (direct) target = Math.min(target, Math.max(2, dist * 0.4));
      // A roadblock cruiser parks at its post: within 8 m of it, hold still
      // instead of easing around the point.
      if (c.mode === 'roadblock' && dist < 8) target = 0;
      let throttle = c.state.speed < target ? 1 : 0;
      let brake = c.state.speed > target + 2;
      // Stuck: grinding a wall while trying to move — reverse off it for
      // 0.8s, then replan from the new spot.
      if (throttle === 1 && Math.abs(c.state.speed) < 1) c.stuck += dt;
      else c.stuck = 0;
      if (c.stuck > 1.5) {
        c.stuck = 0;
        c.reverseUntil = time + 0.8;
        c.route = null;
        c.replanAt = time + 0.8;
      }
      if (time < c.reverseUntil) { throttle = -1; brake = false; }
      updateCar(c.state, { throttle, steer: time < c.reverseUntil ? 0 : steer, brake }, dt, colliders);
      // Ram: shove the player's car on contact (distance to the PLAYER,
      // not to a roadblock post — a cruiser at its post must not shove a
      // car 60 m away).
      if (player.carState && distPlayer < c.state.radius + player.carState.radius) {
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

  function getDispatch(playerPos) {
    // One row per cruiser on the road: callsign, live role, live distance.
    // The role reads off what the cruiser is actually doing, not a label:
    // ROADBLOCK at its post, RAMMING on the player's bumper, PURSUIT while
    // closing, SEARCHING when it has lost the player.
    const rows = [];
    for (const c of cruisers) {
      const d = Math.hypot(c.state.pos.x - playerPos.x, c.state.pos.z - playerPos.z);
      let role = 'SEARCHING';
      if (c.mode === 'roadblock') role = 'ROADBLOCK';
      else if (d < 15) role = 'RAMMING';
      else if (d < 45) role = 'PURSUIT';
      rows.push({ callsign: c.callsign, role, dist: Math.round(d) });
    }
    return rows;
  }

  function getWanted() { return wanted; }
  function setWanted(n) { wanted = Math.max(0, Math.min(5, n)); decayTimer = 0; }
  function clearAll() {
    for (const c of cruisers.splice(0)) scene.remove(c.mesh);
    for (const d of deputies.splice(0)) scene.remove(d.mesh);
    clearRoadblock();
    wanted = 0;
    if (sirenOn) { audio.siren(false); sirenOn = false; }
  }

  return {
    cruisers, deputies, update, addWanted, getWanted, setWanted, clearAll,
    getDispatch, placeRoadblock, clearRoadblock, roadblock,
  };
}

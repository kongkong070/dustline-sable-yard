// Bots: two teams of simple soldiers. Defenders hold a site or a lane, patrol
// between waypoints, and rotate when they hear gunfire or the bomb is planted.
// Attackers push a lane toward their site and engage anything they see. A bot
// only shoots what it can see: line of sight is raycast against the world, and
// its aim error shrinks the longer it has held its target — so peeking, moving
// and breaking sight lines all work against them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';
import { WEAPONS } from './weapons.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.55;
const SIGHT_RANGE = 38;
const HEAR_RANGE = 26;

const NAMES_DEF = ['Dune', 'Vulture', 'Jackal', 'Scorpion', 'Viper'];
const NAMES_ATK = ['Vex', 'Rook'];

function nodePos(id) {
  const n = WAYPOINTS[id];
  return new THREE.Vector3(n[1], 0, n[2]);
}

export function createBots(scene, world, hooks) {
  const colliders = world.colliders;
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;
  const tmpDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const probe = new THREE.Box3();

  const enemyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.7 });
  const friendMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sage), roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const bots = [];
  const hitMeshes = [];

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function makeBot(team, name, weaponId) {
    const group = new THREE.Group();
    const mat = team === 'def' ? enemyMat : friendMat;
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.02;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.56;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.28, 1.05, -0.2);
    group.add(torso, head, legL, legR, gun);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    scene.add(group);
    const bot = {
      team, name, group, torso, head, gun, legL, legR,
      weapon: WEAPONS[weaponId],
      position: new THREE.Vector3(),
      yaw: 0, health: 100, alive: true,
      speed: 3.3 + Math.random() * 0.7,
      state: 'hold', holdNode: 0, path: [], pathIndex: 0,
      target: null, // {kind:'player'|'bot', ref, pos}
      aimTime: 0, reaction: 0, cooldown: 0, burstLeft: 0, burstPause: 0,
      lastSeen: new THREE.Vector3(), seenAt: -99,
      investigate: null, defusing: 0, walkPhase: Math.random() * 6,
    };
    torso.userData.bot = bot; torso.userData.part = 'torso';
    head.userData.bot = bot; head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (const n of NAMES_DEF) makeBot('def', n, Math.random() < 0.6 ? 'rifle' : 'smg');
  for (const n of NAMES_ATK) makeBot('atk', n, 'rifle');

  function nearestNode(pos) {
    let best = 0; let bestD = Infinity;
    for (const n of WAYPOINTS) {
      const d = (n[1] - pos.x) ** 2 + (n[2] - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = n[0]; }
    }
    return best;
  }

  // Breadth-first route over the waypoint graph.
  function route(from, to) {
    if (from === to) return [to];
    const prev = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of WAYPOINTS[cur][3]) {
        if (!prev.has(nb)) {
          prev.set(nb, cur);
          if (nb === to) {
            const path = [to];
            let p = cur;
            while (p !== -1) { path.unshift(p); p = prev.get(p); }
            return path;
          }
          queue.push(nb);
        }
      }
    }
    return [to];
  }

  function setPath(bot, destNode) {
    bot.path = route(nearestNode(bot.position), destNode);
    bot.pathIndex = 0;
  }

  function canSee(from, to, eyeY) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist > SIGHT_RANGE) return false;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > dist - 0.4;
  }

  function eyePos(bot, out) {
    return out.set(bot.position.x, bot.position.y + EYE, bot.position.z);
  }

  function stepBot(bot, dt, time, player) {
    if (!bot.alive) return;
    const eye = eyePos(bot, tmpPos);
    // --- perception: the player, then the nearest living enemy bot ---
    let target = null;
    let targetPos = null;
    if (player.alive) {
      tmpDir.set(player.position.x, player.position.y + 1.4, player.position.z);
      const d = tmpDir.distanceTo(eye);
      if (d < SIGHT_RANGE && canSee(eye, tmpDir, 1.4)) { target = { kind: 'player', ref: player }; targetPos = tmpDir.clone(); }
    }
    if (!target) {
      let bestD = Infinity;
      for (const other of bots) {
        if (!other.alive || other.team === bot.team) continue;
        tmpDir.set(other.position.x, other.position.y + 1.3, other.position.z);
        const d = tmpDir.distanceTo(eye);
        if (d < bestD && d < SIGHT_RANGE && canSee(eye, tmpDir, 1.3)) {
          bestD = d; target = { kind: 'bot', ref: other }; targetPos = tmpDir.clone();
        }
      }
    }
    if (target) {
      bot.target = target;
      bot.lastSeen.copy(targetPos);
      bot.seenAt = time;
      bot.aimTime += dt;
      bot.state = 'engage';
    } else if (bot.state === 'engage' && time - bot.seenAt < 1.2) {
      bot.aimTime = Math.max(0, bot.aimTime - dt * 0.5);
    } else if (bot.state === 'engage') {
      bot.target = null;
      bot.aimTime = 0;
      bot.state = bot.team === 'def' ? 'hold' : 'patrol';
      if (bot.investigate) { setPath(bot, bot.investigate); bot.investigate = null; bot.state = 'patrol'; }
    }

    // --- defuse: while channelling, the bot stands still. The sim owns the
    // defuse timer; this module only holds the channel open.
    if (bot.defusing > 0) return;

    // --- shooting: bursts with a reaction delay and aim that steadies ---
    bot.cooldown -= dt;
    bot.burstPause -= dt;
    if (bot.target && targetPos) {
      const dist = eye.distanceTo(targetPos);
      bot.yaw = Math.atan2(-(targetPos.x - eye.x), -(targetPos.z - eye.z));
      if (bot.aimTime > bot.reaction && bot.cooldown <= 0 && bot.burstPause <= 0) {
        if (bot.burstLeft <= 0) { bot.burstLeft = 3 + Math.floor(Math.random() * 3); bot.burstPause = 0.5 + Math.random() * 0.7; }
        bot.burstLeft -= 1;
        bot.cooldown = bot.weapon.fireGap;
        const moving = bot.target.kind === 'player' ? Math.hypot(player.velocity.x, player.velocity.z) : 2;
        const err = (0.02 + dist * 0.0016 + moving * 0.006) / Math.max(1, bot.aimTime * 1.4);
        const hit = Math.random() > Math.min(0.85, err * 14);
        const head = hit && Math.random() < 0.12;
        const from = new THREE.Vector3(bot.position.x + 0.28, bot.position.y + 1.1, bot.position.z);
        const to = targetPos.clone();
        if (!hit) { to.x += (Math.random() - 0.5) * 2.4; to.y += (Math.random() - 0.5) * 1.6; to.z += (Math.random() - 0.5) * 2.4; }
        hooks.onBotShot(bot, from, to, hit);
        if (hit) {
          const dmg = bot.weapon.damage * (head ? bot.weapon.headMult : 1) * (0.85 + Math.random() * 0.3);
          if (bot.target.kind === 'player') hooks.damagePlayer(dmg, head, bot);
          else hooks.damageBot(bot.target.ref, dmg, head, bot);
        }
      }
    }

    // --- movement: follow the path, or hold and scan ---
    let moveTarget = null;
    if (bot.state === 'patrol' || bot.state === 'rotate') {
      if (bot.pathIndex < bot.path.length) moveTarget = nodePos(bot.path[bot.pathIndex]);
      else if (bot.team === 'def') { bot.state = 'hold'; }
      else { setPath(bot, bot.holdNode); }
    } else if (bot.state === 'engage' && bot.target) {
      // strafe sideways while engaging, keep ~10-18 m from the target
      const d = Math.hypot(bot.lastSeen.x - bot.position.x, bot.lastSeen.z - bot.position.z);
      if (d > 18) moveTarget = bot.lastSeen;
      else if (d < 7) moveTarget = new THREE.Vector3(bot.position.x * 2 - bot.lastSeen.x, 0, bot.position.z * 2 - bot.lastSeen.z);
    }
    if (moveTarget) {
      const dx = moveTarget.x - bot.position.x;
      const dz = moveTarget.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) { bot.pathIndex += 1; }
      else {
        const vx = (dx / dist) * bot.speed;
        const vz = (dz / dist) * bot.speed;
        if (!bot.target) bot.yaw = Math.atan2(-dx, -dz);
        const nx = bot.position.x + vx * dt;
        if (!overlaps(nx, bot.position.y, bot.position.z)) bot.position.x = nx;
        const nz = bot.position.z + vz * dt;
        if (!overlaps(bot.position.x, bot.position.y, nz)) bot.position.z = nz;
        bot.walkPhase += dt * 9;
      }
    } else if (bot.state === 'hold') {
      bot.yaw += Math.sin(time * 0.4 + bot.walkPhase) * dt * 0.25; // slow scan
    }
    bot.group.position.copy(bot.position);
    bot.group.rotation.y = bot.yaw;
    const swing = moveTarget ? Math.sin(bot.walkPhase) * 0.35 : 0;
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
  }

  return {
    bots,
    hitMeshes,
    spawnRound(attackSite) {
      const atkSpawns = [[-3, 17], [0, 19], [3, 17]];
      const defHolds = { A: [13, 17, 19], B: [14, 18, 19], mid: [15, 16, 19] };
      let ai = 0;
      for (const bot of bots) {
        bot.alive = true;
        bot.health = 100;
        bot.defusing = 0;
        bot.target = null;
        bot.aimTime = 0;
        bot.reaction = 0.35 + Math.random() * 0.35;
        bot.group.rotation.set(0, 0, 0);
        bot.group.visible = true;
        if (bot.team === 'atk') {
          const s = atkSpawns[ai % atkSpawns.length];
          bot.position.set(s[0], 0, s[1]);
          bot.yaw = Math.PI;
          bot.holdNode = attackSite === 'A' ? 13 : 14;
          setPath(bot, bot.holdNode);
          bot.state = 'patrol';
          ai += 1;
        } else {
          const holds = defHolds[bot.name === 'Dune' ? 'A' : bot.name === 'Viper' ? 'B' : 'mid'];
          bot.holdNode = holds[Math.floor(Math.random() * holds.length)];
          const p = nodePos(bot.holdNode);
          bot.position.set(p.x + (Math.random() - 0.5) * 2, 0, p.z + (Math.random() - 0.5) * 2);
          bot.yaw = 0;
          bot.state = 'hold';
        }
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
      }
    },
    step(dt, time, player) {
      for (const bot of bots) stepBot(bot, dt, time, player);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    damage(bot, amount, part) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.alive = false;
      bot.defusing = 0;
      bot.group.rotation.x = -Math.PI / 2 * 0.9;
      bot.group.position.y = 0.15;
      return true;
    },
    hearShot(x, z) {
      for (const bot of bots) {
        if (!bot.alive || bot.state === 'engage') continue;
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < HEAR_RANGE) {
          bot.investigate = nearestNode(new THREE.Vector3(x, 0, z));
          setPath(bot, bot.investigate);
          bot.state = 'patrol';
        }
      }
    },
    rotateToSite(site) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'def') continue;
        bot.investigate = null;
        bot.holdNode = site === 'A' ? 13 : 14;
        setPath(bot, bot.holdNode);
        bot.state = 'rotate';
      }
    },
    startDefuse(bot) {
      if (!bot.alive || bot.team !== 'def') return false;
      bot.defusing = 5;
      bot.target = null;
      return true;
    },
  };
}

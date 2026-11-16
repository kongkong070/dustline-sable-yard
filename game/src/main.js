// DUSTLINE — Sable Yard. Boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. The simulation (sim.js, bots.js) never touches
// the DOM; this file wires it to rendering, input, sound and the HUD.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet } from './weapons.js';
import { createBots } from './bots.js';
import { createSim } from './sim.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const effects = createEffects(scene);
const weapons = createWeaponSet(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

let attackSite = random() < 0.5 ? 'A' : 'B';
let defuser = null;
let buyOpen = false;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let beepAt = 0;

const grenades = []; // {mesh, pos, vel, timer}
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 });

const sim = createSim({
  onRoundStart(s) {
    attackSite = random() < 0.5 ? 'A' : 'B';
    player.reset(0, 17);
    weapons.refillAll();
    weapons.state.grenades = 0;
    weapons.state.armor = 0;
    bots.spawnRound(attackSite);
    defuser = null;
    hud.feed(`Round ${s.round} — push ${attackSite === 'A' ? 'A Long / Mid' : 'B Long / Mid'}, site ${attackSite}`);
    hud.showOverlay('start', null);
  },
  onRoundEnd(atkWon, reason, s) {
    if (atkWon) audio.roundWin(); else audio.roundLose();
    hud.feed(reason);
    hud.showOverlay('end', `${reason}. Dustline ${s.scoreAtk} — ${s.scoreDef} Sable.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPhase(phase) {
    if (phase === 'live') { hud.feed('Round live — plant the bomb or eliminate Sable.'); hud.showBuy(false); buyOpen = false; }
  },
  onPlanted(site) {
    audio.plantBeep();
    hud.feed(`Bomb planted at site ${site}!`);
    hud.setBomb(`BOMB PLANTED — SITE ${site}`, true);
    bots.rotateToSite(site);
  },
});

const bots = createBots(scene, world, {
  onBotShot(bot, from, to, hit) {
    effects.tracer(from, to);
    audio.distantShot();
    bots.hearShot(from.x, from.z);
  },
  damagePlayer(dmg, head, bot) {
    if (!player.state.alive) return;
    let left = dmg;
    if (weapons.state.armor > 0) {
      const absorbed = Math.min(weapons.state.armor, left * 0.5);
      weapons.state.armor -= absorbed;
      left -= absorbed;
    }
    player.state.health -= left;
    audio.hurt();
    hud.setHealth(player.state.health, weapons.state.armor);
    if (player.state.health <= 0) {
      player.state.health = 0;
      player.state.alive = false;
      sim.onPlayerDeath();
      hud.feed(`${bot.name} eliminated you${head ? ' (headshot)' : ''}.`);
      hud.showOverlay('end', 'You were eliminated — your squad fights on. Spectating Vex.');
    }
  },
  damageBot(victim, dmg, head, attacker) {
    if (bots.damage(victim, dmg, head ? 'head' : 'torso')) {
      hud.feed(`${attacker.name} eliminated ${victim.name}${head ? ' (headshot)' : ''}.`);
      if (victim === defuser) defuser = null;
      if (victim.team === 'def') audio.hit(true);
    }
  },
});

const shootables = world.shootables.concat(bots.hitMeshes);
const body = player.state;
const markerHoldMs = shot ? 4000 : 90;

function syncCamera() {
  if (!body.alive) {
    const mate = bots.bots.find((b) => b.team === 'atk' && b.alive);
    if (mate) {
      camera.position.set(mate.position.x, mate.position.y + 1.55, mate.position.z);
      camera.rotation.set(0, mate.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzlePos() {
  camera.getWorldPosition(muzzle);
  camera.getWorldDirection(direction);
  muzzle.addScaledVector(direction, 0.6);
  muzzle.y -= 0.12;
  return muzzle;
}

function shoot(spread) {
  if (!weapons.takeRound()) { audio.dryFire(); return false; }
  const def = weapons.def();
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const from = muzzlePos().clone();
  if (hit) {
    effects.tracer(from, hit.point);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const dmg = def.damage * (part === 'head' ? def.headMult : 1);
      const killed = bots.damage(bot, dmg, part);
      if (killed) {
        sim.addKillReward();
        hud.feed(`You eliminated ${bot.name}${part === 'head' ? ' (headshot)' : ''}  +$300`);
        if (bot === defuser) defuser = null;
      }
      hud.hitMarker(killed, markerHoldMs);
      audio.hit(killed);
    } else {
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      effects.impact(hit.point, n);
    }
  } else {
    effects.tracer(from, camera.position.clone().addScaledVector(direction, 60));
  }
  weapons.pullTrigger();
  audio.shot(def.kind);
  bots.hearShot(body.position.x, body.position.z);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name, weapons.state.grenades);
  return true;
}

function throwGrenade() {
  if (weapons.state.grenades <= 0) return;
  weapons.state.grenades -= 1;
  audio.grenadePin();
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  scene.add(mesh);
  camera.getWorldDirection(direction);
  const pos = camera.position.clone().addScaledVector(direction, 0.5);
  pos.y -= 0.1;
  const vel = direction.clone().multiplyScalar(13);
  vel.y += 3.5;
  grenades.push({ mesh, pos, vel, timer: 1.4 });
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name, weapons.state.grenades);
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  effects.explosion(g.pos);
  audio.explode();
  const R = 6.5;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.position.distanceTo(g.pos);
    if (d < R) {
      const dmg = 110 * (1 - d / R) + 10;
      if (bots.damage(bot, dmg, 'torso')) {
        sim.addKillReward();
        hud.feed(`Your frag eliminated ${bot.name}  +$300`);
      }
    }
  }
  const pd = Math.hypot(body.position.x - g.pos.x, body.position.z - g.pos.z);
  if (body.alive && pd < R && Math.abs(body.position.y - g.pos.y) < 3) {
    player.state.health -= 55 * (1 - pd / R);
    audio.hurt();
    if (player.state.health <= 0) {
      player.state.health = 0;
      player.state.alive = false;
      sim.onPlayerDeath();
      hud.feed('Your own frag eliminated you.');
    }
  }
  hud.setHealth(player.state.health, weapons.state.armor);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 12 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.09) { g.pos.y = 0.09; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    g.mesh.position.copy(g.pos);
    g.timer -= dt;
    if (g.timer <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (sim.state.phase !== 'over') {
    hud.showOverlay(started ? 'paused' : 'start', null);
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  input.requestLock();
});

function buyPressed(code) {
  if (!buyOpen) return false;
  const s = sim.state;
  let spent = -1;
  let label = '';
  if (code === 'Digit1') { spent = weapons.buy('rifle', s.money); label = 'VK-7 Carbine'; }
  else if (code === 'Digit2') { spent = weapons.buy('smg', s.money); label = 'Kestrel-9 SMG'; }
  else if (code === 'Digit3') { spent = weapons.buy('dmr', s.money); label = 'Longbow DMR'; }
  else if (code === 'Digit4') { spent = weapons.buyGrenade(s.money); label = 'Frag grenade'; }
  else if (code === 'Digit5') { spent = weapons.buyArmor(s.money); label = 'Kevlar armor'; }
  if (spent >= 0) {
    s.money -= spent;
    audio.buy();
    hud.flashBuy(`${label} — $${spent}`);
    hud.setMoney(s.money);
    hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name, weapons.state.grenades);
  } else if (code >= 'Digit1' && code <= 'Digit5') {
    audio.denied();
    hud.flashBuy('Cannot buy that — already owned or not enough money.');
  }
  return true;
}

function step(dt) {
  elapsed += dt;
  const s = sim.state;
  // defuse: a living defender standing on the planted site channels it
  defuser = null;
  if (s.phase === 'planted' && s.plantedSite) {
    const site = SITES[s.plantedSite];
    let best = null;
    let bestD = 3;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'def') continue;
      const d = Math.hypot(bot.position.x - site.center.x, bot.position.z - site.center.z);
      if (d < bestD) { bestD = d; best = bot; }
    }
    if (best) {
      if (best.defusing <= 0) bots.startDefuse(best);
      defuser = best;
      if (elapsed > beepAt) { audio.defuseBeep(); beepAt = elapsed + 0.9; }
    }
  }
  if (body.alive) player.step(dt, input.state.keys);
  weapons.step(dt);
  bots.step(dt, elapsed, body);
  stepGrenades(dt);
  effects.step(dt);
  sim.step(dt, {
    playerAlive: body.alive,
    atkAlive: (body.alive ? 1 : 0) + bots.aliveCount('atk'),
    defAlive: bots.aliveCount('def'),
    inSite: sim.siteAt(body.position),
    plantingKey: input.state.keys.has('KeyE'),
    defuser,
  });
  if (s.phase === 'planted' && Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.plantBeep();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (body.alive) player.look(look.x, look.y);
    const s = sim.state;
    // buy menu
    if (input.takePressed('KeyB') && s.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen, s.money);
    }
    if (buyOpen) {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
        if (input.takePressed(code)) buyPressed(code);
      }
    } else {
      if (input.takePressed('Digit1')) weapons.equip('pistol');
      if (input.takePressed('Digit2')) weapons.equip('smg');
      if (input.takePressed('Digit3')) weapons.equip('rifle');
      if (input.takePressed('Digit4')) weapons.equip('dmr');
    }
    if (input.takePressed('KeyG')) throwGrenade();
    if (body.alive && input.state.firing && weapons.ready()) {
      shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR') && weapons.reload()) audio.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // HUD refresh (setters skip unchanged values)
    hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name, weapons.state.grenades);
    hud.setHealth(body.health, weapons.state.armor);
    hud.setMoney(s.money);
    hud.setTimer(s.phaseTime, s.phase);
    hud.setScore(s.scoreAtk, s.scoreDef, s.round);
    hud.setTeams((body.alive ? 1 : 0) + bots.aliveCount('atk'), bots.aliveCount('def'));
    hud.setSpread(weapons.spread(player.groundSpeed()));
    const site = sim.siteAt(body.position);
    if (s.phase === 'live' && body.alive && s.bombCarrier && site) {
      hud.setHint(`Hold E to plant the bomb at site ${site} — ${Math.max(0, s.plantProgress).toFixed(1)}s`);
      hud.setBomb(`PLANTING ${Math.round((s.plantProgress / 3.2) * 100)}%`, s.planting);
    } else if (s.phase === 'planted') {
      hud.setBomb(`BOMB — SITE ${s.plantedSite} — ${Math.ceil(s.phaseTime)}s`, true);
      hud.setHint(defuser ? `${defuser.name} is defusing the bomb!` : 'Defend the planted bomb.');
    } else if (s.phase === 'buy') {
      hud.setHint('Buy phase — press B for the shop, then move out.');
      hud.setBomb('', false);
    } else {
      hud.setHint('');
      hud.setBomb('', false);
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(2, 0, 16);
    settle(20);
    aimAt(new THREE.Vector3(18, 2.5, -16));
    hud.showOverlay('start', null);
  } else if (name === 'play') {
    sim.state.phase = 'live';
    sim.state.phaseTime = 80;
    body.position.set(-2, 0, 6);
    settle(20);
    const enemy = bots.bots.find((b) => b.team === 'def' && b.alive);
    if (enemy) {
      enemy.position.set(1, 0, -4);
      enemy.group.position.copy(enemy.position);
      for (let round = 0; round < 3; round += 1) {
        aimAt(new THREE.Vector3(enemy.position.x, 1.3, enemy.position.z));
        shoot(0);
        if (round < 2) settle(8);
      }
    }
    settle(12);
    aimAt(new THREE.Vector3(2, 1.4, -6));
  } else if (name === 'plant') {
    sim.state.phase = 'planted';
    sim.state.phaseTime = 32;
    sim.state.plantedSite = 'A';
    sim.state.bombCarrier = false;
    body.position.set(-12, 0, -6);
    settle(20);
    aimAt(new THREE.Vector3(-17, 1.2, -12));
    hud.setBomb('BOMB — SITE A — 32s', true);
    hud.setHint('Defend the planted bomb.');
  } else { // end
    sim.state.scoreAtk = 1;
    sim.state.phase = 'over';
    sim.state.phaseTime = 5;
    body.position.set(-12, 0, -6);
    settle(20);
    aimAt(new THREE.Vector3(-17, 1.2, -12));
    hud.showOverlay('end', 'The bomb detonated. Dustline 1 — 0 Sable.');
  }
  hud.setScore(sim.state.scoreAtk, sim.state.scoreDef, sim.state.round);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name, weapons.state.grenades);
  hud.setHealth(body.health, weapons.state.armor);
  hud.setMoney(sim.state.money);
  hud.setTimer(sim.state.phaseTime, sim.state.phase);
  hud.setTeams((body.alive ? 1 : 0) + bots.aliveCount('atk'), bots.aliveCount('def'));
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

sim.newMatch();
weapons.show();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);

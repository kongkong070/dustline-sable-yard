// The armoury: four guns and a frag grenade, each with its own numbers. Damage is
// per hit; a head shot multiplies it. Spread grows with movement speed and with
// every shot in a burst, so stopping to aim pays — the core of the gunplay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 48,
    damage: 26, headMult: 3, fireGap: 0.16, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, spreadShot: 0.004, auto: false, kind: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Kestrel-9 SMG', price: 1400, mag: 28, reserve: 84,
    damage: 19, headMult: 2.6, fireGap: 0.075, reloadTime: 1.7,
    spreadStill: 0.006, spreadMove: 0.03, spreadShot: 0.005, auto: true, kind: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 2700, mag: 25, reserve: 75,
    damage: 33, headMult: 3, fireGap: 0.105, reloadTime: 2.0,
    spreadStill: 0.0022, spreadMove: 0.028, spreadShot: 0.006, auto: true, kind: 'rifle',
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', price: 3800, mag: 8, reserve: 24,
    damage: 72, headMult: 2.4, fireGap: 0.85, reloadTime: 2.6,
    spreadStill: 0.0008, spreadMove: 0.05, spreadShot: 0.012, auto: false, kind: 'dmr',
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

// A view model per weapon, built from boxes, plus the magazine / reload / spread
// state. main.js owns the ray and the damage; this module owns the numbers.
export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.6, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    const add = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      model.add(m);
      return m;
    };
    if (def.kind === 'pistol') {
      add(0.05, 0.07, 0.2, 0, 0, -0.1, body);
      add(0.045, 0.09, 0.06, 0, -0.06, 0.02, grip);
    } else if (def.kind === 'smg') {
      add(0.08, 0.09, 0.34, 0, 0, -0.08, body);
      add(0.04, 0.04, 0.24, 0, 0.02, -0.32, grip);
      add(0.05, 0.12, 0.05, 0, -0.08, -0.02, grip);
    } else if (def.kind === 'dmr') {
      add(0.07, 0.09, 0.55, 0, 0, -0.14, body);
      add(0.035, 0.035, 0.34, 0, 0.02, -0.5, dark);
      add(0.05, 0.06, 0.1, 0, 0.06, -0.1, dark); // scope
      add(0.06, 0.1, 0.18, 0, -0.02, 0.22, grip);
    } else {
      add(0.09, 0.1, 0.42, 0, 0, -0.1, body);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.46, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.24, grip);
      add(0.05, 0.05, 0.12, 0, 0.07, -0.2, dark); // sight
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };

  const state = {
    current: 'rifle',
    get mag() { return ammo[state.current].mag; },
    set mag(v) { ammo[state.current].mag = v; },
    get reserve() { return ammo[state.current].reserve; },
    set reserve(v) { ammo[state.current].reserve = v; },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0, // spread added by consecutive shots, decays when not firing
    grenades: 0,
    armor: 0,
    owned: { pistol: true, rifle: true },
  };

  function def() { return WEAPONS[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return {
    state,
    def,
    step,
    equip(id) {
      if (!state.owned[id]) return false;
      models[state.current].visible = false;
      state.current = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      models[id].visible = true;
      return true;
    },
    show() { models[state.current].visible = true; },
    hide() { models[state.current].visible = false; },
    buy(id, money) {
      const w = WEAPONS[id];
      if (!w || state.owned[id] || money < w.price) return -1;
      state.owned[id] = true;
      this.equip(id);
      return w.price;
    },
    buyGrenade(money) {
      if (state.grenades >= 2 || money < GRENADE_PRICE) return -1;
      state.grenades += 1;
      return GRENADE_PRICE;
    },
    buyArmor(money) {
      if (state.armor >= 100 || money < ARMOR_PRICE) return -1;
      state.armor = 100;
      return ARMOR_PRICE;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + def().spreadShot);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove + state.bloom;
    },
    refillAll() {
      for (const d of Object.values(WEAPONS)) {
        ammo[d.id].mag = d.mag;
        ammo[d.id].reserve = d.reserve;
      }
    },
  };
}

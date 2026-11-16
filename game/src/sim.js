// The round: one state object, one step. Phases: buy (15 s, shop open) -> live
// (100 s, plant or eliminate) -> planted (40 s fuse) -> over (5 s, then next
// round). Money follows Counter-Strike-style rules: kills pay, wins pay more
// than losses, planting pays, and a loss streak pays a little extra. First to
// 5 round wins takes the match; the match then restarts.
import { SITES } from './world.js';

export const ROUND_TIME = 100;
export const BUY_TIME = 15;
export const FUSE_TIME = 40;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;

export function createSim(hooks) {
  const state = {
    phase: 'buy', // buy | live | planted | over
    phaseTime: BUY_TIME,
    round: 1,
    scoreAtk: 0,
    scoreDef: 0,
    money: 800,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    plantedSite: null, // 'A' | 'B' | null
    plantProgress: 0,
    planting: false,
    defuseProgress: 0,
    bombCarrier: true, // the player carries the bomb
    matchOver: false,
    matchWinner: null,
    lastEvent: '',
  };

  function endRound(atkWon, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.phaseTime = 5;
    state.lastEvent = reason;
    if (atkWon) {
      state.scoreAtk += 1;
      state.money += 3250;
      state.lossStreak = 0;
    } else {
      state.scoreDef += 1;
      state.lossStreak += 1;
      state.money += 1900 + Math.min(2, state.lossStreak - 1) * 500;
    }
    state.plantedSite = null;
    state.plantProgress = 0;
    hooks.onRoundEnd(atkWon, reason, state);
    if (state.scoreAtk >= WIN_ROUNDS || state.scoreDef >= WIN_ROUNDS) {
      state.matchOver = true;
      state.matchWinner = state.scoreAtk >= WIN_ROUNDS ? 'atk' : 'def';
    }
  }

  return {
    state,
    startRound() {
      state.phase = 'buy';
      state.phaseTime = BUY_TIME;
      state.round += state.round === 1 && state.scoreAtk === 0 && state.scoreDef === 0 ? 0 : 1;
      state.plantedSite = null;
      state.plantProgress = 0;
      state.planting = false;
      state.defuseProgress = 0;
      state.bombCarrier = true;
      state.matchOver = false;
      state.matchWinner = null;
      hooks.onRoundStart(state);
    },
    newMatch() {
      state.round = 1;
      state.scoreAtk = 0;
      state.scoreDef = 0;
      state.money = 800;
      state.lossStreak = 0;
      state.kills = 0;
      state.deaths = 0;
      this.startRound();
    },
    addKillReward() {
      state.kills += 1;
      state.money += 300;
    },
    addPlantReward() { state.money += 300; },
    onPlayerDeath() {
      state.deaths += 1;
      state.bombCarrier = false;
    },
    step(dt, ctx) {
      // ctx: {playerPos, playerAlive, atkAlive, defAlive, inSite, plantingKey, defuser}
      state.phaseTime -= dt;
      if (state.phase === 'buy' && state.phaseTime <= 0) {
        state.phase = 'live';
        state.phaseTime = ROUND_TIME;
        hooks.onPhase('live');
      } else if (state.phase === 'live') {
        // planting: hold E inside a site while alive and carrying the bomb
        if (ctx.plantingKey && ctx.playerAlive && state.bombCarrier && ctx.inSite) {
          state.plantProgress += dt;
          state.planting = true;
          if (state.plantProgress >= PLANT_TIME) {
            state.plantedSite = ctx.inSite;
            state.phase = 'planted';
            state.phaseTime = FUSE_TIME;
            state.plantProgress = 0;
            state.planting = false;
            state.bombCarrier = false;
            this.addPlantReward();
            hooks.onPlanted(ctx.inSite);
          }
        } else {
          state.plantProgress = Math.max(0, state.plantProgress - dt * 2);
          state.planting = false;
        }
        if (ctx.defAlive === 0) endRound(true, 'Sable team eliminated');
        else if (ctx.atkAlive === 0) endRound(false, 'Your squad was eliminated');
        else if (state.phaseTime <= 0) endRound(false, 'Time expired — the bomb was never planted');
      } else if (state.phase === 'planted') {
        if (ctx.defuser) {
          state.defuseProgress += dt;
          if (state.defuseProgress >= DEFUSE_TIME) {
            state.defuseProgress = 0;
            endRound(false, 'The bomb was defused');
          }
        } else {
          state.defuseProgress = Math.max(0, state.defuseProgress - dt * 2);
        }
        if (ctx.atkAlive === 0 && !ctx.defuser) {
          // attackers all dead and nobody defusing: bomb still ticks
        }
        if (state.phaseTime <= 0) endRound(true, 'The bomb detonated');
      } else if (state.phase === 'over' && state.phaseTime <= 0) {
        if (state.matchOver) this.newMatch();
        else this.startRound();
      }
    },
    siteAt(pos) {
      for (const [key, site] of Object.entries(SITES)) {
        const d = Math.hypot(pos.x - site.center.x, pos.z - site.center.z);
        if (d < site.radius) return key;
      }
      return null;
    },
  };
}

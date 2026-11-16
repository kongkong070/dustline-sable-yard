// The DOM HUD: crosshair (it widens with spread), hit marker, health, ammo,
// money, round timer, round score, team counts, kill feed, bomb status, the
// buy menu and the one overlay panel. It never touches the simulation; main.js
// pushes numbers in and reads callbacks out. Every setter skips unchanged text.
const COPY = {
  start: {
    title: 'DUSTLINE — Sable Yard',
    copy: 'Attackers: plant the bomb at A or B, or eliminate the Sable team. Defenders hold the sites. First to 5 rounds takes the match. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE — Sable Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Play again',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorFill = $('armor-fill');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEl = $('round-score');
  const teamsEl = $('teams');
  const feedEl = $('killfeed');
  const bombEl = $('bomb');
  const buyEl = $('buy');
  const hintEl = $('hint');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  let hitTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name, grenades) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wname', `${name}${grenades > 0 ? `  ·  ${grenades} frag` : ''}`);
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp));
      setText(healthNum, 'hp', String(h));
      healthFill.style.width = `${h}%`;
      healthFill.classList.toggle('low', h <= 30);
      armorFill.style.width = `${Math.max(0, Math.round(armor))}%`;
    },
    setMoney(m) { setText(moneyEl, 'money', `$${m}`); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(timerEl, 'timer', `${mm}:${ss}`);
      timerEl.classList.toggle('urgent', s <= 10 && (phase === 'live' || phase === 'planted'));
      setText($('phase'), 'phase', phase === 'buy' ? 'BUY PHASE' : phase === 'planted' ? 'BOMB PLANTED' : phase === 'live' ? 'ROUND' : 'ROUND OVER');
    },
    setScore(atk, def, round) {
      setText(scoreEl, 'score', `DUSTLINE ${atk} — ${def} SABLE · ROUND ${round}`);
    },
    setTeams(atk, def) {
      setText(teamsEl, 'teams', `Your squad ${atk} · Sable ${def}`);
    },
    setBomb(text, show) {
      bombEl.hidden = !show;
      if (show) setText(bombEl, 'bomb', text);
    },
    setHint(text) { setText(hintEl, 'hint', text); },
    setSpread(spreadPx) {
      const gap = Math.round(4 + spreadPx * 900);
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    feed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feedEl.prepend(line);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
      setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    showBuy(open, money) {
      buyEl.hidden = !open;
      if (open) setText($('buy-money'), 'buymoney', `Wallet: $${money}`);
    },
    flashBuy(text) {
      setText($('buy-flash'), 'buyflash', text);
      setTimeout(() => setText($('buy-flash'), 'buyflash', ''), 1200);
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}

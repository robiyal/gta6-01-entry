// Dusthaven UI: HUD (health, cash, wanted stars, speed, objective, timer),
// menus (title / pause / busted / wasted / mission complete), toasts and
// the damage vignette. All DOM — the 3D canvas stays clean underneath.
export function createUI(handlers) {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'), health: $('health-fill'), healthText: $('health-text'),
    cash: $('cash'), stars: $('stars'), speed: $('speed'), speedUnit: $('speed-unit'),
    objective: $('objective'), objTitle: $('obj-title'), objText: $('obj-text'),
    timer: $('timer'), toast: $('toast'), vignette: $('vignette'),
    crosshair: $('crosshair'), hint: $('hint'),
    title: $('screen-title'), pause: $('screen-pause'), over: $('screen-over'),
    complete: $('screen-complete'), overTitle: $('over-title'), overText: $('over-text'),
    completeTitle: $('complete-title'), completeText: $('complete-text'),
    btnStart: $('btn-start'), btnContinue: $('btn-continue'),
    btnResume: $('btn-resume'), btnRestart: $('btn-restart'),
    btnOverRestart: $('btn-over-restart'), btnCompleteNext: $('btn-complete-next'),
    btnCompleteRoam: $('btn-complete-roam'), titleSub: $('title-sub'),
    missionList: $('mission-list'),
    armourFill: $('armour-fill'), armourText: $('armour-text'),
    respect: $('respect'), district: $('district'), radio: $('radio'),
    weapons: $('weapons'), nitroBar: $('nitro-bar'), nitroFill: $('nitro-fill'),
    dispatch: $('dispatch'), dispatchRows: $('dispatch-rows'),
    garage: $('screen-garage'), garageItems: $('garage-items'),
    garageCash: $('garage-cash'), garageCond: $('garage-cond'),
    btnGarageLeave: $('btn-garage-leave'),
    statsScreen: $('screen-stats'), statsBody: $('stats-body'),
    btnStatsResume: $('btn-stats-resume'), btnStatsBack: $('btn-stats-back'),
    btnCareer: $('btn-career'),
  };

  let toastTimer = null;
  function toast(text, ms = 3200) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  function setScreen(name) {
    for (const s of [els.title, els.pause, els.over, els.complete, els.garage, els.statsScreen]) s.classList.add('hidden');
    if (name === 'title') els.title.classList.remove('hidden');
    else if (name === 'pause') els.pause.classList.remove('hidden');
    else if (name === 'over') els.over.classList.remove('hidden');
    else if (name === 'complete') els.complete.classList.remove('hidden');
    else if (name === 'garage') els.garage.classList.remove('hidden');
    else if (name === 'stats') els.statsScreen.classList.remove('hidden');
    els.hud.classList.toggle('hidden', name !== 'game');
    els.crosshair.classList.add('hidden');
  }

  function updateHUD(s) {
    // s: {health, cash, wanted, speedKmh, inCar, objectiveTitle, objectiveText,
    //     timeLeft, showCrosshair, hint}
    els.health.style.width = `${Math.max(0, s.health)}%`;
    els.healthText.textContent = `${Math.ceil(Math.max(0, s.health))} HP`;
    els.health.style.background = s.health > 50 ? '#7dff5e' : s.health > 25 ? '#ffc53d' : '#ff4d4d';
    els.cash.textContent = `$${s.cash.toLocaleString()}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    els.stars.textContent = stars;
    els.stars.classList.toggle('hot', s.wanted > 0);
    els.speed.textContent = s.inCar ? String(Math.round(s.speedKmh)) : '—';
    els.speedUnit.textContent = s.inCar
      ? (s.condition != null ? `km/h · COND ${Math.round(s.condition)}%` : 'km/h')
      : 'on foot';
    els.objTitle.textContent = s.objectiveTitle;
    els.objText.textContent = s.objectiveText;
    els.timer.textContent = s.timeLeft != null ? fmtTime(s.timeLeft) : '';
    els.timer.classList.toggle('urgent', s.timeLeft != null && s.timeLeft < 20);
    els.crosshair.classList.toggle('hidden', !s.showCrosshair);
    els.hint.textContent = s.hint || '';
    els.vignette.style.opacity = s.health < 35 ? String((35 - s.health) / 35 * 0.55) : '0';
    els.vignette.classList.toggle('wanted-pulse', s.wanted >= 3);
    // Round 4 HUD: armour, respect, weapons, radio, district, nitro and the
    // dispatch list. Every field is optional — staged shots and older
    // callers may omit any of them, and the panel simply keeps its last value.
    if (s.armour != null) {
      els.armourFill.style.width = `${Math.max(0, s.armour)}%`;
      els.armourText.textContent = `Armour ${Math.ceil(Math.max(0, s.armour))}`;
    }
    if (s.respectTitle) {
      els.respect.textContent = `RESPECT — ${s.respectTitle}` +
        (s.respectNextAt != null ? ` · ${s.respectPoints}/${s.respectNextAt}` : ` · ${s.respectPoints}`);
    }
    if (s.district) els.district.textContent = s.district;
    if (s.radio) els.radio.textContent = `♪ ${s.radio}`;
    if (s.ammo != null) els.weapons.textContent = `FISTS · PISTOL ${s.ammo}/12`;
    if (s.nitroOwned) {
      els.nitroBar.classList.remove('hidden');
      els.nitroFill.style.width = `${Math.max(0, s.nitroPct || 0)}%`;
    } else {
      els.nitroBar.classList.add('hidden');
    }
    if (s.dispatch && s.dispatch.length > 0) {
      els.dispatch.classList.remove('hidden');
      els.dispatchRows.innerHTML = s.dispatch.map((u) =>
        `<div class="dispatch-row"><span class="dispatch-unit">${u.callsign}</span><span class="dispatch-role">${u.role}</span><span class="dispatch-dist">${u.dist}m</span></div>`).join('');
    } else {
      els.dispatch.classList.add('hidden');
    }
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function showOver(kind, text) {
    els.overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    els.overTitle.className = kind === 'busted' ? 'over-busted' : 'over-wasted';
    els.overText.textContent = text;
    setScreen('over');
  }

  function showComplete(mission, reward, totalCash) {
    els.completeTitle.textContent = `${mission.title} — COMPLETE`;
    els.completeText.textContent = `${mission.giver} paid you $${reward.toLocaleString()}. Total cash: $${totalCash.toLocaleString()}.`;
    setScreen('complete');
  }

  function showGarage(state) {
    // state: {cash, condition, armour, owned: string[], tuneLevel, items}
    els.garageCash.textContent = `$${state.cash.toLocaleString()}`;
    els.garageCond.textContent = `Condition ${Math.round(state.condition)}% · Armour ${Math.round(state.armour)}`;
    els.garageItems.innerHTML = '';
    for (const item of state.items) {
      const owned = state.owned.includes(item.id)
        || (item.id === 'tune1' && state.tuneLevel >= 1)
        || (item.id === 'tune2' && state.tuneLevel >= 2);
      const locked = !!item.requires && !state.owned.includes(item.requires) && state.tuneLevel < 1;
      const afford = state.cash >= item.price;
      const row = document.createElement('div');
      row.className = 'garage-row';
      row.innerHTML = `<div class="garage-info"><div class="garage-name">${item.name}</div>` +
        `<div class="garage-desc">${item.desc}</div></div>` +
        `<div class="garage-price">$${item.price.toLocaleString()}</div>`;
      const btn = document.createElement('button');
      btn.className = 'garage-buy';
      btn.textContent = owned ? 'OWNED' : locked ? 'NEEDS STAGE 1' : afford ? 'BUY' : 'NO CASH';
      btn.disabled = owned || locked || !afford;
      btn.addEventListener('click', () => handlers.onGarageBuy(item.id));
      row.appendChild(btn);
      els.garageItems.appendChild(row);
    }
    setScreen('garage');
  }

  function showStats(s) {
    // s: careerStats() output + {respectTitle, save: {cash, missionsDone, savedAt} | null}
    els.statsBody.innerHTML =
      `<div class="stats-percent"><div class="stats-percent-bar" style="width:${s.percent}%"></div></div>` +
      `<div class="stats-line">Story ${s.storyDone}/${s.storyTotal} — ${s.percent}% complete · ${s.respectTitle}</div>` +
      `<div class="stats-grid">` +
      `<div><b>$${s.cash.toLocaleString()}</b><span>cash</span></div>` +
      `<div><b>${s.carsStolen}</b><span>cars stolen</span></div>` +
      `<div><b>${s.busts}</b><span>times busted</span></div>` +
      `<div><b>${s.escapes}</b><span>clean escapes</span></div>` +
      `<div><b>${s.distanceKm.toFixed(1)} km</b><span>driven</span></div>` +
      `<div><b>${s.shotsFired}</b><span>shots fired</span></div>` +
      `</div>` +
      (s.save
        ? `<div class="stats-line">Slot 1 — $${s.save.cash.toLocaleString()} · ${s.save.missionsDone.length}/3 jobs · saved ${new Date(s.save.savedAt).toLocaleDateString()}</div>`
        : `<div class="stats-line">Slot 1 — empty. Finish a job to save.</div>`);
    setScreen('stats');
  }

  function setTitle(save) {
    els.btnContinue.classList.toggle('hidden', !save);
    if (save) {
      els.titleSub.textContent = `Welcome back, Rook. Cash $${save.cash.toLocaleString()} · ${save.missionsDone.length}/3 jobs done.`;
    } else {
      els.titleSub.textContent = 'A sun-soaked desert town. One getaway driver. Three jobs.';
    }
    const items = [
      'M1 · First Job — Delia Voss',
      'M2 · Desert Delivery — dust storm',
      'M3 · The Collector’s Car — 2★ heat',
    ];
    els.missionList.innerHTML = items.map((t, i) => {
      const done = save && save.missionsDone.includes(['m1', 'm2', 'm3'][i]);
      return `<li class="${done ? 'done' : ''}">${done ? '✓' : '○'} ${t}</li>`;
    }).join('');
  }

  els.btnStart.addEventListener('click', () => { handlers.onStart(false); });
  els.btnContinue.addEventListener('click', () => { handlers.onStart(true); });
  els.btnResume.addEventListener('click', () => { handlers.onResume(); });
  els.btnRestart.addEventListener('click', () => { handlers.onRestart(); });
  els.btnOverRestart.addEventListener('click', () => { handlers.onRestart(); });
  els.btnCompleteNext.addEventListener('click', () => { handlers.onNextMission(); });
  els.btnCompleteRoam.addEventListener('click', () => { handlers.onRoam(); });
  els.btnGarageLeave.addEventListener('click', () => { handlers.onGarageLeave(); });
  els.btnStatsResume.addEventListener('click', () => { handlers.onStatsResume(); });
  els.btnStatsBack.addEventListener('click', () => { handlers.onStatsBack(); });
  els.btnCareer.addEventListener('click', () => { handlers.onOpenStats(); });

  return { setScreen, updateHUD, toast, showOver, showComplete, showGarage, showStats, setTitle, els };
}

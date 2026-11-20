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
  };

  let toastTimer = null;
  function toast(text, ms = 3200) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  function setScreen(name) {
    for (const s of [els.title, els.pause, els.over, els.complete]) s.classList.add('hidden');
    if (name === 'title') els.title.classList.remove('hidden');
    else if (name === 'pause') els.pause.classList.remove('hidden');
    else if (name === 'over') els.over.classList.remove('hidden');
    else if (name === 'complete') els.complete.classList.remove('hidden');
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
    els.speedUnit.textContent = s.inCar ? 'km/h' : 'on foot';
    els.objTitle.textContent = s.objectiveTitle;
    els.objText.textContent = s.objectiveText;
    els.timer.textContent = s.timeLeft != null ? fmtTime(s.timeLeft) : '';
    els.timer.classList.toggle('urgent', s.timeLeft != null && s.timeLeft < 20);
    els.crosshair.classList.toggle('hidden', !s.showCrosshair);
    els.hint.textContent = s.hint || '';
    els.vignette.style.opacity = s.health < 35 ? String((35 - s.health) / 35 * 0.55) : '0';
    els.vignette.classList.toggle('wanted-pulse', s.wanted >= 3);
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

  return { setScreen, updateHUD, toast, showOver, showComplete, setTitle, els };
}

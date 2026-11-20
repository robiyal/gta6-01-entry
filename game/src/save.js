// Dusthaven save: localStorage, one slot. Cash, completed jobs and the
// player's last position persist; wanted level and health reset on load
// (a fresh morning in Dusthaven). Corrupt saves are ignored, never crash.
import { SAVE_KEY, TUNING } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return {
      cash: typeof s.cash === 'number' ? Math.max(0, Math.floor(s.cash)) : TUNING.startCash,
      missionsDone: Array.isArray(s.missionsDone) ? s.missionsDone.filter((x) => typeof x === 'string') : [],
      pos: s.pos && typeof s.pos.x === 'number' && typeof s.pos.z === 'number' ? s.pos : null,
      savedAt: typeof s.savedAt === 'number' ? s.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionsDone: state.missionsDone,
      pos: state.pos ? { x: Math.round(state.pos.x), z: Math.round(state.pos.z) } : null,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage full or blocked: the game keeps running without a save.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// Dusthaven input: keyboard state + mouse (drag to orbit the camera on foot,
// click to shoot). Also exposes the shot-mode query (?shot=action|foot|bridge|stats
// and the older start|play|end) the kit's shots.json uses for deterministic screenshots.
export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered: one entry per physical press
  const state = {
    keys,
    mouseDown: false,
    mouseClicked: false,
    dragDX: 0, dragDY: 0,
    pointerLocked: false,
  };
  let lastX = 0, lastY = 0;

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  // Blur clears both sets: a key released while the window is unfocused
  // would otherwise leave a stale edge-triggered press that fires on refocus.
  window.addEventListener('blur', () => { keys.clear(); pressed.clear(); });

  const canvas = document.getElementById('game');
  canvas.addEventListener('mousedown', (e) => {
    state.mouseDown = true;
    state.mouseClicked = true;
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { state.mouseDown = false; });
  window.addEventListener('mousemove', (e) => {
    if (!state.mouseDown) return;
    state.dragDX += e.clientX - lastX;
    state.dragDY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });

  return {
    state,
    down(code) { return keys.has(code); },
    // Edge-triggered: true once per physical key press.
    consumePressed(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    axis() {
      // Driving / walking axes: W/S throttle, A/D steer.
      const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0)
        + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      return { fwd, steer };
    },
    consumeClick() {
      const c = state.mouseClicked;
      state.mouseClicked = false;
      return c;
    },
    consumeDrag() {
      const d = { x: state.dragDX, y: state.dragDY };
      state.dragDX = 0; state.dragDY = 0;
      return d;
    },
  };
}

export function shotMode() {
  const q = new URLSearchParams(window.location.search);
  const s = q.get('shot');
  return ['start', 'play', 'action', 'foot', 'bridge', 'stats', 'end'].includes(s) ? s : null;
}

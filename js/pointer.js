/* ==========================================================================
   POINTER  ·  normalized cursor / touch tracking
   --------------------------------------------------------------------------
   Exposes a small live state object the eye reads each frame:
     x, y       → normalized position in [-1, 1] (screen centre = 0,0)
     lastMove   → timestamp (performance.now) of the last movement
   One listener, passive, no per-frame allocation.
   ========================================================================== */

export function createPointer(targetEl = window) {
  // clientX/clientY are the raw viewport coords; the eye maps them relative to
  // its OWN (possibly translated) canvas, so it keeps looking at the cursor even
  // when it is sunk low in the Capabilities section.
  const state = {
    x: 0, y: 0,
    clientX: window.innerWidth / 2,
    clientY: window.innerHeight / 2,
    lastMove: performance.now(),
  };

  function update(clientX, clientY) {
    state.clientX = clientX;
    state.clientY = clientY;
    state.x = (clientX / window.innerWidth) * 2 - 1;
    state.y = (clientY / window.innerHeight) * 2 - 1;
    state.lastMove = performance.now();
  }

  function onPointerMove(e) {
    update(e.clientX, e.clientY);
  }

  function onTouchMove(e) {
    const t = e.touches && e.touches[0];
    if (t) update(t.clientX, t.clientY);
  }

  targetEl.addEventListener("pointermove", onPointerMove, { passive: true });
  targetEl.addEventListener("touchmove", onTouchMove, { passive: true });

  return state;
}

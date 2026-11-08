/* ==========================================================================
   POINTER  ·  normalized cursor / touch tracking
   --------------------------------------------------------------------------
   Exposes a small live state object the eye reads each frame:
     x, y       → normalized position in [-1, 1] (screen centre = 0,0)
     lastMove   → timestamp (performance.now) of the last movement
     seen       → false until the cursor has actually moved once
     inWindow   → false while the cursor is outside the page
   One listener, passive, no per-frame allocation.

   WHY THIS IS A SHARED, WINDOW-LEVEL THING and not an element's own handler.
   An effect that binds pointermove to its own element is asking the browser
   "is the cursor on top of ME" — and the browser answers with whatever element
   is topmost at that point, which is not the same question. Anything floating
   over it, VISIBLE OR NOT, steals the answer: the effect is told the visitor
   left when they did nothing of the sort. The About reveal was built that way
   and it cost several sessions of chasing an imaginary performance fault; see
   the note at the head of reveal-photo.js. Reading the cursor's position off
   the window and mapping it against one's own measured box has no such
   failure mode, which is why the eye, the depth chapters and the portrait's
   own parallax all do it.
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

    /* THE OPENING VALUES ABOVE ARE A GUESS — the centre of the screen, because
       something has to be there before the first event. A consumer that only
       aims at the cursor can use a guess happily. One that asks "is the cursor
       inside my box" cannot: on a page opened and scrolled by keyboard, that
       invented centre point can land inside the box and switch an effect on
       with nobody touching the mouse. `seen` says whether the position is real
       yet. */
    seen: false,

    /* And the position is remembered, so after the cursor leaves the page it
       keeps reading as the last place it was — which for the same consumer is
       a cursor parked inside the box for ever. */
    inWindow: true,
  };

  function update(clientX, clientY) {
    state.clientX = clientX;
    state.clientY = clientY;
    state.x = (clientX / window.innerWidth) * 2 - 1;
    state.y = (clientY / window.innerHeight) * 2 - 1;
    state.lastMove = performance.now();
    state.seen = true;
    state.inWindow = true;
  }

  function onPointerMove(e) {
    update(e.clientX, e.clientY);
  }

  function onTouchMove(e) {
    const t = e.touches && e.touches[0];
    if (t) update(t.clientX, t.clientY);
  }

  /* LEAVING THE PAGE. pointerout bubbles and carries a null relatedTarget only
     when there is no element being entered — which is exactly the case of the
     cursor crossing the edge of the window. Moving between two elements inside
     the page also fires pointerout, with the element being entered attached,
     so the test is the null and not the event. Any later movement sets it back
     (see update), so nothing has to be unwound. */
  function onPointerOut(e) {
    if (!e.relatedTarget) state.inWindow = false;
  }

  targetEl.addEventListener("pointermove", onPointerMove, { passive: true });
  targetEl.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("pointerout", onPointerOut, { passive: true });

  return state;
}

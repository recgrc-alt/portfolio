/* ==========================================================================
   SMOOTH SCROLL  ·  Lenis wrapper (reusable across pages)
   --------------------------------------------------------------------------
   Gives the site its fluid, continuous, non-mechanical scroll feel. Also wires
   any element with `data-scroll-to="#target"` to glide to that section instead
   of jumping. Returns the Lenis instance so callers can listen to `scroll`.

   Why a library: hand-rolling inertial scroll means re-implementing wheel /
   touch / keyboard handling and accessibility. Lenis is tiny and battle-tested.
   ========================================================================== */

import Lenis from "lenis";


/* --- ARRIVING AT SOMETHING THAT IS NOT THERE YET --------------------------
 * A [data-scroll-to] link glides to a section instead of jumping to it. On
 * this site one of those sections is a photo rendered in WebGL, and on a first
 * visit it is still decoding while the glide is already under way. Landing on
 * time and finding an empty frame is worse than a short pause: the reader
 * arrives at the one thing the link promised and it is not there.
 *
 * So a target can be GATED. The click waits for whatever the gate is waiting
 * for, then glides. Nothing else changes; an ungated target behaves exactly as
 * it always did, which is every target on every other page.
 *
 * TWO THINGS STOP THIS FROM BECOMING A DEAD BUTTON, and both are needed.
 *
 *   A ceiling. A file that never arrives can never swallow a click: past
 *   CEILING_MS the glide happens regardless and the photo's own fade-in covers
 *   whatever is left. 600ms is chosen to sit under the threshold where a
 *   person stops reading a delay as "it heard me" and starts reading it as
 *   "it is broken".
 *
 *   An escape. If the reader starts scrolling by hand while the gate is shut,
 *   the glide is abandoned. A page that yanks you somewhere half a second
 *   after you decided to go elsewhere is a worse fault than the empty frame
 *   this was written to prevent.
 */
const gates = new Map();
const CEILING_MS = 600;
/* Enough movement to be a decision rather than a trackpad twitch. */
const MOVED_PX = 32;

/**
 * Make a [data-scroll-to] target wait for something before it can be reached.
 * @param {string} selector the same string the link carries, e.g. "#about"
 * @param {Promise|any} work settled when the target is worth arriving at
 */
export function holdScrollTarget(selector, work) {
  if (!selector || !work) return;
  // Never rejects: a gate that could throw is a gate that could stay shut.
  gates.set(selector, Promise.resolve(work).catch(() => {}));
}


export function initSmoothScroll() {
  const lenis = new Lenis({
    lerp: 0.09,          // lower = smoother/lazier settle
    smoothWheel: true,
    wheelMultiplier: 1,
  });

  // Lenis drives itself on its own rAF tick (kept separate from the eye loop).
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Smooth anchor navigation for [data-scroll-to] links/buttons.
  document.querySelectorAll("[data-scroll-to]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const selector = el.getAttribute("data-scroll-to");
      const target = selector && document.querySelector(selector);
      if (!target) return;

      // Synchronously, before anything is awaited: hand this back to the
      // browser after an await and it has already followed the href.
      e.preventDefault();

      const gate = gates.get(selector);
      if (!gate) {
        lenis.scrollTo(target, { offset: 0 });
        return;
      }

      // Gated. Wait, but never for long, and never over the reader's own hands.
      const from = window.scrollY;
      Promise.race([gate, new Promise((go) => setTimeout(go, CEILING_MS))])
        .then(() => {
          if (Math.abs(window.scrollY - from) > MOVED_PX) return;
          lenis.scrollTo(target, { offset: 0 });
        });
    });
  });

  return lenis;
}

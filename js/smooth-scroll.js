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
      if (target) {
        e.preventDefault();
        lenis.scrollTo(target, { offset: 0 });
      }
    });
  });

  return lenis;
}

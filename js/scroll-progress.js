/* ==========================================================================
   SCROLL PROGRESS  ·  how far a tall section has passed the viewport
   --------------------------------------------------------------------------
   Reports 0 → 1 as a section scrolls from "top edge reaches the top of the
   screen" to "bottom edge reaches the bottom". Sections shorter than the
   viewport report 0.

   Shared by every scroll-driven effect on the site so the maths lives in ONE
   place: the About choreography, the horizontal card rail, and the sinking eye
   all consume this.

   Scroll is READ, never intercepted — the page stays a normal scrollable
   document, which keeps trackpads, keyboards and screen readers working, and
   lets the smooth-scroll library do its job untouched.
   ========================================================================== */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * @param {Element}  section          the tall element being scrolled through
 * @param {Function} options.onUpdate called with the 0→1 progress
 * @param {object}   [options.lenis]  smooth-scroll instance, if there is one
 * @returns {{update: Function}|null}
 */
export function trackScrollProgress(section, { onUpdate, lenis } = {}) {
  if (!section || typeof onUpdate !== "function") return null;

  function update() {
    const rect = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    onUpdate(travel > 0 ? clamp01(-rect.top / travel) : 0, section);
  }

  /* ALWAYS listen to the native scroll event. It is the browser's source of
     truth and fires whenever the scroll position changes — including while
     Lenis is smoothly driving it, because Lenis scrolls the real document
     rather than faking it with a transform. Relying on lenis.on ALONE was the
     bug: that event is emitted from Lenis's own rAF tick, so anything that
     stops the tick (a background tab, an init-order hiccup) froze every
     scroll-driven effect even though the page was still scrolling.

     Lenis's own event is subscribed to as well when present, purely for the
     tightest possible frame-sync; update() is idempotent, so firing from both
     is harmless. */
  window.addEventListener("scroll", update, { passive: true });
  if (lenis && typeof lenis.on === "function") lenis.on("scroll", update);

  window.addEventListener("resize", update, { passive: true });
  update();

  return { update };
}

/**
 * Convenience wrapper: writes the progress straight into a custom property.
 * Keeps the JS "dumb" — all the choreography is then expressed in CSS.
 */
export function bindProgressToProperty(section, property, options = {}) {
  const target = options.target ?? section;
  return trackScrollProgress(section, {
    ...options,
    onUpdate: (p) => target.style.setProperty(property, p.toFixed(4)),
  });
}

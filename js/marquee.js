/* ==========================================================================
   MARQUEE  ·  a scroll speed that does not depend on its contents
   --------------------------------------------------------------------------
   The loop itself is pure CSS: two identical tracks side by side, both
   translated by exactly one track width, so the seam never shows. That part
   needs no JavaScript and does not get any.

   What JavaScript is for is the DURATION.

   `animation: marquee 46s linear` translates by 100% — of the track's own
   width. So the duration is not a speed: it is a speed divided by however wide
   the track happens to be. Shrink the type, drop a tool, translate a word into
   a shorter language, and the same 46s scrolls more slowly. That is a bug
   waiting in every future edit, and it is what made the marquee feel wrong
   after the type came down.

   Measuring the track and deriving the duration from a PACE — how long one
   viewport width takes to pass — makes the speed a property of the design
   rather than a side effect of the content. Ten tools or twenty, big type or
   small, it reads at the same rate.

   Reusable: point it at any element wrapping [class$="__track"] children.
   ========================================================================== */

export function initMarquee(root, options = {}) {
  if (!root) return null;
  const track = root.querySelector("[class*='__track']");
  if (!track) return null;

  /* Read the pace from the token so the value stays in the design system and
     is not duplicated here. Falls back if the token is missing. */
  function pace() {
    const raw = getComputedStyle(root).getPropertyValue("--marquee-pace").trim();
    return parseFloat(raw) || options.pace || 11;
  }

  /* offsetWidth, not getBoundingClientRect(): the track is mid-animation
     almost always, and a rect would describe where it currently is rather
     than how wide it is. Layout width ignores the transform. */
  function measure() {
    const width = track.offsetWidth;
    const viewport = window.innerWidth || 1;
    if (!width) return;
    root.style.setProperty("--marquee-duration", `${(width / viewport) * pace()}s`);
  }

  measure();

  /* A resize changes the viewport term; a font swap changes the width term.
     Both have to re-derive it, or the pace drifts from what the token says. */
  window.addEventListener("resize", measure);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measure).catch(() => {});
  }
  // Translating the page can change every word's width at once.
  document.addEventListener("languagechange", measure);

  return {
    measure,
    destroy: () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("languagechange", measure);
    },
  };
}

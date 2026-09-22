/* ==========================================================================
   SCENE POWER  ·  not rendering what nobody is looking at
   --------------------------------------------------------------------------
   Two WebGL scenes run on a project page: the fixed eye behind everything, and
   the galleon in the Explore chapter. The galleon already stops when its
   section leaves the screen. The eye never stopped for anything except the tab
   being switched away — and on a case study that is most of the visit, because
   almost every section on the page lays opaque black over it on purpose.

   Measured on the Treasure Within page at 1440x900: the six opaque sections
   merge into three stretches of ground, 1452-3255, 4593-8893 and 10635-11084,
   and a 900px window sits wholly inside one of them for 35.8% of the 12,908px
   the page scrolls. For more than a third of the visit the eye was rendering a
   model, a shader, a light rig and a dust field into a canvas behind an opaque
   black floor.

   WHAT COUNTS AS COVERED
   Sealed sections paint solid --color-bg from their own top edge to their own
   bottom edge; the soft bands above and below them are drawn OUTSIDE the box
   (see .seals::before / ::after in style.css) and are the part where the eye
   is meant to show through. So the eye is hidden exactly when the viewport
   lies entirely inside the union of those boxes.

   AND IT IS CHECKED AGAINST NUMBERS, NOT AGAINST LAYOUT.
   Every offset is measured once, on setup and on resize, and scrolling then
   compares integers. Reading getBoundingClientRect() on every scroll event
   would be a forced layout on the one thread that must not stall, in aid of
   saving work — which is how a performance fix becomes a performance bug.

   CONSERVATIVE BY CONSTRUCTION. Anything this is unsure about, it treats as
   visible: a section whose background is not fully opaque is not counted as
   ground, and an empty list means the eye simply never pauses. The failure it
   refuses to have is a frozen eye in plain view.
   ========================================================================== */

/* Sections that lay opaque ground. `.seals` is the shared class; `.about` and
   `.work` predate it and carry their own copies of the same three rules. The
   list is a starting point only — each candidate is then asked whether it is
   actually opaque, so a section that stops sealing stops counting here too
   without anybody remembering to edit this line. */
const GROUND = ".seals, .about, .work";

/** Fully opaque means alpha 1. Anything else, including a colour the browser
 *  reports as transparent, is something the eye can be seen through. */
function isOpaque(el) {
  const bg = getComputedStyle(el).backgroundColor;
  const m = bg.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return false;
  const parts = m[1].split(",").map((n) => parseFloat(n));
  return parts.length < 4 || parts[3] >= 1;
}

/**
 * Pause `eye` whenever the viewport is entirely inside opaque ground.
 *
 * @param {{ setRunning: (on: boolean) => void }} eye
 * @param {{ on: Function }} [lenis] the smooth-scroll instance, if there is
 *        one. Its scroll event is already firing; using it means this adds no
 *        second listener to the same gesture.
 * @returns {{ refresh: () => void, destroy: () => void } | null}
 */
export function initScenePower(eye, lenis) {
  if (!eye || typeof eye.setRunning !== "function") return null;

  /** @type {{ top: number, bottom: number }[]} merged, sorted document ranges */
  let ranges = [];
  let covered = null;              // last state pushed to the eye

  function measure() {
    const bands = [...document.querySelectorAll(GROUND)]
      .filter(isOpaque)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        return { top, bottom: top + r.height };
      })
      .sort((a, b) => a.top - b.top);

    /* Merged, because consecutive sealed sections butt directly against each
       other (.seals + .seals has no gap and no band between them). Two
       touching boxes are one stretch of ground, and testing them separately
       would find a seam that is not there. */
    ranges = [];
    for (const b of bands) {
      const last = ranges[ranges.length - 1];
      if (last && b.top <= last.bottom + 1) last.bottom = Math.max(last.bottom, b.bottom);
      else ranges.push({ ...b });
    }
    check();
  }

  function check() {
    const top = window.scrollY;
    const bottom = top + window.innerHeight;
    /* Inside ONE range, not inside the union of several: the ranges are
       already merged, so anything spanning two of them has a gap between. */
    const hidden = ranges.some((r) => r.top <= top && r.bottom >= bottom);
    if (hidden === covered) return;          // nothing to say
    covered = hidden;
    eye.setRunning(!hidden);
  }

  /* The scroll signal. Lenis is already ticking every frame and already has
     listeners, so riding it costs nothing; the native event is the fallback
     for a page without smooth scroll. */
  let offScroll = null;
  if (lenis && typeof lenis.on === "function") {
    lenis.on("scroll", check);
    offScroll = () => lenis.off?.("scroll", check);
  } else {
    window.addEventListener("scroll", check, { passive: true });
    offScroll = () => window.removeEventListener("scroll", check);
  }

  /* Re-measured when the page changes shape. Images and video arriving late
     move everything below them, and a stale range would pause the eye over
     ground that is no longer there. */
  const ro = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
  ro?.observe(document.body);
  window.addEventListener("resize", measure);

  measure();

  return {
    refresh: measure,
    destroy() {
      offScroll?.();
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      eye.setRunning(true);        // never leave it stopped
    },
  };
}

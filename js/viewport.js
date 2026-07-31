/* ==========================================================================
   VIEWPORT  ·  one answer to "is this a phone?", shared by every module
   --------------------------------------------------------------------------
   Several behaviours have to change on a phone: the eye stops chasing a cursor
   that does not exist, the statement stops being a hover reveal, the card rail
   stops being driven by scroll. Each of those used to be a guess made locally
   (an innerWidth check here, a touch sniff there), which is how two modules end
   up disagreeing about what "mobile" means at 769px.

   TWO SEPARATE QUESTIONS, DELIBERATELY NOT ONE

     isCompact()  a NARROW SCREEN. Layout: the hamburger, the stacked cards,
                  the single-column HUD. Matches the CSS breakpoint exactly, so
                  markup and script can never disagree about which one is on.

     isTouch()    NO HOVER AVAILABLE. Interaction: anything built on a cursor.
                  A narrow desktop window still has a pointer and can still
                  play the hover reveal; a tablet in landscape is wide and
                  cannot. Width is the wrong test for this, hover is the right
                  one.

   BREAKPOINT is exported so the CSS value lives in exactly one place in JS
   too. Change it here and in the @media rules together.
   ========================================================================== */

export const BREAKPOINT = "48rem";      // 768px — matches css/style.css

const compactQuery = window.matchMedia(`(max-width: ${BREAKPOINT})`);
const touchQuery = window.matchMedia("(hover: none)");

/** Narrow screen: use for LAYOUT decisions. */
export function isCompact() { return compactQuery.matches; }

/** No hover: use for INTERACTION decisions built on a cursor. */
export function isTouch() { return touchQuery.matches; }

/* Subscribe to a change. Rotating a phone or dragging a desktop window across
   the breakpoint fires this, so a module can rebuild rather than being stuck
   in whichever mode it happened to boot in. Returns an unsubscribe. */
export function onCompactChange(cb) {
  const handler = (e) => cb(e.matches);
  compactQuery.addEventListener("change", handler);
  return () => compactQuery.removeEventListener("change", handler);
}

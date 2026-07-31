/* ==========================================================================
   HORIZONTAL SCROLL  ·  pinned sideways section (reusable across pages)
   --------------------------------------------------------------------------
   Turns a stretch of vertical scrolling into sideways movement, then hands
   vertical scrolling back. Works on any section shaped like:

     <section data-hscroll>
       <div data-hscroll-stage>          ← sticky, one viewport tall
         <div data-hscroll-track> … </div>
       </div>
     </section>

   The module writes exactly two custom properties and nothing else:
     --h-distance : how far the track must travel, in px
     --h-progress : 0 → 1 through the section
   CSS turns those into the section's height and the track's transform, which
   is what keeps the whole thing responsive — re-measuring on resize is enough.

   WHY MAPPED, NOT HIJACKED
     Intercepting wheel/touch events to force sideways motion breaks trackpad
     inertia, keyboard paging, and screen readers. Mapping the scroll position
     keeps the page a normal scrollable document; it also means the smooth
     scroll library keeps working untouched.

   The progress maths itself lives in scroll-progress.js — shared with the
   About choreography and the sinking eye rather than reimplemented here.
   ========================================================================== */

import { trackScrollProgress } from "./scroll-progress.js?v=72";

export function initHorizontalScroll(section, options = {}) {
  if (!section) return null;
  const stage = section.querySelector("[data-hscroll-stage]");
  const track = section.querySelector("[data-hscroll-track]");
  if (!stage || !track) return null;

  // Below this width there is no sideways RAIL — a pinned horizontal strip is
  // miserable to swipe on a phone, and the cards become a snap-scrolling deck
  // instead (card-carousel.js). The PROGRESS still runs though: the phone
  // choreographs the same section from the same number, just into different
  // moves. So `minWidth` gates the distance, never the tracking.
  const minWidth = options.minWidth ?? 768;

  let distance = 0;
  let railed = false;

  /* --- Measure: how far must the track travel? ------------------------- */
  function measure() {
    railed = window.innerWidth >= minWidth;

    if (!railed) {
      // No rail: the track must not be translated. Removing the property
      // rather than zeroing it lets the CSS fall back to its own `0px`.
      section.style.removeProperty("--h-distance");
      distance = 0;
    } else {
      // scrollWidth is the full row; the stage is what's visible.
      distance = Math.max(0, track.scrollWidth - stage.clientWidth);
      section.style.setProperty("--h-distance", `${distance}px`);
    }
    tracker?.update();
  }

  /* --- Wiring: the progress maths is shared, not reimplemented --------- */
  const tracker = trackScrollProgress(section, {
    lenis: options.lenis,
    onUpdate: (progress) => {
      section.style.setProperty("--h-progress", progress.toFixed(4));
    },
  });

  window.addEventListener("resize", measure, { passive: true });

  // Card widths depend on fonts/images settling, so re-measure once loaded.
  if (document.readyState !== "complete") {
    window.addEventListener("load", measure, { once: true });
  }

  measure();
  return { measure, update: () => tracker?.update() };
}

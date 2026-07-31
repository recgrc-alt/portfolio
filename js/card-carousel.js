/* ==========================================================================
   CARD CAROUSEL  ·  the phone's "A Quick Look"
   --------------------------------------------------------------------------
   On desktop the cards ride a rail that scroll drives sideways
   (horizontal-scroll.js). That trick needs a tall pinned section and a mouse
   wheel, and it has neither on a phone — so here the same cards become a
   swipeable deck: one centred at a time, with a row of dots underneath.

   IT IS A NATIVE SCROLLER, NOT A DRAG HANDLER
   The track is `overflow-x: auto` with scroll snapping, and this file only
   listens. That means the fling, the rubber-banding at the ends and the
   snapping are the ones the operating system already does — which no
   hand-written touch handler ever quite matches, and which stays correct when
   someone uses a keyboard or a trackpad instead. All this adds is the dots,
   and keeping them in step.

   Above the breakpoint it never initialises, so the desktop rail is untouched.
   ========================================================================== */

import { isCompact, onCompactChange } from "./viewport.js?v=63";

export function initCardCarousel(track, { dotsHost } = {}) {
  if (!track) return null;

  const cards = [...track.children];
  if (cards.length < 2) return null;

  let dots = [];
  let current = -1;
  let built = false;

  /* --- The dots ---------------------------------------------------------- */

  function build() {
    if (built || !dotsHost) return;
    dotsHost.replaceChildren(...cards.map((card, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "quick-dots__dot";
      // The card's own heading names the dot, so the control says where it
      // goes rather than "slide 3 of 4".
      const name = card.querySelector(".card__title")?.textContent?.trim();
      dot.setAttribute("aria-label", name || `${i + 1}`);
      dot.addEventListener("click", () => {
        card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      });
      return dot;
    }));
    dots = [...dotsHost.children];
    built = true;
  }

  function mark(index) {
    if (index === current) return;
    current = index;
    dots.forEach((d, i) => {
      const on = i === index;
      d.classList.toggle("is-current", on);
      d.setAttribute("aria-current", String(on));
    });
  }

  /* --- Which card is centred -------------------------------------------- *
   * An observer against the TRACK, not the viewport: the card that is most
   * visible inside its own scroller is the one the dots should follow. A
   * scroll-position calculation would have to re-derive card widths on every
   * resize and would fight the snap animation; this just reports.
   *
   * THE RATIOS ARE REMEMBERED, NOT READ FROM THE BATCH.
   * A callback only carries the cards whose visibility just CHANGED. Picking
   * the best out of that batch alone gets it wrong in the ordinary case:
   * swiping left, the incoming card crosses 0.5 and arrives alone in its
   * batch, while the card still centred at 1.0 is not mentioned at all — so
   * the dot would jump forward the instant the next card peeked in. Keeping a
   * running ratio per card and choosing the maximum across ALL of them means
   * the dot only moves once the new card is genuinely the most visible one. */
  const ratios = new Map(cards.map((c) => [c, 0]));

  const watcher = new IntersectionObserver((entries) => {
    for (const e of entries) {
      ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
    }
    let best = -1;
    let bestRatio = 0;
    cards.forEach((card, i) => {
      const r = ratios.get(card) ?? 0;
      if (r > bestRatio) { bestRatio = r; best = i; }
    });
    if (best !== -1) mark(best);
  }, { root: track, threshold: [0, 0.25, 0.5, 0.75, 1] });

  function enable() {
    build();
    cards.forEach((c) => watcher.observe(c));
    mark(0);
  }

  function disable() {
    watcher.disconnect();
    if (dotsHost) dotsHost.replaceChildren();
    dots = [];
    built = false;
    current = -1;
    // Stale ratios would otherwise decide the first dot on the way back in,
    // using measurements taken at the old width.
    cards.forEach((c) => ratios.set(c, 0));
  }

  if (isCompact()) enable();
  // Rotating a phone, or dragging a desktop window across the breakpoint,
  // swaps between the rail and the deck rather than leaving whichever one
  // happened to be right at load.
  onCompactChange((compact) => (compact ? enable() : disable()));

  return { enable, disable, current: () => current };
}

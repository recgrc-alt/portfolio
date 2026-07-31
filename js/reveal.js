/* ==========================================================================
   REVEAL  ·  scroll-into-view animation (reusable across pages)
   --------------------------------------------------------------------------
   Adds `.is-visible` to every [data-reveal] element once it enters the
   viewport; CSS does the actual transition. One IntersectionObserver for the
   whole page — no per-frame scroll listeners — and each element is unobserved
   after it reveals, so the work stops once it is done.

   WHY THIS IS CALLABLE MORE THAN ONCE

   It used to collect its elements in a single querySelectorAll at boot. That
   is fine for markup shipped in the HTML, but every page that builds itself
   from data/projects.json creates its cards AFTER the fetch resolves — long
   after boot. Those elements were never observed, so they never got
   `.is-visible` and sat at opacity 0 forever: in the DOM, correctly sized,
   completely invisible.

   So the observer is created once and kept, and calling initReveal again
   simply hands it more elements. Anything that injects [data-reveal] markup
   calls it once it has finished building.
   ========================================================================== */

let observer = null;

function ensureObserver(options) {
  if (observer) return observer;

  observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);     // reveal once, then stop watching
      }
    },
    {
      threshold: options.threshold ?? 0.2,
      rootMargin: options.rootMargin ?? "0px 0px -10% 0px",
    }
  );

  return observer;
}

/* `root` scopes the search, so a module that has just built a subtree can pass
   it and register only its own elements. Already-revealed elements are skipped:
   re-observing them would be harmless but pointless. */
export function initReveal(root = document, options = {}) {
  const scope = root || document;
  const els = scope.querySelectorAll(options.selector ?? "[data-reveal]");
  if (!els.length) return observer;

  const obs = ensureObserver(options);
  els.forEach((el) => {
    if (!el.classList.contains("is-visible")) obs.observe(el);
  });
  return obs;
}

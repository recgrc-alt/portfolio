/* ==========================================================================
   REVEAL  ·  scroll-into-view animation (reusable across pages)
   --------------------------------------------------------------------------
   Adds `.is-visible` to every [data-reveal] element when it enters the
   viewport; CSS does the actual transition. It also owns the two things that
   have to happen at the instant a cover lifts — settleInView and
   replayEntrances, both below — because both answer the same question as the
   reveal does: when is a thing allowed to arrive. One IntersectionObserver for
   the whole page, and no per-frame scroll listeners anywhere.

   AND AN ENTRANCE CAN BE WATCHED TWICE.
   Elements used to be unobserved the moment they revealed: the animation was
   a one-off, and a reader who scrolled to the bottom and came back up found a
   finished page with nothing left to arrive. They stay observed now, and an
   element that ends up BELOW the viewport again is put back to its starting
   state so the next scroll down plays it properly. Only below — see rearm for
   why leaving the top alone is the whole point of the rule.

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

/* ONE OBSERVER PER CONFIGURATION, not one for the whole page.
 * This was a single shared instance, created on the first call and returned
 * unchanged to every call after it - which meant the `options` argument was
 * silently ignored from the second call onwards. Anything asking for a
 * different threshold or rootMargin quietly got the first caller's.
 *
 * That is not a theoretical fault. The About statement asks to rise only once
 * it is properly on screen, and it inherited the page-wide setting instead:
 * fired the moment a fifth of it touched the bottom edge, so it played its
 * whole entrance below the fold and was already finished by the time anybody
 * could see it. The effect was there and invisible, which is the worst of both.
 *
 * Keyed by the two values that define the behaviour, so callers asking for the
 * same thing still share one observer - which is what the original comment
 * about not making a new one per call was actually protecting. */
const observadores = new Map();

/* --- Revealing one thing, and revealing a group --------------------------
 * WHY A GROUP EXISTS AT ALL, because the stagger is what made it necessary.
 *
 * The stylesheet delays revealed SIBLINGS by 90ms each, so a set of things
 * arrives as a cascade rather than as a slab. That is right when the set
 * crosses into view together — a row of cards, a heading with its kicker.
 *
 * It is wrong, and measurably so, when the members cross SEPARATELY. A
 * chapter's paragraphs are spread down 800px of column: each one trips the
 * observer on its own as it comes up the screen, and then waits out a delay
 * that was calculated for a cascade it is not part of. Measured on the
 * Treasure Within page: the first paragraph appeared the moment it crossed,
 * the fourth appeared 270ms after it crossed, and the further down the
 * chapter the reader got the later the words seemed to arrive. Nothing was
 * broken; the delay was simply answering a question nobody had asked.
 *
 * So a container may be marked as the group instead. The observer watches
 * THAT, and when it crosses, everything inside arrives on one clock — which
 * is the situation the stagger was written for in the first place. The
 * members keep [data-reveal] so they still rest hidden and still cascade;
 * they are just no longer watched one by one.
 */
function show(el) {
  el.classList.add("is-visible");
  if (el.dataset.revealGroup === undefined) return;
  el.querySelectorAll("[data-reveal]").forEach((part) => {
    part.classList.add("is-visible");
  });
}

/* --- Putting an entrance back, so it can be watched twice ------------------
 * WHY THIS DOES NOT SIMPLY MIRROR show().
 * An element leaves the viewport in two different directions and they mean
 * opposite things. Scrolling DOWN past something takes it off the top: it has
 * been read, and resetting it there would make the page dismantle itself
 * behind the reader, with things fading out as they go. Scrolling back UP
 * past something puts it below the fold again: it is now ahead of the reader,
 * and the next scroll down should introduce it exactly as the first one did.
 *
 * So only the second case rearms. rootBounds is the observer's own root
 * rectangle, already measured for us, so this costs no layout of its own; on
 * the rare browser that hands back null we do nothing, which leaves the old
 * play-once behaviour rather than guessing.
 */
function rearm(entry) {
  const raiz = entry.rootBounds;
  if (!raiz) return;

  const abaixo = entry.boundingClientRect.top >= raiz.bottom;
  if (!abaixo) return;

  const el = entry.target;
  el.classList.remove("is-visible");
  if (el.dataset.revealGroup === undefined) return;
  el.querySelectorAll("[data-reveal]").forEach((part) => {
    part.classList.remove("is-visible");
  });
}

function ensureObserver(options) {
  const threshold = options.threshold ?? 0.2;
  const rootMargin = options.rootMargin ?? "0px 0px -10% 0px";
  const chave = `${threshold}|${rootMargin}`;

  const existente = observadores.get(chave);
  if (existente) return existente;

  const novo = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { show(entry.target); continue; }
        rearm(entry);
      }
    },
    { threshold, rootMargin }
  );

  observadores.set(chave, novo);
  return novo;
}

/* --- What is already on screen when the cover lifts -----------------------
 * THE BLACK GAP THIS FIXES.
 * [data-reveal] rests at opacity 0. The loading screen waits for the page to
 * be built and then fades away — but "built" is not "painted", and every
 * element in the first screen was still at zero with up to 450ms of stagger
 * delay in front of it. So the eye stopped turning, the cover cleared, and
 * what it cleared onto was black. The page then faded in afterwards, in front
 * of somebody who had already been told the loading was over.
 *
 * The reveal is a SCROLL gesture: it means "this arrived because you came to
 * it". Nothing in the first screen arrived that way — it was there before the
 * visitor did anything — so playing an arrival for it was always describing
 * something that did not happen. Here they are simply shown, instantly and
 * with the transition suppressed, while the cover is still up. The loading
 * screen fading away IS the entrance, and now it has a finished page behind it.
 *
 * Anything below the fold is untouched and still reveals on scroll.
 */
export function settleInView(root = document) {
  const scope = root || document;
  const near = [];

  scope.querySelectorAll("[data-reveal], [data-reveal-group]").forEach((el) => {
    if (el.classList.contains("is-visible")) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) near.push(el);
  });

  if (!near.length) return;

  near.forEach((el) => {
    el.classList.add("is-instant");
    show(el);
    /* Still observed afterwards, unlike before. Something shown instantly
       because it was already on screen must still be able to play properly
       later, when the reader has scrolled away and come back to it. */
    /* A GROUP'S MEMBERS NEED THE SUPPRESSION TOO. show() puts .is-visible on
       all of them at once; without .is-instant alongside it they would play
       the very entrance this function exists to skip, behind the cover, to
       nobody. They are added to `near` so the two-frame cleanup below lifts it
       from them as well. */
    if (el.dataset.revealGroup !== undefined) {
      el.querySelectorAll("[data-reveal]").forEach((part) => {
        part.classList.add("is-instant");
        near.push(part);
      });
    }
  });

  /* The suppression is lifted two frames later, once the browser has painted
     them at their final values. Removing it in the same frame would let the
     transition it was added to prevent run after all; leaving it on forever
     would quietly disable transitions on those elements for the rest of the
     visit. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    near.forEach((el) => el.classList.remove("is-instant"));
  }));
}

/* --- Entrances that were played to nobody ---------------------------------
 * THE OTHER HALF OF THE BLACK SCREEN, and on the home page it was the whole
 * of it.
 *
 * The hero's two title lines rest at opacity 0 and are brought up by a CSS
 * animation — 1.2s, the second delayed — that starts the moment the document
 * is parsed. The loading screen is on top of that from before the first frame
 * and lifts when the site is ready, and on a cached or fast load "ready" is
 * about 400ms. So the cover cleared while the title was a third of the way
 * through rising: an almost-transparent heading on black, finishing its
 * entrance in front of somebody who had just been shown a loading screen for
 * it. Measured on the home page — the two hero lines were the only things in
 * the first screen still invisible.
 *
 * Nothing here pauses or gates the animation. Gating it would mean that a
 * failure to un-gate leaves the title permanently invisible, which is a far
 * worse failure than the one being fixed. Instead the animation runs exactly
 * as it always did, and is simply SET BACK TO THE START at the moment the
 * page becomes visible — so it plays where it can be seen. If it had already
 * finished behind the cover, it plays again; nobody watched it the first time.
 *
 * Infinite animations are left alone: a loop has no entrance to replay. So is
 * anything inside a cover, which is still mid-fade when this runs.
 */
export function replayEntrances() {
  if (!document.getAnimations) return;
  const COVERS = "[data-loader], [data-page-veil]";

  document.getAnimations().forEach((anim) => {
    const el = anim.effect?.target;
    if (!el?.getBoundingClientRect || !el.closest) return;
    if (el.closest(COVERS)) return;

    if (anim.effect.getTiming?.().iterations === Infinity) return;

    const r = el.getBoundingClientRect();
    if (r.top >= window.innerHeight || r.bottom <= 0) return;

    try {
      anim.currentTime = 0;
      anim.play();
    } catch { /* an animation that will not rewind is left as it is */ }
  });
}

/* `root` scopes the search, so a module that has just built a subtree can pass
   it and register only its own elements. Already-revealed elements are skipped:
   re-observing them would be harmless but pointless. */
export function initReveal(root = document, options = {}) {
  const scope = root || document;
  const els = scope.querySelectorAll(
    options.selector ?? "[data-reveal], [data-reveal-group]"
  );
  if (!els.length) return null;

  const obs = ensureObserver(options);
  els.forEach((el) => {
    if (el.classList.contains("is-visible")) return;

    /* SOMEBODY ELSE'S CROSSING DECIDES THIS ONE. Anything living inside a
       group is revealed by that group and must not be watched on its own, or
       it arrives when it personally comes into view and the group turns back
       into a set of separate entrances — the bug this is here to fix.

       Groups nest: a chapter's copy is a group, and in the flank shape the
       band around it is a group too. The test is deliberately on ANY ancestor
       group and not only on plain members, so the outermost one is the single
       thing watched. `closest` from the element itself would match the element
       when it is a group, so the walk starts at the parent. */
    if (el.parentElement?.closest("[data-reveal-group]")) return;

    obs.observe(el);
  });
  return obs;
}

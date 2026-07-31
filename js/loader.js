/* ==========================================================================
   LOADER  ·  the eye that turns while the site arrives
   --------------------------------------------------------------------------
   A black screen with the eye rotating on its own axis and three dots
   counting under it, held until the page is genuinely ready, then faded out to
   reveal what was behind it.

   ONCE PER VISIT, NOT ONCE PER PAGE
   It shows on the first page of a session and not again. Every navigation here
   is a full document load, so a loader wired to "page loads" would put a
   loading screen between every single click — which is not a first impression,
   it is a toll booth. Later navigations get the black wipe instead
   (page-transition.js), which is the same idea at a tenth of the length.

   WHAT "READY" MEANS
   window.load — every image, font and script accounted for — plus a floor of
   MIN_MS so a fast connection does not flash the thing for 80ms, and a ceiling
   of MAX_MS so a stalled asset can never hold the site hostage. The CSS carries
   the same ceiling as an animation, so even a JavaScript failure cannot leave
   anyone stuck behind it.
   ========================================================================== */

import { i18nReady } from "./i18n.js?v=72";
import { pageReady } from "./page-ready.js?v=72";

const SEEN_KEY = "re.loaded";
/* A floor, so a cached second visit does not flash the screen for 80ms and
   read as a glitch. It used to be 900, chosen when this waited for almost
   nothing and the risk really was a flash. Now it waits for the page to be
   BUILT — so on any real connection the content is the slow part and this
   floor is pure delay stacked on top of it. Measured locally: everything was
   ready at 280ms and the cover still sat there until 1103ms.

   400 is still clearly deliberate rather than a stutter, and it stops the
   loader charging for time the site no longer needs. */
const MIN_MS = 400;
const MAX_MS = 6000;     // hard stop: the site is more use than the animation

export function initLoader(el) {
  if (!el) return null;

  // Second page of the session: nothing to do, and the markup removes itself
  // so it can never intercept a click.
  if (alreadySeen()) { el.remove(); return null; }
  remember();

  keepEyeAlive(el);

  const started = performance.now();
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    el.classList.add("is-done");
    // Taken out of the DOM once the fade has played, rather than left as an
    // invisible full-screen layer over the page.
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    // Backstop for a browser that never fires transitionend (a hidden tab,
    // reduced motion). Comfortably past --loader-out, not a second guess at it.
    setTimeout(() => el.remove(), 900);
  }

  function finishWhenDue() {
    const waited = performance.now() - started;
    setTimeout(finish, Math.max(0, MIN_MS - waited));
  }

  /* Three conditions, not one.

       load        every file the MARKUP referenced has arrived
       i18nReady   the words are in the language that was asked for
       pageReady   the page has finished building its actual content

     The third is the one that was missing, and on a gallery it was the only
     one that mattered. `load` is satisfied by a document whose cards do not
     exist yet — they are built from JSON by a module fetched on demand — so
     the cover lifted on a title and a footer and the work appeared afterwards,
     in front of the visitor. Now the eye keeps turning until there is a whole
     page behind it.

     All three settle on their own and none of them rejects, so waiting on them
     cannot strand anyone — and MAX_MS below is the last net regardless. */
  const loaded = document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((r) => window.addEventListener("load", r, { once: true }));

  Promise.all([loaded, i18nReady, pageReady()]).then(finishWhenDue);

  setTimeout(finish, MAX_MS);
  return { finish };
}

/* THE EYE, AND WHAT HAPPENS IF ITS VIDEO IS NOT THERE
   The turning eye is a WebM with a real transparent background, which is the
   one format that keeps the cut-out at a sane weight. Two things can go wrong:
   the file may not have been added yet, and autoplay can be refused. Either way
   the answer is the same — fall back to the animated WebP, which is a plain
   <img> and so is subject to neither problem.

   Worth doing rather than assuming: a loading screen showing nothing at all is
   worse than the site simply appearing with no loading screen. */
/* A still eye, not a second animation. The turning loop exists once, as the
   WebM; keeping an animated copy in another format would mean re-exporting two
   files every time the render changes and quietly letting them drift apart.
   When the video cannot play, the dots underneath still count — so the screen
   is visibly alive without the eye having to move. */
const FALLBACK = "assets/loading-eye-still.webp";

function keepEyeAlive(root) {
  const video = root.querySelector("[data-loader-eye]");
  if (!video) return;

  let swapped = false;
  function swap() {
    if (swapped) return;
    swapped = true;
    const img = new Image();
    img.className = video.className;
    img.src = FALLBACK;
    img.alt = "";
    img.width = 200;
    img.height = 200;
    video.replaceWith(img);
  }

  // Fires when no <source> could be used at all.
  video.addEventListener("error", swap, { once: true });
  // A <source> that 404s does not bubble an error to the video in every
  // browser, so listen on the source too.
  video.querySelectorAll("source").forEach((s) => {
    s.addEventListener("error", swap, { once: true });
  });

  const played = video.play?.();
  if (played?.catch) played.catch(swap);
}

/* sessionStorage, not localStorage: the loader should return on a new visit,
   just not between pages of the same one. Both are guarded — a browser with
   storage blocked simply shows it every time rather than throwing. */
function alreadySeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; }
  catch { return false; }
}

function remember() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* not persisted */ }
}

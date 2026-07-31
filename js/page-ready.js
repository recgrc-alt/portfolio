/* ==========================================================================
   PAGE READY  ·  what "the page has arrived" actually means
   --------------------------------------------------------------------------
   The loading screen used to lift on `window.load`, which sounds right and is
   not. `load` means every file referenced BY THE MARKUP has arrived — and on
   this site the markup of a gallery is almost empty. The nineteen cards are
   built afterwards, from a JSON file fetched by a module that is itself loaded
   on demand. So the cover came away over a page holding a title and a footer,
   and the work appeared a moment later, in front of the visitor.

   That is the wrong order for a portfolio: the one thing the page exists to
   show is the last thing to arrive, and it arrives unannounced.

   So a page can say "I am not finished". Anything that builds real content
   registers itself here, and the loading screen waits for all of them before
   uncovering. The eye keeps turning; the page appears complete.

   NOTHING HERE CAN STRAND THE VISITOR
   Every hold is caught, so a failed fetch counts as finished rather than
   hanging. Holds registered late — a module still downloading when the first
   batch settles — are picked up by re-checking, but only until the ceiling.
   Past that the page is shown regardless of what is still in flight. A cover
   that waits forever is worse than a page that arrives incomplete.
   ========================================================================== */

const holds = [];
const CEILING_MS = 5000;

/* --- Why a seal, and not just "wait for the holds" -----------------------
 * The first version asked whether anything was holding the page and, finding
 * an empty list, said yes immediately — because the loader asks at the top of
 * boot() and the page modules register a few lines further down. It waited for
 * nothing at all.
 *
 * On a fast connection that was invisible: the gallery still arrived before
 * the loader's own minimum, so the timing looked right for the wrong reason.
 * On a real one the cover lifted on an empty page and the work appeared into
 * a black screen, which is the bug this file was written to prevent.
 *
 * So "nothing is holding it" is only meaningful once registration is over.
 * boot() says when that is. */
let sealed = false;
let openSeal;
const sealedPromise = new Promise((resolve) => { openSeal = resolve; });

/* Called once, at the end of boot(), when every page branch has had its turn
   to register. Idempotent. */
export function sealPage() {
  if (sealed) return;
  sealed = true;
  openSeal();
}

/* Register something that has to finish before the page is worth showing.
   Takes a promise, or anything a promise can be made from. Rejections are
   swallowed on purpose: this asks "is it still working?", not "did it work?" */
export function holdPage(work) {
  holds.push(Promise.resolve(work).catch(() => {}));
  return work;
}

/* Resolves when nothing is left holding the page — or when the ceiling is
   reached, whichever comes first. Never rejects. */
export function pageReady() {
  return Promise.race([
    settleAll(),
    new Promise((resolve) => setTimeout(resolve, CEILING_MS)),
  ]);
}

/* Waits for the current holds, then looks again: a page module that is still
   downloading when this starts will not have registered yet, and the whole
   point is to wait for the content it is about to build. Loops until a pass
   adds nothing new, which is the only honest definition of "done". */
async function settleAll() {
  // Nothing counts until registration is closed, or an empty list at the top
  // of boot() reads as "finished" when it only means "not started".
  await sealedPromise;

  let seen = -1;
  while (holds.length !== seen) {
    seen = holds.length;
    await Promise.all(holds);
  }
}

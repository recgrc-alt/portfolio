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
/* --- ONE MEASUREMENT PASS FOR THE WHOLE PAGE ------------------------------
 * Two costs used to compound here, and together they were most of a frame.
 *
 * BOTH EVENTS FIRED. With Lenis driving the real document, the native scroll
 * event and Lenis's own both arrive on every frame, and each one used to run
 * the entire measurement again. Twice the work for the same answer: the page
 * cannot be at two scroll positions in one frame.
 *
 * AND THEY INTERLEAVED READS WITH WRITES. A measurement READS
 * getBoundingClientRect and offsetHeight; the callback then WRITES a custom
 * property. A write invalidates layout, so the next tracker's read has to make
 * the browser rebuild it before it can answer. Two trackers firing from two
 * events is four forced layouts a frame, in the worst possible order, on a
 * document nothing had actually changed the shape of. That is the classic
 * cause of scrolling that feels mechanical rather than fluid, and it gets
 * worse the slower the machine and the longer the page.
 *
 * The fix is both halves at once. `medirTodos` refuses to do anything twice at
 * the same scroll position, which removes the duplicate outright. And when it
 * does run it reads EVERY tracker before letting any of them write, so the
 * browser computes layout once and every read after that is free.
 *
 * No rAF and no deferral, deliberately: this still runs inside the scroll
 * event, in the same frame, so nothing here can put an effect a frame behind
 * the scroll it belongs to. */
const registados = new Set();
const ligadoAoLenis = new WeakSet();
let ultimoY = null;

function progressoDe(section) {
  const rect = section.getBoundingClientRect();
  const travel = section.offsetHeight - window.innerHeight;
  return travel > 0 ? clamp01(-rect.top / travel) : 0;
}

function medirTodos() {
  // The same position cannot produce a different answer. This is what turns
  // two events per frame back into one measurement.
  const y = window.scrollY;
  if (y === ultimoY) return;
  ultimoY = y;

  // Read all...
  const medido = [];
  for (const t of registados) medido.push([t, progressoDe(t.section)]);
  // ...then write. Splitting the two is the whole point of this function.
  for (const [t, p] of medido) t.onUpdate(p, t.section);
}

/* A resize changes the answer without changing the scroll position, so it has
   to get past the guard above rather than be swallowed by it. */
function remedir() {
  ultimoY = null;
  medirTodos();
}

export function trackScrollProgress(section, { onUpdate, lenis } = {}) {
  if (!section || typeof onUpdate !== "function") return null;

  function update() {
    onUpdate(progressoDe(section), section);
  }

  /* ALWAYS listen to the native scroll event. It is the browser's source of
     truth and fires whenever the scroll position changes — including while
     Lenis is smoothly driving it, because Lenis scrolls the real document
     rather than faking it with a transform. Relying on lenis.on ALONE was the
     bug: that event is emitted from Lenis's own rAF tick, so anything that
     stops the tick (a background tab, an init-order hiccup) froze every
     scroll-driven effect even though the page was still scrolling.

     Lenis's own event is subscribed to as well when present. Both now call
     `medirTodos`, which is guarded, rather than measuring on their own — see
     the block above it for what that guard is for.

     The two window listeners are registered per tracker and that is fine:
     addEventListener drops a duplicate (type, listener, capture), and every
     tracker passes the SAME function, so however many trackers a page has
     there is exactly one native scroll listener. Lenis's emitter makes no such
     promise, hence the flag. */
  registados.add({ section, onUpdate });
  window.addEventListener("scroll", medirTodos, { passive: true });
  window.addEventListener("resize", remedir, { passive: true });
  if (lenis && typeof lenis.on === "function" && !ligadoAoLenis.has(lenis)) {
    ligadoAoLenis.add(lenis);
    lenis.on("scroll", medirTodos);
  }

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

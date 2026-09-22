/* ==========================================================================
   DRAG SCROLL  ·  the gesture the hero has been promising
   --------------------------------------------------------------------------
   The cover says "Drag / Scroll to explore". Scroll worked. Drag never
   existed: nothing in this site listened for it, and Lenis has no option for
   it either, so on a desktop half of that sentence was an instruction to do
   something the page could not do.

   It behaves like grabbing the page rather than pushing a scrollbar: pull the
   surface UP and the page moves down, which is the same direction a finger
   does on a phone. On a touch screen this module does nothing at all, because
   the browser already provides exactly this.

   THREE THINGS IT MUST NOT BREAK, and each one shapes the code below.

     CLICKING.  A click begins with the same pointerdown a drag does. So the
     gesture is not claimed until the pointer has actually travelled, and until
     it is claimed nothing is prevented. Below the threshold this module never
     happened, and the link underneath gets its click.

     SELECTING TEXT.  Same conflict, same answer, plus one more: once the drag
     IS claimed, the selection that was starting is cleared and further
     selection is suppressed for the length of the gesture. Otherwise the page
     scrolls with a blue smear of half-selected paragraphs behind it.

     ANYTHING THAT DRAGS ON ITS OWN.  The 3D viewers turn a model, the card
     rail moves sideways, a range input slides. All of them are reached by the
     same pointerdown. They are excluded by asking the DOM rather than by
     listing coordinates: an interactive element, or anything inside a region
     already marked data-lenis-prevent, is left entirely alone.

   TABLE OF CONTENTS
     1. WHAT IS OFF LIMITS
     2. THE GESTURE
     3. THE THROW
   ========================================================================== */

/* How far the pointer must travel before this is a drag and not a click. Small
   enough to feel immediate, large enough that a hand resting on a link does
   not steal the click from it. */
const LIMIAR_PX = 6;

/* The throw after release. SAMPLE_MS is the window the speed is measured over:
   too short and a single jittery frame decides the whole gesture, too long and
   a pause before letting go still throws the page. COAST_MS is how long that
   speed is allowed to keep running, which is what turns a flick into distance
   rather than a multiplier nobody can predict. */
const SAMPLE_MS = 90;
const COAST_MS = 260;
const THROW_MAX_PX = 1400;
const THROW_DUR_S = 0.85;

/* Elements that own the pointer themselves. Asked as a selector so the answer
   comes from the markup, the same way the form's validation rules do. */
const INTOCAVEL = [
  "a[href]", "button", "input", "textarea", "select", "label", "summary",
  "video", "canvas",                    // the 3D stages and the eye
  "[contenteditable]",
  "[data-lenis-prevent]",               // regions that handle their own wheel
  "[data-no-drag]",                     // an explicit opt-out for anything else
].join(",");


/**
 * @param {object} lenis the smooth-scroll instance
 * @returns {{destroy: Function}|null} null where the gesture does not apply
 */
export function initDragScroll(lenis) {
  if (!lenis || typeof lenis.scrollTo !== "function") return null;

  /* A touch screen already does this, natively, better. Asked as a pointer
     question rather than a width one, for the reason viewport.js gives: a
     narrow desktop window still has a mouse. */
  if (window.matchMedia("(hover: none)").matches) return null;

  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  const raiz = document.documentElement;

  let activo = false;        // pointer is down somewhere draggable
  let arrastando = false;    // ...and has passed the threshold
  let idPonteiro = null;
  let inicioY = 0;
  let inicioScroll = 0;
  let amostras = [];         // {t, y} for the throw


  /* ======================================================================
     1. WHAT IS OFF LIMITS
     ====================================================================== */

  function podeArrastar(evento) {
    if (evento.button !== 0 || !evento.isPrimary) return false;
    // A modifier means the visitor is doing something else entirely.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return false;
    return !alvo.closest(INTOCAVEL);
  }


  /* ======================================================================
     2. THE GESTURE
     ====================================================================== */

  function aoDescer(evento) {
    if (!podeArrastar(evento)) return;
    activo = true;
    arrastando = false;
    idPonteiro = evento.pointerId;
    inicioY = evento.clientY;
    inicioScroll = lenis.scroll ?? window.scrollY;
    amostras = [{ t: evento.timeStamp, y: evento.clientY }];
  }

  function aoMover(evento) {
    if (!activo || evento.pointerId !== idPonteiro) return;

    const percorrido = inicioY - evento.clientY;

    /* Not a drag yet. Nothing is prevented and nothing is scrolled, so a click
       or a text selection that started here is still entirely intact. */
    if (!arrastando) {
      if (Math.abs(percorrido) < LIMIAR_PX) return;
      arrastando = true;

      /* Claimed. From here the gesture belongs to the page.
         Pointer capture matters more than it looks: without it, moving off the
         window mid-drag stops the events and the page freezes half-thrown with
         the class still on. With it, the release always comes back here. */
      try { evento.target.setPointerCapture?.(idPonteiro); } catch { /* not capturable */ }
      raiz.classList.add("is-dragging");
      // The selection that was starting under the finger, before it becomes a
      // smear the length of the drag.
      window.getSelection?.()?.removeAllRanges?.();
    }

    // A drag is a direct gesture: the page should be exactly where the hand
    // put it, so no easing between the pointer and the scroll.
    lenis.scrollTo(inicioScroll + percorrido, { immediate: true, force: true });

    amostras.push({ t: evento.timeStamp, y: evento.clientY });
    // Only the tail is ever read; anything older cannot affect the throw.
    while (amostras.length > 2 && evento.timeStamp - amostras[0].t > SAMPLE_MS) {
      amostras.shift();
    }

    // Suppressing the default is what stops the browser from selecting and
    // from starting its own image drag. Only ever after the gesture is claimed.
    evento.preventDefault();
  }


  /* ======================================================================
     3. THE THROW
     ====================================================================== */

  function aoLargar(evento) {
    if (!activo || (evento && evento.pointerId !== idPonteiro)) return;
    const arrastava = arrastando;
    activo = false;
    arrastando = false;
    idPonteiro = null;
    raiz.classList.remove("is-dragging");
    if (!arrastava) return;                     // it was a click after all

    if (semMovimento.matches) return;           // stop where it was let go

    const primeiro = amostras[0];
    const ultimo = amostras[amostras.length - 1];
    const dt = ultimo && primeiro ? ultimo.t - primeiro.t : 0;
    if (dt <= 0) return;

    // px per ms, in the same direction the scroll moves.
    const velocidade = (primeiro.y - ultimo.y) / dt;
    const lancamento = Math.max(-THROW_MAX_PX, Math.min(THROW_MAX_PX, velocidade * COAST_MS));
    if (Math.abs(lancamento) < 8) return;       // a slow release should just stop

    lenis.scrollTo((lenis.scroll ?? window.scrollY) + lancamento, {
      duration: THROW_DUR_S,
      // Quintic ease-out: leaves fast, settles softly, and never overshoots.
      easing: (t) => 1 - Math.pow(1 - t, 5),
    });
  }

  /* pointerup is the normal end. pointercancel is the system taking the
     pointer away. blur covers a release that lands on the browser's own
     chrome, which fires neither — the same three-way cover cursor.js uses on
     its press state, and for the same reason: a gesture that can get stuck on
     is worse than one that ends early. */
  document.addEventListener("pointerdown", aoDescer, { passive: true });
  document.addEventListener("pointermove", aoMover, { passive: false });
  document.addEventListener("pointerup", aoLargar, { passive: true });
  document.addEventListener("pointercancel", aoLargar, { passive: true });
  window.addEventListener("blur", () => aoLargar(null));

  return {
    destroy() {
      document.removeEventListener("pointerdown", aoDescer);
      document.removeEventListener("pointermove", aoMover);
      document.removeEventListener("pointerup", aoLargar);
      document.removeEventListener("pointercancel", aoLargar);
      raiz.classList.remove("is-dragging");
    },
  };
}

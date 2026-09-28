/* ==========================================================================
   CURSOR  ·  a small ring that follows the pointer, and says what is under it
   --------------------------------------------------------------------------
   A ring that trails the real pointer and changes as it passes over things:
   it swells on anything clickable, and over the 3D eye it opens into a word.

   WHY THE NATIVE CURSOR IS ONLY HIDDEN FROM SCRIPT
   `cursor: none` lives on a class this file adds, never in the stylesheet on
   its own. If the module fails to load, throws, or is skipped — a touch
   screen, reduced motion, an old browser — the class is never added and the
   visitor keeps the arrow their operating system gave them. A stylesheet that
   hides the cursor unconditionally is one broken script away from a page you
   cannot point at.

   IT LAGS, ON PURPOSE
   The ring eases toward the pointer instead of being pinned to it. Pinned, it
   is just a worse arrow; a little lag is what makes it read as an object
   following you. The label, when there is one, is pinned rather than eased —
   text sliding into place is harder to read than text that is simply there.

   ONE rAF LOOP, AND ONLY WHILE IT MATTERS
   The loop stops itself once the ring has caught up and nothing has moved,
   and the pointermove listener starts it again. An idle tab costs nothing.

   WHAT IT SAYS, AND WHY IT IS TRANSLATED
   Over the eye: "LOOK", because that is what the eye does — it follows you.
   It is not draggable and never was, so a ring reading DRAG would be the
   interface promising a gesture that does not exist. Over a project card:
   "VIEW", the one thing a card is for. Over the galleon: "TURN", which IS a
   gesture it has. Over somebody standing on its deck: "WHO", which is the
   question pressing them answers.

   AND THE RING IS TWO SIZES, on a rule rather than a whim. The flat page -
   the eye, a card - opens to 2.75rem: these are things to read or to open.
   The 3D scene - the ship, a crew member - opens to 3rem, because those are
   things the hand can move, and a ring that grows a little further reads as
   having caught on something with give in it.

   Both come from the dictionaries rather than being written here. They are
   words a visitor reads, on a site that is entirely bilingual, and a ring
   answering in English over a Portuguese page is the one part of the
   interface that forgot which language it was speaking. They re-render on
   `languagechange` with everything else.
   ========================================================================== */

import { isTouch } from "./viewport.js?v=289";
import { t } from "./i18n.js?v=289";

/* Things that make the ring swell. Deliberately the same family the press
   tick answers to, plus the plain controls: what looks pressable, sounds
   pressable and now points pressable should be one list, not three. */
const HOT = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[role=button]",
  ".card-work",
  ".service__link",
  ".meta--time.is-pressable",

  /* THE LIST VIEW'S ROWS, which are the one thing on the site that is fully
     clickable without being a link. The anchor deliberately wraps only the
     project's name — an <a> around three table cells would be markup lying
     about its own structure, and the name is what the keyboard, a middle
     click and "copy link address" all need to land on — while work-list.js
     forwards a press anywhere on the row to it.

     So the row behaves like a link and contains one, and the ring found
     nothing over five sixths of it: measured, it answered over the name and
     went dead over the theme and the year. This is the row telling it
     otherwise.

     "hot" rather than "view", even though a row opens a project exactly as a
     card does. The VIEW ring is 2.75rem with a word in it, which is right over
     a card the size of a screen and wrong over one line of a table: it would
     sit on the name being read, once per row, all the way down nineteen of
     them. */
  ".work-list__table tbody tr",
].join(",");

const EASE = 0.18;          // how fast the ring closes the gap, per frame
const SETTLED = 0.4;        // px below which the chase is over

/* How strongly a small control pulls the ring toward its centre. Only small
   ones: on a nav link the pull reads as the ring catching; on anything the
   size of a project card the same pull would drag the ring away from where
   the hand actually is, which stops being magnetism and starts being error. */
const MAGNET = 0.35;
const MAGNET_MAX_W = 320;
const MAGNET_MAX_H = 160;

export function initCursor() {
  /* A finger has no hover and no cursor to replace, and reduced motion is a
     request not to have things trailing across the screen. Both keep the
     native pointer, and neither is a failure. */
  if (isTouch()) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  if (!window.matchMedia("(pointer: fine)").matches) return null;

  const root = document.createElement("div");
  root.className = "cursor";
  root.setAttribute("aria-hidden", "true");   // decoration; a reader ignores it

  /* AN SVG CIRCLE, NOT A ROUNDED BOX — and the radius is what animates.
     The ring used to be a div with border-radius: 50%, grown by transitioning
     width, height and margin. Three layout properties on every frame, each
     landing on a fraction of a pixel, and the browser re-rasterising a
     one-pixel curve at 37.4px, then 38.1px, then 38.9px. That is the wobble:
     it was never the same circle twice.

     An SVG circle is drawn by the vector rasteriser from its radius. `r` is a
     real CSS property, so it transitions — and because NOTHING is scaled, the
     stroke stays exactly one pixel at every size and the curve is computed
     fresh and true each time instead of being stretched from a cached one.
     The box never changes size either, so there is no layout at all. */
  const NS = "http://www.w3.org/2000/svg";
  const ring = document.createElementNS(NS, "svg");
  ring.setAttribute("class", "cursor__ring");
  ring.setAttribute("aria-hidden", "true");

  const disc = document.createElementNS(NS, "circle");
  disc.setAttribute("class", "cursor__disc");
  ring.append(disc);

  const label = document.createElement("span");
  label.className = "cursor__label";

  /* --- The site's own timing, read once ----------------------------------
   * Two states can share a radius - the galleon and a crew member are both
   * 3rem - and when they do, the only thing that changed was the word, which
   * swapped instantly and was easy to miss entirely. So a crossing gets a
   * beat: the ring dips and comes back, and the word rolls out and in inside
   * that dip, which is also why the old word is never seen leaving with the
   * new one's meaning.
   *
   * The numbers come from tokens.css rather than from here. A cursor that
   * moved on its own clock would be the one part of the interface not
   * agreeing with the rest about how fast this site is. */
  const raizCss = getComputedStyle(document.documentElement);
  const emMs = (nome, senao) => {
    const bruto = raizCss.getPropertyValue(nome).trim();
    const n = parseFloat(bruto);
    if (!Number.isFinite(n)) return senao;
    return bruto.endsWith("ms") ? n : n * 1000;
  };
  /* --dur-base, and --ease-inout rather than --ease-out. The first version of
     this ran on the fast duration and the settling curve, and both were wrong
     for a movement that goes out and comes back: --ease-out spends nearly all
     its travel in the first few frames, so the ring appeared to snap shut and
     then wait. A symmetric gesture wants a symmetric curve, and twice the time
     to make it in. */
  const BATIDA = emMs("--dur-base", 400);
  const CURVA = raizCss.getPropertyValue("--ease-inout").trim()
    || "cubic-bezier(0.65, 0, 0.35, 1)";

  /* One crossing at a time. Going ship → person → ship quickly must not leave
     two swaps fighting over the same word - nor a beat still holding the old
     radius while the ring is already on its way to a new one. An animation
     outranks a transition for as long as it runs, so a beat left playing
     across a crossing that DOES change size would pin `r` for its two hundred
     milliseconds and then drop it wherever the transition had got to. */
  let troca = null;
  let batida = null;

  /* The radius the ring is heading for, which is the custom property itself:
     it is not registered, so it never interpolates - only `r` does - and its
     computed value is the destination the moment the classes change. */
  const raioAlvo = () =>
    getComputedStyle(root).getPropertyValue("--cursor-r").trim() || "0.75rem";

  root.append(ring, label);
  document.body.append(root);
  document.documentElement.classList.add("has-cursor");

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let x = targetX;
  let y = targetY;
  let frame = 0;
  let state = "";                              // "", "hot", "eye"

  /* --- The display, and the line drawn on it -------------------------------
   * Two numbers the stylesheet cannot know: how many device pixels there are
   * per CSS pixel, and therefore how wide the stroke has to be to land on
   * whole ones. Both are re-read when the display changes under the window.
   */
  let dpr = window.devicePixelRatio || 1;
  let snap = (v) => Math.round(v * dpr) / dpr;

  /* THE STROKE, ROUNDED TO WHOLE DEVICE PIXELS.
     --cursor-stroke says how heavy the ring should read and lives with the
     other design decisions. This is the part that cannot live there: on a 1x
     display a 1.8px line covers one whole pixel and 80% of the next, so one
     edge is solid and the other is a smear, and the ring reads dirty on one
     side. Rounded to two, both edges are real.

     It answers both halves of "responsive" at once. It can never be thinner
     than one device pixel, so it cannot fade to a grey suggestion on a low
     density screen; and it always fills whole rows, so it cannot come out
     heavier or muddier than asked on a dense one.

     NOT SCALED WITH THE VIEWPORT, deliberately. The ring's RADIUS is in rem
     and does not grow on a large monitor, so a stroke that did would make the
     ring proportionally heavier the bigger the screen, which is the opposite
     of a constant-weight line. What changes between displays is density, not
     size, and density is precisely what dpr describes. */
  function measureStroke() {
    const cs = getComputedStyle(document.documentElement);
    const rootPx = parseFloat(cs.fontSize) || 16;
    const raw = cs.getPropertyValue("--cursor-stroke").trim();
    const wanted = raw.endsWith("rem") ? parseFloat(raw) * rootPx
                 : raw.endsWith("px") ? parseFloat(raw)
                 : 1.8;                            // token missing or unreadable

    const units = Math.max(1, Math.round(wanted * dpr));

    /* AND THE OFFSET FOLLOWS FROM THE WIDTH rather than being its own choice.
       A stroke is drawn centred on its path, so its edges land at
       centre +/- width/2. For those edges to fall on device-pixel boundaries
       the centre has to sit wherever width/2 leaves it: on a boundary when the
       width is an even number of device pixels, in the middle of one when it
       is odd. At a one-pixel stroke this reduces to the half-pixel offset that
       fixed the original serration — same rule, stated generally. */
    root.style.setProperty("--cursor-stroke-px", `${units / dpr}px`);
    root.style.setProperty("--cursor-nudge", `${((units / 2) % 1) / dpr}px`);
  }

  /* Dragged onto a second monitor, or the page zoomed: the ratio changes under
     a window that never resized, so no resize event fires. A media query
     pinned to the CURRENT ratio is the one thing that fires when it stops
     being current. */
  let ratioWatch = null;
  function watchRatio() {
    ratioWatch?.removeEventListener?.("change", onRatioChange);
    ratioWatch = window.matchMedia(`(resolution: ${dpr}dppx)`);
    ratioWatch.addEventListener?.("change", onRatioChange);
  }
  function onRatioChange() {
    dpr = window.devicePixelRatio || 1;
    snap = (v) => Math.round(v * dpr) / dpr;
    measureStroke();
    watchRatio();
    place(true);
  }

  measureStroke();
  watchRatio();

  /* --- Where it is written ------------------------------------------------
   * SUB-PIXEL WHILE IT MOVES, ON THE GRID WHEN IT STOPS.
   *
   * The first version rounded every frame, and that was half right. Rounding
   * is what makes the ring sharp: a curve at a fractional offset is
   * antialiased across two rows, and the difference blend turns that softness
   * into grey rather than into a thinner line.
   *
   * But the follow is an exponential ease. Near the end of a chase it closes
   * the gap by a fraction of a pixel per frame, and rounding those fractions
   * means several frames in a row write the SAME integer and then one writes a
   * whole pixel more. The glide becomes a staircase — the exact artefact the
   * easing exists to remove, introduced by the fix for a different one.
   *
   * The two requirements never actually apply at the same instant. Nobody can
   * see a soft edge on a ring that is travelling, and nobody sees a quarter of
   * a pixel of step on one that has stopped. So the raw eased coordinates go
   * out untouched while it is chasing, continuous at whatever rate the display
   * runs, and the moment it arrives it lands on the device grid and sharpens.
   *
   * translate(), NOT translate3d(). The 3D form forces the ring onto its own
   * GPU layer, and a layer carrying mix-blend-mode is rasterised once and then
   * composited — the antialiasing is baked at whatever resolution the layer
   * was made at, and the blend turns every softened edge pixel grey. The 2D
   * form asks for no layer, so the curve is drawn against the real backdrop.
   */
  function place(crisp) {
    const px = crisp ? snap(x) : x;
    const py = crisp ? snap(y) : y;
    root.style.transform = `translate(${px}px, ${py}px)`;
  }

  function loop() {
    x += (targetX - x) * EASE;
    y += (targetY - y) * EASE;

    // Arrived. pointermove wakes it again.
    if (Math.abs(targetX - x) < SETTLED && Math.abs(targetY - y) < SETTLED) {
      x = targetX; y = targetY;
      place(true);            // onto the device grid, and sharp
      frame = 0;
      return;
    }

    place(false);             // still travelling: sub-pixel, uninterrupted
    frame = requestAnimationFrame(loop);
  }

  function wake() { if (!frame) frame = requestAnimationFrame(loop); }

  /* Put it where x and y already say it is. Without this the ring sits in the
     top-left corner until the pointer is moved for the first time, because
     nothing had written a transform yet. */
  place(true);

  /* What is under the pointer, as one of three states. Read from the event's
     own target rather than elementFromPoint: the browser has already done
     that hit test, and asking again forces a fresh one every move. */
  function classify(el) {
    if (!el || !el.closest) return "";
    /* BEFORE the generic canvas test, and that order is the whole point. A
       <canvas> reads as the eye, which is right for the one at the top of the
       page and wrong the moment a canvas holds something pressable: over a
       crew member on the deck the word should say what pressing them does,
       not what the eye does. The stage sets this class from its own raycast,
       so the answer is "is the pointer actually on a person", not "is the
       pointer somewhere over a 3D box". */
    if (el.closest(".is-inspectable")) return "inspect";

    /* A 3D SCENE YOU CAN TURN IS NOT THE EYE, and it used to say so anyway.
       The test underneath was `el.tagName === "CANVAS"`, which is every canvas
       on the site, so the galleon answered with the eye's word. Two things
       were wrong with that: the galleon turns and the eye does not, and the
       page already carries "A Quick Look" as a heading, so the ring was
       repeating copy that is printed a screen away. */
    if (el.closest(".project-stage__canvas, .scene__canvas")) return "stage";

    /* The eye IS the .eye-layer element - the canvas carries that class - so
       naming it is enough and the catch-all can go. It was also catching the
       two reveal canvases on the home page, which is only invisible because
       they are pointer-events:none. */
    if (el.closest(".eye-layer")) return "eye";
    // Before the generic HOT test: a project card IS a link, and the specific
    // answer is the more useful one.
    if (el.closest(".card-work")) return "view";
    if (el.closest(HOT)) return "hot";
    return "";
  }

  /* The word for each state, looked up fresh every time rather than cached, so
     a language switch is picked up without this having to subscribe to it. */
  function wordFor(next) {
    /* FOUR LETTERS AND A QUESTION. "INSPECT" is seven and "INSPECIONAR" is
       eleven, which in a ring this size sets smaller than every other state
       and reads as a different control. This is the shortest thing that is
       still the right thing: the ring is over a person, and pressing it
       answers exactly that. */
    if (next === "inspect") return t("cursor.inspect", "WHO");
    /* TURN, not SEE. A synonym for looking would be the same word twice in a
       different coat; what this one has to say is the thing the eye cannot do
       and the caption underneath already promises - that the galleon comes
       round under the hand. Four letters, like the rest of them. */
    if (next === "stage") return t("cursor.turn", "TURN");
    if (next === "eye") return t("cursor.look", "LOOK");
    if (next === "view") return t("cursor.view", "VIEW");
    return "";
  }

  function setState(next) {
    if (next === state) return;               // no DOM work on an unchanged move
    const antes = state;
    const raioAntes = raioAlvo();
    state = next;
    root.classList.toggle("is-hot", next === "hot");
    root.classList.toggle("is-eye", next === "eye");
    root.classList.toggle("is-view", next === "view");
    /* THE FOURTH STATE HAD NO CLASS, WHICH IS WHY NOBODY EVER SAW ITS WORD.
       The ring's size and the label's opacity are both driven off these
       classes; "inspect" set none of them, so the word was written into the
       DOM - it was there, and reading textContent said so, which is exactly
       how I missed it - and then rendered at opacity 0 inside a ring still at
       its resting radius. What the reader got was a small empty circle over
       every crew member. */
    root.classList.toggle("is-inspect", next === "inspect");
    root.classList.toggle("is-stage", next === "stage");

    const raioDepois = raioAlvo();
    const palavra = wordFor(next);
    const anterior = wordFor(antes);

    /* THE BEAT, AND ONLY WHERE NOTHING ELSE WOULD MOVE. Crossing from a link
       to a card changes the radius by a centimetre and announces itself; a
       beat there would be a second announcement of the same thing. Crossing
       from the galleon to somebody standing on it changes nothing but four
       letters, and that is the crossing this exists for. So the test is
       exactly that: did the ring keep its size? */
    if (batida) batida.cancel();
    if (raioAntes === raioDepois && typeof disc.animate === "function") {
      /* Split rather than calc(), so a browser that parses one and not the
         other cannot quietly drop the middle keyframe. */
      const n = parseFloat(raioDepois);
      const unidade = raioDepois.slice(String(n).length) || "rem";
      /* HALF, AND AT THE MIDDLE. Not a collapse: at 0.45 on a settling curve
         it read as snapping shut and waiting, which is what he saw. Half is
         plainly still a ring the whole way down, and putting the dip at the
         midpoint makes the two halves the same length - so the word can go out
         with one and come back with the other. */
      batida = disc.animate(
        [
          { r: raioDepois },
          { r: `${(n * 0.5).toFixed(3)}${unidade}`, offset: 0.5 },
          { r: raioDepois },
        ],
        { duration: BATIDA, easing: CURVA }
      );
    }

    /* A word arriving where there was none, or leaving and not being replaced,
       already fades on the stylesheet's own rule. Only a word REPLACING a word
       needs the handover, and doing it any other time would be two fades
       fighting. */
    if (!palavra || !anterior || typeof label.animate !== "function") {
      label.textContent = palavra;
      return;
    }

    if (troca) troca.cancel();
    /* A FADE, AND NOTHING ELSE. It used to roll a fifth of a line as it went,
       which was a second movement travelling across the ring's own and read as
       two things happening rather than one. The ring is the gesture now; the
       word goes out with the first half of it and comes back with the second,
       on the same curve, so the two are plainly one movement. */
    const sai = label.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      /* forwards, so the label is still hidden when the text is swapped below
         and the reader never catches the new word on its way out. */
      { duration: Math.round(BATIDA * 0.5), easing: CURVA, fill: "forwards" }
    );
    troca = sai;

    sai.finished.then(
      () => {
        if (troca !== sai) return;            // a later crossing owns the word
        label.textContent = palavra;
        sai.cancel();                         // give the fill back before the
        troca = label.animate(                // rest of the beat takes over
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: Math.round(BATIDA * 0.5), easing: CURVA }
        );
      },
      () => {}                                // cancelled: nothing to finish
    );
  }

  document.addEventListener("pointermove", (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    const next = classify(e.target);

    /* The magnet. Over a small control the ring's target is blended toward
       the control's centre, so it settles ONTO the thing rather than merely
       over it. The pointer itself is untouched — only where the ring wants
       to be — and the existing ease is what turns the blend into a pull. */
    if (next === "hot") {
      const el = e.target.closest(HOT);
      const r = el?.getBoundingClientRect?.();
      if (r && r.width <= MAGNET_MAX_W && r.height <= MAGNET_MAX_H) {
        targetX += (r.left + r.width / 2 - targetX) * MAGNET;
        targetY += (r.top + r.height / 2 - targetY) * MAGNET;
      }
    }

    setState(next);
    root.classList.remove("is-gone");
    wake();
  }, { passive: true });

  /* Pressed: the ring answers the click it is sitting on.

     RELEASED IS LISTENED FOR IN THREE PLACES, not one. A press whose release
     lands outside the document — dragged onto the browser's own chrome, onto
     a second monitor, or interrupted by the system — never fires pointerup
     here, and the ring would stay collapsed for the rest of the visit with no
     way back. pointercancel covers the interruption; the window losing focus
     covers everything else. */
  const release = () => root.classList.remove("is-down");
  document.addEventListener("pointerdown", () => root.classList.add("is-down"), { passive: true });
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });

  /* Left the window — a second monitor, the browser's own chrome, another
     application entirely. Without this the ring sits frozen wherever the
     pointer last was, stuck to the glass.

     THREE LISTENERS, because one was not enough and the one that was there
     was the least dependable of the three. `pointerleave` was bound to
     `document`, which is not an element; whether it receives a leave event at
     all varies, and in practice the ring stayed put. The root ELEMENT does
     receive it. And `pointerout` with no relatedTarget is the reading that
     always holds — nothing was entered, so the pointer went nowhere inside
     this page — which catches an exit through the edge mid-motion, the case
     the other two miss. All three are cheap and the class is idempotent. */
  const gone = () => root.classList.add("is-gone");

  document.documentElement.addEventListener("pointerleave", gone);
  document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) gone(); });
  window.addEventListener("blur", () => { release(); gone(); });

  return {
    destroy() {
      cancelAnimationFrame(frame);
      root.remove();
      document.documentElement.classList.remove("has-cursor");
    },
  };
}

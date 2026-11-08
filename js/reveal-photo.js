/* ==========================================================================
   PHOTO REVEAL  ·  fluid hover reveal of the statement (reusable across pages)
   --------------------------------------------------------------------------
   Layer order is: statement → photo → statement.

   BOTH statement layers come from ONE function (drawStatement), in one
   coordinate system. That is the whole design: an earlier version mixed a DOM
   <h2> for the back copy with a canvas for the revealed copy, which meant
   translating CSS line-box layout into canvas baselines — and any error there
   showed up as ghosted, doubled letters. With a single renderer the two copies
   cannot disagree.

   The back copy is painted straight onto its canvas. The front one is painted
   into an offscreen canvas and handed to reveal-field.js as a texture, which
   composes the visible front layer in one shader pass. SAME RENDERER, same
   size, same pixels — a second consumer of the first painter, not a second
   painter.

   The photo sits between them (its own WebGL canvas — see photo-depth.js),
   because the back copy must be behind it and the revealed copy in front, and
   one canvas can only live at one depth.

   WHAT THE FRONT LAYER DOES, in Rogério's words: over his face the sentence
   is simply drawn in front of him and the photograph is untouched; off his
   face the page inverts inside the liquid body — white ground, black
   letters — so his outline draws itself against the white. This file's job
   is to give reveal-field.js the three things it needs to tell those two
   cases apart: the sentence, his outline, and where the photograph currently
   sits inside the stage.

   TABLE OF CONTENTS
     1. STATE & SIZING     (canvases, dpr, typography read from CSS)
     2. STATEMENT          (the shared text renderer)
     3. HIS OUTLINE        (the silhouette, built once and padded)
     4. THE BODY           (where the field's head is moved from)
     5. HINT SWEEP         (alternating direction, replays while idle)
     6. LOOP & LIFECYCLE   (runs only while the section is on screen)

   DESIGN NOTES (learned the hard way — do not regress these)
     · The mask must evolve as a CONTINUOUS function of time. An earlier
       version re-rolled its randomness every frame and the shape changed 60
       times a second, which read as flicker rather than as motion. The field
       that replaced it obeys the same rule for the same reason.
     · The mask holds no ink. It is recomputed from the pointer's ribbon every
       frame, so nothing accumulates — which is what used to veil the photo
       when a sweep began before the last one had faded.
     · Do NOT clip the reveal to the photo's silhouette. The outline used
       here is a different thing and is worth not confusing with that older,
       abandoned idea: it never cuts the LETTERS, which would drift out of
       register and chop words in the wrong places. It decides one thing
       only — whether the white ground is painted — and an error of a few
       pixels there hides itself, because the letters that would land in the
       slop are white on white.
     · The statement's slide is in `em`, never `%`: a percentage resolves
       against each canvas's own box, so any size difference would slide the
       two copies by different amounts and the ghosting would return.
     · THE FRONT LAYER NO LONGER MOVES, and the drift moved into the shader
       instead. The sentence breathes a couple of pixels and slides during a
       hint sweep; the back copy still does both in CSS. The front layer must
       not, because it now also carries the white ground, which is registered
       to the photograph's outline and would unstick from it. So the letters
       alone take the offset, measured off the back copy every frame and
       handed to the field — which keeps the two copies in register, the rule
       at the top of this file, by measurement rather than by hoping.
     · NOTHING IS RASTERISED PER FRAME. The sentence is painted once, on
       resize, and the frame is one draw call. Two earlier notes here
       described a half-resolution mask diffused every frame and a
       canvas-to-canvas composite; both were main-thread work sixty times a
       second and both are gone.
     · The front canvas IS a WebGL context now, and that reverses what this
       file used to say. Staying on 2D was right while the mask was stamped: a
       2D canvas did that well and cost nothing. A distance field cannot be
       evaluated per pixel on one without reading an ImageData back every
       frame, which is far worse than the context.
     · The cursor's position is converted from client to stage coordinates
       ONCE PER FRAME, not once per event. getBoundingClientRect() in a
       pointermove handler forces a synchronous layout, and this page scrolls
       with transforms, so layout is dirty on every one of those events —
       which is a stutter during exactly the gesture the effect exists for.
       The same single read now also serves the photo's box and the drift.
     · THE CURSOR IS NOT ASKED FOR AT THE STAGE. This file used to bind
       pointermove and pointerleave to .reveal__stage, which asks the browser
       "is the cursor on top of ME" — and the browser answers with whatever
       element is topmost there. The About cards sit over this photograph and
       are NOT descendants of the stage: through the whole hover phase they
       are opacity 0, and opacity 0 does not turn off hit-testing. So an
       invisible band 127px tall lay across the middle of the portrait, over
       the middle line of the sentence, and crossing it fired pointerleave
       with the cursor still plainly on his face. A third of the stage was
       covered that way, and the masthead and the HUD do the same at the top
       and bottom edges — and those have to stay clickable, so no amount of
       pointer-events could have fixed it.
       What that looked like, and what Rogério reported for weeks: the body
       stopped dead, began to die, and then jumped to the cursor when he came
       out the other side. It was read as a performance fault for three
       sessions. It never was one — the frames were always clean. The giveaway
       was in the same photograph all along: the depth parallax never
       stuttered, because photo-depth.js reads the SHARED pointer instead.
       So this file now reads it too, and decides whether the cursor is inside
       by comparing its viewport position against the stage's measured box —
       the box the frame already reads anyway. Nothing that floats over the
       photograph can reach it any more. Do not put these listeners back on
       an element.
   ========================================================================== */

import { isTouch } from "./viewport.js?v=329";
import { createRevealField } from "./reveal-field.js?v=329";
import { createPointer } from "./pointer.js?v=329";

/* Tunables — all the feel of the effect lives here. The shape of the body
   itself lives in reveal-field.js. */
const SETTINGS = {
  /* THE OLD TIMING RULE IS GONE, and it is worth saying why rather than
     leaving a hole. It read:

         fade-to-zero  <  settleTime  <  idleDelay

     and it existed because the mask was ink: every stamp added to what was
     already there, so a sweep that started before the last one had faded
     built up, and the build-up left a permanent veil over the photograph.
     Three settings had to be kept in a fixed relationship to stay clean.

     The mask is now a distance field, recomputed from scratch every frame
     (see reveal-field.js). Nothing accumulates, so nothing can build up, and
     there is no fade to outrun. What is left is one number — how present the
     field is — which settleTime alone decides. */
  settleTime:    2000,     // ms after the last movement → gone, then idle
  idleDelay:     3800,     // ms of stillness before the hint sweep replays
  sweepDuration: 2500,     // ms for one sweep across the stage
  sweepShift:    0.08,     // how far the statement slides during a sweep, in em
                           // (em, not %, so both copies slide identically)
  slideEase:     0.08,     // easing of that slide (also glides it back after
                           // an interrupted sweep, instead of freezing)

  outlineSize:   512,      // width of his outline, in texture pixels. It is a
                           // yes/no gate, not a picture, so this is plenty
  outlinePad:    10,       // how far the outline is grown, same pixels. The
                           // depth parallax shifts the real photograph by up
                           // to 0.016 of its width — about 8 of these — and
                           // the outline is captured once, so it is padded by
                           // a little more than the worst case. Growing it
                           // errs the safe way: the white ground stops short
                           // of him rather than creeping onto his shoulder
};

/**
 * @param {Element|null} root  the [data-photo-reveal] block
 * @param {{ pointer?: object }} [options]
 *        pointer — the page's shared cursor state (js/pointer.js). The home
 *        page already has one and the eye, the depth chapters and this
 *        photograph's own parallax all read it; passing it in means this file
 *        adds no listener of its own. Left out, it makes a private one, so the
 *        block still works on a page that has no shared pointer to lend.
 */
export function initPhotoReveal(root, options = {}) {
  if (!root) return;

  /* Nothing here works without a cursor: the whole block is a hover reveal,
     wiping the photo between two painted copies of the sentence as the pointer
     moves. On a touch screen the sentence is set in plain HTML over the photo
     instead (see .about__statement in style.css), so this bails before
     allocating canvases and painting them every frame for no one. */
  if (isTouch()) return;

  const stage = root.querySelector(".reveal__stage");
  const backCanvas  = root.querySelector("[data-reveal-back]");
  const frontCanvas = root.querySelector("[data-reveal-front]");
  if (!stage || !backCanvas || !frontCanvas) return;

  /* Both may legitimately be missing on a page that reuses this block without
     the depth photo. Then there is no outline, and the field falls back to
     drawing the letters alone — see uHasHim in reveal-field.js. */
  const photo = root.querySelector("[data-photo-depth]");
  const still = root.querySelector(".reveal__still");

  const bctx = backCanvas.getContext("2d");
  // `let`, not `const`: the statement is translated, and a canvas cannot be
  // updated by swapping textContent the way the rest of the page is — the
  // lines have to be re-read and repainted. See the languagechange listener
  // at the bottom of this file.
  let lines = readLines();

  function readLines() {
    return (root.dataset.revealText || "")
      .split("|").map((t) => t.trim()).filter(Boolean);
  }


  /* ======================================================================
     1. STATE & SIZING
     ====================================================================== */

  /* Where the front copy of the sentence is painted. It is never shown: it
     exists only to be uploaded as a texture, so the shader has letters to
     keep and letters to knock out of the white. Offscreen on purpose — the
     visible front layer is frontCanvas, which the field owns. */
  const statement = document.createElement("canvas");
  const sctx = statement.getContext("2d");

  /* The field owns frontCanvas from here on. It is the only thing that draws
     into it.
     NULL IS A VALID ANSWER — a machine that refuses WebGL simply has no
     reveal, and the statement behind the photograph is still painted and
     still read. A missing flourish is not a broken page.
     NOTE that nothing in this file ever asks frontCanvas for a 2D context.
     It cannot: a canvas is bound to the first kind of context it is given,
     so one stray getContext("2d") would make the WebGL one fail for good. */
  const field = createRevealField(frontCanvas);

  let W = 0, H = 0, dpr = 1;
  let running = false;

  // Typography, read from the canvas's own CSS so it stays token-driven.
  const type = { size: 40, line: 44, family: "sans-serif", weight: "700",
                 tracking: 0, color: "#fff" };

  /* THE CURSOR, read from the window and not from this element — the long
     note at the head of this file says what binding it to the element cost.
     Its clientX/clientY are viewport coordinates; turning those into stage
     coordinates happens in the frame, against the box the frame has just
     measured for its own purposes. */
  const cursor = options.pointer || createPointer();

  /* Whether the cursor is over the stage. WORKED OUT EVERY FRAME, never
     tracked by events, because there is no pointerleave worth trusting: the
     thing that fires it is whatever happens to be topmost, and over this
     photograph that is usually not this photograph. */
  let inside = false;

  /* When the body was last ALIVE — which is not the same as when it last
     moved. See the note in frame(). */
  let lastPaint = 0;
  let idleTidied = false;   // true once the spent body has been wiped

  let lastActivity = performance.now();
  let sweep = null;        // { start, dir } while a hint sweep is playing
  let nextSweepDir = 1;    // alternates every sweep: 1 = L→R, -1 = R→L

  // The statement's sideways slide is EASED, never written raw. Writing the
  // sweep value straight to CSS meant an interrupted sweep froze the letters
  // at whatever offset they had reached; easing toward a target always glides
  // them home instead.
  const slide = { current: 0, target: 0, written: null };

  function readTypography() {
    const cs = getComputedStyle(frontCanvas);
    type.size = parseFloat(cs.fontSize) || 40;
    const lh = parseFloat(cs.lineHeight);
    type.line = Number.isFinite(lh) ? lh : type.size * 1.04;
    type.family = cs.fontFamily;
    type.weight = cs.fontWeight;
    type.tracking = parseFloat(cs.letterSpacing) || 0;
    type.color = cs.color || "#ffffff";
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);

    /* All three surfaces at EXACTLY the same pixel size. The texture is then
       sampled one texel per pixel, so the front letters land on the same
       pixels as the back ones with no resampling in between — which is the
       ghosting warning at the head of this file, enforced by arithmetic. */
    for (const c of [backCanvas, frontCanvas, statement]) {
      c.width  = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    for (const c of [backCanvas, frontCanvas]) {
      c.style.width  = W + "px";
      c.style.height = H + "px";
    }

    readTypography();
    drawStatement(bctx);        // the back copy — painted once, shown as is
    drawStatement(sctx);        // the front copy — painted once, uploaded
    field?.setText(statement);
  }


  /* ======================================================================
     2. STATEMENT  ·  the single shared text renderer
     ----------------------------------------------------------------------
     Both copies come from here, so their glyphs land on identical pixels.
     Everything is derived from the CSS-computed type size, so it follows the
     fluid clamp() on any screen with nothing hard-coded.
     ====================================================================== */

  function drawStatement(c) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);

    c.save();
    c.scale(dpr, dpr);
    c.fillStyle = type.color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `${type.weight} ${type.size}px ${type.family}`;
    if ("letterSpacing" in c) c.letterSpacing = `${type.tracking}px`;

    const startY = H / 2 - ((lines.length - 1) * type.line) / 2;
    lines.forEach((line, i) =>
      c.fillText(line.toUpperCase(), W / 2, startY + i * type.line));
    c.restore();
  }


  /* ======================================================================
     3. HIS OUTLINE
     ----------------------------------------------------------------------
     The portrait is a cutout: transparent everywhere he is not. That alpha
     IS the outline, and it comes from the very file the page already has —
     the same URL the <img> and the depth shader both load, so this costs a
     cache hit and no request. Built once, because it only has to answer
     "white ground here, or not".
     ====================================================================== */

  let outline = null;      // the padded silhouette, once it exists
  let outlineSent = false; // and once the field has been given it

  if (still) {
    const ready = still.complete && still.naturalWidth
      ? Promise.resolve()
      : new Promise((ok, fail) => {
          still.addEventListener("load", ok, { once: true });
          still.addEventListener("error", fail, { once: true });
        });
    ready.then(() => { outline = buildOutline(still); }).catch(() => {});
  }

  /* Grown by drawing the same cutout around a small circle and once in the
     middle. Nine draws of a half-megapixel image, once in the life of the
     page — and alpha compositing unions them, which is a dilation. */
  function buildOutline(img) {
    const w = SETTINGS.outlineSize;
    const h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const pad = SETTINGS.outlinePad;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.drawImage(img, Math.cos(a) * pad, Math.sin(a) * pad, w, h);
    }
    x.drawImage(img, 0, 0, w, h);
    return c;
  }

  /* Where the photograph currently sits, and how far the sentence behind it
     has drifted — both change every frame, the first with the scroll (the
     photo grows as the section passes) and the second with the breathing.
     Given the stage's box, which the caller has already measured. */
  function syncGeometry(sr) {
    if (!field || sr.width < 1 || sr.height < 1) return;

    /* The outline is only true once the photograph it describes is actually
       on screen; until then the field keeps its safe default of "he is
       everywhere", which paints the letters and no white at all. */
    if (!outlineSent && outline && photo?.classList.contains("is-ready")) {
      outlineSent = true;                       // once, pass or fail
      try { field.setHim(outline); } catch { /* tainted canvas: no outline */ }
    }

    if (photo) {
      const pr = photo.getBoundingClientRect();
      field.setPhoto(
        (pr.left - sr.left) / sr.width,
        1 - (pr.bottom - sr.top) / sr.height,   // uv counts y up from the floor
        pr.width / sr.width,
        pr.height / sr.height,
      );
    }

    /* Measured, not predicted. The back copy carries a CSS animation and a
       CSS slide; reading where it actually ended up is the only way the two
       copies stay in register without this file re-deriving both. */
    const br = backCanvas.getBoundingClientRect();
    field.setDrift(
      -(br.left - sr.left) / sr.width,          // sampling moves the opposite
      (br.top - sr.top) / sr.height,            //   way to the content
    );
  }


  /* ======================================================================
     4. THE BODY
     ====================================================================== */

  /* WHAT USED TO BE HERE. A brush sprite of seven random lobes, baked once
     from a fixed seed, stamped along the path, then spread and faded every
     frame. The sprite was baked because re-rolling its randomness per frame
     made the mask change shape sixty times a second, which read as flicker.

     That lesson survives, restated: the field's shape is also a continuous
     function of time, so one frame differs from the last by a hair. What was
     dropped is the machinery, not the principle — a field has no sprite to
     bake, no stamps to space along a path and no ink to fade. */

  /* Move the head of the field. Stage pixels in, because that is what the
     pointer and the sweep both speak; the dpr turns them into canvas pixels,
     which is what the field normalises against. */
  function paintTo(x, y) {
    field?.push(x * dpr, y * dpr);
    lastPaint = performance.now();
  }


  /* ======================================================================
     5. HINT SWEEP  ·  alternates direction, replays whenever idle
     ====================================================================== */

  function updateSweep(now) {
    if (!sweep && !inside && now - lastActivity > SETTINGS.idleDelay) {
      sweep = { start: now, dir: nextSweepDir };
      nextSweepDir = -nextSweepDir;          // strictly alternate L→R, R→L, …
      field?.reset();                        // a fresh body, not a jump
    }

    if (!sweep) {
      slide.target = 0;                      // nothing sweeping → glide home
      return;
    }

    const p = Math.min((now - sweep.start) / SETTINGS.sweepDuration, 1);
    // ease-in-out so it accelerates and settles like a real gesture
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const x = sweep.dir === 1 ? e * W : W - e * W;
    // a gentle arc rather than a straight line — less machine-made
    const y = H * (0.5 + Math.sin(e * Math.PI) * 0.07);

    paintTo(x, y);

    // Nudge the statement sideways with the sweep, in em of its own type.
    slide.target = Math.sin(e * Math.PI) * sweep.dir * SETTINGS.sweepShift;

    if (p >= 1) {
      sweep = null;
      slide.target = 0;
      lastActivity = now;                    // wait another idle period
    }
  }

  /* Ease the slide toward its target every frame, so an interrupted sweep
     glides back instead of freezing mid-way.

     WRITTEN ONLY WHEN IT CHANGES. Setting a custom property invalidates style
     on the subtree that reads it, and this one was being set sixty times a
     second to the same 0.0000 for as long as the section stayed on screen. */
  function updateSlide() {
    slide.current += (slide.target - slide.current) * SETTINGS.slideEase;
    if (Math.abs(slide.current) < 0.0005) slide.current = 0;

    const next = slide.current.toFixed(4);
    if (next === slide.written) return;
    slide.written = next;
    root.style.setProperty("--sweep-shift", next);
  }


  /* ======================================================================
     6. LOOP & LIFECYCLE
     ====================================================================== */

  function frame(now) {
    if (!running) return;

    /* ONE layout read per frame, and everything below shares it. */
    const sr = stage.getBoundingClientRect();

    /* IS THE CURSOR OVER THE PHOTOGRAPH? Asked of its position, not of the
       document: `seen` because the shared pointer opens on an invented centre
       point and a page scrolled by keyboard must not light this up by itself,
       `inWindow` because the position is remembered and a cursor that has left
       the page would otherwise read as parked here for ever. */
    const was = inside;
    inside = cursor.seen && cursor.inWindow
      && cursor.clientX >= sr.left && cursor.clientX <= sr.right
      && cursor.clientY >= sr.top  && cursor.clientY <= sr.bottom;

    if (inside) {
      /* ARRIVING STARTS A NEW BODY. Left seeded, coming back on the far side
         of the photograph drags the whole thing across in one frame. */
      if (!was) field?.reset();

      /* AND THE HEAD IS MOVED EVERY FRAME, not only when an event says the
         cursor moved. The cursor can hold still while the stage does not —
         the page scrolls, the window resizes, the photograph grows as the
         section passes — and all of those change where the same viewport
         point falls inside the stage. Pushing an unchanged position costs two
         divisions and keeps the body glued to the cursor through all of it. */
      paintTo(cursor.clientX - sr.left, cursor.clientY - sr.top);

      sweep = null;             // the visitor is here; no hint is needed
      lastActivity = now;
    } else if (was) {
      lastActivity = now;       // just left — start the idle countdown
    }

    updateSweep(now);

    /* RESTING THE CURSOR IS NOT LEAVING. The countdown below is measured from
       the last paint, and the paint above happens every frame the cursor is
       over the stage — so holding the mouse still keeps the body alive, and
       the fade belongs to leaving and to a hint sweep running out. It used to
       be armed by MOVEMENT instead, which meant stopping to read a word let
       the reveal dissolve under the cursor and the next twitch snapped it back
       in one frame. That is a different bug from the one in the header note,
       it had the same symptom, and it is held shut here.

       The field is redrawn while the body is alive; once it is spent, one
       emptied pass and then nothing at all until something moves again.

       STRENGTH, NOT FADE. There is no ink to dissolve any more — the whole
       field is simply less present as it ages, and `age * age` holds it
       almost full for the first half and then lets go, which is the shape
       the old multiplicative fade had. */
    const age = Math.min((now - lastPaint) / SETTINGS.settleTime, 1);

    if (age < 1) {
      idleTidied = false;
      syncGeometry(sr);
      field?.draw(now / 1000, 1 - age * age);
    } else if (!idleTidied) {
      field?.draw(now / 1000, 0);   // the same pass, emptied — this is the wipe
      field?.reset();               // and the next stroke starts clean
      idleTidied = true;
    }

    updateSlide();
    requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function stop()  { running = false; }

  /* --- NO POINTER LISTENERS LIVE HERE ------------------------------------
     There were two, pointermove and pointerleave, both on the stage, and
     between them they were the bug. The frame reads the shared cursor
     instead; everything they used to set is worked out there, from a position
     nothing on top of the photograph can intercept.

     Two things they did are worth not losing, because both were hard-won and
     both now live in frame():

       · the reset belongs to ARRIVING, never to leaving. On the way out it
         un-seeded the ribbon, and an un-seeded ribbon makes draw() return
         before it does anything — including the emptied pass that wipes the
         canvas. The body then neither faded nor cleared: it stopped dead on
         its last frame. It is done on the false→true edge now;
       · leaving must leave the fade alone. Nothing is torn down when the
         cursor goes; the strength ages out over settleTime and the loop
         clears the canvas properly at the end of it.
     ---------------------------------------------------------------------- */

  // --- Run only while the section is on screen --------------------------
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { resize(); start(); }
      else stop();
    }
  }, { threshold: 0.15 });
  observer.observe(root);

  window.addEventListener("resize", () => { if (running) resize(); }, { passive: true });
  resize();

  // Canvas falls back to a system font if the webfont hasn't arrived yet, so
  // repaint once it has.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize).catch(() => {});
  }

  // i18n.js has already rewritten data-reveal-text by the time this fires;
  // re-reading and resizing repaints both canvases from the new copy.
  document.addEventListener("languagechange", () => {
    lines = readLines();
    resize();
  });
}

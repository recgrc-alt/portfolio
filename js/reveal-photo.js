/* ==========================================================================
   PHOTO REVEAL  ·  fluid hover reveal of the statement (reusable across pages)
   --------------------------------------------------------------------------
   Layer order is: statement → photo → statement.

   BOTH statement layers are canvases painted by ONE function (drawStatement),
   in one coordinate system. That is the whole design: an earlier version mixed
   a DOM <h2> for the back copy with a canvas for the revealed copy, which meant
   translating CSS line-box layout into canvas baselines — and any error there
   showed up as ghosted, doubled letters. With a single renderer the two copies
   cannot disagree.

   The photo sits between them (its own WebGL canvas — see photo-depth.js),
   because the back copy must be behind it and the revealed copy in front, and
   one canvas can only live at one depth.

   TABLE OF CONTENTS
     1. STATE & SIZING     (canvases, dpr, typography read from CSS)
     2. STATEMENT          (the shared text renderer)
     3. TRAIL              (stable brush stamps + fluid diffusion)
     4. HINT SWEEP         (alternating direction, replays while idle)
     5. LOOP & LIFECYCLE   (runs only while the section is on screen)

   DESIGN NOTES (learned the hard way — do not regress these)
     · The brush sprite is built ONCE from a fixed seed. Re-rolling the
       randomness per frame made the mask change shape 60×/second, which read
       as flicker. Stamp rotation is derived from the position, so a stationary
       cursor produces an identical stamp every frame.
     · Ink is deposited only on real movement. Painting every frame while the
       cursor rested kept feeding the spreading trail until it veiled the photo.
     · Do NOT clip the reveal to the photo's silhouette. Such a mask is built
       once while the photo keeps shifting under the cursor, so the two drift
       apart and the letters get cut in the wrong places.
     · The statement's slide is in `em`, never `%`: a percentage resolves
       against each canvas's own box, so any size difference would slide the
       two copies by different amounts and the ghosting would return.
     · The trail canvas runs at half resolution — it is a soft mask, so the
       resolution is invisible, and it makes the per-frame diffusion cheap.
     · Deliberately 2D canvas, not a second WebGL context, to stay light next
       to the 3D eye.
   ========================================================================== */

import { isTouch } from "./viewport.js?v=71";


/* Tunables — all the feel of the effect lives here. */
const SETTINGS = {
  maskScale:     0.5,      // trail resolution vs the canvas (soft mask → cheap)
  /* TIMING RULE — these are related, do not tune one alone:
       fade-to-zero  <  settleTime  <  idleDelay
     Otherwise each sweep re-inks over the previous one and the build-up leaves
     a permanent veil on the photo. */
  trailFade:     0.035,    // base alpha removed per frame
  fadeAccel:     0.70,     // extra fade as the trail ages. Canvas alpha is
                           // 8-bit and the fade is multiplicative, so a
                           // saturated area stalls (15 × 0.97 rounds back to
                           // 15). Ramping the fade crosses that threshold.
  settleTime:    2000,     // ms after last ink → one tidy wipe, then idle
  spread:        1.006,    // per-frame growth of the trail (the "fluid" bleed)
  drift:         0.6,      // px of wander per frame (the "fluid" flow)
  brushScale:    0.17,     // brush radius as a fraction of the smaller side
  brushLobes:    7,        // lobes baked into the sprite (ragged edge)
  brushAlpha:    0.34,     // opacity of a single stamp
  brushSeed:     20260721, // fixed seed → the brush shape never changes
  stepRatio:     0.22,     // spacing of stamps along the path (× radius)
  idleDelay:     3800,     // ms of stillness before the hint sweep replays
  sweepDuration: 2500,     // ms for one sweep across the stage
  sweepShift:    0.08,     // how far the statement slides during a sweep, in em
                           // (em, not %, so both copies slide identically)
  slideEase:     0.08,     // easing of that slide (also glides it back after
                           // an interrupted sweep, instead of freezing)
};

/* Deterministic PRNG — the brush must look random but be identical every time
   it is built, otherwise the mask shimmers. */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function initPhotoReveal(root) {
  if (!root) return;

  /* Nothing here works without a cursor: the whole block is a hover reveal,
     wiping the photo between two painted copies of the sentence as the pointer
     moves. On a touch screen the sentence is set in plain HTML over the photo
     instead (see .about__statement in style.css), so this bails before
     allocating four canvases and painting them every frame for no one. */
  if (isTouch()) return;

  const stage = root.querySelector(".reveal__stage");
  const backCanvas  = root.querySelector("[data-reveal-back]");
  const frontCanvas = root.querySelector("[data-reveal-front]");
  if (!stage || !backCanvas || !frontCanvas) return;

  const bctx = backCanvas.getContext("2d");
  const fctx = frontCanvas.getContext("2d");
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

  const trail   = document.createElement("canvas");   // the reveal mask
  const scratch = document.createElement("canvas");   // snapshot for diffusion
  const tctx = trail.getContext("2d");
  const sctx = scratch.getContext("2d");

  let W = 0, H = 0, dpr = 1, mScale = 1;   // mScale: stage px → trail px
  let running = false;

  let brush = null;
  let brushRadius = 40;

  // Typography, read from the canvas's own CSS so it stays token-driven.
  const type = { size: 40, line: 44, family: "sans-serif", weight: "700",
                 tracking: 0, color: "#fff" };

  // Pointer: `x/y` current, `px/py` last painted point, `lastX/lastY` the
  // position at the previous frame (used to detect real movement).
  const pointer = {
    x: -9999, y: -9999, px: -9999, py: -9999,
    lastX: -9999, lastY: -9999, inside: false,
  };

  let lastPaint = 0;        // timestamp of the last ink deposit
  let idleTidied = false;   // true once the spent trail has been wiped

  let lastActivity = performance.now();
  let sweep = null;        // { start, dir } while a hint sweep is playing
  let nextSweepDir = 1;    // alternates every sweep: 1 = L→R, -1 = R→L

  // The statement's sideways slide is EASED, never written raw. Writing the
  // sweep value straight to CSS meant an interrupted sweep froze the letters
  // at whatever offset they had reached; easing toward a target always glides
  // them home instead.
  const slide = { current: 0, target: 0 };

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

    for (const c of [backCanvas, frontCanvas]) {
      c.width  = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width  = W + "px";
      c.style.height = H + "px";
    }

    // Half-resolution mask: invisible on a soft blur, cheap to diffuse.
    mScale = dpr * SETTINGS.maskScale;
    for (const c of [trail, scratch]) {
      c.width  = Math.max(1, Math.round(W * mScale));
      c.height = Math.max(1, Math.round(H * mScale));
    }

    brushRadius = Math.min(W, H) * SETTINGS.brushScale;
    brush = buildBrush(brushRadius);

    readTypography();
    drawStatement(bctx);      // the back copy is static — paint it once
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

  /* The revealed copy: the same statement, kept only where the trail has ink. */
  function drawReveal() {
    drawStatement(fctx);
    fctx.globalCompositeOperation = "destination-in";
    fctx.drawImage(trail, 0, 0, frontCanvas.width, frontCanvas.height);
    fctx.globalCompositeOperation = "source-over";
  }

  function clearReveal() {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
  }


  /* ======================================================================
     3. TRAIL  ·  stable brush + fluid diffusion
     ====================================================================== */

  /* Built once per size; the ragged edge is baked in, so stamping never
     re-rolls the shape (that re-rolling was the flicker). */
  function buildBrush(radius) {
    const rnd = seededRandom(SETTINGS.brushSeed);
    const size = Math.max(2, Math.ceil(radius * 2 * mScale));
    const b = document.createElement("canvas");
    b.width = b.height = size;
    const bx = b.getContext("2d");
    const c = size / 2;

    for (let i = 0; i < SETTINGS.brushLobes; i++) {
      const angle  = rnd() * Math.PI * 2;
      const offset = rnd() * c * 0.42;
      const lx = c + Math.cos(angle) * offset;
      const ly = c + Math.sin(angle) * offset;
      const lr = c * (0.5 + rnd() * 0.48);

      const g = bx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0.0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.55, "rgba(255,255,255,0.22)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      bx.fillStyle = g;
      bx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }
    return b;
  }

  /* Rotation comes from the position, so a still cursor stamps identically. */
  function stamp(x, y) {
    if (!brush) return;
    const r = brushRadius * mScale;
    const angle = (x * 0.7 + y * 1.3) % (Math.PI * 2);
    tctx.globalCompositeOperation = "source-over";
    tctx.globalAlpha = SETTINGS.brushAlpha;
    tctx.save();
    tctx.translate(x * mScale, y * mScale);
    tctx.rotate(angle);
    tctx.drawImage(brush, -r, -r, r * 2, r * 2);
    tctx.restore();
    tctx.globalAlpha = 1;
  }

  /* Paint from the previous point to the current one, so there are no gaps. */
  function paintTo(x, y) {
    const hasPrev = pointer.px > -9998;
    const dx = hasPrev ? x - pointer.px : 0;
    const dy = hasPrev ? y - pointer.py : 0;
    const dist = Math.hypot(dx, dy);

    if (!hasPrev || dist < 0.5) {
      stamp(x, y);
    } else {
      const steps = Math.max(1, Math.ceil(dist / (brushRadius * SETTINGS.stepRatio)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stamp(pointer.px + dx * t, pointer.py + dy * t);
      }
    }
    pointer.px = x;
    pointer.py = y;
    lastPaint = performance.now();
  }

  /* Fluid step: redraw the trail slightly larger and nudged along a slowly
     rotating direction, at reduced alpha. Spreading + drifting + fading in a
     single pass reads as ink bleeding through water — no physics needed. */
  function diffuseTrail(now) {
    const w = trail.width, h = trail.height;
    if (w < 2 || h < 2) return;

    sctx.globalCompositeOperation = "copy";
    sctx.drawImage(trail, 0, 0);            // snapshot (avoids self-draw artefacts)

    const s = SETTINGS.spread;
    const dw = w * s, dh = h * s;
    const a = now * 0.0004;                 // the flow direction wanders slowly
    const dx = (w - dw) / 2 + Math.cos(a) * SETTINGS.drift * mScale;
    const dy = (h - dh) / 2 + Math.sin(a * 1.3) * SETTINGS.drift * mScale;

    const age = Math.min((now - lastPaint) / SETTINGS.settleTime, 1);
    const fade = SETTINGS.trailFade + age * age * SETTINGS.fadeAccel;

    tctx.globalCompositeOperation = "copy";
    tctx.globalAlpha = 1 - fade;
    tctx.drawImage(scratch, dx, dy, dw, dh);
    tctx.globalAlpha = 1;
    tctx.globalCompositeOperation = "source-over";
  }


  /* ======================================================================
     4. HINT SWEEP  ·  alternates direction, replays whenever idle
     ====================================================================== */

  function updateSweep(now) {
    if (!sweep && !pointer.inside && now - lastActivity > SETTINGS.idleDelay) {
      sweep = { start: now, dir: nextSweepDir };
      nextSweepDir = -nextSweepDir;          // strictly alternate L→R, R→L, …
      pointer.px = pointer.py = -9999;       // start a fresh stroke
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

    // Nudge the statement sideways with the sweep, in % of its own size.
    slide.target = Math.sin(e * Math.PI) * sweep.dir * SETTINGS.sweepShift;

    if (p >= 1) {
      sweep = null;
      slide.target = 0;
      lastActivity = now;                    // wait another idle period
      pointer.px = pointer.py = -9999;
    }
  }

  /* Ease the slide toward its target every frame, so an interrupted sweep
     glides back instead of freezing mid-way. */
  function updateSlide() {
    slide.current += (slide.target - slide.current) * SETTINGS.slideEase;
    if (Math.abs(slide.current) < 0.0005) slide.current = 0;
    root.style.setProperty("--sweep-shift", slide.current.toFixed(4));
  }


  /* ======================================================================
     6. LOOP & LIFECYCLE
     ====================================================================== */

  function frame(now) {
    if (!running) return;

    // Deposit ink ONLY on real movement.
    if (pointer.inside && (pointer.x !== pointer.lastX || pointer.y !== pointer.lastY)) {
      paintTo(pointer.x, pointer.y);
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
    }
    updateSweep(now);

    // While there is ink, dissolve it and repaint the reveal. Once it is spent,
    // wipe once and idle — no compositing at all until new ink arrives.
    if (now - lastPaint < SETTINGS.settleTime) {
      idleTidied = false;
      diffuseTrail(now);
      drawReveal();
    } else if (!idleTidied) {
      tctx.clearRect(0, 0, trail.width, trail.height);
      clearReveal();
      idleTidied = true;
    }

    updateSlide();
    requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function stop()  { running = false; }

  // --- Pointer input ----------------------------------------------------
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.inside = true;
    lastActivity = performance.now();
    sweep = null;                                    // the visitor took over
  }, { passive: true });

  stage.addEventListener("pointerleave", () => {
    pointer.inside = false;
    pointer.px = pointer.py = -9999;                 // break the stroke
    lastActivity = performance.now();
  }, { passive: true });

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

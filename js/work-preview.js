/* ==========================================================================
   WORK PREVIEW  ·  signal capture
   --------------------------------------------------------------------------
   Selected Works is a wall of six live camera feeds. Taking one — hover,
   keyboard focus, or a tap — dims the other five, expands that feed into a
   larger card offset from dead centre, projects four lines from the grid
   card's corners to the expanded card's corners, and floats the project's
   record beside it.

   Division of labour, same as the rest of the site:
     · CSS owns every appearance and every transition (10d / 10e in style.css)
     · JS owns only what CSS cannot know — WHICH camera, WHERE the two
       rectangles are on screen, and WHICH SIDE the record can safely occupy.

   ---------------------------------------------------------------------------
   TWO STATES, NOT ONE

   .is-open   the wall is dimmed and the overlay is live
   .is-armed  this particular capture is expanded

   Moving from one camera to the next drops .is-armed, waits for the retract,
   then re-arms with the new project — so the Signal Capture sequence always
   plays from its first frame instead of having its content swapped underneath
   it mid-animation. .is-open stays on throughout, which is the point of the
   split: recycling the whole overlay would strobe the backdrop off and on
   every time the pointer crossed a card boundary.

   ---------------------------------------------------------------------------
   THE COLLISION RULE  (the whole reason this file does geometry at all)

   A projection line has exactly two endpoints: a corner of the grid card and
   the matching corner of the expanded card. A straight segment never leaves
   the range of its own endpoints, so every point on every line satisfies

       x >= min(cardLeft, frameLeft)   and   x <= max(cardRight, frameRight)

   which means the region beyond those bounds is provably free of lines — at
   any scroll position, for any camera, without testing a single segment.

   The record sits one gap outside the frame, so the test collapses to:

       right side is clean   <=>   cardRight <= frameRight
       left  side is clean   <=>   cardLeft  >= frameLeft

   A side is safe when the grid card does not stick out past the expanded card
   on that side. That is what pickLayout() evaluates, and it is why the
   expanded card is offset rather than centred: shifting it toward the camera
   is what pulls one side clean and opens the corridor the text needs.

   The organic jitter below is applied BEFORE that test, never after, so a
   random nudge can never be the thing that puts a line through the text.
   --------------------------------------------------------------------------- */

/* Feel — every timing that is not a CSS transition lives here. */
const SETTINGS = {
  openDelay: 140,   // ms of steady hover before opening (intent, not reflex)
  closeDelay: 60,   // ms grace on leaving, so a 1px wobble doesn't flicker
  recycle: 220,     // ms between retract and re-arm; matches --dur-preview-out
};

/* Organic offset. The deterministic part of the shift is what guarantees a
   clean corridor; this is the part that keeps the composition alive, so that
   returning to the same camera never lands in exactly the same place.
   Authored in viewport units for the usual reason — a pixel jitter would be a
   twitch on a laptop and invisible on a television. */
const JITTER = { x: 3, y: 2 };            // ±3vw, ±2vh

/* If a jittered position costs the record its clean side, the jitter is what
   gives way — scaled down through these steps until the geometry works. The
   last entry is 0, so there is always a known-good fallback. */
const JITTER_FALLBACK = [1, 0.55, 0];

/* Below this width no side corridor is wide enough for the record to clear the
   lines, so the layout stacks and the lines are dropped rather than allowed to
   cross the text. Matches the single-column breakpoint in style.css. */
const PREVIEW_STACK_WIDTH = 44 * 16;   // 44rem at the browser default root size

/* Which data-* attribute feeds which element. Adding a field to the floating
   record is one line here plus one in the HTML — no new logic. */
const FIELDS = [
  ["cam",     "[data-preview-cam]"],
  ["cam",     "[data-preview-osd]"],
  ["title",   "[data-preview-title]"],
  ["theme",   "[data-preview-theme]"],
  ["role",    "[data-preview-role]"],
  ["year",    "[data-preview-year]"],
  ["credits", "[data-preview-credits]"],
];

const MODES = ["preview--split", "preview--left", "preview--right", "preview--stack"];

export function initWorkPreview(section, options = {}) {
  if (!section) return null;

  const overlay = section.querySelector("[data-work-preview]");
  const grid = section.querySelector("[data-work-grid]");
  const cards = [...section.querySelectorAll("[data-work-card]")];
  if (!overlay || !grid || !cards.length) return null;

  const stage = overlay.querySelector("[data-preview-stage]");
  const frame = overlay.querySelector("[data-preview-frame]");
  const video = overlay.querySelector("[data-preview-video]");
  const lines = [...overlay.querySelectorAll("[data-preview-lines] line")];

  // Resolve each slot once — this would otherwise run on every capture.
  const slots = FIELDS.map(([key, sel]) => [key, overlay.querySelector(sel)]);

  // `hover: hover` is the reliable way to ask "is there a real pointer?" —
  // far better than sniffing the user agent.
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const openDelay = options.openDelay ?? SETTINGS.openDelay;
  const closeDelay = options.closeDelay ?? SETTINGS.closeDelay;
  const recycle = options.recycle ?? SETTINGS.recycle;

  let active = null;    // the camera currently armed, or null
  let seed = null;      // this capture's jitter, held so scrolling doesn't reroll
  let intentTimer = 0;
  let recycleTimer = 0;

  /* --- Measurement -------------------------------------------------------
   * Everything below reads LAYOUT (offsetWidth, offsetLeft) rather than
   * getBoundingClientRect(). The stage carries a transform that is animating
   * whenever the preview moves from one camera to the next, and the frame
   * grows in from scale(0.9) — a rect read at that moment describes where the
   * box is passing through, not where it will come to rest. Layout values
   * ignore transforms, so the target is exact from the first frame.
   *
   * The stage is centred on the viewport and then nudged: CSS puts its origin
   * at 50%/50% and pulls it back by half its own size, so its resting box is
   * reconstructed here from the same three terms. */
  function frameBox(shiftX, shiftY) {
    const left = window.innerWidth / 2 - stage.offsetWidth / 2 + shiftX;
    const top = window.innerHeight / 2 - stage.offsetHeight / 2 + shiftY;
    return {
      left: left + frame.offsetLeft,
      top: top + frame.offsetTop,
      right: left + frame.offsetLeft + frame.offsetWidth,
      bottom: top + frame.offsetTop + frame.offsetHeight,
    };
  }

  /* A viewport-unit token resolved to pixels: JS geometry has to be in the
     same units as the rectangles it compares. */
  function unit(token, axis) {
    const raw = getComputedStyle(overlay).getPropertyValue(token).trim();
    const value = parseFloat(raw) || 0;
    if (raw.endsWith("vw")) return (value / 100) * window.innerWidth;
    if (raw.endsWith("vh")) return (value / 100) * window.innerHeight;
    return value;
  }

  /* Keeps the whole stage on screen after the offset and the jitter are in.
     Without this, a large nudge on a short window could push the record's
     bottom line past the fold. */
  function contain(x, y) {
    const margin = unit("--page-margin");
    const slackX = Math.max(0, (window.innerWidth - stage.offsetWidth) / 2 - margin);
    const slackY = Math.max(0, (window.innerHeight - stage.offsetHeight) / 2 - margin);
    return {
      x: Math.max(-slackX, Math.min(slackX, x)),
      y: Math.max(-slackY, Math.min(slackY, y)),
    };
  }

  function setMode(mode) {
    overlay.classList.remove(...MODES);
    overlay.classList.add(mode);
  }

  /* --- Layout choice -----------------------------------------------------
   * Returns the mode and the offset for a camera. The deterministic part of
   * the offset moves the expanded card AWAY from the camera that was taken.
   *
   * The direction matters for a reason that is not aesthetic: the projection
   * lines are only drawn where they are outside BOTH pictures, so every pixel
   * of overlap between the grid card and the expanded card is bridge that
   * cannot exist. Offsetting toward the camera maximised that overlap and
   * silently deleted the lines. Offsetting away pulls the two apart.
   *
   * It costs nothing on the collision rule: a camera in the left column can
   * never have clean space on its left (the box would have to sit hard against
   * the page edge), so the record goes right either way — moving the box right
   * simply gives that side a wider, cleaner corridor. */
  function pickLayout(card, jitter) {
    const media = card.querySelector(".work__media").getBoundingClientRect();

    if (window.innerWidth <= PREVIEW_STACK_WIDTH) {
      return { mode: "preview--stack", x: 0, y: 0, box: null };
    }

    // −1 … +1: how far the camera sits from the centre of the screen.
    const bias = (media.left + media.right - window.innerWidth) / window.innerWidth;
    const vBias = (media.top + media.bottom - window.innerHeight) / window.innerHeight;
    const limit = unit("--preview-shift-max");

    // Negative: away from the camera, not toward it.
    const hx = Math.max(-1, Math.min(1, bias));
    const hy = Math.max(-1, Math.min(1, vBias));
    const baseX = -hx * limit;

    /* A camera in the middle column has no sideways room to be pushed into —
       it sits where the capture wants to land, so the two overlap and their
       corner bridges vanish. The offset budget is spent vertically instead,
       and it is spent freely: the collision rule is a horizontal test, so
       moving the box up or down cannot cost the record its clean corridor.
       The gain rises as the horizontal push falls away. */
    const centred = 1 - Math.abs(hx);
    const vGain = 0.35 + centred * 1.15;
    const vMag = Math.max(Math.abs(hy), centred * 0.55);
    const baseY = -(hy < 0 ? -1 : 1) * vMag * limit * vGain;

    // Try the full jitter first, then progressively less of it. The geometry
    // test is re-run at each step, so the guarantee holds at whichever step
    // survives — the jitter is never allowed to be the thing that breaks it.
    for (const scale of JITTER_FALLBACK) {
      const nudged = contain(
        baseX + jitter.x * scale * (JITTER.x / 100) * window.innerWidth,
        baseY + jitter.y * scale * (JITTER.y / 100) * window.innerHeight
      );

      // Measure in the mode being considered: the three side layouts differ in
      // how many metadata columns they carry, and the frame's position inside
      // the stage depends on that.
      setMode("preview--split");
      let box = frameBox(nudged.x, nudged.y);
      const leftClean = media.left >= box.left;
      const rightClean = media.right <= box.right;
      if (leftClean && rightClean) {
        return { mode: "preview--split", ...nudged, box };
      }

      const wanted = rightClean ? "preview--right" : "preview--left";
      setMode(wanted);
      box = frameBox(nudged.x, nudged.y);
      if (wanted === "preview--right" ? media.right <= box.right : media.left >= box.left) {
        return { mode: wanted, ...nudged, box };
      }
    }

    // Nothing cleared, even unjittered (a very wide camera, or a very narrow
    // window). Stacking is the only arrangement with no side corridor to
    // violate, and it drops the lines rather than crossing the text.
    return { mode: "preview--stack", x: 0, y: 0, box: null };
  }

  /* --- Projection lines --------------------------------------------------
   * Corner order is fixed (TL, TR, BR, BL) on both rectangles, so matching
   * index to matching index the lines never cross each other.
   *
   * A raw corner-to-corner segment is not enough. Aiming at, say, the frame's
   * top-left corner from a camera that sits to its RIGHT means the segment has
   * to cross the whole picture to arrive there — the line ends up drawn over
   * the footage instead of bridging to it. So each segment is trimmed at both
   * ends: it leaves the camera's HUD rectangle and stops at the expanded HUD
   * rectangle, and the part in between — the only part that is genuinely
   * outside both pictures — is what gets drawn.
   *
   * Trimming only ever shortens a segment, so the collision rule still holds:
   * a subset of a range stays inside that range. */

  /* How far the corner marks stand off the picture, measured rather than
     re-derived from the token — the viewfinder's own box already is the
     media box plus that standoff on each side, and layout values ignore any
     transform in play. */
  function hudPad(mediaEl, viewfinderEl) {
    if (!viewfinderEl || !mediaEl) return 0;
    return Math.max(0, (viewfinderEl.offsetWidth - mediaEl.offsetWidth) / 2);
  }

  function expand(r, pad) {
    return {
      left: r.left - pad, top: r.top - pad,
      right: r.right + pad, bottom: r.bottom + pad,
    };
  }

  /* Liang–Barsky: the [enter, exit] parameters where segment A→B overlaps the
     rectangle, or null when it misses entirely. */
  function span(ax, ay, bx, by, r) {
    const dx = bx - ax;
    const dy = by - ay;
    const p = [-dx, dx, -dy, dy];
    const q = [ax - r.left, r.right - ax, ay - r.top, r.bottom - ay];
    let t0 = 0;
    let t1 = 1;

    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;          // parallel to this edge and outside
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
        else { if (t < t0) return null; if (t < t1) t1 = t; }
      }
    }
    return [t0, t1];
  }

  function drawLines(card, layout) {
    const box = layout.box ?? frameBox(layout.x, layout.y);
    const media = card.querySelector(".work__media");
    const from = media.getBoundingClientRect();

    // Both HUD rectangles: the picture plus the standoff its corner marks sit at.
    const cardHud = expand(from, hudPad(media, card.querySelector(".viewfinder")));
    const frameHud = expand(box, hudPad(frame, frame.querySelector(".viewfinder")));

    const corners = (r) => [
      [r.left, r.top], [r.right, r.top],
      [r.right, r.bottom], [r.left, r.bottom],
    ];

    const a = corners(from);
    const b = corners(box);

    lines.forEach((line, i) => {
      const [ax, ay] = a[i];
      const [bx, by] = b[i];

      // Leave the camera's HUD, stop at the expanded one.
      const out = span(ax, ay, bx, by, cardHud);
      const into = span(ax, ay, bx, by, frameHud);
      const start = out ? out[1] : 0;      // exit from the small rectangle
      const end = into ? into[0] : 1;      // entry into the large one

      // The two HUDs touch or overlap along this line: there is no exterior
      // stretch left to draw, so nothing is drawn. A zero-length segment would
      // still paint a dot under stroke-linecap: round.
      const empty = !(end - start > 0.001);
      line.toggleAttribute("data-empty", empty);
      if (empty) return;

      line.setAttribute("x1", ax + (bx - ax) * start);
      line.setAttribute("y1", ay + (by - ay) * start);
      line.setAttribute("x2", ax + (bx - ax) * end);
      line.setAttribute("y2", ay + (by - ay) * end);
    });
  }

  /* --- Placing a capture -------------------------------------------------- */
  function place(card) {
    const layout = pickLayout(card, seed);
    setMode(layout.mode);
    stage.style.setProperty("--shift-x", `${layout.x.toFixed(2)}px`);
    stage.style.setProperty("--shift-y", `${layout.y.toFixed(2)}px`);
    drawLines(card, layout);
    return layout;
  }

  /* --- Arm / disarm ------------------------------------------------------- */
  function arm(card) {
    active = card;
    seed = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
    card.closest(".work__item").classList.add("is-active");
    grid.classList.add("is-watching");

    for (const [key, el] of slots) {
      if (el) el.textContent = card.dataset[key] ?? "";
    }

    // Geometry before the class flips: because the box is derived from layout
    // rather than the rendered transform, the target is already known, so
    // there is nothing to wait a frame for and nothing to measure mid-flight.
    place(card);

    // Autoplay can still be refused (low-power mode, data saver); ignore it —
    // the frame stays, so the capture is never broken.
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-armed");
  }

  /* Retracts the capture but leaves the wall dimmed, so a switch between two
     cameras reads as one instrument re-aiming rather than the page blinking. */
  function disarm() {
    if (!active) return;
    active.closest(".work__item").classList.remove("is-active");
    active = null;
    overlay.classList.remove("is-armed");
  }

  function close() {
    clearTimeout(recycleTimer);
    disarm();
    grid.classList.remove("is-watching");
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    video.pause();
  }

  /* The switch. A camera already armed retracts first and the next one is
     armed only once that retract has played — never a content swap under a
     running animation. */
  function commit(card) {
    if (active === card) return;
    clearTimeout(recycleTimer);

    if (active) {
      disarm();
      recycleTimer = setTimeout(() => arm(card), recycle);
    } else {
      arm(card);
    }
  }

  function request(card) {
    clearTimeout(intentTimer);
    intentTimer = setTimeout(() => commit(card), openDelay);
  }

  function scheduleClose() {
    clearTimeout(intentTimer);
    intentTimer = setTimeout(close, closeDelay);
  }

  /* --- Wiring ------------------------------------------------------------ */
  cards.forEach((card) => {
    if (canHover) {
      card.addEventListener("pointerenter", () => request(card));
      card.addEventListener("pointerleave", scheduleClose);
      // Keyboard users get the same capture, without the intent delay — a
      // deliberate Tab is already the intent.
      card.addEventListener("focus", () => commit(card));
      card.addEventListener("blur", close);
    } else {
      // No hover: first tap captures, second tap on the same camera follows
      // the link.
      card.addEventListener("click", (event) => {
        if (active === card) return;
        event.preventDefault();
        commit(card);
      });
    }
  });

  if (canHover) {
    // A click always means "go", so the overlay must not linger over the next
    // page state.
    section.addEventListener("click", close);
  } else {
    // Touch has no hover to leave and no Esc key, so without this a capture
    // could only be dismissed by opening another one.
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-work-card]")) close();
    });
  }

  /* The camera moves under the lines as the page scrolls, and a resize can
     change which side is clean, so both are re-evaluated — but only while a
     capture is armed, and reusing the same jitter, so the box tracks the
     scroll instead of twitching to a new random spot every frame. */
  function reposition() {
    if (active) place(active);
  }

  window.addEventListener("scroll", reposition, { passive: true });
  window.addEventListener("resize", reposition);

  // Esc is the expected way out of a focused state.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) close();
  });

  return {
    close,
    /* Exposed for verification: reports the geometry actually in force, so the
       collision rule can be checked against real numbers rather than trusted. */
    inspect: () => {
      if (!active) return null;
      const layout = pickLayout(active, seed);
      setMode(layout.mode);
      return {
        mode: layout.mode,
        shift: { x: layout.x, y: layout.y },
        box: layout.box ?? frameBox(layout.x, layout.y),
        media: active.querySelector(".work__media").getBoundingClientRect(),
      };
    },
    destroy: () => {
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
      clearTimeout(intentTimer);
      clearTimeout(recycleTimer);
    },
  };
}

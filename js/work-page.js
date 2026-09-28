/* ==========================================================================
   WORK PAGE  ·  the deck's choreography
   --------------------------------------------------------------------------
   work.html is one long scroll spent in one place. Reading down:

     1  the hero      the eye centred, the title fixed mid-screen, the four
                      disciplines fixed at the lower left — NOTHING here
                      scrolls; they wait
     2  the rise      from the first pixel of scroll a black banner climbs
                      from the bottom. It paints over the index on its way up;
                      when its edge reaches the title it CARRIES it, shrinking
                      and fading, up behind the masthead and off the screen
                      altogether; the eye leaves upward too.
                      Inside the climbing banner the category heading rides
                      along DISPLACED — the site's difference echo, the same
                      ghost the nav and the cards use — and resolves the
                      moment the rectangle lands (.is-set)
     3  the deck      the banner is pinned and has the screen to itself.
                      Scrolling now moves what is INSIDE it: the cards of the
                      current category travel up, and when that category is
                      exhausted THE NEXT RECTANGLE CLIMBS OVER IT — the same
                      gesture the page opened with, not a fade — bringing its
                      own heading and its own cards
     4  the release   the last category done, the banner unpins and the footer
                      arrives

   MEASURED, NOT ASSUMED.
   A category with two cards and a category with six do not deserve the same
   amount of scroll. Each one's budget is four things in order — its climb,
   a screen of dwell, however far its own grid overflows the banner, and a
   rest at the end before it is replaced — so the page lengthens or shortens
   with the JSON, and no category is ever cut off, left still, or covered on
   the very pixel its last row arrived.

   The deck's height is therefore written from here rather than by the
   stylesheet: only JavaScript can measure what the cards actually came to.

   WHAT IS WRITTEN WHILE SCROLLING
   A handful of custom properties, all plain numbers or offsets, each on the
   one element that reads it. Only transform and opacity are animated.
   ========================================================================== */

import { isCompact, onCompactChange } from "./viewport.js?v=289";

export function initWorkPage({ lenis } = {}) {
  const deck = document.querySelector("[data-work-deck]");
  const eyeLayer = document.querySelector(".eye-layer");
  if (!deck) return null;

  /* Below the breakpoint the deck is not a deck at all: the stylesheet unpins
     the banner, unstacks the panels and lets the page be read as a page. There
     is nothing to drive, and driving it would mean measuring and writing on
     every scroll for a layout that ignores the result.

     NOT A SINGLE CHECK, THOUGH. A window can be narrow when this runs and wide
     a moment later — a restored session, a pane still opening, a browser that
     has not settled — and a one-shot test catches whichever width happened to
     exist at that instant. Asked once here, again after `load`, and again
     whenever the breakpoint is actually crossed. Wiring is one-way and once:
     going back to narrow leaves the engine in place, harmless, because the
     stylesheet stops reading anything it writes. */
  let engine = null;

  /* Reduced motion takes the same static path as a narrow screen: the shared
     media block in pages.css unpins the deck for both, and a banner that
     climbs and carries a title is exactly the motion being declined. */
  const stillness = window.matchMedia("(prefers-reduced-motion: reduce)");

  function wire() {
    if (engine || isCompact() || stillness.matches) return;
    engine = createEngine(deck, eyeLayer, lenis);
  }

  /* --- THE INDEX IS WIRED ONCE, HERE, AND NOT INSIDE wire() -----------------
   * It used to be attached in the same breath as the engine, which meant a
   * layout with no engine - every phone, and reduced motion - never had a click
   * listener on these four links at all. The browser followed the bare #id
   * instead, which is a hard cut, and the smooth branch written for exactly
   * that case below could never run.
   *
   * So it is attached unconditionally, and asks at CLICK time which layout is
   * in force. A getter rather than the engine itself, for two reasons: the
   * engine may not exist yet when this runs (it can be built after `load` or
   * when the breakpoint is crossed), and once built it is never torn down - a
   * window that goes back to narrow still holds one, and its plan describes a
   * deck the stylesheet is no longer drawing. */
  jumpsFromIndex(deck, {
    lenis,
    stillness,
    deckInForce: () => (isCompact() || stillness.matches ? null : engine),
  });

  wire();
  onCompactChange(wire);
  if (document.readyState !== "complete") {
    window.addEventListener("load", wire, { once: true });
  }

  return { wired: () => engine };
}

/* --- The engine ---------------------------------------------------------- */
function createEngine(deck, eyeLayer, lenis) {
  const title = document.querySelector(".work-hero__title");
  const heroIndex = document.querySelector(".work-hero__index");
  const masthead = document.querySelector(".masthead");

  let panels = [];
  let plan = [];        // one entry per panel: { dwell, overflow, budget, start }
  let riseLen = 0;      // px of scroll spent raising the banner
  let total = 0;        // px of scroll the whole deck is worth
  let current = -1;
  let titleContact = 0; // rise at which the banner's edge reaches the title

  /* THE TITLE'S GEOMETRY, KEPT, so the index can be hung off it.
     The index used to run on its own ramp — straight up from the moment the
     page moved — while the title WAITS at rest until the banner's edge reaches
     it. Two different clocks on two objects a few pixels apart, so the row of
     categories climbed straight through the middle of the words. They are now
     one object: the index is placed under the title's real bottom edge, frame
     by frame, and the title's bottom edge is arithmetic this file already has.
     Read at measure time, never per frame — a bounding rect every frame would
     be a forced layout for something that can be calculated. */
  let titleRestTop = 0;
  let titleHeight = 0;
  let titleTravelPx = 0;
  let indexRestTop = 0;
  let indexGapPx = 0;
  let landed = false;   // the current panel is locked in place
  let indexGone = false;
  let watchers = [];    // one IntersectionObserver per panel, for the reveals
  let stageEl = null;   // measured, so the rise can be written in whole pixels

  /* THE PACE OF THE WHOLE PAGE lives in these three numbers, all fractions of
     one screen. Their first values (0.55 / 1.00 / 0.50) added up to 2.05
     screens of fixed ceremony per category — measured against the content,
     57% of the page's scroll was spent waiting for it. A site feels heavy
     when a gesture buys nothing; these are the numbers that decide what a
     gesture buys.

     How much scroll a category spends climbing over the one before it.
     Deliberately shorter than a full screen: the cover is a transition, not a
     destination. */
  const SLIDE = 0.40;

  /* The rest at the END of a category: scroll spent after its last row has
     arrived and before the next rectangle begins to climb.

     Without it the handover started on the very pixel the travel finished, so
     the last row was covered by the same gesture that brought it into view —
     you would nudge down to read the name under the bottom card and the next
     category would already be rising over it. A category has to be allowed to
     be finished for a moment before it is replaced. */
  const TAIL = 0.25;

  /* The pause after a category lands, before its cards start to travel. A
     full screen of it was the single largest block of dead scroll on the
     page; a third is enough to read a heading and a first row. */
  const DWELL = 0.35;

  /* Mirrors --work-title-scale in pages.css. The stylesheet owns the shrink;
     this only needs to know how tall the title ENDS UP, to work out how far
     it has to travel to be off the screen. Kept as a named constant so the
     duplication is visible rather than a bare number nobody can trace. */
  const WORK_TITLE_SCALE = 0.42;

  /* --- Which cards have arrived -------------------------------------------
   * A card reveals when it comes into the panel's own window, not when its
   * category does. Each panel gets an observer whose ROOT is its viewport —
   * the element that clips the travelling grid — so "visible" means visible
   * inside the banner, which is the only sense that matters here. Rows below
   * the fold simply do not intersect, and are left closed until the grid
   * carries them up.
   *
   * Marked once and left marked: a reveal is a card arriving, and a card that
   * has arrived should not keep arriving as the scroll wobbles. It is cleared
   * again only when its whole category has gone out of sight (see apply), so
   * coming back to a category plays it afresh. */
  function watchCards() {
    watchers.forEach((o) => o.disconnect());
    watchers = panels.map((panel) => {
      const root = panel.querySelector(".work-deck__viewport");
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add("is-shown");
        }
      }, { root, threshold: 0.2 });
      panel.querySelectorAll(".work-card").forEach((card) => io.observe(card));
      return io;
    });
  }

  /* Re-observing is how a category replays. An observer reports a card the
     moment it starts watching it, so dropping and re-taking the whole panel
     gives every card a fresh verdict — which a class change alone could not,
     since nothing about the intersection itself has changed. */
  function replay(panel) {
    const index = panels.indexOf(panel);
    const io = watchers[index];
    if (!io) return;
    io.disconnect();
    panel.querySelectorAll(".work-card").forEach((card) => io.observe(card));
  }

  /* --- Measuring -------------------------------------------------------
   * Each panel gets: one screen to be looked at, plus whatever its grid
   * overflows the space the banner gives it. A category that fits gets the
   * dwell alone; one that does not gets exactly enough scroll to bring its
   * last row up to the top, and not a pixel more.
   */
  function measure() {
    stageEl = deck.querySelector(".work-deck__stage");
    panels = [...deck.querySelectorAll(".work-deck__panel")];
    if (!panels.length) return;

    const viewport = window.innerHeight;
    riseLen = viewport;

    /* The title's choreography, in three measured numbers.

       Its REST position is read from the computed `top` and offsetHeight
       rather than the bounding rect, because on a reload mid-scroll the rect
       already carries the ride transform and would poison the measurement.

       titleContact is the rise at which the banner's edge touches the title's
       bottom — before it, the title waits; after it, it is carried. The
       travel is the real distance from rest to just under the masthead,
       written in svh so the stylesheet stays in responsive units. */
    let restBottom = 0;
    if (title) {
      const restTop = parseFloat(getComputedStyle(title).top) || 0;
      restBottom = restTop + title.offsetHeight;
      titleContact = clamp01(1 - restBottom / viewport);

      /* It LEAVES. The travel carries its bottom edge past the top of the
         screen rather than parking it under the masthead, so the category
         below gets the whole banner. Its shrunk height is what has to clear,
         not its full one — the scale runs on the same 0…1 — and the extra
         masthead's worth is so it is gone rather than grazing the edge. */
      const shrunk = title.offsetHeight * WORK_TITLE_SCALE;
      const clearance = restTop + shrunk + (masthead?.offsetHeight ?? 0);
      title.style.setProperty(
        "--title-travel",
        `${(-clearance / viewport * 100).toFixed(2)}svh`
      );

      // Kept for the index, which rides underneath it.
      titleRestTop = restTop;
      titleHeight = title.offsetHeight;
      titleTravelPx = -clearance;

    }

    /* WHERE THE INDEX RESTS, and only that. It used to need the title's left
       edge too, because it hung under the title's first letter; centred in a
       row beneath it, the horizontal is the stylesheet's business and the gap
       below the words is the only thing that has to be measured.

       Written in svh rather than px so the value stays proportional to the
       viewport it was taken from. The stylesheet interpolates from here to the
       masthead as --index-dock climbs; nothing else about the journey is
       decided in this file. */
    if (heroIndex) {
      indexGapPx = Math.round(viewport * 0.06);
      indexRestTop = restBottom + indexGapPx;
      heroIndex.style.setProperty("--index-top", `${Math.round(indexRestTop)}px`);
    }

    /* --- HOW WIDE THE DECK MAY BE ------------------------------------------
     * Run before anything is planned, because it changes what there is to
     * plan against.
     *
     * Two 4:3 cards at full width are taller than a laptop's banner: on a
     * 1911x860 screen the cards get 498px of room, a name needs 43 of it, and
     * the card itself came out 20px too tall — so the name sat just below the
     * fold. Flattening the card further was the wrong lever; past 16:9 it
     * stops looking like a piece of work.
     *
     * The lever that costs nothing is the deck's WIDTH. Narrower cards are
     * shorter at the same ratio, and because the heading and the grid share
     * this measure the whole composition narrows together — which reads as a
     * page margin, not as the dead column that narrowing only the grid gave.
     *
     * Solved for the flattest ratio allowed, so it takes as little width as
     * it possibly can: on a tall screen the answer is wider than the design's
     * own limit and nothing happens at all. */
    capDeckWidth();

    let start = riseLen;
    plan = panels.map((panel, i) => {
      const grid = panel.querySelector(".work-deck__grid");
      const head = panel.querySelector(".work-deck__head");

      /* How much room the grid actually has: the banner minus the title above
         it and the panel's own padding. Read from the live boxes rather than
         recomputed from the tokens, so a change to either in CSS is picked up
         here without this file knowing about it. */
      const styles = getComputedStyle(panel);
      const chrome = (head?.getBoundingClientRect().height ?? 0)
        + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
        + parseFloat(styles.rowGap || 0);
      const room = Math.max(0, viewport - chrome);

      /* HOW TALL A CARD IS ALLOWED TO BE.
         The grid fills the width, so the card's width is settled — this only
         decides its height, and it is a compromise between two things that
         cannot both be had on a short screen.

         Two 4:3 cards side by side in a full-width banner are taller than a
         laptop's banner has room for. Something has to give: either the
         proportion, or seeing the name at the start of a category. So the cap
         is bounded at both ends and takes whatever fits between them —

           at most  a clean 4:3, which is the intended shape and what a tall
                    display gets outright;
           at least 16:9, because past that the footage stops reading as a
                    piece of work and starts reading as a letterbox;
           between  exactly the height that leaves the name on screen.

         When even 16:9 will not leave room for the name, 16:9 wins and the
         name sits just below the fold — where the travel brings it up a
         moment later, which is what the travel is for. The room already has
         the HUD's strip taken out of it, because the panel's bottom padding
         reserves it and `chrome` above reads that padding. */
      const card = grid?.querySelector(".work-card");
      const media = card?.querySelector(".card-work__media");
      if (card && media) {
        /* The COLUMN's width, not the media's. The media is the thing being
           sized here, so its current width is last frame's answer — the
           column is what it has to fill and is the only stable number. */
        const column = card.getBoundingClientRect().width;
        const label = card.getBoundingClientRect().height
          - media.getBoundingClientRect().height;
        const fits = room - label;
        const height = Math.max(
          column / (16 / 9),                      // never flatter than this
          Math.min(fits, column * 3 / 4)          // 4:3 at most, less if needed
        );
        panel.style.setProperty("--card-h", `${(height / viewport * 100).toFixed(3)}svh`);
      }

      const overflow = Math.max(0, (grid?.scrollHeight ?? 0) - room);

      /* Every category after the first opens by CLIMBING OVER the one before
         it, and that climb costs scroll of its own. The first does not: it is
         already in place when the main banner finishes rising, so giving it a
         slide would mean a rectangle sliding over an empty screen. */
      const slide = i === 0 ? 0 : Math.round(viewport * SLIDE);
      const dwell = Math.round(viewport * DWELL);
      const tail = Math.round(viewport * TAIL);
      const budget = slide + dwell + overflow + tail;
      const entry = { slide, dwell, overflow, tail, budget, start };
      start += budget;
      return entry;
    });

    total = start;
    // The runway. Written here because only a measurement knows how long the
    // content made it.
    deck.style.height = `${total + window.innerHeight}px`;

    /* Observers last, after the heights they judge against are settled — and
       re-made on every measure, because a rebuild hands us different cards
       and a resize moves the window they are judged against. */
    watchCards();
  }

  /* Written on the page, not the deck: the list section at the foot uses the
     same measure, and a deck 70px narrower than the list below it would be a
     seam you could see on the way past. */
  function capDeckWidth() {
    const panel = panels[0];
    const grid = panel?.querySelector(".work-deck__grid");
    const card = grid?.querySelector(".work-card");
    const media = card?.querySelector(".card-work__media");
    const head = panel?.querySelector(".work-deck__head");
    if (!panel || !grid || !card || !media) return;

    document.body.style.removeProperty("--deck-maxw");   // measure unconstrained

    const styles = getComputedStyle(panel);
    const chrome = (head?.getBoundingClientRect().height ?? 0)
      + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      + parseFloat(styles.rowGap || 0);
    const room = Math.max(0, window.innerHeight - chrome);
    const label = card.getBoundingClientRect().height
      - media.getBoundingClientRect().height;

    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;

    const widest = cols * (16 / 9) * Math.max(0, room - label) + gap * (cols - 1);
    const ceiling = parseFloat(getComputedStyle(document.body).fontSize) * 108;

    // Never wider than the design's limit, never so narrow it stops being a
    // wall of work — half the screen is the floor.
    const capped = Math.max(window.innerWidth * 0.5, Math.min(ceiling, widest));
    document.body.style.setProperty("--deck-maxw", `${Math.round(capped)}px`);
  }

  /* --- Applying --------------------------------------------------------- */
  function apply() {
    if (!panels.length) return;

    // How far into the deck we are, in pixels. Reading the rect rather than
    // scrollY keeps this correct wherever the deck sits on the page.
    const into = -deck.getBoundingClientRect().top;

    /* 1 · The banner climbing.
       --deck-rise stays a 0…1 number because the title and the eye read it as
       a ratio. The STAGE gets its own value in whole pixels: the stylesheet
       used to turn the ratio into a percentage of the stage's height, which
       lands on fractions and left every glyph inside resampled half a pixel
       off. Rounded here, where the height is known. */
    const risen = clamp01(into / riseLen);
    deck.style.setProperty("--deck-rise", risen.toFixed(3));
    deck.style.setProperty("--deck-riseY",
      `${Math.round((1 - risen) * (stageEl?.offsetHeight || window.innerHeight))}px`);

    /* 1b · The title. It WAITS at rest until the banner's edge reaches it —
       that is what titleContact marks — and only then is carried, so the two
       read as one object pushing another rather than two animations that
       happen to overlap. Past the deck it departs with the released banner:
       the exit offset is exactly the scroll the banner has scrolled away by. */
    let titleRide = 0;
    let titleExit = 0;
    if (title) {
      titleRide = titleContact < 1
        ? clamp01((risen - titleContact) / (1 - titleContact))
        : risen;
      titleExit = -Math.max(0, Math.round(into - total));
      title.style.setProperty("--title-ride", titleRide.toFixed(3));
      title.style.setProperty("--title-exit", `${titleExit}px`);
    }

    /* 1c · The index does not get swallowed any more; it travels.
       It used to be painted over by the climbing banner and then hidden
       outright, which left the page's only navigation usable for one screen
       out of a dozen — and that one screen is the one BEFORE the reader knows
       what any of the four categories contain. Now the same rise that raises
       the banner carries the index up into a strip under the masthead, where
       it stays for the whole deck. One number doing two jobs, so the strip and
       the banner cannot fall out of step.

       IT STILL HAS TO GO IN THE END, for the original reason: this is a FIXED
       element, so when the banner releases at the foot of the deck it would
       otherwise float over the list section in the middle of the page. Being
       covered was never the same as being gone. Only the moment moved — from
       the start of the deck to past the end of it, which is also where the eye
       comes back, so the two changes read as one handover. */
    if (heroIndex) {
      /* HUNG OFF THE TITLE'S BOTTOM EDGE, until the masthead stops it.

         The title's transform is a translate, a second translate for the exit,
         and a scale about `center top`. With the origin at the top, scaling by
         k leaves the top where the translate put it and makes the rendered
         height h*k — so the bottom edge is reachable in one line of
         arithmetic, with no layout read.

         While that edge is below the masthead the index sits a fixed gap under
         it and the two move as one object. Once it would go higher, the index
         stops: the title carries on and leaves the screen, the four categories
         stay pinned under the navigation. That is the whole handover, and it
         needs no second ramp to keep the two in step, because there is no
         second ramp. */
      const mastheadH = masthead?.offsetHeight ?? 0;
      const k = 1 - titleRide * (1 - WORK_TITLE_SCALE);
      const titleBottom =
        titleRestTop + titleRide * titleTravelPx + titleExit + titleHeight * k;

      const top = Math.max(mastheadH, titleBottom + indexGapPx);
      heroIndex.style.setProperty("--index-top", `${Math.round(top)}px`);

      /* How far along that journey it is, for the type and the spacing to
         close with it. Derived from where it ACTUALLY is rather than from the
         rise, so the size can never disagree with the position. */
      const span = Math.max(1, indexRestTop - mastheadH);
      heroIndex.style.setProperty(
        "--index-dock",
        clamp01(1 - (top - mastheadH) / span).toFixed(3)
      );

      const past = into > total;
      if (past !== indexGone) {
        indexGone = past;
        heroIndex.inert = past;
        heroIndex.classList.toggle("is-gone", past);
      }
    }

    /* 2 · The eye. Out of the way for the work, and BACK for the list.
       It leaves a little ahead of the banner rather than being covered by it —
       a sphere sliding out from behind a black rectangle is a slower way of
       achieving nothing — and it returns as the banner releases, so the
       list at the foot of the page sits over the same eye the page opened
       with instead of over flat black. One number, two ramps: whichever is
       smaller wins, which holds it away for the whole of the deck. */
    if (eyeLayer) {
      const away = clamp01(into / (riseLen * 0.8));
      const back = 1 - clamp01((into - total) / (riseLen * 0.9));
      eyeLayer.style.setProperty("--deck-eye", Math.min(away, back).toFixed(3));
    }

    /* 3 · Which category, and how far through it. */
    const after = into - riseLen;
    let index = 0;
    while (index < plan.length - 1 && after >= plan[index].start - riseLen + plan[index].budget) {
      index += 1;
    }
    const here = plan[index];
    const local = Math.max(0, after - (here.start - riseLen));

    /* 4 · The rectangle climbing over the one before it. This is the whole of
       a category change: not a fade between two panels but a new black
       rectangle rising from below and covering the old one, the same gesture
       the page opens with. The first category has no slide — it is already in
       place when the main banner lands — so its cover reads 1 from the start. */
    const cover = here.slide > 0 ? clamp01(local / here.slide) : 1;
    // Pixels, not a percentage, for the same reason the stage takes pixels.
    panels[index].style.setProperty("--panel-y",
      `${Math.round((1 - cover) * panels[index].offsetHeight)}px`);

    /* 5 · The cards travelling up inside it. The dwell comes AFTER the climb —
       the category is landed and read before anything moves — and only the
       scroll past that turns into travel, capped at the overflow so the last
       row stops at the top instead of scrolling into nothing. */
    const travel = Math.min(here.overflow, Math.max(0, local - here.slide - here.dwell));
    panels[index].style.setProperty("--grid-y", `${-Math.round(travel)}px`);

    /* 6 · Arrival. The heading is displaced while its rectangle is still
       climbing and resolves the moment it lands — for the first category that
       is the main banner reaching the top, for the rest it is their own cover
       completing. Toggled rather than written every frame: it is one boundary,
       and the transition on the other side is what does the work. */
    const set = index === 0 ? risen >= 0.999 : cover >= 0.999;
    if (set !== landed || index !== current) {
      landed = set;
      panels[index].classList.toggle("is-set", set);
    }

    if (index === current) return;      // same category: no more DOM work
    const previous = current;
    current = index;

    panels.forEach((panel, i) => {
      const on = i === index;
      panel.classList.toggle("is-current", on);

      /* Live means rendered: the current rectangle, and the one it is in the
         act of covering. Everything else is either off-screen below or sealed
         behind an opaque panel, and rendering it would be compositing video
         nobody can see. */
      panel.classList.toggle("is-live", on || i === index - 1);

      // Out of the tab order and out of the accessibility tree when it is not
      // the one on screen; otherwise a keyboard walks into cards stacked
      // invisibly behind the current panel.
      panel.inert = !on;

      if (!on) {
        // Parked where it belongs relative to the one now showing: those
        // already passed stay landed underneath, those still ahead wait below.
        panel.style.setProperty("--panel-y",
          i < index ? "0px" : `${panel.offsetHeight}px`);

        /* THE ONE BEING COVERED KEEPS ITS SCROLL POSITION.
           A category is left at its LAST cards — that is the moment the next
           rectangle starts climbing — but it is still on screen while that
           climb happens, underneath. Resetting its grid here snapped it back
           to its first cards in full view, so the handover read as the whole
           category jumping up before being covered. It is only rewound once
           it is out of sight, which is the next boundary along — and that is
           the same moment its cards forget they were ever revealed, so
           returning to it opens them again rather than finding them done. */
        if (i !== index - 1) {
          panel.style.setProperty("--grid-y", "0px");
          panel.querySelectorAll(".work-card.is-shown")
            .forEach((card) => card.classList.remove("is-shown"));
        }

        if (i !== previous) panel.classList.remove("is-set");
      }
    });

    // The category now on screen opens its visible cards from the start.
    replay(panels[index]);

    // The address bar follows, so a category can be linked to and returned to.
    // replaceState, not push: this is one page being read, not four navigations.
    const id = panels[index].id;
    if (id && location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  }

  /* --- Wiring -----------------------------------------------------------
   * The native scroll event is the source of truth: it fires whenever the
   * position changes, including while Lenis is driving, because Lenis scrolls
   * the real document rather than faking it. Lenis's own event is subscribed
   * to as well for the tightest frame-sync; apply() is idempotent, so being
   * called from both is harmless.
   */
  /* The deck now owns the reveals: an unopened card is HELD closed rather
     than merely un-animated. Written from here, so it is only ever true when
     this engine is actually running — everywhere else the cards are simply
     open, which is the state that must not depend on JavaScript. */
  deck.classList.add("is-driven");

  measure();
  apply();

  window.addEventListener("scroll", apply, { passive: true });
  if (lenis?.on) lenis.on("scroll", apply);

  window.addEventListener("resize", () => { measure(); apply(); }, { passive: true });

  /* Fonts and images settle after first paint and change what the grid came
     to, so the measurement is taken again once everything has arrived. */
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => { measure(); apply(); }, { once: true });
  }

  // A language switch rebuilds every panel: new elements, new heights.
  document.addEventListener("workdeck:rebuilt", () => {
    // Brand new panel elements: nothing that was true of the old ones is true
    // of these, so both pieces of remembered state go back to unknown.
    current = -1;
    landed = false;
    measure();
    apply();
  });

  return { measure, apply, planOf: () => ({ plan, riseLen, total }) };
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/* --- The index in the hero -----------------------------------------------
 * The four links are real anchors, and left alone the browser honours them the
 * only way it knows: by scrolling that id into view. But the panels are
 * stacked in one place — their ids are not four positions down the page, they
 * are all the same position — so the browser's jump lands nowhere useful.
 *
 * The destination is computed from the deck's own plan instead: the scroll
 * offset at which that category's dwell begins, which is the only place its id
 * actually means something.
 *
 * Where there is no deck in force, the panels ARE four positions down the page,
 * and the link simply glides to the one it names. `deckInForce` answers which
 * of the two this click is dealing with; see where this is wired.
 */
function jumpsFromIndex(deck, { lenis, stillness, deckInForce }) {
  const links = document.querySelectorAll("[data-work-jump]");
  if (!links.length) return;

  for (const link of links) {
    link.addEventListener("click", (event) => {
      // Leave every modified click alone: a new tab, a middle click and a
      // download are all the visitor asking for something else entirely.
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey) return;

      const id = decodeURIComponent((link.getAttribute("href") || "").slice(1));
      const panels = [...deck.querySelectorAll(".work-deck__panel")];
      const index = panels.findIndex((p) => p.id === id);
      if (index < 0) return;              // not built yet: let the browser try

      const engine = deckInForce();

      /* --- NO DECK: THE PANELS ARE WHERE THEY LOOK LIKE THEY ARE -----------
       * On a phone, and under reduced motion, the four panels are ordinary
       * sections in the flow, each at its own place down the page. The
       * elaborate destination below is meaningless there - but so is letting
       * the browser handle it, because a native jump to an id is a hard cut,
       * and every other move on this site glides.
       *
       * WHERE IT STOPS. Each panel's title is sticky, pinned `top` below the
       * masthead, so landing the panel's own top edge at the top of the
       * screen would pin the title straight over its first cards. The panel
       * is landed that far down instead, which is exactly where its title
       * docks. Read from the title's COMPUTED top, which the browser has
       * already resolved to pixels: --masthead-height is a calc() expression,
       * and parseFloat on it is NaN, which silently became an offset of 0.
       *
       * Under reduced motion the move is instant, as the native jump was: a
       * glide is the very motion being declined. */
      if (!engine) {
        const panel = panels[index];
        const head = panel.querySelector(".work-deck__head");
        const dock = (head && parseFloat(getComputedStyle(head).top)) || 0;
        event.preventDefault();

        if (lenis?.scrollTo) {
          /* MEASURED AFRESH FIRST. Lenis clamps every destination to the page
             height it last measured, and it only re-measures on a debounce
             after the page changes size. A click inside that window - cards
             still arriving, images still sizing the page - would glide to the
             old bottom and stop short of the category. One read, on a click. */
          lenis.resize?.();
          lenis.scrollTo(panel, { offset: -dock, immediate: stillness.matches });
        } else {
          window.scrollTo({
            top: panel.getBoundingClientRect().top + window.scrollY - dock,
            behavior: stillness.matches ? "auto" : "smooth",
          });
        }
        return;
      }

      const { plan } = engine.planOf();
      if (!plan[index]) return;

      event.preventDefault();

      /* PAST THE CLIMB, and a little into the dwell. A category's budget opens
         with the scroll that raises its rectangle over the one before it;
         landing on `start` would leave the reader parked at the instant that
         climb BEGINS, still looking at the previous category. The destination
         is where the rectangle has arrived and settled — which is what the
         link promised. */
      const top = deck.getBoundingClientRect().top + window.scrollY;
      const y = top + plan[index].start + plan[index].slide
        + Math.round(plan[index].dwell * 0.1);

      if (lenis?.scrollTo) lenis.scrollTo(y);
      else window.scrollTo({ top: y, behavior: "smooth" });
    });
  }
}

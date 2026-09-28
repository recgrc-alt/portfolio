/* ==========================================================================
   MAIN  ·  entry point for every page
   --------------------------------------------------------------------------
   One script, loaded by all four pages. It does two things:

     1. SHARED CHROME — the language switch, the clock, the 3D eye, smooth
        scroll and scroll reveals run on every page, because every page has
        them. This is what keeps the dark theme and the eye continuous as you
        move between pages.

     2. PAGE MODULES — each page's own behaviour is gated on a marker element
        that only that page ships. The home page has [data-hscroll]; the
        gallery has [data-work-gallery]; and so on. A page runs only what it
        actually contains, and the page-specific modules are loaded on demand
        so no page pays to download code it never runs.

   Orchestration lives here; logic lives in the modules.
   ========================================================================== */

import { config } from "./config.js?v=289";
import { startClock } from "./clock.js?v=289";
import { initI18n, i18nReady } from "./i18n.js?v=289";
import { holdPage, pageReady, sealPage } from "./page-ready.js?v=289";
import { createPointer } from "./pointer.js?v=289";
import { initEye } from "./eye.js?v=289";
import { initScenePower } from "./scene-power.js?v=289";
import { initSmoothScroll, holdScrollTarget } from "./smooth-scroll.js?v=289";
import { initReveal, settleInView, replayEntrances } from "./reveal.js?v=289";
import { initClickSound } from "./click-sound.js?v=289";
import { initPrefetch } from "./prefetch.js?v=289";
import { initAmbience } from "./ambience.js?v=289";
import { initSoundToggle } from "./sound-toggle.js?v=289";
import { initCursor } from "./cursor.js?v=289";
import { initCardAudio } from "./card-audio.js?v=289";
import { initPageTransition } from "./page-transition.js?v=289";
import { isTouch, isCompact, onCompactChange } from "./viewport.js?v=289";
import { initNavMenu } from "./nav-menu.js?v=289";
import { initCardCarousel } from "./card-carousel.js?v=289";
import { initLoader } from "./loader.js?v=289";

/* Bumped whenever the JS changes. If the console does not show this exact
   line, the browser is running a CACHED old bundle — hard-reload or clear the
   cache. This is the quickest way to tell fresh code from stale. */
const BUILD = "build 276 · soft capture text, and marks for MediaPipe, Gemini, PHP and Mixamo";

function boot() {
  console.log("%c▲ Rogério Edgar · " + BUILD, "color:#8cbe69;font-weight:bold");

  // First thing: the loading screen is already on screen from the markup, and
  // this is what eventually takes it away. Once per visit, not per page.
  initLoader(document.querySelector("[data-loader]"));

  /* --- Shared chrome (every page) -------------------------------------- */

  // Language first: it rewrites text and attributes that later modules read,
  // so running it ahead means nothing has to be re-done. Async, but nothing
  // below waits — modules that care listen for the `languagechange` event.
  initI18n();

  /* Hold the black over the page until the words are right.
     The site is authored in English and Portuguese is applied once the
     dictionary lands, so for a moment every page painted "About / Work /
     Contact" and then swapped under the reader. The veil already covered the
     arrival — it just faded out faster than the dictionary arrived.
     Now it waits, and the fade is the page appearing already correct.

     The loader does the same on the first page of a visit (see loader.js);
     this covers every page after it, which is where the swap was most
     visible — the wipe opened onto the wrong language. */
  const veil = document.querySelector("[data-page-veil]");
  if (veil) {
    veil.classList.add("is-held");
    // Never .then(): i18nReady is built so it always settles, but a release
    // that depended on success could strand the page behind the veil.
    // Both, not just the language: on the gallery the wipe used to open onto
    // a page with no cards in it yet. pageReady() is capped and never rejects,
    // so this cannot leave the veil shut.
    Promise.all([i18nReady, pageReady()]).finally(() => {
      // Same reason as in loader.js: the wipe must open onto a page that is
      // already there, not onto one that starts arriving once it has opened.
      settleInView();
      replayEntrances();
      veil.classList.remove("is-held");
      veil.classList.add("is-clearing");
    });
  }

  startClock(document.querySelector("[data-clock]"));

  /* The two HUD extras. Both are DESKTOP ONLY, and the guard is not cosmetic:
     the whole HUD is display:none below the breakpoint, so on a phone this
     code would wire up controls nobody can see — and the distance module would
     go as far as asking for a location permission and spending a request on
     mobile data to fill in a readout that is not on screen.

     NOT a single check at boot. A window can be narrow at DOMContentLoaded and
     wide a moment later — a restored session, a pane being dragged open, a
     phone rotating — and a one-shot test catches whichever width happened to
     exist at that instant, leaving the HUD dead on a desktop for no reason
     anyone could see. onCompactChange exists for exactly this. Wiring is
     one-way and once: crossing back to narrow leaves them in place, harmless
     behind a display:none HUD, rather than tearing down live listeners. */
  let hudExtrasWired = false;
  function wireHudExtras() {
    if (hudExtrasWired || isCompact()) return;
    hudExtrasWired = true;

    // Neither asks for anything on arrival — see the modules.
    import("./distance.js?v=289").then((m) =>
      m.initDistance(document.querySelector("[data-distance]"))
    );

    // Pressing the local time opens the hour scrubber, which re-lights the eye
    // live. Loaded on demand: it is an extra, and a page where nobody presses
    // it should not pay to download it.
    import("./hour-picker.js?v=289").then((m) =>
      m.initHourPicker(document.querySelector(".meta--time"))
    );
  }
  wireHudExtras();
  onCompactChange(wireHudExtras);
  // And once more when everything has actually arrived. At DOMContentLoaded the
  // viewport is not always its final size — a restored window, a pane still
  // opening, a browser that has not settled — and a narrow reading there made
  // the whole thing skip on a screen that was never narrow. Re-asking after
  // `load` costs nothing (the flag makes it a no-op when it already ran) and
  // removes the dependence on one instant.
  window.addEventListener("load", wireHudExtras, { once: true });

  // The eye reads the shared pointer every frame; it is the same fixed canvas
  // on every page, which is what makes it feel like one continuous space.
  //
  // On a touch screen it swaps to the resting drift and stops chasing the
  // pointer: there is no cursor there, so `follow` would only ever aim at
  // wherever the last tap landed. The eye keeps breathing, it just no longer
  // pretends to be watching you. Desktop is untouched.
  /* --- SMOOTH SCROLL FIRST, AND THE ORDER IS THE POINT --------------------
   * requestAnimationFrame callbacks run in the order they were registered, so
   * whichever of these two is set up first is the one that runs first on every
   * frame for the rest of the visit.
   *
   * The eye used to be first. That meant it rendered against the PREVIOUS
   * frame's scroll position, every frame, for ever: the background was
   * permanently one frame behind the page in front of it. At 144Hz that is 7ms
   * and nobody sees it. At 30Hz, which is what a laptop does when the fragment
   * shader is working hard, it is 33ms of visible drag between the ground and
   * everything standing on it - and "the background lags the content" is
   * exactly what reads as mechanical rather than fluid.
   *
   * Lenis first, so the scroll position is current before anything draws with
   * it. Nothing between here and initScenePower() below needs `eye`, which is
   * why this could simply move. */
  const lenis = initSmoothScroll();
  window.__lenis = lenis;   // exposed for debugging / driving in tests

  /* The other half of "Drag / Scroll to explore". Loaded on demand and it
     returns null on a touch screen, where the browser already does this
     better than any script could. See drag-scroll.js. */
  import("./drag-scroll.js?v=289").then((m) => m.initDragScroll(lenis));

  const pointer = createPointer();
  const canvas = document.getElementById("eye-canvas");
  /* Held so the power control below can reach it. A page with no eye canvas
     leaves this null and simply has nothing to switch off. */
  let eye = null;
  if (canvas) {
    /* On touch the eye also renders at a lower pixel ratio. Measured on a
       375px phone: at the 2x cap the loop shades 1 218 000 pixels a frame, at
       1.5 it shades 685 000 — a 44% cut in the work that actually costs
       something here, because this is a full-screen fragment shader and its
       5 800 triangles are free by comparison.

       It is the one element that can afford it: a soft, out-of-focus sphere
       with no text and no hard edges. The TEXTURE is deliberately left alone —
       the iris resolves to 315 real pixels on a phone but 1 210 on a large
       retina desktop, and the model file is shared, so shrinking it to suit
       the phone would soften the eye everywhere it is actually seen large. */
    const eyeConfig = isTouch()
      ? {
          ...config,
          activeEffects: config.touchEffects,
          perf: { ...config.perf, maxPixelRatio: config.perf.touchPixelRatio },
        }
      : config;
    eye = initEye({ canvas, pointer, config: eyeConfig });
  }

  /* --- NOT RENDERING WHAT NOBODY IS LOOKING AT ---------------------------
   * The eye already stopped for a hidden tab. It did not stop for the far more
   * common case: a case study lays opaque black over it for most of its
   * length, and the model, the shader, the light rig and the dust field went
   * on being drawn into a canvas behind that ground the whole way down.
   *
   * Wired here rather than inside eye.js because knowing what covers the eye
   * means knowing about sections the eye has no other reason to have heard of.
   * The eye exposes a switch; this decides when to throw it. Handed the same
   * Lenis instance the rest of the page rides, so no second scroll listener is
   * created for one gesture. */
  if (eye) initScenePower(eye, lenis);
  initReveal();   // [data-reveal] elements exist on several pages

  /* --- Sound and navigation, all shared chrome ------------------------- *
   * Whether the site is allowed to make noise lives in ONE place
   * (audio-state.js): the gesture the browser demands, plus the visitor's own
   * toggle. Every player below reads it, so the speaker button governs all of
   * them at once. */
  // The phone's full-screen menu. Dormant above the breakpoint: the toggle it
  // needs is display:none there, so nothing it does can reach the desktop bar.
  initNavMenu({
    button: document.querySelector("[data-nav-toggle]"),
    panel: document.querySelector("[data-nav-panel]"),
  });

  initSoundToggle(document.querySelector("[data-sound-toggle]"));
  initClickSound();
  initAmbience();

  /* The ring that replaces the pointer. Returns null and changes nothing on a
     touch screen or under reduced motion, so it is safe to call everywhere. */
  initCursor();

  // Hovering a project's clip unmutes it if it actually carries sound. Bound
  // to the body by delegation, so it covers the gallery cards the JSON builds
  // later as well as a project page's banner.
  initCardAudio(document.body);

  // The black wipe between pages, which also fades the ambience out instead of
  // letting navigation cut it off. Prefetch warms the page it is about to
  // reveal, on hover, so the wipe is not covering a blank wait.
  initPageTransition(document.querySelector("[data-page-veil]"));
  initPrefetch();

  /* --- WHY PAGE CHANGES FEEL SLOW, AND WHERE TO TAKE THIS --------------- *
   * Each navigation is a full document load: the browser tears down this page
   * — including the WebGL eye — re-downloads the HTML/JSON/JS, then rebuilds
   * and re-initialises all of it from scratch. The eye's setup is the heaviest
   * part, and it happens again on every click. initPrefetch() removes the
   * network wait; the re-init is what's left. The real fix is to stop
   * reloading: a small client-side router (or the View Transitions API) would
   * keep this script and the eye alive and swap only the page's content, so
   * moving between pages costs a fetch and a paint, not a cold boot. That's a
   * deliberate next step, not a patch — left for when we choose to take it. */

  /* --- Page-specific behaviour ----------------------------------------- *
   * Each branch is entered only if its marker element is present, and it
   * imports its module on demand — the gallery's code never loads on the
   * contact page, and vice versa. The context the module needs (pointer,
   * lenis) is passed in. */

  // HOME — hero fx, the reveal statement + depth photo, the sideways cards,
  // and the capabilities marquee with the sinking eye.
  if (document.querySelector("[data-hero-title]")) {
    initHome({ pointer, lenis });
  }

  // WORK — the gallery, built from data/projects.json.
  if (document.querySelector("[data-work-gallery]")) {
    // The cards ARE this page. Nothing should uncover before they exist.
    holdPage(import("./work-gallery.js?v=289").then(async (m) => {
      await m.initWorkGallery(document.querySelector("[data-work-gallery]"));

      /* Only now. Two of the three things this sets up — the anchors from the
         hero index and the echo on each category heading — need the sections
         and headings to exist, and they are built from JSON a moment ago. Run
         earlier it would find nothing and silently do nothing. */
      const page = await import("./work-page.js?v=289");
      page.initWorkPage({ lenis });
    }));

    /* The list at the foot of the page. NOT inside the hold above: it sits
       below the whole deck, so nobody is looking at it when the page
       uncovers, and making the loading screen wait for it would be paying
       for something off screen. It builds from the same JSON, which by then
       is already in the cache. */
    import("./work-list.js?v=289").then((m) => {
      m.initWorkList(document.querySelector("[data-work-list]"), { lenis });
    });
  }

  // PROJECT — one template filled from the ?id= parameter.
  if (document.querySelector("[data-project-page]")) {
    holdPage(import("./project-page.js?v=289").then(async (m) => {
      await m.initProjectPage(document.querySelector("[data-project-page]"));
      // The hero video is injected by the module, so its feed observer can
      // only be wired after that has run.
      const { initCamFeeds } = await import("./cam-feeds.js?v=289");
      initCamFeeds(document.querySelector("[data-project-page]"));

      /* --- The depth chapters, once their canvases exist --------------------
       * Same timing rule as the feeds above: these are built from JSON a
       * moment ago, so anything wired before initProjectPage would find
       * nothing. Only loaded where a chapter actually asked for one — most
       * projects have none, and a WebGL context is not free. */
      const canvasesDepth = document.querySelectorAll("[data-depth-media]");
      if (canvasesDepth.length) await initDepthChapters(canvasesDepth, { pointer, lenis });
    }));
  }

  // CONTACT — the copy button and the form.
  if (document.querySelector("[data-contact]")) {
    import("./contact.js?v=289").then((m) =>
      m.initContact(document.querySelector("[data-contact]"))
    );
  }

  /* Registration is over. Every branch above that builds real content has
     already called holdPage synchronously, so from here "nothing is holding
     the page" finally means what it says. Until this runs, pageReady() waits —
     which is the whole point: it used to answer before anyone had asked. */
  sealPage();
}

/* --- Depth chapters on a case study ----------------------------------------
 * The shader is in depth-media.js. What lives here is the POLICY: where the
 * displacement comes from, which is a decision about the page rather than
 * about pixels, and the same split boot() already makes for the About photo.
 *
 * TWO SOURCES, ADDED, AND THE SCROLL IS THE LOUDER ONE.
 * The chapter holds the clip still while the paragraphs beside it go past, so
 * the scroll is the only motion every reader is guaranteed to make — it
 * carries the sweep, the section's own 0-to-1 mapped onto -1..1. The pointer
 * adds a smaller amount on top, and a second axis the scroll does not have, so
 * moving over the clip tilts it slightly as well. Clamped by the shader's own
 * input handling, so the two together can never exceed the single-source range
 * and the effect does not get stronger just because both are happening.
 *
 * AND IT HOLDS STILL IF ASKED. The pointer is a motion the reader starts; this
 * one happens whether they want it or not, so reduced-motion pins it to the
 * centre. The clip still plays and the chapter still reads — it is the
 * parallax that stops, not the content. */
async function initDepthChapters(canvases, { pointer, lenis }) {
  const [{ initDepthMedia }, { trackScrollProgress }] = await Promise.all([
    import("./depth-media.js?v=289"),
    import("./scroll-progress.js?v=289"),
  ]);

  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  const COM_PONTEIRO = 0.35;   // how much of the range the cursor may claim
  const COM_SCROLL   = 0.75;   // and how much the scroll keeps for itself

  for (const canvas of canvases) {
    const video = canvas.parentElement?.querySelector("video");
    const mapa = canvas.dataset.depthMap;
    if (!video || !mapa) continue;

    /* Read once per scroll in the shared measurement pass, not out of the DOM
       every frame. The section is what moves, not the figure: the figure is
       sticky and therefore stationary for most of the chapter, so measuring it
       would report almost no progress at all. */
    let progresso = 0;
    const seccao = canvas.closest(".project-chapter");
    if (seccao) trackScrollProgress(seccao, { lenis, onUpdate: (p) => { progresso = p; } });

    initDepthMedia(canvas, {
      video,
      depthUrl: mapa,
      input: () => {
        if (semMovimento.matches) return { x: 0, y: 0 };

        const doScroll = (progresso * 2 - 1) * COM_SCROLL;
        if (isTouch()) return { x: doScroll, y: 0 };

        /* Relative to the canvas itself, so it stays correct wherever the
           sticky figure happens to be sitting when the pointer arrives. */
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return { x: doScroll, y: 0 };
        const px = ((pointer.clientX - r.left) / r.width) * 2 - 1;
        const py = ((pointer.clientY - r.top) / r.height) * 2 - 1;

        return {
          x: doScroll + px * COM_PONTEIRO,
          y: py * COM_PONTEIRO,
        };
      },
    });
  }
}

/* --- The home page's own wiring ------------------------------------------
 * Kept in one function so boot() stays a readable table of contents. Its
 * modules are imported together because the home page always needs all of
 * them. */
async function initHome({ pointer, lenis }) {
  const [
    { initHeroScrollFx },
    { initPhotoReveal },
    { initPhotoDepth },
    { initMarquee },
    { initHorizontalScroll },
    { bindProgressToProperty, trackScrollProgress },
  ] = await Promise.all([
    import("./scroll-fx.js?v=289"),
    import("./reveal-photo.js?v=289"),
    import("./photo-depth.js?v=289"),
    import("./marquee.js?v=289"),
    import("./horizontal-scroll.js?v=289"),
    import("./scroll-progress.js?v=289"),
  ]);

  initHeroScrollFx(lenis);

  // About: the hover-revealed statement and the depth-mapped photo behind it.
  // initPhotoReveal returns immediately on touch — there, the statement is
  // plain HTML over the photo instead of a cursor wipe.
  initPhotoReveal(document.querySelector("[data-photo-reveal]"));

  // The depth photo is a DESKTOP effect and is skipped entirely on touch. Its
  // parallax is driven by the pointer, which on a phone only moves when you
  // scroll; and the source is landscape, so at phone width the WebGL canvas
  // resolved to a 375x281 letterbox stranded in a 650px block. A plain <img>
  // with object-fit: cover does the job properly there (see .reveal__still),
  // and the phone is spared a second WebGL context next to the eye.
  /* --- TWO QUESTIONS, NOT ONE, AND THEY HAVE DIFFERENT ANSWERS ------------
   * viewport.js keeps "narrow screen" and "no cursor" apart on purpose, and
   * this is a place where the distinction earns its keep. The same shader
   * serves both; only its frame and its input change.
   *
   *   SHAPE is a layout question -> isCompact().
   *   On a phone the stage is portrait and the picture is landscape, so the
   *   canvas fills the frame and the crop happens in the shader. On a desktop
   *   the canvas takes the picture's own aspect, because the whole About
   *   choreography grows that box.
   *
   *   INPUT is a pointer question -> isTouch().
   *   With a cursor the displacement follows it. Without one it follows the
   *   scroll: the section's own 0-to-1 mapped onto -1..1, so reading down the
   *   page sweeps the parallax across the face. Near features travel further
   *   than far ones - that difference is the whole effect - and what it reads
   *   as is the head turning, which a flat translate could never do.
   *
   * THIS ALSO FIXES A BLANK NOBODY HAD NOTICED. The old guard was isTouch()
   * alone, so a tablet in landscape - touch, but wider than the breakpoint -
   * initialised nothing, and the desktop rule hides the fallback <img> above
   * 768px. That layout showed no photograph at all. */
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvasFoto = document.querySelector("[data-photo-depth]");
  if (canvasFoto) {
    /* The section's progress, read once per scroll in the shared measurement
       pass rather than out of a custom property every frame. */
    let progresso = 0;
    if (isTouch()) {
      trackScrollProgress(document.getElementById("about"), {
        lenis,
        onUpdate: (p) => { progresso = p; },
      });
    }

    const depth = initPhotoDepth(canvasFoto, {
      pointer: isTouch() ? null : pointer,
      /* -1 at the top of the section, +1 at the bottom - unless the visitor
         asked for less motion, in which case the picture is rendered and held
         still. The desktop version follows a cursor, which is a motion the
         reader starts themselves; this one happens whether they want it or
         not, so it is the one that has to ask. */
      input: isTouch()
        ? () => ({ x: semMovimento.matches ? 0 : progresso * 2 - 1, y: 0 })
        : null,
      cover: isCompact(),
      config: config.photo,
    });

    /* AND THE ABOUT LINK NOW WAITS FOR IT.
       This section is what that link exists to reach, and the photo is the
       first thing in it. Gliding there before the textures have decoded landed
       the reader on an empty frame - the whole promise of the link, missing at
       the moment it was kept. The gate closes that window; a ceiling and an
       escape inside smooth-scroll.js stop it from ever becoming a wait worth
       noticing. Nothing is gated on touch, where this effect does not run. */
    holdScrollTarget("#about", depth?.ready);
  }

  /* --- The statement, arriving a line at a time -------------------------
   * On a phone the sentence over the photo was simply there, at full strength,
   * from the moment the section came into view. Everything around it moves;
   * it did not.
   *
   * NOTHING NEW IS ANIMATED HERE. split-lines.js already wraps each visual
   * line in a mask with a child that translates inside it - the pattern the
   * comment on [data-reveal] names as the only way to make a richer entrance
   * without repainting - and reveal.js already watches things and toggles a
   * class when they cross into view, replay on the way back down included.
   * This is two calls, and the choreography is the CSS both of them already
   * had.
   *
   * A SEPARATE ATTRIBUTE, not data-reveal. That one brings an opacity rule
   * with it, and this heading is already driven by one of its own: it fades
   * out as the title takes over. The two would fight over the same property
   * and the more specific selector would win, which is the fade-out - so the
   * sentence would never appear at all.
   *
   * THE NAME IS SAVED BEFORE THE SPLIT. Once split, textContent runs the lines
   * together - "Interactive webbuilt with code" - so the accessible name has
   * to be taken while it is still a sentence. project-heading.js does the same
   * thing for the same reason. And the dictionary rewrites textContent on a
   * language change, which throws the split away with it, so both are redone
   * when that happens. */
  const frase = document.querySelector("[data-lines]");
  if (frase) {
    const { keepSplit } = await import("./split-lines.js?v=289");
    /* On the HEADING, not on the span: the h2 is what a screen reader
       announces, and once the span is split its textContent runs the lines
       together - "Interactive webbuilt with code". Taken while it is still a
       sentence, and taken again after the dictionary rewrites it. */
    const titulo = frase.closest("h2") ?? frase;
    const guardarNome = () => titulo.setAttribute("aria-label", frase.textContent.trim());
    guardarNome();
    /* Every other [data-lines] heading is its own h2, so the name has to be
       saved on each of them and not only on the first. Same reason: once split,
       textContent runs the lines together. */
    for (const outro of document.querySelectorAll("[data-lines]")) {
      if (outro === frase) continue;
      outro.setAttribute("aria-label", outro.textContent.trim());
    }
    const divisor = keepSplit(document, "[data-lines]");
    document.addEventListener("languagechange", () => {
      guardarNome();
      divisor.refresh();
    });
    /* LATE, AND THAT IS THE WHOLE DIFFERENCE. The page-wide setting fires
       when a fifth of an element touches the bottom edge - right for a
       paragraph coming up the screen, wrong for this, which then played its
       entire 1.2s entrance below the fold and was finished before it could be
       seen. 90% of the sentence has to be inside the top 65% of the screen
       before it moves, so it rises where somebody is looking at it. */
    initReveal(document, {
      selector: "[data-lines]",
      threshold: 0.9,
      rootMargin: "0px 0px -35% 0px",
    });
  }

  // A Quick Look: vertical scroll drives the cards sideways. The module
  // un-pins itself below 768px on its own, and the deck below takes over.
  initHorizontalScroll(document.querySelector("[data-hscroll]"), { lenis });

  // The same cards as a swipeable deck on a phone, with dots. Does nothing
  // above the breakpoint, so the rail above keeps the desktop to itself.
  initCardCarousel(document.querySelector("[data-hscroll-track]"), {
    dotsHost: document.querySelector("[data-quick-dots]"),
  });

  // Capabilities: the marquee's duration is measured, not assumed, so its
  // speed holds whatever the type size or the tool list.
  initMarquee(document.querySelector("[data-marquee]"));

  /* How far through the toolkit we are, as one plain number. The eye reads it
     to sink, and on a phone to fade back behind the tool names.

     THIS USED TO BUILD A calc() STRING EVERY SCROLL FRAME
     `setProperty("--eye-y", \`calc(${drop} * ${p}\`)` meant assembling a string
     and handing the browser a fresh expression to PARSE on every scroll event,
     sixty times a second, for the whole section — to express something that
     never changes except for one factor. Now the factor is all that is
     written, and CSS does the arithmetic it was always able to do.

     Written on the eye's own element rather than on :root, so changing it
     invalidates one element's style instead of the entire document's. This is
     what bindProgressToProperty was written for; it was simply never used. */
  const skills = document.querySelector("[data-skills]");
  const eyeLayer = document.querySelector(".eye-layer");
  if (skills && eyeLayer) {
    bindProgressToProperty(skills, "--skills-p", { target: eyeLayer, lenis });

    /* And on a phone, where sinking cannot work at all.
       The mobile layout gives this section `height: auto`, so its scroll
       travel is zero and the progress above never leaves 0 — the eye stayed
       whole and pale directly behind the tool names. There it fades back
       instead, which the stylesheet does; all this has to do is say when.

       A class rather than a scroll-driven number, ON PURPOSE. The eye is
       either behind the toolkit or it is not: a value recomputed every frame
       would be work spent on a state with two positions. This costs one
       observer callback each way and lets the compositor animate the opacity.

       Left running on desktop too — the class changes nothing there, because
       the rule that reads it lives inside the mobile media query, and a
       viewport can cross the breakpoint after load. */
    if ("IntersectionObserver" in window) {
      const watcher = new IntersectionObserver(
        ([entry]) => eyeLayer.classList.toggle("is-behind-tools", entry.isIntersecting),
        // Starts a little before the section arrives, so the eye has already
        // stepped back by the time the first tool name is readable.
        { rootMargin: "-15% 0px -15% 0px" }
      );
      watcher.observe(skills);
    }
  }
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);

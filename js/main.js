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

import { config } from "./config.js?v=71";
import { startClock } from "./clock.js?v=71";
import { initI18n, i18nReady } from "./i18n.js?v=71";
import { holdPage, pageReady, sealPage } from "./page-ready.js?v=71";
import { createPointer } from "./pointer.js?v=71";
import { initEye } from "./eye.js?v=71";
import { initSmoothScroll } from "./smooth-scroll.js?v=71";
import { initReveal } from "./reveal.js?v=71";
import { initClickSound } from "./click-sound.js?v=71";
import { initPrefetch } from "./prefetch.js?v=71";
import { initAmbience } from "./ambience.js?v=71";
import { initSoundToggle } from "./sound-toggle.js?v=71";
import { initCardAudio } from "./card-audio.js?v=71";
import { initPageTransition } from "./page-transition.js?v=71";
import { isTouch, isCompact, onCompactChange } from "./viewport.js?v=71";
import { initNavMenu } from "./nav-menu.js?v=71";
import { initCardCarousel } from "./card-carousel.js?v=71";
import { initLoader } from "./loader.js?v=71";

/* Bumped whenever the JS changes. If the console does not show this exact
   line, the browser is running a CACHED old bundle — hard-reload or clear the
   cache. This is the quickest way to tell fresh code from stale. */
const BUILD = "build 71 · clock hover in white";

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
    import("./distance.js?v=71").then((m) =>
      m.initDistance(document.querySelector("[data-distance]"))
    );

    // Pressing the local time opens the hour scrubber, which re-lights the eye
    // live. Loaded on demand: it is an extra, and a page where nobody presses
    // it should not pay to download it.
    import("./hour-picker.js?v=71").then((m) =>
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
  const pointer = createPointer();
  const canvas = document.getElementById("eye-canvas");
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
    initEye({ canvas, pointer, config: eyeConfig });
  }

  const lenis = initSmoothScroll();
  window.__lenis = lenis;   // exposed for debugging / driving in tests
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
    holdPage(import("./work-gallery.js?v=71").then((m) =>
      m.initWorkGallery(document.querySelector("[data-work-gallery]"))
    ));
  }

  // PROJECT — one template filled from the ?id= parameter.
  if (document.querySelector("[data-project-page]")) {
    holdPage(import("./project-page.js?v=71").then(async (m) => {
      await m.initProjectPage(document.querySelector("[data-project-page]"));
      // The hero video is injected by the module, so its feed observer can
      // only be wired after that has run.
      const { initCamFeeds } = await import("./cam-feeds.js?v=71");
      initCamFeeds(document.querySelector("[data-project-page]"));
    }));
  }

  // CONTACT — the copy button and the form.
  if (document.querySelector("[data-contact]")) {
    import("./contact.js?v=71").then((m) =>
      m.initContact(document.querySelector("[data-contact]"))
    );
  }

  /* Registration is over. Every branch above that builds real content has
     already called holdPage synchronously, so from here "nothing is holding
     the page" finally means what it says. Until this runs, pageReady() waits —
     which is the whole point: it used to answer before anyone had asked. */
  sealPage();
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
    { trackScrollProgress },
  ] = await Promise.all([
    import("./scroll-fx.js?v=71"),
    import("./reveal-photo.js?v=71"),
    import("./photo-depth.js?v=71"),
    import("./marquee.js?v=71"),
    import("./horizontal-scroll.js?v=71"),
    import("./scroll-progress.js?v=71"),
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
  if (!isTouch()) {
    initPhotoDepth(document.querySelector("[data-photo-depth]"), {
      pointer,
      config: config.photo,
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

  // Sink the eye so only its top half shows while the toolkit scrolls past.
  const skills = document.querySelector("[data-skills]");
  if (skills) {
    const root = document.documentElement;
    const drop = getComputedStyle(root).getPropertyValue("--eye-drop").trim() || "44vh";
    trackScrollProgress(skills, {
      lenis,
      onUpdate: (p) => root.style.setProperty("--eye-y", `calc(${drop} * ${p.toFixed(4)})`),
    });
  }
}

if (document.readyState !== "loading") boot();
else document.addEventListener("DOMContentLoaded", boot);

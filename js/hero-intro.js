/* ==========================================================================
   HERO INTRO  ·  "Olá", and then the world comes in
   --------------------------------------------------------------------------
   Black screen. A rectangle slides down off "Olá", holds, and slides back up
   over it. The title fades in. The scroll is released and the camera inside
   the 3D scene comes in from far away — which is what makes the dust
   separate from the eye, because they are at different depths.

   IT WAITS FOR EVENTS, NOT FOR CLOCKS, and that is the fix for one of the
   two bugs that made this look broken. The sequence has two clocks:

     the CSS clock   starts at the first painted frame
     performance.now() starts at navigation

   While three.js boots there are no painted frames, so the two drift apart —
   measured here at 840ms on a warm local load, and worse on a cold one. The
   rectangle was timed by the first clock and the title by the second, so the
   title arrived before the rectangle had finished covering the word and you
   could read "Olá" through "Through the Eyes of".

   So this file no longer knows any durations. It listens for the end of the
   rectangle's animation, and then for the end of the title's. Exact by
   construction, and it is why the module is a third of what it was: no
   tokens read into JavaScript, no fallback table, no scheduler.

   THE <head> DECIDES WHETHER IT RUNS AT ALL, before the first paint, by
   putting .is-intro on <html>. That decision needs sessionStorage, which only
   a script can read, and it is needed before anything is drawn.

   AND IT WAITS FOR FRAMES BEFORE IT MOVES, which is the other bug. The black
   screen belongs to that <head> class and is up from the first paint. The
   movement does not: three.js boots in the same breath, and the browser drew
   three frames in the three seconds that took — the whole curtain played
   inside that void, so "Olá" was covered on one frame and uncovered on the
   next with nothing seen in between. .is-intro-go is added here instead,
   once the page can actually draw what it is being asked to show.
   ========================================================================== */

/* The curtain plays twice from one keyframe: down to uncover the word, then
   again in reverse to cover it. Only the second ending matters here. */
const CURTAIN = "curtain-down";
const TITLE = "title-in";

/* Last resort. If an animation never reports an end — a tab in the background
   when the page loaded, a stylesheet that failed — the intro still has to
   finish and give the page back. Generous: it is a backstop, not a schedule. */
const GIVE_UP_MS = 14000;

/* And the same idea at the other end: how long the first beat will wait for
   the eye to be ready before going without it. */
const READY_MAX = 4000;

/**
 * @param {Element|null} panel the hero section, which only exists on the home
 *                             page. Null anywhere else, and that is the whole
 *                             of the "home page only" rule.
 * @returns {{useEye: Function, holdScroll: Function, skip: Function}|null}
 *          null when no intro runs, which every caller treats as "carry on as
 *          if there were never one".
 */
export function initHeroIntro(panel) {
  const root = document.documentElement;
  if (!panel || !root.classList.contains("is-intro")) return null;

  const greeting = panel.querySelector("[data-hero-greeting]");
  if (!greeting) {
    // Markup this cannot play. The class still has to come off, or the page is
    // left holding a black screen for a greeting that will never happen.
    root.classList.remove("is-intro");
    return null;
  }

  const stop = new AbortController();
  let eye = null;
  let releaseScroll = null;
  let previousRestoration = "";
  let started = false;                 // the first beat has been set going
  let over = false;

  holdPage();
  listen();
  watch();
  setTimeout(start, READY_MAX);

  return { useEye, holdScroll, skip };

  /* ---------------------------------------------------------------- acts -- */

  /* Everything is driven from here: each animation's end starts the next
     beat. `once` is not used because these fire for descendants too and the
     name has to be checked first. */
  function listen() {
    const on = { signal: stop.signal };
    let curtainEnds = 0;

    panel.addEventListener("animationend", (event) => {
      /* The curtain is one keyframe played twice — down to uncover the word,
         then in reverse to cover it again — so the SECOND ending is the one
         that means "the word is gone, the title may start". */
      if (event.animationName === CURTAIN && ++curtainEnds === 2) showTitle();

      /* The title is two lines and the second carries a delay, so it is the
         one that ends last. Acting on the first would release the page while
         the name was still arriving. */
      if (event.animationName === TITLE
          && event.target.classList.contains("hero-title__name")) finish();
    }, on);

    setTimeout(skip, GIVE_UP_MS);
  }

  /* WHAT IT WAITS FOR is the eye's model being in the scene — the download,
     the texture to decode and the shader to compile, which is the heavy part
     of the load and lands AFTER initEye has returned. Then two more frames,
     so the frame that compiles it is behind us rather than inside the
     curtain. A property read a frame until it happens, and then nothing. */
  function watch() {
    if (started || over) return;
    if (eye?.ctx?.eye) {
      requestAnimationFrame(() => requestAnimationFrame(start));
      started = true;
      return;
    }
    requestAnimationFrame(watch);
  }

  function start() {
    if (over) return;
    started = true;                    // and the watcher above stops looking
    root.classList.add("is-intro-go");

    /* NOT TOUCHING THE EYE'S POWER SWITCH HERE, and the reason is worth
       keeping. It renders the model, the shader, the light rig and the dust
       into a canvas held at opacity 0 for the whole black screen, which is
       real work on the thread that has to animate the curtain — so stopping
       it looks obvious. But setRunning() belongs to scene-power.js, which
       latches the last state it pushed and says nothing while that state
       holds: a stop from here leaves it believing the eye runs, and any path
       that misses the restart leaves a frozen eye that nothing will fix.
       That is the one failure scene-power exists to refuse. If this is worth
       doing, it is worth doing there, where the latch lives. */

    /* The way out is armed only now. Until this moment there is nothing to
       skip, and a stray wheel event while the page was still loading would
       have thrown the greeting away before it had begun. */
    ["pointerdown", "wheel", "touchstart", "keydown"].forEach((type) => {
      window.addEventListener(type, skip, { signal: stop.signal, passive: true });
    });
  }

  function showTitle() {
    if (over) return;
    root.classList.add("is-intro-title");
  }

  /* THE PAGE IS GIVEN BACK. The scroll is released here rather than at the
     end of the approach, because the sentence is readable from this moment
     and nobody should be held still in front of a page they can read. */
  function finish() {
    if (over) return;
    over = true;
    stop.abort();

    root.classList.remove("is-intro");
    root.classList.add("is-intro-arrive");

    releaseScroll?.();
    if (previousRestoration) history.scrollRestoration = previousRestoration;
    greeting.remove();

    /* The approach is a camera move inside the 3D scene, not a scale on the
       canvas: the dust sits at different depths from the eye, so moving the
       camera is what separates them. eye.js ignores a second request. */
    eye?.approach?.();
  }

  /* Straight to the end, for somebody who would rather get on with it — and
     for the backstop above. */
  function skip() {
    if (over) return;
    showTitle();
    finish();
  }

  /* ---------------------------------------------------------- the handles -- */

  /* main.js calls these as the things they need come into existence: Lenis a
     few lines after this module starts, the eye a few lines after that. Both
     are no-ops once the intro is over. */
  function holdScroll(lenis) {
    if (over || typeof lenis?.stop !== "function") return;
    lenis.stop();
    releaseScroll = () => lenis.start();
  }

  function useEye(instance) {
    if (over) { instance?.approach?.(); return; }
    eye = instance;
  }

  /* The intro happens at the top of the page or not at all. A reload restores
     the last scroll position after load, which would leave the greeting
     talking to an empty screen somewhere down the page. */
  function holdPage() {
    if ("scrollRestoration" in history) {
      previousRestoration = history.scrollRestoration;
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }
}

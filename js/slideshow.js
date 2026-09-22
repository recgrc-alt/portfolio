/* ==========================================================================
   SLIDESHOW  ·  a set of stills that cross-fades on a timer
   --------------------------------------------------------------------------
   Used when a project's banner is a *folder* of images rather than a single
   still (see media.js). Returns one element the caller drops into a media box;
   it sizes itself to that box. It:

     · stacks the images and cross-fades between them on an interval
     · runs ONLY while it is on screen and its tab is in front
     · drops any image that fails to load, and if none load at all, calls
       onEmpty() so the media cascade can step down to the poster / empty state

   No fixed sizes here — the images fill whatever box they are placed in.

   --------------------------------------------------------------------------
   WHY THIS CHANGED, and it is the answer to "the site gets slower the longer
   I stay on it".

   TWO THINGS WERE WRONG, and only one of them was the obvious one.

   1 · IT RAN OFF-SCREEN. The old note said it behaved like the videos, and it
       half did: it stopped for a hidden TAB. But cam-feeds.js and
       reel-player.js also stop a video that has scrolled out of view, and this
       did not. Every slideshow on the page went on swapping a class every 3.6
       seconds forever, and each swap is a style recalculation and a paint on
       images nobody could see. Steady, invisible, permanent work.

   2 · EACH ONE LEAKED A LISTENER ON document, AND THAT IS THE PART THAT GREW.
       The visibilitychange handler was registered per slideshow, inside the
       factory, with nothing that could ever remove it. That is survivable
       while the page builds its slideshows once. It is not survivable on a
       page that REBUILDS: the work list re-renders when you change a filter,
       and every render made a fresh set of slideshows, each adding another
       permanent handler to document. Nothing detached the old ones, and
       because each closure holds its own `slides` array, it also held every
       <img> element of every slideshow ever built. Both the handler list and
       the retained images grow with the number of times you filter — which is
       exactly a site that gets heavier the more you use it.

       So the listener is registered ONCE for the module, not once per
       instance, and instances are held weakly: a slideshow whose element has
       been thrown away is collected with it instead of being kept alive by
       the very handler that was meant to pause it.
   ========================================================================== */

/* ONE observer and ONE listener for every slideshow on the page, however many
   get built and rebuilt. A WeakSet, so a slideshow that has been removed from
   the DOM is not kept alive by being in here. */
const live = new WeakSet();
let watcher = null;

function ensureWatcher() {
  if (watcher) return watcher;

  /* Same policy as the videos: start a little before it is reached, stop when
     it has gone. The margin is a percentage rather than px for the reason
     cam-feeds.js gives — a fixed lead is a third of a laptop screen and a
     tenth of a large one. */
  watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const control = entry.target.__slideshow;
      if (!control) continue;
      if (entry.isIntersecting) control.onScreen(true);
      else control.onScreen(false);
    }
  }, { rootMargin: "20%" });

  /* Registered once, at the module level. Every slideshow that is still in the
     document is reached through the WeakSet; the ones that are not simply are
     not there any more. */
  document.addEventListener("visibilitychange", () => {
    document.querySelectorAll(".slides").forEach((stage) => {
      if (!live.has(stage)) return;
      stage.__slideshow?.onTabVisible(!document.hidden);
    });
  });

  return watcher;
}

/**
 * @param {string[]} sources image URLs, when the frames are images
 * @param {object} [opts]
 * @param {Element[]} [opts.frames] READY-MADE frames to cycle instead of
 *        building <img>s from `sources`. This is what lets the concept
 *        carousel reuse every line below — the timing, the cross-fade, the
 *        on-screen gating and the shared observer — while its frames are
 *        numbered placeholders rather than photographs. When the real images
 *        arrive, that call passes `sources` instead and nothing else changes.
 */
export function createSlideshow(sources, opts = {}) {
  const {
    className = "slides",        // the stage
    imgClass  = "slides__img",   // each frame
    interval  = 3600,            // ms a frame holds before the next fades in
    onEmpty,                     // called if every image fails to load
    frames,                      // prebuilt frames, see above
  } = opts;

  const stage = document.createElement("span");
  stage.className = className;

  // Live list of frames that actually loaded. `current` is the one shown.
  const slides = [];
  let current = null;
  let ordem = 0;              // the stacking counter setCurrent hands out

  if (Array.isArray(frames) && frames.length) {
    /* Nothing to load and nothing that can fail, so there is no error handler
       and dropSlide is never reached from here. Everything after this point
       treats them exactly like images. */
    frames.forEach((el) => {
      el.classList.add(imgClass);
      stage.append(el);
      slides.push(el);
    });
  } else {
    /* A SOURCE MAY DESCRIBE ITSELF. Every caller until now passed bare paths,
       and every one of those slideshows was decoration — a card cycling three
       views of the same thing, where a described frame would be read out three
       times for one subject. A chapter carousel is not that: five references
       that each say something different, and alt="" would be the only place on
       this site where a picture that means something is handed to a screen
       reader as nothing. So a source may be a string OR {src, alt}, and the
       string keeps meaning exactly what it meant. */
    (sources || []).forEach((item) => {
      const src = typeof item === "string" ? item : item?.src;
      if (!src) return;

      const img = document.createElement("img");
      img.className = imgClass;
      img.src = src;
      img.alt = (typeof item === "object" && item.alt) || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => dropSlide(img), { once: true });
      stage.append(img);
      slides.push(img);
    });
  }

  // Show the first frame straight away; the rest wait their turn.
  if (slides.length) setCurrent(slides[0]);

  /* --- The hand-over, and why it is not a cross-fade ----------------------
   * It used to be one: the outgoing frame faded 1 → 0 while the incoming faded
   * 0 → 1, both on the same 800ms. Half way through, BOTH were at 0.5, and
   * a half-lit picture stacked over another half-lit picture over black is
   * darker than either. Every change of frame dipped through a grey trough and
   * came back, which is what reads as a jolt rather than a fade. The frames
   * were never the problem; the arithmetic in the middle was.
   *
   * So only the arriving frame moves. It is lifted above the one already
   * there, which stays fully opaque underneath, and it fades in over it. There
   * is no point at which the total is less than one, so the picture never
   * darkens, and what the reader sees is one image becoming another.
   *
   * THE ONE BELOW IS PUT AWAY AFTERWARDS, not at the same moment. By the time
   * the timer fires the new frame covers it completely, so removing the class
   * is invisible; doing it at the START is exactly the trough this is here to
   * avoid. `outgoing` is tracked per element rather than in a list because a
   * reader who scrolls away and back can leave two hand-overs overlapping, and
   * the second must be able to cancel the first's clean-up.
   */
  /* READ FROM THE STYLESHEET, AND READ LATE. How long a frame takes to arrive
     is a CSS decision, and a copy of that number in here is a copy that will
     one day disagree with it — the carousel already fades slower than a card
     does. It cannot be read at build time, though: nothing is in the document
     yet and getComputedStyle on a detached element answers nothing. So it is
     read on the first hand-over, by which point the stage is on the page, and
     kept from then on. */
  let handover = null;
  function fadeMs() {
    if (handover !== null) return handover;
    const bruto = current ? getComputedStyle(current).transitionDuration : "";
    const n = parseFloat(bruto);
    handover = Number.isFinite(n) && n > 0
      ? (bruto.trim().endsWith("ms") ? n : n * 1000)
      : 800;                                     // --dur-slow, the old default
    return handover;
  }

  function setCurrent(img) {
    const antes = current;
    current = img;
    if (!img) return;

    /* Lifted, not swapped. z-index is written rather than relying on DOM order
       because the frames cycle: the first one comes round again and has to be
       able to arrive over the last. */
    img.style.zIndex = String(++ordem);
    clearTimeout(img.__retirar);
    img.classList.add("is-current");

    if (!antes || antes === img) return;
    const espera = fadeMs();
    antes.__retirar = setTimeout(() => {
      /* Only if it is still the one underneath. A frame that has since become
         current again must not be cleared out from under itself. */
      if (antes === current) return;
      antes.classList.remove("is-current");
      antes.style.zIndex = "";
    }, espera);
  }

  // A frame whose file is missing leaves the rotation entirely. If it was the
  // one on screen, the next takes its place; if it was the last one standing,
  // the whole slideshow gives up and the cascade falls through.
  function dropSlide(img) {
    const i = slides.indexOf(img);
    if (i !== -1) slides.splice(i, 1);
    const wasCurrent = img === current;
    clearTimeout(img.__retirar);      // it is leaving; nothing left to tidy
    img.remove();
    if (!slides.length) { stop(); if (onEmpty) onEmpty(); return; }
    if (wasCurrent) setCurrent(slides[0]);
  }

  // Advance to the next loaded frame. Guarded so a single-frame (or emptied)
  // slideshow simply holds still.
  function tick() {
    if (slides.length < 2) return;
    const i = slides.indexOf(current);
    setCurrent(slides[(i + 1) % slides.length]);
  }

  /* --- When this is allowed to run --------------------------------------
   * Two independent conditions, held as two flags rather than as one: the tab
   * has to be in front AND the slideshow has to be on screen. Folding them
   * into a single boolean was the old bug in miniature — scrolling away and
   * switching tabs are different events, and whichever happened last would
   * have decided for both. */
  let timer = null;
  let seen = false;          // on screen
  let awake = !document.hidden;

  function sync() {
    const shouldRun = seen && awake && slides.length > 1;
    if (shouldRun && !timer) timer = setInterval(tick, interval);
    else if (!shouldRun && timer) { clearInterval(timer); timer = null; }
  }

  function stop() { seen = false; sync(); }

  /* The handle the shared observer and the shared listener reach this instance
     through. On the element rather than in a Map, so there is no registry to
     clean out: when the element goes, this goes with it. */
  stage.__slideshow = {
    onScreen(next) { seen = next; sync(); },
    onTabVisible(next) { awake = next; sync(); },
  };

  live.add(stage);
  ensureWatcher().observe(stage);

  return stage;
}

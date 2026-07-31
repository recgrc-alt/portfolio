/* ==========================================================================
   SLIDESHOW  ·  a set of stills that cross-fades on a timer
   --------------------------------------------------------------------------
   Used when a project's banner is a *folder* of images rather than a single
   still (see media.js). Returns one element the caller drops into a media box;
   it sizes itself to that box. It:

     · stacks the images and cross-fades between them on an interval
     · pauses while its tab is hidden, so nothing animates off-screen
     · drops any image that fails to load, and if none load at all, calls
       onEmpty() so the media cascade can step down to the poster / empty state

   No fixed sizes here — the images fill whatever box they are placed in.
   ========================================================================== */

export function createSlideshow(sources, opts = {}) {
  const {
    className = "slides",        // the stage
    imgClass  = "slides__img",   // each frame
    interval  = 3600,            // ms a frame holds before the next fades in
    onEmpty,                     // called if every image fails to load
  } = opts;

  const stage = document.createElement("span");
  stage.className = className;

  // Live list of frames that actually loaded. `current` is the one shown.
  const slides = [];
  let current = null;

  sources.forEach((src) => {
    const img = document.createElement("img");
    img.className = imgClass;
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => dropSlide(img), { once: true });
    stage.append(img);
    slides.push(img);
  });

  // Show the first frame straight away; the rest wait their turn.
  if (slides.length) setCurrent(slides[0]);

  function setCurrent(img) {
    if (current) current.classList.remove("is-current");
    current = img;
    if (current) current.classList.add("is-current");
  }

  // A frame whose file is missing leaves the rotation entirely. If it was the
  // one on screen, the next takes its place; if it was the last one standing,
  // the whole slideshow gives up and the cascade falls through.
  function dropSlide(img) {
    const i = slides.indexOf(img);
    if (i !== -1) slides.splice(i, 1);
    const wasCurrent = img === current;
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

  let timer = null;
  function start() { if (!timer && slides.length > 1) timer = setInterval(tick, interval); }
  function stop() { clearInterval(timer); timer = null; }

  // Behave like the videos do: no work while the tab is in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });
  if (!document.hidden) start();

  return stage;
}

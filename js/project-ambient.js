/* ==========================================================================
   PROJECT AMBIENT  ·  the hero's colours, spilled onto the page below it
   --------------------------------------------------------------------------
   The hero video ended on a hard horizontal line. Whatever was on screen,
   however warm or bright, simply stopped and the page's black began, and the
   join read as a crop rather than as a composition.

   This casts the video's own colour downward out of that edge, blurred, so the
   picture dissolves into the page instead of being cut off by it.

   HOW, AND WHY THIS WAY.
   The obvious approach is a second copy of the video, scaled up and blurred
   behind the first. It works, and it costs a second decode of the same file
   for the whole time the page is open.

   This samples instead. The bottom band of the media is drawn into a canvas
   of SAMPLE_W by SAMPLE_H pixels — twelve by four, forty-eight pixels — and
   that canvas is stretched across the width of the hero and blurred. The
   result carries the real colours, follows them as the video plays, and the
   per-frame work is a drawImage into a surface smaller than a favicon.

   IT ONLY SAMPLES THE BOTTOM. The glow belongs to the edge it leaves from, so
   taking the average of the whole frame would tint it with sky when the horizon
   is dark, or with dark when the sky is bright.

   A STILL IMAGE IS SAMPLED ONCE. There is nothing to follow, so there is no
   reason to keep looking.

   NOTHING RUNS OFF SCREEN. An IntersectionObserver stops the sampling when the
   hero scrolls away, which on this page is almost immediately.
   ========================================================================== */

const SAMPLE_W = 12;
const SAMPLE_H = 4;

/* How often the glow is re-read from a moving picture. Video is 24 to 30
   frames a second and this is an out-of-focus wash: sampling every frame would
   spend thirty times the work to describe the same colour. Six times a second
   is faster than a cut and slower than anything the eye tracks. */
const EVERY_MS = 160;

export function initAmbient(hero) {
  if (!hero) return null;

  const media = hero.querySelector("video, img");
  if (!media) return null;

  const glow = document.createElement("canvas");
  glow.className = "project-hero__ambient";
  glow.width = SAMPLE_W;
  glow.height = SAMPLE_H;
  glow.setAttribute("aria-hidden", "true");
  hero.append(glow);

  const ctx = glow.getContext("2d", { willReadFrequently: false });
  if (!ctx) return null;

  const isVideo = media.tagName === "VIDEO";
  let timer = 0;

  function sample() {
    /* The natural size, which for a video is only known once metadata has
       arrived and for an image once it has decoded. Nothing to draw before
       then, and drawImage would throw on a zero-sized source. */
    const w = isVideo ? media.videoWidth : media.naturalWidth;
    const h = isVideo ? media.videoHeight : media.naturalHeight;
    if (!w || !h) return false;

    // The bottom fifth of the source, stretched over the whole canvas.
    const band = Math.max(1, Math.round(h * 0.2));
    try {
      ctx.drawImage(media, 0, h - band, w, band, 0, 0, SAMPLE_W, SAMPLE_H);
    } catch {
      // A cross-origin frame taints the canvas. Nothing to do but stop.
      return false;
    }
    hero.classList.add("has-ambient");
    return true;
  }

  function start() {
    if (timer) return;
    if (!sample()) {
      // Metadata not in yet. The events below will bring us back.
      return;
    }
    if (!isVideo) return;                 // a still has nothing more to say
    timer = setInterval(sample, EVERY_MS);
  }

  function stop() {
    clearInterval(timer);
    timer = 0;
  }

  if (isVideo) {
    media.addEventListener("loadeddata", start);
    media.addEventListener("play", start);
  } else {
    media.addEventListener("load", start);
  }
  start();

  /* Scrolled past: there is no glow to keep warm. The hero is the top of the
     page, so this fires within the first screen of reading. */
  const watcher = new IntersectionObserver((entries) => {
    entries.some((e) => e.isIntersecting) ? start() : stop();
  }, { threshold: 0 });
  watcher.observe(hero);

  return {
    destroy() {
      stop();
      watcher.disconnect();
      glow.remove();
    },
  };
}

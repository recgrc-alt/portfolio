/* ==========================================================================
   MEDIA  ·  the one place that decides what a project shows
   --------------------------------------------------------------------------
   A project can carry three kinds of hero media, in order of richness:

       heroVideo   a looping clip            (string  · "videos/x.webm")
       slideshow   a set of stills to cycle  (array   · ["a.webp","b.webp"])
       poster      a single still            (string  · "assets/…/x.webp")

   fillMedia() picks the richest one the project actually has and, if it fails
   to load — a missing file, an unsupported codec, or a machine too weak to
   play it — quietly steps down to the next:

       video  →  slideshow  →  poster  →  the hatching empty-state

   One function, used by both the gallery cards and the project hero, so they
   behave identically and a new project only fills the fields it has. To add a
   fourth kind of media later, add one tier here and nothing else changes.

   No fixed sizes: every element fills the host box the caller passes in.
   ========================================================================== */

import { createSlideshow } from "./slideshow.js?v=71";

/* Fill `host` with the best media `project` offers, wiring the fallback
   cascade. `opts` lets each caller keep its own class names (the card and the
   hero style their video and still differently, and already have hover rules
   keyed to those names).

     videoClass  className for the <video>
     stillClass  className for the single fallback <img>
     lazyVideo   true  → preload "none" (cam-feeds.js fetches when it scrolls in)
                 false → preload "metadata"
     videoAttr   the dataset marker a scroll-player watches for. Default
                 "workVideo" (cam-feeds.js). The reels pass "reelVideo" so their
                 own player owns them and cam-feeds leaves them alone.
*/
export function fillMedia(host, project, opts = {}) {
  const {
    videoClass = "media__video",
    stillClass = "media__still",
    lazyVideo  = true,
    videoAttr  = "workVideo",
  } = opts;

  // The tiers this project can show, richest first. Only real content counts:
  // an empty string or empty array is treated as "not provided".
  const tiers = [];
  if (project.heroVideo) tiers.push("video");
  if (Array.isArray(project.slideshow) && project.slideshow.length) tiers.push("slides");
  if (project.poster) tiers.push("image");

  // Try tier i; on failure remove what it made and try i+1. Out of tiers →
  // mark the host empty so its CSS hatching shows.
  function show(i) {
    if (i >= tiers.length) { host.classList.add("is-empty"); return; }
    const next = () => show(i + 1);
    const tier = tiers[i];

    if (tier === "video")       host.append(videoNode(project, videoClass, lazyVideo, videoAttr, next));
    else if (tier === "slides") host.append(createSlideshow(project.slideshow, { onEmpty: next }));
    else                        host.append(stillImage(project.poster, stillClass, next));
  }
  show(0);
}

/* A looping, muted clip. cam-feeds.js decides when it actually plays. A still
   (the poster, or the first slide) fills the frame before the clip loads and
   while it stalls, so the box is never blank. */
/* Hands a video its poster once it is worth having one.
   The margin is generous on purpose: the image should have arrived by the time
   the card is actually looked at, so this trades a little early loading for
   never showing an empty box. Falls back to setting it immediately where
   IntersectionObserver is missing — an older browser gets the old behaviour
   rather than no picture at all. */
function watchForPoster(video, src) {
  if (!("IntersectionObserver" in window)) { video.poster = src; return; }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      video.poster = src;
      io.disconnect();          // one poster per video, then stop watching
    }
  }, { rootMargin: "300px 0px" });

  io.observe(video);
}

function videoNode(project, className, lazy, videoAttr, onFail) {
  const video = document.createElement("video");
  video.className = className;
  video.dataset[videoAttr] = "";    // a scroll-player starts it when it is seen
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = lazy ? "none" : "metadata";

  /* THE POSTER UNDOES preload="none" IF IT IS SET NOW.
     `preload="none"` stops the VIDEO downloading, and it works. The poster is
     a separate rule: the browser fetches it straight away regardless, because
     it needs something to paint in the box. On the gallery that meant fifteen
     full-size banners downloading on arrival — the careful lazy loading on the
     clips was being paid for and then handed straight back.

     And there is no `loading="lazy"` for a poster; the attribute does not
     exist. So it is withheld and handed over when the card is actually near
     the viewport, which is the same thing cam-feeds.js already does with the
     clip itself. */
  const still = project.poster || (project.slideshow && project.slideshow[0]);
  if (still) {
    if (lazy) watchForPoster(video, still);
    else video.poster = still;
  }

  /* Whether this clip carries sound is DATA, not something to ask the browser.
     card-audio.js used to probe webkitAudioDecodedByteCount, which stays 0
     until audio has actually been decoded — and these play muted, so decoding
     is lazy. Whether a card would speak on hover came down to how long it had
     been on screen. The flag comes from the container header, read once when
     the project data was built, and never changes. */
  if (project.videoHasAudio) video.dataset.hasAudio = "";

  video.src = project.heroVideo;
  video.addEventListener("error", () => { video.remove(); onFail(); }, { once: true });
  return video;
}

/* A single banner image, used as a video's fallback and as the hero for
   projects that have only a still. If the image itself also fails, it removes
   itself and steps down, so a broken path shows the next tier — never the
   broken-image icon. Exported because the reel block reuses it. */
export function stillImage(src, className, onFail) {
  const img = document.createElement("img");
  img.className = className;
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => {
    const host = img.parentElement;
    img.remove();
    if (onFail) onFail();
    else if (host) host.classList.add("is-empty");
  }, { once: true });
  return img;
}

/* ==========================================================================
   CAM FEEDS  ·  keeping six autoplaying videos affordable
   --------------------------------------------------------------------------
   The wall asks for six feeds running at once. They share one file, so that is
   a single download — but it is still six independent decodes, and a decoder
   does not stop working just because its video has scrolled off the screen.

   This pauses any feed that is not on screen and every feed while the tab is
   hidden, and — the part that matters most — it is what STARTS them too.

   WHY THE MARKUP NO LONGER SAYS autoplay
   It used to. The attribute is a promise the browser keeps eagerly: it began
   fetching all six copies the moment the document parsed, even though the wall
   is far below the fold. Six requests for the same 14 MB file is ~84 MB before
   a visitor has scrolled anything, and a <video> does not share those requests
   the way an <img> would. The server log made it plain — six concurrent GETs
   on every single load.

   Calling play() from the observer instead gives the identical BEHAVIOUR — a
   feed is always already running by the time it can be seen, with no controls
   and no click — while the bytes are only spent on cameras that are actually
   about to be looked at.

   Reusable: call it with any container holding [data-work-video] elements.
   ========================================================================== */

/* ON SCREEN, BY GEOMETRY. The observer below answers this continuously, but
   anything that has to re-check at a moment of its own — a tab coming back, a
   deck panel being shown again — has to ask it once, directly. Exported so
   there is ONE answer and the callers can never drift apart on it. */
export function onScreen(el) {
  const box = el.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

/* The breakpoint and the pointer question, from the one place that owns them. */
import { isTouch } from "./viewport.js?v=326";

export function initCamFeeds(section, options = {}) {
  if (!section) return null;
  /* Both markers, one observer. [data-play-once] behaves differently once it
     is on screen, but "is it on screen" is the same question for both and
     should not be answered twice by two files. */
  const feeds = [...section.querySelectorAll("[data-work-video], [data-play-once]")];
  if (!feeds.length) return null;

  // Start slightly before the wall scrolls in, so the first frame is never
  // caught standing still. A PERCENTAGE, not px: rootMargin is measured against
  // the viewport, and a fixed 300px is a third of a laptop screen but a tenth
  // of a large display — the same scroll would give far less warning there.
  // 30% keeps the lead time proportional at any size. (rootMargin accepts only
  // px and %, so this is as close to the site's rem convention as it gets.)
  const rootMargin = options.rootMargin ?? "30%";

  /* HOW MANY MAY DECODE AT ONCE, and this is the phone's whole problem.
     An iPhone refuses past a handful of simultaneous decoders, which is why
     this site has always felt fine on one. Android accepts every one it is
     given and then chokes trying to honour them: on the work page, where the
     deck is retired and all four categories lie in the same scroll, eleven of
     the fifteen feeds were decoding at the same time.

     So a phone is told what an iPhone decides for itself. Unlimited on a
     desktop, because nothing there asked for a limit and the camera wall
     wants its six. */
  const maxPlaying = options.maxPlaying ?? (isTouch() ? 3 : Infinity);

  function play(video) {
    /* NOT IF IT CANNOT BE SEEN, and geometry alone does not answer that. The
       work deck parks a covered category at the top of the screen and hides it
       with `visibility`, which an IntersectionObserver has no way of noticing:
       the box is still exactly where it was, still intersecting, so the feed
       was told to play and did — behind an opaque panel, for as long as the
       reader stayed. Measured on the fourth category: 11 of 15 running.

       checkVisibility() is asked for `visibility` explicitly because it does
       not look at it by default. Optional-chained: where it does not exist
       this is the same function it always was. */
    if (video.checkVisibility && !video.checkVisibility({ visibilityProperty: true })) return;

    // Autoplay can still be refused (low-power mode, data saver); ignore it —
    // the poster frame stays, so no card is ever broken.
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  }

  function pause(video) {
    if (!video.paused) video.pause();
  }

  /* --- A CLIP THAT RUNS ONCE, AND RUNS AGAIN ------------------------------
   * It is rewound on the way OUT rather than on the way in, and that ordering
   * is the whole behaviour. Rewinding on entry would mean the reader who
   * scrolls a little and comes back finds the animation restarting under them
   * mid-view; rewinding on exit leaves the finished frame standing for as long
   * as it is visible, and quietly arms it for the next approach.
   *
   * `loop` is already false on these, so play() simply stops at the last frame
   * and stays there. Nothing has to pause it at the end. */
  function leave(video) {
    pause(video);
    if (video.dataset.playOnce !== undefined) video.currentTime = 0;
  }

  /* The ones on screen, nearest the middle first. Nearest and not first in
     the document, because what the reader is looking at is the middle of the
     screen — a feed entering from below should take the slot from one that is
     half way out of the top, not wait behind it. */
  const wanted = new Set();

  function share() {
    if (wanted.size <= maxPlaying) { wanted.forEach(play); return; }

    const centre = window.innerHeight / 2;
    [...wanted]
      .map((video) => {
        const box = video.getBoundingClientRect();
        return { video, away: Math.abs(box.top + box.height / 2 - centre) };
      })
      .sort((a, b) => a.away - b.away)
      .forEach(({ video }, i) => (i < maxPlaying ? play(video) : pause(video)));
  }

  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) wanted.add(entry.target);
      else { wanted.delete(entry.target); leave(entry.target); }
    }
    share();
  }, { rootMargin });

  feeds.forEach((video) => watcher.observe(video));

  /* AND RE-SHARED ON THE SCROLL, where there is anything to share. The set
     above only changes when a feed crosses the band's edge, and those edges
     are a card apart — between two of them the reader has moved half a screen
     and the nearest-first order has gone stale, which would show as a feed
     standing still in the middle of the screen while one on its way out
     plays. Once a frame at most, and never registered at all on a desktop,
     where nothing is being rationed. */
  const stop = new AbortController();
  if (maxPlaying !== Infinity) {
    let queued = false;
    window.addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; share(); });
    }, { passive: true, signal: stop.signal });
  }

  document.addEventListener("visibilitychange", () => {
    /* pause, not leave: a tab coming back should carry on where it was, and a
       once-through clip that had finished should still be showing its last
       frame rather than its first. */
    if (document.hidden) feeds.forEach(pause);
    // Only wake the ones still on screen — the observer holds the rest.
    else feeds.forEach((video) => { if (onScreen(video)) play(video); });
  });

  return {
    pauseAll: () => feeds.forEach(pause),
    destroy: () => { watcher.disconnect(); stop.abort(); },
    count: feeds.length,
  };
}

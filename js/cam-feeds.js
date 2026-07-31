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

export function initCamFeeds(section, options = {}) {
  if (!section) return null;
  const feeds = [...section.querySelectorAll("[data-work-video]")];
  if (!feeds.length) return null;

  // Start slightly before the wall scrolls in, so the first frame is never
  // caught standing still. A PERCENTAGE, not px: rootMargin is measured against
  // the viewport, and a fixed 300px is a third of a laptop screen but a tenth
  // of a large display — the same scroll would give far less warning there.
  // 30% keeps the lead time proportional at any size. (rootMargin accepts only
  // px and %, so this is as close to the site's rem convention as it gets.)
  const rootMargin = options.rootMargin ?? "30%";

  function play(video) {
    // Autoplay can still be refused (low-power mode, data saver); ignore it —
    // the poster frame stays, so no card is ever broken.
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  }

  function pause(video) {
    if (!video.paused) video.pause();
  }

  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) play(entry.target);
      else pause(entry.target);
    }
  }, { rootMargin });

  feeds.forEach((video) => watcher.observe(video));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) feeds.forEach(pause);
    else feeds.forEach((video) => {
      // Only wake the ones still on screen — the observer holds the rest.
      const box = video.getBoundingClientRect();
      if (box.bottom > 0 && box.top < window.innerHeight) play(video);
    });
  });

  return {
    pauseAll: () => feeds.forEach(pause),
    destroy: () => watcher.disconnect(),
  };
}

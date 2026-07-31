/* ==========================================================================
   PREFETCH  ·  warm the next page before it is asked for
   --------------------------------------------------------------------------
   Every move between pages here is a full document load: the browser re-fetches
   the HTML, the project JSON and the JS, then re-runs them. This can't remove
   the re-render on the far side, but it can take the *network* out of the
   critical path — when the pointer so much as approaches a link, the target
   document and the project data are pulled into the HTTP cache, so the click
   that follows reads from disk instead of the wire.

   Each URL is fetched at most once, and only on a real intent signal (hover or
   keyboard focus), so an idle visitor pays nothing. This is a stop-gap: the
   real cure for the lag is to stop reloading the whole page (see the note in
   main.js). It buys most of that win with none of the risk. */

const done = new Set();

function prefetch(url) {
  if (!url || done.has(url)) return;
  done.add(url);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url;
  document.head.append(link);
}

export function initPrefetch() {
  // The data file the gallery and every project page read, in the current
  // language — the biggest thing a navigation waits on after the HTML itself.
  const lang = document.documentElement.lang || "en";
  const dataUrl = `data/projects.${lang}.json`;

  const warm = (a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || /^[a-z]+:/i.test(href)) return;  // skip anchors + external
    prefetch(href.split("#")[0].split("?")[0]);                          // the .html document
    if (href.includes("project.html") || href.includes("work.html")) prefetch(dataUrl);
  };

  // Intent = the pointer resting on a link, or the link taking focus. Both
  // events bubble, so one document-level listener also covers links the
  // gallery injects after this runs.
  document.addEventListener("pointerover", (e) => {
    const a = e.target.closest?.("a[href]");
    if (a) warm(a);
  });
  document.addEventListener("focusin", (e) => {
    const a = e.target.closest?.("a[href]");
    if (a) warm(a);
  });
}

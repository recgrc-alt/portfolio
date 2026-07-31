/* ==========================================================================
   PAGE TRANSITION  ·  a black wipe between pages
   --------------------------------------------------------------------------
   Every navigation here is a full document load, which normally means the old
   page vanishes the instant the new one is ready — an abrupt cut, and the
   ambience loop cut off mid-note with it. This holds the door for a moment:

     leaving   a click on an internal link is intercepted, the veil fades UP to
               black and the ambience fades down with it, and only then does
               the browser navigate
     arriving  the veil starts opaque and fades DOWN to reveal the new page

   THE ENTRANCE IS PURE CSS, DELIBERATELY.
   The veil element is in the markup and its fade-out is a CSS animation, so it
   plays whether or not this module ever runs. If the JS fails, the worst case
   is that exits stop being animated — never a page stuck behind a black
   rectangle it needs JavaScript to remove.

   Anything that is not a plain in-site navigation is left completely alone:
   new-tab clicks, downloads, external links, mailto:, and same-page anchors
   all behave exactly as the browser intends. */

import { fadeOutAmbience } from "./ambience.js?v=74";

const LEAVE_MS = 420;

export function initPageTransition(veil) {
  if (!veil) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

  let leaving = false;

  // A link this module should animate: same tab, same origin, a real document.
  function isInternalNav(link, event) {
    if (event.defaultPrevented) return false;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return false;          // same-page anchor
    if (/^[a-z]+:/i.test(href) && !/^https?:/i.test(href)) return false;  // mailto:, tel:

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return false;
    // A link to this exact page (hash aside) is not a navigation worth veiling.
    if (url.pathname === location.pathname && url.search === location.search) return false;
    return true;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || leaving || !isInternalNav(link, event)) return;

    event.preventDefault();
    leaving = true;
    veil.classList.add("is-leaving");
    fadeOutAmbience(LEAVE_MS);

    // The veil's own transition is the clock. A timeout backs it up, because a
    // transitionend that never fires (a backgrounded tab) must not strand the
    // visitor on a page that refuses to leave.
    let done = false;
    const go = () => { if (!done) { done = true; location.href = link.href; } };
    veil.addEventListener("transitionend", go, { once: true });
    setTimeout(go, LEAVE_MS + 120);
  });

  // Coming BACK to this page from the browser's cache restores the DOM exactly
  // as it was left — veil up, mid-exit. Clear it, or the page is a black box.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    leaving = false;
    veil.classList.remove("is-leaving");
  });

  return { destroy: () => veil.classList.remove("is-leaving") };
}

/* ==========================================================================
   NAV MENU  ·  the phone's full-screen navigation
   --------------------------------------------------------------------------
   On a narrow screen the masthead's links collapse behind a two-line button.
   Pressing it takes the whole viewport; the same button becomes the close X.

   THE PANEL IS THE SAME LIST, NOT A COPY
   There is one <ul> of links in the markup, and CSS moves it into the panel
   below the breakpoint. Duplicating it for mobile would mean two sets of
   translations, two sets of aria-current, and the certainty that one day only
   one of them gets a new link. The panel is a layout, not a second menu.

   WHAT THIS FILE ACTUALLY DOES
   Almost nothing visual — the transition is a CSS one, keyed off a single
   class. This handles the parts CSS cannot: the ARIA state, closing on Escape
   or on following a link, keeping focus inside the panel while it is open, and
   stopping the page behind from scrolling under it.

   Above the breakpoint the button is display:none and every listener here is
   dormant, so the desktop masthead behaves exactly as it always did.
   ========================================================================== */

import { isCompact, onCompactChange } from "./viewport.js?v=63";

const OPEN_CLASS = "is-menu-open";      // set on <html>, so CSS can reach both
                                        // the panel and the page behind it

export function initNavMenu({ button, panel } = {}) {
  if (!button || !panel) return null;

  const root = document.documentElement;
  let open = false;
  let lastFocus = null;

  function setOpen(next) {
    if (next === open) return;
    open = next;

    root.classList.toggle(OPEN_CLASS, open);
    button.setAttribute("aria-expanded", String(open));
    // The panel is hidden from assistive tech while closed, so a screen reader
    // does not read a menu that is not there. inert would be tidier but is not
    // safe to rely on yet.
    panel.setAttribute("aria-hidden", String(!open));

    if (open) {
      lastFocus = document.activeElement;
      /* Focus the PANEL, not the first link inside it. Focusing the link moved
         a keyboard to the right place but also matched :focus-visible, which on
         this site draws the displaced ghost of the word — so opening the menu
         with a thumb lit "About" up inside a hard-edged box and left it there.
         The panel is not interactive, so it takes focus without any styling of
         its own, and Tab still walks into the links from there. */
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
    } else {
      lastFocus?.focus?.({ preventScroll: true });
      lastFocus = null;
    }
  }

  button.addEventListener("click", () => setOpen(!open));

  // Following a link closes the panel. The click still navigates: on this site
  // page-transition.js intercepts it and runs the black wipe, and the panel
  // must be gone before the next page fades in.
  panel.addEventListener("click", (e) => {
    if (e.target.closest("a[href]")) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key !== "Tab") return;

    // Keep Tab inside the panel while it covers the page — otherwise focus
    // walks off into content the visitor cannot see.
    const stops = [...panel.querySelectorAll("a[href], button:not([disabled])")]
      .filter((el) => el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const on = document.activeElement;

    if (e.shiftKey && (on === first || on === button)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && on === last) { e.preventDefault(); first.focus(); }
  });

  // Growing the window past the breakpoint puts the links back in the masthead;
  // an open panel would then be a full-screen overlay with nothing to close it.
  onCompactChange((compact) => { if (!compact) setOpen(false); });

  // Start closed and correctly described, whatever the markup shipped.
  button.setAttribute("aria-expanded", "false");
  panel.setAttribute("aria-hidden", String(!isCompact() ? true : true));

  return { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => open };
}

/* ==========================================================================
   CLICK SOUND  ·  a soft tick when an interactive element is pressed
   --------------------------------------------------------------------------
   The nav, buttons and cards answer a hover with a visual echo; this adds a
   quiet audible tick on the *press*, playing assets/sound/hover.mp3.

   WHY pointerdown, NOT click
     A click on a link navigates away, and the page can tear down before a
     `click`-fired sound is heard. pointerdown fires on the press — the earliest
     honest moment — so the tick starts before navigation begins. Enter/Space
     on a focused control are covered too, for keyboard use.

   NOTES
     · A click is itself a user gesture, so no autoplay unlock is needed.
     · A short cooldown collapses the odd double-fire into one tick.
     · Each tick plays on its own throwaway clone, so quick presses overlap
       cleanly instead of cutting one another off.
     · prefers-reduced-motion silences it entirely.

   The set of things that tick is a single registry below — add a selector to
   give a new control the same voice. */

import { isSoundEnabled } from "./audio-state.js?v=74";
import { isTouch } from "./viewport.js?v=74";

const TARGETS = [
  ".nav__link",
  ".lang__btn",
  ".btn",
  ".card-work",
  ".service__link",
  ".skills__cta",
].join(",");

export function initClickSound(src = "assets/sound/hover.mp3", opts = {}) {
  const { volume = 0.2, cooldown = 80 } = opts;

  // Less motion asked for → less noise given.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* --- Not on a touch screen ----------------------------------------------
   * pointerdown is the right moment with a mouse and the wrong one with a
   * finger. It fires as soon as the finger LANDS — deliberately, before the
   * browser has decided whether the gesture is a tap or the beginning of a
   * scroll. On the gallery that meant every flick down the page ticked once
   * for each card a finger happened to start on: a sound meant to confirm a
   * press, fired by someone who was only scrolling past.
   *
   * Waiting for pointerup and measuring the travel would tell a tap from a
   * drag, but it would also give back a sound that has no job here. The tick
   * is the audible half of the hover echo, and a touch screen has neither the
   * hover nor the need — a phone answers a press with its own haptics.
   * Desktop keeps it exactly as it was. */
  if (isTouch()) return;

  const base = new Audio(src);
  base.preload = "auto";
  base.volume = volume;

  let lastAt = 0;
  const tick = (target) => {
    // The visitor's preference is the only gate here: a click IS the gesture a
    // browser wants, so the gesture gate in audio-state would only ever cost
    // this the very first tick.
    if (!isSoundEnabled()) return;
    if (!target || !target.closest || !target.closest(TARGETS)) return;
    const now = performance.now();
    if (now - lastAt < cooldown) return;   // fold a double-fire into one
    lastAt = now;
    play(base);
  };

  // The press itself — before a link starts navigating. Primary button only.
  document.addEventListener("pointerdown", (e) => {
    if (e.button === 0) tick(e.target);
  });

  // Keyboard activation of a focused control.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") tick(e.target);
  });
}

function play(base) {
  const a = base.cloneNode();
  a.volume = base.volume;
  a.src = base.src;                 // cloneNode may not carry the property src
  a.play().catch(() => {});         // a blocked play is nothing to report
}

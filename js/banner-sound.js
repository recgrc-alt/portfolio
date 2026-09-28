/* ==========================================================================
   BANNER SOUND  ·  a project's own loop, brought in as the banner leaves
   --------------------------------------------------------------------------
   A project page can carry the loop its piece was made with (see `ambience`
   in the data and setAmbienceSource in ambience.js). Played at a fixed level
   from the moment sound is on, it arrived on top of the banner, which is the
   one place on the page with a picture and, often, a clip of its own to
   listen to. So the loop waits:

     banner fully on screen          silent
     banner scrolling away           rising slowly from nothing
     half a screen past the banner   the level the data asked for

   and scrolling back up to the banner takes it down again the same way.

   WHY IT IS SHAPED, AND NOT A STRAIGHT LINE. A first version mapped the scroll
   straight onto the gain and it read as a cut. Hearing is logarithmic: halving
   the gain only takes about 6 dB off, so a straight line kept the sound almost
   as loud for most of the way and then dropped it through the last few tenths,
   right as the banner came back. Two curves fix that together. A smoothstep
   eases the start and the end of the distance, and squaring the result turns
   an even distance into an even change in LOUDNESS rather than in gain. On top
   of that, ambience.js glides every change over about a second, so a fast
   flick of the wheel is heard as a slow swell and never as a switch.

   WHAT THIS FILE DOES AND DOES NOT DO. It only works out how far the banner
   has left the screen and hands the level to setAmbienceLevel(). It never
   touches the sound itself, so the mute toggle, the ducking under a clip and
   the fade on leaving the page stay exactly where they were, in ambience.js.

   ONE READ PER SCROLL, NO WRITES TO THE PAGE. A single getBoundingClientRect
   on the banner, and the only thing written is an audio gain, which does not
   touch layout. So there is nothing here that could make scrolling heavier.
   ========================================================================== */

import { setAmbienceLevel } from "./ambience.js?v=289";

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/* How far past the banner the loop keeps rising, as a fraction of the
   screen's height. The sound reaches its full level once the reader is into
   the text, rather than at the exact pixel the picture disappears. */
const RUN_OUT = 0.5;

// Smoothstep: a gentle start and a gentle arrival over the distance.
const ease = (t) => t * t * (3 - 2 * t);

// Distance into loudness. See "why it is shaped" above.
const perceived = (t) => t * t;

/**
 * The loop's level for where the banner is, from 0 (silent) to 1 (the level
 * set in the data). Exported on its own so the curve can be checked without
 * any sound playing.
 * @param {Element|null} hero
 * @returns {number}
 */
export function bannerLevel(hero) {
  if (!hero || !hero.offsetHeight) return 1;   // no banner: nothing to wait for
  const rect = hero.getBoundingClientRect();
  const travel = rect.height + window.innerHeight * RUN_OUT;
  // 0 while the whole banner is still on screen, 1 at the end of the run-out.
  const distance = clamp01((rect.height - rect.bottom) / travel);
  return perceived(ease(distance));
}

let linked = false;

/**
 * Keeps the page's ambience level tied to the banner for as long as the page
 * is open. Wired once: render() runs again on every language switch and
 * rebuilds the banner, which is why the banner is looked up on every
 * measurement rather than held on to.
 * @param {Element} root the project page's container
 */
export function linkSoundToBanner(root) {
  if (linked || !root) return;
  linked = true;

  const measure = () => setAmbienceLevel(bannerLevel(root.querySelector(".project-hero")));

  /* The native scroll event, which fires while Lenis is driving the page as
     well, because Lenis scrolls the real document (see scroll-progress.js). A
     resize changes the banner's height and the screen's, so it changes the
     answer too. */
  window.addEventListener("scroll", measure, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  measure();
}

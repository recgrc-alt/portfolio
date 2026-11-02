/* ==========================================================================
   CSS TIME  ·  a duration token, read as a number of milliseconds
   --------------------------------------------------------------------------
   Every duration on this site is declared once, in css/tokens.css. A script
   that has to wait exactly as long as an animation should therefore ask the
   stylesheet rather than keep its own copy of the number — two copies of a
   duration are two numbers that will eventually disagree, and the way that
   failure shows up is a page that navigates before its cover has landed.

   This existed inside page-transition.js, for --veil-leave alone.
   hero-intro.js needs the same thing for the seven durations of the
   greeting, so it moved here rather than being written a second time.

   THE FALLBACK IS NOT OPTIONAL. A token can be missing — a stylesheet that
   failed, a name typed wrong — and a wait of NaN milliseconds is a wait that
   never ends, which on both of this module's callers means a visitor left
   looking at a black screen. Every caller states what to do instead.
   ========================================================================== */

/**
 * Reads a CSS time token off an element and returns it in milliseconds.
 *
 * @param {Element} element  the element to resolve the token against; custom
 *                           properties inherit, so any element in the document
 *                           sees the ones declared on :root
 * @param {string}  token    the custom property name, "--veil-leave" and so on
 * @param {number}  fallback milliseconds to use when the token is missing or
 *                           is not a time
 * @returns {number} milliseconds
 */
export function cssMilliseconds(element, token, fallback) {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();

  // Order matters: "ms" also ends in "s".
  if (raw.endsWith("ms")) return parseFloat(raw) || fallback;
  if (raw.endsWith("s")) return (parseFloat(raw) * 1000) || fallback;
  return fallback;
}

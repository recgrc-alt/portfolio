/* ==========================================================================
   UI MARKS  ·  small drawings that are not anybody's product logo
   --------------------------------------------------------------------------
   tool-icons.js holds the marks of real tools: Blender, Figma, Three.js. These
   are different. They are plain glyphs the interface draws for itself, and
   they need their own home for a reason that is not tidiness:

       export const TOOLS = Object.keys(MARKS);   // in tool-icons.js

   work-list.js builds the gallery's filter chips from that list. Anything
   added to tool-icons.js therefore becomes a filter, and a cube is not a tool
   anybody can filter their work by. Putting it there would have shown up as a
   broken chip on a page nobody was editing at the time.

   THE SAME FRAME AS EVERY OTHER MARK ON THIS SITE.
   A 24x24 viewBox, aria-hidden, and no colour or size of its own: the
   stylesheet gives it both in em, so a mark tracks the type it stands beside
   rather than fighting it.

   THE PATHS ARE INLINE, AND THE FILES ARE STILL KEPT.
   assets/icons/ holds each mark as it arrived, which is where to go to see or
   replace one; the copy here is what actually ships, so a mark costs no
   request of its own. That is the arrangement tool-icons.js already has, and
   the same warning applies: these started identical and nothing keeps them in
   step. Changing a mark means changing both.
   ========================================================================== */

const MARKS = {
  /* Boxicons (MIT), filed as assets/icons/cube.svg. A solid path with the
     faces cut out of it, so `fill: currentColor` alone draws the whole thing
     and it needs no stroke and no second colour. */
  cube: '<path d="M3 16C3 16.34 3.18 16.67 3.47 16.85L11.47 21.85C11.6293 21.9482 11.8128 22.0002 12 22.0002C12.1872 22.0002 12.3707 21.9482 12.53 21.85L20.53 16.85C20.82 16.67 21 16.35 21 16V8C21 7.66 20.82 7.33 20.53 7.15L12.53 2.15C12.21 1.95 11.79 1.95 11.47 2.15L3.47 7.15C3.18 7.33 3 7.65 3 8V16ZM5 9.47L11 13.07V19.2L5 15.45V9.47ZM13 19.2V13.07L19 9.47V15.45L13 19.2ZM12 4.18L17.84 7.83L12 11.33L6.16 7.83L12 4.18Z"/>',
};

/**
 * Build one interface mark, or null when there is no such glyph.
 *
 * Decorative by definition: every place this is used has the same thing in
 * words beside it, so the mark is hidden from a screen reader rather than
 * announced twice.
 *
 * @param {string} name
 * @returns {SVGSVGElement|null}
 */
export function uiMark(name) {
  const body = MARKS[name];
  if (!body) return null;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ui-mark");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = body;
  return svg;
}

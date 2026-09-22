/* ==========================================================================
   PROJECT HEADING  ·  one heading, in two elements
   --------------------------------------------------------------------------
   Every chapter heading on a case study is built here, by both of the files
   that build chapters: project-chapters.js for the seven written shapes, and
   project-stage-section.js for the 3D one. It is a shared module and not a
   function exported from either of them because those two already import each
   other in one direction, and adding the other would make a cycle out of what
   is really just a piece of markup they have in common.

   WHY THE HEADING IS TWO ELEMENTS
   The outer h2 is a frame with overflow:hidden and never moves. The span
   inside holds the words and starts a whole line below its own box, so it is
   invisible until it slides up into place. That is the difference between text
   that fades in and text that rises out of the page.

   A clip-path on the h2 would have done the same in one element, and was
   tried. It is not a compositor property: animating it repaints the heading on
   every frame for the whole of its duration, on a page that has eight of them.
   A static mask with a translating child is pure transform — the main thread
   hands over one layer and the animation costs it nothing after that.

   The words stay in a single element, so a screen reader announces one heading
   and a selection copies one string. See .project-chapter__title in pages.css
   for the frame, the descender clearance and the entrance itself.
   ========================================================================== */

/**
 * @param {string} text        the heading itself
 * @param {string} className   the frame's classes
 * @param {string} [id]        for the section's aria-labelledby
 * @returns {HTMLHeadingElement}
 */
export function heading(text, className, id) {
  const h = document.createElement("h2");
  h.className = className;
  if (id) h.id = id;

  const inner = document.createElement("span");
  inner.className = "project-chapter__title-inner";
  inner.textContent = text;

  /* --- THE NAME IS STATED, NOT INFERRED -----------------------------------
   * Each section points aria-labelledby at this heading, so its landmark name
   * is whatever this element computes to. Once split-lines.js has broken the
   * words into one block per line, that computation is up to the browser's
   * accessible-name algorithm to put the spaces back between blocks — which it
   * is specified to do, and which is not something a section's name in a
   * screen reader's landmark list should be resting on.
   *
   * Measured after a split: textContent reads "Concept andvision". innerText
   * is right, and the name algorithm should be too, but stating the label
   * settles it. It carries the same string the heading renders, so it can
   * never disagree with what is on screen. */
  h.setAttribute("aria-label", text);

  h.append(inner);
  return h;
}

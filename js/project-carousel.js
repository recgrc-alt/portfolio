/* ==========================================================================
   PROJECT CAROUSEL  ·  one rectangle, several pictures, taking turns
   --------------------------------------------------------------------------
   A chapter that has more to show than one still gets a carousel instead of a
   figure: the frames stack in a single box and cross-fade between each other,
   so a set of references or a sequence of sketches costs the page one slot
   rather than a gallery.

   IT DOES NOT OWN ANY TIMING, and that is the point of the file being this
   short. Every mechanic a carousel needs — the interval, the cross-fade, and
   the rule that it only runs while it is on screen and its tab is in front —
   was already written for the gallery slideshows in slideshow.js. Rewriting
   it here would have produced a second answer to "when may this animate",
   which is exactly how two parts of a site end up disagreeing. So this builds
   the FRAMES and hands them over; slideshow.js does the rest, and both share
   one IntersectionObserver for the whole page.

   That also settles the requirement that it must not start until the reader
   reaches the section: it is not a special case, it is the behaviour every
   cycling thing on this site already has.

   WORKING BEFORE THE PICTURES EXIST
   The data says how many frames there will be. Until real files are listed,
   each one is a numbered placeholder in the same white the rest of the page's
   holes use, so the carousel can be judged for size, rhythm and position now
   and the folder can be dropped in later. Give the same block a `sources`
   array instead of `frames` and the placeholders are simply not built.
   ========================================================================== */

import { t } from "./i18n.js?v=289";
import { createSlideshow } from "./slideshow.js?v=289";

/* One placeholder frame.

   IT BORROWS THE SLOT'S CLOTHES, NOT ITS COUNTER. The white face, the
   monospaced number and the note are .slot's, because a hole is a hole and
   there should be one look for all of them. But slot() also numbers what it
   builds against a page-wide counter, and those numbers are a shot list: they
   say "asset 07 goes here". These numbers mean something different — they are
   positions WITHIN one asset, the order the images will cycle in — so they
   count from zero on their own and never touch that sequence. */
function placeholder(index, spec) {
  const fig = document.createElement("figure");
  fig.className = "slot project-carousel__frame";
  fig.dataset.slotKind = "render";

  const face = document.createElement("div");
  face.className = "slot__face";

  const num = document.createElement("span");
  num.className = "slot__num";
  num.textContent = String(index).padStart(2, "0");

  const kind = document.createElement("span");
  kind.className = "slot__kind";
  kind.textContent = t("slot.render", "RENDER");

  face.append(num, kind);

  /* The brief is written once, on the first frame. Repeating the same sentence
     on all four would read as four different assets rather than as one set,
     and it is the set the sentence describes. */
  if (index === 0 && spec.what) {
    const what = document.createElement("p");
    what.className = "slot__what";
    what.textContent = spec.what;
    face.append(what);
  }

  fig.append(face);
  return fig;
}

/**
 * @param {object} spec
 * @param {number} [spec.frames]  how many placeholders to build, when there
 *                                are no images yet
 * @param {(string|{src: string, alt: string})[]} [spec.sources] the real
 *                                images, once they exist. Takes precedence
 *                                over `frames`. A bare path is decoration; the
 *                                object form describes itself to a reader who
 *                                cannot see it. See slideshow.js.
 * @param {string} [spec.ratio]   CSS aspect-ratio for the box. Default 16/9.
 * @param {string} [spec.what]    what belongs here, for the placeholder state
 * @param {string} [spec.credit] a source line printed under the box, for a set
 *                                that is not the author's own work
 * @param {number} [spec.interval] ms a frame holds. Defaults to the
 *                                slideshow's own, so every cycling thing on
 *                                the site keeps the same pace.
 * @returns {HTMLElement|null}
 */
export function buildCarousel(spec = {}) {
  const sources = Array.isArray(spec.sources) ? spec.sources.filter(Boolean) : [];
  const count = Number(spec.frames) || 0;
  if (!sources.length && count < 1) return null;

  const box = document.createElement("div");
  box.className = "project-carousel";
  box.style.setProperty("--slot-ratio", spec.ratio || "16 / 9");

  const opts = { interval: spec.interval };
  if (!sources.length) {
    opts.frames = Array.from({ length: count }, (_, i) => placeholder(i, spec));
  }

  box.append(createSlideshow(sources, opts));

  /* WHERE THE PICTURES CAME FROM, when they did not come from here.
     A case study earns the right to show its references, and a reference shown
     without a name is the one thing on a portfolio that costs more than it is
     worth. Small type under the box rather than over it: it is a footnote, not
     a caption, and the images are still the thing being looked at. */
  if (spec.credit) {
    const credit = document.createElement("p");
    credit.className = "project-carousel__credit";
    credit.textContent = spec.credit;
    box.append(credit);
  }

  return box;
}

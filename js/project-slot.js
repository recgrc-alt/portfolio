/* ==========================================================================
   PROJECT SLOT  ·  the hole where an asset is going to be
   --------------------------------------------------------------------------
   A case study is written long before its images exist. The usual way round
   that is to leave the section out until the asset arrives, and the usual
   result is that the page is never judged as a whole until it is too late to
   change its shape.

   So the missing pieces are BUILT, at the right size, in the right place, and
   they say what belongs there. The page can be read end to end today, with the
   holes visible as holes.

   WHITE ON A BLACK SITE, DELIBERATELY. Every other surface here is dark; a
   white rectangle is the one thing that cannot be mistaken for a design
   decision. Nobody will ship this by accident.

   AND IT IS ALSO THE BRIEF. Each slot carries what to shoot, the aspect it has
   to be, and the format. So the page and the shot list cannot drift apart:
   there is only one of them, and it is on the page.
   ========================================================================== */

import { t } from "./i18n.js?v=289";

let counter = 0;

/** Resets the numbering. Called once per render so a language switch does not
 *  carry on counting from where the last one stopped. */
export function resetSlots() {
  counter = 0;
}

/**
 * @param {object} spec
 * @param {string} spec.what   what belongs here, in a sentence
 * @param {string} [spec.kind] "video" | "render" | "process" | "model"
 * @param {string} [spec.ratio] CSS aspect-ratio, e.g. "16 / 9". Default 16/9.
 * @param {string} [spec.note] the technical requirement: duration, format
 */
export function slot(spec = {}) {
  counter += 1;

  const fig = document.createElement("figure");
  fig.className = "slot";
  fig.dataset.slotKind = spec.kind || "render";
  fig.style.setProperty("--slot-ratio", spec.ratio || "16 / 9");

  const face = document.createElement("div");
  face.className = "slot__face";

  /* The number is the only thing tying a hole on the page to a line in the
     shot list. Printed rather than hidden, so a message about "slot 07" means
     something to somebody looking at the screen. */
  const num = document.createElement("span");
  num.className = "slot__num";
  num.textContent = String(counter).padStart(2, "0");

  /* THROUGH THE DICTIONARY, like everything else a visitor reads. These were
     hard-coded in Portuguese, so the English page announced VÍDEO and PROCESSO
     inside a document declaring lang="en". */
  const kind = document.createElement("span");
  kind.className = "slot__kind";
  kind.textContent = ({
    video: t("slot.video", "VÍDEO"),
    render: t("slot.render", "RENDER"),
    process: t("slot.process", "PROCESSO"),
    model: t("slot.model", "MODELO"),
  })[spec.kind] || t("slot.image", "IMAGEM");

  const what = document.createElement("p");
  what.className = "slot__what";
  what.textContent = spec.what || t("slot.tbd", "por definir");

  face.append(num, kind, what);

  if (spec.note) {
    const note = document.createElement("p");
    note.className = "slot__note";
    note.textContent = spec.note;
    face.append(note);
  }

  fig.append(face);
  return fig;
}

/** Everything asked for so far, in order, for writing the shot list out. */
export function slotCount() {
  return counter;
}

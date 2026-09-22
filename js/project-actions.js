/* ==========================================================================
   PROJECT ACTIONS  ·  a link, turned into one of the site's buttons
   --------------------------------------------------------------------------
   The project page has always had exactly one way out to the live thing: a
   single primary button under the intro, built inside project-page.js from
   links[0]. That works while a project has one destination.

   IT BREAKS AS SOON AS A PROJECT HAS SEVERAL. Abrigo has three, and they are
   not alternatives: the Figma prototype belongs beside the paragraph about the
   high-fidelity design, the testing site belongs beside the paragraph about
   the usability tests, and the coded prototype belongs beside the paragraph
   about the coded prototype. Piled into one row at the top they are three
   unlabelled doors; put next to what they are about, each one is an offer to
   see the thing just described.

   SO THE BUTTON MOVES OUT OF THE PAGE AND INTO ITS OWN FILE, and both callers
   use this. That is the point of the file existing rather than the chapter
   builder growing its own copy: there is one answer to "what does a link look
   like on this site", so restyling the primary button restyles every button
   the case studies carry, without anybody having to remember the second place.
   ========================================================================== */

/* Only these two. A `javascript:` URL in the data would otherwise become a
   script that runs on click, and the data is a file anyone editing the site
   can touch. */
const SAFE_SCHEMES = new Set(["http:", "https:"]);

export function safeUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url, location.href);
    return SAFE_SCHEMES.has(parsed.protocol) ? url : null;
  } catch {
    return null;   // not a URL at all
  }
}

/* The label the site's hover effect needs: the text twice, once as content and
   once on a data attribute, so the stylesheet can offset a ghost copy of it. */
export function echoLabel(text) {
  const span = document.createElement("span");
  span.className = "text-echo";
  span.dataset.text = text;
  span.textContent = text;
  return span;
}

/**
 * One link as a button.
 *
 * @param {object} spec
 * @param {string} spec.label  what the button says, already resolved to the
 *                             current language by the caller
 * @param {string} spec.url
 * @param {object} [opts]
 * @param {string} [opts.className] extra classes for the caller's own layout
 * @param {boolean} [opts.primary=true] false gives the outlined variant, for a
 *                             button that sits beside a paragraph rather than
 *                             ending the page's introduction
 * @returns {HTMLAnchorElement|null} null when the url is missing or unsafe, so
 *                             a bad entry in the data leaves no dead button
 */
export function actionButton(spec, opts = {}) {
  const href = safeUrl(spec?.url);
  if (!href || !spec?.label) return null;

  const a = document.createElement("a");
  a.className = ["btn", opts.primary === false ? null : "btn--primary", opts.className]
    .filter(Boolean).join(" ");
  a.href = href;

  /* Everything here leaves the site. `noopener` because a new tab that can
     reach back into window.opener is a hole, and `noreferrer` because a
     student server does not need to be told where its visitors came from. */
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  // The arrow is part of the label and not an icon: it has to travel with the
  // text when the hover effect offsets it, or the ghost comes apart.
  a.append(echoLabel(`${spec.label} ↗`));
  return a;
}

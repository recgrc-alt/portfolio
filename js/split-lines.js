/* ==========================================================================
   SPLIT LINES  ·  a heading, broken into the lines the browser gave it
   --------------------------------------------------------------------------
   Turns one run of text into one element per VISUAL line, each with its own
   mask, so a heading can arrive line by line instead of all at once. This is
   the effect every award-shortlisted site does with GSAP's SplitText; the
   whole of it is below, and it is short because the browser has already done
   the hard part.

   THE BROWSER DECIDES WHERE THE LINES ARE, NOT THIS FILE.
   There is no measuring of glyph widths and no guessing at break points. Each
   word is put in an inline span, the browser lays the paragraph out exactly as
   it always would, and then each span is ASKED which row it landed on. Words
   sharing a row are one line. That means the split agrees with text-wrap:
   balance, with hyphenation, with any language, and with whatever the type
   does at a width nobody has tested yet — because it is not a second opinion
   about line breaking, it is a reading of the first one.

   WHY LINES AND NOT LETTERS
   A per-character animation needs one element per glyph and one transform per
   glyph. A per-line animation needs one of each per line. On a heading of six
   words that is two elements instead of thirty, and the effect a reader
   actually perceives is identical: type rising out of a rule.

   WHAT IT COSTS TO RUN
   One forced layout per heading, once, plus one more whenever the width
   changes. Nothing per frame and nothing per scroll: the animation itself is a
   transform on a static mask, which is the compositor's job alone.

   IT FAILS VISIBLE, NEVER INVISIBLE.
   Masking is what hides the words, so anything that stops this file finishing
   its work has to leave them unmasked. The mask is therefore applied by the
   stylesheet only to a heading that already carries `is-split`, and that class
   is the last thing set here — see project-heading.js and the .project-line
   rules in pages.css.
   ========================================================================== */

/* The original text, parked on the element the first time it is split. Every
   later split reads from here rather than from the DOM, so re-splitting after
   a resize cannot slowly eat its own whitespace. */
const FONTE = "splitSource";

/* How far apart two words have to sit vertically before they count as being on
   different lines, as a share of the line's own height. Half a line is
   comfortably more than the sub-pixel wobble of a single row and comfortably
   less than the distance to the next one. A share and not a pixel count: the
   type on this site ranges from 36px to 85px depending on the screen, and a
   threshold that works for one would be wrong for the other. */
const MESMA_LINHA = 0.5;

/**
 * Break `el` into one masked element per visual line.
 *
 * Safe to call repeatedly: it rebuilds from the stored source every time, so a
 * resize handler can simply call it again.
 *
 * @param {HTMLElement} el the element holding the text. Its own text is
 *        replaced; nothing outside it is touched.
 * @returns {number} how many lines were made, or 0 if it declined to split.
 */
export function splitLines(el) {
  if (!el) return 0;

  const texto = (el.dataset[FONTE] ?? el.textContent ?? "").trim();
  if (!texto) return 0;
  el.dataset[FONTE] = texto;

  /* --- 1 . one word, one span ------------------------------------------
   * Inline spans, so the line breaking is exactly what it would have been
   * with no spans at all. The separators are real text nodes rather than
   * padding on the spans, or the browser would have nowhere to break.
   */
  const palavras = texto.split(/\s+/);
  const marcas = [];
  el.textContent = "";
  palavras.forEach((palavra, i) => {
    if (i > 0) el.append(" ");
    const s = document.createElement("span");
    s.textContent = palavra;
    el.append(s);
    marcas.push(s);
  });

  /* --- 2 . ask each word which row it is on ------------------------------
   * getBoundingClientRect rather than offsetTop: offsetTop is measured from
   * the nearest positioned ancestor, which for a heading inside a chapter can
   * be several boxes away and is not the same reference for every span if the
   * markup around it ever changes. The rects are all read in one pass, before
   * anything is written back, so this costs a single layout and not one per
   * word.
   */
  const topos = marcas.map((s) => s.getBoundingClientRect().top);
  const alturaLinha = parseFloat(getComputedStyle(el).lineHeight);
  const limite = (Number.isFinite(alturaLinha) ? alturaLinha : 0) * MESMA_LINHA;

  const linhas = [];
  let anterior = null;
  topos.forEach((topo, i) => {
    if (anterior === null || Math.abs(topo - anterior) > limite) {
      linhas.push([]);
      anterior = topo;
    }
    linhas[linhas.length - 1].push(palavras[i]);
  });

  /* One line is no split at all. Leaving it unsplit keeps the markup simpler
     and lets the whole-heading mask in pages.css handle it, which produces the
     identical result for a single line. */
  if (linhas.length < 2) {
    el.textContent = texto;
    el.classList.remove("is-split");
    return 0;
  }

  /* --- 3 . rebuild, one mask per line ------------------------------------
   * The outer span is the frame and never moves; the inner holds the words and
   * is the only thing that animates. `--line` is the line's position, which the
   * stylesheet turns into its share of the stagger — the delay is decided
   * there, in the same place every other delay on this site is.
   */
  el.textContent = "";
  linhas.forEach((palavrasDaLinha, i) => {
    const linha = document.createElement("span");
    linha.className = "project-line";
    linha.style.setProperty("--line", String(i));

    const dentro = document.createElement("span");
    dentro.className = "project-line__inner";
    dentro.textContent = palavrasDaLinha.join(" ");

    linha.append(dentro);
    el.append(linha);
  });

  el.classList.add("is-split");
  return linhas.length;
}

/**
 * Split every element matching `selector` inside `root`, and keep them split
 * as the page changes shape.
 *
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {{ refresh: () => void, destroy: () => void }}
 */
export function keepSplit(root, selector) {
  const alvos = () => [...root.querySelectorAll(selector)];

  /* THE WIDTH EACH HEADING WAS LAST SPLIT AT.
   * Without this the whole thing is a loop: the observer watches the element,
   * splitting rewrites the element, rewriting it changes its box, and the
   * observer fires again — once every frame, forever.
   *
   * Width is also the only thing that can change a line break. A heading that
   * got taller because it now has two line boxes instead of one paragraph does
   * not need re-splitting, and this is what says so. */
  const larguras = new WeakMap();

  /* The pass itself. Reads a width, decides, splits - once per element. */
  function passar(forcar) {
    for (const el of alvos()) {
      const largura = el.getBoundingClientRect().width;
      if (!forcar && larguras.get(el) === largura) continue;
      larguras.set(el, largura);
      splitLines(el);
    }
  }

  /* TWO KINDS OF REQUEST, AND ONLY ONE OF THEM IS BATCHED.
   *
   * A RESIZE is noise: a ResizeObserver on eight headings fires eight times for
   * one drag of the window edge, and each split is a forced layout. Those are
   * collapsed into one frame, which is what `agendado` is for.
   *
   * A FORCED REFRESH is not noise. It is somebody saying "the text itself has
   * changed, split it again" - the dictionary rewriting a heading on a language
   * change, or the first pass once the real font has loaded. It runs now.
   *
   * They used to share one path, and the guard swallowed the second kind: with
   * a resize batch already pending, `refresh(true)` hit `if (agendado) return`
   * and was dropped on the floor. The pending batch then ran with forcar=false,
   * so whether the new text got split at all came down to whether its width
   * happened to have changed too. Same width, same words on screen - and the
   * caller had no way to know its request had gone nowhere. */
  let agendado = false;
  function refresh(forcar = false) {
    if (forcar) { passar(true); return; }
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      passar(false);
    });
  }

  /* AFTER THE FONT, NOT BEFORE IT. Space Grotesk is a web font, and the line
     breaks of a heading set in the fallback are not the line breaks of the
     same heading set in the real thing. Splitting first would freeze the wrong
     ones into the markup. document.fonts.ready settles immediately on a
     repeat visit, so this is not a delay anybody waits for. */
  const arranque = document.fonts?.ready ?? Promise.resolve();
  arranque.then(() => refresh(true), () => refresh(true));

  /* Watching the elements themselves rather than the window: a heading also
     re-wraps when the column beside it changes, when a sibling loads, or when
     the reader zooms, and none of those is a window resize. */
  const aoRedimensionar = () => refresh(false);

  /* BOTH SIGNALS, NOT ONE OR THE OTHER, and they cost nothing together.
     The observer is the better of the two: a heading also re-wraps when the
     column beside it changes, when a sibling finishes loading, or when the
     reader zooms, and none of those is a window resize. The window event is
     the floor underneath it, for anything that leaves a ResizeObserver
     throttled or unfired.

     Running both is safe because refresh() is guarded by the width each
     heading was last split at: whichever signal arrives second finds nothing
     to do and returns. */
  const observador = "ResizeObserver" in window
    ? new ResizeObserver(aoRedimensionar) : null;
  if (observador) alvos().forEach((el) => observador.observe(el));
  window.addEventListener("resize", aoRedimensionar, { passive: true });

  return {
    refresh: () => refresh(true),
    destroy() {
      observador?.disconnect();
      window.removeEventListener("resize", aoRedimensionar);
    },
  };
}

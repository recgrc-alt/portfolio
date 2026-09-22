/* ==========================================================================
   PROJECT CHAPTERS  ·  the body of a case study, from data
   --------------------------------------------------------------------------
   The project page used to have exactly three places for prose: a description,
   a context line, and a `body` array rendered as three anonymous paragraphs.
   That is enough to say what a project is and nowhere near enough to say how
   it was made, so every page read the same regardless of how much work was
   behind it.

   A chapter is a titled piece of the story with one thing to look at. Written
   once into the JSON, in both languages, and rendered here.

   FIVE SHAPES, NOT ONE.
   The first version put the words on one side and the picture on the other and
   alternated, which solves the first two rows and nothing after that. A reader
   four rows into a page where every row is the same shape has stopped reading
   the rows and started scrolling past them. So a chapter declares what it IS,
   and the stylesheet gives it a shape:

     split      words beside the asset, alternating sides. Still here, still
                useful, no longer the only answer
     ask        the chapter opens with a QUESTION set large. Text runs in a
                narrow column on the left and the live asset sits right
     full       the asset spans the whole measure with the words above it. For
                anything that deserves to be looked at rather than referred to
     prose      words alone, at reading measure, centred. Deliberate empty
                space, and the one shape that lets the eye behind the page show
                through
     showcase   its own dedicated block. Contrasted ground, room around it, and
                nothing else competing. Reserved for things you operate rather
                than read
     depth      one clip HELD while the words go past it. The picture does not
                travel with the scroll — what the scroll does is push its
                parallax sideways, so the thing stays put and turns. For the
                one asset a project wants the reader to sit with

   AND WHETHER IT COVERS THE EYE.
   The 3D eye is a fixed canvas behind everything. Left visible under every
   paragraph it both hurts the reading and spends the idea; a chapter that says
   `seal: true` lays opaque ground over it, with the site's own soft hand-off
   above and below so it sinks away rather than ending on a line. The chapters
   that do NOT seal are what make the ones that do mean something.
   ========================================================================== */

import { slot } from "./project-slot.js?v=289";
import { heading } from "./project-heading.js?v=289";
import { buildCarousel } from "./project-carousel.js?v=289";
import { actionButton } from "./project-actions.js?v=289";
import { buildStage } from "./project-stage-section.js?v=289";
import { t } from "./i18n.js?v=289";

/* The shapes a chapter may take. Anything else in the data falls back to
   `split`, which is the one that works with any content. */
const SHAPES = new Set(["split", "ask", "full", "prose", "showcase", "scene", "stage", "flank", "depth"]);

export function buildChapters(project) {
  const chapters = project.chapters || [];
  if (!chapters.length) return null;

  const frag = document.createDocumentFragment();
  // Counted separately from the array index: a showcase is a block of its own
  // and should not take a number out of the reading sequence.
  let numbered = 0;

  chapters.forEach((chapter) => {
    const shape = SHAPES.has(chapter.layout) ? chapter.layout : "split";
    frag.append(
      shape === "scene" ? buildScene(chapter)
        : shape === "stage" ? buildStage(chapter)
        : shape === "showcase" ? buildShowcase(chapter)
        : buildChapter(chapter, shape, (numbered += 1))
    );
  });

  return frag;
}

/* --- One chapter ---------------------------------------------------------- */
function buildChapter(chapter, shape, n) {
  const section = document.createElement("section");
  section.className = `project-chapter project-chapter--${shape}`;
  if (chapter.seal) section.classList.add("seals");
  if (chapter.id) section.id = `ch-${chapter.id}`;

  /* NAMED, SO IT IS A LANDMARK AND NOT A DIV.
     A <section> with no accessible name is exposed as generic, which means the
     eight chapters this page now has cannot be moved between at all. The page
     has no skip link and <main> is its only landmark. work.html already does
     exactly this, pointing aria-labelledby at the heading it builds; this is
     the same pattern, not a new one. */
  const titleId = chapter.id ? `ch-${chapter.id}-title` : null;
  if (titleId) section.setAttribute("aria-labelledby", titleId);

  /* Only `split` alternates. Alternating a shape that is already asymmetric on
     purpose would just make it look accidental.
     ITS SIDE COMES FROM ITS PLACE IN THE WHOLE COUNT, not from a count of
     splits alone: `n` goes up for every counted shape (split, ask, full,
     prose, flank). Four split sections in a row therefore always come out
     start, end, start, end, and giving one of them a picture later never
     moves another.

     THE DATA MAY STILL OVERRULE IT, for the one case the counter cannot know
     about: an asset that means something by the side it is on. The Modular
     City notebook pages are read left-to-right like the pages they are, and
     the alternation happened to put them right. Anything other than the two
     valid values is ignored rather than written through, so a typo in the JSON
     cannot produce a chapter with no side at all. */
  if (shape === "split") {
    const asked = chapter.side === "start" || chapter.side === "end" ? chapter.side : null;
    section.dataset.side = asked || (n % 2 === 0 ? "end" : "start");
  }

  const inner = document.createElement("div");
  inner.className = "project-chapter__inner";

  /* IN `ask`, THE QUESTION LEAVES THE COLUMN.
     Measured at the narrowest desktop the two-column shapes survive, 1030px:
     with the heading inside the text column, that column came to 294px, about
     twenty-nine characters. The question was fine there, that narrowness is
     what makes it wrap and become the shape of the block. The paragraphs under
     it were not: twenty-nine characters is a newspaper column, not a measure
     anybody reads four sentences in.

     So the heading becomes a direct child of the grid and spans it, and the
     words underneath get a column worth reading. It also separates `ask` from
     `split` by more than a ratio. */
  const head = shape === "ask" && chapter.question
    ? buildAskHead(chapter, titleId) : null;

  const copy = buildCopy(chapter, shape, n, !!head, titleId);
  const media = buildMedia(chapter);

  if (head) inner.append(head);

  /* IN `flank`, THE WORDS TRAVEL INSIDE A BAND OF THEIR OWN.
     Everywhere else the copy is a grid item and the picture is the one beside
     it. Here there are two pictures and they are not the subject: they hold
     the column open, one on each side, and whatever the chapter shows properly
     goes UNDER all three. That is a row inside a row, so it needs a wrapper —
     the same reason `ask` has a __head. */
  inner.append(shape === "flank" ? bandWith(copy, chapter) : copy);

  if (media) {
    inner.append(media);
    /* WHICH OF THE TWO TRACKS THE PICTURE GETS.
       The split is 5fr of words and 7fr of picture, and `order` swaps the two
       elements without swapping the tracks — so on an alternating row the
       picture landed in the 5fr column and the words in the 7fr one, which is
       backwards. The stylesheet mirrors the ratio for a row marked here, and
       only for a row that has something real to show: a slot is a note about a
       missing asset and keeps the narrower track it has always had. */
    /* Tested for presence, not for truth: the marker is an empty string, which
       is falsy, so `!media.dataset.hole` was true for a hole as well and every
       slot took the wide track too. */
    if (media.dataset.hole === undefined) inner.dataset.asset = "";
  } else if (shape !== "flank") inner.dataset.alone = "";

  section.append(inner);
  return section;
}

/* --- flank · a column of words with a picture holding each side ------------
 * The two images are given real alt text and are NOT hidden from a screen
 * reader, even though the brief for them was "background". They are the thing
 * the paragraphs are about — the four planets — and calling artwork decorative
 * because of where it sits on the page is how a picture that says something
 * ends up saying it only to the people who can see it.
 *
 * They are also the reason this is a wrapper and not three grid columns on
 * __inner directly: the clip that comes after has to span all three, and a
 * grid item cannot span columns it is not a sibling of.
 */
function bandWith(copy, chapter) {
  const band = document.createElement("div");
  band.className = "project-chapter__band";

  /* --- THE BAND IS WHAT THE OBSERVER WATCHES, AND IT HAS TO BE -------------
   * The planets rest most of a screen-width off the page: their whole entrance
   * is crossing in from outside it. So at the moment they are waiting to be
   * revealed they intersect the viewport by exactly nothing, and an element
   * with no intersection never reaches the threshold that would reveal it.
   * They sat off-screen at opacity 0 for the entire life of the page, waiting
   * for a crossing that could not happen because they were waiting for it.
   *
   * The band cannot deadlock that way: it holds the words, so it is on screen
   * by definition. Marking it as the group makes one crossing arrive the whole
   * row — the paragraphs on their cascade and the planets from the sides.
   */
  band.dataset.revealGroup = "";

  /* THE COPY IS APPENDED FIRST AND PLACED SECOND. Order is a CSS decision, so
     a screen reader hears the chapter before it hears about the pictures, the
     same rule `split` follows when it alternates sides. */
  band.append(copy);

  for (const edge of ["start", "end"]) {
    const spec = chapter.flank?.[edge];
    if (!spec?.src) continue;

    const side = document.createElement("div");
    side.className = "project-chapter__flank";
    side.dataset.flank = edge;

    /* data-reveal is the site's one answer to "when may this arrive": one
       shared IntersectionObserver, already running, already silent under
       prefers-reduced-motion. The travel — in from its own edge rather than
       up from below — is set in the stylesheet against this same attribute. */
    side.dataset.reveal = "";

    const img = document.createElement("img");
    img.className = "project-chapter__flank-img";
    img.src = spec.src;
    img.alt = spec.alt || "";
    img.loading = "lazy";
    img.decoding = "async";

    /* THE SHAPE IS KNOWN BEFORE THE FILE IS, and without it there is nothing
       here at all. The image is lazy and the rule sizes it `width: 100%;
       height: auto`, so until the bytes arrive it has no intrinsic size and
       the box around it is zero pixels tall. Measured: 680 x 0. A box with no
       area cannot be revealed, cannot be scrolled to, and is not near enough
       to anything for the lazy loader to fetch it — so it stayed empty, which
       is why nothing appeared on the page.

       The ratio comes from the data for the same reason every other ratio on
       this page does: the file knows its own proportions and the stylesheet
       should not have to guess them. */
    if (spec.ratio) img.style.aspectRatio = spec.ratio;

    /* --- AND IT MAY OFFER MORE THAN ONE FILE ------------------------------
     * This is the largest picture on the page and the only one that was being
     * enlarged rather than reduced. Measured at 1904 on a 1.25x display: shown
     * at 1028 CSS pixels, which is 1285 real ones, against a file 1100 wide.
     * Every other image on the chapter had at least twice the pixels it
     * needed; this one was 17% short, and being short is what looks soft.
     *
     * srcset rather than simply shipping the big one, because the big one is
     * three times the bytes and most visitors do not need a pixel of it. The
     * browser picks by its own density and viewport, and a machine that cannot
     * tell the difference never pays for it.
     *
     * `sizes` is a hint, not a measurement, and it is deliberately generous:
     * the planet is 169% of a track whose width depends on the fixed measure
     * of the words beside it, which is not something CSS can be asked for
     * here. Over-declaring costs a larger file on a narrow screen; under-
     * declaring costs the softness this is fixing. */
    if (spec.srcset) {
      img.srcset = spec.srcset;
      img.sizes = spec.sizes || "55vw";
    }

    side.append(img);
    band.append(side);
  }

  return band;
}

/* --- The words ------------------------------------------------------------ */
function buildCopy(chapter, shape, n, headTaken, titleId) {
  const copy = document.createElement("div");
  copy.className = "project-chapter__copy";

  // The kicker and the heading went up into the spanning head; the column
  // starts straight into the words.
  if (headTaken) {
    (chapter.body || []).forEach((text) => copy.append(paragraph(text)));
    const asked = buildActions(chapter);
    if (asked) copy.append(asked);
    return copy;
  }

  /* NO LABEL, NO LINE AT ALL — not even the number.
     There was a version of this that printed the number on its own whenever a
     chapter had no kicker, on the reasoning that the count should survive. It
     was wrong for the case it was written for: a chapter whose heading already
     names the part (Concept and vision) does not need a bare 01 floating above
     it as well. Two lines of chrome above a two-line heading is furniture.
     A chapter opts out of the kicker by having none, and opting out means the
     whole line goes.
     The four sections every project carries were given a bare grey number
     for a while, and it went for the same reason: their big white title is
     already the heading, and a count above it was chrome. */
  if (chapter.kicker) {
    const kicker = document.createElement("p");
    kicker.className = "project-chapter__kicker";
    // Numbered as they fall, so a reader who scrolled past one can tell.
    kicker.textContent = `${String(n).padStart(2, "0")} · ${chapter.kicker}`;
    copy.append(kicker);
  }

  /* THE QUESTION IS THE HEADING, where there is one. A statement heading tells
     you what the paragraph will say and gives you permission to skip it; a
     question makes the paragraph the answer. Set large, and it is the same
     element as any other heading so the document outline does not change. */
  const headingText = shape === "ask" ? chapter.question || chapter.title
                                      : chapter.title;
  if (headingText) {
    const title = heading(headingText, "project-chapter__title", titleId);
    if (shape === "ask" && chapter.question) {
      title.classList.add("project-chapter__title--ask");
    }
    copy.append(title);
  }

  /* THE STRAPLINE, from either of two places.
     `ask` chapters have always had one implicitly: the question becomes the
     heading and the statement it displaced drops underneath rather than being
     thrown away. Every other shape had no way to say a second line at all,
     which is why the opening chapter could name its subject but not qualify
     it. `sub` is that second line, stated by the data, and it uses the class
     and the type the ask shape already established — one strapline on this
     page, arrived at two ways. */
  const strap = shape === "ask" && chapter.question ? chapter.title : chapter.sub;
  if (strap) {
    const sub = document.createElement("p");
    sub.className = "project-chapter__sub";
    sub.textContent = strap;
    copy.append(sub);
  }

  (chapter.body || []).forEach((text) => copy.append(paragraph(text)));

  const actions = buildActions(chapter);
  if (actions) copy.append(actions);

  return copy;
}

/* --- A way out, next to the thing it opens --------------------------------
 * A project's own links live at the top of the page, as one primary button
 * under the intro. That is right while there is one destination and wrong as
 * soon as there are three: Abrigo has a Figma prototype, a testing site and a
 * coded app, and stacked together at the top they are three unlabelled doors.
 *
 * A chapter may therefore carry its own. They render at the END of the words,
 * after the paragraph that explains what is behind them, because a button
 * offered before the explanation is a button nobody knows whether to press.
 *
 * Built by project-actions.js, which also builds the one at the top, so all of
 * them share a look and restyling one restyles the rest.
 */
function buildActions(chapter) {
  const links = Array.isArray(chapter.links) ? chapter.links : [];
  if (!links.length) return null;

  const row = document.createElement("div");
  row.className = "project-chapter__actions";

  for (const link of links) {
    /* Not primary: the filled plate is the page's one loudest control and it
       belongs to the project's own way in. These are offers beside a
       paragraph, so they take the outlined variant and stay quieter than it. */
    const button = actionButton(link, { primary: false });
    if (button) row.append(button);
  }

  // Every entry unusable (missing url, or a scheme that is not http) leaves
  // nothing rather than an empty row holding space open.
  return row.children.length ? row : null;
}

/* The question, its kicker and the statement it displaced, as one band across
   the whole measure. Same elements and same classes as anywhere else, so
   nothing here needs its own typography. */
function buildAskHead(chapter, titleId) {
  const head = document.createElement("div");
  head.className = "project-chapter__head";

  if (chapter.kicker) {
    const kicker = document.createElement("p");
    kicker.className = "project-chapter__kicker";
    kicker.textContent = chapter.kicker;
    head.append(kicker);
  }

  head.append(heading(
    chapter.question,
    "project-chapter__title project-chapter__title--ask",
    titleId
  ));

  /* Same two sources as in buildCopy. An `ask` chapter that states `sub`
     outright means it, so that wins over the displaced statement. */
  const strap = chapter.sub || chapter.title;
  if (strap) {
    const sub = document.createElement("p");
    sub.className = "project-chapter__sub";
    sub.textContent = strap;
    head.append(sub);
  }

  return head;
}

/* NO MORE GUESSING AT LEAD-INS.
   This used to look for a short first sentence and set it apart, on the
   assumption that the emotion paragraphs opened with a planet name and a full
   stop. Run against the copy that actually shipped, it never fired once in the
   chapter it was written for, and fired exactly once somewhere else: on "And
   then there was the AI.", which is not a label but the opening line of a
   paragraph. It also used <strong>, which means importance rather than
   typographic emphasis, so a screen reader announced that line as stressed.

   Punctuation cannot tell a label from a short sentence, because that
   distinction is not in the text. If a paragraph ever wants a lead-in, the
   data can say so with a field, the same way it already says `layout`, `seal`
   and `question`. */
function paragraph(text) {
  const p = document.createElement("p");
  p.className = "project-chapter__text";
  p.textContent = text;
  return p;
}

/* --- The thing to look at -------------------------------------------------
 * Six sources, one at a time: a clip, a real image, a stack of images shown
 * together, a live 3D viewer, a carousel of several pictures sharing one box,
 * or a slot standing in for something that does not exist yet. Returns null
 * when a chapter has nothing at all, which is what `prose` is for.
 *
 * ORDER IS PRECEDENCE, most specific first. A chapter that names both a
 * carousel and a slot means the carousel: the slot is the generic fallback and
 * cannot be the thing that wins.
 */
function buildMedia(chapter) {
  if (chapter.depth?.src) return depthFrom(chapter.depth);
  if (chapter.video?.src) return videoFrom(chapter.video);
  if (chapter.media?.src) return figureFrom(chapter.media);
  if (chapter.stack?.sources?.length) return stackFrom(chapter.stack);
  if (chapter.models?.items?.length) return viewerInto(chapter.models);

  if (chapter.carousel) {
    const carousel = buildCarousel(chapter.carousel);
    if (carousel) {
      const box = document.createElement("div");
      /* The modifier is what lets the stylesheet treat a set of pictures
         differently from a single one without guessing at the contents. See
         .project-chapter__media--carousel: it stops the box being centred
         against a column of text far taller than it. */
      box.className = "project-chapter__media project-chapter__media--carousel";
      box.append(carousel);
      return box;
    }
    // A carousel declared with neither frames nor sources builds nothing, and
    // the chapter falls through to whatever else it has rather than to a hole.
  }

  if (chapter.slot) {
    const box = document.createElement("div");
    box.className = "project-chapter__media";
    /* A HOLE SAYS SO, and the caller reads it back. Everything else this
       function returns is an asset the row should give its wide track to; a
       slot is a note about an asset that does not exist, and a note does not
       earn the same room. See [data-asset] in pages.css. */
    box.dataset.hole = "";
    box.append(slot(chapter.slot));
    return box;
  }
  return null;
}

/* --- A clip inside a chapter ----------------------------------------------
 * NOT ONE LINE OF PLAYBACK CODE LIVES HERE, and that is the whole design of
 * it. Two things on this site already decide everything a clip needs, and both
 * of them find their subjects by the SAME marker the gallery cards carry:
 *
 *   cam-feeds.js   starts it when it scrolls into view and pauses it when it
 *                  leaves, which is also why the markup has no `autoplay`:
 *                  the attribute downloads eagerly, the observer does not.
 *   card-audio.js  unmutes it while the pointer is on it, ducks the ambience
 *                  while it speaks, and obeys the site's own sound switch.
 *
 * card-audio listens on document.body by delegation, so a clip built long
 * after that ran is covered without being registered anywhere. cam-feeds is
 * handed the whole project page after the chapters exist. Adding a third
 * player here would have been a third answer to "when may this make noise".
 *
 * MUTED IS NOT A STYLE CHOICE, it is the only state a browser will start a
 * clip in unasked. `volume` is set now so that when a hover does unmute it,
 * the clip arrives at the level the data asked for rather than at full.
 */
/**
 * @param {object} spec
 * @param {string} spec.src
 * @param {string} [spec.poster]
 * @param {string} [spec.ratio]
 * @param {string} [spec.alt]
 * @param {boolean} [spec.hasAudio]
 * @param {number} [spec.volume]
 * @param {boolean} [spec.playOnce] run through once and hold the last frame,
 *        rewinding only when the reader leaves and returns. See cam-feeds.js.
 * @param {boolean} [spec.cutout] the clip has a transparent background and
 *        should stand on the page rather than sit in a box.
 */
function videoFrom(spec) {
  const box = document.createElement("div");
  box.className = "project-chapter__media";

  const fig = document.createElement("figure");
  fig.className = "project-chapter__figure";

  const video = document.createElement("video");
  video.className = "project-chapter__video";
  video.muted = true;
  video.playsInline = true;

  /* --- TWO KINDS OF CLIP, AND ONLY ONE OF THEM LOOPS ----------------------
   * A screen recording is ambient: it runs while you are looking at it and it
   * repeats, because there is no moment in it that means anything more than
   * any other. cam-feeds.js has always driven those.
   *
   * A clip that BUILDS something is not that. It has a last frame that is the
   * point of it, and looping would wipe the thing it just made and start
   * again, which reads as a stutter rather than as a demonstration. So it runs
   * once, holds on that frame, and is rewound only when the reader leaves and
   * comes back to it. Same observer, different marker, one place that decides.
   *
   * preload also differs. An ambient clip is withheld until it is nearly on
   * screen because it is megabytes. A once-through clip is short and its whole
   * value is starting the instant it is reached, so it is fetched early. */
  if (spec.playOnce) {
    video.dataset.playOnce = "";
    video.loop = false;
    video.preload = "auto";
  } else {
    video.dataset.workVideo = "";    // cam-feeds plays it, card-audio speaks it
    video.loop = true;
    video.preload = "none";
  }

  /* A clip with a transparent background is a cut-out standing on the page,
     not a picture in a frame. It gets no ground of its own and is sized by
     height rather than by column width, because a tall cut-out beside a
     paragraph should match the words, not the box. */
  if (spec.cutout) video.classList.add("project-chapter__video--cutout");
  if (spec.poster) video.poster = spec.poster;
  if (spec.ratio) video.style.aspectRatio = spec.ratio;

  /* Whether it carries sound is DATA. card-audio's browser probes all depend
     on audio having been decoded, and a muted clip decodes it lazily or never
     — so the flag is what makes a hover reliably speak instead of reliably
     doing nothing. */
  if (spec.hasAudio) {
    video.dataset.hasAudio = "";
    const level = Number(spec.volume);
    if (Number.isFinite(level)) video.volume = Math.min(Math.max(level, 0), 1);
  } else {
    video.dataset.noAudio = "";
  }

  /* The description goes on the figure, not on the video: <video> has no alt,
     and a clip nobody can see is still a clip somebody should be told about. */
  if (spec.alt) fig.setAttribute("aria-label", spec.alt);

  video.src = spec.src;
  fig.append(video);
  box.append(fig);
  return box;
}

/* --- A clip with a depth map, held while the words go by -------------------
 * The markup here is the whole fallback story, so it is worth being plain
 * about the order things are in.
 *
 * THE CLIP IS REAL AND VISIBLE. It is an ordinary <video> in the figure, and
 * if nothing else ever ran the reader would see it play, flat, and lose
 * nothing but the parallax. The canvas sits on top of it and is transparent
 * until depth-media.js has both sources on the GPU, at which point .is-ready
 * fades it in over the clip it is drawing.
 *
 * So this builder deliberately does NOT mark the video for cam-feeds.js.
 * Playback belongs to whoever is drawing it: depth-media starts and stops the
 * clip with its own render loop, because a paused video still costs a texture
 * upload per frame. Two observers both deciding when this plays would be two
 * answers to one question.
 *
 * @param {object} spec
 * @param {string} spec.src    the clip
 * @param {string} spec.map    greyscale depth map, SAME FRAMING as the clip.
 *        Light is near, dark is far, and the far end must reach ~0: that floor
 *        is what holds the background still. See the shader.
 * @param {string} [spec.ratio] CSS aspect-ratio, e.g. "1200 / 900"
 * @param {string} [spec.alt]
 */
function depthFrom(spec) {
  const box = document.createElement("div");
  box.className = "project-chapter__media project-chapter__media--depth";

  /* --- THE STAGE, WHICH IS NOT THE SAME THING AS THE CLIP ------------------
   * Three elements rather than two, because three things are being asked for
   * at once and each needs its own box:
   *
   *   box    the grid item. Takes the row's full height; gives it to the stage.
   *   stage  what holds still while the words go past, and what CLIPS. The clip
   *          inside is wider than this column on purpose, so without a box to
   *          cut it at the screen edge it would push the document sideways.
   *   figure the clip itself, standing on the stage's floor.
   *
   * Collapsing any two of these loses one of the three. */
  const stage = document.createElement("div");
  stage.className = "project-chapter__depth-stage";

  const fig = document.createElement("figure");
  fig.className = "project-chapter__figure project-chapter__depth";
  /* Its own shape, from the data — the stage is a window, and the clip keeps
     its proportions inside it however wide that window turns out to be. */
  if (spec.ratio) fig.style.aspectRatio = spec.ratio;

  const video = document.createElement("video");
  video.className = "project-chapter__depth-source";
  video.src = spec.src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  /* Fetched only as it approaches: these are megabytes, and depth-media.js
     does not need the file until its observer has already fired. */
  video.preload = "none";

  const canvas = document.createElement("canvas");
  canvas.className = "project-chapter__depth-canvas";
  /* The canvas draws the clip that is already described below it; announcing
     the same picture twice is how a screen reader ends up reading a chapter
     with two of everything. */
  canvas.setAttribute("aria-hidden", "true");

  /* WHAT THE INITIALISER LOOKS FOR. Read off the element rather than passed
     through a registry, so a chapter built from JSON long after the page's
     modules loaded still gets picked up — the same way every other marker on
     this site works. */
  canvas.dataset.depthMedia = "";
  canvas.dataset.depthMap = spec.map;

  if (spec.alt) fig.setAttribute("aria-label", spec.alt);

  fig.append(video, canvas);
  stage.append(fig);
  box.append(stage);
  return box;
}

/**
 * @param {object} media
 * @param {string} media.src
 * @param {string} [media.alt]
 * @param {string} [media.ratio]
 * @param {string} [media.srcset] candidate widths, when more than one was made
 * @param {string} [media.sizes]  how wide it will be drawn, for that choice
 * @param {boolean} [media.cutout] the picture has no background of its own and
 *        stands on the page rather than sitting in a box. See videoFrom: the
 *        same word means the same thing there.
 */
function figureFrom(media) {
  const box = document.createElement("div");
  box.className = "project-chapter__media";

  const fig = document.createElement("figure");
  fig.className = "project-chapter__figure";

  const img = document.createElement("img");
  img.className = "project-chapter__img";
  img.src = media.src;
  img.alt = media.alt || "";
  // Below the fold by definition: nothing here competes with the hero.
  img.loading = "lazy";
  img.decoding = "async";
  if (media.ratio) img.style.aspectRatio = media.ratio;

  /* TWO WIDTHS WHERE TWO WERE MADE. The browser picks by its own density and
     viewport, so a laptop never pays for the file a retina desktop needs.
     `sizes` is not optional alongside srcset: without it the browser assumes
     the image is the full width of the viewport and always takes the larger
     one, which is the opposite of the point. */
  if (media.srcset) {
    img.srcset = media.srcset;
    img.sizes = media.sizes || "100vw";
  }

  /* A CUT-OUT IS NOT A PICTURE IN A BOX, and the difference is a class rather
     than a wrapper because everything that changes is paint: no ground, no
     corner, and a ceiling so the thing cannot outgrow the words beside it. */
  if (media.cutout) {
    img.classList.add("project-chapter__img--cutout");
    box.classList.add("project-chapter__media--cutout");
  }

  fig.append(img);

  /* NO CAPTION UNDER THE PICTURE. A line of grey type stuck to the bottom of
     every render turned each image into a labelled specimen, and none of the
     captions said anything the paragraph beside it had not already said. The
     description that matters is still there, on the img's alt, where it serves
     the readers who cannot see the picture rather than decorating it for the
     ones who can. */

  box.append(fig);
  return box;
}

/* --- Two pictures that are one picture ------------------------------------
 * A carousel is the right answer when a set of images are ALTERNATIVES: three
 * runs of the same city, five points of interest, a row of references. You see
 * one, then another, and the point is that they differ.
 *
 * It is the wrong answer when they CONTINUE each other. The two notebook pages
 * behind the Modular City plane are one drawing session: the second finishes
 * what the first starts, and cross-fading between them hides exactly the thing
 * worth seeing, which is the two of them together. So they stack, in the order
 * they were drawn, with a gap small enough to read as one block and wide
 * enough that neither page looks glued to the other.
 *
 * NOT A GALLERY. Two or three, at the top of the column. A stack long enough
 * to scroll past is a chapter that should have been two chapters.
 *
 * @param {object} spec
 * @param {(string|{src: string, alt: string, ratio?: string})[]} spec.sources
 * @param {string} [spec.ratio] shared aspect-ratio, when every image has the
 *                              same one. An entry may still override it.
 */
function stackFrom(spec) {
  const box = document.createElement("div");
  box.className = "project-chapter__media project-chapter__media--stack";

  for (const entry of spec.sources) {
    const item = typeof entry === "string" ? { src: entry } : entry;
    if (!item?.src) continue;

    const fig = document.createElement("figure");
    fig.className = "project-chapter__figure";

    /* The same class a single still wears, so a stacked image and a lone one
       are the same object with the same corners and the same loading rules.
       Only the box around them differs. */
    const img = document.createElement("img");
    img.className = "project-chapter__img";
    img.src = item.src;
    img.alt = item.alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    // Reserves the height before the bytes land, so the stack does not shift
    // the paragraphs beside it as each page decodes.
    const ratio = item.ratio || spec.ratio;
    if (ratio) img.style.aspectRatio = ratio;

    fig.append(img);
    box.append(fig);
  }

  return box.children.length ? box : null;
}

/* --- The asset explorer ---------------------------------------------------
 * A block of its own rather than a panel wedged beside a paragraph, and that
 * is not a cosmetic choice. This is the one thing on the page the reader
 * DRAGS, and a drag target sharing a row with text is a drag target the
 * pointer keeps leaving by accident. Given its own ground and its own margins,
 * there is room to turn the thing without falling off it.
 *
 * It seals the eye unconditionally. A canvas rendering a model over another
 * canvas rendering an eye is two 3D scenes competing for the same pixels.
 */
function buildShowcase(chapter) {
  const section = document.createElement("section");
  section.className = "project-explorer seals";
  if (chapter.id) section.id = `ch-${chapter.id}`;

  const titleId = chapter.id ? `ch-${chapter.id}-title` : null;
  if (titleId) section.setAttribute("aria-labelledby", titleId);

  const inner = document.createElement("div");
  inner.className = "project-explorer__inner";

  const head = document.createElement("div");
  head.className = "project-explorer__head";

  if (chapter.kicker) {
    const kicker = document.createElement("p");
    kicker.className = "project-chapter__kicker";
    kicker.textContent = chapter.kicker;
    head.append(kicker);
  }

  if (chapter.title) {
    const title = document.createElement("h2");
    title.className = "project-explorer__title";
    if (titleId) title.id = titleId;
    title.textContent = chapter.title;
    head.append(title);
  }

  /* ONLY THE NAME GOES OVER THE MODEL. The head is overlaid on the stage, and
     with the paragraphs in it the block came to 392px and sat across the thing
     it was introducing. A kicker and a title are a label; a paragraph is
     something to read, and reading it over a rotating galleon is neither. */
  inner.append(head);

  /* No wrapper of its own. The viewer draws its own stage and the heading is
     positioned over it, so a box in between was one surface too many and drew
     a second frame around the first. */
  if (chapter.models?.items?.length) inner.append(viewerInto(chapter.models));

  if ((chapter.body || []).length) {
    const note = document.createElement("div");
    note.className = "project-explorer__note";
    chapter.body.forEach((text) => note.append(paragraph(text)));
    inner.append(note);
  }
  section.append(inner);
  return section;
}

/* --- A live scene ---------------------------------------------------------
 * The heaviest block a chapter can be, and the only one that runs a piece of
 * the project rather than describing it. Two columns: the stage on the left,
 * and on the right the text about whatever is currently selected in it.
 *
 * The whole thing is one module away, imported only when a chapter asks for a
 * scene, and that module downloads nothing until the reader presses the
 * button inside it.
 */
function buildScene(chapter) {
  const section = document.createElement("section");
  section.className = "project-scene seals";
  if (chapter.id) section.id = `ch-${chapter.id}`;

  const titleId = chapter.id ? `ch-${chapter.id}-title` : null;
  if (titleId) section.setAttribute("aria-labelledby", titleId);

  const inner = document.createElement("div");
  inner.className = "project-scene__inner";

  // The heading sits above the two columns, at the page's own left edge.
  const head = document.createElement("div");
  head.className = "project-scene__head";

  if (chapter.kicker) {
    const kicker = document.createElement("p");
    kicker.className = "project-chapter__kicker";
    kicker.textContent = chapter.kicker;
    head.append(kicker);
  }

  if (chapter.title) {
    const title = document.createElement("h2");
    title.className = "project-scene__title";
    if (titleId) title.id = titleId;
    title.textContent = chapter.title;
    head.append(title);
  }

  const stage = document.createElement("div");
  stage.className = "project-scene__body";

  import("./project-scene.js?v=289").then((m) => {
    if (!m.sceneWorthOffering()) {
      stage.append(slot({
        kind: "model",
        ratio: "16 / 9",
        what: chapter.scene?.mobileNote || t("model.mobile", "Modelos 3D, no computador"),
        note: chapter.scene?.weightNote || "",
      }));
      return;
    }
    m.initProjectScene(stage, chapter.scene || {});
  });

  inner.append(head, stage);
  section.append(inner);
  return section;
}

/* --- The 3D viewer, wherever it is asked for ------------------------------
 * TWO GATES, and both matter. The module is imported only when a chapter asks
 * for one, and it in turn downloads nothing until the reader presses the
 * button. A case study nobody scrolls to should cost nothing at all.
 */
function viewerInto(models) {
  const box = document.createElement("div");
  box.className = "modelbox";

  import("./project-models.js?v=289").then((m) => {
    if (!m.modelsWorthOffering()) {
      // On a phone this is a megabyte over mobile data for a thing that wants
      // a mouse. The slot says so instead of pretending.
      box.replaceWith(slot({
        kind: "model",
        ratio: "4 / 3",
        what: models.mobileNote || t("model.mobile", "Modelos 3D, no computador"),
        note: models.weightNote || "",
      }));
      return;
    }
    m.initModelViewer(box, models);
  });

  return box;
}

/* --- The numbers ----------------------------------------------------------
 * A grid of measured facts. The cheapest section on the page to write and the
 * one that changes how the rest of it is read: a claim about performance
 * beside a real figure stops being a claim.
 */
export function buildSpecs(project, heading) {
  const specs = project.specs || [];
  if (!specs.length) return null;

  const section = document.createElement("section");
  section.className = "project-specs seals";

  const inner = document.createElement("div");
  inner.className = "project-specs__inner";

  if (heading) {
    const h = document.createElement("h2");
    h.className = "project-specs__title";
    h.textContent = heading;
    inner.append(h);
  }

  const list = document.createElement("dl");
  list.className = "project-specs__grid";

  specs.forEach((spec) => {
    const cell = document.createElement("div");
    cell.className = "project-specs__cell";

    const value = document.createElement("dd");
    value.className = "project-specs__value";
    value.textContent = spec.value;

    const label = document.createElement("dt");
    label.className = "project-specs__label";
    label.textContent = spec.label;

    // Value first visually, label first in the markup: a definition list reads
    // term then description, and the stylesheet reorders what the eye sees.
    cell.append(label, value);
    list.append(cell);
  });

  inner.append(list);
  section.append(inner);
  return section;
}

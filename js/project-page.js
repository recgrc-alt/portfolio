/* ==========================================================================
   PROJECT PAGE  ·  project.html
   --------------------------------------------------------------------------
   One HTML file serves every project. The id arrives in the URL

       project.html?id=the-treasure-within

   and everything below is built from that project's entry in
   data/projects.json. Adding a project never means adding a page.

   THE ORDER IS THE ARGUMENT
   The blocks are built in the sequence a visitor needs them, and that
   sequence is the whole design:

     1  hero      the work itself, before any words about it
     2  header    the title
     3  story     the intro: category and year, what it is, where it came
                  from and the way into the live thing, with the rail of who
                  made it and what with beside all of that
     4  sections  the case study proper: one section per question
                  (the challenge, the concept, the process, the result), or
                  chapters of its own for a project that has earned more
     5  onward    credits, then the next project

   Nothing is decorative: a visitor who bounces after block 1 has still seen
   the work, and a visitor who reaches block 4 is the one worth writing it for.

   MISSING DATA IS A STATE, NOT A CRASH
   A bad id, a project with no video yet, no links, no team, no chapters —
   each of these renders as an honest gap rather than an exception, because
   half this file's content is still being produced.
   ========================================================================== */

import {
  loadProjects, getProject, getCategory, resolveField, nextProject,
} from "./projects.js?v=289";
import { actionButton, echoLabel, safeUrl } from "./project-actions.js?v=289";
import { initReveal } from "./reveal.js?v=289";
import { keepSplit } from "./split-lines.js?v=289";
import { buildChapters, buildSpecs } from "./project-chapters.js?v=289";
import { resetSlots } from "./project-slot.js?v=289";
import { buildTeamRail } from "./project-team.js?v=289";
import { initAmbient } from "./project-ambient.js?v=289";
import { t } from "./i18n.js?v=289";
import { fillMedia } from "./media.js?v=289";
import { initReels } from "./reel-player.js?v=289";
import { setAmbienceSource } from "./ambience.js?v=289";
import { linkSoundToBanner } from "./banner-sound.js?v=289";

/* --- WHAT USED TO BE HERE ------------------------------------------------
 * A table of Simple Icons slugs, a fetch cache, and an async toolIcon() that
 * pulled assets/icons/<slug>.svg for each tool in the stack. All three went
 * with the toolkit list itself, which is now beside the team and draws its
 * marks from tool-icons.js — the same data the work list has always used,
 * held inline rather than fetched. Six requests per project page, gone, and
 * the toolkit is complete on its first frame instead of filling in.
 * ========================================================================= */

/* The URL guard, the hover label and the button they build moved to
   project-actions.js, so project-chapters.js can make the same button from a
   chapter's own link without a second copy of any of it. */


/* --- Head tags that survive a re-render ------------------------------------
 * Everything below writes to <head>, and render() can run more than once: the
 * language toggle rebuilds the whole page in place. So each of these finds the
 * tag first and only creates one if it is genuinely absent. Appending would
 * leave a second description and a second canonical behind after one switch,
 * and a page with two canonicals has none.
 *
 * The origin is written out rather than read from location, because a canonical
 * has to name the address the page should be found at, which is not necessarily
 * the one it is being viewed at: a preview host, a staging domain or a local
 * file would each otherwise declare themselves canonical. */
const SITE_ORIGIN = "https://rogerioedgar.com";

function headTag(selector, make) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = make();
    document.head.appendChild(el);
  }
  return el;
}

/* A meta by name, and the two sharing tags that carry the same sentence. A
   description that is right in one of the three and stale in the others is
   worse than one that is merely generic. */
/* og: tags are addressed by `property`, not by `name`. Two functions rather
   than one with a flag, because the attribute is the whole difference and a
   flag would hide it. */
function setProp(property, content) {
  headTag(`meta[property="${property}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", property);
    return m;
  }).content = content;
}

function setMeta(name, content) {
  headTag(`meta[name="${name}"]`, () => {
    const m = document.createElement("meta");
    m.name = name;
    return m;
  }).content = content;

  /* One sentence, three places. A description that is right in one of them and
     stale in the other two is worse than one that is merely generic. */
  if (name !== "description") return;
  setProp("og:description", content);
  setMeta("twitter:description", content);
}

export async function initProjectPage(root) {
  if (!root) return null;

  const id = new URLSearchParams(location.search).get("id");

  async function render() {
    let data;
    try {
      data = await loadProjects();   // the current language's file
    } catch {
      root.append(notice(t("project.loadError", "The project list could not be loaded.")));
      return null;
    }

    const project = id ? getProject(data, id) : null;
    if (!project) {
      /* A SOFT 404, AND THE ONLY PLACE ON THIS PAGE THAT IS ONE.
         project.html used to carry a blanket noindex in its markup, which hid
         all nineteen case studies. The exclusion belongs here instead: a URL
         naming a project that does not exist is genuinely nothing worth
         indexing, and this is the branch that knows that. */
      headTag('meta[name="robots"]', () => {
        const m = document.createElement("meta");
        m.name = "robots";
        return m;
      }).content = "noindex";

      root.replaceChildren(notice(
        id ? `${t("project.notFound", "No project called")} “${id}”.`
           : t("project.noneRequested", "No project was requested."),
        "work.html", t("project.backToWork", "Back to all work")
      ));
      return null;
    }

    const titulo = `${project.title} · Rogério Edgar`;
    document.title = titulo;
    setProp("og:title", titulo);
    setMeta("twitter:title", titulo);
    setProp("og:url", `${SITE_ORIGIN}/project.html?id=${encodeURIComponent(project.id)}`);

    /* --- The head, per project ------------------------------------------
     * project.html ships one description for all nineteen case studies, which
     * is the right fallback for a crawler that does not run scripts and the
     * wrong thing for every reader who gets this far. The same goes for the
     * canonical: the file's own points at the bare template.
     *
     * UPDATED IN PLACE, NEVER APPENDED. render() runs again on every language
     * change, and appending would leave two of each behind after one switch.
     *
     * A crawler that renders (Google does) sees these. One that does not still
     * sees the file's own generic pair, which is why that pair stays. */
    setMeta("description",
      String(resolveField(project.description) || project.title).slice(0, 155));

    headTag('link[rel="canonical"]', () => {
      const l = document.createElement("link");
      l.rel = "canonical";
      return l;
    }).href = `${SITE_ORIGIN}/project.html?id=${encodeURIComponent(project.id)}`;

    /* A previous render may have marked the page noindex for a bad id. This one
       found a project, so that verdict is out of date. */
    document.head.querySelector('meta[name="robots"]')?.remove();

    /* --- THE PROJECT'S OWN SOUND, IF IT HAS ONE ---------------------------
     * A case study can bring the loop its piece was made with (`ambience` in
     * the data: a file and a level). It takes the place of the site's loop
     * while this page is open, under the same rules as that loop: silent until
     * the visitor turns sound on, quiet, and ducked under any clip that
     * speaks. Asked on every render, so a language switch asks again, and
     * asking for the file already in use changes nothing.
     *
     * It also stays silent over the banner and comes in slowly as the banner
     * scrolls away (banner-sound.js), so the loop is part of reading the page
     * rather than something that starts on top of the picture. */
    if (project.ambience?.src) {
      setAmbienceSource(project.ambience.src, { volume: project.ambience.volume });
      linkSoundToBanner(root);
    }

    /* Numbering starts over for every render, or a language switch would carry
       on counting slots from where the last one stopped. */
    resetSlots();

    /* --- THE SECTIONS FOLLOW THE INTRO DIRECTLY ----------------------------
     * Every project carries its case study as `chapters` in its data: the four
     * sections by default, or a set of its own where a project has earned
     * more (The Treasure Within). They come straight after the intro,
     * because that is the order the page argues in: what the thing is, then
     * the questions about it. The stylesheet relies on that adjacency for the
     * space above the first section (.project-story + .project-chapter).
     *
     * THE REELS MOVED BELOW THEM. They used to sit between the intro and the
     * chapters, which was harmless while only a long process block followed.
     * With the sections there, a strip of social clips would have split the
     * intro from its own first section. They are extra work made from the
     * project, so they come after the case study rather than inside it. For
     * the projects without reels this is a hidden section changing places with
     * nothing visible, the same kind of hidden section craft and credits
     * already leave behind them.
     *
     * The craft block stays after them as a fallback; see buildCraft for when
     * it still has something to say. */
    const pieces = [
      buildHero(project),
      buildHeader(project),
      buildStory(project, data),
      buildChapters(project),
      buildSpecs(project, t("project.numbers", "Em números")),
      buildReels(project),
      buildCraft(project),
      buildCredits(project),
      buildOnward(project, data),
    ].filter(Boolean);

    root.replaceChildren(...pieces);

    /* THE WAY OUT, KEPT IN VIEW.
       A case study is a long page with no navigation of its own, and the only
       route back was the browser's own button or the masthead's Work link.
       This is a plain anchor to the gallery, pinned to the top left and
       carried down the page by position: sticky, so leaving is never further
       than the corner of the screen.

       It goes back to work.html rather than calling history.back(): a reader
       who arrived here from a search engine has no history to go back to, and
       an arrow that does nothing is worse than no arrow. */
    const back = document.createElement("a");
    back.className = "project-back text-echo";
    back.href = "work.html";
    back.dataset.text = t("nav.goBack", "Voltar");
    back.textContent = t("nav.goBack", "Voltar");
    root.prepend(back);

    /* EVERY SECTION REVEALS.
       The reveal used to be written onto mockup figures alone — and eleven of
       the nineteen projects have no mockups at all, so on those pages the
       hero, the story, the craft, the credits and the onward link all arrived
       at once and nothing on the page ever moved. That is the whole of why a
       project reads as flat next to the gallery that led to it.

       The HERO is deliberately excluded. It is above the fold on arrival, and
       fading in something the reader is already looking at is not a reveal,
       it is a flicker.

       Marked here rather than in each builder: it is one decision about how
       this page arrives, and it belongs in one place. */
    /* THE REVEAL GOES ON THE CONTENT, NOT ON A SEALED SECTION.
       [data-reveal] rests at opacity 0, and opacity multiplies EVERYTHING the
       element paints, its own background included. A section whose whole job
       is to lay opaque ground over the fixed 3D eye therefore had no ground at
       all for the entire length of its reveal: measured, a sealed chapter sat
       at opacity 0 with the eye showing straight through the black it was
       supposed to be covering.

       So anything that seals hands the reveal to its inner box. The ground
       stays put and opaque; the words and the picture on top of it are what
       arrive. Everything else is unchanged. */
    /* --- AND THE CHAPTERS ARRIVE IN PARTS ---------------------------------
     * Every section used to get exactly one [data-reveal], which meant a
     * chapter was a single object: its kicker, its heading, its paragraphs and
     * its picture all crossed from nothing to fully there on the same 800ms,
     * together. At the size these blocks are, that is a slab sliding in — you
     * see a rectangle move, not writing arriving.
     *
     * So a chapter hands the reveal to its pieces instead. The stylesheet
     * already staggers revealed SIBLINGS by 90ms each (see [data-reveal]
     * :nth-child in style.css), so marking the children is all that is needed
     * to get the cascade — no new rule, no index to thread through, nothing
     * per-chapter to maintain. The kicker leads, the title follows it, the
     * text follows that, and the picture comes in on its own beat because it
     * is a child of a different parent and counts from one again.
     *
     * The section itself deliberately keeps NO reveal. Chapters lay opaque
     * ground over the fixed eye, and [data-reveal] rests at opacity 0 — an
     * opacity that multiplies the background as surely as the words. Handing
     * it to the contents is the same rule the sealed sections below already
     * follow, applied one level deeper. */
    /* ONE BOX IS DELIBERATELY OFF THIS LIST: the depth chapter's media.
       Its child is position: sticky, and a transformed ancestor becomes the
       containing block for a sticky descendant. The stage would then stick
       inside a box that does not scroll, which is to say it would not stick at
       all - measured, it slid straight past the window at every scroll step.
       [data-reveal] rests at transform: translateY(2rem), so simply being on
       this list was enough to break it.

       Nothing loses its entrance: the clip INSIDE the stage is marked instead,
       which is the part a reader was watching arrive anyway. */
    const PARTS = ".project-chapter__copy > *, " +
                  ".project-chapter__media:not(.project-chapter__media--depth), " +
                  ".project-chapter__depth, " +
                  ".project-chapter__head > *, .project-chapter__text";

    /* .project-stage-section belongs on this list and was missing from it.
       It is a chapter in every way that matters to a reader — a heading, a
       strapline, a thing to look at — and leaving it off meant its heading was
       the one on the page with no entrance at all. */
    root.querySelectorAll(
      ".project-head, .project-story, .project-chapter, .project-explorer, " +
      ".project-stage-section, " +
      ".project-specs, .project-craft, .project-credits, .project-onward"
    ).forEach((section) => {
      if (section.classList.contains("project-chapter")) {
        const parts = section.querySelectorAll(PARTS);
        // Only if there is something to hand it to. A chapter built as a bare
        // media block has no copy, and marking nothing would leave it with no
        // entrance at all rather than a coarse one.
        if (parts.length) {
          parts.forEach((part) => { part.dataset.reveal = ""; });

          /* --- AND EACH COLUMN ARRIVES ON ONE CLOCK -----------------------
           * Marking the parts gives the cascade. Watching the parts is what
           * ruined it: a chapter's paragraphs are spread down 800px, so each
           * crossed the line on its own and then sat out a stagger delay
           * meant for a set arriving together. The lower the paragraph, the
           * later it seemed to appear, for no reason a reader could see.
           *
           * The column is the group, so the column is what is watched. The
           * parts are unchanged and the cascade is unchanged; what changes is
           * that there is now ONE crossing instead of four. See reveal.js.
           *
           * The media stays on its own: it is a child of a different parent
           * and is usually a long way from the words, so it genuinely does
           * arrive as its own event. */
          section.querySelectorAll(
            ".project-chapter__copy, .project-chapter__head"
          ).forEach((col) => { col.dataset.revealGroup = ""; });
          return;
        }
      }

      /* THE 3D CHAPTER IS MARKED BY ITS PARTS, LIKE A WRITTEN ONE.
         Handing the reveal to a sealed section's inner box works everywhere
         else, but here that box also holds a WebGL canvas and a reading panel,
         and fading the whole thing in as one slab both looks wrong and starts
         an entrance on top of a scene that is still loading. Its head is the
         group, exactly as a chapter's column is. */
      if (section.classList.contains("project-stage-section")) {
        const head = section.querySelector(".project-stage-section__head");
        if (head) {
          head.querySelectorAll(":scope > *").forEach((part) => {
            part.dataset.reveal = "";
          });
          head.dataset.revealGroup = "";
          return;
        }
      }

      const target = section.classList.contains("seals")
        ? section.firstElementChild || section
        : section;
      target.dataset.reveal = "";
    });

    // Built just now, so the observer has to be handed all of it — main.js
    // scanned the DOM before any of this existed.
    initReveal(root);

    /* --- The headings, broken into their own lines ----------------------
     * After initReveal and not before it: splitting rewrites the inside of a
     * heading, and the observer only ever looks at the heading itself, so the
     * order does not matter to it — but the split reads layout, and doing it
     * once the page is otherwise wired means one reflow rather than one per
     * heading interleaved with everything else.
     *
     * keepSplit re-splits whenever a heading changes width, which is what
     * makes this survive a resize: the lines a heading breaks into at 1900px
     * are not the lines it breaks into at 1200. */
     keepSplit(root, ".project-chapter__title-inner");

    /* The hero's colours, spilled down into the page. Wired after the render
       because fillMedia decides which element the hero ends up holding. */
    initAmbient(root.querySelector(".project-hero"));

    // The reels play/pause and gain sound on scroll; wire their player to the
    // clips this render just injected.
    initReels(root);
    return { project, data };
  }

  const result = await render();

  // Switching language reloads the matching project file and rebuilds. i18n.js
  // has already set <html lang> by the time this fires, so loadProjects() reads
  // the new language on its own.
  document.addEventListener("languagechange", render);

  return result;
}

/* --- A dead end that still offers a way out ------------------------------ */
function notice(message, href, label) {
  const wrap = document.createElement("section");
  wrap.className = "project__notice";
  const p = document.createElement("p");
  p.textContent = message;
  wrap.append(p);
  if (href) {
    const a = document.createElement("a");
    a.className = "btn";
    a.href = href;
    a.textContent = label;
    wrap.append(a);
  }
  return wrap;
}

/* --- 1 · Hero ------------------------------------------------------------
 * Edge to edge. The work is the first thing and the only thing: no title over
 * it, no gradient, nothing competing.
 *
 * Priority: a LIVE embed, then the media cascade (video → slideshow → still →
 * empty). The embed is the point of Modular City — the generative city runs in
 * an iframe and the visitor drives it, instead of watching a clip of it; so it
 * sits above the cascade rather than inside it. Everything else is handed to
 * fillMedia, the one place that resolves media and its fallbacks (see
 * media.js), shared with the gallery cards. */
function buildHero(project) {
  const hero = document.createElement("section");
  hero.className = "project-hero";

  if (project.heroEmbed) {
    hero.classList.add("project-hero--embed");
    const frame = document.createElement("iframe");
    frame.className = "project-hero__embed";
    frame.src = safeUrl(project.heroEmbed) ?? "about:blank";
    frame.title = `${project.title} · ${t("project.live", "live")}`;
    frame.loading = "lazy";
    // Let the embedded sketch capture the pointer/keyboard, but keep it
    // sandboxed: it may run its own scripts, nothing more.
    frame.setAttribute("allow", "fullscreen; autoplay");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-pointer-lock");
    hero.append(frame);

    // A free host can cold-start, leaving the frame blank for a few seconds.
    // A quiet hint sits behind the iframe so the gap does not read as broken.
    const wait = document.createElement("p");
    wait.className = "project-hero__waking";
    wait.textContent = t("project.waking", "Waking the live scene…");
    hero.append(wait);
    return hero;
  }

  fillMedia(hero, project, {
    videoClass: "project-hero__video",
    stillClass: "project-hero__still",
  });
  return hero;
}

/* Instagram's glyph, inlined so it follows the button's text colour (an <img>
   couldn't). One constant, drawn into a 24×24 <svg> by igIcon(). */
const IG_ICON_PATH = "M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.309.975.975 1.247 2.242 1.309 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.309 3.608-.975.975-2.242 1.247-3.608 1.309-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.309-.975-.975-1.247-2.242-1.309-3.608-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.334-2.633 1.309-3.608.975-.975 2.242-1.247 3.608-1.309 1.266-.058 1.646-.07 4.85-.07M12 0C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038 1.341 1.341 3.183 1.857 5.038 1.942C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038.058-1.28.072-1.689.072-4.948s-.014-3.668-.072-4.948c-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z";

function igIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "reel-row__ig");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", IG_ICON_PATH);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

/* --- Reels ---------------------------------------------------------------
 * An identity project can own a set of companion motion pieces — the vertical
 * Instagram reels made for social — rather than each being a separate portfolio
 * entry. They live inside the parent project: an intro, then one row per reel,
 * read top to bottom in chronological order. The rows alternate sides — clip
 * left, then right, then left — each with the concept beside it and a small
 * Instagram link. reel-player.js plays each clip as it scrolls into view.
 *
 * Present only when the project declares `reels` with at least one item. Each
 * clip runs through the same fillMedia cascade (video → poster → empty). */
function buildReels(project) {
  const reels = project.reels;
  const items = reels && Array.isArray(reels.items) ? reels.items.filter((it) => it && it.video) : [];

  const section = document.createElement("section");
  section.className = "project-reels";
  if (!items.length) { section.hidden = true; return section; }

  const inner = document.createElement("div");
  inner.className = "project-reels__inner";

  // The intro: a small heading and the idea behind the reels.
  const heading = resolveField(reels.heading);
  if (heading) {
    const h = document.createElement("h2");
    h.className = "project-reels__label";
    h.textContent = heading;
    inner.append(h);
  }
  const body = resolveField(reels.text);
  if (body) {
    const p = document.createElement("p");
    p.className = "project-reels__body";
    p.textContent = body;
    inner.append(p);
  }

  const linkLabel = resolveField(reels.linkLabel) || "Watch on Instagram";

  const list = document.createElement("ol");
  list.className = "reel-list";

  items.forEach((item, i) => {
    const row = document.createElement("li");
    row.className = "reel-row";
    if (i % 2 === 1) row.classList.add("is-right");   // clip on the right on odd rows

    // The clip — always 9:16, played on scroll by reel-player.js (its own
    // marker, so cam-feeds does not also grab it).
    const media = document.createElement("div");
    media.className = "reel-row__media";
    fillMedia(media, { heroVideo: item.video, poster: item.poster }, {
      videoClass: "reel-row__video",
      stillClass: "reel-row__still",
      videoAttr: "reelVideo",
      lazyVideo: false,           // metadata now, so it can start the moment it is seen
    });

    // The words beside it: an optional highlight note, the concept, the link.
    const text = document.createElement("div");
    text.className = "reel-row__text";

    const note = resolveField(item.note);
    if (note) {
      const badge = document.createElement("p");
      badge.className = "reel-row__note";
      badge.textContent = note;
      text.append(badge);
    }

    const concept = resolveField(item.concept);
    if (concept) {
      const p = document.createElement("p");
      p.className = "reel-row__concept";
      p.textContent = concept;
      text.append(p);
    }

    if (item.link) {
      const a = document.createElement("a");
      a.className = "btn reel-row__link";
      a.href = safeUrl(item.link) ?? "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.append(igIcon(), echoLabel(linkLabel));
      text.append(a);
    }

    row.append(media, text);
    list.append(row);
  });

  inner.append(list);
  section.append(inner);
  return section;
}

/* --- 2 · The title, and only the title -----------------------------------
 * CATEGORY and YEAR used to live here, under the heading. They have moved into
 * the section below, and the reason is alignment.
 *
 * They were in one <section> and the team rail was in the next one, so no
 * amount of styling could ever have brought them level: two sections stacked
 * in normal flow cannot share a top edge. The rail therefore started wherever
 * the introduction happened to start, which was a long way under YEAR, and the
 * gap between the two blocks read as a mistake because it was one.
 *
 * Moving the pair down puts every piece of opening metadata in the same grid:
 * the labelled facts and the prose in the left column, the credits and the
 * toolkit in the right one, both columns beginning at the same line. */
function buildHeader(project) {
  const header = document.createElement("header");
  header.className = "project-head";

  const inner = document.createElement("div");
  inner.className = "project-head__inner";

  const title = document.createElement("h1");
  title.className = "project-head__title";
  title.textContent = project.title;

  inner.append(title);
  header.append(inner);
  return header;
}

/* The labelled facts: CATEGORY and YEAR, small label over large value. Built
   here rather than inline so the pair stays one thing with one name, wherever
   it is placed — it has already moved once. */
function buildMeta(project, data) {
  const category = getCategory(data, project.category);

  const pairs = [
    [t("project.category", "Category"), category ? resolveField(category.label) : project.category],
    [t("project.year", "Year"), project.year],
  ];

  const meta = document.createElement("div");
  meta.className = "project-head__meta";

  for (const [label, value] of pairs) {
    if (!value) continue;
    const cell = document.createElement("div");
    cell.className = "project-head__cell";
    const l = document.createElement("span");
    l.className = "project-head__label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "project-head__big";     // large, the headline metadata
    v.textContent = value;
    cell.append(l, v);
    meta.append(cell);
  }

  return meta.children.length ? meta : null;
}

/* --- 3 · The intro: what it is, beside who made it and what with ----------
 * Two columns from 64rem up, and they are always the same two. The words take
 * the wide track: the category and the year, the introduction, the provenance
 * line, and under them the way into the live project. The rail takes the
 * narrow one, and the two start on the same line because both open with a
 * small-caps label.
 *
 * THE RENDERS LEFT THIS SECTION, AND THAT IS THE FIX, NOT A LOSS.
 * Mockups used to be stacked into the second column as well, which made that
 * column mean two different things. On the seven projects that had both, the
 * grid took the ratio meant for a picture: the prose squeezed into the narrow
 * track, the rail stranded in the wide one halfway across the screen, and the
 * picture pushed down into a second row under the words. A project's images
 * now belong to the section they illustrate, as that section's
 * media. The mockups stay in the data, untouched, until they are placed there.
 *
 * A project with no rail at all keeps a single column; `has-rail` is the one
 * switch. */
function buildStory(project, data) {
  const section = document.createElement("section");
  section.className = "project-story";

  const inner = document.createElement("div");
  inner.className = "project-story__inner";

  // The words live in their own column so the rail can take the other.
  const copy = document.createElement("div");
  copy.className = "project-story__copy";

  /* FIRST IN THE COLUMN, so it is the line the rail beside it starts on. */
  const meta = buildMeta(project, data);
  if (meta) copy.append(meta);

  // The quick intro — what the project is, as it reads in the portfolio.
  const description = resolveField(project.description);
  if (description) {
    const p = document.createElement("p");
    p.className = "project-story__text";
    p.textContent = description;
    copy.append(p);
  }

  // Then the provenance — that it was an academic or client brief. Quieter
  // than the intro, so it reads as background rather than headline.
  const context = resolveField(project.contextText);
  if (context) {
    const p = document.createElement("p");
    p.className = "project-story__context";
    p.textContent = context;
    copy.append(p);
  }

  /* THE WAY IN, LAST IN THE COLUMN. Right under the words a reader uses to
     decide whether to open the live project, which is where that decision is
     made. It used to wait below the whole case study, in the craft block. */
  const launch = buildLaunch(project);
  if (launch) copy.append(launch);

  inner.append(copy);

  /* --- THE RAIL: who made it, and what with -----------------------------
   * It builds itself or returns null, so a project with neither a team nor a
   * stack simply keeps the single-column measure. When there is one, the
   * section becomes two columns and the two share a top edge. */
  const rail = buildTeamRail(project);
  if (rail) {
    inner.classList.add("has-rail");
    inner.append(rail);
  }

  section.append(inner);
  return section;
}

/* --- The way into the live project ---------------------------------------
 * The project's FIRST link, as the page's one primary button. Built here and
 * only here, so it cannot turn up twice: buildOnward skips links[0] for exactly
 * this reason and shows only the secondary ones. A project with no links
 * builds nothing and leaves no gap behind. */
function buildLaunch(project) {
  const primary = (project.links || [])[0];
  if (!primary) return null;

  return actionButton(
    { label: resolveField(primary.label), url: primary.url },
    { className: "project-story__launch" }
  );
}

/* --- 4 · The long process text, as a fallback -----------------------------
 * This block used to be where every case study told its story: the stack,
 * then the way in, then the long `body` under "The process". The stack moved
 * up beside the team and the way in moved up under the intro, so what is left
 * here is the writing alone.
 *
 * IT STANDS DOWN WHEREVER A PROJECT HAS ITS OWN PROCESS SECTION. The four
 * sections include one with the id `process`, and a second "The process"
 * underneath it would say the same thing twice. So a project carrying that
 * section builds nothing here, and its `body` stays in the data as the source
 * those sections are rewritten from.
 *
 * A project whose chapters are its own keeps its process writing here, in the
 * same place it always had: The Treasure Within has no section called
 * `process`, and there this block holds writing that appears nowhere else on
 * the page. A project with no chapters at all still gets its process text
 * here rather than nothing. */
function buildCraft(project) {
  if ((project.chapters || []).some((chapter) => chapter.id === "process")) {
    return null;
  }

  const approach = resolveField(project.approach);
  const highlights = project.highlights || [];
  // The long process text, if written. An array of paragraphs, one per <p>.
  const body = resolveField(project.body);
  const bodyParas = Array.isArray(body) ? body.filter(Boolean) : (body ? [body] : []);

  const section = document.createElement("section");
  section.className = "project-craft";
  if (!approach && !highlights.length && !bodyParas.length) {
    section.hidden = true;                // nothing to say yet — say nothing
    return section;
  }

  const inner = document.createElement("div");
  inner.className = "project-craft__inner";

  // No second guard: the early return above already guarantees there is
  // something to write in this column.
  const col = document.createElement("div");
  col.className = "project-craft__col project-craft__col--wide";
  const h = document.createElement("h2");
  h.className = "project-craft__label";
  h.textContent = t("project.process", "The process");
  col.append(h);

  if (bodyParas.length) {
    // The full written account — the long read the visitor came for. Each
    // entry is its own paragraph. When this exists it supersedes the short
    // approach line and the bullet summary.
    for (const text of bodyParas) {
      const p = document.createElement("p");
      p.className = "project-craft__body";
      p.textContent = text;
      col.append(p);
    }
  } else {
    // Fallback for projects that don't have the long text yet: the one-line
    // framing plus the bullet highlights.
    if (approach) {
      const p = document.createElement("p");
      p.className = "project-craft__text";
      p.textContent = approach;
      col.append(p);
    }
    if (highlights.length) {
      const list = document.createElement("ul");
      list.className = "project-craft__list";
      for (const point of highlights) {
        const li = document.createElement("li");
        li.className = "project-craft__point";
        li.textContent = point;
        list.append(li);
      }
      col.append(list);
    }
  }
  inner.append(col);

  section.append(inner);
  return section;
}

/* A label wearing the same difference-echo the nav uses: a displaced ghost of
   the word that resolves on hover. This is the site's hover language — the
   green fill that used to sit on these buttons was a second accent that did
   not belong. CSS drives it from --echo-opacity / --echo-shift. */


/* --- Credits -------------------------------------------------------------
 * Collaborators used to sit in the header. They belong at the END: the work
 * comes first, and who you did it with is the note you leave on the way out.
 * A solo project simply has nothing here. */
function buildCredits(project) {
  const partners = resolveField(project.partners);
  const section = document.createElement("section");
  section.className = "project-credits";
  if (!partners) { section.hidden = true; return section; }

  const inner = document.createElement("div");
  inner.className = "project-credits__inner";

  const label = document.createElement("h2");
  label.className = "project-credits__label";
  label.textContent = t("project.collaboration", "In collaboration with");

  const names = document.createElement("p");
  names.className = "project-credits__names";
  names.textContent = partners;

  inner.append(label, names);
  section.append(inner);
  return section;
}

/* --- 5 · Onward ----------------------------------------------------------
 * The live project if there is one, and always a next project — the last
 * entry wraps to the first, so this is never a dead end. */
function buildOnward(project, data) {
  const section = document.createElement("section");
  section.className = "project-onward";

  const inner = document.createElement("div");
  inner.className = "project-onward__inner";

  /* Any SECONDARY links, each a labelled button — the URL itself is never
     shown. The primary link is the launch button up in the intro (see
     buildLaunch), so it is skipped here; what remains is the extras a project
     may carry (Abrigo has a usability-test site and a Figma prototype), any
     with a small note. */
  const links = (project.links || []).slice(1);
  if (links.length) {
    const group = document.createElement("div");
    group.className = "project-links";

    links.forEach((link) => {
      const a = document.createElement("a");
      a.className = "btn";
      a.href = safeUrl(link.url) ?? "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.append(echoLabel(`${resolveField(link.label)} ↗`));

      const note = resolveField(link.note);
      if (note) {
        const badge = document.createElement("span");
        badge.className = "btn__note";
        badge.textContent = note;
        a.append(badge);
      }
      group.append(a);
    });
    inner.append(group);
  }

  const next = nextProject(data, project.id);
  if (next) {
    const link = document.createElement("a");
    link.className = "btn btn--next";
    link.href = `project.html?id=${encodeURIComponent(next.id)}`;

    const label = document.createElement("span");
    label.className = "btn__label";
    label.textContent = t("project.next", "[ NEXT PROJECT → ]");

    const name = document.createElement("span");
    name.className = "btn__name";
    name.textContent = next.title;

    link.append(label, name);
    inner.append(link);
  }

  section.append(inner);
  return section;
}

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
     2  header    what it is, when, and who did what
     3  story     the idea, then the images that show it
     4  craft     the stack and what was hard — the part other designers read
     5  onward    open the live thing, or go to the next project

   Nothing is decorative: a visitor who bounces after block 1 has still seen
   the work, and a visitor who reaches block 4 is the one worth writing it for.

   MISSING DATA IS A STATE, NOT A CRASH
   A bad id, a project with no video yet, an empty mockup array — each of
   these renders as an honest gap rather than an exception, because half this
   file's content is still being produced.
   ========================================================================== */

import {
  loadProjects, getProject, getCategory, resolveField, nextProject,
} from "./projects.js?v=70";
import { initReveal } from "./reveal.js?v=70";
import { t } from "./i18n.js?v=70";
import { fillMedia } from "./media.js?v=70";
import { initReels } from "./reel-player.js?v=70";

/* Tool → icon file. A tool with an entry here renders its logo beside the
   name; anything else renders the name alone. The same map is what a future
   "filter by tool" feature would read, so it lives in one place. Adobe's
   marks were pulled from Simple Icons at Adobe's request, so Photoshop /
   Illustrator / After Effects / Premiere stay as text on purpose. */
const TOOL_ICONS = {
  "three.js": "threedotjs",
  "webgl": "webgl",
  "javascript": "javascript",
  "html": "html5",
  "css": "css",
  "php": "php",
  "mysql": "mysql",
  "blender": "blender",
  "figma": "figma",
  "processing": "processingfoundation",
  "opencv": "opencv",
};

// Cache each icon's inner SVG once fetched, so a tool used on ten projects is
// one request, not ten.
const iconCache = new Map();

/* --- Only ever navigate somewhere ----------------------------------------
 * Every href on this page is built from the project JSON, which is authored
 * rather than submitted — so this is not defending against a visitor. It is
 * defending against a slip: `javascript:` and `data:` are valid in an href and
 * both RUN, so one careless paste into a links array would be a script running
 * on the site with nothing to warn anybody. An allow-list of schemes means the
 * worst a bad value can do is fail to navigate.
 *
 * Relative paths are kept as they are — they have no scheme to abuse. */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

function safeUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    // A base is required so a relative path parses at all; if the string
    // carries its own scheme, the base is ignored.
    const parsed = new URL(url, location.href);
    return SAFE_SCHEMES.has(parsed.protocol) ? url : null;
  } catch {
    return null;   // not a URL at all
  }
}

async function toolIcon(name) {
  const slug = TOOL_ICONS[name.toLowerCase()];
  if (!slug) return null;
  if (iconCache.has(slug)) return iconCache.get(slug);
  const promise = fetch(`assets/icons/${slug}.svg`)
    .then((r) => (r.ok ? r.text() : null))
    .then((svg) => (svg ? svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? null : null))
    .catch(() => null);
  iconCache.set(slug, promise);
  return promise;
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
      root.replaceChildren(notice(
        id ? `${t("project.notFound", "No project called")} “${id}”.`
           : t("project.noneRequested", "No project was requested."),
        "work.html", t("project.backToWork", "Back to all work")
      ));
      return null;
    }

    document.title = `${project.title} · Rogério Edgar`;

    root.replaceChildren(
      buildHero(project),
      buildHeader(project, data),
      buildStory(project),
      buildReels(project),
      buildCraft(project),
      buildCredits(project),
      buildOnward(project, data)
    );

    // The mockup figures carry [data-reveal] and were built just now, so they
    // have to be handed to the observer — main.js scanned the DOM before any of
    // this existed.
    initReveal(root);

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

/* --- 2 · Metadata header -------------------------------------------------
 * The title, then only the two things worth reading at a glance: the
 * discipline and the year, both large. Role moved out (it was noise), context
 * became a paragraph in the story, and collaborators went to the very end —
 * the header is now a headline, not a spec sheet. */
function buildHeader(project, data) {
  const header = document.createElement("header");
  header.className = "project-head";

  const inner = document.createElement("div");
  inner.className = "project-head__inner";

  const title = document.createElement("h1");
  title.className = "project-head__title";
  title.textContent = project.title;

  const category = getCategory(data, project.category);
  const meta = document.createElement("div");
  meta.className = "project-head__meta";

  const pairs = [
    [t("project.category", "Category"), category ? resolveField(category.label) : project.category],
    [t("project.year", "Year"), project.year],
  ];
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

  inner.append(title, meta);
  header.append(inner);
  return header;
}

/* --- 3 · The idea, beside the work ---------------------------------------
 * The text sits at a readable measure on one side; the renders sit LARGE on
 * the other, floating straight on the page.
 *
 * WHY THEY FLOAT RATHER THAN SIT IN FRAMES
 * These are cut out with no background on purpose — the 3D models, the
 * illustration sets, the character sheets. Putting them in a bordered, filled
 * card would paint a box back in behind the transparency and throw away the
 * whole reason for the export. So the figures carry no fill and no radius:
 * the page's black IS the background, and the subject reads as if it were
 * sitting on the page rather than in a slot.
 *
 * With no mockups the section is simply the text at full measure, so a project
 * that has none loses nothing. */
function buildStory(project) {
  const section = document.createElement("section");
  section.className = "project-story";

  const inner = document.createElement("div");
  inner.className = "project-story__inner";

  // The words live in their own column so the renders can take the other.
  const copy = document.createElement("div");
  copy.className = "project-story__copy";

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
  inner.append(copy);

  const mockups = project.mockups || [];
  if (mockups.length) {
    inner.classList.add("has-showcase");     // switches the section to 2 columns
    // More than one render stacks down the column; `side: "left"` puts them
    // before the text instead of after it, so consecutive projects can
    // alternate rather than marching down the same side.
    if (project.showcaseSide === "left") inner.classList.add("is-left");

    const stack = document.createElement("div");
    stack.className = "project-showcase";

    for (const shot of mockups) {
      const figure = document.createElement("figure");
      figure.className = "project-showcase__item";
      figure.dataset.reveal = "";
      /* How big this one wants to be. The data has carried `span` since the
         first project was written and nothing ever read it, so a render and a
         logotype were both being blown up to the full column — which is right
         for a voxel galleon and wrong for a mark, where filling the width
         turns identity work into a billboard. */
      figure.dataset.span = shot.span || "full";

      const img = document.createElement("img");
      img.className = "project-showcase__img";
      img.src = shot.src;
      img.alt = shot.alt || "";
      img.loading = "lazy";
      img.decoding = "async";

      figure.append(img);
      if (shot.caption) {
        const cap = document.createElement("figcaption");
        cap.className = "project-showcase__caption";
        cap.textContent = shot.caption;
        figure.append(cap);
      }
      stack.append(figure);
    }
    inner.append(stack);
  }

  section.append(inner);
  return section;
}

/* --- 4 · The craft -------------------------------------------------------
 * The stack on one side; the technical deep-dive on the other — a one-line
 * framing (`approach`) followed by the bullet points (`highlights`). This is
 * the block another designer or a studio actually reads. */
function buildCraft(project) {
  const stack = project.techStack || [];
  const approach = resolveField(project.approach);
  const highlights = project.highlights || [];
  // The long process text, if written. An array of paragraphs, one per <p>.
  const body = resolveField(project.body);
  const bodyParas = Array.isArray(body) ? body.filter(Boolean) : (body ? [body] : []);
  // The primary live link now lives here, right under the toolkit — one clear
  // way in, not a floating button that repeats itself down the page.
  const primary = (project.links || [])[0];

  const section = document.createElement("section");
  section.className = "project-craft";
  if (!stack.length && !approach && !highlights.length && !bodyParas.length && !primary) {
    section.hidden = true;                // nothing to say yet — say nothing
    return section;
  }

  const inner = document.createElement("div");
  inner.className = "project-craft__inner";

  // The left column holds the toolkit and, beneath it, the way in. It exists
  // whenever there is a stack OR a link to show, so the launch button always
  // has a home even on a project with no listed tools.
  if (stack.length || primary) {
    const col = document.createElement("div");
    col.className = "project-craft__col";

    if (stack.length) {
      const h = document.createElement("h2");
      h.className = "project-craft__label";
      h.textContent = t("project.builtWith", "Built with");
      const list = document.createElement("ul");
      list.className = "tech-stack";
      for (const tool of stack) {
        const li = document.createElement("li");
        li.className = "tech-stack__item";

        const name = document.createElement("span");
        name.textContent = tool;
        li.append(name);

        // The icon is fetched and inlined asynchronously; the pill shows the
        // name immediately and gains the logo when it arrives, so a slow or
        // missing icon never blocks or breaks the list.
        toolIcon(tool).then((inner) => {
          if (!inner) return;
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 24 24");
          svg.setAttribute("aria-hidden", "true");
          svg.setAttribute("class", "tech-stack__icon");
          svg.innerHTML = inner;
          li.prepend(svg);
          li.classList.add("has-icon");
        });

        list.append(li);
      }
      col.append(h, list);
    }

    // The way in: the primary link as a prominent button, sitting under the
    // toolkit. Any other links stay in the onward block at the very end.
    if (primary) {
      const a = document.createElement("a");
      a.className = "btn btn--primary project-craft__launch";
      a.href = safeUrl(primary.url) ?? "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.append(echoLabel(`${resolveField(primary.label)} ↗`));
      col.append(a);
    }

    inner.append(col);
  }

  if (bodyParas.length || approach || highlights.length) {
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
  }

  section.append(inner);
  return section;
}

/* A label wearing the same difference-echo the nav uses: a displaced ghost of
   the word that resolves on hover. This is the site's hover language — the
   green fill that used to sit on these buttons was a second accent that did
   not belong. CSS drives it from --echo-opacity / --echo-shift. */
function echoLabel(text) {
  const span = document.createElement("span");
  span.className = "text-echo";
  span.dataset.text = text;
  span.textContent = text;
  return span;
}

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
     shown. The primary link is the launch button up in the craft block, so it
     is skipped here; what remains is the extras a project may carry (Abrigo has
     a usability-test site and a Figma prototype), any with a small note. */
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

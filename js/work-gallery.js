/* ==========================================================================
   WORK GALLERY  ·  work.html
   --------------------------------------------------------------------------
   Builds the deck from data/projects.json: one PANEL per category, stacked in
   the same place, with the cards of that category inside it. Nothing here is
   written in the HTML — work.html ships an empty <div> and this fills it, so
   adding a project is an entry in the JSON and nothing else.

   WHY PANELS AND NOT SECTIONS
   The page does not scroll past four category sections. A black panel rises
   over the hero, pins to the screen, and the CATEGORY INSIDE IT changes as the
   scroll continues — so the four are siblings occupying one frame, and only
   one is ever the current one. work-page.js decides which; this file only
   builds them and marks the first as current so the page is never blank.

   THE CARDS ARE CLEAN
   Footage and a name. The card's job is to make you want to open the project;
   the project page is where the detail lives.

   WHY THE VIDEOS HAVE NO autoplay ATTRIBUTE
   The attribute is honoured eagerly, so every video would begin downloading
   the moment the document parsed, whether or not it is anywhere near the
   screen. cam-feeds.js starts them from an IntersectionObserver instead.
   ========================================================================== */

import { loadProjects, resolveField, groupByCategory } from "./projects.js?v=289";
import { initCamFeeds } from "./cam-feeds.js?v=289";
import { fillMedia } from "./media.js?v=289";
import { t } from "./i18n.js?v=289";

export async function initWorkGallery(root) {
  if (!root) return null;

  async function render() {
    let data;
    try {
      data = await loadProjects();   // the current language's file
    } catch {
      const msg = document.createElement("p");
      msg.className = "gallery__empty";
      msg.textContent = t("project.loadError", "The project list could not be loaded.");
      root.replaceChildren(msg);
      return null;
    }

    const groups = groupByCategory(data);

    /* The stage is the thing that pins. Every panel lives inside it, stacked,
       and the deck's own height is what gives the scroll somewhere to go while
       the stage stays put. */
    const stage = document.createElement("div");
    stage.className = "work-deck__stage";
    stage.append(...groups.map(buildPanel));

    root.replaceChildren(stage);

    // Marked here rather than left to the scroll handler, so the first
    // category is already on screen at the moment the panel arrives.
    stage.querySelector(".work-deck__panel")?.classList.add("is-current");

    initCamFeeds(root);   // starts each video when it nears the viewport
    return { data, groups, stage };
  }

  const result = await render();

  /* The gallery text lives in the project files, not in the i18n dictionary,
     so switching language must reload the matching file and rebuild. By the
     time this event fires, i18n.js has already set <html lang>, so
     loadProjects() picks up the new language on its own. */
  document.addEventListener("languagechange", async () => {
    await render();
    // The panels are new objects; whatever is driving them has to be told.
    document.dispatchEvent(new CustomEvent("workdeck:rebuilt"));
  });

  return result;
}

/* --- One category, as a panel ------------------------------------------- */
function buildPanel({ category, items }) {
  const panel = document.createElement("section");
  panel.className = "work-deck__panel";
  panel.id = `cat-${category.id}`;
  panel.dataset.category = category.id;

  const head = document.createElement("header");
  head.className = "work-deck__head";

  /* The heading speaks the site's own hover language: a displaced copy of
     itself, blended, that resolves into one clean word. .text-echo is the
     shared implementation of exactly that — the ghost is drawn from data-text,
     and two variables say how far it sits and how present it is. Here the
     trigger is not a pointer but arrival: displaced while the panel is still
     climbing, resolved once it lands. See pages.css. */
  const title = document.createElement("h2");
  title.className = "work-deck__title text-echo";
  const label = resolveField(category.label);
  title.textContent = label;
  title.dataset.text = label;

  head.append(title);

  const grid = document.createElement("ul");
  grid.className = "work-deck__grid";
  grid.append(...items.map((project, i) => buildCard(project, i)));

  /* The window the grid travels behind. The grid itself is moved by a
     transform, and without something clipping it the rows would spill over the
     pinned title on their way up. */
  const viewport = document.createElement("div");
  viewport.className = "work-deck__viewport";
  viewport.append(grid);

  panel.append(head, viewport);
  return panel;
}

/* --- One project card ---------------------------------------------------- */
function buildCard(project, index = 0) {
  const item = document.createElement("li");
  item.className = "work-card";

  /* WHICH COLUMN, not which card. The reveal used to be staggered by position
     in the whole category, which made sense when every card uncovered at once
     — but they no longer do: each one reveals as it comes into view, so the
     fifth card is no longer the fifth thing to happen and a delay counted
     from the top of the list would leave it waiting half a second for
     nothing. Two cards arriving side by side still want a beat between them,
     and that is all this is. Mirrors the two-column grid in pages.css; on one
     column it alternates harmlessly, and there the reveal is off anyway. */
  item.style.setProperty("--card-col", String(index % 2));

  const link = document.createElement("a");
  link.className = "card-work";
  link.href = `project.html?id=${encodeURIComponent(project.id)}`;

  // --- the footage -------------------------------------------------------
  const media = document.createElement("span");
  media.className = "card-work__media";

  /* What the card shows and how it degrades — video → slideshow → banner →
     hatching — is decided in one shared place (media.js), the same cascade the
     project hero uses. A <video> is only created when there is footage, so a
     project still being shot never 404s on a missing file. */
  fillMedia(media, project, {
    videoClass: "card-work__video",
    stillClass: "card-work__still",
  });

  /* --- the label ---------------------------------------------------------
   * The name and the year, and nothing else. The role line that used to sit
   * under each project was a third piece of text competing with the footage
   * for the same glance — and this page's job is to make you open the project,
   * not to summarise it. The role is still on the project page, where there is
   * room to read it.
   *
   * Plain text, no difference echo either. The ghost is the site's hover
   * language for things you point AT to resolve; on a card the whole tile
   * already answers with a zoom and, where there is one, its own sound. */
  const meta = document.createElement("span");
  meta.className = "card-work__meta";

  const name = document.createElement("span");
  name.className = "card-work__name";
  name.textContent = project.title;

  const year = document.createElement("span");
  year.className = "card-work__year";
  year.textContent = project.year || "";

  meta.append(name, year);
  link.append(media, meta);
  item.append(link);
  return item;
}

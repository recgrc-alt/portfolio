/* ==========================================================================
   WORK GALLERY  ·  work.html
   --------------------------------------------------------------------------
   Builds the gallery from data/projects.json: one section per category, a
   card per project inside it. Nothing here is written in the HTML — work.html
   ships an empty <div> and this fills it, so adding a project is an entry in
   the JSON and nothing else.

   THE CARDS ARE CLEAN
   No viewfinder, no burnt-in camera data, no expanding overlay. The brief for
   this page is footage and a name: the card's job is to make you want to open
   the project, and the project page is where the detail lives.

   WHY THE VIDEOS HAVE NO autoplay ATTRIBUTE
   Same reason as the old wall: the attribute is honoured eagerly, so every
   video in the gallery would begin downloading the moment the document
   parsed, whether or not it is anywhere near the screen. cam-feeds.js starts
   them from an IntersectionObserver instead — identical behaviour to watch,
   a fraction of the bytes.
   ========================================================================== */

import { loadProjects, resolveField, groupByCategory } from "./projects.js?v=72";
import { initCamFeeds } from "./cam-feeds.js?v=72";
import { initReveal } from "./reveal.js?v=72";
import { fillMedia } from "./media.js?v=72";
import { t } from "./i18n.js?v=72";

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
    root.replaceChildren(...groups.map(buildSection));

    /* Both of these can only run once the cards exist. The cards are created
       after the JSON fetch resolves, which is long after main.js has booted —
       so anything that scans the DOM at startup has already missed them. */
    initCamFeeds(root);   // starts each video when it nears the viewport
    initReveal(root);     // without this the cards stay at opacity 0 forever
    return { data, groups };
  }

  /* --- Landing on a category ---------------------------------------------
   * The home page links straight at a discipline (work.html#cat-uiux), but the
   * section carrying that id does not exist until the JSON has been fetched
   * and the DOM built. By then the browser has long since tried to find the
   * anchor, failed, and stayed at the top — which is why all three service
   * links appeared to lead to the same place.
   *
   * So the jump is performed here instead, once the sections are real. Only
   * after the FIRST render: a language switch rebuilds the gallery too, and
   * yanking someone back up to the anchor because they changed language would
   * be its own bug. */
  function jumpToHash({ smooth = true } = {}) {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;

    // Clear the fixed masthead, so the category heading is not sitting under
    // it. The bar's height is measured rather than assumed.
    const masthead = document.querySelector(".masthead");
    const offset = (masthead?.getBoundingClientRect().height ?? 0) + 16;
    const y = target.getBoundingClientRect().top + window.scrollY - offset;

    /* ARRIVING is instant; MOVING is smooth.
       Following work.html#cat-uiux from the home page means you have already
       chosen a destination — animating a second-long glide down a very long
       page from the top is a delay dressed as polish, and it breaks outright
       anywhere the animation frames do not run (a background tab, reduced
       motion). Landing there is what was asked for.
       A hashchange while already on the page is different: there the travel is
       what tells you where you went, so that one keeps the site's easing. */
    if (!smooth) { window.scrollTo({ top: y, behavior: "auto" }); return; }

    if (window.__lenis?.scrollTo) window.__lenis.scrollTo(y);
    else window.scrollTo({ top: y, behavior: "smooth" });
  }

  const result = await render();

  /* Straight away: the sections exist the moment render() returns, and reading
     getBoundingClientRect forces the layout we need anyway. Deliberately NOT
     waiting on requestAnimationFrame — a tab that is in the background does
     not tick, and the visitor would come back to a page that never jumped. */
  jumpToHash({ smooth: false });

  /* Again once everything has actually loaded. Card heights come from
     aspect-ratio so they are right immediately, but fonts settling can still
     move a heading by a few pixels, and this lands it exactly. */
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => jumpToHash({ smooth: false }), { once: true });
  }

  // A hash change without a reload (clicking the same link twice, or the back
  // button between categories) still has to move.
  window.addEventListener("hashchange", jumpToHash);

  /* The gallery text lives in the project files, not in the i18n dictionary,
     so switching language must reload the matching file and rebuild. By the
     time this event fires, i18n.js has already set <html lang>, so
     loadProjects() picks up the new language on its own. */
  document.addEventListener("languagechange", render);

  return result;
}

/* --- One category ------------------------------------------------------- */
function buildSection({ category, items }) {
  const section = document.createElement("section");
  section.className = "gallery__section";
  section.id = `cat-${category.id}`;

  const head = document.createElement("header");
  head.className = "gallery__head";

  const title = document.createElement("h2");
  title.className = "gallery__title";
  title.textContent = resolveField(category.label);

  // The count is a small honest signal of how much is in each discipline.
  const count = document.createElement("span");
  count.className = "gallery__count";
  count.textContent = String(items.length).padStart(2, "0");

  head.append(title, count);

  const grid = document.createElement("ul");
  grid.className = "gallery__grid";
  grid.append(...items.map(buildCard));

  section.append(head, grid);
  return section;
}

/* --- One project card ---------------------------------------------------- */
function buildCard(project) {
  const item = document.createElement("li");
  item.className = "gallery__item";
  item.dataset.reveal = "";

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

  // --- the label ---------------------------------------------------------
  const meta = document.createElement("span");
  meta.className = "card-work__meta";

  // The name wears the site's difference-echo: hovering the card resolves the
  // ghost, the same hover language the nav and buttons speak. data-text feeds
  // the ::after copy that CSS draws.
  const name = document.createElement("span");
  name.className = "card-work__name text-echo";
  name.dataset.text = project.title;
  name.textContent = project.title;

  const year = document.createElement("span");
  year.className = "card-work__year";
  year.textContent = project.year || "";

  const role = document.createElement("span");
  role.className = "card-work__role";
  role.textContent = resolveField(project.role);

  meta.append(name, year, role);
  link.append(media, meta);
  item.append(link);
  return item;
}

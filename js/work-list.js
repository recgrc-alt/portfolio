/* ==========================================================================
   WORK LIST  ·  every project at once, filterable, at the foot of work.html
   --------------------------------------------------------------------------
   The deck above is a tour: it shows the work in an order, one category at a
   time, and it is the right way to MEET the work. It is the wrong way to
   SEARCH it. Somebody arriving with a question — does he do 3D, has he done
   branding, what has he built in Blender — cannot get an answer from a tour
   without taking the whole tour.

   This is the answer to that. All nineteen projects in one table, filterable
   by theme and by tool, the two ways anyone actually asks.

   WHY THE CHIPS COME FROM THE TOOLKIT, NOT FROM THE DATA
   Every project carries a techStack, and across the nineteen that comes to
   forty-six distinct entries — twenty-seven of which appear exactly once. A
   filter that always returns one project is a link with extra steps, and
   forty-six chips is not a row, it is a wall. The entries also mix two
   different kinds of thing: real software (Blender, Photoshop) alongside
   disciplines and techniques (Logotype, Chiaroscuro), and nobody browses a
   portfolio by chiaroscuro.

   So the chips are the site's OWN TOOLKIT — the ten tools the home page
   already names and already has marks for. Same vocabulary, same faces, and
   the section reads as part of the site rather than a widget bolted to it.

   AND A CHIP THAT WOULD FIND NOTHING IS NEVER BUILT.
   Illustrator and After Effects are in the toolkit but in no project's
   techStack; as chips they would be two buttons that answer with an empty
   table. They are dropped by counting, not by a hard-coded exclusion — so
   the day their projects list them, they appear on their own.

   TWO FILTERS, ONE RESULT
   Theme and tool combine. Choosing Motion and Blender asks for the projects
   that are both, which is the useful question, and it means an empty result
   is reachable — hence the clear control, which only exists when there is
   something to clear.
   ========================================================================== */

import { loadProjects, resolveField, groupByCategory } from "./projects.js?v=289";
import { TOOLS, toolMark } from "./tool-icons.js?v=289";
import { t } from "./i18n.js?v=289";

export function initWorkList(root, { lenis } = {}) {
  if (!root) return null;

  let data = null;
  let categories = [];
  let tools = [];            // only those with at least one project
  let theme = null;          // null = all
  let tool = null;           // null = all
  let toolsOpen = false;

  /* THE BUILT CONTROLS, KEPT.
     Both lists used to be torn down and rebuilt on every single press, which
     is why the selected mark could never animate: the element carrying the
     transition was destroyed and a fresh one appeared already in its final
     state, so there was no state to transition FROM. A browser cannot ease
     between two different elements.

     So building and selecting are now two different jobs. render* builds, and
     only when the data or the language changes; sync* leaves the DOM alone and
     moves aria-pressed, which is the one fact that actually changed. The dot
     and the weight then have something continuous to animate on. */
  let themeBtns = [];        // [{ id, btn }]
  let toolBtns = [];         // [{ name, btn }]

  /* ARRIVING WITH A FILTER ALREADY CHOSEN.
     The home page's toolkit is ten marks somebody reads and recognises, and
     until now recognising one led nowhere. Each is a link into here —
     work.html?tool=Blender#work-list — so pressing Blender on the front page
     asks the only question that mark can answer: what did he build with it.

     Read ONCE, and that matters. apply() also runs on a language switch, and
     re-reading the URL there would drag the visitor back to the tool they
     opened with after they had already chosen something else. */
  let urlRead = false;

  /* --- The parts that persist ------------------------------------------- */
  const head = document.createElement("header");
  head.className = "work-list__head";

  const title = document.createElement("h2");
  title.className = "work-list__title";
  title.id = "work-list-title";        // the section's aria-labelledby target

  /* The tally, as the big numeral in the design. Two spans, because the
     figure and the sentence are for different readers: the number is what
     the eye wants and the phrase is what a screen reader needs, and one
     element cannot be both without reading "08" aloud and meaning nothing. */
  const count = document.createElement("p");
  count.className = "work-list__count";

  const countNum = document.createElement("span");
  countNum.className = "work-list__count-num";
  countNum.setAttribute("aria-hidden", "true");

  const countSaid = document.createElement("span");
  countSaid.className = "visually-hidden";

  count.append(countNum, countSaid);

  head.append(title, count);

  const filters = document.createElement("div");
  filters.className = "work-list__filters";

  /* A BOX AROUND THE LIST, and it exists for one reason: to be the thing that
     collapses when the tool band takes over.

     The band is opened by folding a grid row from 1fr to 0fr, which is the
     only way to animate a height nobody has measured. That fold has to happen
     on a wrapper, because the collapsing element needs exactly one child to
     clip, and a <ul> has as many children as there are themes. Same pattern
     the tool panel itself uses, one level out. */
  const themeBox = document.createElement("div");
  themeBox.className = "work-list__themebox";

  const themeList = document.createElement("ul");
  themeList.className = "work-list__themes";
  themeBox.append(themeList);

  /* The tool control is a disclosure: a button naming the current choice,
     and a panel of chips it opens. Collapsed by default — the row of ten is
     a lot of furniture to carry when most visitors want the themes. */
  const toolBox = document.createElement("div");
  toolBox.className = "work-list__toolbox";

  const toolBtn = document.createElement("button");
  toolBtn.type = "button";
  toolBtn.className = "work-list__toolbtn";
  toolBtn.setAttribute("aria-expanded", "false");

  const toolBtnMark = document.createElement("span");
  toolBtnMark.className = "work-list__toolbtn-mark";

  const toolBtnLabel = document.createElement("span");
  toolBtnLabel.className = "work-list__toolbtn-label";

  const chevron = document.createElement("span");
  chevron.className = "work-list__chevron";
  chevron.setAttribute("aria-hidden", "true");

  toolBtn.append(toolBtnMark, toolBtnLabel, chevron);

  /* THE PANEL IS A FULL-WIDTH BAND, not a menu hanging off the button. That
     is the whole difference between this and the first attempt: a floating
     black box over the eye read as a browser widget dropped on the page,
     where the design opens a band across the section and spaces the tools
     edge to edge. So it lives beside the filter row rather than inside the
     button's column, and only aria-controls ties the two together. */
  const toolPanel = document.createElement("div");
  toolPanel.className = "work-list__toolpanel";
  toolPanel.id = "work-list-tools";
  toolBtn.setAttribute("aria-controls", toolPanel.id);

  const toolInner = document.createElement("div");
  toolInner.className = "work-list__toolinner";

  const toolRow = document.createElement("ul");
  toolRow.className = "work-list__tools";

  /* The chevron under the row, from the design. It closes the band — the
     same job as pressing the button again, put where the eye already is
     once the tools are open. */
  const toolClose = document.createElement("button");
  toolClose.type = "button";
  toolClose.className = "work-list__toolclose";
  toolClose.innerHTML = '<span class="work-list__chevron" aria-hidden="true"></span>';
  toolClose.addEventListener("click", () => { setToolsOpen(false); toolBtn.focus(); });

  toolInner.append(toolRow, toolClose);
  toolPanel.append(toolInner);

  toolBox.append(toolBtn);

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "work-list__clear";
  clear.hidden = true;

  /* The right-hand column: what this body of work IS, in one paragraph. It
     earns its place here rather than on the About page because it answers the
     question the filters raise — why these nineteen and not more — and the
     NDA line is the honest half of that answer. */
  const note = document.createElement("div");
  note.className = "work-list__note";

  const notePara = document.createElement("p");
  note.append(notePara);

  toolBox.append(clear);
  filters.append(themeBox, toolBox, note);
  // The band sits under the whole filter row, spanning the section.
  root.append(filters, toolPanel);

  /* The table. A real <table>: this is tabular data with three columns and a
     header, and a stack of divs would be lying about that to anything that
     is not a pair of eyes. */
  const table = document.createElement("table");
  table.className = "work-list__table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const th = ["colName", "colTheme", "colYear"].map((key) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.dataset.key = key;
    return cell;
  });
  headRow.append(...th);
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  table.append(thead, tbody);

  const empty = document.createElement("p");
  empty.className = "work-list__empty";
  empty.hidden = true;

  root.prepend(head);
  root.append(table, empty);

  /* --- Building ---------------------------------------------------------- */

  async function build() {
    try {
      data = await loadProjects();
    } catch {
      root.hidden = true;              // the deck above already said as much
      return;
    }
    root.hidden = false;

    categories = groupByCategory(data).map(({ category, items }) => ({
      id: category.id,
      label: resolveField(category.label),
      n: items.length,
    }));

    /* Counted, then kept only if the count is real. This is the line that
       silently retires Illustrator and After Effects today and restores them
       the day a project lists them. */
    tools = TOOLS
      .map((name) => ({
        name,
        n: data.projects.filter((p) => (p.techStack || []).includes(name)).length,
      }))
      .filter((entry) => entry.n > 0);

    /* Before the guards below, deliberately: a tool named in the URL is a
       claim that has to be checked against the same reality as any other, and
       an unknown or empty one should fall back to showing everything rather
       than to an empty table with a filter nobody can see. */
    if (!urlRead) {
      urlRead = true;
      const params = new URLSearchParams(window.location.search);
      const wantsTool = params.get("tool");
      const wantsTheme = params.get("theme");
      if (wantsTool) tool = wantsTool;
      if (wantsTheme) theme = wantsTheme;
      if (wantsTool || wantsTheme) arriveAtList();
    }

    // A filter chosen before a language switch may not exist after it.
    if (theme && !categories.some((c) => c.id === theme)) theme = null;
    if (tool && !tools.some((x) => x.name === tool)) tool = null;

    renderThemes();
    renderTools();
    renderText();
    renderRows();
  }

  /* Put the visitor where the link promised, once the page is a real height.
     NOT SMOOTHLY. The list sits below the whole deck, which is several
     screens of choreography per category; easing through all of it would be a
     minute of scenery nobody asked for, and jumping straight there is what a
     link into a section means. The delay is not decoration either — the deck's
     height is MEASURED and written by work-page.js, so asking for this
     section's position before that has happened aims at where it used to be. */
  function arriveAtList() {
    /* THE NATIVE SCROLL DOES THE WORK; LENIS IS ONLY TOLD ABOUT IT.
       Asking Lenis alone looked correct and did not move the page: its
       scrollTo, even with immediate, is applied inside its own rAF loop, so
       anywhere that loop is not running — a stalled frame callback, a
       background tab, a browser that has not started painting — the request
       is queued and silently never lands. Measured: the page stayed exactly
       where it was while Lenis reported the jump as made.

       So the two-argument scrollTo, which is unconditional and synchronous,
       and then Lenis is handed the same number so its internal position does
       not disagree with the document's and snap back on the next frame. */
    const land = () => {
      const y = root.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, y);
      lenis?.scrollTo?.(y, { immediate: true, force: true });
    };

    /* IT AIMS MORE THAN ONCE, ON PURPOSE.
       This section sits below the deck, and the deck's height is not a
       stylesheet value — work-page.js measures the cards and writes it. So the
       target's position genuinely moves after the first attempt, and a single
       jump lands wherever the page happened to be mid-measurement.

       So it re-aims until the section is actually at the top, and stops either
       when it is or after six tries. Bounded, because a loop that waits for a
       condition that never arrives is worse than arriving approximately. */
    const go = () => {
      land();
      let tries = 0;
      const settle = setInterval(() => {
        if (Math.abs(root.getBoundingClientRect().top) < 2 || (tries += 1) > 6) {
          clearInterval(settle);
          return;
        }
        land();
      }, 100);
    };

    if (document.readyState === "complete") setTimeout(go, 0);
    else window.addEventListener("load", () => setTimeout(go, 0), { once: true });
  }

  function renderText() {
    title.textContent = t("list.title", "List view");
    th[0].textContent = t("list.colName", "Project");
    th[1].textContent = t("list.colTheme", "Theme");
    th[2].textContent = t("list.colYear", "Year");
    clear.textContent = t("list.clear", "Clear filters");
    empty.textContent = t("list.empty", "No project matches both filters.");
    toolBtn.setAttribute("aria-label", t("list.tools", "Tools"));
    notePara.textContent = t("list.note",
      "A curated selection of works spanning commercial client partnerships, " +
      "academic explorations, and self-initiated research. Focused on crafting " +
      "tangible, high-performance digital experiences where design rigor meets " +
      "interactive WebGL. Additional client case studies are currently omitted " +
      "under NDA and will be released in due course.");
  }

  /* --- The themes -------------------------------------------------------
   * Numbered 01…04 to match the hero's index, because they are the same four
   * things and a reader who has scrolled past one should recognise the other.
   * "All" leads, so clearing is always one click away and never hidden.
   */
  function renderThemes() {
    themeList.replaceChildren();
    themeBtns = [];

    const rows = [{ id: null, label: t("list.allThemes", "All themes"), n: data.projects.length },
                  ...categories];

    rows.forEach((row, i) => {
      const li = document.createElement("li");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "work-list__theme";
      btn.setAttribute("aria-pressed", String(theme === row.id));

      /* NUMBERED FROM 00, including "all of them". It was left blank on the
         assumption that the absence of the four should not look like a fifth
         — but blank meant its label started where the others' NUMBERS did,
         so the one row that is always there was the one row out of line.
         00 is the honest index for "before the first". */
      const index = document.createElement("span");
      index.className = "work-list__theme-index";
      index.textContent = String(i).padStart(2, "0") + ".";

      const label = document.createElement("span");
      label.className = "work-list__theme-label";
      label.textContent = row.label;

      /* The dot on the right IS the selected state — aria-pressed carries the
         same fact for anything that cannot see it. Always present, never
         removed: it fades and shrinks, so switching between themes moves a
         mark rather than deleting and creating one. */
      const dot = document.createElement("span");
      dot.className = "work-list__dot";
      dot.setAttribute("aria-hidden", "true");

      btn.append(index, label, dot);
      btn.addEventListener("click", () => {
        theme = row.id;
        syncThemes();              // not renderThemes: see themeBtns above
        renderRows();
      });

      themeBtns.push({ id: row.id, btn });
      li.append(btn);
      themeList.append(li);
    });
  }

  /* Moves the selection without touching the DOM's shape. One attribute per
     button, and the stylesheet does the rest — the dot travels in from the
     left and the label thickens, because both are transitions on elements
     that were already there. */
  function syncThemes() {
    themeBtns.forEach(({ id, btn }) => {
      btn.setAttribute("aria-pressed", String(theme === id));
    });
  }

  /* --- The tools --------------------------------------------------------- */
  function renderTools() {
    toolRow.replaceChildren();
    toolBtns = [];

    const rows = [{ name: null, n: data.projects.length }, ...tools];

    rows.forEach((row, i) => {
      const li = document.createElement("li");
      // Its place in the arrival. The stylesheet turns this into the delay.
      li.style.setProperty("--tool-i", String(i));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "work-list__tool";
      btn.setAttribute("aria-pressed", String(tool === row.name));

      const icon = row.name ? toolMark(row.name) : null;
      if (icon) btn.append(icon);

      const label = document.createElement("span");
      label.className = "work-list__tool-label";
      label.textContent = row.name || t("list.allTools", "All tools");

      const dot = document.createElement("span");
      dot.className = "work-list__dot";
      dot.setAttribute("aria-hidden", "true");

      btn.append(label, dot);
      btn.addEventListener("click", () => {
        tool = row.name;
        setToolsOpen(false);
        syncTools();
        renderRows();
        toolBtn.focus();               // the control the choice came from
      });

      toolBtns.push({ name: row.name, btn });
      li.append(btn);
      toolRow.append(li);
    });

    syncTools();     // the freshly built row still has to show the choice
  }

  /* The chosen tool, in the two places it is stated: the chip in the band, and
     the button that summarises the band when it is folded away. */
  function syncTools() {
    toolBtns.forEach(({ name, btn }) => {
      btn.setAttribute("aria-pressed", String(tool === name));
    });

    toolBtnLabel.textContent = tool || t("list.allTools", "All tools");
    toolBtnMark.replaceChildren();
    const mark = tool ? toolMark(tool) : null;
    if (mark) toolBtnMark.append(mark);
  }

  /* The open state now lives on the SECTION, not the button's box: the band it
     controls is a sibling of the filter row, so the class has to sit on their
     common ancestor for the stylesheet to reach it. */
  function setToolsOpen(next) {
    toolsOpen = next;
    toolBtn.setAttribute("aria-expanded", String(next));
    root.classList.toggle("is-tools-open", next);
    toolBox.classList.toggle("is-open", next);   // the button's own chevron
    // Out of the tab order while folded away, or the keyboard walks into ten
    // buttons nobody can see.
    toolPanel.inert = !next;
  }

  toolBtn.addEventListener("click", () => setToolsOpen(!toolsOpen));

  /* Stated once at the start rather than left to the first toggle. The band
     begins closed, but "closed" is a set of facts — aria-expanded, the class,
     and inert — and until something set them the keyboard could tab into ten
     tools nobody could see. */
  setToolsOpen(false);

  // Escape closes it, and a click anywhere else does too — the two things a
  // disclosure is expected to answer to.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toolsOpen) { setToolsOpen(false); toolBtn.focus(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!toolsOpen) return;
    // The band is no longer inside the button's box, so "outside" has to mean
    // outside BOTH or every press on a tool would close it before it landed.
    if (!toolBox.contains(e.target) && !toolPanel.contains(e.target)) setToolsOpen(false);
  });

  clear.addEventListener("click", () => {
    theme = null;
    tool = null;
    syncThemes();
    syncTools();
    renderRows();
  });

  /* --- The rows ----------------------------------------------------------
   * ALPHABETICAL, and that is a change from newest-first.
   *
   * Newest-first is the right default for a feed, where the question is "what
   * is new". It is the wrong one for a table you are searching, which is what
   * this section exists to be: the order carried no visible logic, so pressing
   * a filter reshuffled nineteen names into what read as no order at all.
   * Sorted by name, a reader can find one without reading all of them, and
   * the ordering survives filtering because it never depended on the set.
   *
   * localeCompare, not <. The titles carry accents in both languages, and a
   * plain comparison sorts by code point — which files "Última" after "Zobeide"
   * and "Sísifo" after "Soft Capture". The document's own language is passed
   * so the collation follows whichever version is being read. */
  function renderRows() {
    const label = new Map(categories.map((c) => [c.id, c.label]));

    const rows = data.projects
      .filter((p) => !theme || p.category === theme)
      .filter((p) => !tool || (p.techStack || []).includes(tool))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "",
                      document.documentElement.lang || undefined,
                      { sensitivity: "base", numeric: true }));

    tbody.replaceChildren(...rows.map((p) => {
      const tr = document.createElement("tr");

      const name = document.createElement("td");
      const link = document.createElement("a");
      link.className = "work-list__link";
      link.href = `project.html?id=${encodeURIComponent(p.id)}`;
      link.textContent = p.title;
      name.append(link);

      const theme_ = document.createElement("td");
      theme_.className = "work-list__cell-theme";
      theme_.textContent = label.get(p.category) || "";

      const year = document.createElement("td");
      year.className = "work-list__cell-year";
      year.textContent = p.year || "";

      /* A press anywhere on the row opens the project. The anchor above is
         still the real link — this only forwards to it — so the keyboard,
         the middle click and "copy link address" all keep working on the
         name, and nothing here has to reimplement any of them.

         Two guards. A modified click is somebody asking for a new tab or a
         download, and belongs to the browser; and a press that ends with
         text selected was a drag to read, not a click to leave. */
      tr.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;          // the link did its own job
        if (event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) return;
        if (window.getSelection()?.toString()) return;
        link.click();
      });

      tr.append(name, theme_, year);
      return tr;
    }));

    const n = rows.length;
    spinCount(n);
    countSaid.textContent =
      `${n} ${n === 1 ? t("list.one", "project") : t("list.many", "projects")}`;
    empty.hidden = n > 0;
    table.hidden = n === 0;
    clear.hidden = !theme && !tool;
  }

  /* --- The tally, as a reel -----------------------------------------------
   * THE NUMBER IS THE HEADLINE OF THIS SECTION, so it behaves like one. A
   * figure that simply changes from 19 to 6 when a filter is pressed states a
   * result; a figure that counts up to it makes the filtering visible, and
   * makes the section announce itself when you arrive at it.
   *
   * HOW IT IS BUILT. Each digit is a column of numerals in a box one line
   * tall with the overflow hidden, so only one is ever showing. Landing on a
   * digit is a translate to its place in that column — which means it is a
   * transform on the compositor, not text being rewritten frame by frame, and
   * it costs nothing while the rest of the section is re-filtering a table.
   *
   * THE COLUMN CARRIES MORE THAN TEN NUMERALS ON PURPOSE. 0 to 9 twice over
   * before the run it lands in, so every spin passes the whole set twice
   * before settling. Ten would technically reach the answer; it would read as
   * a value sliding into place rather than a reel being spun.
   *
   * --ease-out is the right curve here almost by accident: it is very fast at
   * the start and settles for a long time, which is exactly how a reel loses
   * momentum. The digits are staggered so they do not all land at once.
   *
   * PADDED TO TWO FIGURES, as before, so the numeral keeps its width as the
   * filters change — a tally that drops from two glyphs to one shifts the
   * whole header line sideways.
   */
  const REEL_SPINS = 2;
  const stillness = window.matchMedia("(prefers-reduced-motion: reduce)");
  let shown = 0;

  function buildReel(count) {
    countNum.replaceChildren(...Array.from({ length: count }, () => {
      const cell = document.createElement("span");
      cell.className = "work-list__odo";

      const strip = document.createElement("span");
      strip.className = "work-list__odo-strip";
      for (let i = 0; i <= REEL_SPINS * 10 + 9; i += 1) {
        const numeral = document.createElement("span");
        numeral.className = "work-list__odo-d";
        numeral.textContent = String(i % 10);
        strip.append(numeral);
      }

      cell.append(strip);
      return cell;
    }));
  }

  function spinCount(n, animate = true) {
    shown = n;
    const digits = String(Math.max(0, n)).padStart(2, "0").split("");
    if (countNum.children.length !== digits.length) buildReel(digits.length);

    // A reader is told the figure in words by countSaid, so the reel itself
    // never has to be readable mid-spin.
    const roll = animate && !stillness.matches;

    [...countNum.children].forEach((cell, i) => {
      const strip = cell.firstElementChild;
      const landing = Number(digits[i]);

      /* Rewound with the transition OFF, then sent out with it back on. Both
         halves matter: without the reset every spin would start from wherever
         the last one stopped, and without reading offsetHeight in between the
         browser would collapse the two writes into one and nothing would
         move at all. */
      strip.style.transition = "none";
      strip.style.transitionDelay = "0ms";
      strip.style.setProperty("--odo-pos", roll ? "0" : String(landing));
      void strip.offsetHeight;

      if (!roll) return;

      strip.style.transition = "";
      strip.style.transitionDelay = `${i * 90}ms`;
      strip.style.setProperty("--odo-pos", String(REEL_SPINS * 10 + landing));
    });
  }

  /* And again on arrival. The section is several screens below the deck, so
     by the time anyone reaches it the count has long since been set and sat
     still — the one moment it is worth watching is the moment it comes into
     view. Re-armed each time, so leaving and coming back plays it afresh. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) spinCount(shown); });
    }, { threshold: 0.4 }).observe(head);
  }

  build();

  /* A language switch changes the labels, the category names AND which file
     the projects came from, so the whole thing is rebuilt rather than
     patched. The chosen filters survive it where they still exist. */
  document.addEventListener("languagechange", () => { build(); });

  return { rebuild: build };
}

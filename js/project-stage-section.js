/* ==========================================================================
   PROJECT STAGE SECTION  ·  the markup around a centred model
   --------------------------------------------------------------------------
   The section a `stage` chapter builds: a heading, an optional strapline, and
   the model underneath with its caption. That is the whole shape.

   SEPARATE FROM project-stage.js ON PURPOSE. This file knows about headings,
   classes and language; that one knows about cameras, lights and framing.
   Neither has to be opened to change the other, and the viewer can be dropped
   into any other section without bringing a heading with it.

   IT SEALS. The section lays opaque ground over the fixed 3D eye, exactly as
   the concept chapter above it does — and because both carry `.seals` and are
   adjacent, the stylesheet drops the gradient and the gap between them, so the
   two read as one continuous black rather than as two panels with a seam. That
   is the "continuation of the same background" this was asked for, and it
   falls out of a rule that was already there.
   ========================================================================== */

import { t } from "./i18n.js?v=289";
import { slot } from "./project-slot.js?v=289";
import { heading } from "./project-heading.js?v=289";

export function buildStage(chapter) {
  const section = document.createElement("section");
  section.className = "project-stage-section seals";
  if (chapter.id) section.id = `ch-${chapter.id}`;

  const titleId = chapter.id ? `ch-${chapter.id}-title` : null;
  if (titleId) section.setAttribute("aria-labelledby", titleId);

  const inner = document.createElement("div");
  inner.className = "project-stage-section__inner";

  /* The heading uses the chapter classes rather than classes of its own: a
     heading is a heading wherever it appears on this page, and giving this one
     its own would be two type scales to keep in step. */
  const head = document.createElement("div");
  head.className = "project-stage-section__head";

  if (chapter.kicker) {
    const kicker = document.createElement("p");
    kicker.className = "project-chapter__kicker";
    kicker.textContent = chapter.kicker;
    head.append(kicker);
  }

  /* The same two-element heading every written chapter uses, so this one rises
     out of its frame like the rest of them instead of being the one that
     fades. See project-heading.js. */
  if (chapter.title) {
    head.append(heading(chapter.title, "project-chapter__title", titleId));
  }

  if (chapter.sub) {
    const sub = document.createElement("p");
    sub.className = "project-chapter__sub";
    sub.textContent = chapter.sub;
    head.append(sub);
  }

  const body = document.createElement("div");
  body.className = "project-stage-section__body";

  /* --- The reading panel --------------------------------------------------
   * Built now and left empty, rather than created on the first selection. A
   * panel that arrives with its contents makes the section reflow at the
   * moment the camera is already moving, and two things moving at once for
   * different reasons is what makes a transition feel loose. It exists from
   * the start, at zero width and hidden from the tree, and only its contents
   * change.
   */
  const panel = document.createElement("aside");
  panel.className = "project-stage__panel";

  /* THE SAME CONTROL AS THE ONE AT THE TOP OF THE PAGE, and it wears the same
     classes to prove it: .project-back for the rule that pulls back on hover,
     .text-echo for the ghost that slides out of it. Only the size differs, and
     that is one line in .project-stage__back rather than a second set of
     styles that would drift from the first. */
  const back = document.createElement("button");
  back.type = "button";
  back.className = "project-back text-echo project-stage__back";
  const rotulo = t("stage.back", "GO BACK");
  back.dataset.text = rotulo;
  back.textContent = rotulo;

  const kicker = document.createElement("p");
  kicker.className = "project-chapter__kicker";

  const name = document.createElement("h3");
  name.className = "project-stage__name";

  const sub = document.createElement("p");
  sub.className = "project-stage__sub";

  const text = document.createElement("div");
  text.className = "project-stage__text";

  panel.append(back, kicker, name, sub, text);

  /* --- The instrument switches ---------------------------------------------
   * Each one is a button carrying aria-pressed, which is what the sound
   * control and the language pair on this site already are: a thing with two
   * states says so to a screen reader by being pressed or not, and the styling
   * hangs off that same attribute rather than off a class only this knows.
   *
   * ONE BUILDER, THREE SWITCHES. Written out three times they would drift the
   * first time one of them gained a detail, and the mark inside each is the
   * list view's own dot for exactly the same reason.
   *
   * Built here and not by the viewer, for the reason the reading panel is: the
   * stage owns the scene, this owns the words around it.
   */
  const tools = document.createElement("div");
  tools.className = "project-stage__tools";

  const switches = [
    { key: "boxes", label: t("stage.boxes", "Check bounding box") },
    { key: "skeleton", label: t("stage.skeleton", "Show skeleton") },
    { key: "nav", label: t("stage.nav", "Show navigation") },
  ].map(({ key, label }) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "project-stage__tool";
    el.setAttribute("aria-pressed", "false");

    const word = document.createElement("span");
    word.textContent = label;

    const dot = document.createElement("span");
    dot.className = "project-stage__tool-dot";
    dot.setAttribute("aria-hidden", "true");

    el.append(word, dot);
    tools.append(el);
    return { key, el };
  });

  const spec = chapter.stage || {};

  /* Imported at the point of use, not at the top: a project page with no stage
     chapter should never pay for Three.js being reachable from this module. */
  import("./project-stage.js?v=289").then((m) => {
    if (!m.stageWorthOffering()) {
      /* A phone gets the hole rather than a 1.2 MB download it was never going
         to turn comfortably. Same answer the crew scene gives, so the two
         cannot disagree about what a narrow screen is offered. */
      body.append(slot({
        kind: "model",
        ratio: spec.ratio || "16 / 9",
        what: spec.mobileNote || t("model.mobile", "Modelos 3D, no computador"),
        note: spec.weightNote || "",
      }));
      return;
    }
    const stage = m.initProjectStage(body, {
      src: spec.src,
      label: spec.label,
      caption: spec.caption,
      captionIcon: spec.captionIcon,
      crew: spec.crew,

      /* The stage owns the camera and the selection; this owns the words. Two
         callbacks rather than the stage reaching into the DOM, so the viewer
         stays a viewer and could be dropped into a section with no panel at
         all. */
      onPick(one) {
        kicker.textContent = t("stage.character", "CHARACTER");
        name.textContent = `${t("stage.selected", "Character selected")}: ${one.info?.title || one.label || ""}`;
        sub.textContent = one.info?.sub || "";
        text.replaceChildren(
          ...(one.info?.body || []).map((line) => {
            const p2 = document.createElement("p");
            p2.className = "project-stage__para";
            p2.textContent = line;
            return p2;
          })
        );
        /* ONE CLASS, AND NOTHING ELSE TO WAIT FOR.
           This began as `hidden = false` followed by two requestAnimationFrames
           before the class went on, which is the usual dance: an element that
           was display:none has no state to transition FROM, so it has to be
           laid out for a frame first. It is also a dance that fails wherever
           rAF is throttled or not running, and then the panel simply never
           opens.
           The panel is never display:none now. It is always in the layout, at
           zero opacity and visibility:hidden — which keeps it out of the tab
           order just as well — and one class changes all three at once. */
        section.classList.add("has-picked");

        /* Measured rather than assumed: the panel's width is a clamp against
           the viewport, so the only honest source for it is the panel. */
        stage?.cover(panel.getBoundingClientRect().width);
      },

      onRelease() {
        /* The stylesheet delays visibility to the end of the fade, so this one
           line both starts the leaving and finishes it. */
        section.classList.remove("has-picked");
        stage?.cover(0);
      },
    });

    /* APPENDED AND WIRED ONLY NOW, and only if there is a scene. A switch for
       a viewer that never started is a control that lies, and initProjectStage
       hands back nothing on a machine that was offered the placeholder.
       Prepended to the figure rather than into the box: the box carries the
       clip window that narrows at rest, and anything inside it would be cut in
       half by that. */
    if (stage) {
      body.querySelector(".project-stage")?.prepend(tools);
      for (const { key, el } of switches) {
        el.addEventListener("click", () => {
          const on = el.getAttribute("aria-pressed") !== "true";
          el.setAttribute("aria-pressed", String(on));
          stage[key](on);
        });
      }
    }

    back.addEventListener("click", () => stage?.release());
  });

  body.append(panel);
  inner.append(head, body);
  section.append(inner);
  return section;
}

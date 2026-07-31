/* ==========================================================================
   HOUR PICKER  ·  see the eye at another time of day
   --------------------------------------------------------------------------
   The eye is lit by the visitor's own clock, which means most people only ever
   meet one version of it. Someone arriving at 15:00 has no idea there is a
   midnight. This opens that up: press the local time and scrub the hour.

   WHERE IT SITS
   Anchored to the readout that opens it, in the bottom-left corner, rather
   than centred with a backdrop. A modal would be the wrong weight entirely —
   this is a curiosity, not a decision, and dimming the whole page to offer it
   would hide the very thing it changes. The eye has to stay visible while the
   slider moves or the panel is pointless.

   BUILT ON DEMAND
   Nothing is in the markup. The panel does not exist until the readout is
   pressed, and there is no cost on any page where nobody presses it.
   ========================================================================== */

import { setOverride, currentHour, isOverridden } from "./time-override.js?v=72";
import { t } from "./i18n.js?v=72";

const pad = (n) => String(n).padStart(2, "0");

/* 24 steps, on the hour. Half-hours were tried and are not worth the finer
   control: the lighting keyframes are hours apart, so 14:30 and 14:00 are
   nearly the same picture, and the extra resolution only makes the slider
   harder to land. */
function labelFor(hour) {
  return `${pad(Math.floor(hour))}:00`;
}

export function initHourPicker(trigger) {
  if (!trigger) return null;

  let panel = null;
  let slider = null;
  let open = false;

  /* --- Building it ------------------------------------------------------ */
  function build() {
    panel = document.createElement("div");
    panel.className = "hour-picker";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", t("hud.timeTitle", "See the eye at another hour"));

    const readout = document.createElement("p");
    readout.className = "hour-picker__readout";

    // Track and reset sit on one line, which is what makes the reset read as
    // belonging to the slider rather than as a second, separate control.
    const row = document.createElement("div");
    row.className = "hour-picker__row";

    slider = document.createElement("input");
    slider.className = "hour-picker__slider";
    slider.type = "range";
    slider.min = "0";
    slider.max = "23";
    slider.step = "1";
    slider.value = String(Math.floor(currentHour()));
    slider.setAttribute("aria-label", t("hud.timeTitle", "See the eye at another hour"));

    const now = document.createElement("button");
    now.className = "hour-picker__now";
    now.type = "button";
    // Icon-only, so the name has to be supplied: without this a screen reader
    // announces "button" and nothing else.
    now.setAttribute("aria-label", t("hud.now", "Back to now"));
    now.setAttribute("title", t("hud.now", "Back to now"));
    now.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
      + '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'
      + ' d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/></svg>';

    function paint() {
      readout.textContent = labelFor(Number(slider.value));
      // Dimmed rather than removed when there is nothing to undo: taking the
      // button away would move the slider sideways every time the hour is
      // changed back, and a control that jumps is worse than one that waits.
      now.classList.toggle("is-idle", !isOverridden());
      now.disabled = !isOverridden();
    }

    // `input`, not `change`: the whole point is that the eye follows the hand
    // while it drags, not once it is let go.
    slider.addEventListener("input", () => {
      setOverride(Number(slider.value));
      paint();
    });

    now.addEventListener("click", () => {
      setOverride(null);
      slider.value = String(Math.floor(currentHour()));
      paint();
    });

    row.append(slider, now);
    panel.append(readout, row);
    paint();

    // Inserted next to the trigger so it can be positioned against it, and so
    // the tab order goes straight from the readout into the panel.
    trigger.parentElement.append(panel);
  }

  /* --- Opening and closing ---------------------------------------------- */
  function show() {
    if (open) return;
    if (!panel) build();
    open = true;
    panel.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    slider.focus();

    // Bound only while open, and on the next frame so the click that opened
    // the panel does not immediately close it again.
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onOutside);
      document.addEventListener("keydown", onKey);
    });
  }

  function hide() {
    if (!open) return;
    open = false;
    panel.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside);
    document.removeEventListener("keydown", onKey);
  }

  function onOutside(event) {
    if (!panel.contains(event.target) && !trigger.contains(event.target)) hide();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    hide();
    trigger.focus();
    // Escape puts the hour back as well as closing the panel: it is the
    // "undo what I was trying" key, and leaving the eye at 03:00 after
    // backing out would be a change nobody asked to keep.
    setOverride(null);
  }

  /* --- The trigger ------------------------------------------------------ */
  trigger.setAttribute("role", "button");
  trigger.setAttribute("tabindex", "0");
  trigger.setAttribute("aria-expanded", "false");
  trigger.classList.add("is-pressable");

  trigger.addEventListener("click", () => (open ? hide() : show()));
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open ? hide() : show();
    }
  });

  /* This panel's text is built here, not marked up, so data-i18n cannot reach
     it. Retranslated by hand on a language switch — and only if it has been
     built at all, which on most visits it never is. */
  document.addEventListener("languagechange", () => {
    if (!panel) return;
    const heading = t("hud.timeTitle", "See the eye at another hour");
    panel.setAttribute("aria-label", heading);
    slider.setAttribute("aria-label", heading);
    const now = panel.querySelector(".hour-picker__now");
    now.setAttribute("aria-label", t("hud.now", "Back to now"));
    now.setAttribute("title", t("hud.now", "Back to now"));
  });

  return { show, hide };
}

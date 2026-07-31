/* ==========================================================================
   TIME OVERRIDE  ·  what hour the eye thinks it is
   --------------------------------------------------------------------------
   One number, held in one place, that everything about the hour reads from.

   WHY IT IS ITS OWN MODULE
   Two parts need it and neither should know about the other. The eye's
   lighting clock asks "what hour is it?" once a minute; the picker in the HUD
   answers "pretend it is 21:00". Wiring them together directly would mean the
   eye importing a piece of interface, or the interface reaching into the
   renderer — and the eye would then refuse to work on a page with no picker.

   Instead both talk to this: the eye reads, the picker writes, and an event
   tells anyone listening that the answer changed. Either can be removed and
   the other still works, which is what makes the override an enhancement
   rather than a dependency.
   ========================================================================== */

/* null means "no pretending" — use the real clock. */
let override = null;

export const OVERRIDE_EVENT = "re:timeoverride";

/* The hour as a fraction, so 14:30 is 14.5 and the lighting can interpolate
   across it rather than stepping on the hour. */
export function currentHour() {
  if (override !== null) return override;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export function isOverridden() {
  return override !== null;
}

/* Pass null to hand the hour back to the real clock. */
export function setOverride(hour) {
  override = hour === null ? null : ((hour % 24) + 24) % 24;
  window.dispatchEvent(new CustomEvent(OVERRIDE_EVENT, {
    detail: { hour: currentHour(), overridden: override !== null },
  }));
}

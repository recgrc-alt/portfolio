/* ==========================================================================
   EYE TIME  ·  the eye lit by the hour
   --------------------------------------------------------------------------
   The eye is lit differently depending on the visitor's local time. The point
   is not "change the colour" — it is to reproduce what actually happens to
   light over a day, because that is what the viewer recognises without being
   told.

   THREE THINGS MOVE, NOT ONE

     · COLOUR TEMPERATURE. Low sun is warm; midday is neutral-to-cool. This is
       the key light's colour.
     · AMOUNT, AND WITH IT CONTRAST. At night the only light is artificial —
       weak and local — so the key drops AND the ambient drops further, which
       widens the gap between lit and shadow. Midday does the opposite: more
       light everywhere, softer falloff.
     · SHADOW COLOUR. The one that sells it. Warm light means cool shadows;
       the hemisphere's ground colour goes deep blue at night and neutral at
       noon. Golden hour reads as golden because of the blue in the shadows,
       not only the orange in the light.

   FOUR KEYFRAMES, NOT TWENTY-FOUR
   Dawn, day, dusk, night — and every hour in between is interpolated. A table
   of 24 entries would be more numbers to maintain and no more information:
   the light does not do anything interesting between 14:00 and 15:00.

   The catchlight is deliberately the LEAST affected: it is the spark that
   reads as "alive". Dimming it at night would make the eye look dead rather
   than nocturnal.

   WHAT IS NOT ANIMATED
   The environment map. Regenerating the PMREM would mean re-rendering and
   re-convolving a cubemap on the fly, which is far too expensive to do on a
   clock tick for a background element. The lights carry the change; the
   reflections stay put.
   ========================================================================== */

import { OVERRIDE_EVENT } from "./time-override.js?v=71";

/* Keyframes are placed at the hour they describe, and the day wraps: 23:00
   blends toward the 5:00 entry, not back through noon. */
const KEYS = [5, 9, 13, 19, 22];

/* --- Interpolation helpers ---------------------------------------------- */
const mix = (a, b, t) => a + (b - a) * t;

/* Colours blend in the numeric channels rather than as strings. Hex in, hex
   out, so config stays readable and the caller never handles triplets. */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(mix((pa >> shift) & 255, (pb >> shift) & 255, t));
  return "#" + [ch(16), ch(8), ch(0)]
    .map((v) => v.toString(16).padStart(2, "0")).join("");
}

function blend(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    out[key] = typeof a[key] === "string" ? mixHex(a[key], b[key], t) : mix(a[key], b[key], t);
  }
  return out;
}

/* --- Where in the day are we? -------------------------------------------
 * Returns the two keyframes either side of `hour` and how far between them we
 * are. Hours are fractional, so the transition is continuous rather than
 * snapping on the hour. */
function segment(hour) {
  const h = ((hour % 24) + 24) % 24;

  // Before the first keyframe or after the last: we are in the night that
  // wraps midnight, running from the last key round to the first.
  if (h < KEYS[0] || h >= KEYS[KEYS.length - 1]) {
    const from = KEYS[KEYS.length - 1];
    const to = KEYS[0] + 24;
    const at = h < KEYS[0] ? h + 24 : h;
    return { a: KEYS.length - 1, b: 0, t: (at - from) / (to - from) };
  }

  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i] && h < KEYS[i + 1]) {
      return { a: i, b: i + 1, t: (h - KEYS[i]) / (KEYS[i + 1] - KEYS[i]) };
    }
  }
  return { a: 0, b: 0, t: 0 };
}

/* The lighting values for a given hour, as a plain object matching the shape
   of config.eye.timeOfDay[n]. Pure: no Three.js, no DOM — which is what makes
   it testable on its own. */
export function lightingAtHour(hour, presets) {
  const { a, b, t } = segment(hour);
  // Smoothstep rather than linear: light does not change at a constant rate
  // through a sunset, and a linear ramp reads mechanical.
  const eased = t * t * (3 - 2 * t);
  return blend(presets[a], presets[b], eased);
}

/* --- Applying it to a live rig ------------------------------------------
 * The rig's lights are named in eye-lighting.js, so this reaches them without
 * the caller holding references to each one. */
export function applyTimeOfDay(rig, renderer, values, THREE) {
  const set = (name, fn) => { const l = rig.getObjectByName(name); if (l) fn(l); };

  set("key", (l) => { l.intensity = values.key; l.color.set(values.keyColor); });
  set("fill", (l) => { l.intensity = values.fill; l.color.set(values.fillColor); });
  set("rim", (l) => { l.intensity = values.rim; });
  set("bounce", (l) => { l.intensity = values.bounce; });
  set("catchlight", (l) => { l.intensity = values.catch; });
  set("hemi", (l) => {
    l.intensity = values.hemi;
    l.groundColor.set(values.hemiGround);   // the shadow colour — the tell
  });

  if (renderer) renderer.toneMappingExposure = values.exposure;
}

/* Starts the clock. Returns a stop function so the caller owns the lifetime.
   One tick a minute: at four keyframes across 24 hours the largest change
   between two minutes is far below what an eye can see, so anything faster is
   work for nothing. */
export function startTimeOfDay({ rig, renderer, THREE, presets, intervalMs = 60000, now }) {
  const clock = now || (() => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  });

  function tick() {
    applyTimeOfDay(rig, renderer, lightingAtHour(clock(), presets), THREE);
  }

  tick();
  const id = setInterval(tick, intervalMs);

  /* The once-a-minute tick is right for a clock and far too slow for a hand on
     a slider. When something announces that the hour was changed deliberately,
     re-light immediately — otherwise dragging the picker would do nothing for
     up to a minute and read as broken. Listening here rather than in the
     picker keeps the lighting the only thing that knows how to re-light. */
  window.addEventListener(OVERRIDE_EVENT, tick);

  return () => {
    clearInterval(id);
    window.removeEventListener(OVERRIDE_EVENT, tick);
  };
}

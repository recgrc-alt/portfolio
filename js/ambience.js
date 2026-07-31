/* ==========================================================================
   AMBIENCE  ·  a soft background loop, present on every page
   --------------------------------------------------------------------------
   assets/sound/ambience_sound.mp3, kept quiet under the whole site.

   WHY WEB AUDIO AND NOT AN <audio loop> TAG
   Two things a plain <audio> cannot do, and both were audible:

     1. A SEAMLESS LOOP.  loop="true" jumps from the last sample back to the
        first. Unless the file was authored to loop perfectly, that jump is a
        hard edge — the "repentino" restart. Here the file is decoded once and
        played by overlapping sources: the tail of one pass fades out while the
        head of the next fades in, on an EQUAL-POWER curve so the crossfade
        holds a constant loudness instead of dipping in the middle. The loop
        stops being a seam and becomes a fold.

     2. A SMOOTH FADE.  Animating .volume from JS steps once per frame, which
        on a busy page is audible as a stair. Web Audio ramps the gain on the
        audio thread — continuous, and unbothered by whatever the main thread
        is doing.

   The same gain node carries every fade: in on the first gesture, out when the
   visitor mutes, down while a reel is speaking (audio-ducking.js), out when
   leaving the page (page-transition.js calls fadeOut so navigation stops
   cutting the sound off mid-note).
   ========================================================================== */

import { canPlay, onChange } from "./audio-state.js?v=71";
import { onDuckChange } from "./audio-ducking.js?v=71";

// The active instance, so page-transition.js can fade it on the way out
// without having to be handed a reference through main.js.
let active = null;

/** Fade the running ambience to silence over ms. Safe to call when there is
 *  none — page-transition.js calls it on every navigation. */
export function fadeOutAmbience(ms = 420) {
  if (active) active.fadeOut(ms);
}

export function initAmbience(src = "assets/sound/ambience_sound.mp3", opts = {}) {
  const {
    volume = 0.09,        // quiet by design: felt, not listened to
    fadeMs = 1600,        // in / out when sound is switched on or off
    duckMs = 700,         // faster, so a reel is not talked over
    crossfadeSec = 3,     // the overlap that hides the loop point
  } = opts;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;                 // no Web Audio: no ambience, no error

  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  let buffer = null;
  let ducked = false;
  let visible = !document.hidden;
  let running = false;                        // is the loop scheduled at all
  let timer = null;
  let nextStartAt = 0;                        // ctx time the next pass begins

  /* --- The crossfaded loop ---------------------------------------------- */

  // Equal-power curves: sin/cos rather than a straight line, so two copies of
  // the same material summed across the overlap stay at one loudness.
  const STEPS = 64;
  const fadeInCurve = new Float32Array(STEPS);
  const fadeOutCurve = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i += 1) {
    const t = i / (STEPS - 1);
    fadeInCurve[i] = Math.sin((t * Math.PI) / 2);
    fadeOutCurve[i] = Math.cos((t * Math.PI) / 2);
  }

  // One pass of the file, fading in at its head and out at its tail. The next
  // pass is scheduled to begin exactly where this one starts fading, so the
  // two overlap for `xf` seconds and the seam is never heard.
  function schedulePass(startAt) {
    const xf = Math.min(crossfadeSec, buffer.duration / 3);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.setValueCurveAtTime(fadeInCurve, startAt, xf);
    gain.gain.setValueAtTime(1, startAt + xf);
    gain.gain.setValueCurveAtTime(fadeOutCurve, startAt + buffer.duration - xf, xf);

    source.connect(gain).connect(master);
    source.start(startAt);
    source.stop(startAt + buffer.duration + 0.1);
    source.onended = () => { gain.disconnect(); };

    nextStartAt = startAt + buffer.duration - xf;
  }

  // Look ahead rather than firing exactly on time: a timer that is late by a
  // few ms would leave a real gap, so passes are queued on the audio clock
  // before they are needed.
  function pump() {
    if (!running || !buffer) return;
    while (nextStartAt < ctx.currentTime + 4) schedulePass(nextStartAt);
  }

  function startLoop() {
    if (running || !buffer) return;
    running = true;
    nextStartAt = ctx.currentTime + 0.05;
    pump();
    timer = setInterval(pump, 1000);
  }

  /* --- Level ------------------------------------------------------------- */

  function wants() { return canPlay() && visible && !ducked; }

  function rampTo(value, ms) {
    const now = ctx.currentTime;
    // Re-anchor at the CURRENT value, so a change that lands mid-fade
    // continues from where the level actually is instead of snapping.
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + ms / 1000);
  }

  function refresh(ms = fadeMs) {
    const target = wants() ? volume : 0;
    if (target > 0) {
      // The one place that decides the sound is wanted is the one place that
      // pays for it. Returns immediately once the buffer is in hand.
      if (!buffer) { ensureBuffer(); return; }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      startLoop();
    }
    rampTo(target, ms);
  }

  /* --- Wiring ------------------------------------------------------------ */

  /* --- The file is not fetched until it can actually be heard -------------
   * This used to download on every page load, unconditionally. It is over
   * three megabytes, it is the single heaviest thing on the site after the
   * project media, and a browser will not play a note of it until the visitor
   * has interacted with the page — so on a phone it was three megabytes of
   * cellular data spent, very often, on silence.
   *
   * Now nothing leaves the network until the site is both unlocked and
   * unmuted. Fetched once and kept; `refresh()` is what asks. */
  let fetching = null;

  function ensureBuffer() {
    if (buffer || fetching) return fetching;
    fetching = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((raw) => ctx.decodeAudioData(raw))
      .then((decoded) => { buffer = decoded; refresh(); })
      .catch(() => { /* missing or undecodable file: the site is simply silent */ });
    return fetching;
  }

  onChange(() => refresh());
  onDuckChange((audible) => { ducked = audible; refresh(duckMs); });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    refresh(300);                       // quick, this one is not expressive
  });

  active = {
    fadeOut: (ms) => rampTo(0, ms),
    destroy: () => { clearInterval(timer); running = false; ctx.close(); },
  };
  return active;
}

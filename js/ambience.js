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

   A PROJECT MAY BRING ITS OWN LOOP. A case study can name one in its data
   (`ambience` in data/projects.*.json), and project-page.js hands it to
   setAmbienceSource(). The same instance swaps files: the old loop fades out,
   its queued passes are stopped at the bottom of that fade, and the new file
   comes in under exactly the rule the first one did, fetched only once it can
   actually be heard. The mute toggle, the ducking and the fade on leaving all
   carry on untouched, because they all act on the one master gain.

   AND A PAGE MAY SHAPE THE LEVEL. After the master sits a second gain that
   belongs to the page rather than to the site: setAmbienceLevel(0..1). A
   project page uses it to keep its loop silent while the banner is on screen
   and bring it in as the banner scrolls away (banner-sound.js). The two gains
   simply multiply, so a scroll can never undo a mute, and a mute never has to
   know where the page is scrolled to.
   ========================================================================== */

import { canPlay, onChange } from "./audio-state.js?v=289";
import { onDuckChange } from "./audio-ducking.js?v=289";
import { getAudioContext, resumeAudio } from "./audio-context.js?v=289";

// The active instance, so page-transition.js can fade it on the way out
// without having to be handed a reference through main.js.
let active = null;

// A source asked for before the loop exists. main.js builds the loop before
// any page code runs, so this is not needed today, but a feature should not
// depend silently on the order of two imports.
let pending = null;
// The same, for a level asked for before the loop exists. 1 is "all of it".
let pendingLevel = 1;

/** How much of the loop's level to let through, from 0 to 1. Independent of
 *  every fade on the master gain (sound on or off, ducking, leaving the page),
 *  so a page can shape it by scroll without fighting any of them. */
export function setAmbienceLevel(fraction) {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  if (active) active.setLevel(f);
  else pendingLevel = f;
}

/** Fade the running ambience to silence over ms. Safe to call when there is
 *  none — page-transition.js calls it on every navigation. */
export function fadeOutAmbience(ms = 420) {
  if (active) active.fadeOut(ms);
}

/** Swap the loop for another file, such as a project's own ambience.
 *  `volume` is a gain, not a percentage: a file mastered very quietly can need
 *  more than 1 to sit at the same level as the site's own loop. Safe to call
 *  before initAmbience has run, and does nothing when that file is already the
 *  one in use. */
export function setAmbienceSource(src, opts = {}) {
  if (active) active.setSource(src, opts);
  else pending = { src, opts };
}

export function initAmbience(defaultSrc = "assets/sound/ambience_sound.mp3", opts = {}) {
  const {
    fadeMs = 1600,        // in / out when sound is switched on or off
    duckMs = 700,         // faster, so a reel is not talked over
    crossfadeSec = 3,     // the overlap that hides the loop point
  } = opts;

  /* The two things a project may change, so they are variables rather than
     constants: which file loops, and how loud it sits. A source requested
     before this ran wins over the default. */
  let src = pending?.src || defaultSrc;
  let volume = pending?.opts?.volume ?? opts.volume ?? 0.09;   // quiet by design: felt, not listened to
  pending = null;

  const ctx = getAudioContext();
  if (!ctx) return null;                      // no Web Audio: no ambience, no error

  const master = ctx.createGain();
  master.gain.value = 0;

  /* THE PAGE'S GAIN, AFTER THE MASTER. See the header: the master carries the
     site's own fades, this one carries whatever the page asks for, and the
     two multiply. */
  const level = ctx.createGain();
  level.gain.value = pendingLevel;
  master.connect(level).connect(ctx.destination);

  let buffer = null;
  let ducked = false;
  let visible = !document.hidden;
  let running = false;                        // is the loop scheduled at all
  let timer = null;
  let nextStartAt = 0;                        // ctx time the next pass begins
  const live = new Set();                     // passes queued or sounding, so a swap can stop them
  let generation = 0;                         // bumped on every swap, so a late fetch of the old file is dropped

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
    live.add(source);
    source.onended = () => { live.delete(source); gain.disconnect(); };

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
      /* RESUMED FIRST, BEFORE THE EARLY RETURN. The moment sound becomes
         wanted is a click on the speaker, and that click is the only user
         gesture guaranteed to be on the stack — the fetch below finishes
         later, on a promise, where a browser is entitled to refuse. Waking
         the context here spends the gesture while it is still in hand. */
      resumeAudio();
      // The one place that decides the sound is wanted is the one place that
      // pays for it. Returns immediately once the buffer is in hand.
      if (!buffer) { ensureBuffer(); return; }
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
    const asked = generation;
    fetching = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((raw) => ctx.decodeAudioData(raw))
      .then((decoded) => {
        // The file was swapped while this one was on its way: it is stale.
        if (asked !== generation) return;
        buffer = decoded;
        refresh();
      })
      .catch(() => { /* missing or undecodable file: the site is simply silent */ });
    return fetching;
  }

  onChange(() => refresh());
  onDuckChange((audible) => { ducked = audible; refresh(duckMs); });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    refresh(300);                       // quick, this one is not expressive
  });

  /* --- Swapping the file ------------------------------------------------
   * Fade the loop down, stop every pass of the old file at the bottom of that
   * fade, forget its buffer, and let refresh() bring the new file in exactly
   * the way the first one came in: fetched only if sound is wanted, faded up
   * from silence. The two never overlap, because the new loop cannot start
   * until the old one has been stopped. */
  const SWAP_MS = 600;

  function setSource(nextSrc, { volume: nextVolume } = {}) {
    if (!nextSrc) return;
    if (nextSrc === src) {
      // The same file again (a language switch re-renders the page): at most
      // a new level, never a restart.
      if (nextVolume != null && nextVolume !== volume) { volume = nextVolume; refresh(); }
      return;
    }

    generation += 1;
    const stopAt = ctx.currentTime + SWAP_MS / 1000;
    rampTo(0, SWAP_MS);
    clearInterval(timer);
    running = false;
    live.forEach((source) => {
      try { source.stop(stopAt); } catch { /* already stopped */ }
    });

    src = nextSrc;
    if (nextVolume != null) volume = nextVolume;
    buffer = null;
    fetching = null;

    setTimeout(() => refresh(), SWAP_MS);
  }

  /* --- The page's level ---------------------------------------------------
   * Scroll arrives in steps, and a gain that jumps with every step is audible
   * as a zipper. setTargetAtTime glides toward each new value instead, so a
   * quick flick of the wheel still arrives as a swell. LEVEL_GLIDE is that
   * glide's time constant: roughly two thirds of the way there in that many
   * seconds, and the rest settles over the next two.
   * It was 0.35 and that was heard as the sound being cut when scrolling back
   * up to the banner. A full second is slow enough to read as a fade and
   * still quick enough to follow a reader who stops scrolling. */
  const LEVEL_GLIDE = 1;
  let levelTarget = pendingLevel;

  function setLevel(f) {
    if (Math.abs(f - levelTarget) < 0.002) return;   // a difference nobody could hear
    levelTarget = f;
    /* A SUSPENDED CONTEXT HAS A STOPPED CLOCK. Before the first gesture the
       audio clock does not move, so a glide scheduled now would only start
       once sound is switched on, and play out on top of that fade-in as a
       brief swell to the wrong level. While nothing can be heard there is
       nothing to glide past: the value is simply set. */
    if (ctx.state !== "running") {
      level.gain.cancelScheduledValues(0);
      level.gain.value = f;
      return;
    }
    const now = ctx.currentTime;
    level.gain.cancelScheduledValues(now);
    level.gain.setTargetAtTime(f, now, LEVEL_GLIDE);
  }

  active = {
    fadeOut: (ms) => rampTo(0, ms),
    setSource,
    setLevel,
    /* Stops this loop and lets go of its nodes. The CONTEXT is not closed:
       it is shared with the press tick now, and closing it here would take
       that down too. */
    destroy: () => { clearInterval(timer); running = false; master.disconnect(); },
  };
  return active;
}

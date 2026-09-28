/* ==========================================================================
   PRESS SOUND  ·  a soft tick when an interactive element is pressed
   --------------------------------------------------------------------------
   The nav, buttons and cards answer a hover with a visual echo; this adds a
   quiet audible tick on the *press*, playing assets/sound/hover.mp3.

   IT COMES FROM WHERE YOU PRESSED.
   The tick is panned across the stereo field by the pointer's X position: a
   control on the left edge sounds from the left speaker, one on the right
   from the right. That is the whole reason this stopped being an <audio> tag
   — that element has no notion of stereo placement, only a volume. Web Audio
   has a panner node, and the value it wants is exactly the number the pointer
   already gives.

   The pan stops short of the extremes (see SPREAD). A tick pushed fully to
   one channel does not read as "over there", it reads as a fault in one
   speaker — and on headphones it is actively unpleasant. Most of the width,
   never all of it.

   WHY pointerdown, NOT click
     A click on a link navigates away, and the page can tear down before a
     `click`-fired sound is heard. pointerdown fires on the press — the
     earliest honest moment — so the tick starts before navigation begins.
     Enter/Space on a focused control are covered too, for keyboard use.

   NOTES
     · A short cooldown collapses the odd double-fire into one tick.
     · Each tick is its own source node, so quick presses overlap cleanly
       instead of cutting one another off; Web Audio disposes of them.
     · prefers-reduced-motion silences it entirely.
     · The file is not fetched until sound is actually allowed, so a visitor
       who never turns it on never pays for it.

   The set of things that tick is a single registry below — add a selector to
   give a new control the same voice. */

import { canPlay, onChange } from "./audio-state.js?v=289";
import { isTouch } from "./viewport.js?v=289";
import { getAudioContext, resumeAudio } from "./audio-context.js?v=289";

const TARGETS = [
  ".nav__link",
  ".lang__btn",
  ".btn",
  ".card-work",
  ".service__link",
  ".skills__cta",
].join(",");

/* How much of the stereo width the pointer is allowed to use. 1 would put a
   press at the screen's edge entirely in one ear. */
const SPREAD = 0.75;

export function initClickSound(src = "assets/sound/hover.mp3", opts = {}) {
  const { volume = 0.2, cooldown = 80 } = opts;

  // Less motion asked for → less noise given.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* --- Not on a touch screen ----------------------------------------------
   * pointerdown is the right moment with a mouse and the wrong one with a
   * finger. It fires as soon as the finger LANDS — deliberately, before the
   * browser has decided whether the gesture is a tap or the beginning of a
   * scroll. On the gallery that meant every flick down the page ticked once
   * for each card a finger happened to start on: a sound meant to confirm a
   * press, fired by someone who was only scrolling past.
   *
   * Waiting for pointerup and measuring the travel would tell a tap from a
   * drag, but it would also give back a sound that has no job here. The tick
   * is the audible half of the hover echo, and a touch screen has neither the
   * hover nor the need — a phone answers a press with its own haptics.
   * Desktop keeps it exactly as it was.
   *
   * It also means panning is only ever asked of a device that HAS a pointer
   * to pan by. */
  if (isTouch()) return;

  const ctx = getAudioContext();
  if (!ctx) return null;              // no Web Audio: no tick, no error

  let buffer = null;
  let fetching = null;
  let lastAt = 0;

  /* Fetched the first time sound is both allowed and wanted, never on load.
     A failure leaves buffer null and every tick a silent no-op. */
  function ensureBuffer() {
    if (buffer || fetching) return fetching;
    fetching = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((raw) => ctx.decodeAudioData(raw))
      .then((decoded) => { buffer = decoded; })
      .catch(() => { /* missing or undecodable: the press is simply quiet */ });
    return fetching;
  }

  // Ask for the file the moment consent arrives, so the first press after it
  // already has something to play rather than being the one that pays.
  onChange((allowed) => { if (allowed) { resumeAudio(); ensureBuffer(); } });
  if (canPlay()) ensureBuffer();

  /* --- One tick, placed ---------------------------------------------------
   * Source → gain → panner → out. Built per press and left to be collected:
   * these nodes are cheap, and reusing one would mean a second press cutting
   * the first one short. */
  function play(clientX) {
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    let tail = gain;

    /* StereoPannerNode is the right tool and is everywhere that matters, but
       older Safari only has the 3D PannerNode. Rather than emulate one with
       the other, a browser without it simply gets the tick in the middle —
       the sound still happens, it just does not point anywhere. */
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      const across = (clientX / window.innerWidth) * 2 - 1;   // -1 … 1
      panner.pan.value = clamp(across, -1, 1) * SPREAD;
      gain.connect(panner);
      tail = panner;
    }

    source.connect(gain);
    tail.connect(ctx.destination);
    source.start();
    source.onended = () => { try { tail.disconnect(); } catch { /* already gone */ } };
  }

  function tick(target, clientX) {
    // Both gates: the browser's, and the visitor's. Unlike the old <audio>
    // version this one has a context to wake, so the gesture gate matters.
    if (!canPlay()) return;
    if (!target || !target.closest || !target.closest(TARGETS)) return;
    const now = performance.now();
    if (now - lastAt < cooldown) return;   // fold a double-fire into one
    lastAt = now;
    play(clientX);
  }

  // The press itself — before a link starts navigating. Primary button only.
  document.addEventListener("pointerdown", (e) => {
    if (e.button === 0) tick(e.target, e.clientX);
  });

  /* Keyboard activation of a focused control. There is no pointer to place it
     by, so the tick is placed where the CONTROL is — which is the same
     promise the mouse version makes, kept by other means. */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const box = e.target?.getBoundingClientRect?.();
    tick(e.target, box ? box.left + box.width / 2 : window.innerWidth / 2);
  });

  return { destroy: () => { buffer = null; } };
}

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

/* ==========================================================================
   AUDIO DUCKING  ·  "is something else making real noise right now?"
   --------------------------------------------------------------------------
   The ambience loop (ambience.js) needs to get out of the way whenever a video
   with its own audible sound is playing — today that's the Noytrall reels
   (reel-player.js), and it is written to cover any future source the same way.

   A simple counter, not a single flag: two audible sources overlapping (rare,
   but the reel strip could in theory hand off between two clips for a frame)
   should not have the second one's end-of-audio call prematurely tell the
   ambience track to come back while the first is still sounding. */

const subscribers = new Set();
let count = 0;

function notify(audible) {
  subscribers.forEach((cb) => cb(audible));
}

/** Call when a video's real audio starts being heard. */
export function beginAudibleVideo() {
  count += 1;
  if (count === 1) notify(true);
}

/** Call when that video's audio stops being heard (paused, muted, scrolled off). */
export function endAudibleVideo() {
  count = Math.max(0, count - 1);
  if (count === 0) notify(false);
}

/** cb(audible: boolean) — fires on every true/false transition. */
export function onDuckChange(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/* ==========================================================================
   AUDIO STATE  ·  "may sound play right now?", answered in one place
   --------------------------------------------------------------------------
   Two separate things decide whether this site is allowed to make noise, and
   everything that plays audio needs to agree on both:

     1. THE GESTURE GATE  A browser blocks audible playback until the visitor
        has interacted with the page. This fires on the first pointerdown /
        keydown / touchstart and then stays open for the life of the page.

     2. THE VISITOR'S CHOICE  The sound toggle in the masthead, remembered in
        localStorage so it survives navigation and return visits. Sound is on
        by default, but quiet (see ambience.js).

   canPlay() is both together. Anything that makes noise subscribes to
   onChange() and reacts — the ambience loop fades, a reel mutes, the click
   tick goes silent — so a single toggle governs the whole site.

   ON SYSTEM VOLUME: there is deliberately no way to read the visitor's device
   volume from a web page — no browser exposes it, because it is a
   fingerprinting vector. A quiet default plus this toggle is the honest
   substitute, and it is what the toggle exists for. */

const STORE_KEY = "re.sound";

let unlocked = false;
let enabled = readStored();
const listeners = new Set();

/* localStorage throws in private mode / with cookies blocked, so every access
   is guarded — a failure just means the preference doesn't persist, which is
   a smaller problem than a page that won't boot. */
function readStored() {
  try { return localStorage.getItem(STORE_KEY) !== "off"; }
  catch { return true; }
}

function writeStored(value) {
  try { localStorage.setItem(STORE_KEY, value ? "on" : "off"); }
  catch { /* not persisted — the page still works for this session */ }
}

function notify() {
  const allowed = canPlay();
  listeners.forEach((cb) => cb(allowed));
}

["pointerdown", "keydown", "touchstart"].forEach((t) =>
  window.addEventListener(t, () => {
    if (unlocked) return;
    unlocked = true;
    notify();
  }, { once: true, passive: true }));

/** Has the visitor interacted, so the browser will allow audible playback? */
export function isUnlocked() { return unlocked; }

/** The visitor's own on/off choice, independent of the gesture gate. */
export function isSoundEnabled() { return enabled; }

/** Both gates open: it is legal AND wanted. This is what players should ask. */
export function canPlay() { return unlocked && enabled; }

export function setSoundEnabled(next) {
  if (next === enabled) return;
  enabled = next;
  writeStored(enabled);
  notify();
}

export function toggleSound() { setSoundEnabled(!enabled); }

/** cb(canPlay: boolean) on every change. Returns an unsubscribe function. */
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

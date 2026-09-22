/* ==========================================================================
   AUDIO STATE  ·  "may sound play right now?", answered in one place
   --------------------------------------------------------------------------
   Two separate things decide whether this site is allowed to make noise, and
   everything that plays audio needs to agree on both:

     1. THE GESTURE GATE  A browser blocks audible playback until the visitor
        has interacted with the page. This fires on the first pointerdown /
        keydown / touchstart and then stays open for the life of the page.

     2. THE VISITOR'S CONSENT  The speaker button in the masthead, remembered
        in localStorage so it survives navigation and return visits.

   CONSENT HAS THREE STATES, NOT TWO, and that is the whole point of this file.
   A first-time visitor is UNSET: not muted, simply never asked. The site is
   silent until they press the speaker, and that press is what starts it.

   It used to default to on, which meant the ambience arrived on whatever
   click the visitor happened to make first — a link, a card, anything — so
   music started from a gesture that had nothing to do with wanting music. It
   read as the page malfunctioning. Sound now begins only where it was asked
   for, and fades in from there.

   A returning visitor who already said yes is "on", and for them the first
   interaction of any kind opens the gesture gate again: they have already
   answered, and asking twice would be its own kind of rude.

   canPlay() is both gates together. Anything that makes noise subscribes to
   onChange() and reacts — the ambience loop fades, a reel mutes, the press
   tick goes silent — so one button governs the whole site.

   ON SYSTEM VOLUME: there is deliberately no way to read the visitor's device
   volume from a web page — no browser exposes it, because it is a
   fingerprinting vector. A quiet default plus this toggle is the honest
   substitute, and it is what the toggle exists for. */

const STORE_KEY = "re.sound";

let unlocked = false;
let consent = readStored();          // "on" | "off" | "unset"
const listeners = new Set();

/* localStorage throws in private mode / with cookies blocked, so every access
   is guarded — a failure just means the preference doesn't persist, which is
   a smaller problem than a page that won't boot. An unreadable store is
   treated as never-asked, which is the quiet answer. */
function readStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw === "on" || raw === "off" ? raw : "unset";
  } catch { return "unset"; }
}

function writeStored(value) {
  try { localStorage.setItem(STORE_KEY, value); }
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

/** The visitor's own choice, independent of the gesture gate. Unset counts as
 *  off: never asked is not the same as said yes. */
export function isSoundEnabled() { return consent === "on"; }

/** Both gates open: it is legal AND wanted. This is what players should ask. */
export function canPlay() { return unlocked && consent === "on"; }

export function setSoundEnabled(next) {
  const want = next ? "on" : "off";
  if (want === consent) return;
  consent = want;
  writeStored(consent);

  /* THE ANSWER IS ITSELF THE GESTURE. Saying yes happens inside a click, which
     is exactly the interaction a browser requires before it will let a page
     make a sound — so consent opens both gates at once and the fade-in starts
     on the press rather than one interaction later. */
  if (consent === "on") unlocked = true;

  notify();
}

export function toggleSound() { setSoundEnabled(consent !== "on"); }

/** cb(canPlay: boolean) on every change. Returns an unsubscribe function. */
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

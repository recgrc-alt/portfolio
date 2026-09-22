/* ==========================================================================
   AUDIO CONTEXT  ·  one AudioContext for the whole site
   --------------------------------------------------------------------------
   Everything that makes a sound here — the ambience loop, the press tick —
   shares this one context. Two reasons, and neither is tidiness:

     1. A BROWSER LIMITS HOW MANY YOU MAY HAVE. Each AudioContext is a real
        audio thread with its own hardware connection; open enough of them and
        creation starts throwing. One per feature is a habit that runs out.

     2. RESUMING IS A GESTURE-BOUND ACT. A context starts suspended and may
        only be resumed from inside a user interaction. With one context there
        is one thing to resume at one moment — the visitor's consent — instead
        of several, each having to find its own gesture to ride in on.

   CREATED LAZILY. Constructing a context opens that hardware connection, so a
   visitor who never turns the sound on never causes one. The first caller
   makes it; everyone after gets the same object. Null means the browser has
   no Web Audio at all, and every caller treats that as "this site is silent",
   never as an error.
   ========================================================================== */

let ctx = null;
let tried = false;

/** The shared context, created on first use. Null if Web Audio is missing. */
export function getAudioContext() {
  if (tried) return ctx;
  tried = true;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  try { ctx = new AudioCtx(); }
  catch { ctx = null; }        // blocked or out of contexts: silence, not a crash

  return ctx;
}

/* Ask the context to start running. Only meaningful inside — or shortly
   after — a user gesture; a rejected promise means the browser said not yet,
   which is a normal answer and not something to report. */
export function resumeAudio() {
  const c = getAudioContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
  return c;
}

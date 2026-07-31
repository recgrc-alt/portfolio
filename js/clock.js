/* ==========================================================================
   CLOCK  ·  local time readout for the footer
   --------------------------------------------------------------------------
   Renders the visitor's own local time as "[ HH : MM : SS ]" and ticks it
   once a second. Uses the machine's timezone (new Date() is local). The hour
   will later drive the eye's lighting/mood — that hook lives elsewhere; this
   module only displays.
   ========================================================================== */

const pad = (n) => String(n).padStart(2, "0");

export function startClock(el) {
  if (!el) return null;

  function tick() {
    const now = new Date();
    el.textContent = `[ ${pad(now.getHours())} : ${pad(now.getMinutes())} : ${pad(now.getSeconds())} ]`;
  }

  tick();                          // paint immediately, don't wait 1s
  return setInterval(tick, 1000);  // returns the id so a caller can clear it
}

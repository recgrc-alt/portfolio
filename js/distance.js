/* ==========================================================================
   DISTANCE  ·  how far the visitor is from Penafiel
   --------------------------------------------------------------------------
   The HUD's place readout starts as the fixed label "Penafiel / Porto, PT".
   Given the visitor's location it becomes the distance between them and here,
   with their own town next to it — the same fact, told as a relationship
   rather than as an address.

   IT DOES NOT ASK ON ARRIVAL
   A geolocation prompt thrown at someone three seconds into a page they have
   not read yet is the reason people click Block, and Block is permanent. So:

     · already granted  → read it straight away, no prompt, nothing to click
     · not yet asked    → the readout becomes a button, and the prompt appears
                          when the visitor asks for it
     · refused, ever    → the original label stays, and nothing is asked again

   THE DISTANCE IS COMPUTED HERE, THE TOWN IS NOT
   Haversine over the two coordinate pairs is a dozen lines and needs nobody's
   server. A place NAME cannot be derived from numbers, so that one lookup is
   the only thing that leaves the browser — and if it fails, the distance is
   still shown on its own rather than the whole readout falling over.
   ========================================================================== */

import { config } from "./config.js?v=74";
import { t } from "./i18n.js?v=74";

/* Free, keyless, and CORS-enabled for browser use. It receives the coordinates
   the visitor has just agreed to share, and nothing else — no identifier, no
   referrer data we add ourselves. */
const GEOCODER = "https://api-bdc.net/data/reverse-geocode-client";

const EARTH_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/* Great-circle distance. Straight-line "as the crow flies", not driving
   distance — which is the honest thing for a readout that is about where two
   people are, not about a journey between them. */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/* How long the number takes to run up to its value. Long enough to be seen as
   movement, short enough that nobody is waiting for a readout in a corner. */
const COUNT_MS = 1100;

/* Precision that matches how well we actually know the answer. Browser
   geolocation on a desktop is often accurate to a city, so "312.47 km" would
   be claiming four digits we do not have. */
function formatKm(km) {
  if (km < 10) return km.toFixed(1).replace(".", ",");
  return String(Math.round(km));
}

/* The number climbs to its value instead of appearing at it. The HUD is
   otherwise the one part of the page that never moves except for the clock,
   and a distance that counts up reads as something being measured rather than
   as a label that was always there.

   Eased out, so it arrives by slowing down rather than stopping dead. */
function countUp(km, onStep, onDone) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    onStep(km);
    onDone();
    return;
  }
  const started = performance.now();
  function step(now) {
    const t = Math.min(1, (now - started) / COUNT_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    onStep(km * eased);
    if (t < 1) requestAnimationFrame(step);
    else onDone();
  }
  requestAnimationFrame(step);
}

async function townAt(lat, lon) {
  try {
    const url = `${GEOCODER}?latitude=${lat}&longitude=${lon}&localityLanguage=${document.documentElement.lang || "en"}`;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return "";
    const d = await res.json();
    // Falls down the list: the smallest useful name first, the country last.
    return d.city || d.locality || d.principalSubdivision || d.countryName || "";
  } catch {
    // Offline, blocked by a content blocker, or the service is down. The
    // distance does not depend on this, so it is not worth a visible failure.
    return "";
  }
}

export function initDistance(el) {
  if (!el || !navigator.geolocation) return null;

  const home = config.home;
  const original = el.textContent.trim();

  /* What is on screen right now, so switching language can redraw it. Built in
     JavaScript, this text has no data-i18n for the translator to find — the
     module has to re-render it itself, which is the documented pattern in
     i18n.js for anything script-generated. */
  let shown = null;   // { km, town } once a fix has been read

  function reset() {
    el.textContent = original;
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
    el.removeAttribute("title");
    el.classList.remove("is-askable");
  }

  /* "LISBOA · 286 KM" — the town, then the gap between us, and nothing else.
     The old wording repeated the destination in every reading and said it in a
     full sentence; in a corner that already carries a clock, three words is
     two too many.

     Standing in Penafiel it would have read "< 1 km de Penafiel · Penafiel",
     naming the same place twice to say a distance of nothing. That case gets
     its own word instead. */
  function paint(km = shown?.km) {
    if (!shown) return;
    const here = shown.km < 1;
    const right = here
      ? t("hud.here", "right here")
      : `${formatKm(km)} km`;
    el.textContent = shown.town ? `${shown.town} · ${right}` : right;
  }

  async function show(position) {
    const at = { lat: position.coords.latitude, lon: position.coords.longitude };
    shown = { km: haversine(at, home), town: await townAt(at.lat, at.lon) };

    el.classList.remove("is-askable", "is-busy");
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
    el.removeAttribute("title");

    // Held still while the number runs, so the width cannot wobble mid-count.
    el.classList.add("is-counting");
    countUp(shown.km, paint, () => {
      paint();
      el.classList.remove("is-counting");
      el.classList.add("is-measured");
    });
  }

  function locate() {
    el.classList.add("is-busy");
    navigator.geolocation.getCurrentPosition(show, reset, {
      // A rough fix is all this needs, and the cheap one avoids waking the GPS.
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 600000,
    });
  }

  function offerToAsk() {
    el.textContent = original;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("title", t("hud.locate", "See how far you are"));
    el.classList.add("is-askable");

    const go = () => { el.classList.remove("is-askable"); locate(); };
    el.addEventListener("click", go, { once: true });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    }, { once: true });
  }

  /* The Permissions API is what makes the "no unsolicited prompt" rule
     possible: it reports whether asking would actually raise a dialog. Safari
     did not support querying geolocation for a long time, so a browser without
     it simply gets the button — which asks nothing until it is pressed. */
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: "geolocation" })
      .then((status) => {
        if (status.state === "granted") locate();
        else if (status.state === "prompt") offerToAsk();
        // "denied" falls through: the label stays exactly as it was.
      })
      .catch(offerToAsk);
  } else {
    offerToAsk();
  }

  // Switching language redraws whichever of the two states is showing.
  document.addEventListener("languagechange", () => {
    if (shown) paint();
    else if (el.classList.contains("is-askable")) {
      el.setAttribute("title", t("hud.locate", "See how far you are"));
    }
  });

  return { locate };
}

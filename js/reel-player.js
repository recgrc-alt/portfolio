/* ==========================================================================
   REEL PLAYER  ·  scroll-driven playback for the reels
   --------------------------------------------------------------------------
   The reels play as you reach them, not all at once: each clip starts when it
   scrolls into view and pauses when it leaves. Only ONE reel is ever audible —
   the one centred in your view — and only after you've interacted with the page
   at least once, because a browser won't let a video play sound before that.
   Until then they play muted, exactly like the gallery feeds.

   So: land on the page → reels are silent, playing muted as you pass them.
   Click anything once (a button, a link — any gesture) → from then on the reel
   centred in your view plays with sound, and the rest stay muted. That "once"
   is the SAME site-wide gate ambience.js reads (audio-state.js), so
   both turn on together — and while a reel is audible, this tells the ambience
   track to duck (audio-ducking.js), so the two are never heard at once.

   Two observers do the work: a loose one (play/pause on approach, so five
   decoders never run at once) and a tight one (which reel owns the sound). And
   a hidden tab pauses everything, so nothing plays to an empty room.

   Reusable: call it with any container holding [data-reel-video] elements. */

import { canPlay, onChange } from "./audio-state.js?v=63";
import { beginAudibleVideo, endAudibleVideo } from "./audio-ducking.js?v=63";

export function initReels(section) {
  if (!section) return null;
  const videos = [...section.querySelectorAll("[data-reel-video]")];
  if (!videos.length) return null;

  let active = null;                 // the one reel allowed to have sound
  let audible = false;               // whether `active` is currently unmuted

  const play = (v) => {
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  // Loose: keep a reel running while it is near the viewport, paused otherwise.
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) play(e.target);
      else e.target.pause();
    }
    // A percentage rather than px, for the same reason as cam-feeds.js: the
    // lead-in has to stay proportional to the screen it is scrolling on.
  }, { rootMargin: "20%", threshold: 0.01 });

  // Tight: whichever reel is well within view owns the sound. Rows are tall
  // enough that only one clears 0.6 at a time.
  const centre = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(e.target);
      else if (e.target === active) setActive(null);
    }
  }, { threshold: [0, 0.6, 0.9] });

  // Tells audio-ducking.js whether `active` is genuinely audible right now, so
  // the ambience track knows when to duck out of the way and when to return.
  // Idempotent against repeated calls with the same value.
  function setAudible(next) {
    if (next === audible) return;
    audible = next;
    if (audible) beginAudibleVideo(); else endAudibleVideo();
  }

  function setActive(v) {
    if (active === v) return;
    if (active) active.muted = true;            // the one losing focus goes quiet
    active = v;
    if (active) {
      play(active);
      if (canPlay()) active.muted = false;      // let the centred reel speak
    }
    setAudible(!!active && canPlay());
  }

  videos.forEach((v) => { v.muted = true; near.observe(v); centre.observe(v); });

  // Sound becoming allowed — the first gesture, or the visitor switching the
  // site's audio back on — lets the centred reel speak; switching it off mutes
  // whatever is speaking. audio-state.js is the single source for both.
  onChange((allowed) => {
    if (!active) return;
    active.muted = !allowed;
    if (allowed) play(active);
    setAudible(allowed);
  });

  // Nothing plays to a hidden tab; on return, wake only what is on screen.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { videos.forEach((v) => v.pause()); return; }
    if (active) play(active);
  });

  return {
    destroy: () => { near.disconnect(); centre.disconnect(); setAudible(false); },
  };
}

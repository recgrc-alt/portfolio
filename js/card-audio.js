/* ==========================================================================
   CARD AUDIO  ·  a project's own sound, on hover
   --------------------------------------------------------------------------
   The gallery's cards and a project page's banner both autoplay muted (that is
   the only way a browser will start them unasked). This lets the visitor hear
   one by pointing at it: hover a card, its clip unmutes; leave, it goes quiet
   again. While one is speaking the ambience loop ducks out of the way, the
   same courtesy the reels get.

   ONLY CLIPS THAT ACTUALLY HAVE SOUND
   Most of these are silent screen captures and animations. Unmuting one of
   those would duck the ambience and hand the visitor silence — worse than
   doing nothing. So a clip is only unmuted once its audio track is CONFIRMED,
   using whichever probe the browser offers (Firefox answers before playback,
   Chrome once a little has decoded). Unknown is treated as "no": a silent
   hover is better than a dead one.

   Works on any [data-work-video] in the given root, which is both the gallery
   cards and the project hero — they already share that marker. */

import { canPlay, onChange } from "./audio-state.js?v=72";
import { beginAudibleVideo, endAudibleVideo } from "./audio-ducking.js?v=72";
import { isTouch } from "./viewport.js?v=72";

/* Does this clip carry sound? true / false / null (not knowable yet).
 *
 * THE ANSWER COMES FROM THE DATA FIRST.
 * media.js stamps [data-has-audio] on the element from a flag in the project
 * file, which was read straight out of the container header. That is the only
 * deterministic source: the browser probes below all depend on decoding having
 * already happened, and these clips play MUTED, so Chrome decodes their audio
 * lazily or not at all. Asking it meant a card spoke or stayed silent
 * depending on how long it had been on screen — the same card, either way, on
 * different visits.
 *
 * The probes remain as a fallback for any clip the data has not been told
 * about yet, so nothing regresses if a project is added without the flag. */
function hasAudioTrack(video) {
  if (video.dataset.hasAudio !== undefined) return true;
  if (video.dataset.noAudio !== undefined) return false;

  if (typeof video.mozHasAudio === "boolean") return video.mozHasAudio;
  if (video.audioTracks && typeof video.audioTracks.length === "number") {
    return video.audioTracks.length > 0;
  }
  if (typeof video.webkitAudioDecodedByteCount === "number") {
    return video.webkitAudioDecodedByteCount > 0 ? true : null;
  }
  return null;
}

export function initCardAudio(root) {
  if (!root) return null;

  /* Nothing to hover with, so nothing to do — and leaving it bound was worse
     than useless. `pointerover` is not a mouse-only event: on a touch screen it
     fires on TAP, so tapping a card to open it switched its sound on along the
     way, and `pointerout` does not reliably follow a finger that has already
     left. A phone would carry a clip talking into the next page.
     A preview you hear by pointing at something needs a pointer. */
  if (isTouch()) return null;

  const confirmed = new WeakSet();   // clips known to carry audio
  let current = null;                // the one clip currently unmuted

  function silence() {
    if (!current) return;
    current.muted = true;
    current = null;
    endAudibleVideo();
  }

  function speak(video) {
    if (current === video) return;
    silence();
    video.muted = false;
    current = video;
    beginAudibleVideo();
  }

  root.addEventListener("pointerover", (event) => {
    const video = event.target.closest?.("[data-work-video]");
    if (!video || video === current) return;
    if (!canPlay()) return;                       // muted site, or no gesture yet

    if (!confirmed.has(video)) {
      if (hasAudioTrack(video) !== true) return;  // silent, or not yet knowable
      confirmed.add(video);
    }
    speak(video);
  });

  root.addEventListener("pointerout", (event) => {
    const video = event.target.closest?.("[data-work-video]");
    if (!video || video !== current) return;
    if (video.contains(event.relatedTarget)) return;   // still inside the card
    silence();
  });

  // Muting the site, or hiding the tab, must not leave a clip talking.
  onChange((allowed) => { if (!allowed) silence(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) silence();
  });

  return { destroy: silence };
}

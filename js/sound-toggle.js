/* ==========================================================================
   SOUND TOGGLE  ·  the speaker button in the masthead
   --------------------------------------------------------------------------
   The visitor's way to switch the site's audio off — the ambience loop, the
   click tick, a reel's own sound. It only reads and writes audio-state.js;
   every player is already listening there, so this file does no more than
   flip one boolean and keep the button's ARIA state honest.

   The icon is Material Symbols' volume_up / volume_off. Both paths ship in the
   markup and CSS decides which is visible, keyed on aria-pressed — including
   the hover, which shows the OTHER icon as a preview of what a click will do.
   That is why there is no icon-swapping code here.

   aria-pressed means MUTED: pressed = sound is off. */

import { isSoundEnabled, toggleSound, onChange } from "./audio-state.js?v=63";

export function initSoundToggle(button) {
  if (!button) return null;

  const sync = () => button.setAttribute("aria-pressed", String(!isSoundEnabled()));
  sync();

  button.addEventListener("click", toggleSound);

  // Kept in sync even if something else changes the preference (another tab
  // writing localStorage, a future keyboard shortcut).
  onChange(sync);

  return { destroy: () => button.removeEventListener("click", toggleSound) };
}

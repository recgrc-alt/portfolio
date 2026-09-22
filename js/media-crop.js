/* ==========================================================================
   MEDIA CROP  ·  correcting footage that was exported with black bars
   --------------------------------------------------------------------------
   WHAT THIS IS FOR, and what it is NOT for.

   The cards asked for "fill, not fit", because several of them were showing
   black down the left and right edges. `object-fit` was not the cause: it has
   been `cover` on every picture on this site from the start, and `cover` can
   never produce a bar — it crops the overflow and fills the box by definition.

   The bars are PIXELS IN THE FILES. Every clip is exported at 1920x1080, but
   in some of them the actual picture is narrower than that frame and the
   exporter filled the rest with black. Read back off a canvas, at three
   timestamps each so a fade to black is not mistaken for a bar:

       the-veldt ............ 239 px each side   (a 4:3 picture in a 16:9 file)
       eateasy .............. 240 px each side   (the same)
       audacia .............. 476 / 480 px       (nearly square)
       the-treasure-within .. 137 / 288 px       (and not centred)
       quebra-jazz ........... 63 / 0 px         (and not centred)
       exercise-2 ............. 3 / 3 px         (below noticing; left alone)

   No stylesheet can fix that, because there is nothing wrong with the layout:
   the box is 16:9, the file is 16:9, and they match exactly. The only way to
   show the real picture edge to edge is to enlarge it past its own bars, which
   is precisely what `cover` would have done on its own had these been exported
   at their true proportions.

   THE PROPER FIX IS A RE-EXPORT. This is the interim, and it is honest about
   what it costs: enlarging to hide a 239 px bar throws away a quarter of the
   height. That is the same picture `cover` would have shown from a correctly
   cut 4:3 file, so nothing is lost that the frame was ever going to show —
   but on `audacia`, whose picture is nearly square, it means only the middle
   band survives. Re-cut that one and this table entry can go.

   REMOVING THIS IS ONE LINE. Delete the import in media.js. Every card falls
   back to --media-crop: 1 and --media-nudge: 0%, which is the behaviour that
   was there before. Nothing else reads this file.
   ========================================================================== */

/* Keyed by the clip's file name, because the bars belong to the FILE, not to
   the project. The same clip reused anywhere gets the same correction, and
   nothing had to be duplicated into both projects.pt.json and projects.en.json
   to say so.

   crop   how much to enlarge, = 1920 / (width of the real picture).
   nudge  how far to slide it back to centre afterwards, as a percentage of the
          element. Zero wherever the bars are even, which is most of them.

   Both derived from the measurements above rather than chosen: a picture
   running from x=137 to x=1632 is 1495 wide, so crop is 1920/1495 = 1.284,
   and its middle sits at 46.07% of the frame instead of 50%, so after the
   enlargement it needs 5.05% back to the right. */
const CROPS = {
  "the-veldt":            { crop: 1.332, nudge: 0 },
  "eateasy":              { crop: 1.333, nudge: 0 },
  "audacia":              { crop: 1.992, nudge: 0 },
  "the-treasure-within":  { crop: 1.284, nudge: 5.05 },
  "quebra-jazz":          { crop: 1.034, nudge: -1.7 },
};

/* The file name without its folder or extension. Written this way rather than
   with a regex over the whole path so a clip that moves folders keeps working:
   what identifies it is its name, and only its name. */
function stem(src) {
  if (!src) return "";
  const last = src.split("/").pop() || "";
  return last.split("?")[0].replace(/\.[^.]+$/, "");
}

/* Sets the two custom properties the stylesheet composes its transform from.
   Silent and harmless for a clip with no entry — which is fourteen of the
   nineteen — because the stylesheet already carries the fallbacks. */
export function applyMediaCrop(element, src) {
  const fix = CROPS[stem(src)];
  if (!fix) return;
  element.style.setProperty("--media-crop", String(fix.crop));
  if (fix.nudge) element.style.setProperty("--media-nudge", `${fix.nudge}%`);
}

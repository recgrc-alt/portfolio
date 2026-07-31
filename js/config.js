/* ==========================================================================
   CONFIG  ·  Single source of truth for JS-side constants
   --------------------------------------------------------------------------
   Tunables live here so behaviour can be changed without hunting through
   modules. Keep this file tiny and declarative — no logic.
   ========================================================================== */

export const config = {

  /* --- The eye ----------------------------------------------------------
   * Colors mirror the CSS iris tokens so the 3D eye and the brand match.
   * Values are linear-ish sRGB hex; the shader converts as needed.        */
  eye: {
    scleraColor: "#e9e7e2",   // eyeball white (slightly warm, not pure)
    irisGreen:   "#4f6b34",   // outer iris
    irisAmber:   "#d29a3a",   // inner ring around the pupil
    limbalColor: "#0b120a",   // dark ring where iris meets sclera
    pupilColor:  "#050505",
    irisRadius:  0.40,        // fallback sphere: fraction of hemisphere the iris covers
    irisCapRadius: 0.12,      // GLB iris cap: maps the small cap to the full gradient
    irisBump:    9.0,         // strength of the procedural fibre relief (normal)
    pupilRadius: 0.15,        // fraction (base size; dilation scales it)

    // Sclera detail ported from the Blender nodes (procedural doesn't export).
    sclera: {
      limbalCenter:   0.912,     // where the contact-shadow ring sits (dot·front)
      limbalWidth:    0.055,     // ring softness (wider = softer, more present)
      limbalStrength: 0.72,      // how dark the ring goes — grounds the iris
      limbalColor:    "#5a3f3c", // warm shadow, not grey
      veinStrength:   0.10,      // very subtle
      veinColor:      "#9e5654", // muted red
    },
    /* The pupil's surface. It is an opening, so it stays the darkest thing on
       screen — but it is seen through the wet cornea, and that is what carries
       the white spark. This is a MATERIAL description, not a texture: no map
       is involved anywhere in producing a catchlight.
       roughness was 0.9 and envMapIntensity 0, which is why no highlight could
       appear on it however bright the lights got. */
    pupil: {
      color:              "#050507",
      roughness:          0.07,   // low = one tight spark instead of a smear
      envMapIntensity:    0.85,   // lets the softbox panels register as sheen
      clearcoat:          1.0,
      clearcoatRoughness: 0.04,
    },

    /* The studio. Every value the rig in eye-lighting.js reads.
       `bounce` and `hemiGround` are the two that fix the cut-off underside:
       before, nothing at all lit the bottom of the ball, so the falloff ran to
       zero and ended on a hard edge. */
    lighting: {
      exposure:   0.96,

      /* These six were chosen by sweeping them and measuring the render, not
         by eye. The number that matters is the top-band / bottom-band
         brightness ratio: it says whether the sphere still reads as a sphere.

           1.87  the old rig — bottom at 92/255, terminating in a hard edge
           1.09  first attempt at a fix — bottom lifted to 165, but now so even
                 that the ball read as a flat disc. Overcorrected.
           1.37  here. Bottom at 128 (no longer cut), steepest interior falloff
                 halved (14.1 -> 6.8 per 3px), and the form still turns. */
      key:        4.2,        // main modelling light, upper-left
      fill:       0.60,       // side fill (was 0.45 — too dark to hold the form)
      rim:        0.7,        // silhouette separation from the black page
      bounce:     0.30,       // the under-light that was missing entirely
      hemi:       0.09,       // ambient floor (was 0.06)
      hemiSky:    "#8f99a8",
      hemiGround: "#252a33",  // was #000000 — the direct cause of the dead underside

      catch:         22.0,    // the spark; small and bright
      catchSize:     0.42,
      catchPosition: [-1.35, 1.55, 3.3],   // upper-left of the pupil, classic

      surround:   "#0b0d10",  // the dark room the panels sit in
      envKey:     3.2,
      envFill:    0.8,
      envRim:     1.4,
      envBounce:  0.12,       // the bounce card, seen in reflections
      /* PMREM blur. Three clamps its kernel at 20 samples, which puts the
         largest usable value at ~0.039 for a 256px LOD; 0.22 was silently
         capped and produced an undersampled, banded blur plus a console
         warning. The softness now comes from the panels' own falloff ramp
         (see softPanelTexture in eye-lighting.js), so this only takes the
         last edge off. */
      envBlur:    0.035,
    },

    /* The day. Five keyframes, placed at the hour each describes, blended
       continuously by eye-time.js — see KEYS there for the hours.

         05  first light   cold, dim, deep blue shadows
         09  morning       warm and low: golden hour
         13  midday        bright, neutral, soft falloff
         19  late day      warm again, a touch dimmer
         22  night         weak and cool, the darkest shadows

       `catch` barely moves. It is the spark that reads as a living eye; dim
       it at night and the eye stops looking nocturnal and starts looking
       dead. Everything else is free to drop.

       The values here override the static ones in `lighting` above once the
       clock runs — that block is the fallback and the shape reference. */
    timeOfDay: [
      { key: 2.4, keyColor: "#b9ccea", fill: 0.40, fillColor: "#9fb4d4", rim: 0.55,
        bounce: 0.18, hemi: 0.07, hemiGround: "#161d2e", catch: 19.0, exposure: 0.90 },

      { key: 4.0, keyColor: "#ffd9a8", fill: 0.58, fillColor: "#cbd6e6", rim: 0.70,
        bounce: 0.30, hemi: 0.10, hemiGround: "#2b2a30", catch: 22.0, exposure: 0.96 },

      { key: 4.6, keyColor: "#ffffff", fill: 0.72, fillColor: "#c2ccd8", rim: 0.75,
        bounce: 0.40, hemi: 0.13, hemiGround: "#2e333c", catch: 22.0, exposure: 1.00 },

      { key: 3.8, keyColor: "#ffc98a", fill: 0.52, fillColor: "#d0c3bb", rim: 0.68,
        bounce: 0.26, hemi: 0.09, hemiGround: "#2a2431", catch: 21.0, exposure: 0.95 },

      { key: 2.0, keyColor: "#a9bfe4", fill: 0.32, fillColor: "#8fa4c6", rim: 0.50,
        bounce: 0.14, hemi: 0.06, hemiGround: "#121826", catch: 18.0, exposure: 0.88 },
    ],

    followStrength: 0.22,     // how far the eyeball rotates toward the cursor (rad)
    followEase:     0.08,     // 0..1 smoothing per frame (lower = lazier)
  },

  /* --- Photo depth parallax --------------------------------------------
   * A flat cutout + a greyscale depth map, displaced per-pixel by the cursor.
   * Keep `strength` small: this reads as volume precisely because it is
   * subtle. Push it and the silhouette starts to tear at the edges, where the
   * depth jumps from the subject straight to the transparent background.     */
  photo: {
    depthStrength: 0.016,  // UV offset at full cursor deflection
    depthCentre:   0.62,   // depth treated as "at the screen plane": features
                           // nearer than this move one way, further the other
    ease:          0.055,  // per-frame lerp of the cursor (lower = smoother)
    maxHeightVh:   82,     // display height cap, matching the old layout
  },

  /* --- Effect registry --------------------------------------------------
   * The names listed here are the effects that run, in order, every frame.
   * To enable a new behaviour: implement it in eye-effects.js and add its
   * name to this array. To disable one: remove its name. Nothing else.     */
  /* Order matters. `watchFocus` runs last on purpose: it is the only effect
     that overrides rather than adds, so it has to see the finished target the
     others built before it decides how far to pull it away. */
  activeEffects: ["follow", "idleDrift", "watchFocus"],

  /* What runs instead on a touch screen. There is no cursor to follow there,
     so `follow` would just hold the eye dead centre and `idleDrift` would keep
     fading itself out on every scroll — see restDrift in eye-effects.js.
     main.js picks between the two lists; both live here so the behaviour is
     still declared in one place rather than decided in code. */
  touchEffects: ["restDrift"],

  /* --- Location (for the footer distance readout, wired later) ----------
   * Home base = Penafiel, PT. Distance-to-visitor is a future feature.     */
  home: {
    label: "Penafiel / Porto, PT",
    lat: 41.2079,
    lon: -8.2839,
  },

  /* --- Performance ------------------------------------------------------ */
  perf: {
    maxPixelRatio: 2,        // cap DPR so 4K/retina doesn't melt the GPU
    /* Lower again on a phone. The eye is full-screen and fragment-bound, so
       the pixel count IS the cost — 1.5 instead of 2 removes 44% of it. See
       the note in main.js for why the texture is not cut to match. */
    touchPixelRatio: 1.5,
  },
};

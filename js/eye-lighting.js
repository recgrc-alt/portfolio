/* ==========================================================================
   EYE LIGHTING  ·  the studio the eye sits in
   --------------------------------------------------------------------------
   Pulled out of eye.js so the rig is one thing in one place: every intensity,
   colour and position reads from config.eye.lighting, and the same builders
   can be driven from a test harness instead of being locked inside the scene.

   HOW AN EYE IS LIT

   Two jobs, and they fight each other:

     · MODELLING — light falling off across the sphere is what makes it read as
       a ball rather than a disc. It needs a bright side and a dark side.
     · GROUNDING — but if the dark side reaches zero, the sphere stops looking
       round and starts looking CUT. There is no such thing as a surface with
       no light on it; even a black studio bounces something back.

   The earlier rig had every source at or above the midline, a pure-black
   hemisphere ground, and a near-black environment surround. Nothing at all
   reached the underside, so the falloff ran to zero and terminated in a hard
   edge across the bottom of the eyeball — the eye looked sliced off.

   The fix is the one a photographer would use: a bounce card. A large, dim,
   soft source low and in front, plus a hemisphere ground that is dark grey
   rather than nothing. The modelling survives — the key still dominates — but
   the shadow side now bottoms out at "dim" instead of "absent".
   ========================================================================== */

/* --- The environment ------------------------------------------------------
 * Believable reflections need light sources with SHAPE against a dark
 * surround, not a generic bright room. The cornea and the wet pupil reflect
 * these panels, and that is what reads as "wet".
 *
 * SOFTENING THEM, AND WHY IT IS DONE HERE RATHER THAN BY THE PMREM BLUR
 *
 * A bare PlaneGeometry is hard-edged, and on a near-mirror cornea it reflects
 * as a sharp-cornered rectangle. The obvious lever is the blur argument to
 * PMREMGenerator.fromScene(scene, sigma) — but that has a hard ceiling. Three
 * clamps the kernel at 20 samples, and
 *
 *     samples = 1 + floor(3 * sigma * 2 * pixels / PI)
 *
 * puts the largest usable sigma at ~0.039 for a 256px LOD. The 0.22 that used
 * to be set here asked for 108 samples, so it was silently capped: the blur
 * never happened at the requested width, and what did happen was an
 * undersampled kernel — which bands. That is the console warning.
 *
 * So the falloff belongs in the panel itself. Each one is textured with a
 * smooth luminance ramp that fades to black at its edges, which makes it a
 * genuinely soft source at any sigma, and the PMREM blur is set to a value it
 * can actually deliver.
 */

/* Built once and shared: a square ramp, bright in the middle, dark at the rim.
   Canvas rather than a file — it is three lines of gradient, and shipping an
   image for it would be a request and an asset to keep track of. */
let softTexture = null;

function softPanelTexture(THREE) {
  if (softTexture) return softTexture;

  const size = 128;                      // plenty: this is only ever blurred
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // A radial ramp reads as a softbox seen through diffusion. The stops are
  // weighted so the centre stays flat and only the outer third falls away —
  // a linear ramp would dim the whole panel rather than just soften its edge.
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.10,
                                     size / 2, size / 2, size * 0.52);
  g.addColorStop(0.00, "#ffffff");
  g.addColorStop(0.55, "#ffffff");
  g.addColorStop(0.80, "#6b6b6b");
  g.addColorStop(1.00, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  softTexture = new THREE.CanvasTexture(canvas);
  softTexture.colorSpace = THREE.SRGBColorSpace;
  return softTexture;
}

export function buildStudioEnvironment(THREE, config) {
  const L = config.eye.lighting;
  const env = new THREE.Scene();

  env.add(new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(L.surround), side: THREE.BackSide })
  ));

  const ramp = softPanelTexture(THREE);
  const panel = (w, h, hex, intensity, pos, rot) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex).multiplyScalar(intensity),
        // The ramp multiplies the colour, so the panel's edges fall to black
        // and it reads as a soft source instead of a lit rectangle.
        map: ramp,
      })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    env.add(m);
  };

  panel(5, 5, 0xffffff, L.envKey, [-4.5, 3.2, 4.0], [0, 0.7, 0]);      // key softbox
  panel(6, 4, 0xc6d2e4, L.envFill, [5.5, -1.2, 2.0], [0, -0.9, 0]);    // cool fill
  panel(4, 1.6, 0xffffff, L.envRim, [1.0, 4.5, -4.0], [0.7, 0, 0]);    // rim from behind

  /* The bounce card. A PlaneGeometry faces +Z, so rotating -90° about X turns
     it to face straight up; the extra tilt leans it toward the camera so the
     light it throws lands on the front of the underside, where the hard edge
     was. Big and dim on purpose — a small bright source down here would just
     be a second key light and would flatten the ball. */
  panel(9, 9, 0xdbe3f0, L.envBounce, [0, -4.4, 1.6], [-Math.PI / 2 + 0.34, 0, 0]);

  return env;
}


/* --- The light rig --------------------------------------------------------
 * Returns a Group so the whole rig can be added, inspected or swapped as one
 * object. RectAreaLight needs RectAreaLightUniformsLib.init() to have been
 * called once before any of these render.
 */
export function buildLightRig(THREE, config) {
  const L = config.eye.lighting;
  const rig = new THREE.Group();
  rig.name = "eye-light-rig";

  const area = (name, hex, intensity, w, h, pos) => {
    const light = new THREE.RectAreaLight(hex, intensity, w, h);
    light.name = name;
    light.position.set(pos[0], pos[1], pos[2]);
    light.lookAt(0, 0, 0);
    rig.add(light);
    return light;
  };

  // Broad soft key from upper-left — the main modelling light.
  area("key", 0xffffff, L.key, 3.4, 3.4, [-2.6, 2.6, 3.0]);

  // Side fill, still above the midline so the key keeps the upper hand.
  area("fill", 0xc2ccd8, L.fill, 5, 5, [3.2, 0.8, 1.8]);

  // Rim from behind-right, peeling the silhouette off the black page.
  area("rim", 0x9fb0c8, L.rim, 4, 2, [1.2, 2.2, -3.6]);

  // BOUNCE — low and in front. This is the light that was missing, and the
  // reason the bottom of the eye terminated in a hard edge. Wide and weak: it
  // lifts the shadow off zero without carving a second terminator of its own.
  area("bounce", 0xcdd8e8, L.bounce, 6, 6, [0.4, -3.0, 2.6]);

  // CATCHLIGHT — small and bright. On a low-roughness surface this becomes the
  // crisp white spark that reads as a living eye rather than a marble. It is
  // the light the pupil is now glossy enough to catch.
  const catcher = area("catchlight", 0xffffff, L.catch,
                       L.catchSize, L.catchSize, L.catchPosition);
  catcher.userData.isCatchlight = true;

  // Ambient floor. The ground colour used to be pure black, which is what let
  // the underside reach zero; a dark blue-grey is what a real dim room does.
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(L.hemiSky), new THREE.Color(L.hemiGround), L.hemi
  );
  hemi.name = "hemi";
  rig.add(hemi);

  return rig;
}


/* --- Materials that have to respond to the rig ---------------------------
 * The pupil is the one the brief is about. A pupil is an opening, so it is the
 * darkest thing on screen — but it is an opening seen THROUGH the cornea and
 * the fluid in front of it, and those are wet. What a photograph shows over a
 * pupil is the corneal reflection.
 *
 * The old material was roughness 0.9 with envMapIntensity 0: perfectly matte
 * and reflecting nothing, so no highlight could exist on it at any light
 * intensity. NO TEXTURE OR MAP IS INVOLVED — a catchlight is specular
 * response, and this is entirely a question of how the surface is described.
 */
export function createPupilMaterial(THREE, config) {
  const p = config.eye.pupil;
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(p.color),
    roughness: p.roughness,          // low = a tight, crisp spark
    metalness: 0.0,
    envMapIntensity: p.envMapIntensity,
    clearcoat: p.clearcoat,          // the wet film over the opening
    clearcoatRoughness: p.clearcoatRoughness,
  });
}

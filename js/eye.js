/* ==========================================================================
   EYE  ·  Three.js scene for the hero eyeball
   --------------------------------------------------------------------------
   Loads the real Blender model (assets/models/eye-opt.glb) and dresses it in
   code-driven materials:
     · sclera  → matte white + clearcoat (wet), lit by scene + environment
     · iris    → PBR material with a procedural amber→green + fibers gradient
                 injected via onBeforeCompile (so it reflects/lights like a
                 real surface — not a plastic self-lit shader)
     · pupil   → near-black
     · cornea  → faked wet lens (clearcoat + env reflection, no real refraction)

   REALISM comes from image-based lighting: a PMREM environment gives the
   materials something to reflect, and ACES tone mapping gives a filmic
   response. Without those, PBR looks like plastic.

   Look-at logic lives in the effect registry (eye-effects.js); this file owns
   the renderer / lights / environment / loop and smooths the eye to target.
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import {
  createScleraMaterial,
  vertexShader, fragmentShader, createEyeUniforms,
} from "./iris-shader.js?v=289";
import {
  buildStudioEnvironment, buildLightRig, createPupilMaterial,
} from "./eye-lighting.js?v=289";
import { startTimeOfDay } from "./eye-time.js?v=289";
import { currentHour } from "./time-override.js?v=289";
import { initEyeDust } from "./eye-dust.js?v=289";
import { runEffects } from "./eye-effects.js?v=289";

export function initEye({ canvas, pointer, config }) {

  /* --- Renderer (filmic response) --------------------------------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.perf.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX matches Blender's view transform — the single biggest realism win.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = config.eye.lighting.exposure;

  /* --- Scene, camera ---------------------------------------------------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 4.6);

  /* --- Environment + lights ---------------------------------------------
   * Both live in eye-lighting.js: one place that owns the studio, driven
   * entirely by config.eye.lighting, and importable by a test harness.      */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(
    buildStudioEnvironment(THREE, config), config.eye.lighting.envBlur
  ).texture;

  RectAreaLightUniformsLib.init();   // required before any RectAreaLight renders
  const rig = buildLightRig(THREE, config);
  scene.add(rig);

  /* The rig is then handed to the clock: colour temperature, amount and shadow
     colour all follow the visitor's local hour. Ticks once a minute — at four
     keyframes across a day, a faster tick would compute changes too small to
     see. Returns a stop function, kept so the caller can end it. */
  const stopTimeOfDay = startTimeOfDay({
    rig, renderer, THREE, presets: config.eye.timeOfDay,
    // Not `new Date()` directly: the HUD's picker can hold the hour somewhere
    // else so a visitor can see the eye at midnight in the middle of the
    // afternoon. With no picker on the page this returns the real time.
    now: currentHour,
  });

  /* --- The dust behind the eye -------------------------------------------
   * One line to build it, one line in the loop to move it, one boolean in
   * config.js to switch it off. It owns its own clock, its own geometry and
   * its own teardown; nothing else in this file knows what it is. */
  const dust = initEyeDust({ THREE, scene, config });

  /* --- Shared context for effects --------------------------------------- */
  const ctx = {
    eye: null,
    pointer, config,
    time: 0, dt: 0,
    lookTarget: { rx: 0, ry: 0 },
  };

  /* --- Dress the model. Keep what the GLB brings (the real iris PHOTO), and
   *     rebuild only what glTF can't carry (the sclera's procedural detail).  */
  function dressModel(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.name.toLowerCase();

      if (name.includes("sclera")) {
        // Procedural (limbal shadow + veins) is ported into this material.
        o.material = createScleraMaterial(THREE, config);

      } else if (name.includes("iris")) {
        // KEEP the exported photo — it is the irreplaceable asset. Only tune
        // the surface so it sits right under the lights and the cornea.
        if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
        o.material.roughness = 0.38;
        o.material.metalness = 0.0;
        o.material.envMapIntensity = 0.5;

      } else if (name.includes("pupil")) {
        // Still the darkest thing on screen, but glossy now: an opening seen
        // through a wet cornea is what carries the catchlight.
        o.material = createPupilMaterial(THREE, config);

      } else if (name.includes("cornea")) {
        // The transparent glossy layer from Blender: a near-invisible film whose
        // clearcoat catches the key/catchlight as the wet highlight.
        const m = o.material;
        m.color = new THREE.Color(0xffffff);
        m.transparent = true;
        m.depthWrite = false;      // don't occlude the iris behind it
        m.opacity = 0.06;
        m.roughness = 0.06;
        m.metalness = 0.0;
        m.transmission = 0.0;
        m.clearcoat = 1.0;
        m.clearcoatRoughness = 0.02;
        m.envMapIntensity = 1.1;
        o.renderOrder = 2;         // draw after the opaque parts
      }
    });
  }

  /* --- Recenter + scale to a target radius ------------------------------ */
  function fitModel(root, targetRadius = 1.0) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const holder = new THREE.Group();
    root.position.sub(center);
    holder.add(root);
    holder.scale.setScalar((targetRadius * 2) / maxDim);
    return holder;
  }

  /* --- Load the eye model (fallback: shader-sphere) --------------------- */
  /* eye-opt.glb, NOT eye.glb, and the two are the same model. The only
     difference is how the iris photo is stored: eye.glb embeds it as a
     1032 KB PNG, eye-opt.glb as a 205 KB WebP (EXT_texture_webp, which
     GLTFLoader reads natively). 1231 KB down to 403 KB, on every page, since
     the eye is on every page.

     Checked before switching, not assumed: every geometry buffer is byte for
     byte the same, the alpha channel is identical bit for bit, and rendered
     through this same loader the two differ by 0.08 levels in 255 on average
     and 4 at most. The WebP keeps the colour under the transparent pixels
     (encoded with exact=True) because this iris material is OPAQUE, so that
     colour reaches the screen through the mipmaps at the rim.

     eye.glb stays in the folder as the untouched original. Going back is this
     one line. */
  new GLTFLoader().load(
    "assets/models/eye-opt.glb",
    (gltf) => {
      dressModel(gltf.scene);
      const eye = fitModel(gltf.scene, 1.0);
      scene.add(eye);
      ctx.eye = eye;
    },
    undefined,
    (err) => {
      console.warn("[eye] model load failed, using fallback sphere:", err);
      const u = createEyeUniforms(config);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: u })
      );
      scene.add(eye);
      ctx.eye = eye;
    }
  );

  /* --- Resize (only when the CSS box changed) --------------------------- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  window.addEventListener("resize", resize);

  /* --- Animation loop --------------------------------------------------- */
  let last = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    ctx.dt = Math.min((now - last) / 1000, 0.05);
    ctx.time += ctx.dt;
    last = now;
    resize();

    if (ctx.eye) {
      // Map the cursor relative to the CANVAS box, not the window. The canvas
      // is translated down (--eye-y) in the Capabilities section, so this keeps
      // the gaze pointed at the cursor even when the eye is sunk low.
      const rect = canvas.getBoundingClientRect();
      ctx.px = rect.width ? ((pointer.clientX - rect.left) / rect.width) * 2 - 1 : 0;
      ctx.py = rect.height ? ((pointer.clientY - rect.top) / rect.height) * 2 - 1 : 0;
      // Handed to the effects so any of them can aim at an arbitrary point on
      // screen, not only at the cursor. Already measured, so it costs nothing.
      ctx.canvasRect = rect;

      ctx.lookTarget.rx = 0;
      ctx.lookTarget.ry = 0;
      runEffects(ctx, config.activeEffects);
      const ease = config.eye.followEase;
      ctx.eye.rotation.x += (ctx.lookTarget.rx - ctx.eye.rotation.x) * ease;
      ctx.eye.rotation.y += (ctx.lookTarget.ry - ctx.eye.rotation.y) * ease;
    }

    /* OUTSIDE the `if (ctx.eye)` above, deliberately: the field is the space
       the eye sits in and should be there whether or not the model has
       finished loading. It also reads ctx.px / ctx.py, which are written in
       that block, so on the first frames before the model arrives it simply
       parallaxes from zero. */
    dust?.update(ctx, renderer.getPixelRatio());

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* --- When this is allowed to run ---------------------------------------
   * TWO REASONS TO STOP, HELD AS TWO FLAGS. The tab being switched away and
   * the eye being buried under a sealed section are different events, and
   * folding them into one boolean means whichever happened last decides for
   * both: scroll into a chapter, switch tabs, come back, and the eye would
   * restart underneath ground that still covers it.
   *
   * `last` is reset on every restart. dt is clamped inside the loop anyway,
   * but resetting it is what keeps the first frame after a long pause from
   * being a frame at all rather than a jump that has to be clamped away.
   */
  let awake = !document.hidden;      // the tab is in front
  let wanted = true;                 // something can actually see the canvas

  function sync() {
    const next = awake && wanted;
    if (next === running) return;
    running = next;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  }

  document.addEventListener("visibilitychange", () => {
    awake = !document.hidden;
    sync();
  });

  return {
    scene, camera, renderer, ctx, rig, stopTimeOfDay, dust,
    /* Called by scene-power.js, which is the thing that knows whether the page
       has laid opaque ground over this canvas. The eye deliberately does not
       work that out for itself: it would have to know about section classes it
       has no other reason to have heard of. */
    setRunning(on) { wanted = !!on; sync(); },
  };
}

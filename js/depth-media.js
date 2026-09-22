/* ==========================================================================
   DEPTH MEDIA  ·  a clip with a depth map, displaced by the reader
   --------------------------------------------------------------------------
   photo-depth.js does this for the About portrait: a flat image paired with a
   greyscale depth map, each pixel's texture lookup offset in proportion to how
   near it is, so that near features travel further than far ones. It is that
   DIFFERENCE that reads as volume rather than as a picture sliding about.

   This is the same idea with two things changed, and they are the reason it is
   a second file rather than a flag on the first.

   1. THE SOURCE IS A VIDEO. A texture that has to be re-uploaded to the GPU on
      every frame is a different lifecycle from one that is loaded once: the
      clip has to be playing for there to be anything to upload, so playback
      and rendering start and stop together.

   2. THE MASK COMES FROM THE DEPTH, NOT FROM ALPHA. photo-depth weights the
      displacement by the photo's own alpha, because the portrait is a cutout
      on transparency and the empty background would otherwise be dragged
      across the silhouette. A video has no alpha to weigh — browsers only
      carry one in formats that are not portable across Safari — and it does
      not need one. These clips are a subject on black, and the depth map says
      "black is far away" by reading ~0 there. So the depth is both the
      displacement AND the mask: everything at the floor stays exactly put.

      Measured on phone-on-moss: 72% of the map sits under 0.1, which is the
      background, and the subject runs from 0.3 to 1.0. There is a clear gap
      between the two to put the threshold in.

   WHAT DRIVES IT
   The scroll, mainly — the section's own 0-to-1 swept across -1..1, so reading
   down the page pushes the parallax sideways. The pointer adds a smaller
   second motion on top where there is a cursor to add it. Both are eased the
   same way, so a scroll that jumps between frames still arrives as a glide.

   And it holds still for anyone who asked for less motion. The pointer is a
   motion the reader starts themselves; this one happens whether they want it
   or not, so this is the one that has to ask.

   TABLE OF CONTENTS
     1. SHADERS
     2. SETUP        (renderer, ortho camera, full-frame plane)
     3. SOURCES      (depth map decoded, clip bound as a live texture)
     4. SIZING       (the canvas fills the frame; the shader does the cropping)
     5. INPUT        (scroll + pointer, eased per frame)
     6. LIFECYCLE    (renders and plays only while on screen)
   ========================================================================== */

import * as THREE from "three";


/* ======================================================================
   1. SHADERS
   ====================================================================== */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMedia;
  uniform sampler2D uDepth;
  uniform vec2  uShift;      // -1..1, eased
  uniform float uStrength;   // max UV offset
  uniform float uCentre;     // depth value treated as the screen plane
  uniform float uFloor;      // depth at or under which nothing may move
  uniform vec2  uCrop;       // how much of the texture the frame shows (1,1 = all)
  uniform vec2  uFocus;      // centre of that window, in texture space
  uniform float uErode;      // how far the mask is pulled inside the silhouette

  varying vec2 vUv;

  void main() {
    /* The window into the picture — the same arithmetic object-fit: cover
       does, moved into the shader so the canvas can be any shape the layout
       asks for. At (1,1) and (0.5,0.5) it is the identity. See resize(). */
    vec2 uv = (vUv - 0.5) * uCrop + uFocus;

    float depth = texture2D(uDepth, uv).r;

    // Centred, so features nearer than uCentre shift one way and further ones
    // the other: the image pivots about the subject instead of sliding bodily.
    vec2 offset = uShift * (depth - uCentre) * uStrength;

    /* THE BACKGROUND IS NOT DISPLACED, AND THIS IS NOT OPTIONAL.
       Unmasked, the black ground reads furthest from uCentre of anything in
       the frame and is therefore told to travel furthest of all. Pixels just
       outside the subject would then sample from inside it and paint a copy of
       its edge beyond its own outline — a second, softer silhouette, which is
       the fault photo-depth.js documents at length.

       It is not that the map is wrong. It is that displacing a region with no
       content to displace can only smear its neighbour across it.

       smoothstep rather than step: a hard cut leaves a one-pixel seam around
       the subject where travel goes from full to none between two samples. The
       ramp spreads that over the soft edge the matte already has. */
    /* --- AND THE MASK IS NOT THIS PIXEL'S DEPTH -------------------------
       It is the SMALLEST depth this pixel can reach, which is not the same
       thing and the difference is a visible fault.

       A depth map's matte is wider than the film's silhouette: it is rendered,
       or matted, or simply resampled, and all three round outwards. Measured
       on this one against five frames of the clip, the map calls "subject" a
       ring of pixels the film draws as black, up to 52px wide at 1200.

       Those pixels are then given the subject's displacement. They have
       nothing in them to displace, so they fetch whatever is one offset away,
       and one offset away is the subject's edge. The edge gets painted a
       second time, beside itself, in steps. On the phone's left side it read
       as the whole rim duplicated.

       Only the ring within ONE OFFSET of the silhouette can do this, because
       that is as far as a pixel can reach. So taking the minimum over a
       neighbourhood one offset wide pulls the mask inside the silhouette by
       exactly enough and no more: the ring is pinned, the subject is not.

       THE DEPTH ITSELF IS UNTOUCHED, and that is the point of doing it here
       rather than to the file. The displacement still comes from the real
       depth at the real pixel, so nothing about the parallax changes. Only
       the question "may this pixel move at all" is asked of a wider area.

       Eight taps, a diamond and its diagonals. Clamped, because a tap at the
       frame's edge would otherwise read outside the texture. */
    vec2 e = vec2(uErode);
    vec2 d = e * 0.7071;
    float near = depth;
    near = min(near, texture2D(uDepth, clamp(uv + vec2( e.x, 0.0), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2(-e.x, 0.0), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2(0.0,  e.y), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2(0.0, -e.y), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2( d.x,  d.y), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2(-d.x,  d.y), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2( d.x, -d.y), 0.0, 1.0)).r);
    near = min(near, texture2D(uDepth, clamp(uv + vec2(-d.x, -d.y), 0.0, 1.0)).r);

    float subject = smoothstep(uFloor, uFloor + 0.06, near);
    offset *= subject;

    gl_FragColor = texture2D(uMedia, uv + offset);
  }
`;


/**
 * @param {HTMLCanvasElement} canvas   drawn into; sized by its parent
 * @param {object} options
 * @param {HTMLVideoElement} options.video   the clip, already in the DOM
 * @param {string} options.depthUrl          greyscale map, same framing
 * @param {() => {x:number,y:number}} [options.input]  -1..1 per axis
 * @param {object} [options.config]
 */
export function initDepthMedia(canvas, options = {}) {
  if (!canvas || !options.video || !options.depthUrl) return null;
  const { video, depthUrl, input, config = {} } = options;

  /* --- THE THREE NUMBERS, AND WHERE THEY CAME FROM ------------------------
   * Measured off phone-on-moss-depthmap.webp rather than guessed, because the
   * whole effect is a comparison between depths and a value picked by eye ends
   * up moving the wrong thing.
   *
   *   centre   0.45 is the phone's screen. Whatever sits AT the centre does
   *            not move at all, so this is the choice of what the picture is
   *            pinned to — and the subject is the thing that must stay put.
   *            Measured: screen 0.451, the phone's top edge 0.314 (it leans
   *            back, so it is genuinely further away), moss 0.89-0.92.
   *            The phone therefore barely moves while the moss in front of it
   *            travels, and the top of the phone drifts slightly against its
   *            own base, which is what reads as it standing in the scene
   *            rather than being pasted on it.
   *
   *   floor    0.04, just above the background's measured 0.000. Everything at
   *            or under it is pinned. There is a wide empty gap between the
   *            background and the nearest real content (nothing at all between
   *            0.1 and 0.3), so this threshold has room to be wrong in.
   *
   *   strength 0.022 of UV. At the 645px the figure gets on a 1280 screen that
   *            is about 5px of travel on the moss against nothing on the
   *            phone. Small on purpose: the brief was that it moves SLIGHTLY
   *            and never leaves its place. Raise it here to push the whole
   *            effect, or per chapter through config. */
  const s = {
    strength: config.depthStrength ?? 0.022,
    centre:   config.depthCentre   ?? 0.45,
    floor:    config.depthFloor    ?? 0.04,
    ease:     config.ease          ?? 0.055,
  };


  /* ======================================================================
     2. SETUP
     ====================================================================== */

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    /* NO CONTEXT, NO EFFECT, AND THE PAGE IS STILL RIGHT.
       The clip is in the markup and visible; the canvas is what covers it once
       this succeeds. Returning here simply leaves the reader with the video
       playing flat, which is the same thing the About section does with its
       <img> fallback. A project page must not lose a chapter to a GPU. */
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  // Orthographic -1..1 with a 2x2 plane: the quad fills the frame exactly.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uMedia:    { value: null },
    uDepth:    { value: null },
    uShift:    { value: new THREE.Vector2(0, 0) },
    uStrength: { value: s.strength },
    uCentre:   { value: s.centre },
    uFloor:    { value: s.floor },
    uCrop:     { value: new THREE.Vector2(1, 1) },
    uFocus:    { value: new THREE.Vector2(0.5, 0.5) },

    /* HOW FAR THE MASK IS PULLED IN, AND IT IS DERIVED, NOT CHOSEN.
       It has to be at least the largest offset any pixel can be given, because
       that is the reach of the fault it exists to close:

         max offset = strength * max|depth - centre| * max|shift|
                    = strength * 0.55 * 1.10                       ~ 0.61 x

       0.9 leaves half as much again in hand, and being generous costs only a
       slightly wider rim of the subject that holds still - which on moss and
       on a phone's dark edge is not visible. Tied to strength so that turning
       the effect up cannot reopen the fault. */
    uErode:    { value: s.strength * 0.9 },
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true })
  );
  scene.add(mesh);

  let aspect = 1;       // clip width / height, known once metadata arrives
  let painted = false;  // both sources on the GPU: safe to render and to measure
  let running = false;


  /* ======================================================================
     3. SOURCES
     ====================================================================== */

  /* THE CLIP IS A LIVE TEXTURE. VideoTexture re-uploads whatever frame the
     element is showing on every render, which is why nothing here seeks or
     counts frames: the <video> is the clock and this only ever reads it. */
  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;
  videoTexture.colorSpace = THREE.SRGBColorSpace;

  const loader = new THREE.TextureLoader();

  /* RESOLVES ON FAILURE TOO. A gate that a missing file could leave shut would
     turn a broken asset into a chapter that never appears — a worse fault than
     the one it guards against. Same reasoning as photo-depth.js. */
  const ready = new Promise((resolve) => {
    loader.load(
      depthUrl,
      (depth) => {
        // Clamp, so an offset at the edge cannot wrap the picture around it.
        depth.wrapS = depth.wrapT = THREE.ClampToEdgeWrapping;
        depth.minFilter = THREE.LinearFilter;
        depth.generateMipmaps = false;
        depth.colorSpace = THREE.NoColorSpace;   // data, not colour — no gamma

        uniforms.uDepth.value = depth;
        uniforms.uMedia.value = videoTexture;
        painted = true;
        resize();
        canvas.classList.add("is-ready");
        resolve();
      },
      undefined,
      (err) => {
        console.warn("[depth-media] depth map failed to load:", err);
        resolve();
      }
    );
  });

  /* The clip's own aspect, once the browser knows it. Until then the canvas
     keeps whatever the stylesheet gave it, which is the ratio from the data. */
  const readAspect = () => {
    if (video.videoWidth && video.videoHeight) {
      aspect = video.videoWidth / video.videoHeight;
      resize();
    }
  };
  if (video.readyState >= 1) readAspect();
  else video.addEventListener("loadedmetadata", readAspect, { once: true });


  /* ======================================================================
     4. SIZING  ·  the canvas fills the frame, the shader crops to suit
     ====================================================================== */

  function resize() {
    if (!painted) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const { width: w, height: h } = parent.getBoundingClientRect();
    if (w <= 0 || h <= 0) return;

    /* Whichever axis has room to spare is the one that gets trimmed — the same
       comparison object-fit: cover makes. The frame is cut to the clip's own
       ratio by the stylesheet, so in practice this is the identity and is here
       for the cases where it is not: a narrow phone, or a ratio in the data
       that does not match the file. */
    const frame = w / h;
    const cropX = frame < aspect ? frame / aspect : 1;
    const cropY = frame < aspect ? 1 : aspect / frame;
    uniforms.uCrop.value.set(cropX, cropY);
    uniforms.uFocus.value.set(0.5, 0.5);

    // Third argument false: the drawing buffer changes, the element's own box
    // stays the stylesheet's business.
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", resize, { passive: true });


  /* ======================================================================
     5. INPUT
     ====================================================================== */

  const target = { x: 0, y: 0 };
  const eased  = { x: 0, y: 0 };
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  function updateShift() {
    if (input) {
      const v = input() || {};
      target.x = clamp(v.x ?? 0);
      target.y = clamp(v.y ?? 0);
    }
    /* Eased per frame rather than with a CSS transition: a transition restarts
       on every event, which is what reads as mechanical stutter. */
    eased.x += (target.x - eased.x) * s.ease;
    eased.y += (target.y - eased.y) * s.ease;
    uniforms.uShift.value.set(eased.x, eased.y);
  }


  /* ======================================================================
     6. LIFECYCLE
     ====================================================================== */

  function frame() {
    if (!running) return;
    updateShift();
    if (painted) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    /* PLAYBACK AND RENDERING ARE THE SAME SWITCH. A paused clip still uploads
       a texture every frame — the same frame — so leaving it running off
       screen costs a decode loop for a picture nobody is looking at. */
    video.play().catch(() => {
      /* Muted autoplay is allowed everywhere this runs, but a browser under a
         strict policy may still refuse. The last decoded frame stays on the
         texture, so the chapter degrades to a still rather than to nothing. */
    });
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    video.pause();
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { resize(); start(); } else stop();
    }
  }, { threshold: 0.05 });
  observer.observe(canvas);

  return { resize, start, stop, uniforms, ready };
}

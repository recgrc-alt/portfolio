/* ==========================================================================
   PHOTO DEPTH  ·  flat cutout + depth map → interactive 3D parallax
   --------------------------------------------------------------------------
   The technique used on the Lando Norris site. A flat photo is paired with a
   greyscale depth map (light = near, dark = far). Each pixel's texture lookup
   is offset by the cursor, scaled by that pixel's depth, so the nose travels
   further than the shoulders. It is that DIFFERENCE in travel that the eye
   reads as real volume.

   Why this and not a CSS 3D transform: rotating the element tilts a flat plane
   — every pixel moves by the same rule, so it stays visibly flat and reads as
   a sheet of paper being turned. Only a per-pixel displacement produces
   parallax between features.

   THE SILHOUETTE USED TO TEAR, AND WHY IT NO LONGER DOES
   Depth jumps straight from the subject to the transparent background with
   nothing in between, so the background was being displaced far harder than
   the subject and dragged a copy of the outline out beyond itself. Keeping the
   offset small only made that quieter. The displacement is now weighted by the
   photo's own alpha, which removes the cause rather than the symptom — see the
   fragment shader.

   TABLE OF CONTENTS
     1. SHADERS
     2. SETUP        (renderer, ortho camera, full-frame plane)
     3. SIZING       (canvas matches the photo's aspect, capped by the stage)
     4. POINTER      (canvas-relative, eased per frame)
     5. LIFECYCLE    (renders only while the section is on screen)
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

  uniform sampler2D uPhoto;
  uniform sampler2D uDepth;
  uniform vec2  uMouse;      // -1..1, eased
  uniform float uStrength;   // max UV offset
  uniform float uCentre;     // depth value treated as the screen plane

  varying vec2 vUv;

  void main() {
    float depth = texture2D(uDepth, vUv).r;

    // Centring the depth means features nearer than uCentre shift one way and
    // further ones the other, so the image pivots instead of sliding bodily.
    vec2 offset = uMouse * (depth - uCentre) * uStrength;

    /* MASKED BY THE CUTOUT, AND THIS IS NOT OPTIONAL.
       The photo is a cutout on transparency. The depth map reads ~0.02 across
       the empty background against a centre of 0.62, so those pixels are told
       to shift about twenty times as far as the subject itself, which sits
       near the centre and barely moves. Measured: ~14px of travel outside the
       silhouette against well under one inside it.

       Unmasked, that means every background pixel hugging the outline samples
       from deep inside the face and paints a copy of his edge OUTSIDE his own
       outline — a second, softer silhouette that reads as the photo being
       duplicated. It is not the depth map: the map is correctly aligned (96%
       against the alpha) and correctly says "background is far away". The
       error is displacing a region that has no content to displace.

       Alpha is the honest weight. Zero outside, so the background samples
       itself and stays put; full inside, so the parallax is untouched; and it
       ramps across the soft edge instead of stepping. */
    float subject = texture2D(uPhoto, vUv).a;
    offset *= subject;

    gl_FragColor = texture2D(uPhoto, vUv + offset);
  }
`;


export function initPhotoDepth(canvas, options = {}) {
  if (!canvas) return null;
  const {
    photoUrl = "assets/foto.webp?v=72",
    depthUrl = "assets/foto-depthmap.webp?v=72",
    pointer,
    config = {},
  } = options;

  const s = {
    strength: config.depthStrength ?? 0.016,
    centre:   config.depthCentre   ?? 0.62,
    ease:     config.ease          ?? 0.055,
    maxVh:    config.maxHeightVh   ?? 82,
  };


  /* ======================================================================
     2. SETUP
     ====================================================================== */

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  // Orthographic -1..1 with a 2×2 plane: the quad fills the frame exactly, so
  // the photo's aspect is carried entirely by the canvas box (see SIZING).
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uPhoto:    { value: null },
    uDepth:    { value: null },
    uMouse:    { value: new THREE.Vector2(0, 0) },
    uStrength: { value: s.strength },
    uCentre:   { value: s.centre },
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true })
  );
  scene.add(mesh);

  let aspect = 1;          // photo width / height, known once it loads
  let ready = false;
  let running = false;

  const loader = new THREE.TextureLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  Promise.all([load(photoUrl), load(depthUrl)])
    .then(([photo, depth]) => {
      // Clamp so the cursor offset can't wrap the image around its own edges.
      for (const t of [photo, depth]) {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
      }
      photo.colorSpace = THREE.SRGBColorSpace;   // the visible image
      depth.colorSpace = THREE.NoColorSpace;     // data, not colour — no gamma

      uniforms.uPhoto.value = photo;
      uniforms.uDepth.value = depth;
      aspect = (photo.image?.width || 1) / (photo.image?.height || 1);
      ready = true;
      resize();
      canvas.classList.add("is-ready");
    })
    .catch((err) => console.warn("[photo-depth] textures failed to load:", err));


  /* ======================================================================
     3. SIZING  ·  the canvas takes the photo's aspect, capped by the stage
     ====================================================================== */

  function resize() {
    if (!ready) return;
    const parent = canvas.parentElement;
    const avail = parent ? parent.getBoundingClientRect() : { width: 0, height: 0 };

    let h = Math.min(window.innerHeight * (s.maxVh / 100), avail.height || Infinity);
    let w = h * aspect;
    if (avail.width && w > avail.width) {         // never overflow sideways
      w = avail.width;
      h = w / aspect;
    }
    if (w <= 0 || h <= 0) return;

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", resize, { passive: true });


  /* ======================================================================
     4. POINTER  ·  canvas-relative, eased every frame
     ====================================================================== */

  const target = { x: 0, y: 0 };
  const eased  = { x: 0, y: 0 };

  function updatePointer() {
    if (pointer) {
      const r = canvas.getBoundingClientRect();
      if (r.width && r.height) {
        // Relative to the photo itself, so it stays correct wherever the
        // element sits on the page.
        target.x = ((pointer.clientX - r.left) / r.width) * 2 - 1;
        target.y = ((pointer.clientY - r.top) / r.height) * 2 - 1;
        target.x = Math.max(-1, Math.min(1, target.x));
        target.y = Math.max(-1, Math.min(1, target.y));
      }
    }
    // Eased per frame rather than with a CSS transition: a transition restarts
    // on every pointer event, which is what reads as mechanical stutter.
    eased.x += (target.x - eased.x) * s.ease;
    eased.y += (target.y - eased.y) * s.ease;
    uniforms.uMouse.value.set(eased.x, eased.y);
  }


  /* ======================================================================
     5. LIFECYCLE
     ====================================================================== */

  function frame() {
    if (!running) return;
    updatePointer();
    if (ready) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function stop()  { running = false; }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { resize(); start(); } else stop();
    }
  }, { threshold: 0.05 });
  observer.observe(canvas);

  return { resize, start, stop, uniforms };
}

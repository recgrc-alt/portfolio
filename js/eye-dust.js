/* ==========================================================================
   EYE DUST  ·  a bokeh field behind the eye
   --------------------------------------------------------------------------
   A slow drift of out-of-focus points living behind the model, so the black
   behind the eye reads as a volume with something in it rather than as a
   backdrop the eye is pasted onto.

   WHERE IT LIVES, and why these numbers.
   Measured off the existing scene rather than guessed:

     camera     PerspectiveCamera(35°, aspect, 0.1, 100) at (0, 0, 4.6)
     eye        fitted to radius 1, centred on the origin, so its back face
                is at z = -1

   The bulk of the field sits behind the model, from z = -4 (three units clear
   of the eye's back face) to z = -22, comfortably inside the far plane of 100.
   A tenth of it sits IN FRONT, between z = 1.2 and z = 2.6, so a few motes
   pass across the eye rather than only behind it. That near slab is what makes
   the model sit inside the air instead of in front of a wall of it, and it is
   the reason this object is drawn last rather than first: see renderOrder.

   It is shaped as a frustum rather than a box, widening with depth exactly as
   the view does, so no mote is ever placed where the camera cannot see it. See
   BACK_NEAR below for why that matters and what it was before.

   WHY IT COSTS ALMOST NOTHING.
   One draw call, one BufferGeometry, no texture. Every particle's drift is
   computed in the VERTEX SHADER from its own seed and one time uniform, so
   the CPU writes three uniforms a frame and touches no vertex data ever. The
   disc and its soft edge are drawn in the fragment shader from gl_PointCoord,
   so there is no sprite to load, decode or hold in memory: this is the whole
   reason for a shader rather than a CanvasTexture.

   HOW THE BOKEH IS FAKED, and it is faked.
   Real depth of field is a post-process pass over the whole frame, which for
   one atmospheric layer would be the most expensive thing on the page. What an
   out-of-focus point actually looks like is simple enough to state directly:
   its circle of confusion grows with distance from the focal plane, and its
   brightness falls as that same light is spread over a larger disc. So size
   grows and alpha falls, both from one depth term, and the edge softens with
   it. Points near the focal plane stay small and sharp; the far wall is all
   large, dim, very soft discs. That reads as depth because it is what depth
   does to light.

   TURNING IT OFF
   config.eye.dust.enabled = false. One boolean, and nothing here is
   constructed, imported or drawn. Deleting the module needs only that line
   and the two in eye.js that call it.
   ========================================================================== */

import { lightingAtHour } from "./eye-time.js?v=289";
import { currentHour, OVERRIDE_EVENT } from "./time-override.js?v=289";

/* --- Where the dust lives, in world units --------------------------------
 * NOT A BOX. A box was the first version and it wasted six motes in seven:
 * measured, only 100 of 700 fell inside the frustum, because the view opens
 * with depth and a rectangular field does not. At z = -4 the camera sees 5.4
 * units of height; at z = -22 it sees 16.8. A field of constant width is
 * mostly outside the picture at the near end and only just fills it at the far
 * one.
 *
 * So the spread is worked out per mote from its own depth, and every one of
 * them lands somewhere the camera can see. Which in turn means the count can
 * come down: 320 motes all in view are denser on screen than 700 with 600 of
 * them off it. */
const BACK_NEAR = -4;     // three units clear of the eye's back face
const FAR_Z = -22;        // well inside the camera's far plane of 100
const CAM_Z = 4.6;        // where eye.js puts the camera
const HALF_FOV = (35 / 2) * (Math.PI / 180);

/* --- And a few motes in FRONT of the eye ---------------------------------
 * Dust in a room is not all behind the subject. A minority drifting between
 * the lens and the eye is what makes the model sit inside the air rather than
 * in front of a field of it.
 *
 * The near limit is where it is because of what perspective does: a mote two
 * units from the camera is drawn enormous. FRONT_NEAR is as close as one can
 * come and still read as a mote instead of a smear. The far limit clears the
 * eye's own front face at z = 1 by four tenths, which is more than the z
 * wander can close, so a foreground mote never sinks into the model on its
 * way past. */
const FRONT_FAR = 1.4;
const FRONT_NEAR = 2.6;

/* The eye is fitted to radius 1 about the origin, so this is its front face.
   Anything nearer the lens than this is drawn over the model. */
const EYE_FRONT = 1;

/* Wider than any real viewport, and then some. The field slides against the
   pointer, so it has to still fill the frame after that shift; and 2.2 covers
   an ultrawide monitor without the near end going sparse. */
const ASPECT = 2.2;
const MARGIN = 1.25;

/* --- AND A FLAT PAD ON TOP, HORIZONTALLY ---------------------------------
 * MARGIN is a multiplier and the parallax is not. The field slides up to 0.9
 * world units against the pointer and each mote wanders another 0.2, and both
 * of those are the same size everywhere: they do not shrink as the frustum
 * narrows toward the lens.
 *
 * Which is fine at the back and wrong at the front. At z = -22 the visible
 * half-width is 19 units and a 1.1 unit slide is nothing. At z = 2 it is 1.3
 * units and a 1.1 unit slide is most of the frame. The seam where a mote wraps
 * round would come into view on a wide monitor, and a mote popping from one
 * edge to the other is the one thing that would give this away.
 *
 * A multiplier cannot fix that, because the problem is not proportional. A
 * constant can. It costs a little coverage at the back, where the band is
 * already wide, and buys the near slab the room it actually needs. */
const PAD = 1.2;

/* Half the width the camera can see at a depth, plus that room. The shader
   needs the same number to wrap a mote, so it is one function and the two can
   never disagree. */
const halfWidthAt = (z) => (CAM_Z - z) * Math.tan(HALF_FOV) * MARGIN * ASPECT + PAD;
const halfHeightAt = (z) => (CAM_Z - z) * Math.tan(HALF_FOV) * MARGIN;

/* WHERE THE LENS IS FOCUSED, and it is deliberately nowhere near the eye.
   Focus on the model and the motes at that depth come out as small hard
   specks over the iris, which reads as dirt on the screen. Set well back, and
   nothing in the field is ever fully sharp: the plane of best focus sits in
   empty space behind the eye, and everything the viewer actually notices is
   on one slope or the other. */
const FOCUS_Z = -6;

/* The blur term is normalised against the far wall, so a mote there is 1.
   Front motes are measured on the same scale, which is why they come out
   soft: at z = 2 they are as far from focus as a mote half way down the
   field. */
const BLUR_SCALE = Math.abs(FAR_Z - FOCUS_Z);

const TICK_MS = 60000;      // the hour, at the same cadence the lighting uses

export function initEyeDust({ THREE, scene, config }) {
  const settings = config?.eye?.dust || {};
  if (settings.enabled === false) return null;

  const count = settings.count ?? 320;

  /* --- The field ---------------------------------------------------------
   * Four attributes, written once and never touched again:
   *   position  where the mote sits before it drifts
   *   seed      a random phase, so no two wander in step
   *   size      a base radius, so the field has grain rather than one dot size
   *   depth     SIGNED. Magnitude is the blur: 0 at the focal plane, 1 at the
   *             far wall. Sign is the side: positive behind the focus,
   *             negative in front of it. One attribute carries both, so the
   *             shader can size a mote by how blurred it is and shape it by
   *             which side of the lens it is on, without a second buffer.
   */
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const depths = new Float32Array(count);

  const backSpan = BACK_NEAR - FAR_Z;   // positive: 18 units of depth
  const frontSpan = FRONT_NEAR - FRONT_FAR;

  /* HOW MANY IN FRONT. Small on purpose. Foreground motes are drawn large by
     perspective and they sit over the iris, which is the brightest thing on
     the page; a handful reads as air, a crowd reads as a dirty lens. */
  const frontShare = settings.front ?? 0.1;
  const frontCount = Math.round(count * frontShare);

  for (let i = 0; i < count; i += 1) {
    let z;
    if (i < frontCount) {
      /* Uniform across the near slab. It is barely two units deep, so there
         is no far-end thinning to correct for. */
      z = FRONT_FAR + Math.random() * frontSpan;
    } else {
      /* Cubed, not uniform. A uniform spread puts as many motes on the far
         wall as near the eye, and because the far ones are dimmer and larger
         the field reads as a fog bank at the back with a gap in front of it.
         Biasing toward the near end fills the space in between. */
      z = BACK_NEAR - Math.pow(Math.random(), 3) * backSpan;
    }

    /* THE FRUSTUM AT THIS DEPTH. Half the height the camera can see at this
       distance, which is the whole reason the field is not a box. It works
       just as well on the near side: at z = 2 the camera sees barely a unit
       of height, so the front motes cluster tight around the axis and pass
       right across the eye rather than round the edges of the frame. */
    const halfH = halfHeightAt(z);
    const halfW = halfWidthAt(z);

    positions[i * 3] = (Math.random() * 2 - 1) * halfW;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * halfH;
    positions[i * 3 + 2] = z;

    seeds[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.5 + Math.random() * 0.9;

    /* MAGNITUDE IS THE BLUR, SIGN IS THE SIDE OF THE EYE.
       The two are measured against different things on purpose. Blur is the
       distance to the focal plane, because that is what an out-of-focus disc
       actually depends on. The sign is the distance to the MODEL, because
       what the shader needs it for is knowing which motes get drawn over the
       iris.

       Measuring the sign against the focal plane instead was the first
       version, and it marked 162 of 320 motes as foreground: everything
       between z = -6 and the lens, which is most of the field. Only the near
       slab should be dimmed and softened, and the near slab is defined by
       where the eye is, not by where the lens happens to be focused. */
    const blur = Math.min(1, Math.abs(z - FOCUS_Z) / BLUR_SCALE);
    depths[i] = z > EYE_FRONT ? -blur : blur;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aDepth", new THREE.BufferAttribute(depths, 1));

  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xbfd0ff) },
    uOpacity: { value: settings.opacity ?? 0.2 },
    uBase: { value: settings.size ?? 9 },      // px at the focal plane, at DPR 1
    uSpread: { value: settings.spread ?? 7 },  // how much a far mote opens up
    uDrift: { value: settings.drift ?? 0.22 }, // world units of wander
    uFlow: { value: settings.flow ?? 0.01 },   // the slow crossing, see below
    uPixelRatio: { value: 1 },

    /* THE FRUSTUM, HANDED TO THE SHADER. Half the visible width at a depth is
       (CAM_Z - z) * x + z. The shader needs it to wrap a mote round the frame
       when it drifts off the edge, and it comes from the same constants the
       distribution used, so the band a mote is placed in and the band it wraps
       in are the same band. */
    uSpanK: {
      value: new THREE.Vector3(
        Math.tan(HALF_FOV) * MARGIN * ASPECT,   // x: grows with depth
        CAM_Z,                                   // y: where the lens is
        PAD,                                     // z: the flat part
      ),
    },

    /* A CEILING ON ONE MOTE. Perspective alone makes a foreground mote large,
       and the blur term makes it larger; without a cap, one unlucky draw sits
       two units from the lens and fills a third of the screen. */
    uMaxSize: { value: settings.maxSize ?? 110 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,          // motes must never occlude one another
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      attribute float aDepth;

      uniform float uTime;
      uniform float uBase;
      uniform float uSpread;
      uniform float uDrift;
      uniform float uFlow;
      uniform float uPixelRatio;
      uniform float uMaxSize;
      uniform vec3 uSpanK;

      varying float vShape;
      varying float vAlpha;

      void main() {
        /* ONE ATTRIBUTE, TWO FACTS. Magnitude is how far from focus, which is
           the blur. Sign is which side, which decides the shape and how much
           the mote is allowed to show. */
        float back = max(0.0, aDepth);      // behind the eye
        float front = max(0.0, -aDepth);    // between the eye and the lens
        float blur = back + front;

        /* THE WANDER, done here so the CPU never touches a vertex.
           Three sines at incommensurable rates: 0.11, 0.09 and 0.07 have no
           common period inside any session, so the path never visibly repeats.
           The seed shifts each mote along its own curve, and multiplying the
           amplitude by the blur means the far ones move further in world
           units and therefore about the same on screen. */
        vec3 p = position;

        /* THE CROSSING. The wander below is a wobble in place; on its own the
           field shimmers but never goes anywhere, and dust that reads as dust
           has to PASS. So each mote also travels steadily along x and wraps at
           the edge of what the camera can see at its own depth.

           The speed scales with distance from the lens, because the frame is
           that much wider out there: without it the far motes would appear to
           crawl and the near ones to race. With it, every mote crosses in
           about the same time, and the seed spreads that time out so they do
           not march in formation. At the default it is roughly three minutes
           from one edge to the other. */
        float halfW = (uSpanK.y - position.z) * uSpanK.x + uSpanK.z;
        float speed = uFlow * (uSpanK.y - position.z)
                    * (0.7 + 0.6 * fract(aSeed * 0.159));
        p.x = mod(p.x + uTime * speed + halfW, 2.0 * halfW) - halfW;

        p.x += sin(uTime * 0.11 + aSeed) * uDrift * (0.4 + blur);
        p.y += cos(uTime * 0.09 + aSeed * 1.7) * uDrift * (0.4 + blur);
        p.z += sin(uTime * 0.07 + aSeed * 2.3) * uDrift * 0.5;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);

        /* THE CIRCLE OF CONFUSION. A point away from the focal plane is drawn
           as a disc whose radius grows with that distance; the blur term is
           already that distance, normalised. The usual 1/-mv.z is still there
           because perspective still applies: a distant blurred mote is a large
           blur seen from far away.

           The front motes get a quarter of the growth. Not because the optics
           differ but because perspective is already doing the work on that
           side: three units from the lens, the 12.0/-mv.z term alone is enough
           to make a mote a soft blob. Give them the full spread as well and
           they stop being motes and become smears. */
        float coc = uBase * (1.0 + back * uSpread + front * uSpread * 0.25) * aSize;
        gl_PointSize = min(coc * (12.0 / -mv.z), uMaxSize) * uPixelRatio;

        /* The same light spread over a bigger disc. Not the true inverse
           square, which takes the far wall to nothing and wastes the geometry
           that is there; the square root of it keeps depth readable while
           still making the back of the field the quietest part.

           THE FRONT MOTES ARE NOT SPECIAL-CASED HERE, and that was measured
           rather than assumed. There were two versions of an extra dimming
           factor on them, on the reasoning that they are the only motes drawn
           over the iris. The first, at 0.32, took their peak alpha to 0.03 and
           they simply were not there: present in the buffer, invisible on the
           screen, which defeats the whole point of a near slab.

           So the frame was read back with and without them, over a lit sphere
           the size of the eye. Undimmed, the brightest pixel any foreground
           mote adds to the model is about eleven levels in 255. It does not
           veil anything, and a factor guarding against something that does not
           happen is a magic number with no job. The falloff below already
           makes them quieter than the sharp middle of the field, because they
           are as far out of focus as a mote half way down it.

           What IS special-cased is their shape, one line down, and that one is
           optics rather than taste. */
        vAlpha = 1.0 / sqrt(1.0 + blur * uSpread);

        /* Only the far side gets the hard-edged disc. See the fragment. */
        vShape = back;

        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;

      varying float vShape;
      varying float vAlpha;

      void main() {
        /* The disc, from the point's own coordinate. No texture: a sprite for
           a soft circle is a file to load and a texture to hold for something
           two lines of maths describe exactly. */
        vec2 uv = gl_PointCoord - 0.5;
        float r = length(uv) * 2.0;
        if (r > 1.0) discard;

        /* A REAL BOKEH DISC IS NOT A GAUSSIAN. It is flat in the middle with a
           bright edge, because the aperture is a hole and its rim concentrates
           light. That is true of the field behind, and vShape brings it in as
           the motes recede.

           It is NOT true of the ones in front. A foreground mote is so far
           outside focus that the disc has spread past any structure it had:
           what is left is a soft smudge. vShape is zero on that side, so they
           get the gaussian and nothing else, which is also the quietest thing
           this shader can draw over the iris.

           The falloff is 2.4 rather than the 3.2 it started at, and the rim
           lift is about a third of what it was. The first version had motes
           with a defined edge, and a defined edge on a dust particle is what
           made the field read as bright specks rather than as air. */
        float gauss = exp(-r * r * 2.4);
        float disc = smoothstep(1.0, 0.78, r) * (0.82 + 0.14 * smoothstep(0.55, 0.95, r));
        float shape = mix(gauss, disc, vShape);

        gl_FragColor = vec4(uColor, shape * vAlpha * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;     // one object filling the view; culling it
                                    // costs a bounds test and never wins
  /* DRAWN LAST, WHICH IS THE ONLY WAY THE NEAR MOTES EXIST.
     It used to be -1, behind everything, which was right when the field was
     entirely behind the eye. It is wrong now. The dust does not write depth,
     so if it draws first the eye paints straight over it and a mote in front
     of the model is invisible: the one thing the front slab is for.

     Drawn last with the depth test still ON, the hardware sorts it for free.
     A mote behind the eye fails the test against the eye's own depth and is
     correctly hidden. A mote in front passes, and composites over it. Two
     behaviours, no branch, no second draw call.

     3 rather than 1 because the eye's glossy film is already at 2. */
  points.renderOrder = 3;
  points.name = "eye-dust";
  scene.add(points);

  /* --- Colour, from the same clock the lights use -------------------------
   * lightingAtHour is imported rather than reimplemented, so the dust cannot
   * drift out of step with the rig: it is reading the same curve, at the same
   * hour, through the same smoothstep.
   *
   * The key light is the sun and the fill is the sky. Dust in air is lit by
   * both, and mostly by the sky, so the mix leans to the fill. Cold blue by
   * day and amber at night falls out of that on its own; nothing here decides
   * a colour, it only borrows one.
   */
  const keyColor = new THREE.Color();
  const fillColor = new THREE.Color();

  /* HOW FAR TOWARD THE SUN. The fill is the sky and stays cool at almost every
     hour; the key is the sun and is where the amber lives, at #ffd9a8 around
     dawn and #ffc98a at dusk. Leaning on the fill gave a field that was blue
     all day and all night, which is harmonised with the rig and says nothing.
     At 0.65 the dust turns amber when the light does and settles cool at noon
     and through the small hours, which is what the rig itself is doing. */
  const warmth = settings.warmth ?? 0.65;

  function relight() {
    const values = lightingAtHour(currentHour(), config.eye.timeOfDay);
    keyColor.set(values.keyColor);
    fillColor.set(values.fillColor);
    uniforms.uColor.value.copy(fillColor).lerp(keyColor, warmth);
  }

  relight();
  const timer = setInterval(relight, TICK_MS);
  /* Same reason the lighting listens: a minute is right for a clock and much
     too slow for a hand on the hour picker. */
  window.addEventListener(OVERRIDE_EVENT, relight);

  /* --- Per frame ----------------------------------------------------------
   * Three uniforms and one position. Everything else is on the GPU.
   */
  let px = 0;
  let py = 0;

  return {
    /* @param ctx the eye's own frame context: dt, time, and the pointer
     *            already mapped to the canvas box in px / py. */
    update(ctx, pixelRatio) {
      uniforms.uTime.value = ctx.time;
      if (pixelRatio) uniforms.uPixelRatio.value = pixelRatio;

      /* THE PARALLAX, AND WHY IT LAGS.
         The eye follows the cursor on config.eye.followEase. This eases at a
         fraction of that, so the field is always still catching up when the
         eye has arrived. That difference IS the parallax: two planes moving at
         one speed read as one plane, however far apart they are.

         It moves the opposite way to the cursor, which is what a background
         does when the viewer's head moves. */
      const ease = (config.eye.followEase ?? 0.06) * 0.35;
      px += (-(ctx.px || 0) - px) * ease;
      py += ((ctx.py || 0) - py) * ease;

      points.position.x = px * (settings.parallax ?? 0.9);
      points.position.y = py * (settings.parallax ?? 0.9);
    },

    /* One call, and there is nothing left of it. */
    destroy() {
      clearInterval(timer);
      window.removeEventListener(OVERRIDE_EVENT, relight);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}

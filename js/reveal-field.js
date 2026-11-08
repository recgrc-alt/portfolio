/* ==========================================================================
   REVEAL FIELD  ·  the liquid patch, composed in one shader pass
   --------------------------------------------------------------------------
   Draws the ENTIRE front statement layer. Where the liquid body falls, two
   different things happen, and which one depends on whether Rogério is there:

     ON HIM   the photograph is left exactly as it is and the sentence is
              simply drawn in front of his face.
     OFF HIM  the page inverts inside the body: the ground turns white and
              the letters turn black.

   The boundary between the two is his own outline, so the cutout draws
   itself against the white. That is the whole idea, and it is his.

   THE RULE THIS FILE EXISTS TO KEEP: the photograph is never touched. Over
   him, every pixel written is multiplied by the sentence's own alpha, so
   there is nothing to paint where there is no letter. The white ground is
   painted only where he is not.

   WHAT WAS TRIED AND THROWN AWAY. A version of this refracted and defocused
   the letters at the rim, meaning to read as a drop of water on the page.
   It read as a warped mirror — a doubled, smeared copy of the type that
   looked like a video fault. Distorting type is not the same as distorting a
   picture: the eye knows the shapes, so every bend is read as damage. Do not
   bring it back.

   HOW THE BODY IS BUILT
     · A ribbon of recent positions, each a ball with its own radius.
     · The head IS the cursor. Everything behind it lags, and sways on a slow
       cycle of its own, which is what stops a quick straight gesture reading
       as a straight-sided tube.
     · THE CHASE RUNS EVERY FRAME, not only when the pointer moves, and that
       is a correction, not a detail. Advancing it inside push() meant the
       ribbon stopped dead the instant the cursor did: the body stayed frozen
       in whatever stretched shape it happened to have, breathing in place,
       while the cursor sat somewhere else entirely. Measured at the time:
       the mass settled 180px behind a motionless cursor and then drifted
       further away. Run every frame, the ribbon collapses onto the head and
       the body relaxes into a ball, which is what a liquid does.
     · THE HEAD IS ALWAYS THE LARGEST BALL. The taper and the breathing are
       both scaled by position along the ribbon, so a trailing ball can never
       swell past the leading one. When it could, the visual centre of mass
       sat in the tail and the shape appeared to lag behind the pointer even
       while it was being dragged.
     · smin() welds the balls together — a smooth minimum, so two bodies fuse
       with no seam instead of overlapping visibly. That fusing is surface
       tension, and no amount of blurring a sprite imitates it.
     · The plane is warped by a slow wave before the field is measured, which
       is what turns round blobs into something abstract rather than bubbly.

   THE WARP IS HELD AT THE CURSOR, and that is not a detail either. Warping
   the whole plane moves the field's centre with it — measured at twenty-odd
   pixels, wandering with time — so the body sat beside the pointer instead
   of under it. Faded to nothing inside the leading ball, the centre is
   pinned and only the edges flow.

   IT HOLDS NO INK. The field is recomputed from the ribbon every frame, so
   nothing accumulates and nothing has to be faded away to stop a veil
   building up over the photograph.

   A SECOND WebGL CONTEXT, AND THAT IS DELIBERATE. reveal-photo.js used to
   say it stayed on 2D canvas to keep this page light next to the eye, which
   was right when it was written. A distance field cannot be evaluated per
   pixel on a 2D canvas without reading an ImageData back every frame, which
   is far worse than the context. Counted on the home page: the eye and the
   depth photo make two, this makes three, and a browser allows roughly
   sixteen. It only runs while the section is on screen, on a pointer device
   — and while that section fills the viewport scene-power.js has the eye
   stopped, so in practice the two never draw in the same frame.
   ========================================================================== */

/* Every number that decides the feel. Tuned against the live photograph at
   the size Rogério settled on. */
const FIELD = {
  points:  10,      // balls in the ribbon — fewer and fatter reads as a body,
                    // where many and thin read as a drawn stroke

  /* THE BODY IS SIZED AGAINST THE TYPE, not against the stage. The statement
     is set at roughly 0.19 of the stage's height, so a body of 0.070 was
     barely wider than one word and every letter it touched went from lit to
     gone across a fraction of its own height. */
  ball:    0.130,   // the head's radius, as a fraction of the stage's height
  blend:   0.115,   // how far apart two balls still fuse — the liquid itself.
                    // Generous on purpose: a tight blend lets a fast gesture
                    // line the balls up into a capsule with straight sides
  edge:    0.022,   // half-width of the rim, in the same units, CENTRED on
                    // the surface so the softness reads on both sides of it
  warp:    0.075,   // how far the plane is bent before the field is read
  sway:    0.045,   // sideways drift of the trailing balls, head excluded —
                    // this is what keeps a straight gesture from being straight
  taper:   0.55,    // how much smaller the last ball is than the head
  lag:     0.28,    // how hard each ball chases the one ahead of it, PER
                    // FRAME. Lower than it looks: this now runs sixty times a
                    // second rather than once per pointer event, and it is
                    // also what decides how fast the body relaxes when the
                    // cursor stops
  breathe: 0.9,     // how much a ball swells on its own — none at the head
};

const VERTEX = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

/* highp WHERE IT EXISTS, and it matters here. The field is built from
   differences between coordinates that both sit around 0.5; in mediump —
   which is half precision on a good deal of hardware — those differences
   quantise to steps coarse enough to band a soft rim into visible rings. */
const FRAGMENT = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  varying vec2 vUv;

  uniform sampler2D uText;    // the sentence, painted once, premultiplied
  uniform sampler2D uHim;     // his outline, dilated — alpha is all we read
  uniform float uHasHim;      // 0 while the outline has not arrived
  uniform vec4  uPhoto;       // where the photograph sits: x, y, w, h in uv
  uniform vec2  uDrift;       // the sentence's own breathing, in uv

  uniform vec3  uPts[${FIELD.points}];   // x, y, radius — head first
  uniform int   uCount;
  uniform float uTime;        // seconds
  uniform float uAspect;      // width / height, so a ball is round
  uniform float uBlend;
  uniform float uEdge;
  uniform float uWarp;
  uniform float uStrength;    // 0 gone … 1 fully present

  /* Smooth minimum. A plain min() leaves a crease where two fields meet;
     this blends them across uBlend, and that blend is the whole effect. */
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  /* Two sine products beating against each other. Cheaper than real noise and
     indistinguishable here, because it is only ever used to bend a boundary
     that is already soft. */
  float wave(vec2 p) {
    return sin(p.x * 3.1 + uTime * 0.70) * sin(p.y * 2.7 - uTime * 0.53)
         + 0.5 * sin(p.x * 6.3 - uTime * 0.41) * sin(p.y * 5.1 + uTime * 0.62);
  }

  void main() {
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 head = uPts[0].xy;

    /* The warp is zero at the cursor and full a couple of radii out. */
    float hold = smoothstep(0.0, uPts[0].z * 2.2, length((vUv - head) * aspect));
    vec2 p = vUv + uWarp * hold * vec2(wave(vUv * 3.0), wave(vUv * 3.0 + 11.7));

    float d = 1e9;
    for (int i = 0; i < ${FIELD.points}; i++) {
      if (i >= uCount) break;
      vec3 ball = uPts[i];
      d = smin(d, length((p - ball.xy) * aspect) - ball.z, uBlend);
    }

    /* Softness CENTRED on the surface rather than running outward from it,
       and smoothed twice so the last of it lingers instead of stepping off. */
    float body = 1.0 - smoothstep(-uEdge, uEdge, d);
    body = body * body * (3.0 - 2.0 * body);
    float mask = body * uStrength;
    if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

    /* The sentence, offset by however far the copy behind the photograph has
       drifted. Only the LETTERS take this offset: the white ground below is
       registered to his outline and must not breathe with the type. */
    vec4 text = texture2D(uText, vUv + uDrift);

    /* Is he here? Outside the photograph's box there is nothing to sample,
       and a texture lookup there would smear its clamped border across the
       stage, so the question is answered false before it is asked.
       WITHOUT THE OUTLINE THE ANSWER IS ALWAYS YES, which is the safe way
       round: a machine that never loads it gets the sentence drawn in front
       of the photograph — the old behaviour — rather than a white rectangle
       painted over Rogério's face. */
    vec2 muv = (vUv - uPhoto.xy) / uPhoto.zw;
    float inside = step(0.0, muv.x) * step(muv.x, 1.0)
                 * step(0.0, muv.y) * step(muv.y, 1.0);
    float him = mix(1.0, smoothstep(0.3, 0.7, texture2D(uHim, muv).a) * inside, uHasHim);

    /* ON HIM: the letters and nothing else. The texture is premultiplied, so
       this already carries its own colour and its own alpha — and its alpha
       is zero everywhere there is no letter, which is what leaves his face
       alone. */
    vec4 onHim = text;

    /* OFF HIM: the whole body, opaque. White where there is no letter, black
       where there is one — which is the page inverted, written directly
       rather than asked of a blend mode, because a blend mode would have
       inverted his face too. Premultiplied, so the colour is already the
       colour times the alpha, and the alpha here is one. */
    vec4 offHim = vec4(vec3(1.0 - text.a), 1.0);

    gl_FragColor = mix(offHim, onHim, him) * mask;
  }`;

/**
 * @param {HTMLCanvasElement} canvas the front layer itself, sized by the caller
 * @returns {{ok: boolean, setText: Function, setHim: Function, setPhoto: Function,
 *            setDrift: Function, push: Function, reset: Function, draw: Function,
 *            release: Function}|null} null when WebGL is refused, which the
 *          caller must treat as "there is no reveal", never as an error.
 */
export function createRevealField(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    /* Premultiplied, which is both the browser's default for compositing a
       canvas and the right space to filter a texture in. The sentence is
       uploaded premultiplied too, so nothing is ever divided by an alpha. */
    premultipliedAlpha: true,
  });
  if (!gl) return null;

  const program = link(gl, VERTEX, FRAGMENT);
  if (!program) return null;
  gl.useProgram(program);

  /* One triangle covering the clip box — cheaper than two, and the corners
     outside it are never rasterised. */
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(program, name);
  const uPts = u("uPts"), uCount = u("uCount"), uTime = u("uTime"),
        uAspect = u("uAspect"), uBlend = u("uBlend"), uEdge = u("uEdge"),
        uWarp = u("uWarp"), uStrength = u("uStrength"),
        uPhoto = u("uPhoto"), uDrift = u("uDrift"), uHasHim = u("uHasHim");

  /* Flipped on upload, once and for all. A canvas counts its rows down from
     the top; a texture's t axis — and vUv with it — counts up from the
     bottom. Doing it here means nothing downstream has to remember. */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  /* CLAMP_TO_EDGE and no mipmaps because the canvases these come from are
     any size at all, not powers of two. */
  const textTex = makeTexture(gl, 0, u("uText"));
  const himTex  = makeTexture(gl, 1, u("uHim"));

  gl.clearColor(0, 0, 0, 0);
  gl.uniform4f(uPhoto, 0, 0, 1, 1);
  gl.uniform2f(uDrift, 0, 0);
  gl.uniform1f(uHasHim, 0);

  /* Where the balls ARE, which the chase writes. */
  const ribbon = new Float32Array(FIELD.points * 3);
  /* Where they are DRAWN: the ribbon plus this frame's sway and swell. Kept
     apart so the decoration never feeds back into the chase and accumulates. */
  const packed = new Float32Array(FIELD.points * 3);

  let headX = 0, headY = 0;     // the cursor, in uv — what the ribbon chases
  let seeded = false;
  let hasText = false;
  let viewW = 0, viewH = 0;

  return { ok: true, setText, setHim, setPhoto, setDrift, push, reset, draw, release };

  /* ------------------------------------------------------------------- */

  /** Hand over the painted sentence. Call on every resize and repaint. */
  function setText(source) {
    if (!source || source.width < 2 || source.height < 2) return;
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    hasText = true;
  }

  /** Hand over his outline, already dilated by the caller. Once is enough. */
  function setHim(source) {
    if (!source || source.width < 2 || source.height < 2) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, himTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(uHasHim, 1);
  }

  /**
   * Where the photograph sits inside this canvas, so the outline can be
   * looked up in the right place. All four in 0..1 of the canvas, with y
   * measured UP from the bottom, the way vUv is.
   */
  function setPhoto(x, y, w, h) {
    gl.uniform4f(uPhoto, x, y, Math.max(w, 1e-4), Math.max(h, 1e-4));
  }

  /** How far the statement behind the photograph has drifted, in uv. */
  function setDrift(x, y) { gl.uniform2f(uDrift, x, y); }

  /** Move the head. `x` and `y` are in canvas pixels, y down from the top. */
  function push(x, y) {
    /* FLIPPED, and nothing else here is. A canvas counts y down from its top
       edge; clip space — and so vUv — counts up from the bottom. Agreeing
       only across the middle of the stage is exactly how a missed flip
       reads: right in the centre, mirrored the further out you go. */
    headX = x / canvas.width;
    headY = 1 - y / canvas.height;

    if (!seeded) {
      for (let i = 0; i < FIELD.points; i++) {
        ribbon[i * 3] = headX;
        ribbon[i * 3 + 1] = headY;
      }
      seeded = true;
    }
  }

  /** Forget the ribbon, so the next stroke does not drag a line across. */
  function reset() { seeded = false; }

  /**
   * @param {number} seconds a clock, for the warp, the sway and the breathing
   * @param {number} strength 0 absent … 1 fully present
   */
  function draw(seconds, strength) {
    if (!seeded || !hasText || canvas.width < 2 || canvas.height < 2) return;

    if (viewW !== canvas.width || viewH !== canvas.height) {
      viewW = canvas.width;
      viewH = canvas.height;
      gl.viewport(0, 0, viewW, viewH);
      gl.uniform1f(uAspect, viewW / viewH);
    }

    /* The chase, back to front, so each ball moves toward where the one ahead
       of it WAS. Every frame — see the note at the head of this file. */
    for (let i = FIELD.points - 1; i > 0; i--) {
      ribbon[i * 3]     += (ribbon[(i - 1) * 3]     - ribbon[i * 3])     * FIELD.lag;
      ribbon[i * 3 + 1] += (ribbon[(i - 1) * 3 + 1] - ribbon[i * 3 + 1]) * FIELD.lag;
    }
    /* The head is the cursor itself, with no easing of its own: easing it too
       left the whole ribbon — and the mass, since the head is the largest
       ball — trailing behind the pointer. */
    ribbon[0] = headX;
    ribbon[1] = headY;

    for (let i = 0; i < FIELD.points; i++) {
      const along = i / FIELD.points;             // 0 at the head, →1 at the tail

      /* Both the taper and the breathing grow along the ribbon, which is what
         guarantees the head stays the biggest ball: at the head the taper is
         nothing and the breathing is nothing, so it is always a full radius
         while everything behind it is always less. */
      const size = 1 - FIELD.taper * along;
      const beat = FIELD.breathe * along;
      const swell = 0.5 + 0.5 * Math.sin(seconds * (0.8 + i * 0.11) + i * 2.399);

      /* Sway, zero at the head and growing down the ribbon. The head must not
         move: Rogério asked for the cursor to sit at the centre of the shape,
         and it is the head that puts it there. */
      const sway = FIELD.sway * along;

      packed[i * 3]     = ribbon[i * 3]     + Math.sin(seconds * 0.9 + i * 2.399) * sway;
      packed[i * 3 + 1] = ribbon[i * 3 + 1] + Math.cos(seconds * 1.1 + i * 1.700) * sway * 0.8;
      packed[i * 3 + 2] = FIELD.ball * size * (1 - beat * 0.5 + beat * swell);
    }

    gl.uniform3fv(uPts, packed);
    gl.uniform1i(uCount, FIELD.points);
    gl.uniform1f(uTime, seconds);
    gl.uniform1f(uBlend, FIELD.blend);
    gl.uniform1f(uEdge, FIELD.edge);
    gl.uniform1f(uWarp, FIELD.warp);
    gl.uniform1f(uStrength, strength);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Hand the context back when the section is torn down. */
  function release() {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function makeTexture(gl, unit, location) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  /* One transparent pixel, so sampling before the real thing arrives is
     defined rather than undefined. */
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 0, 0]));
  gl.uniform1i(location, unit);
  gl.activeTexture(gl.TEXTURE0);
  return tex;
}

/* Compiling is the one place this can fail on a machine we cannot see, so it
   reports rather than throws: a page with no reveal is a page, a page with an
   exception in its scroll handler is not. */
function link(gl, vertexSource, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    console.warn("[reveal-field] shader refused:", gl.getShaderInfoLog(shader));
    return null;
  };

  const vs = compile(gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

  console.warn("[reveal-field] link failed:", gl.getProgramInfoLog(program));
  return null;
}

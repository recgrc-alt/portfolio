/* ==========================================================================
   IRIS SHADER  ·  the whole eye, drawn in one GLSL pass
   --------------------------------------------------------------------------
   The eyeball is a single sphere. This shader paints every region — sclera,
   iris (amber→green with radial fibers), limbal ring and pupil — based on the
   surface direction relative to the eye's local front (+Z). Lighting is a
   cheap Blinn-Phong highlight + fresnel rim that fakes the wet cornea gloss.

   Why one shader instead of the layered Blender meshes?
     · lightest possible eye (one sphere, one draw call);
     · procedural node graphs don't survive glTF export anyway;
     · every color is a uniform, so the look can react to time / mood later.
   The layered GLB stays for heavier mesh effects (wireframe / dissolve) in a
   later phase.
   ========================================================================== */

import * as THREE from "three";


/* --- Vertex: hand the fragment the local direction + world lighting basis - */
export const vertexShader = /* glsl */ `
  varying vec3 vLocalDir;    // direction on the eyeball, in local space
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vLocalDir = normalize(position);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;


/* --- Fragment: region assembly + lighting --------------------------------- */
export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3  uScleraColor;
  uniform vec3  uIrisGreen;
  uniform vec3  uIrisAmber;
  uniform vec3  uLimbal;
  uniform vec3  uPupilColor;
  uniform float uIrisRadius;      // iris coverage (fraction of hemisphere)
  uniform float uPupilRadius;     // pupil coverage (base)
  uniform float uPupilDilation;   // 1 = base size; >1 dilates, <1 contracts
  uniform vec3  uLightDir;
  uniform float uSpecStrength;

  varying vec3 vLocalDir;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  // cheap hash for irregular fibers
  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    vec3 dir = normalize(vLocalDir);

    // Angle from the eye's front axis (+Z). 0 at centre, grows outward.
    float angle = acos(clamp(dir.z, -1.0, 1.0));
    float r = angle / (uIrisRadius * 3.14159265);   // 0 centre .. 1 iris edge

    // Radial fibers: warp the radial coordinate with an azimuthal streak.
    float az = atan(dir.y, dir.x);
    float streak = sin(az * 42.0) * 0.5 + 0.5;
    streak *= hash(floor(az * 18.0));
    r += (streak - 0.5) * 0.06;

    // Iris color: amber near the pupil, green toward the edge, dark limbus.
    vec3 iris = mix(uIrisAmber, uIrisGreen, smoothstep(0.15, 0.90, r));
    iris = mix(iris, uLimbal, smoothstep(0.90, 1.0, r));

    // Region selection by radius.
    float pupilEdge = (uPupilRadius * uPupilDilation) / uIrisRadius;
    vec3 col = uScleraColor;
    if (r <= 1.0) col = iris;
    if (r <  pupilEdge) col = uPupilColor;
    // soften the iris → sclera seam
    col = mix(col, uScleraColor, smoothstep(0.98, 1.06, r));

    // --- Lighting (cheap) ---
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    float diffuse = max(dot(N, L), 0.0);
    float lit = 0.35 + diffuse * 0.9;                 // ambient + key
    float spec = pow(max(dot(N, H), 0.0), 90.0);      // wet highlight
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    vec3 outColor = col * lit + spec * uSpecStrength + fresnel * 0.08;
    gl_FragColor = vec4(outColor, 1.0);
  }
`;


/* --- Sclera material for the GLB model -------------------------------------
 * The eyeball white. glTF can't carry the Blender procedural, so the limbal
 * contact shadow and the faint veins are ported here — the SAME maths we built
 * as nodes (a gaussian ring just outside the iris + margin-masked voronoi
 * veins), now per-pixel and resolution-independent. This is what softens the
 * iris→white transition and stops the white reading as plastic.
 * Front axis is +Z (Blender −Y after the glTF Y-up conversion).               */
export function createScleraMaterial(THREE, config) {
  const s = config.eye.sclera;
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(config.eye.scleraColor),
    roughness: 0.42, metalness: 0.0,
    clearcoat: 0.5, clearcoatRoughness: 0.08,
    sheen: 0.35, sheenColor: new THREE.Color(0xb98a7a), sheenRoughness: 0.6,
    envMapIntensity: 0.5,   // low-ish: let the key MODEL the sphere, but not so
                            // low the shadow side goes pure black
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLimbalCenter   = { value: s.limbalCenter };
    shader.uniforms.uLimbalWidth    = { value: s.limbalWidth };
    shader.uniforms.uLimbalStrength = { value: s.limbalStrength };
    shader.uniforms.uLimbalColor    = { value: new THREE.Color(s.limbalColor) };
    shader.uniforms.uVeinStrength   = { value: s.veinStrength };
    shader.uniforms.uVeinColor      = { value: new THREE.Color(s.veinColor) };

    shader.vertexShader =
      "varying vec3 vScleraLocal;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vScleraLocal = normalize(position);"
      );

    const helpers = /* glsl */ `
      varying vec3 vScleraLocal;
      uniform float uLimbalCenter, uLimbalWidth, uLimbalStrength, uVeinStrength;
      uniform vec3 uLimbalColor, uVeinColor;

      vec3 scHash3(vec3 p){
        p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                 dot(p, vec3(269.5, 183.3, 246.1)),
                 dot(p, vec3(113.5, 271.9, 124.6)));
        return fract(sin(p) * 43758.5453);
      }
      // distance-to-edge voronoi → the thin vein lines
      float scVeinEdge(vec3 p){
        vec3 i = floor(p), f = fract(p);
        float d1 = 9.0, d2 = 9.0;
        for (int x=-1;x<=1;x++) for (int y=-1;y<=1;y++) for (int z=-1;z<=1;z++){
          vec3 g = vec3(float(x),float(y),float(z));
          vec3 o = scHash3(i + g);
          vec3 r = g + o - f;
          float d = dot(r, r);
          if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }
        }
        return sqrt(d2) - sqrt(d1);
      }
    `;

    shader.fragmentShader = helpers + shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        vec3 dir = normalize(vScleraLocal);
        float d = dot(dir, vec3(0.0, 0.0, 1.0));              // 1 at front centre
        // limbal contact shadow: a warm gaussian ring just outside the iris
        float ls = exp(-pow((d - uLimbalCenter) / uLimbalWidth, 2.0)) * uLimbalStrength;
        diffuseColor.rgb = mix(diffuseColor.rgb, uLimbalColor, ls);
        // faint veins, only out at the margins (gone near the iris)
        float margin = smoothstep(0.90, 0.50, d);
        float edge = scVeinEdge(dir * 9.0);
        float veins = (1.0 - smoothstep(0.0, 0.05, edge)) * margin * uVeinStrength;
        diffuseColor.rgb = mix(diffuseColor.rgb, uVeinColor, veins);
      }`
    );
  };

  return mat;
}


/* --- Iris material for the GLB model ---------------------------------------
 * The iris mesh is a real PBR surface (MeshPhysicalMaterial) so it receives
 * the same scene lights, environment reflections and tone mapping as the
 * sclera — no more "self-lit shader that looks plastic next to everything".
 * We only inject the procedural amber→green + fibers into `diffuseColor`.
 * The pupil is a separate mesh, so this draws no pupil.                       */
export function createIrisMaterial(THREE, config) {
  const c = config.eye;
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.35,          // the wet film over the iris
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.55,    // dark studio env → richer without washing out
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uIrisGreen  = { value: new THREE.Color(c.irisGreen) };
    shader.uniforms.uIrisAmber  = { value: new THREE.Color(c.irisAmber) };
    shader.uniforms.uLimbal     = { value: new THREE.Color(c.limbalColor) };
    shader.uniforms.uIrisRadius = { value: c.irisCapRadius };
    shader.uniforms.uIrisBump   = { value: c.irisBump ?? 9.0 };

    shader.vertexShader =
      "varying vec3 vIrisLocal;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vIrisLocal = normalize(position);"
      );

    /* --- helpers prepended to the fragment shader ---------------------------
     * irisHeightFn : the fibre relief as a height field (radial streaks +
     *                concentric crypts), faded out at the pupil and the limbus.
     * irisPerturb  : the standard bump-from-height, tilting the shading normal
     *                by the screen-space gradient of that height. This is what
     *                makes the fibres catch the light like real relief — the
     *                "pull the fibres onto the object" idea, done per pixel. */
    const helpers = /* glsl */ `
      varying vec3 vIrisLocal;
      uniform vec3 uIrisGreen; uniform vec3 uIrisAmber; uniform vec3 uLimbal;
      uniform float uIrisRadius; uniform float uIrisBump;
      const float IRIS_PI = 3.14159265;

      float irisHash(float n){ return fract(sin(n) * 43758.5453123); }

      float irisHeightFn(vec3 d){
        float az  = atan(d.y, d.x);
        float ang = acos(clamp(d.z, -1.0, 1.0));
        float r   = ang / (uIrisRadius * IRIS_PI);
        float seed = irisHash(floor(az * 40.0));
        float fibres = sin(az * 128.0 + seed * 6.2831);
        fibres *= 0.6 + 0.4 * sin(az * 61.0 + seed * 3.0);
        float crypts = sin(r * 54.0) * smoothstep(0.35, 1.0, r);
        float mask = smoothstep(0.06, 0.22, r) * (1.0 - smoothstep(0.88, 1.0, r));
        return (fibres * 0.65 + crypts * 0.35) * mask;
      }

      vec3 irisPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy){
        vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
        vec3 R1 = cross(sy, surfNorm), R2 = cross(surfNorm, sx);
        float det = dot(sx, R1);
        vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
        return normalize(abs(det) * surfNorm - grad);
      }
    `;

    shader.fragmentShader = helpers + shader.fragmentShader
      // 1. Fibre RELIEF: tilt the shading normal by the height gradient.
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float Hc = irisHeightFn(normalize(vIrisLocal));
          vec2 dH = vec2(dFdx(Hc), dFdy(Hc)) * uIrisBump;
          normal = irisPerturb(-vViewPosition, normal, dH);
        }`
      )
      // 2. Fibre GLINT: nudge roughness along the relief so it sparkles.
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(
          roughnessFactor + irisHeightFn(normalize(vIrisLocal)) * 0.14, 0.05, 1.0);`
      )
      // 3. COLOR: amber→green, dark limbus, a darker collarette ring, and
      //    per-fibre brightness variation.
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 d = normalize(vIrisLocal);
          float ang = acos(clamp(d.z, -1.0, 1.0));
          float r = ang / (uIrisRadius * IRIS_PI);
          float az = atan(d.y, d.x);
          float seed = irisHash(floor(az * 18.0));
          float streak = (sin(az * 42.0) * 0.5 + 0.5) * seed;
          float rr = r + (streak - 0.5) * 0.06;
          vec3 col = mix(uIrisAmber, uIrisGreen, smoothstep(0.05, 0.42, rr));
          col = mix(col, uLimbal, smoothstep(0.85, 1.0, rr));
          col *= 1.0 - 0.18 * exp(-pow((rr - 0.34) / 0.06, 2.0));   // collarette
          float fib = sin(az * 120.0 + seed * 6.2831) * 0.5 + 0.5;
          col *= 0.9 + 0.2 * fib;                                   // fibre shade
          diffuseColor.rgb = col;
        }`
      );

    mat.userData.shader = shader;
  };

  return mat;
}


/* --- Uniforms factory ------------------------------------------------------
 * Colors come from config so the 3D eye and the CSS brand stay in sync.
 * (Used by the fallback shader-sphere only.)                                 */
export function createEyeUniforms(config) {
  const c = config.eye;
  return {
    uScleraColor:   { value: new THREE.Color(c.scleraColor) },
    uIrisGreen:     { value: new THREE.Color(c.irisGreen) },
    uIrisAmber:     { value: new THREE.Color(c.irisAmber) },
    uLimbal:        { value: new THREE.Color(c.limbalColor) },
    uPupilColor:    { value: new THREE.Color(c.pupilColor) },
    uIrisRadius:    { value: c.irisRadius },
    uPupilRadius:   { value: c.pupilRadius },
    uPupilDilation: { value: 1.0 },
    uLightDir:      { value: new THREE.Vector3(-0.4, 0.6, 0.85).normalize() },
    uSpecStrength:  { value: 0.6 },
  };
}

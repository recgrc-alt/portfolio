/* ==========================================================================
   PROJECT MODELS  ·  the assets, turned rather than photographed
   --------------------------------------------------------------------------
   A case study on a website has one advantage over a case study anywhere else,
   and it is worth spending something on: the reader can pick the thing up.

   A render of a galleon proves the galleon was made. Turning it proves how it
   was made, and the wireframe underneath proves what it cost.

   THREE READINGS OF THE SAME FILE, no extra download for any of them:
     solid      the model as it ships
     edges      EdgesGeometry above an angle threshold. On voxel work this
                draws block outlines and comes out looking like a plan
     triangles  material.wireframe. The real triangulation, dense and honest.
                This is the one that backs up anything written about vertex
                budgets

   NOTHING DOWNLOADS UNTIL SOMEBODY ASKS. The section paints a poster and a
   button; the renderer, the loader and the first model are all fetched on that
   press. A page that quietly pulls seven megabytes of GLB for a reader who
   scrolled past is worse than a page with no models on it.

   ONE MODEL IN MEMORY AT A TIME. Switching disposes the previous geometry,
   materials and textures before the next arrives.

   THE WHEEL ZOOMS, AND THE PAGE KNOWS.
   Zoom and page scroll both want the wheel. Rather than fight Lenis for it,
   the stage carries data-lenis-prevent, which is Lenis's own way of being told
   that a region handles its own wheel. Over the model you zoom; a pixel
   outside it the page scrolls again, and neither has to know about the other.

   THE ROTATION COMES BACK.
   It turns on its own, stops the moment a hand touches it, and starts again
   once that hand has been still for a while. A model that stops for good after
   the first drag spends the rest of the page facing wherever it was left.
   ========================================================================== */

import { isCompact } from "./viewport.js?v=289";
import { t } from "./i18n.js?v=289";

const MAX_DPR = 1.75;      // a small canvas gains nothing above this
const IDLE_MS = 2600;      // hands off this long and it turns again

/* How close and how far the wheel may take you. Against the FRAMED size of the
   model rather than in world units, so it behaves the same for a galleon and
   for a thumb-sized blob: everything is scaled to the same span on arrival. */
const NEAR = 1.15;
const FAR = 3.2;

export function initModelViewer(host, config = {}) {
  const items = config.items || [];
  if (!host || !items.length) return null;

  let three = null;         // the module namespace, once imported
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let raycaster = null;
  let current = null;       // { root, meshes: [{ mesh, mats, edges }] }
  let frame = 0;
  let visible = true;
  let mode = "solid";
  let index = -1;
  let busy = false;
  let idleTimer = 0;

  /* --- The furniture, built immediately and cheaply ---------------------- */
  const stage = document.createElement("div");
  stage.className = "modelbox__stage";
  /* Lenis's own opt-out. Without it the library swallows the wheel before
     OrbitControls ever sees it, and the model cannot be zoomed at all. */
  stage.setAttribute("data-lenis-prevent", "");

  const poster = document.createElement("div");
  poster.className = "modelbox__poster";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "modelbox__start";
  start.textContent = t("model.load", "Carregar o modelo 3D");

  const weight = document.createElement("span");
  weight.className = "modelbox__weight";
  weight.textContent = config.weightNote || "";

  poster.append(start, weight);
  stage.append(poster);

  const status = document.createElement("p");
  status.className = "modelbox__status";
  status.setAttribute("aria-live", "polite");

  /* HOW TO LOOK AT IT, down the left edge of the stage. Overlaid rather than
     stacked underneath: the model IS the section, and a row of chrome beneath
     it would make it a widget again. */
  const modes = document.createElement("div");
  modes.className = "modelbox__modes";
  modes.hidden = true;

  const modeBtns = [
    ["solid", t("model.solid", "Sólido")],
    ["edges", t("model.edges", "Arestas")],
    ["tris", t("model.tris", "Triângulos")],
  ].map(([key, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "modelbox__mode";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(key === "solid"));
    btn.addEventListener("click", () => setMode(key));
    modes.append(btn);
    return { key, btn };
  });

  /* Which asset. Built now so the reader can see what is in here before
     deciding whether to spend the download. */
  const picker = document.createElement("ul");
  picker.className = "modelbox__picker";

  const pickers = items.map((item, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "modelbox__pick";
    btn.textContent = item.label;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => choose(i));
    li.append(btn);
    picker.append(li);
    return btn;
  });

  const hint = document.createElement("p");
  hint.className = "modelbox__hint";
  hint.textContent = config.hint
    || t("model.hint", "Arrasta para rodar, roda do rato para aproximar");

  stage.append(modes);
  host.append(stage, picker, hint, status);

  /* --- The coordinate readout, for authoring ----------------------------- */
  const hud = makeHud(stage);

  /* --- Booting the runtime, once, on demand ------------------------------ */
  async function boot() {
    if (three) return true;

    status.textContent = t("model.loading", "A carregar…");
    try {
      const [THREE, orbit] = await Promise.all([
        import("three"),
        import("three/addons/controls/OrbitControls.js"),
      ]);
      three = THREE;
      raycaster = new THREE.Raycaster();

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
      renderer.domElement.className = "modelbox__canvas";
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute("role", "img");
      stage.prepend(renderer.domElement);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(
        38, stage.clientWidth / Math.max(1, stage.clientHeight), 0.1, 1000
      );
      camera.position.set(0, 0.6, 2.6);

      /* Enough light to read a shape, and no more. These models carry their
         own vertex colours; this is not the place to relight them. */
      scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 2.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(3, 5, 4);
      scene.add(key);

      controls = new orbit.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;         // panning loses the model off screen
      controls.enableZoom = true;
      controls.zoomSpeed = 0.7;
      controls.minDistance = NEAR;
      controls.maxDistance = FAR;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.9;
      controls.listenToKeyEvents?.(renderer.domElement);

      // Hands on: stop turning. Hands off for a while: start again.
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
        clearTimeout(idleTimer);
      });
      controls.addEventListener("end", () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { controls.autoRotate = true; }, IDLE_MS);
      });
      controls.addEventListener("change", () => hud.update(camera, controls));

      new ResizeObserver(resize).observe(stage);

      /* A viewer that keeps rendering while it is off screen is a viewer that
         drains a battery for nobody. */
      new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) tick(); else stop();
      }, { threshold: 0.05 }).observe(host);

      /* Clicking the model reports where it was clicked, in world units. It is
         the other half of the readout: the camera says where you are looking
         FROM, this says what you were looking AT. */
      renderer.domElement.addEventListener("pointerdown", pick);

      return true;
    } catch {
      status.textContent = t("model.failed", "O visualizador 3D não arrancou.");
      return false;
    }
  }

  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function tick() {
    if (frame || !visible || !renderer) return;
    const loop = () => {
      controls?.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  /* --- Letting go of a model properly ------------------------------------ */
  function release() {
    if (!current) return;
    scene.remove(current.root);
    current.root.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (!m) return;
        // Textures hold the GPU memory; the material alone does not.
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    current = null;
  }

  /* --- Loading one ------------------------------------------------------- */
  async function choose(i) {
    if (busy || i === index) return;
    busy = true;

    if (!(await boot())) { busy = false; return; }

    poster.hidden = true;
    status.textContent = t("model.loading", "A carregar…");
    pickers.forEach((b, n) => b.setAttribute("aria-pressed", String(n === i)));

    const item = items[i];
    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(item.src);

      release();
      const root = gltf.scene;

      /* Centred and scaled to a known span, so models of wildly different
         dimensions all arrive framed the same way and nobody is handed an
         empty canvas with a galleon two metres behind them. It is also what
         lets NEAR and FAR above be two constants rather than two per model. */
      const box = new three.Box3().setFromObject(root);
      const size = box.getSize(new three.Vector3());
      const centre = box.getCenter(new three.Vector3());
      const span = Math.max(size.x, size.y, size.z) || 1;
      const k = 2.4 / span;
      root.scale.setScalar(k);
      root.position.sub(centre.multiplyScalar(k));

      // Kept so the three readings can be switched without touching the file.
      const meshes = [];
      root.traverse((node) => {
        if (!node.isMesh) return;
        meshes.push({
          mesh: node,
          mats: Array.isArray(node.material) ? node.material : [node.material],
          edges: null,
        });
      });

      current = { root, meshes };
      scene.add(root);

      controls.target.set(0, 0, 0);
      camera.position.set(0, 0.6, 2.6);
      controls.autoRotate = true;
      controls.update();
      hud.update(camera, controls);

      applyMode();
      renderer.domElement.setAttribute("aria-label", item.label);
      status.textContent = "";
      index = i;
      modes.hidden = false;
      tick();
    } catch {
      status.textContent = t("model.failed", "Não consegui carregar este modelo.");
    }
    busy = false;
  }

  /* --- The three readings ------------------------------------------------ */
  function setMode(next) {
    mode = next;
    modeBtns.forEach(({ key, btn }) =>
      btn.setAttribute("aria-pressed", String(key === next)));
    applyMode();
  }

  function applyMode() {
    if (!current) return;

    current.meshes.forEach((entry) => {
      const { mesh, mats } = entry;

      // Built the first time edges are asked for, then kept.
      if (mode === "edges" && !entry.edges) {
        entry.edges = new three.LineSegments(
          new three.EdgesGeometry(mesh.geometry, 28),
          new three.LineBasicMaterial({ color: 0xffffff })
        );
        mesh.add(entry.edges);
      }
      if (entry.edges) entry.edges.visible = mode === "edges";

      /* In edges mode the surface is FADED rather than hidden: the lines are
         parented to the mesh, so hiding it would hide them too. */
      mats.forEach((m) => {
        if (!m) return;
        m.wireframe = mode === "tris";
        m.transparent = mode === "edges";
        m.opacity = mode === "edges" ? 0.06 : 1;
      });
    });
  }

  /* --- What was clicked, in world units ---------------------------------- */
  function pick(event) {
    if (!current || !hud.on) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new three.Vector2(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      -((event.clientY - r.top) / r.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(current.root, true)[0];
    if (hit) hud.point(hit.point);
  }

  start.addEventListener("click", () => choose(0));

  return {
    destroy() {
      stop();
      release();
      clearTimeout(idleTimer);
      renderer?.dispose();
      host.replaceChildren();
    },
  };
}

/* ==========================================================================
   THE READOUT  ·  a tool, not a feature
   --------------------------------------------------------------------------
   The galleon is a single unnamed mesh of thirty-four thousand vertices.
   Nothing in it can be addressed by name, so a camera move that frames the
   cannons has to be written down as coordinates, and coordinates have to come
   from somewhere.

   They come from here. Fly the camera to where you want it, read the three
   numbers, press copy, paste them into the JSON. The same panel reports the
   point on the surface you last clicked, which is what deck bounds are made of.

   BEHIND ?dev, because this is authoring equipment. A visitor should never see
   it, and gating it on the URL means it costs a visitor one string comparison
   and nothing else: no panel is built, and the picking is skipped too.
   ========================================================================== */
function makeHud(host) {
  const on = new URLSearchParams(window.location.search).has("dev");
  if (!on) return { on: false, update() {}, point() {} };

  const box = document.createElement("div");
  box.className = "modelbox__hud";

  const fix = (v) => Number(v.toFixed(3));
  const write = (el, v) => { el.textContent = `${fix(v.x)}, ${fix(v.y)}, ${fix(v.z)}`; };
  const read = (el) => {
    const parts = el.textContent.split(",").map((n) => parseFloat(n));
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
  };

  const lines = {};
  [["camera", "camera"], ["target", "target"], ["point", "point · click"]]
    .forEach(([key, label]) => {
      const row = document.createElement("p");
      row.className = "modelbox__hud-row";

      const name = document.createElement("span");
      name.className = "modelbox__hud-key";
      name.textContent = label;

      const value = document.createElement("span");
      value.className = "modelbox__hud-val";
      value.textContent = "—";
      lines[key] = value;

      row.append(name, value);
      box.append(row);
    });

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "modelbox__hud-copy";
  copy.textContent = "copiar JSON";
  copy.addEventListener("click", async () => {
    const json = JSON.stringify({
      camera: read(lines.camera),
      target: read(lines.target),
      point: read(lines.point),
    });
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = "copiado";
      setTimeout(() => { copy.textContent = "copiar JSON"; }, 1400);
    } catch {
      // Clipboard refused: show it instead, so it can be copied by hand.
      copy.textContent = json;
    }
  });

  box.append(copy);
  host.append(box);

  return {
    on: true,
    update(camera, controls) {
      write(lines.camera, camera.position);
      write(lines.target, controls.target);
    },
    point(v) { write(lines.point, v); },
  };
}

/** True where it is worth offering at all. A phone can render this, but it
 *  should never be handed a megabyte it did not ask for on mobile data. */
export function modelsWorthOffering() {
  return !isCompact();
}

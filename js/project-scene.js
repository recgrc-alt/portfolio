/* ==========================================================================
   PROJECT SCENE  ·  the galleon, with its crew aboard
   --------------------------------------------------------------------------
   Not a model viewer. A model viewer shows you a thing; this runs a piece of
   the project itself, in the page, so the mechanics the case study describes
   can be watched rather than read about.

   The ship sits in the middle and the crew walk the deck exactly as they do in
   the game, on the same bounds and with the same collision rules (see
   project-crew.js, which is the game's own file brought over). Press one and
   they stop, turn and look at you, and the text beside the stage becomes about
   them.

   ONE SCENE, ONE LOAD. The ship and three crew arrive together, 1.8 MB in
   four files, and none of it is fetched until the reader presses the button.

   THE READER'S WHEEL BELONGS TO THE MODEL HERE, and only here. The stage
   carries data-lenis-prevent, which is how Lenis is told a region handles its
   own wheel; a pixel outside it the page scrolls again.
   ========================================================================== */

import { isCompact } from "./viewport.js?v=289";
import { t } from "./i18n.js?v=289";
import { makeDeck, Crew } from "./project-crew.js?v=289";

const MAX_DPR = 1.75;
const IDLE_MS = 3200;      // hands off this long and it turns again

export function initProjectScene(host, config = {}) {
  if (!host || !config.ship) return null;

  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let raycaster = null;
  let clock = null;
  let ship = null;
  let crew = [];
  let picked = null;
  let frame = 0;
  let visible = true;
  let running = false;
  let idleTimer = 0;

  /* THE CAMERA MOVE, as three numbers rather than a library.
     `fly` holds where the camera is going and how far through it is; the
     render loop eases it every frame. A tween library for one move would be a
     dependency for four lines of arithmetic. */
  let fly = null;
  let home = null;          // the establishing shot, to come back to

  /* --- The furniture ----------------------------------------------------- */
  const stage = document.createElement("div");
  stage.className = "scene__stage";
  stage.setAttribute("data-lenis-prevent", "");

  const poster = document.createElement("div");
  poster.className = "scene__poster";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "scene__start";
  start.textContent = t("scene.load", "Entrar a bordo");

  const weight = document.createElement("span");
  weight.className = "scene__weight";
  weight.textContent = config.weightNote || "";

  poster.append(start, weight);
  stage.append(poster);

  /* The two ways of looking, top left inside the stage. Text only, with a rule
     under whichever is chosen: the site's own way of saying "this one". */
  const views = document.createElement("div");
  views.className = "scene__views";
  views.hidden = true;

  const viewBtns = [
    ["solid", t("scene.solid", "Solid view")],
    ["tris", t("scene.tris", "Triangle view")],
  ].map(([key, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scene__view";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(key === "solid"));
    btn.addEventListener("click", () => setView(key));
    views.append(btn);
    return { key, btn };
  });

  stage.append(views);

  const hint = document.createElement("p");
  hint.className = "scene__hint";
  hint.textContent = config.hint
    || t("scene.hint", "Press the characters to interact and explore characteristics");

  const status = document.createElement("p");
  status.className = "scene__status";
  status.setAttribute("aria-live", "polite");

  /* --- The panel the picked character talks into ------------------------- */
  const panel = document.createElement("div");
  panel.className = "scene__panel";

  const panelTitle = document.createElement("h3");
  panelTitle.className = "scene__panel-title";

  const panelSub = document.createElement("p");
  panelSub.className = "scene__panel-sub";

  const panelBody = document.createElement("div");
  panelBody.className = "scene__panel-body";

  panel.append(panelTitle, panelSub, panelBody);

  host.append(stage, hint, panel, status);
  showPanel(config.intro);

  /* --- Boot -------------------------------------------------------------- */
  async function boot() {
    if (THREE) return true;
    status.textContent = t("scene.loading", "A carregar…");

    try {
      const [three, orbit] = await Promise.all([
        import("three"),
        import("three/addons/controls/OrbitControls.js"),
      ]);
      THREE = three;
      raycaster = new THREE.Raycaster();
      clock = new THREE.Clock();

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
      renderer.domElement.className = "scene__canvas";
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", config.label || "");
      stage.prepend(renderer.domElement);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(
        36, stage.clientWidth / Math.max(1, stage.clientHeight), 0.1, 1000
      );

      scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(4, 6, 3);
      scene.add(key);

      controls = new orbit.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.zoomSpeed = 0.7;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
      controls.listenToKeyEvents?.(renderer.domElement);

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
      new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) tick(); else stop();
      }, { threshold: 0.05 }).observe(host);

      renderer.domElement.addEventListener("pointerdown", pick);
      return true;
    } catch {
      status.textContent = t("scene.failed", "A cena 3D não arrancou.");
      return false;
    }
  }

  const hud = makeHud(stage);

  /* --- Load the ship, then the crew onto it ------------------------------ */
  async function load() {
    if (running) return;
    running = true;

    if (!(await boot())) { running = false; return; }
    poster.hidden = true;

    try {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();

      const hull = await loader.loadAsync(config.ship);
      ship = hull.scene;
      scene.add(ship);

      /* THE DECK IS A CHILD OF THE SHIP, exactly as in the game. Everything
         below is written in ship-local units, so scaling the ship to fit the
         canvas carries the crew, the bounds and the masts with it and none of
         the numbers have to be touched. */
      const deck = makeDeck(THREE, ship);

      /* Framed AFTER the deck exists but BEFORE the crew arrive, so the shot
         is composed on the hull rather than on wherever somebody happened to
         be standing. */
      frameOn(ship);

      status.textContent = "";
      tick();

      /* AUTHORING HOOK, on the same ?dev switch as the readout. The crew, the
         camera and the controls are closure-local by design; this is the one
         way to step the patrol by hand and see that it walks, which cannot be
         done by looking at the DOM. Never present for a visitor. */
      if (hud.on) {
        window.__scene = {
          THREE, scene, ship, crew, camera, controls,
          /* One frame, by hand. The loop runs on requestAnimationFrame, which
             is exactly what a headless check cannot drive; this is the same
             frame the loop runs, callable. */
          step(delta = 1 / 60) {
            stepFly(delta);
            crew.forEach((one) => one.update(delta, crew));
            controls.update();
            renderer.render(scene, camera);
          },
          flying: () => !!fly,
        };
      }

      // The crew arrive one at a time, so the ship is turning while they land.
      for (const member of config.crew || []) {
        const gltf = await loader.loadAsync(member.src);
        const one = new Crew(THREE, deck, gltf, member.label);
        one.info = member;
        crew.push(one);
      }
    } catch {
      status.textContent = t("scene.failed", "Não consegui carregar a cena.");
    }
    running = false;
  }

  /* Scaled to a known span and centred, so the camera limits below are two
     constants rather than two per model. */
  function frameOn(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z) || 1;
    const k = 3 / span;
    object.scale.setScalar(k);
    object.position.sub(centre.multiplyScalar(k));

    /* FRAMED ON THE DECK, NOT ON THE HULL'S CENTRE. The galleon's own origin
       sits well above its bounding box middle, so centring the box put the
       deck at y = -0.54 and the camera looked at the waterline. Measured. */
    const deckAt = new THREE.Vector3();
    object.children.find((c) => c.isGroup)?.getWorldPosition(deckAt);

    controls.target.copy(deckAt);
    camera.position.set(deckAt.x + 1.4, deckAt.y + 1.5, deckAt.z + 3.4);
    controls.minDistance = 0.35;
    controls.maxDistance = 8;
    controls.update();

    // Kept so releasing a character can come back to exactly this shot.
    home = { pos: camera.position.clone(), target: controls.target.clone() };
    hud.update(camera, controls);
  }

  /* --- Moving the camera ---------------------------------------------------
   * Eased on both ends, and it takes the controls with it: OrbitControls owns
   * the camera, so writing the position without moving the target as well
   * leaves the orbit pivoting around wherever it used to be.
   *
   * The auto-rotation stops for the whole move and comes back on the same idle
   * timer as a drag, so arriving somewhere by clicking behaves exactly like
   * arriving there by hand.
   */
  function flyTo(pos, target, ms = 900) {
    fly = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: pos.clone(),
      toTarget: target.clone(),
      t: 0,
      ms,
    };
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  }

  function stepFly(delta) {
    if (!fly) return;
    fly.t = Math.min(1, fly.t + (delta * 1000) / fly.ms);

    // The site's own ease-out curve, as a number rather than as a bezier.
    const e = 1 - Math.pow(1 - fly.t, 3);

    camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);

    if (fly.t >= 1) {
      fly = null;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { controls.autoRotate = true; }, IDLE_MS);
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
      const delta = Math.min(clock.getDelta(), 0.05);   // a returning tab
      stepFly(delta);
      crew.forEach((one) => one.update(delta, crew));
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  /* --- Picking a crew member --------------------------------------------- */
  function pick(event) {
    if (!crew.length) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      -((event.clientY - r.top) / r.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);

    const hits = raycaster.intersectObjects(crew.map((c) => c.model), true);
    if (hits.length) {
      const one = crew.find((c) => isUnder(hits[0].object, c.model));
      if (one) return choose(one);
    }

    // Clicked the hull, or nothing. Let whoever was held go, and report the
    // point for authoring while we are here.
    const onHull = raycaster.intersectObject(ship, true)[0];
    if (onHull && hud.on) hud.point(onHull.point);
    if (picked) release();
  }

  function isUnder(node, root) {
    let n = node;
    while (n) { if (n === root) return true; n = n.parent; }
    return false;
  }

  /* IN CLOSE, AND ON THEIR EYELINE.
     Measured in the establishing shot, a crew member is 2.7% of the screen
     height: enough to see that somebody is walking, not enough to see who.
     The whole point of being able to press one is to find out, so the camera
     comes in to about a body and a half away and looks at chest height.

     It approaches from where the camera already IS rather than from a fixed
     side, so the move reads as stepping closer rather than as a cut. */
  const CLOSE = 0.55;

  function choose(one) {
    if (picked === one) return;
    if (picked) picked.release();
    picked = one;
    one.hold(camera);
    showPanel(one.info);
    host.classList.add("has-picked");

    const at = new THREE.Vector3();
    one.model.getWorldPosition(at);

    // Chest height rather than feet, worked out from the model's own box so it
    // holds whether it is Silver or the much shorter Morph.
    const tall = new THREE.Box3().setFromObject(one.model).getSize(new THREE.Vector3()).y;
    at.y += tall * 0.6;

    const from = camera.position.clone().sub(at);
    from.y = Math.max(from.y, 0.12);            // never from underfoot
    from.setLength(CLOSE);

    flyTo(at.clone().add(from), at);
  }

  function release() {
    picked?.release();
    picked = null;
    showPanel(config.intro);
    host.classList.remove("has-picked");
    if (home) flyTo(home.pos, home.target, 1100);
  }

  /* One panel, filled from whatever is selected, so there is a single place
     that decides what the words beside the stage are. */
  function showPanel(info) {
    panelTitle.textContent = info?.title || "";
    panelSub.textContent = info?.sub || "";
    panelBody.replaceChildren(
      ...(info?.body || []).map((text) => {
        const p = document.createElement("p");
        p.className = "scene__panel-text";
        p.textContent = text;
        return p;
      })
    );
  }

  /* --- The two readings --------------------------------------------------- */
  function setView(next) {
    viewBtns.forEach(({ key, btn }) =>
      btn.setAttribute("aria-pressed", String(key === next)));
    views.hidden = false;
    scene?.traverse((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => { if (m) m.wireframe = next === "tris"; });
    });
  }

  start.addEventListener("click", () => { load(); views.hidden = false; });

  return {
    destroy() {
      stop();
      clearTimeout(idleTimer);
      crew.forEach((one) => one.dispose());
      crew = [];
      renderer?.dispose();
      host.replaceChildren();
    },
  };
}

/* ==========================================================================
   THE READOUT  ·  authoring equipment, behind ?dev
   --------------------------------------------------------------------------
   The galleon ships as one unnamed mesh, so a camera move that frames the
   cannons has to be written down as coordinates. Fly to the shot, read the
   numbers, copy, paste into the JSON.
   ========================================================================== */
function makeHud(host) {
  if (!new URLSearchParams(window.location.search).has("dev")) {
    return { on: false, update() {}, point() {} };
  }

  const box = document.createElement("div");
  box.className = "scene__hud";

  const fix = (v) => Number(v.toFixed(3));
  const write = (el, v) => { el.textContent = `${fix(v.x)}, ${fix(v.y)}, ${fix(v.z)}`; };
  const read = (el) => {
    const parts = el.textContent.split(",").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
  };

  const lines = {};
  [["camera", "camera"], ["target", "target"], ["point", "point · click"]]
    .forEach(([key, label]) => {
      const row = document.createElement("p");
      row.className = "scene__hud-row";
      const name = document.createElement("span");
      name.className = "scene__hud-key";
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "scene__hud-val";
      value.textContent = "—";
      lines[key] = value;
      row.append(name, value);
      box.append(row);
    });

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "scene__hud-copy";
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

/** A phone should never be handed two megabytes it did not ask for. */
export function sceneWorthOffering() {
  return !isCompact();
}

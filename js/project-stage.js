/* ==========================================================================
   PROJECT STAGE  ·  one model, centred, on the page's own black
   --------------------------------------------------------------------------
   A single object standing in the middle of a section with nothing behind it:
   no frame, no card, no panel. The renderer draws on a transparent buffer, so
   what is behind the model is the section's own background and not a box that
   happens to be the same colour. Turn the page's background to grey tomorrow
   and this follows it, because there is nothing here to update.

   WHY THIS IS NOT project-scene.js. That file runs a piece of the game: the
   galleon with its crew walking the deck under the game's own collision rules,
   a panel that changes when you press one of them, wireframe toggles, a poster
   with a press-to-start. All of that is still wanted, and none of it is wanted
   YET. Rather than gut a working module and put it back together later, this
   is the small version: load the ship, frame it, let it be turned. When the
   crew comes back, this section changes its layout and that file is waiting.

   WHAT IT COSTS, AND WHEN
   Nothing until the reader is nearly there. The model is 1.2 MB and it is not
   fetched on load; an IntersectionObserver starts it as the section
   approaches, the same policy the videos and the slideshows follow. The render
   loop then runs only while the section is on screen, so a galleon far above
   the fold is not turning in a buffer nobody is looking at.

   THE WHEEL BELONGS TO THE MODEL, and only over the model. The stage carries
   data-lenis-prevent, which is how Lenis is told a region handles its own
   wheel; one pixel outside it and the page scrolls again.
   ========================================================================== */

import { isCompact } from "./viewport.js?v=289";
import { t } from "./i18n.js?v=289";
import { uiMark } from "./ui-marks.js?v=289";

const MAX_DPR = 1.75;      // past this the gain is invisible and the cost is not
const IDLE_MS = 3200;      // hands off this long and it turns again

/* HOW MUCH OF THE FRAME THE MODEL IS ALLOWED TO REACH, in normalised device
   coordinates where 1 is the edge. 0.88 leaves six per cent of margin on every
   side, which is enough that a resize never brings a mast up against the
   border — and it is measured against the HULL now rather than against the
   box around it, so the number means what it says. See fit().

   0.90 rather than 0.94, at his ask for slightly less of it. The safety was
   checked rather than assumed at the larger value too: the fit samples sixteen
   azimuths, so the finished framing was re-measured across SIXTY-FOUR, and at
   0.94 the furthest any vertex reached through a full revolution was 0.951.
   Lower is only ever safer. */
const REACH = 0.90;

/* --- The lamps ------------------------------------------------------------
 * Irradiance at the model, not raw intensity. These lights fall off with the
 * square of distance, so an intensity that looks right at one scale is wrong
 * at another; each lamp's intensity is worked out from these and its own
 * distance, which is what lets the whole rig be positioned in multiples of the
 * model's radius and still light a galleon and a crewman identically.
 *
 * The ratios are the drama. A key eighteen times the fill is a hard, single
 * source: one side of the hull is lit and the other is nearly gone, which is
 * what shadows this deep require. A gentle rig would be three or four to one.
 */
const KEY_LEVEL = 3.5;      // the lamp that makes the picture and casts
const RIM_LEVEL = 1.8;      // behind, to cut an edge against the black page
const FILL_LEVEL = 0.10;    // barely there: it only stops the dark side voiding

/* Shadow map resolution. 2048 is the point past which a shadow this size stops
   getting visibly crisper on any screen this box is drawn at. */
const SHADOW_MAP = 2048;

/* Azimuths tested when framing. The model turns, so the shot has to hold at
   every angle, and the widest one is what the distance is set from. Sixteen
   is more than enough for a hull: the projected width of a long object varies
   smoothly, so the samples between these never exceed them by anything the
   margin above does not already cover. */
const AZIMUTHS = 16;

/* WHERE THE CAMERA SITS, as a direction. Only the direction matters here; how
   far along it the camera ends up is measured, not chosen.

   NEARLY BROADSIDE, and the first value was not. It looked from thirty-six
   degrees off the bow, which for a hull whose long axis IS that axis means
   most of the ship was pointing away from the lens: the framing is set from
   the widest angle the model will turn through, so a default shot that is
   much narrower than that angle arrives already small. Measured, the galleon
   filled a third of the width in a frame sized for four fifths of it.

   Sixty-seven degrees off the bow puts the hull almost across the frame, so
   the establishing shot is close to the one the framing was calculated for,
   and seventeen degrees of elevation keeps it from reading as an elevation
   drawing.

   AND THEN TURNED ANOTHER 150 DEGREES, TO SIT STILL IN THE MIDDLE.
   A hull is not symmetric about the axis it turns on — the bowsprit reaches
   forward, the stern castle stands aft — so its silhouette does not stay put
   as it revolves. Measured across a full turn: the centre of the shape swings
   145px on a 1329px canvas, from 79 left of centre to 66 right of it. That is
   the shape, not the framing, and it cannot be removed: re-centring the model
   on the centroid of its own vertices instead of on its bounding box was
   tried, and made it slightly WORSE (153px, and 159px for the full centroid).
   A fixed nudge sideways would centre one angle and push every other one
   further out.

   What CAN be chosen is where it starts. At this azimuth the resting shot sits
   12px right of centre instead of 52px left, and it happens to be the widest
   view of the hull in the whole revolution. */
const VIEW_DIR = [-0.947, 0.26, 0.12];

/* HOW FAR THE SHIP SITS ABOVE THE MIDDLE OF ITS BOX, as a fraction of the
   model's radius. It is applied by lowering the point the camera looks at, not
   by moving the model: an aim point directly below the centre is on the SAME
   vertical axis, so azimuthal rotation still turns the ship about itself and
   nothing swings.

   IT ALSO MAKES THE SHIP BIGGER, which was not the reason for adding it. The
   framing has to survive the angle where the hull spreads furthest up and down
   the screen; tipping the view down a little compresses exactly that spread,
   so the camera can come closer. Measured at 1329 x 720 — 0 gave 47% of the
   the width with 181px of dead space above it, 0.15 gives 55% with about 60px.
   0.18 now, which is as high as it goes usefully: past this the framing pulls
   back to compensate and the ship stops rising, it only leaves more room
   underneath itself. */
const LIFT = 0.18;

/* --- WHERE THE WHEEL BELONGS TO THE MODEL --------------------------------
 * A box this size that takes the whole wheel is a scroll trap: the reader
 * meets it, tries to carry on down the page, and the page will not move. So
 * only a disc in the middle of it zooms, and everywhere else the wheel is the
 * page's, which means there is always a way past on either side.
 *
 * As a fraction of the SHORTER side, so the disc is round on any box and never
 * larger than the box that holds it.
 *
 * AND A SECOND CEILING, AGAINST THE WIDTH. The shorter side alone is not
 * enough once the box stops being wide: on a 2560 screen it comes out 736 by
 * 704, near enough square, and a disc of 0.34 of THAT leaves only 129px of
 * scrollable margin on each side — a strip the reader has to aim at to get
 * past the section. Capping it against the width as well keeps at least a
 * fifth of the box scrollable on either hand, whatever shape it ends up.
 *
 * Measured: 1329x576 stays at 196 and 736x461 at 157, both unchanged; only
 * the near-square case moves, from 239 down to 206. */
/* --- Coming in to look at somebody ---------------------------------------
 * HOW BIG THEY ARRIVE, as a fraction of the frame's height, and the distance
 * is worked back from it per person. The three of them are not the same size
 * — 0.84, 1.12 and 1.56 units — so a single distance would show B.E.N. as a
 * speck and Silver as a portrait. Solving for the fraction instead brings all
 * three in at the same size.
 */
/* HOW MUCH OF THE FRAME'S HEIGHT THE PERSON SHOULD TAKE, and the number is
 * this large because of what a ship is.
 *
 * It was 0.13 — a wide shot, the person small in the middle of the picture —
 * and it could never be had. The distance that gives it is eighteen units, and
 * a crew member standing amidships has under four units of deck before the
 * bulwark; every direction that far out is looking at planking with the person
 * behind it. Measured on all three of them, from the resting shot: not one
 * lateral direction had the clearance, so every inspection ended up looking
 * straight down at the top of somebody's head.
 *
 * The game solves this by not solving it: its inspect screen lifts the model
 * out and stands it in an empty scene. This one keeps them where they are, on
 * the deck, with the ring at their feet — so it has to accept the shot a deck
 * can give, which is a close one from slightly above. Just under half the
 * frame's height is a portrait: head and shoulders and enough of the deck
 * around them to say where they are standing. */
const INSPECT_FILL = 0.48;

/* AND A FLOOR, WHICH IS WHAT WAS MISSING. The distance above is what the shot
 * WANTS; what it got was whatever the hull allowed. approach() stops short of
 * anything in the way, at 0.85 of the clear run, and beside a mast or against
 * the rail that clear run can be under a unit — so the camera came to rest
 * inside the person it was sent to look at.
 *
 * Nothing may put them larger than this fraction of the frame, however tight
 * the spot they are standing in. If every direction is blocked closer than
 * that, the last candidate below looks down from overhead, where a deck has
 * nothing above it and the way is always clear. */
const INSPECT_MAX_FILL = 0.78;

/* The approach is checked against the hull before it is used. If the way out
 * from a crew member is blocked — a mast beside them, the rail behind them —
 * the camera stops short of what it hit rather than passing through it.
 * Measured across 32 positions and angles: 28 were clear the whole way, and
 * the four that were not left as little as 0.78 units. */
const INSPECT_TRIES = [0, -22, 22, -45, 45, -70, 70];   // degrees off the current view

/* AND THE SAME SWEEP AGAIN, HIGHER, WHICH IS THE STEP THAT WAS MISSING.
 * The sweep above only ever turns: it swings the camera around the person,
 * along the deck, at the elevation the reader happened to be watching from.
 * On a ship there is nothing to find down there. A crew member stands with a
 * bulwark at their elbow and a mast at their back, and every one of those
 * seven directions runs into planking within a couple of units — measured,
 * all three of them, from the resting shot: not one lateral direction had the
 * clearance the framing wanted, so every single inspection fell through to the
 * overhead shot and looked down at the top of somebody's head.
 *
 * What a person does with a camera here is not turn, it is LIFT: rise until
 * the rail is below the lens and then look down slightly. So the whole azimuth
 * sweep is run again at each of these elevations, in order, and it stops at
 * the first one with room to spare. Nought is exactly what it did before, so
 * a person standing in the open still gets the reader's own angle. */
const INSPECT_LIFTS = [0, 12, 24, 38, 55];   // degrees above the reader's own line

/* --- HOW HIGH THE LENS MUST STAND, AND WHY IT IS NOT A FRACTION OF ANYBODY
 * The distance above was solved from the person's own height, so that all
 * three arrive the same size. Do that and the camera's HEIGHT comes out
 * proportional to them too - and a bulwark is not proportional to anybody. It
 * is the height it is.
 *
 * Measured, by dropping rays through the whole ship and recording what stands
 * proud of the deck: the waist rails are 0.5 to 0.7 up, and the quarterdeck
 * carries structure at 1.3 and 1.9, topping out at 2.3.
 *
 * And measured again, where the old solve put the lens:
 *     John Silver  (1.56 tall)   2.32 above the deck   - above everything
 *     Jim Hawkins  (1.12)        1.66                  - under the p90
 *     B.E.N.       (0.84)        1.25                  - under the median
 * Which is exactly the report: the tall one right, the short one looking at
 * planking. So the lens gets a floor of its own, in the ship's units, above
 * the highest thing the deck carries. */
const EYE_ABOVE_DECK = 2.35;

/* AND A CEILING ON HOW STEEP THAT MAY GET. Holding both the framing and the
 * eye height fixed would put the shortest of them under a 43-degree camera,
 * looking down at the top of a head. Past this angle the shot backs away
 * instead: they come out a little smaller and seen from a human angle, which
 * is the better half of that trade. */
const INSPECT_MAX_ELEV = 30;   // degrees

const INSPECT_ABOVE = [0, 1, 0.35];   // the true last resort: straight down
const INSPECT_CLEAR = 0.85;   // of whatever clear run is found, to stop short

const FLY_IN_MS = 900;
const FLY_BACK_MS = 1100;

/* The window at rest, in rem, so it scales with the reader's type size the way
   every other measure on this site does. It used to live in the stylesheet;
   it moved here because the camera needs the same number to know where the
   middle of the visible window is, and a number kept in two places is a number
   that will disagree with itself. */
const REST_WINDOW_REM = 52;

/* --- Keeping the reader outside the ship ---------------------------------
 * The zoom floor was one number for every direction, and a galleon is not a
 * ball: 12.05 from the middle to the stern, 5.9 to the rail. A floor that
 * clears the stern is miles off the beam, and a floor tuned to the beam puts
 * the camera in the forecastle. Measured: the floor is 12.72 and the hull
 * reaches 12.05 along the keel line, so a couple of degrees off the bow and
 * the camera is inside the ship's own volume.
 * So the floor is asked of the hull instead, along whatever line the reader is
 * looking down, and it is the LAST surface out rather than the first: the
 * orbit target sits inside the hull, so the first crossing is the near side
 * and being past that is still being inside. Re-measured only when the view
 * has swung about four degrees, which is a handful of casts a second even
 * during a drag. */
const KEEP_STEP = 0.07;      // radians of swing before it measures again
const KEEP_MARGIN = 1.10;    // how far past the last surface it must stand

/* AND THE CAMERA STAYS ABOVE THE DECK LINE AS IT COMES IN.
 * Close and level with the deck, the near bulwark lies straight across the
 * bottom of the frame - unlit, because the lamp is on the far side - and the
 * shot reads as being inside something rather than looking at a ship. The
 * hull is a single mesh of twenty-one thousand triangles, so there is no
 * "bulwark" object to hide; what there is, is an angle. Far out, the reader
 * may drop a little under the horizon and look up at the hull. Coming in,
 * the ceiling tightens until they are looking DOWN over the rail onto the
 * deck, which is the shot that has something in it. */
const POLAR_FAR = 96;        // degrees from straight up, at the framed distance
const POLAR_NEAR = 74;       // and at the closest the reader may come

/* --- Turning the report on ------------------------------------------------
 * Three ways in, because the first attempt at this failed for the dullest
 * possible reason: the address already had a query string, the flag had to be
 * appended to it, and it simply was not there when the console was read. So
 * the query is only one of the doors now. The other two are a hash, which
 * survives being typed at the end of any address, and a stored flag, which
 * survives navigation and reloads and needs no address editing at all:
 *
 *     localStorage.dev = 1     (then reload; localStorage.removeItem("dev") undoes it)
 *
 * A reader who has done none of those runs none of this. */
const DEV = (() => {
  if (typeof location === "undefined") return false;
  if (/(^|[?&])dev(=|&|$)/.test(location.search)) return true;
  if (/(^|#|&)dev(=|&|$)/.test(location.hash)) return true;
  try { return !!localStorage.getItem("dev"); } catch { return false; }
})();
const BUILD_TAG = 210;

const WHEEL_ZONE = 0.34;
const WHEEL_ZONE_MAX_W = 0.28;

/* THE AZIMUTH THE LAMPS WERE TUNED AT.
   The rig below is written in fixed world positions — key off the port bow,
   rim behind, fill low and opposite — and those offsets were chosen while
   looking from one particular direction. Move the resting view and they no
   longer mean the same thing: turning VIEW_DIR 150 degrees put the camera on
   the far side of the key, and the hull went from rgb(82, 59, 40) to
   rgb(51, 41, 34), a median of 29 where it had been 60. The lighting had not
   changed at all; the side being looked at had.

   So the rig is turned to follow. This is the direction the offsets assume,
   and light() rotates the whole group by whatever VIEW_DIR differs from it,
   which means the resting shot is lit identically however that angle is later
   changed — and the ship still turns THROUGH fixed light, which is where the
   drama comes from. */
const LAMP_REF_AZIMUTH = Math.atan2(0.88, 0.37);

/** Narrow screens get a placeholder instead. Same answer project-scene.js
 *  gives, so the two cannot disagree about what a phone is offered. */
export function stageWorthOffering() {
  return !isCompact();
}

/**
 * @param {HTMLElement} host   where to build
 * @param {object} config
 * @param {string} config.src      the .glb to show
 * @param {string} [config.label]  alt text for the canvas
 * @param {string} [config.caption] the line under the model
 * @param {string} [config.captionIcon] the NAME of a mark in ui-marks.js to
 *        set beside that line, e.g. "cube". Not markup: see below.
 * @returns {{destroy: Function}|null}
 */
export function initProjectStage(host, config = {}) {
  if (!host || !config.src) return null;

  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let model = null;
  let frame = 0;
  let visible = false;
  let started = false;
  let idleTimer = 0;
  let watcher = null;
  let sizer = null;
  let loader = null;
  let clock = null;
  let framedDistance = 0;
  let lastOpen = -1;         // so the first frame always writes
  let raycaster = null;      // picking: what the pointer is over
  let probe = null;          // occlusion: what stands between two points
  let picked = null;
  let fly = null;
  let home = null;           // the establishing shot, to come back to

  /* WHERE THE READER WAS STANDING WHEN THEY FIRST PRESSED SOMEBODY, and the
   * answer to both of this build's bugs.
   *
   * Everything about an inspection used to be solved from camera.position, on
   * the reasonable assumption that the camera is where the reader is looking
   * from. It is - right up until the reader is already inspecting somebody, at
   * which point the camera is a hand's breadth from one person's face, deep
   * inside the hull, and is the worst possible reference for anything.
   *
   * It is taken once, on the way in from the free-turning ship, and left alone
   * while they move from person to person. Not `home`: home is the framing
   * this stage arrived at, and the ship has been turning slowly ever since, so
   * by the time anybody presses anything it can be half a revolution away. */
  let resume = null;

  /* THE SHIP WITHOUT ITS PEOPLE, and it exists because of a measurement.
   * makeDeck hangs the deck group off the ship, so the crew, their rings and
   * their pick boxes are all inside `model`. Casting for a clear way out of
   * somebody's chest against `model` therefore starts INSIDE that person's own
   * mesh and hits it at once: measured, every direction at every elevation
   * came back with about a fifth of a unit of room, so every shot fell to the
   * distance floor at whatever angle happened to score highest. That is what
   * made an inspection look like it had gone wrong.
   * Only the hull can block a view of somebody standing on it. Passing crew
   * are excluded on purpose as well as by accident: they walk, and a shot that
   * depends on where a third person happens to be standing is a shot that
   * comes out differently every time. */
  let hull = [];
  let deck = null;           // the crew's parent, and where their bounds live
  let marcas = null;         // the deck's collision rings, built on first ask
  let fazMarcas = null;      // held from the dynamic import, so boxes() can call it
  let hovering = false;
  let holdMin = 0;           // the reader's floor, lifted while a flight runs
  let rightCover = 0;        // px of the box the panel is standing on
  let lastLeft = -1;
  let lastRight = -1;
  let remPx = 16;            // re-read on resize; see shapeWindow
  let keepDir = null;        // the line the floor below was measured along
  let keepOut = 0;           // and what it came to

  /* Reused every frame. A flight allocating four vectors and two quaternions
     sixty times a second is a garbage collector problem wearing a camera.
     Built in boot() rather than here: THREE is null until the module has been
     fetched, so constructing them at this line throws on every page load. */
  let _dir = null;
  let _turn = null;
  let corners = [];          // the sampled hull, kept so a resize can re-solve
  let aimPoint = null;
  let modelRadius = 0;
  let crew = [];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- The furniture ------------------------------------------------------
   * Two elements: the box the canvas goes in, and the line underneath. The
   * caption is a <figcaption> under a <figure> rather than a loose paragraph,
   * because that is what a caption is — it names the thing above it, and the
   * markup should say so.
   */
  const figure = document.createElement("figure");
  figure.className = "project-stage";

  const stage = document.createElement("div");
  stage.className = "project-stage__box";

  const status = document.createElement("p");
  status.className = "project-stage__status";
  status.setAttribute("role", "status");
  status.textContent = "";

  const caption = document.createElement("figcaption");
  caption.className = "project-stage__caption";

  /* --- A MARK BESIDE THE WORDS, NAMED RATHER THAN PASTED ------------------
   * The data says WHICH mark, not what it is made of: "cube", not a path.
   * Drawings belong in a module, not in a content file where nobody would
   * think to look for one, and naming it means the same mark can be reused
   * anywhere without a second copy of it existing.
   *
   * ui-marks.js and not tool-icons.js. The first version of this used the
   * Three.js logo, which was the wrong kind of thing: a product mark next to
   * an instruction reads as attribution, not as an affordance. What the line
   * needs is a picture of the gesture it is asking for.
   *
   * The mark comes back aria-hidden, and rightly: it repeats what the words
   * next to it say, and hearing it twice is worse than not hearing it. */
  if (config.captionIcon) {
    const mark = uiMark(config.captionIcon);
    if (mark) caption.append(mark);
  }

  if (config.caption) caption.append(document.createTextNode(config.caption));

  stage.append(status);
  figure.append(stage);
  if (caption.childNodes.length) figure.append(caption);
  host.append(figure);

  /* --- Boot ---------------------------------------------------------------
   * Three and the controls arrive together; the model follows. Everything is
   * awaited inside one try, so a failure at any step leaves the section with a
   * sentence rather than a broken box.
   */
  async function boot() {
    const [three, orbit] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ]);
    THREE = three;
    _dir = new THREE.Vector3();
    _turn = new THREE.Quaternion();

    /* alpha: true AND NOTHING ELSE. There is no scene.background and no clear
       colour on purpose: every pixel the model does not cover stays at zero
       alpha and the section shows through. That is the whole "no box behind
       it" requirement, and it is one word. */
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);

    /* --- A FILMIC CURVE, NOT A CLAMP ---------------------------------------
     * Without tone mapping the renderer simply cuts anything over 1 to white,
     * so the only way to get a highlight is to push the whole model up until
     * something clips — and then everything below the highlight goes with it.
     * ACES rolls the top end off instead, which is what lets a bright key sit
     * on the deck without the hull turning to paste underneath it.
     *
     * The exposure is above 1 because the model is dark wood on a black page:
     * the whole range in use sits in the bottom half of the scale, and this
     * lifts it into the part of the curve that has contrast in it.
     *
     * BELOW 1, in the end, and that is the fix for the colour. At 1.3 the wood
     * averaged rgb(116, 88, 64) — a pale tan, not the brown the model is
     * painted. The instinct is to darken by turning the key down, and the
     * sweep says otherwise: raising or lowering the key moves the whole hull
     * together, so it goes pale or muddy but never richer. What separates the
     * lit face from the shaded one is the RATIO between them, and that is what
     * a low exposure with a modest key buys.
     *
     * Measured, at 0.95 with the key at 3.5 the average comes out
     * rgb(84, 60, 41), which is wood, and the brightest pixel is 2.34 times
     * the median where before it was 1.99. Darker AND more contrasted, which
     * sounds contradictory and is not: the midtones came down further than the
     * highlights did. */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    /* THE SHADOWS ARE THE POINT, so they are switched on here and the cost is
       accepted. It is one extra pass over one mesh, once per frame, at a size
       nothing else on the page is paying for. PCFSoft rather than the hard
       default: a voxel hull throws hard-edged shadows already, and a stair-
       stepped shadow edge on top of stair-stepped geometry reads as a bug. */
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "project-stage__canvas";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", config.label || "");
    stage.prepend(renderer.domElement);

    scene = new THREE.Scene();
    raycaster = new THREE.Raycaster();

    /* A SECOND ONE, AND IT IS THE FIX FOR THE BUG HE REPORTED.
     * These two ask completely different questions - one walks a short way out
     * of somebody's chest, the other reaches from the camera to the far side
     * of the ship - and near/far are properties of the raycaster, not
     * arguments to the cast. approach() set far to the inspection distance,
     * about five units, and nothing put it back; setFromCamera does not touch
     * near or far. So from the first inspection onward the PICKING ray could
     * only reach five units, and the crew stand between five and thirty-three
     * away. Measured after one inspection: not a single hittable pixel
     * anywhere on the canvas. Pressing a second person did nothing at all,
     * which is the "it bugs out" he described.
     * Restoring the values after each cast would work and would go on working
     * only until somebody added a third caller. Two raycasters cannot tread on
     * each other. */
    probe = new THREE.Raycaster();
    probe.near = 0.01;
    camera = new THREE.PerspectiveCamera(
      36, stage.clientWidth / Math.max(1, stage.clientHeight), 0.1, 1000
    );


    controls = new orbit.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;        // the model stays in the middle
    controls.enableZoom = true;        // the wheel zooms, as he asked
    controls.zoomSpeed = 0.7;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = !reduced;

    /* --- THE HINT HAS DONE ITS JOB ---------------------------------------
     * The caption breathes to say the galleon can be turned. The moment
     * somebody turns it, that sentence is no longer news, and a line that
     * goes on pulsing at a reader who has already obeyed it is nagging.
     *
     * OrbitControls' own `start` event is the honest signal: it fires when a
     * drag, a pinch or a wheel actually begins, and not when the pointer
     * merely crosses the canvas. `once` because there is nothing to say the
     * second time. */
    controls.addEventListener("start", () => {
      figure.classList.add("has-been-touched");
    }, { once: true });
    /* SLOWER THAN A MODEL VIEWER'S DEFAULT, and it does a second job. The
       silhouette swings sideways as the hull turns, for the reason set out at
       VIEW_DIR, and that swing is only noticeable because it moves: at this
       pace it reads as a ship drifting rather than as one that will not sit
       still. About ninety seconds for a full revolution. */
    controls.autoRotateSpeed = 0.22;

    /* Turning stops the moment a hand arrives and comes back a few seconds
       after it leaves, so the model is never fighting the reader for control
       and never sits dead once they have finished with it. */
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      clearTimeout(idleTimer);
    });
    controls.addEventListener("end", () => {
      clearTimeout(idleTimer);
      if (!reduced) idleTimer = setTimeout(() => { controls.autoRotate = true; }, IDLE_MS);
    });

    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    loader = new GLTFLoader();

    model = shipFrame((await loader.loadAsync(config.src)).scene);
    dress(model);
    scene.add(model);

    /* FRAMED ON THE HULL ALONE, on purpose. This runs before the crew are
       fetched, so the shot is measured against the ship and nothing else —
       which is what keeps it stable: four figures walking about a deck would
       otherwise nudge the bounding box every frame and the camera with it. */
    const radius = fit();
    light(radius);

    /* --- WHO GETS THIS WHEEL, DECIDED FROM THE EVENT ITSELF ---------------
     * Capture, on the box, so it runs before anything else can act: the order
     * that follows is canvas (OrbitControls) and then, bubbling on up, window
     * (Lenis). Both are told what to do here, and both are told with their own
     * switch rather than by fighting them.
     *
     *   inside   controls.enableZoom stays on, so OrbitControls dollies and
     *            calls preventDefault; and data-lenis-prevent goes on the box,
     *            which is how Lenis is asked to leave a region alone. The page
     *            stays exactly where it is.
     *
     *   outside  zoom off, so OrbitControls ignores it and does NOT
     *            preventDefault; attribute off, so Lenis takes it and scrolls
     *            the page smoothly, the same as anywhere else on the site.
     *
     * READ FROM THE EVENT, not from a pointermove watched earlier. The reader
     * can scroll the page under a cursor that never moves, which leaves any
     * remembered position stale; a wheel event carries its own clientX and
     * clientY and cannot be out of date. */
    /* ON THE FIGURE, NOT THE BOX, and that is because of the clip. Whatever
       clip-path removes stops being hit-testable, so once the window has
       closed the box no longer receives a wheel over its own dark margins —
       and the flags below would have kept whatever they were last set to,
       leaving Lenis muted and the page unable to scroll. The figure is never
       clipped, so it hears every wheel over the section.

       The disc is still measured from the BOX, and it is always inside the
       window whatever the window is doing: the smallest window is 52rem, half
       of which is 416px, against a disc that never exceeds 206. */
    figure.addEventListener("wheel", (event) => {
      const box = stage.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const radius = Math.min(
        Math.min(box.width, box.height) * WHEEL_ZONE,
        box.width * WHEEL_ZONE_MAX_W
      );
      /* AND THE ZONE STANDS DOWN DURING AN INSPECTION. The controls are off
         while somebody is held, so claiming the wheel here would swallow it
         for nothing and leave the reader unable to scroll off the section
         with the pointer where they were already pointing it. */
      const inside = !picked && Math.hypot(dx, dy) <= radius;

      controls.enableZoom = inside;
      stage.toggleAttribute("data-lenis-prevent", inside);
    }, { capture: true, passive: true });

    /* --- Clicking somebody, and letting them go ---------------------------
     * On click rather than pointerdown, so a drag that starts on a figure
     * rotates the ship instead of selecting them: click only fires when the
     * pointer went down and came up in the same place, which is exactly the
     * distinction wanted. A click on the hull or on nothing releases.
     */
    renderer.domElement.addEventListener("click", (event) => {
      const one = at(event);
      if (one) choose(one);
      else if (picked) release();
    });

    /* The cursor's word changes over a figure, so the reader is told there is
       something to press before they press it. One box test per move, and only
       written when the answer changes. */
    renderer.domElement.addEventListener("pointermove", (event) => {
      const over = !!at(event);
      if (over === hovering) return;
      hovering = over;
      stage.classList.toggle("is-inspectable", over);
    });

    renderer.domElement.addEventListener("pointerleave", () => {
      hovering = false;
      stage.classList.remove("is-inspectable");
    });

    sizer = new ResizeObserver(resize);
    sizer.observe(stage);

    clock = new THREE.Clock();

    /* Not awaited. The ship is already drawable and the loop is about to
       start; the crew join it whenever they finish arriving. */
    boardCrew();
  }

  /* --- The crew, once the ship is standing --------------------------------
   * AFTER, AND DELIBERATELY NOT WITH. The hull is 1.2 MB and the three of them
   * are another 0.65; fetched together the reader waits for all of it before
   * anything appears. Fetched in this order the ship is on screen and framed
   * while the crew are still arriving, and they walk on when they get here.
   *
   * ONE LOADER FOR ALL FOUR FILES. GLTFLoader keeps a parse cache and a
   * DRACO/KTX setup per instance; making one per model throws that away and
   * costs a little more of everything for nothing.
   *
   * THE BEHAVIOUR IS NOT WRITTEN HERE. It is in project-crew.js, which is
   * Tripulacao.js brought over: the bounds, the two masts, the walk speed, the
   * two collision tests and the waits are that file's, checked line by line
   * against the game's. This function only decides WHEN they arrive and what
   * they are made of.
   */
  async function boardCrew() {
    const list = Array.isArray(config.crew) ? config.crew : [];
    if (!list.length || !model) return;

    const { makeDeck, makeDeckHelper, Crew } = await import("./project-crew.js?v=289");
    deck = makeDeck(THREE, model);
    fazMarcas = makeDeckHelper;
    hull = model.children.filter((o) => o !== deck);

    /* Settled one at a time rather than with Promise.all: a crew member that
       fails to load should cost the page that one figure, not the patrol. */
    for (const member of list) {
      const src = typeof member === "string" ? member : member.src;
      if (!src) continue;
      try {
        const gltf = await loader.loadAsync(src);
        dressCrew(gltf.scene);
        const one = new Crew(THREE, deck, gltf, member.label || "");
        /* The panel's copy travels with the figure, so whoever is picked
           already knows what is to be said about them. */
        one.info = member;
        crew.push(one);
      } catch {
        /* One missing file, one fewer figure on deck. */
      }
    }
  }

  /* --- What a voxel export needs before it can be lit ---------------------
   * The crew come out of the same pipeline as the hull and carry the same
   * fault, plus one of their own: their materials arrive with alpha, which on
   * a stack of cubes produces sorting artefacts — a hand drawn behind the
   * chest it is in front of. The game hits exactly this and its answer, in
   * InspectCharacter.js, is to stop treating them as transparent at all and
   * cut the alpha with a threshold instead. That is what is copied here.
   *
   * The shadow disc project-crew.js puts under each of them is skipped, since
   * it is the one thing on the figure that IS meant to be transparent.
   */
  function dressCrew(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (/shadow|sombra/i.test(node.name)) return;

      node.castShadow = true;
      node.receiveShadow = true;

      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!m) continue;
        m.transparent = false;
        m.alphaTest = 0.5;
        m.depthWrite = true;
        m.depthTest = true;
        m.side = THREE.DoubleSide;
        if (m.specularIntensity === 0) m.specularIntensity = 1;
        if (m.roughness >= 1) m.roughness = 0.7;
        m.needsUpdate = true;
      }
    });
  }

  /* --- THE GAME'S OWN FRAME, AND WHY IT CANNOT BE SKIPPED -----------------
   * The crew do not stand on the ship. They stand on a patrol plane at y = 2.1
   * — and 2.1 above WHAT is the whole question, because Tripulacao.js measures
   * it against the frame main.js builds around the hull:
   *
   *     rawModel.position.set(-center.x, -box.min.y, -center.z);
   *     playerModel.add(rawModel);
   *
   * That puts the origin at the ship's horizontal centre and at its KEEL, so
   * 2.1 is the height of the deck above the waterline. This module centres the
   * ship on its bounding-box CENTRE instead, because that is what frames it
   * correctly for a camera — and 2.1 above the middle of a galleon is halfway
   * up the mainmast. Ported numbers are only correct in the frame they were
   * measured in.
   *
   * So the hull is wrapped exactly as the game wraps it, and everything else
   * here operates on the wrapper. fit() then re-centres THAT for the camera,
   * which moves the deck and its crew with it and leaves every number inside
   * untouched. */
  function shipFrame(ship) {
    const box = new THREE.Box3().setFromObject(ship);
    const centre = box.getCenter(new THREE.Vector3());
    ship.position.set(-centre.x, -box.min.y, -centre.z);

    const frame = new THREE.Group();
    frame.name = "ship-frame";
    frame.add(ship);
    return frame;
  }

  /* --- What the export left switched off ---------------------------------
   * The ship arrives as ONE mesh with ONE MeshPhysicalMaterial, and that
   * material comes out of the voxel pipeline with `specularIntensity: 0`.
   * That is not "matte", it is no reflection at all: the surface can only ever
   * return diffuse light, so no light in the scene can put a highlight on it
   * and no amount of moving lamps about will change that. It is also why
   * roughness appeared to do nothing when it was first tried — measured, the
   * frame was byte-identical from roughness 1.0 down to 0.45, because there
   * was no specular lobe for the roughness to sharpen.
   *
   * 1 is the DEFAULT for this material; the exporter is what turned it off. So
   * this is putting a value back rather than inventing one, and at roughness
   * 0.7 it reads as varnished wood rather than as plastic. Measured, it is
   * worth about twelve per cent more tonal spread across the hull.
   *
   * FLAT SHADING IS DELIBERATELY NOT TOUCHED. It looks like the obvious thing
   * to switch on for a voxel model, and it is already unnecessary: the
   * geometry carries seven distinct normal directions across 34 719 vertices,
   * which is hard-edged already. Setting it would recompile the shader to
   * arrive at the same picture.
   */
  function dress(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;

      /* BOTH, ON THE SAME MESH, and that is not a mistake. The ship is a single
         mesh, so every shadow in this picture is the model shadowing ITSELF:
         the masts across the deck, the forecastle over the waist, the rail onto
         the hull below it. Set only castShadow and it throws onto nothing; set
         only receiveShadow and there is nothing to throw. */
      node.castShadow = true;
      node.receiveShadow = true;

      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.specularIntensity === 0) m.specularIntensity = 1;
        if (m.roughness >= 1) m.roughness = 0.7;
        m.needsUpdate = true;
      }
    });
  }

  /* --- Picking somebody off the deck --------------------------------------
   * Against the invisible proxy boxes project-crew.js hangs on each figure,
   * never against the figures themselves: they are skinned meshes, and a
   * raycast into one has to run the skinning for every vertex before it can
   * test a triangle. Three of those on every pointer move would be a cost the
   * page carries for a cursor. Three boxes is three plane tests.
   */
  function at(event) {
    if (!raycaster || !probe || !crew.length) return null;
    const r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;

    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      -((event.clientY - r.top) / r.height) * 2 + 1
    ), camera);

    const hit = raycaster.intersectObjects(crew.map((c) => c.proxy).filter(Boolean), false)[0];
    return hit ? hit.object.userData.crew || null : null;
  }

  /* --- Where the camera can stand to look at them -------------------------
   * IT ASKS THE HULL RATHER THAN ASSUMING. The obvious move is to keep the
   * current direction and dolly in, and most of the time that is fine —
   * measured, 28 of 32 positions and angles had a clear run out. The other
   * four did not: a mast beside them, the rail behind them, and the camera
   * would have ended up inside the ship with the near plane cutting it open.
   *
   * So the way out is cast before it is used. The reader's own direction is
   * tried first, because a move along it reads as stepping closer rather than
   * as a cut; only if that is blocked does it swing, and it swings as little
   * as it can get away with.
   *
   * `from` IS PASSED IN RATHER THAN READ OFF THE CAMERA. Reading the camera
   * was right exactly once - on the first pick. On the second, the camera is
   * beside the previous person, so `out` came out as the axis running from the
   * new person to the old one: a direction along the deck, through masts and
   * rails, ending wherever the ray happened to run out. That was the switching
   * bug. The reference is now the shot the reader actually left behind.
   */
  function approach(chest, want, floor, from, rise) {
    const out = new THREE.Vector3().subVectors(from, chest);
    /* Degenerate only if the reference is inside the person; falling back on a
       fixed axis is better than normalising a zero vector into NaN. */
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    out.normalize();
    const up = new THREE.Vector3(0, 1, 0);

    /* THE LADDER STARTS WHERE THE RAIL ENDS. `rise` is how far above the chest
       the lens has to be to clear the deck's furniture; over `want` that is
       the sine of the shallowest angle allowed. The reader's own direction
       already carries some of it, so only the difference is added, and every
       rung of INSPECT_LIFTS is measured from there. A person standing high
       enough that nothing is in the way adds nothing at all. */
    const precisa = Math.max(0, Math.min(0.98, rise / want));
    const minimo = Math.asin(precisa) - Math.asin(Math.max(-1, Math.min(1, out.y)));
    const base = Math.max(0, minimo);
    let best = null;

    const room = (dir) => {
      probe.set(chest, dir);
      probe.far = want;
      const blocked = probe.intersectObjects(hull, true)[0];
      return blocked ? blocked.distance * INSPECT_CLEAR : want;
    };

    /* Elevation outside, azimuth inside: every direction at the reader's own
       height is tried before any of them is tried higher, so the shot only
       climbs as far as it has to. */
    for (const rung of INSPECT_LIFTS) {
      const lift = base + (rung * Math.PI) / 180;      // radians, from the floor up
      for (const deg of INSPECT_TRIES) {
        const dir = out.clone().applyAxisAngle(up, (deg * Math.PI) / 180);

        if (lift > 1e-4) {
          /* dir × up, not up × dir: the cross product of the two orders point
             opposite ways, and the wrong one digs the camera into the deck
             instead of raising it. Skipped if the direction is already
             vertical, where there is no horizontal axis to turn about. */
          const axis = new THREE.Vector3().crossVectors(dir, up);
          if (axis.lengthSq() > 1e-6) dir.applyAxisAngle(axis.normalize(), lift);
        }

        const r = room(dir);
        if (r >= want) return chest.clone().add(dir.multiplyScalar(want));
        if (!best || r > best.r) best = { dir, r };
      }

      /* Enough to keep the camera out of them. Climbing further would only
         buy a steeper angle nobody asked for. */
      if (best && best.r >= floor) break;
    }

    /* --- WHERE IT ACTUALLY STANDS, AND THE BUG THAT LIVED HERE -------------
     * This used to end with multiplyScalar(Math.max(best.r, floor)), and that
     * Math.max is the whole of the fault he photographed.
     *
     * best.r is the CLEAR RUN: how far the ray got before it met planking,
     * less a margin. floor is how far back the camera must stand for the
     * person not to fill the frame. When the clear run is shorter than the
     * floor - somebody in the waist with the bulwark at their elbow - the max
     * took the floor, and the floor is a distance the ray had already proved
     * was through a surface. The camera was placed a unit or two PAST the hull
     * that had just blocked it, so it came to rest inside the ship with the
     * person behind the planking: a wall of deck across the frame and the
     * figure a dark speck at the top of it.
     *
     * A clear run is not a suggestion. Nothing below multiplies by more than
     * the run it measured.
     *
     * So when no direction at any elevation has the room, the shot goes over
     * the top, where a deck has no ceiling and the run is always long. And if
     * even that were short it stands at the longest run it found and accepts a
     * tighter portrait: too close is a framing complaint, inside the hull is a
     * broken picture, and they are not the same order of wrong. */
    if (!best || best.r < floor) {
      const over = new THREE.Vector3(...INSPECT_ABOVE).normalize();
      const r = room(over);
      if (r > (best ? best.r : 0)) best = { dir: over, r };
    }

    const reach = Math.min(best.r, want);
    return chest.clone().add(best.dir.multiplyScalar(reach));
  }

  function choose(one) {
    if (picked === one) return;

    /* WRITTEN ONCE AND THEN LEFT ALONE UNTIL IT HAS BEEN USED, which is a
       stronger condition than `if (!picked)` and it has to be. Pressing a
       second person is a move within the inspection, so it must not overwrite
       the way out - but neither must pressing somebody DURING the flight back,
       when nobody is picked and the camera is halfway home. That would record
       a spot in mid-air and make it the resting shot. It is cleared where it
       is spent: at the end of a flight with nobody held. */
    if (!resume) {
      resume = { pos: camera.position.clone(), target: controls.target.clone() };
    }

    if (picked) picked.release();
    picked = one;

    const chest = new THREE.Vector3();
    one.model.getWorldPosition(chest);
    chest.y += (one.height || 0.9) * 0.6;      // eyeline, not feet

    /* Solved from this person's own height, so all three arrive the same size
       in frame however tall they are. */
    const half = (one.height || 0.9) / 2 / Math.tan((camera.fov * Math.PI) / 180 / 2);
    const floor = half / INSPECT_MAX_FILL;

    /* Their own feet are the deck under them - measured, all three models have
       their origin on the sole - so this reads the local deck rather than a
       constant, and stays right if somebody walks up to the quarterdeck. */
    const feet = new THREE.Vector3();
    one.model.getWorldPosition(feet);
    const rise = feet.y + EYE_ABOVE_DECK - chest.y;

    /* The framing asks for one distance; clearing the rail without tipping the
       camera past INSPECT_MAX_ELEV asks for another. The shot takes whichever
       is further out, so the angle stays human and only the size gives. */
    const enquadra = half / INSPECT_FILL;
    const desce = rise > 0 ? rise / Math.sin((INSPECT_MAX_ELEV * Math.PI) / 180) : 0;
    const want = Math.max(enquadra, desce);

    const spot = approach(chest, want, floor, (resume || home || camera).pos, rise);

    /* TURNED TOWARD WHERE THE CAMERA IS GOING, NOT WHERE IT IS, and the order
       of these two lines is the whole of it. hold() used to be called first,
       so it faced them at the camera's current position - which on a switch is
       beside the person they were just looking at. They turned their back on
       the shot as it arrived. The spot is solved first now, and they are told
       about it. */
    one.hold(camera, spot);

    flyTo(spot, chest, FLY_IN_MS);
    if (DEV) report(one, chest, spot);
    if (typeof config.onPick === "function") config.onPick(one);
  }

  /* --- What the shot actually came out as ---------------------------------
   * Three rounds of this were spent reading screenshots and inferring, and
   * being wrong three times. A picture cannot say how far the camera stood,
   * how high it was, or whether anything is between it and the person; the
   * page can say all three, and it costs nothing to ask it.
   *
   * Only under ?dev, so a reader never pays for it. Everything here is
   * measured after the solve and before the flight, which is the moment the
   * decision was made.
   */
  function report(one, chest, spot) {
    const d = spot.distanceTo(chest);
    const half = (one.height || 0.9) / 2 / Math.tan((camera.fov * Math.PI) / 180 / 2);

    /* Is the person visible from where the camera is going? Cast the whole way
       there, less a hair, so their own mesh does not answer for the hull. */
    const dir = new THREE.Vector3().subVectors(chest, spot);
    probe.set(spot, dir.clone().normalize());
    probe.far = dir.length() * 0.97;
    const bloqueio = probe.intersectObjects(hull, true)[0];

    console.log(
      `%c▲ stage · ${one.label || "?"}`,
      "color:#8cbe69;font-weight:bold",
      {
        build: BUILD_TAG,
        distancia: +d.toFixed(2),
        elevacao_graus: +((Math.asin((spot.y - chest.y) / d) * 180) / Math.PI).toFixed(1),
        fraccao_do_ecra: +(half / d).toFixed(2),
        altura_da_pessoa: +(one.height || 0).toFixed(2),
        acima_do_convés: +(spot.y - (chest.y - (one.height || 0.9) * 0.6)).toFixed(2),
        tapado_por: bloqueio ? +bloqueio.distance.toFixed(2) : "nada",
        comandos_ligados: controls.enabled,
      }
    );
  }

  function release() {
    if (!picked) return;
    picked.release();
    picked = null;

    /* A PULL-BACK, WHICH MEANS BACK TO THE SHOT THEY LEFT.
       This flew to `home` - the framing solved when the stage first opened. It
       is a real flight and always was, but the ship turns on its own at about
       a revolution and a half a minute, so by the time anybody presses GO BACK
       the recorded shot is usually on another side of the hull. What played
       was a second and a bit of swinging round the ship, which reads as the
       scene changing rather than as the camera stepping back.
       `resume` is the angle they were watching from, so the way out retraces
       the way in: the same distance opening up again, nothing else moving. */
    const back = resume || home;
    if (back) flyTo(back.pos, back.target, FLY_BACK_MS);
    /* stepFly is what turns the controls back on, so a release with nowhere
       to fly to has to do it here or the ship would stay frozen. */
    else controls.enabled = true;

    if (typeof config.onRelease === "function") config.onRelease();
  }

  /* --- The move itself -----------------------------------------------------
   * Three numbers and a curve rather than a tween library. While a flight is
   * running the controls are told to stand still, and the limits are lifted
   * for its duration: the floor exists to stop the READER dollying into the
   * hull, and a scripted move that has already checked its own path is not
   * the thing it was written to prevent.
   */
  function flyTo(pos, target, ms) {
    /* --- WHY THIS IS AN ARC AND NOT A LINE --------------------------------
     * Interpolating between two positions draws a straight line through the
     * world, and the world here has a ship in it. Coming back from somebody on
     * the deck to a shot thirty units out, that line leaves through the hull:
     * a closed voxel hull lit from outside is black inside, so the reader got
     * roughly a second of black screen before the scene reappeared. That is
     * the "fica toda preta" he reported, and it was never a fade.
     * Turning and distance are separated instead. The direction from the
     * target is slerped, the distance is interpolated on its own, and because
     * distance starts growing immediately the camera leaves the hull on the
     * first frames and swings round the outside for the rest of the move. It
     * is also simply the better shot: a pull-back that arcs reads as a camera
     * on a crane, where the straight line read as a cut. */
    const from = new THREE.Vector3().subVectors(camera.position, controls.target);
    const to = new THREE.Vector3().subVectors(pos, target);
    const r0 = from.length();
    const r1 = to.length();

    fly = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: pos.clone(),
      toTarget: target.clone(),
      /* Degenerate only if a flight is asked to end where it starts, where
         any axis will do because nothing turns. */
      from: r0 > 1e-4 ? from.divideScalar(r0) : new THREE.Vector3(0, 0, 1),
      to: r1 > 1e-4 ? to.divideScalar(r1) : new THREE.Vector3(0, 0, 1),
      r0,
      r1,
      t: 0,
      ms,
    };
    fly.turn = new THREE.Quaternion().setFromUnitVectors(fly.from, fly.to);
    /* --- THE CONTROLS ARE OFF FOR THE DURATION, AND THIS IS THE FIX --------
     * The limits below are lifted so a scripted move can pass where the reader
     * may not, and stepFly puts them back only when the flight ends with
     * nobody held. Which meant that for the whole of an inspection the reader
     * was orbiting a camera whose floor was a hundredth of a unit and whose
     * ceiling was Infinity. Measured: three turns of the wheel took the camera
     * from 2.89 units off B.E.N. to six thousand two hundred and eighty-six,
     * straight out through the hull on the way. That is the shot he
     * photographed - the deck from underneath, with the hull across the frame.
     *
     * A held figure is posed for ONE shot: they turned to face where the
     * camera was going and they stay there, so orbiting them shows their back
     * and dollying out shows the inside of a ship. There is nothing there to
     * be found by moving, so the controls stop taking input until the reader
     * lets go. Clicking is unaffected - that listener is ours, on the canvas -
     * so another figure can still be pressed, and GO BACK is a button. */
    controls.enabled = false;

    controls.autoRotate = false;
    clearTimeout(idleTimer);
    controls.minDistance = 0.01;
    controls.maxDistance = Infinity;
    /* The angle ceiling comes off too, for the same reason the distance
       limits do: a move that has checked its own path is not the thing those
       limits were written to prevent, and a ceiling closing on a camera that
       is already moving would drag it sideways mid-flight. */
    controls.maxPolarAngle = Math.PI;
    keepDir = null;            // the floor is re-measured wherever it lands
  }

  function stepFly(delta) {
    if (!fly) return;
    fly.t = Math.min(1, fly.t + (delta * 1000) / fly.ms);

    // The site's own ease-out curve, as a number rather than as a bezier.
    const e = 1 - Math.pow(1 - fly.t, 3);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);

    /* Turn and distance, separately. At e = 1 the quaternion is the full turn
       and the radius is exactly r1, so this lands on toPos to the last decimal
       rather than near it. */
    _turn.identity().slerp(fly.turn, e);
    camera.position
      .copy(fly.from)
      .applyQuaternion(_turn)
      .multiplyScalar(fly.r0 + (fly.r1 - fly.r0) * e)
      .add(controls.target);

    if (fly.t < 1) return;
    fly = null;

    /* Back at the establishing shot, the controls get their limits and their
       drift back. Held on somebody, they keep neither: the reader is looking
       at a person, and a ship that started turning under them would take the
       person out of frame. */
    /* WHERE IT ACTUALLY CAME TO REST, under ?dev. The line report() prints is
       the spot the solve chose; this is the spot the flight delivered. They
       have to agree, and when a screenshot shows a person four times smaller
       than the solve says, the question is which of the two lied. */
    if (DEV && picked) {
      const feet = new THREE.Vector3();
      picked.model.getWorldPosition(feet);

      /* WHERE THE DRAWN BODY IS, as opposed to where the origin is. A skinned
         mesh is wherever its bones put it; the origin is wherever the code put
         the model. Everything in this file aims at the origin plus a fraction
         of the height, so if the two disagree the camera aims at air and the
         person ends up at the edge of the frame. Measured on the posed mesh,
         then projected, so the numbers say where on the screen each one lands:
         0 is the middle, +1 the top edge, -1 the bottom. */
      const posed = new THREE.Box3();
      picked.model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        o.computeBoundingBox();
        const bb = o.boundingBox;
        for (const X of [bb.min.x, bb.max.x])
          for (const Y of [bb.min.y, bb.max.y])
            for (const Z of [bb.min.z, bb.max.z])
              posed.expandByPoint(new THREE.Vector3(X, Y, Z).applyMatrix4(o.matrixWorld));
      });
      const centro = posed.getCenter(new THREE.Vector3());

      /* ONE FLAT LINE, AND THAT IS NOT A STYLE CHOICE. The console folds an
         object after five fields and hides the rest behind an ellipsis, so the
         two round trips before this one came back with exactly the numbers I
         already knew and none of the ones I needed. A string cannot be folded. */
      const px = (v) => {
        const q = v.clone().project(camera);
        return { x: (q.x + 1) / 2 * stage.clientWidth, y: (1 - q.y) / 2 * stage.clientHeight };
      };
      const cantos = [];
      for (const X of [posed.min.x, posed.max.x])
        for (const Y of [posed.min.y, posed.max.y])
          for (const Z of [posed.min.z, posed.max.z])
            cantos.push(px(new THREE.Vector3(X, Y, Z)));
      const xs = cantos.map((q) => q.x);
      const ys = cantos.map((q) => q.y);
      const n = (v) => Math.round(v);

      const cv = renderer.domElement;
      const alvoPx = px(controls.target);
      const view = camera.view;

      console.log(
        `▲ stage · chegou · ${picked.label || "?"}` +
        ` | d=${camera.position.distanceTo(controls.target).toFixed(2)}` +
        ` acima=${(camera.position.y - feet.y).toFixed(2)}` +
        ` alvo-peito=${controls.target.distanceTo(feet.clone().setY(feet.y + (picked.height || 0.9) * 0.6)).toFixed(2)}` +
        ` | malha pes=${(posed.min.y - feet.y).toFixed(2)} topo=${(posed.max.y - feet.y).toFixed(2)}` +
        ` desvio=${Math.hypot(centro.x - feet.x, centro.z - feet.z).toFixed(2)}` +
        ` | PIXEIS corpo x=${n(Math.min(...xs))}..${n(Math.max(...xs))}` +
        ` y=${n(Math.min(...ys))}..${n(Math.max(...ys))}` +
        ` alvo=${n(alvoPx.x)},${n(alvoPx.y)}` +
        ` | caixa=${n(stage.clientWidth)}x${n(stage.clientHeight)}` +
        ` css=${n(parseFloat(cv.style.width) || cv.clientWidth)}x${n(parseFloat(cv.style.height) || cv.clientHeight)}` +
        ` buf=${cv.width}x${cv.height} pr=${renderer.getPixelRatio()}` +
        ` | fov=${camera.fov} aspect=${camera.aspect.toFixed(3)} near=${camera.near.toFixed(2)} far=${camera.far.toFixed(1)}` +
        ` | view=${view && view.enabled ? `${n(view.fullWidth)}x${n(view.fullHeight)} sub ${n(view.width)}x${n(view.height)} @${n(view.offsetX)},${n(view.offsetY)}` : "off"}` +
        ` | segurada=${picked.held} comandos=${controls.enabled}`
      );
    }

    if (!picked) {
      /* Spent. The camera is standing where the reader left it, so the note
         saying where that was has done its job; the next inspection takes a
         fresh one. */
      resume = null;
      controls.enabled = true;
      controls.minDistance = holdMin;
      controls.maxDistance = framedDistance;
      if (!reduced) {
        idleTimer = setTimeout(() => { controls.autoRotate = true; }, IDLE_MS);
      }
    }
  }

  /* --- The lamps, once the model's size is known --------------------------
   * NO SUN AND NO AMBIENT, at his ask, and the difference is not cosmetic.
   *
   * A DirectionalLight is a sun: parallel rays, no falloff, the same strength
   * at the bow as at the stern. It is the light of an overcast afternoon and
   * it cannot make drama, because drama in lighting is a FALLOFF — the fact
   * that one part of a thing is much closer to the lamp than another. A
   * HemisphereLight is worse for this: it fills from every direction at once,
   * which is precisely what deletes a shadow.
   *
   * So the picture is made by a single spot standing off to one side, with
   * decay 2, which is the inverse-square law. Near the lamp the deck is hot;
   * away from it the hull rolls off into the page. Nothing else in here is
   * allowed to compete with it: the rim is behind and only draws an edge, and
   * the fill is a twentieth of the key, enough that the shadow side is very
   * dark rather than a hole.
   *
   * PLACED IN MULTIPLES OF THE MODEL'S RADIUS, and lit in irradiance rather
   * than intensity, so the same rig lights anything this module is pointed at.
   * With decay 2 the intensity a lamp needs is its target irradiance times the
   * square of its distance, which is the one line of arithmetic below.
   */
  function light(radius) {
    const rig = new THREE.Group();
    rig.name = "stage-lights";

    /* Turned to keep the lamps in the same relationship to the resting view
       that they were tuned in. See LAMP_REF_AZIMUTH. */
    rig.rotation.y = Math.atan2(VIEW_DIR[0], VIEW_DIR[2]) - LAMP_REF_AZIMUTH;

    /* Every lamp aims at the origin, which is where fit() put the model. The
       target has to be IN the scene: a SpotLight reads its direction from the
       target's world matrix, and an object outside the graph never gets one. */
    const aim = new THREE.Object3D();
    rig.add(aim);

    const place = (lamp, x, y, z, level) => {
      lamp.position.set(x, y, z).multiplyScalar(radius);
      lamp.intensity = level * lamp.position.lengthSq();
      if (lamp.isSpotLight) lamp.target = aim;
      rig.add(lamp);
      return lamp;
    };

    /* THE KEY. High, forward, off the port bow, and the only lamp that casts.
       The cone is wide enough to hold the whole ship with the penumbra falling
       across the far end of it, which is what makes the stern sit back. */
    const key = new THREE.SpotLight(0xffe9cc, 1, 0, 0.58, 0.5, 2);
    place(key, 1.35, 1.85, 1.05, KEY_LEVEL);
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    key.shadow.camera.near = radius * 0.4;
    key.shadow.camera.far = radius * 8;
    /* A voxel hull is all coplanar faces, which is the worst case for shadow
       acne: a face lit at a grazing angle shadows itself along its own plane.
       normalBias pushes the lookup along the surface normal and is the fix that
       does not also detach the shadow from its object; it is scaled to the
       model so it means the same thing at any size. */
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = radius * 0.012;
    key.shadow.radius = 2.5;

    /* THE RIM. Behind and above, cool, no shadow. Its whole job is to run a
       line of light along the top of the hull and down the masts so the ship
       has an edge against a page that is the same colour as its own shadows. */
    place(new THREE.SpotLight(0xcfe0ff, 1, 0, 0.7, 0.6, 2), -1.5, 1.1, -1.9, RIM_LEVEL);

    /* THE FILL, and it is deliberately almost nothing. A point rather than a
       spot because it is not shaping anything, only keeping the dark side from
       going to absolute black and taking the silhouette with it. */
    place(new THREE.PointLight(0x8098c0, 1, 0, 2), -1.2, -0.3, 1.4, FILL_LEVEL);

    scene.add(rig);
  }

  /* --- Solving for the distance ------------------------------------------
   * Separate from fit() because it has two callers now. fit() runs it once on
   * arrival; resize() runs it again whenever the box changes shape, because
   * the framed distance IS the zoom ceiling and a narrower box needs the
   * camera further out to hold the same ship. Left inside fit(), a resize
   * would have cropped the galleon with no way for the reader to pull back.
   *
   * It reads the camera's current aspect and leaves the camera where it found
   * it: only the number is wanted. */
  function solveDistance() {
    const dir = new THREE.Vector3(...VIEW_DIR).normalize();
    const spin = new THREE.Vector3();
    const point = new THREE.Vector3();
    const kept = camera.position.clone();
    const keptNear = camera.near;
    const keptFar = camera.far;

    /* Start outside the model and walk in. The sphere radius is always far
       enough to see all of it, whatever the angle, so the first pass can only
       ever move the camera closer. */
    let distance = modelRadius * 3;

    for (let pass = 0; pass < 2; pass += 1) {
      let worst = 0;

      for (let i = 0; i < AZIMUTHS; i += 1) {
        const a = (i / AZIMUTHS) * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        spin.set(dir.x * cos - dir.z * sin, dir.y, dir.x * sin + dir.z * cos);

        camera.position.copy(spin).multiplyScalar(distance).add(aimPoint);
        camera.lookAt(aimPoint);
        camera.updateMatrixWorld(true);
        /* The near and far planes have to admit the whole model before
           anything is projected, or a corner behind the near plane comes back
           as nonsense and drags the fit with it. */
        camera.near = Math.max(0.01, distance - modelRadius * 2);
        camera.far = distance + modelRadius * 2;
        camera.updateProjectionMatrix();

        for (const c of corners) {
          point.copy(c).project(camera);
          worst = Math.max(worst, Math.abs(point.x), Math.abs(point.y));
        }
      }

      if (worst > 0) distance *= worst / REACH;
    }

    /* --- PUT THE CAMERA BACK THE WAY IT WAS FOUND -------------------------
     * This function measures; it must not leave a mark. It borrows the real
     * camera to project with, and the loop above writes near and far on every
     * pass as scratch values. The position was already restored. The planes
     * were not, and that omission is the whole of the bug he photographed.
     *
     * fit() got away with it, because it sets both planes itself immediately
     * afterwards. resize() did not: it calls this and then corrects only far,
     * so from the first time the window changed size the near plane stayed at
     * the last scratch value - distance minus twice the model radius, about
     * 4.1 units on this ship. Everything nearer than that is clipped away, and
     * an inspection stands the camera 2.7 to 5 units off somebody. The tall
     * one survived at 5.00 and the two short ones, at 3.59 and 3.69, were
     * simply cut out of the picture along with the deck around them - which is
     * exactly what "the camera goes inside something" looks like.
     *
     * Reported from his machine: near=4.13. From mine, where no resize had
     * happened: near=0.25. Same build, same numbers everywhere else. */
    camera.position.copy(kept);
    camera.near = keptNear;
    camera.far = keptFar;
    camera.updateProjectionMatrix();
    return distance;
  }

  /* --- Centre it, then find the distance by projecting it ----------------
   * IT MEASURES RATHER THAN APPROXIMATES, and the two attempts before this one
   * are the argument for doing so.
   *
   * The first fitted the bounding SPHERE. That is the shape which contains the
   * model from every angle, and around a galleon it is mostly empty air: long,
   * low and thin, its sphere is enormous compared with anything you ever see.
   * The ship came out filling a quarter of the width.
   *
   * The second fitted the CYLINDER the model sweeps as it turns, which is far
   * tighter and still safe through a revolution. It was cropped along the
   * bottom edge, because a cylinder is only the right shape for a camera that
   * looks horizontally. This one looks DOWN, and a hull twenty-four units long
   * projects a good deal of that length onto the vertical axis of the screen.
   * Measured: no margin at all below, ninety pixels above.
   *
   * Every fix for that is another term in a formula that is trying to predict
   * what the projection matrix is about to do. So this asks it instead. The
   * eight corners of the bounding box are projected through the real camera at
   * sixteen azimuths, the largest coordinate any of them reaches is taken, and
   * the distance is scaled until that number is REACH. Two passes converge,
   * because in normalised device coordinates the extent falls off very nearly
   * as one over the distance.
   *
   * Nothing in here knows it is looking at a ship. Point it at the crew, a
   * planet or a logotype and the framing is correct for that too.
   */
  function fit() {
    const box = new THREE.Box3().setFromObject(model);
    /* Bounding centre to the origin. This is what puts the model in the middle
       of the frame, and it is also what makes OrbitControls turn it about
       ITSELF instead of swinging it round a point off to one side. */
    model.position.sub(box.getCenter(new THREE.Vector3()));
    box.setFromObject(model);                 // re-read, now that it has moved

    /* --- THE HULL, NOT THE BOX AROUND IT ---------------------------------
     * This used to project the eight corners of the bounding box, and it is
     * why the ship arrived small however the numbers were nudged. A bounding
     * box is a poor description of a galleon: three quarters of it is the air
     * between the masts and above the deck, so fitting the box to the frame
     * fits mostly nothing, and the hull ends up occupying less than half the
     * width it was given. Measured, the silhouette reached 44% of a frame
     * sized for 86%.
     *
     * So it projects the GEOMETRY. A sample of the model's own vertices is the
     * shape the reader actually sees, and fitting that to the frame means the
     * number in REACH is the number on the screen.
     *
     * SAMPLED, because the ship carries 34 719 of them and every one is
     * projected sixteen times over two passes. A stride that leaves roughly
     * three thousand is exact enough for a silhouette — the vertices between
     * the ones taken are inside the hull the taken ones describe — and it
     * keeps the whole fit under a frame's worth of work, once, on arrival. */
    model.updateWorldMatrix(true, true);

    corners = [];
    const meshes = [];
    model.traverse((n) => {
      if (n.isMesh && n.geometry?.attributes?.position) meshes.push(n);
    });

    const total = meshes.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0);
    const stride = Math.max(1, Math.floor(total / 3000));
    let seen = 0;
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position;
      for (let k = 0; k < pos.count; k += 1, seen += 1) {
        if (seen % stride) continue;
        corners.push(
          new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld)
        );
      }
    }

    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    modelRadius = radius;

    /* Below the model's centre, so the ship rides high in the frame. Every
       camera position below is measured from here and every lookAt is at it,
       which is why the fit stays correct: it is framing the view that will
       actually be shown, not one it then moves away from. */
    const aim = new THREE.Vector3(0, -radius * LIFT, 0);
    aimPoint = aim;

    const distance = solveDistance();

    const spinBack = new THREE.Vector3(...VIEW_DIR).normalize()
      .multiplyScalar(distance).add(aim);
    camera.position.copy(spinBack);
    camera.lookAt(aim);
    controls.target.copy(aim);

    /* --- HOW CLOSE IS TOO CLOSE, MEASURED --------------------------------
     * The camera rides on a sphere around the target, so it is outside the
     * model whenever its distance exceeds the distance from that target to the
     * furthest point of the hull. That number is not the bounding sphere's
     * radius, because the target is not the bounding sphere's centre: it sits
     * LIFT below it. So it is measured, off the same sample of vertices the
     * framing used.
     *
     * The old floor was radius * 0.9, which came to 13.5 against a true reach
     * of 18.2. It let the camera sit a full four units inside the hull: the
     * near plane cut the ship open and you could fly through the deck. That
     * was never noticed because there was no reason to zoom that far in until
     * now.
     *
     * The 1.05 is the margin that keeps the nearest plank off the near plane
     * rather than just outside the geometry. */
    let reach = 0;
    for (const c of corners) reach = Math.max(reach, c.distanceTo(aim));

    controls.minDistance = reach * 1.05;
    holdMin = controls.minDistance;

    /* --- AND NO ZOOMING OUT AT ALL ---------------------------------------
     * The shot this whole file computes IS the widest view: every vertex, at
     * every azimuth, inside REACH of the frame. There is nothing further out
     * to see, so pulling back only shrinks the ship inside a box that was
     * sized for it. The maximum is therefore the framed distance itself, and
     * the reader starts already at it.
     *
     * It was distance * 2.2, which let the galleon be pulled back to less than
     * half the size the section was built around. */
    controls.maxDistance = distance;

    /* --- THE CLIPPING PLANES HAVE TO COVER THE WHOLE RANGE ----------------
     * These used to be derived from the framed distance alone — near sat at
     * distance - radius * 2, about 28 units out. That is correct for a camera
     * standing at 58 and catastrophic for one that has zoomed to 19: the near
     * plane would have been in front of the entire ship and the box would have
     * gone empty. Nothing had zoomed far enough to find it.
     *
     * Spanning the range instead: nothing can ever be closer to the lens than
     * (minDistance - reach), and nothing further than (maxDistance + reach).
     * near stays generous rather than tight, because the depth buffer has
     * precision to spare at this ratio and a tight near plane is how a hull
     * ends up with holes in it. */
    camera.near = Math.max(0.05, reach * 0.02);
    camera.far = controls.maxDistance + reach * 1.5;
    camera.updateProjectionMatrix();

    controls.update();

    /* The framed distance is kept so resize() can re-derive the ceiling: a
       narrower box needs the camera further out to hold the same ship. */
    framedDistance = distance;

    /* Kept so letting a crew member go can come back to exactly this, rather
       than to whatever the controls happened to drift to. */
    home = { pos: camera.position.clone(), target: controls.target.clone() };

    return radius;                                // the lamps are placed on it
  }

  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();

    /* --- THE CEILING MOVES WITH THE BOX -----------------------------------
     * The framed distance is the maximum the reader may pull back to, so it
     * cannot be a number decided once on arrival: a narrower or shorter box
     * needs the camera FURTHER out to hold the same ship, and with the old
     * ceiling still in force the galleon would simply be cropped with no way
     * to fix it. So the solve runs again for the new shape.
     *
     * AND THE CAMERA ONLY FOLLOWS IF IT WAS RESTING AT THE OLD CEILING. Some-
     * body who has zoomed in to look at the deck has said where they want to
     * be, and a resize is not a reason to overrule them; they keep their
     * distance and simply gain more room to pull back to. */
    if (!corners.length || !aimPoint) return;

    const wasAtCeiling =
      camera.position.distanceTo(controls.target) >= framedDistance - 0.01;

    /* The root font size can change with the viewport (it is a clamp on this
       site), and every measure here is in pixels, so it is re-read here rather
       than on every step of a zoom — getComputedStyle forces a style recalc,
       and a drag would pay for it sixty times a second for a number that only
       moves when the window does. */
    remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    shapeWindow(true);

    framedDistance = solveDistance();
    controls.maxDistance = framedDistance;
    camera.far = framedDistance + controls.minDistance * 1.5;
    camera.updateProjectionMatrix();

    if (wasAtCeiling) {
      const out = new THREE.Vector3()
        .subVectors(camera.position, controls.target)
        .setLength(framedDistance);
      camera.position.copy(controls.target).add(out);
    }

    controls.update();
  }

  /* --- How close the reader may come, along the line they are on ----------
   * See KEEP_STEP. Skipped entirely while somebody is held or a flight is
   * running: both of those put the camera close on purpose, and both have
   * already worked out their own path.
   */
  function keepClear() {
    if (!probe || !_dir || !hull.length || picked || fly) return;

    _dir.subVectors(camera.position, controls.target);
    const here = _dir.length();
    if (here < 1e-4) return;
    _dir.divideScalar(here);

    if (!keepDir || keepDir.angleTo(_dir) > KEEP_STEP) {
      probe.set(controls.target, _dir);
      probe.far = framedDistance;
      const out = probe.intersectObjects(hull, true);
      keepOut = out.length ? out[out.length - 1].distance * KEEP_MARGIN : 0;
      keepDir = (keepDir || new THREE.Vector3()).copy(_dir);
    }

    /* The larger of the two, never the smaller: the framed floor is what he
       tuned the zoom against, and this only ever tightens it where the ship
       is long. */
    controls.minDistance = Math.max(holdMin, keepOut);

    /* And the ceiling on how far under the horizon they may drop, closing as
       they come in. lastOpen is nought at the framed distance and one at the
       floor, which openWindow has already worked out for the window. */
    const lean = Number.isFinite(lastOpen) ? Math.min(1, Math.max(0, lastOpen)) : 0;
    controls.maxPolarAngle =
      ((POLAR_FAR + (POLAR_NEAR - POLAR_FAR) * lean) * Math.PI) / 180;
  }

  /* --- The loop, which runs only while the section is on screen ----------- */
  function tick() {
    if (!visible || !renderer) return;
    frame = requestAnimationFrame(tick);

    /* CLAMPED, AND THIS IS NOT BELT AND BRACES. The loop stops whenever the
       section leaves the screen, so the first delta after it comes back is the
       whole time the reader spent elsewhere — thirty seconds of it, if they
       read the chapter below. Fed to the patrol unclamped, every crew member
       advances thirty seconds of walking in one frame and arrives somewhere
       off the deck. A tenth of a second is longer than any real frame and
       shorter than any absence. */
    const delta = Math.min(clock ? clock.getDelta() : 0, 0.1);
    for (const one of crew) one.update(delta, crew);

    stepFly(delta);
    keepClear();
    controls.update();
    openWindow();
    renderer.render(scene, camera);
  }

  /* --- Something is standing on the right of the box ----------------------
   * The panel does not sit BESIDE the stage, it sits ON it, so the stage has
   * to be told how much of its right-hand side is no longer visible. The
   * section knows that number, because the panel is its element; the stage
   * knows what to do with it, because the camera is this one's.
   *
   * TWO THINGS COME OUT OF IT.
   *
   * The window is clipped asymmetrically: the covered side comes in and the
   * free side does not, so the picture keeps every pixel it can. Clipping
   * symmetrically, which is what this did first, threw away as much on the
   * left as the panel was taking on the right — the ship lost twice the room
   * it had to.
   *
   * And the projection is shifted to match. Cutting the right off a centred
   * image leaves the subject sitting right of the middle of what is left,
   * which is exactly what looked wrong. setViewOffset moves the frustum rather
   * than the camera, so the shot re-centres on the visible window without the
   * camera leaving the place the flight put it and without the orbit changing
   * what it turns around.
   */
  function setCover(px) {
    rightCover = Math.max(0, px || 0);
    shapeWindow(true);
  }

  /* --- Both edges of the window, and the shot that fills it ---------------
   * This used to be split: the stylesheet worked out the inset from a rem
   * written down there, and the camera worked out its shift from a cover
   * written down here. Two halves of one calculation, in two files, each
   * assuming what the other was doing — and the assumption broke the moment
   * the two edges stopped being the same.
   *
   * It is one function now. It decides both edges, writes them as pixels for
   * the clip and the fade to use, and shifts the frustum by exactly what it
   * just decided.
   *
   * THE FREE SIDE OPENS. When something stands on the right, the left does not
   * hold its own inset out of politeness — it goes to nothing, so the picture
   * keeps every pixel that is still its to keep. Clipping both sides equally,
   * which is what happened before, paid for the panel twice.
   *
   * AND THE FRUSTUM FOLLOWS. Cutting one side of a centred image leaves the
   * subject off the middle of what is left. setViewOffset moves the projection
   * rather than the camera, so the shot re-centres on the visible window
   * without the camera leaving where the flight put it and without the orbit
   * changing what it turns around.
   */
  function shapeWindow(force) {
    if (!camera || !renderer) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;

    const rest = REST_WINDOW_REM * remPx;

    const cover = Math.min(rightCover, w * 0.6);
    const base = Math.max(0, ((w - rest) / 2) * (1 - Math.max(0, lastOpen)));

    /* THE COVERED SIDE IS THE COVER, AND NOTHING ON TOP OF IT.
       `base` is the resting inset: the tuck that holds the window to 52rem when
       nothing is happening, so the ship sits in a frame rather than filling the
       column. It has no business being added to the panel's width. Adding it
       measured 664.5px of window against 913px of free canvas — a quarter of a
       thousand pixels of deliberate emptiness between the picture and the text
       that was standing next to it.
       So: whichever side is covered is clipped to exactly what covers it, and
       the free side opens all the way. The mask's fade lives just inside the
       covered edge, so the picture dissolves in the last few centimetres rather
       than stopping at a line. */
    const left = cover > 0 ? 0 : base;
    const right = cover > 0 ? Math.min(cover, w - 1) : base;

    /* NOTHING THAT IS NOT A NUMBER REACHES THE PROJECTION MATRIX. The one
       time this happened - see openWindow - it took the whole scene with it,
       silently, and the only symptom was a black canvas. Cheap to check, and
       the check is at the door rather than at every one of the windows. */
    if (!Number.isFinite(left) || !Number.isFinite(right)) return;

    if (!force && left === lastLeft && right === lastRight) return;
    lastLeft = left;
    lastRight = right;

    stage.style.setProperty("--stage-inset-l", `${left.toFixed(1)}px`);
    stage.style.setProperty("--stage-inset-r", `${right.toFixed(1)}px`);

    /* The visible window runs from `left` to `w - right`; its middle is
       (right - left) / 2 away from the canvas middle. */
    const shift = (right - left) / 2;
    if (Math.abs(shift) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w, h, shift, 0, w, h);
  }

  /* --- The window opens as the reader comes closer ------------------------
   * How far in the reader has come: zero at the framed distance, one at the
   * nearest the controls allow. shapeWindow turns it into the resting inset,
   * so the window widens as the ship grows and there is more to see.
   *
   * READ EVERY FRAME, ACTED ON ONLY WHEN IT MOVES. Setting a custom property
   * invalidates style for the element, and doing that sixty times a second for
   * a value that has not changed is work for nothing. Rounded to a hundredth
   * first, which is finer than a pixel of window at any size this box takes
   * and cheap to compare.
   */
  function openWindow() {
    /* --- THE BLACK SCREEN LIVED IN THESE FOUR LINES -----------------------
     * They used to read the live controls: maxDistance for the ceiling,
     * minDistance for the floor. Both are wrong here, and the first one was
     * catastrophic. flyTo lifts the limits for the duration of a move, and it
     * lifts the ceiling to Infinity. So every frame of every flight computed
     * (Infinity - here) / Infinity, which is NaN. NaN went into lastOpen, out
     * through shapeWindow into camera.setViewOffset, and a projection matrix
     * with a NaN in it draws nothing at all. That is the second or so of black
     * he reported on the way back, and it was never a fade: the scene was
     * being rendered through a broken frustum and came right the instant the
     * flight ended and the ceiling came back down.
     * The framed distance and holdMin are the real ends of the reader's range.
     * They are fixed, they are what the zoom was tuned against, and neither is
     * touched by a flight. */
    const span = framedDistance - holdMin;
    if (!(span > 0)) return;

    const here = camera.position.distanceTo(controls.target);
    const open = Math.round(
      Math.min(1, Math.max(0, (framedDistance - here) / span)) * 100
    ) / 100;

    if (!Number.isFinite(open) || open === lastOpen) return;
    lastOpen = open;
    shapeWindow(false);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  /* --- AND IT STOPS FOR A HIDDEN TAB TOO ----------------------------------
   * The observer above already parks the loop when the section scrolls away,
   * which is the expensive case. It says nothing at all about the tab being
   * switched to something else, and a background tab kept the galleon, three
   * rigged crew members and their animation mixers rendering at whatever rate
   * the browser felt like giving them.
   *
   * The guard on `frame` is the point of routing through here rather than
   * calling tick() directly: tick() re-arms itself, so starting it while it is
   * already running leaves two loops advancing the same clock.
   */
  /* Named `restart` and not `resume`: this module already has a `resume`, and
     it is the camera position an inspection returns to. */
  function restart() {
    if (frame || !started || !visible || document.hidden) return;
    tick();
  }

  function onTabChange() {
    if (document.hidden) stop();
    else restart();
  }
  document.addEventListener("visibilitychange", onTabChange);

  /* The instrument colour, read from the stylesheet every time it is asked
     for rather than cached: tokens.css is the single place it is decided, and
     three switches reading it three times a session is not a cost. */
  const tinta = () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-collision").trim() || "#39ff88";

  /* --- Arrival ------------------------------------------------------------
   * One observer does both jobs: it starts the download the first time the
   * section comes near, and from then on it is the switch that runs and pauses
   * the loop. rootMargin is a percentage for the reason cam-feeds.js gives —
   * a fixed lead is a third of a laptop screen and a tenth of a large one.
   */
  watcher = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (!visible) { stop(); return; }

    if (!started) {
      started = true;
      status.textContent = t("scene.loading", "A carregar…");
      boot().then(() => {
        status.textContent = "";
        stage.classList.add("is-ready");
        tick();
      }).catch(() => {
        status.textContent = t("scene.failed", "A cena 3D não arrancou.");
      });
      return;
    }
    tick();
  }, { rootMargin: "25%" });

  watcher.observe(host);

  /* Under ?dev only: the camera, the controls and the crew, reachable from the
     console. Nothing on the page reads this; it exists so a report can be
     asked for rather than inferred from a screenshot. */
  if (DEV) {
    window.__legacy = {
      get camera() { return camera; },
      get controls() { return controls; },
      get crew() { return crew; },
      get picked() { return picked; },
      get hull() { return hull; },
      /* So a sweep can put somebody somewhere and ask for the real solve,
         rather than a copy of it living in a test. */
      pick: (i) => choose(crew[i]),
      let_go: () => release(),
      build: BUILD_TAG,
    };
  }

  return {
    /* The panel's own button calls this: the stage owns the camera and the
       selection, so letting go is its decision to make, not the markup's. */
    release,

    /* Show or hide the boxes a click is tested against. The colour is read
       from the stylesheet rather than written here, so the single place it is
       decided stays tokens.css, like every other colour on this site. */
    boxes(on) {
      const cor = tinta();

      for (const one of crew) one.showBox(on, cor);

      /* THE SHIP'S HALF OF IT. The boxes on the crew say how big a figure is;
         these say where a figure may go - the walkable rectangle and the two
         masts with the clearance kept around them. Built on the first ask and
         kept, like the boxes themselves. */
      if (on && !marcas && deck && fazMarcas) marcas = fazMarcas(THREE, deck, cor);
      if (marcas) marcas.visible = !!on;
    },

    /* The rig under the skin, and the route across the deck. Both are the
       crew's own to draw - this only says when - and both take the same green
       as the boxes, because they are all the same instrument reading and three
       colours would read as three unrelated things. */
    skeleton(on) {
      for (const one of crew) one.showSkeleton(on, tinta());
    },

    nav(on) {
      for (const one of crew) one.showNav(on, tinta());
    },

    /* How many pixels of the right-hand side are covered by something the
       stage cannot see. See setCover. */
    cover: setCover,

    destroy() {
      stop();
      document.removeEventListener("visibilitychange", onTabChange);
      clearTimeout(idleTimer);
      watcher?.disconnect();
      sizer?.disconnect();
      controls?.dispose();
      for (const one of crew) one.dispose();
      crew = [];
      /* A GLB left in memory is geometry, materials and textures, none of
         which the garbage collector can reach on its own — they live on the
         GPU. Walked once, disposed once. */
      model?.traverse((node) => {
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of mats) {
          if (!m) continue;
          for (const v of Object.values(m)) v?.isTexture && v.dispose();
          m.dispose();
        }
      });
      renderer?.dispose();
      figure.remove();
    },
  };
}
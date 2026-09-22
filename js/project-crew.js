/* ==========================================================================
   PROJECT CREW  ·  the patrol, ported from the game
   --------------------------------------------------------------------------
   This is Tripulacao.js from The Treasure Within, brought over rather than
   reinvented. The numbers in it are not guesses and must not be retuned here:
   they were arrived at against the real geometry of the galleon, and the deck
   they describe is the deck the model actually has.

     patrol plane   y = 2.1 in ship space
     bounds         x from -3.0 to 3.0, z from -4.8 to 4.4
     obstacles      two masts at (0, -1.5) and (0, 2), radius 0.5
     crew scale     0.4
     walk speed     0.3 units a second
     wait           2 to 7 seconds after arriving, 0.5 to 1.5 after a near miss

   WHAT WAS KEPT
   The whole behaviour: random destination inside the rectangle, turn toward it
   by slerping a dummy's lookAt, walk along local forward, stop on arrival or
   when something is in the way. Two collision tests, one against the other
   crew and one against the masts, both of which only trigger when you are
   heading INTO the thing rather than merely near it, which is what stops
   somebody getting stuck with their back to a post.

   WHAT WAS LEFT BEHIND
   The debug wireframes, the cast shadows and the hitbox mesh. A portfolio page
   is not the game: there is no light rig here to cast into, and the boxes were
   authoring aids. The fake shadow disc stays, because without it the crew look
   like they are hovering.

   AND WHAT IS NEW
   They can be clicked. A crew member that is picked stops where it is, turns
   to face the camera and holds Idle until it is let go. That is the one thing
   the game never needed and this page is for.
   ========================================================================== */

const DECK_Y = 2.1;
const BOUNDS = { minX: -3.0, maxX: 3.0, minZ: -4.8, maxZ: 4.4 };
const OBSTACLES = [
  { x: 0, z: -1.5, radius: 0.5 },
  { x: 0, z: 2, radius: 0.5 },
];

const CREW_SCALE = 0.4;
const WALK_SPEED = 0.3;
const BODY = 0.6;        // how much room a body needs around an obstacle
const NEAR_CREW = 1.5;   // how close another member has to be to matter
const TURN = 0.1;        // slerp per frame toward the heading
const FADE = 0.3;        // animation cross-fade

/* The ring that marks whoever is being inspected. Sized against the shadow
   disc already under them, so the two read as one mark rather than as a mark
   and a coincidence. */
const RING_INNER = 0.62;
const RING_OUTER = 0.78;

/** Builds the group the crew live in and hangs it off the ship. */
/* --- The ship's side of the collision model -------------------------------
 * The crew are not the only half of it. A figure is turned away by three
 * things, and all three live in this file as constants because this is the
 * file that obeys them: the rectangle of deck they may walk, the two masts,
 * and the body-width of clearance kept around a mast so nobody ends up with
 * their back against a post.
 *
 * Drawn from those same constants rather than from measurements of the hull,
 * for the reason showBox draws the proxy's own geometry: an overlay that
 * agrees with the code only approximately is an overlay that will one day be
 * confidently wrong.
 *
 * Two rings per mast, not one. The inner is the post as the code has it; the
 * outer is where a walker is actually stopped. The gap between them IS the
 * BODY constant, which is otherwise a number nobody can see.
 */
export function makeDeckHelper(THREE, deck, cor) {
  const grupo = new THREE.Group();
  grupo.visible = false;

  /* One material for every line here. They are all the same instrument. */
  const tinta = new THREE.LineBasicMaterial({ color: cor });
  const ALTURA = 0.02;                    // off the planks, so it is not z-fought

  const canto = (x, z) => new THREE.Vector3(x, ALTURA, z);
  grupo.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      canto(BOUNDS.minX, BOUNDS.minZ),
      canto(BOUNDS.maxX, BOUNDS.minZ),
      canto(BOUNDS.maxX, BOUNDS.maxZ),
      canto(BOUNDS.minX, BOUNDS.maxZ),
    ]),
    tinta
  ));

  for (const o of OBSTACLES) {
    for (const raio of [o.radius, o.radius + BODY]) {
      const pontos = [];
      for (let i = 0; i < 48; i += 1) {
        const ang = (i / 48) * Math.PI * 2;
        pontos.push(canto(o.x + Math.cos(ang) * raio, o.z + Math.sin(ang) * raio));
      }
      grupo.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pontos), tinta
      ));
    }
  }

  deck.add(grupo);
  return grupo;
}

export function makeDeck(THREE, ship) {
  const deck = new THREE.Group();
  deck.position.set(0, DECK_Y, 0);
  ship.add(deck);
  return deck;
}

export class Crew {
  constructor(THREE, deck, gltf, label) {
    this.THREE = THREE;
    this.deck = deck;
    this.label = label;

    this.model = gltf.scene;
    this.model.scale.setScalar(CREW_SCALE);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.currentAction = null;

    this.isWalking = false;
    this.waitTime = 2.0;
    this.held = false;          // picked by the reader, standing still

    // Reused every frame. Allocating vectors inside update() is what turns a
    // patrol of four into a garbage collector problem.
    this.targetPosition = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._flatTarget = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._otherFlat = new THREE.Vector3();
    this._heading = new THREE.Vector3();
    this._toOther = new THREE.Vector3();
    this._dummy = new THREE.Object3D();

    /* --- MEASURED OFF THE GEOMETRY, NOT OFF A Box3 ------------------------
     * These are skinned meshes, and Box3.setFromObject on one returns a box
     * around a skeleton that has not been posed: measured, it came back as
     * zero on all three. So the height is read from the position attribute
     * directly and scaled by hand.
     *
     * It is kept because the three of them are not the same size — 0.84 for
     * B.E.N., 1.12 for Jim, 1.56 for Silver — and the camera that comes in to
     * look at one has to stand further back for the tall one if all three are
     * to arrive the same size in frame. */
    this.height = Crew.#measure(this.model) * CREW_SCALE;

    this.#shadow();
    this.#ring();
    this.#proxy();
    this.#spawn();
    this.#animations(gltf.animations);

    deck.add(this.model);
  }

  /* A disc on the deck. Not a real shadow: there is no light rig on this page
     to cast one, and without something under them the crew read as hovering. */
  #shadow() {
    const { THREE } = this;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    this.model.add(disc);
  }

  static #measure(root) {
    let min = Infinity;
    let max = -Infinity;
    root.traverse((node) => {
      const pos = node.isMesh && node.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i);
        if (y < min) min = y;
        if (y > max) max = y;
      }
    });
    return Number.isFinite(min) ? max - min : 0;
  }

  /* --- The mark under whoever is chosen ----------------------------------
   * A ring on the deck at their feet, hidden until they are picked.
   *
   * ADDITIVE, AND THAT IS THE WHOLE GLOW. There is no bloom pass on this page
   * and adding one to light a ring would be a full-screen post-process for a
   * shape a centimetre across. Additive blending puts light INTO whatever is
   * behind it instead of covering it, which on the dark deck reads as the ring
   * glowing rather than as a sticker of a ring.
   *
   * depthWrite off so it never occludes the figure standing in it, and it is
   * lifted a hair above the shadow disc so the two do not fight for the same
   * pixels. */
  #ring() {
    const { THREE } = this;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(RING_INNER, RING_OUTER, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.07;
    this.ring.visible = false;
    this.model.add(this.ring);
  }

  /* --- What the click actually hits --------------------------------------
   * A box the size of a body, invisible, standing where they stand. The game
   * builds the same thing in Tripulacao.js and for the same reason: these are
   * SKINNED meshes, and a raycast against one has to run the skinning for
   * every vertex before it can test a triangle. Three of those on every mouse
   * move is a cost the page would carry for a cursor. One box each is three
   * plane tests.
   *
   * Sized from the height that was just measured rather than from the game's
   * fixed 2.5 x 5, so B.E.N. is not wearing Silver's box. */
  #proxy() {
    const { THREE } = this;
    const h = (this.height || 0.9) / CREW_SCALE;   // back into model space
    this.proxy = new THREE.Mesh(
      new THREE.BoxGeometry(h * 0.55, h, h * 0.55),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.proxy.position.y = h / 2;
    this.proxy.userData.crew = this;               // so a hit can name its owner
    this.model.add(this.proxy);
  }

  /* Somewhere inside the rectangle that is not inside a mast. Fifty tries and
     then wherever it landed, because a spawn loop that can run forever is a
     page that can hang. */
  #spawn() {
    const { THREE } = this;
    let x = 0;
    let z = 0;
    for (let i = 0; i < 50; i += 1) {
      x = THREE.MathUtils.randFloat(BOUNDS.minX, BOUNDS.maxX);
      z = THREE.MathUtils.randFloat(BOUNDS.minZ, BOUNDS.maxZ);
      if (OBSTACLES.every((o) => Math.hypot(x - o.x, z - o.z) >= o.radius + BODY)) {
        break;
      }
    }
    this.model.position.set(x, 0, z);
    this._currentPos.copy(this.model.position);
  }

  /* The clips ship inside the GLB under two different naming conventions:
     Idle and Walk on Silver and B.E.N., Idle_Pura and Walk_Pura on Jim. The
     game handled that with a fallback chain and so does this. */
  #animations(clips) {
    clips.forEach((clip) => {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    });
    const names = Object.keys(this.actions);
    this.idleName = this.actions.Idle ? "Idle"
      : this.actions.Idle_Pura ? "Idle_Pura" : names[0];
    this.walkName = this.actions.Walk ? "Walk"
      : this.actions.Walk_Pura ? "Walk_Pura" : names[1];
    this.play(this.idleName);
  }

  play(name) {
    const action = this.actions[name];
    if (!action || this.currentAction === action) return;
    if (this.currentAction) this.currentAction.fadeOut(FADE);
    action.reset().fadeIn(FADE).play();
    this.currentAction = action;
  }

  /* Picked. Stops, faces the camera, and stays there until released, which is
     the whole point of being able to click one. */
  /* `at` is where the camera is GOING, when the caller knows: on a switch from
     one person to another the camera is still standing beside somebody else,
     and facing that is facing the wrong way. It falls back to where the camera
     is, which is the right answer whenever the two are the same. */
  hold(camera, at) {
    this.held = true;
    this.isWalking = false;
    this.play(this.idleName);
    if (this.ring) this.ring.visible = true;

    // The camera in deck space, flattened, so the turn is about Y alone and
    // the model never tips.
    const local = this.deck.worldToLocal((at || camera.position).clone());
    local.y = this.model.position.y;
    this._dummy.position.copy(this.model.position);
    this._dummy.lookAt(local);
    this.turnTo = this._dummy.quaternion.clone();
  }

  release() {
    this.held = false;
    this.turnTo = null;
    this.waitTime = this.THREE.MathUtils.randFloat(0.5, 1.5);
  }

  /* The ring fades rather than switching, and it breathes while it is up: a
     mark that simply appears reads as a UI element pasted on the deck, and one
     that pulses very slightly reads as something lit. Driven from update() so
     it costs one sine per frame and only while somebody is chosen. */
  #glow(delta) {
    if (!this.ring) return;
    const want = this.held ? 1 : 0;
    const m = this.ring.material;
    const base = m.userData.level ?? 0;
    const level = base + (want - base) * Math.min(1, delta * 6);
    m.userData.level = level;

    if (level < 0.01) {
      this.ring.visible = false;
      m.opacity = 0;
      return;
    }
    this.ring.visible = true;
    this.pulse = (this.pulse || 0) + delta;
    m.opacity = level * (0.5 + 0.16 * Math.sin(this.pulse * 2.4));
  }

  update(delta, others) {
    if (!this.model) return;
    this.mixer.update(delta);
    this.#glow(delta);
    if (this.nav && this.nav.visible) this.#navStep();

    // Held: nothing but the turn toward the camera, and then stillness.
    if (this.held) {
      if (this.turnTo) this.model.quaternion.slerp(this.turnTo, 0.16);
      return;
    }

    if (!this.isWalking) {
      this.waitTime -= delta;
      if (this.waitTime <= 0) this.#choose();
      return;
    }

    this._currentPos.copy(this.model.position);
    this._flatTarget.copy(this.targetPosition);
    this._flatTarget.y = this._currentPos.y;
    const dist = this._currentPos.distanceTo(this._flatTarget);

    this._heading.copy(this._flatTarget).sub(this._currentPos);
    if (this._heading.lengthSq() > 0.0001) this._heading.normalize();
    else this._heading.set(0, 0, 1);

    const blocked = this.#blockedByCrew(others) || this.#blockedByMast();
    /* Kept, so the navigation overlay can show the rule rather than a guess at
       it. One boolean; nothing here changes because of it. */
    this.blocked = blocked;

    if (dist < 0.1 || blocked) {
      this.isWalking = false;
      this.play(this.idleName);
      this.waitTime = blocked
        ? this.THREE.MathUtils.randFloat(0.5, 1.5)
        : this.THREE.MathUtils.randFloat(2, 7);
      return;
    }

    this._dummy.position.copy(this._currentPos);
    this._dummy.lookAt(this._flatTarget);
    this.model.quaternion.slerp(this._dummy.quaternion, TURN);

    this._forward.set(0, 0, 1).applyQuaternion(this.model.quaternion);
    this.model.position.add(this._forward.multiplyScalar(WALK_SPEED * delta));
  }

  #choose() {
    const { THREE } = this;
    this.targetPosition.set(
      THREE.MathUtils.randFloat(BOUNDS.minX, BOUNDS.maxX),
      0,
      THREE.MathUtils.randFloat(BOUNDS.minZ, BOUNDS.maxZ)
    );
    this.play(this.walkName);
    this.isWalking = true;
  }

  /* Near is not enough: it only counts as blocked if you are walking INTO
     them. Otherwise two people who pass close stop dead and never start. */
  #blockedByCrew(others) {
    if (!others) return false;
    return others.some((other) => {
      if (other === this || !other.model) return false;
      this._otherFlat.copy(other.model.position);
      this._otherFlat.y = this._currentPos.y;
      if (this._currentPos.distanceTo(this._otherFlat) >= NEAR_CREW) return false;
      this._toOther.copy(this._otherFlat).sub(this._currentPos).normalize();
      return this._heading.dot(this._toOther) > 0.1;
    });
  }

  #blockedByMast() {
    return OBSTACLES.some((o) => {
      this._otherFlat.set(o.x, this._currentPos.y, o.z);
      if (this._currentPos.distanceTo(this._otherFlat) >= o.radius + BODY) return false;
      this._toOther.copy(this._otherFlat).sub(this._currentPos);
      if (this._toOther.lengthSq() > 0.0001) this._toOther.normalize();
      else this._toOther.set(0, 0, 1);
      return this._heading.dot(this._toOther) > 0.1;
    });
  }

  /* --- The pick box, made visible -----------------------------------------
   * The box #proxy() built is what a click is actually tested against, so this
   * draws THAT geometry rather than a fresh one measured for the occasion. An
   * overlay that shows an approximation of the thing it is meant to reveal is
   * worse than none: it agrees with you right until the moment it matters.
   *
   * Added as a child of the proxy, so it inherits the position, the turn and
   * the scale without a line of bookkeeping - the box walks the deck because
   * the proxy does. Built the first time it is asked for and kept afterwards,
   * because a reader who turns this on once usually turns it on again.
   */
  showBox(on, cor) {
    if (on && !this.boxLines && this.proxy) {
      const { THREE } = this;
      this.boxLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(this.proxy.geometry),
        new THREE.LineBasicMaterial({ color: cor })
      );
      this.proxy.add(this.boxLines);
    }
    if (this.boxLines) this.boxLines.visible = !!on;
  }

  /* --- The rig, seen through the body --------------------------------------
   * three.js draws this one for us. SkeletonHelper walks the bone tree and
   * keeps a line between every bone and its parent, updated on the render it
   * is already part of - so a skeleton that follows the walk cycle costs this
   * file no per-frame code at all.
   *
   * IT EXPECTS TO BE A SIBLING OF THE MODEL, NOT A CHILD, and that is the one
   * thing about it worth knowing. Its constructor does this:
   *
   *     this.matrix = object.matrixWorld;  this.matrixAutoUpdate = false;
   *
   * so the helper's LOCAL matrix is already the model's WORLD matrix, which is
   * what turns the root-local bone positions it computes back into world
   * space. Hung off the scene that is exactly right. Hung off the model, three
   * multiplies the model's world matrix by the helper's local one - the same
   * matrix twice - and the whole crew comes out at 0.4 x 0.4 of their size,
   * pushed off the deck by the galleon's own offset applied a second time.
   *
   * We keep it as a child of the model anyway, because that is what makes it
   * follow the figure, get hidden with it and disposed with it for free. What
   * we take away is the double count: a fresh identity matrix, so the parenting
   * does the transform once and the helper's own matrix does nothing.
   *
   * A FRESH ONE, never .identity() on the matrix it arrived with. That matrix
   * is not a copy of the model's world matrix, it IS the model's world matrix,
   * and clearing it in place would flatten the galleon.
   */
  showSkeleton(on, cor) {
    if (on && !this.skel && this.model) {
      const { THREE } = this;
      this.skel = new THREE.SkeletonHelper(this.model);
      this.skel.matrix = new THREE.Matrix4();     // see above: identity, not shared
      const m = this.skel.material;
      m.vertexColors = false;          // it ships with a per-bone gradient
      m.color.set(cor);
      m.needsUpdate = true;
      /* depthTest is already off on the material three gives us, which is what
         lets a skeleton be seen through the skin. renderOrder puts it after
         the deck so it is not fighting the planks for the same pixels. */
      this.skel.renderOrder = 4;
      this.model.add(this.skel);
    }
    if (this.skel) this.skel.visible = !!on;
  }

  /* --- Where they are going, and what would stop them ----------------------
   * Three things, and all three are read from the walk itself rather than
   * described alongside it: the destination #choose picked, the line they are
   * walking down, and the ring at NEAR_CREW inside which another figure starts
   * to matter.
   *
   * The ring is faint until they are ACTUALLY blocked and then goes solid. It
   * has to be, because the rule is not "somebody is near" - it is "somebody is
   * near AND I am walking into them", and a ring that lit up on distance alone
   * would show a rule the code does not have.
   *
   * Parented to the deck rather than to the figure: the destination and the
   * position are both in deck coordinates, and a group that turned with the
   * body would drag the line round with it.
   */
  showNav(on, cor) {
    if (on && !this.nav && this.deck) {
      const { THREE } = this;
      this.nav = new THREE.Group();

      const anel = [];
      for (let i = 0; i < 40; i += 1) {
        const ang = (i / 40) * Math.PI * 2;
        anel.push(new THREE.Vector3(Math.cos(ang) * NEAR_CREW, 0, Math.sin(ang) * NEAR_CREW));
      }
      this.navRing = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(anel),
        new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.3 })
      );

      /* Two points, rewritten every frame. A fresh geometry per frame would be
         three allocations a second per figure for a line that never changes
         shape, only ends. */
      this.navLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: cor })
      );

      const cruz = 0.18;
      this.navMark = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-cruz, 0, 0), new THREE.Vector3(cruz, 0, 0),
          new THREE.Vector3(0, 0, -cruz), new THREE.Vector3(0, 0, cruz),
        ]),
        new THREE.LineBasicMaterial({ color: cor })
      );

      this.nav.add(this.navRing, this.navLine, this.navMark);
      this.deck.add(this.nav);
    }
    if (this.nav) {
      this.nav.visible = !!on;
      if (on) this.#navStep();
    }
  }

  /* Called from update() while the group is up. Everything here is a write to
     an existing object: no geometry is built and nothing is allocated. */
  #navStep() {
    const ALTURA = 0.02;
    const aqui = this.model.position;

    this.navRing.position.set(aqui.x, ALTURA, aqui.z);
    this.navRing.material.opacity = this.blocked ? 1 : 0.3;

    /* Idle means there is no destination in play, so the line and the mark go
       away rather than pointing at wherever they last stopped. */
    this.navLine.visible = this.isWalking;
    this.navMark.visible = this.isWalking;
    if (!this.isWalking) return;

    const alvo = this.targetPosition;
    const pos = this.navLine.geometry.attributes.position;
    pos.setXYZ(0, aqui.x, ALTURA, aqui.z);
    pos.setXYZ(1, alvo.x, ALTURA, alvo.z);
    pos.needsUpdate = true;
    this.navLine.geometry.computeBoundingSphere();

    this.navMark.position.set(alvo.x, ALTURA, alvo.z);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.model.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (!m) return;
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    this.model.removeFromParent();
  }
}

export { BOUNDS, DECK_Y, OBSTACLES };

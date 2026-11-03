/* ==========================================================================
   EYE EFFECTS  ·  extensible behaviour registry
   --------------------------------------------------------------------------
   Each effect is an object with an `update(ctx)` method. Every frame, eye.js
   resets `ctx.lookTarget` and then runs every effect named in
   `config.activeEffects`, in order. Effects contribute to where the eye looks
   (and can touch uniforms) — they don't move the eye directly; eye.js smooths
   toward the combined target afterwards.

   TO ADD A NEW EFFECT
     1. add an entry to `effects` below (e.g. `blink`, `wireframe`, `pulse`);
     2. add its name to `config.activeEffects` in config.js.
   That's the whole contract — no other file changes.

   `ctx` shape:  { eye, pointer, uniforms, config, time, dt, lookTarget:{rx,ry} }
   ========================================================================== */

export const effects = {

  /* Eye follows the cursor: horizontal → yaw, vertical → pitch. */
  follow: {
    update(ctx) {
      const s = ctx.config.eye.followStrength;
      // Use the canvas-relative pointer (ctx.px/py) so the gaze stays on the
      // cursor even when the eye is translated (sunk) on screen. Falls back to
      // the window-normalized pointer if the local one isn't set yet.
      const px = ctx.px ?? ctx.pointer.x;
      const py = ctx.py ?? ctx.pointer.y;
      // cursor right → look right (yaw); cursor down → look down (pitch).
      ctx.lookTarget.ry += px * s;
      ctx.lookTarget.rx += py * s;
    },
  },

  /* Gentle wander so the eye is never frozen. Fades out while the cursor is
     actively moving, fades in after ~1.5s of stillness. */
  idleDrift: {
    update(ctx) {
      const idleSeconds = (performance.now() - ctx.pointer.lastMove) / 1000;
      const wake = Math.min(idleSeconds / 1.5, 1);   // 0 active .. 1 idle
      const t = ctx.time;
      ctx.lookTarget.ry += Math.sin(t * 0.60) * 0.05 * wake;
      ctx.lookTarget.rx += Math.cos(t * 0.45) * 0.035 * wake;
    },
  },

  /* The same wander, but always at full amplitude — for touch screens, where
     `follow` is switched off because there is no cursor to follow.
     idleDrift cannot simply be reused there: it fades itself out whenever the
     pointer moves, and on a phone every scroll fires touchmove. The eye would
     freeze for a second and a half each time you dragged the page, which is
     precisely when it is being looked at. This one ignores the pointer, so the
     resting motion is continuous. */
  restDrift: {
    update(ctx) {
      const t = ctx.time;
      ctx.lookTarget.ry += Math.sin(t * 0.60) * 0.05;
      ctx.lookTarget.rx += Math.cos(t * 0.45) * 0.035;
    },
  },

  /* --- Looking around, with nothing to look at -----------------------------
   * The drift above is 2.9 degrees over ten seconds. It is technically moving
   * and it reads as frozen, which is what a phone used to get: `follow` off
   * because there is no cursor, and a wander too small to notice.
   *
   * So this one does what an eye with nothing to track actually does — it
   * settles on somewhere, holds, and moves on. The target is random inside the
   * SAME reach the cursor has (config.eye.followStrength, so the two can never
   * disagree about how far this eye turns), and narrower vertically than
   * horizontally, because that is how eyes move.
   *
   * IT ONLY SETS A TARGET. eye.js eases toward lookTarget at followEase every
   * frame, so a new target is a turn and never a jump — nothing here has to
   * know about smoothing. And it ADDS, like every effect but watchFocus, so
   * the micro-drift above keeps running underneath it and the eye is never
   * perfectly still even between moves.
   *
   * State on the effect object, as watchFocus already does. */
  wander: {
    update(ctx) {
      if (ctx.time >= (this.until ?? 0)) {
        const reach = ctx.config.eye.followStrength;
        this.ry = (Math.random() * 2 - 1) * reach;
        this.rx = (Math.random() * 2 - 1) * reach * 0.6;
        /* Long enough to read as a look rather than a twitch, uneven enough
           that four of them in a row do not read as a loop. */
        this.until = ctx.time + 1.4 + Math.random() * 2.4;
      }
      ctx.lookTarget.ry += this.ry;
      ctx.lookTarget.rx += this.rx;
    },
  },

  /* --- The eye reads over your shoulder ------------------------------------
   * While a form field has focus, the eye stops following the cursor and
   * watches the field instead. On the contact page that is the whole point:
   * you are writing TO someone, and the thing the site has spent four pages
   * establishing as its gaze turns to look at what you are typing.
   *
   * WHY IT OVERRIDES RATHER THAN ADDS
   * Every other effect ADDS to lookTarget, because a drift on top of a follow
   * is still a follow. This one cannot: cursor and caret are rarely in the
   * same place, and adding the two aims the eye at neither. So it runs last
   * and pulls the accumulated target toward the field by its own weight —
   * at full weight it wins outright, and at zero it leaves the frame
   * untouched, which is what makes it safe to register on every page.
   *
   * The weight is eased rather than switched, so the handover from cursor to
   * field is the eye turning, not the eye teleporting. And the last known
   * position is kept, because on blur there is no element left to measure and
   * the fade back out still has to come FROM somewhere.
   */
  watchFocus: {
    weight: 0,
    last: null,

    update(ctx) {
      const el = document.activeElement;
      // Text-entry controls only. Buttons, links and the language switch take
      // focus constantly while someone tabs through the page, and an eye that
      // snapped to every one of them would read as a twitch, not attention.
      const watching = el && typeof el.matches === "function"
        && el.matches("input:not([type=hidden]), textarea, [data-field-control]");

      const rect = ctx.canvasRect;
      if (watching && rect?.width && rect?.height) {
        const box = el.getBoundingClientRect();
        this.last = {
          x: ((box.left + box.width / 2 - rect.left) / rect.width) * 2 - 1,
          y: ((box.top + box.height / 2 - rect.top) / rect.height) * 2 - 1,
        };
      }

      // Framerate-independent easing: a fixed per-frame fraction would run at
      // half speed on a 30fps machine and twice on a 120Hz one.
      const target = watching ? 1 : 0;
      this.weight += (target - this.weight) * Math.min(1, ctx.dt * 5);

      if (this.weight < 0.002 || !this.last) return;

      const s = ctx.config.eye.followStrength;
      ctx.lookTarget.ry += (this.last.x * s - ctx.lookTarget.ry) * this.weight;
      ctx.lookTarget.rx += (this.last.y * s - ctx.lookTarget.rx) * this.weight;
    },
  },

  /* --- Placeholders for the next phase (registered when implemented) -------
   * blink:     { update(ctx){ drive uPupilDilation / an eyelid uniform } },
   * wireframe: { update(ctx){ toggle the mesh's wireframe look } },
   * mood:      { update(ctx){ shift iris colors by time of day } },
   * ---------------------------------------------------------------------- */
};


/* Run the named effects, in order. Unknown names are ignored safely. */
export function runEffects(ctx, names) {
  for (const name of names) {
    const fx = effects[name];
    if (fx && typeof fx.update === "function") fx.update(ctx);
  }
}

/* ==========================================================================
   SCROLL FX  ·  hero title slide-away
   --------------------------------------------------------------------------
   Drives the hero title's exit as you scroll past the first screen. It writes
   a single custom property `--exit` (0 → 1); the CSS in style.css turns that
   into a translate + fade. Setting a CSS variable is the sanctioned way to do
   scroll-linked animation — it's a value, not a presentational inline style.

   Reusable: pass any Lenis instance; falls back to native scroll if absent.
   ========================================================================== */

export function initHeroScrollFx(lenis) {
  // Set --exit on the hero section so the title AND the scroll-hint inherit it.
  const hero = document.getElementById("hero");
  if (!hero) return;

  function apply(scroll) {
    // Progress across the first viewport height, clamped to 0..1.
    const p = Math.min(Math.max(scroll / window.innerHeight, 0), 1);
    hero.style.setProperty("--exit", p.toFixed(3));
  }

  if (lenis && typeof lenis.on === "function") {
    lenis.on("scroll", ({ scroll }) => apply(scroll));
    apply(lenis.scroll || 0);
  } else {
    const onScroll = () => apply(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}

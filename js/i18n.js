/* ==========================================================================
   I18N  ·  Portuguese / English
   --------------------------------------------------------------------------
   Two languages, a static site, no backend: a dictionary per language and a
   swap in the DOM. No translation API — those cost money, need a key, and
   would mangle the terms that matter most here (branding, motion, art
   direction are said in English in a Portuguese studio, and a machine would
   "correct" them).

   HOW THE MARKUP DECLARES ITSELF

     data-i18n="hero.hint"                      → replaces textContent
     data-i18n-attr="data-text=nav.work"        → replaces an attribute
     data-i18n-attr="a=k.one; b=k.two"          → several, semicolon-separated

   The attribute form is what makes the harder cases work without special
   pleading: the nav's hover duplicate lives in data-text, the reveal
   statement lives in data-reveal-text and is painted to a canvas, and each
   project's record lives in data-theme / data-role / data-credits where
   work-preview.js reads it. All of them are just attributes, so all of them
   go through one code path.

   WHY ENGLISH IS THE SOURCE
   The HTML is authored in English, which is the language the Figma designs
   are in. That means English needs no swap at all and cannot flash
   untranslated content on first paint. Portuguese is applied after the
   dictionary loads. To flip the default, change DEFAULT below and translate
   the markup — nothing else changes.

   AND WHY IT OPENS IN ENGLISH FOR EVERYONE
   The visitor's own browser language is never consulted. That sounds unhelpful
   and is the opposite: a Portuguese browser used to open this site in
   Portuguese without anyone asking, and the guess was then saved as if it had
   been a decision, so the site opened in Portuguese for ever afterwards with
   nothing to show why. English is the default, Portuguese is something a
   visitor asks for, and once asked for it is remembered.

   WHERE THE CHOICE LIVES
   localStorage, so it survives closing the tab and coming back tomorrow. To
   make it last only for the current visit instead, change the two
   localStorage calls to sessionStorage; nothing else needs to move.
   ========================================================================== */

const DEFAULT = "en";
const STORE_KEY = "re-lang";
const PARAM = "lang";

/* Loaded dictionaries, kept so a second visit to a language costs nothing. */
const cache = new Map();

let current = DEFAULT;

/* --- Which language to open in ------------------------------------------
 * Three sources, in this order, and the source is returned alongside the
 * answer because what happens next depends on WHERE it came from.
 *
 *   url      an explicit ?lang= beats everything: a shared link has to show
 *            what the sender saw, and following one is a deliberate act, so
 *            it is also worth remembering.
 *
 *   memoria  a choice this visitor made before, on this browser.
 *
 *   padrao   English. Always.
 *
 * THE BROWSER'S OWN PREFERENCE IS DELIBERATELY NOT CONSULTED, and removing it
 * is the point of this function. navigator.language used to sit between the
 * second and third: a visitor with a Portuguese browser opened a site that is
 * meant to open in English, having chosen nothing, and that guess was then
 * SAVED as though it had been a decision. From then on the site opened in
 * Portuguese for ever, and there was no way to tell that apart from a real
 * choice - which is exactly what "sometimes it starts in Portuguese and
 * sometimes in English" was.
 *
 * The site is authored in English and opens in English. Portuguese is
 * something a visitor asks for, once, and it is remembered from then on.
 */
function preferred(available) {
  const fromUrl = new URLSearchParams(location.search).get(PARAM);
  if (available.includes(fromUrl)) return { lang: fromUrl, fonte: "url" };

  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (available.includes(saved)) return { lang: saved, fonte: "memoria" };
  } catch { /* private mode: no memory, and the default below is right */ }

  return { lang: DEFAULT, fonte: "padrao" };
}

async function load(lang) {
  if (cache.has(lang)) return cache.get(lang);
  /* `cache: "no-cache"` forces a revalidation instead of trusting whatever
     copy the browser already has. These dictionaries change whenever a string
     is edited, and a stale one is invisible in the worst way: the page renders
     perfectly, just with last week's words (or, for a key added since, the
     English fallback). Revalidating costs a 304 when nothing changed. */
  const res = await fetch(`linguas/${lang}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`linguas: ${lang} dictionary missing`);
  const dict = await res.json();
  cache.set(lang, dict);
  return dict;
}

/* --- Applying a dictionary to the page ---------------------------------- */
function paint(dict, root = document) {
  // 1 · plain text
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const value = dict[el.dataset.i18n];
    if (typeof value === "string") el.textContent = value;
  }

  // 2 · attributes. One element can carry several, which is how a nav link
  //     translates both its label and the hover duplicate behind it.
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split("=").map((s) => s && s.trim());
      if (!attr || !key) continue;
      const value = dict[key];
      if (typeof value === "string") el.setAttribute(attr, value);
    }
  }
}

/* --- Public ------------------------------------------------------------- */
export async function setLanguage(lang, { remember = true } = {}) {
  /* REMEMBERED FIRST, BEFORE ANYTHING IS AWAITED.
   * This used to sit at the bottom of the function, after the dictionary had
   * been fetched, and that ordering lost people's choices. Pressing PT and
   * then immediately pressing "Work" gives this about 420ms before
   * page-transition.js tears the document down; a dictionary that takes longer
   * than that meant the click was never recorded, the next page opened in
   * English, and the visitor had no idea why. Storing the intent does not
   * depend on the fetch succeeding, so it should never have waited for it.
   *
   * Both writes are here together on purpose: whatever is in storage and
   * whatever is in the URL now always agree, because nothing can happen
   * between them. */
  if (remember) {
    try { localStorage.setItem(STORE_KEY, lang); } catch { /* private mode */ }
    // Reflected in the URL so a link can be shared in the language it was
    // read in. replaceState, not pushState: switching language is not a
    // navigation, and it should not fill up the back button.
    const url = new URL(location.href);
    url.searchParams.set(PARAM, lang);
    history.replaceState(null, "", url);
  }

  const dict = await load(lang);
  current = lang;

  paint(dict);
  document.documentElement.lang = dict._meta?.htmlLang || lang;

  // The button that is on stays marked, for CSS and for screen readers.
  for (const btn of document.querySelectorAll("[data-lang]")) {
    const on = btn.dataset.lang === lang;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  }

  /* Anything painted to a canvas cannot be updated by swapping textContent —
     it has to be redrawn. Rather than this module knowing which those are,
     it announces the change and they listen. */
  document.dispatchEvent(new CustomEvent("languagechange", { detail: { lang, dict } }));

  return dict;
}

export function getLanguage() {
  return current;
}

/* --- Looking a string up from code --------------------------------------
 * paint() covers everything that exists in the markup, but the project page
 * BUILDS its labels ("Built with", "The process", the next-project button)
 * from JavaScript, so there is no element for data-i18n to find. Those were
 * left hard-coded in English and never switched — half the page changed
 * language and half did not. This is how they ask for their own string.
 *
 * `fallback` is the English source text, so a lookup before the dictionary has
 * loaded (or a key that does not exist yet) still renders real words rather
 * than a blank or a raw key. When the dictionary does land, the page re-renders
 * on `languagechange` and picks up the translation. */
export function t(key, fallback = "") {
  const value = cache.get(current)?.[key];
  return typeof value === "string" ? value : fallback;
}

/* How long anything is allowed to wait for the first dictionary before giving
   up and showing the page anyway. A visitor on a bad connection should meet a
   page in the wrong language, never a black screen. */
const READY_CEILING_MS = 2500;

/* Resolves once the page is showing the RIGHT language — which is not the same
   as "the script has started". The loading screen and the black veil both wait
   on this before uncovering, so nobody watches the words change under them.

   It NEVER rejects and it always settles: a missing dictionary, a dead network
   or a hung request all end the same way, with the page revealed in the source
   language. Whatever waits on this cannot deadlock. */
let settleReady;
export const i18nReady = new Promise((resolve) => { settleReady = resolve; });

function markReady() {
  if (settleReady) { settleReady(); settleReady = null; }
}

/* Wire the switch and open in the right language.
   `available` is passed in rather than discovered so adding a third language
   is one entry here and one JSON file — no scanning, no guessing. */
export async function initI18n({ available = ["en", "pt"] } = {}) {
  const buttons = [...document.querySelectorAll("[data-lang]")];

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.lang !== current) setLanguage(btn.dataset.lang);
    });
  });

  const { lang: start, fonte } = preferred(available);

  // The ceiling runs against the fetch, not after it: a dictionary that never
  // arrives must not hold the page behind a cover for longer than this.
  const giveUp = setTimeout(markReady, READY_CEILING_MS);

  try {
    /* The source language is already in the markup, so painting it again would
       be work for nothing — but the button state and <html lang> still need to
       be right, and listeners still need to hear about it.

       ONLY A CHOICE IS WRITTEN DOWN, and arriving is not choosing.
         url      following ?lang=pt IS a decision, so it is stored, and from
                  then on this visitor gets Portuguese without the parameter.
         memoria  already stored; writing it again would say nothing, and
                  stamping ?lang= onto the address bar of somebody who simply
                  opened the site is noise.
         padrao   nothing happened. Nothing is recorded.

       The rule used to be `start !== DEFAULT`, which quietly promoted the
       browser-language guess into a permanent preference. With that guess gone
       the rule can say what it actually means. */
    await setLanguage(start, { remember: fonte === "url" });
  } catch (err) {
    // The page stays in the language the markup was authored in, which is a
    // readable page — so this is a warning, not a failure.
    console.warn("[i18n] could not apply", start, err);
  } finally {
    clearTimeout(giveUp);
    markReady();
  }

  return { setLanguage, getLanguage };
}

/* ==========================================================================
   PROJECTS  ·  the per-language data layer
   --------------------------------------------------------------------------
   The project content lives in ONE FILE PER LANGUAGE:

       data/projects.en.json
       data/projects.pt.json

   Each file is flat and self-contained — the strings are already in that
   language, with no {en,pt} wrappers. Adding a third language is a copy of one
   file, a translation pass, and one entry in AVAILABLE below (plus the matching
   linguas/<lang>.json for the chrome). The language button then loads it.

   Both work.html and project.html import from here, so neither parses a file
   itself, and each caches per language so switching back is instant.
   ========================================================================== */

/* The languages the site ships. Adding one here (and dropping in the two JSON
   files) is all the data layer needs. */
export const AVAILABLE = ["en", "pt"];
const DEFAULT = "en";

const cacheByLang = new Map();   // lang -> parsed file
const pendingByLang = new Map(); // lang -> in-flight fetch, so two callers share one

export function currentLang() {
  const l = (document.documentElement.lang || DEFAULT).slice(0, 2).toLowerCase();
  return AVAILABLE.includes(l) ? l : DEFAULT;
}

export function loadProjects(lang = currentLang()) {
  if (cacheByLang.has(lang)) return Promise.resolve(cacheByLang.get(lang));
  if (pendingByLang.has(lang)) return pendingByLang.get(lang);

  const p = fetch(`data/projects.${lang}.json`, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`projects: ${lang} file returned ${res.status}`);
      return res.json();
    })
    .then((data) => {
      cacheByLang.set(lang, data);
      pendingByLang.delete(lang);
      return data;
    })
    .catch((err) => {
      pendingByLang.delete(lang);
      console.error("[projects]", err);
      throw err;
    });

  pendingByLang.set(lang, p);
  return p;
}

/* The data is now flat, so a field is already a plain string or array. This
   stays as a tiny pass-through — and still resolves a legacy {en,pt} object if
   one ever slips through — so work-gallery.js / project-page.js need no change
   in how they read fields. */
export function resolveField(value, lang = currentLang()) {
  if (value == null) return "";
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return value[lang] ?? value.en ?? Object.values(value)[0] ?? "";
  return value;
}

/* --- Lookups (unchanged shape) ------------------------------------------- */
export function getProject(data, id) {
  return data.projects.find((p) => p.id === id) || null;
}

export function getCategory(data, id) {
  return data.categories.find((c) => c.id === id) || null;
}

export function groupByCategory(data) {
  return data.categories
    .map((category) => ({
      category,
      items: data.projects.filter((p) => p.category === category.id),
    }))
    .filter((group) => group.items.length > 0);
}

export function nextProject(data, id) {
  const i = data.projects.findIndex((p) => p.id === id);
  if (i === -1) return null;
  return data.projects[(i + 1) % data.projects.length];
}

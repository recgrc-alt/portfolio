# vendor/

Third-party modules the site imports, served from here instead of a CDN.

## Why they live here

Until September 2026 these came from unpkg.com at runtime. Two problems with
that, both measured:

1. **One CDN could take the whole site down.** `main.js` imports `eye.js`
   statically, and `eye.js` imports `three` statically. In an ES module graph
   one failed fetch fails the whole graph, so an unpkg outage stopped every
   line of JavaScript on every page. Project pages are built entirely by JS
   from an empty `<main>`, so they came up blank.
2. **The unminified build was being loaded.** `three.module.js` is 1243 KB;
   `three.module.min.js` is 655 KB. That was ~590 KB of extra JavaScript to
   parse on every page, for nothing.

## What is here, and where it came from

Official builds only, copied byte for byte. Each file was checked against the
sha256 integrity hash the registry publishes for it before it was written.
The package's own folder layout is kept, so the addons' relative imports
(`GLTFLoader.js` → `../utils/BufferGeometryUtils.js`) resolve unchanged.

| file | package | notes |
|---|---|---|
| `three@0.160.0/build/three.module.min.js` | three 0.160.0 | the minified ES module build |
| `three@0.160.0/examples/jsm/loaders/GLTFLoader.js` | three 0.160.0 | eye, 3D stage, dormant viewers |
| `three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js` | three 0.160.0 | pulled in by GLTFLoader |
| `three@0.160.0/examples/jsm/controls/OrbitControls.js` | three 0.160.0 | 3D stage, dormant viewers |
| `three@0.160.0/examples/jsm/lights/RectAreaLightUniformsLib.js` | three 0.160.0 | the eye's area light |
| `lenis@1.1.14/dist/lenis.mjs` | lenis 1.1.14 | smooth scroll |

**Not minified, and why:** three r160 ships no minified addons, and Lenis's
`lenis.min.js` is a classic script that sets a global rather than an ES
module, so it cannot be used with `import`. Only official files are kept here;
minifying them locally would mean shipping code nobody else has checked.

Both packages are MIT licensed; their licences are next to them.

## If you upgrade one

1. Add the new version beside the old one (`three@0.1xx.0/`), never over it.
2. Change the import map in **every** page that has one: `index.html`,
   `work.html`, `project.html`, `contact.html`.
3. **Recompute the CSP hash.** The import map is an inline script, and the
   Content-Security-Policy allows it by the sha256 of its exact text. Change
   one character without updating the hash and the browser refuses the import
   map, which means no JavaScript runs anywhere on the site.
4. Load every page and check the console for CSP errors before publishing.

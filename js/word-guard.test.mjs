/* ==========================================================================
   WORD GUARD · tests
   --------------------------------------------------------------------------
   Run with:  node js/word-guard.test.mjs

   THREE SECTIONS, AND THE SECOND IS THE ONE THAT KEEPS THIS HONEST.

     BLOQUEAR   what must be caught, including the spelling games.

     PASSAR     what must NEVER be caught. A filter that refuses "tens uma
                óptima reputação" is costing real messages to block imaginary
                ones, and it does it silently, because the person who wrote it
                simply leaves. Every entry here contains a listed term as a
                fragment, or collapses onto something that looks like one.

     COERÊNCIA  assertions about the lists themselves rather than about any
                text. This section exists because of a bug that nothing else
                could have found: in an earlier draft the list was supposed to
                hold pre-normalised spellings, and eight entries still carried
                their doubled letters ("asshole" can never match a string that
                has already been collapsed to "ashole"). They were dead, the
                suite was green, and no test on any sentence would have shown
                it. Now the lists are asserted directly.

   Adding a word to TERMS means adding the innocent words it could collide with
   to PASSAR, and running this again.

   WHY THE COPY TO A TEMPORARY FILE
   There is deliberately no package.json here: Vercel reads one as "this is a
   Node app, build it", and this site has no build step and must not acquire
   one. Without `"type": "module"` Node treats a .js file as CommonJS and
   refuses its exports, so the module under test is copied to a .mjs beside the
   system temp directory and imported from there, byte for byte.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const copia = join(tmpdir(), "word-guard.copia.mjs");
writeFileSync(copia, readFileSync(join(aqui, "word-guard.js")));
const { screen, normalise, collapse, _listas } = await import(pathToFileURL(copia).href);


/* --- 1 . Must be caught -------------------------------------------------- */
const BLOQUEAR = [
  "vai à merda",
  "que puta de site",
  "caralho",
  "que porra é esta",
  "this is shit",
  "you are a bitch",
  "what an asshole",
  "bullshit",
  "that is shitty work",

  // the repeated-letter game, which is what started this
  "filhooo daa putaa",
  "meeerda",
  "caralhoooo",
  "fuuuck",
  "asssshole",
  "shiiiit",

  // spacing and punctuation
  "filho da puta",
  "filho.da.puta",
  "f-o-d-a-s-e",
  "vai tomar no cu",

  // case and accents
  "MERDA",
  "PuTa",
  "mêrda",
  "fôda-se",
  "CABRÃO",
  "cuzão",

  // leetspeak
  "m3rda",
  "p0rra de site",
  "f0da-se",
  "sh1t",
  "fuck y0u",

  // buried in a real sentence, which is how it actually arrives
  "Olá, gostei do trabalho mas o formulário é uma merda.",
  "adorei o site, mas quem fez o menu é um otário",
];


/* --- 2 . Must NEVER be caught -------------------------------------------- */
const PASSAR = [
  // "puta" is inside every one of these
  "Tens uma óptima reputação no mercado.",
  "Houve uma disputa sobre o prazo.",
  "O deputado assinou o contrato.",
  "Preciso de amputar o orçamento.",
  "computador", "computação", "imputar", "reputado", "putativo",

  // "cu" is inside every one of these
  "Tem cuidado com os prazos.",
  "Vi o teu currículo e o teu percurso.",
  "A cultura da empresa é curiosa.",
  "cumprimento", "cúmplice", "custo", "cubo", "curto", "acumular", "documento",

  // the collapse trap: carro→caro, passar→pasar, nossa→nosa
  "O carro passou pela nossa rua.",
  "Vamos passar à fase seguinte, assim que possível.",
  "assado", "esse", "aquilo", "correr", "terra", "cabelo", "nossa",

  // the one that forced porra out of the collapsed set: porá → pora
  "Ele porá o projeto em marcha na próxima semana.",
  "porá", "porás",

  // English fragments
  "I need an assessment of the class schedule.",
  "The analysis was passed to the committee.",
  "Scunthorpe", "assumption", "classic", "bassist", "Massachusetts",
  "Please assess the cost of the shipment.",

  // and the only thing that really matters: an ordinary brief
  "Olá Rogério, vi o teu portfólio e gostava de falar sobre um projeto de identidade visual para a minha empresa. Obrigado!",
  "Hi, I would like to discuss a 3D web experience for our product launch.",
];


/* --- Run ----------------------------------------------------------------- */
let falhas = 0;
const linha = (ok, esq, dir = "") => {
  if (!ok) falhas += 1;
  console.log(`   ${ok ? "ok   " : "FALHA"} ${esq.padEnd(58)}${dir}`);
};

console.log("\n  1 . DEVE BLOQUEAR");
for (const texto of BLOQUEAR) {
  const achado = screen(texto);
  linha(achado !== "", JSON.stringify(texto).slice(0, 56),
        achado ? "→ " + achado : "NÃO APANHOU NADA");
}

console.log("\n  2 . NUNCA PODE BLOQUEAR");
for (const texto of PASSAR) {
  const achado = screen(texto);
  linha(achado === "", JSON.stringify(texto).slice(0, 56),
        achado ? `BLOQUEOU por "${achado}"` : "");
}

console.log("\n  3 . COERÊNCIA DAS LISTAS");

// Every term must survive into at least one of the two sets, or it is dead
// weight that can never match anything.
for (const termo of _listas.TERMS) {
  const n = normalise(termo);
  const vivo = _listas.EXACTAS.has(n) ||
               (!_listas.SEM_COLAPSO.has(termo) && _listas.COLAPSADAS.has(collapse(n)));
  linha(vivo, `termo alcançável: ${termo}`);
}

// Every sequence must survive compactar() as a non-empty string, and must not
// be reachable by accident from an empty input.
for (const [i, seq] of _listas.SEQ.entries()) {
  linha(seq.length > 2, `sequência utilizável: ${_listas.SEQUENCES[i]}`, `→ "${seq}"`);
}

// No term may be a prefix-free duplicate of another after collapsing, which
// would mean the list is carrying two entries that do the same job.
const vistos = new Map();
for (const termo of _listas.TERMS) {
  const c = collapse(normalise(termo));
  if (vistos.has(c) && vistos.get(c) !== termo) {
    linha(false, `duplicado após colapso: ${termo}`, `= ${vistos.get(c)}`);
  }
  vistos.set(c, termo);
}

// normalise must not collapse; collapse must.
linha(normalise("putaaa") === "putaaa", "normalise não colapsa");
linha(collapse(normalise("putaaa")) === "puta", "collapse colapsa");
linha(normalise("ação") === "acao", "normalise tira acentos");
linha(normalise("f0d@-se") === "foda-se", "normalise desfaz leetspeak");

console.log(falhas ? `\n  ${falhas} FALHAS\n` : "\n  tudo passou\n");
process.exit(falhas ? 1 : 0);

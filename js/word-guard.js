/* ==========================================================================
   WORD GUARD  ·  screening what gets typed into the contact form
   --------------------------------------------------------------------------
   A politeness filter, and it is worth being honest about what that means:
   this runs in the visitor's own browser, so anyone determined enough to open
   the developer tools walks straight past it. It is not security and it is not
   pretending to be. It exists to stop the impulsive message, which is the only
   kind this form actually receives.

   WHY A PLAIN WORD LIST DOES NOT WORK
   `texto.includes("puta")` blocks DISPUTA, REPUTAÇÃO, AMPUTAR and COMPUTADOR.
   Someone writing "tens uma óptima reputação" has their message refused, is
   given no reason they can act on, and leaves. That is a worse outcome than
   having no filter at all: the filter is now costing real messages in order to
   block imaginary ones, and it does it silently.

   So there are two passes, and they exist for opposite reasons.

     TERMS      matched only as WHOLE WORDS. Anything that lives inside an
                innocent word has to go here: "puta" is inside "disputa", "cu"
                is inside "cuidado" and "curso" and a hundred others.

     SEQUENCES  matched ANYWHERE, because nothing innocent contains them.
                "caralho" is not a fragment of any Portuguese word, and
                "filhodaputa" is what "f i l h o d a p u t a" becomes once the
                spacing is taken out.

   THE SPELLING GAMES, AND WHY THERE ARE TWO STEPS AND NOT ONE
   "P U T A", "pûta" and "f0d@-se" are folded by normalise(): case, accents,
   leetspeak. That step is lossless and safe.

   "filhooo daa putaa" needs something else: collapsing runs of a repeated
   letter. That step IS lossy, and Portuguese is full of real double letters -
   carro → caro, passar → pasar, nossa → nosa. Usually harmless, but not
   always: "porra" and "porá" both collapse to "pora", and a filter that cannot
   tell them apart refuses "ele porá o projeto em marcha".

   So collapsing is kept OUT of normalise() and every word is checked in both
   forms, against two sets built from one list. A word spelled straight is
   caught by the exact set; a word padded with repeats by the collapsed one.
   And a term whose collapsed form collides with real Portuguese is simply left
   out of the collapsed set - that is what SEM_COLAPSO is for.

   The list holds REAL SPELLINGS. Both sets are derived from it here, so
   nothing has to be pre-normalised by hand. An earlier draft asked for
   normalised spellings and eight entries were silently dead because they still
   carried their doubled letters.

   TABLE OF CONTENTS
     1. NORMALISE     (one spelling for every way of writing the same thing)
     2. THE LIST      (real spellings; the sets are derived)
     3. THE CHECK

   Tests: node js/word-guard.test.mjs
   ========================================================================== */


/* ======================================================================
   1. NORMALISE
   ====================================================================== */

/* Characters people substitute for letters. Deliberately small: every entry is
   a chance to turn an innocent string into a listed one, so it covers what is
   actually used and stops there. */
const DISFARCES = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "@": "a", "$": "s", "!": "i", "|": "i", "*": "", "+": "t",
};

/**
 * Case, accents and leetspeak, and nothing else. Lossless: no two different
 * words are merged by it.
 * @param {string} texto
 * @returns {string}
 */
export function normalise(texto) {
  return String(texto)
    .toLowerCase()
    // NFD splits an accented letter into letter + combining mark; the range
    // then removes the marks. "pûta" and "puta" become one string, and so do
    // "ação" and "acao".
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$!|*+]/g, (c) => DISFARCES[c] ?? c);
}

/**
 * A run of the same letter becomes one letter. Lossy on purpose, and kept
 * apart from normalise() for the reason given in the header.
 * @param {string} texto already through normalise()
 * @returns {string}
 */
export function collapse(texto) {
  return texto.replace(/(.)\1+/g, "$1");
}

/* Normalised, collapsed, and with everything that is not a letter removed, so
   spacing and punctuation cannot be used to break a word up. Only the
   SEQUENCES pass may look at this: with the gaps gone, "disputa" really does
   contain "puta", so whole-word matching is impossible here and only the
   unambiguous list is safe against it. */
function compactar(texto) {
  return collapse(normalise(texto)).replace(/[^a-z]/g, "");
}


/* ======================================================================
   2. THE LIST
   ====================================================================== */

/* Whole words only, written the way they are actually spelled.

   Left OUT on purpose, because a false positive costs more than a miss: mild
   insults that are ordinary speech in Portugal (parvo, burro, estúpido), and
   anything with a common innocent meaning (bicha is a queue, vaca and cadela
   are animals, rabo is a tail). */
const TERMS = [
  // pt
  "puta", "putas", "puto", "putos", "putaria", "puteiro",
  "foda", "fodas", "fodam", "fode", "fodeu", "fodido", "fodida", "foder",
  "merda", "merdas", "merdoso",
  "porra", "porras", "porrada",
  // Accents only: normalise() strips them, so listing "cabrao" beside
  // "cabrão" is one entry doing the work of two. The test asserts it.
  "cabrão", "cabrões", "corno", "cornudo",
  "otário", "panasca", "paneleiro", "maricas",
  "cu", "cus", "cuzão", "cona", "conas",
  "colhões", "piroca", "badalhoca", "rameira", "prostituta",
  "escroto", "arrombado", "chulo",
  "fdp", "pqp",
  // en
  "fuck", "fucks", "fucking", "fucker", "fuckers", "fucked",
  "shit", "shits", "shitty", "bullshit",
  "bitch", "bitches", "cunt", "cunts", "asshole", "assholes",
  "bastard", "bastards", "whore", "whores", "slut", "sluts",
  "nigger", "niggers", "faggot", "faggots", "retard", "retarded",
];

/* Terms kept OUT of the collapsed set, because collapsing them lands on a real
   word that somebody has every right to write.

     porra / porrada  →  pora / porada, and "porá" is the future of "pôr":
                         "ele porá o projeto em marcha".

   The cost is narrow and worth stating: "poooorra" is not caught. The benefit
   is that no ordinary sentence is ever refused. Between a miss and a false
   accusation, this file always takes the miss. */
const SEM_COLAPSO = new Set(["porra", "porras", "porrada"]);

/* Matched anywhere, including across removed spaces and punctuation. Nothing
   innocent contains any of these, which is the only reason they may match
   without word boundaries. */
const SEQUENCES = [
  "caralho", "caralhos",
  "filho da puta", "filha da puta", "filhos da puta", "filhas da puta",
  "foda-se", "fode-te",
  "vai tomar no", "vai para o caralho",
  "motherfucker", "fuck you", "son of a bitch",
];

/* Both sets, derived once from the one list above so the two can never drift.
   EXACTAS catches a term spelled straight; COLAPSADAS catches the same term
   padded with repeated letters. */
const EXACTAS = new Set(TERMS.map(normalise));
const COLAPSADAS = new Set(
  TERMS.filter((t) => !SEM_COLAPSO.has(t)).map((t) => collapse(normalise(t)))
);
const SEQ = SEQUENCES.map(compactar);

/* Read by the test file alone, so it can assert what is above rather than
   trust it. Nothing on the site touches this. */
export const _listas = { TERMS, SEQUENCES, SEM_COLAPSO, EXACTAS, COLAPSADAS, SEQ };


/* ======================================================================
   3. THE CHECK
   ====================================================================== */

/**
 * Is there something in here that should not be sent?
 * @param {string} texto whatever the visitor typed
 * @returns {string} the offending word, or "" when the text is fine
 */
export function screen(texto) {
  if (!texto) return "";

  // Whole words first: the pass that can name what it found, and the one that
  // is safe against fragments hiding inside innocent words.
  for (const palavra of normalise(texto).split(/[^a-z]+/)) {
    if (!palavra) continue;
    if (EXACTAS.has(palavra) || COLAPSADAS.has(collapse(palavra))) return palavra;
  }

  // Then the run-together pass, for the spacing games.
  const junto = compactar(texto);
  for (const seq of SEQ) {
    if (junto.includes(seq)) return seq;
  }

  return "";
}

/** Convenience for a caller that only wants a yes or no. */
export function isClean(texto) {
  return screen(texto) === "";
}

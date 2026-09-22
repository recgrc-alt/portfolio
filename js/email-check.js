/* ==========================================================================
   EMAIL CHECK  ·  three questions the browser does not ask
   --------------------------------------------------------------------------
   WHAT THIS CANNOT DO, SAID FIRST SO NOBODY EXPECTS IT
   It cannot tell you that a mailbox exists. Nothing running in a browser can.
   Proving that `alguem@gmail.com` is a real person's address means either an
   authenticated call to a paid verification service, which needs a server to
   hold the key, or sending a mail and waiting for a click. There is no third
   way, and any code that claims otherwise is guessing.

   WHAT IT CAN DO, and all three are worth having, because between them they
   catch nearly every address that is wrong by accident rather than on purpose:

     1. TYPOS IN THE DOMAIN.  gmial.com, hotmial.com, outlok.pt, gmail.co.
        The commonest reason a reply never arrives is a slip in the eight
        characters after the @, and the person who made it has no idea.

     2. WHETHER THE DOMAIN CAN RECEIVE MAIL AT ALL, asked of the public DNS
        over HTTPS. A domain that does not exist, or exists with no mail
        server, can never deliver anything. This is a real check against a real
        authority, and it costs nothing and needs no key.

     3. DISPOSABLE ADDRESSES. A ten-minute mailbox is not someone who wants a
        reply.

   NOTHING HERE MAY EVER COST A MESSAGE
   Every failure path returns "no objection". A DNS query that times out, a
   network that is down, a browser that blocks the request: all of them mean
   the address is accepted, because a form that refuses to send while the DNS
   is unreachable is a form that has stopped working. The check adds certainty
   when it can and gets out of the way when it cannot.

   TABLE OF CONTENTS
     1. PARTS        (splitting an address, safely)
     2. TYPOS        (edit distance against the domains people actually use)
     3. DISPOSABLE
     4. DNS          (does this domain accept mail)
     5. THE CHECK    (the three, in the order that costs least)

   Tests: node js/email-check.test.mjs
   ========================================================================== */


/* ======================================================================
   1. PARTS
   ====================================================================== */

/** @returns {{user: string, domain: string}|null} */
export function parts(email) {
  const texto = String(email || "").trim().toLowerCase();
  const at = texto.lastIndexOf("@");
  if (at <= 0 || at === texto.length - 1) return null;
  const domain = texto.slice(at + 1);
  // A domain with no dot, a leading/trailing dot, or a space is not one.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return { user: texto.slice(0, at), domain };
}


/* ======================================================================
   2. TYPOS
   ====================================================================== */

/* The domains that account for most personal addresses, plus the Portuguese
   ones. A suggestion is only offered for a domain that is CLOSE to one of
   these and not equal to it, so a company's own domain is never second-guessed
   - which is the failure mode that would matter most on this form. */
const COMUNS = [
  "gmail.com", "hotmail.com", "outlook.com", "outlook.pt", "hotmail.pt",
  "live.com", "live.com.pt", "yahoo.com", "yahoo.com.br", "icloud.com",
  "me.com", "protonmail.com", "proton.me", "sapo.pt", "clix.pt", "netcabo.pt",
  "iol.pt", "mail.com", "aol.com", "gmx.com", "yandex.com", "zoho.com",
];

/* Damerau-Levenshtein, and the Damerau part is the whole reason.
   A TRANSPOSITION IS ONE MISTAKE, NOT TWO. "gmial" for "gmail" is two fingers
   landing out of order - the single commonest typing error there is. Plain
   Levenshtein scores it 2, the same as two unrelated wrong letters, which
   forces the threshold up to 2 to catch it, which is exactly what let "we.com"
   be "corrected" into "me.com". Counting it as the one mistake it actually is
   means the threshold can stay at 1, where it is safe. */
function distancia(a, b, limite) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i += 1) {
    let melhor = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      // the transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      if (d[i][j] < melhor) melhor = d[i][j];
    }
    if (melhor > limite) return limite + 1;   // no later row can improve on this
  }
  return d[a.length][b.length];
}

/* The label before the first dot: "gmail" in gmail.com. */
function rotulo(dominio) {
  return dominio.split(".")[0];
}

/**
 * A likely correction for the domain, or "" when there is nothing to say.
 * @param {string} email
 * @returns {string} the whole corrected address, e.g. "ana@gmail.com"
 */
export function suggest(email) {
  const p = parts(email);
  if (!p) return "";
  if (COMUNS.includes(p.domain)) return "";       // already right

  for (const bom of COMUNS) {
    /* A SHORT LABEL IS NEVER OFFERED AS A CORRECTION. "me.com" is three
       characters from being "we.com", "he.com", "ze.com" and "my.com", and
       every one of those is somebody's real address. Below four characters a
       single edit stops being evidence of a typo and starts being evidence of
       a different company, so those entries can be matched exactly but never
       suggested. */
    if (rotulo(bom).length < 4) continue;

    // One edit, and only one. With transpositions counted properly (see
    // distancia) that is enough for every typo this list is meant to catch,
    // and tight enough that no real domain is second-guessed.
    if (distancia(p.domain, bom, 1) <= 1) return `${p.user}@${bom}`;
  }
  return "";
}


/* ======================================================================
   3. DISPOSABLE
   ====================================================================== */

/* The handful that actually turn up. Not exhaustive and not meant to be:
   there are thousands of these domains and chasing them is a losing game.
   This catches the ones a person reaches for without thinking. */
const DESCARTAVEIS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "throwawaymail.com", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "maildrop.cc",
  "dispostable.com", "fakeinbox.com", "mailnesia.com", "spamgourmet.com",
  "mintemail.com", "mohmal.com", "emailondeck.com", "tempr.email",
]);

/** @returns {boolean} */
export function isDisposable(email) {
  const p = parts(email);
  return !!p && DESCARTAVEIS.has(p.domain);
}


/* ======================================================================
   4. DNS
   ====================================================================== */

/* Cloudflare's public resolver, over HTTPS, in its JSON form. No account, no
   key, no rate limit worth worrying about for a contact form, and the request
   carries nothing but a domain name - never the address itself, which is why
   the user part is dropped before this is called. */
const RESOLVER = "https://cloudflare-dns.com/dns-query";
const TEMPO_LIMITE = 2500;

/* One answer per domain per visit. Somebody correcting the user part of their
   address should not re-ask the same question about the same domain. */
const memoria = new Map();

async function perguntar(dominio, tipo) {
  const corte = new AbortController();
  const relogio = setTimeout(() => corte.abort(), TEMPO_LIMITE);
  try {
    const r = await fetch(
      `${RESOLVER}?name=${encodeURIComponent(dominio)}&type=${tipo}`,
      { headers: { accept: "application/dns-json" }, signal: corte.signal }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;                 // aborted, offline, blocked: no objection
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Can this domain receive mail?
 * @param {string} email
 * @returns {Promise<boolean|null>} true / false / null when it cannot be told
 */
export async function domainAcceptsMail(email) {
  const p = parts(email);
  if (!p) return null;
  if (memoria.has(p.domain)) return memoria.get(p.domain);

  const mx = await perguntar(p.domain, "MX");
  if (mx === null) return null;                       // no answer: no objection

  let veredicto;
  if (mx.Status === 3) {
    veredicto = false;                                // NXDOMAIN: no such domain
  } else if (mx.Status !== 0) {
    veredicto = null;                                 // some other DNS failure
  } else if (Array.isArray(mx.Answer) && mx.Answer.some((a) => a.type === 15)) {
    veredicto = true;                                 // a real MX record
  } else {
    /* No MX. That is not the end of it: RFC 5321 says a domain with an address
       record and no MX still accepts mail at that host. Plenty of small
       domains are set up exactly that way, and calling them undeliverable
       would be wrong. */
    const a = await perguntar(p.domain, "A");
    if (a === null) veredicto = null;
    else veredicto = a.Status === 0 && Array.isArray(a.Answer) && a.Answer.length > 0;
  }

  memoria.set(p.domain, veredicto);
  return veredicto;
}


/* ======================================================================
   5. THE CHECK
   ====================================================================== */

/**
 * The three checks, cheapest first, stopping at the first objection.
 * @param {string} email
 * @returns {Promise<{ok: boolean, reason?: string, suggestion?: string}>}
 */
export async function check(email) {
  const p = parts(email);
  if (!p) return { ok: true };            // shape is the browser's job, not this one

  const sugestao = suggest(email);
  if (sugestao) return { ok: false, reason: "typo", suggestion: sugestao };

  if (isDisposable(email)) return { ok: false, reason: "disposable" };

  const aceita = await domainAcceptsMail(email);
  if (aceita === false) return { ok: false, reason: "nodomain" };

  return { ok: true };                    // true, or null: both mean carry on
}

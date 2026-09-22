/* ==========================================================================
   EMAIL CHECK · tests
   --------------------------------------------------------------------------
   Run with:  node js/email-check.test.mjs

   Only the parts that do not touch the network are asserted here, and that is
   the right line: a test that depends on the DNS being reachable fails on a
   train, which teaches you nothing about the code. The DNS path is written so
   that every failure means "no objection", and that property is asserted by
   reading the code rather than by pretending to be offline.

   The list that matters is NAO_SUGERIR. Second-guessing somebody's own company
   domain is the one failure here that would actually cost a message: a person
   at a small agency types their real address, the form tells them it is wrong,
   and they believe it.

   The temp-file copy is explained in word-guard.test.mjs: there is no
   package.json in this project on purpose.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const copia = join(tmpdir(), "email-check.copia.mjs");
writeFileSync(copia, readFileSync(join(aqui, "email-check.js")));
const { parts, suggest, isDisposable } = await import(pathToFileURL(copia).href);

let falhas = 0;
const linha = (ok, esq, dir = "") => {
  if (!ok) falhas += 1;
  console.log(`   ${ok ? "ok   " : "FALHA"} ${esq.padEnd(46)}${dir}`);
};


/* --- 1 . Splitting ------------------------------------------------------- */
console.log("\n  1 . PARTES");
for (const [entrada, esperado] of [
  ["ana@gmail.com", "gmail.com"],
  ["  Ana@GMAIL.com  ", "gmail.com"],
  ["a+etiqueta@sapo.pt", "sapo.pt"],
  ["nome@sub.dominio.co.uk", "sub.dominio.co.uk"],
  ["semarroba.com", null],
  ["@gmail.com", null],
  ["ana@", null],
  ["ana@semponto", null],
  ["ana@ponto.", null],
  ["ana@ .com", null],
  ["", null],
]) {
  const p = parts(entrada);
  const obtido = p ? p.domain : null;
  linha(obtido === esperado, JSON.stringify(entrada), `→ ${JSON.stringify(obtido)}`);
}


/* --- 2 . Typos that must be corrected ------------------------------------ */
console.log("\n  2 . DEVE SUGERIR CORREÇÃO");
for (const [entrada, esperado] of [
  ["ana@gmial.com", "ana@gmail.com"],
  ["ana@gmai.com", "ana@gmail.com"],
  ["ana@gmail.co", "ana@gmail.com"],
  ["ana@hotmial.com", "ana@hotmail.com"],
  ["ana@hotmai.com", "ana@hotmail.com"],
  ["ana@outlok.com", "ana@outlook.com"],
  ["ana@yaho.com", "ana@yahoo.com"],
  ["ana@icloud.co", "ana@icloud.com"],
  ["ana@sapo.ot", "ana@sapo.pt"],
]) {
  const s = suggest(entrada);
  linha(s === esperado, entrada, `→ ${s || "nada"}`);
}


/* --- 3 . Domains that must be left alone --------------------------------- */
console.log("\n  3 . NUNCA PODE SUGERIR");
const NAO_SUGERIR = [
  // already correct
  "ana@gmail.com", "ana@sapo.pt", "ana@outlook.pt", "ana@proton.me",
  // real company domains that happen to be short or to look like something
  "geral@quebrajazz.pt", "info@noytrall.com", "hello@studio.com",
  "ana@we.com", "ana@he.com", "ana@ze.com", "ana@my.com",
  "ana@mail.pt", "ana@zoho.eu", "ana@live.pt",
  "rogerio@rogerioedgar.com",
  "ana@universidade.pt", "ana@fe.up.pt", "ana@ua.pt",
  "ana@empresa.com.br", "ana@agencia.co.uk",
];
for (const entrada of NAO_SUGERIR) {
  const s = suggest(entrada);
  linha(s === "", entrada, s ? `SUGERIU ${s}` : "");
}


/* --- 4 . Disposable ------------------------------------------------------ */
console.log("\n  4 . DESCARTÁVEIS");
for (const [entrada, esperado] of [
  ["ana@mailinator.com", true],
  ["ana@yopmail.com", true],
  ["ana@10minutemail.com", true],
  ["ana@gmail.com", false],
  ["ana@sapo.pt", false],
  ["ana@rogerioedgar.com", false],
]) {
  linha(isDisposable(entrada) === esperado, entrada, esperado ? "descartável" : "normal");
}


console.log(falhas ? `\n  ${falhas} FALHAS\n` : "\n  tudo passou\n");
process.exit(falhas ? 1 : 0);

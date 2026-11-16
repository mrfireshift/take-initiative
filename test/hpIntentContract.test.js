// Trasformazioni, §5.14 di docs/PIANO_TRASFORMAZIONI.md: il contratto sugli intenti degli scrittori dei PF. Il ritorno da
// una forma a 0 PF legge il danno dall'intento (hpIntent, hpIntents) e, senza, dal calo dei PF: uno scrittore di danno
// senza intento perde l'eccesso oltre lo 0 (e il danno massiccio non si vede). Ogni scrittura dei PF calcolata da un
// danno o da una cura (calculateQuickHPChange: hp: ….afterHP) dichiara l'intento; chi scrive i PF senza un calcolo
// (l'editor in linea, l'import da statblock, l'idratazione) sta nell'elenco qui sotto, con il motivo.
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);
const sources = readdirSync(SRC).filter((name) => name.endsWith(".js"))
  .map((name) => ({ name, text: readFileSync(new URL(name, SRC), "utf8").replace(/\r\n/g, "\n") }));

// The object literal around a position: from the "{" that holds it to its "}".
function objectAround(text, index) {
  let depth = 0;
  let start = index;
  for (; start >= 0; start -= 1) {
    if (text[start] === "}") depth += 1;
    if (text[start] === "{") {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  depth = 0;
  for (let end = start; end < text.length; end += 1) {
    if (text[end] === "{") depth += 1;
    if (text[end] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, end + 1);
    }
  }
  return text.slice(start);
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

test("ogni scrittura dei PF calcolata da un danno o da una cura dichiara il suo intento", () => {
  const WRITE = /itemId\s*:\s*[^,\n]+,\s*hp\s*:\s*[A-Za-z_$][\w$.?]*\.afterHP\b/g;
  const missing = [];
  let writes = 0;
  for (const { name, text } of sources) {
    for (const match of text.matchAll(WRITE)) {
      writes += 1;
      if (!/hpIntents?\s*:/.test(objectAround(text, match.index))) missing.push(`${name}:${lineOf(text, match.index)}`);
    }
  }
  assert.ok(writes >= 20, `trovate solo ${writes} scritture: il modello non le riconosce più`);
  assert.deepEqual(missing, [], "scritture dei PF senza hpIntent");
});

// The files that write the HP (an "hp:set" operation) with no intent at all, and why that is right for them.
const WITHOUT_INTENT = {
  "initiativeList.js": "l'editor in linea scrive il valore nuovo: a 0 la forma finisce senza eccesso (G39)",
  "monsterHitPointsImport.js": "i PF dallo statblock: un valore nuovo, non un danno",
  "monsterHydrationExtras.js": "l'idratazione di un mostro: i PF del suo statblock",
};

test("chi scrive i PF senza alcun intento è solo nell'elenco, con il suo motivo", () => {
  const HP_SET = /type\s*:\s*["']hp:set["']/;
  const found = sources.filter(({ text }) => HP_SET.test(text) && !/hpIntents?\b/.test(text)).map(({ name }) => name).sort();
  assert.deepEqual(found, Object.keys(WITHOUT_INTENT).sort(),
    "un file nuovo che scrive i PF: dichiari l'intento, o entri nell'elenco con il motivo");
});

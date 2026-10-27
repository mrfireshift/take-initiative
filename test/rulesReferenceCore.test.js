import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  buildRulesIndex,
  entryPath,
  normalizeRulesText,
  resolveRelated,
  rulesTree,
  searchRules,
} from "../src/rulesReferenceCore.js";
import { CONDITION_REFERENCE } from "../src/referenceData.js";

const REAL_CATALOG_URL = new URL("../src/rules-reference-it.json", import.meta.url);

const CATALOG = {
  schemaVersion: 1,
  topics: [
    {
      id: "avventura",
      name: "Avventura",
      sections: [{ id: "riposare", name: "Riposare" }],
    },
    {
      id: "combattimento",
      name: "Combattimento",
      sections: [
        { id: "effettuare-un-attacco", name: "Effettuare un attacco" },
        { id: "senza-voci", name: "Senza voci" },
      ],
    },
  ],
  entries: [
    {
      id: "riposo-breve",
      topic: "avventura",
      section: "riposare",
      name: "Riposo breve",
      page: 100,
      text: "Un riposo breve è un periodo di inattività della durata minima di 1 ora.",
      aliases: [],
      related: ["riposo-lungo"],
      optional: false,
    },
    {
      id: "riposo-lungo",
      topic: "avventura",
      section: "riposare",
      name: "Riposo lungo",
      page: 100,
      text: "Un riposo lungo dura almeno 8 ore. Durante un riposo lungo, a differenza di un riposo breve, il personaggio dorme.",
      aliases: [],
      related: ["riposo-breve"],
      optional: false,
    },
    {
      id: "combattimento-ordine",
      topic: "combattimento",
      section: null,
      name: "L'ordine del combattimento",
      page: 101,
      text: "Un tipico incontro di combattimento è uno scontro tra due schieramenti, perché ognuno agisce nel suo turno.",
      aliases: [],
      related: [],
      optional: false,
    },
    {
      id: "contese-in-combattimento",
      topic: "combattimento",
      section: "effettuare-un-attacco",
      name: "Contese in combattimento",
      page: 108,
      text: "Una contesa mette a confronto i tentativi di due creature. Per afferrare o spingere si effettua una contesa.",
      aliases: [],
      related: ["lottare"],
      optional: false,
    },
    {
      id: "lottare",
      topic: "combattimento",
      section: "effettuare-un-attacco",
      name: "Lottare",
      page: 108,
      text: "Quando una creatura vuole afferrarne un'altra, può usare l'azione di Attacco per effettuare un attacco speciale in mischia, una lotta.",
      aliases: ["afferrare", "presa"],
      related: ["contese-in-combattimento", "condition:Afferrato", "voce-inesistente", "condition:Nessuna"],
      optional: false,
    },
    {
      id: "copertura",
      topic: "combattimento",
      section: "effettuare-un-attacco",
      name: "Copertura",
      page: 110,
      text: "Muri, alberi, creature e altri ostacoli possono fornire copertura durante il combattimento.",
      aliases: [],
      related: [],
      optional: false,
    },
    {
      id: "attacchi-di-opportunita",
      topic: "combattimento",
      section: "effettuare-un-attacco",
      name: "Attacchi d'opportunità",
      page: 107,
      text: "Una creatura può effettuare un attacco d'opportunità quando una creatura ostile si allontana. Perché accada serve la reazione.",
      aliases: ["oa"],
      related: [],
      optional: false,
    },
  ],
};

const INDEX = buildRulesIndex(CATALOG);

function ids(query, options) {
  return searchRules(INDEX, query, options).results.map((entry) => entry.id);
}

test("normalizeRulesText toglie maiuscole, accenti e punteggiatura", () => {
  assert.equal(normalizeRulesText("Attacchi d'opportunità"), "attacchi d opportunita");
  assert.equal(normalizeRulesText("  PERCHÉ?  Sì… "), "perche si");
  assert.equal(normalizeRulesText(null), "");
});

test("lottare mette Lottare per primo", () => {
  assert.equal(ids("lottare")[0], "lottare");
  assert.equal(ids("LOTTARE")[0], "lottare");
});

test("afferrare trova Lottare tramite l'alias, davanti alle voci che lo citano solo nel testo", () => {
  const found = ids("afferrare");
  assert.equal(found[0], "lottare");
  assert.ok(found.includes("contese-in-combattimento"));
});

test("cop trova Copertura tra i primi 3", () => {
  assert.ok(ids("cop").slice(0, 3).includes("copertura"));
});

test("riposo breve mette Riposo breve per primo e Riposo lungo non prima", () => {
  const found = ids("riposo breve");
  assert.equal(found[0], "riposo-breve");
  assert.ok(found.indexOf("riposo-lungo") === -1 || found.indexOf("riposo-lungo") > 0);
});

test("a parità di punteggio vale l'ordine dell'indice dei contenuti", () => {
  assert.deepEqual(ids("riposo"), ["riposo-breve", "riposo-lungo"]);
});

test("le parole della ricerca vanno tutte trovate", () => {
  assert.deepEqual(ids("riposo lungo"), ["riposo-lungo"]);
  assert.deepEqual(ids("lottare copertura"), []);
  assert.deepEqual(ids("contesa spingere"), ["contese-in-combattimento"]);
});

test("una parola cerca l'inizio delle parole indicizzate e il percorso conta", () => {
  assert.deepEqual(ids("opportunita"), ["attacchi-di-opportunita"]);
  assert.deepEqual(ids("pportunita"), []);
  const found = ids("combattimento attacco");
  assert.ok(found.indexOf("lottare") < found.indexOf("combattimento-ordine") || !found.includes("combattimento-ordine"));
  assert.equal(ids("effettuare un attacco copertura")[0], "copertura");
});

test("gli accenti non contano: perche trova perché", () => {
  assert.deepEqual(ids("perche"), ["combattimento-ordine", "attacchi-di-opportunita"]);
  assert.deepEqual(ids("PERCHÉ"), ids("perche"));
  assert.deepEqual(ids("opportunità"), ["attacchi-di-opportunita"]);
});

test("una ricerca vuota non restituisce niente", () => {
  for (const query of ["", "   ", "'?!", null, undefined]) {
    assert.deepEqual(searchRules(INDEX, query), { results: [], total: 0 });
  }
});

test("una ricerca senza corrispondenze restituisce zero risultati", () => {
  assert.deepEqual(searchRules(INDEX, "drago"), { results: [], total: 0 });
});

test("limit taglia i risultati e total li conta tutti", () => {
  const all = searchRules(INDEX, "combattimento");
  assert.ok(all.total >= 4);
  const limited = searchRules(INDEX, "combattimento", { limit: 2 });
  assert.equal(limited.results.length, 2);
  assert.equal(limited.total, all.total);
  assert.deepEqual(limited.results, all.results.slice(0, 2));
});

test("rulesTree raggruppa per argomento e sezione, prima le voci senza sezione", () => {
  const tree = rulesTree(CATALOG);
  assert.deepEqual(tree.map((node) => node.topic.id), ["avventura", "combattimento"]);
  assert.deepEqual(
    tree[0].sections.map(({ section, entries }) => [section?.id ?? null, entries.map((entry) => entry.id)]),
    [["riposare", ["riposo-breve", "riposo-lungo"]]],
  );
  assert.deepEqual(
    tree[1].sections.map(({ section, entries }) => [section?.id ?? null, entries.map((entry) => entry.id)]),
    [
      [null, ["combattimento-ordine"]],
      ["effettuare-un-attacco", ["contese-in-combattimento", "lottare", "copertura", "attacchi-di-opportunita"]],
    ],
  );
  assert.equal(tree[1].sections[1].section.name, "Effettuare un attacco");
});

test("entryPath dà argomento e sezione per il percorso", () => {
  const byId = (id) => CATALOG.entries.find((entry) => entry.id === id);
  assert.deepEqual(entryPath(CATALOG, byId("lottare")), ["Combattimento", "Effettuare un attacco"]);
  assert.deepEqual(entryPath(CATALOG, byId("combattimento-ordine")), ["Combattimento"]);
  assert.deepEqual(entryPath(CATALOG, { topic: "nessuno" }), []);
});

test("resolveRelated risolve regole e condizioni e scarta gli id sconosciuti", () => {
  const lottare = INDEX.byId.get("lottare");
  const related = resolveRelated(CATALOG, lottare, CONDITION_REFERENCE);
  assert.equal(related.length, 2);
  assert.equal(related[0].kind, "rule");
  assert.equal(related[0].entry.id, "contese-in-combattimento");
  assert.equal(related[1].kind, "condition");
  assert.equal(related[1].condition.name, "Afferrato");
  assert.deepEqual(resolveRelated(CATALOG, lottare), [related[0]]);
  assert.deepEqual(resolveRelated(CATALOG, { related: [] }, CONDITION_REFERENCE), []);
});

test(
  "sul catalogo reale una ricerca costa in media meno di 16 ms",
  { skip: existsSync(REAL_CATALOG_URL) ? false : "src/rules-reference-it.json non c'è ancora" },
  () => {
    const catalog = JSON.parse(readFileSync(REAL_CATALOG_URL, "utf8"));
    const index = buildRulesIndex(catalog);
    assert.ok(index.entries.length > 0);
    const queries = [
      "lottare", "afferrare", "cop", "riposo breve", "attacco", "tiro salvezza", "a", "di", "concentrazione",
      "vantaggio svantaggio", "perche", "zzzz", "caduta", "luce fioca", "c", "veleno", "azione bonus", "morte",
      "copertura tre quarti", "incantesimo",
    ];
    const runs = 200;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) searchRules(index, queries[i % queries.length]);
    const average = (performance.now() - start) / runs;
    assert.ok(average < 16, `media ${average.toFixed(2)} ms`);
  },
);

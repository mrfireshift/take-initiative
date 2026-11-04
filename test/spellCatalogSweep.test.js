// Lotto P0 of docs/PIANO_POLISH_INCANTESIMI.md: the whole catalog, cast by cast, from the panel's contract to the Undo and
// the panel's Termina. A defect that is not on this list fails the test; so does an entry that no longer happens, which
// is how the list shrinks as the lots close.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { runSpellSweep, sweepCatalog, sweepFindings } = await import("../test-support/spellSweepHarness.js");

const IN_MEMORY_TELEPORT = "Nella scena in memoria il token non si sposta: provato al banco (Passo velato, 03/11/2026).";
const LIVING_TARGET = "Il bersaglio della prova è vivo: il rifiuto è voluto (test/stabilizeSpells.test.js).";
const COMPOSITION = "Chiede la composizione degli oggetti: test/animatedObjectsPanelView.test.js.";

const KNOWN = Object.freeze({
  "command-invalid": { "animate-objects": COMPOSITION },
  "panel-blocked": { "animate-objects": COMPOSITION },
  "termina-leaves": {
    "delayed-blast-fireball": "Termina apre la detonazione finale: la pill resta fino alla sua risoluzione.",
  },
  "undo-failed": {
    "dimension-door": IN_MEMORY_TELEPORT,
    "misty-step": IN_MEMORY_TELEPORT,
  },
  "no-effect": {
    "dimension-door": IN_MEMORY_TELEPORT,
    "misty-step": IN_MEMORY_TELEPORT,
    "xanathar-passo-del-tuono": IN_MEMORY_TELEPORT,
  },
  "rejected": {
    "raise-dead": LIVING_TARGET,
    "reincarnate": LIVING_TARGET,
    "resurrection": LIVING_TARGET,
    "revivify": LIVING_TARGET,
    "spare-the-dying": LIVING_TARGET,
    "true-resurrection": LIVING_TARGET,
  },
});

const knownKeys = () => Object.entries(KNOWN).flatMap(([kind, ids]) => Object.keys(ids).map((id) => `${kind}:${id}`));

const records = await runSpellSweep();
const findings = sweepFindings(records);

test("the sweep covers every spell of the catalog, with a failed and a passed save for each variant", () => {
  const catalog = sweepCatalog().map((spell) => spell.id);
  assert.equal(new Set(records.map((record) => record.id)).size, catalog.length);
  for (const id of catalog) {
    const runs = records.filter((record) => record.id === id);
    assert.ok(runs.some((run) => run.outcome === "failed") && runs.some((run) => run.outcome === "passed"), id);
  }
});

test("no spell shows a defect that is not on the known list", () => {
  const known = new Set(knownKeys());
  const unexpected = findings.filter((finding) => !known.has(finding.key));
  assert.deepEqual(
    unexpected.map((finding) => `${finding.key}${finding.variant ? `/${finding.variant}` : ""} ${finding.detail}`.trim()),
    [],
  );
});

test("every entry of the known list still happens: a closed one comes off", () => {
  const seen = new Set(findings.map((finding) => finding.key));
  assert.deepEqual(knownKeys().filter((key) => !seen.has(key)), []);
});

test("a cast with its damage field takes the damage, and the save halves or spares it", () => {
  const offenders = [];
  for (const record of records) {
    if (record.status !== "applied" || !record.castHasHP || !record.hp) continue;
    if (!["passed", "failed"].includes(record.outcome)) continue;
    const taken = 40 - record.hp.one;
    const expected = record.outcome === "failed" ? [20] : [0, 10, 20];
    // Healing and self-targeted casts show up as another amount on the target; these three have their own damage.
    if (taken < 0 || record.mode === "self") continue;
    if (["power-word-kill", "magic-missile", "phb2014-aura-di-vitalita"].includes(record.id)) continue;
    if (!expected.includes(taken)) offenders.push(`${record.id}/${record.variant} ${record.outcome}: ${taken}`);
  }
  assert.deepEqual(offenders, []);
});

test("the register holds every spell of the catalog, and what the sweep finds today", () => {
  const register = JSON.parse(readFileSync(new URL("../data/spell-polish-register.json", import.meta.url), "utf8"));
  const catalog = sweepCatalog().map((spell) => spell.id);
  assert.deepEqual(register.spells.map((entry) => entry.id).sort(), [...catalog].sort(), "npm run polish:register");
  const byId = new Map();
  for (const finding of findings) byId.set(finding.id, [...(byId.get(finding.id) || []), finding.kind]);
  const stale = register.spells.filter((entry) => (
    JSON.stringify([...(entry.sweep?.findings || [])].sort()) !== JSON.stringify([...(byId.get(entry.id) || [])].sort())
  )).map((entry) => entry.id);
  assert.deepEqual(stale, [], "npm run polish:register");
  for (const entry of register.spells) {
    assert.ok(["da-leggere", "letto", "corretto"].includes(entry.reading?.state), entry.id);
    assert.equal(entry.description, undefined, "the register holds no spell text");
  }
});

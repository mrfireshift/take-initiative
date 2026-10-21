import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackPreview, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";
import { DAMAGE_TYPES } from "../src/damageDefensesCore.js";
import { QUICK_ACTION_ATTACK_DAMAGE_TYPES } from "../src/quickActionsCore.js";

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] };
const source = (meta = {}) => ({ id: "paladin", name: "Aria", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: {
  initiativeCard: { quickActions: [sword] }, hp: 40, hpMax: 40, inInitiative: true, ...meta,
} } });
const target = (meta = {}) => ({ id: "ghoul", name: "Ghoul", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: {
  hp: 30, hpMax: 30, inInitiative: true, unrelated: "keep", ...meta,
} } });
const turnState = { round: 3, current: 0, order: ["paladin", "ghoul"] };
const plan = (overrides = {}) => buildPcAttackMutation({ action: sword, sourceItem: source(), targetItem: target(),
  outcome: "hit", componentAmounts: { c1: 8, c2: 9 }, attackInstanceId: "attack-one", turnState, ...overrides });

test("the attack damage types are the Actor Profile damage types", () => {
  assert.deepEqual([...QUICK_ACTION_ATTACK_DAMAGE_TYPES].sort(), DAMAGE_TYPES.map((type) => type.id).sort());
});

for (const outcome of ["hit", "critical"]) test(`${outcome}: typed components, one HP command and the attack provenance`, () => {
  const result = plan({ outcome });
  assert.equal(result.change.afterHP, 13);
  assert.deepEqual(result.damageComponents.map((c) => [c.id, c.type, c.inputAmount, c.amount]), [["c1", "slashing", 8, 8], ["c2", "radiant", 9, 9]]);
  assert.equal(result.operations.length, 1);
  const update = result.operations[0].updates[0];
  assert.deepEqual([update.itemId, update.hp, update.hpMax], ["ghoul", 13, 30]);
  assert.deepEqual(update.expectedHP, { present: true, value: 30 });
  assert.deepEqual(update.hpIntent, { mode: "damage", amount: 17, eventId: "attack-one" });
  const causality = result.options.history.payload.causality;
  assert.deepEqual(causality.actor, { id: "paladin", tokenId: "paladin", name: "Aria", role: "attacker" });
  assert.deepEqual(causality.cause, { kind: "pc-attack", quickActionId: "holy-sword", actionName: "Spada sacra", attackInstanceId: "attack-one", range: "melee" });
  assert.deepEqual(causality.action, { id: "holy-sword", label: "Spada sacra", attackOutcome: outcome });
  assert.equal(causality.turn.turnKey.length > 0, true);
  assert.equal(causality.turn.round, 3);
  assert.equal(causality.targets[0].appliedHpDelta, -17);
  assert.equal(result.options.kind, "pc-attack");
  assert.equal(result.options.history.kind, "pc-attack");
  assert.equal(result.options.commandId, "attack-one");
  assert.equal(result.options.correlationId, "attack-one");
  assert.deepEqual(result.options.targetIds, ["ghoul"]);
});

test("the attacker records its last attack and asserts its card; the target asserts its defenses", () => {
  const result = plan();
  const [own, defended] = result.options.metadataPatches;
  assert.equal(own.id, "paladin");
  assert.equal(own.fields.initiativeCard.mode, "assert");
  assert.deepEqual(own.fields[PC_ATTACK_STATE_FIELD].expected, { present: false });
  const last = own.fields[PC_ATTACK_STATE_FIELD].value.lastAttack;
  assert.deepEqual([last.attackInstanceId, last.quickActionId, last.targetId, last.outcome, last.round], ["attack-one", "holy-sword", "ghoul", "hit", 3]);
  assert.equal(typeof last.turnKey, "string");
  assert.equal(defended.id, "ghoul");
  assert.equal(defended.fields.initiativeCard.mode, "assert");
});

test("a miss changes no HP but is still a command (its last attack is written)", () => {
  const result = plan({ outcome: "miss", componentAmounts: {} });
  assert.deepEqual(result.operations, []);
  assert.equal(result.change, null);
  assert.equal(result.damageComponents.every((c) => c.amount === 0), true);
  assert.equal(result.options.metadataPatches.length, 1);
  assert.equal(result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.lastAttack.outcome, "miss");
  assert.equal(result.options.history.payload.causality.targets[0].requestedDamage, 0);
});

test("defenses apply per damage type and can be ignored for one attack", () => {
  const defenses = { resistances: ["slashing"], immunities: [], vulnerabilities: ["radiant"] };
  const resisted = target({ initiativeCard: { damageDefenses: defenses } });
  const result = plan({ targetItem: resisted, expectedDefenses: defenses });
  assert.deepEqual(result.damageComponents.map((c) => [c.type, c.defense, c.amount]), [["slashing", "resistance", 4], ["radiant", "vulnerability", 18]]);
  assert.equal(result.change.requested, 22);
  const ignored = plan({ targetItem: resisted, expectedDefenses: defenses, ignoredDefenses: ["slashing"] });
  assert.deepEqual(ignored.damageComponents.map((c) => c.amount), [8, 18]);
  assert.equal(ignored.damageComponents[0].defenseIgnored, "resistance");
});

test("immunity to every component still records the hit without an HP command", () => {
  const defenses = { immunities: ["slashing", "radiant"], resistances: [], vulnerabilities: [] };
  const result = plan({ targetItem: target({ initiativeCard: { damageDefenses: defenses } }), expectedDefenses: defenses });
  assert.equal(result.change.changed, false);
  assert.deepEqual(result.operations, []);
  assert.equal(result.options.metadataPatches.length, 1);
});

test("defenses changed since the preview reject the attack", () => {
  assert.throws(() => plan({ targetItem: target({ initiativeCard: { damageDefenses: { resistances: ["slashing"] } } }), expectedDefenses: {} }), /difese/);
});

test("temporary hit points (hp above hpMax) are consumed first", () => {
  const result = plan({ targetItem: target({ hp: 35, hpMax: 30 }), componentAmounts: { c1: 3, c2: 0 } });
  assert.equal(result.change.afterHP, 32);
});

test("invalid actors, decisions and amounts fail before any mutation", () => {
  assert.throws(() => plan({ targetItem: source() }), /bersaglio/);
  assert.throws(() => plan({ sourceItem: { ...source(), id: "__LAIR__" } }), /token creatura/);
  assert.throws(() => plan({ targetItem: { ...target(), id: "ghoul::p1" } }), /token creatura/);
  assert.throws(() => plan({ outcome: "" }), /esito/);
  assert.throws(() => plan({ outcome: "passed" }), /esito/);
  assert.throws(() => plan({ componentAmounts: { c1: 8 } }), /danno/);
  assert.throws(() => plan({ componentAmounts: { c1: -1, c2: 2 } }), /intero/);
  assert.throws(() => plan({ componentAmounts: { c1: 1, c2: 2, c9: 3 } }), /sconosciuta/);
  assert.throws(() => plan({ attackInstanceId: "" }), /Identità/);
  assert.throws(() => plan({ action: { ...sword, kind: "condition", conditionName: "Prono" } }), /non valida/);
  assert.throws(() => plan({ targetItem: target({ hp: undefined }) }), /HP canonici/);
});

test("the preview names the next missing decision and shows the HP the attack leaves", () => {
  assert.equal(pcAttackPreview({ action: sword }).blocker, "Scegli il bersaglio.");
  assert.equal(pcAttackPreview({ action: sword, targetItem: target() }).blocker, "Scegli l'esito dell'attacco.");
  assert.equal(pcAttackPreview({ action: sword, targetItem: target(), outcome: "hit", amounts: { c1: "8", c2: "" } }).blocker,
    "Inserisci il danno di ogni componente.");
  const miss = pcAttackPreview({ action: sword, targetItem: target(), outcome: "miss", amounts: { c1: "", c2: "" } });
  assert.deepEqual([miss.ready, miss.total, miss.hp.after], [true, 0, 30]);
  const defenses = { resistances: ["slashing"], immunities: [], vulnerabilities: [] };
  const hit = pcAttackPreview({ action: sword, targetItem: target({ initiativeCard: { damageDefenses: defenses } }), outcome: "critical",
    amounts: { c1: "16", c2: "18" } });
  assert.deepEqual([hit.ready, hit.total, hit.hp.before, hit.hp.after], [true, 26, 30, 4]);
  assert.deepEqual(hit.defenses, [{ type: "slashing", defense: "resistance", ignored: false }]);
});

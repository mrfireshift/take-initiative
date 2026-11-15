// The damage a spell's pill adds to a hit (Hunter's Mark, Hex, Divine Favor, Elemental Weapon, Spirit Shroud, Absorb
// Elements): found at the table, a ranger with Hunter's Mark on the target had no box for the mark's 1d6 in the console.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackRiderOptions } from "../src/pcAttackCore.js";

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing" }] };
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
// A spell on a creature: its instance and the effect pill linked to it, as the spell pipeline lays them out.
const spellOn = (spellId, casterId, damageBonus, { pillId = `${spellId}-pill`, label = "pill" } = {}) => ({
  [SPELLS]: [{ instanceId: `${spellId}-inst`, spellId, casterId }],
  conditions: [{ id: pillId, condition: label, sourceId: casterId, parentEffectId: `${spellId}-inst`, active: true, mechanics: { damageBonus } }],
});
const attacker = (meta = {}) => creature("lyra", "Lyra", { initiativeCard: { characterBuild: [{ classId: "ranger", level: 5 }],
  quickActions: [sword, bow, cantrips] }, ...meta });
const goblin = (meta = {}) => creature("goblin", "Goblin", meta);
const turnState = { round: 1, order: ["lyra", "goblin"], current: 0 };
const options = (overrides = {}) => pcAttackRiderOptions({ action: sword, sourceItem: attacker(), targetItem: goblin(), turnState, ...overrides });
const spellOption = (list, id) => list.find((option) => option.id === id);

test("Hunter's Mark on the target, cast by the attacker: its 1d6 of the weapon's type, ticked by itself", () => {
  const marked = goblin(spellOn("hunters-mark", "lyra", { dice: "1d6", type: "danni", sourceOnly: true }));
  const mark = spellOption(options({ targetItem: marked }), "incantesimo-marchio-del-cacciatore");
  assert.deepEqual([mark.available, mark.auto, mark.dice, mark.types, mark.label], [true, true, "1d6", ["slashing"], "Marchio del Cacciatore"]);
  assert.equal(spellOption(options({ targetItem: goblin() }), "incantesimo-marchio-del-cacciatore"), undefined, "no mark, no box");
  const someoneElse = goblin(spellOn("hunters-mark", "mira", { dice: "1d6", type: "danni", sourceOnly: true }));
  assert.equal(spellOption(options({ targetItem: someoneElse }), "incantesimo-marchio-del-cacciatore"), undefined, "another ranger's mark");
  const onCantrip = spellOption(options({ action: cantrips, spellId: "fire-bolt", targetItem: marked }), "incantesimo-marchio-del-cacciatore");
  assert.deepEqual([onCantrip.available, onCantrip.reason], [false, "Solo per gli attacchi con arma."]);
  const result = buildPcAttackMutation({ action: sword, sourceItem: attacker(), targetItem: marked, outcome: "hit", componentAmounts: { c1: 8 },
    riders: [{ id: mark.id, type: "slashing", amount: 4 }], attackInstanceId: "mark-1", turnState });
  assert.equal(result.change.afterHP, 18);
  const component = result.damageComponents.find((entry) => entry.id === `r:${mark.id}`);
  assert.deepEqual(component.source, { kind: "spell", spellId: "hunters-mark", name: "Marchio del Cacciatore" });
});

test("Hex: any attack with a roll, necrotic; Divine Favor and Elemental Weapon on the attacker, weapons only, with the pill's dice", () => {
  const hexed = goblin(spellOn("phb2014-sortilegio", "lyra", { dice: "1d6", type: "necrotici", sourceOnly: true }));
  const hex = spellOption(options({ action: cantrips, spellId: "fire-bolt", targetItem: hexed }), "incantesimo-sortilegio");
  assert.deepEqual([hex.available, hex.types, hex.auto], [true, ["necrotic"], true]);
  const favored = attacker(spellOn("divine-favor", "lyra", { dice: "1d4", type: "danni radiosi" }));
  const favor = spellOption(options({ sourceItem: favored }), "incantesimo-favore-divino");
  assert.deepEqual([favor.available, favor.types, favor.dice], [true, ["radiant"], "1d4"]);
  const elemental = attacker(spellOn("phb2014-arma-elementale", "mira", { dice: "2d4", type: "acido" }));
  const weapon = spellOption(options({ sourceItem: elemental }), "incantesimo-arma-elementale");
  assert.deepEqual([weapon.available, weapon.types, weapon.dice], [true, ["acid"], "2d4"], "cast by another on this attacker's weapon");
});

test("Spirit Shroud: ticked on a melee attack; at range only offered, with the 3 m the console does not measure", () => {
  const shrouded = attacker(spellOn("tasha-sudario-spirituale", "lyra", { dice: "1d8", type: "radiosi" }));
  const melee = spellOption(options({ sourceItem: shrouded }), "incantesimo-sudario-spirituale");
  assert.deepEqual([melee.available, melee.auto, melee.warning], [true, true, undefined]);
  const ranged = spellOption(options({ sourceItem: shrouded, action: bow }), "incantesimo-sudario-spirituale");
  assert.deepEqual([ranged.available, ranged.auto, ranged.warning], [true, undefined, "Solo se il bersaglio è entro 3 m."]);
});

test("Absorb Elements: the first melee hit only; its pill and its spell go with the hit, in the attack's command", () => {
  const absorbing = attacker(spellOn("xanathar-assorbire-elementi", "lyra", { dice: "3d6", type: "fuoco" }, { pillId: "absorb-pill" }));
  const ranged = spellOption(options({ sourceItem: absorbing, action: bow }), "incantesimo-assorbire-elementi");
  assert.deepEqual([ranged.available, ranged.reason], [false, "Solo per gli attacchi in mischia."]);
  const melee = spellOption(options({ sourceItem: absorbing }), "incantesimo-assorbire-elementi");
  assert.deepEqual([melee.available, melee.types, melee.dice], [true, ["fire"], "3d6"]);
  const result = buildPcAttackMutation({ action: sword, sourceItem: absorbing, targetItem: goblin(), outcome: "hit", componentAmounts: { c1: 8 },
    riders: [{ id: melee.id, type: "fire", amount: 10 }], attackInstanceId: "absorb-1", turnState });
  assert.equal(result.change.afterHP, 12);
  const removal = result.operations.find((operation) => operation.type === "condition:remove-instances");
  assert.deepEqual(removal.removals, [{ itemId: "lyra", instanceId: "absorb-pill" }]);
  assert.deepEqual(result.causality.linkEnds.map((end) => end.spellId), ["xanathar-assorbire-elementi"]);
  assert.ok(result.options.targetIds.includes("lyra"), "the attacker's pills are part of the command");
  const plain = buildPcAttackMutation({ action: sword, sourceItem: absorbing, targetItem: goblin(), outcome: "hit", componentAmounts: { c1: 8 },
    attackInstanceId: "absorb-2", turnState });
  assert.equal(plain.operations.some((operation) => operation.type === "condition:remove-instances"), false, "unticked: the pill stays");
});

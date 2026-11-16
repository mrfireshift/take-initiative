// Lot F9-4 of docs/STUDIO_TALENTI.md: Dragon Fear. Beside a dragonborn's breath with damage, the attack console offers
// the roar to a card with the feat: the creatures chosen within 9 m save on Wisdom (8 + proficiency + Charisma) or are
// Frightened for 1 minute, saving again when they take damage; no damage, the breath's use spent. The expectations are
// read from Xanathar's text, not from the definitions under test.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackAreaMutation, pcAttackAreaPreview, pcAttackBreathAction, pcAttackBreathActionsForCard, pcAttackBreathInfo,
  pcAttackResolvedAction, DRAGON_FEAR_VARIANT } from "../src/pcAttackCore.js";
import { pcAttackBreathActionId } from "../src/pcAttackBreathId.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";
import { FEATS } from "../src/featCatalog.js";

const META = "com.thebigpicture.initiative/meta";
const BREATH = "specie-dragonide-arma-a-soffio-blu";
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const card = (feats) => ({ characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { str: 3, con: 2, cha: 3 },
  species: { id: "dragonide", ancestryId: "blu" }, quickActions: [], feats: feats.map((id) => ({ id })) });

test("the roar sits beside the breath with damage, only with the feat", () => {
  assert.deepEqual(pcAttackBreathActionsForCard(card(["paura-draconica"])).map((action) => action.label),
    ["Arma a soffio (fulmine)", "Arma a soffio (fulmine): Paura Draconica (ruggito)"]);
  assert.deepEqual(pcAttackBreathActionsForCard(card([])).map((action) => action.label), ["Arma a soffio (fulmine)"]);
  assert.equal(pcAttackBreathAction(card([]), pcAttackBreathActionId(BREATH, DRAGON_FEAR_VARIANT)), null, "not without the feat");
});

test("a Wisdom save with the Charisma DC, the creatures within 9 m proposed, no damage", () => {
  const roar = pcAttackBreathAction(card(["paura-draconica"]), pcAttackBreathActionId(BREATH, DRAGON_FEAR_VARIANT));
  assert.deepEqual(roar.components, []);
  const attack = pcAttackResolvedAction(roar);
  assert.deepEqual([attack.save, attack.saveHalf, attack.area.proposeFeet, attack.area.chosen, attack.breath.onFail.condition],
    ["wis", false, 30, true, "Spaventato"]);
  // 8 + 3 (proficiency at 5th level) + 3 (Charisma).
  assert.equal(pcAttackBreathInfo(attack, card(["paura-draconica"])).dc, 14);
});

test("the creatures that fail are Frightened for 1 minute, saving again when damaged; the breath's use is spent", () => {
  const source = creature("drago", "Kava", { initiativeCard: card(["paura-draconica"]) });
  const roar = pcAttackBreathAction(source.metadata[META].initiativeCard, pcAttackBreathActionId(BREATH, DRAGON_FEAR_VARIANT));
  const members = [{ item: creature("orc", "Orco"), outcome: "failed" }, { item: creature("gob", "Goblin"), outcome: "passed" }];
  assert.equal(pcAttackAreaPreview({ action: roar, sourceItem: source, members }).ready, true);
  const result = buildPcAttackAreaMutation({ action: roar, sourceItem: source, members, attackInstanceId: "roar-1",
    turnState: { round: 2, current: 0, order: ["drago"], turnKey: "2:drago" } });
  assert.deepEqual(result.operations.map((operation) => operation.type), ["condition:add"], "no HP write");
  const [frightened] = result.operations;
  assert.deepEqual([frightened.targetIds, frightened.conditionName, frightened.options.expiry], [["orc"], "Spaventato", { mode: "rounds", remaining: 10 }]);
  assert.deepEqual(frightened.options.saveReminder, { ability: "wis", timing: "damage", dc: 14, label: "Se supera il TS, termina Spaventato." });
  const uses = Object.entries(result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value.resources)
    .find(([poolId]) => poolId.includes("arma-a-soffio"));
  assert.equal(uses?.[1].current, 0, "the breath's use");
});

test("the feat's line says where the roar is", () => {
  assert.match(FEATS.find((entry) => entry.id === "paura-draconica").plugin, /^Nella console, accanto al soffio, il ruggito: le creature scelte entro 9 m/u);
});

// Trasformazioni, lotto W5 (docs/PIANO_TRASFORMAZIONI.md §5): the three pure plans of a form's hit points (W5a), and the
// writers of whole hit points that leave a creature in a form alone (§5.13).
import assert from "node:assert/strict";
import test from "node:test";
import {
  planTransformationEnd,
  planTransformationRevert,
  planTransformationStart,
  transformationFormHpOf,
  transformationHpPill,
  transformationNormalHp,
  transformationRevertedChange,
  transformationStashForMeta,
  transformationStashWithMaxHp,
  withTransformationStash,
} from "../src/transformationHpCore.js";
import { planMonsterHitPointsImport } from "../src/monsterHitPointsImportCore.js";
import { planSharedHpLinks } from "../src/sharedHpCore.js";

const META = "com.thebigpicture.initiative/meta";
const WOLF = { name: "Wolf", type: "beast", cr: "1/4", hitPoints: { average: 11, formula: "2d8+2" } };
const pill = (extra = {}, template = {}) => ({ id: "ws-1", condition: "Forma Selvatica", displayLabel: "Forma Selvatica · Wolf",
  active: true, mechanics: { transformation: { kind: "wild-shape", form: WOLF, formHp: 11, ...template } }, ...extra });
const shaped = (stash = { hp: 34, hpMax: 40 }, extra = {}) => pill(extra, { stash });
const meta = (hp, hpMax, instances, extra = {}) => ({ hp, hpMax, conditions: { version: 2, instances }, ...extra });

test("W5a: i PF della forma sono quelli scelti, se no la media; una pill senza forma o senza stash non conta", () => {
  assert.equal(transformationFormHpOf(pill()), 11);
  assert.equal(transformationFormHpOf(pill({}, { formHp: 14 })), 14, "rolled at the table");
  assert.equal(transformationFormHpOf(pill({}, { formHp: null })), 11, "the stat block's average");
  assert.equal(transformationFormHpOf({ mechanics: { transformation: { kind: "wild-shape" } } }), null, "from the sheet: no form");
  assert.equal(transformationHpPill([pill()]), null, "no stash: its HP were never swapped");
  assert.equal(transformationHpPill([shaped({ hp: 34, hpMax: 40 }, { active: false })]), null, "turned off");
  assert.equal(transformationHpPill({ instances: [shaped()] })?.id, "ws-1");
});

test("W5a, §5.8: i PF della creatura in forma sono lo stash; fuori dalla forma quelli del token", () => {
  assert.deepEqual(transformationNormalHp(meta(7, 11, [shaped()])), { hp: 34, hpMax: 40 });
  assert.deepEqual(transformationStashForMeta(meta(7, 11, [shaped()])), { hp: 34, hpMax: 40 });
  assert.deepEqual(transformationNormalHp(meta(30, 40, [pill()])), { hp: 30, hpMax: 40 });
  assert.equal(transformationStashForMeta(meta(30, 40, [])), null);
});

test("W5a: l'inizio mette da parte i PF della creatura e scrive quelli della forma", () => {
  const start = planTransformationStart({ itemId: "druid", pill: pill(), state: { hp: 34, hpMax: 40 } });
  assert.deepEqual([start.stash, start.hp, start.hpMax], [{ hp: 34, hpMax: 40 }, 11, 11]);
  assert.deepEqual(start.record, { id: "druid", kind: "transformation",
    text: "Forma Selvatica · Wolf: 11 PF della forma, i suoi (34/40) messi da parte" });
  assert.equal(planTransformationStart({ pill: { mechanics: {} }, state: { hp: 34, hpMax: 40 } }), null);
});

test("W5a, G28: una forma nuova tiene lo stash della forma normale; Trasformazione non alza i PF sopra gli attuali", () => {
  const again = planTransformationStart({ pill: pill({}, { formHp: 34 }), state: { hp: 6, hpMax: 11 }, previous: { hp: 34, hpMax: 40 },
    currentHp: 6 });
  assert.deepEqual([again.stash, again.hp, again.hpMax], [{ hp: 34, hpMax: 40 }, 34, 34], "Wild Shape: the new form's HP");
  const shapechange = planTransformationStart({ pill: pill({}, { kind: "shapechange", formHp: 34 }), previous: { hp: 80, hpMax: 90 },
    currentHp: 6 });
  assert.deepEqual([shapechange.hp, shapechange.hpMax], [6, 34], "Shapechange: not above the current 6");
});

test("W5a: il ritorno a 0 porta l'eccesso sui PF della creatura; sopra 0 non c'è ritorno", () => {
  const wolf = meta(11, 11, [shaped()]);
  assert.deepEqual((({ excess, hp, hpMax, instanceId }) => ({ excess, hp, hpMax, instanceId }))(
    planTransformationRevert({ itemId: "druid", meta: wolf, hpAfter: 0, damageToHp: 15 })), { excess: 4, hp: 30, hpMax: 40, instanceId: "ws-1" });
  assert.equal(planTransformationRevert({ meta: wolf, hpAfter: 1, damageToHp: 10 }), null);
  assert.equal(planTransformationRevert({ meta: meta(11, 11, [pill()]), hpAfter: 0, damageToHp: 15 }), null, "no stash");
  assert.equal(planTransformationRevert({ meta: wolf, hpAfter: 0, damageToHp: 50 }).hp, 0, "the excess takes the druid down too");
  assert.equal(planTransformationRevert({ meta: wolf, hpAfter: 0, damageToHp: 11 }).record.text,
    "Forma Selvatica · Wolf: a 0 PF torna alla sua forma, con i suoi PF (34)");
  const killed = planTransformationRevert({ meta: wolf, hpAfter: 0, damageToHp: 0, instantDeath: true });
  assert.deepEqual([killed.hp, killed.excess], [0, 34], "a death without damage kills the creature itself");
});

test("W5a, G33: la fine rimette lo stash intero; Aiuto e Ferire spostano lo stash, non la forma", () => {
  assert.deepEqual((({ hp, hpMax }) => ({ hp, hpMax }))(planTransformationEnd({ pill: shaped() })), { hp: 34, hpMax: 40 });
  assert.equal(planTransformationEnd({ pill: pill() }), null);
  const aid = { id: "aid", condition: "Aiuto", active: true, mechanics: { maxHp: { amount: 5, raisesCurrent: true } } };
  assert.deepEqual(transformationStashWithMaxHp({ hp: 34, hpMax: 40 }, [], [aid]), { hp: 39, hpMax: 45 });
  assert.deepEqual(transformationStashWithMaxHp({ hp: 39, hpMax: 45 }, [aid], []), { hp: 39, hpMax: 40 });
  const stash = { hp: 34, hpMax: 40 };
  assert.equal(transformationStashWithMaxHp(stash, [], []), stash, "nothing moves: the same object");
  assert.deepEqual(withTransformationStash(pill(), { hp: 1, hpMax: 2 }).mechanics.transformation.stash, { hp: 1, hpMax: 2 });
});

test("W5c: il cambio del pannello delle aree visto sulla creatura: suoi PF, danno che li raggiunge, danno intero", () => {
  const change = { mode: "damage", hp: 11, hpMax: 11, afterHP: 0, requested: 28, absorbedByTempHp: 0, tempHp: 0, afterTempHp: 0 };
  const reverted = transformationRevertedChange({ itemId: "druid", meta: meta(11, 11, [shaped()]), change });
  assert.deepEqual((({ hp, hpMax, afterHP, damageInstance, requested, delta, transformationReverted }) =>
    ({ hp, hpMax, afterHP, damageInstance, requested, delta, transformationReverted }))(reverted.change),
  { hp: 34, hpMax: 40, afterHP: 17, damageInstance: 17, requested: 28, delta: -17, transformationReverted: true });
  assert.equal(transformationRevertedChange({ meta: meta(11, 11, [shaped()]), change: { ...change, mode: "heal" } }), null);
  assert.equal(transformationRevertedChange({ meta: meta(11, 11, [shaped()]), change: { ...change, afterHP: 3 } }), null);
});

test("§5.13: l'import dei PF da statblock e il collegamento a PF condivisi lasciano stare una creatura in forma", () => {
  const ogre = { id: "ogre", name: "Ogre", layer: "CHARACTER", type: "IMAGE",
    metadata: { [META]: meta(11, 11, [shaped({ hp: 59, hpMax: 59 })], { attitude: "enemy", initiativeCard: {} }) } };
  const imported = planMonsterHitPointsImport({ items: [ogre], sourceId: "ogre", hp: 59, overwrite: true });
  assert.deepEqual([imported.updates, imported.skipped.map((entry) => entry.reason)], [[], ["transformed"]]);
  const source = { id: "boss", name: "Boss", layer: "CHARACTER", metadata: { [META]: meta(50, 50, []) } };
  assert.equal(planSharedHpLinks([source, ogre], { type: "shared-hp:link", sourceId: "boss", targetIds: ["ogre"] }, { metadataKey: META })
    .conflicts[0].reason, "shared-hp-transformed");
  assert.equal(planSharedHpLinks([ogre, source], { type: "shared-hp:link", sourceId: "ogre", targetIds: ["boss"] }, { metadataKey: META })
    .conflicts[0].reason, "shared-hp-transformed");
});

test("W5e: la Cronologia composta (editor in linea, pannelli) porta nel log il ritorno della forma e le altre reazioni", async () => {
  const { decorateCompositeEffectsHistoryEntry } = await import("../src/effectsMutationCompositeHistoryCore.js");
  const record = { id: "druid", kind: "transformation", text: "Forma Selvatica · Wolf: a 0 PF torna alla sua forma, con i suoi PF (34)" };
  const decorated = decorateCompositeEffectsHistoryEntry({ entry: { id: "e1", kind: "hp", changes: [], payload: { reactions: [{ id: "x", text: "a" }] } },
    mutation: [{ changes: [], plan: { reactionRecords: [record] } }] });
  assert.deepEqual(decorated.payload.reactions, [{ id: "x", text: "a" }, record]);
  const plain = decorateCompositeEffectsHistoryEntry({ entry: { id: "e2", kind: "hp", changes: [] }, mutation: [{ changes: [], plan: {} }] });
  assert.equal(plain.payload, undefined);
});

test("W5e, G35: l'anteprima di un danno che porta la forma a 0 dice dove arriva la creatura", async () => {
  const { transformationPreviewReturn } = await import("../src/transformationHpCore.js");
  const change = { mode: "damage", hp: 11, hpMax: 11, afterHP: 0, requested: 20, absorbedByTempHp: 5 };
  assert.deepEqual(transformationPreviewReturn({ stash: { hp: 34, hpMax: 40 }, change }),
    { before: 34, after: 30, hpMax: 40, text: "torna alla sua forma: PF 34 → 30 (max 40)" });
  assert.equal(transformationPreviewReturn({ stash: { hp: 34, hpMax: 40 }, change: { ...change, afterHP: 2 } }), null);
  assert.equal(transformationPreviewReturn({ stash: null, change }), null);
});

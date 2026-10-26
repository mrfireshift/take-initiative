// Attacchi dei mostri, lotto 1: i campi del mostro sull'azione d'attacco e il campo monster della scheda.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const {
  parseQuickActionAttackImport,
  quickActionMonsterAttackFields,
  sanitizeQuickAction,
  sanitizeQuickActions,
} = await import("../src/quickActionsCore.js");
const { MONSTER_PROFILE_FIELD, isMonsterProfileCard, sanitizeMonsterProfile } = await import("../src/monsterProfileCore.js");
const { getInitiativeCard, hasInitiativeCardValues, sanitizeInitiativeCard } = await import("../src/initiativeCards.js");
const { ID } = await import("../src/constants.js");

const bite = {
  id: "bite", label: "Morso", kind: "attack", range: "melee",
  components: [{ type: "piercing", formula: "2d10+8" }, { type: "fire", formula: "2d6" }],
  attackBonus: "+14", reachFeet: 10,
};

test("un attacco del mostro conserva bonus e portata accanto ai danni", () => {
  assert.deepEqual(sanitizeQuickAction(bite), {
    version: 2, id: "bite", label: "Morso", kind: "attack", targetMode: "selection", range: "melee",
    components: [{ id: "c1", type: "piercing", formula: "2d10+8" }, { id: "c2", type: "fire", formula: "2d6" }],
    attackBonus: 14, reachFeet: 10,
  });
});

test("un attacco a distanza conserva la gittata, la lunga solo se oltre la normale", () => {
  const shortbow = { id: "bow", label: "Arco corto", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d6+2" }], attackBonus: 4 };
  assert.deepEqual(sanitizeQuickAction({ ...shortbow, rangeFeet: { normal: 80, long: 320 } }).rangeFeet, { normal: 80, long: 320 });
  assert.deepEqual(sanitizeQuickAction({ ...shortbow, rangeFeet: { normal: 80, long: 80 } }).rangeFeet, { normal: 80 });
  assert.deepEqual(sanitizeQuickAction({ ...shortbow, rangeFeet: { normal: 80, long: 40 } }).rangeFeet, { normal: 80 });
  assert.equal(sanitizeQuickAction({ ...shortbow, rangeFeet: { long: 320 } }).rangeFeet, undefined);
});

test("un'azione a tiro salvezza ha TS, CD, metà danni, area e ricarica propri, senza bonus al tiro", () => {
  assert.deepEqual(sanitizeQuickAction({
    id: "breath", label: "Soffio di fuoco", kind: "attack", range: "ranged",
    components: [{ type: "fire", formula: "18d6" }],
    attackBonus: 14, save: "dex", saveDC: 21, saveHalf: true, area: { shape: "cone", sizeFeet: 60 }, recharge: 5,
  }), {
    version: 2, id: "breath", label: "Soffio di fuoco", kind: "attack", targetMode: "selection", range: "ranged",
    components: [{ id: "c1", type: "fire", formula: "18d6" }],
    save: "dex", saveDC: 21, saveHalf: true, area: { shape: "cone", sizeFeet: 60 }, recharge: 5,
  });
});

test("un TS senza danni è un'azione solo se il fallimento applica una condizione", () => {
  const presence = {
    id: "presence", label: "Presenza terrificante", kind: "attack", components: [],
    save: "wis", saveDC: 19, area: { shape: "sphere", sizeFeet: 120 }, onFail: { condition: " Spaventato " },
    note: "Ripete il TS a fine turno.",
  };
  assert.deepEqual(sanitizeQuickAction(presence), {
    version: 2, id: "presence", label: "Presenza terrificante", kind: "attack", targetMode: "selection", range: "melee",
    components: [], save: "wis", saveDC: 19, area: { shape: "sphere", sizeFeet: 120 }, onFail: { condition: "Spaventato" },
    note: "Ripete il TS a fine turno.",
  });
  assert.equal(sanitizeQuickAction({ ...presence, onFail: undefined }), null);
  // Senza CD il TS non vale: la CD degli incantesimi della scheda non è quella del mostro.
  assert.equal(sanitizeQuickAction({ ...presence, saveDC: undefined }), null);
  assert.equal(sanitizeQuickAction({ id: "x", label: "X", kind: "attack", components: [] }), null);
});

test("i valori fuori intervallo si scartano, non si riportano nei limiti", () => {
  const action = sanitizeQuickAction({
    ...bite, attackBonus: 45, reachFeet: 2, recharge: 7, uses: 10,
    save: "luck", saveDC: 18, area: { shape: "cone", sizeFeet: 60 },
  });
  for (const field of ["attackBonus", "reachFeet", "recharge", "uses", "save", "saveDC", "area"]) assert.equal(action[field], undefined, field);
  const withBadDC = sanitizeQuickAction({ ...bite, save: "con", saveDC: 0, saveHalf: true });
  assert.equal(withBadDC.save, undefined);
  assert.equal(withBadDC.saveHalf, undefined);
  assert.equal(withBadDC.attackBonus, 14);
  assert.equal(sanitizeQuickAction({ ...bite, attackBonus: 4.5 }).attackBonus, undefined);
});

test("aree: la linea tiene la larghezza, il bersaglio il numero di creature, una forma senza misura cade", () => {
  const save = { ...bite, save: "dex", saveDC: 15 };
  assert.deepEqual(sanitizeQuickAction({ ...save, area: { shape: "line", sizeFeet: 60, widthFeet: 5 } }).area, { shape: "line", sizeFeet: 60, widthFeet: 5 });
  assert.deepEqual(sanitizeQuickAction({ ...save, area: { shape: "cone", sizeFeet: 15, widthFeet: 5 } }).area, { shape: "cone", sizeFeet: 15 });
  assert.deepEqual(sanitizeQuickAction({ ...save, area: { shape: "target", sizeFeet: 30 } }).area, { shape: "target", maxTargets: 1 });
  assert.deepEqual(sanitizeQuickAction({ ...save, area: { shape: "target", maxTargets: 3 } }).area, { shape: "target", maxTargets: 3 });
  assert.equal(sanitizeQuickAction({ ...save, area: { shape: "cone" } }).area, undefined);
  assert.equal(sanitizeQuickAction({ ...save, area: { shape: "star", sizeFeet: 10 } }).area, undefined);
});

test("usi al giorno e nota restano sull'attacco; la nota è tagliata a 280 caratteri", () => {
  const action = sanitizeQuickAction({ ...bite, uses: 3, note: "x".repeat(400) });
  assert.equal(action.uses, 3);
  assert.equal(action.note.length, 280);
});

test("trucchetti e incantesimi d'attacco ignorano i campi del mostro", () => {
  const cantrip = sanitizeQuickAction({ id: "c", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" }, attackBonus: 5, save: "dex", saveDC: 13 });
  assert.equal(cantrip.attackBonus, undefined);
  assert.equal(cantrip.save, undefined);
  assert.deepEqual(quickActionMonsterAttackFields(cantrip), {});
});

test("un attacco senza campi del mostro mantiene la forma di prima", () => {
  const legacy = { id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
  assert.deepEqual(Object.keys(sanitizeQuickAction(legacy)), ["version", "id", "label", "kind", "targetMode", "range", "components"]);
  assert.deepEqual(quickActionMonsterAttackFields(sanitizeQuickAction(legacy)), {});
});

test("i campi del mostro tornano interi per l'editor della scheda, che ricostruisce l'attacco", () => {
  const stored = sanitizeQuickAction({ ...bite, recharge: 5, uses: 2, note: "Nota" });
  const fields = quickActionMonsterAttackFields(stored);
  assert.deepEqual(fields, { attackBonus: 14, reachFeet: 10, recharge: 5, uses: 2, note: "Nota" });
  // collectQuickActions: etichetta, raggio e componenti dal form, più i campi conservati sulla riga.
  const rebuilt = sanitizeQuickAction({ id: stored.id, label: stored.label, kind: "attack", range: stored.range,
    components: stored.components.map(({ type, formula }) => ({ type, formula })), ...JSON.parse(JSON.stringify(fields)) });
  assert.deepEqual(rebuilt, stored);
});

test("l'import degli attacchi della scheda accetta i campi del mostro", () => {
  const { attacks, invalid } = parseQuickActionAttackImport(JSON.stringify([
    { label: "Ragnatela", range: "ranged", components: [{ type: "bludgeoning" }], attackBonus: 5, recharge: 5 },
  ]));
  assert.equal(invalid, 0);
  assert.equal(attacks[0].attackBonus, 5);
  assert.equal(attacks[0].recharge, 5);
});

test("il limite di 8 attacchi vale anche per i mostri", () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ ...bite, id: `bite-${index}` }));
  assert.equal(sanitizeQuickActions(many).length, 8);
});

test("il profilo del mostro: fonte nota o manuale, multiattacco tagliato, null se non è un oggetto", () => {
  assert.deepEqual(sanitizeMonsterProfile({ source: "5etools", multiattack: " Un morso e due artigli. " }), { source: "5etools", multiattack: "Un morso e due artigli." });
  assert.deepEqual(sanitizeMonsterProfile({ source: "bestiario" }), { source: "manual" });
  assert.equal(sanitizeMonsterProfile({ multiattack: "y".repeat(400) }).multiattack.length, 280);
  assert.equal(sanitizeMonsterProfile(null), null);
  assert.equal(sanitizeMonsterProfile(["manual"]), null);
});

test("la scheda conserva il campo monster solo se presente", () => {
  assert.equal(Object.hasOwn(sanitizeInitiativeCard({ armorClass: 15 }), MONSTER_PROFILE_FIELD), false);
  const card = sanitizeInitiativeCard({ armorClass: 19, [MONSTER_PROFILE_FIELD]: { source: "manual", multiattack: "Tre attacchi." } });
  assert.deepEqual(card[MONSTER_PROFILE_FIELD], { source: "manual", multiattack: "Tre attacchi." });
  assert.equal(isMonsterProfileCard(card), true);
  assert.equal(sanitizeInitiativeCard({ [MONSTER_PROFILE_FIELD]: null })[MONSTER_PROFILE_FIELD], null);
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ [MONSTER_PROFILE_FIELD]: { source: "manual" } })), true);
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ [MONSTER_PROFILE_FIELD]: null })), false);
});

test("la scheda letta dal token mantiene monster e i campi del mostro sugli attacchi", () => {
  const item = { id: "dragon", name: "Drago rosso adulto", metadata: { [`${ID}/meta`]: { initiativeCard: {
    armorClass: 19, quickActions: [bite], [MONSTER_PROFILE_FIELD]: { source: "manual", multiattack: "Morso e due artigli." },
  } } } };
  const card = getInitiativeCard(item);
  assert.deepEqual(card[MONSTER_PROFILE_FIELD], { source: "manual", multiattack: "Morso e due artigli." });
  assert.equal(card.quickActions[0].attackBonus, 14);
  assert.equal(card.armorClass, 19);
});

test("il profilo del mostro tiene il riferimento di 5eTools (nome|libro), tagliato a 120 caratteri", () => {
  assert.deepEqual(sanitizeMonsterProfile({ source: "5etools", ref: " Goblin|MM ", multiattack: "Due colpi." }), { source: "5etools", ref: "Goblin|MM", multiattack: "Due colpi." });
  assert.equal(sanitizeMonsterProfile({ ref: "x".repeat(200) }).ref.length, 120);
});

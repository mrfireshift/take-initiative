import assert from "node:assert/strict";
import test from "node:test";

import { groupRestMemberSummary, groupRestMembers, planGroupRestHpWrites, planGroupRestReturnFromDeath } from "../src/groupRestCore.js";

// Lot U6' of the system UX audit: "Riposo del gruppo", the party's short and long rest in one command.
const META_KEY = "com.thebigpicture.initiative/meta";
const token = (id, name, meta = {}, extra = {}) => ({ id, name, layer: "CHARACTER", metadata: { [META_KEY]: meta }, ...extra });

test("U6': il gruppo sono i PG della scena, in iniziativa o no, senza token degli incantesimi né secondari dei PF condivisi", () => {
  const items = [
    token("omar", "Omar", { attitude: "pc", hp: 30, hpMax: 40, inInitiative: true }),
    token("lavera", "Lavera", { attitude: "pc", hp: 20, hpMax: 30 }),
    token("goblin", "Goblin", { attitude: "enemy", hp: 7, hpMax: 7 }),
    token("wolf", "Lupo", { attitude: "ally", hp: 11, hpMax: 11 }),
    token("double", "Omar (doppio)", { attitude: "pc", hp: 30, hpMax: 40, sharedHpSourceId: "omar" }),
    token("sword", "Spada spirituale", { attitude: "pc" }, { layer: "PROP", metadata: {
      [META_KEY]: { attitude: "pc" }, "com.thebigpicture.initiative/spellBoardToken": { kind: "spell-board-token",
        spellId: "spiritual-weapon", instanceId: "sw-1", casterId: "omar" } } }),
  ];
  const members = groupRestMembers(items);
  assert.deepEqual(members.map((member) => member.id), ["lavera", "omar"], "PCs only, by name");
  assert.equal(members.find((member) => member.id === "omar").sharedHp, true, "the source of a shared HP group");
  assert.equal(members.find((member) => member.id === "lavera").sharedHp, false);
});

test("U6': riposo lungo, PF al massimo e PF temporanei a 0, con l'intenzione «rest»; chi è già al massimo non scrive", () => {
  const members = groupRestMembers([
    token("omar", "Omar", { attitude: "pc", hp: 30, hpMax: 40, tempHp: 5 }),
    token("lavera", "Lavera", { attitude: "pc", hp: 30, hpMax: 30 }),
    token("klos", "Klos", { attitude: "pc", hp: 143, hpMax: 133 }),
  ]);
  const updates = planGroupRestHpWrites({ members, longRest: true, eventId: "e1" });
  assert.deepEqual(updates.map((update) => [update.itemId, update.hp, update.tempHp]), [["klos", 133, 0], ["omar", 40, 0]]);
  const omar = updates.find((update) => update.itemId === "omar");
  assert.deepEqual(omar.hpIntent, { mode: "rest", amount: 10, eventId: "e1" });
  assert.deepEqual(omar.expectedHP, { present: true, value: 30 });
  const klos = updates.find((update) => update.itemId === "klos");
  assert.deepEqual(klos.expectedHP, { present: true, value: 143 }, "the old encoding is expected as stored");
});

test("U6': riposo breve, i PF recuperati scritti fino al massimo; i PF temporanei restano", () => {
  const members = groupRestMembers([
    token("omar", "Omar", { attitude: "pc", hp: 30, hpMax: 40, tempHp: 5 }),
    token("lavera", "Lavera", { attitude: "pc", hp: 25, hpMax: 30 }),
    token("brann", "Brann", { attitude: "pc", hp: 10, hpMax: 45 }),
  ]);
  const updates = planGroupRestHpWrites({ members, longRest: false, recovered: { omar: 4, lavera: 12 } });
  assert.deepEqual(updates.map((update) => [update.itemId, update.hp, update.tempHp]), [["lavera", 30, 0], ["omar", 34, 5]]);
  assert.equal(updates.some((update) => update.itemId === "brann"), false, "nothing written, nothing recovered");
});

test("U6': i PG nei PF condivisi o senza PF tracciati riposano senza scrittura dei PF", () => {
  const members = groupRestMembers([
    token("omar", "Omar", { attitude: "pc", hp: 30, hpMax: 40 }),
    token("double", "Doppio", { attitude: "pc", hp: 30, hpMax: 40, sharedHpSourceId: "omar" }),
    token("nohp", "Senza PF", { attitude: "pc" }),
  ]);
  assert.deepEqual(planGroupRestHpWrites({ members, longRest: true }), []);
  const omar = members.find((member) => member.id === "omar");
  assert.equal(groupRestMemberSummary(omar, null, { resourcesRestored: true }),
    "risorse ripristinate · PF condivisi: da aggiornare a mano");
});

test("U6': a 0 PF il riposo lungo non dà benefici (PHB 2014); un morto non riposa affatto", () => {
  const members = groupRestMembers([
    token("brann", "Brann", { attitude: "pc", hp: 0, hpMax: 45 }),
    token("dead", "Caduto", { attitude: "pc", hp: 0, hpMax: 30, conditions: { instances: [{ id: "d", condition: "Morto" }] } }),
  ]);
  const brann = members.find((member) => member.id === "brann");
  const fallen = members.find((member) => member.id === "dead");
  assert.deepEqual(planGroupRestHpWrites({ members, longRest: true }), []);
  assert.equal(groupRestMemberSummary(brann, null, { longRest: true }), "a 0 PF: nessun beneficio dal riposo lungo");
  assert.equal(groupRestMemberSummary(fallen, null, { longRest: true }), "morto: nessun riposo");
  // A short rest still gives the HP its Hit Dice recover to one at 0 HP, never to the dead.
  const short = planGroupRestHpWrites({ members, longRest: false, recovered: { brann: 6, dead: 6 } });
  assert.deepEqual(short.map((update) => [update.itemId, update.hp]), [["brann", 6]]);
});

const returning = (id, penalty, extra = {}) => token(id, id, { attitude: "pc", hp: 20, hpMax: 40, conditions: { version: 2, instances: [
  { id: `${id}-return`, condition: `Ritorno dalla morte −${penalty}`, active: true, effectId: "return-from-death", mechanics: { returnFromDeathPenalty: penalty } },
  ...(extra.pills || [])] }, ...(extra.hp !== undefined ? { hp: extra.hp } : {}) });

test("CAP-STABILIZE: ogni riposo lungo toglie 1 al ritorno dalla morte, a 0 la pill finisce; il riposo breve no", () => {
  const members = groupRestMembers([returning("aria", 4), returning("omar", 1), token("sera", "sera", { attitude: "pc", hp: 20, hpMax: 40 })]);
  const operations = planGroupRestReturnFromDeath({ members, longRest: true });
  assert.deepEqual(operations.filter((op) => op.type === "condition:remove-instances").map((op) => op.removals[0].instanceId), ["aria-return", "omar-return"]);
  const added = operations.filter((op) => op.type === "condition:add");
  assert.deepEqual(added.map((op) => [op.targetIds[0], op.conditionName, op.options.mechanics.returnFromDeathPenalty]), [["aria", "Ritorno dalla morte −3", 3]], "omar's ends");
  assert.deepEqual(planGroupRestReturnFromDeath({ members, longRest: false }), []);
});

test("CAP-STABILIZE: chi è a 0 PF o morto non abbassa la penalità; il riepilogo la dice", () => {
  const [down] = groupRestMembers([returning("aria", 3, { hp: 0 })]);
  assert.deepEqual(planGroupRestReturnFromDeath({ members: [down], longRest: true }), []);
  const [dead] = groupRestMembers([returning("omar", 3, { hp: 0, pills: [{ id: "x", condition: "Morto", active: true }] })]);
  assert.deepEqual(planGroupRestReturnFromDeath({ members: [dead], longRest: true }), []);
  const [aria] = groupRestMembers([returning("aria", 3)]);
  assert.match(groupRestMemberSummary(aria, null, { longRest: true }), /ritorno dalla morte −2/u);
  const [omar] = groupRestMembers([returning("omar", 1)]);
  assert.match(groupRestMemberSummary(omar, null, { longRest: true }), /ritorno dalla morte finito/u);
  assert.doesNotMatch(groupRestMemberSummary(aria, null, { longRest: false }), /ritorno/u);
});

test("U6': il riepilogo dice cosa è cambiato", () => {
  const [omar] = groupRestMembers([token("omar", "Omar", { attitude: "pc", hp: 30, hpMax: 40, tempHp: 5 })]);
  const [update] = planGroupRestHpWrites({ members: [omar], longRest: true });
  assert.equal(groupRestMemberSummary(omar, update, { resourcesRestored: true }), "PF 30 → 40 · PF temporanei tolti · risorse ripristinate");
  assert.equal(groupRestMemberSummary(omar, null), "nulla da ripristinare");
});

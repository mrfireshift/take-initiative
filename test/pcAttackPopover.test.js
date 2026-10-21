import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";

const META = "com.thebigpicture.initiative/meta";
const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, scene: { items: { getItems: async () => [] } }, popover: { close: async () => {} } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { bootPcAttack, resultSummary } = await import("../src/pc-attack.js");
const { sanitizeQuickAction } = await import("../src/quickActionsCore.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const IDS = ["pc-attack-title", "pc-attack-subtitle", "pc-attack-close", "pc-attack-form", "pc-attack-target", "pc-attack-target-hint",
  "pc-attack-outcomes", "pc-attack-damage", "pc-attack-defenses", "pc-attack-total", "pc-attack-apply", "pc-attack-status", "pc-attack-undo",
  "pc-attack-extras-section", "pc-attack-riders", "pc-attack-extras", "pc-attack-add-extra", "pc-attack-cantrip-row", "pc-attack-cantrip",
  "pc-attack-cantrip-note", "pc-attack-extras-caption", "pc-attack-woven", "pc-attack-activations", "pc-attack-activations-caption"];
const BUTTONS = new Set(["pc-attack-close", "pc-attack-apply", "pc-attack-undo", "pc-attack-add-extra"]);
function createDocument() {
  const doc = {
    listeners: {},
    createElement: (tag) => new FakeNode(doc, tag),
    getElementById: (id) => doc.root.querySelector("#" + id),
    addEventListener(type, callback) { (doc.listeners[type] ||= []).push(callback); },
  };
  doc.root = new FakeNode(doc, "body"); doc.body = doc.root;
  for (const id of IDS) {
    const node = new FakeNode(doc, ["pc-attack-target", "pc-attack-cantrip"].includes(id) ? "select" : BUTTONS.has(id) ? "button" : "div");
    node.id = id; doc.root.appendChild(node);
  }
  return doc;
}

const sword = sanitizeQuickAction({ id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] });

function fixture({ defenses = null, attacker = {}, turnState = null, action = sword } = {}) {
  const documentRef = createDocument();
  const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
  const items = [creature("aria", "Aria", 40, attacker), creature("ghoul", "Ghoul", 30, defenses ? { initiativeCard: { damageDefenses: defenses } } : {}), creature("imp", "Imp", 10)];
  const listeners = { player: new Set(), items: new Set() };
  const subscribe = (set, listener) => { set.add(listener); return () => set.delete(listener); };
  let selection = [];
  const calls = [], undoCalls = [];
  const api = {
    player: { getRole: async () => "GM", getSelection: async () => selection, onChange: (listener) => subscribe(listeners.player, listener) },
    scene: { isReady: async () => true, onReadyChange: () => () => {},
      items: { getItems: async (ids) => Array.isArray(ids) ? items.filter((item) => ids.includes(item.id)) : items, onChange: (listener) => subscribe(listeners.items, listener) } },
    popover: { close: async () => {} },
  };
  const runtime = {
    getPcAttackPresentation: async () => ({ item: items[0], action, targets: items.slice(1), turnState, sceneIdentity: "scene-A" }),
    executePcAttack: async (request) => {
      calls.push(request);
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], outcome: request.outcome, target: { id: request.targetId, name: "Ghoul" },
        damageComponents: [{ amount: 17 }], hpChange: { before: 30, after: 13, hpMax: 30 } };
    },
  };
  const controller = bootPcAttack(documentRef, { api, runtime, sourceId: "aria", actionId: "holy-sword", schedule: (callback) => setTimeout(callback, 0),
    undo: async (entryId) => { undoCalls.push(entryId); return { ok: true }; } });
  const $ = (id) => documentRef.getElementById(id);
  return { $, controller, calls, undoCalls, runtime, items,
    select: async (ids) => { selection = ids; for (const listener of listeners.player) listener({ selection: ids }); await tick(); },
    outcome: (value) => $("pc-attack-outcomes").querySelector(`[data-outcome="${value}"]`),
    inputs: () => $("pc-attack-damage").querySelectorAll("input"),
    listenerCount: () => listeners.player.size + listeners.items.size };
}
async function typeAmounts(f, values) {
  for (const [index, input] of f.inputs().entries()) { input.value = values[index]; await input.emit("input"); }
}

test("the console shows the attack and asks for a target first", async () => {
  const f = fixture(); await f.controller.ready; await tick();
  assert.equal(f.$("pc-attack-form").hidden, false);
  assert.equal(f.$("pc-attack-title").textContent, "Spada sacra");
  assert.equal(f.$("pc-attack-subtitle").textContent, "Aria · Mischia");
  assert.match(textOf(f.$("pc-attack-damage")), /taglienti .*1d8\+3 .*radiosi .*2d8/i);
  assert.equal(f.$("pc-attack-apply").disabled, true);
  assert.equal(f.$("pc-attack-total").textContent, "Scegli il bersaglio.");
  assert.equal(f.$("pc-attack-target-hint").hidden, false);
});

test("map selection picks the target until a decision locks it", async () => {
  const f = fixture(); await f.controller.ready;
  await f.select(["ghoul"]);
  assert.equal(f.$("pc-attack-target").value, "ghoul");
  await f.select(["aria"]);
  assert.equal(f.controller.getDraft().targetId, "ghoul", "selecting the attacker never becomes the target");
  await f.outcome("hit").click();
  await f.select(["imp"]);
  assert.equal(f.controller.getDraft().targetId, "ghoul", "a locked draft keeps its target");
});

test("selection updates never rebuild the outcome buttons or the amount fields (no lost click, no lost caret)", async () => {
  const f = fixture(); await f.controller.ready;
  await f.select(["ghoul"]);
  const button = f.outcome("critical"), [field] = f.inputs();
  await f.select(["imp"]);
  await f.select([]);
  assert.equal(f.outcome("critical"), button);
  assert.equal(f.inputs()[0], field);
  assert.equal(f.controller.getDraft().targetId, "imp", "a pristine draft still follows the selection");
});

test("hit with defenses: preview, ignore a defense, register, then a fresh attack on the same target", async () => {
  const defenses = { resistances: ["slashing"], immunities: [], vulnerabilities: [] };
  const f = fixture({ defenses }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await typeAmounts(f, ["8", "9"]);
  assert.match(textOf(f.$("pc-attack-total")), /13 danni · PF 30 → 17/);
  const chip = f.$("pc-attack-defenses").querySelector("button");
  assert.match(chip.textContent, /Res\. taglienti/);
  await chip.click();
  assert.match(textOf(f.$("pc-attack-total")), /17 danni · PF 30 → 13/);
  assert.equal(f.$("pc-attack-apply").disabled, false);
  await f.$("pc-attack-apply").click(); await tick();
  const request = f.calls[0];
  assert.deepEqual([request.sourceId, request.actionId, request.targetId, request.outcome], ["aria", "holy-sword", "ghoul", "hit"]);
  assert.deepEqual(request.componentAmounts, { c1: 8, c2: 9 });
  assert.deepEqual(request.ignoredDefenses, ["slashing"]);
  assert.deepEqual(request.expectedDefenses, { immunities: [], resistances: ["slashing"], vulnerabilities: [] });
  assert.deepEqual(request.expectedAction, sword);
  assert.match(f.$("pc-attack-status").textContent, /Colpito, 17 danni a Ghoul\. PF 30 → 13\./);
  assert.equal(f.$("pc-attack-undo").hidden, false);
  const draft = f.controller.getDraft();
  assert.deepEqual([draft.targetId, draft.outcome, draft.amounts.c1], ["ghoul", "", ""], "ready for the next attack");
  assert.notEqual(draft.attackInstanceId, request.attackInstanceId);
  await f.$("pc-attack-undo").click(); await tick();
  assert.deepEqual(f.undoCalls, ["entry-1"]);
  assert.equal(f.$("pc-attack-undo").hidden, true);
});

test("a miss needs no damage and disables the amounts", async () => {
  const f = fixture(); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("miss").click();
  assert.equal(f.inputs().every((input) => input.disabled), true);
  assert.equal(f.$("pc-attack-apply").disabled, false);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].componentAmounts, {});
  assert.equal(resultSummary({ outcome: "miss", target: { name: "Ghoul" } }), "Registrato: Mancato su Ghoul.");
});

test("closing removes the live subscriptions", async () => {
  const f = fixture(); await f.controller.ready;
  assert.equal(f.listenerCount() > 0, true);
  await f.$("pc-attack-close").click();
  assert.equal(f.listenerCount(), 0);
});

const rogueCard = { initiativeCard: { characterBuild: [{ classId: "ladro", level: 5 }] } };
const ownTurn = { round: 1, order: ["aria", "ghoul", "imp"], current: 0 };
const riderRow = (f, id) => f.$("pc-attack-riders").querySelector(`[data-rider-id="${id}"]`);
const riderField = (row, name) => row.querySelector(`[data-rider-field="${name}"]`);

test("extras appear on a hit: the attacker's riders with dice (doubled on a critical) and components added on the fly", async () => {
  const f = fixture({ attacker: rogueCard, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  assert.equal(f.$("pc-attack-extras-section").hidden, true, "no extras before a hit");
  await f.outcome("hit").click();
  assert.equal(f.$("pc-attack-extras-section").hidden, false);
  const row = riderRow(f, "ladro-attacco-furtivo");
  assert.match(textOf(row), /Attacco Furtivo/);
  assert.equal(riderField(row, "dice").textContent, "3d6");
  assert.equal(riderField(row, "amount").hidden, true);
  await f.outcome("critical").click();
  assert.equal(riderField(row, "dice").textContent, "3d6 · critico 6d6");
  const toggle = riderField(row, "on"); toggle.checked = true; await toggle.emit("change");
  assert.equal(riderField(row, "amount").hidden, false);
  await typeAmounts(f, ["16", "18"]);
  const amount = riderField(row, "amount"); amount.value = "21"; await amount.emit("input");
  await f.$("pc-attack-add-extra").click();
  const extra = f.$("pc-attack-extras").querySelector("[data-extra-index=\"0\"]");
  const extraField = (name) => extra.querySelector(`[data-extra-field="${name}"]`);
  const [type, extraAmount, label] = ["type", "amount", "label"].map(extraField);
  assert.equal(f.$("pc-attack-apply").disabled, true, "an extra without type blocks the commit");
  type.value = "thunder"; await type.emit("change");
  extraAmount.value = "4"; await extraAmount.emit("input");
  label.value = "Lama Roboante"; await label.emit("input");
  assert.match(textOf(f.$("pc-attack-total")), /59 danni/);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].riders, [{ id: "ladro-attacco-furtivo", type: "slashing", amount: 21 }]);
  assert.deepEqual(f.calls[0].extras, [{ type: "thunder", amount: 4, label: "Lama Roboante" }]);
  // After the commit: the summary, and a clean draft for the next attack.
  assert.match(f.$("pc-attack-status").textContent, /^Registrato: Critico/);
  const fresh = riderRow(f, "ladro-attacco-furtivo");
  assert.deepEqual([riderField(fresh, "on").checked, riderField(fresh, "amount").value], [false, ""]);
  assert.equal(f.$("pc-attack-extras").children.length, 0);
  assert.equal(resultSummary({ outcome: "hit", target: { name: "Ghoul" }, damageComponents: [{ amount: 24 }], hpChange: { before: 30, after: 6 },
    riders: [{ name: "Attacco Furtivo" }], extras: [{ label: "Lama Roboante" }, { typeLabel: "fuoco" }] }),
    "Registrato: Colpito, 24 danni a Ghoul. PF 30 → 6. Extra: Attacco Furtivo, Lama Roboante, fuoco.");
});

test("a rider already used this turn is disabled with its reason; a miss sends no extras", async () => {
  const spent = { ...rogueCard, pcAttackState: { version: 1, riderUses: [{ riderId: "ladro-attacco-furtivo", turnKey: "1:0:aria" }] } };
  const f = fixture({ attacker: spent, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const row = riderRow(f, "ladro-attacco-furtivo");
  assert.equal(riderField(row, "on").disabled, true);
  assert.equal(riderField(row, "reason").textContent, "Già usato in questo turno.");
  await f.$("pc-attack-add-extra").click();
  await f.outcome("miss").click();
  assert.equal(f.$("pc-attack-extras-section").hidden, true);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual([f.calls[0].riders, f.calls[0].extras], [[], []]);
});

test("Divine Smite in the console: slot level and undead/fiend bonus drive the dice; the slot note follows the commit", async () => {
  const f = fixture({ attacker: { initiativeCard: { characterBuild: [{ classId: "paladino", level: 5 }] } }, turnState: ownTurn }); await f.controller.ready;
  f.runtime.executePcAttack = async (request) => { f.calls.push(request); return { historyEntryId: "entry-1", undoAvailable: true, warnings: [], outcome: request.outcome,
    target: { id: request.targetId, name: "Ghoul" }, damageComponents: [{ amount: 30 }], hpChange: { before: 30, after: 0, hpMax: 30 },
    riders: [{ name: "Punizione Divina" }], followUps: ["Punizione Divina: slot di 3° livello speso, scalalo dalla scheda (non è conteggiato)."] }; };
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const row = riderRow(f, "paladino-punizione-divina");
  assert.equal(riderField(row, "options").hidden, true, "slot and bonus only once the smite is ticked");
  const toggle = riderField(row, "on"); toggle.checked = true; await toggle.emit("change");
  assert.equal(riderField(row, "options").hidden, false);
  assert.equal(riderField(row, "dice").textContent, "2d8");
  const slot = riderField(row, "slot"); slot.value = "3"; await slot.emit("change");
  assert.equal(riderField(row, "dice").textContent, "4d8");
  const bonus = riderField(row, "bonus"); bonus.checked = true; await bonus.emit("change");
  assert.equal(riderField(row, "dice").textContent, "5d8");
  await f.outcome("critical").click();
  assert.equal(riderField(row, "dice").textContent, "5d8 · critico 10d8");
  await typeAmounts(f, ["14", "0"]);
  const amount = riderField(row, "amount"); amount.value = "16"; await amount.emit("input");
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].riders, [{ id: "paladino-punizione-divina", type: "radiant", amount: 16, slotLevel: 3, bonus: true }]);
  assert.match(f.$("pc-attack-status").textContent, /slot di 3° livello speso/);
});

const cantripAction = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack",
  source: { kind: "cantrip", spellIds: ["fire-bolt", "eldritch-blast", "shocking-grasp"] } });

test("a cantrip action: pick the cantrip, its dice follow the character level, notes for beams and on-hit effects", async () => {
  const f = fixture({ action: cantripAction, attacker: { initiativeCard: { characterBuild: [{ classId: "warlock", level: 5 }] },
    pcAttackState: { version: 1, lastAttack: { spellId: "eldritch-blast" } } }, turnState: ownTurn });
  await f.controller.ready;
  const picker = f.$("pc-attack-cantrip");
  assert.equal(f.$("pc-attack-cantrip-row").hidden, false);
  assert.deepEqual(picker.children.map((option) => option.textContent), ["Dardo di fuoco", "Deflagrazione occulta", "Stretta folgorante"]);
  assert.equal(picker.value, "eldritch-blast", "the cantrip used last comes first");
  assert.equal(f.$("pc-attack-subtitle").textContent, "Aria · Trucchetto · Distanza");
  assert.match(textOf(f.$("pc-attack-damage")), /Forza 1d10/);
  assert.match(f.$("pc-attack-cantrip-note").textContent, /Raggi: 2 al livello del personaggio/);
  picker.value = "shocking-grasp"; await picker.emit("change");
  assert.equal(f.$("pc-attack-subtitle").textContent, "Aria · Trucchetto · Mischia");
  assert.match(textOf(f.$("pc-attack-damage")), /Fulmine 2d8/);
  assert.equal(f.$("pc-attack-cantrip-note").textContent,
    "Vantaggio al tiro per colpire contro un bersaglio con armatura di metallo. Al colpo: pill «Niente reazioni».");
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await typeAmounts(f, ["9"]);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual([f.calls[0].spellId, f.calls[0].componentAmounts], ["shocking-grasp", { c1: 9 }]);
  assert.equal(f.controller.getDraft().spellId, "shocking-grasp", "the next attack keeps the cantrip (another beam, another target)");
});

test("a weapon action shows no cantrip picker", async () => {
  const f = fixture(); await f.controller.ready;
  assert.equal(f.$("pc-attack-cantrip-row").hidden, true);
});

test("a saving throw cantrip: TS outcomes, the save in the subtitle, Toll the Dead's die follows the target", async () => {
  const action = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack",
    source: { kind: "cantrip", spellIds: ["fire-bolt", "xanathar-rintocco-dei-morti"] } });
  const f = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "chierico", level: 5 }], spellSaveDC: 14 } }, turnState: ownTurn });
  await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const picker = f.$("pc-attack-cantrip");
  assert.equal(picker.children[1].textContent, "Rintocco dei Morti · TS Saggezza");
  picker.value = "xanathar-rintocco-dei-morti"; await picker.emit("change");
  assert.equal(f.controller.getDraft().outcome, "", "an attack outcome does not carry over to a save");
  assert.deepEqual(f.$("pc-attack-outcomes").children.map((button) => button.textContent), ["TS fallito", "TS superato"]);
  assert.equal(f.$("pc-attack-subtitle").textContent, "Aria · Trucchetto · TS Saggezza (CD 14)");
  assert.match(textOf(f.$("pc-attack-damage")), /Necrotici 2d8/);
  assert.equal(f.$("pc-attack-cantrip-note").hidden, true, "Toll the Dead has no note");
  picker.value = "fire-bolt"; await picker.emit("change");
  assert.match(f.$("pc-attack-cantrip-note").textContent, /^Al colpo, da applicare a mano/);
  picker.value = "xanathar-rintocco-dei-morti"; await picker.emit("change");
  f.items[1].metadata["com.thebigpicture.initiative/meta"].hp = 20;
  await f.select(["imp"]); await f.select(["ghoul"]);
  assert.match(textOf(f.$("pc-attack-damage")), /Necrotici 2d12/, "a hurt target: the d12s");
  await f.outcome("failed").click();
  assert.equal(f.$("pc-attack-extras-section").hidden, false);
  assert.equal(f.$("pc-attack-extras-caption").textContent, "Extra al danno");
  await typeAmounts(f, ["15"]);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual([f.calls[0].spellId, f.calls[0].outcome, f.calls[0].componentAmounts], ["xanathar-rintocco-dei-morti", "failed", { c1: 15 }]);
  assert.equal(resultSummary({ outcome: "passed", target: { name: "Ghoul" } }), "Registrato: TS superato su Ghoul.");
});

test("Eldritch Blast: the console counts the beams registered; Potent Cantrip is noted on saving throw cantrips", async () => {
  const action = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["eldritch-blast", "poison-spray"] } });
  const f = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "warlock", level: 5 }] } }, turnState: ownTurn });
  await f.controller.ready;
  await f.select(["ghoul"]);
  const note = () => f.$("pc-attack-cantrip-note").textContent;
  assert.match(note(), /^Raggi: 2 al livello del personaggio\. Registra/);
  for (const amount of ["7", "4"]) {
    await f.outcome("hit").click(); await typeAmounts(f, [amount]);
    await f.$("pc-attack-apply").click(); await tick();
  }
  assert.equal(f.calls.length, 2);
  assert.match(note(), /^Raggi: registrati tutti e 2\./);
  const wizard = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "mago", level: 6, subclassId: "mago-scuola-di-invocazione" }] } } });
  await wizard.controller.ready;
  const picker = wizard.$("pc-attack-cantrip"); picker.value = "poison-spray"; await picker.emit("change");
  assert.match(wizard.$("pc-attack-cantrip-note").textContent, /Trucchetto Potente: con il TS superato subisce metà danni/);
  await wizard.outcome("passed").click();
  assert.equal(wizard.inputs()[0].disabled, false, "half damage to enter on a passed save");
});

test("weapon cantrips in a melee weapon attack: Booming Blade's pill note, Green-Flame Blade's second creature", async () => {
  const attacker = { initiativeCard: { characterBuild: [{ classId: "ladro", level: 5 }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["tasha-lama-roboante", "tasha-lama-verdefiamma"] } }] } };
  const f = fixture({ attacker, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const woven = f.$("pc-attack-woven");
  const field = (name) => woven.querySelector(`[data-woven-field="${name}"]`);
  assert.equal(woven.hidden, false);
  assert.deepEqual(field("spell").children.map((option) => option.textContent), ["Nessuno", "Lama Roboante", "Lama Verdefiamma"]);
  field("spell").value = "tasha-lama-roboante"; await field("spell").emit("change");
  assert.match(field("meta").textContent, /1d8 tuono · pill «Movimento: danni tuono» \(2d8\)/);
  assert.equal(field("amount").hidden, false);
  field("spell").value = "tasha-lama-verdefiamma"; await field("spell").emit("change");
  assert.deepEqual(field("secondary").children.map((option) => option.value), ["", "imp"], "the target is never its own second creature");
  field("secondary").value = "imp"; await field("secondary").emit("change");
  await typeAmounts(f, ["8", "0"]);
  field("amount").value = "4"; await field("amount").emit("input");
  field("secondaryAmount").value = "5"; await field("secondaryAmount").emit("input");
  assert.match(field("secondaryMeta").textContent, /1d8 \+ mod\. fuoco · PF 10 → 5/);
  assert.match(textOf(f.$("pc-attack-total")), /12 danni · PF 30 → 18 · seconda: 5/);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].weaponCantrip, { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "imp", amount: 5 } });
  assert.deepEqual(f.calls[0].expectedSecondaryDefenses, { immunities: [], resistances: [], vulnerabilities: [] });
  assert.match(f.$("pc-attack-status").textContent, /^Registrato/, "no error after the commit");
  assert.equal(field("spell").value, "", "a fresh draft for the next attack");
  assert.equal(field("secondary"), null);
});

test("the result summary names the weapon cantrip, the second creature and Potent Cantrip's half damage", () => {
  assert.equal(resultSummary({ outcome: "hit", target: { name: "Dars" }, damageComponents: [{ amount: 8 }, { amount: 4 }], hpChange: { before: 60, after: 48 },
    weaponCantrip: { name: "Lama Verdefiamma" }, secondary: { name: "Sera", before: 38, after: 33 } }),
    "Registrato: Colpito, 12 danni a Dars. PF 60 → 48. Extra: Lama Verdefiamma. Sera: PF 38 → 33.");
  assert.equal(resultSummary({ outcome: "passed", target: { name: "Goblin" }, damageComponents: [{ amount: 5 }], hpChange: { before: 30, after: 25 } }),
    "Registrato: TS superato, 5 danni a Goblin. PF 30 → 25.");
});

test("the cantrip console points to the melee weapon attack for Booming Blade and Green-Flame Blade", async () => {
  const action = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } });
  const withSword = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "mago", level: 5 }], quickActions: [sword, action] } } });
  await withSword.controller.ready;
  assert.equal(withSword.$("pc-attack-cantrip").children.some((option) => /Lama/.test(option.textContent)), false);
  assert.match(withSword.$("pc-attack-cantrip-note").textContent,
    /Lama Roboante e Lama Verdefiamma: usale dall'attacco con arma da mischia \(Extra al colpo › Trucchetto con l'arma\)\./);
  const onlyCantrips = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "mago", level: 5 }], quickActions: [action] } } });
  await onlyCantrips.controller.ready;
  assert.match(onlyCantrips.$("pc-attack-cantrip-note").textContent, /aggiungi all'attore un'azione Attacco con arma da mischia per usarle\./);
  const fireOnly = fixture({ action: sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt"] } }) });
  await fireOnly.controller.ready;
  assert.doesNotMatch(fireOnly.$("pc-attack-cantrip-note").textContent, /Lama/);
});

const battleMasterCard = { initiativeCard: { characterBuild: [{ classId: "guerriero", level: 10, subclassId: "guerriero-maestro-di-battaglia" }],
  abilityModifiers: { str: 4, dex: 2, con: 3, int: 0, wis: 1, cha: 0 }, classFeaturesConfigured: true,
  enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre", "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso",
    "guerriero-maestro-di-battaglia-manovre-colpo-distraente"] } };
const activationRow = (f, slug) => f.$("pc-attack-activations").querySelector(`[data-activation-id="guerriero-maestro-di-battaglia-manovre-${slug}"]`);
const activationField = (row, name) => row.querySelector(`[data-activation-field="${name}"]`);

test("activations on a hit: the maneuver's die, dice left and DC; one maneuver per attack; the save outcome is sent", async () => {
  const f = fixture({ attacker: battleMasterCard, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  assert.equal(f.$("pc-attack-activations-caption").hidden, false);
  const menacing = activationRow(f, "attacco-minaccioso"), distracting = activationRow(f, "colpo-distraente");
  assert.equal(activationField(menacing, "meta").textContent.replace(/\u00a0/gu, " "), "1d10 · Dadi di Superiorità 5/5 · TS Saggezza CD 16");
  assert.match(activationField(menacing, "meta").textContent, /TS\u00a0Saggezza\u00a0CD\u00a016/u, "a part never wraps inside");
  assert.equal(activationField(menacing, "options").hidden, true, "options only once ticked");
  const check = async (row) => { const box = activationField(row, "on"); box.checked = true; await box.emit("change"); };
  await check(distracting);
  await check(menacing);
  assert.equal(activationField(distracting, "on").checked, false, "ticking a maneuver unticks the other one");
  assert.equal(activationField(menacing, "options").hidden, false);
  assert.equal(activationField(menacing, "effect").textContent, "Se fallisce: Spaventato");
  await typeAmounts(f, ["8", "9"]);
  assert.equal(f.$("pc-attack-apply").disabled, true, "the die's damage and the save outcome are still missing");
  const amount = activationField(menacing, "amount"); amount.value = "6"; await amount.emit("input");
  assert.match(textOf(f.$("pc-attack-total")), /scegli l'esito del tiro salvezza/);
  await activationField(menacing, "save-failed").click();
  assert.equal(activationField(menacing, "save-failed").getAttribute("aria-pressed"), "true");
  assert.match(textOf(f.$("pc-attack-total")), /23 danni/);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, [{ id: "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso", type: "slashing", amount: 6, saveOutcome: "failed" }]);
  assert.equal(resultSummary({ outcome: "hit", target: { name: "Ghoul" }, damageComponents: [{ amount: 23 }], hpChange: { before: 30, after: 7 },
    activations: [{ name: "Attacco Minaccioso", save: { outcome: "failed" } }], conditions: ["Spaventato"] }),
    "Registrato: Colpito, 23 danni a Ghoul. PF 30 → 7. Extra: Attacco Minaccioso (TS fallito). Ghoul: Spaventato.");
});

test("a miss sends no activations", async () => {
  const f = fixture({ attacker: battleMasterCard, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const box = activationField(activationRow(f, "colpo-distraente"), "on"); box.checked = true; await box.emit("change");
  await f.outcome("miss").click();
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, []);
});

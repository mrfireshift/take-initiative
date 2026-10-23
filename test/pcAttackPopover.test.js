import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";

const META = "com.thebigpicture.initiative/meta";
const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, scene: { items: { getItems: async () => [] } }, popover: { close: async () => {} } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { bootPcAttack, resultSummary, areaSummary } = await import("../src/pc-attack.js");
const { sanitizeQuickAction } = await import("../src/quickActionsCore.js");
const { pcAttackPickerEntries } = await import("../src/pcAttackPickerCore.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const IDS = ["pc-attack-title", "pc-attack-subtitle", "pc-attack-close", "pc-attack-form", "pc-attack-target", "pc-attack-target-hint",
  "pc-attack-outcomes", "pc-attack-damage", "pc-attack-defenses", "pc-attack-total", "pc-attack-apply", "pc-attack-status", "pc-attack-undo",
  "pc-attack-extras-section", "pc-attack-riders", "pc-attack-extras", "pc-attack-add-extra", "pc-attack-cantrip-row", "pc-attack-cantrip",
  "pc-attack-cantrip-note", "pc-attack-extras-caption", "pc-attack-woven", "pc-attack-activations", "pc-attack-activations-caption",
  "pc-attack-palm", "pc-attack-palm-note", "pc-attack-palm-outcomes", "pc-attack-palm-amount", "pc-attack-palm-apply",
  "pc-attack-mode", "pc-attack-outcome-block", "pc-attack-target-caption", "pc-attack-area", "pc-attack-area-note", "pc-attack-area-list",
  "pc-attack-area-propose", "pc-attack-area-all-failed", "pc-attack-area-all-passed", "pc-attack-picker", "pc-attack-picker-tabs", "pc-attack-picker-select",
  "pc-attack-auto-open-row", "pc-attack-auto-open", "pc-attack-attack-view", "pc-attack-launch", "pc-attack-caster", "pc-attack-follow"];
const BUTTONS = new Set(["pc-attack-close", "pc-attack-apply", "pc-attack-undo", "pc-attack-add-extra", "pc-attack-palm-apply",
  "pc-attack-area-propose", "pc-attack-area-all-failed", "pc-attack-area-all-passed"]);
function createDocument() {
  const doc = {
    listeners: {},
    createElement: (tag) => new FakeNode(doc, tag),
    getElementById: (id) => doc.root.querySelector("#" + id),
    addEventListener(type, callback) { (doc.listeners[type] ||= []).push(callback); },
  };
  doc.root = new FakeNode(doc, "body"); doc.body = doc.root;
  for (const id of IDS) {
    const node = new FakeNode(doc, ["pc-attack-target", "pc-attack-cantrip", "pc-attack-mode", "pc-attack-picker-select"].includes(id) ? "select" : BUTTONS.has(id) ? "button"
      : id === "pc-attack-auto-open" ? "input" : "div");
    node.id = id; doc.root.appendChild(node);
  }
  return doc;
}

const sword = sanitizeQuickAction({ id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] });

// actions: the actor's quick actions, for the picker (the runtime then loads the one asked for, like pcAttackExecution).
function fixture({ defenses = null, attacker = {}, turnState = null, action = sword, nearby = () => [], actions = null, card = null, features = [], actionId = "holy-sword", confirm, broadcast, autoOpenOption } = {}) {
  const documentRef = createDocument();
  const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
  const items = [creature("aria", "Aria", 40, attacker), creature("ghoul", "Ghoul", 30, defenses ? { initiativeCard: { damageDefenses: defenses } } : {}), creature("imp", "Imp", 10)];
  const listeners = { player: new Set(), items: new Set() };
  const subscribe = (set, listener) => { set.add(listener); return () => set.delete(listener); };
  let selection = [];
  const calls = [], undoCalls = [], nearbyCalls = [], loads = [], sources = [], closed = [];
  const api = {
    player: { getRole: async () => "GM", getSelection: async () => selection, onChange: (listener) => subscribe(listeners.player, listener) },
    scene: { isReady: async () => true, onReadyChange: () => () => {},
      items: { getItems: async (ids) => Array.isArray(ids) ? items.filter((item) => ids.includes(item.id)) : items, onChange: (listener) => subscribe(listeners.items, listener) } },
    popover: { close: async (id) => { closed.push(id); } },
    ...(broadcast ? { broadcast } : {}),
  };
  const runtime = {
    getPcAttackPresentation: async (sourceId, asked) => {
      loads.push(asked); sources.push(sourceId);
      const attackerItem = items.find((item) => item.id === sourceId) || items[0];
      if (!actions && !card) return { item: attackerItem, action, targets: items.filter((item) => item !== attackerItem), turnState, sceneIdentity: "scene-A" };
      const picker = pcAttackPickerEntries(card || actions);
      const list = card ? card.quickActions || [] : actions;
      // Without an action asked for, like the runtime: an attack of the picker, else none (an actor with spells only).
      const chosen = list.find((entry) => entry.id === asked)
        || (asked ? null : list.find((entry) => picker.some((item) => item.mode === "attack" && item.actionId === entry.id))) || null;
      return { item: items[0], action: chosen, actionId: chosen?.id || "", picker, features, targets: items.slice(1), turnState, sceneIdentity: "scene-A" };
    },
    endQuiveringPalm: async (request) => {
      calls.push({ palm: request });
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], outcome: request.outcome, quiveringPalm: true,
        target: { id: request.targetId, name: "Ghoul" }, hpChange: { before: 30, after: 0, hpMax: 30 } };
    },
    getPcAttackNearby: async (request) => { nearbyCalls.push(request); return nearby(request); },
    executePcAttackArea: async (request) => {
      calls.push({ area: request });
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], area: true,
        rows: request.members.map((member) => ({ id: member.targetId, name: member.targetId === "ghoul" ? "Ghoul" : "Imp", outcome: member.outcome,
          damage: member.outcome === "failed" ? 6 : 0, before: 30, after: member.outcome === "failed" ? 24 : 30 })) };
    },
    executePcAttack: async (request) => {
      calls.push(request);
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], outcome: request.outcome, target: { id: request.targetId, name: "Ghoul" },
        damageComponents: [{ amount: 17 }], hpChange: { before: 30, after: 13, hpMax: 30 } };
    },
  };
  const controller = bootPcAttack(documentRef, { api, runtime, sourceId: "aria", actionId, confirm, autoOpenOption, schedule: (callback) => setTimeout(callback, 0),
    undo: async (entryId) => { undoCalls.push(entryId); return { ok: true }; } });
  const $ = (id) => documentRef.getElementById(id);
  return { $, controller, calls, undoCalls, nearbyCalls, loads, sources, closed, runtime, items,
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
  const f = fixture({ attacker: { initiativeCard: { characterBuild: [{ classId: "paladino", level: 9 }] } }, turnState: ownTurn }); await f.controller.ready;
  f.runtime.executePcAttack = async (request) => { f.calls.push(request); return { historyEntryId: "entry-1", undoAvailable: true, warnings: [], outcome: request.outcome,
    target: { id: request.targetId, name: "Ghoul" }, damageComponents: [{ amount: 30 }], hpChange: { before: 30, after: 0, hpMax: 30 },
    riders: [{ name: "Punizione Divina" }], followUps: ["Punizione Divina: slot di 3° livello speso."] }; };
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
    "Vantaggio al tiro per colpire contro un bersaglio con armatura di metallo. Al colpo: etichetta «Niente reazioni».");
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
  assert.match(field("meta").textContent, /1d8 tuono · etichetta «Movimento: danni tuono» \(2d8\)/);
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

const sweepingCard = { initiativeCard: { characterBuild: [{ classId: "guerriero", level: 10, subclassId: "guerriero-maestro-di-battaglia" }],
  abilityModifiers: { str: 4, dex: 2, con: 3, int: 0, wis: 1, cha: 0 }, classFeaturesConfigured: true,
  enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre", "guerriero-maestro-di-battaglia-manovre-attacco-con-spazzata",
    "guerriero-maestro-di-battaglia-manovre-attacco-preciso"] } };

test("Sweeping Attack in the console: pick the second creature, its die and HP in the total; the second creature is sent", async () => {
  const f = fixture({ attacker: sweepingCard, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const row = activationRow(f, "attacco-con-spazzata");
  const box = activationField(row, "on"); box.checked = true; await box.emit("change");
  const second = activationField(row, "secondary");
  assert.deepEqual(second.children.map((option) => option.value), ["", "imp"], "any other creature than the target");
  assert.match(activationField(row, "effect").textContent, /Seconda creatura entro 1,5 m dal bersaglio/);
  await typeAmounts(f, ["8", "9"]);
  const amount = activationField(row, "amount"); amount.value = "6"; await amount.emit("input");
  assert.match(textOf(f.$("pc-attack-total")), /scegli la seconda creatura/);
  second.value = "imp"; await second.emit("change");
  assert.match(textOf(f.$("pc-attack-total")), /17 danni · PF 30 → 13 · seconda: 6/);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, [{ id: "guerriero-maestro-di-battaglia-manovre-attacco-con-spazzata", type: "slashing", amount: 6, secondaryTargetId: "imp" }]);
  assert.deepEqual(f.calls[0].expectedSecondaryDefenses, { immunities: [], resistances: [], vulnerabilities: [] });
});

test("on a miss the console keeps only the activations used on the roll, under «Prima del tiro»", async () => {
  const f = fixture({ attacker: sweepingCard, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("miss").click();
  assert.equal(f.$("pc-attack-extras-section").hidden, false);
  assert.equal(f.$("pc-attack-extras-caption").textContent, "Prima del tiro");
  assert.equal(f.$("pc-attack-activations-caption").hidden, true, "no second caption");
  assert.equal(activationRow(f, "attacco-con-spazzata").hidden, true);
  const precise = activationRow(f, "attacco-preciso");
  assert.equal(precise.hidden, false);
  assert.equal(activationField(precise, "meta").textContent.replace(/ /gu, " "), "+1d10 al tiro per colpire · Dadi di Superiorità 5/5");
  assert.equal(f.$("pc-attack-add-extra").hidden, true, "no components on a miss");
  const box = activationField(precise, "on"); box.checked = true; await box.emit("change");
  assert.equal(activationField(precise, "amount").hidden, true, "nothing to enter");
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, [{ id: "guerriero-maestro-di-battaglia-manovre-attacco-preciso" }]);
});

const openHandCard = { initiativeCard: { characterBuild: [{ classId: "monaco", level: 17, subclassId: "monaco-via-della-mano-aperta" }],
  abilityModifiers: { str: 1, dex: 4, con: 2, int: 0, wis: 3, cha: 0 }, classFeaturesConfigured: true,
  enabledClassFeatureIds: ["monaco-via-della-mano-aperta-tecnica-della-mano-aperta", "monaco-via-della-mano-aperta-palmo-tremante"] } };
const rowById = (f, id) => f.$("pc-attack-activations").querySelector(`[data-activation-id="${id}"]`);

test("Open Hand Technique in the console: pick the effect; its save shows only when it has one; the choice is sent", async () => {
  const f = fixture({ attacker: openHandCard, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const row = rowById(f, "monaco-via-della-mano-aperta-tecnica-della-mano-aperta");
  const box = activationField(row, "on"); box.checked = true; await box.emit("change");
  const choice = activationField(row, "choice");
  assert.deepEqual(choice.children.map((option) => option.value), ["", "prone", "push", "no-reactions"]);
  await typeAmounts(f, ["8", "9"]);
  assert.match(textOf(f.$("pc-attack-total")), /scegli l'effetto/);
  choice.value = "prone"; await choice.emit("change");
  assert.equal(activationField(row, "save").hidden, false);
  assert.match(activationField(row, "meta").textContent.replace(/\u00a0/gu, " "), /TS Destrezza CD 17/);
  assert.match(activationField(row, "effect").textContent, /Se fallisce: Prono .*Raffica di Colpi/);
  choice.value = "no-reactions"; await choice.emit("change");
  assert.equal(activationField(row, "save").hidden, true, "no save for no reactions");
  assert.match(activationField(row, "effect").textContent, /Effetto: Niente reazioni/);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, [{ id: "monaco-via-della-mano-aperta-tecnica-della-mano-aperta", choice: "no-reactions" }]);
});

test("Quivering Palm in the console: a target with the monk's vibrations shows «Termina le vibrazioni», committed apart", async () => {
  const f = fixture({ attacker: openHandCard, turnState: ownTurn });
  f.items[1].metadata[META].conditions = [{ id: "palm-pill", condition: "Palmo Tremante", active: true, sourceId: "aria" }];
  await f.controller.ready;
  assert.equal(f.$("pc-attack-palm").hidden, true, "no target yet");
  await f.select(["ghoul"]);
  assert.equal(f.$("pc-attack-palm").hidden, false);
  assert.equal(f.$("pc-attack-palm-note").textContent, "vibrazioni attive · TS Costituzione CD 17");
  assert.equal(f.$("pc-attack-palm-apply").disabled, true);
  const button = (outcome) => f.$("pc-attack-palm-outcomes").querySelector(`[data-outcome="${outcome}"]`);
  await button("passed").click();
  assert.equal(f.$("pc-attack-palm-amount").hidden, false);
  assert.equal(f.$("pc-attack-palm-apply").disabled, true, "the 10d10 is missing");
  await button("failed").click();
  assert.equal(f.$("pc-attack-palm-amount").hidden, true);
  assert.equal(f.$("pc-attack-palm-apply").disabled, false);
  await f.$("pc-attack-palm-apply").click(); await tick();
  assert.equal(f.calls[0].palm.outcome, "failed");
  assert.equal(f.calls[0].palm.targetId, "ghoul");
  assert.match(f.$("pc-attack-status").textContent, /^Registrato: Palmo Tremante su Ghoul, TS fallito\. PF 30 → 0\./);
  await f.select(["imp"]);
  assert.equal(f.$("pc-attack-palm").hidden, true, "another target has no vibrations");
});

test("Inspiring Smite in the console: the total and its distribution among other creatures are sent", async () => {
  const card = { initiativeCard: { characterBuild: [{ classId: "paladino", level: 7, subclassId: "paladino-giuramento-di-gloria" }],
    abilityModifiers: { str: 4, dex: 0, con: 2, int: 0, wis: 1, cha: 3 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["paladino-punizione-divina", "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice"] } };
  const f = fixture({ attacker: card, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const smite = riderRow(f, "paladino-punizione-divina");
  const smiteBox = riderField(smite, "on"); smiteBox.checked = true; await smiteBox.emit("change");
  const smiteAmount = riderField(smite, "amount"); smiteAmount.value = "9"; await smiteAmount.emit("input");
  const row = rowById(f, "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice");
  assert.equal(activationField(row, "on").disabled, false);
  assert.match(activationField(row, "meta").textContent.replace(/\u00a0/gu, " "), /^2d8\+7 PF temporanei/);
  const box = activationField(row, "on"); box.checked = true; await box.emit("change");
  await typeAmounts(f, ["8", "9"]);
  const total = activationField(row, "amount"); total.value = "12"; await total.emit("input");
  const list = activationField(row, "temp-hp");
  const who = list.querySelector('[data-temp-hp-field="target"]');
  assert.deepEqual(who.children.map((option) => option.value), ["", "aria", "imp"], "the paladin and the others, never the target");
  who.value = "aria"; await who.emit("change");
  const amount = list.querySelector('[data-temp-hp-field="amount"]'); amount.value = "12"; await amount.emit("input");
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, [{ id: "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice", amount: 12,
    tempHp: [{ targetId: "aria", amount: 12 }] }]);
  assert.equal(resultSummary({ outcome: "hit", target: { name: "Ghoul" }, damageComponents: [{ amount: 26 }], hpChange: { before: 30, after: 4 },
    tempHp: [{ name: "Aria", before: 40, after: 52 }] }), "Registrato: Colpito, 26 danni a Ghoul. PF 30 → 4. PF temporanei: Aria 40 → 52.");
});

const areaRow = (f, id) => f.$("pc-attack-area-list").querySelector(`[data-area-id="${id}"]`);
const areaField = (row, name) => row.querySelector(`[data-area-field="${name}"]`);

test("an area cantrip: the creatures near the caster proposed, a save for each, one roll, one command", async () => {
  const action = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["tasha-turbine-di-spade"] } });
  const f = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "mago", level: 5 }], spellSaveDC: 14 } }, turnState: ownTurn,
    nearby: () => ["ghoul"] });
  await f.controller.ready; await tick();
  assert.deepEqual(f.nearbyCalls, [{ sourceId: "aria", centerId: "aria", radiusFeet: 5 }]);
  assert.equal(f.$("pc-attack-area").hidden, false);
  assert.equal(f.$("pc-attack-target").hidden, true);
  assert.equal(f.$("pc-attack-target-caption").textContent, "Creature colpite");
  assert.equal(f.$("pc-attack-outcomes").hidden, true, "no single outcome: a save for each creature");
  assert.match(f.$("pc-attack-area-note").textContent, /Entro 1,5 m da Aria, alleati compresi/);
  assert.deepEqual(["ghoul", "imp"].map((id) => areaField(areaRow(f, id), "on").checked), [true, false], "proposed from the map");
  assert.match(textOf(areaRow(f, "ghoul")), /Ghoul · 30\/30 PF/);
  assert.equal(f.$("pc-attack-total").textContent, "Scegli l'esito del tiro salvezza di ogni creatura.");
  await f.$("pc-attack-area-all-failed").click();
  await areaField(areaRow(f, "imp"), "passed").click();
  assert.equal(areaField(areaRow(f, "imp"), "on").checked, true, "an outcome ticks the creature");
  assert.equal(areaField(areaRow(f, "imp"), "passed").getAttribute("aria-pressed"), "true");
  assert.equal(areaField(areaRow(f, "ghoul"), "failed").getAttribute("aria-pressed"), "true");
  await typeAmounts(f, ["6"]);
  assert.match(textOf(f.$("pc-attack-total")), /6 danni · 2 creature$/);
  assert.equal(f.$("pc-attack-apply").disabled, false);
  await f.$("pc-attack-apply").click(); await tick();
  const request = f.calls[0].area;
  assert.deepEqual([request.spellId, request.members, request.componentAmounts], ["tasha-turbine-di-spade",
    [{ targetId: "ghoul", outcome: "failed" }, { targetId: "imp", outcome: "passed" }], { c1: 6 }]);
  assert.deepEqual(Object.keys(request.expectedDefenses), ["ghoul", "imp"]);
  assert.equal(f.$("pc-attack-status").textContent, "Registrato: Turbine di Spade su 2 creature. Ghoul TS fallito, PF 30 → 24; Imp TS superato, PF 30 → 30.");
  assert.equal(areaSummary({ rows: [] }, "Rombo di Tuono"), "Registrato: Rombo di Tuono su 0 creature.");
});

test("the arrows of the Arcane Archer: Seeking replaces the roll with a save; Piercing turns the target into a line", async () => {
  const bow = sanitizeQuickAction({ id: "holy-sword", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing" }] });
  const ARROW = (slug) => `guerriero-arciere-arcano-tiro-arcano-freccia-${slug}`;
  const archer = { initiativeCard: { characterBuild: [{ classId: "guerriero", level: 7, subclassId: "guerriero-arciere-arcano" }],
    abilityModifiers: { str: 1, dex: 4, con: 2, int: 1, wis: 1, cha: 0 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-arciere-arcano-tiro-arcano", ...["cercatrice", "perforante"].map(ARROW)] } };
  const f = fixture({ action: bow, attacker: archer, turnState: ownTurn }); await f.controller.ready;
  const mode = f.$("pc-attack-mode");
  assert.equal(mode.hidden, false);
  assert.deepEqual(mode.children.map((option) => option.textContent),
    ["Tiro per colpire", "Freccia Cercatrice · TS Destrezza CD 12", "Freccia Perforante · linea, TS Destrezza CD 12"]);
  await f.select(["ghoul"]);
  mode.value = ARROW("cercatrice"); await mode.emit("change");
  assert.deepEqual(f.$("pc-attack-outcomes").children.map((button) => button.dataset.outcome), ["failed", "passed"]);
  assert.equal(f.inputs().length, 2, "the weapon's damage and the arrow's die");
  await f.outcome("passed").click();
  await typeAmounts(f, ["9", "4"]);
  assert.equal(f.$("pc-attack-apply").disabled, false);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual([f.calls[0].attackMode, f.calls[0].modeAmount, f.calls[0].outcome, f.calls[0].componentAmounts], [ARROW("cercatrice"), 4, "passed", { c1: 9 }]);
  assert.equal(mode.value, ARROW("cercatrice"), "the arrow stays chosen for the next attack");
  mode.value = ARROW("perforante"); await mode.emit("change");
  assert.equal(f.$("pc-attack-area").hidden, false);
  assert.equal(f.$("pc-attack-area-propose").hidden, true, "a line: ticked by hand");
  assert.match(f.$("pc-attack-area-note").textContent, /Sulla linea di 9 m/);
  assert.deepEqual(f.nearbyCalls, [], "nothing proposed for a line");
  await areaField(areaRow(f, "imp"), "failed").click();
  await typeAmounts(f, ["8", "3"]);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual([f.calls[1].area.attackMode, f.calls[1].area.modeAmount, f.calls[1].area.members], [ARROW("perforante"), 3, [{ targetId: "imp", outcome: "failed" }]]);
});

test("Bursting Arrow in the console: the creatures around the target proposed and sent with their defenses", async () => {
  const bow = sanitizeQuickAction({ id: "holy-sword", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing" }] });
  const archer = { initiativeCard: { characterBuild: [{ classId: "guerriero", level: 7, subclassId: "guerriero-arciere-arcano" }],
    abilityModifiers: { str: 1, dex: 4, con: 2, int: 1, wis: 1, cha: 0 }, classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-arciere-arcano-tiro-arcano", "guerriero-arciere-arcano-tiro-arcano-freccia-esplosiva"] } };
  const f = fixture({ action: bow, attacker: archer, turnState: ownTurn, nearby: () => ["imp", "ghoul"] }); await f.controller.ready;
  assert.equal(f.$("pc-attack-mode").hidden, true, "no arrow replaces the roll");
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const row = rowById(f, "guerriero-arciere-arcano-tiro-arcano-freccia-esplosiva");
  const box = activationField(row, "on"); box.checked = true; await box.emit("change"); await tick();
  assert.deepEqual(f.nearbyCalls, [{ sourceId: "aria", centerId: "ghoul", radiusFeet: 10 }]);
  const list = activationField(row, "burst");
  assert.deepEqual(list.querySelectorAll("[data-burst-id]").map((entry) => [entry.dataset.burstId, entry.checked]), [["aria", false], ["imp", true]],
    "the attacker can be in the burst; never the target");
  await typeAmounts(f, ["9"]);
  const amount = activationField(row, "amount"); amount.value = "7"; await amount.emit("input");
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].activations, [{ id: "guerriero-arciere-arcano-tiro-arcano-freccia-esplosiva", type: "force", amount: 7, burstTargetIds: ["imp"] }]);
  assert.deepEqual(Object.keys(f.calls[0].expectedBurstDefenses), ["imp"]);
});

test("Create Bonfire is pointed to the spell panel from the cantrip console", async () => {
  const action = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt", "xanathar-creare-falo"] } });
  const f = fixture({ action, attacker: { initiativeCard: { characterBuild: [{ classId: "mago", level: 5 }] } } }); await f.controller.ready;
  assert.deepEqual(f.$("pc-attack-cantrip").children.map((option) => option.value), ["fire-bolt"]);
  assert.match(f.$("pc-attack-cantrip-note").textContent, /Creare Falò: lancialo dal pannello incantesimi/);
});

const axe = sanitizeQuickAction({ id: "axe", label: "Ascia", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d12+3" }] });
const knownCantrips = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt", "ray-of-frost"] } });
const attackSpells = sanitizeQuickAction({ id: "spells", label: "Incantesimi", kind: "attack", source: { kind: "spell", spellIds: ["guiding-bolt"] } });
const pickerTabs = (f) => f.$("pc-attack-picker-tabs").querySelectorAll("button");
const pickerOptions = (f) => f.$("pc-attack-picker-select").children.map((option) => option.value);
async function pick(f, value) { const select = f.$("pc-attack-picker-select"); select.value = value; await select.emit("change"); await tick(); }

test("the picker: one tab per kind, the entries of the current tab, the cantrip select gives way to it", async () => {
  const f = fixture({ actions: [sword, axe, knownCantrips, attackSpells] }); await f.controller.ready; await tick();
  assert.equal(f.$("pc-attack-picker").hidden, false);
  assert.deepEqual(pickerTabs(f).map((button) => [button.textContent, button.getAttribute("aria-pressed")]),
    [["Attacchi", "true"], ["Trucchetti", "false"], ["Incantesimi", "false"]]);
  assert.deepEqual(pickerOptions(f), ["holy-sword", "axe"]);
  assert.equal(f.$("pc-attack-picker-select").value, "holy-sword");
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(f.$("pc-attack-title").textContent, "Dardo di fuoco", "the title names the cantrip chosen");
  assert.deepEqual(pickerOptions(f), ["cantrip::fire-bolt", "cantrip::ray-of-frost"]);
  assert.equal(f.controller.getDraft().spellId, "fire-bolt");
  assert.equal(f.$("pc-attack-cantrip").hidden, true, "the picker replaces the cantrip select");
  assert.equal(f.$("pc-attack-cantrip-row").hidden, false, "the cantrip notes stay");
});

test("another weapon loads its action with a fresh draft; the target stays and the attack registers on it", async () => {
  const f = fixture({ actions: [sword, axe] }); await f.controller.ready;
  await f.select(["ghoul"]);
  assert.equal(f.$("pc-attack-picker-tabs").hidden, true, "a single tab shows no tabs");
  await pick(f, "axe");
  assert.equal(f.$("pc-attack-title").textContent, "Ascia");
  assert.deepEqual(f.loads, ["holy-sword", "axe"]);
  assert.equal(f.controller.getDraft().targetId, "ghoul");
  await f.outcome("hit").click();
  await typeAmounts(f, ["9"]);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual([f.calls[0].actionId, f.calls[0].targetId], ["axe", "ghoul"]);
  assert.deepEqual(f.calls[0].expectedAction, axe);
});

test("another cantrip of the same action changes in place, without loading the action again", async () => {
  const f = fixture({ actions: [knownCantrips, sword], actionId: "cantrip" }); await f.controller.ready; await tick();
  const loads = f.loads.length;
  await pick(f, "cantrip::ray-of-frost");
  assert.equal(f.controller.getDraft().spellId, "ray-of-frost");
  assert.equal(f.loads.length, loads);
  assert.equal(f.$("pc-attack-picker-select").value, "cantrip::ray-of-frost");
});

test("an attack with decisions asks before switching, and stays when the GM declines", async () => {
  let answer = false;
  const asked = [];
  const f = fixture({ actions: [sword, axe], confirm: (message) => { asked.push(message); return answer; } }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await pick(f, "axe");
  assert.equal(asked.length, 1);
  assert.equal(f.$("pc-attack-title").textContent, "Spada sacra");
  assert.equal(f.$("pc-attack-picker-select").value, "holy-sword", "the select goes back to the attack in use");
  assert.equal(f.controller.getDraft().outcome, "hit");
  answer = true;
  await pick(f, "axe");
  assert.equal(f.$("pc-attack-title").textContent, "Ascia");
  assert.equal(f.controller.getDraft().outcome, "");
});

test("the attack spells tab and a single entry", async () => {
  const f = fixture({ actions: [sword, attackSpells] }); await f.controller.ready; await tick();
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(pickerTabs(f)[1].textContent, "Incantesimi");
  assert.equal(f.controller.getDraft().spellId, "guiding-bolt");
  assert.equal(f.$("pc-attack-picker-select").hidden, true, "one entry in the tab: no select");
  const single = fixture({ actions: [sword] }); await single.controller.ready;
  assert.equal(single.$("pc-attack-picker").hidden, true);
});

test("the console answers the turn controller's ping while it is open, and stops once closed", async () => {
  const listeners = new Set(), sent = [];
  const broadcast = { onMessage: (channel, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    sendMessage: async (channel, data, options) => { sent.push({ channel, data, options }); } };
  const f = fixture({ broadcast }); await f.controller.ready;
  for (const listener of listeners) listener({ data: { type: "ping" } });
  await tick();
  assert.deepEqual(sent, [{ channel: "com.thebigpicture.initiative/pc-attack-console", data: { type: "pong", sourceId: "aria", actionId: "holy-sword" },
    options: { destination: "LOCAL" } }]);
  await f.$("pc-attack-close").click();
  assert.equal(listeners.size, 0);
});

test("the header switch shows and changes the turn auto-open option", async () => {
  const values = [];
  let notify = null;
  const autoOpenOption = { subscribe: async (listener) => { notify = listener; listener(false); return () => { notify = null; }; },
    set: async (value) => { values.push(value); }, stop() {} };
  const f = fixture({ autoOpenOption }); await f.controller.ready; await tick();
  const box = f.$("pc-attack-auto-open");
  assert.equal(f.$("pc-attack-auto-open-row").hidden, false);
  assert.equal(box.checked, false);
  box.checked = true; await box.emit("change"); await tick();
  assert.deepEqual(values, [true]);
  assert.match(f.$("pc-attack-status").textContent, /si aprirà da sola a ogni turno/);
  notify(false);
  assert.equal(box.checked, false, "a change made in the options panel shows here");
  await f.$("pc-attack-close").click();
  assert.equal(notify, null);
});

// A cleric with a cantrip attack, a book and a slot spent; concentrating on Bless.
const clericCard = { characterBuild: [{ classId: "chierico", level: 3 }], quickActions: [sword, sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack",
  source: { kind: "cantrip" } })], spellbook: { spellIds: ["sacred-flame", "light", "bless", "shield-of-faith", "spiritual-weapon"] } };
const clericMeta = { initiativeCard: clericCard, classFeatureState: { resources: { "spell-slot-1": { current: 1 } } },
  "com.thebigpicture.initiative/concentration": { bless: { spellId: "bless", name: "Benedizione" } } };
function launchBroadcast({ ack = true, result = { ok: true, mode: "review" } } = {}) {
  const listeners = new Set(), sent = [];
  return { sent, broadcast: {
    onMessage: (channel, listener) => { const entry = { channel, listener }; listeners.add(entry); return () => listeners.delete(entry); },
    sendMessage: async (channel, data) => {
      sent.push({ channel, data });
      if (data.type !== "launch") return;
      const reply = (message) => { for (const entry of [...listeners]) if (entry.channel === channel) entry.listener({ data: message }); };
      setTimeout(() => {
        if (ack) reply({ type: "launch-accepted", requestId: data.requestId });
        if (result) reply({ type: "launch-result", requestId: data.requestId, ...result });
      }, 0);
    } } };
}

test("a spell the console does not resolve shows its card instead of the form; the attack waits behind it", async () => {
  const f = fixture({ card: clericCard, attacker: clericMeta }); await f.controller.ready; await tick();
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  const tabs = pickerTabs(f).map((button) => button.textContent);
  assert.deepEqual(tabs, ["Attacchi", "Trucchetti", "Incantesimi"]);
  await pickerTabs(f)[2].click(); await tick();
  assert.equal(f.$("pc-attack-attack-view").hidden, true);
  assert.equal(f.$("pc-attack-launch").hidden, false);
  assert.equal(f.$("pc-attack-title").textContent, "Benedizione");
  assert.match(f.$("pc-attack-subtitle").textContent, /Incantesimo di 1° livello/);
  assert.match(textOf(f.$("pc-attack-launch")), /Concentrazione/);
  assert.equal(f.$("pc-attack-launch").querySelector("#pc-attack-launch-button").textContent, "Lancia");
  assert.match(textOf(f.$("pc-attack-caster")), /Slot 1° 1\/4 · 2° 2\/2.*Concentrazione: Benedizione/);
  const groups = f.$("pc-attack-picker-select").children.map((group) => group.label);
  assert.deepEqual(groups, ["1° livello", "2° livello"], "the spells by level");
  await pick(f, "book:shield-of-faith::shield-of-faith");
  assert.match(textOf(f.$("pc-attack-launch")), /Lanciandolo termina la concentrazione su Benedizione/);
  await pickerTabs(f)[0].click(); await tick();
  assert.equal(f.$("pc-attack-attack-view").hidden, false);
  assert.equal(f.controller.getDraft().outcome, "hit", "the attack in progress is still there");
  assert.equal(f.$("pc-attack-caster").hidden, true, "the attacks tab shows no slots");
});

test("Lancia asks the tracker; its answer, or its silence, is the status", async () => {
  const ok = launchBroadcast();
  const f = fixture({ card: clericCard, attacker: clericMeta, broadcast: ok.broadcast }); await f.controller.ready; await tick();
  await pickerTabs(f)[2].click(); await tick();
  await f.$("pc-attack-launch").querySelector("#pc-attack-launch-button").click(); await tick(); await tick();
  const launch = ok.sent.find((message) => message.data.type === "launch");
  assert.equal(launch.channel, "com.thebigpicture.initiative/pc-attack-spell-launch");
  assert.deepEqual([launch.data.sourceId, launch.data.actionId], ["aria", "book:bless"]);
  assert.equal(f.$("pc-attack-status").textContent, "Benedizione: pannello incantesimi aperto.");
  const silent = launchBroadcast({ ack: false, result: null });
  const g = fixture({ card: clericCard, attacker: clericMeta, broadcast: silent.broadcast }); await g.controller.ready; await tick();
  await pickerTabs(g)[2].click(); await tick();
  await g.$("pc-attack-launch").querySelector("#pc-attack-launch-button").click();
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.match(g.$("pc-attack-status").textContent, /Il tracker non risponde: aprilo per lanciare Benedizione/);
});

test("an actor with spells and no attack opens on its spells", async () => {
  const card = { characterBuild: [{ classId: "chierico", level: 1 }], quickActions: [], spellbook: { spellIds: ["light", "bless"] } };
  const f = fixture({ card, attacker: { initiativeCard: card }, actionId: "" }); await f.controller.ready; await tick();
  assert.equal(f.controller.getDraft(), null);
  assert.equal(f.$("pc-attack-form").hidden, false);
  assert.equal(f.$("pc-attack-attack-view").hidden, true);
  assert.equal(f.$("pc-attack-title").textContent, "Luce");
});

test("a blade cantrip points to the weapon attack", async () => {
  const card = { quickActions: [sword], spellbook: { spellIds: ["tasha-lama-roboante", "light"] } };
  const f = fixture({ card, attacker: { initiativeCard: card } }); await f.controller.ready; await tick();
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(f.$("pc-attack-title").textContent, "Lama Roboante");
  assert.match(textOf(f.$("pc-attack-launch")), /Si lancia con un attacco con arma da mischia/);
  assert.equal(f.$("pc-attack-launch").querySelector("#pc-attack-launch-button"), null);
});

function followBroadcast() {
  const listeners = new Set();
  return {
    broadcast: { onMessage: (channel, listener) => { listeners.add(listener); return () => listeners.delete(listener); }, sendMessage: async () => {} },
    follow: async (sourceId, name) => { for (const listener of [...listeners]) listener({ data: { type: "follow", sourceId, name } }); await tick(); await tick(); },
  };
}

test("a clean console follows the turn: the new actor in place, a fresh attack, no undo of the previous one", async () => {
  const bus = followBroadcast();
  const f = fixture({ broadcast: bus.broadcast }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await typeAmounts(f, ["8", "9"]);
  await f.$("pc-attack-apply").click(); await tick();
  assert.equal(f.$("pc-attack-undo").hidden, false);
  await bus.follow("imp", "Imp");
  assert.equal(f.sources.at(-1), "imp");
  assert.equal(f.loads.at(-1), "", "the new actor opens on its own last attack");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Imp/);
  assert.equal(f.controller.getDraft().outcome, "");
  assert.equal(f.$("pc-attack-undo").hidden, true);
  assert.equal(f.$("pc-attack-status").textContent, "Turno di Imp.");
  await bus.follow("imp", "Imp");
  assert.equal(f.sources.filter((id) => id === "imp").length, 1, "the same actor again changes nothing");
});

test("a console holding decisions waits: the bar offers the move, after a confirmation", async () => {
  const bus = followBroadcast();
  let answer = false;
  const f = fixture({ broadcast: bus.broadcast, confirm: () => answer }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await bus.follow("imp", "Imp");
  assert.equal(f.sources.includes("imp"), false);
  const bar = f.$("pc-attack-follow");
  assert.equal(bar.hidden, false);
  assert.match(textOf(bar), /È il turno di Imp\./);
  const button = bar.querySelector("button");
  assert.equal(button.textContent, "Passa a Imp");
  await button.click(); await tick();
  assert.equal(f.sources.includes("imp"), false, "the GM declined: the attack stays");
  answer = true;
  await button.click(); await tick(); await tick();
  assert.equal(f.sources.at(-1), "imp");
  assert.equal(bar.hidden, true);
});

test("a turn back to the console's actor clears the bar; a clean console closes on a turn with nothing to show", async () => {
  const bus = followBroadcast();
  const f = fixture({ broadcast: bus.broadcast }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await bus.follow("imp", "Imp");
  assert.equal(f.$("pc-attack-follow").hidden, false);
  await bus.follow("aria", "Aria");
  assert.equal(f.$("pc-attack-follow").hidden, true);
  await bus.follow("", "");
  assert.deepEqual(f.closed, [], "a held console never closes by itself");
  assert.equal(f.$("pc-attack-follow").querySelector("button").textContent, "Chiudi");
  const clean = followBroadcast();
  const h = fixture({ broadcast: clean.broadcast }); await h.controller.ready;
  await clean.follow("", "");
  assert.deepEqual(h.closed, ["com.thebigpicture.initiative/pc-attack"]);
});

// A barbarian with Rage as a ⚡ quick action, 2 rages left of 3.
const rageAction = { id: "rage", label: "Ira", kind: "feature", featureId: "barbaro-ira" };
const barbarianCard = { quickActions: [sword, rageAction] };
const rageStatus = (active = false) => [{ featureId: "barbaro-ira", label: "Ira", targetMode: "self", targetLabel: "su di sé", active,
  resourceReady: true, resources: [{ poolId: "barbaro-ira-usi", amount: 1, current: 2, maximum: 3, unlimited: false, ready: true }] }];

test("the Capacità tab shows a ⚡ feature with its uses left; Usa runs it through the tracker", async () => {
  const bus = launchBroadcast({ result: { ok: true, mode: "" } });
  const f = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, features: rageStatus(), broadcast: bus.broadcast });
  await f.controller.ready; await tick();
  assert.deepEqual(pickerTabs(f).map((button) => button.textContent), ["Attacchi", "Capacità"]);
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(f.$("pc-attack-title").textContent, "Ira");
  assert.match(f.$("pc-attack-subtitle").textContent, /Capacità/);
  assert.match(textOf(f.$("pc-attack-launch")), /su di sé/);
  assert.match(textOf(f.$("pc-attack-launch")), /Ire 2\/3/);
  assert.equal(f.$("pc-attack-caster").hidden, true, "no slots line for the features");
  const button = f.$("pc-attack-launch").querySelector("#pc-attack-launch-button");
  assert.equal(button.textContent, "Usa");
  await button.click(); await tick(); await tick();
  assert.deepEqual(bus.sent.find((message) => message.data.type === "launch").data.actionId, "rage");
  assert.equal(f.$("pc-attack-status").textContent, "Ira: attivata.");
});

test("a feature already active on its owner cannot be used again, as in the ⚡ menu", async () => {
  const f = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, features: rageStatus(true) });
  await f.controller.ready; await tick();
  await pickerTabs(f)[1].click(); await tick();
  assert.match(textOf(f.$("pc-attack-launch")), /Attiva.*Già attiva\./);
  assert.equal(f.$("pc-attack-launch").querySelector("#pc-attack-launch-button").disabled, true);
});

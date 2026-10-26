import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";

const META = "com.thebigpicture.initiative/meta";
const sheetOpened = [];
const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, scene: { items: { getItems: async () => [] } },
  popover: { close: async () => {}, open: async (options) => { sheetOpened.push(options); } } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { bootPcAttack, resultSummary, areaSummary } = await import("../src/pc-attack.js");
const { sanitizeQuickAction } = await import("../src/quickActionsCore.js");
const { pcAttackPickerEntries } = await import("../src/pcAttackPickerCore.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const IDS = ["pc-attack-reaction", "pc-attack-turn", "pc-attack-picker-search", "pc-attack-minimize", "pc-attack-picker-dropdown", "pc-attack-picker-dropdown-button", "pc-attack-picker-menu", "pc-attack-use-selected-row", "pc-attack-title", "pc-attack-subtitle", "pc-attack-close", "pc-attack-form", "pc-attack-target", "pc-attack-target-hint",
  "pc-attack-outcomes", "pc-attack-damage", "pc-attack-defenses", "pc-attack-total", "pc-attack-apply", "pc-attack-status", "pc-attack-undo",
  "pc-attack-extras-section", "pc-attack-riders", "pc-attack-extras", "pc-attack-add-extra", "pc-attack-cantrip-row", "pc-attack-cantrip",
  "pc-attack-cantrip-note", "pc-attack-extras-caption", "pc-attack-woven", "pc-attack-activations", "pc-attack-activations-caption",
  "pc-attack-palm", "pc-attack-palm-note", "pc-attack-palm-outcomes", "pc-attack-palm-amount", "pc-attack-palm-apply",
  "pc-attack-mode", "pc-attack-outcome-block", "pc-attack-target-caption", "pc-attack-area", "pc-attack-area-note", "pc-attack-area-list",
  "pc-attack-area-propose", "pc-attack-area-all-failed", "pc-attack-area-all-passed", "pc-attack-picker", "pc-attack-picker-tabs", "pc-attack-picker-select",
  "pc-attack-auto-open-row", "pc-attack-auto-open", "pc-attack-attack-view", "pc-attack-launch", "pc-attack-caster", "pc-attack-follow", "pc-attack-picker-list",
  "pc-attack-launch-button", "pc-attack-spell-details", "pc-attack-spell-details-body", "pc-attack-use-selected",
  "pc-attack-grapple", "pc-attack-maneuver", "pc-attack-maneuver-target", "pc-attack-maneuver-hint", "pc-attack-maneuver-effects", "pc-attack-maneuver-contest",
  "pc-attack-maneuver-outcomes", "pc-attack-maneuver-note", "pc-attack-multiattack", "pc-attack-monster-note"];
const BUTTONS = new Set(["pc-attack-close", "pc-attack-apply", "pc-attack-launch-button", "pc-attack-use-selected", "pc-attack-undo", "pc-attack-add-extra", "pc-attack-palm-apply",
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
    const node = new FakeNode(doc, ["pc-attack-target", "pc-attack-cantrip", "pc-attack-mode", "pc-attack-picker-select", "pc-attack-maneuver-target"].includes(id) ? "select" : BUTTONS.has(id) ? "button"
      : ["pc-attack-auto-open", "pc-attack-picker-search"].includes(id) ? "input" : id === "pc-attack-spell-details" ? "details" : "div");
    node.id = id; doc.root.appendChild(node);
  }
  return doc;
}

const sword = sanitizeQuickAction({ id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] });

// actions: the actor's quick actions, for the picker (the runtime then loads the one asked for, like pcAttackExecution).
function fixture({ defenses = null, attacker = {}, turnState = null, action = sword, nearby = () => [], actions = null, card = null, featureState = null, featureRuntime, actionId = "holy-sword", confirm, broadcast, autoOpenOption, metas = {}, openTracker } = {}) {
  const documentRef = createDocument();
  const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
  // metas: more metadata for the ghoul and the imp (their cards, for the off-turn actions).
  const items = [creature("aria", "Aria", 40, attacker), creature("ghoul", "Ghoul", 30, { ...(defenses ? { initiativeCard: { damageDefenses: defenses } } : {}), ...metas.ghoul }),
    creature("imp", "Imp", 10, metas.imp || {})];
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
      return { item: items[0], action: chosen, actionId: chosen?.id || "", picker, featureState, targets: items.slice(1), turnState, sceneIdentity: "scene-A" };
    },
    endQuiveringPalm: async (request) => {
      calls.push({ palm: request });
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], outcome: request.outcome, quiveringPalm: true,
        target: { id: request.targetId, name: "Ghoul" }, hpChange: { before: 30, after: 0, hpMax: 30 } };
    },
    getPcAttackNearby: async (request) => { nearbyCalls.push(request); return nearby(request); },
    executePcManeuver: async (request) => {
      calls.push({ maneuver: request });
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], target: { id: request.targetId, name: "Ghoul" },
        maneuver: { kind: request.kind, outcome: request.outcome, ...(request.effect ? { effect: request.effect } : {}) },
        ...(request.effect === "push" && request.outcome === "success" ? { manualText: "Sposta Ghoul di 1,5 m lontano da Aria sulla mappa." } : {}) };
    },
    endPcGrapple: async (request) => {
      calls.push({ grappleEnd: request });
      return { historyEntryId: `entry-${calls.length}`, undoAvailable: true, warnings: [], target: { id: request.grappledId, name: "Ghoul" },
        maneuver: { kind: "grapple-end", outcome: request.outcome, grapplerName: "Aria", grappledName: request.grappledId === "aria" ? "Aria" : "Ghoul" } };
    },
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
  const controller = bootPcAttack(documentRef, { api, runtime, sourceId: "aria", actionId, confirm, autoOpenOption, featureRuntime, openTracker, launchAckTimeoutMs: 40, schedule: (callback) => setTimeout(callback, 0),
    undo: async (entryId) => { undoCalls.push(entryId); return { ok: true }; } });
  const $ = (id) => documentRef.getElementById(id);
  // keydown: a key pressed in the console, its target the element focused (or the one given).
  const keydown = async (key, target = documentRef.activeElement) => {
    for (const callback of documentRef.listeners.keydown || []) await callback({ key, target, preventDefault() {} });
    await tick();
  };
  return { $, controller, calls, undoCalls, nearbyCalls, loads, sources, closed, runtime, items, documentRef, keydown,
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
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Spada sacra( · |$)/);
  assert.equal(f.$("pc-attack-subtitle").textContent, "Spada sacra · Mischia");
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

test("Improved Divine Smite ticks itself on a melee hit, leaves the target free to follow the map, and stays off once unticked", async () => {
  const f = fixture({ attacker: { initiativeCard: { characterBuild: [{ classId: "paladino", level: 11 }] } }, turnState: ownTurn }); await f.controller.ready;
  await f.select(["ghoul"]);
  const row = () => riderRow(f, "paladino-punizione-divina-migliorata");
  assert.equal(riderField(row(), "on").checked, true, "ticked by itself");
  await f.select(["imp"]);
  assert.equal(f.controller.getDraft().targetId, "imp", "not a decision: the map still drives the target");
  await f.outcome("hit").click();
  assert.equal(riderField(row(), "amount").hidden, false, "its amount to type");
  assert.equal(riderField(row(), "amount").placeholder, "1d8");
  const [first, second] = f.inputs(); first.value = "6"; await first.emit("input"); second.value = "7"; await second.emit("input");
  assert.match(textOf(f.$("pc-attack-total")), /Inserisci il danno di ogni extra/, "its damage is asked");
  await f.keydown("Enter", second);
  assert.ok(f.documentRef.activeElement === riderField(row(), "amount"), "Enter goes on to the amount still empty");
  const toggle = riderField(row(), "on"); toggle.checked = false; await toggle.emit("change");
  await f.select(["ghoul"]);
  assert.equal(riderField(row(), "on").checked, false, "unticked by the GM, it stays off");
  await f.keydown("Enter", second);
  assert.equal(f.calls.length, 1, "and the attack registers without it");
  assert.deepEqual(f.calls[0].riders, []);
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
  assert.equal(f.$("pc-attack-subtitle").textContent, "Deflagrazione occulta · Trucchetto · Distanza");
  assert.match(textOf(f.$("pc-attack-damage")), /Forza 1d10/);
  assert.match(f.$("pc-attack-cantrip-note").textContent, /Raggi: 2 al livello del personaggio/);
  picker.value = "shocking-grasp"; await picker.emit("change");
  assert.equal(f.$("pc-attack-subtitle").textContent, "Stretta folgorante · Trucchetto · Mischia");
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
  assert.equal(f.$("pc-attack-subtitle").textContent, "Rintocco dei Morti · Trucchetto · TS Saggezza (CD 14)");
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
  assert.equal(activationField(menacing, "meta").textContent, "1d10", "not ticked: its die alone");
  assert.match(textOf(f.$("pc-attack-activations-caption")), /Attivazioni · Dadi di Superiorità 5\/5/, "the resource they share, once");
  assert.equal(activationField(menacing, "options").hidden, true, "options only once ticked");
  assert.equal(activationField(menacing, "amount").placeholder, "1d10", "the die as the amount's placeholder");
  const check = async (row) => { const box = activationField(row, "on"); box.checked = true; await box.emit("change"); };
  await check(distracting);
  await check(menacing);
  assert.equal(activationField(menacing, "meta").textContent.replace(/\u00a0/gu, " "), "1d10 · TS Saggezza CD 16", "ticked: its save too");
  assert.match(activationField(menacing, "meta").textContent, /TS\u00a0Saggezza\u00a0CD\u00a016/u, "a part never wraps inside");
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
  assert.equal(f.$("pc-attack-status").dataset.kind, "ok", "a registration reads as done");
  assert.equal(f.$("pc-attack-apply").textContent, "Registra", "and Registra is back once saved");
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
  assert.deepEqual(pickerOptions(f), ["holy-sword", "axe", "maneuver::grapple", "maneuver::shove"], "Lotta and Spinta after the weapons");
  assert.equal(f.$("pc-attack-picker-select").value, "holy-sword");
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Dardo di fuoco( · |$)/, "the title names the cantrip chosen");
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
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Ascia( · |$)/);
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
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Spada sacra( · |$)/);
  assert.equal(f.$("pc-attack-picker-select").value, "holy-sword", "the select goes back to the attack in use");
  assert.equal(f.controller.getDraft().outcome, "hit");
  answer = true;
  await pick(f, "axe");
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Ascia( · |$)/);
  assert.equal(f.controller.getDraft().outcome, "");
});

test("the attack spells tab and a single entry", async () => {
  const f = fixture({ actions: [sword, attackSpells] }); await f.controller.ready; await tick();
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(pickerTabs(f)[1].textContent, "Incantesimi");
  assert.equal(f.controller.getDraft().spellId, "guiding-bolt");
  assert.equal(f.$("pc-attack-picker-select").hidden, true, "one entry in the tab: no select");
  // A single weapon still shows the picker: Lotta and Spinta follow it in the Attacchi tab.
  const single = fixture({ actions: [sword] }); await single.controller.ready;
  assert.equal(single.$("pc-attack-picker").hidden, false);
  assert.deepEqual(pickerOptions(single), ["holy-sword", "maneuver::grapple", "maneuver::shove"]);
  assert.equal(single.$("pc-attack-picker-tabs").hidden, true, "a single tab shows no tabs");
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
// online(): whether the tracker answers now (a closed tracker answers nothing; open it with goOnline).
function launchBroadcast({ ack = true, result = { ok: true, mode: "review" }, online = () => true } = {}) {
  const listeners = new Set(), sent = [];
  return { sent, broadcast: {
    onMessage: (channel, listener) => { const entry = { channel, listener }; listeners.add(entry); return () => listeners.delete(entry); },
    sendMessage: async (channel, data) => {
      sent.push({ channel, data });
      if (data.type !== "launch" || !online()) return;
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
  assert.deepEqual(tabs, ["Attacchi", "Trucchetti", "Incantesimi", "Capacità"], "a cleric has its features too");
  await pickerTabs(f)[2].click(); await tick();
  assert.equal(f.$("pc-attack-attack-view").hidden, true);
  assert.equal(f.$("pc-attack-launch").hidden, false);
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Benedizione( · |$)/);
  assert.match(f.$("pc-attack-subtitle").textContent, /Incantesimo di 1° livello/);
  assert.match(textOf(f.$("pc-attack-launch")), /Concentrazione/);
  assert.equal(f.$("pc-attack-launch-button").textContent, "Lancia");
  assert.equal(f.$("pc-attack-launch-button").hidden, false, "Lancia waits in the fixed row");
  assert.equal(f.$("pc-attack-apply").hidden, true, "Registra gives way to it");
  const accordion = f.$("pc-attack-launch").querySelector("details");
  assert.equal(accordion.querySelector("summary").textContent, "Dettagli");
  assert.match(textOf(accordion), /Concentrazione/, "the tags sit in the accordion");
  assert.ok(accordion.querySelectorAll(".spell-text").length > 0, "with the text of the spell");
  accordion.open = true; await accordion.emit("toggle");
  assert.equal(textOf(f.$("pc-attack-caster")).trim(), "Concentrazione: Benedizione", "only the concentration in progress");
  const list = f.$("pc-attack-picker-list");
  assert.deepEqual(list.querySelectorAll(".picker-level").map((header) => header.dataset.slots), ["slot 1/4", "slot 2/2"], "the slots by level");
  assert.equal(list.hidden, false);
  assert.equal(f.$("pc-attack-picker-select").hidden, true, "the spells tab is a list, not a select");
  assert.deepEqual(list.querySelectorAll(".picker-level").map((header) => header.textContent), ["1° livello", "2° livello"], "the spells by level");
  const rows = list.querySelectorAll("button");
  assert.deepEqual(rows.map((row) => textOf(row).trim()), ["Benedizione Azione · Conc.", "Scudo della fede Azione bonus · Conc.", "Arma spirituale Azione bonus"],
    "the casting time at a glance");
  assert.equal(rows[0].getAttribute("aria-pressed"), "true");
  await rows[1].click(); await tick();
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Scudo della fede( · |$)/);
  assert.equal(list.querySelectorAll("button")[1].getAttribute("aria-pressed"), "true");
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
  await f.$("pc-attack-launch-button").click(); await tick(); await tick();
  const launch = ok.sent.find((message) => message.data.type === "launch");
  assert.equal(launch.channel, "com.thebigpicture.initiative/pc-attack-spell-launch");
  assert.deepEqual([launch.data.sourceId, launch.data.actionId], ["aria", "book:bless"]);
  assert.equal(f.$("pc-attack-status").textContent, "Benedizione: pannello incantesimi aperto.");
  // The tracker closed: the console opens it and asks again while it loads.
  let open = false, opened = 0;
  const closed = launchBroadcast({ online: () => open });
  const g = fixture({ card: clericCard, attacker: clericMeta, broadcast: closed.broadcast,
    openTracker: async () => { opened += 1; setTimeout(() => { open = true; }, 60); } });
  await g.controller.ready; await tick();
  await pickerTabs(g)[2].click(); await tick();
  await g.$("pc-attack-launch-button").click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(opened, 1, "the tracker opened once");
  assert.equal(g.$("pc-attack-status").textContent, "Benedizione: pannello incantesimi aperto.");
  assert.equal(closed.sent.filter((message) => message.data.type === "launch").length >= 2, true, "asked again once open");
  // A tracker that cannot open: the 🪄 menu, by hand.
  const dead = launchBroadcast({ online: () => false });
  const h = fixture({ card: clericCard, attacker: clericMeta, broadcast: dead.broadcast, openTracker: async () => { throw new Error("no"); } });
  await h.controller.ready; await tick();
  await pickerTabs(h)[2].click(); await tick();
  await h.$("pc-attack-launch-button").click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.match(h.$("pc-attack-status").textContent, /Il tracker non risponde: lancia Benedizione dal suo menu 🪄\./);
});

test("an actor with spells and no attack opens on its spells", async () => {
  const card = { characterBuild: [{ classId: "chierico", level: 1 }], quickActions: [], spellbook: { spellIds: ["light", "bless"] } };
  const f = fixture({ card, attacker: { initiativeCard: card }, actionId: "" }); await f.controller.ready; await tick();
  assert.equal(f.controller.getDraft(), null);
  assert.equal(f.$("pc-attack-form").hidden, false);
  assert.equal(f.$("pc-attack-attack-view").hidden, true);
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Luce( · |$)/);
});

test("a blade cantrip points to the weapon attack", async () => {
  const card = { quickActions: [sword], spellbook: { spellIds: ["tasha-lama-roboante", "light"] } };
  const f = fixture({ card, attacker: { initiativeCard: card } }); await f.controller.ready; await tick();
  await pickerTabs(f)[1].click(); await tick();
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Lama Roboante( · |$)/);
  assert.match(textOf(f.$("pc-attack-launch")), /Si lancia con un attacco con arma da mischia/);
  assert.equal(f.$("pc-attack-launch-button").hidden, true, "no Lancia for a blade cantrip");
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
  assert.equal(f.$("pc-attack-title").textContent, "Imp", "the title names the new actor");
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

// A 3rd level barbarian, 2 rages left of 3: its features fill the Capacità tab (Rage first, the usable ones first).
const barbarianCard = { characterBuild: [{ classId: "barbaro", level: 3 }], quickActions: [sword, { id: "rage", label: "Ira", kind: "feature", featureId: "barbaro-ira" }] };
const rageStatus = (active = false) => ({ enabledIds: ["barbaro-ira"], activeFeatureIds: active ? ["barbaro-ira"] : [],
  active: active ? { "barbaro-ira": [{ instanceId: "rage-1", remainingRounds: 9 }] } : {},
  resources: { "barbaro-ira": [{ poolId: "barbaro-ira-usi", name: "Ire", current: 2, maximum: 3, unlimited: false }] } });
// The runtime the console calls for a feature, as the character sheet does (classFeatureRuntime.js).
function fakeFeatureRuntime() {
  const calls = [];
  const record = (fn) => async (...args) => { calls.push([fn, ...args]); return {}; };
  return { calls, runtime: { activateClassFeature: record("activateClassFeature"), deactivateClassFeature: record("deactivateClassFeature"),
    applyLayOnHands: record("applyLayOnHands"), purifyClassFeatureSpell: record("purifyClassFeatureSpell"),
    adjustClassFeatureResource: record("adjustClassFeatureResource"), createClassFeatureSpellSlot: record("createClassFeatureSpellSlot"),
    convertClassFeatureSpellSlot: record("convertClassFeatureSpellSlot"), applySorcerousRestoration: record("applySorcerousRestoration") } };
}

test("the Capacità tab lists the features by group with their activation and uses; Attiva runs the feature in the console", async () => {
  const runtime = fakeFeatureRuntime();
  const f = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, featureState: rageStatus(), featureRuntime: runtime.runtime });
  await f.controller.ready; await tick();
  assert.deepEqual(pickerTabs(f).map((button) => button.textContent), ["Attacchi", "Capacità"]);
  await pickerTabs(f)[1].click(); await tick();
  const list = f.$("pc-attack-picker-list");
  assert.equal(list.hidden, false, "the features tab is a list");
  assert.deepEqual(list.querySelectorAll(".picker-level").map((header) => header.textContent), ["Utilizzabili", "Altre capacità"]);
  assert.match(textOf(list.querySelectorAll("button")[0]), /Ira.*Azione bonus · 2\/3/);
  assert.equal(f.$("pc-attack-title").textContent, "Aria");
  assert.match(f.$("pc-attack-subtitle").textContent, /^Ira · /, "the feature without the catalog's emoji");
  assert.match(f.$("pc-attack-subtitle").textContent, /Capacità di classe/);
  assert.match(textOf(f.$("pc-attack-launch")), /Azione bonus.*su di sé/);
  assert.match(textOf(f.$("pc-attack-total")), /Ire 2\/3/, "the uses left beside the button");
  assert.ok(f.$("pc-attack-launch").querySelector("details"), "its text in the accordion");
  assert.equal(f.$("pc-attack-launch-button").textContent, "Attiva");
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls, [["activateClassFeature", { sourceId: "aria", featureId: "barbaro-ira" }]], "the sheet's call, never through the tracker");
  assert.match(f.$("pc-attack-status").textContent, /Capacità attivata: Ira\./);
});

test("opened without an entry asked, the console goes back to the entry last used with the actor", async () => {
  const stored = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, String(value)); } } });
  try {
    const runtime = fakeFeatureRuntime();
    const f = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, featureState: rageStatus(), featureRuntime: runtime.runtime, actionId: "" });
    await f.controller.ready; await tick();
    assert.match(f.$("pc-attack-subtitle").textContent, /^Spada sacra/, "nothing used yet: the first attack");
    await pickerTabs(f)[1].click(); await tick();
    assert.equal(stored.size, 0, "choosing an entry is not using it");
    await f.$("pc-attack-launch-button").click(); await tick();
    assert.deepEqual([...stored.values()], ["feature::barbaro-ira"]);

    const again = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, featureState: rageStatus(), featureRuntime: runtime.runtime, actionId: "" });
    await again.controller.ready; await tick();
    assert.match(again.$("pc-attack-subtitle").textContent, /^Ira · /, "the card's 🗡️ reopens on Rage");
    const asked = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, featureState: rageStatus(), featureRuntime: runtime.runtime, actionId: "holy-sword" });
    await asked.controller.ready; await tick();
    assert.match(asked.$("pc-attack-subtitle").textContent, /^Spada sacra/, "an entry asked wins over the remembered one");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage;
  }
});

test("an active feature offers Termina; a passive one is only read", async () => {
  const runtime = fakeFeatureRuntime();
  const f = fixture({ card: barbarianCard, attacker: { initiativeCard: barbarianCard }, featureState: rageStatus(true), featureRuntime: runtime.runtime });
  await f.controller.ready; await tick();
  await pickerTabs(f)[1].click(); await tick();
  assert.match(textOf(f.$("pc-attack-launch")), /Attiva · 9 r/);
  assert.equal(f.$("pc-attack-launch-button").textContent, "Termina");
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls, [["deactivateClassFeature", "aria", "rage-1"]]);
  assert.match(f.$("pc-attack-status").textContent, /Capacità terminata: Ira\./);
  await f.$("pc-attack-picker-list").querySelectorAll("button")[2].click(); await tick();
  assert.match(f.$("pc-attack-subtitle").textContent, /Difesa Senza Armatura/);
  assert.match(textOf(f.$("pc-attack-launch")), /Passiva/);
  assert.equal(f.$("pc-attack-launch-button").hidden, true, "a passive feature has no button");
});

// A 20th level paladin of Devotion: its auras toggle, Lay on Hands asks its points, Purifying Touch the spell to end.
const paladinCard = { characterBuild: [{ classId: "paladino", level: 20, subclassId: "paladino-giuramento-di-devozione" }], abilityModifiers: { cha: 4 },
  quickActions: [sword] };
const paladinState = (active = {}) => ({ enabledIds: [], activeFeatureIds: Object.keys(active), active,
  resources: { "paladino-imposizione-delle-mani": [{ poolId: "paladino-imposizione-mani-punti", name: "Riserva", current: 100, maximum: 100, unlimited: false }] } });
const featureRow = (f, pattern) => f.$("pc-attack-picker-list").querySelectorAll("button").find((row) => pattern.test(textOf(row)));
async function openFeatures(f) { await pickerTabs(f).find((button) => button.textContent === "Capacità").click(); await tick(); }

test("a paladin's aura is usable and toggles: Attiva with its radius, then Disattiva", async () => {
  const runtime = fakeFeatureRuntime();
  const off = fixture({ card: paladinCard, attacker: { initiativeCard: paladinCard }, featureState: paladinState(), featureRuntime: runtime.runtime });
  await off.controller.ready; await tick(); await openFeatures(off);
  await featureRow(off, /Aura di Protezione/).click(); await tick();
  assert.match(textOf(off.$("pc-attack-launch")), /aura 9 m/);
  assert.equal(off.$("pc-attack-launch-button").textContent, "Attiva");
  await off.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls.at(-1), ["activateClassFeature", { sourceId: "aria", featureId: "paladino-aura-di-protezione" }]);
  const on = fixture({ card: paladinCard, attacker: { initiativeCard: paladinCard }, featureRuntime: runtime.runtime,
    featureState: paladinState({ "paladino-aura-di-protezione": [{ instanceId: "aura-1", remainingRounds: null }] }) });
  await on.controller.ready; await tick(); await openFeatures(on);
  await featureRow(on, /Aura di Protezione/).click(); await tick();
  assert.equal(on.$("pc-attack-launch-button").textContent, "Disattiva");
  await on.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls.at(-1), ["deactivateClassFeature", "aria", "aura-1"]);
  assert.match(on.$("pc-attack-status").textContent, /Capacità disattivata: Aura di Protezione\./);
});

test("Lay on Hands takes its points in the card and heals the creature selected; Purifying Touch ends the target's spell", async () => {
  const runtime = fakeFeatureRuntime();
  const f = fixture({ card: paladinCard, attacker: { initiativeCard: paladinCard }, featureState: paladinState(), featureRuntime: runtime.runtime });
  await f.controller.ready; await tick();
  f.items[1].metadata[META]["com.thebigpicture.initiative/spells"] = [{ instanceId: "hold-1", name: "Blocca persone" }];
  await f.select(["ghoul"]);
  await openFeatures(f);
  await featureRow(f, /Imposizione delle Mani/).click(); await tick();
  const inputs = f.$("pc-attack-launch").querySelectorAll("input");
  assert.equal(inputs.length, 1, "the points");
  assert.equal(inputs[0].max, "100");
  inputs[0].value = "7"; await inputs[0].emit("input");
  assert.equal(f.$("pc-attack-launch-button").textContent, "Usa");
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls.at(-1), ["applyLayOnHands",
    { sourceId: "aria", featureId: "paladino-imposizione-delle-mani", targetIds: ["ghoul"], mode: "heal", value: "7" }]);
  await featureRow(f, /Tocco Purificatore/).click(); await tick();
  assert.match(textOf(f.$("pc-attack-launch")), /Bersaglio: Ghoul/);
  assert.match(textOf(f.$("pc-attack-launch")), /Blocca persone/);
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls.at(-1), ["purifyClassFeatureSpell",
    { sourceId: "aria", featureId: "paladino-tocco-purificatore", targetIds: ["ghoul"], spellInstanceId: "hold-1", spellName: "Blocca persone" }]);
});

test("the keyboard: the focus goes to the damage to type, Enter registers when ready, Esc asks before dropping the attack", async () => {
  const asked = [];
  const f = fixture({ confirm: (message) => { asked.push(message); return false; } }); await f.controller.ready; await tick();
  await f.select(["ghoul"]);
  await f.outcome("hit").click(); await tick();
  const [first, second] = f.inputs();
  assert.equal(f.documentRef.activeElement, first, "Colpito: the first damage field");
  assert.deepEqual([first.placeholder, second.placeholder], ["1d8+3", "2d8"], "the formula as placeholder");
  first.value = "9"; await first.emit("input");
  await f.keydown("Enter");
  assert.equal(f.calls.length, 0, "not ready: Enter does nothing");
  second.focus(); second.value = "4"; await second.emit("input");
  await f.keydown("Escape");
  assert.match(asked.at(-1) || "", /Chiudere la console\? Le scelte non registrate andranno perse\./);
  assert.deepEqual(f.closed, [], "the GM kept the attack");
  await f.keydown("Enter");
  assert.equal(f.calls.length, 1, "ready: Enter registers");
  assert.deepEqual(f.calls[0].componentAmounts, { c1: 9, c2: 4 });
  await f.keydown("Escape");
  assert.equal(asked.length, 1, "a fresh attack closes without asking");
  assert.equal(f.closed.length, 1);
});

test("the lists: the favourites first, a search in long lists, the features to read folded", async () => {
  const f = fixture({ card: clericCard, attacker: clericMeta }); await f.controller.ready; await tick();
  await pickerTabs(f).find((button) => button.textContent === "Trucchetti").click(); await tick();
  assert.deepEqual(f.$("pc-attack-picker-select").children.map((option) => option.textContent), ["Fiamma sacra ⚔ · Azione", "Luce · Azione"],
    "the cantrips in the select (the dropdown's fallback), their cost capitalised");
  const book = Array.from({ length: 14 }, (_, index) => ["bless", "shield-of-faith", "cure-wounds", "command", "sanctuary", "guiding-bolt", "healing-word",
    "inflict-wounds", "detection-of-evil-and-good", "create-or-destroy-water", "purify-food-and-drink", "aid", "lesser-restoration", "spiritual-weapon"][index]);
  const longCard = { ...clericCard, spellbook: { spellIds: book, pinnedIds: ["aid"] } };
  const g = fixture({ card: longCard, attacker: { ...clericMeta, initiativeCard: longCard } }); await g.controller.ready; await tick();
  await pickerTabs(g).find((button) => button.textContent === "Incantesimi").click(); await tick();
  const list = g.$("pc-attack-picker-list");
  assert.equal(list.querySelectorAll(".picker-level")[0].textContent, "★ Preferiti", "the favourites first");
  assert.match(textOf(list.querySelectorAll("button")[0]), /^ ?Aiuto .*2°/, "a favourite names its level");
  const search = g.$("pc-attack-picker-search");
  assert.equal(search.hidden, false, "more than twelve: a search");
  search.value = "cura"; await search.emit("input");
  assert.deepEqual(list.querySelectorAll("button").filter((row) => !row.hidden).map((row) => row.dataset.name), ["Cura ferite"]);
  search.value = ""; await search.emit("input");
  assert.ok(list.querySelectorAll("button").every((row) => !row.hidden), "cleared: every spell again");
  await openFeatures(f);
  const other = f.$("pc-attack-picker-list").querySelectorAll(".picker-level").find((header) => header.dataset.group === "other");
  const others = () => f.$("pc-attack-picker-list").querySelectorAll("button").filter((row) => row.dataset.group === "other");
  assert.ok(others().length > 0 && others().every((row) => row.hidden), "the features to read are folded");
  assert.equal(other.dataset.count, String(others().length));
  await other.click(); await tick();
  assert.ok(others().every((row) => !row.hidden), "open on a click");
});

test("the attacks' and cantrips' dropdown: each entry with its cost on the right; Esc closes the menu, not the console", async () => {
  const f = fixture({ card: clericCard, attacker: clericMeta }); await f.controller.ready; await tick();
  await pickerTabs(f).find((button) => button.textContent === "Trucchetti").click(); await tick();
  const button = f.$("pc-attack-picker-dropdown-button"), menu = f.$("pc-attack-picker-menu");
  assert.equal(f.$("pc-attack-picker-dropdown").hidden, false);
  assert.equal(f.$("pc-attack-picker-select").hidden, true, "the select stays behind it");
  assert.match(textOf(button), /Fiamma sacra .*Azione/);
  await button.click(); await tick();
  assert.equal(menu.hidden, false);
  const rows = menu.querySelectorAll("button");
  assert.deepEqual(rows.map((row) => textOf(row).trim()), ["Fiamma sacra Azione · ⚔", "Luce Azione"], "the cost first on the right, coloured");
  assert.equal(rows[0].querySelector("[data-cost]").dataset.cost, "action");
  await f.keydown("Escape", rows[0]);
  assert.equal(menu.hidden, true, "Esc closes the menu");
  assert.deepEqual(f.closed, [], "and not the console");
  await button.click(); await tick();
  await menu.querySelectorAll("button")[1].click(); await tick();
  assert.equal(menu.hidden, true);
  assert.match(f.$("pc-attack-subtitle").textContent, /^Luce/, "the entry chosen");
});

test("Riduci folds the console to its header and back; a creature selected offers its off-turn action by name", async () => {
  const metas = { imp: { initiativeCard: { quickActions: [sword] } } };
  const f = fixture({ metas }); await f.controller.ready; await tick();
  const minimize = f.$("pc-attack-minimize");
  assert.deepEqual([minimize.textContent, minimize.getAttribute("aria-expanded")], ["−", "true"]);
  await minimize.click(); await tick();
  assert.equal(f.documentRef.body.getAttribute("data-minimized"), "true");
  assert.deepEqual([minimize.textContent, minimize.getAttribute("aria-expanded")], ["+", "false"]);
  await minimize.click(); await tick();
  assert.equal(f.documentRef.body.getAttribute("data-minimized"), "false");
  await f.select(["imp"]);
  assert.equal(f.$("pc-attack-use-selected-row").hidden, false);
  assert.equal(f.$("pc-attack-use-selected").textContent, "⇄ Agisci con Imp");
  await f.select([]);
  assert.equal(f.$("pc-attack-use-selected-row").hidden, true);
});

test("the title names who acts, its badge whose turn it is", async () => {
  const own = fixture({ turnState: { round: 1, order: ["aria", "ghoul"], current: 0 } }); await own.controller.ready; await tick();
  assert.equal(own.$("pc-attack-title").textContent, "Aria");
  assert.deepEqual([own.$("pc-attack-turn").hidden, own.$("pc-attack-turn").textContent, own.$("pc-attack-turn").dataset.turn], [false, "Turno", "own"]);
  const off = fixture({ turnState: { round: 1, order: ["aria", "ghoul"], current: 1 } }); await off.controller.ready; await tick();
  assert.deepEqual([off.$("pc-attack-turn").textContent, off.$("pc-attack-turn").dataset.turn], ["Fuori turno", "off"]);
  const out = fixture({}); await out.controller.ready; await tick();
  assert.equal(out.$("pc-attack-turn").hidden, true, "no badge out of combat");
});

test("a feature on the map selection says who it reaches; a spent one fades and says why beside its button", async () => {
  const runtime = fakeFeatureRuntime();
  const f = fixture({ card: paladinCard, attacker: { initiativeCard: paladinCard }, featureState: paladinState(), featureRuntime: runtime.runtime });
  await f.controller.ready; await tick(); await openFeatures(f);
  await featureRow(f, /Imposizione delle Mani/).click(); await tick();
  const target = () => textOf(f.$("pc-attack-launch").querySelector("[data-feature-target]")).trim();
  assert.equal(target(), "Su Nessuna selezione: su Aria", "the runtime falls back on the actor");
  await f.select(["ghoul"]);
  assert.equal(target(), "Su Ghoul · 30/30 PF", "the selection, followed in place");
  assert.match(textOf(f.$("pc-attack-total")), /Riserva 100\/100/, "the uses left beside the button, once");
  assert.doesNotMatch(textOf(f.$("pc-attack-launch")), /Riserva/);
  const spentState = { ...paladinState(), resources: { "paladino-imposizione-delle-mani": [{ poolId: "paladino-imposizione-mani-punti", name: "Riserva", current: 0, maximum: 100, unlimited: false }] } };
  const spent = fixture({ card: paladinCard, attacker: { initiativeCard: paladinCard }, featureState: spentState, featureRuntime: runtime.runtime });
  await spent.controller.ready; await tick(); await openFeatures(spent);
  const row = featureRow(spent, /Imposizione delle Mani/);
  assert.equal(row.dataset.exhausted, "true", "the row fades");
  assert.equal(row.querySelector(".uses-badge").dataset.zero, "true", "its uses in red");
  await row.click(); await tick();
  assert.equal(spent.$("pc-attack-launch-button").disabled, true);
  assert.match(textOf(spent.$("pc-attack-total")), /Nessun punto rimasto/);
  assert.equal(spent.$("pc-attack-total").dataset.kind, "warning");
  assert.ok(spent.$("pc-attack-launch").querySelectorAll("input").every((input) => input.disabled), "and its fields are off");
});

test("Wild Magic Surge opens its d100 engine beside the console", async () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 1, subclassId: "stregone-magia-selvaggia" }], quickActions: [sword] };
  const runtime = fakeFeatureRuntime();
  const f = fixture({ card: sorcerer, attacker: { initiativeCard: sorcerer }, featureState: { enabledIds: [], active: {}, activeFeatureIds: [], resources: {} }, featureRuntime: runtime.runtime });
  await f.controller.ready; await tick(); await openFeatures(f);
  await featureRow(f, /Impulso di Magia Selvaggia/).click(); await tick();
  assert.equal(f.$("pc-attack-launch-button").textContent, "Tira l'Impulso");
  const before = sheetOpened.length;
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.equal(sheetOpened.length, before + 1);
  assert.match(sheetOpened.at(-1).url, /^\/wild-magic-surge\.html\?source=aria$/);
  assert.deepEqual(runtime.calls, [], "the popup runs it");
});

test("the details accordion: its open state follows the GM from spell to spell; an attack cantrip has it in the form", async () => {
  const f = fixture({ card: clericCard, attacker: clericMeta }); await f.controller.ready; await tick();
  await pickerTabs(f)[2].click(); await tick();
  const first = f.$("pc-attack-launch").querySelector("details");
  assert.equal(first.open, false, "closed at first");
  first.open = true; await first.emit("toggle");
  await f.$("pc-attack-picker-list").querySelectorAll("button")[1].click(); await tick();
  assert.equal(f.$("pc-attack-launch").querySelector("details").open, true, "open stays open on another spell");
  await pickerTabs(f)[1].click(); await tick();
  const cantrip = f.controller.getDraft().spellId;
  assert.equal(cantrip, "sacred-flame");
  assert.equal(f.$("pc-attack-spell-details").hidden, false, "the attack form shows the cantrip's details");
  assert.equal(f.$("pc-attack-spell-details").open, true);
  assert.ok(f.$("pc-attack-spell-details-body").querySelectorAll(".spell-text").length > 0);
  assert.equal(f.$("pc-attack-launch-button").hidden, true, "the form keeps Registra");
  await pickerTabs(f)[0].click(); await tick();
  assert.equal(f.$("pc-attack-spell-details").hidden, true, "a weapon attack has no spell details");
});

// A spell action of the card's own (a species trait with 1 use, spent), and a condition action.
const gazeAction = { id: "gaze", label: "Sguardo penetrante", kind: "spell", spellId: "detect-magic", cost: "uses", uses: 1 };
const blessedAction = { id: "blessed", label: "Benedetto", kind: "condition", conditionName: "Benedetto", targetMode: "self", expiryMode: "rounds", duration: 10 };
const ownCard = { quickActions: [gazeAction, blessedAction] };

test("the ⚡ quick actions stay out of the console: a card of quick actions only shows no Capacità tab", async () => {
  const f = fixture({ card: ownCard, attacker: { initiativeCard: { quickActions: ownCard.quickActions } }, actionId: "" }); await f.controller.ready; await tick();
  // Only what every creature can do: Lotta and Spinta, no Capacità tab, no quick action.
  assert.deepEqual(pickerOptions(f), ["maneuver::grapple", "maneuver::shove"]);
  assert.equal(f.$("pc-attack-picker-tabs").hidden, true);
  assert.equal(f.$("pc-attack-maneuver").hidden, false);
});

// Off-turn actions: the console on another actor than the turn's (a reaction, an opportunity attack).
const armed = { initiativeCard: { quickActions: [sword] } };

test("off turn, the bar offers the way back to the turn's actor; on its actor, no bar", async () => {
  const f = fixture({ turnState: { order: ["ghoul", "aria", "imp"], current: 0, round: 2 }, metas: { ghoul: armed } });
  await f.controller.ready; await tick();
  const bar = f.$("pc-attack-follow");
  assert.equal(bar.hidden, false);
  assert.match(textOf(bar), /Fuori turno: è il turno di Ghoul\./);
  const back = bar.querySelector("button");
  assert.equal(back.textContent, "Torna a Ghoul");
  await back.click(); await tick(); await tick();
  assert.equal(f.sources.at(-1), "ghoul");
  assert.equal(f.$("pc-attack-status").textContent, "Turno di Ghoul.");
  assert.equal(bar.hidden, true, "back on the turn's actor");
  const unarmed = fixture({ turnState: { order: ["ghoul", "aria"], current: 0, round: 2 } });
  await unarmed.controller.ready; await tick();
  assert.equal(unarmed.$("pc-attack-follow").hidden, true, "a turn's actor with nothing to show offers no way back");
  const own = fixture({ turnState: { order: ["aria", "ghoul"], current: 0, round: 2 }, metas: { ghoul: armed } });
  await own.controller.ready; await tick();
  assert.equal(own.$("pc-attack-follow").hidden, true, "on its own turn");
});

test("⇄ moves the console to the creature selected on the map, after a confirmation when an attack holds decisions", async () => {
  let answer = false;
  const f = fixture({ metas: { imp: armed }, confirm: () => answer });
  await f.controller.ready; await tick();
  const swap = f.$("pc-attack-use-selected");
  assert.equal(swap.hidden, true, "nothing selected");
  await f.select(["ghoul"]);
  assert.equal(swap.hidden, true, "a creature with nothing to show");
  await f.select(["imp"]);
  assert.equal(swap.hidden, false);
  assert.match(swap.title, /Passa a Imp/);
  await f.outcome("hit").click();
  await swap.click(); await tick();
  assert.equal(f.sources.includes("imp"), false, "the GM declined: the attack stays");
  answer = true;
  await swap.click(); await tick(); await tick();
  assert.equal(f.sources.at(-1), "imp");
  assert.equal(f.$("pc-attack-status").textContent, "Fuori turno: Imp.");
});

test("an attack registered while a turn change waits: the bar offers the move in evidence", async () => {
  const bus = followBroadcast();
  const f = fixture({ broadcast: bus.broadcast }); await f.controller.ready;
  await f.select(["ghoul"]);
  await f.outcome("hit").click();
  await bus.follow("imp", "Imp");
  const bar = f.$("pc-attack-follow");
  assert.equal(bar.querySelector("button").className, "small");
  await typeAmounts(f, ["8", "9"]);
  await f.$("pc-attack-apply").click(); await tick();
  assert.match(textOf(bar), /Registrato\. È il turno di Imp\./);
  assert.equal(bar.querySelector("button").className, "apply primary follow-ready");
  assert.equal(bar.dataset.kind, "ready");
  assert.equal(f.sources.includes("imp"), false, "another attack can still be made: the move waits for the GM");
});

test("Spendi: a bard's Psychic Blades spends one Bardic Inspiration by hand", async () => {
  const bard = { characterBuild: [{ classId: "bardo", level: 3, subclassId: "bardo-collegio-dei-sussurri" }], abilityModifiers: { cha: 3 }, quickActions: [sword] };
  const runtime = fakeFeatureRuntime();
  const state = { enabledIds: [], active: {}, activeFeatureIds: [],
    resources: { "bardo-collegio-dei-sussurri-lame-psichiche": [{ poolId: "bardo-ispirazione-bardica-usi", name: "Ispirazione Bardica", current: 3, maximum: 3, unlimited: false }] } };
  const f = fixture({ card: bard, attacker: { initiativeCard: bard }, featureState: state, featureRuntime: runtime.runtime });
  await f.controller.ready; await tick(); await openFeatures(f);
  const groups = f.$("pc-attack-picker-list").querySelectorAll(".picker-level").map((header) => header.textContent);
  assert.equal(groups[0], "Utilizzabili");
  await featureRow(f, /Lame Psichiche/).click(); await tick();
  assert.equal(f.$("pc-attack-launch-button").textContent, "Spendi 1");
  assert.match(textOf(f.$("pc-attack-launch")), /Effetto da risolvere al tavolo/);
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls, [["adjustClassFeatureResource", "aria", "bardo-ispirazione-bardica-usi", { delta: -1 }, { featureId: "bardo-collegio-dei-sussurri-lame-psichiche" }]]);
  assert.match(f.$("pc-attack-status").textContent, /Risorsa spesa: Ispirazione Bardica −1 \(Lame Psichiche\)\./);
});

test("Font of Magic creates a slot from the console; Universal Speech shows the slot confirmation only for a slot", async () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 5 }], quickActions: [sword] };
  const runtime = fakeFeatureRuntime();
  const f = fixture({ card: sorcerer, attacker: { initiativeCard: sorcerer }, featureState: { enabledIds: [], active: {}, activeFeatureIds: [], resources: {} }, featureRuntime: runtime.runtime });
  await f.controller.ready; await tick(); await openFeatures(f);
  await featureRow(f, /Fonte di Magia/).click(); await tick();
  const operation = f.$("pc-attack-launch").querySelector("select");
  operation.value = "create:2"; await operation.emit("change");
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(runtime.calls.at(-1), ["createClassFeatureSpellSlot", { sourceId: "aria", featureId: "stregone-fonte-di-magia", slotLevel: 2 }]);
  assert.equal(f.$("pc-attack-status").textContent, "Slot di 2° creato.");
  const bard = { characterBuild: [{ classId: "bardo", level: 6, subclassId: "bardo-collegio-dell-eloquenza" }], abilityModifiers: { cha: 3 }, quickActions: [sword] };
  const g = fixture({ card: bard, attacker: { initiativeCard: bard }, featureState: { enabledIds: [], active: {}, activeFeatureIds: [], resources: {} }, featureRuntime: runtime.runtime });
  await g.controller.ready; await tick(); await openFeatures(g);
  await featureRow(g, /Linguaggio Universale/).click(); await tick();
  const confirmation = g.$("pc-attack-launch").querySelectorAll(".feature-check")[0];
  assert.equal(confirmation.hidden, true, "the free use: no confirmation");
  const mode = g.$("pc-attack-launch").querySelector("select");
  mode.value = "slot"; await mode.emit("change");
  assert.equal(confirmation.hidden, false);
});

test("a feature used with a reaction: the console warns when it is already used, asks before Usa, and says when it marks it", async () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 6, subclassId: "stregone-magia-selvaggia" }], abilityModifiers: { cha: 4 }, quickActions: [sword] };
  const points = { enabledIds: [], active: {}, activeFeatureIds: [],
    resources: { "stregone-magia-selvaggia-piegare-la-fortuna": [{ poolId: "stregone-punti-stregoneria", name: "Punti Stregoneria", current: 6, maximum: 6, unlimited: false }] } };
  const asked = [];
  const answers = [false, true];
  const calls = [];
  const featureRuntime = { activateClassFeature: async (params) => { calls.push(params); return { reaction: { spent: false, alreadyUsed: true } }; } };
  const f = fixture({ card: sorcerer, featureState: points, featureRuntime, turnState: { order: ["aria", "ghoul"], current: 1, round: 2 },
    attacker: { initiativeCard: sorcerer, conditions: { version: 2, instances: [{ id: "r1", condition: "Reazione usata" }] } },
    confirm: (message) => { asked.push(message); return answers.shift(); } });
  await f.controller.ready; await tick(); await openFeatures(f);
  await featureRow(f, /Piegare la Fortuna/).click(); await tick();
  assert.match(textOf(f.$("pc-attack-launch")), /Reazione.*Reazione già usata in questo round\./);
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.match(asked[0], /Aria ha già usato la reazione in questo round\.[\s\S]*Usare comunque Piegare la Fortuna\?/);
  assert.deepEqual(calls, [], "declined: nothing spent");
  assert.match(f.$("pc-attack-status").textContent, /annullata, reazione già usata/);
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.equal(calls.length, 1, "confirmed: the feature runs, the reaction stays marked once");
  assert.doesNotMatch(f.$("pc-attack-status").textContent, /Reazione segnata/);
});

test("a feature used with a reaction, the reaction free: Usa runs at once and the status says it is marked", async () => {
  const sorcerer = { characterBuild: [{ classId: "stregone", level: 6, subclassId: "stregone-magia-selvaggia" }], abilityModifiers: { cha: 4 }, quickActions: [sword] };
  const points = { enabledIds: [], active: {}, activeFeatureIds: [],
    resources: { "stregone-magia-selvaggia-piegare-la-fortuna": [{ poolId: "stregone-punti-stregoneria", name: "Punti Stregoneria", current: 6, maximum: 6, unlimited: false }] } };
  const asked = [];
  const featureRuntime = { activateClassFeature: async () => ({ reaction: { spent: true, alreadyUsed: false } }) };
  const f = fixture({ card: sorcerer, featureState: points, featureRuntime, turnState: { order: ["aria", "ghoul"], current: 1, round: 2 },
    attacker: { initiativeCard: sorcerer }, confirm: (message) => { asked.push(message); return true; } });
  await f.controller.ready; await tick(); await openFeatures(f);
  await featureRow(f, /Piegare la Fortuna/).click(); await tick();
  assert.doesNotMatch(textOf(f.$("pc-attack-launch")), /già usata/);
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(asked, []);
  assert.match(f.$("pc-attack-status").textContent, /Capacità usata: Piegare la Fortuna\. Reazione segnata\./);
});

test("off turn the attack offers the reaction, on by default: Registra sends it; unticked, it does not; on its own turn, nothing", async () => {
  const f = fixture({ turnState: { order: ["aria", "ghoul"], current: 1, round: 2 } });
  await f.controller.ready; await tick();
  const row = f.$("pc-attack-reaction");
  assert.equal(row.hidden, false);
  assert.match(textOf(row), /Usa la reazione \(attacco di opportunità\)/);
  assert.equal(row.querySelector("input").checked, true);
  await f.select(["ghoul"]); await f.outcome("miss").click();
  await f.$("pc-attack-apply").click(); await tick();
  assert.equal(f.calls.at(-1).useReaction, true);
  const box = f.$("pc-attack-reaction").querySelector("input");
  box.checked = false; await box.emit("change"); await tick();
  await f.outcome("miss").click();
  await f.$("pc-attack-apply").click(); await tick();
  assert.equal(f.calls.at(-1).useReaction, undefined);
  const own = fixture({ turnState: { order: ["aria", "ghoul"], current: 0, round: 2 } });
  await own.controller.ready; await tick();
  assert.equal(own.$("pc-attack-reaction").hidden, true);
});

test("off turn with the reaction already used: a warning instead of the checkbox, and the attack asks for nothing", async () => {
  const f = fixture({ turnState: { order: ["aria", "ghoul"], current: 1, round: 2 },
    attacker: { conditions: { version: 2, instances: [{ id: "r1", condition: "Reazione usata" }] } } });
  await f.controller.ready; await tick();
  assert.match(textOf(f.$("pc-attack-reaction")), /Reazione già usata in questo round: l'attacco non la segna\./);
  assert.equal(f.$("pc-attack-reaction").querySelector("input"), null);
  await f.select(["ghoul"]); await f.outcome("miss").click();
  await f.$("pc-attack-apply").click(); await tick();
  assert.equal(f.calls.at(-1).useReaction, undefined);
});

test("Usa reazione on Uncanny Dodge marks the reaction; out of combat or with the reaction used the button waits", async () => {
  const rogue = { characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { dex: 4 }, quickActions: [sword] };
  const state = { enabledIds: [], active: {}, activeFeatureIds: [], resources: {} };
  const calls = [];
  const featureRuntime = { useClassFeatureReaction: async (params) => { calls.push(params); return { reaction: { spent: true, alreadyUsed: false } }; } };
  const f = fixture({ card: rogue, featureState: state, featureRuntime, attacker: { initiativeCard: rogue }, turnState: { order: ["aria", "ghoul"], current: 1, round: 2 } });
  await f.controller.ready; await tick(); await openFeatures(f);
  await featureRow(f, /Schivata Prodigiosa/).click(); await tick();
  assert.equal(f.$("pc-attack-launch-button").textContent, "Usa reazione");
  assert.match(textOf(f.$("pc-attack-launch")), /segna solo la reazione/);
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual(calls, [{ sourceId: "aria", featureId: "ladro-schivata-prodigiosa" }]);
  assert.equal(f.$("pc-attack-status").textContent, "Reazione segnata: Schivata Prodigiosa.");
  const out = fixture({ card: rogue, featureState: state, featureRuntime, attacker: { initiativeCard: rogue } });
  await out.controller.ready; await tick(); await openFeatures(out);
  await featureRow(out, /Schivata Prodigiosa/).click(); await tick();
  assert.match(textOf(out.$("pc-attack-total")), /Fuori dal combattimento/, "why the button is off, beside it");
  assert.equal(out.$("pc-attack-total").dataset.kind, "warning");
  assert.equal(out.$("pc-attack-launch-button").disabled, true);
});

// Grapple and Shove (pcAttackManeuverCore.js): the contest's card in the Attacchi tab, the grapples in progress above it.
const grabbed = (sourceId, id = "grab") => ({ conditions: { version: 2, instances: [{ id, condition: "Afferrato", sourceId, active: true, expiry: { mode: "manual" } }] } });
const maneuverButton = (f, box, key, value) => f.$(box).querySelector(`[data-${key}="${value}"]`);

test("Lotta: the target from the map, the contest's outcome, Registra; the next attempt starts afresh on the same target", async () => {
  const f = fixture({ actions: [sword] }); await f.controller.ready; await tick();
  await f.select(["ghoul"]);
  await pick(f, "maneuver::grapple");
  assert.equal(f.$("pc-attack-maneuver").hidden, false);
  assert.equal(f.$("pc-attack-attack-view").hidden, true);
  assert.equal(f.$("pc-attack-subtitle").textContent, "Lotta · Attacco speciale in mischia");
  assert.equal(f.$("pc-attack-maneuver-target").value, "ghoul", "the attack's target carries over");
  assert.equal(f.$("pc-attack-maneuver-effects").hidden, true, "a Grapple has no effect to choose");
  assert.match(f.$("pc-attack-maneuver-contest").textContent, /Atletica contro Atletica o Acrobazia/);
  assert.match(f.$("pc-attack-maneuver-note").textContent, /mano libera.*una taglia più grande/);
  assert.equal(f.$("pc-attack-launch-button").textContent, "Registra");
  assert.equal(f.$("pc-attack-launch-button").disabled, true);
  assert.equal(f.$("pc-attack-total").textContent, "Scegli l'esito della prova contrapposta.");
  await maneuverButton(f, "pc-attack-maneuver-outcomes", "outcome", "success").click();
  assert.equal(f.$("pc-attack-total").textContent, "Ghoul sarà Afferrato.");
  await f.$("pc-attack-launch-button").click(); await tick();
  const [{ maneuver: request }] = f.calls;
  assert.deepEqual([request.sourceId, request.kind, request.targetId, request.outcome, request.effect], ["aria", "grapple", "ghoul", "success", undefined]);
  assert.match(request.attackInstanceId, /^pc-attack:/);
  assert.equal(f.$("pc-attack-status").textContent, "Registrato: Lotta riuscita, Ghoul Afferrato.");
  assert.equal(f.$("pc-attack-undo").hidden, false);
  assert.equal(maneuverButton(f, "pc-attack-maneuver-outcomes", "outcome", "success").getAttribute("aria-pressed"), "false", "a fresh attempt");
  assert.equal(f.$("pc-attack-maneuver-target").value, "ghoul");
  await maneuverButton(f, "pc-attack-maneuver-outcomes", "outcome", "failure").click();
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.notEqual(f.calls[1].maneuver.attackInstanceId, request.attackInstanceId);
  assert.equal(f.$("pc-attack-status").textContent, "Registrato: Lotta su Ghoul fallita.");
  // Another creature selected on the map becomes the target of the next attempt (the attack's draft is still open).
  await f.select(["imp"]);
  assert.equal(f.$("pc-attack-maneuver-target").value, "imp");
  await maneuverButton(f, "pc-attack-maneuver-outcomes", "outcome", "success").click();
  await f.select(["ghoul"]);
  assert.equal(f.$("pc-attack-maneuver-target").value, "imp", "an outcome chosen locks the target");
});

test("Spinta: the effect is required; a push says the token is moved by hand", async () => {
  const f = fixture({ actions: [sword] }); await f.controller.ready; await tick();
  await pick(f, "maneuver::shove");
  assert.equal(f.$("pc-attack-maneuver-hint").hidden, false, "no target yet");
  f.$("pc-attack-maneuver-target").value = "ghoul"; await f.$("pc-attack-maneuver-target").emit("change");
  await maneuverButton(f, "pc-attack-maneuver-outcomes", "outcome", "success").click();
  assert.equal(f.$("pc-attack-total").textContent, "Scegli se spingerlo via o buttarlo Prono.");
  assert.equal(f.$("pc-attack-maneuver-effects").hidden, false);
  await maneuverButton(f, "pc-attack-maneuver-effects", "effect", "push").click();
  assert.equal(f.$("pc-attack-total").textContent, "Sposta Ghoul di 1,5 m sulla mappa.");
  await f.$("pc-attack-launch-button").click(); await tick();
  assert.deepEqual([f.calls[0].maneuver.kind, f.calls[0].maneuver.effect], ["shove", "push"]);
  assert.match(f.$("pc-attack-status").textContent, /Spinta riuscita, Ghoul spinto via di 1,5 m\.\nSposta Ghoul di 1,5 m/);
});

test("off turn a maneuver never offers the reaction (not an opportunity attack)", async () => {
  const f = fixture({ actions: [sword], turnState: { order: ["ghoul", "aria"], current: 0, round: 1 } }); await f.controller.ready; await tick();
  await f.select(["ghoul"]);
  assert.equal(f.$("pc-attack-reaction").hidden, false, "the weapon attack offers it");
  await pick(f, "maneuver::grapple");
  assert.equal(f.$("pc-attack-reaction").hidden, true);
});

test("the Presa box: the creature the actor holds (let go, its escape) and the grapple on the actor (its escape)", async () => {
  const f = fixture({ actions: [sword], metas: { ghoul: grabbed("aria", "g1") }, attacker: { initiativeCard: { quickActions: [sword] }, ...grabbed("imp", "i1") } });
  await f.controller.ready; await tick();
  const box = f.$("pc-attack-grapple");
  assert.equal(box.hidden, false);
  assert.match(textOf(box), /Tiene Ghoul/);
  assert.match(textOf(box), /Afferrato da Imp/);
  assert.deepEqual(box.querySelectorAll(".grapple-row").map((line) => line.title), ["Ghoul: Afferrato da Aria", "Aria: Afferrato da Imp"]);
  const buttons = box.querySelectorAll("button");
  assert.deepEqual(buttons.map((button) => button.textContent), ["Lascia andare", "Sfugge", "Non sfugge", "Sfugge", "Non sfugge"]);
  await buttons[0].click(); await tick();
  assert.deepEqual((({ sourceId, grappledId, instanceId, outcome }) => ({ sourceId, grappledId, instanceId, outcome }))(f.calls[0].grappleEnd),
    { sourceId: "aria", grappledId: "ghoul", instanceId: "g1", outcome: "release" });
  assert.equal(f.$("pc-attack-status").textContent, "Registrato: Aria lascia andare Ghoul.");
  await box.querySelectorAll("button")[3].click(); await tick();
  assert.deepEqual([f.calls[1].grappleEnd.grappledId, f.calls[1].grappleEnd.instanceId, f.calls[1].grappleEnd.outcome], ["aria", "i1", "escaped"]);
  const none = fixture({ actions: [sword] }); await none.controller.ready; await tick();
  assert.equal(none.$("pc-attack-grapple").hidden, true, "no grapple, no box");
});

// Attacchi dei mostri, lotto 2: bonus e portata nel sottotitolo, il multiattacco sopra gli attacchi, la nota sotto i
// danni; un'azione a TS con la sua area, la sua CD e le creature spuntate a mano.
const dragonBite = sanitizeQuickAction({ id: "bite", label: "Morso", kind: "attack", range: "melee",
  components: [{ type: "piercing", formula: "2d10+8" }], attackBonus: 14, reachFeet: 10, note: "Più 2d6 fuoco." });
const dragonBreath = sanitizeQuickAction({ id: "breath", label: "Soffio di fuoco", kind: "attack", range: "ranged",
  components: [{ type: "fire", formula: "18d6" }], save: "dex", saveDC: 21, saveHalf: true, area: { shape: "cone", sizeFeet: 60 }, recharge: 5 });
const dragonCard = { spellSaveDC: 8, quickActions: [dragonBite, dragonBreath], monster: { source: "manual", multiattack: "Un morso e due artigli." } };

test("monster attack in the console: its bonus and reach in the subtitle, the Multiattack, the note under the damage", async () => {
  const f = fixture({ card: dragonCard, actionId: "bite", attacker: { initiativeCard: dragonCard } }); await f.controller.ready; await tick();
  assert.equal(f.$("pc-attack-subtitle").textContent, "Morso · Mischia · +14 al tiro · portata 3 m");
  assert.equal(f.$("pc-attack-multiattack").hidden, false);
  assert.equal(f.$("pc-attack-multiattack").textContent, "Multiattacco: Un morso e due artigli.");
  assert.equal(f.$("pc-attack-monster-note").hidden, false);
  assert.equal(f.$("pc-attack-monster-note").textContent, "Da risolvere al tavolo: Più 2d6 fuoco.");
  assert.deepEqual(f.$("pc-attack-outcomes").children.map((button) => button.dataset.outcome), ["hit", "critical", "miss"]);
});

test("monster save action in the console: its area note and DC, the creatures ticked by hand, no map drawing", async () => {
  const f = fixture({ card: dragonCard, actionId: "breath", attacker: { initiativeCard: dragonCard } }); await f.controller.ready; await tick();
  assert.equal(f.$("pc-attack-subtitle").textContent, "Soffio di fuoco · TS Destrezza (CD 21) · Ricarica 5–6");
  assert.equal(f.$("pc-attack-area").hidden, false);
  assert.equal(f.$("pc-attack-area-note").textContent, "Cono di 18 m: spunta le creature colpite. TS Destrezza (CD 21): metà se superato.");
  assert.equal(f.$("pc-attack-area-propose").hidden, true);
  assert.equal(f.$("pc-attack-monster-note").hidden, true, "no note on this action");
  await areaField(areaRow(f, "ghoul"), "failed").click();
  await areaField(areaRow(f, "imp"), "passed").click();
  await typeAmounts(f, ["63"]);
  assert.equal(f.$("pc-attack-apply").disabled, false, f.$("pc-attack-total").textContent);
  await f.$("pc-attack-apply").click(); await tick();
  assert.deepEqual(f.calls[0].area.members, [{ targetId: "ghoul", outcome: "failed" }, { targetId: "imp", outcome: "passed" }]);
  assert.deepEqual(f.calls[0].area.componentAmounts, { c1: 63 });
  assert.match(f.$("pc-attack-status").textContent, /^Registrato: Soffio di fuoco su 2 creature\./);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_QUICK_ACTIONS,
  MAX_QUICK_ACTION_ATTACKS,
  findQuickAction,
  isAttackQuickAction,
  parseQuickActionAttackImport,
  quickActionDirectTargetIds,
  quickActionInitialTargetIds,
  sanitizeQuickAction,
  sanitizeQuickActions,
} from "../src/quickActionsCore.js";

test("migra in lettura un preset incantesimo v1 nel modello v2 senza workflow", () => {
  assert.deepEqual(sanitizeQuickAction({
    version: 99,
    id: " fireball/action ",
    label: "  Palla di Fuoco  ",
    kind: "spell",
    spellId: "fireball",
    workflow: "area",
    targetMode: "selection",
    slotLevel: 12,
    turns: 0,
    applyAutomations: false,
    targetIds: ["enemy"],
    operations: [{ type: "hp:set" }],
  }), {
    version: 2,
    id: "fireballaction",
    label: "Palla di Fuoco",
    kind: "spell",
    spellId: "fireball",
    targetMode: "selection",
    slotLevel: 9,
    turns: 1,
    applyAutomations: false,
    launchMode: "review",
  });
});

test("mappa workflow v1 e assenza di workflow su launchMode v2", () => {
  const base = {
    id: "spell-action",
    label: "Incantesimo",
    kind: "spell",
    spellId: "shield-of-faith",
    targetMode: "self",
  };
  assert.equal(sanitizeQuickAction({ ...base, workflow: "spell" }).launchMode, "auto");
  assert.equal(sanitizeQuickAction({ ...base, workflow: "area" }).launchMode, "review");
  assert.equal(sanitizeQuickAction(base).launchMode, "auto");
  assert.equal(sanitizeQuickAction({ ...base, workflow: "area", launchMode: "auto" }).launchMode, "auto");
});

test("normalizza condizioni e limita durata e modalità", () => {
  assert.deepEqual(sanitizeQuickAction({
    id: "vow",
    label: "Giuramento",
    kind: "condition",
    conditionName: "Giuramento di Inimicizia",
    targetMode: "self",
    expiryMode: "turn-end",
    duration: "3.7",
  }), {
    version: 2,
    id: "vow",
    label: "Giuramento",
    kind: "condition",
    conditionName: "Giuramento di Inimicizia",
    targetMode: "self",
    expiryMode: "turn-end",
    duration: 4,
  });
});

test("scarta record invalidi, duplicati e oltre il limite", () => {
  const source = Array.from({ length: MAX_QUICK_ACTIONS + 3 }, (_, index) => ({
    id: `action-${index}`,
    label: `Azione ${index}`,
    kind: "spell",
    spellId: `spell-${index}`,
  }));
  source.splice(1, 0, { ...source[0] });
  source.splice(2, 0, { id: "", label: "Invalida", kind: "spell", spellId: "x" });

  const result = sanitizeQuickActions(source);
  assert.equal(result.length, MAX_QUICK_ACTIONS);
  assert.equal(new Set(result.map((action) => action.id)).size, MAX_QUICK_ACTIONS);
  assert.equal(sanitizeQuickActions(source, { limit: 64 }).length, MAX_QUICK_ACTIONS + 3);
});

test("normalizza una capacità attiva senza stato runtime", () => {
  const action = sanitizeQuickAction({
    id: "feature:barbaro-ira",
    label: "Ira",
    kind: "feature",
    featureId: "barbaro-ira",
    targetMode: "self",
    resourceCurrent: 2,
  });
  assert.deepEqual(action, {
    version: 2,
    id: "feature:barbaro-ira",
    label: "Ira",
    kind: "feature",
    featureId: "barbaro-ira",
    targetMode: "self",
  });
});

test("risolve lookup e bersagli iniziali senza conoscere pannelli", () => {
  const profile = {
    quickActions: [{
      id: "shield",
      label: "Scudo",
      kind: "spell",
      spellId: "shield-of-faith",
      workflow: "spell",
      targetMode: "self",
    }, {
      id: "fireball",
      label: "Palla di Fuoco",
      kind: "spell",
      spellId: "fireball",
      workflow: "area",
      targetMode: "selection",
    }, {
      id: "vow",
      label: "Giuramento",
      kind: "condition",
      conditionName: "Giuramento di Inimicizia",
      targetMode: "selection",
    }],
  };

  const shield = findQuickAction(profile, "shield");
  assert.equal(shield.launchMode, "auto");
  assert.deepEqual(quickActionInitialTargetIds(shield, "paladin", ["enemy"]), ["paladin"]);
  assert.equal(findQuickAction(profile, "fireball").launchMode, "review");
  assert.equal(findQuickAction(profile, "vow").kind, "condition");
  assert.deepEqual(
    quickActionInitialTargetIds(findQuickAction(profile, "vow"), "paladin", ["enemy", "enemy"]),
    ["enemy"],
  );
  assert.deepEqual(
    quickActionDirectTargetIds(findQuickAction(profile, "vow"), "paladin", ["enemy"]),
    ["enemy"],
  );
  assert.deepEqual(
    quickActionDirectTargetIds(findQuickAction(profile, "vow"), "paladin", ["enemy", "ally"]),
    [],
  );
});

test("normalizza un attacco: portata, 1-3 componenti tipizzate e bersaglio sempre la selezione", () => {
  assert.deepEqual(sanitizeQuickAction({
    id: "sword",
    label: " Spada lunga ",
    kind: "attack",
    targetMode: "self",
    range: "ranged",
    components: [
      { id: "x", type: "slashing", formula: " 1d8+3 ", amount: 99 },
      { type: "radiant" },
    ],
    attackBonus: 7,
  }), {
    version: 2,
    id: "sword",
    label: "Spada lunga",
    kind: "attack",
    targetMode: "selection",
    range: "ranged",
    components: [
      { id: "c1", type: "slashing", formula: "1d8+3" },
      { id: "c2", type: "radiant" },
    ],
  });
  const base = { id: "a", label: "Attacco", kind: "attack", components: [{ type: "piercing" }] };
  assert.equal(sanitizeQuickAction(base).range, "melee");
  assert.equal(sanitizeQuickAction({ ...base, components: [] }), null);
  assert.equal(sanitizeQuickAction({ ...base, components: [{ type: "piercing" }, { type: "fire" }, { type: "cold" }, { type: "acid" }] }), null);
  assert.equal(sanitizeQuickAction({ ...base, components: [{ type: "holy" }] }), null);
  assert.equal(sanitizeQuickAction({ ...base, components: "piercing" }), null);
  assert.equal(sanitizeQuickAction(base).components[0].formula, undefined);
  assert.equal(sanitizeQuickAction({ ...base, components: [{ type: "piercing", formula: "x".repeat(40) }] }).components[0].formula.length, 24);
});

test("un attacco con trucchetto conserva solo i trucchetti conosciuti; senza fonte resta un'arma", () => {
  assert.deepEqual(sanitizeQuickAction({
    id: "cantrip",
    label: " Trucchetti ",
    kind: "attack",
    targetMode: "self",
    range: "melee",
    components: [{ type: "fire" }],
    source: { kind: "cantrip", spellIds: ["fire-bolt", "magic-stone", "fire-bolt", "eldritch-blast"] },
  }), {
    version: 2,
    id: "cantrip",
    label: "Trucchetti",
    kind: "attack",
    targetMode: "selection",
    source: { kind: "cantrip", spellIds: ["fire-bolt", "eldritch-blast"] },
  });
  assert.deepEqual(sanitizeQuickAction({ id: "all", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }).source, { kind: "cantrip" });
  const weapon = sanitizeQuickAction({ id: "sword", label: "Spada", kind: "attack", source: { kind: "weapon" }, components: [{ type: "slashing" }] });
  assert.equal(weapon.source, undefined);
  assert.equal(weapon.components.length, 1);
});

test("attacchi e azioni rapide hanno limiti separati nello stesso elenco", () => {
  const quick = Array.from({ length: MAX_QUICK_ACTIONS + 2 }, (_, index) => ({
    id: `quick-${index}`, label: `Azione ${index}`, kind: "condition", conditionName: "Prono",
  }));
  const attacks = Array.from({ length: MAX_QUICK_ACTION_ATTACKS + 2 }, (_, index) => ({
    id: `attack-${index}`, label: `Attacco ${index}`, kind: "attack", components: [{ type: "slashing" }],
  }));
  // Interleaved: twelve quick actions do not crowd out the attacks, nor the other way round.
  const result = sanitizeQuickActions([...attacks.slice(0, 3), ...quick, ...attacks.slice(3)]);
  assert.equal(result.filter((action) => !isAttackQuickAction(action)).length, MAX_QUICK_ACTIONS);
  assert.equal(result.filter(isAttackQuickAction).length, MAX_QUICK_ACTION_ATTACKS);
  assert.equal(MAX_QUICK_ACTION_ATTACKS, 8);
  assert.deepEqual(result.slice(0, 3).map((action) => action.id), ["attack-0", "attack-1", "attack-2"], "keeps the stored order");
  assert.equal(sanitizeQuickActions([...quick, ...attacks], { limit: 64, attackLimit: 64 }).length, quick.length + attacks.length);
});

test("importa un blocco di attacchi: arma, trucchetto, voci non valide e testo illeggibile", () => {
  const block = JSON.stringify({ name: "Alane", attacks: [
    { label: "Bastone ferrato", range: "melee", components: [{ type: "bludgeoning", formula: "1d6" }] },
    { label: "Trucchetto", source: { kind: "cantrip", spellIds: ["ray-of-frost", "not-a-cantrip"] } },
    { label: "Senza danni", range: "melee", components: [] },
    { label: "Tipo sconosciuto", components: [{ type: "banana" }] },
    "testo",
  ] });
  const result = parseQuickActionAttackImport(block);
  assert.equal(result.error, "");
  assert.equal(result.invalid, 3);
  assert.deepEqual(result.attacks.map((attack) => attack.label), ["Bastone ferrato", "Trucchetto"]);
  assert.equal(result.attacks[0].kind, "attack");
  assert.equal("id" in result.attacks[0], false, "the caller gives the ids");
  assert.deepEqual(result.attacks[0].components, [{ id: "c1", type: "bludgeoning", formula: "1d6" }]);
  assert.deepEqual(result.attacks[1].source, { kind: "cantrip", spellIds: ["ray-of-frost"] });
  // A bare array works too; anything else is reported, never thrown.
  assert.equal(parseQuickActionAttackImport('[{"label":"Arco","range":"ranged","components":[{"type":"piercing"}]}]').attacks[0].range, "ranged");
  assert.match(parseQuickActionAttackImport("non json").error, /non leggibile/);
  assert.match(parseQuickActionAttackImport('{"name":"x"}').error, /elenco di attacchi/);
});

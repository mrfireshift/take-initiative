import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_QUICK_ACTIONS,
  findQuickAction,
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

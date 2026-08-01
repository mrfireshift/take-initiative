import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_QUICK_ACTIONS,
  findQuickAction,
  quickActionDirectTargetIds,
  quickActionInitialTargetIds,
  quickActionPanel,
  sanitizeQuickAction,
  sanitizeQuickActions,
} from "../src/quickActionsCore.js";

test("normalizza un preset incantesimo senza memorizzare stato runtime", () => {
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
    version: 1,
    id: "fireballaction",
    label: "Palla di Fuoco",
    kind: "spell",
    spellId: "fireball",
    workflow: "area",
    targetMode: "selection",
    slotLevel: 9,
    turns: 1,
    applyAutomations: false,
  });
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
    version: 1,
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
    version: 1,
    id: "feature:barbaro-ira",
    label: "Ira",
    kind: "feature",
    featureId: "barbaro-ira",
    targetMode: "self",
  });
  assert.equal(quickActionPanel(action), "features");
});

test("risolve pannello, lookup e bersagli iniziali", () => {
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
  assert.equal(quickActionPanel(shield), "spells");
  assert.deepEqual(quickActionInitialTargetIds(shield, "paladin", ["enemy"]), ["paladin"]);
  assert.equal(quickActionPanel(findQuickAction(profile, "fireball")), "quick-hp");
  assert.equal(quickActionPanel(findQuickAction(profile, "vow")), "conditions");
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

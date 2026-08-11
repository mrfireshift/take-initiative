import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ID } from "../src/constants.js";
import {
  concentrationDamageByItemId,
  concentrationSaveWarningsForItems,
} from "../src/concentrationSaveReminderCore.js";

const META_KEY = `${ID}/meta`;
const CONCENTRATION_KEY = `${ID}/concentration`;

function caster(concentration = null) {
  return {
    id: "caster-1",
    name: "Lavera",
    image: { url: "https://example.test/lavera.png" },
    metadata: {
      [META_KEY]: {
        attitude: "pc",
        ...(concentration ? { [CONCENTRATION_KEY]: concentration } : {}),
      },
    },
  };
}

test("normalizza un singolo evento di danno per bersaglio", () => {
  const damageById = concentrationDamageByItemId([
    { itemId: "caster-1", damage: 12 },
    { itemId: "caster-1", damage: 8 },
    { itemId: "", damage: 30 },
    { itemId: "caster-2", damage: 0 },
  ]);

  assert.deepEqual([...damageById], [["caster-1", 12]]);
});

test("costruisce un warning risolvibile dalla concentrazione live", () => {
  const warnings = concentrationSaveWarningsForItems({
    items: [caster({ ragnatela: { instanceId: "spell-1", name: "Ragnatela" } })],
    changes: [{ itemId: "caster-1", damage: 30 }],
    eventId: "damage-1",
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].dc, 15);
  assert.equal(warnings[0].notice.activationId, "concentration-save:damage-1:caster-1");
  assert.deepEqual(
    warnings[0].notice.resolution.outcomes.failed.actions,
    [{
      kind: "concentration",
      action: "break",
      targetId: "caster-1",
      casterId: "caster-1",
      reference: "spell-1",
    }],
  );
});

test("non costruisce warning se la concentrazione live è già terminata", () => {
  const warnings = concentrationSaveWarningsForItems({
    items: [caster(null)],
    changes: [{ itemId: "caster-1", damage: 20 }],
    eventId: "damage-after-break",
  });
  assert.deepEqual(warnings, []);
});

test("tutti gli ingressi di danno usano il dispatcher condiviso", () => {
  const runtime = fs.readFileSync(new URL("../src/concentrationSaveReminder.js", import.meta.url), "utf8");
  const quickHP = fs.readFileSync(new URL("../src/quick-hp-modal.js", import.meta.url), "utf8");
  const initiative = fs.readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const reminder = fs.readFileSync(new URL("../src/reminderResolution.js", import.meta.url), "utf8");

  assert.match(runtime, /await getItems\(\[\.\.\.damageById\.keys\(\)\]\)/);
  assert.match(runtime, /type: "show-concentration-warning"[\s\S]*destination: "ALL"/);
  assert.match(quickHP, /async function showConcentrationWarnings\(entries\)[\s\S]*broadcastConcentrationSaveWarnings\(damage/);
  assert.match(initiative, /showConcentrationDamageWarning[\s\S]*broadcastConcentrationSaveWarnings\(/);
  assert.match(reminder, /plan\.hpChange\.after < plan\.hpChange\.before[\s\S]*broadcastConcentrationSaveWarnings\(/);
});

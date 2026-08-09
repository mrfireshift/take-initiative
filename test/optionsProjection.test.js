import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDefaultRoomOptions } from "../src/options/optionsDefaults.js";
import {
  hpStatusForRatio,
  mapHpDisclosure,
  projectReminderNotice,
  projectSceneItemEffects,
  projectTrackerEntry,
} from "../src/options/optionsProjection.js";

const room = createDefaultRoomOptions();
const baseEntry = {
  id: "enemy-1",
  attitude: "enemy",
  hp: 7,
  hpMax: 20,
  conditions: {
    version: 2,
    instances: [{ id: "poisoned", condition: "Avvelenato", sourceId: "caster" }],
  },
  spells: [{ name: "Bane", casterId: "caster", targets: ["enemy-1"] }],
  isConcentrating: true,
  concSpellKey: "Bane",
  legendary: { max: 3, current: 2 },
  legendaryResistances: { max: 3, current: 1 },
  paragonActions: 2,
  isEpic: false,
  quickActions: [{ kind: "spell", spell: "Bane" }],
  classFeatures: [{ id: "secret" }],
};

function player(entry = baseEntry, overrides = {}) {
  return projectTrackerEntry(entry, {
    role: "PLAYER",
    surface: "trackerClassic",
    hpPolicy: room.playerView.hp,
    effectsPolicy: room.playerView.effects,
    bossDetails: room.playerView.bossDetails,
    ...overrides,
  });
}

test("OPTIONS-002: la proiezione GM conserva il modello canonico", () => {
  assert.equal(projectTrackerEntry(baseEntry, { role: "GM" }), baseEntry);
});

test("OPTIONS-002: i default Player riproducono le visibilità HP legacy per layout", () => {
  const ally = { ...baseEntry, attitude: "ally" };
  const pc = { ...baseEntry, attitude: "pc" };
  assert.equal(player(ally).hpDisclosure.mode, "exact");
  assert.equal(player(ally, { surface: "trackerCompact" }).hpDisclosure.mode, "hidden");
  assert.equal(player(pc, { surface: "trackerCompact" }).hpDisclosure.mode, "exact");
  assert.equal(player(baseEntry).hpDisclosure.mode, "hidden");
  assert.equal(mapHpDisclosure({ hp: 7, hpMax: 20, attitude: "ally" }, room.playerView.hp).mode, "exact");
  assert.equal(mapHpDisclosure({ hp: 7, hpMax: 20, attitude: "enemy" }, room.playerView.hp).mode, "hidden");
});

test("OPTIONS-002: bar e status non contengono valori HP esatti", () => {
  const hpPolicy = structuredClone(room.playerView.hp);
  hpPolicy.trackerClassic.enemy = "bar";
  const bar = player(baseEntry, { hpPolicy });
  assert.equal(bar.hp, null);
  assert.equal(bar.hpMax, null);
  assert.deepEqual(bar.hpDisclosure, {
    mode: "bar",
    ratio: 0.35,
    status: "bloodied",
  });

  hpPolicy.trackerClassic.enemy = "status";
  const status = player(baseEntry, { hpPolicy });
  assert.equal(status.hp, null);
  assert.equal(status.hpMax, null);
  assert.equal(status.hpDisclosure.mode, "status");
  assert.equal(status.hpDisclosure.status, "bloodied");
  assert.equal(status.hpDisclosure.ratio, 0.45);
  assert.equal(hpStatusForRatio(0), "down");
  assert.equal(hpStatusForRatio(0.8), "healthy");
});

test("OPTIONS-002: quick action e capacità non raggiungono mai il Player view model", () => {
  const projected = player({ ...baseEntry, attitude: "pc" });
  assert.deepEqual(projected.quickActions, []);
  assert.deepEqual(projected.classFeatures, []);
});

test("OPTIONS-002: effects summary e hidden redigono i dettagli senza mutare la sorgente", () => {
  const source = structuredClone(baseEntry);
  const summary = player(source, {
    effectsPolicy: { conditions: "summary", spells: "summary", concentration: "summary" },
  });
  assert.equal(summary.conditions.instances[0].condition, "Condizione");
  assert.equal(summary.conditions.instances[0].sourceId, undefined);
  assert.equal(summary.spells[0].name, "Incantesimo");
  assert.equal(summary.concSpellKey, null);
  assert.equal(summary.isConcentrating, true);

  const hidden = player(source, {
    effectsPolicy: { conditions: "hidden", spells: "hidden", concentration: "hidden" },
  });
  assert.deepEqual(hidden.conditions.instances, []);
  assert.deepEqual(hidden.spells, []);
  assert.equal(hidden.isConcentrating, false);
  assert.deepEqual(source, baseEntry);
});

test("OPTIONS-002: boss summary conserva solo la modalità e hidden redige anche quella", () => {
  const summary = player(baseEntry, { bossDetails: "summary" });
  assert.equal(summary.bossDisclosure, "summary");
  assert.deepEqual(summary.legendary, { max: 0, current: 0 });
  assert.deepEqual(summary.legendaryResistances, { max: 0, current: 0 });
  assert.equal(summary.paragonActions, 0);

  const hidden = player({ ...baseEntry, isEpic: true }, { bossDetails: "hidden" });
  assert.equal(hidden.bossDisclosure, "hidden");
  assert.equal(hidden.isEpic, false);
});

test("OPTIONS-002: le pill mappa Player usano una copia redatta", () => {
  const metaKey = "plugin/meta";
  const spellsKey = "plugin/spells";
  const concentrationKey = "plugin/concentration";
  const item = {
    id: "caster",
    metadata: {
      [metaKey]: {
        conditions: baseEntry.conditions,
        [spellsKey]: baseEntry.spells,
        [concentrationKey]: { Bane: { targets: ["enemy-1"], sourceId: "caster" } },
      },
      foreign: { keep: true },
    },
  };
  const projected = projectSceneItemEffects(item, {
    role: "PLAYER",
    policy: { conditions: "summary", spells: "summary", concentration: "summary" },
    metaKey,
    spellsKey,
    concentrationKey,
  });
  assert.equal(projected.metadata[metaKey].conditions.instances[0].condition, "Condizione");
  assert.deepEqual(projected.metadata[metaKey][spellsKey], [{ name: "Incantesimo", targets: ["enemy-1"] }]);
  assert.deepEqual(projected.metadata[metaKey][concentrationKey], {
    Incantesimo: { targets: ["enemy-1"] },
  });
  assert.deepEqual(projected.metadata.foreign, { keep: true });
  assert.equal(item.metadata[metaKey][spellsKey][0].name, "Bane");
});

test("OPTIONS-002: reminder Player sono redatti prima della consegna pubblica", () => {
  const raw = {
    activationId: "a1",
    effectName: "Bane",
    spellName: "Bane",
    saveLabel: "TS Saggezza CD 15",
    label: "TS Saggezza CD 15",
    sourceName: "Lich",
    casterName: "Lich",
    resolution: { targetId: "enemy-1", damage: { dice: "2d6" } },
    target: { id: "enemy-1", name: "Eroe" },
  };
  const fullRedacted = projectReminderNotice(raw, {
    role: "PLAYER",
    policy: { visibility: "full", showDc: false, showCaster: false },
  });
  assert.equal(fullRedacted.saveLabel, "TS Saggezza");
  assert.equal(fullRedacted.sourceName, undefined);
  assert.equal(fullRedacted.resolution, undefined);

  const notice = projectReminderNotice(raw, {
    role: "PLAYER",
    policy: { visibility: "notice", showDc: true, showCaster: true },
  });
  assert.equal(notice.effectName, "Effetto");
  assert.equal(notice.saveLabel, "È richiesto un intervento");
  assert.equal(JSON.stringify(notice).includes("Bane"), false);
  assert.equal(JSON.stringify(notice).includes("Lich"), false);
  assert.equal(projectReminderNotice(raw, {
    role: "PLAYER",
    policy: { visibility: "hidden", showDc: true, showCaster: true },
  }), null);
});

test("OPTIONS-002: informational redige la risoluzione solo nella copia GM", () => {
  const raw = { activationId: "a1", resolution: { targetId: "t1" } };
  const projected = projectReminderNotice(raw, {
    role: "GM",
    directResolution: "informational",
  });
  assert.equal(projected.resolution, undefined);
  assert.deepEqual(raw.resolution, { targetId: "t1" });
});

test("OPTIONS-002: i reminder pubblici usano solo la consegna REMOTE redatta", () => {
  const broadcast = readFileSync(
    new URL("../src/options/reminderProjectionBroadcast.js", import.meta.url),
    "utf8",
  );
  assert.match(broadcast, /if \(!isGM\)/);
  assert.match(broadcast, /reminderSenderIsGMPromise/);
  assert.match(broadcast, /Promise\.all\(\[/);
  assert.match(broadcast, /destination: "LOCAL"/);
  assert.match(broadcast, /destination: "REMOTE"/);
  assert.doesNotMatch(broadcast, /destination: "ALL"/);

  for (const file of [
    "effectSaveReminderController.js",
    "classFeatureReminderController.js",
    "spellAuraController.js",
    "classFeatureAuraController.js",
    "customAuraController.js",
    "spellStaticZone.js",
    "quick-hp-modal.js",
  ]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(source, /sendProjectedReminderPayload/);
  }
});

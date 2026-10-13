// Primal Blizzard (profile v13): the wind pushes player characters only; the concentration save reaches only a
// creature that is concentrating, through the shared concentration warning whose failure breaks it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { bossProfileAuras, mergeBossAuras } from "../src/bossAuraCore.js";
import { CUSTOM_AURA_META_KEY, collectActiveCustomAuras } from "../src/customAuraCore.js";
import { planCustomAuraReminder } from "../src/customAuraReminderCore.js";
import { areaMembershipTargetIds } from "../src/spellAreaMembershipCore.js";
import { customAuraRule } from "../src/customAuraCore.js";
import { buildConcentrationSaveWarning } from "../src/concentrationSaveReminderCore.js";

const META = "com.thebigpicture.initiative/meta";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";
const p3 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const creature = (id, attitude, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, attitude, ...extra } } });
const boss = creature("auril", "enemy", { customAuras: bossProfileAuras(p3) });
const active = (name) => collectActiveCustomAuras([boss], { metaKey: META }).find((aura) => aura.name === name);
const BOUNDS = { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } };
const AREA = { cells: [{ x: -100, y: -100, width: 1000, height: 1000 }] };

test("the wind's push reaches player characters only; the blizzard reaches every creature hostile to Auril", () => {
  const candidates = [boss, creature("mira", "pc"), creature("grifone", "ally"), creature("goblin", "enemy")].map((item) => ({ item, bounds: BOUNDS }));
  const ids = (aura) => areaMembershipTargetIds({ sourceId: "auril", rule: customAuraRule(aura), area: AREA, candidates, metaKey: META });
  assert.deepEqual(ids(active("Primal Blizzard · Vento")), ["mira"]);
  assert.deepEqual(ids(active("Primal Blizzard")), ["mira", "grifone"]);
});

test("the end-of-turn concentration save becomes a concentration warning, only for a concentrating creature", () => {
  const blizzard = active("Primal Blizzard");
  const mira = creature("mira", "pc", { [CONCENTRATION]: { bless: { name: "Benedizione", instanceId: "conc-1" } } });
  const dars = creature("dars", "pc");
  const itemsById = new Map([mira, dars, boss].map((item) => [item.id, item]));
  const order = ["auril", "mira", "dars"];
  const plan = (current, auraItem) => planCustomAuraReminder({ aura: blizzard, auraItem, desiredTargetIds: ["mira", "dars"],
    initiativeState: { order, current, round: 1 }, itemsById });
  const visual = (runtime) => ({ id: "visual", metadata: { [CUSTOM_AURA_META_KEY]: { triggerRuntime: runtime } } });
  const first = plan(1, null);
  // Mira's turn ends inside the blizzard: she is concentrating, so the shared warning asks CON 10.
  const second = plan(2, visual(first.runtime));
  assert.deepEqual(second.notices, [], "no zone notice for a concentration save");
  assert.equal(second.concentrationWarnings.length, 1);
  const [warning] = second.concentrationWarnings;
  assert.deepEqual([warning.name, warning.dc, warning.cause, warning.damage, warning.spellName], ["mira", 10, "Primal Blizzard", 0, "Benedizione"]);
  assert.deepEqual(warning.notice.resolution.save, { ability: "con", dc: 10 });
  assert.deepEqual(warning.notice.resolution.outcomes.failed.actions,
    [{ kind: "concentration", action: "break", targetId: "mira", casterId: "mira", reference: "conc-1" }], "a failure breaks the concentration");
  // Dars's turn ends inside the blizzard without concentration: nothing to ask.
  const third = plan(0, visual(second.runtime));
  assert.deepEqual(third.concentrationWarnings, []);
  assert.deepEqual(third.notices, []);
});

test("a concentration warning without damage needs a cause; damage-based warnings are unchanged", () => {
  const concentration = { bless: { name: "Benedizione" } };
  assert.equal(buildConcentrationSaveWarning({ casterId: "mira", concentration, damage: 0 }), null);
  assert.equal(buildConcentrationSaveWarning({ casterId: "mira", concentration, damage: 0, cause: "Primal Blizzard", dc: 10 }).cause, "Primal Blizzard");
  const hit = buildConcentrationSaveWarning({ casterId: "mira", concentration, damage: 24, dc: 12 });
  assert.equal(hit.cause, undefined);
  assert.equal(hit.damage, 24);
});

test("a rebind brings the profile's mechanics to an older aura and keeps the GM's radius, colours and switches", () => {
  const older = bossProfileAuras(p3).map((aura) => aura.name === "Primal Blizzard · Vento"
    ? { ...aura, radiusMeters: 12, targeting: { filter: "hostile", includeSource: false } }
    : aura.name === "Primal Blizzard"
      ? { ...aura, style: { ...aura.style, fillColor: "#ffffff" }, pills: aura.pills.map((pill) => ({ ...pill, enabled: false })),
        reminders: [{ id: "concentration", enabled: true, event: "turn-end", label: "Solo se mantiene la concentrazione", resolution: "manual-save", ability: "con", dcMode: "fixed", dc: 10 }] }
      : aura);
  const merged = mergeBossAuras(older, p3);
  assert.deepEqual(merged.updated, ["Primal Blizzard", "Primal Blizzard · Vento"]);
  const wind = merged.auras.find((aura) => aura.name === "Primal Blizzard · Vento");
  assert.deepEqual([wind.radiusMeters, wind.targeting.filter], [12, "pc"]);
  const blizzard = merged.auras.find((aura) => aura.name === "Primal Blizzard");
  assert.equal(blizzard.reminders[0].resolution, "concentration-save");
  assert.equal(blizzard.style.fillColor, "#ffffff", "the GM's colour stays");
  assert.equal(blizzard.pills[0].enabled, false, "a pill the GM switched off stays off");
  assert.deepEqual(mergeBossAuras(merged.auras, p3).updated, []);
});

test("a failed push leaves Prono: a standard condition the aura's cleanup never removes", async () => {
  const wind = active("Primal Blizzard · Vento");
  assert.deepEqual(wind.reminders[0].failureCondition, { condition: "Prono", name: "Prono" });
  const trigger = customAuraRule(wind).triggerPolicy.triggers[0];
  assert.deepEqual(trigger.failureCondition, { condition: "Prono", name: "Prono", standalone: true });
  const { buildZoneTriggerReminderResolution } = await import("../src/reminderResolutionCore.js");
  const resolution = buildZoneTriggerReminderResolution({
    activation: { id: "a1", instanceId: wind.instanceId, triggerId: trigger.id, resolution: "manual-save", ability: "str", dc: 15,
      effectType: "custom-aura", failureCondition: trigger.failureCondition },
    targetId: "mira", sourceId: "auril", sourceName: "Auril", dc: 15,
  });
  assert.deepEqual(resolution.outcomes.failed.actions, [{ kind: "condition", action: "apply", targetId: "mira", name: "Prono",
    options: { type: "automatic", sourceId: "auril", sourceName: "Auril", parentEffectId: "", manualRemoval: true, expiry: { mode: "manual" } } }]);
  // An HTML without the clause (before the correction) still parses: the push, without Prono.
  const html = (await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"))
    .replace(" e ha la condizione Prono.", ".");
  const older = (await importBossActionHTML(html)).abilities.find((entry) => entry.name === "Primal Blizzard");
  assert.equal(older.automation, "PARTIAL");
  assert.equal(older.auras[1].reminders[0].failureCondition, undefined);
  assert.doesNotMatch(older.auras[1].reminders[0].label, /Prono/);
});

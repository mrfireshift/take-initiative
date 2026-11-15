// The release of a readied attack spell in the attack console (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6d, decision P6):
// where it goes off (the console for the spells it records, the panel for the others) and when an attack is a release
// (off the caster's turn, the very spell held). The command itself: test/pcAttackExecutionIntegration.test.js; the
// console's slot and note: test/pcAttackPopover.test.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
  buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}), Command: class {} } });

const { readiedReleaseAttackAction } = await import("../src/spellbookCatalog.js");
const { pcAttackReadiedRelease } = await import("../src/pcAttackCore.js");
const { sanitizeQuickAction } = await import("../src/quickActionsCore.js");

const META = "com.thebigpicture.initiative/meta";
const wizard = (spellIds, extra = {}) => ({ characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds }, ...extra });
const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("where a readied spell goes off: the attack console for the spells it records, the spell panel for the others", () => {
  assert.equal(readiedReleaseAttackAction(wizard(["fire-bolt"]), "fire-bolt")?.id, "book-attack:cantrip", "the book's cantrip attack");
  assert.equal(readiedReleaseAttackAction(wizard(["scorching-ray"]), "scorching-ray")?.id, "book-attack:spell", "the book's attack spells");
  const ownCantrips = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt"] } });
  assert.equal(readiedReleaseAttackAction(wizard(["fire-bolt"], { quickActions: [ownCantrips] }), "fire-bolt")?.id, "cantrip", "the card's own first");
  assert.equal(readiedReleaseAttackAction(wizard(["vampiric-touch"]), "vampiric-touch"), null, "its touches follow a cast of the panel");
  const anyCantrip = sanitizeQuickAction({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } });
  assert.equal(readiedReleaseAttackAction(wizard(["tasha-lama-roboante"], { quickActions: [anyCantrip] }), "tasha-lama-roboante"), null,
    "woven into a weapon attack");
  assert.equal(readiedReleaseAttackAction(wizard(["fire-bolt"], { quickActions: [anyCantrip] }), "fire-bolt")?.id, "cantrip",
    "the same action records Fire Bolt");
  assert.equal(readiedReleaseAttackAction(wizard(["fireball"]), "fireball"), null, "no attack roll: the panel");
  assert.equal(readiedReleaseAttackAction(null, "fire-bolt"), null, "no sheet");
});

test("a spell the panel only records (the console's) is still readied for real: the pill and the concentration on the caster", async () => {
  const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
  const { buildSpellUnifiedLifecycleRequest } = await import("../src/spellUnifiedLifecycleAdapter.js");
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  for (const spellId of ["scorching-ray", "fire-bolt", "inflict-wounds"]) {
    assert.equal(buildSpellUnifiedPanelContract({ spellId }).execution.recordOnly, true, `${spellId}: its cast is recorded, the console resolves it`);
    const hold = buildSpellUnifiedPanelContract({ spellId, phase: "prepare", castContext: { slotLevel: 3 } });
    assert.equal(hold.execution.recordOnly, false, `${spellId}: its hold is a hold`);
    const request = buildSpellUnifiedLifecycleRequest({ contract: hold, spell: getSpellDefinition(spellId),
      session: createSpellPanelSession({ contract: hold, phase: "prepare", casterId: "aria", castContext: { slotLevel: 3 } }) });
    assert.deepEqual([request.recordOnly, request.phasePlan.readied, request.castContext.readied], [undefined, true, true]);
  }
});

test("an attack is a release off the caster's turn, with the very spell it holds", () => {
  const caster = (conditions) => ({ id: "aria", metadata: { [META]: { conditions,
    "com.thebigpicture.initiative/spells": [{ instanceId: "hold-1", spellId: "scorching-ray", name: "Raggio rovente",
      castContext: { readied: true, phase: "prepare", slotLevel: 3 } }] } } });
  const pill = [{ id: "pill-1", condition: "Azione preparata", parentEffectId: "hold-1", active: true }];
  const offTurn = { round: 2, order: ["aria", "ghoul"], current: 1 };
  assert.deepEqual(pcAttackReadiedRelease({ sourceItem: caster({ version: 2, instances: pill }), spellId: "scorching-ray", turnState: offTurn }),
    { instanceId: "hold-1", spellId: "scorching-ray", name: "Raggio rovente", slotLevel: 3 });
  assert.equal(pcAttackReadiedRelease({ sourceItem: caster(pill), spellId: "scorching-ray", turnState: offTurn })?.instanceId, "hold-1",
    "the older list of instances");
  assert.equal(pcAttackReadiedRelease({ sourceItem: caster({ instances: pill }), spellId: "scorching-ray", turnState: { ...offTurn, current: 0 } }), null,
    "its own turn");
  assert.equal(pcAttackReadiedRelease({ sourceItem: caster({ instances: pill }), spellId: "guiding-bolt", turnState: offTurn }), null, "another spell");
  assert.equal(pcAttackReadiedRelease({ sourceItem: caster({ instances: [] }), spellId: "scorching-ray", turnState: offTurn }), null, "no readied action");
});

test("the card's menu and the pill's ⚡ open the console on the spell's attack, the panel otherwise", () => {
  const tracker = source("initiativeList.js");
  const handler = tracker.slice(tracker.indexOf("async function __releaseReadiedSpellFromContext"));
  const body = handler.slice(0, handler.indexOf("\n}"));
  assert.ok(body.indexOf("readiedReleaseAttackAction(caster?.metadata?.[`${ID}/meta`]?.initiativeCard, hold.spellId)") > 0);
  assert.ok(body.indexOf("await openPcAttackPopover(casterId, attackAction.id, hold.spellId);") < body.indexOf("await openCardSpellsPopup(entry"),
    "the console first, the panel otherwise");
  const pill = source("spell-pill-actions.js");
  assert.ok(pill.includes("const attackAction = readiedReleaseAttackAction(card, spellId);"));
  assert.ok(pill.includes("if (action?.readied === true && await openReadiedReleaseInConsole(context)) {"));
});

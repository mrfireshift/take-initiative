import assert from "node:assert/strict";
import test from "node:test";

const core = await import("../src/bossActionsViewCore.js").catch(() => ({}));
const META_KEY = "com.thebigpicture.initiative/meta";
function creature(id, name = id, extra = {}) {
  return { id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META_KEY]: { inInitiative: true, hp: 40, hpMax: 40 } }, ...extra };
}
const icekiss = {
  id: "icekiss", name: "Icekiss", category: "action", automation: "SUPPORTED", rawText: "Melee or Ranged Spell Attack.",
  execution: { kind: "attack-damage", attack: { modes: ["melee", "ranged"], bonus: 11, reach: 5, range: [60, 120] }, damage: [{ id: "piercing", formula: "2d6+5", printedAverage: 12, type: "piercing" }, { id: "cold", formula: "3d6", printedAverage: 10, type: "cold" }] },
};
const blizzard = {
  id: "blizzard", name: "Blizzard", category: "epic-action", automation: "PARTIAL", rawText: "DC 19 Strength save, cold and thunder damage; pushed 20 feet.", manualText: "The target is pushed 20 feet away.",
  execution: { kind: "save-damage", save: { ability: "str", dc: 19 }, success: "half", damage: [{ id: "cold", formula: "2d8", average: 9, type: "cold" }, { id: "thunder", formula: "2d8", average: 9, type: "thunder" }] },
};

test("target choices contain tracked real creatures and exclude source, attachments and virtual IDs", () => {
  const targets = core.bossActionTargets?.([
    creature("boss"), creature("z", "Zara"), creature("a", "Aria"),
    creature("__EPIC__:boss:1"), creature("boss::p2"), creature("__LAIR__"),
    creature("bar", "Bar", { attachedTo: "a" }), creature("drawing", "Drawing", { type: "SHAPE" }),
    creature("map", "Map", { layer: "MAP" }), creature("untracked", "Untracked", { metadata: { [META_KEY]: {} } }),
  ], "boss");
  assert.deepEqual(targets?.map((item) => item.id), ["a", "z"]);
  assert.equal(core.isBossActionSourceItem?.(creature("boss")), true);
  assert.equal(core.isBossActionSourceItem?.(creature("__EPIC__:boss:1")), false);
});

test("ability groups preserve unknown abilities as manual references", () => {
  const unusual = { id: "passive", name: "Ice form", category: "future-category", rawText: "Never automate this." };
  const groups = core.bossActionGroups?.({ abilities: [icekiss, unusual, blizzard, { id: "trait", category: "trait" }] });
  assert.deepEqual(groups?.map((group) => [group.category, group.abilities.map((action) => action.id)]), [["trait", ["trait"]], ["action", ["icekiss"]], ["epic-action", ["blizzard"]], ["other", ["passive"]]]);
});

test("unknown and unsupported executions cannot open a mutation workflow", () => {
  assert.equal(core.bossActionExecutionKind?.({ ...icekiss, automation: "UNSUPPORTED" }), "");
  assert.equal(core.bossActionExecutionKind?.({ ...icekiss, execution: { kind: "forced-movement" } }), "");
  assert.equal(core.bossActionExecutionKind?.({ automation: "PARTIAL", execution: { kind: "spell-reference", spellId: "slow" } }), "spell-reference");
  assert.equal(core.bossActionExecutionKind?.({ automation: "PARTIAL", execution: { kind: "spell-reference", spellId: "wish" } }), "");
  assert.equal(core.validateBossActionSelection?.({ sourceId: "boss", action: { ...icekiss, execution: { kind: "unknown" } } })?.ok, false);
});

test("partial remainder remains visible without losing source markup or manual spells", () => {
  assert.equal(core.bossActionManualText?.(blizzard), "The target is pushed 20 feet away.");
  const rawText = '<script>alert("x")</script> Additional spells are manual.';
  assert.equal(core.bossActionManualText?.({ automation: "PARTIAL", rawText }), rawText);
  assert.equal(core.bossActionManualText?.({ automation: "UNSUPPORTED", rawText }), rawText);
});

test("damage defaults preserve printed averages and use derived averages when the source omits them", () => {
  assert.deepEqual(core.bossActionDamageComponents?.(icekiss)?.map((component) => component.defaultAmount), [12, 10]);
  assert.deepEqual(core.bossActionDamageComponents?.(blizzard)?.map((component) => component.defaultAmount), [9, 9]);
  assert.equal(core.bossActionDamageComponents?.({ execution: { damage: [{ id: "cold", formula: "1d8", type: "cold" }] } })?.[0]?.defaultAmount, "");
});

test("attack confirmation requires a real offered target, a supported mode and explicit hit result", () => {
  const input = { sourceId: "boss", action: icekiss, targetId: "target", targets: [creature("target")], mode: "melee", outcome: "hit", componentAmounts: { piercing: "12", cold: "10" } };
  assert.deepEqual(core.validateBossActionSelection?.(input), { ok: true, value: { sourceId: "boss", actionId: "icekiss", targetId: "target", mode: "melee", outcome: "hit", componentAmounts: { piercing: 12, cold: 10 } } });
  for (const patch of [{ targetId: "__EPIC__:target:1" }, { targetId: "missing" }, { mode: "ranged-unknown" }, { outcome: "" }, { sourceId: "__LAIR__" }]) {
    assert.equal(core.validateBossActionSelection?.({ ...input, ...patch })?.ok, false);
  }
});

test("damage confirmation rejects missing, negative, fractional and nonfinite component values", () => {
  const input = { sourceId: "boss", action: icekiss, targetId: "target", targets: [creature("target")], mode: "ranged", outcome: "hit" };
  for (const value of ["", "-1", "2.5", "Infinity", "not-a-roll", null]) {
    assert.equal(core.validateBossActionSelection?.({ ...input, componentAmounts: { piercing: value, cold: 10 } })?.ok, false);
  }
  assert.equal(core.validateBossActionSelection?.({ ...input, componentAmounts: { piercing: 0, cold: 0 } })?.ok, true);
});

test("Critico travels with a hit only, never with a miss or a save", () => {
  const input = { sourceId: "boss", action: icekiss, targetId: "target", targets: [creature("target")], mode: "melee", componentAmounts: { piercing: 24, cold: 20 } };
  assert.equal(core.validateBossActionSelection?.({ ...input, outcome: "hit", critical: true })?.value?.critical, true);
  assert.equal(core.validateBossActionSelection?.({ ...input, outcome: "hit" })?.value?.critical, undefined);
  assert.equal(core.validateBossActionSelection?.({ ...input, outcome: "miss", critical: true })?.value?.critical, undefined);
});

test("a miss needs no damage values and cannot accidentally commit draft damage", () => {
  const result = core.validateBossActionSelection?.({ sourceId: "boss", action: icekiss, targetId: "target", targets: [creature("target")], mode: "ranged", outcome: "miss", componentAmounts: { piercing: 99, cold: "" } });
  assert.deepEqual(result?.value?.componentAmounts, {});
  assert.equal(result?.ok, true);
});

test("save confirmation preserves entered components and sends success outcome without pre-halving", () => {
  const input = { sourceId: "boss", action: blizzard, targetId: "target", targets: [creature("target")], outcome: "passed", componentAmounts: { cold: "9", thunder: "9" } };
  assert.deepEqual(core.validateBossActionSelection?.(input)?.value, { sourceId: "boss", actionId: "blizzard", targetId: "target", mode: "", outcome: "passed", componentAmounts: { cold: 9, thunder: 9 } });
  assert.equal(core.validateBossActionSelection?.({ ...input, outcome: "hit" })?.ok, false);
});


test("ranged attack summaries omit absent reach and long range",()=>{
  const action={execution:{attack:{bonus:11,modes:["ranged"],range:{normal:120}}}};
  assert.equal(core.bossActionAttackSummary?.(action),"Attacco +11 · Distanza · gittata 120 ft. (verifica manuale)");
  assert.equal(core.bossActionAttackSummary?.({execution:{attack:{bonus:10,modes:["ranged"],range:{normal:50,long:100}}}}),"Attacco +10 · Distanza · gittata 50/100 ft. (verifica manuale)");
});

test("a partial attack prerequisite requires explicit manual confirmation",()=>{
  const action={...icekiss,automation:"PARTIAL",manualText:"Only while Gather the Winter Sky is active."};
  const input={sourceId:"boss",action,targetId:"target",targets:[creature("target")],mode:"ranged",outcome:"hit",componentAmounts:{piercing:12,cold:10}};
  assert.equal(core.validateBossActionSelection?.(input)?.ok,false);
  const result=core.validateBossActionSelection?.({...input,manualConfirmed:true});assert.equal(result?.ok,true);assert.equal(result?.value?.manualConfirmed,true);
  assert.equal(core.validateBossActionSelection?.({...input,manualConfirmed:"true"})?.ok,false);
});

test("result summary keeps components separate and reports miss, HP and resource use", async () => {
  const { bossActionResultSummary } = await import("../src/bossActionsViewCore.js");
  assert.equal(bossActionResultSummary({ target: { id: "dars", name: "Dars" }, outcome: "miss", damageComponents: [{ type: "cold", amount: 0 }] }), "Dars · mancato · nessun danno");
  assert.equal(bossActionResultSummary({ target: { id: "m", name: "Mira" }, outcome: "passed", damageComponents: [{ type: "bludgeoning", amount: 4 }, { type: "cold", amount: 4 }],
    hpChange: { before: 45, after: 37, hpMax: 45 }, resources: [{ afterUsed: 1, limit: 1, period: "round", round: 2 }] }),
  "Mira · TS superato · 8 danni (contundenti 4 + freddo 4) · PF 45 → 37/45 · uso 1/1 nel round 2");
});

test("automation summary is derived from execution data and stays empty for manual abilities", async () => {
  const { bossActionAutomationSummary } = await import("../src/bossActionsViewCore.js");
  assert.equal(bossActionAutomationSummary({ automation: "UNSUPPORTED", rawText: "x" }), null);
  const rock = { id: "rock", automation: "PARTIAL", manualText: "Gather", execution: { kind: "attack-damage", attack: { modes: ["ranged"] }, damage: [] } };
  const summary = bossActionAutomationSummary(rock, { tracked: false });
  assert.match(summary.automatic, /danni per tipo/);
  assert.doesNotMatch(summary.automatic, /uso/);
  assert.match(summary.manual, /prerequisito da confermare/);
  const blizzard = { id: "b", automation: "PARTIAL", manualText: "spinto", execution: { kind: "save-damage", save: {}, damage: [] } };
  assert.match(bossActionAutomationSummary(blizzard, { tracked: true, limit: 1, period: "round" }).automatic, /uso 1\/round registrato/);
});

test("selection target excludes boss, attachments and untracked items and never picks the first of many", async () => {
  const { bossSelectionTarget } = await import("../src/bossActionsViewCore.js");
  const item = (id, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META_KEY]: { inInitiative: true } }, ...extra });
  assert.equal(bossSelectionTarget([], "boss").status, "none");
  assert.equal(bossSelectionTarget([item("boss")], "boss").status, "boss");
  assert.equal(bossSelectionTarget([item("bar", { attachedTo: "boss", layer: "ATTACHMENT" })], "boss").status, "invalid");
  assert.equal(bossSelectionTarget([item("npc", { metadata: { [META_KEY]: {} } })], "boss").status, "untracked");
  assert.equal(bossSelectionTarget([item("boss"), item("dars")], "boss").target.id, "dars");
  const many = bossSelectionTarget([item("dars"), item("mira")], "boss");
  assert.equal(many.status, "multiple"); assert.equal(many.target, null); assert.equal(many.candidates.length, 2);
});

test("draft target follows a single selection only while pristine", async () => {
  const { reconcileBossDraftTarget } = await import("../src/bossActionsViewCore.js");
  const single = (id) => ({ status: "single", target: { id }, candidates: [{ id }] });
  assert.equal(reconcileBossDraftTarget({ targetId: "a", locked: false }, single("b")).targetId, "b");
  assert.equal(reconcileBossDraftTarget({ targetId: "a", locked: false }, { status: "none", candidates: [] }).targetId, null);
  const locked = reconcileBossDraftTarget({ targetId: "a", locked: true }, single("b"));
  assert.equal(locked.targetId, "a"); assert.equal(locked.suggestion.id, "b");
  assert.equal(reconcileBossDraftTarget({ targetId: "a", locked: true }, single("a")).suggestion, null);
  assert.equal(reconcileBossDraftTarget({ targetId: null, locked: true }, single("b")).targetId, "b", "no decision moves between creatures");
  assert.equal(reconcileBossDraftTarget({ targetId: "a", locked: true }, { status: "none", candidates: [] }).targetId, "a");
});

test("row meta, labels and damage total use shared halving", async () => {
  const { bossActionRowMeta, bossDamageTotal, bossAbilityLabel, bossPhaseLabel } = await import("../src/bossActionsViewCore.js");
  const blizzard = { automation: "PARTIAL", usage: { limit: 1, period: "round" }, execution: { kind: "save-damage", save: { ability: "str", dc: 15 } } };
  assert.deepEqual(bossActionRowMeta(blizzard, { tracked: true, available: true, remaining: 1, limit: 1, period: "round" }), { kind: "save-damage", tag: "TS FOR 15", badge: "1/1 round", exhausted: false });
  assert.equal(bossActionRowMeta(blizzard, { tracked: true, available: false, remaining: 0, limit: 1, period: "round" }).badge, "Esaurita");
  assert.equal(bossActionRowMeta({ automation: "UNSUPPORTED", usage: { note: "Special Recharge" } }).badge, "Ricarica");
  const parts = [{ id: "b" }, { id: "c" }];
  assert.equal(bossDamageTotal(parts, { b: "9", c: "9" }, "failed"), 18);
  assert.equal(bossDamageTotal(parts, { b: "9", c: "9" }, "passed"), 8);
  assert.equal(bossDamageTotal(parts, { b: "9", c: "9" }, "miss"), 0);
  assert.equal(bossAbilityLabel("wis"), "SAG"); assert.equal(bossPhaseLabel("fase3"), "Fase 3"); assert.equal(bossPhaseLabel("custom"), "custom");
});

test("group draft rule: pristine follows the selection, locked offers it, never transfers silently", async () => {
  const { reconcileBossDraftGroup, bossGroupApplyBlocker } = await import("../src/bossActionsViewCore.js");
  const selection = (...ids) => ({ candidates: ids.map((id) => ({ id })) });
  assert.deepEqual(reconcileBossDraftGroup({ targetIds: ["a"], locked: false }, selection("b", "c", "b")), { targetIds: ["b", "c"], suggestion: null });
  assert.deepEqual(reconcileBossDraftGroup({ targetIds: ["a", "b"], locked: true }, selection("c")), { targetIds: ["a", "b"], suggestion: ["c"] });
  assert.deepEqual(reconcileBossDraftGroup({ targetIds: ["a", "b"], locked: true }, selection("b", "a")), { targetIds: ["a", "b"], suggestion: null });
  assert.deepEqual(reconcileBossDraftGroup({ targetIds: ["a"], locked: true }, selection()), { targetIds: ["a"], suggestion: null });
  assert.deepEqual(reconcileBossDraftGroup({ targetIds: [], locked: true }, selection("d")), { targetIds: ["d"], suggestion: null });
  assert.match(bossGroupApplyBlocker({ targetIds: [] }), /Seleziona/);
  assert.match(bossGroupApplyBlocker({ targetIds: ["a", "b"], outcomes: { a: "failed" } }), /1 bersaglio/);
  assert.match(bossGroupApplyBlocker({ targetIds: ["a"], outcomes: { a: "failed" } }), /Conferma/);
  assert.equal(bossGroupApplyBlocker({ targetIds: ["a"], outcomes: { a: "passed" }, manualConfirmed: true }), "");
});

test("group validation requires tracked creatures, every outcome, confirmation and both base amounts", async () => {
  const { validateBossActionGroupSelection, bossActionExecutionKind, bossActionResultSummary } = await import("../src/bossActionsViewCore.js");
  const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
  const { readFile } = await import("node:fs/promises");
  const profile = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
  const action = profile.abilities.find((entry) => entry.name === "Breath of the Long Night");
  assert.equal(bossActionExecutionKind(action), "group-save");
  const tracked = (id) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META_KEY]: { inInitiative: true } } });
  const base = { sourceId: "auril", action, targets: [tracked("auril"), tracked("dars"), tracked("mira")], targetIds: ["dars", "mira", "dars"],
    outcomes: { dars: "failed", mira: "passed" }, componentAmounts: { cold: "33", necrotic: "13" }, manualConfirmed: true,
    area: { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 9, y: 0 }, areaTargetIds: ["dars", "mira"] } };
  const ok = validateBossActionGroupSelection(base);
  assert.deepEqual(ok.value, { sourceId: "auril", actionId: action.id, targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "passed" },
    componentAmounts: { cold: 33, necrotic: 13 }, manualConfirmed: true, areaPlacement: base.area });
  assert.match(validateBossActionGroupSelection({ ...base, area: null }).error, /Disegna il cono/);
  assert.equal(validateBossActionGroupSelection({ ...base, targetIds: ["auril"], outcomes: { auril: "failed" } }).ok, false);
  assert.equal(validateBossActionGroupSelection({ ...base, outcomes: { dars: "failed" } }).ok, false);
  // v20: Breath's recharge and sequence come from the round log, not from a manual confirmation.
  assert.equal(validateBossActionGroupSelection({ ...base, manualConfirmed: false }).ok, true);
  assert.equal(validateBossActionGroupSelection({ ...base, componentAmounts: { cold: "33", necrotic: "" } }).ok, false);
  assert.equal(bossActionResultSummary({ groupTargets: [{ id: "dars", name: "Dars", outcome: "failed", damage: 46, hpBefore: 60, hpAfter: 14, conditions: ["Accecato"] },
    { id: "mira", name: "Mira", outcome: "passed", damage: 22, hpBefore: 45, hpAfter: 23, conditions: [] }] }),
  "Dars · TS fallito · 46 danni · PF 60 → 14 · Accecato\nMira · TS superato · 22 danni · PF 45 → 23");
});

test("area group: steps block in order and the map selection only adds after a drawing", async () => {
  const { bossGroupApplyBlocker, reconcileBossAreaGroup } = await import("../src/bossActionsViewCore.js");
  const area = { areaTargetIds: ["a"] };
  assert.match(bossGroupApplyBlocker({ areaRequired: true, targetIds: [] }), /Conferma ricarica/);
  assert.match(bossGroupApplyBlocker({ areaRequired: true, manualConfirmed: true }), /Disegna il cono/);
  assert.match(bossGroupApplyBlocker({ areaRequired: true, manualConfirmed: true, area, targetIds: [] }), /Nessuna creatura/);
  assert.match(bossGroupApplyBlocker({ areaRequired: true, manualConfirmed: true, area, targetIds: ["a"] }), /Manca l’esito/);
  assert.equal(bossGroupApplyBlocker({ areaRequired: true, manualConfirmed: true, area, targetIds: ["a"], outcomes: { a: "passed" } }), "");
  const selection = { candidates: [{ id: "a" }, { id: "b" }] };
  assert.deepEqual(reconcileBossAreaGroup({ targetIds: [], area: null }, selection), { targetIds: [], suggestion: null }, "no group before drawing");
  assert.deepEqual(reconcileBossAreaGroup({ targetIds: ["a"], area }, selection), { targetIds: ["a"], suggestion: ["b"] });
  assert.deepEqual(reconcileBossAreaGroup({ targetIds: ["a", "b"], area }, selection), { targetIds: ["a", "b"], suggestion: null });
});

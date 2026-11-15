// Help and Hide in the attack console's Azioni tab, and the pills an attack roll spends (lot T2 of
// docs/STUDIO_AZIONI_DI_TURNO.md, decisions D6, D7, D11, A4, A5).
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  HELPED_CONDITION, HELP_TARGET_CONDITION, HIDDEN_CONDITION, PC_HELP_MODES, buildPcTurnActionMutation, pcAttackTargetNotes, pcTurnActionBlocker,
} = await import("../src/pcAttackTurnActionCore.js");
const { advantagePillAppliesTo, consumedAdvantagePills, hiddenPills, nextAttackAdvantagePills } = await import("../src/attackAdvantagePillsCore.js");
const { buildPcAttackMutation, pcAttackLinkEnds, pcAttackResolvedAction } = await import("../src/pcAttackCore.js");
const { buildPcManeuverMutation } = await import("../src/pcAttackManeuverCore.js");
const { projectSceneItemEffects, projectTrackerEntry } = await import("../src/options/optionsProjection.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const creature = (id, meta = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "IMAGE", layer: "CHARACTER",
  position: { x: 0, y: 0 }, metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, attitude: "pc", ...meta } } });
const pill = (condition, extra = {}) => ({ id: `${condition}-1`, condition, sourceId: "aria", active: true, ...extra });
const turnState = { round: 2, order: ["aria", "ghoul", "mira"], current: 0 };
const aria = creature("aria");
const ghoul = creature("ghoul", { attitude: "enemy" });
const mira = creature("mira");
const plan = (kind, extra = {}) => buildPcTurnActionMutation({ kind, sourceItem: aria, attackInstanceId: `${kind}-1`, turnState, ...extra });
const sword = { id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing" }] };
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
const helped = (meta = {}) => creature("ghoul", { attitude: "enemy", conditions: { instances: [pill(HELP_TARGET_CONDITION)] }, ...meta });

test("Aiuto: what it helps and whom, never itself, once per creature from the same helper; on its own turn", () => {
  assert.deepEqual(PC_HELP_MODES, ["check", "attack"]);
  const blocker = (extra) => pcTurnActionBlocker({ kind: "help", sourceItem: aria, turnState, ...extra });
  assert.match(blocker({ targetItem: ghoul }), /Scegli se aiuta una prova o un attacco/);
  assert.match(blocker({ mode: "attack" }), /Scegli il nemico/);
  assert.match(blocker({ mode: "check" }), /Scegli l'alleato da aiutare/);
  assert.match(blocker({ mode: "check", targetItem: aria }), /Si aiuta un'altra creatura/);
  assert.equal(blocker({ mode: "attack", targetItem: ghoul }), "");
  assert.match(blocker({ mode: "attack", targetItem: helped() }), /Ghoul ha già il suo aiuto/);
  assert.equal(blocker({ mode: "attack", targetItem: helped({ conditions: { instances: [pill(HELP_TARGET_CONDITION, { sourceId: "mira" })] } }) }), "",
    "another helper's");
  assert.match(pcTurnActionBlocker({ kind: "help", sourceItem: mira, turnState, mode: "check", targetItem: aria }), /Solo nel turno della creatura/);
});

test("Aiuto in un attacco: «Bersaglio dell'aiuto» on the enemy, from the helper, until the start of the helper's next turn", () => {
  const help = plan("help", { targetItem: ghoul, mode: "attack" });
  const [add, automate] = help.operations;
  assert.deepEqual([add.type, add.conditionName, add.targetIds, add.options.sourceId], ["condition:add", HELP_TARGET_CONDITION, ["ghoul"], "aria"]);
  assert.deepEqual(add.options.expiry, { mode: "turn-start", actor: "source", remaining: 1 });
  assert.match(add.options.effectDetail, /Il primo attacco di un alleato di Aria/);
  assert.deepEqual(automate, { type: "condition:automate", subjectIds: ["ghoul"] });
  assert.deepEqual([help.options.label, help.options.targetIds, help.labelTargetIds], ["Aria: Aiuto → Ghoul", ["ghoul"], ["ghoul"]]);
  assert.deepEqual(help.causality.turnAction, { kind: "help", condition: HELP_TARGET_CONDITION, mode: "attack" });
  assert.deepEqual(help.causality.targets.map((target) => target.id), ["ghoul"]);
  assert.equal(help.causality.actor.id, "aria");
});

test("Aiuto in una prova: «Aiutato» on the ally, removed by hand after the check", () => {
  const help = plan("help", { targetItem: mira, mode: "check" });
  const [add] = help.operations;
  assert.deepEqual([add.conditionName, add.targetIds, add.options.sourceId, add.options.manualRemoval], [HELPED_CONDITION, ["mira"], "aria", true]);
  assert.deepEqual(add.options.expiry, { mode: "turn-start", actor: "source", remaining: 1 });
  assert.match(add.options.effectDetail, /Togli la pill dopo la prova/);
  assert.deepEqual(help.causality.turnAction, { kind: "help", condition: HELPED_CONDITION, mode: "check" });
});

test("Nascondersi: «Nascosto» on the creature until removed, with the Stealth total if given; an enemy's only for the GM", () => {
  const hidden = plan("hide", { stealth: "17" });
  const [add] = hidden.operations;
  assert.deepEqual([add.conditionName, add.targetIds, add.options.sourceId], [HIDDEN_CONDITION, ["aria"], "aria"]);
  assert.deepEqual(add.options.expiry, { mode: "manual" });
  assert.equal(add.options.displayLabel, "Nascosto · Furtività 17");
  assert.equal(add.options.mechanics, undefined, "a PC's: everybody sees it");
  assert.deepEqual(hidden.causality.turnAction, { kind: "hide", condition: HIDDEN_CONDITION, stealth: 17 });
  const bare = plan("hide");
  assert.equal(bare.operations[0].options.displayLabel, undefined);
  assert.deepEqual(bare.causality.turnAction, { kind: "hide", condition: HIDDEN_CONDITION });
  const enemy = buildPcTurnActionMutation({ kind: "hide", sourceItem: ghoul, attackInstanceId: "hide-g", turnState: { ...turnState, current: 1 } });
  assert.deepEqual(enemy.operations[0].options.mechanics, { gmOnly: true }, "D11");
  const blocker = (stealth, sourceItem = aria) => pcTurnActionBlocker({ kind: "hide", sourceItem, turnState, stealth });
  assert.equal(blocker(""), "");
  assert.equal(blocker("0"), "");
  assert.match(blocker("61"), /Furtività: un numero intero da 0 a 60/);
  assert.match(blocker("12.5"), /Furtività/);
  assert.match(blocker("tanto"), /Furtività/);
  assert.match(blocker("", creature("aria", { conditions: { instances: [pill(HIDDEN_CONDITION)] } })), /È già nascosto/);
});

test("an enemy's Hidden never reaches the players: tracker and map", () => {
  const instances = [pill(HIDDEN_CONDITION, { sourceId: "ghoul", mechanics: { gmOnly: true } }), pill("Prono", { sourceId: "ghoul" })];
  const token = creature("ghoul", { attitude: "enemy", conditions: { version: 2, instances } });
  const keys = { metaKey: META, spellsKey: SPELLS, concentrationKey: "conc" };
  const projected = projectSceneItemEffects(token, { role: "PLAYER", policy: {}, ...keys });
  assert.deepEqual(projected.metadata[META].conditions.instances.map((instance) => instance.condition), ["Prono"]);
  assert.equal(projectSceneItemEffects(token, { role: "GM", policy: {}, ...keys }), token, "the GM sees it");
  const summary = projectSceneItemEffects(creature("ghoul", { conditions: { version: 2, instances: [instances[0]] } }), { role: "PLAYER", policy: { conditions: "summary" }, ...keys });
  assert.deepEqual(summary.metadata[META].conditions.instances, [], "not even counted in a summary");
  const entry = projectTrackerEntry({ id: "ghoul", attitude: "enemy", conditions: { version: 2, instances } }, { role: "PLAYER" });
  assert.deepEqual(entry.conditions.instances.map((instance) => instance.condition), ["Prono"]);
});

test("the advantage pills: Help on an enemy, Distracting Strike, Guiding Bolt; who spends them", () => {
  const bolt = creature("ghoul", { attitude: "enemy", [SPELLS]: [{ instanceId: "bolt-inst", spellId: "guiding-bolt", casterId: "aria" }],
    conditions: { instances: [pill("Prossimo attacco: vantaggio", { id: "bolt-pill", parentEffectId: "bolt-inst" }),
      pill("Colpo Distraente", { id: "strike-pill", sourceId: "mira" }), pill(HELP_TARGET_CONDITION, { id: "help-pill" }), pill("Prono", { id: "prone" })] } });
  assert.deepEqual(nextAttackAdvantagePills(bolt).map((entry) => [entry.instance.id, entry.rule, entry.name]),
    [["bolt-pill", "any", "Dardo tracciante"], ["strike-pill", "other", "Colpo Distraente"], ["help-pill", "ally", "Aiuto"]]);
  const [boltPill, strike, help] = nextAttackAdvantagePills(bolt);
  const items = [aria, mira, bolt];
  assert.equal(advantagePillAppliesTo({ pill: boltPill, attackerItem: aria, items }), true, "Guiding Bolt: its caster too");
  assert.equal(advantagePillAppliesTo({ pill: strike, attackerItem: mira, items }), false, "Distracting Strike: not the fighter");
  assert.equal(advantagePillAppliesTo({ pill: strike, attackerItem: creature("orc", { attitude: "enemy" }), items }), true, "anyone else");
  assert.equal(advantagePillAppliesTo({ pill: help, attackerItem: aria, items }), false, "Help: not the helper");
  assert.equal(advantagePillAppliesTo({ pill: help, attackerItem: mira, items }), true, "the helper's ally");
  assert.equal(advantagePillAppliesTo({ pill: help, attackerItem: creature("orc", { attitude: "enemy" }), items }), false, "not the other side");
  assert.equal(advantagePillAppliesTo({ pill: help, attackerItem: creature("orc", { attitude: "enemy" }), items: [mira, bolt] }), true,
    "the helper gone from the scene: any other attacker");
  assert.deepEqual(consumedAdvantagePills({ attackerItem: mira, targetItem: bolt, items }).map((entry) => entry.instance.id), ["bolt-pill", "help-pill"]);
  assert.deepEqual(hiddenPills(creature("aria", { conditions: [pill(HIDDEN_CONDITION), pill("Prono")] })).map((instance) => instance.condition), [HIDDEN_CONDITION]);
});

test("an attack roll ends its attacker's Hidden and spends the target's advantage pill, in its own command", () => {
  const hiddenMira = creature("mira", { conditions: { instances: [pill(HIDDEN_CONDITION, { id: "hide-pill", sourceId: "mira" })] } });
  const ends = pcAttackLinkEnds({ sourceItem: hiddenMira, targetItem: helped(), linkItems: [aria], attackRoll: true });
  assert.deepEqual(ends.map((end) => [end.itemId, end.instanceId, end.condition, end.reason]), [
    ["mira", "hide-pill", HIDDEN_CONDITION, "Ha attaccato: non è più nascosto."],
    ["ghoul", `${HELP_TARGET_CONDITION}-1`, HELP_TARGET_CONDITION, "Vantaggio usato: Aiuto."],
  ]);
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: hiddenMira, targetItem: helped(), linkItems: [aria] }), [], "no attack roll, nothing");
  // A hit or a miss: the roll had the advantage either way.
  for (const outcome of ["hit", "miss"]) {
    const result = buildPcAttackMutation({ action: sword, sourceItem: hiddenMira, targetItem: helped(), outcome, componentAmounts: outcome === "hit" ? { c1: 6 } : {},
      attackInstanceId: `roll-${outcome}`, turnState, linkItems: [aria, hiddenMira, helped()] });
    const removal = result.operations.find((operation) => operation.type === "condition:remove-instances");
    assert.deepEqual(removal.removals, [{ itemId: "mira", instanceId: "hide-pill" }, { itemId: "ghoul", instanceId: `${HELP_TARGET_CONDITION}-1` }], outcome);
    assert.deepEqual(result.causality.linkEnds.map((end) => end.condition), [HIDDEN_CONDITION, HELP_TARGET_CONDITION]);
    assert.ok(["mira", "ghoul"].every((id) => result.options.targetIds.includes(id)));
  }
  // A save (Sacred Flame) has no attack roll: the pills stay.
  const save = buildPcAttackMutation({ action: cantrips, spellId: "sacred-flame", sourceItem: hiddenMira, targetItem: helped(), outcome: "passed",
    componentAmounts: {}, attackInstanceId: "save-1", turnState, linkItems: [aria] });
  assert.equal(save.operations.some((operation) => operation.type === "condition:remove-instances"), false);
  // The helper's own attack keeps its Help for the allies.
  const own = buildPcAttackMutation({ action: sword, sourceItem: aria, targetItem: helped(), outcome: "miss", componentAmounts: {},
    attackInstanceId: "own-1", turnState, linkItems: [aria, mira] });
  assert.equal(own.operations.some((operation) => operation.type === "condition:remove-instances"), false);
});

test("Grapple and Shove are attacks: they end the attacker's Hidden", () => {
  const hiddenAria = creature("aria", { conditions: { instances: [pill(HIDDEN_CONDITION, { id: "hide-pill" })] } });
  const shove = buildPcManeuverMutation({ kind: "shove", sourceItem: hiddenAria, targetItem: ghoul, outcome: "success", effect: "prone",
    attackInstanceId: "shove-1", turnState });
  assert.deepEqual(shove.operations.find((operation) => operation.type === "condition:remove-instances").removals, [{ itemId: "aria", instanceId: "hide-pill" }]);
  assert.deepEqual(shove.causality.linkEnds, [{ itemId: "aria", condition: HIDDEN_CONDITION, reason: "Ha attaccato: non è più nascosto." }]);
  assert.ok(shove.options.targetIds.includes("aria"));
  const grapple = buildPcManeuverMutation({ kind: "grapple", sourceItem: hiddenAria, targetItem: ghoul, outcome: "failure", attackInstanceId: "grapple-1", turnState });
  assert.deepEqual(grapple.operations.find((operation) => operation.type === "condition:remove-instances").removals, [{ itemId: "aria", instanceId: "hide-pill" }],
    "a failed one too");
  const plain = buildPcManeuverMutation({ kind: "grapple", sourceItem: aria, targetItem: ghoul, outcome: "failure", attackInstanceId: "grapple-2", turnState });
  assert.equal(plain.operations.some((operation) => operation.type === "condition:remove-instances"), false);
});

test("the console reminds the advantage and the disadvantage of Hidden and of the pills, never for a save", () => {
  const attack = pcAttackResolvedAction(sword);
  const hiddenAria = creature("aria", { conditions: { instances: [pill(HIDDEN_CONDITION)] } });
  assert.deepEqual(pcAttackTargetNotes({ attack, targetItem: ghoul, sourceItem: hiddenAria, items: [hiddenAria, ghoul] }),
    ["Nascosto: vantaggio all'attacco; attaccando si rivela."]);
  const hiddenGhoul = creature("ghoul", { attitude: "enemy", conditions: { instances: [pill(HIDDEN_CONDITION, { sourceId: "ghoul" })] } });
  assert.deepEqual(pcAttackTargetNotes({ attack, targetItem: hiddenGhoul, sourceItem: aria, items: [aria, hiddenGhoul] }),
    ["Bersaglio nascosto: svantaggio all'attacco, se chi attacca non lo vede."]);
  assert.deepEqual(pcAttackTargetNotes({ attack, targetItem: helped(), sourceItem: mira, items: [aria, mira] }),
    ["Aiuto: vantaggio all'attacco; registrato, la pill si toglie."]);
  assert.deepEqual(pcAttackTargetNotes({ attack, targetItem: helped(), sourceItem: aria, items: [aria, mira] }), [], "the helper's own attack");
  assert.deepEqual(pcAttackTargetNotes({ attack: pcAttackResolvedAction(cantrips, "sacred-flame"), targetItem: helped(), sourceItem: mira, items: [aria, mira] }), []);
});

test("the Combat Log says what Help and Hide left", () => {
  const lines = (built) => {
    const event = { id: "e", sessionId: "s", sequence: 1, version: 3, at: 1, source: "automatic", kind: "pc-attack", category: "attack",
      action: "change", label: built.options.label, payload: built.options.history.payload, targets: built.causality.targets };
    return buildCombatLogPresentation({ id: "s" }, [event]).events[0].details.flatMap((section) => section.lines).join(" | ");
  };
  assert.match(lines(plan("help", { targetItem: ghoul, mode: "attack" })), /Azione: Aiuto in un attacco · vantaggio al primo attacco di un alleato contro la creatura/);
  assert.match(lines(plan("help", { targetItem: mira, mode: "check" })), /Azione: Aiuto in una prova · vantaggio alla prossima prova del compito/);
  assert.match(lines(plan("hide", { stealth: 14 })), /Azione: Nascondersi · Furtività 14/);
  assert.match(lines(plan("hide")), /Azione: Nascondersi · senza il totale di Furtività/);
});

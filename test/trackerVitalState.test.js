// Lot L4 of the tracker UI study (docs/STUDIO_UI_TRACKER_BG3.md, D3a and D3b of 18/11): a card shows a creature's life
// for every viewer. KO for a PC at 0 HP and a creature Privo di sensi, the skull and a grey card for the dead, the death
// saves where a PC's empty bar was, concentration as a C on the compact portrait.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDeadByCondition,
  trackerDeathSaves,
  trackerVitalState,
  trackerVitalStateAtZero,
  VITAL_STATE,
} from "../src/trackerVitalStateCore.js";
import { projectTrackerEntry } from "../src/options/optionsProjection.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectTrackerProjectionPolicy } from "../src/options/optionsSelectors.js";
import {
  buildCompactCardHP,
  buildCompactConcentrationBadge,
  buildDeathSavePips,
  buildVitalStateBadge,
  compactKnockedOutBadgeStyle,
  DEAD_CARD_FILTER,
  deriveCompactCardPresentation,
} from "../src/initiativeCardCompact.js";
import { deriveClassicCardPresentation } from "../src/initiativeCardClassic.js";

const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const classicBuilder = readFileSync(new URL("../src/initiativeCardClassicBuilder.js", import.meta.url), "utf8");

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        textContent: "",
        title: "",
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
      };
    },
  };
}

const conditions = (...names) => ({ instances: names.map((condition, index) => ({ id: `c${index}`, condition })) });

test("dead, down or alive: Morto, a PC at 0 HP, a creature Privo di sensi, any other creature at 0 HP", () => {
  assert.equal(trackerVitalState({ attitude: "pc", hp: 0, hpMax: 45 }), VITAL_STATE.DOWN);
  assert.equal(trackerVitalState({ attitude: "pc", hp: 0, hpMax: 45, conditions: conditions("Morto") }), VITAL_STATE.DEAD);
  assert.equal(trackerVitalState({ attitude: "enemy", hp: 0, hpMax: 7 }), VITAL_STATE.DEAD);
  assert.equal(trackerVitalState({ attitude: "ally", hp: -3, hpMax: 11 }), VITAL_STATE.DEAD);
  assert.equal(trackerVitalState({ attitude: "enemy", hp: 0, hpMax: 7, conditions: conditions("Privo di sensi") }), VITAL_STATE.DOWN);
  assert.equal(trackerVitalState({ attitude: "enemy", hp: 5, hpMax: 7 }), VITAL_STATE.ALIVE);
  assert.equal(trackerVitalState({ attitude: "enemy", hp: 5, hpMax: 7, conditions: conditions("Morto") }), VITAL_STATE.DEAD);
  assert.equal(trackerVitalState({ attitude: "enemy", hp: null, hpMax: null }), VITAL_STATE.ALIVE);
  // A condition switched off does not count.
  assert.equal(trackerVitalState({ attitude: "pc", hp: 3, hpMax: 9, conditions: { instances: [{ condition: "Morto", active: false }] } }), VITAL_STATE.ALIVE);

  assert.equal(trackerVitalStateAtZero({ attitude: "enemy" }), VITAL_STATE.DEAD);
  assert.equal(trackerVitalStateAtZero({ attitude: "pc" }), VITAL_STATE.DOWN);
  assert.equal(trackerVitalStateAtZero({ attitude: "enemy", conditions: conditions("Privo di sensi") }), VITAL_STATE.DOWN);
  assert.equal(isDeadByCondition(conditions("Morto")), true);
  assert.equal(isDeadByCondition(conditions("Prono")), false);
});

test("the death saves of a PC who is down and not stable, none for anyone else", () => {
  const deathSaves = { successes: 2, failures: 1 };
  assert.deepEqual(trackerDeathSaves({ attitude: "pc", vitalState: "down", deathSaves }), { successes: 2, failures: 1 });
  assert.deepEqual(trackerDeathSaves({ attitude: "pc", vitalState: "down" }), { successes: 0, failures: 0 });
  assert.equal(trackerDeathSaves({ attitude: "pc", vitalState: "down", conditions: conditions("Stabile"), deathSaves }), null);
  assert.equal(trackerDeathSaves({ attitude: "pc", vitalState: "dead", deathSaves }), null);
  assert.equal(trackerDeathSaves({ attitude: "enemy", vitalState: "down", deathSaves }), null);
  assert.equal(trackerDeathSaves({ attitude: "pc", vitalState: "alive", deathSaves }), null);
});

test("D3a: the players' projection strips the hidden HP and keeps that the creature is down", () => {
  const goblin = { id: "goblin", attitude: "enemy", hp: 0, hpMax: 7, vitalState: "dead", vitalStateAtZero: "dead" };
  const projected = projectTrackerEntry(goblin, { role: "PLAYER", hpPolicy: { trackerCompact: { enemy: "hidden" } }, surface: "trackerCompact" });
  assert.equal(projected.hp, null);
  assert.equal(projected.hpMax, null);
  assert.equal(projected.hpDisclosure.mode, "hidden");
  assert.equal(projected.vitalState, "dead");

  const brann = { id: "brann", attitude: "pc", hp: 0, hpMax: 45, vitalState: "down", deathSaves: { successes: 1, failures: 2 } };
  assert.deepEqual(projectTrackerEntry(brann, { role: "PLAYER" }).deathSaves, { successes: 1, failures: 2 });
  assert.equal(projectTrackerEntry(brann, { role: "PLAYER", deathSaves: false }).deathSaves, null);
  // The GM's entry is not projected.
  assert.deepEqual(projectTrackerEntry(brann, { role: "GM", deathSaves: false }).deathSaves, { successes: 1, failures: 2 });

  assert.equal(selectTrackerProjectionPolicy(resolveOptions({ local: {}, room: {}, scene: {} })).deathSaves, true);
  assert.equal(selectTrackerProjectionPolicy(resolveOptions({ local: {}, room: { playerView: { reminders: { showDeathSaves: false } } }, scene: {} })).deathSaves, false);
  assert.equal(selectTrackerProjectionPolicy(resolveOptions({ local: {}, room: { playerView: { reminders: { visibility: "hidden" } } }, scene: {} })).deathSaves, false);
});

test("the compact card: the skull for the dead even with hidden HP, KO and death saves for a PC who is down", () => {
  const hiddenDead = deriveCompactCardPresentation(
    { id: "goblin", attitude: "enemy", hp: null, hpMax: null, hpDisclosure: { mode: "hidden" }, vitalState: "dead" },
    null,
    { isGM: false },
  );
  assert.equal(hiddenDead.showHP, false);
  assert.equal(hiddenDead.knockedOut, true);
  assert.equal(hiddenDead.dead, true);
  assert.equal(hiddenDead.deathSaves, null);

  const downPC = deriveCompactCardPresentation(
    { id: "brann", attitude: "pc", hp: 0, hpMax: 45, vitalState: "down", deathSaves: { successes: 2, failures: 1 } },
    null,
    { isGM: true },
  );
  assert.equal(downPC.knockedOut, true);
  assert.equal(downPC.dead, false);
  assert.deepEqual(downPC.deathSaves, { successes: 2, failures: 1 });

  // A virtual turn never shows a state, even if its boss is down.
  assert.equal(deriveCompactCardPresentation({ id: "__EPIC__::a::after::b", attitude: "enemy", vitalState: "dead" }, null, { isGM: true, virtual: true }).knockedOut, false);

  const documentRef = createTestDocument();
  const { knockedOutBadge } = buildCompactCardHP(
    { id: "goblin", hpDisclosure: { mode: "hidden" } },
    { showHP: false, safeHP: 0, hpMax: 0, hpPercent: 0, knockedOut: true, dead: true, hpColorByPct: () => "#ef4444", documentRef },
  );
  assert.equal(knockedOutBadge.dataset.cardKoBadge, "1");
  assert.equal(knockedOutBadge.dataset.vitalState, "dead");
  assert.equal(knockedOutBadge.title, "Morto");
  assert.equal(knockedOutBadge.textContent, "");
  assert.equal(knockedOutBadge.children.length, 1);
  assert.match(knockedOutBadge.children[0].style.mask, /boss\.svg/);
  for (const [key, value] of Object.entries(compactKnockedOutBadgeStyle(49))) assert.equal(knockedOutBadge.style[key], value);

  const ko = buildVitalStateBadge("down", { title: "Fuori combattimento: 0 / 45", documentRef });
  assert.equal(ko.textContent, "KO");
  assert.equal(ko.title, "Fuori combattimento: 0 / 45");
  assert.equal(ko.dataset.vitalState, "down");
  assert.equal(DEAD_CARD_FILTER, "grayscale(.92) brightness(.6)");
});

test("the death-save marks: three successes, a divider, three failures, filled as rolled", () => {
  const row = buildDeathSavePips({ successes: 2, failures: 1 }, { size: 7, documentRef: createTestDocument() });
  assert.equal(row.dataset.deathSaves, "1");
  assert.equal(row.children.length, 7);
  const filled = row.children.map((pip) => pip.style.background);
  assert.deepEqual(filled.slice(0, 3), ["#22c55e", "#22c55e", "rgba(0,0,0,.55)"]);
  assert.deepEqual(filled.slice(4), ["#ef4444", "rgba(0,0,0,.55)", "rgba(0,0,0,.55)"]);
  assert.equal(row.title, "Tiri contro la morte: 2 successi, 1 fallimento");
  assert.equal(buildDeathSavePips(null, { documentRef: createTestDocument() }), null);
});

test("concentration on the compact portrait: a round C where a KO would sit", () => {
  const badge = buildCompactConcentrationBadge(49, { title: "Concentrazione: Animare oggetti", documentRef: createTestDocument() });
  assert.equal(badge.textContent, "C");
  assert.equal(badge.title, "Concentrazione: Animare oggetti");
  assert.equal(badge.dataset.cardConcentrationBadge, "1");
  assert.equal(badge.style.top, compactKnockedOutBadgeStyle(49).top);
  assert.equal(badge.style.width, "18px");
  assert.equal(badge.style.borderRadius, "50%");
});

test("the classic card follows the same state", () => {
  const dead = deriveClassicCardPresentation({ id: "goblin", attitude: "enemy", hpDisclosure: { mode: "hidden" }, vitalState: "dead" }, { isGM: false });
  assert.equal(dead.hpVisible, false);
  assert.equal(dead.knockedOut, true);
  assert.equal(dead.dead, true);
  const down = deriveClassicCardPresentation({ id: "brann", attitude: "pc", hp: 0, hpMax: 45, vitalState: "down", deathSaves: { successes: 0, failures: 2 } }, { isGM: true });
  assert.equal(down.dead, false);
  assert.deepEqual(down.deathSaves, { successes: 0, failures: 2 });
  assert.ok(classicBuilder.includes('knockedOutBadge = buildVitalStateBadge(DEAD ? "dead" : "down", {'));
  assert.ok(classicBuilder.includes("const hpBarSlot = deathSavePips || hpBarWrap;"));
  assert.equal(classicBuilder.split("hpControlsRow.appendChild(hpBarSlot);").length - 1, 3);
});

test("the tracker builds the state from the real HP, passes the death saves' option, and draws KO or the skull between renders", () => {
  assert.ok(tracker.includes("vitalState: trackerVitalState({ attitude: meta.attitude, hp: meta.hp, hpMax: meta.hpMax, conditions: meta.conditions }),"));
  assert.ok(tracker.includes("deathSaves: meta.deathSaves ?? null,"));
  assert.ok(tracker.includes("deathSaves: projectionPolicy.deathSaves,"));
  const compact = tracker.slice(tracker.indexOf("function renderCompactTrack("));
  assert.ok(compact.includes("hpText, deathSavePips || hpTrack, status);"));
  assert.ok(compact.includes("if (concentrating && !knockedOut) {"));
  const sync = tracker.slice(tracker.indexOf("function syncTrackerHPNow("), tracker.indexOf("async function updateInitiative("));
  assert.ok(sync.includes('const dead = deadByCondition || (downByHP && card.dataset.vitalAtZero === "dead");'));
  assert.ok(sync.includes("koBadge = buildVitalStateBadge(vitalKind, {"));
  assert.ok(sync.includes('if (concentrationBadge) concentrationBadge.style.display = knockedOut ? "none" : "";'));
});

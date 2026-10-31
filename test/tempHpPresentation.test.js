// CAP-TEMP, lotto T1 (PHB 2014, p. 198): the temporary hit points shown beside the HP, "+N", on the cards, in the
// players' projection (only with the exact HP, decision D5), in the combat log and in the item change hub.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveClassicCardPresentation } from "../src/initiativeCardClassic.js";
import { projectTrackerEntry } from "../src/options/optionsProjection.js";
import { combatEventFromHistoryEntry } from "../src/combatLogCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";
import { classifySceneItemChanges } from "../src/sceneItemChangeDispatcherCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";

test("the classic card: the HP up to the maximum and the temporary hit points apart", () => {
  const wounded = deriveClassicCardPresentation({ id: "pc", attitude: "pc", hp: 12, hpMax: 30, tempHp: 5 }, { isGM: true });
  assert.deepEqual([wounded.hpValue, wounded.hpMax, wounded.tempHp], [12, 30, 5]);
  const legacy = deriveClassicCardPresentation({ id: "pc", attitude: "pc", hp: 35, hpMax: 30 }, { isGM: true });
  assert.deepEqual([legacy.hpValue, legacy.tempHp], [30, 5], "the old encoding: the part above the maximum");
  const status = deriveClassicCardPresentation({ id: "orc", attitude: "enemy", hp: null, hpMax: null, tempHp: 5,
    hpDisclosure: { mode: "status", ratio: 0.4, status: "bloodied" } }, { isGM: false });
  assert.equal(status.tempHp, 0, "without the exact HP, nothing of them");
});

test("the players' projection keeps the temporary hit points only with the exact HP (D5)", () => {
  const hpPolicy = { trackerClassic: { pc: "exact", enemy: "status" } };
  const pc = projectTrackerEntry({ id: "pc", attitude: "pc", hp: 12, hpMax: 30, tempHp: 5 }, { hpPolicy });
  assert.deepEqual([pc.hp, pc.hpMax, pc.tempHp], [12, 30, 5]);
  const enemy = projectTrackerEntry({ id: "orc", attitude: "enemy", hp: 12, hpMax: 30, tempHp: 5 }, { hpPolicy });
  assert.deepEqual([enemy.hp, enemy.tempHp], [null, null]);
});

const snapshot = (value) => (value === undefined ? { present: false } : { present: true, value });
const hpLines = (entry) => buildCombatLogPresentation({}, [combatEventFromHistoryEntry(entry, { round: 1 })])
  .events[0].details.flatMap((section) => section.lines);

// An HP entry of Mira (30/45): her HP and temporary hit points before and after, and the History's record.
const miraEntry = ({ kind = "hp", hp = [30, 30], temp = [undefined, undefined], record = null } = {}) => ({
  id: `h-${Math.random()}`, kind, label: "PF", ...(record ? { payload: { tempHp: [{ id: "mira", ...record }] } } : {}),
  changes: [{ id: "mira", name: "Mira",
    before: { hp: snapshot(hp[0]), hpMax: snapshot(45), tempHp: snapshot(temp[0]) },
    after: { hp: snapshot(hp[1]), hpMax: snapshot(45), tempHp: snapshot(temp[1]) } }] });
const hpLineOf = (entry) => hpLines(entry).find((line) => line.startsWith("Mira:"));

test("the combat log says what happened to the temporary hit points: added, raised, taken by the damage, removed", () => {
  assert.equal(hpLineOf(miraEntry({ temp: [undefined, 8], record: { before: 0, after: 8, mode: "granted" } })),
    "Mira: 30/45 → 30/45 +8 (+8 PF temporanei)");
  assert.equal(hpLineOf(miraEntry({ temp: [5, 8], record: { before: 5, after: 8, mode: "raised" } })),
    "Mira: 30/45 +5 → 30/45 +8 (PF temporanei da 5 a 8)");
  assert.equal(hpLineOf(miraEntry({ hp: [30, 27], temp: [8, undefined], record: { before: 8, after: 0, mode: "absorbed" } })),
    "Mira: 30/45 +8 → 27/45 (danno 11: 8 sui PF temporanei, esauriti, 3 sui PF)");
  assert.equal(hpLineOf(miraEntry({ temp: [8, 3], record: { before: 8, after: 3, mode: "absorbed" } })),
    "Mira: 30/45 +8 → 30/45 +3 (danno 5 assorbito dai PF temporanei)");
  assert.equal(hpLineOf(miraEntry({ temp: [8, undefined], record: { before: 8, after: 0, mode: "removed" } })),
    "Mira: 30/45 +8 → 30/45 (PF temporanei tolti: 8)");
  assert.equal(hpLineOf(miraEntry({ temp: [5, undefined], record: { before: 5, after: 0, mode: "expired" } })),
    "Mira: 30/45 +5 → 30/45 (PF temporanei scaduti: 5)", "their pill ended (lotto T3a)");
  assert.equal(hpLineOf(miraEntry({ hp: [30, 0], temp: [8, undefined], record: { before: 8, after: 0, mode: "lost" } })),
    "Mira: 30/45 +8 → 0/45 (-30 PF · PF temporanei persi: 8)");
  assert.equal(hpLineOf(miraEntry({ hp: [20, 30], temp: [8, 8] })), "Mira: 20/45 +8 → 30/45 +8 (+10 PF)",
    "a healing leaves them: the HP alone");
});

test("the combat log without the History's record: a fall is damage unless it is a hand edit of the temporary hit points", () => {
  assert.equal(hpLineOf(miraEntry({ kind: "pc-attack", temp: [8, 3] })), "Mira: 30/45 +8 → 30/45 +3 (danno 5 assorbito dai PF temporanei)");
  assert.equal(hpLineOf(miraEntry({ hp: [30, 27], temp: [8, undefined] })),
    "Mira: 30/45 +8 → 27/45 (danno 11: 8 sui PF temporanei, esauriti, 3 sui PF)");
  assert.equal(hpLineOf(miraEntry({ temp: [8, undefined] })), "Mira: 30/45 +8 → 30/45 (PF temporanei tolti: 8)");
  const granted = hpLines({ id: "h2", kind: "hp", label: "PF temporanei", effectsMutation: { changes: [{ id: "mira", name: "Mira",
    beforeMetadata: { tempHp: snapshot() }, afterMetadata: { tempHp: snapshot(8) } }] } });
  assert.ok(granted.includes("Mira: +8 PF temporanei"), granted.join("\n"));
  const plain = hpLines({ id: "h3", kind: "hp", label: "Danno", changes: [{ id: "mira", name: "Mira",
    before: { hp: snapshot(30), hpMax: snapshot(45) }, after: { hp: snapshot(25), hpMax: snapshot(45) } }] });
  assert.ok(plain.includes("Mira: 30/45 → 25/45 (-5 PF)"), "an entry without them reads as before");
});

test("the item change hub: a change of the temporary hit points alone moves the HP bars and the card", () => {
  const token = (tempHp) => ({ id: "mira", type: "IMAGE", layer: "CHARACTER", name: "Mira", position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 30, hpMax: 45, inInitiative: true, ...(tempHp ? { tempHp } : {}) } } });
  const change = classifySceneItemChanges([token(0)], [token(8)]);
  assert.equal(change.flags.hpBars, true);
});

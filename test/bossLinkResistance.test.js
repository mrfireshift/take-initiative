// Rimebound Link (profile v26): the trait as data, the record on the boss token, the in-memory resistance of the linked
// tokens and the plan of the effects coordinator. Nothing reaches the players: no pill is ever written.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { BOSS_LINK_DAMAGE_TYPE_IDS, BOSS_LINK_RESISTANCE_FIELD, bossLinkResistanceNoticeText, bossLinkResistanceRecord, bossLinkResistanceState,
  bossLinkResistsFor, planBossLinkResistance, withBossLinkDefenses } from "../src/bossLinkResistanceCore.js";
import { DAMAGE_TYPES, damageDefensesForItem } from "../src/damageDefensesCore.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const p2 = await importBossActionHTML(html);
const p3 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const record = { enabled: true, name: "Rimebound Link", holder: "Titano", breaker: "Proiezione Fatata" };
const auril = (link = record) => ({ id: "auril", name: "Auril", metadata: { [META]: { hp: 300, hpMax: 495, ...(link ? { [BOSS_LINK_RESISTANCE_FIELD]: link } : {}) } } });
const titan = (id, extra = {}) => ({ id, name: id === "hand" ? "Mano del Titano" : id, metadata: { [META]: { hp: 300, hpMax: 495, sharedHpSourceId: "auril", ...extra } } });

test("v26 data: Rimebound Link is a partial trait with the Titan as holder and the Projection as breaker", () => {
  const trait = p2.abilities.find((entry) => entry.name === "Rimebound Link");
  assert.equal(trait.category, "trait");
  assert.equal(trait.automation, "PARTIAL");
  assert.deepEqual(trait.linkResistance, { holder: "Titano", breaker: "Proiezione Fatata", defense: "resistance", types: "all" });
  assert.equal(trait.execution, undefined);
  assert.match(trait.manualText, /Solo il GM vede lo stato/);
  assert.equal(p3.abilities.some((entry) => entry.linkResistance), false, "phase 3 has no link");
  for (const mutate of [
    (entry) => { entry.linkResistance.types = "fire"; },
    (entry) => { entry.linkResistance.defense = "immunity"; },
    (entry) => { entry.linkResistance.breaker = "Titano"; },
    (entry) => { entry.category = "epic-action"; },
    (entry) => { entry.linkResistance.extra = true; },
  ]) {
    const copy = structuredClone(p2);
    mutate(copy.abilities.find((entry) => entry.name === "Rimebound Link"));
    assert.throws(() => validateBossActionProfile(copy));
  }
  const v25 = structuredClone({ ...p2, profileVersion: 25, parserVersion: 25 });
  assert.throws(() => validateBossActionProfile(v25), /unexpected field linkResistance/);
});

test("the record follows the binding; the link is active in every canonical round except the one it was broken in", () => {
  assert.deepEqual(bossLinkResistanceRecord(p2), record);
  assert.equal(bossLinkResistanceRecord(p3), null);
  assert.deepEqual(bossLinkResistanceRecord(p2, { ...record, brokenRound: 4 }), { ...record, brokenRound: 4 }, "a rebind keeps the broken round");
  assert.deepEqual(bossLinkResistanceState(auril(), 3), { name: "Rimebound Link", holder: "Titano", breaker: "Proiezione Fatata", brokenRound: null, active: true, round: 3 });
  assert.equal(bossLinkResistanceState(auril({ ...record, brokenRound: 3 }), 3).active, false);
  assert.equal(bossLinkResistanceState(auril({ ...record, brokenRound: 3 }), 4).active, true, "the next round renews it without any write");
  assert.equal(bossLinkResistanceState(auril(), undefined).active, false, "outside combat");
  assert.equal(bossLinkResistanceState(auril(null), 3), null);
});

test("the linked tokens resist in memory only; the boss token and other creatures do not", () => {
  assert.deepEqual(BOSS_LINK_DAMAGE_TYPE_IDS, DAMAGE_TYPES.map((entry) => entry.id));
  const hand = titan("hand", { conditions: { instances: [{ id: "frozen", condition: "Prono", active: true }] } });
  const resisting = withBossLinkDefenses(hand, auril(), 2);
  assert.notEqual(resisting, hand);
  assert.deepEqual(damageDefensesForItem(resisting, META).resistances, [...BOSS_LINK_DAMAGE_TYPE_IDS].sort());
  assert.equal(hand.metadata[META].conditions.instances.length, 1, "the token itself is not touched");
  assert.equal(resisting.metadata[META].conditions.instances[0].id, "frozen", "its own effects stay");
  assert.equal(withBossLinkDefenses(hand, auril({ ...record, brokenRound: 2 }), 2), hand, "broken: unchanged");
  const boss = auril();
  assert.equal(withBossLinkDefenses(boss, boss, 2), boss, "the boss token is returned unchanged");
  assert.equal(bossLinkResistsFor(auril(), auril(), 2), null, "the Projection never resists");
  assert.equal(bossLinkResistsFor({ id: "dars", metadata: { [META]: {} } }, auril(), 2), null);
  assert.equal(bossLinkResistsFor(titan("hand"), auril(null), 2), null);
});

test("the coordinator's plan: damage to the Titan is a notice; damage to the Projection breaks the link in the same command", () => {
  const items = [auril(), titan("hand"), titan("body")];
  const titanHit = planBossLinkResistance({ items, round: 2, groups: [{ sourceId: "auril", damageHitIds: ["hand"] }] });
  assert.deepEqual(titanHit.metadataPatches, []);
  assert.deepEqual(titanHit.notices, [{ kind: "resisted", sourceId: "auril", sourceName: "Auril", portrait: "", name: "Rimebound Link", holder: "Titano",
    targets: ["Mano del Titano"], applied: false }]);
  assert.equal(bossLinkResistanceNoticeText(titanHit.notices[0]),
    "Rimebound Link attivo: il Titano ha Resistenza a tutti i danni (Mano del Titano). Dimezza tu il danno se non l'hai già fatto.");
  const halved = planBossLinkResistance({ items, round: 2, groups: [{ sourceId: "auril", damageHitIds: ["hand"] }], appliedIds: ["hand"] });
  assert.match(bossLinkResistanceNoticeText(halved.notices[0]), /Danno già dimezzato\.$/);
  // One area on both manifestations: the Titan's share is resisted, then the link ends.
  const both = planBossLinkResistance({ items, round: 2, groups: [{ sourceId: "auril", damageHitIds: ["auril", "hand"] }] });
  assert.deepEqual(both.metadataPatches, [{ id: "auril", fields: { [BOSS_LINK_RESISTANCE_FIELD]: { value: { ...record, brokenRound: 2 }, expected: { present: true, value: record } } } }]);
  assert.deepEqual(both.notices.map((notice) => notice.kind), ["resisted", "broken"]);
  assert.equal(bossLinkResistanceNoticeText(both.notices[1]),
    "Rimebound Link interrotto: la Proiezione Fatata ha subito danni. Il Titano perde la Resistenza fino all'inizio del prossimo round.");
  // Already broken, out of combat, healing only, or no link: nothing.
  assert.deepEqual(planBossLinkResistance({ items: [auril({ ...record, brokenRound: 2 }), titan("hand")], round: 2, groups: [{ sourceId: "auril", damageHitIds: ["auril", "hand"] }] }),
    { metadataPatches: [], notices: [] });
  assert.deepEqual(planBossLinkResistance({ items, round: undefined, groups: [{ sourceId: "auril", damageHitIds: ["auril"] }] }), { metadataPatches: [], notices: [] });
  assert.deepEqual(planBossLinkResistance({ items, round: 2, groups: [{ sourceId: "auril", damageHitIds: [] }] }), { metadataPatches: [], notices: [] });
  assert.deepEqual(planBossLinkResistance({ items: [auril(null), titan("hand")], round: 2, groups: [{ sourceId: "auril", damageHitIds: ["auril"] }] }),
    { metadataPatches: [], notices: [] });
});

test("the GM's popover card: the Titan's damage alone, the link broken, or both in one command", async () => {
  const { bossLinkNoticeCard } = await import("../src/bossLinkResistanceCore.js");
  const items = [{ ...auril(), image: { url: "https://example.test/auril.png" } }, titan("hand")];
  const resisted = planBossLinkResistance({ items, round: 2, groups: [{ sourceId: "auril", damageHitIds: ["hand"] }] });
  assert.deepEqual(bossLinkNoticeCard(resisted.notices), { tone: "active", eyebrow: "Rimebound Link · solo GM", title: "Titano resistente",
    lines: [{ strong: "Mano del Titano", text: ": Resistenza a tutti i danni, dimezza il danno se non l'hai già fatto." }],
    badge: { label: "DANNO", value: "½" }, name: "Auril", portrait: "https://example.test/auril.png" });
  const both = planBossLinkResistance({ items, round: 2, appliedIds: ["hand"], groups: [{ sourceId: "auril", damageHitIds: ["auril", "hand"] }] });
  const card = bossLinkNoticeCard(both.notices);
  assert.deepEqual([card.tone, card.title, card.badge], ["broken", "Link interrotto", { label: "ROUND", value: "3" }]);
  assert.deepEqual(card.lines.map((line) => line.strong + line.text), ["Mano del Titano: Resistenza a tutti i danni, danno già dimezzato.",
    "Proiezione Fatata colpita: il Titano perde la Resistenza fino al round 3."]);
  assert.equal(bossLinkNoticeCard([]), null);
});

test("the popover is our own page, built like the speed warning and registered in the build", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [page, script, host, vite, coordinator] = await Promise.all([read("../boss-link-notice.html"), read("../src/boss-link-notice.ts"),
    read("../src/bossLinkNoticeHost.js"), read("../vite.config.js"), read("../src/effectsMutations.js")]);
  assert.match(page, /<script type="module" src="\/src\/boss-link-notice\.ts"><\/script>/);
  assert.match(page, /\.warning\.broken \{/);
  assert.match(script, /AUTO_CLOSE_MS = 8000/);
  assert.match(host, /url: `\/boss-link-notice\.html\?payload=\$\{encodeURIComponent\(JSON\.stringify\(card\)\)\}`/);
  assert.match(host, /hidePaper: true/);
  assert.match(vite, /bossLinkNotice: path\.resolve\(process\.cwd\(\), "boss-link-notice\.html"\)/);
  assert.match(coordinator, /if \(await OBR\.player\.getRole\(\) !== "GM"\) return;/);
  assert.match(coordinator, /if \(await openBossLinkNotice\(notices\)\) return;/);
});

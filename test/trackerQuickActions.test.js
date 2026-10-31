import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildBossActionsLauncher,
  buildTrackerConsoleLauncher,
  buildTrackerQuickActionLauncher,
  compactLauncherSlot,
  trackerQuickActionSummary,
  trackerHasConsoleEntries,
  trackerQuickActionsForGroup,
} from "../src/trackerQuickActions.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        listeners: {},
        textContent: "",
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          const normalized = {
            preventDefault() {},
            stopPropagation() {},
            ...event,
          };
          for (const listener of this.listeners[type] || []) {
            await listener(normalized);
          }
        },
      };
    },
  };
}

const action = {
  id: "shield",
  label: "Scudo della Fede",
  kind: "spell",
  spellId: "shield-of-faith",
  workflow: "spell",
  targetMode: "selection",
};

test("costruisce un vero pulsante toggle per il popover", async () => {
  const documentRef = createTestDocument();
  const toggles = [];
  const launcher = buildTrackerQuickActionLauncher({
    actions: [action],
    compact: false,
    expanded: true,
    documentRef,
    onToggle(button) {
      toggles.push(button);
    },
  });

  assert.ok(launcher);
  const [button] = launcher.children;
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.textContent, "⚡");
  assert.equal(button.attributes["aria-haspopup"], "menu");
  assert.equal(button.attributes["aria-expanded"], "true");
  // A 15px circle with a 1px ring drawn outside, on the portrait rim: three fit above the active-turn badge.
  assert.equal(launcher.style.left, "-19.5px");
  assert.equal(button.style.width, "15px");
  assert.equal(button.style.height, "15px");
  assert.equal(button.style.border, "0");
  assert.match(button.style.boxShadow, /^0 0 0 1px #fde047,/);
  assert.equal(button.style.fontSize, "9px");
  assert.equal(button.style.borderRadius, "50%");

  await button.dispatch("click");
  assert.deepEqual(toggles, [button]);
});

test("nella vista compatta i launcher fanno una colonna a destra del ritratto, dall'alto del ritratto", () => {
  const documentRef = createTestDocument();
  const launcher = buildTrackerQuickActionLauncher({
    actions: [action],
    compact: true,
    expanded: false,
    documentRef,
  });

  assert.ok(launcher);
  assert.equal(launcher.style.left, "auto");
  // Axis 13.5px from the card's right edge; the first ring level with the portrait's top, the third ending with it.
  assert.equal(launcher.style.right, "6px");
  assert.equal(launcher.style.top, "8px");
  // Rings touching, 17px apart; below an Epic Boss's "E" the column starts lower.
  assert.deepEqual(compactLauncherSlot(2, 15), { left: "auto", right: "6px", top: "42px" });
  assert.deepEqual(compactLauncherSlot(0, 15, { belowCorner: true }), { left: "auto", right: "6px", top: "35px" });
});

test("non monta il pulsante senza azioni valide", () => {
  assert.equal(buildTrackerQuickActionLauncher({
    actions: [],
    documentRef: createTestDocument(),
  }), null);
});

test("riassume tipo e bersaglio senza dipendere dal pannello", () => {
  assert.equal(
    trackerQuickActionSummary(action),
    "Incantesimo · lancio rapido · bersaglio selezionato",
  );
  assert.equal(trackerQuickActionSummary({
    id: "vow",
    label: "Giuramento",
    kind: "condition",
    conditionName: "Giuramento di Inimicizia",
    targetMode: "self",
  }), "Giuramento di Inimicizia · su di sé");
  assert.equal(trackerQuickActionSummary({
    id: "sword",
    label: "Spada sacra",
    kind: "attack",
    components: [{ type: "slashing" }, { type: "radiant" }],
  }), "Attacco · mischia · 2 componenti");
  assert.equal(trackerQuickActionSummary({
    id: "bow",
    label: "Arco lungo",
    kind: "attack",
    range: "ranged",
    components: [{ type: "piercing" }],
  }), "Attacco · distanza · 1 componente");
  assert.equal(trackerQuickActionSummary({ id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }),
    "Trucchetto · scegli al lancio");
  assert.equal(trackerQuickActionSummary({ id: "cantrip", label: "Trucchetto", kind: "attack",
    source: { kind: "cantrip", spellIds: ["fire-bolt", "eldritch-blast"] } }), "Trucchetto · 2 conosciuti");
});

test("Boss Actions: un cerchio della colonna dei launcher, come ⚡ e 🗡️, rosso se collegato, attenuato senza profilo", async () => {
  const documentRef = createTestDocument();
  const opened = [];
  const button = buildBossActionsLauncher({ bound: true, iconUrl: "/boss.svg", documentRef, onOpen: () => opened.push(true) });
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.title, "Console Boss");
  assert.equal(button.attributes["aria-label"], "Console Boss");
  assert.equal(button.dataset.bossActionsLauncher, "bound");
  assert.equal(button.dataset.cardSelectionIgnore, "1");
  assert.equal(button.style.position, "absolute");
  // The classic card: the column's axis on the portrait rim, the first slot at the top, above ⚡.
  assert.deepEqual([button.style.left, button.style.top], ["-19.5px", "calc(50% - 33px)"]);
  assert.deepEqual([button.style.width, button.style.height], ["15px", "15px"], "the size of ⚡ and 🗡️");
  assert.equal(button.style.borderRadius, "50%");
  assert.equal(button.style.boxShadow, "0 0 0 1px #f87171,0 2px 6px rgba(0,0,0,.85)", "the 1px ring of the other launchers");
  assert.equal(button.textContent, "", "an icon, not a text label");
  const icon = button.children[0];
  assert.equal(icon.attributes["aria-hidden"], "true");
  assert.match(icon.style.mask, /url\("\/boss\.svg"\)/);
  assert.equal(icon.style.transform, "translateX(0.9px)", "the skull, drawn left of the file's centre, in the middle of the circle");
  assert.equal(button.children[1].dataset.hitArea, "1", "the 24px click area of the other launchers");
  let stopped = 0;
  await button.dispatch("click", { stopPropagation() { stopped += 1; } });
  assert.equal(opened.length, 1);
  assert.equal(stopped, 1, "the click never selects the card");

  const unbound = buildBossActionsLauncher({ bound: false, documentRef });
  assert.equal(unbound.title, "Console Boss: collega un profilo");
  assert.equal(unbound.dataset.bossActionsLauncher, "unbound");
  assert.match(unbound.style.boxShadow, /^0 0 0 1px rgba\(248,113,113,\.45\)/);

  // In column with ⚡, a pitch above it (rings touching).
  const quickLauncher = buildTrackerQuickActionLauncher({ actions: [action], documentRef: createTestDocument() });
  assert.equal(button.style.left, quickLauncher.style.left, "in column with ⚡");
  assert.equal(quickLauncher.style.top, "calc(50% - 16px)");
  // Alone on an Epic Action card: where ⚡ stands on the other cards.
  assert.equal(buildBossActionsLauncher({ bound: true, classicSlot: -0.5, documentRef }).style.top, "calc(50% - 16px)");
  // The compact card: the first circle of the column, the others after it.
  const compact = buildBossActionsLauncher({ bound: true, compact: true, documentRef });
  assert.deepEqual([compact.style.left, compact.style.right, compact.style.top], ["auto", "6px", "8px"]);
  const belowE = buildBossActionsLauncher({ bound: true, compact: true, belowCorner: true, documentRef });
  assert.equal(belowE.style.top, "35px");
});

test("azioni rapide (⚡) e attacchi (🗡️) hanno ciascuno il proprio launcher, in colonna sopra il badge del turno", () => {
  const sword = { id: "sword", label: "Spada", kind: "attack", components: [{ type: "slashing" }] };
  const cantrip = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
  const actions = [sword, action, cantrip];
  assert.deepEqual(trackerQuickActionsForGroup(actions, "quick").map((entry) => entry.id), [action.id]);
  assert.deepEqual(trackerQuickActionsForGroup(actions, "attacks").map((entry) => entry.id), ["sword", "cantrip"]);

  const quick = buildTrackerQuickActionLauncher({ actions, documentRef: createTestDocument() });
  const attacks = buildTrackerQuickActionLauncher({ actions, group: "attacks", offset: 1, documentRef: createTestDocument() });
  assert.equal(quick.__quickActionToggle.textContent, "⚡");
  assert.match(quick.__quickActionToggle.title, /azioni rapide \(1\)/);
  assert.equal(attacks.__quickActionToggle.textContent, "🗡️");
  assert.match(attacks.__quickActionToggle.title, /attacchi \(2\)/);
  assert.equal(attacks.dataset.trackerQuickActions, "attacks");
  // One column straddling the portrait rim, centred on the portrait (the GM view has no active-turn badge): ⚡ half
  // a pitch (17px) above the centre; the 🗡️ menu keeps its old slot, one pitch below.
  assert.deepEqual([quick.style.left, quick.style.top], ["-19.5px", "calc(50% - 16px)"]);
  assert.deepEqual([attacks.style.left, attacks.style.top], ["-19.5px", "calc(50% + 9.5px)"]);
  assert.match(attacks.__quickActionToggle.style.boxShadow, /^0 0 0 1px #fb923c,/);
  const compact = buildTrackerQuickActionLauncher({ actions, group: "attacks", offset: 1, compact: true, documentRef: createTestDocument() });
  assert.deepEqual([compact.style.right, compact.style.top], ["6px", "25px"]);

  // Only attacks: no ⚡; 🗡️ keeps its own slot, at the bottom of the column.
  assert.equal(buildTrackerQuickActionLauncher({ actions: [sword], documentRef: createTestDocument() }), null);
  const alone = buildTrackerQuickActionLauncher({ actions: [sword], group: "attacks", documentRef: createTestDocument() });
  assert.equal(alone.style.top, "calc(50% + 9.5px)");
});

test("the attack console's launcher (🗡️) opens the console in one click, half a pitch below the portrait's centre", async () => {
  const opened = [];
  const launcher = buildTrackerConsoleLauncher({ offset: 1, onOpen: () => opened.push(true), documentRef: createTestDocument() });
  const button = launcher.__consoleButton;
  assert.equal(launcher.dataset.trackerConsoleLauncher, "1");
  assert.equal(button.textContent, "🗡️");
  assert.equal(button.title, "Apri la console attacchi");
  // ⚡ above (calc(50% - 16px)), the console below, rings touching.
  assert.deepEqual([launcher.style.left, launcher.style.top], ["-19.5px", "calc(50% + 1px)"]);
  assert.match(button.style.boxShadow, /^0 0 0 1px #fb923c,/);
  await button.dispatch("click");
  assert.deepEqual(opened, [true]);
  assert.equal(buildTrackerConsoleLauncher({ documentRef: null }), null);
});

test("the console launcher shows on cards with attacks, spells, a class or a species", () => {
  assert.equal(trackerHasConsoleEntries(null), false);
  assert.equal(trackerHasConsoleEntries({ quickActions: [action] }), false);
  assert.equal(trackerHasConsoleEntries({ quickActions: [{ id: "sword", label: "Spada", kind: "attack", components: [{ type: "slashing" }] }] }), true);
  assert.equal(trackerHasConsoleEntries({ spellbook: { spellIds: [] } }), false);
  assert.equal(trackerHasConsoleEntries({ spellbook: { spellIds: ["shield"] } }), true);
  assert.equal(trackerHasConsoleEntries({ characterBuild: [{ level: 3 }] }), false);
  assert.equal(trackerHasConsoleEntries({ characterBuild: [{ classId: "fighter", level: 3 }] }), true);
  assert.equal(trackerHasConsoleEntries({ species: { id: " " } }), false);
  assert.equal(trackerHasConsoleEntries({ species: { id: "dragonborn" } }), true);
});

test("the spellbook's spells have a launcher of their own (🪄), between ⚡ and 🗡️", () => {
  const book = { id: "book:shield", label: "Scudo", kind: "spell", spellId: "shield", targetMode: "self", launchMode: "auto" };
  const sword = { id: "sword", label: "Spada", kind: "attack", components: [{ type: "slashing" }] };
  const actions = [action, book, sword];
  assert.deepEqual(["quick", "spells", "attacks"].map((group) => trackerQuickActionsForGroup(actions, group).map((entry) => entry.id)),
    [[action.id], ["book:shield"], ["sword"]]);
  const spells = buildTrackerQuickActionLauncher({ actions, group: "spells", offset: 1, documentRef: createTestDocument() });
  assert.equal(spells.__quickActionToggle.textContent, "🪄");
  assert.match(spells.__quickActionToggle.title, /incantesimi \(1\)/);
  assert.equal(spells.dataset.trackerQuickActions, "spells");
  assert.equal(spells.__quickActionToggle.dataset.trackerQuickActionToggle, "spells");
  assert.equal(spells.style.top, "calc(50% - 7.5px)");
  assert.match(spells.__quickActionToggle.style.boxShadow, /^0 0 0 1px #a78bfa,/);
  assert.equal(trackerQuickActionSummary(book), "Lancio rapido · su di sé");
});

// The tracker mounts the Boss Actions circle first, at the top of the column, and on the Epic Action cards too: a
// reminder of the boss's console, which it opens.
test("il tracker monta il cerchio Boss per primo, e anche sulle card delle Azioni Epiche", () => {
  const list = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = list.indexOf("function __mountTrackerQuickActions(");
  const mount = list.slice(start, list.indexOf("\n}\n", start));
  assert.ok(mount.indexOf("buildBossActionsLauncher(") < mount.indexOf("buildTrackerQuickActionLauncher("), "the boss circle first");
  assert.ok(mount.indexOf("if (epicAction) return;") > mount.indexOf("buildBossActionsLauncher("), "only the boss circle on an Epic Action");
  assert.ok(!/\|\| isEpicActionId\(sourceEntry\.id\)\n/.test(mount), "the Epic Action cards are no longer left out");
  assert.ok(mount.includes("const sourceId = epicAction ? String(sourceEntry.epicBossId || \"\") : splitParagonId(sourceEntry.id).baseId;"));
  assert.ok(mount.includes("void openBossActionsPopover(sourceId);"));
  assert.ok(list.includes("epicBossActionBinding: !!bossEntry.bossActionBinding,"), "bound or not as its boss");
});

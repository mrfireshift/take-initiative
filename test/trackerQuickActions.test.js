import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBossActionsLauncher,
  buildTrackerQuickActionLauncher,
  trackerQuickActionSummary,
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
  assert.equal(launcher.style.left, "-17px");
  assert.equal(button.style.width, "22px");
  assert.equal(button.style.height, "22px");
  assert.equal(button.style.border, "2px solid #fde047");
  assert.equal(button.style.borderRadius, "50%");

  await button.dispatch("click");
  assert.deepEqual(toggles, [button]);
});

test("posiziona il launcher in basso a destra rispetto al ritratto nella vista compatta", () => {
  const documentRef = createTestDocument();
  const launcher = buildTrackerQuickActionLauncher({
    actions: [action],
    compact: true,
    expanded: false,
    documentRef,
  });

  assert.ok(launcher);
  assert.equal(launcher.style.left, "auto");
  assert.equal(launcher.style.right, "18px");
  assert.equal(launcher.style.top, "35px");
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

test("Boss Actions: icona tonda nello slot delle azioni rapide, rossa se collegata, attenuata senza profilo", async () => {
  const documentRef = createTestDocument();
  const opened = [];
  const button = buildBossActionsLauncher({ bound: true, iconUrl: "/boss.svg", documentRef, onOpen: () => opened.push(true) });
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.title, "Boss Actions");
  assert.equal(button.attributes["aria-label"], "Boss Actions");
  assert.equal(button.dataset.bossActionsLauncher, "bound");
  assert.equal(button.dataset.cardSelectionIgnore, "1");
  assert.equal(button.style.position, "absolute");
  assert.equal(button.style.left, "-17px", "same slot as the quick-actions toggle");
  assert.equal(button.style.top, "2px");
  assert.equal(button.style.width, "22px");
  assert.equal(button.style.borderRadius, "50%");
  assert.equal(button.style.border, "2px solid #f87171");
  assert.equal(button.textContent, "", "an icon, not a text label");
  assert.equal(button.children[0].attributes["aria-hidden"], "true");
  assert.match(button.children[0].style.mask, /url\("\/boss\.svg"\)/);
  let stopped = 0;
  await button.dispatch("click", { stopPropagation() { stopped += 1; } });
  assert.equal(opened.length, 1);
  assert.equal(stopped, 1, "the click never selects the card");

  const unbound = buildBossActionsLauncher({ bound: false, documentRef });
  assert.equal(unbound.title, "Boss Actions: collega un profilo");
  assert.equal(unbound.dataset.bossActionsLauncher, "unbound");
  assert.equal(unbound.style.border, "2px solid rgba(248,113,113,.45)");

  const beside = buildBossActionsLauncher({ bound: true, offset: 1, documentRef });
  assert.equal(beside.style.left, "9px", "one slot to the right of ⚡");
  const compact = buildBossActionsLauncher({ bound: true, compact: true, documentRef });
  assert.deepEqual([compact.style.left, compact.style.right, compact.style.top], ["auto", "18px", "35px"]);
});

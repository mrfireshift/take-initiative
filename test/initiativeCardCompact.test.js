import test from "node:test";
import assert from "node:assert/strict";
import {
  __buildCompactEffectPill,
  __compactConditionPillLabel,
  __compactEffectItems,
  COMPACT_CARD_HEIGHT,
  COMPACT_CARD_WIDTH,
  bindCompactEffectsToggle,
  buildCompactCardHP,
  buildCompactCardIndicators,
  buildCompactCardName,
  buildCompactCardPortrait,
  buildCompactCardShell,
  buildCompactCardStatus,
  buildCompactLegendaryResourcePips,
  compactStatusBadge,
  deriveCompactCardPresentation,
  enableCompactCardRename,
  syncCompactEffectsToggleState,
} from "../src/initiativeCardCompact.js";

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
        parentNode: null,
        isConnected: false,
        textContent: "",
        title: "",
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          child.isConnected = true;
          return child;
        },
        replaceWith(replacement) {
          if (!this.parentNode) return;
          const parent = this.parentNode;
          const index = parent.children.indexOf(this);
          if (index < 0) return;
          parent.children[index] = replacement;
          replacement.parentNode = parent;
          replacement.isConnected = true;
          this.parentNode = null;
          this.isConnected = false;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          for (const listener of this.listeners[type] || []) {
            await listener(event);
          }
        },
        focus() {
          this.focused = true;
        },
        select() {
          this.selected = true;
        },
      };
    },
  };
}

function createTestEvent(overrides = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

function flushAsyncEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("la presentazione compatta conserva le dimensioni correnti", () => {
  assert.equal(COMPACT_CARD_WIDTH, 92);
  assert.equal(COMPACT_CARD_HEIGHT, 120);
});

test("un player vede gli HP dei PG ma non quelli dei nemici", () => {
  const pc = deriveCompactCardPresentation(
    { id: "pc", attitude: "PC", hp: 7, hpMax: 10 },
    null,
  );
  const enemy = deriveCompactCardPresentation(
    { id: "enemy", attitude: "enemy", hp: 7, hpMax: 10 },
    null,
  );

  assert.equal(pc.showHP, true);
  assert.equal(pc.hpPercent, 0.7);
  assert.equal(enemy.hasHP, true);
  assert.equal(enemy.showHP, false);
});

test("il GM vede il KO senza perdere gli HP temporanei oltre il massimo", () => {
  const knockedOut = deriveCompactCardPresentation(
    { id: "enemy", attitude: "enemy", hp: -3, hpMax: 20 },
    null,
    { isGM: true },
  );
  const surplus = deriveCompactCardPresentation(
    { id: "enemy", attitude: "enemy", hp: 27, hpMax: 20 },
    null,
    { isGM: true },
  );

  assert.equal(knockedOut.safeHP, 0);
  assert.equal(knockedOut.knockedOut, true);
  assert.equal(surplus.safeHP, 27);
  assert.equal(surplus.hpPercent, 1);
});

test("le entry virtuali non espongono HP anche se valorizzati", () => {
  const presentation = deriveCompactCardPresentation(
    { id: "__LAIR__", attitude: "enemy", hp: 10, hpMax: 10 },
    null,
    { isGM: true, virtual: true },
  );

  assert.equal(presentation.hasHP, false);
  assert.equal(presentation.showHP, false);
  assert.equal(presentation.knockedOut, false);
});

test("un gruppo collassato resta attivo tramite i membri e nasconde effetti e KO", () => {
  const members = [
    { id: "goblin-1", conditions: { flags: { Prono: true } } },
    { id: "goblin-2", spells: [{ name: "Unto" }] },
  ];
  const presentation = deriveCompactCardPresentation(
    {
      id: "goblin-1",
      attitude: "enemy",
      hp: 0,
      hpMax: 7,
      __groupCollapsed: true,
      __groupMembers: members,
    },
    "goblin-2",
    { isGM: true },
  );

  assert.equal(presentation.active, true);
  assert.equal(presentation.knockedOut, false);
  assert.deepEqual(presentation.effectMembers, []);
  assert.equal(presentation.members, members);
});

test("Epic, Paragon e leggendari condividono la presentazione boss", () => {
  for (const entry of [
    { id: "epic", isEpic: true },
    { id: "paragon", paragonActions: 2 },
    { id: "legendary", legendary: { max: 3 } },
  ]) {
    const presentation = deriveCompactCardPresentation(entry, null);
    assert.equal(presentation.boss, true);
    assert.equal(presentation.portraitSize, 59);
  }
});

test("le etichette compatte conservano livello e scadenza della condizione", () => {
  assert.equal(
    __compactConditionPillLabel({
      condition: "Indebolimento",
      level: 3,
      expiry: { mode: "rounds", remaining: 2 },
    }),
    "Indebolimento 3 (2)",
  );
  assert.equal(
    __compactConditionPillLabel({
      condition: "Prono",
      expiry: { mode: "turn-start", remaining: 1 },
    }),
    "Prono (I)",
  );
  assert.equal(
    __compactConditionPillLabel({
      condition: "Stordito",
      expiry: { mode: "turn-end", remaining: 3 },
    }),
    "Stordito (F:3)",
  );
  assert.equal(
    __compactConditionPillLabel({
      condition: "Trattenuto",
      expiry: { mode: "concentration" },
    }),
    "Trattenuto (C)",
  );
  assert.equal(
    __compactConditionPillLabel({
      condition: "Ispirazione Bardica",
      resourceDie: "d10",
      expiry: { mode: "rounds", remaining: 100 },
    }),
    "Ispirazione Bardica (d10)",
  );
  assert.equal(
    __compactConditionPillLabel({
      condition: "Affascinato",
      expiry: { mode: "rounds", remaining: 100 },
    }),
    "Affascinato",
  );
});

test("gli effetti compatti mantengono condizioni e spell ma escludono buff e debuff", () => {
  const condition = {
    condition: "Prono",
    source: "manual",
    expiry: { mode: "rounds", remaining: 2 },
  };
  const linkedBuff = {
    condition: "Velocità",
    effectKind: "buff",
    parentEffectId: "spell-1",
  };
  const orphanDebuff = {
    condition: "Lentezza",
    effectKind: "debuff",
    parentEffectId: "missing",
  };
  const classFeatureBuff = {
    type: "class-feature",
    condition: "Bonus della capacità",
    effectKind: "buff",
  };
  const classFeatureDebuff = {
    type: "class-feature-area",
    condition: "Svantaggio della capacità",
    effectKind: "debuff",
  };
  const spell = {
    name: "Velocità",
    instanceId: "spell-1",
    conc: true,
    expiry: { mode: "turn-end", actor: "caster", remaining: 1 },
  };

  const effects = __compactEffectItems(
    [condition, linkedBuff, orphanDebuff, classFeatureBuff, classFeatureDebuff],
    [spell],
    true,
    {
      formatConditionName: (name) => name,
      formatConditionInstance: (instance) => String(instance?.condition || "Condizione"),
    },
  );

  assert.deepEqual(effects.map(({ kind, label }) => ({ kind, label })), [
    { kind: "condition", label: "Prono (2)" },
    { kind: "spell", label: "Velocità (F C)" },
  ]);
  assert.equal(effects[1].key, "velocità");
  assert.match(effects[1].title, /concentrazione$/);
  assert.equal(effects.some((effect) => effect.kind === "buff"), false);
  assert.equal(effects.some((effect) => effect.kind === "debuff"), false);
  assert.equal(effects.some((effect) => effect.label === "Lentezza"), false);
  assert.equal(effects.some((effect) => effect.label === "Bonus della capacità"), false);
  assert.equal(effects.some((effect) => effect.label === "Svantaggio della capacità"), false);
  assert.equal(effects.some((effect) => effect.kind === "concentration"), false);
});

test("una spell oltre dieci round non mostra il contatore nella card compatta", () => {
  const effects = __compactEffectItems([], [{
    name: "Ragnatela",
    instanceId: "web-zone",
    turns: 600,
  }], false);

  assert.equal(effects[0].label, "Ragnatela");
  assert.match(effects[0].title, /durata estesa/);
});

test("Arma spirituale usa la pill spell normale e non una micro-card", () => {
  const [effect] = __compactEffectItems([], [{
    name: "Arma spirituale",
    spellId: "spiritual-weapon",
    instanceId: "spiritual-weapon-1",
    turns: 10,
  }], false);
  assert.equal(effect.label, "Arma spirituale (10)");
  assert.equal(effect.turnCompanion, undefined);
  assert.match(effect.title, /10 round rimanenti/);
});

test("Palla di fuoco ritardata legge il danno corrente dal contesto canonico", () => {
  const [effect] = __compactEffectItems([], [{
    name: "Palla di fuoco ritardata",
    spellId: "delayed-blast-fireball",
    instanceId: "dbf-pill-1",
    turns: 8,
    castContext: {
      slotLevel: 7,
      delayedBlastFireball: {
        baseDice: 12,
        accumulatedDice: 3,
      },
    },
  }], false);

  assert.deepEqual(effect.summaryParts, [
    { id: "delayed-blast-fireball-damage", label: "15d6 fuoco" },
  ]);
});

test("Guscio Anti-vita aggiorna in presentation anche summaryParts legacy", () => {
  const [effect] = __compactEffectItems([], [{
    name: "Guscio Anti-vita",
    spellId: "antilife-shell",
    instanceId: "antilife-shell-legacy",
    turns: 600,
    summaryParts: [
      { id: "antilife-shell-radius", label: "3 m" },
      { id: "antilife-shell-exempt-types", label: "No costrutti/non morti" },
      { id: "antilife-shell-no-crossing", label: "Non attraversabile" },
      { id: "antilife-shell-forced-crossing", label: "Caster forza passaggio → fine" },
    ],
  }], false);

  assert.deepEqual(effect.summaryParts, [
    { id: "antilife-shell-no-crossing", label: "Non attraversabile" },
  ]);
});

test("una card compatta non mostra pill buff o debuff collegate alla spell", () => {
  const instance = {
    condition: "Lentezza: -2 CA/TS Des · no reazioni",
    effectId: "slow-penalty",
    effectKind: "debuff",
    parentEffectId: "spell-1",
    effectDetail: "Velocità dimezzata; CA -2; TS Des -2; niente reazioni; azione o bonus; massimo 1 attacco; d20 al lancio.",
  };
  const [spell, effect] = __compactEffectItems(
    [instance],
    [{ name: "Lentezza", instanceId: "spell-1", turns: 1 }],
    false,
    {
      formatConditionInstance: (value) => value.condition,
    },
  );

  assert.equal(spell.kind, "spell");
  assert.equal(spell.label, "Lentezza (1)");
  assert.match(spell.title, /Velocità dimezzata/u);
  assert.match(spell.title, /massimo 1 attacco/u);
  assert.match(spell.title, /d20/u);
  assert.deepEqual(spell.summaryParts, [
    { id: "speed-half", label: "Vel ½" },
    { id: "ac-dex-save-penalty", label: "CA −2 / TS Des −2" },
    { id: "no-reactions", label: "No reaz." },
    { id: "action-or-bonus", label: "Azione o Bonus" },
    { id: "attack-limit", label: "Max 1 att." },
  ]);
  assert.equal(effect, undefined);
});

test("Paura conserva una sola parent pill con summaryParts dello stesso forced-flight", () => {
  const [spell, effect] = __compactEffectItems(
    [{
      condition: "Paura: deve fuggire",
      effectId: "fear-forced-flight",
      effectKind: "debuff",
      parentEffectId: "fear-cast",
      effectDetail: "Al fallimento iniziale lascia cadere ciò che impugna; durante il turno deve usare Scatto e allontanarsi dal caster.",
    }],
    [{ name: "Paura", instanceId: "fear-cast", turns: 1 }],
    false,
    { formatConditionInstance: (value) => value.condition },
  );

  assert.equal(spell.label, "Paura (1)");
  assert.match(spell.title, /lascia cadere/u);
  assert.deepEqual(spell.summaryParts, [
    { id: "fear-flight", label: "Scatto: allontanati dal caster" },
  ]);
  assert.equal(effect, undefined);
});

test("Carne in pietra espone il contatore sulla pill della condition canonica", () => {
  const [effect] = __compactEffectItems(
    [{
      condition: "Trattenuto",
      effectId: "flesh-to-stone-restrained",
      summaryParts: [{ id: "flesh-to-stone-progress", label: "S 1/3 · F 2/3" }],
      effectDetail: "Il corpo si sta pietrificando.",
    }],
    [],
    false,
    { formatConditionInstance: (value) => value.condition },
  );

  assert.deepEqual(effect.summaryParts, [
    { id: "flesh-to-stone-progress", label: "S 1/3 · F 2/3" },
  ]);
});

test("la concentrazione senza spell tracciata resta un effetto autonomo", () => {
  assert.deepEqual(__compactEffectItems([], [], true), [{
    kind: "concentration",
    label: "Concentrazione",
    title: "Concentrazione attiva",
  }]);
});

test("i badge compatti conservano palette e attributi per ogni tono", () => {
  const documentRef = createTestDocument();
  const cases = [
    ["neutral", "rgba(8,12,21,.92)", "1px solid rgba(255,255,255,.34)"],
    ["concentration", "#2563eb", "1px solid #93c5fd"],
    ["resistance", "#1e3a8a", "1px solid #93c5fd"],
    ["legendary", "#991b1b", "1px solid #fca5a5"],
  ];

  for (const [tone, background, border] of cases) {
    const badge = compactStatusBadge("KO", "Fuori combattimento", tone, { documentRef });
    assert.equal(badge.tagName, "SPAN");
    assert.equal(badge.textContent, "KO");
    assert.equal(badge.title, "Fuori combattimento");
    assert.equal(badge.style.background, background);
    assert.equal(badge.style.border, border);
    assert.equal(badge.style.height, "17px");
  }
});

test("le pill compatte conservano palette spell e dimensioni preview", () => {
  const documentRef = createTestDocument();
  const spell = __buildCompactEffectPill(
    { kind: "spell", key: "velocità", label: "Velocità", title: "Spell attiva" },
    false,
    {
      documentRef,
      spellColor: () => ({ solid: "#123456", border: "#abcdef" }),
    },
  );
  const preview = __buildCompactEffectPill(
    { kind: "buff", label: "Benedizione" },
    true,
    { documentRef },
  );

  assert.equal(spell.textContent, "Velocità");
  assert.equal(spell.title, "Spell attiva");
  assert.equal(spell.style.background, "#123456");
  assert.equal(spell.style.border, "1px solid #abcdef");
  assert.equal(spell.style.maxWidth, "196px");
  assert.equal(spell.style.height, "17px");
  assert.equal(preview.title, "Benedizione");
  assert.equal(preview.style.background, "#15803d");
  assert.equal(preview.style.border, "1px solid #86efac");
  assert.equal(preview.style.maxWidth, "100%");
  assert.equal(preview.style.height, "14px");
});

test("Lentezza usa una sola parent pill e mini-pill condivise senza ellissi", () => {
  const documentRef = createTestDocument();
  const effect = {
    kind: "spell",
    key: "lentezza",
    label: "Lentezza (10)",
    title: "Lentezza · 10 round rimanenti",
    summaryParts: [
      { id: "speed-half", label: "Vel ½" },
      { id: "ac-dex-save-penalty", label: "CA −2 / TS Des −2" },
      { id: "no-reactions", label: "No reaz." },
      { id: "action-or-bonus", label: "Azione o Bonus" },
      { id: "attack-limit", label: "Max 1 att." },
    ],
  };

  const summary = __buildCompactEffectPill(effect, false, { documentRef });

  assert.equal(summary.tagName, "DIV");
  assert.equal(summary.style.display, "flex");
  assert.equal(summary.style.flexWrap, "wrap");
  assert.equal(summary.style.gap, "2px");
  assert.equal(summary.children.length, 6);
  assert.equal(summary.children[0].textContent, "Lentezza (10)");
  assert.equal(summary.children[0].style.flex, "0 0 100%");
  assert.deepEqual(
    summary.children.slice(1).map((part) => part.textContent),
    effect.summaryParts.map((part) => part.label),
  );
  assert.ok(summary.children.slice(1).every((part) => (
    part.style.whiteSpace === "nowrap"
    && part.style.textOverflow === "clip"
    && part.style.overflow === "visible"
    && part.style.flex === "0 0 auto"
    && !part.textContent.includes("…")
  )));
});

test("la preview della card nasconde sempre i summaryParts", () => {
  const documentRef = createTestDocument();
  const { status, previewPill } = buildCompactCardStatus([{
    kind: "spell",
    key: "xanathar-lama-dombra",
    label: "Lama d'Ombra (10)",
    title: "Lama d'Ombra · 10 round rimanenti",
    summaryParts: [{
      id: "xanathar-lama-dombra-psychic-damage",
      label: "2d8 psichici",
    }],
  }], {
    hasExpandableEffects: false,
    documentRef,
  });

  assert.equal(previewPill.textContent, "Lama d'Ombra (10)");
  assert.equal(previewPill.children.length, 0);
  assert.equal(status.style.height, "14px");
  assert.equal(status.style.flex, "0 0 14px");
});

test("la pill compatta della Feature usa il tema e permette la terminazione", async () => {
  const documentRef = createTestDocument();
  const instance = {
    type: "class-feature",
    parentEffectId: "rage-1",
    sourceId: "barbarian",
  };
  let terminated = null;
  const pill = __buildCompactEffectPill(
    {
      kind: "class-feature",
      label: "🔥 Ira",
      title: "Ira | manuale",
      classFeatureInstance: instance,
      theme: {
        background: "#7f1d1d",
        accent: "#f97316",
        text: "#fff7ed",
      },
    },
    false,
    {
      documentRef,
      onTerminateClassFeature: (value) => {
        terminated = value;
      },
    },
  );

  assert.equal(pill.style.background, "#7f1d1d");
  assert.equal(pill.style.border, "1px solid #f97316");
  assert.equal(pill.style.color, "#fff7ed");
  assert.equal(pill.children.length, 1);
  await pill.children[0].dispatch("click", createTestEvent());
  assert.equal(terminated, instance);
});

test("il ritratto compatto conserva immagine, fallback e cornice boss", () => {
  const documentRef = createTestDocument();
  const rgba = (color, alpha) => `${color}@${alpha}`;
  const faction = { base: "#112233", border: "#abcdef" };
  const regular = buildCompactCardPortrait(
    { name: "Goblin" },
    {
      active: false,
      boss: false,
      portraitSize: 49,
      faction,
      rgba,
      documentRef,
    },
  );
  const boss = buildCompactCardPortrait(
    { name: "Drago", portrait: "dragon.png" },
    {
      active: true,
      boss: true,
      portraitSize: 59,
      faction,
      rgba,
      bossFrameSrc: "/boss-frame-ui.png",
      bossFrameScale: 1.3,
      bossFrameMask: "mask",
      documentRef,
    },
  );

  assert.equal(regular.portrait.children[0].textContent, "G");
  assert.equal(regular.portrait.style.marginTop, "4px");
  assert.equal(regular.bossFrame, null);
  assert.equal(boss.portrait.children[0].src, "dragon.png");
  assert.equal(boss.portrait.style.marginTop, "6px");
  assert.equal(boss.bossFrame.src, "/boss-frame-ui.png");
  assert.equal(boss.bossFrame.attributes["aria-hidden"], "true");
  assert.equal(boss.bossFrame.draggable, false);
  assert.equal(boss.bossFrame.style.width, "77px");
  assert.equal(boss.bossFrame.style.maskImage, "mask");
});

test("il nome compatto distingue gruppo, attivo e card ordinaria", () => {
  const documentRef = createTestDocument();
  const activeGroup = buildCompactCardName(
    {
      name: "Goblin 1",
      __groupCollapsed: true,
      __groupBase: "Goblin",
      __groupCount: 3,
    },
    { active: true, documentRef },
  );
  const regular = buildCompactCardName(
    { name: "Araldo" },
    { active: false, documentRef },
  );

  assert.equal(activeGroup.textContent, "Goblin (Gruppo)");
  assert.equal(activeGroup.title, "Goblin (x3)");
  assert.equal(activeGroup.style.color, "#fff");
  assert.equal(activeGroup.style.fontWeight, "700");
  assert.equal(regular.textContent, "Araldo");
  assert.equal(regular.title, "Araldo");
  assert.equal(regular.style.fontWeight, "600");
});

test("la presentazione HP compatta conserva dataset, barra e badge KO", () => {
  const documentRef = createTestDocument();
  const visible = buildCompactCardHP(
    { id: "enemy-1" },
    {
      showHP: true,
      safeHP: 0,
      hpMax: 12,
      hpPercent: 0,
      knockedOut: true,
      hpColorByPct: () => "#22c55e",
      documentRef,
    },
  );
  const hidden = buildCompactCardHP(
    { id: "enemy-2" },
    {
      showHP: false,
      safeHP: 7,
      hpMax: 10,
      hpPercent: 0.7,
      knockedOut: false,
      hpColorByPct: () => "#22c55e",
      documentRef,
    },
  );

  assert.equal(visible.hpText.dataset.cardHpText, "1");
  assert.equal(visible.hpText.textContent, "HP 0 / 12");
  assert.equal(visible.hpFill.dataset.hpFill, "1");
  assert.equal(visible.hpFill.dataset.itemId, "enemy-1");
  assert.equal(visible.hpFill.style.background, "#475569");
  assert.equal(visible.hpTrack.children[0], visible.hpFill);
  assert.equal(visible.knockedOutBadge.dataset.cardKoBadge, "1");
  assert.equal(visible.knockedOutBadge.title, "Fuori combattimento: 0 / 12");
  assert.equal(hidden.hpText.textContent, "");
  assert.equal(hidden.hpText.style.display, "none");
  assert.equal(hidden.hpFill.style.width, "0%");
  assert.equal(hidden.knockedOutBadge, null);
});

test("la shell compatta conserva tutti i contratti di riconciliazione", () => {
  const documentRef = createTestDocument();
  const selectionItemIds = ["boss", "boss::p1"];
  const rgba = (color, alpha) => `${color}@${alpha}`;
  const card = buildCompactCardShell(
    {
      id: "boss",
      name: "Drago",
      initiative: 18,
      isEpic: true,
      __groupCollapsed: false,
    },
    {
      active: true,
      boss: true,
      virtual: false,
      faction: { base: "#881111", border: "#ffaaaa" },
      rgba,
      canSeeHP: true,
      showHP: true,
      knockedOut: false,
      hasExpandableEffects: true,
      groupKey: "enemy::drago",
      selectionItemIds,
      dragAllowed: false,
      zoomScale: 1.08,
      documentRef,
    },
  );

  assert.equal(card.tagName, "ARTICLE");
  assert.deepEqual(card.dataset, {
    itemId: "boss",
    initiative: "18",
    groupCollapsed: "0",
    groupKey: "enemy::drago",
    trackerCard: "1",
    compactCard: "1",
    hpCanSee: "1",
    hpVisible: "1",
    knockedOut: "0",
    hasEffectOverflow: "1",
    isEpic: "1",
  });
  assert.equal(card.__selectionItemIds, selectionItemIds);
  assert.equal(card.attributes.draggable, "false");
  assert.equal(card.attributes["aria-label"], "Drago, iniziativa 18");
  assert.equal(card.style.width, "92px");
  assert.equal(card.style.height, "120px");
  assert.equal(card.style.cursor, "pointer");
  assert.equal(card.style.scale, "1.08");
  assert.equal(card.style.zIndex, "5");
  assert.equal(card.__selectionBaseShadow, card.style.boxShadow);
});

test("una shell virtuale conserva titolo, fallback e stato non trascinabile", () => {
  const documentRef = createTestDocument();
  const card = buildCompactCardShell(
    { id: "__LAIR__", name: "Azioni di Tana" },
    {
      active: false,
      boss: false,
      virtual: true,
      faction: { base: "#111111", border: "#aaaaaa" },
      rgba: (color, alpha) => `${color}@${alpha}`,
      canSeeHP: false,
      showHP: false,
      knockedOut: false,
      hasExpandableEffects: false,
      groupKey: "virtual::lair",
      selectionItemIds: [],
      dragAllowed: false,
      zoomScale: 1.08,
      documentRef,
    },
  );

  assert.equal(card.dataset.initiative, "0");
  assert.equal(card.title, "Azioni di Tana");
  assert.equal(card.attributes.draggable, "false");
  assert.equal(card.style.cursor, "default");
  assert.equal(card.style.scale, "1");
});

test("gli indicatori compatti distinguono gruppo, Epic, Lair e turno attivo", () => {
  const documentRef = createTestDocument();
  const faction = { base: "#111111", border: "#ffaaaa" };
  const rgba = (color, alpha) => `${color}@${alpha}`;
  const group = buildCompactCardIndicators(
    {
      initiative: 12,
      isEpic: true,
      __groupCollapsed: true,
      __groupCount: 3,
    },
    { active: true, isLair: false, faction, rgba, documentRef },
  );
  const epic = buildCompactCardIndicators(
    { initiative: 20, isEpicAction: true },
    { active: false, isLair: false, faction, rgba, documentRef },
  );
  const lair = buildCompactCardIndicators(
    { initiative: 20 },
    { active: false, isLair: true, faction, rgba, documentRef },
  );

  assert.equal(group.initiativeBadge.textContent, "12");
  assert.equal(group.statusBadge.textContent, "x3");
  assert.equal(group.statusBadge.title, "Gruppo collassato");
  assert.equal(group.activeMarker.title, "Turno attivo");
  assert.equal(group.activeMarker.attributes["aria-label"], "Turno attivo");
  assert.equal(epic.statusBadge.textContent, "EP");
  assert.equal(epic.statusBadge.title, "Azione Epica");
  assert.equal(epic.statusBadge.style.background, "#991b1b");
  assert.equal(epic.activeMarker, null);
  assert.equal(lair.statusBadge.textContent, "L");
  assert.equal(lair.statusBadge.title, "Azione di Tana");
});

test("lo status compatto senza effetti resta vuoto e ignora la selezione", () => {
  const documentRef = createTestDocument();
  const result = buildCompactCardStatus([], { documentRef });

  assert.equal(result.status.dataset.cardSelectionIgnore, "1");
  assert.equal(result.status.style.height, "14px");
  assert.deepEqual(result.status.children, []);
  assert.equal(result.effectSlot, null);
  assert.equal(result.previewPill, null);
  assert.equal(result.moreEffectsButton, null);
});

test("un singolo effetto compatto non espone controlli di espansione", () => {
  const documentRef = createTestDocument();
  const result = buildCompactCardStatus(
    [{ kind: "condition", label: "Prono", title: "Prono" }],
    { documentRef },
  );

  assert.equal(result.status.children[0], result.effectSlot);
  assert.deepEqual(result.effectSlot.children, [result.previewPill]);
  assert.equal(result.previewPill.textContent, "Prono");
  assert.equal(result.previewPill.style.flex, "1 1 100%");
  assert.equal(result.previewPill.attributes.role, undefined);
  assert.equal(result.previewPill.attributes["aria-expanded"], undefined);
  assert.equal(result.moreEffectsButton, null);
});

test("lo status con overflow conserva struttura e ARIA negli stati chiuso e aperto", () => {
  const effects = [
    { kind: "spell", key: "unto", label: "Unto", title: "Unto attivo" },
    { kind: "condition", label: "Prono", title: "Prono" },
  ];

  for (const [effectsPopoverOpen, expanded, display, label] of [
    [false, "false", "inline-flex", "Mostra altri 1 effetti"],
    [true, "true", "none", "Nascondi gli altri effetti"],
  ]) {
    const result = buildCompactCardStatus(effects, {
      effectsPopoverOpen,
      spellColor: () => ({ solid: "#123456", border: "#abcdef" }),
      documentRef: createTestDocument(),
    });

    assert.deepEqual(
      result.effectSlot.children,
      [result.previewPill, result.moreEffectsButton],
    );
    assert.equal(result.previewPill.attributes.role, "button");
    assert.equal(result.previewPill.attributes.tabindex, "0");
    assert.equal(result.previewPill.attributes["aria-expanded"], expanded);
    assert.equal(result.previewPill.attributes["aria-label"], label);
    assert.equal(result.moreEffectsButton.type, "button");
    assert.equal(result.moreEffectsButton.textContent, "+");
    assert.equal(result.moreEffectsButton.dataset.cardSelectionIgnore, "1");
    assert.equal(result.moreEffectsButton.attributes["aria-expanded"], expanded);
    assert.equal(result.moreEffectsButton.attributes["aria-label"], label);
    assert.equal(result.moreEffectsButton.title, label);
    assert.equal(result.moreEffectsButton.style.display, display);
  }
});

test("il toggle compatto sincronizza la transizione chiuso-aperto-chiuso", () => {
  const {
    previewPill,
    moreEffectsButton,
  } = buildCompactCardStatus(
    [
      { kind: "condition", label: "Prono", title: "Prono" },
      { kind: "condition", label: "Stordito", title: "Stordito" },
      { kind: "condition", label: "Accecato", title: "Accecato" },
    ],
    { documentRef: createTestDocument() },
  );

  syncCompactEffectsToggleState({
    previewPill,
    moreEffectsButton,
    effectsCount: 3,
    opened: true,
  });
  assert.equal(moreEffectsButton.style.display, "none");
  assert.equal(moreEffectsButton.attributes["aria-expanded"], "true");
  assert.equal(moreEffectsButton.attributes["aria-label"], "Nascondi gli altri effetti");
  assert.equal(moreEffectsButton.title, "Nascondi gli altri effetti");
  assert.equal(previewPill.attributes["aria-expanded"], "true");
  assert.equal(previewPill.attributes["aria-label"], "Nascondi gli altri effetti");

  syncCompactEffectsToggleState({
    previewPill,
    moreEffectsButton,
    effectsCount: 3,
    opened: false,
  });
  assert.equal(moreEffectsButton.style.display, "inline-flex");
  assert.equal(moreEffectsButton.attributes["aria-expanded"], "false");
  assert.equal(moreEffectsButton.attributes["aria-label"], "Mostra altri 2 effetti");
  assert.equal(moreEffectsButton.title, "Mostra altri 2 effetti");
  assert.equal(previewPill.attributes["aria-expanded"], "false");
  assert.equal(previewPill.attributes["aria-label"], "Mostra altri 2 effetti");
});

test("una risorsa leggendaria assente non costruisce pips compatti", () => {
  let buildCalls = 0;
  const buildPips = () => {
    buildCalls += 1;
    return createTestDocument().createElement("div");
  };

  assert.equal(
    buildCompactLegendaryResourcePips(null, {
      label: "Azioni leggendarie",
      buildPips,
    }),
    null,
  );
  assert.equal(
    buildCompactLegendaryResourcePips({ max: 0, current: 0 }, {
      label: "Azioni leggendarie",
      buildPips,
    }),
    null,
  );
  assert.equal(buildCalls, 0);
});

test("i pips leggendari compatti limitano il contatore e conservano accessibilità", () => {
  for (const [current, expectedCurrent] of [
    [-2, 0],
    [2, 2],
    [8, 3],
  ]) {
    const pips = createTestDocument().createElement("div");
    const result = buildCompactLegendaryResourcePips(
      { max: 3, current },
      {
        label: "Resistenze leggendarie",
        buildPips: () => pips,
      },
    );

    assert.equal(result, pips);
    assert.equal(pips.style.gap, "1px");
    assert.equal(pips.style.flex, "0 0 auto");
    assert.equal(pips.attributes.role, "group");
    assert.equal(
      pips.attributes["aria-label"],
      `Resistenze leggendarie: ${expectedCurrent}/3`,
    );
    assert.equal(pips.title, `Resistenze leggendarie: ${expectedCurrent}/3`);
  }
});

test("il wiring effetti compatto gestisce pointer, click e tastiera", async () => {
  const {
    previewPill,
    moreEffectsButton,
  } = buildCompactCardStatus(
    [
      { kind: "condition", label: "Prono", title: "Prono" },
      { kind: "condition", label: "Stordito", title: "Stordito" },
    ],
    { documentRef: createTestDocument() },
  );
  let opened = false;
  let toggleCalls = 0;
  bindCompactEffectsToggle({
    previewPill,
    moreEffectsButton,
    effectsCount: 2,
    requestToggle: async () => {
      toggleCalls += 1;
      opened = !opened;
      return opened;
    },
  });

  const pointerEvent = createTestEvent();
  await moreEffectsButton.dispatch("pointerdown", pointerEvent);
  assert.equal(pointerEvent.propagationStopped, true);
  assert.equal(toggleCalls, 0);

  const clickEvent = createTestEvent();
  await moreEffectsButton.dispatch("click", clickEvent);
  assert.equal(clickEvent.defaultPrevented, true);
  assert.equal(clickEvent.propagationStopped, true);
  assert.equal(toggleCalls, 1);
  assert.equal(moreEffectsButton.style.display, "none");
  assert.equal(previewPill.attributes["aria-expanded"], "true");

  const ignoredKeyEvent = createTestEvent({ key: "ArrowDown" });
  await previewPill.dispatch("keydown", ignoredKeyEvent);
  assert.equal(ignoredKeyEvent.defaultPrevented, false);
  assert.equal(toggleCalls, 1);

  const enterEvent = createTestEvent({ key: "Enter" });
  await previewPill.dispatch("keydown", enterEvent);
  await flushAsyncEvents();
  assert.equal(enterEvent.defaultPrevented, true);
  assert.equal(enterEvent.propagationStopped, true);
  assert.equal(toggleCalls, 2);
  assert.equal(moreEffectsButton.style.display, "inline-flex");
  assert.equal(previewPill.attributes["aria-expanded"], "false");
});

test("l'editor nome compatto salva il valore corrente e ripristina la card", async () => {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("article");
  const name = documentRef.createElement("div");
  name.textContent = "Nome iniziale";
  card.appendChild(name);
  card.draggable = true;
  let currentName = "Nome iniziale";
  const savedNames = [];

  enableCompactCardRename({
    card,
    name,
    getOriginalName: () => currentName,
    borderColor: "#abcdef",
    dragAllowed: true,
    saveName: async (nextName) => {
      savedNames.push(nextName);
      currentName = nextName;
    },
    documentRef,
  });
  currentName = "Nome aggiornato";

  const dblclickEvent = createTestEvent();
  await name.dispatch("dblclick", dblclickEvent);
  const input = card.children[0];
  assert.equal(dblclickEvent.defaultPrevented, true);
  assert.equal(dblclickEvent.propagationStopped, true);
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.value, "Nome aggiornato");
  assert.equal(input.maxLength, 120);
  assert.equal(input.style.border, "1px solid #abcdef");
  assert.equal(input.focused, true);
  assert.equal(input.selected, true);
  assert.equal(card.dataset.renaming, "1");
  assert.equal(card.draggable, false);

  input.value = "  Nome definitivo  ";
  const enterEvent = createTestEvent({ key: "Enter" });
  await input.dispatch("keydown", enterEvent);
  await flushAsyncEvents();
  assert.deepEqual(savedNames, ["Nome definitivo"]);
  assert.equal(enterEvent.defaultPrevented, true);
  assert.equal(card.children[0], name);
  assert.equal(name.textContent, "Nome definitivo");
  assert.equal(name.title, "Nome definitivo");
  assert.equal(card.dataset.renaming, undefined);
  assert.equal(card.draggable, true);
});

test("l'editor nome compatto annulla o ripristina il nome dopo un errore", async () => {
  for (const [key, shouldFail] of [
    ["Escape", false],
    ["Enter", true],
  ]) {
    const documentRef = createTestDocument();
    const card = documentRef.createElement("article");
    const name = documentRef.createElement("div");
    name.textContent = "Originale";
    card.appendChild(name);
    card.draggable = false;
    const errors = [];
    let saveCalls = 0;

    enableCompactCardRename({
      card,
      name,
      getOriginalName: () => "Originale",
      borderColor: "#abcdef",
      dragAllowed: false,
      saveName: async () => {
        saveCalls += 1;
        throw new Error("salvataggio fallito");
      },
      onError: (error) => errors.push(error.message),
      documentRef,
    });

    await name.dispatch("dblclick", createTestEvent());
    const input = card.children[0];
    input.value = "Nuovo nome";
    await input.dispatch("keydown", createTestEvent({ key }));
    await flushAsyncEvents();

    assert.equal(saveCalls, shouldFail ? 1 : 0);
    assert.deepEqual(errors, shouldFail ? ["salvataggio fallito"] : []);
    assert.equal(card.children[0], name);
    assert.equal(name.textContent, "Originale");
    assert.equal(name.title, "Originale");
    assert.equal(card.dataset.renaming, undefined);
    assert.equal(card.draggable, false);
  }
});

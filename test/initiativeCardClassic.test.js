import test from "node:test";
import assert from "node:assert/strict";
import {
  applyClassicCardFrame,
  buildClassicCardShell,
  deriveClassicCardPresentation,
  classicCardSpells,
} from "../src/initiativeCardClassic.js";

test("concentration belongs to its spell rather than the first effect on the card", () => {
  const spells = [{ name: "Ispirazione Bardica" }, { name: "Animare oggetti", casterId: "lavera" }];
  const result = classicCardSpells({ id: "lavera", spells, isConcentrating: true, concSpellKey: "animare oggetti" });
  assert.deepEqual(result.map(spell => [spell.name, spell.trackerConcentration]), [["Ispirazione Bardica", false], ["Animare oggetti", true]]);
  assert.equal(spells[1].trackerConcentration, undefined, "presentation does not change canonical spells");
});

test("concentration without a visible owner spell keeps a named reference pill", () => {
  const result = classicCardSpells({ id: "lavera", spells: [{ name: "Benedizione" }], isConcentrating: true, concSpellKey: "turbine" });
  assert.equal(result.length, 2);
  assert.deepEqual(result[1], { name: "turbine", trackerConcentration: true, trackerConcentrationOnly: true });
  assert.deepEqual(classicCardSpells({ spells: result, __groupCollapsed: true }), []);
});

test("another caster's copy of the same spell does not get the local concentration marker", () => {
  const result = classicCardSpells({ id: "lavera", spells: [{ name: "Volare", casterId: "omar" }], isConcentrating: true, concSpellKey: "volare" });
  assert.equal(result[0].trackerConcentration, false);
  assert.equal(result[1].trackerConcentration, true);
});

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        append(...children) {
          this.children.push(...children);
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
      };
    },
  };
}

test("la presentazione classica distingue boss, HP visibili e KO", () => {
  const boss = deriveClassicCardPresentation(
    {
      id: "boss",
      attitude: "enemy",
      legendary: { max: 3 },
      hp: 0,
      hpMax: 80,
      spells: [{ name: "Paura" }],
    },
    {
      isGM: true,
      cardEffectData: { flags: {}, custom: [], instances: [] },
    },
  );
  const hiddenEnemy = deriveClassicCardPresentation(
    { id: "enemy", attitude: "enemy", hp: 4, hpMax: 8 },
    { isGM: false },
  );

  assert.equal(boss.hasLegendary, true);
  assert.equal(boss.isBoss, true);
  assert.equal(boss.hpVisible, true);
  assert.equal(boss.knockedOut, true);
  assert.equal(boss.hasCardEffects, true);
  assert.equal(hiddenEnemy.hpVisible, false);
  assert.equal(hiddenEnemy.knockedOut, false);
});

test("gruppi e ID virtuali conservano i vincoli della card classica", () => {
  const collapsed = deriveClassicCardPresentation(
    {
      id: "group",
      attitude: "pc",
      hp: 0,
      hpMax: 12,
      __groupCollapsed: true,
      isConcentrating: true,
    },
    {
      isGM: false,
      cardEffectData: { flags: { Prono: true }, custom: [], instances: [] },
    },
  );
  const virtual = deriveClassicCardPresentation(
    { id: "__LAIR__", attitude: "enemy", hp: 0, hpMax: 10 },
    { isGM: true, isLair: true },
  );

  assert.equal(collapsed.knockedOut, false);
  assert.equal(collapsed.hasCardEffects, false);
  assert.equal(collapsed.playerCardHasHP, false);
  assert.equal(virtual.dragAllowed, false);
  assert.equal(virtual.knockedOut, false);
});

test("buff e debuff nascosti non riservano spazio nella card classica", () => {
  const hiddenOnly = deriveClassicCardPresentation(
    { id: "target", attitude: "enemy", hp: 10, hpMax: 10 },
    {
      isGM: true,
      cardEffectData: {
        flags: {},
        custom: [],
        instances: [{
          id: "spell-effect-1",
          condition: "Terreno difficile / Ragnatela",
          effectKind: "debuff",
        }],
      },
    },
  );
  const withCondition = deriveClassicCardPresentation(
    { id: "target", attitude: "enemy", hp: 10, hpMax: 10 },
    {
      isGM: true,
      cardEffectData: {
        flags: {},
        custom: [],
        instances: [
          {
            id: "spell-effect-1",
            condition: "Terreno difficile / Ragnatela",
            effectKind: "debuff",
          },
          { id: "condition-1", condition: "Prono" },
        ],
      },
    },
  );

  assert.equal(hiddenOnly.hasCardEffects, false);
  assert.equal(withCondition.hasCardEffects, true);
});

test("la shell classica conserva dataset, selezione e draggable", () => {
  const selectionItemIds = ["enemy-1", "enemy-2"];
  const card = buildClassicCardShell(
    {
      id: "enemy-1",
      initiative: 15,
      __groupCollapsed: true,
      isEpicAction: false,
    },
    {
      groupKey: "enemy::goblin",
      selectionItemIds,
      hpVisible: true,
      hpMax: 7,
      knockedOut: false,
      dragAllowed: true,
      documentRef: createTestDocument(),
    },
  );

  assert.deepEqual(card.dataset, {
    itemId: "enemy-1",
    initiative: "15",
    groupCollapsed: "1",
    groupKey: "enemy::goblin",
    trackerCard: "1",
    hpCanSee: "1",
    hpVisible: "1",
    knockedOut: "0",
    isEpicAction: "0",
  });
  assert.equal(card.__selectionItemIds, selectionItemIds);
  assert.equal(card.attributes.draggable, "true");
  assert.equal(card.style.cursor, "pointer");
});

test("la cornice classica conserva i quattro layer e lo stato zoom base", () => {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("div");
  const transforms = [];
  const result = applyClassicCardFrame(
    card,
    { base: "#112233", border: "#abcdef" },
    {
      isBoss: true,
      bossConfig: { scale: 1.2, zIndex: 5 },
      rgba: (color, alpha) => `${color}@${alpha}`,
      instaTransform: (element, value) => {
        transforms.push([element, value]);
      },
      outlineW: 1.5,
      frameW: 2,
      rOuter: 16,
      rInner: 14,
      documentRef,
    },
  );

  assert.deepEqual(
    card.children,
    [result.outline, result.ringFill, result.ringHole, result.sheen],
  );
  assert.equal(result.outline.style.border, "1.5px solid #abcdef@0.72");
  assert.equal(result.ringFill.style.inset, "1.5px");
  assert.equal(result.ringHole.style.inset, "3.5px");
  assert.equal(card.dataset.zoomState, "base");
  assert.deepEqual(transforms, [[card, "translateZ(0) scale(1.2)"]]);
  assert.equal(card.style.zIndex, "5");
});

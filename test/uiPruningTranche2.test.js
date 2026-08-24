import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEffectSummaryContainer,
} from "../src/effectSummaryViewCore.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const activeResolution = source("src/spell-active-resolution.js");
const activeAdapter = source("src/spellUnifiedActiveAdapter.js");
const panelCore = source("src/spellUnifiedPanelCore.js");
const panelViewCore = source("src/spellUnifiedPanelViewCore.js");
const effectsView = source("src/spellUnifiedPanelEffectsView.js");
const turnNotice = source("src/turn-notice.ts");
const conditionsModal = source("src/effects-modal.ts");
const conditionRemoval = source("src/ctx-remove-condition.ts");

function modelFor(spellId, sessionPatch = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId });
  const session = createSpellPanelSession({
    contract,
    casterId: "caster",
    ...sessionPatch,
  });
  return buildUnifiedPanelViewModel({
    contract,
    session,
    targetCandidates: [{ key: "target", label: "Target", hp: 20, hpMax: 30 }],
  });
}

function fakeNode() {
  return {
    style: {},
    dataset: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

test("i campi HP condivisi non ripetono istruzioni già espresse da label e controllo", () => {
  const damage = modelFor("wall-of-fire", {
    targetIds: ["target"],
    outcomes: { target: "failed" },
    hpValues: { damage: 10 },
  });
  const healing = modelFor("mass-cure-wounds", {
    targetIds: ["target"],
    hpValues: { healing: 10 },
  });

  assert.equal(damage.effects.fields[0].label, "Danno · 5d8");
  assert.equal(damage.effects.fields[0].hint, "");
  assert.equal(healing.effects.fields[0].hint, "");
  assert.equal(damage.effects.description, "");
  assert.equal(healing.effects.description, "");
});

test("la tranche 2 mantiene solo blocker e conseguenze operative", () => {
  assert.doesNotMatch(activeResolution, /Bersaglio pronto|TS pronto|Bersaglio selezionato/);
  assert.match(activeResolution, /Seleziona l'esito del TS/);
  assert.match(activeResolution, /Seleziona un bersaglio prima di continuare/);
  assert.doesNotMatch(activeResolution, /: "Scegli una creatura\."/);
  assert.match(panelViewCore, /hint: selectedFormula\s*\n\s*\? ""/);
  assert.doesNotMatch(panelViewCore, /Inserisci il totale del tiro \$\{selectedFormula\}/);
  assert.doesNotMatch(panelViewCore, /Valore da applicare ai bersagli\./);
  assert.match(turnNotice, /const saveInstruction = \[/);
  assert.doesNotMatch(turnNotice, /String\(raw\?\.instruction \|\| "Risolvi il tiro salvezza\./);
});

test("fallback condivisi non proiettano ID o enum tecnici", () => {
  assert.doesNotMatch(activeAdapter, /definition\?\.label \|\| action\?\.id/);
  assert.doesNotMatch(activeAdapter, /definition\?\.buttonLabel[\s\S]{0,100}action\?\.id/);
  assert.match(activeAdapter, /\|\| "Azione"/);
  assert.doesNotMatch(panelCore, /label: text\(action\.label\) \|\| entry\.id/);
  assert.doesNotMatch(panelCore, /buttonLabel: text\(action\.buttonLabel\)[\s\S]{0,90}entry\.id/);
  assert.match(effectsView, /persistentStateLabels\[persistent\.state\] \|\| "da controllare"/);
  assert.doesNotMatch(effectsView, /\[trigger\.type, trigger\.resolution\]/);
  assert.match(panelViewCore, /"spell-lifecycle": "Incantesimo"/);
  assert.match(panelViewCore, /"area-transaction": "Area"/);
});

test("summaryParts elimina duplicati primari senza toccare mechanics", () => {
  const documentRef = { createElement: fakeNode };
  const parent = fakeNode();
  parent.textContent = "No reaz.";
  const container = buildEffectSummaryContainer({
    label: "No reaz.",
    summaryParts: [
      { id: "duplicate", label: "No reaz." },
      { id: "detail", label: "Tira d10" },
      { id: "same-detail", label: "Tira d10" },
    ],
  }, parent, { documentRef });

  assert.equal(container.dataset.summaryParts, "1");
  assert.equal(container.children[0], parent);
  assert.equal(container.children[1].textContent, "Tira d10");
});

test("condizioni ed effetti usano label compatta con dettaglio accessibile", () => {
  assert.match(conditionsModal, /label: compactSpellEffectLabel\(/);
  assert.match(conditionsModal, /detail: formatConditionInstance\(instance\)/);
  assert.match(conditionsModal, /text\.title = row\.detail/);
  assert.match(conditionRemoval, /label: compactSpellEffectLabel\(/);
  assert.match(conditionRemoval, /detail: formatConditionInstance\(instance\)/);
  assert.match(conditionRemoval, /name\.title = row\.detail/);
});

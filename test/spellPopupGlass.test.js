// Lots V1 and V2 of the purple popups' audit (docs/AUDIT_UX_POPUP_VIOLA.md): the spell popups stand on the consoles' sheets,
// on the plugin's glass tinted violet, with the consoles' outcomes and main button.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sheet = read("../public/spell-popover.css");
const pages = {
  active: read("../spell-active-resolution.html"),
  choice: read("../spell-turn-action-choice.html"),
  fireball: read("../delayed-blast-fireball-resolution.html"),
  counterspell: read("../counterspell.html"),
};
const surge = read("../wild-magic-surge.html");
const activeController = read("../src/spell-active-resolution.js");
const fireballController = read("../src/delayed-blast-fireball-resolution.js");
const choiceController = read("../src/spell-turn-action-choice.js");
const { spellActiveResolutionPopoverHeight } = await import("../src/spellActiveResolutionCore.js");

test("the four popups load the common sheets, in the consoles' order, then their own", () => {
  for (const [name, html] of Object.entries(pages)) {
    const order = ["/ui-typography.css", "/popover-glass.css", "/console-shell.css", "/console-panel.css", "/spell-popover.css"]
      .map((href) => html.indexOf(`href="${href}"`));
    assert.ok(order.every((at) => at >= 0), `${name} misses a sheet`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${name} loads the sheets out of order`);
    assert.match(html, /<main id="app" class="glass-shell" data-glass-popover="1"/, name);
  }
});

test("no theme on the root: a page whose theme differs from its iframe's gets an opaque black canvas", () => {
  for (const [name, source] of [...Object.entries(pages), ["sheet", sheet], ["surge", surge]]) {
    assert.doesNotMatch(source, /:root\s*\{[^}]*color-scheme/, name);
  }
  assert.match(sheet, /#app \{[^}]*color-scheme: dark/, "the controls and the scrollbars stay dark");
});

test("the plugin's glass tinted violet, and fuchsia for the surge", () => {
  assert.match(sheet, /--obrt-popover-glass: rgba\(60, 40, 104, \.62\)/);
  assert.match(surge, /--obrt-popover-glass: rgba\(112, 30, 110, \.62\)/);
  for (const [name, source] of [...Object.entries(pages), ["sheet", sheet]]) {
    assert.doesNotMatch(source, /rgba\(76, ?29, ?149/, `${name} keeps the old veil`);
    assert.doesNotMatch(source, /blur\(6px\)/, `${name} keeps the old blur`);
    assert.doesNotMatch(source, /linear-gradient\(#8b5cf6/, `${name} keeps the violet button`);
  }
});

test("the plugin's font and scale: no system font, no display font, no size outside the scale", () => {
  for (const [name, source] of [...Object.entries(pages), ["sheet", sheet]]) {
    assert.doesNotMatch(source, /system-ui/, name);
    assert.doesNotMatch(source, /--obrt-font-display|Georgia/, name);
    assert.doesNotMatch(source, /(?:10|11)\.5px/, name);
  }
  assert.doesNotMatch(surge, /--obrt-font-display|@keyframes swirl/, "the surge keeps its hexagon, not the turning light");
});

test("every outcome row is the consoles' segmented control, and its buttons say what they stand for", () => {
  for (const id of ["attackOutcomes", "preparedSaveOutcomes", "singleSaveOutcomes", "telekinesisOutcomes"]) {
    assert.match(pages.active, new RegExp(`id="${id}" class="outcomes segmented"`), id);
  }
  assert.match(pages.active, /data-attack-outcome="hit" data-outcome="hit"/);
  assert.match(pages.active, /data-save-outcome="failed" data-outcome="failed"/);
  assert.match(pages.active, /data-telekinesis-outcome="failed" data-outcome="failed"/);
  assert.match(pages.counterspell, /data-result="failed" data-outcome="failed"/);
  assert.doesNotMatch(activeController, /classList\.toggle\("active"/, "aria-pressed is the only state");
  assert.doesNotMatch(fireballController, /classList\.toggle\("active"/, "aria-pressed is the only state");
  assert.match(activeController, /function markOutcome\(button, outcome, pressed\)/);
  assert.match(activeController, /outcomeGroup\.className = "segmented mini"/);
  assert.match(fireballController, /outcomeGroup\.className = "segmented mini"/);
});

test("the attack row follows the console: hit, critical, miss", () => {
  const row = pages.active.slice(pages.active.indexOf('id="attackOutcomes"'), pages.active.indexOf('id="preparedSaveOutcomes"'));
  assert.ok(row.indexOf('"hit"') < row.indexOf('"critical"') && row.indexOf('"critical"') < row.indexOf('"miss"'));
});

test("D3: the saves in the panel's order, in the delayed fireball too", () => {
  assert.match(fireballController, /\[\["passed", "Superato"\], \["failed", "Fallito"\]\]/);
});

test("the main button is red when it registers damage, blue otherwise", () => {
  assert.match(activeController, /\$\("apply"\)\.classList\.toggle\("primary", !applyRegistersDamage\(\)\)/);
  assert.match(activeController, /function applyRegistersDamage\(\) \{[\s\S]*?mechanics\?\.damageBonus[\s\S]*?payload\?\.action\?\.damage \|\| isPrismaticWallTraversal\(\)/);
  assert.match(pages.active, /id="apply" class="apply primary"/);
  assert.match(pages.fireball, /id="apply" class="apply"/, "the detonation registers damage");
  assert.match(pages.counterspell, /id="cast" class="apply primary"/, "Counterspell does not");
});

test("the defenses are the consoles' chip", () => {
  assert.match(activeController, /chip\.className = `defense-chip damage-defense is-\$\{row\.defense\}`/);
});

test("the bulk row names what it does", () => {
  assert.match(pages.active, /data-bulk-outcome="passed">Tutti superati</);
  assert.match(pages.active, /data-bulk-outcome="failed">Tutti falliti</);
  assert.match(pages.active, /data-bulk-outcome="immune">Tutti immuni</);
  assert.match(pages.active, /<span class="caption">Creature colpite<\/span>/);
});

test("the shell fills its window, and the window never follows the content", () => {
  for (const source of [activeController, fireballController, choiceController]) {
    assert.doesNotMatch(source, /scrollHeight \|\| 0\)/);
    assert.doesNotMatch(source, /ResizeObserver/);
  }
  assert.doesNotMatch(sheet, /#app \{[^}]*height: auto/);
  assert.doesNotMatch(choiceController, /OBR\.popover\.setHeight/, "who opens it knows its height");
  assert.match(activeController, /const targetHeight = spellActiveResolutionPopoverHeight\(payload\)/);
});

// Lot V3: the active popup's header and facts.
test("the header says the spell, who casts it and its cost: no eyebrow, no line of its own for the caster", () => {
  assert.doesNotMatch(pages.active, /id="eyebrow"|id="caster"|id="singleHealTitle"|id="telekinesisTitle"|id="prismaticWallTitle"/);
  assert.doesNotMatch(activeController, /\$\("eyebrow"\)|\$\("caster"\)|\$\("singleHealTitle"\)|\$\("telekinesisTitle"\)|\$\("prismaticWallTitle"\)/);
  assert.match(pages.active, /id="economy" class="cost-tag"/);
  assert.match(activeController, /function renderEconomy\(\)/);
  assert.match(activeController, /node\.dataset\.cost = value === "bonus-action" \? "bonus" : "action"/);
});

test("the costs' tags live in the sheet the consoles and the popups share", () => {
  const panel = read("../public/console-panel.css");
  assert.match(panel, /\.cost-tag\[data-cost="reaction"\]::before/);
  assert.match(panel, /--cost-action: #4ade80/);
  assert.doesNotMatch(read("../pc-attack.html"), /cost-tag|--cost-action/);
});

test("the same words never twice: the action's name only when the button does not say it", () => {
  const subtitle = activeController.slice(activeController.indexOf("function renderHeadingSubtitle()"), activeController.indexOf("function conditionInstances"));
  assert.match(subtitle, /buttonSaysIt = !!buttonWords && \(actionWords === buttonWords \|\| actionWords\.startsWith/);
  assert.match(subtitle, /\[casterName, redundant \? "" : rawActionLabel\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.doesNotMatch(pages.active, /class="micropills"|class="micropill"/);
});

test("one line of facts above the damage, with the DC when it is known, and no dice where a row says them", () => {
  assert.match(pages.active, /<p id="micropills" class="action-facts" data-facts><\/p>/);
  assert.equal((pages.active.match(/class="action-facts" data-facts/g) || []).length, 4, "the top of the panel, attack, save, heal");
  assert.match(pages.active, /\.view:has\(\.section:not\(\[hidden\]\) \.damage-outcome-row\) #micropills \{ display: none; \}/);
  const facts = activeController.slice(activeController.indexOf("function renderActiveMicropills()"), activeController.indexOf("function renderTargetLine"));
  assert.match(facts, /const facts = pills\.join\(" · "\)/);
  assert.match(facts, /const damageRowInView = !childZone\(\) && \(!saveArea \|\| currentTargetItems\(\)\.length > 0\)/);
  assert.match(activeController, /payload\?\.action\?\.save\?\.dc\s*\?\? payload\?\.castContext\?\.spellSaveDC\s*\?\? payload\?\.spellSaveDC\s*\?\? caster\?\.metadata\?\.\[META_KEY\]\?\.initiativeCard\?\.spellSaveDC/);
});

test("the target once: its menu when there is one, otherwise its row with the hit points", () => {
  assert.match(pages.active, /id="targetLine" class="form-row"/);
  for (const id of ["attackTarget", "saveTarget", "telekinesisTarget", "prismaticWallTarget"]) {
    assert.match(pages.active, new RegExp(`<div class="form-row"><span class="form-label">Bersaglio</span><select id="${id}"`), id);
  }
  assert.match(pages.active, /:is\(#attackTarget, #saveTarget, #telekinesisTarget, #prismaticWallTarget\):not\(\[hidden\]\)\) #targetLine \{ display: none; \}/);
  assert.match(activeController, /`\$\{hp\}\/\$\{hpMax\}`/);
  assert.match(activeController, /`\$\{numbers\} PF`/);
  assert.doesNotMatch(activeController, /setStatus\("Seleziona un bersaglio prima di continuare\."\);\s*\} else if \(statusMessage/, "the row says it, not a second line");
});

test("a damage row's label is the type, then its dice, as in the consoles", () => {
  assert.match(activeController, /function renderAmountLabel\(node, type, dice\)/);
  assert.doesNotMatch(activeController, /Danno del fulmine|Danno della linea di fuoco|Danno dell'esplosione|`Danno \$\{/);
});

// Lot V4: D2, the fixed row, the messages' bar.
test("D2: one height for each kind of popup, whatever the content", () => {
  const height = (action, extra = {}) => spellActiveResolutionPopoverHeight({ action, ...extra });
  assert.equal(height({ resolutionKind: "single-attack" }), 310);
  assert.equal(height({ resolutionKind: "single-attack", maxAttacks: 2 }), 480, "several attacks");
  assert.equal(height({ resolutionKind: "single-attack", shortenStaticZone: { chooseFrom: true } }), 354, "its extra menu");
  assert.equal(height({ resolutionKind: "single-save" }), 330);
  assert.equal(height({ resolutionKind: "single-save", manualSaveAtTable: true }), 270, "no outcome row");
  assert.equal(height({ resolutionKind: "single-save", save: { abilityOptions: [{ value: "str", label: "For" }] } }), 374, "its extra menu");
  assert.equal(height({ resolutionKind: "single-heal" }), 230);
  assert.equal(height({ resolutionKind: "telekinesis-contest" }), 300);
  assert.equal(height({ resolutionKind: "blink-return" }), 190);
  assert.equal(height({ resolutionKind: "child-zone" }), 500);
  assert.equal(height({ resolutionKind: "prismatic-wall-traversal" }), 520);
  assert.equal(height({ resolutionKind: "prismatic-wall-layers" }), 300);
  assert.equal(height({ resolutionKind: "save-area" }), 450);
  assert.equal(height({ resolutionKind: "prepared" }, { mode: "prepared" }), 300);
  assert.equal(height({ resolutionKind: "prepared" }, { mode: "prepared", choiceOptions: [{ value: "a" }, { value: "b" }] }), 344, "its variants");
  assert.equal(height({ type: "manual" }, { mode: "prepared" }), 200);
});

test("the fixed row has the total and the defenses beside the main button, for every kind", () => {
  assert.match(pages.active, /id="footer" class="apply-row"><button id="apply"[^>]*>Applica<\/button><span id="summary" class="total" hidden><\/span><div id="damageDefenses" class="defense-chips" hidden><\/div><\/div>/);
  assert.match(activeController, /function renderSummary\(missing = "", label = "", amount = null\)/);
  assert.match(activeController, /Manca l'esito di \$\{missingOutcomes\}/);
  assert.match(activeController, /subjects\.length > 1 \? `\$\{displayName\(item\)\} · \$\{said\}` : said/, "the creature's name only when there are several");
  assert.match(activeController, /\$\("footer"\)\.hidden = false/);
});

test("a message is a bar at the bottom, with its kind; a failure is an error", () => {
  assert.match(pages.active, /<footer class="status-bar"><p id="status" class="status" role="status" aria-live="polite" hidden><\/p><\/footer>/);
  assert.match(sheet, /\.status-bar:has\(> \.status\[hidden\]\), \.status-bar:has\(> \.status:empty\) \{ display: none; \}/);
  assert.match(activeController, /function setStatus\(message, stale = false, kind = ""\)/);
  assert.match(activeController, /\$\("status"\)\.dataset\.kind = kind \|\| \(stale \? "warn" : ""\)/);
  for (const message of ["Risoluzione non riuscita", "Posizionamento non riuscito", "Scelta dello spazio non riuscita"]) {
    assert.match(activeController, new RegExp(`${message}[^\\n]*false, "error"\\)`), message);
  }
  assert.match(activeController, /Risoluzione non riuscita: \$\{code\}`, false, "error"\)/);
});

test("nothing blinks at every keystroke: the renderers that wait for the scene keep the button and the row as they are", () => {
  const render = activeController.slice(activeController.indexOf("function render() {"), activeController.indexOf("async function placeBlinkReturn"));
  assert.doesNotMatch(render, /Caricamento bersagli/);
  assert.match(render, /\} else if \(singleSave\) \{\s*void renderSingleSave\(\);\s*\} else if \(singleHeal\) \{\s*void renderSingleHeal\(\);/);
  assert.doesNotMatch(render, /renderTargetLine\(""\);\s*renderContext/);
});

// Lot V5: the creatures and the area, the wall, and where a reach starts.
test("an area in the panel's words: the step says what has been drawn, beside the button that draws it", () => {
  assert.match(pages.active, /<span id="placementStatus" class="hint"><\/span><button id="place" type="button">Posiziona area<\/button>/);
  assert.doesNotMatch(pages.active, /Posiziona sagoma/);
  assert.match(activeController, /place: "Posiziona area", again: "Riposiziona area", done: "Area confermata"/);
  assert.match(activeController, /\$\{placementWords\(\)\.done\}: \$\{creaturesHit\(targets\.length\)\}\./);
  assert.match(activeController, /Le creature colpite compariranno qui\./);
  assert.doesNotMatch(activeController, /I bersagli sono ora bloccati/, "the step's line says it");
  assert.match(activeController, /\$\("place"\)\.hidden = placementPending/);
});

test("the damage comes before the list of creatures, and each row has its hit points", () => {
  const at = (id) => pages.active.indexOf(`id="${id}"`);
  assert.ok(at("placementToolbar") < at("damageField") && at("damageField") < at("bulkOutcomes") && at("bulkOutcomes") < at("targets"));
  assert.match(activeController, /hp\.className = "target-hp";\s*hp\.textContent = targetHpNumbers\(item\)/);
  assert.match(sheet, /\.target-hp \{ flex: none;/);
  assert.match(sheet, /\.target \{ display: flex;/, "with or without the hit points, the outcomes end on the right edge");
});

test("the wall: a row per layer, and the fixed row says what is missing, then what the resolution will apply", () => {
  for (const gone of ["crossing", "Requisito RAW", "Distruzione manuale", "Fallito: danno pieno", "prismatic-wall-layer__top", "prismatic-wall-layer__damage"]) {
    assert.doesNotMatch(activeController, new RegExp(gone), gone);
  }
  assert.match(activeController, /saveWithDC\("dex"\)\} per ogni strato/);
  assert.match(activeController, /Manca la creatura\./);
  assert.match(activeController, /Manca l'esito di \$\{layersCount\(missingOutcomes\)\}/);
  assert.match(activeController, /Manca il danno di \$\{layersCount\(missingDamage\)\}/);
  assert.match(activeController, /prismaticWallTraversalPlan\(\{/);
  assert.match(activeController, /spellDamagePartAfterDefense\(part, defenses, ignored\)/);
  assert.match(pages.active, /\.prismatic-wall-layers \{[^}]*overflow: auto/);
});

test("F5: a reach says where it starts, and only a hand is a hand", async () => {
  const { SPELL_ACTIVE_RESOLUTION_ACTIONS } = await import("../src/spellActiveResolutionRules.js");
  const hands = new Set(["arcane-hand", "xanathar-stretta-della-terra-di-maximilian"]);
  let reaches = 0;
  for (const [spellId, actions] of Object.entries(SPELL_ACTIVE_RESOLUTION_ACTIONS)) {
    for (const action of actions) {
      if (action.rangeOrigin !== "root" || !action.range) continue;
      reaches += 1;
      assert.ok(action.rangeOriginLabel, `${spellId}: ${action.id}`);
      assert.equal(action.rangeOriginLabel === "dalla mano", hands.has(spellId), `${spellId}: ${action.id}`);
    }
  }
  assert.equal(reaches, 11);
  assert.match(activeController, /\$\{reach\} \$\{payload\.action\.rangeOriginLabel \|\| "dalla zona"\}/);
});

test("the wall's layers speak Italian, and say nothing when there is nothing to say", async () => {
  const { PRISMATIC_WALL_LAYERS } = await import("../src/prismaticWallRules.js");
  const said = JSON.stringify(PRISMATIC_WALL_LAYERS);
  assert.doesNotMatch(said, /Passwall|Daylight|Dispel Magic|RAW/);
  assert.match(said, /Passapareti/);
  assert.match(said, /Luce diurna/);
  assert.match(said, /Dissolvi magie/);
});

test("a sub-zone: first how many, then where; the fixed row says what is missing, and its save is named", () => {
  const at = (id) => pages.active.indexOf(`id="${id}"`);
  assert.ok(at("childCountField") < at("placementToolbar"));
  assert.match(activeController, /childZone\(\)\?\.save\?\.ability/);
  assert.match(activeController, /\$\("bulkOutcomes"\)\.hidden = !targets\.length/);
  assert.match(activeController, /selectedCount !== requiredCount \? "Manca la posizione\."/);
  assert.match(activeController, /child\.resolution === "save" && targets\.length/, "no creatures to count where they save nothing");
  assert.match(activeController, /input\.placeholder = depthDie/);
});

// Lot V6: the turn's choice is a list, and says whose it is.
test("D5: a list in a box, the name on the left and what it does on the right, at the lists' pitch", () => {
  assert.match(pages.choice, /\.actions \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\); row-gap: var\(--list-gap\)/);
  assert.match(pages.choice, /\.action \{ grid-column: 1 \/ -1; display: grid; grid-template-columns: subgrid;/);
  assert.match(pages.choice, /\.action span \{[^}]*text-align: right/);
  assert.doesNotMatch(pages.choice, /min-height:62px|action--direct|action--telekinesis/, "no more cards");
  assert.doesNotMatch(choiceController, /action--direct|action--telekinesis/);
});

test("the caster in the header, the action's whole text in the tooltip, the messages in the bar", () => {
  assert.match(pages.choice, /<h1 id="title" class="title">Azione<\/h1>\s*<div id="subtitle" class="subtitle" hidden><\/div>/);
  assert.doesNotMatch(pages.choice, /class="eyebrow"/);
  assert.match(choiceController, /subtitle\.textContent = String\(request\.casterName \|\| ""\)\.trim\(\)/);
  assert.match(choiceController, /button\.title = String\(payload\.action\.detail\)/);
  assert.match(pages.choice, /<footer class="status-bar"><p id="status" class="status" role="status" aria-live="polite" hidden><\/p><\/footer>/);
  assert.match(choiceController, /status\.dataset\.kind = error \? "error" : ""/);
});

test("the choices' heights follow the list, not the old cards", () => {
  const prompt = read("../src/callLightningTurnPromptController.js");
  assert.match(prompt, /return CHOICE_LIST_BASE_HEIGHT \+ actionCount \* CHOICE_LIST_ROW_HEIGHT/);
  assert.match(prompt, /TELEKINESIS_CHOICE_POPOVER_HEIGHT = 180/);
  assert.doesNotMatch(prompt, /rows \* 70/);
});

test("Controllare Venti has a short form beside its names too", () => {
  for (const id of ["gusts", "downdraft", "updraft", "pause"]) assert.match(choiceController, new RegExp(`id === "control-winds-${id}"`));
});

test("F6: a sub-zone refused says what to change, in words", () => {
  assert.match(activeController, /setStatus\(resolutionErrorText\(error\), false, "error"\)/);
  assert.match(activeController, /La fessura deve andare da un bordo all'altro della zona: riposizionala\./);
  assert.match(activeController, /Il vortice deve stare dentro la zona: riposizionalo\./);
  assert.match(activeController, /return `Risoluzione non riuscita: \$\{message\}`/, "any other keeps its code");
});

// Lot V7: Counterspell speaks as the other popups.
const counterController = read("../src/counterspell.js");
test("Counterspell: the spell is the title, who casts it stands under it, the reaction has its tag", () => {
  assert.match(pages.counterspell, /<h1 id="title" class="title">Controincantesimo<\/h1>\s*<div id="subtitle" class="subtitle" hidden><\/div>/);
  assert.match(pages.counterspell, /<span class="cost-tag" data-cost="reaction"[^>]*>Reazione<\/span>/);
  assert.doesNotMatch(pages.counterspell, /class="eyebrow"|class="economy"|class="seal"|class="section-title"/);
  assert.match(counterController, /\$\("subtitle"\)\.textContent = scene\.caster\.name/);
  assert.doesNotMatch(counterController, /\$\("title"\)\.textContent/);
});

test("Counterspell: the labels on the left of their fields, and no line says what the menu says", () => {
  for (const [id, label] of [["target", "Contro"], ["spell", "Lancia"], ["slot", "Slot"]]) {
    assert.match(pages.counterspell, new RegExp(`<div class="form-row"><label class="form-label" for="${id}">${label}</label>`), label);
  }
  assert.match(counterController, /!entry \|\| entry\.inRange/, "the distance is in the menu: a line only out of range");
  assert.match(counterController, /gli incantesimi della scheda di \$\{target\.name\}\.` : ""/, "the field's placeholder says how to search");
});

test("Counterspell: the fixed row says what is missing, then what it spends; a message is the bar's", () => {
  assert.match(pages.counterspell, /class="apply-row"><div class="defense-chips"><\/div><span id="summary" class="total"><\/span><button id="cast" class="apply primary" type="button" disabled>Lancia<\/button>/);
  for (const said of ["Manca la creatura\\.", "Manca l'incantesimo\\.", "Manca il livello\\.", "Manca l'esito della prova\\.", "Spende la reazione\\."]) {
    assert.match(counterController, new RegExp(said), said);
  }
  assert.match(counterController, /Spende la reazione e lo slot di \$\{slot\?\.level\}° livello\./);
  assert.match(pages.counterspell, /<footer class="status-bar"><p id="status" class="status" role="status" aria-live="polite" hidden><\/p><\/footer>/);
  assert.match(counterController, /\$\("status"\)\.dataset\.kind = kind/);
  assert.doesNotMatch(pages.counterspell, /data-tone="(error|ok)"/);
  assert.match(read("../src/counterspellLauncher.js"), /height: 470/);
});

// Every popup that shows the grip can be dragged: the page starts the drag, and whoever opens it registers it.
test("the popups that promise a drag start it, and their openers register them", () => {
  assert.match(pages.counterspell, /data-popover-id="com\.thebigpicture\.initiative\/counterspell"/);
  assert.match(read("../src/counterspell.js"), /import "\.\/popoverDrag\.js"/);
  assert.match(fireballController, /\$\("app"\)\.dataset\.popoverId = text\(payload\.popoverId\);\s*initializePopoverDrag\(\$\("app"\)\)/);
  assert.match(read("../src/spell-board-token-card.js"), /import "\.\/popoverDrag\.js"/);
  for (const [file, id] of [
    ["../src/counterspellLauncher.js", "COUNTERSPELL_POPOVER_ID"],
    ["../src/spell-pill-actions.js", "SPELLS_POPOVER_ID"],
    ["../src/wild-magic-surge.js", "SPELLS_POPOVER_ID"],
    ["../src/spellInstanceActionRunner.js", "request\\.id"],
  ]) {
    assert.match(read(file), new RegExp(`openTrackedPopover\\(\\{\\s*id: ${id}`), file);
    assert.doesNotMatch(read(file), new RegExp(`OBR\\.popover\\.open\\(\\{\\s*id: ${id}`), file);
  }
  assert.match(read("../src/initiative-card-modal.js"), /openTrackedPopover\(\{\s*id: `\$\{ID\}\/wild-magic-surge`/);
});

// Lot V8: the detonation reads as an area, with F2 and F3.
test("the detonation: who casts it under the title, one line of facts, no hand-written pills", () => {
  assert.match(pages.fireball, /<h1 id="title" class="title">[^<]*<\/h1>\s*<div id="subtitle" class="subtitle" hidden><\/div>/);
  assert.match(pages.fireball, /<p id="facts" class="action-facts"><\/p>/);
  assert.doesNotMatch(pages.fireball, /micropill|class="eyebrow"|Terminale/);
  assert.match(fireballController, /\$\("subtitle"\)\.textContent = text\(payload\.casterName\)/);
  assert.match(fireballController, /TS Destrezza\$\{Number\.isInteger\(dc\) && dc > 0 \? ` CD \$\{dc\}` : ""\}/);
});

test("the detonation: the damage before the list, each row with its hit points, the bulk tools, the fixed row", () => {
  const at = (id) => pages.fireball.indexOf(`id="${id}"`);
  assert.ok(at("facts") < at("damageField") && at("damageField") < at("bulkOutcomes") && at("bulkOutcomes") < at("targets"));
  assert.match(fireballController, /hp\.className = "target-hp"/);
  assert.match(pages.fireball, /data-bulk-outcome="passed">Tutti superati</);
  assert.match(pages.fireball, /data-bulk-outcome="failed">Tutti falliti</);
  assert.match(pages.fireball, /class="apply-row"><button id="apply" class="apply" type="button" disabled>Detona<\/button><span id="summary" class="total" hidden><\/span><div id="damageDefenses" class="defense-chips" hidden><\/div><\/div>/);
  assert.match(pages.fireball, /<footer class="status-bar"><p id="status" class="status" role="status" aria-live="polite" hidden><\/p><\/footer>/);
  assert.match(fireballController, /node\.dataset\.kind = error \? "error" : ""/);
  for (const said of ["Nessuna creatura nel raggio\\.", "Manca l'esito di", "Manca il danno\\."]) assert.match(fireballController, new RegExp(said), said);
});

test("F2: the damage starts empty, and only nobody in the radius needs no number", () => {
  assert.doesNotMatch(fireballController, /damageInitialized|damage\.value = String/);
  assert.match(pages.fireball, /<input id="damage" type="number"[^>]*placeholder="Totale" \/>/);
  assert.match(fireballController, /missingOutcomes > 0 \|\| \(ids\.length > 0 && roll === null\)/);
});

test("F3: the defense at work shows in the fixed row, with the numbers the resolution uses, and a click ignores it", async () => {
  assert.match(fireballController, /ignoredTypes: \[\.\.\.\(ignoredDefenses\.get\(id\) \|\| \[\]\)\]/);
  assert.match(fireballController, /after: row\.ignored \? before : spellDamageAfterDefense\(roll, factor, row\.defense\)/);
  assert.match(fireballController, /chip\.setAttribute\("aria-pressed", String\(!row\.ignored\)\)/);
  assert.match(fireballController, /ignoredDefenses: Object\.fromEntries\(\[\.\.\.ignoredDefenses\]/);
  assert.match(fireballController, /ids\.length > 1 \? `\$\{name\} · \$\{said\}` : said/);
  const { spellDamageAfterDefense, spellDamageBeforeDefense } = await import("../src/spellDamageDefenseCore.js");
  assert.equal(spellDamageBeforeDefense(27, "half"), 13);
  assert.equal(spellDamageAfterDefense(27, "half", "resistance"), 6, "the chip and Mira's hit points at the bench");
  const { buildDelayedBlastFireballTerminalCommand } = await import("../src/delayedBlastFireballRules.js");
  const command = (ignoredDefenses) => buildDelayedBlastFireballTerminalCommand({
    casterId: "dars", instanceId: "pearl", requestId: "r", position: { x: 0, y: 0 }, targetIds: ["mira"], outcomes: { mira: "failed" }, damage: 27, ignoredDefenses,
  }).hp;
  assert.equal("ignoredDefenses" in command({}), false, "no click: the command is the same as before");
  assert.deepEqual(command({ mira: ["fire"] }).ignoredDefenses, { mira: ["fire"] });
});

test("the detonation's one height is read by who opens it: the popup no longer resizes itself", () => {
  assert.match(read("../src/delayedBlastFireballRules.js"), /DELAYED_BLAST_FIREBALL_POPOVER_HEIGHT = 380/);
  for (const file of ["../src/initiativeList.js", "../src/spell-unified-panel.js"]) {
    assert.match(read(file), /delayed-blast-fireball-resolution\.html[^\n]*\n\s*width: 360,\n\s*height: DELAYED_BLAST_FIREBALL_POPOVER_HEIGHT,/, file);
  }
  assert.doesNotMatch(fireballController, /OBR\.popover\.setHeight|requestCompactPopoverResize/);
});

// Lot V9: the surge on the consoles' sheets, in a window as tall as its rows. Its behaviour: test/wildMagicSurgePopup.test.js.
test("the surge loads the common sheets, and keeps of its own only the glass and the d100's card", () => {
  const order = ["/ui-typography.css", "/popover-glass.css", "/console-shell.css", "/console-panel.css"].map((href) => surge.indexOf(`href="${href}"`));
  assert.ok(order.every((at) => at >= 0), "a sheet is missing");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "the sheets out of order");
  assert.doesNotMatch(surge, /\.drag-grip \{|\.apply-row \{|\.apply:not|--chaos|\.small\.chaos|class="small chaos"/, "copies of the common sheet, or the old colours");
  assert.doesNotMatch(surge, / style="/, "no style on the elements");
  assert.match(surge, /\.roll-card \{/);
  assert.match(surge, /\.d100 \{ width: 72px; height: 72px;/);
  assert.match(surge, /\.glass-shell \{ box-shadow: inset/, "no shadow to show in the corners");
});

test("the surge's row in a box: its range, its text, its facts, with no pill and no coloured border", () => {
  assert.doesNotMatch(surge, /\.range \{[^}]*(?:gradient|radius)/);
  assert.doesNotMatch(surge, /border-left: 3px/);
  assert.match(surge, /\.outcome \{[^}]*background: var\(--surface-soft\)/);
  assert.match(surge, /<p class="action-facts" id="action-line"><\/p>/);
  assert.match(surge, /<p class="action-facts" id="note" hidden><\/p>/);
  assert.doesNotMatch(surge, /\.note \{|--warn-text/, "yellow only for real warnings: this page's come from the fixed row's kind");
});

test("the surge's builder: labels on the left of 32 px controls, folded in its box", () => {
  assert.match(surge, /<details class="builder spell-details" id="builder" hidden>/);
  for (const [label, control] of [["Pillola", "pill-name"], ["Note", "pill-notes"], ["Durata", "pill-duration"]]) {
    assert.match(surge, new RegExp(`<label class="form-label" for="${control}">${label}</label>`), label);
  }
  assert.match(surge, /\.builder input \{[^}]*min-height: var\(--obrt-h-control-md\)/);
  assert.match(surge, /\.builder select \{ min-height: var\(--obrt-h-control-md\);/);
  assert.match(surge, /<label class="more-option" id="tides-row" hidden>/);
});

test("the surge's fixed row: the message on the left, the blue button on the right; a message is the bar's", () => {
  assert.match(surge, /<div class="apply-row"><span class="total" id="summary">Manca il d100\.<\/span><button class="apply primary" id="apply" type="button" disabled>Applica<\/button><\/div>/);
  assert.match(surge, /\.status-bar:has\(> \.status:empty\) \{ display: none; \}/);
  const controller = read("../src/wild-magic-surge.js");
  assert.match(controller, /\$\("status"\)\.dataset\.kind = kind;/);
  assert.doesNotMatch(controller, /dataset\.tone/);
});

test("the surge's one height is read by who opens it, and every row of the table fits it", async () => {
  const { WILD_MAGIC_SURGE_POPOVER_HEIGHT } = await import("../src/wildMagicSurgeCore.js");
  assert.equal(WILD_MAGIC_SURGE_POPOVER_HEIGHT, 470);
  assert.match(read("../src/initiative-card-modal.js"), /wild-magic-surge\.html[^\n]*\n\s*width: 420,\n\s*height: WILD_MAGIC_SURGE_POPOVER_HEIGHT,/);
  assert.match(read("../src/pc-attack.js"), /wild-magic-surge\.html[^\n]*\n\s*width:420,height:WILD_MAGIC_SURGE_POPOVER_HEIGHT,/);
  assert.doesNotMatch(read("../src/wild-magic-surge.js"), /setHeight|ResizeObserver/, "the window does not follow the content");
});

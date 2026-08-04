import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
);
const popoverSource = readFileSync(
  new URL("../src/tracker-quick-actions.js", import.meta.url),
  "utf8",
);
const popoverHtml = readFileSync(
  new URL("../tracker-quick-actions.html", import.meta.url),
  "utf8",
);
const viteSource = readFileSync(
  new URL("../vite.config.js", import.meta.url),
  "utf8",
);
const initiativeCardsSource = readFileSync(
  new URL("../src/initiativeCards.js", import.meta.url),
  "utf8",
);
const cardModalSource = readFileSync(
  new URL("../src/initiative-card-modal.js", import.meta.url),
  "utf8",
);
const conditionsSource = readFileSync(
  new URL("../src/conditions.js", import.meta.url),
  "utf8",
);
const contextMenuSource = readFileSync(
  new URL("../src/contextMenu.js", import.meta.url),
  "utf8",
);

test("il tracker usa solo le azioni rapide configurate nella scheda", () => {
  assert.match(
    initiativeSource,
    /const initiativeCard = getInitiativeCard\(it\)/,
  );
  assert.match(
    initiativeSource,
    /quickActions: IS_GM\s*\?\s*initiativeCard\.quickActions/,
  );
  assert.doesNotMatch(initiativeSource, /buildClassFeatureQuickActions\(initiativeCard\)/);
  assert.match(initiativeSource, /action\?\.kind === "feature"/);
  assert.match(initiativeSource, /return activateClassFeature\(\{/);
});

test("l'editor consente di scegliere manualmente una feature per le azioni rapide", () => {
  assert.match(cardModalSource, /\["feature",/);
  assert.match(cardModalSource, /featureSelect\.dataset\.quickActionField = "featureId"/);
  assert.match(cardModalSource, /classFeatureTargetMode\(feature\)/);
  assert.match(cardModalSource, /activateClassFeature\(\{/);
});

test("il Giuramento non appartiene al catalogo condizioni e non c'e menu feature sul token", () => {
  assert.doesNotMatch(conditionsSource, /"Giuramento di Inimicizia"\s*:/);
  assert.doesNotMatch(conditionsSource, /\n\s*"Giuramento di Inimicizia",/);
  assert.doesNotMatch(contextMenuSource, /ctx-class-features/);
  assert.doesNotMatch(viteSource, /ctxClassFeatures/);
});

test("il launcher viene montato sia sulle card classiche sia su quelle compatte", () => {
  assert.match(
    initiativeSource,
    /function __mountTrackerQuickActions[\s\S]*?if \(\s*!IS_GM\s*\|\|/,
  );
  assert.match(
    initiativeSource,
    /__mountTrackerQuickActions\(card,\s*entry,\s*\{\s*compact:\s*true\s*\}\)/,
  );
  assert.match(
    initiativeSource,
    /mountTrackerQuickActions:\s*__mountTrackerQuickActions/,
  );
});

test("il fallback conserva i pannelli esistenti per le azioni non dirette", () => {
  assert.match(initiativeSource, /result\.mode !== "review"/);
  assert.match(initiativeSource, /openCardEffectsPopup\(sourceEntry/);
  assert.match(initiativeSource, /openCardSpellsPopup\(sourceEntry/);
  assert.match(initiativeSource, /openQuickHPPopup\(\{\s*sourceId,\s*quickActionId\s*\}\)/);
});

test("il pulsante apre e richiude un popover dedicato alle macro", () => {
  assert.match(
    initiativeSource,
    /if\s*\(__trackerQuickActionsRequestId\s*&&\s*__trackerQuickActionsSourceId\s*===\s*sourceId\)/,
  );
  assert.match(initiativeSource, /OBR\.popover\.open\(\{\s*id:\s*TRACKER_QUICK_ACTIONS_POPOVER_ID/);
  assert.match(initiativeSource, /url:\s*`\/tracker-quick-actions\.html\?request=/);
  assert.match(initiativeSource, /mountTrackerQuickActionsPopoverListener\(\)/);
});

test("il popover usa il protocollo isolato e restituisce solo l'id azione", () => {
  assert.match(popoverSource, /readStoredMenuPayload\(localStorage,\s*PAYLOAD_PREFIX,\s*requestId\)/);
  assert.match(popoverSource, /sendAfterExit\("action",\s*\{\s*actionId:\s*action\.id\s*\}\)/);
  assert.match(popoverHtml, /id="menu"\s+role="menu"/);
  assert.match(viteSource, /trackerQuickActions:\s*path\.resolve\(process\.cwd\(\),\s*"tracker-quick-actions\.html"\)/);
});

test("il popover mostra tutte le azioni e disabilita le capacità già attive", () => {
  assert.match(initiativeSource, /function __disabledTrackerQuickActionIds\(/);
  assert.match(initiativeSource, /disabledActionIds/);
  assert.match(popoverSource, /payload\?\.disabledActionIds/);
  assert.match(popoverSource, /button\.disabled = disabled/);
  assert.match(popoverHtml, /max-height:none/);
  assert.doesNotMatch(popoverHtml, /max-height:100vh/);
  assert.match(initiativeSource, /const TRACKER_QUICK_ACTIONS_INITIAL_HEIGHT = 520/);
});

test("le azioni rapide vengono reidratate dalla memoria senza aprire la scheda", () => {
  assert.match(
    initiativeCardsSource,
    /export function restoreInitiativeCardQuickActionsFromMemory\(itemIds\)/,
  );
  assert.match(
    initiativeCardsSource,
    /loadInitiativeCard\(item,\s*\{\s*hydrate:\s*true\s*\}\)/,
  );
  assert.match(
    initiativeSource,
    /await restoreInitiativeCardQuickActionsFromMemory\(/,
  );
  assert.match(
    initiativeSource,
    /filter:\s*\(event\) => event\.flags\.hpMemoryAutofill,\s*immediate:\s*true/,
  );
});

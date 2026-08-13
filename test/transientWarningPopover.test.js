import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const initiative = read("../src/initiativeList.js");
const speedCheck = read("../src/speedCheck.js");
const concentration = read("../src/concentration-warning.ts");
const reminderResolution = read("../src/reminderResolution.js");
const speed = read("../src/speed-warning.ts");
const concentrationHtml = read("../concentration-warning.html");
const speedHtml = read("../speed-warning.html");
const turnNoticeHtml = read("../turn-notice.html");
const turnNoticeHost = read("../src/turnNoticeHost.js");
const quickHp = read("../src/quick-hp-modal.js");

test("concentrazione e velocità aprono popover transienti on demand", () => {
  const concentrationHost = initiative.slice(
    initiative.indexOf("async function openConcentrationWarningModal"),
    initiative.indexOf("function mountConcentrationWarningBroadcast"),
  );
  assert.match(concentrationHost, /await OBR\.popover\.open\(\{/);
  assert.doesNotMatch(concentrationHost, /await OBR\.modal\.open\(\{/);
  assert.match(concentrationHost, /disableClickAway: true/);

  const speedHost = speedCheck.slice(
    speedCheck.indexOf("export function mountSpeedWarningBroadcast"),
  );
  assert.match(speedHost, /OBR\.broadcast\.onMessage\(SPEED_WARNING_CHANNEL/);
  assert.match(speedHost, /await OBR\.popover\.open\(\{/);
  assert.doesNotMatch(speedHost, /await OBR\.modal\.open\(\{/);
  assert.match(speedHost, /disableClickAway: true/);
});

test("il warning movimento usa un broadcast ordinato e un iframe solo on-demand", () => {
  assert.match(speedCheck, /function broadcastSpeedWarning\(payload\)/);
  assert.match(speedCheck, /speedWarningBroadcastQueue = speedWarningBroadcastQueue\.then\(send, send\)/);
  assert.match(speedCheck, /destination: "ALL"/);
  assert.match(speedCheck, /await broadcastSpeedWarning\(\{/);
  assert.doesNotMatch(speedCheck, /SPEED_WARNING_MAX_AGE_MS|SPEED_WARNING_UI_CHANNEL|SPEED_WARNING_HOST_CHANNEL/);
  assert.doesNotMatch(speed, /OBR\.broadcast\.onMessage/);
  assert.match(speed, /renderWarning\(warningFromURL\(\)\)/);
});

test("i warning chiudono il proprio popover e non lasciano iframe vuoti", () => {
  assert.match(concentration, /OBR\.popover\.close\(POPOVER_ID\)/);
  assert.match(speed, /OBR\.popover\.close\(POPOVER_ID\)/);
  assert.match(turnNoticeHost, /await OBR\.popover\.close\(TURN_NOTICE_POPOVER_ID\)/);
  assert.doesNotMatch(turnNoticeHost, /setHeight\(TURN_NOTICE_POPOVER_ID, 1\)/);
  assert.match(turnNoticeHost, /TURN_NOTICE_READY_RETRY_MS = 800/);
  assert.match(turnNoticeHost, /scheduleReadyRetry\(\)/);
  assert.doesNotMatch(concentration, /OBR\.modal\.close\(MODAL_ID\)/);
  assert.doesNotMatch(speed, /OBR\.broadcast\.onMessage\(SPEED_WARNING_CHANNEL/);
});

test("la concentrazione usa i controlli reminder senza timer per il GM", () => {
  const concentrationHost = initiative.slice(
    initiative.indexOf("function normalizeConcentrationWarnings"),
    initiative.indexOf("function mountConcentrationWarningBroadcast"),
  );
  assert.match(concentrationHost, /spellName: String\(warning\?\.spellName/);
  assert.match(concentrationHost, /notice: warning\?\.notice && typeof warning\.notice === "object"/);
  assert.match(concentrationHost, /JSON\.stringify\(\{ warnings \}\)/);
  assert.match(concentration, /import \{ resolveReminder \} from "\.\/reminderResolution\.js"/);
  assert.match(concentration, /\["passed", "Superato"\]/);
  assert.match(concentration, /\["failed", "Fallito"\]/);
  assert.match(concentration, /if \(!canResolve\) \{/);
  assert.match(concentration, /result\.status === "applied" \|\| result\.status === "already-resolved"/);
  assert.match(concentration, /panel\.className = warnings\.length === 1 \? "warning warning-single"/);
  assert.match(concentration, /title\.textContent = warnings\.length === 1 \? primary\.name/);
  assert.match(concentration, /name\.textContent = warnings\.length === 1 \? "TS di Costituzione" : warning\.name/);
  assert.match(concentration, /identity\.appendChild\(name\)/);
  assert.match(concentration, /if \(warning\.spellName\)/);
  assert.match(concentration, /if \(warnings\.length > 1\) \{[\s\S]{0,180}dc\.textContent = "CD "/);
  assert.match(reminderResolution, /type\.startsWith\("condition:"\) \|\| type\.startsWith\("concentration:"\)/);
  assert.match(reminderResolution, /refreshConditionLabels\(mutation\.changedIds\?\.length \? mutation\.changedIds : plan\.targetIds\)/);
});

test("iniziativa, concentrazione e velocita conservano la card da 500 px con margine esterno", () => {
  for (const markup of [concentrationHtml, speedHtml]) {
    assert.match(markup, /\.warning \{[\s\S]{0,420}top: 4px;[\s\S]{0,160}left: 4px;/);
    assert.match(markup, /width: calc\(100% - 8px\)/);
    assert.match(markup, /min-height: 126px/);
    assert.doesNotMatch(markup, /scale\(\.8\)/);
  }
  assert.match(turnNoticeHtml, /\.notice \{[\s\S]{0,420}top: 4px;[\s\S]{0,160}left: 4px;/);
  assert.match(turnNoticeHtml, /width: calc\(100% - 8px\)/);
  assert.match(turnNoticeHost, /const TURN_NOTICE_CARD_WIDTH = 500;/);
  assert.match(turnNoticeHost, /const TURN_NOTICE_FRAME_GUTTER = 4;/);
  assert.match(turnNoticeHost, /return 122;/);
  assert.match(initiative, /const width = cardWidth \+ 8;/);
  assert.match(initiative, /const height = Math\.min\(288, 122/);
  assert.match(speedCheck, /const width = cardWidth \+ 8;/);
  assert.match(speedCheck, /height: 122,/);
  assert.match(speedCheck, /export function prewarmSpeedCheckTurn\(state\)/);
  assert.match(speedCheck, /movementStatePrefetch\?\.turnKey === next\.turnKey/);
  for (const markup of [turnNoticeHtml, concentrationHtml, speedHtml]) {
    assert.match(markup, /@media \(max-width: 520px\)/);
    assert.match(markup, /min-height: 114px/);
  }
});

test("la Console HP manuale non gestisce il posizionamento area", () => {
  assert.doesNotMatch(quickHp, /requestSpellAreaPlacement|placeSelectedSpellArea|areaPlacement/);
});

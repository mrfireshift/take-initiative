import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

// Lot L20 of the bugfix pass, polish R3 "Avvisi e TS contro la morte" (docs/PIANO_BUGFIX_POLISHING.md, section 3).
// The notices are popups with their own DOM and SDK: these check their wiring in the sources.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L20: la × del GM chiude la stessa carta del TS contro la morte anche sullo schermo del tavolo", () => {
  const page = read("../src/death-save-notice.js");
  assert.match(page, /const DISMISS_CHANNEL = `\$\{ID\}\/death-save-notice-dismiss`;/);
  assert.match(page, /\$\("close"\)\.addEventListener\("click", \(\) => \{\n\s+if \(pageRole === "GM" && activationId\) \{\n\s+void OBR\.broadcast\.sendMessage\(DISMISS_CHANNEL, \{ activationId \}, \{ destination: "REMOTE" \}\)/);
  assert.match(page, /OBR\.broadcast\.onMessage\(DISMISS_CHANNEL, \(event\) => \{\n\s+if \(String\(event\?\.data\?\.activationId \|\| ""\) === activationId\) close\(\);/);
  assert.match(page, /pageRole = role;/);
});

test("L20: nessun testo invita a chiudere un avviso che non ha la ×; un promemoria non più corrente si chiude da solo", () => {
  const sources = readdirSync(new URL("../src/", import.meta.url)).filter((name) => /\.(js|ts)$/.test(name));
  const inviting = sources.filter((name) => /[Pp]uoi chiuder|puoi chiudere il promemoria/.test(read(`../src/${name}`)));
  assert.deepEqual(inviting, []);
  const notice = read("../src/turn-notice.ts");
  assert.match(notice, /\} else if \(result\.status === "stale"\) \{[\s\S]{0,300}Si chiude da solo\.`\);\n\s+window\.setTimeout\(\(\) => dismissResolvedReminder\(activationId, \{/);
  assert.match(notice, /const STALE_REMINDER_CLOSE_MS = 3500;/);
  assert.match(notice, /"Registrazione non riuscita: riprova\."/);
  assert.doesNotMatch(read("../turn-notice.html"), /\.zone-close/, "the style of the × removed in August");
});

test("L20: l'avviso di concentrazione del GM con Superato e Fallito ha la ×", () => {
  const warning = read("../src/concentration-warning.ts");
  assert.match(warning, /if \(canResolve\) \{\n\s+const close = document\.createElement\("button"\);[\s\S]{0,500}closePopover\(\);[\s\S]{0,120}panel\.appendChild\(close\);/);
  const page = read("../concentration-warning.html");
  assert.match(page, /\.warning\.has-close \.save-badge \{ right: 40px; \}/);
  assert.match(page, /\n\s+\.close \{\n\s+position: absolute;/);
});

test("L20: gli avvisi non si coprono: il turno in alto, il TS contro la morte sotto, quelli dell'attacco in basso", () => {
  const tracker = read("../src/initiativeList.js");
  assert.match(tracker, /anchorPosition: \{ left: viewportWidth \/ 2, top: Math\.max\(top \+ height, viewportHeight - 16\) \},\n\s+anchorOrigin: \{ horizontal: "CENTER", vertical: "BOTTOM" \},\n\s+transformOrigin: \{ horizontal: "CENTER", vertical: "BOTTOM" \},/);
  const bossLink = read("../src/bossLinkNoticeHost.js");
  assert.match(bossLink, /anchorPosition: \{ left: viewportWidth \/ 2, top: Math\.max\(top, viewportHeight - 16\) \},\n\s+anchorOrigin: \{ horizontal: "CENTER", vertical: "BOTTOM" \},\n\s+transformOrigin: \{ horizontal: "CENTER", vertical: "BOTTOM" \},/);
  const deathSave = read("../src/deathSaveNoticeHost.js");
  assert.match(deathSave, /top: Math\.max\(12, Math\.round\(viewportHeight \* 0\.09\)\) \+ 122 \+ 12 \}/);
  const turn = read("../src/turnNoticeHost.js");
  assert.match(turn, /const TURN_NOTICE_POPOVER_TOP_RATIO = 0\.09;/);
  assert.match(turn, /if \(payload\?\.type === "show-turn-notice"\) return 122;/, "the death save's offset follows the turn notice");
});

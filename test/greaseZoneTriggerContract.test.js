import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const executor = readFileSync(
  new URL("../src/spellAreaResolutionExecutor.js", import.meta.url),
  "utf8",
);

test("SP-B04A — le zone non target-scoped salvano la membership geometrica del cast come baseline", () => {
  assert.match(executor, /const staticZoneCastMemberIds = staticZonePlacement/);
  assert.match(executor, /confirmedSpellAreaTargetIds\(placement, allItems\.map\(\(item\) => item\.id\)\)/);
  assert.match(executor, /const passiveTargetIds = staticZoneCastMemberIds;/);
  assert.match(executor, /targetIds: staticZoneCastMemberIds,/);
});

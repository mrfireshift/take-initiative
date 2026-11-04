// The CI runs scripts/check-spell-catalog.mjs after the tests. Its counts are written by hand, and twice a change of the
// tracked spells left them behind: the tests stayed green and every push failed. Here it fails before the push.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the catalog check of the CI passes", () => {
  const script = fileURLToPath(new URL("../scripts/check-spell-catalog.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

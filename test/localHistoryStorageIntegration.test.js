import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LOCAL_STORE_INTEGRATION_SUITES } from "../test-support/localHistoryStorageSuites.js";

// ARCH-009 step 6: the History and the recovery journal live in IndexedDB by default in the GM's browser. The
// integration suites of History, Undo and recovery run again here in that mode, in a child process whose preload
// installs a browser-like localStorage (flag on by default) and a fake IndexedDB before the plugin loads.
test("History, Undo e recovery passano anche con History e journal in IndexedDB", { timeout: 300000 }, () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  // Without NODE_TEST_CONTEXT the child is a test run of its own (with it, node:test skips the files as recursive).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks",
    "--import", "./test-support/localHistoryStorageMode.js",
    "--test",
    ...LOCAL_STORE_INTEGRATION_SUITES.map((file) => `test/${file}`),
  ], { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const failures = output.split(/\r?\n/u).filter((line) => line.startsWith("✖")).slice(0, 20);
  assert.equal(result.status, 0, `Suite in modalità locale fallite:\n${failures.join("\n")}`);
  assert.match(output, /ℹ fail 0/u);
  assert.match(output, /ℹ pass [1-9]\d*/u, "the child ran its tests");
});

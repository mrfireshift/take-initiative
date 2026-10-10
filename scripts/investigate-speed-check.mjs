// Repeat the speed investigation as regressions against the production modules.
// No live Owlbear room is used; SDK calls are simulated by the test harnesses.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [
  "--experimental-test-module-mocks",
  "--test",
  "test/speedCheckRuntime.test.js",
  "test/historyMovementUndoIntegration.test.js",
], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: "inherit",
});
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;

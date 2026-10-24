// npm run test:local-store — the whole test suite with the History and the recovery journal in IndexedDB (ARCH-009
// on by default), except the files listed in SCENE_ONLY_SUITES with their reason.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SCENE_ONLY_SUITES } from "../test-support/localHistoryStorageSuites.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(new URL("../test/", import.meta.url))
  .filter((file) => file.endsWith(".test.js") && !Object.hasOwn(SCENE_ONLY_SUITES, file))
  .sort()
  .map((file) => `test/${file}`);

const result = spawnSync(process.execPath, [
  "--experimental-test-module-mocks",
  "--import", "./test-support/localHistoryStorageMode.js",
  "--test",
  ...files,
], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);

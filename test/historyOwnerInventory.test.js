import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(js|ts)$/iu.test(entry.name) ? [path] : [];
  });
}

test("la chiave History ha un solo writer produttivo e i writer applicativi passano dal client", () => {
  const files = sourceFiles(srcRoot);
  const directHistoryWriters = files.filter((path) => {
    const source = readFileSync(path, "utf8");
    return /writeSceneMetadataKey\(/u.test(source)
      && (/com\.thebigpicture\.initiative\/history/u.test(source)
        || /HISTORY_KEY\s*=\s*`\$\{ID\}\/history`/u.test(source));
  });
  assert.deepEqual(
    directHistoryWriters.map((path) => path.replaceAll("\\", "/")).sort(),
    [join(srcRoot, "historyOwner.js").replaceAll("\\", "/")],
  );

  const history = readFileSync(join(srcRoot, "history.js"), "utf8");
  assert.doesNotMatch(history, /writeSceneMetadataKey\(/u);
  assert.match(history, /requestHistoryOwnerAppend/u);
  assert.match(history, /requestHistoryOwnerRemove/u);

  const effects = readFileSync(join(srcRoot, "effectsMutations.js"), "utf8");
  assert.match(effects, /recordEffectsMutationHistory/u);
  for (const file of [
    "quick-hp-modal.js",
    "spellAreaResolutionExecutor.js",
  ]) {
    assert.match(readFileSync(join(srcRoot, file), "utf8"), /withItemMetaHistory/u, file);
  }
  for (const file of [
    "classFeatureRuntime.js",
    "classFeatureAuraController.js",
  ]) {
    const source = readFileSync(join(srcRoot, file), "utf8");
    assert.match(source, /runEffectsMutation/u, file);
    assert.doesNotMatch(source, /withItemMetaHistory/u, file);
  }
});

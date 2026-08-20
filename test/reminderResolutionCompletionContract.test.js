import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/reminderResolution.js", import.meta.url), "utf8");

test("la risoluzione canonica non resta bloccata in attesa del reconcile visuale delle condizioni", () => {
  assert.doesNotMatch(
    source,
    /await\s+refreshConditionLabels\s*\(/,
    "refreshConditionLabels e' derivato/UI e non deve trattenere l'ACK del reminder",
  );
  assert.match(
    source,
    /void\s+import\("\.\/conditions\.js"\)[\s\S]{0,420}refreshConditionLabels\(/,
    "il reconcile condizioni deve comunque essere pianificato in background",
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import { buildInfoLabel } from "../src/buildInfo.js";

// Lot U11 (UX-18): the version line in Opzioni → Manutenzione.
test("U11: la riga della versione dice versione, data del commit e commit", () => {
  const epoch = Math.floor(new Date(2026, 9, 31, 12).getTime() / 1000);
  assert.equal(buildInfoLabel({ version: "1.5.0", sourceDateEpoch: epoch, shortCommit: "82b482ff1234", dirty: false }),
    "Versione 1.5.0 · commit del 31/10/2026 · 82b482ff");
  assert.equal(buildInfoLabel({ version: "1.5.0", sourceDateEpoch: epoch, shortCommit: "82b482ff1234", dirty: true }),
    "Versione 1.5.0 · commit del 31/10/2026 · 82b482ff · con modifiche locali");
  assert.equal(buildInfoLabel({ version: "0.0.0-development", sourceDateEpoch: 0, shortCommit: "unknown" }),
    "Versione 0.0.0-development");
});

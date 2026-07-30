import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../quick-hp-modal.html", import.meta.url);
const scriptPath = new URL("../src/quick-hp-modal.js", import.meta.url);

test("il pip concentrazione vive accanto al caster e replica lo stile classico", async () => {
  const [html, script] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(scriptPath, "utf8"),
  ]);

  assert.equal(
    (html.match(/id="concentrationNotice"/g) || []).length,
    1,
  );
  assert.match(
    html,
    /class="caster-select-row"[\s\S]*id="spellCaster"[\s\S]*id="concentrationNotice"/,
  );
  assert.match(html, /\.concentration-badge\{[^}]*width:18px[^}]*border:2px solid rgba\(0,0,0,1\)[^}]*box-shadow:0 0 0 1px rgba\(0,0,0,.5\)/);
  assert.match(script, /concentrationNotice\.style\.background = spellColorFor\(spell\)\.solid/);
  assert.doesNotMatch(html, /class="concentration-note" id="concentrationNotice"/);
});

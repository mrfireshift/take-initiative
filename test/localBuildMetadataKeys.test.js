import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { METADATA_OWNERSHIP } from "../src/metadataKeyScoped.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la build di produzione tiene le chiavi di scena di Cronologia, journal e sessione del Combat Log", () => {
  // Node esegue i moduli come il bundle di produzione: niente server di sviluppo di Vite, niente suffisso.
  assert.equal(METADATA_OWNERSHIP.HISTORY.key, "com.thebigpicture.initiative/history");
  assert.equal(METADATA_OWNERSHIP.EFFECTS_RECOVERY.key, "com.thebigpicture.initiative/effects-recovery-v1");
  assert.equal(METADATA_OWNERSHIP.COMBAT_LOG_SESSION.key, "com.thebigpicture.initiative/combat-log-state");
  assert.equal(METADATA_OWNERSHIP.INITIATIVE_STATE.key, "com.thebigpicture.initiative/state");
});

test("solo le tre chiavi con i dati nell'IndexedDB di un'origine prendono il suffisso della build locale", () => {
  const source = read("src/metadataKeyScoped.js");
  assert.match(source, /const LOCAL_BUILD_KEY_SUFFIX = import\.meta\.env\?\.DEV \? "-locale" : "";/);
  const suffixed = [...source.matchAll(/key: `\$\{ID\}\/([\w-]+)\$\{LOCAL_BUILD_KEY_SUFFIX\}`/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(suffixed, ["combat-log-state", "effects-recovery-v1", "history"]);
});

test("Cronologia, journal e Combat Log leggono le chiavi di scena dai contratti, non le riscrivono", () => {
  for (const [file, literal] of [
    ["src/history.js", "/history`"],
    ["src/historyOwner.js", "/history`"],
    ["src/effectsRecovery.js", "/effects-recovery-v1`"],
    ["src/combatLog.js", "/combat-log-state`"],
  ]) {
    assert.equal(read(file).includes(`\${ID}${literal}`), false, `${file} scrive da sé la chiave ${literal}`);
  }
});

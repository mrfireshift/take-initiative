// Visual bench of the 3D dice tray (docs/PIANO_DADI_ONLINE.md, lot D-2): served by the boss-actions-preview Vite
// server at /test-support/dice-bench/. It rolls a formula and checks that every die shows the value drawn.
import { createDiceTray, DICE_STYLES } from "../../src/diceScene.js";
import { createDiceRollRecord, diceThrowParameters, parseDiceFormula, physicalDiceOf, rollDiceFormula } from "../../src/diceCore.js";
import { physicalDieAsset } from "../../src/diceFaceCore.js";

const canvas = document.getElementById("tray");
const log = document.getElementById("log");
const style = document.getElementById("style");
for (const entry of DICE_STYLES) style.append(new Option(entry.label, entry.key, entry.key === "iron", entry.key === "iron"));

// ?instant=1 skips the animation (as with reduced motion): a hidden page draws no animation frames.
const instant = new URLSearchParams(location.search).get("instant") === "1";
const tray = await createDiceTray({ canvas, base: "/", reducedMotion: instant ? true : null });
tray.resize(canvas.clientWidth, canvas.clientHeight);

async function roll(formula = document.getElementById("formula").value, styleKey = style.value) {
  const parsed = parseDiceFormula(formula);
  if (!parsed.ok) { log.textContent = parsed.error; return null; }
  const result = rollDiceFormula(parsed);
  const physical = physicalDiceOf(result);
  const record = createDiceRollRecord({ id: `bench-${Date.now()}`, result, throws: diceThrowParameters(physical.length) });
  const started = performance.now();
  const shown = await tray.roll(record, { style: styleKey });
  const wanted = physical.map((die) => physicalDieAsset(die).value);
  const ok = shown && shown.every((value, index) => value === wanted[index]);
  log.textContent = `${result.formula} = ${result.total}\nestratti: ${wanted.join(", ")}\nmostrati: ${shown?.join(", ")}\n${ok ? "OK" : "DIVERSI"} · ${Math.round(performance.now() - started)} ms`;
  return { ok, wanted, shown };
}

document.getElementById("roll").addEventListener("click", () => void roll());
window.__diceBench = { roll };

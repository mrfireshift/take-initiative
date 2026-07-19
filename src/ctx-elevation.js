import OBR from "@owlbear-rodeo/sdk";
import { readElevation, writeElevationForItems } from "./distance3d.js";

const input = document.querySelector("#elevation");
const unitLabel = document.querySelector("#unit");
let ids = [];
let step = 1;

function closeSoon() {
  Promise.resolve().then(() => OBR.player.deselect().catch(() => {}));
  setTimeout(() => OBR.player.deselect().catch(() => {}), 20);
}

async function apply() {
  await writeElevationForItems(ids, input.value || 0);
  closeSoon();
}

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = String((Number(input.value) || 0) + Number(button.dataset.step) * step);
  });
});
document.querySelector("#apply").addEventListener("click", () => void apply());
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void apply();
  if (event.key === "Escape") closeSoon();
});

OBR.onReady(async () => {
  const [selection, scale] = await Promise.all([
    OBR.player.getSelection().catch(() => []),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1, unit: "" } })),
  ]);
  const selected = new Set(selection || []);
  const items = await OBR.scene.items.getItems((item) => selected.has(item.id) && item.layer === "CHARACTER" && !item.attachedTo);
  ids = items.map((item) => item.id);
  step = Math.max(0.01, Number(scale?.parsed?.multiplier) || 1);
  const values = items.map(readElevation);
  const same = values.length && values.every((value) => value === values[0]);
  input.value = same ? String(values[0]) : "";
  input.placeholder = same ? "0" : "Valori diversi";
  input.step = String(step);
  unitLabel.textContent = String(scale?.parsed?.unit || "");
  input.focus();
  input.select();
});

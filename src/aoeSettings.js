import OBR from "@owlbear-rodeo/sdk";
import {
  AOE_SETTINGS_POPOVER_ID,
  AOE_STYLE_CHANNEL,
  loadAoEStyle,
  saveAoEStyle,
} from "./aoeStyle.js";

let style = loadAoEStyle();

const opacity = document.querySelector("#opacity");
const opacityValue = document.querySelector("#opacity-value");
const fillColor = document.querySelector("#fill-color");
const strokeColor = document.querySelector("#stroke-color");
const strokeWidth = document.querySelector("#stroke-width");
const strokeValue = document.querySelector("#stroke-value");

function render() {
  opacity.value = String(Math.round(style.fillOpacity * 100));
  opacityValue.value = `${opacity.value}%`;
  fillColor.value = style.fillColor;
  strokeColor.value = style.strokeColor;
  strokeWidth.value = String(style.strokeWidth);
  strokeValue.value = `${style.strokeWidth.toFixed(1)}×`;
}

function publish(patch) {
  style = saveAoEStyle({ ...style, ...patch });
  render();
  void OBR.broadcast.sendMessage(
    AOE_STYLE_CHANNEL,
    { type: "change", style },
    { destination: "LOCAL" },
  );
}

opacity.addEventListener("input", () => publish({ fillOpacity: Number(opacity.value) / 100 }));
fillColor.addEventListener("input", () => publish({ fillColor: fillColor.value }));
strokeColor.addEventListener("input", () => publish({ strokeColor: strokeColor.value }));
strokeWidth.addEventListener("input", () => publish({ strokeWidth: Number(strokeWidth.value) }));
document.querySelector("#close").addEventListener("click", () => {
  void OBR.popover.close(AOE_SETTINGS_POPOVER_ID);
});

render();

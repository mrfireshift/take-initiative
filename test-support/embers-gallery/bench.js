// Embers bench: the plugin's own blueprints and layer plans (position, scale, rotation, offset, delay, duration),
// rendered with CSS on a fake map, like the OBR local video items of the renderer.
import { EMBERS_MATCHED_SPELL_IDS, buildMatchedVisualEvent, matchedVisualLayerPlan } from "/src/embersMatchedVisualCore.js";

const DPI = 60;
const CONSOLE_CANTRIPS = ["chill-touch", "shocking-grasp", "produce-flame", "phb2014-frusta-di-spine", "xanathar-ferocia-primordiale",
  "vicious-mockery", "poison-spray", "acid-splash", "xanathar-infestazione", "xanathar-morsa-del-gelo", "tasha-scheggia-della-mente",
  "tasha-lenza-elettrizzante", "tasha-lama-roboante", "tasha-lama-verdefiamma", "xanathar-parola-radiosa", "xanathar-rombo-di-tuono",
  "tasha-turbine-di-spade", "xanathar-creare-falo"];
const AREA_AROUND_CASTER = new Set(["xanathar-parola-radiosa", "xanathar-rombo-di-tuono", "tasha-turbine-di-spade"]);
const $ = (id) => document.getElementById(id);
const map = $("map");
map.style.setProperty("--cell", `${DPI}px`);
let active = [];
let timers = [];

for (const spellId of [...CONSOLE_CANTRIPS, ...EMBERS_MATCHED_SPELL_IDS.filter((id) => !CONSOLE_CANTRIPS.includes(id))]) {
  const option = document.createElement("option");
  option.value = spellId;
  option.textContent = (CONSOLE_CANTRIPS.includes(spellId) ? "★ " : "") + spellId;
  $("spell").append(option);
}

// Tokens on cell centres: the caster at column 2, the target `distance` cells to the right, the second creature
// one row below it.
function geometry() {
  const distance = Number($("distance").value);
  const spellId = $("spell").value;
  const cell = (col, row) => ({ x: (col + 0.5) * DPI, y: (row + 0.5) * DPI });
  const caster = { id: "caster", ...cell(1, 3), diameter: DPI };
  const around = AREA_AROUND_CASTER.has(spellId);
  const target = { id: "target", center: around ? cell(2, 3) : cell(1 + distance, 3), diameter: DPI };
  const second = { id: "second", center: around ? cell(1, 4) : cell(2 + distance, 4), diameter: DPI };
  const targets = [target, ...($("second").checked || around ? [second] : [])];
  return { caster, targets };
}

function drawTokens({ caster, targets }, zone) {
  map.querySelectorAll(".token").forEach((node) => node.remove());
  const token = (point, cls, text, size = DPI) => {
    const node = document.createElement("div");
    node.className = `token ${cls}`;
    Object.assign(node.style, { width: `${size}px`, height: `${size}px`, left: `${point.x - size / 2}px`, top: `${point.y - size / 2}px` });
    node.textContent = text;
    map.append(node);
  };
  if (zone) token(zone.center, "zone", "", zone.size);
  token(caster, "caster", "PG");
  targets.forEach((target, index) => token(target.center, index ? "second" : "target", index ? "2" : "B"));
}

function clear(all = true) {
  for (const id of timers) clearTimeout(id);
  timers = [];
  for (const entry of active) if (all || !entry.persistent) entry.video.remove();
  active = all ? [] : active.filter((entry) => entry.persistent);
}

// The OBR image: width/height px at the effect's dpi, scaled; the offset (in image px, from height × offset)
// is the anchor placed on plan.position and the rotation pivot.
function renderLayer(layer) {
  const plan = matchedVisualLayerPlan(layer, DPI);
  if (!plan?.url) return;
  const effectDpi = layer.effect?.dpi || DPI;
  const unit = DPI / effectDpi;
  const scaleX = plan.scaleX ?? plan.scale;
  const scaleY = plan.scaleY ?? plan.scale;
  const width = plan.width * unit * scaleX;
  const height = plan.height * unit * scaleY;
  const offsetX = plan.height * (plan.offset?.x || 0) * unit * scaleX;
  const offsetY = plan.height * (plan.offset?.y || 0) * unit * scaleY;
  const video = document.createElement("video");
  // A one-shot plays once and is removed when it ends (or at its catalog duration); only loops repeat.
  const repeat = layer.persistent === true || $("hold").checked;
  Object.assign(video, { src: plan.url, autoplay: true, muted: true, loop: repeat, playsInline: true });
  if (!repeat) video.addEventListener("ended", () => video.remove(), { once: true });
  video.className = "fx";
  Object.assign(video.style, {
    width: `${width}px`, height: `${height}px`, left: `${plan.position.x - offsetX}px`, top: `${plan.position.y - offsetY}px`,
    transformOrigin: `${offsetX}px ${offsetY}px`, transform: `rotate(${plan.rotation || 0}deg)`,
  });
  map.append(video);
  const entry = { video, persistent: layer.persistent === true };
  active.push(entry);
  // «Tieni a schermo»: the one-shots keep looping, to look at them (and screenshot them) at rest.
  if (!entry.persistent && !$("hold").checked) {
    const duration = Array.isArray(plan.duration) ? plan.duration[0] : plan.duration;
    timers.push(setTimeout(() => { video.remove(); active = active.filter((item) => item !== entry); }, Math.max(250, Number(duration) || 1000)));
  }
  return `${layer.effectId}${layer.persistent ? " (loop)" : ""} ${plan.url.split("/").pop()} · ${Math.round(width)}×${Math.round(height)} px`;
}

function play() {
  clear(true);
  const spellId = $("spell").value;
  const { caster, targets } = geometry();
  const zone = spellId === "xanathar-creare-falo" ? { center: targets[0].center, size: DPI } : null;
  drawTokens({ caster, targets }, zone);
  const event = buildMatchedVisualEvent({
    spellId, eventId: "bench", lifecycleId: "bench:spell", casterId: caster.id, caster,
    targets, targetIds: targets.map((target) => target.id), sceneDpi: DPI, gridScale: { multiplier: 1.5, unit: "m" },
    ...(zone ? { zoneId: "zone", preview: { type: "square", start: { x: zone.center.x - DPI / 2, y: zone.center.y - DPI / 2 },
      end: { x: zone.center.x + DPI / 2, y: zone.center.y + DPI / 2 }, dpi: DPI } } : {}),
  });
  if (!event) { $("log").textContent = "Nessuna animazione per questo incantesimo."; return; }
  const layers = $("pill").checked ? event.layers : event.layers.filter((layer) => !layer.persistent);
  const lines = [];
  for (const layer of layers) {
    timers.push(setTimeout(() => {
      const line = renderLayer(layer);
      if (line) { lines.push(`+${layer.delay} ms ${line}`); $("log").textContent = lines.join("   ·   "); }
    }, layer.delay || 0));
  }
}

$("distance").addEventListener("input", () => { $("distance-text").textContent = `${$("distance").value * 1.5} m`; drawTokens(geometry()); });
$("distance-text").textContent = `${$("distance").value * 1.5} m`;
$("spell").addEventListener("change", () => { clear(true); drawTokens(geometry()); });
$("second").addEventListener("change", () => drawTokens(geometry()));
$("play").addEventListener("click", play);
$("end").addEventListener("click", () => { for (const entry of active) if (entry.persistent) entry.video.remove(); active = active.filter((entry) => !entry.persistent); });
drawTokens(geometry());
window.bench = { play, select(spellId) { $("spell").value = spellId; $("spell").dispatchEvent(new Event("change")); } };

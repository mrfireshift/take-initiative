import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPresetToCustomAura,
  appendPresetToCustomAuraList,
  createPresetFromAura,
  createPresetTombstone,
  detachCustomAuraPreset,
  duplicatePreset,
  normalizeCustomAuraPreset,
  normalizeCustomAuraPresets,
  syncCustomAuraWithPresets,
  syncCustomAurasListWithPresets,
  updatePresetDefinition,
} from "../src/customAuraPresetCore.js";
import { createCustomAuraPresetStore } from "../src/customAuraPresetStore.js";
import { normalizeCustomAura } from "../src/customAuraCore.js";

function mockStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, val) => data.set(key, String(val)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

test("crea preset normalizzato da un'aura esistente", () => {
  const aura = normalizeCustomAura({
    id: "paladin-ward",
    name: "Aura di Coraggio",
    radiusMeters: 4.5,
    style: { fillColor: "#10b981", strokeColor: "#059669" },
    targeting: { filter: "friendly", includeSource: true },
    pills: [
      { id: "courage", enabled: true, label: "Immune alla paura", detail: "Non può essere spaventato", kind: "buff" },
    ],
    reminders: [
      { id: "rem1", enabled: true, event: "turn-start", label: "Inizia il turno coraggioso", resolution: "informational" },
    ],
  });

  const preset = createPresetFromAura(aura, { name: "Preset Coraggio" });
  assert.ok(preset.id);
  assert.equal(preset.revision, 1);
  assert.equal(preset.name, "Preset Coraggio");
  assert.equal(preset.definition.name, "Aura di Coraggio");
  assert.equal(preset.definition.radiusMeters, 4.5);
  assert.equal(preset.definition.style.fillColor, "#10b981");
  assert.equal(preset.definition.pills.length, 1);
  assert.equal(preset.definition.pills[0].label, "Immune alla paura");
  assert.equal(preset.definition.reminders.length, 1);

  // Il preset NON deve contenere id, enabled o presetRef dell'aura originale
  assert.equal(preset.definition.id, undefined);
  assert.equal(preset.definition.enabled, undefined);
  assert.equal(preset.definition.presetRef, undefined);
});

test("la definizione legacy del preset viene letta ma non riscritta nei mirror", () => {
  const preset = normalizeCustomAuraPreset({
    id: "preset-legacy",
    definition: {
      name: "Aura legacy",
      pill: { enabled: true, label: "Legacy" },
      warnings: { start: { enabled: true, label: "Turno" } },
    },
  });
  assert.equal(preset.definition.pills[0].label, "Legacy");
  assert.equal(preset.definition.reminders[0].event, "turn-start");
  assert.equal(preset.definition.pill, undefined);
  assert.equal(preset.definition.warnings, undefined);
});

test("preset e aura legacy condividono la quantizzazione canonica del raggio", () => {
  const normalizedPreset = normalizeCustomAuraPreset({
    id: "radius-preset",
    definition: {
      name: "Radius",
      radiusMeters: 8,
      pills: [],
      reminders: [],
    },
  });
  const normalizedPreset84 = normalizeCustomAuraPreset({
    id: "radius-preset-84",
    definition: {
      name: "Radius",
      radiusMeters: 8.4,
      pills: [],
      reminders: [],
    },
  });

  assert.equal(normalizedPreset.definition.radiusMeters, 7.5);
  assert.equal(normalizedPreset84.definition.radiusMeters, 9);
  assert.equal(
    normalizeCustomAura({
      radiusMeters: 8,
      pill: { enabled: true, label: "Legacy" },
      warnings: { start: { enabled: true } },
    }).radiusMeters,
    7.5,
  );
});

test("applicare un preset genera un'aura linked con snapshot completo e presetRef", () => {
  const preset = {
    id: "preset-123",
    revision: 1,
    name: "Aura del Devozione",
    definition: {
      name: "Aura di Devozione",
      radiusMeters: 3,
      style: { fillColor: "#3b82f6", strokeColor: "#1d4ed8", fillOpacity: 0.2, strokeWidth: 1.5 },
      targeting: { filter: "friendly", includeSource: false },
      pills: [{ id: "dev", enabled: true, label: "Devoto", detail: "+2 TS", kind: "buff" }],
      reminders: [{ id: "r1", enabled: true, event: "turn-start", label: "Inizio devoto", resolution: "informational" }],
    },
  };

  const linkedAura = applyPresetToCustomAura(preset);
  assert.ok(linkedAura.id);
  assert.notEqual(linkedAura.id, "preset-123");
  assert.equal(linkedAura.enabled, true);
  assert.equal(linkedAura.name, "Aura di Devozione");
  assert.equal(linkedAura.radiusMeters, 3);
  assert.deepEqual(linkedAura.presetRef, { presetId: "preset-123", revision: 1 });
  assert.equal(linkedAura.pills.length, 1);
  assert.equal(linkedAura.pills[0].label, "Devoto");

  // L'istanza linked è completamente autonoma e normalizzabile
  const normalized = normalizeCustomAura(linkedAura);
  assert.equal(normalized.name, "Aura di Devozione");
  assert.deepEqual(normalized.presetRef, { presetId: "preset-123", revision: 1 });
});

test("aggiornamento del preset incrementa monotonicamente la revisione", () => {
  const preset = {
    id: "preset-123",
    revision: 1,
    name: "Preset Base",
    definition: {
      name: "Aura Base",
      radiusMeters: 3,
      style: { fillColor: "#000000", strokeColor: "#ffffff", fillOpacity: 0.1, strokeWidth: 1 },
      targeting: { filter: "all", includeSource: false },
      pills: [],
      reminders: [],
    },
  };

  const updated = updatePresetDefinition(preset, {
    name: "Preset Potenziato",
    definition: {
      ...preset.definition,
      radiusMeters: 6,
      name: "Aura Potenziata",
    },
  });

  assert.equal(updated.id, "preset-123");
  assert.equal(updated.revision, 2);
  assert.equal(updated.name, "Preset Potenziato");
  assert.equal(updated.definition.radiusMeters, 6);
  assert.equal(updated.definition.name, "Aura Potenziata");
});

test("sincronizzazione linked aura aggiorna le istanze stale mantenendo aura.id ed enabled", () => {
  const staleAura = {
    id: "aura-token-1",
    enabled: true,
    name: "Aura Base",
    radiusMeters: 3,
    style: { fillColor: "#000000", strokeColor: "#ffffff", fillOpacity: 0.1, strokeWidth: 1 },
    targeting: { filter: "all", includeSource: false },
    pills: [],
    reminders: [],
    presetRef: { presetId: "preset-123", revision: 1 },
  };

  const updatedPreset = {
    id: "preset-123",
    revision: 2,
    name: "Preset Potenziato",
    definition: {
      name: "Aura Potenziata",
      radiusMeters: 6,
      style: { fillColor: "#ff0000", strokeColor: "#aa0000", fillOpacity: 0.2, strokeWidth: 2 },
      targeting: { filter: "friendly", includeSource: true },
      pills: [{ id: "buff-1", enabled: true, label: "SuperBuff", detail: "", kind: "buff" }],
      reminders: [],
    },
  };

  const synced = syncCustomAuraWithPresets(staleAura, [updatedPreset]);
  assert.equal(synced.id, "aura-token-1");
  assert.equal(synced.enabled, true);
  assert.equal(synced.name, "Aura Potenziata");
  assert.equal(synced.radiusMeters, 6);
  assert.equal(synced.style.fillColor, "#ff0000");
  assert.equal(synced.targeting.filter, "friendly");
  assert.equal(synced.targeting.includeSource, true);
  assert.deepEqual(synced.presetRef, { presetId: "preset-123", revision: 2 });
  assert.equal(synced.pills.length, 1);
  assert.equal(synced.pills[0].label, "SuperBuff");
});

test("una linked aura con definition drift a parità di revision viene riallineata al preset", () => {
  const preset = {
    id: "preset-drift",
    revision: 2,
    name: "Preset stabile",
    definition: {
      name: "Aura canonica",
      radiusMeters: 3,
      style: { fillColor: "#111111", strokeColor: "#222222", fillOpacity: 0.2, strokeWidth: 1 },
      targeting: { filter: "all", includeSource: false },
      pills: [{ id: "pill", enabled: true, label: "Canonica", detail: "", kind: "buff" }],
      reminders: [],
    },
  };
  const drifted = applyPresetToCustomAura(preset, { auraId: "aura-drift" });
  drifted.name = "Modifica locale non autorizzata";
  drifted.pills[0].label = "Drift";
  const synced = syncCustomAuraWithPresets(drifted, [preset]);
  assert.equal(synced.id, "aura-drift");
  assert.equal(synced.name, "Aura canonica");
  assert.equal(synced.pills[0].label, "Canonica");
  assert.deepEqual(synced.presetRef, { presetId: "preset-drift", revision: 2 });
});

test("un catalogo preset più vecchio non regredisce una linked aura più recente", () => {
  const current = {
    id: "aura-current",
    enabled: true,
    name: "Aura rev 3",
    radiusMeters: 3,
    targeting: { filter: "all", includeSource: false },
    style: { fillColor: "#111111", strokeColor: "#222222", fillOpacity: 0.2, strokeWidth: 1 },
    pills: [{ id: "pill", enabled: true, label: "Rev 3", detail: "", kind: "buff" }],
    reminders: [],
    presetRef: { presetId: "preset-order", revision: 3 },
  };
  const older = {
    id: "preset-order",
    revision: 2,
    name: "Preset rev 2",
    definition: {
      name: "Aura rev 2",
      radiusMeters: 3,
      style: current.style,
      targeting: current.targeting,
      pills: [{ id: "pill", enabled: true, label: "Rev 2", detail: "", kind: "buff" }],
      reminders: [],
    },
  };
  const synced = syncCustomAuraWithPresets(current, [older]);
  assert.equal(synced.name, "Aura rev 3");
  assert.equal(synced.pills[0].label, "Rev 3");
  assert.deepEqual(synced.presetRef, { presetId: "preset-order", revision: 3 });
});

test("quick apply appende una linked instance distinta per ogni lista token", () => {
  const preset = {
    id: "preset-quick",
    revision: 1,
    name: "Preset Quick",
    definition: {
      name: "Aura Quick",
      radiusMeters: 3,
      style: { fillColor: "#111111", strokeColor: "#222222", fillOpacity: 0.2, strokeWidth: 1 },
      targeting: { filter: "all", includeSource: false },
      pills: [],
      reminders: [],
    },
  };
  const first = appendPresetToCustomAuraList([{ id: "existing-a", name: "A" }], preset);
  const second = appendPresetToCustomAuraList([{ id: "existing-b", name: "B" }], preset);
  assert.deepEqual(first.map((aura) => aura.id).slice(0, 1), ["existing-a"]);
  assert.deepEqual(second.map((aura) => aura.id).slice(0, 1), ["existing-b"]);
  assert.equal(first.at(-1).presetRef.presetId, "preset-quick");
  assert.equal(second.at(-1).presetRef.presetId, "preset-quick");
  assert.notEqual(first.at(-1).id, second.at(-1).id);
});

test("preset mancante o non disponibile: preserva invariato lo snapshot dell'aura linked", () => {
  const linkedAura = {
    id: "aura-token-1",
    enabled: true,
    name: "Aura Esistente",
    radiusMeters: 3,
    style: { fillColor: "#000000", strokeColor: "#ffffff", fillOpacity: 0.1, strokeWidth: 1 },
    targeting: { filter: "all", includeSource: false },
    pills: [{ id: "p1", enabled: true, label: "Pill", detail: "", kind: "buff" }],
    reminders: [],
    presetRef: { presetId: "preset-unreachable", revision: 3 },
  };

  // Catalog vuoto o senza quel preset
  const synced = syncCustomAuraWithPresets(linkedAura, []);
  assert.deepEqual(synced, linkedAura);
  assert.equal(synced.presetRef.presetId, "preset-unreachable");
});

test("tombstone di cancellazione preset scollega (detach) l'aura preservando lo snapshot senza cancellarla", () => {
  const linkedAura = {
    id: "aura-token-1",
    enabled: true,
    name: "Aura di Protezione",
    radiusMeters: 3,
    style: { fillColor: "#7c3aed", strokeColor: "#c4b5fd", fillOpacity: 0.16, strokeWidth: 1.4 },
    targeting: { filter: "friendly", includeSource: true },
    pills: [{ id: "p1", enabled: true, label: "Protetto", detail: "", kind: "buff" }],
    reminders: [],
    presetRef: { presetId: "preset-deleted", revision: 1 },
  };

  const tombstone = {
    id: "preset-deleted",
    deleted: true,
    revision: 2,
    updatedAt: Date.now(),
  };

  const synced = syncCustomAuraWithPresets(linkedAura, [tombstone]);
  assert.equal(synced.id, "aura-token-1");
  assert.equal(synced.enabled, true);
  assert.equal(synced.name, "Aura di Protezione");
  assert.equal(synced.presetRef, undefined);
  assert.equal(synced.pills.length, 1);
  assert.equal(synced.pills[0].label, "Protetto");
});

test("detach esplicito rimuove presetRef e mantiene lo snapshot esatto", () => {
  const linkedAura = {
    id: "aura-token-1",
    enabled: false,
    name: "Aura Indipendente",
    radiusMeters: 5,
    style: { fillColor: "#123456", strokeColor: "#654321", fillOpacity: 0.3, strokeWidth: 2 },
    targeting: { filter: "hostile", includeSource: false },
    pills: [{ id: "p1", enabled: true, label: "Debuff", detail: "", kind: "debuff" }],
    reminders: [],
    presetRef: { presetId: "preset-123", revision: 2 },
  };

  const detached = detachCustomAuraPreset(linkedAura);
  assert.equal(detached.id, "aura-token-1");
  assert.equal(detached.enabled, false);
  assert.equal(detached.name, "Aura Indipendente");
  assert.equal(detached.radiusMeters, 5);
  assert.equal(detached.presetRef, undefined);
});

test("store gestisce persistenza, sottoscrizioni e cancellazione con tombstone", () => {
  const storage = mockStorage();
  const store = createCustomAuraPresetStore({ storage });

  let emitted = 0;
  store.subscribe(() => { emitted += 1; });

  const preset = store.savePreset({
    id: "preset-hero",
    name: "Aura Eroica",
    definition: {
      name: "Eroe",
      radiusMeters: 3,
      style: { fillColor: "#ffd700", strokeColor: "#b8860b", fillOpacity: 0.2, strokeWidth: 1.5 },
      targeting: { filter: "friendly", includeSource: true },
      pills: [],
      reminders: [],
    },
  });

  assert.equal(preset.id, "preset-hero");
  assert.equal(preset.revision, 1);
  assert.equal(emitted, 1);
  assert.equal(store.getActivePresets().length, 1);

  // Aggiornamento
  store.savePreset({
    ...preset,
    revision: 2,
    definition: { ...preset.definition, radiusMeters: 6 },
  });
  assert.equal(store.getActivePresets()[0].definition.radiusMeters, 6);
  assert.equal(emitted, 2);

  // Duplicazione
  const copy = duplicatePreset(store.getPreset("preset-hero"), { newName: "Aura Eroica 2" });
  store.savePreset(copy);
  assert.equal(store.getActivePresets().length, 2);
  assert.equal(emitted, 3);

  // Cancellazione non distruttiva (crea tombstone)
  const deleted = store.deletePreset("preset-hero");
  assert.equal(deleted, true);
  assert.equal(store.getActivePresets().length, 1); // Solo la copia è attiva
  const rawCatalog = store.readPresets();
  const heroRecord = rawCatalog.find((p) => p.id === "preset-hero");
  assert.equal(heroRecord.deleted, true);
  assert.equal(heroRecord.revision, 3);
  assert.equal(emitted, 4);
  assert.equal("importPresets" in store, false);
  assert.equal("exportPresets" in store, false);
  assert.equal("clearAll" in store, false);
});

test("preset store propaga l'invalidazione cross-runtime via broadcast senza polling", () => {
  const storage = mockStorage();
  const listeners = new Set();
  const broadcast = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    },
    postMessage(data) {
      for (const listener of listeners) listener({ data });
    },
  };
  const first = createCustomAuraPresetStore({ storage, eventTarget: {}, broadcast });
  const second = createCustomAuraPresetStore({ storage, eventTarget: {}, broadcast });
  let secondRefreshes = 0;
  second.subscribe((_catalog, detail) => {
    if (detail.reason === "refresh") secondRefreshes += 1;
  });

  first.savePreset({
    id: "preset-cross-runtime",
    name: "Cross runtime",
    definition: {
      name: "Aura Cross",
      radiusMeters: 3,
      style: { fillColor: "#111111", strokeColor: "#222222", fillOpacity: 0.2, strokeWidth: 1 },
      targeting: { filter: "all", includeSource: false },
      pills: [],
      reminders: [],
    },
  });

  assert.equal(second.getPreset("preset-cross-runtime").revision, 1);
  assert.equal(secondRefreshes, 1);
  first.dispose();
  second.dispose();
});

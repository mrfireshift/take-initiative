#!/usr/bin/env node
// Copertura delle regole sulle azioni dei mostri (attacchi dei mostri, fase 5, lotto 0), su qualunque bestiario di
// 5eTools: quante azioni ogni regola riconosce, cosa resta fuori, e quanti byte i campi nuovi aggiungerebbero alla scheda
// di un mostro (che sta sul token: ogni byte viaggia in ogni evento della scena).
//
//   node scripts/monster-heuristics-coverage.mjs bestiary-mm.json bestiary-idrotf.json [--samples]
//
// I file restano dove sono; i derivati (_copy) trovano la base fra tutti i file passati.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fiveToolsCollection, fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { sanitizeQuickActions } from "../src/quickActionsCore.js";

const args = process.argv.slice(2);
const files = args.filter((arg) => !arg.startsWith("--"));
const showSamples = args.includes("--samples");
if (!files.length) {
  console.error("Uso: node scripts/monster-heuristics-coverage.mjs <bestiario.json> [...] [--samples]");
  process.exit(1);
}
const inputs = files.map((file) => JSON.parse(readFileSync(file, "utf8")));
const { pool, monsters, excluded2024 } = fiveToolsCollection(inputs);

const count = {};
const bump = (key, by = 1) => { count[key] = (count[key] || 0) + by; };
const samples = {};
const sample = (key, text) => { (samples[key] ||= []).length < 5 && samples[key].push(text); };
const cardBytes = [];
const addedBytes = [];
const quantile = (list, p) => [...list].sort((a, b) => a - b)[Math.floor(p * (list.length - 1))] ?? 0;

for (const monster of monsters) {
  const converted = fiveToolsMonsterToStatblock(monster, { pool });
  if (!converted.block) continue;
  bump("mostri");
  const actions = converted.block.actions || [];
  for (const action of actions) {
    bump("azioni");
    if (action.save) {
      bump("TS: azioni");
      if (action.area) {
        bump(`TS: area ${action.area.shape}`);
        if (action.area.origin) bump(`TS: area con origine (${action.area.origin})`);
        else { bump("TS: area senza origine"); sample("area senza origine", `${monster.name} / ${action.name}`); }
        if (action.area.choice) bump("TS: «of its choice»");
      }
      if (action.onFail) {
        bump("TS: con condizione");
        if (action.onFail.also) bump("TS: più condizioni");
        if (action.onFail.duration) bump("TS: condizione con durata");
        if (action.onFail.repeat) bump(`TS: tiro ripetuto (${action.onFail.repeat.timing})`);
        if (action.onFail.endsOnDamage) bump("TS: finisce con i danni");
      }
      if (action.immuneHours) bump("TS: immunità dopo il successo");
      if (/repeat the saving throw/i.test(action.note || "") && !action.onFail?.repeat) {
        bump("TS: tiro ripetuto non letto");
        sample("tiro ripetuto non letto", `${monster.name} / ${action.name}: ${action.note.slice(0, 140)}`);
      }
    } else if (action.attack) {
      bump("attacchi");
      if (action.onHit) {
        bump("attacchi: effetto al colpo letto");
        for (const key of Object.keys(action.onHit)) bump(`attacchi: al colpo ${key}`);
      } else if (/\bDC \d+|saving throw|\{@dc/i.test(action.note || "")) {
        bump("attacchi: effetto al colpo non letto");
        sample("effetto al colpo non letto", `${monster.name} / ${action.name}: ${String(action.note).slice(0, 140)}`);
      }
    }
  }
  for (const entry of converted.report || []) if (/^da gestire al tavolo/.test(entry)) bump("azioni da gestire al tavolo");
  const sheet = parseCharacterSheetImport(JSON.stringify(converted.block));
  const quick = [...(sheet.sections.attacks || []), ...(sheet.sections.innate || [])].map((action, index) => ({ ...action, id: `q${index}` }));
  const card = { ...sheet.sections.stats, notes: sheet.sections.notes || "", quickActions: sanitizeQuickActions(quick, { limit: 64, attackLimit: 64 }),
    savingThrows: sheet.sections.saves || {}, abilityModifiers: sheet.sections.abilities, damageDefenses: sheet.sections.defenses,
    spellbook: sheet.sections.spells, characterBuild: sheet.sections.classes || [], monster: { ...sheet.monster, multiattack: sheet.sections.multiattack } };
  const bytes = JSON.stringify(card).length;
  cardBytes.push(bytes);
  // The card already holds phase 5's fields (lotti 1–4): their share of it, the sentences they replaced already out of
  // the notes.
  const phase5 = card.quickActions.reduce((sum, action) => sum + JSON.stringify({ onHit: action.onHit, immuneHours: action.immuneHours,
    origin: action.area?.origin, choice: action.area?.choice, also: action.onFail?.also, rounds: action.onFail?.rounds,
    until: action.onFail?.until, anchor: action.onFail?.anchor, repeat: action.onFail?.repeat }).length - 2, 0);
  addedBytes.push(Math.round((phase5 / bytes) * 1000) / 10);
}

console.log(`File: ${files.map((file) => basename(file)).join(", ")}${excluded2024 ? ` (${excluded2024} mostri 2024 esclusi)` : ""}`);
for (const [key, value] of Object.entries(count)) console.log(`  ${key.padEnd(40)} ${value}`);
console.log(`  ${"scheda: byte (mediana / p90 / max)".padEnd(40)} ${quantile(cardBytes, 0.5)} / ${quantile(cardBytes, 0.9)} / ${quantile(cardBytes, 1)}`);
console.log(`  ${"campi della fase 5: % della scheda (p50 / p90 / max)".padEnd(40)} ${quantile(addedBytes, 0.5)}% / ${quantile(addedBytes, 0.9)}% / ${quantile(addedBytes, 1)}%`);
if (showSamples) for (const [key, list] of Object.entries(samples)) console.log(`\n${key}:\n  ${list.join("\n  ")}`);

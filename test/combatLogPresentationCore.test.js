import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCombatLogPresentation,
  filterCombatLogPresentation,
  formatCombatLogTimestamp,
  getCombatLogCategoryMeta,
  normalizePresentationSearch,
  serializeCombatLogPresentationText,
} from "../src/combatLogPresentationCore.js";

const categories = ["hp", "spell", "save", "condition", "resource", "movement", "turn", "roster", "undo", "note", "other"];

function event(overrides = {}) {
  return {
    id: "event-1",
    sequence: 1,
    at: 1_700_000_000_000,
    round: 1,
    kind: "note",
    category: "note",
    label: "Nota del DM",
    source: "manual",
    turn: { id: "actor-1", name: "Arannis" },
    targets: [],
    payload: { text: "La porta scricchiola" },
    ...overrides,
  };
}

function hpTarget(name = "Goblin") {
  return {
    id: name.toLowerCase(),
    name,
    before: { hp: 12, hpMax: 20 },
    after: { hp: 0, hpMax: 20 },
    delta: -12,
    hpMaxDelta: 0,
  };
}

test("il presentation core non importa OBR, DOM o IndexedDB", () => {
  const source = readFileSync(new URL("../src/combatLogPresentationCore.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@owlbear-rodeo|document\.|window\.|indexedDB/i);
});

test("ogni categoria ha etichetta e tono stabile", () => {
  for (const category of categories) {
    const meta = getCombatLogCategoryMeta(category);
    assert.ok(meta.label, category);
    assert.match(meta.tone, /^#/u, category);
  }
});

test("il fallback di categoria è Altro", () => {
  assert.deepEqual(getCombatLogCategoryMeta("not-a-category"), getCombatLogCategoryMeta("other"));
});

test("eventi v1 e v2 producono una proiezione coerente", () => {
  const model = buildCombatLogPresentation({ id: "session-1", name: "Test" }, [
    { ...event({ id: "v1", version: 1, category: undefined, kind: "initiative-card", payload: {} }) },
    event({ id: "v2", version: 2, kind: "spell-active-resolution", category: "spell", label: "Palla di Fuoco" }),
  ]);
  assert.deepEqual(model.events.map((item) => item.category), ["resource", "spell"]);
  assert.equal(model.events[0].technical.kind, "initiative-card");
  assert.equal(model.events[1].categoryLabel, "Incantesimo");
});

test("il modello raggruppa Round e Turno", () => {
  const model = buildCombatLogPresentation(null, [
    event({ id: "a", sequence: 1, round: 1, turn: { id: "a", name: "Arannis" } }),
    event({ id: "b", sequence: 2, round: 1, turn: { id: "b", name: "Goblin" } }),
    event({ id: "c", sequence: 3, round: 2, turn: { id: "a", name: "Arannis" } }),
  ]);
  assert.deepEqual(model.groups.map((group) => group.round), [1, 2]);
  assert.deepEqual(model.groups[0].turns.map((turn) => turn.turnName), ["Arannis", "Goblin"]);
  assert.equal(model.groups[1].turns[0].events[0].id, "c");
});

test("gli eventi senza turno finiscono in Fuori turno", () => {
  const model = buildCombatLogPresentation(null, [event({ turn: null })]);
  assert.equal(model.groups[0].turns[0].turnName, "Fuori turno");
  assert.equal(model.sessionSummary.outOfTurnEvents, 1);
});

test("l'ordine degli eventi resta quello della sequence", () => {
  const model = buildCombatLogPresentation(null, [
    event({ id: "second", sequence: 2 }),
    event({ id: "first", sequence: 1 }),
  ]);
  assert.deepEqual(model.events.map((item) => item.id), ["first", "second"]);
  assert.deepEqual(model.groups[0].turns[0].events.map((item) => item.id), ["first", "second"]);
});

test("i turni virtuali usano i dati dell'evento senza lookup token", () => {
  const model = buildCombatLogPresentation(null, [event({ turn: { id: "__LAIR__", name: "Azioni di Tana" } })]);
  assert.equal(model.groups[0].turns[0].turnKey, "turn:__LAIR__");
  assert.equal(model.groups[0].turns[0].turnName, "Azioni di Tana");
});

test("la facet HP mostra HP, massimi e delta con segno", () => {
  const model = buildCombatLogPresentation(null, [event({
    id: "hp",
    kind: "hp",
    category: "hp",
    label: "Danno rapido",
    targets: [hpTarget()],
    facets: { hp: { targets: [{ ...hpTarget(), hpMaxDelta: -2 }] } },
  })]);
  const projected = model.events[0];
  assert.match(projected.summary, /Goblin: 12\/20 → 0\/20 \(-12 HP\)/u);
  assert.match(projected.details.flatMap((section) => section.lines).join(" "), /HP max -2/u);
});

test("la facet HP legacy usa i target dell'evento", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "hp",
    category: "hp",
    targets: [hpTarget("Ogre")],
  })]);
  assert.match(model.events[0].summary, /Ogre/u);
});

test("condizioni aggiunte, rimosse e aggiornate sono raggruppate per target", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "condition",
    category: "condition",
    facets: {
      conditions: {
        targets: [{
          name: "Goblin",
          added: [{ id: "prone", name: "Prono" }],
          removed: [{ id: "blessed", name: "Benedetto" }],
          updated: [{ before: { name: "Accecato" }, after: { name: "Accecato · 2" } }],
        }],
      },
    },
  })]);
  const details = model.events[0].details.flatMap((section) => section.lines).join(" ");
  assert.match(details, /Goblin: \+ Prono/u);
  assert.match(details, /Goblin: − Benedetto/u);
  assert.match(details, /Accecato → Accecato · 2/u);
});

test("spell e concentrazione espongono aggiunte e terminazioni", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "spell-active-resolution",
    category: "spell",
    facets: {
      spells: { targets: [{ name: "Goblin", added: [{ name: "Ragnatela" }], removed: [{ name: "Scudo" }], updated: [] }] },
      concentrations: { targets: [{ name: "Arannis", added: [{ name: "Benedizione" }], removed: [{ name: "Favore divino" }], updated: [] }] },
    },
  })]);
  const labels = model.events[0].details.map((section) => section.label);
  const text = model.events[0].details.flatMap((section) => section.lines).join(" ");
  assert.deepEqual(labels, ["Incantesimi", "Concentrazione", "Turno", "Registrazione"]);
  assert.match(text, /\+ Ragnatela/u);
  assert.match(text, /− Favore divino/u);
});

test("un comando multidominio resta una sola card", () => {
  const model = buildCombatLogPresentation(null, [event({
    id: "multi",
    kind: "spell-active-resolution",
    category: "spell",
    facets: {
      hp: { targets: [hpTarget()] },
      conditions: { targets: [{ name: "Goblin", added: [{ name: "Privo di sensi" }], removed: [], updated: [] }] },
    },
  })]);
  assert.equal(model.events.length, 1);
  assert.ok(model.events[0].details.length >= 2);
});

test("save e reminder mostrano soltanto outcome espliciti", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "save-resolution",
    category: "save",
    payload: {
      outcomes: [{ target: "Goblin", outcome: "failed" }, { target: "Ogre", outcome: "passed" }],
      targets: [{ name: "Goblin", damage: 42 }],
    },
  })]);
  assert.deepEqual(model.events[0].outcomes, ["Fallito", "Superato"]);
  assert.match(model.events[0].summary, /Fallito, Superato/u);
  assert.match(model.events[0].summary, /42 danni/u);
  assert.match(model.events[0].details.flatMap((section) => section.lines).join(" "), /Goblin: 42 danni/u);
});

test("i reminder di concentrazione hanno badge e titolo distinti dagli eventi spell", () => {
  const model = buildCombatLogPresentation(null, [
    event({
      id: "concentration-reminder",
      kind: "reminder-resolution",
      category: "save",
      label: "Blocca persone · Fallito",
      payload: {
        outcome: "failed",
        replay: {
          type: "concentration-warning",
          warning: {
            spellName: "Blocca persone",
            notice: {
              resolution: {
                activation: { kind: "concentration-save" },
              },
            },
          },
        },
      },
    }),
    event({
      id: "spell-reminder",
      kind: "reminder-resolution",
      category: "save",
      label: "Blocca persone · Fallito",
      payload: {
        outcome: "failed",
        causality: {
          cause: {
            kind: "spell",
            spellName: "Blocca persone",
            slotLevel: 2,
          },
        },
      },
    }),
  ]);

  assert.equal(model.events[0].categoryLabel, "Concentrazione");
  assert.equal(model.events[0].title, "Concentrazione: Blocca persone · TS fallito");
  assert.equal(model.events[1].categoryLabel, "Incantesimo");
  assert.equal(model.events[1].title, "Incantesimo: Blocca persone · Fallito");
});

test("i reminder TS di permanenza area hanno badge dedicato e non mostrano Incantesimo come nome", () => {
  const model = buildCombatLogPresentation(null, [
    event({
      id: "area-save-reminder",
      kind: "reminder-resolution",
      category: "save",
      label: "Incantesimo · Fallito",
      payload: {
        outcome: "failed",
        spellName: "Incantesimo",
        causality: {
          cause: { kind: "spell", spellName: "Nube mortale", slotLevel: 5 },
          zone: { action: "resolve", zoneItemId: "cloudkill-zone" },
        },
      },
    }),
    event({
      id: "area-save-without-name",
      kind: "reminder-resolution",
      category: "save",
      label: "Incantesimo · Superato",
      payload: {
        outcome: "passed",
        spellName: "Incantesimo",
        causality: { zone: { action: "resolve", zoneItemId: "cloudkill-zone" } },
      },
    }),
  ]);

  assert.equal(model.events[0].categoryLabel, "Permanenza area");
  assert.equal(model.events[0].title, "Permanenza area: Nube mortale · Fallito");
  assert.equal(model.events[1].categoryLabel, "Permanenza area");
  assert.equal(model.events[1].title, "Permanenza area · Superato");
});

test("un reminder v2 recupera spell e caster dal cast precedente tramite instanceId esplicito", () => {
  const model = buildCombatLogPresentation(null, [
    event({
      id: "cast-spirit-guardians",
      sequence: 1,
      kind: "save-resolution",
      category: "save",
      payload: {
        causality: {
          source: "spell-area",
          spellId: "spirit-guardians",
          spellName: "Guardiani spirituali",
          casterId: "gideon",
          casterName: "Gideon Lightward",
          concentrationInstanceId: "instance-spirit-1",
        },
      },
    }),
    event({
      id: "area-reminder-v2",
      sequence: 2,
      kind: "reminder-resolution",
      category: "save",
      label: "Permanenza area · TS superato",
      payload: {
        outcome: "passed",
        causality: {
          cause: { kind: "spell", slotLevel: 3 },
          actor: { role: "source" },
          zone: { action: "resolve", zoneItemId: "zone-1" },
        },
        replay: {
          type: "reminder",
          descriptor: {
            notice: {
              resolution: {
                activation: {
                  kind: "zone",
                  instanceId: "instance-spirit-1",
                  zoneItemId: "zone-1",
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const reminder = model.events.find((item) => item.id === "area-reminder-v2");
  const details = reminder.details.flatMap((section) => section.lines).join(" ");
  assert.equal(reminder.title, "Permanenza area: Guardiani spirituali · Superato");
  assert.equal(reminder.causality.cause.spellId, "spirit-guardians");
  assert.equal(reminder.causality.actor.id, "gideon");
  assert.match(details, /Incantesimo: Guardiani spirituali/u);
  assert.match(details, /Incantatore: Gideon Lightward/u);
});

test("un reminder legacy senza dati di provenienza conserva titolo e categoria tecnici", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "reminder-resolution",
    category: "save",
    label: "Promemoria · Fallito",
    payload: { outcome: "failed" },
  })]);

  assert.equal(model.events[0].categoryLabel, "Tiro salvezza");
  assert.equal(model.events[0].title, "Promemoria · Fallito");
});

test("un reminder di feature senza marker spell non viene classificato come incantesimo", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "reminder-resolution",
    category: "save",
    label: "Ira Implacabile · TS fallito",
    payload: {
      outcome: "failed",
      causality: { cause: { kind: "spell" } },
    },
  })]);

  assert.equal(model.events[0].categoryLabel, "Tiro salvezza");
  assert.equal(model.events[0].title, "Ira Implacabile · TS fallito");
});

test("movimento viene aggregato per target e turno", () => {
  const base = { kind: "move", category: "movement", round: 1, turn: { id: "a", name: "Arannis" } };
  const model = buildCombatLogPresentation(null, [
    event({ ...base, id: "move-1", sequence: 1, targets: [{ id: "g", name: "Goblin", cells: 1 }] }),
    event({ ...base, id: "move-2", sequence: 2, targets: [{ id: "g", name: "Goblin", cells: 2 }] }),
  ]);
  assert.equal(model.events.length, 1);
  assert.equal(model.events[0].targets[0].cells, 3);
});

test("Undo e nota mantengono il testo completo", () => {
  const model = buildCombatLogPresentation(null, [
    event({ id: "undo", kind: "undo", category: "undo", source: "automatic", payload: { description: "Annullato HP e condizioni" } }),
    event({ id: "note", kind: "note", category: "note", payload: { text: "Porta chiusa" } }),
  ]);
  assert.equal(model.events.find((item) => item.id === "undo").summary, "Annullato HP e condizioni");
  assert.equal(model.events.find((item) => item.id === "note").summary, "Porta chiusa");
  assert.match(model.events.find((item) => item.id === "note").details.flatMap((section) => section.lines).join(" "), /Nota manuale/u);
});

test("il movimento annullato conserva la correzione nella stessa card semantica", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "move",
    category: "movement",
    label: "Movimento annullato: Goblin",
    targets: [{ id: "goblin", name: "Goblin", cells: -2 }],
    payload: { nativeUndo: true },
  })]);
  const text = model.events[0].details.flatMap((section) => section.lines).join(" ");
  assert.match(model.events[0].summary, /-2 caselle/u);
  assert.match(text, /Correzione da Undo OBR/u);
});

test("distingue nella card Undo Cronologia e Undo nativo OBR", () => {
  const historyModel = buildCombatLogPresentation(null, [event({
    kind: "move",
    category: "movement",
    targets: [{ id: "goblin", name: "Goblin", cells: -2.5 }],
    payload: { movementCorrection: true, undoSource: "history", nativeUndo: false },
  })]);
  const nativeModel = buildCombatLogPresentation(null, [event({
    id: "native-move",
    kind: "move",
    category: "movement",
    targets: [{ id: "goblin", name: "Goblin", cells: -1.5 }],
    payload: { movementCorrection: true, undoSource: "obr-native", nativeUndo: true },
  })]);

  assert.match(
    historyModel.events[0].details.flatMap((section) => section.lines).join(" "),
    /Undo della Cronologia/u,
  );
  assert.match(
    nativeModel.events[0].details.flatMap((section) => section.lines).join(" "),
    /Undo OBR/u,
  );
});

test("il turno non viene trasformato in fonte causale", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "hp",
    category: "hp",
    turn: { id: "a", name: "Arannis" },
    targets: [hpTarget()],
  })]);
  const text = model.events[0].details.flatMap((section) => section.lines).join(" ");
  assert.match(text, /Fonte: non tracciata/u);
  assert.doesNotMatch(text, /Arannis infligge/u);
});

test("caster viene mostrato solo se esplicito nel payload", () => {
  const model = buildCombatLogPresentation(null, [event({
    kind: "spell-active-resolution",
    category: "spell",
    payload: { casterName: "Arannis", spellName: "Palla di Fuoco" },
  })]);
  const text = model.events[0].details.flatMap((section) => section.lines).join(" ");
  assert.match(text, /Caster: Arannis/u);
  assert.match(text, /Incantesimo: Palla di Fuoco/u);
});

test("la ricerca è case-insensitive e accent-insensitive", () => {
  assert.equal(normalizePresentationSearch("Palla di Fuòco"), "palla di fuoco");
  const model = buildCombatLogPresentation(null, [event({ label: "Palla di Fuoco", category: "spell", kind: "spell" })]);
  assert.equal(filterCombatLogPresentation(model, { query: "FUOCO" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { query: "fuoco" }).events.length, 1);
});

test("il filtro categoria usa category e non kind", () => {
  const model = buildCombatLogPresentation(null, [event({ kind: "spell-active-resolution", category: "spell" })]);
  assert.equal(filterCombatLogPresentation(model, { category: "spell" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { category: "resource" }).events.length, 0);
});

test("il filtro partecipante include target e turno", () => {
  const model = buildCombatLogPresentation(null, [event({ targets: [{ id: "g", name: "Goblin" }] })]);
  assert.equal(filterCombatLogPresentation(model, { participant: "Goblin" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { participant: "Arannis" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { participant: "Ogre" }).events.length, 0);
});

test("il filtro outcome usa valori espliciti", () => {
  const model = buildCombatLogPresentation(null, [event({ category: "save", kind: "save-resolution", payload: { outcome: "failed" } })]);
  assert.equal(filterCombatLogPresentation(model, { outcome: "Fallito" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { outcome: "Superato" }).events.length, 0);
});

test("filtri combinati restringono la stessa proiezione", () => {
  const model = buildCombatLogPresentation(null, [
    event({ id: "match", category: "save", kind: "save-resolution", label: "Tiro", payload: { outcome: "failed" }, targets: [{ name: "Goblin" }] }),
    event({ id: "other", category: "save", kind: "save-resolution", label: "Tiro", payload: { outcome: "passed" }, targets: [{ name: "Goblin" }] }),
  ]);
  const filtered = filterCombatLogPresentation(model, { category: "save", participant: "Goblin", outcome: "Fallito", query: "tiro" });
  assert.deepEqual(filtered.events.map((item) => item.id), ["match"]);
});

test("il riepilogo conta eventi, round, turni, partecipanti e categorie", () => {
  const model = buildCombatLogPresentation({ id: "s", name: "Assalto", startedAt: 100 }, [
    event({ id: "a", sequence: 1, round: 1, category: "hp", kind: "hp", targets: [hpTarget()] }),
    event({ id: "b", sequence: 2, round: 2, category: "note", kind: "note", turn: null }),
  ]);
  assert.equal(model.sessionSummary.totalEvents, 2);
  assert.equal(model.sessionSummary.roundCount, 2);
  assert.equal(model.sessionSummary.turnCount, 1);
  assert.equal(model.sessionSummary.participantCount, 2);
  assert.equal(model.sessionSummary.categoryCounts.hp, 1);
  assert.equal(model.sessionSummary.categoryCounts.note, 1);
  assert.equal(model.sessionSummary.netDamage, undefined);
});

test("sessione nulla e sessione vuota non inventano date", () => {
  const empty = buildCombatLogPresentation(null, []);
  const emptySession = buildCombatLogPresentation({ id: "s", name: "Vuota", startedAt: 100 }, []);
  assert.equal(empty.sessionSummary.hasSession, false);
  assert.equal(empty.sessionSummary.startedAt, null);
  assert.equal(emptySession.sessionSummary.firstEventAt, null);
  assert.equal(formatCombatLogTimestamp(null), "—");
});

test("la proiezione filtrata non muta il modello originale", () => {
  const model = buildCombatLogPresentation(null, [event()]);
  const before = JSON.stringify(model);
  const filtered = filterCombatLogPresentation(model, { query: "porta" });
  assert.equal(filtered.events.length, 1);
  assert.equal(JSON.stringify(model), before);
});

test("target con stesso nome ma ID distinti restano entrambi disponibili", () => {
  const model = buildCombatLogPresentation(null, [event({
    targets: [
      { id: "goblin-1", name: "Goblin" },
      { id: "goblin-2", name: "Goblin" },
    ],
  })]);
  assert.deepEqual(model.events[0].targets.map((target) => target.id), ["goblin-1", "goblin-2"]);
});

test("il contratto UI usa la proiezione semantica e l'export JSON raw", () => {
  const source = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8");
  assert.match(source, /buildCombatLogPresentation\(session, events\)/u);
  assert.match(source, /filterCombatLogPresentation\(presentation/u);
  assert.match(source, /peekActiveCombatLogData\(/u);
  assert.match(source, /getCombatLogExportData\(/u);
  assert.match(source, /exportCombatLogJSONFromStorage\(/u);
  assert.doesNotMatch(source, /selectedKind|eventTone\(|kindLabel\(/u);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML/u);
  assert.match(source, /data-combat-log-control="search"/u);
  assert.match(source, /aria-live/u);
  assert.match(source, /textContent/u);
  assert.doesNotMatch(source, /new Date\(Number\(session\?\.startedAt\) \|\| Date\.now\(\)\)/u);
  const timelineSource = source.slice(source.indexOf("const renderTimeline"), source.indexOf("const logPanel"));
  assert.doesNotMatch(timelineSource, /OBR\.|getMetadata\(|getItems\(|indexedDB/u);
  assert.match(source, /restoreCombatLogUiState\(app\)/u);
  const roundStyle = source.slice(source.indexOf("Object.assign(roundDetails.style"), source.indexOf("roundDetails.addEventListener"));
  const turnStyle = source.slice(source.indexOf("Object.assign(turnDetails.style"), source.indexOf("turnDetails.addEventListener"));
  assert.match(roundStyle, /display: "block"/u);
  assert.match(roundStyle, /overflow: "visible"/u);
  assert.match(turnStyle, /display: "block"/u);
  assert.match(turnStyle, /overflow: "visible"/u);
  assert.match(source.slice(source.indexOf("Object.assign(details.style"), source.indexOf("details.addEventListener")), /overflow: "visible"/u);
});

test("il TXT usa tutta la sessione in ordine Round e Turno", () => {
  const model = buildCombatLogPresentation({ id: "s", name: "Assalto", startedAt: 100 }, [
    event({ id: "later", sequence: 2, round: 2, label: "Secondo" }),
    event({ id: "first", sequence: 1, round: 1, label: "Primo" }),
  ]);
  const output = serializeCombatLogPresentationText({ id: "s", name: "Assalto", startedAt: 100 }, model);
  assert.ok(output.indexOf("ROUND 1") < output.indexOf("ROUND 2"));
  assert.ok(output.indexOf("Primo") < output.indexOf("Secondo"));
  assert.match(output, /Storage: Locale a questo browser GM/u);
});

test("il TXT di sessione vuota dichiara l'assenza di eventi", () => {
  const model = buildCombatLogPresentation({ id: "s", name: "Vuota", startedAt: 100 }, []);
  const output = serializeCombatLogPresentationText({ id: "s", name: "Vuota", startedAt: 100 }, model);
  assert.match(output, /Nessun evento registrato/u);
  assert.doesNotMatch(output, /1970/u);
});

test("la causalità spell arricchisce card, partecipanti, outcome e TXT senza attribuire il turno", () => {
  const model = buildCombatLogPresentation(null, [event({
    id: "causal-fireball",
    kind: "spell-active-resolution",
    category: "spell",
    label: "Palla di fuoco",
    turn: { id: "active", name: "Turno attivo" },
    payload: {
      causality: {
        version: 1,
        domain: "spell",
        eventType: "area/save-resolution",
        cause: {
          kind: "spell",
          spellId: "fireball",
          spellName: "Palla di fuoco",
          instanceId: "spell-1",
          slotLevel: 3,
        },
        actor: { id: "caster", name: "Arannis", role: "caster" },
        phase: "resolve",
        action: { label: "Risolvi", damageRoll: 28 },
        targets: [
          { id: "goblin", name: "Goblin", outcome: "failed", requestedDamage: 28, appliedHpDelta: -14, damageFactor: 0.5 },
          { id: "immune", name: "Immune", outcome: "immune", requestedDamage: 0, appliedHpDelta: 0, damageFactor: 0 },
        ],
      },
    },
  })]);
  const projected = model.events[0];
  const details = projected.details.flatMap((section) => section.lines).join(" ");
  assert.match(details, /Incantesimo: Palla di fuoco/u);
  assert.match(details, /Incantatore: Arannis/u);
  assert.match(details, /Livello slot: 3/u);
  assert.match(details, /Tiro del danno: 28/u);
  assert.match(details, /-14 HP applicati/u);
  assert.match(details, /Immune/u);
  assert.doesNotMatch(details, /Fonte: non tracciata/u);
  assert.equal(filterCombatLogPresentation(model, { participant: "Arannis" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { query: "palla di fuoco" }).events.length, 1);
  assert.equal(filterCombatLogPresentation(model, { outcome: "Fallito" }).events.length, 1);
  const txt = serializeCombatLogPresentationText(null, model);
  assert.match(txt, /Incantatore: Arannis/u);
  assert.match(txt, /Tiro del danno: 28/u);
});

test("outcome object-map, payload legacy e HP generico restano distinti", () => {
  const model = buildCombatLogPresentation(null, [
    event({
      id: "map-outcome",
      kind: "save-resolution",
      category: "save",
      payload: {
        outcomes: { goblin: "failed", ogre: "passed" },
        targets: [{ id: "goblin", name: "Goblin" }, { id: "ogre", name: "Ogre" }],
        attacks: [{ targetId: "ogre", attackOutcome: "hit", damageRoll: 12 }],
      },
    }),
    event({ id: "generic-hp", kind: "hp", category: "hp", targets: [hpTarget("Ogre")] }),
    event({ id: "legacy", version: 1, kind: "initiative-card", category: undefined, payload: { text: "legacy" } }),
  ]);
  assert.deepEqual(model.events.find((item) => item.id === "map-outcome").outcomes, ["Fallito", "Superato", "Colpito"]);
  const genericText = model.events.find((item) => item.id === "generic-hp").details.flatMap((section) => section.lines).join(" ");
  assert.match(genericText, /Fonte: non tracciata/u);
  assert.equal(model.events.find((item) => item.id === "legacy").technical.kind, "initiative-card");
});

test("contenuto ostile resta testo nella proiezione", () => {
  const model = buildCombatLogPresentation(null, [event({
    payload: {
      causality: {
        version: 1,
        domain: "spell",
        eventType: "active-action",
        cause: { kind: "spell", spellName: "<img src=x onerror=alert(1)>" },
        actor: { name: "<script>alert(1)</script>" },
        targets: [{ id: "x", name: "<b>Goblin</b>" }],
      },
    },
  })]);
  const text = JSON.stringify(model.events[0].details);
  assert.match(text, /<img src=x onerror=alert\(1\)>/u);
  assert.match(text, /<script>alert\(1\)<\/script>/u);
  assert.match(text, /<b>Goblin<\/b>/u);
});

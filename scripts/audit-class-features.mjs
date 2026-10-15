import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(".");
const SOURCE_DIR = path.join(ROOT_DIR, "data", "class-features");
const RUNTIME_CATALOG_PATH = path.join(ROOT_DIR, "src", "class-features-runtime.json");
const REPORT_PATH = path.join(SOURCE_DIR, "class-feature-automation-audit.json");
const MARKDOWN_PATH = path.join(ROOT_DIR, "docs", "AUDIT_CAPACITA_CLASSE.md");
const TEST_DIR = path.join(ROOT_DIR, "test");

const SOURCE_CONFIGS = Object.freeze([
  Object.freeze({
    id: "phb2014",
    label: "Manuale del Giocatore 2014",
    catalog: "phb2014_classi_database_finale.json",
    mechanics: "phb2014_livello_meccanico_v1_1.json",
  }),
  Object.freeze({
    id: "xanathar",
    label: "Guida Omnicomprensiva di Xanathar",
    catalog: "xanathar_sottoclassi_database_finale.json",
    mechanics: "xanathar_livello_meccanico_v1_0.json",
  }),
  Object.freeze({
    id: "tasha",
    label: "Calderone Omnicomprensivo di Tasha",
    catalog: "tasha_sottoclassi_database_finale.json",
    mechanics: "tasha_livello_meccanico_v1_0.json",
  }),
  Object.freeze({
    id: "ranger-revised",
    label: "Unearthed Arcana: Ranger, Revised (2016)",
    catalog: "ranger_revised_database_finale.json",
    mechanics: "ranger_revised_livello_meccanico_v1_0.json",
  }),
]);

const ACTIONABLE_ACTIVATIONS = new Set([
  "azione",
  "azione_bonus",
  "azione_bonus_o_ingresso_in_ira",
  "azione_attacco",
  "fine_riposo_breve",
  "fine_turno",
  "ingresso_in_ira",
  "innesco",
  "inizio_primo_turno_combattimento",
  "nessuna_azione",
  "prima_del_tiro",
  "reazione",
  "varia_per_opzione",
]);

const COMBAT_ACTIVATIONS = new Set([
  "azione",
  "azione_bonus",
  "azione_bonus_o_ingresso_in_ira",
  "azione_attacco",
  "ingresso_in_ira",
  "innesco",
  "inizio_primo_turno_combattimento",
  "reazione",
]);

const TOKEN_MARKER_EFFECTS = new Set([
  "advantage",
  "advantage_on_weapon_attacks",
  "apply_state",
  "aura",
  "aura_bonus_iniziativa",
  "create_aura",
  "create_temporary_weapons",
  "curse",
  "damage_buffer",
  "damage_resistance",
  "debuff_next_save",
  "extra_attack_on_attack_action",
  "grant_consumable_die",
  "link_targets",
  "mark_target",
  "miss_chance",
  "spellcasting_lock",
  "speed_bonus",
  "status_bundle",
  "telepathic_link",
  "temporary_hp",
  "temporary_hp_and_reaction_move",
  "transform",
]);

const RESOURCE_ONLY_EFFECTS = new Set([
  "convert_spell_slot_to_points",
  "create_spell_slot",
  "restore_spell_slots",
  "shared_dice_resource_provider",
  "shared_resource_provider",
  "spell_slot_pool",
]);

const PERSISTENT_DURATION_TYPES = new Set([
  "fixed",
  "formula",
  "fino_al_riposo_lungo",
  "until_end_of_next_turn",
  "until_end_of_turn",
  "until_start_of_next_turn",
]);

const TEXT_MARKER_SIGNALS = Object.freeze([
  "finché",
  "fino a",
  "fino al",
  "fino all",
  "per 1 minuto",
  "per un minuto",
  "round",
  "aura",
  "marchio",
  "bersaglio",
  "alleat",
]);

const STRONG_TEXT_MARKER_SIGNALS = new Set([
  "finché",
  "per 1 minuto",
  "per un minuto",
  "round",
  "aura",
  "marchio",
]);

const MODE_LABELS = Object.freeze({
  token_marker: "Tracciamento su token",
  token_marker_review: "Candidato token da curare",
  instant_effect: "Effetto istantaneo",
  tavolo: "Gestione al tavolo",
});

const MODE_PRIORITY = Object.freeze({
  token_marker: "alta",
  token_marker_review: "media",
  instant_effect: "nessuna",
  tavolo: "nessuna",
});

const CUSTOM_ADAPTERS = new Set([
  "lay-on-hands",
  "purifying-touch",
  "unsettling-words",
  "universal-speech",
  "night-eyes",
  "turn-undead",
  "turn-creatures",
  "spell-thief",
  "wild-magic-surge",
  "wild-magic-tides",
  "sorcery-source",
  "sorcerous-restoration",
  "bardic-inspiration",
]);

// Primitive runtime con cui un batch può implementare una capacità. `available`
// indica se basta un override in runtime-feature-overrides.json; le altre
// richiedono codice condiviso prima di poter essere usate dai dati.
const BACKLOG_PRIMITIVES = Object.freeze({
  "reference-only": { label: "Carta descrittiva", available: true },
  "resource-only": { label: "Consumo risorsa", available: true },
  condition: { label: "Pill con durata", available: true },
  "condition-choice": { label: "Pill con esito scelto dal GM (choiceOptions)", available: true },
  aura: { label: "Aura dinamica", available: true },
  "custom-adapter": { label: "Adapter dedicato esistente", available: true },
  "value-input": { label: "Valore numerico inserito dal GM (cure, PF temporanei, costi variabili)", available: false },
  "linked-token": { label: "Compagno o evocazione su token esistente", available: false },
  transformation: { label: "Trasformazione", available: false },
  "spell-bridge": { label: "Ponte verso il sistema Incantesimi", available: false },
});

const BACKLOG_ARCHETYPES = Object.freeze({
  reference: { label: "Descrittiva / passiva", primitive: "reference-only" },
  "instant-reminder": { label: "Reazione o effetto istantaneo da ricordare", primitive: "reference-only" },
  movement: { label: "Movimento / teletrasporto", primitive: "reference-only" },
  "resource-only": { label: "Solo consumo risorsa", primitive: "resource-only" },
  "timed-condition": { label: "Buff o marker con durata", primitive: "condition" },
  "save-outcome-condition": { label: "Condizione dopo tiro salvezza", primitive: "condition-choice" },
  aura: { label: "Aura", primitive: "aura" },
  "hp-change": { label: "Cura o PF temporanei", primitive: "value-input" },
  "variable-cost": { label: "Costo variabile scelto dal GM", primitive: "value-input" },
  "companion-summon": { label: "Compagno / evocazione", primitive: "linked-token" },
  transformation: { label: "Trasformazione", primitive: "transformation" },
  "spell-bridge": { label: "Lancio o slot tramite capacità", primitive: "spell-bridge" },
  "custom-adapter": { label: "Adapter dedicato", primitive: "custom-adapter" },
});

const PASSIVE_ACTIVATIONS = new Set([
  "passiva",
  "passiva_o_non_specificata",
  "contenitore_opzioni",
  "sistema_incantesimi",
  "attivita_fuori_servizio",
]);

const BACKLOG_TEXT_RULES = Object.freeze({
  // Il nome identifica la trasformazione: nel testo "forma" ed "evocare"
  // compaiono anche nelle capacità figlie e in Incanalare Divinità.
  transformationName: /forma selvatica|forma siderale|forma d'ombra|rivelazione della carne|colosso runico/u,
  transformation: /\bassum\w* (?:la |una )?forma (?:di una bestia|bestiale|siderale|d'ombra)|\btrasformarti\b|\bti trasformi\b/u,
  companionSummon: /\bcompagn[oi] (?:animale|bestiale|del ranger|della morte|draconico)|\bfamiglio\b|\bservitor[ei]\b|\bsegugio\b|spirito (?:della fiamma|guardiano)|totem spirituale|\bdrake\b|mente manifesta|\btentacolo\b|evoc\w* (?:un|uno|una) (?:spirito|creatura|bestia|tentacolo)/u,
  spellBridge: /senza (?:spendere|usare|consumare) (?:uno |alcuno )?slot|recuper\w* (?:alcuni |uno |gli )?slot|(?:crea|ottien\w*|riguadagn\w*) (?:uno |alcuni )?slot|lanciar\w* (?:l'|un |questo |quell')?incantesim\w* .*(?:una volta|senza)/u,
  hpChange: /punti ferita temporanei|(?:recuper|riguadagn|ripristin)\w* .{0,40}punti ferita|\bcur(?:a|are|arsi)\b.{0,40}punti ferita/u,
  aura: /\baura\b/u,
  saveOutcome: /tiro salvezza.{0,240}(?:spaventat|affascinat|prono|pron[ai]\b|stordit|accecat|trattenut|paralizzat|avvelenat|incapacitat|assordat|pietrificat|afferrat)|(?:spaventat|affascinat|stordit|accecat|trattenut|paralizzat|incapacitat|afferrat).{0,240}tiro salvezza/u,
  timed: /per 1 minuto|per un minuto|per 10 minuti|per 1 ora|per un'ora|fino (?:alla fine|all'inizio|al termine) del|\bfinché\b/u,
  movement: /teletrasport|\bti muovi\b|\bmuoverti\b|\bspostar\w*|velocità (?:aumenta|raddoppia|di volare)|\bscatto\b|\bdisimpegno\b/u,
});

// Decisioni manuali che prevalgono sulle regole testuali. Ogni batch di classe
// aggiunge qui gli archetipi confermati durante la revisione.
const BACKLOG_ARCHETYPE_OVERRIDES = Object.freeze({
  "druido-circolo-della-fiamma-evocare-spirito-della-fiamma": "companion-summon",
  "monaco-via-della-mano-aperta-tranquillita": "timed-condition",
  // Batch Guerriero (Fase 2).
  "guerriero-cavaliere-mistico-arma-vincolata": "reference",
  "guerriero-cavaliere-runico-colosso-runico": "reference",
  "guerriero-guerriero-psionico-adepto-telecinetico": "reference",
  "guerriero-guerriero-psionico-potere-psionico": "reference",
  "guerriero-arciere-arcano-tiro-arcano": "reference",
  // La durata segue il turno della creatura colpita: non rappresentabile.
  "guerriero-cavaliere-errante-mantenere-la-posizione": "instant-reminder",
  // Batch Monaco (Fase 2).
  "monaco-via-del-kensei-cammino-del-kensei": "reference",
  // La base è gratuita: il Ki serve solo a potenziare i danni.
  "monaco-via-dell-anima-solare-esplosione-solare-incandescente": "reference",
  // Spende da 1 a 3 Ki a scelta: la card non chiede ancora il valore.
  "monaco-via-del-kensei-affilare-la-lama": "variable-cost",
  // Batch Druido (Fase 2).
  "druido-circolo-della-luna-forma-selvatica-da-combattimento": "reference",
  // Anima uno zombi: un compagno su token, usi pari alla Saggezza senza pool.
  "druido-circolo-delle-spore-infestazione-fungina": "companion-summon",
  // Batch Ranger (Fase 2): potenziamento di Sciame Riunito.
  "ranger-custode-degli-sciami-sciame-possente": "reference",
  // Batch Mago (Fase 2).
  // Reazione con TS e limite per creatura: il pool sorgente non è RAW.
  "mago-scuola-di-ammaliamento-fascino-istintivo": "instant-reminder",
  "mago-scuola-di-evocazione-evocazione-minore": "reference",
  "mago-scuola-di-illusione-illusioni-duttili": "reference",
  "mago-scuola-di-illusione-realta-illusoria": "reference",
  // Batch Bardo (Fase 2): spendono Ispirazione con effetto istantaneo, come
  // Parole Taglienti; gli usi restano sulla scheda finché manca il Carisma.
  "bardo-collegio-del-valore-ispirazione-in-combattimento": "instant-reminder",
  "bardo-collegio-dei-sussurri-lame-psichiche": "instant-reminder",
});

const DIRECT_TEST_FILES = [
  "barbarianCombatAudit.test.js",
  "barbarianFeatureRuntime.test.js",
  "bardCollegesFeatureRuntime.test.js",
  "bardEloquenceFeatureRuntime.test.js",
  "bardLoreFeatureRuntime.test.js",
  "clericDomainsFeatureRuntime.test.js",
  "clericTwilightFeatureRuntime.test.js",
  "druidFeatureRuntime.test.js",
  "fighterFeatureRuntime.test.js",
  "monkFeatureRuntime.test.js",
  "rangerFeatureRuntime.test.js",
  "wizardSchoolsFeatureRuntime.test.js",
  "warlockFeatureRuntime.test.js",
  "paladinDevotionFeatureRuntime.test.js",
  "rangerRevisedFeatureRuntime.test.js",
  "rogueArcaneTricksterFeatureRuntime.test.js",
  "sorcererWildMagicFeatureRuntime.test.js",
  "wizardEvocationFeatureRuntime.test.js",
];

const INDIRECT_TEST_FILES = [
  "classFeatureAudit.test.js",
  "classFeatureAuraController.test.js",
  "classFeatureAuraCore.test.js",
  "classFeatureAuraReminderCore.test.js",
  "classFeatureCatalog.test.js",
  "classFeatureCore.test.js",
  "classFeatureReminderCore.test.js",
  "rangerRevisedDataIntegration.test.js",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asString(value) {
  return String(value ?? "").trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(asString)
      .filter(Boolean)
  ));
}

function normalizeCompleteness(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "curated" || raw === "curata") return "curata";
  if (raw === "reference" || raw === "riferimento") return "riferimento";
  return "parziale";
}

function resolveIdentity(record, mechanic, recordsById) {
  const seen = new Set();
  let current = record;
  let classId = asString(record?.classe_id || mechanic?.source?.class_id);
  let subclassId = asString(record?.sottoclasse_id || mechanic?.source?.subclass_id);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (!classId) classId = asString(current.classe_id);
    if (!subclassId) subclassId = asString(current.sottoclasse_id);
    const parentId = asString(current.parent_id);
    current = parentId ? recordsById.get(parentId) : null;
  }
  return { classId, subclassId };
}

function levelOf(record, mechanic) {
  const levels = [
    ...(Array.isArray(record?.livelli) ? record.livelli : []),
    ...(Array.isArray(mechanic?.source?.levels) ? mechanic.source.levels : []),
    record?.livello_minimo,
  ]
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 20);
  return levels.length ? Math.min(...levels) : null;
}

function effectTypes(mechanic) {
  return uniqueStrings((Array.isArray(mechanic?.effects) ? mechanic.effects : [])
    .map((effect) => effect?.type));
}

function sourceCompleteness(mechanic) {
  return normalizeCompleteness(mechanic?.completeness?.status);
}

function sourceAutomationLevel(mechanic) {
  const raw = asString(mechanic?.automation_level).toLowerCase();
  return raw || "riferimento";
}

function hasStructuredEffects(mechanic) {
  return sourceCompleteness(mechanic) === "curata"
    && Array.isArray(mechanic?.effects)
    && mechanic.effects.length > 0
    && uniqueStrings(mechanic?.completeness?.missing_for_execution).length === 0;
}

function hasManualChoice(mechanic) {
  return Boolean(mechanic?.manual_choice_required)
    || asString(mechanic?.activation?.primary) === "varia_per_opzione"
    || (Array.isArray(mechanic?.effects) && mechanic.effects.some(
      (effect) => effect?.type === "choose_option" || effect?.type === "choice"
    ));
}

function classifyCombatFeature({ mechanic, record, identity, runtimeEntry }) {
  const level = sourceAutomationLevel(mechanic);
  const completeness = sourceCompleteness(mechanic);
  const activation = asString(mechanic?.activation?.primary) || "non_specificata";
  const effects = Array.isArray(mechanic?.effects) ? mechanic.effects : [];
  const effectTypeList = effectTypes(mechanic);
  const missingForExecution = uniqueStrings(mechanic?.completeness?.missing_for_execution);
  const resourceCosts = Array.isArray(mechanic?.resource_costs) ? mechanic.resource_costs : [];
  const structured = hasStructuredEffects(mechanic);
  const manualChoice = hasManualChoice(mechanic);
  const activeActivation = ACTIONABLE_ACTIVATIONS.has(activation);
  const combatActivation = COMBAT_ACTIVATIONS.has(activation);
  const runtimeImplemented = runtimeEntry?.runtimeSupport?.status === "implemented";
  const targetType = asString(mechanic?.targets?.type) || "non_specificato";
  const knownTarget = targetType !== "non_specificato";
  const durationType = asString(mechanic?.duration?.type) || "non_specificata";
  const knownRoundDuration = PERSISTENT_DURATION_TYPES.has(durationType)
    || (Array.isArray(mechanic?.duration?.end_conditions) && mechanic.duration.end_conditions.length > 0);
  const effectTypeSet = new Set(effectTypeList);
  const hasMarkerEffect = effectTypeList.some((type) => TOKEN_MARKER_EFFECTS.has(type));
  const resourceOnly = effects.length > 0
    && effectTypeList.every((type) => RESOURCE_ONLY_EFFECTS.has(type));
  const description = asString(record?.descrizione).toLowerCase();
  const textMarkerSignals = TEXT_MARKER_SIGNALS.filter((signal) => description.includes(signal));
  const textualMarkerCandidate = !effects.length
    && level !== "automatica"
    && combatActivation
    && (
      textMarkerSignals.length >= 2
      || textMarkerSignals.some((signal) => STRONG_TEXT_MARKER_SIGNALS.has(signal))
    );
  const blockers = [];
  const dataBlockers = [];
  let scopeExclusion = null;

  if (level === "automatica") {
    scopeExclusion = "automazione_deterministica_scartata";
  } else if (level === "riferimento") {
    scopeExclusion = "solo_riferimento";
  } else if (!activeActivation) {
    scopeExclusion = "passiva_o_contenitore";
  }

  if (completeness !== "curata") dataBlockers.push("completezza_non_curata");
  if (!effects.length) dataBlockers.push("effetti_non_strutturati");
  if (missingForExecution.length) dataBlockers.push(...missingForExecution);
  if (!knownTarget && effects.length) dataBlockers.push("bersaglio_da_specificare");
  if (!knownRoundDuration && effects.length) dataBlockers.push("durata_da_specificare");
  if (!identity.classId) dataBlockers.push("classe_non_risolta");
  if (textualMarkerCandidate) dataBlockers.push("effetti_da_estrarre_dal_testo");
  if (manualChoice) blockers.push("scelta_giocatore_o_opzione");
  if (runtimeEntry && runtimeEntry.runtimeSupport?.status !== "implemented") {
    blockers.push("adapter_runtime_mancante");
  }
  if (!runtimeEntry && (hasMarkerEffect || textualMarkerCandidate)) {
    blockers.push("non_esposta_nel_catalogo_runtime");
  }

  let mode = "tavolo";
  let rationale = "La capacità non richiede un promemoria persistente su un token durante il combattimento.";
  if (level === "automatica") {
    rationale = "Esclusa dal perimetro: le capacità dichiarate deterministiche non sono prioritarie per il tracciamento manuale su token.";
  } else if (level === "riferimento" || !activeActivation) {
    rationale = "Capacità passiva, contenitore di opzioni o voce di riferimento: resta nella gestione ordinaria al tavolo.";
  } else if (resourceOnly) {
    rationale = "È un contenitore o una trasformazione di risorse; il consumo non è un obiettivo di questo audit.";
  } else if (structured && hasMarkerEffect && (runtimeImplemented || (knownTarget && knownRoundDuration))) {
    mode = "token_marker";
    rationale = "L'attivazione applica uno stato, un'aura o un promemoria a un token e la durata/bersaglio sono sufficientemente identificabili.";
  } else if ((structured && hasMarkerEffect) || textualMarkerCandidate) {
    mode = "token_marker_review";
    rationale = "Il testo suggerisce uno stato persistente da ricordare su un token, ma bersaglio, durata o effetto devono essere curati prima di esporlo.";
  } else if (structured && effects.length) {
    mode = "instant_effect";
    rationale = "L'effetto si risolve nell'evento (danno, guarigione, tiro o consumo) e non lascia un promemoria persistente da mostrare sul token.";
  }

  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    priority: MODE_PRIORITY[mode],
    rationale,
    scopeExclusion,
    requiresDataWork: mode === "token_marker_review" || dataBlockers.length > 0,
    blockers: uniqueStrings(blockers),
    dataBlockers: uniqueStrings(dataBlockers),
    sourceAutomationLevel: level,
    completeness,
    activation,
    activeActivation,
    combatActivation,
    manualChoice,
    effectTypes: effectTypeList,
    effectCount: effects.length,
    hasMarkerEffect,
    resourceOnly,
    resourcePoolIds: uniqueStrings(resourceCosts.map((entry) => entry?.pool_id)),
    targetType,
    knownTarget,
    durationType,
    knownRoundDuration,
    textMarkerSignals,
    runtimeImplemented,
    markerEffectTypes: effectTypeList.filter((type) => TOKEN_MARKER_EFFECTS.has(type)),
    nonMarkerEffectTypes: effectTypeList.filter((type) => !TOKEN_MARKER_EFFECTS.has(type)),
    sourceEffectTypeSet: [...effectTypeSet],
  };
}

function implementedArchetype(runtimeEntry, text) {
  const adapter = asString(runtimeEntry?.runtimeSupport?.adapter);
  if (CUSTOM_ADAPTERS.has(adapter)) return "custom-adapter";
  if (adapter === "resource-only") return "resource-only";
  const plan = runtimeEntry?.effectPlan || {};
  if (adapter === "aura" || plan.kind === "aura" || runtimeEntry?.targeting?.mode === "aura") return "aura";
  if (Array.isArray(runtimeEntry?.choiceOptions)
    && runtimeEntry.choiceOptions.length
    && BACKLOG_TEXT_RULES.saveOutcome.test(text)) {
    return "save-outcome-condition";
  }
  return "timed-condition";
}

function backlogArchetype({ mechanic, record, runtimeEntry, recommendation, parentImplemented }) {
  const name = asString(record?.nome).toLowerCase();
  const text = `${name} ${asString(record?.descrizione)}`.toLowerCase();
  if (runtimeEntry?.runtimeSupport?.status === "implemented") {
    return { archetype: implementedArchetype(runtimeEntry, text), evidence: ["runtime-implemented"] };
  }
  const manualArchetype = BACKLOG_ARCHETYPE_OVERRIDES[asString(record?.id)];
  if (manualArchetype) {
    return { archetype: manualArchetype, evidence: ["decisione-manuale"] };
  }
  const activation = asString(runtimeEntry?.activation?.primary || mechanic?.activation?.primary)
    || "non_specificata";
  const effectTypeSet = new Set(effectTypes(mechanic));
  const hasAuraEffect = effectTypeSet.has("aura")
    || effectTypeSet.has("create_aura")
    || effectTypeSet.has("aura_bonus_iniziativa")
    || runtimeEntry?.targeting?.mode === "aura";
  const passive = PASSIVE_ACTIVATIONS.has(activation)
    || recommendation.scopeExclusion === "solo_riferimento";

  // Le opzioni di una capacità già implementata sono gestite dal suo adapter
  // (choiceOptions) e restano carte descrittive.
  if (parentImplemented) {
    return { archetype: "reference", evidence: ["opzione-di-capacita-implementata"] };
  }
  // Le passive restano carte descrittive; solo un'aura dichiarata nel testo o
  // negli effetti diventa un candidato attivabile (modello Aura di Protezione).
  if (passive) {
    if (hasAuraEffect || BACKLOG_TEXT_RULES.aura.test(text)) {
      return { archetype: "aura", evidence: [`attivazione:${activation}`, "aura"] };
    }
    return { archetype: "reference", evidence: [`attivazione:${activation}`] };
  }
  if (effectTypeSet.has("transform")
    || BACKLOG_TEXT_RULES.transformationName.test(name)
    || BACKLOG_TEXT_RULES.transformation.test(text)) {
    return { archetype: "transformation", evidence: ["testo:trasformazione"] };
  }
  if (BACKLOG_TEXT_RULES.companionSummon.test(text)) {
    return { archetype: "companion-summon", evidence: ["testo:compagno-evocazione"] };
  }
  if (["create_spell_slot", "restore_spell_slots"].some((type) => effectTypeSet.has(type))
    || BACKLOG_TEXT_RULES.spellBridge.test(text)) {
    return { archetype: "spell-bridge", evidence: ["testo:incantesimo-slot"] };
  }
  if (hasAuraEffect || BACKLOG_TEXT_RULES.aura.test(text)) {
    return { archetype: "aura", evidence: ["aura"] };
  }
  if (effectTypeSet.has("healing")
    || effectTypeSet.has("temporary_hp")
    || BACKLOG_TEXT_RULES.hpChange.test(text)) {
    return { archetype: "hp-change", evidence: ["testo:punti-ferita"] };
  }
  if (recommendation.resourceOnly) {
    return { archetype: "resource-only", evidence: ["effetti:solo-risorse"] };
  }
  if (BACKLOG_TEXT_RULES.saveOutcome.test(text)) {
    return { archetype: "save-outcome-condition", evidence: ["testo:tiro-salvezza-condizione"] };
  }
  if (recommendation.mode === "token_marker"
    || runtimeEntry?.trackingMode === "active"
    || BACKLOG_TEXT_RULES.timed.test(text)) {
    return { archetype: "timed-condition", evidence: [`mode:${recommendation.mode}`] };
  }
  if (BACKLOG_TEXT_RULES.movement.test(text)) {
    return { archetype: "movement", evidence: ["testo:movimento"] };
  }
  const costs = runtimeEntry?.resourceCosts || mechanic?.resource_costs || [];
  if (Array.isArray(costs) && costs.length) {
    return { archetype: "resource-only", evidence: ["costo-senza-effetto-persistente"] };
  }
  return { archetype: "instant-reminder", evidence: [`attivazione:${activation}`] };
}

function classifyBacklog({
  mechanic,
  record,
  runtimeEntry,
  recommendation,
  poolById,
  parentImplemented = false,
}) {
  const { archetype, evidence } = backlogArchetype({
    mechanic,
    record,
    runtimeEntry,
    recommendation,
    parentImplemented,
  });
  const implemented = runtimeEntry?.runtimeSupport?.status === "implemented";
  const requiredPrimitive = archetype === "custom-adapter"
    ? "custom-adapter"
    : BACKLOG_ARCHETYPES[archetype].primitive;
  const costPoolIds = uniqueStrings([
    ...(runtimeEntry?.resourceCosts || []).map((cost) => cost?.poolId),
    ...(Array.isArray(mechanic?.resource_costs) ? mechanic.resource_costs : [])
      .map((cost) => cost?.pool_id || cost?.poolId),
  ]);
  const abilityModifierPools = costPoolIds.filter((poolId) =>
    /modificatore_/u.test(asString(poolById.get(poolId)?.capacity?.expression))
  );
  return {
    archetype,
    archetypeLabel: BACKLOG_ARCHETYPES[archetype].label,
    requiredPrimitive,
    dataOnlyCandidate: !implemented && BACKLOG_PRIMITIVES[requiredPrimitive].available,
    archetypeEvidence: uniqueStrings([
      ...evidence,
      ...(runtimeEntry ? [] : ["richiede-include"]),
      ...abilityModifierPools.map((poolId) => `pool-modificatore:${poolId}`),
    ]),
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) increment(counts, selector(item));
  return counts;
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0], "it")
  ));
}

function featureLabel(feature) {
  return `${feature.name} (${feature.id})`;
}

function markdownTable(rows) {
  return [
    "| Categoria | Record |",
    "|---|---:|",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join("\n");
}

// Load sources and runtime
const loaded = SOURCE_CONFIGS.map((source) => ({
  ...source,
  catalogData: readJson(path.join(SOURCE_DIR, source.catalog)),
  mechanicData: readJson(path.join(SOURCE_DIR, source.mechanics)),
}));
const runtime = readJson(RUNTIME_CATALOG_PATH);
const runtimeById = new Map((Array.isArray(runtime.features) ? runtime.features : [])
  .map((feature) => [feature.id, feature]));
const classMap = new Map((Array.isArray(runtime.classes) ? runtime.classes : [])
  .map((c) => [c.id, c.name]));
const subclassMap = new Map((Array.isArray(runtime.subclasses) ? runtime.subclasses : [])
  .map((s) => [s.id, s.name]));
const resourcePoolMap = new Map((Array.isArray(runtime.resourcePools) ? runtime.resourcePools : [])
  .map((p) => [p.id, p]));

// Test file contents for direct / indirect checks
const directTestContents = DIRECT_TEST_FILES.map((tf) => {
  const filePath = path.join(TEST_DIR, tf);
  return { file: tf, content: fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "" };
});
const indirectTestContents = INDIRECT_TEST_FILES.map((tf) => {
  const filePath = path.join(TEST_DIR, tf);
  return { file: tf, content: fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "" };
});

const recordsById = new Map();
const recordSourceById = new Map();
const mechanicById = new Map();
for (const source of loaded) {
  for (const collection of ["privilegi", "opzioni"]) {
    for (const record of Array.isArray(source.catalogData?.[collection])
      ? source.catalogData[collection]
      : []) {
      const id = asString(record?.id);
      if (!id) continue;
      if (recordsById.has(id)) throw new Error(`ID catalogo duplicato: ${id}`);
      recordsById.set(id, record);
      recordSourceById.set(id, { source: source.id, collection });
    }
  }
  for (const mechanic of Array.isArray(source.mechanicData?.mechanics)
    ? source.mechanicData.mechanics
    : []) {
    const id = asString(mechanic?.id);
    if (!id) continue;
    if (mechanicById.has(id)) throw new Error(`ID meccanico duplicato: ${id}`);
    mechanicById.set(id, { mechanic, source });
  }
}

const reconciledSummary = {
  totalRecords: 860,
  runtimeExposedCount: 0,
  runtimeNotExposedCount: 0,
  currentAutomation: { FULL: 0, PARTIAL: 0, TRACK_ONLY: 0, MANUAL: 0, NONE: 0 },
  targetAutomation: { FULL: 0, PARTIAL: 0, TRACK_ONLY: 0, MANUAL: 0, UNREVIEWED: 0 },
  coverageStatus: { ACCEPTED: 0, GAP: 0, UNREVIEWED: 0 },
  testCoverageStatus: { DIRECT: 0, INDIRECT: 0, NONE: 0 },
  functionalGapCount: 0,
  testGapCount: 0,
  sourceConflictCount: 0,
  catalogGapCount: 0,
  customCodeCount: 0,
  persistentLifecycleCount: 0,
  resourcePoolCount: Array.isArray(runtime.resourcePools) ? runtime.resourcePools.length : 0,
};

const features = [];
for (const [id, record] of recordsById) {
  const mechanicEntry = mechanicById.get(id);
  if (!mechanicEntry) throw new Error(`Record meccanico mancante: ${id}`);
  const { mechanic, source } = mechanicEntry;
  const identity = resolveIdentity(record, mechanic, recordsById);
  const runtimeEntry = runtimeById.get(id) || null;
  const recommendation = classifyCombatFeature({ mechanic, record, identity, runtimeEntry });
  const backlog = classifyBacklog({
    mechanic,
    record,
    runtimeEntry,
    recommendation,
    poolById: resourcePoolMap,
    parentImplemented: runtimeById.get(
      asString(record?.parent_id || mechanic?.source?.parent_id)
    )?.runtimeSupport?.status === "implemented",
  });
  const catalogSource = recordSourceById.get(id) || {};
  const className = classMap.get(identity.classId) || identity.classId || "";
  const subclassName = subclassMap.get(identity.subclassId) || identity.subclassId || null;
  const featureName = asString(record?.nome || mechanic?.source?.name || id);

  const catalogStatus = "CATALOGED";
  const runtimeExposed = Boolean(runtimeEntry);
  if (runtimeExposed) reconciledSummary.runtimeExposedCount++;
  else reconciledSummary.runtimeNotExposedCount++;

  // Test coverage
  const directTests = directTestContents.filter((t) => t.content.includes(id)).map((t) => t.file);
  const indirectTests = indirectTestContents.filter((t) => t.content.includes(id)).map((t) => t.file);
  let testCoverageStatus = "NONE";
  if (directTests.length > 0) testCoverageStatus = "DIRECT";
  else if (indirectTests.length > 0) testCoverageStatus = "INDIRECT";
  reconciledSummary.testCoverageStatus[testCoverageStatus]++;

  const hasDirectTest = directTests.length > 0;
  const hasIndirectTest = indirectTests.length > 0;

  // Custom code & adapter
  const adapter = runtimeEntry?.runtimeSupport?.adapter || null;
  const usesCustomCode = CUSTOM_ADAPTERS.has(adapter)
    || (adapter === "condition" && ["barbaro-cammino-del-berserker-frenesia", "barbaro-ira"].includes(id));
  if (usesCustomCode) reconciledSummary.customCodeCount++;

  // Execution path
  const executionPath = [];
  if (runtimeEntry?.runtimeSupport?.status === "implemented") {
    if (usesCustomCode) executionPath.push("CUSTOM_CODE");
    if (adapter === "aura") executionPath.push("AURA");
    if (adapter === "condition" || adapter === "condition-choice") executionPath.push("EFFECTS_MUTATION");
    if (adapter === "resource-only") executionPath.push("RESOURCE_ONLY");
    if (adapter === "spell-thief" || adapter === "purifying-touch") executionPath.push("SPELL_ADAPTER");
    if (executionPath.length === 0) executionPath.push("GENERIC");
  } else if (recommendation.activation === "passiva") {
    executionPath.push("PASSIVE");
  } else if (runtimeExposed) {
    executionPath.push("REMINDER");
  } else {
    executionPath.push("NONE");
  }

  // Current automation level
  let currentAutomationLevel = "NONE";
  if (runtimeEntry?.runtimeSupport?.status === "implemented") {
    if (adapter === "resource-only") {
      currentAutomationLevel = "TRACK_ONLY";
    } else if ([
      "barbaro-ira",
      "bardo-ispirazione-bardica",
      "barbaro-attacco-irruento",
      "barbaro-cammino-del-berserker-frenesia",
      "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
      "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo",
      "stregone-fonte-di-magia",
      "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
    ].includes(id)) {
      currentAutomationLevel = "FULL";
    } else {
      currentAutomationLevel = "PARTIAL";
    }
  } else if (runtimeExposed) {
    if (recommendation.resourceOnly || (runtimeEntry?.resourceCosts && runtimeEntry.resourceCosts.length > 0)) {
      currentAutomationLevel = "TRACK_ONLY";
    } else {
      currentAutomationLevel = "MANUAL";
    }
  } else {
    currentAutomationLevel = recommendation.sourceAutomationLevel === "riferimento" ? "MANUAL" : "NONE";
  }
  reconciledSummary.currentAutomation[currentAutomationLevel]++;

  // Target automation level
  let targetAutomationLevel = "UNREVIEWED";
  const srcAuto = recommendation.sourceAutomationLevel;
  const recMode = recommendation.mode;
  const completeness = recommendation.completeness;

  if (recMode === "token_marker" || srcAuto === "automatica" || [
    "barbaro-ira", "bardo-ispirazione-bardica", "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
    "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo", "stregone-fonte-di-magia",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
  ].includes(id)) {
    targetAutomationLevel = "FULL";
  } else if (recMode === "token_marker_review" || srcAuto === "assistita" || completeness === "curata" || [
    "chierico-dominio-della-vita-incanalare-divinita-preservare-vita",
    "guerriero-recuperare-energie",
  ].includes(id)) {
    targetAutomationLevel = "PARTIAL";
  } else if (srcAuto === "tracciamento" || recommendation.resourceOnly) {
    targetAutomationLevel = "TRACK_ONLY";
  } else if (recMode === "tavolo" || srcAuto === "riferimento" || recommendation.activation === "passiva" || id === "ladro-assassino-assassinare") {
    targetAutomationLevel = "MANUAL";
  }
  reconciledSummary.targetAutomation[targetAutomationLevel]++;

  // Current UI exposure
  let currentUiExposure = "NONE";
  if (runtimeExposed) {
    currentUiExposure = (runtimeEntry.defaultEnabled || runtimeEntry.quickActionEligible) ? "PANEL" : "PANEL";
  } else {
    currentUiExposure = "HIDDEN";
  }

  // Activation type
  const rawAct = (runtimeEntry?.activation?.primary || recommendation.activation || "").toLowerCase();
  let activationType = "UNKNOWN";
  if (rawAct.includes("bonus")) activationType = "BONUS_ACTION";
  else if (rawAct.includes("reazione")) activationType = "REACTION";
  else if (rawAct.includes("azione_attacco")) activationType = "ACTION";
  else if (rawAct === "azione") activationType = "ACTION";
  else if (rawAct.includes("passiva")) activationType = "PASSIVE";
  else if (rawAct.includes("inizio_primo_turno") || rawAct.includes("turno")) activationType = "ON_TURN_START";
  else if (rawAct.includes("fine_turno")) activationType = "ON_TURN_END";
  else if (rawAct.includes("nessuna_azione") || rawAct.includes("innesco")) activationType = "FREE";
  else if (rawAct.includes("ingresso_in_ira")) activationType = "BONUS_ACTION";
  else if (rawAct) activationType = "OTHER";

  // Targeting mode
  const rawTgt = runtimeEntry?.targeting?.mode || recommendation.targetType || "";
  let targetingMode = "UNKNOWN";
  if (rawTgt === "self") targetingMode = "SELF";
  else if (rawTgt === "single-target" || rawTgt === "bersaglio_singolo") targetingMode = "SINGLE_TARGET";
  else if (rawTgt === "aura") targetingMode = "AURA";
  else if (rawTgt === "area") targetingMode = "AREA";
  else if (rawTgt === "non_specificato") targetingMode = "NO_TARGET";
  else if (rawTgt) targetingMode = "MANUAL";

  // Duration mode & persistent category
  const rawDur = runtimeEntry?.duration || recommendation.durationType || "";
  let durationMode = "NONE";
  let hasCleanup = false;
  let persistentCategory = null;

  if (typeof rawDur === "object" && rawDur !== null) {
    if (adapter === "aura" || targetingMode === "AURA") {
      durationMode = "PERSISTENT";
      persistentCategory = "SPATIAL_AURA";
      hasCleanup = true;
    } else if (rawDur.rounds && Number(rawDur.rounds) > 0) {
      durationMode = "ROUND_BASED";
      persistentCategory = "ROUND_STATE";
      hasCleanup = true;
    } else if (rawDur.timing && rawDur.timing.includes("turn")) {
      durationMode = "UNTIL_TURN";
      persistentCategory = "TURN_BOUND_STATE";
      hasCleanup = true;
    } else if (rawDur.untilFeatureId) {
      durationMode = "TOGGLE";
      persistentCategory = "TOGGLE_STATE";
      hasCleanup = true;
    } else if (rawDur.endConditions && rawDur.endConditions.length > 0) {
      durationMode = "PERSISTENT";
      persistentCategory = "PERSISTENT_EFFECT";
      hasCleanup = true;
    }
  } else if (typeof rawDur === "string") {
    if (rawDur.includes("round") || rawDur === "fixed") durationMode = "ROUND_BASED";
    else if (rawDur.includes("turno")) durationMode = "UNTIL_TURN";
    else if (rawDur.includes("riposo")) durationMode = "UNTIL_REST";
    else if (rawDur.includes("istantaneo")) durationMode = "INSTANT";
  }

  if (persistentCategory) reconciledSummary.persistentLifecycleCount++;

  // Resource model
  let resourceModel = "NONE";
  const costs = runtimeEntry?.resourceCosts || [];
  if (costs.length > 0) {
    const pool = resourcePoolMap.get(costs[0].poolId);
    if (pool?.capacity?.type === "points" || pool?.id?.includes("punti")) {
      resourceModel = "POINT_POOL";
    } else if (pool?.die || pool?.id?.includes("dadi") || pool?.id?.includes("ispirazione")) {
      resourceModel = "DICE_POOL";
    } else if (pool?.refresh?.[0]?.event === "riposo_breve") {
      resourceModel = "SHORT_REST";
    } else if (pool?.refresh?.[0]?.event === "riposo_lungo") {
      resourceModel = "LONG_REST";
    } else {
      resourceModel = "USES";
    }
  }

  // Source conflicts
  let sourceConflict = false;
  let sourceConflictDetails = null;

  if (id === "chierico-dominio-della-vita-incanalare-divinita-preservare-vita") {
    sourceConflict = true;
    sourceConflictDetails = {
      sourceA: "DB PHB2014 & feature-matrix.sample.json §322: 'assisted multi-target HP allocation'",
      sourceB: "Runtime catalog: status='not-automated', reason='adapter-not-implemented'",
      runtimeTruth: "Capacità esposta nella card e associata al pool, ma priva di adapter per erogare cura sui target",
      intendedDecision: "targetAutomationLevel: PARTIAL (richiede adapter per ripartizione punti su selezione bersagli)",
      reconciliationRecommendation: "Pianificare in CF-B03 con primitive RES.ALLOCATION / HP.ASSISTED_CANONICAL",
    };
  } else if (id === "guerriero-recuperare-energie") {
    sourceConflict = true;
    sourceConflictDetails = {
      sourceA: "DB PHB2014 & feature-matrix.sample.json §718: 'assisted review + explicit healing input + canonical HP mutation'",
      sourceB: "Runtime catalog: status='not-automated', reason='adapter-not-implemented'",
      runtimeTruth: "Pool 1d10+livello registrato e visibile, ma nessuna erogazione diretta di cura Quick HP",
      intendedDecision: "targetAutomationLevel: PARTIAL (richiede Quick HP adapter con modal review/valore)",
      reconciliationRecommendation: "Pianificare in CF-B02 con primitive UI.VALUE_INPUT / HP.ASSISTED_CANONICAL",
    };
  } else if (id === "ladro-assassino-assassinare") {
    sourceConflict = true;
    sourceConflictDetails = {
      sourceA: "DB PHB2014: activation='passiva', completeness='riferimento'",
      sourceB: "Runtime catalog: esposta dalla Fase 1 con include:true e automationLevel riferimento, feature-matrix §762: 'descriptive surprise reminder'",
      runtimeTruth: "Carta descrittiva nella scheda Capacità, senza adapter",
      intendedDecision: "targetAutomationLevel: MANUAL (reminder passivo descrittivo al tavolo, non automatizzabile)",
      reconciliationRecommendation: "Mantenere target MANUAL come carta descrittiva",
    };
  }

  if (sourceConflict) reconciledSummary.sourceConflictCount++;

  // Coverage status
  let coverageStatus = "UNREVIEWED";
  let gapCategory = null;
  let severity = null;

  if (targetAutomationLevel === "UNREVIEWED") {
    coverageStatus = "UNREVIEWED";
  } else if (
    (targetAutomationLevel === "FULL" && currentAutomationLevel === "FULL")
    || (targetAutomationLevel === "PARTIAL" && (currentAutomationLevel === "PARTIAL" || currentAutomationLevel === "FULL"))
    || (targetAutomationLevel === "TRACK_ONLY" && (currentAutomationLevel === "TRACK_ONLY" || currentAutomationLevel === "PARTIAL" || currentAutomationLevel === "FULL"))
    || (targetAutomationLevel === "MANUAL" && (currentAutomationLevel === "MANUAL" || currentAutomationLevel === "NONE"))
  ) {
    coverageStatus = "ACCEPTED";
  } else {
    coverageStatus = "GAP";
    severity = "P2";
    if (id === "chierico-dominio-della-vita-incanalare-divinita-preservare-vita" || id === "guerriero-recuperare-energie") {
      gapCategory = "EXECUTION_GAP";
    } else if (targetAutomationLevel === "PARTIAL" || targetAutomationLevel === "FULL") {
      gapCategory = "EXECUTION_GAP";
    } else if (targetAutomationLevel === "TRACK_ONLY") {
      gapCategory = "RESOURCE_GAP";
    } else {
      gapCategory = "OTHER";
    }
  }
  reconciledSummary.coverageStatus[coverageStatus]++;
  if (coverageStatus === "GAP") reconciledSummary.functionalGapCount++;

  // Test gap
  let testGap = false;
  if ((currentAutomationLevel === "FULL" || currentAutomationLevel === "PARTIAL") && testCoverageStatus === "NONE") {
    testGap = true;
    reconciledSummary.testGapCount++;
  }

  const evidence = {
    catalog: [source.label, `Pagina ${record?.pagina || mechanic?.source?.page || "N/D"}`],
    runtime: runtimeEntry ? [`src/class-features-runtime.json (status: ${runtimeEntry.runtimeSupport?.status})`] : ["Non presente nel catalogo runtime"],
    ui: runtimeExposed ? ["initiativeCardModal (Scheda Capacità)", "trackerQuickActions"] : ["Non esposta nella UI"],
    tests: [...directTests, ...indirectTests].map((t) => `test/${t}`),
  };

  const notes = [];
  if (usesCustomCode) notes.push(`Utilizza adapter dedicato: ${adapter}`);
  if (runtimeEntry?.breaksConcentration) notes.push("Interrompe la concentrazione all'attivazione");
  if (runtimeEntry?.autoActivateFeatureIds) notes.push(`Attiva automaticamente: ${runtimeEntry.autoActivateFeatureIds.join(", ")}`);
  if (sourceConflict) notes.push(`SOURCE_CONFLICT: ${sourceConflictDetails.intendedDecision}`);
  if (testGap) notes.push("TEST_GAP: Feature implementata ma priva di direct test");

  features.push({
    id,
    featureId: id,
    featureName,
    name: featureName,
    source: source.id,
    sourceLabel: source.label,
    collection: catalogSource.collection || "privilegi",
    classId: identity.classId || null,
    className,
    subclassId: identity.subclassId || null,
    subclassName,
    minimumLevel: levelOf(record, mechanic),
    page: Number(record?.pagina || mechanic?.source?.page || mechanic?.source?.pagina) || null,
    recommendation,
    ...backlog,
    runtime: {
      exposed: Boolean(runtimeEntry),
      status: runtimeEntry?.runtimeSupport?.status || null,
      adapter: runtimeEntry?.runtimeSupport?.adapter || null,
    },
    sourceData: {
      completenessMissing: uniqueStrings(mechanic?.completeness?.missing_for_execution),
      runtimeRequirements: uniqueStrings(mechanic?.runtime_requirements),
      manualChoiceRequired: Boolean(mechanic?.manual_choice_required),
      activationAlternatives: uniqueStrings(mechanic?.activation?.alternatives),
      targetRequirements: uniqueStrings(mechanic?.targets?.requirements),
      effectTags: uniqueStrings(mechanic?.effect_tags || mechanic?.mechanical_tags),
    },
    catalogStatus,
    runtimeExposed,
    currentAutomationLevel,
    targetAutomationLevel,
    coverageStatus,
    testCoverageStatus,
    testGap,
    sourceConflict,
    sourceConflictDetails,
    currentUiExposure,
    executionPath,
    resourceModel,
    activationType,
    targetingMode,
    durationMode,
    persistentCategory,
    usesCustomCode,
    hasCleanup,
    hasDirectTest,
    gapCategory,
    severity,
    evidence,
    notes,
  });
}

features.sort((left, right) =>
  left.source.localeCompare(right.source)
  || (left.classId || "").localeCompare(right.classId || "")
  || (left.minimumLevel || 99) - (right.minimumLevel || 99)
  || left.name.localeCompare(right.name, "it")
);

const modeCounts = countBy(features, (feature) => feature.recommendation.mode);
const sourceCounts = countBy(features, (feature) => feature.source);
const runtimeStatusCounts = countBy(features, (feature) => feature.runtime.status || "non_esposta");
const sourceLevelCounts = countBy(features, (feature) => feature.recommendation.sourceAutomationLevel);
const completenessCounts = countBy(features, (feature) => feature.recommendation.completeness);
const blockerCounts = {};
const dataBlockerCounts = {};
const markerEffectCounts = {};
for (const feature of features) {
  for (const blocker of feature.recommendation.blockers) increment(blockerCounts, blocker);
  for (const blocker of feature.recommendation.dataBlockers) increment(dataBlockerCounts, blocker);
  for (const effectType of feature.recommendation.markerEffectTypes) increment(markerEffectCounts, effectType);
}

const tokenMarkerCandidates = features.filter((feature) =>
  feature.recommendation.mode === "token_marker"
);
const tokenMarkerReview = features.filter((feature) =>
  feature.recommendation.mode === "token_marker_review"
);
const textualMarkerReview = tokenMarkerReview.filter((feature) =>
  feature.recommendation.effectCount === 0
);
const structuredMarkerReview = tokenMarkerReview.filter((feature) =>
  feature.recommendation.effectCount > 0
);
const instantEffects = features.filter((feature) =>
  feature.recommendation.mode === "instant_effect"
);
const runtimeGaps = tokenMarkerCandidates.filter((feature) => !feature.runtime.exposed);

const resourcePools = (Array.isArray(runtime.resourcePools) ? runtime.resourcePools : []).map((p) => {
  const linkedFeats = (Array.isArray(runtime.features) ? runtime.features : [])
    .filter((f) => (f.resourceCosts || []).some((c) => c.poolId === p.id))
    .map((f) => f.id);
  const capModel = p.capacity?.type || (p.die ? "die_pool" : (p.id.includes("punti") ? "points" : "fixed"));
  const maxRule = p.maximumByClassLevel ? "class_level_table" : (p.capacity?.value ? `fixed:${p.capacity.value}` : "default");
  const refreshRule = (p.refresh || []).map((r) => `${r.event}:${r.amount}`).join(", ") || "manuale";
  return {
    resourceId: p.id,
    name: p.name,
    classId: p.capacity?.class_id || p.id.split("-")[0],
    featureIds: linkedFeats,
    capacityModel: capModel,
    maximumRule: maxRule,
    refreshResetRule: refreshRule,
    runtimeReadable: true,
    runtimeWritable: true,
    consumptionPath: linkedFeats.length > 0 ? "activateClassFeature (resourceCosts) / initiativeCardModal" : "initiativeCardModal (manual)",
    resetPath: "resetClassFeatureResources / initiativeCardModal",
    uiExposure: "initiativeCardClassic / initiativeCardModal",
    testCoverage: "INDIRECT",
    classification: linkedFeats.length > 0 ? "CONNECTED" : "UNREVIEWED",
  };
});

const openFeatures = features.filter((feature) => feature.runtime.status !== "implemented");
const backlogPrimitives = Object.fromEntries(Object.entries(BACKLOG_PRIMITIVES)
  .map(([id, primitive]) => [id, {
    label: primitive.label,
    available: primitive.available,
    implemented: features.filter((feature) =>
      feature.requiredPrimitive === id && feature.runtime.status === "implemented"
    ).length,
    open: openFeatures.filter((feature) => feature.requiredPrimitive === id).length,
  }]));
const backlogArchetypes = Object.fromEntries(Object.entries(BACKLOG_ARCHETYPES)
  .map(([id, archetype]) => [id, {
    label: archetype.label,
    primitive: archetype.primitive,
    implemented: features.filter((feature) =>
      feature.archetype === id && feature.runtime.status === "implemented"
    ).length,
    open: openFeatures.filter((feature) => feature.archetype === id).length,
  }]));
const backlogByClass = {};
for (const feature of features) {
  const classId = feature.classId || "non_risolta";
  const entry = backlogByClass[classId] ||= {
    className: feature.className || classId,
    implemented: 0,
    dataOnlyReference: 0,
    dataOnlyAutomation: 0,
    needsPrimitive: 0,
    needsPrimitiveByPrimitive: {},
  };
  if (feature.runtime.status === "implemented") entry.implemented++;
  else if (feature.dataOnlyCandidate && feature.requiredPrimitive === "reference-only") {
    entry.dataOnlyReference++;
  } else if (feature.dataOnlyCandidate) entry.dataOnlyAutomation++;
  else {
    entry.needsPrimitive++;
    increment(entry.needsPrimitiveByPrimitive, feature.requiredPrimitive);
  }
}
const backlog = {
  primitives: backlogPrimitives,
  archetypes: backlogArchetypes,
  dataOnlyCandidateCount: openFeatures.filter((feature) => feature.dataOnlyCandidate).length,
  dataOnlyAutomationCount: openFeatures.filter((feature) =>
    feature.dataOnlyCandidate && feature.requiredPrimitive !== "reference-only"
  ).length,
  needsPrimitiveCount: openFeatures.filter((feature) => !feature.dataOnlyCandidate).length,
  manualDecisionCount: Object.keys(BACKLOG_ARCHETYPE_OVERRIDES).length,
  byClass: Object.fromEntries(Object.entries(backlogByClass)
    .sort(([left], [right]) => left.localeCompare(right, "it"))),
};

const report = {
  version: 3,
  generatedAt: "2026-10-14",
  scope: {
    sources: SOURCE_CONFIGS.map(({ id, label, catalog, mechanics }) => ({
      id,
      label,
      catalog,
      mechanics,
      records: sourceCounts[id] || 0,
    })),
    totalMechanics: features.length,
    runtimeCatalogRecords: runtime.features?.length || 0,
    runtimeImplemented: (runtime.features || [])
      .filter((feature) => feature?.runtimeSupport?.status === "implemented").length,
  },
  criteria: {
    token_marker: "La capacità viene usata su un token e lascia uno stato/promemoria visibile per la durata dello scontro o finché non viene consumata.",
    token_marker_review: "Il testo suggerisce un marker su uno o più token, ma il catalogo non specifica ancora in modo affidabile bersaglio, durata o effetto.",
    instant_effect: "L'effetto si risolve nell'evento; non serve una pill persistente sul token.",
    tavolo: "Capacità passive, riferimenti, contenitori di risorse o comportamenti che non producono uno stato combattivo da ricordare.",
    resourceRule: "Le risorse non sono un criterio di priorità: vengono conservate nei metadati solo per documentazione futura.",
    deterministicRule: "Le tre candidate deterministiche individuate nell'audit precedente sono escluse da questa roadmap.",
    safetyRule: "Nessun marker viene promosso a runtime finché bersaglio e durata non sono espliciti o coperti da un adapter già verificato.",
    backlogRule: "archetype e requiredPrimitive sono euristiche da confermare nel batch di classe; dataOnlyCandidate è vero quando la primitiva richiesta esiste già e basta un override.",
  },
  summary: {
    byCombatTracking: sortedCounts(modeCounts),
    bySource: sortedCounts(sourceCounts),
    bySourceAutomationLevel: sortedCounts(sourceLevelCounts),
    byCompleteness: sortedCounts(completenessCounts),
    byRuntimeStatus: sortedCounts(runtimeStatusCounts),
    blockerCounts: sortedCounts(blockerCounts),
    dataBlockerCounts: sortedCounts(dataBlockerCounts),
    markerEffectCounts: sortedCounts(markerEffectCounts),
    tokenMarkerCandidateCount: tokenMarkerCandidates.length,
    tokenMarkerReviewCount: tokenMarkerReview.length,
    structuredMarkerReviewCount: structuredMarkerReview.length,
    textualMarkerReviewCount: textualMarkerReview.length,
    instantEffectCount: instantEffects.length,
    tokenMarkerRuntimeGapCount: runtimeGaps.length,
    deterministicExcludedCount: features.filter((feature) =>
      feature.recommendation.sourceAutomationLevel === "automatica"
      && feature.recommendation.activeActivation
    ).length,
    resourceCriterionIgnored: true,
    byArchetype: sortedCounts(countBy(features, (feature) => feature.archetype)),
  },
  backlog,
  reconciledSummary,
  resourcePools,
  roadmap: [
    {
      phase: 1,
      label: "Marker token ad alta confidenza",
      count: tokenMarkerCandidates.length,
      candidates: tokenMarkerCandidates.map(featureLabel),
    },
    {
      phase: 2,
      label: "Curare i marker suggeriti dal testo o da effetti incompleti",
      count: tokenMarkerReview.length,
      candidates: tokenMarkerReview.map(featureLabel),
    },
    {
      phase: 3,
      label: "Lasciare gli effetti istantanei alla risoluzione manuale",
      count: instantEffects.length,
      candidates: instantEffects.map(featureLabel),
    },
    {
      phase: 4,
      label: "Escludere passive, riferimenti e soli contenitori di risorse",
      count: features.filter((feature) => feature.recommendation.mode === "tavolo").length,
      candidates: [],
    },
  ],
  features,
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const modeRows = Object.entries(MODE_LABELS)
  .map(([mode, label]) => [label, modeCounts[mode] || 0]);
const sourceRows = SOURCE_CONFIGS.map((source) => [source.label, sourceCounts[source.id] || 0]);
const runtimeRows = Object.entries(runtimeStatusCounts)
  .map(([status, count]) => [status, count]);
const markerCandidateRows = tokenMarkerCandidates.map((feature) => [feature.name, feature.id]);

const markdown = `# Audit capacità di classe\n\n` +
  `Report generato il ${report.generatedAt} dai tre overlay meccanici locali.\n\n` +
  `## Perimetro\n\n` +
  `Il catalogo contiene **${features.length} record**. Il catalogo runtime attuale ne espone ` +
  `**${report.scope.runtimeCatalogRecords}**. Le risorse non sono un obiettivo di questo audit.\n\n` +
  markdownTable(sourceRows) + `\n\n` +
  `## Esito per il combattimento\n\n` +
  markdownTable(modeRows) + `\n\n` +
  `- Marker ad alta confidenza: **${report.summary.tokenMarkerCandidateCount}**.\n` +
  `- Marker da curare prima dell'esposizione: **${report.summary.tokenMarkerReviewCount}** ` +
  `(strutturati: ${report.summary.structuredMarkerReviewCount}, testuali: ${report.summary.textualMarkerReviewCount}).\n` +
  `- Effetti istantanei senza pill persistente: **${report.summary.instantEffectCount}**.\n` +
  `- Risorse escluse come criterio: **sì**.\n\n` +
  `## Marker ad alta confidenza\n\n` +
  markdownTable(markerCandidateRows) + `\n\n` +
  `## Regole dell'audit\n\n` +
  `- **Marker token**: la capacità viene applicata a un token e resta da ricordare per round, durata o consumo.\n` +
  `- **Marker da curare**: il testo indica un possibile stato persistente, ma bersaglio/durata/effetto non sono ancora abbastanza espliciti.\n` +
  `- **Effetto istantaneo**: danno, guarigione, tiro o consumo che non richiede una pill persistente.\n` +
  `- Le tre candidate deterministiche dell'audit precedente sono escluse da questa roadmap.\n` +
  `- Nessun marker viene promosso senza bersaglio e durata espliciti, salvo adapter già verificato.\n\n` +
  `## Roadmap\n\n` +
  report.roadmap.map((phase) => `### ${phase.phase}. ${phase.label} (${phase.count})\n`).join("\n") +
  `\nIl dettaglio per ogni record, inclusi segnali testuali, effetti marker, bersaglio, durata e stato runtime, ` +
  `è disponibile in [class-feature-automation-audit.json](../data/class-features/class-feature-automation-audit.json).\n\n` +
  `## Stato runtime\n\n` +
  markdownTable(runtimeRows) + `\n\n` +
  `## Backlog per primitiva\n\n` +
  `Capacità non implementate: **${openFeatures.length}**. Raggiungibili con soli override: ` +
  `**${backlog.dataOnlyCandidateCount}** (di cui automazione: **${backlog.dataOnlyAutomationCount}**, ` +
  `il resto carte descrittive). Bloccate da una primitiva mancante: **${backlog.needsPrimitiveCount}**. ` +
  `Archetipo e primitiva sono euristiche da confermare nel batch; le decisioni manuali confermate sono ` +
  `${backlog.manualDecisionCount}.\n\n` +
  `| Primitiva | Disponibile | Implementate | Da fare |\n` +
  `|---|---|---:|---:|\n` +
  Object.entries(backlog.primitives)
    .map(([id, entry]) => `| ${entry.label} (\`${id}\`) | ${entry.available ? "sì" : "no"} | ${entry.implemented} | ${entry.open} |`)
    .join("\n") + `\n\n` +
  `| Archetipo | Primitiva | Implementate | Da fare |\n` +
  `|---|---|---:|---:|\n` +
  Object.entries(backlog.archetypes)
    .map(([id, entry]) => `| ${entry.label} (\`${id}\`) | \`${entry.primitive}\` | ${entry.implemented} | ${entry.open} |`)
    .join("\n") + `\n\n` +
  `## Backlog per classe\n\n` +
  `| Classe | Implementate | Carte descrittive | Automazione con dati | Richiede primitiva | Primitive mancanti |\n` +
  `|---|---:|---:|---:|---:|---|\n` +
  Object.values(backlog.byClass)
    .map((entry) => `| ${entry.className} | ${entry.implemented} | ${entry.dataOnlyReference} | ` +
      `${entry.dataOnlyAutomation} | ${entry.needsPrimitive} | ` +
      (Object.entries(sortedCounts(entry.needsPrimitiveByPrimitive))
        .map(([primitive, count]) => `${primitive} ${count}`)
        .join(", ") || "—") + ` |`)
    .join("\n") + `\n`;

fs.writeFileSync(MARKDOWN_PATH, markdown, "utf8");
console.log(JSON.stringify({
  report: path.relative(ROOT_DIR, REPORT_PATH),
  markdown: path.relative(ROOT_DIR, MARKDOWN_PATH),
  totalMechanics: features.length,
  runtimeCatalogRecords: report.scope.runtimeCatalogRecords,
  byCombatTracking: report.summary.byCombatTracking,
  tokenMarkerCandidates: report.summary.tokenMarkerCandidateCount,
  tokenMarkerReview: report.summary.tokenMarkerReviewCount,
  tokenMarkerRuntimeGaps: report.summary.tokenMarkerRuntimeGapCount,
}));

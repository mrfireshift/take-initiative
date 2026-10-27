import OBR from "@owlbear-rodeo/sdk";
import {
  ID,
  TRACKER_PANEL_REQUEST_CHANNEL,
} from "./constants.js";
import {
  SAVE_KEYS,
  getInitiativeCard,
  loadInitiativeCard,
  hasInitiativeCardValues,
  saveInitiativeCard,
} from "./initiativeCards.js";
import {
  APPLICABLE_CONDITION_LIST,
  formatConditionName,
} from "./conditions.js";
import {
  getSpellDefinition,
  getQuickActionSpellOptions,
} from "./spells-srd.js";
import { getSpellsFromItem } from "./spells.js";
import { DAMAGE_TYPES, DAMAGE_DEFENSES_FIELD, sanitizeDamageDefenses, damageDefenseFor, damageDefenseTag, hasDamageDefenses, profileDamageDefenses } from "./damageDefensesCore.js";
import {
  SPECIES, SPECIES_FIELD, SUPERNATURAL_GIFTS, SUPERNATURAL_GIFT_FIELD, getSpecies, sanitizeSpecies, sanitizeSupernaturalGift,
  SPECIES_SPELL_ABILITY_FIELD, sanitizeSpeciesSpellAbility, speciesHasSpellAbilityChoice,
  speciesDisplayName, speciesOptionMissing, supernaturalGiftDisplayName,
} from "./speciesTraitCore.js";
import { ABILITY_KEYS, ABILITY_MODIFIERS_FIELD, sanitizeAbilityModifiers, hasAbilityModifiers } from "./abilityModifiersCore.js";
import {
  MAX_QUICK_ACTIONS,
  MAX_QUICK_ACTION_ATTACKS,
  MAX_QUICK_ACTION_ATTACK_COMPONENTS,
  MAX_QUICK_ACTION_USES,
  quickActionUsesLeft,
  findQuickAction,
  isAttackQuickAction,
  parseQuickActionAttackImport,
  quickActionMonsterAttackFields,
  sanitizeQuickActions,
} from "./quickActionsCore.js";
import {
  MAX_SPELLBOOK_PINNED,
  MAX_SPELLBOOK_SPELLS,
  SPELLBOOK_FIELD,
  hasSpellbook,
  isSpellbookQuickAction,
  sanitizeSpellbook,
} from "./spellbookCore.js";
import {
  spellbookCantripAttackAction,
  spellbookSpellAttackAction,
  spellbookGroups,
  spellbookGroupsForProfile,
  spellbookPreparation,
  spellbookQuickAction,
  spellbookRitualCastable,
  spellbookSearchOptions,
  spellbookSpell,
  spellbookSpellDetails,
  spellbookSpellReferenceLoaded,
  loadSpellbookSpellReference,
} from "./spellbookCatalog.js";
import { subclassGrantedSpells, subclassSuggestedSpells } from "./subclassSpellsCatalog.js";
import { classFeatureDescription, loadClassFeatureDescriptions } from "./classFeatureDescriptions.js";
import { spellSlotStatus } from "./spellSlotCore.js";
import {
  SHEET_IMPORT_LIST_SECTIONS,
  SHEET_IMPORT_SECTIONS,
  mergeImportedSpellbook,
  parseCharacterSheetImport,
  sheetImportSectionSummary,
} from "./characterSheetImportCore.js";
import { MONSTER_PROFILE_FIELD, MONSTER_PROFILE_STATBLOCK_FIELDS, sanitizeMonsterProfile } from "./monsterProfileCore.js";
import { fiveToolsCollection, fiveToolsImportSummary, fiveToolsMonsterLabel, fiveToolsMonsterToStatblock, fiveToolsMonsters, fiveToolsSearch, isFiveToolsData }
  from "./fiveToolsMonsterCore.js";
import { createFiveToolsArchivePanel } from "./fiveToolsArchivePanel.js";
import { monsterStatblockOf, monsterStatblockSectionsToClear, monsterStatblockTargets, sameMonsterStatblock } from "./monsterStatblockShareCore.js";
import { setTokenDisplayName, statblockReplacesHitPoints, statblockTokenName } from "./tokenNameCore.js";
import { setTokenPortrait } from "./tokenPortraitCore.js";
import { fiveToolsTokenUrl } from "./fiveToolsArchiveCore.js";
import { monsterStatblockTextRecord, monsterStatblockTextRef } from "./monsterStatblockTextCore.js";
import { createMonsterStatblockTextLoader } from "./monsterStatblockTextLoader.js";
import { monsterLegendarySummary, planMonsterLegendary, setMonsterLegendary } from "./monsterLegendaryCore.js";
import { PC_ATTACK_MONSTER_GROUP_TITLES, legendaryActionCost, pcAttackMonsterTraitEntries } from "./pcAttackMonsterTraitsCore.js";
import { createLocalOptionsStore } from "./options/localOptionsStore.js";
import { hasCanonicalHitPoints, monsterHitPointsSummary, monsterNamesakes } from "./monsterHitPointsImportCore.js";
import { openPcAttackPopover } from "./pcAttackLauncher.js";
import { pcAttackBreathActionId } from "./pcAttackBreathId.js";
import { PC_ATTACK_CANTRIPS } from "./pcAttackCantripCatalog.js";
import { PC_ATTACK_SPELLS } from "./pcAttackSpellCatalog.js";
import { executeDirectQuickAction } from "./quickActionExecution.js";
import { isCounterspell } from "./counterspellCore.js";
import { openCounterspellPopover } from "./counterspellLauncher.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CLASSES,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureBuildLabel,
  classFeatureDisplayNameWithParent,
  orderClassFeaturesByParent,
  classFeatureTargeting,
  classFeatureTargetMode,
  getAvailableClassFeatures,
  getAdditionalSubclassSpellEntries,
  getClassFeatureSubclasses,
  getEnabledClassFeatures,
} from "./classFeatureCatalog.js";
import {
  MAX_CHARACTER_CLASSES,
  activeClassFeatureInstances,
  classFeatureAutoActivateParentFeatureId,
  classFeatureChoiceOptions,
  classFeatureDisplayName,
  classFeatureDurationParentFeatureId,
  classFeatureDurationTiming,
  classFeatureEffectProjection,
  CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS,
  classFeatureIsReferenceOnly,
  classFeatureParentFeatureId,
  classFeatureRequiredActiveFeatureId,
  classFeatureRuntimeSupport,
  classFeatureTheme,
  classFeatureRemainingRounds,
  classFeatureResourceEntries,
  classFeatureRequiresActivationChoice,
  classFeatureSpecialRefresh,
  classFeatureSpellSlotCreationCost,
  classFeatureTwinnedSpellCost,
  purifyingSpellSelectionOptions,
  resolvePurifyingSpellChoice,
  resolveClassFeatureResourceMaximum,
  resolveClassFeatureResourceDie,
  sanitizeCharacterBuild,
  resolveClassFeatureProgressionValue,
} from "./classFeatureCore.js";
import {
  activateClassFeature,
  applySorcerousRestoration,
  adjustClassFeatureResource,
  convertClassFeatureSpellSlot,
  createClassFeatureSpellSlot,
  deactivateClassFeature,
  getClassFeatureState,
  applyLayOnHands,
  applySpeciesHpTrait,
  applySpeciesTeleport,
  previewSpeciesHpTrait,
  purifyClassFeatureSpell,
  restoreWildMagicTidesOfChaos,
  resetClassFeatureResources,
  shortRestClassFeatureResources,
} from "./classFeatureRuntime.js";
import { speciesHealDice, speciesHpTraitAmount, speciesHpTraitAmountLabel, speciesReductionHint } from "./speciesHpTraitCore.js";
import { speciesSpellCast, speciesSpellActionId, speciesSpellOpenRequest, speciesTraitSave } from "./speciesInnateSpellCore.js";
import { perfBootPage } from "./perfProbe.js";
import { rulesTextBlock } from "./rulesTextView.js";

perfBootPage(OBR);

import { requestSpellAreaPlacement } from "./spellAreaPlacementClient.js";
import { spellTeleportDestinationPosition } from "./spellTeleportCore.js";
import { speciesTeleportInfo, speciesTeleportRuleId } from "./speciesTeleportCore.js";
import { speciesNaturalWeaponAction, speciesNaturalWeaponState } from "./speciesNaturalWeaponCore.js";

const META_KEY = `${ID}/meta`;
const MODAL_ID = `${ID}/initiative-card-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function closeInitiativeCardPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
const initiativeCardSearchParams = new URLSearchParams(window.location.search);
const sourceId = initiativeCardSearchParams.get("source") || "";
const requestedQuickActionId = initiativeCardSearchParams.get("quickAction") || "";
let requestedQuickActionHandled = false;
const labels = { str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" };
const DEFENSE_CHOICES = [["", "—"], ["resistance", "Res."], ["immunity", "Imm."], ["vulnerability", "Vuln."]];
const DEFENSE_LIST_BY_KIND = { resistance: "resistances", immunity: "immunities", vulnerability: "vulnerabilities" };
const $ = (id) => document.getElementById(id);

let item = null;
let profile = null;
let isGM = false;
let exhaustionSaving = false;
// The exhaustion level being saved, shown at once; null when no save runs.
let exhaustionPending = null;
let quickActionLaunching = false;
let classFeatureMutating = false;
let currentRoundValue = 1;
let draftEnabledFeatureIds = new Set();
let draftKnownAvailableFeatureIds = new Set();
let activeCardTab = "stats";
let editing = false;
// The spellbook being edited: rebuilt from the profile each time the editor opens, saved with Salva.
let draftSpellbook = sanitizeSpellbook(null);
// The card's monster profile (a stat block's source and Multiattack): undefined until the card has one or a monster's
// block is applied, so a character's card keeps its shape.
let draftMonsterProfile;
// Prepara mode (renderSpellPreparation): the spells left unprepared while the GM ticks, null outside it.
let spellPreparationDraft = null;
// The spell of the book whose details are open (one at a time), "" when none is.
let expandedSpellbookSpellId = "";
// After a long rest from the card, a character who prepares spells is reminded to review them, until Prepara.
let spellPreparationReminder = false;
// Spell slot pips: the values the GM clicked and not yet stored (poolId → current, poolId → name), shown at once;
// spellSlotWriting while one write runs, the next one taking the latest click.
const spellSlotPending = new Map();
const spellSlotPendingNames = new Map();
let spellSlotWriting = false;

const spellOptions = getQuickActionSpellOptions();

const SORCERY_SOURCE_FEATURE_ID = "stregone-fonte-di-magia";
const BARDIC_INSPIRATION_FEATURE_ID = "bardo-ispirazione-bardica";
const SORCERY_RESTORATION_FEATURE_ID = "stregone-ripristino-stregonesco";
const SORCERY_POINTS_POOL_ID = "stregone-punti-stregoneria";
const WILD_MAGIC_SURGE_FEATURE_ID = "stregone-magia-selvaggia-impulso-di-magia-selvaggia";
const WILD_MAGIC_TIDES_FEATURE_ID = "stregone-magia-selvaggia-onde-di-caos";
const WILD_MAGIC_TIDES_POOL_ID = "stregone-magia-selvaggia-onde-di-caos-usi";
const WILD_MAGIC_CONTROLLED_FEATURE_ID = "stregone-magia-selvaggia-caos-controllato";
const TWINNED_SPELL_FEATURE_ID = "stregone-metamagia-incantesimo-raddoppiato";
const SPELL_THIEF_FEATURE_ID = "ladro-mistificatore-arcano-ladro-di-incantesimi";
const UNSETTLING_WORDS_FEATURE_ID = "bardo-collegio-dell-eloquenza-parole-inquietanti";
const UNIVERSAL_SPEECH_FEATURE_ID = "bardo-collegio-dell-eloquenza-linguaggio-universale";
const CONTAGIOUS_INSPIRATION_FEATURE_ID = "bardo-collegio-dell-eloquenza-ispirazione-contagiosa";

const WILD_MAGIC_GUIDANCE = Object.freeze({
  "01-02": { where: "Sullo Stregone", duration: "1 minuto; nuovo tiro all'inizio di ogni suo turno", resolve: "Tiro sulla tabella manuale; ignora 01-02 nei tiri successivi." },
  "03-04": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Linea di vista e applicazione del senso speciale al tavolo." },
  "05-06": { where: "Spazio libero entro 1,5 m dallo Stregone", duration: "Scompare dopo 1 minuto", resolve: "Il DM sceglie il modron; nessun token o stat block creato." },
  "07-08": { where: "Centrato sullo Stregone", duration: "Istantanea", resolve: "Risolvi danni e TS con il tavolo; il link all'incantesimo è consultivo." },
  "09-10": { where: "Bersagli scelti al tavolo", duration: "Istantanea", resolve: "Risolvi il lancio di 5° livello manualmente; nessun danno automatico." },
  "11-12": { where: "Sullo Stregone", duration: "Finché il tavolo non ripristina l'altezza", resolve: "Tira d10 e misura manualmente; nessun token scalato." },
  "13-14": { where: "Centrato sullo Stregone", duration: "1 minuto completo, senza concentrazione", resolve: "TS e area al tavolo; il link all'incantesimo non crea concentrazione." },
  "15-16": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Ricorda 5 PF all'inizio del turno; non mutare HP automaticamente." },
  "17-18": { where: "Sullo Stregone", duration: "Fino allo starnuto", resolve: "Promemoria cosmetico; fine manuale." },
  "19-20": { where: "Centrato sullo Stregone", duration: "1 minuto", resolve: "Link all'incantesimo consultivo; nessuna zona o TS automatici." },
  "21-22": { where: "Creature contro il prossimo incantesimo idoneo", duration: "Primo incantesimo con TS entro 1 minuto", resolve: "Ricorda il prossimo TS; fine manuale." },
  "23-24": { where: "Sullo Stregone", duration: "Fino a Rimuovi Maledizione", resolve: "Promemoria cosmetico; terminazione manuale." },
  "25-26": { where: "Sulla fronte dello Stregone", duration: "1 minuto", resolve: "Vantaggio alla Percezione visiva resta un promemoria." },
  "27-28": { where: "Incantesimi dello Stregone", duration: "1 minuto", resolve: "Ricorda il nuovo tempo di lancio; non modificare il cast." },
  "29-30": { where: "Spazio libero visibile entro 18 m", duration: "Istantanea", resolve: "Destinazione e movimento restano manuali." },
  "31-32": { where: "Stregone sul Piano Astrale", duration: "Fino alla fine del suo turno successivo", resolve: "Ricorda il ritorno; nessun token rimosso." },
  "33-34": { where: "Prossimo incantesimo dannoso dello Stregone", duration: "Primo incantesimo idoneo o 1 minuto", resolve: "Massimizzazione dei danni al tavolo; nessun calcolo automatico." },
  "35-36": { where: "Sullo Stregone", duration: "Indefinita", resolve: "Tira d10 e aggiorna età manualmente." },
  "37-38": { where: "Spazi liberi entro 18 m", duration: "Scompaiono dopo 1 minuto", resolve: "Numero, token e stat block dei flumph restano manuali." },
  "39-40": { where: "Sullo Stregone", duration: "Istantanea", resolve: "Tiro 2d10 e modifica HP manualmente." },
  "41-42": { where: "Sullo Stregone", duration: "Fino all'inizio del turno successivo", resolve: "Ricorda incapacità e vulnerabilità; nessun watcher HP." },
  "43-44": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Riuso come azione bonus e distanza restano manuali." },
  "45-46": { where: "Sullo Stregone", duration: "10 minuti completi, senza concentrazione", resolve: "Link all'incantesimo consultivo; TS e movimento restano al tavolo." },
  "47-48": { where: "Spazio entro 1,5 m dallo Stregone", duration: "Scompare dopo 1 minuto", resolve: "Nessun token o stat block creato." },
  "49-50": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Promemoria sulla voce; fine manuale." },
  "51-52": { where: "Accanto allo Stregone", duration: "1 minuto", resolve: "Non mutare CA e non applicare immunità automaticamente." },
  "53-54": { where: "Sullo Stregone", duration: "5d6 giorni", resolve: "Tiro della durata e fine manuali." },
  "55-56": { where: "Sullo Stregone", duration: "Ricrescono in 24 ore", resolve: "Promemoria cosmetico; fine manuale." },
  "57-58": { where: "Oggetti infiammabili toccati", duration: "1 minuto", resolve: "Nessun oggetto modificato automaticamente." },
  "59-60": { where: "Slot incantesimo dello Stregone", duration: "Istantanea", resolve: "Ripristina lo slot speso di livello più basso dai pallini della scheda Incantesimi." },
  "61-62": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Promemoria sul modo di parlare." },
  "63-64": { where: "Centrata sullo Stregone", duration: "1 ora completa, senza concentrazione", resolve: "Link all'incantesimo consultivo; nessuna zona automatica." },
  "65-66": { where: "Fino a tre creature scelte entro 9 m", duration: "Istantanea", resolve: "Scelta, tiro 4d10 e danni al tavolo." },
  "67-68": { where: "Sullo Stregone e creatura più vicina", duration: "Fino alla fine del suo turno successivo", resolve: "Scegli la creatura e gestisci eventuali parità al tavolo." },
  "69-70": { where: "Fotografia iniziale delle creature entro 9 m", duration: "1 minuto; fine individuale ad attacco o incantesimo", resolve: "Non è un'aura dinamica; nessuna etichetta automatica." },
  "71-72": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Resistenza a tutti i danni resta un promemoria." },
  "73-74": { where: "Una creatura casuale entro 18 m", duration: "1d4 ore", resolve: "Bersaglio e durata sono tirati al tavolo." },
  "75-76": { where: "Luce intensa entro 9 m dallo Stregone", duration: "1 minuto; Accecato fino al turno successivo", resolve: "Innesco di fine turno; non applicare Accecato automaticamente." },
  "77-78": { where: "Sullo Stregone", duration: "1 ora completa, senza concentrazione", resolve: "TS e forma di pecora al tavolo; nessuno stat block copiato." },
  "79-80": { where: "Entro 3 m dallo Stregone", duration: "1 minuto", resolve: "Effetto cosmetico; nessuna aura con etichette." },
  "81-82": { where: "Sullo Stregone", duration: "Istantanea", resolve: "Azione aggiuntiva da gestire manualmente." },
  "83-84": { where: "Ogni creatura entro 9 m", duration: "Istantanea", resolve: "Bersagli, 1d10, danni e cura restano manuali; non mutare HP." },
  "85-86": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Link all'incantesimo consultivo; risoluzione manuale." },
  "87-88": { where: "Una creatura casuale entro 18 m", duration: "10 minuti completi, senza concentrazione", resolve: "Bersaglio casuale e durata completa al tavolo." },
  "89-90": { where: "Sullo Stregone", duration: "1 minuto; fine ad attacco o incantesimo", resolve: "Promemoria con fine anticipata manuale." },
  "91-92": { where: "Sullo Stregone", duration: "Finestra di 1 minuto o innesco", resolve: "Nessun watcher morte/HP e nessun incantesimo automatico." },
  "93-94": { where: "Sullo Stregone", duration: "1 minuto", resolve: "Promemoria; non scalare il token." },
  "95-96": { where: "Fotografia iniziale dello Stregone e creature entro 9 m", duration: "1 minuto", resolve: "Non è un'aura dinamica; vulnerabilità resta manuale." },
  "97-98": { where: "Attorno allo Stregone", duration: "1 minuto", resolve: "Promemoria cosmetico." },
  "99-00": { where: "Pool Punti Stregoneria dello Stregone", duration: "Istantanea", resolve: "Dopo conferma può ripristinare il pool; annullabile dalla cronologia." },
});

function requestPopoverHeight(height) {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "resize",
    id: MODAL_ID,
    height,
  }, { destination: "LOCAL" }).catch(() => {});
}

function syncCardTabs() {
  const spellbookActive = activeCardTab === "spellbook";
  const quickActionsActive = activeCardTab === "quick-actions";
  // Attacks (weapons and cantrips) are a GM tool: their tab is the GM's only.
  const attacksActive = isGM && activeCardTab === "attacks";
  const classFeaturesActive = activeCardTab === "class-features";
  const statsActive = !spellbookActive && !quickActionsActive && !attacksActive && !classFeaturesActive;
  $("statsTab").setAttribute("aria-selected", statsActive ? "true" : "false");
  $("spellbookTab").setAttribute("aria-selected", spellbookActive ? "true" : "false");
  $("quickActionsTab").setAttribute("aria-selected", quickActionsActive ? "true" : "false");
  $("attacksTab").setAttribute("aria-selected", attacksActive ? "true" : "false");
  $("classFeaturesTab").setAttribute("aria-selected", classFeaturesActive ? "true" : "false");
  $("attacksTab").hidden = !isGM;
  $("statsTab").tabIndex = statsActive ? 0 : -1;
  $("spellbookTab").tabIndex = spellbookActive ? 0 : -1;
  $("quickActionsTab").tabIndex = quickActionsActive ? 0 : -1;
  $("attacksTab").tabIndex = attacksActive ? 0 : -1;
  $("classFeaturesTab").tabIndex = classFeaturesActive ? 0 : -1;
  $("view").hidden = editing || !statsActive;
  $("spellbookView").hidden = editing || !spellbookActive;
  $("quickActionsView").hidden = editing || !quickActionsActive;
  $("attacksView").hidden = editing || !attacksActive;
  $("classFeaturesView").hidden = editing || !classFeaturesActive;
  $("statsEditPane").hidden = !editing || !statsActive;
  $("spellbookEditPane").hidden = !editing || !spellbookActive;
  $("quickActionsEditPane").hidden = !editing || !quickActionsActive;
  $("attacksEditPane").hidden = !editing || !attacksActive;
  $("classFeaturesEditPane").hidden = !editing || !classFeaturesActive;
  $("form").classList.toggle("active", editing);
  $("edit").style.display = isGM && !editing ? "inline-block" : "none";
  $("sheetImportToggle").hidden = !isGM || !editing;
  requestPopoverHeight(editing
    ? (classFeaturesActive ? 760 : spellbookActive || quickActionsActive || attacksActive ? 680 : 640)
    : (classFeaturesActive || spellbookActive ? 680 : 560));
}

function setCardTab(tab) {
  activeCardTab = tab === "spellbook" || tab === "quick-actions" || tab === "attacks" || tab === "class-features"
    ? tab
    : "stats";
  syncCardTabs();
}

function valueText(value, suffix = "") {
  return value === null || value === undefined ? "-" : `${value}${suffix}`;
}

function signedText(value) {
  if (value === null || value === undefined) return "-";
  return value >= 0 ? `+${value}` : String(value);
}

function quickActionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `quick-${globalThis.crypto.randomUUID()}`;
  }
  return `quick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function selectControl(options, value = "") {
  const select = document.createElement("select");
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function quickActionReference(action) {
  if (action?.kind === "spell") {
    const spell = getSpellDefinition(action.spellId);
    return spell?.catalogLabel || spell?.displayName || spell?.name || action.spellId || "";
  }
  if (action?.kind === "feature") {
    const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
    return feature ? classFeatureDisplayName(feature) : action.featureId || "";
  }
  if (action?.kind === "attack") return "";
  return action?.conditionName || "";
}

function quickActionSummary(action) {
  const target = action.targetMode === "self" ? "su di sé" : "selezione corrente";
  if (action.kind === "condition") {
    return `${action.conditionName} · ${target}`;
  }
  if (action.kind === "feature") {
    const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
    return `${feature ? classFeatureDisplayName(feature) : "Capacità"} · ${target}`;
  }
  if (action.kind === "attack" && action.source?.kind === "cantrip") {
    const known = action.source.spellIds || [];
    return known.length
      ? `Trucchetto · ${known.map((spellId) => PC_ATTACK_CANTRIPS.find((cantrip) => cantrip.spellId === spellId)?.name || spellId).join(", ")}`
      : "Trucchetto · scegli al lancio";
  }
  if (action.kind === "attack" && action.source?.kind === "spell") {
    const known = action.source.spellIds || [];
    return known.length
      ? `Incantesimo d'attacco · ${known.map((spellId) => PC_ATTACK_SPELLS.find((spell) => spell.spellId === spellId)?.name || spellId).join(", ")}`
      : "Incantesimo d'attacco · scegli al lancio";
  }
  if (action.kind === "attack") {
    const types = (action.components || [])
      .map((component) => DAMAGE_TYPES.find((type) => type.id === component.type)?.label || component.type);
    return `Attacco · ${action.range === "ranged" ? "distanza" : "mischia"} · ${types.join(" + ")}`;
  }
  const launch = action.launchMode === "review" ? "revisione" : "lancio rapido";
  // The cost of the cast: the uses left of its own counter, or free; a spell slot is the default.
  const uses = item ? quickActionUsesLeft(action, getClassFeatureState(item).resources) : null;
  const cost = uses ? ` · ${uses.current}/${uses.maximum} usi` : action.cost === "free" ? " · gratuito" : "";
  return `Incantesimo · ${launch} · ${target}${cost}`;
}

function classFeatureChoiceControl(feature, { compact = false, label = "", defaultValue = "", enabledFeatureIds = [] } = {}) {
  if (!classFeatureRequiresActivationChoice(feature, enabledFeatureIds)) return null;
  const options = classFeatureChoiceOptions(feature);
  if (!options.length) return null;
  const select = document.createElement("select");
  select.className = compact
    ? "class-feature-choice class-feature-choice-compact"
    : "class-feature-choice";
  select.title = label || `Variante di ${feature?.name || "capacità"}`;
  select.setAttribute("aria-label", select.title);
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue.id;
    option.textContent = optionValue.label;
    select.appendChild(option);
  }
  if (defaultValue && options.some((opt) => opt.id === defaultValue)) {
    select.value = defaultValue;
  }
  return select;
}

function classFeatureAutoChoiceControls(feature, { compact = false, enabledFeatureIds = [] } = {}) {
  const controls = new Map();
  const enabledList = enabledFeatureIds.length
    ? enabledFeatureIds
    : (profile ? getEnabledClassFeatures(profile).map((entry) => entry.id) : []);
  const enabledIds = new Set(enabledList);
  for (const childId of Array.isArray(feature?.autoActivateFeatureIds)
    ? feature.autoActivateFeatureIds
    : []) {
    if (!enabledIds.has(childId)) continue;
    const child = CLASS_FEATURE_BY_ID.get(childId);
    if (!child || !classFeatureRequiresActivationChoice(child, enabledList)) continue;
    const control = classFeatureChoiceControl(child, {
      compact,
      label: `Esito automatico: ${child.name}`,
      enabledFeatureIds: enabledList,
    });
    if (control) controls.set(child.id, control);
  }
  return controls;
}

function classFeatureChoiceSelection(control) {
  return control ? String(control.value || "").trim() : "";
}

function classFeatureAutoChoiceSelection(controls) {
  return Object.fromEntries(
    [...(controls instanceof Map ? controls.entries() : [])]
      .map(([featureId, control]) => [featureId, classFeatureChoiceSelection(control)])
      .filter(([, choiceId]) => choiceId),
  );
}

function classFeatureSelectionTargetIds(feature) {
  return classFeatureTargetMode(feature, profile?.characterBuild) === "selection"
    ? OBR.player.getSelection().catch(() => [])
    : undefined;
}

function classFeatureResourceRemaining(feature, state = getClassFeatureState(item)) {
  const cost = Array.isArray(feature?.resourceCosts) ? feature.resourceCosts[0] : null;
  if (!cost?.poolId) return null;
  const entry = classFeatureResourceEntries(
    state,
    [feature],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
    profile?.abilityModifiers,
  ).find((value) => value.pool.id === cost.poolId);
  return entry?.unlimited ? null : entry?.current ?? null;
}

function showPurifyingSpellSelectionModal(spells, resolvedIds) {
  return new Promise((resolve, reject) => {
    const options = purifyingSpellSelectionOptions(spells);
    if (!options.length) {
      reject(new Error("Il bersaglio non ha incantesimi attivi da terminare."));
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "purifying-spell-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "purifying-touch-modal-title");

    const dialog = document.createElement("div");
    dialog.className = "purifying-spell-dialog";

    const header = document.createElement("div");
    header.className = "purifying-spell-header";

    const title = document.createElement("div");
    title.id = "purifying-touch-modal-title";
    title.className = "purifying-spell-title";
    title.textContent = "Tocco Purificatore";

    const subtitle = document.createElement("div");
    subtitle.className = "purifying-spell-subtitle";
    subtitle.textContent = "Quale effetto vuoi terminare?";

    header.append(title, subtitle);

    const list = document.createElement("div");
    list.className = "purifying-spell-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("tabindex", "0");

    let selectedIndex = 0;
    const cardElements = [];

    const updateSelection = (index) => {
      selectedIndex = Math.max(0, Math.min(index, options.length - 1));
      cardElements.forEach((card, i) => {
        const isSelected = i === selectedIndex;
        card.setAttribute("aria-selected", isSelected ? "true" : "false");
        card.dataset.selected = isSelected ? "1" : "0";
      });
      confirmButton.disabled = selectedIndex < 0 || selectedIndex >= options.length;
    };

    options.forEach((opt, index) => {
      const card = document.createElement("div");
      card.className = "purifying-spell-card";
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", index === 0 ? "true" : "false");

      const topRow = document.createElement("div");
      topRow.className = "purifying-spell-card-top";

      const name = document.createElement("span");
      name.className = "purifying-spell-name";
      name.textContent = opt.name;
      topRow.appendChild(name);

      if (opt.isConcentration) {
        const concBadge = document.createElement("span");
        concBadge.className = "purifying-spell-conc-badge";
        concBadge.textContent = "Concentrazione";
        topRow.appendChild(concBadge);
      }

      card.appendChild(topRow);

      const casterRow = document.createElement("div");
      casterRow.className = "purifying-spell-caster";
      casterRow.textContent = opt.subtitle || "Origine sconosciuta";
      card.appendChild(casterRow);

      card.addEventListener("click", () => {
        updateSelection(index);
      });

      cardElements.push(card);
      list.appendChild(card);
    });

    const actions = document.createElement("div");
    actions.className = "purifying-spell-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "edit";
    cancelButton.textContent = "Annulla";

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "primary";
    confirmButton.textContent = "Termina effetto";

    actions.append(cancelButton, confirmButton);
    dialog.append(header, list, actions);
    backdrop.appendChild(dialog);

    const cleanup = () => {
      window.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
    };

    const handleConfirm = () => {
      const selected = options[selectedIndex];
      if (!selected) {
        cleanup();
        reject({ cancelled: true });
        return;
      }
      cleanup();
      resolve({
        targetIds: resolvedIds,
        spellInstanceId: selected.instanceId,
        spellName: selected.name,
      });
    };

    const handleCancel = () => {
      cleanup();
      reject({ cancelled: true });
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        updateSelection(selectedIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateSelection(selectedIndex - 1);
      }
    };

    cancelButton.addEventListener("click", handleCancel);
    confirmButton.addEventListener("click", handleConfirm);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) handleCancel();
    });
    window.addEventListener("keydown", onKeyDown);

    document.body.appendChild(backdrop);
    updateSelection(0);
    list.focus();
  });
}

export async function choosePurifyingSpell(targetIds, { promptModal = showPurifyingSpellSelectionModal } = {}) {
  const ids = Array.isArray(targetIds) && targetIds.length
    ? targetIds
    : await OBR.player.getSelection().catch(() => []);
  const resolvedIds = ids.length ? ids : [item.id];
  const [target] = await OBR.scene.items.getItems(resolvedIds).catch(() => []);
  const spells = getSpellsFromItem(target).filter((spell) =>
    spell?.castContext?.staticZoneOwner !== true
  );
  if (!spells.length) throw new Error("Il bersaglio non ha incantesimi attivi da terminare.");
  if (spells.length === 1) {
    return {
      targetIds: resolvedIds,
      spellInstanceId: spells[0].instanceId,
      spellName: spells[0].name,
    };
  }
  return promptModal(spells, resolvedIds);
}

async function launchSpecialClassFeature(feature, targetIds) {
  const adapter = String(feature?.runtimeSupport?.adapter || "").trim();
  if (adapter === "lay-on-hands") {
    const rawValue = window.prompt(
      "Quanti punti della riserva spendere per curare?",
      "1",
    );
    if (rawValue === null) throw { cancelled: true };
    await applyLayOnHands({
      sourceId: item.id,
      featureId: feature.id,
      targetIds,
      value: rawValue,
      mode: "heal",
    });
    return;
  }
  if (adapter === "purifying-touch") {
    const selected = await choosePurifyingSpell(targetIds);
    await purifyClassFeatureSpell({ sourceId: item.id, featureId: feature.id, ...selected });
  }
}

// A species trait that changes hit points, from a quick action: the roll it needs is asked here, the runtime writes
// the HP and spends the use in one command.
async function launchSpeciesHpTrait(feature, targetIds) {
  const spec = feature.hpTrait;
  const ask = (message, initial = "") => {
    const raw = window.prompt(message, initial);
    if (raw === null) throw { cancelled: true };
    return raw;
  };
  if (spec.kind === "shift") {
    const value = spec.bonusDie ? ask(`${feature.name}: risultato del ${spec.bonusDie} di PF temporanei in più.`) : "";
    await activateClassFeature({ sourceId: item.id, featureId: feature.id, value });
    return;
  }
  let value = "";
  let damage = "";
  let hit = true;
  const dice = spec.kind === "heal" ? speciesHealDice(spec, profile) : null;
  if (dice) value = ask(`${feature.name}: totale di ${dice.label} (${dice.min}–${dice.max}).`);
  if (spec.kind === "temp" && spec.onHit) {
    hit = !/^n/iu.test(ask(`${feature.name}: il morso ha colpito? (s/n; mancato spende comunque l'uso)`, "s").trim());
  }
  if (spec.kind === "reduce") {
    value = ask(`${feature.name}: totale tirato (${speciesReductionHint(spec, profile)}).`);
    const { lastDamage } = await previewSpeciesHpTrait({ sourceId: item.id, featureId: feature.id });
    if (!lastDamage) damage = ask(`${feature.name}: danni subiti (non trovati nella cronologia).`);
  }
  await applySpeciesHpTrait({ sourceId: item.id, featureId: feature.id, targetIds, value, damage, hit });
}

// The list a launch starts from and its status line: the spellbook, the quick actions or the attacks.
function quickActionSurface(action) {
  if (isSpellbookQuickAction(action)) return { listId: "spellbookList", statusId: "spellbookRunStatus" };
  return isAttackQuickAction(action)
    ? { listId: "attacks", statusId: "attackRunStatus" }
    : { listId: "quickActions", statusId: "quickActionRunStatus" };
}

async function launchQuickAction(action, choiceId = "", autoChoiceIds = {}, surface = quickActionSurface(action)) {
  const operation = sceneLifecycle.capture({ operationId: `initiative-quick-action:${action?.id || "unknown"}:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !item || quickActionLaunching) return;
  quickActionLaunching = true;
  const status = $(surface.statusId);
  const setStatus = (message, tone = "") => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const setButtonsDisabled = (disabled) => {
    $(surface.listId).querySelectorAll("button").forEach((button) => {
      button.disabled = disabled || button.dataset.unsupportedFeature === "1";
    });
  };
  const sceneStillCurrent = () => {
    if (sceneLifecycle.isCurrent(operation)) return true;
    quickActionLaunching = false;
    setButtonsDisabled(false);
    setStatus("Scena cambiata: riapri la scheda.", "error");
    return false;
  };
  setButtonsDisabled(true);
  setStatus(`Esecuzione: ${action.label}…`);
  try {
    if (action.kind === "attack") {
      if (!isGM) throw new Error("Solo il GM può registrare un attacco.");
      await openPcAttackPopover(item.id, action.id, action.launchSpellId || "");
      if (!sceneStillCurrent()) return;
      closeInitiativeCardPopover();
      return;
    }
    // A species teleport: its destination is picked on the map, then the move goes with the use.
    if (action.kind === "feature" && CLASS_FEATURE_BY_ID.get(action.featureId)?.speciesTeleport) {
      if (!isGM) throw new Error("Solo il GM può attivare una capacità.");
      await teleportWithSpeciesTrait(CLASS_FEATURE_BY_ID.get(action.featureId));
      if (!sceneStillCurrent()) return;
      setStatus(`Eseguita: ${action.label}.`, "success");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    if (action.kind === "feature" && CLASS_FEATURE_BY_ID.get(action.featureId)?.innateSpell) {
      if (!isGM) throw new Error("Solo il GM può lanciare un incantesimo.");
      await openSpeciesSpell(CLASS_FEATURE_BY_ID.get(action.featureId));
      if (!sceneStillCurrent()) return;
      closeInitiativeCardPopover();
      return;
    }
    if (action.kind === "feature" && CLASS_FEATURE_BY_ID.get(action.featureId)?.breath) {
      if (!isGM) throw new Error("Solo il GM può registrare un attacco.");
      await openPcAttackPopover(item.id, pcAttackBreathActionId(action.featureId));
      if (!sceneStillCurrent()) return;
      closeInitiativeCardPopover();
      return;
    }
    if (action.kind === "feature") {
      if (!isGM) throw new Error("Solo il GM può attivare una capacità.");
      const feature = CLASS_FEATURE_BY_ID.get(action.featureId);
      const targetIds = await classFeatureSelectionTargetIds(feature);
      if (!sceneStillCurrent()) return;
      if (feature?.hpTrait) {
        await launchSpeciesHpTrait(feature, targetIds);
      } else if (["lay-on-hands", "purifying-touch"].includes(feature?.runtimeSupport?.adapter)) {
        await launchSpecialClassFeature(feature, targetIds);
      } else {
        let resourceValues = {};
        if (feature?.id === TWINNED_SPELL_FEATURE_ID) {
          const rawLevel = window.prompt("Livello dell'incantesimo (0-9):", "0");
          if (rawLevel === null) throw { cancelled: true };
          const cost = classFeatureTwinnedSpellCost(rawLevel);
          if (cost === null) throw new Error("Inserisci un livello di incantesimo tra 0 e 9.");
          resourceValues = { [SORCERY_POINTS_POOL_ID]: cost };
        }
        // Fey Gift's Hospitality: the d6 of its temporary hit points, rolled at the table.
        const dieOption = speciesChoiceDieOption(feature, choiceId);
        let value;
        if (dieOption) {
          value = window.prompt(`${feature.name}: risultato del ${dieOption.temporaryHp.bonusDie} di PF temporanei.`, "");
          if (value === null) throw { cancelled: true };
        }
        await activateClassFeature({
          sourceId: item.id,
          featureId: action.featureId,
          targetIds,
          choiceId,
          autoChoiceIds,
          resourceValues,
          ...(dieOption ? { value } : {}),
        });
      }
      if (!sceneStillCurrent()) return;
      await refreshClassFeatureItem();
      if (!sceneStillCurrent()) return;
      setStatus(`Applicata: ${action.label}.`, "success");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    // Counterspell names what it counters in its own popup, which casts it with the slot and the reaction.
    if (action?.kind === "spell" && isCounterspell(action.spellId)) {
      await openCounterspellPopover({ sourceId: item.id, quickActionId: action.id });
      setStatus("Controincantesimo: scegli nel popup cosa viene annullato.");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    const result = await executeDirectQuickAction({
      action,
      sourceItem: item,
      confirmConcentration: (message) => window.confirm(message),
      confirmSpellSlot: (message) => window.confirm(message),
    });
    if (!sceneStillCurrent()) return;
    if (result.mode === "executed") {
      // The token changed while the launch held the renders back: the slot pips and the uses read it again
      // (the quick action list first: rebuilding it clears its status line).
      if (result.spellCost) {
        await refreshClassFeatureItem();
        if (!sceneStillCurrent()) return;
        renderSpellSlots();
        renderQuickActions();
      }
      setStatus(`${result.recorded ? "Lancio registrato" : "Applicata"}: ${action.label}${result.spellCost ? ` · speso: ${result.spellCost}` : ""}.`, "success");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    if (result.mode === "cancelled") {
      setStatus(`Annullata: ${action.label}.`);
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }

    if (result.mode === "invalid") {
      throw new Error(result.reason || "quick-action-invalid");
    }
    // A spell is reviewed in the spell panel, never in the Conditions one: its own route, or the spell on this caster.
    const routeRequest = action.kind === "spell"
      ? result.route?.request || {
        intent: "spell-cast",
        sourceId: item.id,
        casterId: item.id,
        spellId: action.spellId,
        origin: "quick-action",
        quickActionId: action.id,
        ...(action.cost === "free" ? { slotSource: "none" } : {}),
      }
      : null;
    await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, {
      type: "open",
      ...(routeRequest || {
        panel: "conditions",
        sourceId: item.id,
        quickActionId: action.id,
      }),
    }, { destination: "LOCAL" });
    if (!sceneStillCurrent()) return;
    closeInitiativeCardPopover();
  } catch (error) {
    console.warn("[initiative-card] quick action:", error?.message || error);
    setStatus(`Applicazione non riuscita: ${action.label}.`, "error");
    quickActionLaunching = false;
    setButtonsDisabled(false);
  }
}

async function runRequestedQuickActionOnce() {
  if (requestedQuickActionHandled || !requestedQuickActionId || !profile || !isGM) return;
  const action = findQuickAction(profile, requestedQuickActionId);
  if (!action || action.kind !== "feature") {
    requestedQuickActionHandled = true;
    return;
  }
  requestedQuickActionHandled = true;
  setCardTab("quick-actions");
  await launchQuickAction(action);
}

// Quick actions and attacks share the profile's quickActions; each has its own tab, list and status line.
function renderQuickActions() {
  const stored = Array.isArray(profile?.quickActions) ? profile.quickActions : [];
  const actions = stored
    .filter((action) => !isAttackQuickAction(action) && (isGM || action?.kind !== "feature"));
  const attacks = isGM ? stored.filter(isAttackQuickAction) : [];
  for (const id of ["quickActionRunStatus", "attackRunStatus"]) {
    $(id).textContent = "";
    $(id).dataset.tone = "";
  }
  renderQuickActionList($("quickActions"), actions, "Nessuna azione rapida configurata.");
  renderQuickActionList($("attacks"), attacks, "Nessun attacco configurato.");
}

function renderQuickActionList(list, actions, emptyText) {
  list.replaceChildren();
  if (!actions.length) {
    const empty = document.createElement("div");
    empty.className = "quick-actions-empty";
    empty.textContent = emptyText;
    list.appendChild(empty);
    return;
  }

  for (const action of actions) {
    const actionEntry = document.createElement("div");
    actionEntry.className = "quick-action-entry";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-action";
    button.title = `Precompila ${action.label}`;
    const icon = document.createElement("span");
    icon.className = "quick-action-icon";
    const feature = action.kind === "feature"
      ? CLASS_FEATURE_BY_ID.get(action.featureId)
      : null;
    const featureSupport = feature ? classFeatureRuntimeSupport(feature) : null;
    if (featureSupport && !featureSupport.ready) {
      button.disabled = true;
      button.dataset.unsupportedFeature = "1";
      button.title = "Questa capacità non è ancora automatizzata";
    }
    icon.textContent = action.kind === "condition"
      ? "C"
      : feature
        ? classFeatureTheme(feature).emoji
        : action.kind === "attack"
          ? (action.source?.kind === "cantrip" ? "✧" : action.source?.kind === "spell" ? "✶" : "⚔")
          : "✦";
    const copy = document.createElement("span");
    copy.className = "quick-action-copy";
    const label = document.createElement("strong");
    label.textContent = action.label;
    const summary = document.createElement("small");
    summary.textContent = featureSupport && !featureSupport.ready
      ? `${quickActionSummary(action)} Â· non automatizzata`
      : quickActionSummary(action);
    copy.append(label, summary);
    button.append(icon, copy);
    const choiceControl = feature ? classFeatureChoiceControl(feature, { compact: true }) : null;
    const autoChoiceControls = feature
      ? classFeatureAutoChoiceControls(feature, { compact: true })
      : new Map();
    button.addEventListener("click", () => void launchQuickAction(
      action,
      classFeatureChoiceSelection(choiceControl),
      classFeatureAutoChoiceSelection(autoChoiceControls),
    ));
    actionEntry.appendChild(button);
    if (choiceControl) actionEntry.appendChild(choiceControl);
    for (const control of autoChoiceControls.values()) actionEntry.appendChild(control);
    list.appendChild(actionEntry);
  }
}

// The cantrip attack that records this cantrip in the attack console, when the character has one; a leveled attack
// spell (lotto L4) the same way, through an attack spell action.
function spellbookCantripAttack(spellId) {
  return isGM ? spellbookCantripAttackAction(profile?.quickActions, spellId) || spellbookSpellAttackAction(profile?.quickActions, spellId) : null;
}

function spellbookSpellSummary(spell, cantripAttack) {
  // A wizard casts the rituals of its book even when it has not prepared them.
  if (!spell.prepared) return spellbookRitualCastable(profile, spell) ? "Non preparato · lanciabile come rituale" : "Non preparato";
  // A spell of the subclass (subclassSpellsCatalog.js): always prepared, never counted.
  if (spell.granted) return `🔒 ${spell.granted}`;
  if (cantripAttack) return "Attacco · console attacchi";
  if (!spell.launchable) return "Solo riferimento";
  // The plugin records the cast and the slot it spends; the table resolves the spell. An attack cantrip deals its
  // damage in the attack console.
  if (spell.recordOnly) {
    if (!spell.attackCantrip && !spell.attackSpell) return "Registra il lancio";
    return isGM ? `Registra il lancio · danni: aggiungi ${spell.attackCantrip ? "il trucchetto" : "l'incantesimo"} negli Attacchi` : "Registra il lancio · danni dal GM";
  }
  const parts = [spell.area ? "Area" : spell.automated ? "Automatizzato" : "Solo tracciamento"];
  if (spell.concentration) parts.push("concentrazione");
  if (spell.targetMode === "self") parts.push("su di sé");
  return parts.join(" · ");
}

// Spell slots: one row of pips per level, Pact Magic last. A filled pip is an available slot; the GM clicks a
// pip to spend from it onward or to restore up to it, through the class-feature resources (History, Undo).
function renderSpellSlots() {
  const rows = item && profile ? spellSlotStatus(profile.characterBuild, getClassFeatureState(item).resources) : [];
  const block = $("spellSlots");
  block.hidden = rows.length === 0;
  block.replaceChildren(...rows.map((stored) => {
    // A click not yet stored is drawn at once, marked until the write ends.
    const pending = spellSlotPending.has(stored.poolId) && spellSlotPending.get(stored.poolId) !== stored.current;
    const row = pending ? { ...stored, current: spellSlotPending.get(stored.poolId) } : stored;
    const line = document.createElement("div");
    if (pending) line.dataset.pending = "1";
    line.className = "spell-slot-row";
    const label = document.createElement("span");
    label.textContent = row.pact ? `Patto ${row.level}°` : `${row.level}° livello`;
    const pips = document.createElement("span");
    pips.className = "spell-slot-pips";
    const name = row.pact ? `slot del Patto (${row.level}°)` : `slot di ${row.level}° livello`;
    // Slots created with Font of Magic stand after the maximum, dashed, until spent or the long rest.
    for (let index = 0; index < Math.max(row.maximum, row.current); index += 1) {
      const available = index < row.current;
      const pip = document.createElement(isGM ? "button" : "span");
      pip.className = "spell-slot-pip";
      pip.dataset.available = available ? "1" : "0";
      if (row.pact) pip.dataset.pact = "1";
      if (index >= row.maximum) pip.dataset.temporary = "1";
      if (isGM) {
        const next = available ? index : index + 1;
        pip.type = "button";
        // Locked only while another change of the card runs; a slot write in progress takes the new click.
        pip.disabled = classFeatureMutating && !spellSlotWriting;
        pip.title = `${available ? "Spendi" : "Ripristina"}: ${name}, ne restano ${next} su ${row.maximum}`;
        pip.setAttribute("aria-label", pip.title);
        pip.addEventListener("click", () => void setSpellSlotCurrent(row.poolId, next, name));
      }
      pips.appendChild(pip);
    }
    const count = document.createElement("span");
    count.textContent = `${row.current}/${row.maximum}`;
    if (row.temporary) count.title = `${row.temporary} ${row.temporary === 1 ? "slot creato" : "slot creati"} con Fonte di Magia`;
    line.append(label, pips, count);
    return line;
  }));
  if (rows.length && isGM) block.appendChild(buildRestActions("spellbookRunStatus"));
}

// Short and long rest (GM): the class-feature resources the rest restores, spell slots and the uses of the
// quick actions included, in one command with Undo. statusId is the status line of the tab the GM is on.
function buildRestActions(statusId) {
  const box = document.createElement("div");
  box.className = "rest-actions";
  for (const [shortRest, label, title] of [
    [true, "Riposo breve", "Ripristina le risorse che tornano con un riposo breve (slot del Patto, ki, Incanalare Divinità…)"],
    [false, "Riposo lungo", "Ripristina tutte le risorse, gli slot e gli usi delle azioni rapide"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.disabled = classFeatureMutating;
    button.addEventListener("click", () => void takeRest(shortRest, statusId));
    box.appendChild(button);
  }
  return box;
}

async function takeRest(shortRest, statusId) {
  const sceneOperation = sceneLifecycle.capture({ operationId: `initiative-rest:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(sceneOperation) || !isGM || !item || classFeatureMutating) return;
  classFeatureMutating = true;
  const status = $(statusId);
  status.textContent = "Aggiornamento…";
  status.dataset.tone = "";
  try {
    await (shortRest ? shortRestClassFeatureResources : resetClassFeatureResources)(item.id);
    if (!sceneLifecycle.isCurrent(sceneOperation)) throw new Error("Scena cambiata: riapri la scheda.");
    await refreshClassFeatureItem();
    if (!sceneLifecycle.isCurrent(sceneOperation)) throw new Error("Scena cambiata: riapri la scheda.");
    classFeatureMutating = false;
    const reviewPreparation = !shortRest && spellbookPreparation(profile).preparing;
    if (reviewPreparation) spellPreparationReminder = true;
    // The book shows the reminder on its preparation bar; it redraws the slots too.
    if (reviewPreparation) renderSpellbook();
    else renderSpellSlots();
    renderClassFeatures();
    renderQuickActions();
    status.textContent = shortRest
      ? "Riposo breve: risorse ripristinate."
      : `Riposo lungo: risorse ripristinate.${reviewPreparation ? " Rivedi gli incantesimi preparati." : ""}`;
    status.dataset.tone = "success";
  } catch (error) {
    console.warn("[initiative-card] rest:", error?.message || error);
    status.textContent = error?.message || "Riposo non riuscito.";
    status.dataset.tone = "error";
  } finally {
    classFeatureMutating = false;
  }
}

// A pip click: shown at once, stored by one write at a time. Clicks during a write only move the value the next
// write stores, so a burst of clicks costs at most two commands (History, Undo).
function setSpellSlotCurrent(poolId, current, name) {
  if (!sceneLifecycle.isReady() || !isGM || !item || (classFeatureMutating && !spellSlotWriting)) return;
  spellSlotPending.set(poolId, current);
  spellSlotPendingNames.set(poolId, name);
  renderSpellSlots();
  if (!spellSlotWriting) void writeSpellSlots();
}

function storedSpellSlotCurrent(poolId) {
  return spellSlotStatus(profile?.characterBuild, getClassFeatureState(item).resources)
    .find((row) => row.poolId === poolId)?.current;
}

async function writeSpellSlots() {
  const sceneOperation = sceneLifecycle.capture({ operationId: `initiative-spell-slot:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(sceneOperation)) return;
  spellSlotWriting = true;
  classFeatureMutating = true;
  // The faded row already says the write is running: no "Aggiornamento…" over the pips.
  const status = $("spellbookRunStatus");
  status.textContent = "";
  status.dataset.tone = "";
  const names = [];
  let stored = false;
  try {
    for (;;) {
      const next = [...spellSlotPending].find(([poolId, value]) => value !== storedSpellSlotCurrent(poolId));
      if (!next) break;
      const [poolId, value] = next;
      await adjustClassFeatureResource(item.id, poolId, { current: value });
      if (!sceneLifecycle.isCurrent(sceneOperation)) throw new Error("Scena cambiata: riapri la scheda.");
      await refreshClassFeatureItem();
      if (!sceneLifecycle.isCurrent(sceneOperation)) throw new Error("Scena cambiata: riapri la scheda.");
      // Written: a value the rules adjust is not written again; a newer click stays pending.
      if (spellSlotPending.get(poolId) === value) spellSlotPending.delete(poolId);
      const name = spellSlotPendingNames.get(poolId);
      if (name && !names.includes(name)) names.push(name);
    }
    stored = true;
    status.textContent = names.length ? `Aggiornato: ${names.join(", ")}.` : "";
    status.dataset.tone = names.length ? "success" : "";
  } catch (error) {
    console.warn("[initiative-card] spell slot:", error?.message || error);
    status.textContent = error?.message || "Aggiornamento non riuscito.";
    status.dataset.tone = "error";
  } finally {
    // What is not stored goes back to the stored value.
    spellSlotPending.clear();
    spellSlotPendingNames.clear();
    spellSlotWriting = false;
    classFeatureMutating = false;
    if (sceneLifecycle.isReady()) {
      // One full render at the end of the burst: it also records the token, so its echo does not redraw again.
      if (stored && !editing) {
        const message = [status.textContent, status.dataset.tone];
        renderView();
        [status.textContent, status.dataset.tone] = message;
      } else {
        renderSpellSlots();
      }
    }
  }
}

// The spells prepared today, for a character who prepares them (spellPreparationCore.js): the count against the
// limit, and for the GM the Prepara mode, where ticks choose the prepared spells and Salva preparazione stores
// them in one write (the book's unpreparedIds).
function renderSpellPreparation(preparation) {
  const bar = $("spellbookPreparation");
  bar.hidden = !preparation.preparing;
  if (!preparation.preparing) return;
  const over = preparation.limit !== null && preparation.prepared > preparation.limit;
  bar.dataset.over = over ? "1" : "0";
  const count = document.createElement("span");
  count.append("Preparati ");
  const value = document.createElement("strong");
  value.textContent = preparation.limit === null ? String(preparation.prepared) : `${preparation.prepared}/${preparation.limit}`;
  count.appendChild(value);
  count.title = preparation.classes
    .map((entry) => `${entry.label} ${entry.level}: ${entry.limit === null ? "manca il modificatore" : entry.limit}`)
    .join(" · ");
  const parts = [count];
  if (spellPreparationReminder && isGM && !spellPreparationDraft) {
    const hint = document.createElement("small");
    hint.className = "spellbook-preparation-reminder";
    hint.textContent = "Riposo lungo: rivedi gli incantesimi preparati.";
    parts.push(hint);
  } else if (preparation.limit === null) {
    const hint = document.createElement("small");
    hint.textContent = "Per il limite servono i modificatori di caratteristica.";
    parts.push(hint);
  } else if (over) {
    const hint = document.createElement("small");
    hint.textContent = "Oltre il limite.";
    parts.push(hint);
  }
  if (isGM) {
    const actions = document.createElement("div");
    actions.className = "rest-actions";
    const button = (label, title, onClick) => {
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = label;
      control.title = title;
      control.addEventListener("click", onClick);
      return control;
    };
    if (spellPreparationDraft) {
      actions.append(
        button("Annulla", "Lascia la preparazione com'era", () => {
          spellPreparationDraft = null;
          renderSpellbook();
        }),
        button("Salva preparazione", "Conserva gli incantesimi spuntati come preparati", () => void saveSpellPreparation()),
      );
    } else {
      const prepare = button("Prepara", "Scegli gli incantesimi preparati oggi", () => {
        spellPreparationReminder = false;
        spellPreparationDraft = new Set(sanitizeSpellbook(profile?.[SPELLBOOK_FIELD]).unpreparedIds || []);
        renderSpellbook();
      });
      if (spellPreparationReminder) prepare.dataset.attention = "1";
      actions.append(prepare);
    }
    parts.push(actions);
  }
  bar.replaceChildren(...parts);
}

async function saveSpellPreparation() {
  const operation = sceneLifecycle.capture({ operationId: `initiative-spell-preparation:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !isGM || !item || !spellPreparationDraft) return;
  const status = $("spellbookRunStatus");
  const next = sanitizeSpellbook({
    ...sanitizeSpellbook(profile?.[SPELLBOOK_FIELD]),
    unpreparedIds: [...spellPreparationDraft],
  });
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
    // A partial update: the other fields of the card stay as stored, the exhaustion base included.
    await saveInitiativeCard(item.id, item.name, { [SPELLBOOK_FIELD]: next }, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
      preserveExhaustion: true,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    [item] = await OBR.scene.items.getItems([item.id]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    profile = getInitiativeCard(item);
    spellPreparationDraft = null;
    renderSpellbook();
    status.textContent = "Preparazione salvata.";
    status.dataset.tone = "success";
  } catch (error) {
    console.warn("[initiative-card] spell preparation:", error?.message || error);
    status.textContent = error?.message || "Preparazione non salvata.";
    status.dataset.tone = "error";
  }
}

function renderSpellbook() {
  const spellbook = sanitizeSpellbook(profile?.[SPELLBOOK_FIELD]);
  renderSpellSlots();
  $("spellbookSaveDC").textContent = valueText(profile?.spellSaveDC);
  $("spellbookAttackBonus").textContent = signedText(profile?.spellAttackBonus);
  $("spellbookRunStatus").textContent = "";
  $("spellbookRunStatus").dataset.tone = "";
  // In the Prepara mode the ticks in progress, otherwise what the card stores.
  const shownProfile = spellPreparationDraft
    ? { ...profile, [SPELLBOOK_FIELD]: { ...spellbook, unpreparedIds: [...spellPreparationDraft] } }
    : profile;
  renderSpellPreparation(spellbookPreparation(shownProfile));
  const list = $("spellbookList");
  list.replaceChildren();
  const groups = spellbookGroupsForProfile(shownProfile);
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "quick-actions-empty";
    empty.style.marginTop = "9px";
    empty.textContent = isGM
      ? "Nessun incantesimo: premi Modifica per aggiungerli."
      : "Nessun incantesimo.";
    list.appendChild(empty);
    return;
  }
  for (const group of groups) {
    const title = document.createElement("span");
    title.className = "section-title";
    title.textContent = group.title;
    const spells = document.createElement("div");
    spells.className = "quick-actions-list";
    for (const spell of group.spells) spells.appendChild(buildSpellbookEntry(spell));
    list.append(title, spells);
  }
}

function buildSpellbookEntry(spell) {
  const entry = document.createElement("div");
  entry.className = "spellbook-entry";
  // Prepara mode: a tick per spell (cantrips and the subclass's spells are always ready), nothing to launch.
  if (spellPreparationDraft && spell.level && !spell.granted) {
    const row = document.createElement("label");
    row.className = "quick-action";
    row.dataset.preparing = "1";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = spell.prepared;
    box.addEventListener("change", () => {
      if (box.checked) spellPreparationDraft.delete(spell.id);
      else spellPreparationDraft.add(spell.id);
      renderSpellbook();
    });
    const copy = document.createElement("span");
    copy.className = "quick-action-copy";
    const label = document.createElement("strong");
    label.textContent = spell.label;
    const summary = document.createElement("small");
    summary.textContent = [spell.prepared ? "Preparato" : "Non preparato", spell.manual ? "✎ Aggiunto manualmente" : ""]
      .filter(Boolean).join(" · ");
    copy.append(label, summary);
    row.append(box, copy);
    entry.appendChild(row);
    return entry;
  }
  const cantripAttack = spell.attackCantrip || spell.attackSpell ? spellbookCantripAttack(spell.id) : null;
  // A spell not prepared today stays in the book as a reference.
  const runnable = spell.prepared && (!!cantripAttack || spell.launchable);
  // A spell the card cannot launch stays a reference: no button, nothing to press.
  const main = document.createElement(runnable ? "button" : "div");
  main.className = "quick-action";
  if (runnable) {
    main.type = "button";
    main.title = cantripAttack ? `Attacco con ${spell.label}` : `Lancia ${spell.label}`;
    main.addEventListener("click", () => void launchSpellbookSpell(spell.id, "auto"));
  } else {
    main.dataset.reference = "1";
  }
  const icon = document.createElement("span");
  icon.className = "quick-action-icon";
  icon.textContent = spell.pinned ? "★" : cantripAttack ? "✧" : "✦";
  if (spell.pinned) icon.title = "Tra i preferiti del menu 🪄";
  const copy = document.createElement("span");
  copy.className = "quick-action-copy";
  const label = document.createElement("strong");
  label.textContent = spell.label;
  if (spell.ritual) {
    const ritual = document.createElement("span");
    ritual.className = "spellbook-ritual-badge";
    ritual.textContent = "R";
    ritual.title = "Rituale";
    label.appendChild(ritual);
  }
  const summary = document.createElement("small");
  // "Aggiunto manualmente": only a label, the spell is prepared and counted like the others.
  summary.textContent = [spellbookSpellSummary(spell, cantripAttack), spell.manual ? "✎ Aggiunto manualmente" : ""]
    .filter(Boolean).join(" · ");
  copy.append(label, summary);
  main.append(icon, copy);
  entry.appendChild(main);
  const details = spellbookSpellDetails(spell.id);
  // Every catalog spell has a text: the SRD ones arrive with the reference, loaded on the first expansion.
  const hasDetails = !!details || (spell.level !== null && !spellbookSpellReferenceLoaded());
  const expanded = hasDetails && expandedSpellbookSpellId === spell.id;
  if (spell.prepared && spell.launchable && !cantripAttack) {
    const panel = document.createElement("button");
    panel.type = "button";
    panel.className = "spellbook-panel";
    panel.textContent = "⚙";
    panel.title = `Apri ${spell.label} nel pannello incantesimi: slot, bersagli e scelte`;
    panel.setAttribute("aria-label", panel.title);
    panel.addEventListener("click", () => void launchSpellbookSpell(spell.id, "review"));
    entry.appendChild(panel);
  }
  if (hasDetails) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "spellbook-panel spellbook-toggle";
    toggle.textContent = expanded ? "▾" : "▸";
    toggle.title = expanded ? "Nascondi i dettagli" : `Dettagli di ${spell.label}`;
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.addEventListener("click", () => {
      expandedSpellbookSpellId = expanded ? "" : spell.id;
      renderSpellbook();
    });
    entry.appendChild(toggle);
  }
  if (expanded && details) entry.appendChild(buildSpellbookDetails(spell, details));
  else if (expanded) entry.appendChild(buildSpellbookDetailsLoading());
  return entry;
}

// The first expansion loads the Italian reference, then draws the book again.
function buildSpellbookDetailsLoading() {
  const block = document.createElement("div");
  block.className = "spellbook-details";
  const text = document.createElement("small");
  text.textContent = "Caricamento…";
  block.appendChild(text);
  loadSpellbookSpellReference()
    .catch((error) => {
      // Closed again: a failed load is not retried in a loop, the next click tries again.
      console.warn("[initiative-card] spell reference:", error?.message || error);
      expandedSpellbookSpellId = "";
    })
    .finally(() => {
      if (sceneLifecycle.isReady() && !editing) renderSpellbook();
    });
  return block;
}

// The rules text of an expanded spell, and the ritual cast when the character can cast it as a ritual.
function buildSpellbookDetails(spell, details) {
  const block = document.createElement("div");
  block.className = "spellbook-details";
  const facts = document.createElement("dl");
  for (const [name, value] of [
    ["Tempo di lancio", details.castingTime],
    ["Gittata", details.range],
    ["Componenti", details.components],
    ["Durata", details.duration],
  ]) {
    if (!value) continue;
    const term = document.createElement("dt");
    term.textContent = name;
    const description = document.createElement("dd");
    description.textContent = value;
    facts.append(term, description);
  }
  const school = [details.school, spell.ritual ? "rituale" : ""].filter(Boolean).join(" · ");
  if (school) {
    const line = document.createElement("small");
    line.textContent = school;
    block.appendChild(line);
  }
  block.appendChild(facts);
  if (details.description) block.appendChild(rulesTextBlock(details.description));
  if (details.higherLevels) {
    const higher = document.createElement("p");
    const title = document.createElement("strong");
    title.textContent = "A livelli superiori. ";
    higher.append(title, details.higherLevels);
    block.appendChild(higher);
  }
  if (spellbookRitualCastable(profile, spell)) {
    const actions = document.createElement("div");
    actions.className = "rest-actions";
    const ritual = document.createElement("button");
    ritual.type = "button";
    ritual.textContent = "Lancia come rituale";
    ritual.title = "Nessuno slot speso; il lancio richiede 10 minuti in più";
    ritual.addEventListener("click", () => void launchSpellbookSpell(spell.id, "auto", { cost: "free" }));
    actions.appendChild(ritual);
    block.appendChild(actions);
  }
  return block;
}

// A spellbook spell runs through the quick action path: "auto" applies it when nothing needs the GM,
// "review" opens the spell panel. An attack cantrip opens the attack console instead.
async function launchSpellbookSpell(spellId, launchMode, { cost = "slot" } = {}) {
  const surface = { listId: "spellbookList", statusId: "spellbookRunStatus" };
  const entry = spellbookSpell(spellId);
  const cantripAttack = entry.attackCantrip || entry.attackSpell ? spellbookCantripAttack(spellId) : null;
  if (cantripAttack) {
    // The console opens on this spell.
    await launchQuickAction({ ...cantripAttack, launchSpellId: spellId }, "", {}, surface);
    return;
  }
  const action = spellbookQuickAction(spellId, { launchMode, cost });
  if (action) await launchQuickAction(action, "", {}, surface);
}

function classFeatureActivationLabel(feature) {
  const labelsById = {
    azione: "Azione",
    azione_bonus: "Azione bonus",
    azione_attacco: "Primo attacco",
    reazione: "Reazione",
    innesco: "Innesco",
    scelta: "Scelta",
  };
  const activation = String(feature?.activation?.primary || "non_specificata");
  return labelsById[activation]
    || activation.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function classFeatureMetaText(feature) {
  const targeting = classFeatureTargeting(feature, profile?.characterBuild);
  const currentDie = resolveClassFeatureProgressionValue(feature, profile?.characterBuild);
  const parts = [
    classFeatureActivationLabel(feature),
    `liv. ${feature.minimumLevel}`,
    // A species or gift trait shows its page, to check it on the manual.
    (feature.speciesId || feature.giftId) && feature.page ? `${feature.sourceLabel} p. ${feature.page}` : feature.sourceLabel,
    currentDie ? `dado corrente ${currentDie}` : "",
    targeting.rangeMeters
      ? `${targeting.mode === "aura" ? "area" : "portata"} ${targeting.rangeMeters} m`
      : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

function classFeatureInstanceDisplayName(feature, instance) {
  const base = classFeatureDisplayNameWithParent(feature, instance?.choiceId);
  if (feature?.id === UNSETTLING_WORDS_FEATURE_ID) {
    const value = String(instance?.choiceId || "").match(/^value-(\d+)$/u)?.[1];
    if (value) return `${base} −${value}`;
  }
  if (feature?.id !== SPELL_THIEF_FEATURE_ID || !instance?.choiceId) return base;
  const spell = getSpellDefinition(instance.choiceId);
  const spellName = spell?.catalogLabel || spell?.displayName || spell?.name || instance.choiceId;
  return `${base} · ${spellName}`;
}

function classFeatureEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "class-feature-empty";
  empty.textContent = message;
  return empty;
}

async function refreshClassFeatureItem() {
  const [items, sceneMetadata] = await Promise.all([
    OBR.scene.items.getItems([item.id]),
    OBR.scene.getMetadata().catch(() => ({})),
  ]);
  item = items[0] || item;
  profile = getInitiativeCard(item);
  currentRoundValue = Math.max(
    1,
    Math.floor(Number(sceneMetadata?.[`${ID}/state`]?.round) || 1)
  );
}

async function runClassFeatureMutation(operation, successMessage) {
  const sceneOperation = sceneLifecycle.capture({ operationId: `initiative-class-feature:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(sceneOperation) || !isGM || !item || classFeatureMutating) return;
  classFeatureMutating = true;
  const status = $("classFeatureRunStatus");
  status.textContent = "Aggiornamento…";
  status.dataset.tone = "";
  renderClassFeatures();
  try {
    await operation();
    if (!sceneLifecycle.isCurrent(sceneOperation)) {
      status.textContent = "Scena cambiata: riapri la scheda.";
      status.dataset.tone = "error";
      return;
    }
    await refreshClassFeatureItem();
    if (!sceneLifecycle.isCurrent(sceneOperation)) {
      status.textContent = "Scena cambiata: riapri la scheda.";
      status.dataset.tone = "error";
      return;
    }
    status.textContent = successMessage;
    status.dataset.tone = "success";
  } catch (error) {
    console.warn("[initiative-card] class feature:", error?.message || error);
    status.textContent = error?.cancelled
      ? "Attivazione annullata."
      : error?.message || "Operazione non riuscita.";
    status.dataset.tone = error?.cancelled ? "" : "error";
  } finally {
    classFeatureMutating = false;
    if (sceneLifecycle.isReady()) {
      renderClassFeatures();
      // A feature may change the spell slots too (Font of Magic).
      renderSpellSlots();
    }
  }
}

function buildClassFeatureResourceRow(entry) {
  const row = document.createElement("div");
  row.className = "class-feature-resource";
  const copy = document.createElement("div");
  copy.className = "class-feature-resource-copy";
  const name = document.createElement("strong");
  name.textContent = entry.pool.name;
  const refresh = document.createElement("small");
  const refreshEvents = (Array.isArray(entry.refreshEvents) && entry.refreshEvents.length
    ? entry.refreshEvents
    : Array.isArray(entry.pool.refresh) ? entry.pool.refresh : [])
    .map((value) => typeof value === "string" ? value : value?.event)
    .filter(Boolean)
    .map((value) => String(value).replaceAll("_", " "));
  refresh.textContent = refreshEvents.length
    ? `Recupero: ${refreshEvents.join(", ")}`
    : "Recupero manuale";
  copy.append(name, refresh);
  if (entry.die) {
    const die = document.createElement("small");
    die.textContent = `Dado corrente: ${entry.die}`;
    copy.insertBefore(die, refresh);
  }
  const expression = String(entry.pool.capacity?.expression || "").trim();
  if (expression) {
    const maximum = document.createElement("small");
    maximum.textContent = `Massimo: ${expression}`;
    copy.insertBefore(maximum, refresh);
  }
  const special = classFeatureSpecialRefresh(
    entry.pool,
    profile?.characterBuild,
    "riposo_breve",
  );
  if (special) {
    const specialLabel = document.createElement("small");
    specialLabel.textContent = `Recupero speciale: +${special.amount} con riposo breve (liv. ${special.minClassLevel})`;
    copy.appendChild(specialLabel);
  }
  const value = document.createElement("span");
  value.className = "class-feature-resource-value";
  const resolvedMaximum = entry.unlimited
    ? null
    : resolveClassFeatureResourceMaximum(entry.pool, profile?.characterBuild, profile?.abilityModifiers).maximum;
  const maximumEditable = !entry.unlimited
    && entry.pool.capacity?.type === "formula"
    && resolvedMaximum === null;
  if (entry.unlimited) {
    value.textContent = "∞";
  } else {
    const current = document.createElement("span");
    current.textContent = String(entry.current ?? "–");
    const slash = document.createElement("span");
    slash.textContent = "/";
    value.append(current, slash);
    const maximum = document.createElement("span");
    maximum.textContent = String(entry.maximum ?? "–");
    if (maximumEditable && isGM) {
      maximum.className = "class-feature-resource-maximum-editable";
      maximum.title = "Clicca per modificare il massimo degli usi";
      maximum.setAttribute("role", "button");
      maximum.tabIndex = 0;
      const startMaximumEdit = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (classFeatureMutating || maximum.nextSibling) return;

        const maximumInput = document.createElement("input");
        maximumInput.type = "number";
        maximumInput.className = "class-feature-resource-maximum-input";
        maximumInput.min = "0";
        maximumInput.max = "9999";
        maximumInput.step = "1";
        maximumInput.inputMode = "numeric";
        maximumInput.value = entry.maximum === null ? "" : String(entry.maximum);
        maximumInput.placeholder = "max";
        maximumInput.title = "Imposta il massimo degli usi";
        maximumInput.setAttribute("aria-label", `Massimo usi di ${entry.pool.name}`);
        let editFinished = false;
        const restoreDisplay = () => {
          if (maximumInput.isConnected) maximumInput.replaceWith(maximum);
        };
        const cancelMaximum = () => {
          if (editFinished) return;
          editFinished = true;
          restoreDisplay();
        };
        const commitMaximum = () => {
          if (editFinished || classFeatureMutating) return;
          if (!maximumInput.value.trim()) {
            cancelMaximum();
            return;
          }
          if (!maximumInput.checkValidity()) {
            maximumInput.setCustomValidity("Inserisci un numero intero tra 0 e 9999.");
            maximumInput.reportValidity();
            return;
          }
          editFinished = true;
          void runClassFeatureMutation(
            () => adjustClassFeatureResource(item.id, entry.pool.id, {
              maximum: Number(maximumInput.value),
            }),
            `${entry.pool.name} aggiornata.`,
          );
        };
        maximumInput.addEventListener("input", () => maximumInput.setCustomValidity(""));
        maximumInput.addEventListener("blur", commitMaximum);
        maximumInput.addEventListener("keydown", (keyEvent) => {
          if (keyEvent.key === "Escape") {
            keyEvent.preventDefault();
            cancelMaximum();
          } else if (keyEvent.key === "Enter") {
            keyEvent.preventDefault();
            commitMaximum();
          }
        });
        maximum.replaceWith(maximumInput);
        maximumInput.focus({ preventScroll: true });
        maximumInput.select();
      };
      maximum.addEventListener("click", startMaximumEdit);
      maximum.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        startMaximumEdit(event);
      });
    }
    value.appendChild(maximum);
  }
  row.append(copy, value);

  if (isGM && !entry.unlimited) {
    const controls = document.createElement("div");
    controls.className = "class-feature-resource-controls";
    for (const [label, title, adjustment] of [
      ["−", "Consuma un uso", { delta: -1 }],
      ["+", "Recupera un uso", { delta: 1 }],
      ["↺", "Ripristina", { reset: true }],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.disabled = classFeatureMutating;
      button.addEventListener("click", () => void runClassFeatureMutation(
        () => adjustClassFeatureResource(item.id, entry.pool.id, adjustment),
        `${entry.pool.name} aggiornata.`,
      ));
      controls.appendChild(button);
    }
    row.appendChild(controls);
  }
  return row;
}

function classFeatureButton(label, title, operation, message, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.disabled = classFeatureMutating || disabled;
  button.addEventListener("click", () => void runClassFeatureMutation(operation, message));
  return button;
}

function wildMagicGuidance(row) {
  return WILD_MAGIC_GUIDANCE[row?.d100] || {
    where: "Bersagli e posizione indicati nell'effetto",
    duration: "Vedi effetto; fine manuale al tavolo",
    resolve: "Tiri, bersagli e conseguenze restano manuali.",
  };
}

function wildMagicField(label, value) {
  const field = document.createElement("div");
  field.className = "class-feature-wild-magic-field";
  const title = document.createElement("strong");
  title.textContent = label;
  const copy = document.createElement("span");
  copy.textContent = value;
  field.append(title, copy);
  return field;
}

function wildMagicOutcomeView(row, { onRestorePoints = null } = {}) {
  const outcome = document.createElement("div");
  outcome.className = "class-feature-wild-magic-outcome";
  const guidance = wildMagicGuidance(row);
  const effect = document.createElement("div");
  effect.className = "class-feature-wild-magic-effect";
  const effectLabel = document.createElement("strong");
  effectLabel.textContent = `Risultato ${row.d100}`;
  const effectText = document.createElement("span");
  effectText.textContent = row.effect;
  effect.append(effectLabel, effectText);
  outcome.append(
    effect,
    wildMagicField("Dove", guidance.where),
    wildMagicField("Durata/Fine", guidance.duration),
    wildMagicField("Da risolvere al tavolo", guidance.resolve),
  );
  if (row.spellId) {
    const spell = getSpellDefinition(row.spellId);
    if (spell) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "class-feature-spell-link";
      link.textContent = `Record Incantesimi: ${spell.displayName || spell.catalogLabel || spell.name}`;
      link.title = `Consultazione di ${spell.id}; il lancio resta manuale`;
      link.dataset.spellId = spell.id;
      link.addEventListener("click", () => window.alert(
        `${spell.displayName || spell.name}\n\n${spell.description || "Consultare il record Incantesimi."}`
      ));
      outcome.appendChild(link);
    }
  }
  if (row.noConcentration) {
    const rule = document.createElement("small");
    rule.className = "class-feature-wild-magic-rule";
    rule.textContent = "Questo esito ignora la concentrazione e resta attivo per la durata completa.";
    outcome.appendChild(rule);
  }
  if (row.d100 === "99-00" && typeof onRestorePoints === "function") {
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Conferma recupero punti stregoneria";
    restore.title = "Ripristina il pool punti (annullabile dalla cronologia)";
    restore.disabled = classFeatureMutating;
    restore.addEventListener("click", () => void onRestorePoints());
    outcome.appendChild(restore);
  }
  return outcome;
}

function buildWildMagicViewer({ recoverTides = false } = {}) {
  const feature = CLASS_FEATURE_BY_ID.get(WILD_MAGIC_SURGE_FEATURE_ID);
  const rows = Array.isArray(feature?.wildMagicTable) ? feature.wildMagicTable : [];
  const viewer = document.createElement("div");
  viewer.className = "class-feature-wild-magic-viewer";
  if (!rows.length) {
    viewer.textContent = "Tabella Impulsi non disponibile.";
    return viewer;
  }
  const heading = document.createElement("strong");
  heading.textContent = recoverTides
    ? "Impulso richiesto dal DM: inserisci il d100"
    : "Consulta risultato Impulsi di Magia Selvaggia";
  viewer.appendChild(heading);
  const controlled = getEnabledClassFeatures(profile)
    .some((entry) => entry.id === WILD_MAGIC_CONTROLLED_FEATURE_ID);
  const controls = document.createElement("div");
  controls.className = "class-feature-wild-magic-controls";
  const options = rows.map((row) => [row.d100, row.d100]);
  let firstSelect = null;
  let secondSelect = null;
  let choiceSelect = null;
  if (controlled) {
    const firstLabel = document.createElement("label");
    firstLabel.textContent = "Risultato manuale A";
    firstSelect = selectControl([["", "Scegli A"], ...options]);
    firstLabel.appendChild(firstSelect);
    const secondLabel = document.createElement("label");
    secondLabel.textContent = "Risultato manuale B";
    secondSelect = selectControl([["", "Scegli B"], ...options]);
    secondLabel.appendChild(secondSelect);
    const choiceLabel = document.createElement("label");
    choiceLabel.textContent = "Scelta finale"
    choiceSelect = selectControl([["A", "Usa A"], ["B", "Usa B"]]);
    choiceLabel.appendChild(choiceSelect);
    controls.append(firstLabel, secondLabel, choiceLabel);
  } else {
    const label = document.createElement("label");
    label.textContent = "Risultato d100 tirato al tavolo";
    firstSelect = selectControl([["", "Scegli intervallo"], ...options]);
    label.appendChild(firstSelect);
    controls.appendChild(label);
  }
  const result = document.createElement("div");
  result.className = "class-feature-wild-magic-result";
  result.hidden = true;
  const restoreTides = document.createElement("button");
  restoreTides.type = "button";
  restoreTides.textContent = "Conferma Impulso richiesto dal DM";
  restoreTides.title = "Recupera Onde di Caos solo dopo conferma";
  restoreTides.hidden = !recoverTides;
  restoreTides.disabled = true;
  restoreTides.addEventListener("click", () => {
    if (!window.confirm("Il DM ha confermato che l'Impulso è stato richiesto?")) return;
    void runClassFeatureMutation(
      () => restoreWildMagicTidesOfChaos(item.id),
      "Onde di Caos recuperate.",
    );
  });
  const renderSelectedResult = () => {
    const range = controlled
      ? (choiceSelect?.value === "B" ? secondSelect?.value : firstSelect?.value)
      : firstSelect?.value;
    const row = rows.find((entry) => entry.d100 === range);
    if (!row) {
      result.replaceChildren();
      result.hidden = true;
      restoreTides.disabled = true;
      return;
    }
    result.replaceChildren(wildMagicOutcomeView(row, {
      onRestorePoints: row.d100 === "99-00"
        ? () => {
          if (!window.confirm("Confermare il recupero di tutti i punti stregoneria?")) return;
          void runClassFeatureMutation(
            () => adjustClassFeatureResource(item.id, SORCERY_POINTS_POOL_ID, { reset: true }),
            "Punti stregoneria ripristinati.",
          );
        }
        : null,
    }));
    result.hidden = false;
    restoreTides.disabled = false;
  };
  for (const select of [firstSelect, secondSelect, choiceSelect]) {
    select?.addEventListener("change", renderSelectedResult);
  }
  viewer.append(controls, result, restoreTides);
  return viewer;
}

function buildWildMagicSurgeControls() {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-wild-magic-controls-wrap";
  // The d100 engine (wild-magic-surge.html) applies the outcome; the viewer below only reads the table.
  if (isGM) {
    const engine = document.createElement("button");
    engine.type = "button";
    engine.textContent = "Tira l'Impulso";
    engine.title = "Scrivi il d100: il motore applica l'esito dove può";
    engine.addEventListener("click", () => void OBR.popover.open({
      id: `${ID}/wild-magic-surge`,
      url: `/wild-magic-surge.html?source=${encodeURIComponent(item.id)}`,
      width: 420,
      height: 600,
      anchorReference: "POSITION",
      anchorPosition: { left: 120, top: 80 },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      hidePaper: true,
    }).catch(() => {}));
    controls.appendChild(engine);
  }
  const viewer = buildWildMagicViewer();
  controls.appendChild(viewer);
  return controls;
}

function buildWildMagicTidesControls() {
  const entry = classFeatureResourceEntries(
    getClassFeatureState(item),
    [CLASS_FEATURE_BY_ID.get(WILD_MAGIC_TIDES_FEATURE_ID)],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
    profile?.abilityModifiers,
  ).find((value) => value.pool.id === WILD_MAGIC_TIDES_POOL_ID);
  const current = entry?.current ?? 0;
  const button = classFeatureButton(
    "Attiva",
    "Consuma l'unico uso e applica vantaggio al tiro fisico scelto",
    () => activateClassFeature({
      sourceId: item.id,
      featureId: WILD_MAGIC_TIDES_FEATURE_ID,
    }),
    "Onde di Caos attivate.",
    current <= 0,
  );
  button.className = "class-feature-tides-button";
  return button;
}

function buildSorcerousRestorationControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(SORCERY_POINTS_POOL_ID);
  const entry = classFeatureResourceEntries(
    state,
    [{ trackedResourcePoolIds: [SORCERY_POINTS_POOL_ID] }],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
    profile?.abilityModifiers,
  ).find((value) => value.pool.id === SORCERY_POINTS_POOL_ID);
  const special = classFeatureSpecialRefresh(pool, profile?.characterBuild, "riposo_breve");
  const unavailable = !special || (entry?.maximum !== null && entry?.current >= entry?.maximum);
  controls.appendChild(classFeatureButton(
    "Recupera 4",
    "Recupera 4 punti, senza superare il massimo",
    () => applySorcerousRestoration({ sourceId: item.id, featureId: feature.id }),
    "Ripristino Stregonesco applicato.",
    unavailable,
  ));
  return controls;
}

function buildSorcerySourceControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-sorcery-source-controls";
  const createLabel = document.createElement("label");
  createLabel.textContent = "Crea slot";
  const createSelect = document.createElement("select");
  for (let level = 1; level <= 5; level += 1) {
    const cost = classFeatureSpellSlotCreationCost(feature, level);
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Livello ${level} · ${cost} punti`;
    createSelect.appendChild(option);
  }
  createLabel.appendChild(createSelect);
  const createButton = classFeatureButton(
    "Crea slot",
    "Consuma punti e aggiunge uno slot, anche oltre il massimo, fino al riposo lungo",
    () => createClassFeatureSpellSlot({
      sourceId: item.id,
      featureId: feature.id,
      slotLevel: Number(createSelect.value),
    }),
    "Slot temporaneo creato.",
  );

  const convertLabel = document.createElement("label");
  convertLabel.textContent = "Converti uno slot";
  const convertSelect = document.createElement("select");
  for (let level = 1; level <= 9; level += 1) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Livello ${level} → +${level} punti`;
    convertSelect.appendChild(option);
  }
  convertLabel.appendChild(convertSelect);
  const convertButton = classFeatureButton(
    "Converti slot",
    "Spende uno slot di quel livello e recupera i punti stregoneria",
    () => convertClassFeatureSpellSlot({
      sourceId: item.id,
      featureId: feature.id,
      slotLevel: Number(convertSelect.value),
    }),
    "Slot convertito in punti.",
  );
  const note = document.createElement("small");
  note.textContent = "Gli slot si aggiornano nella scheda Incantesimi; quelli creati restano fino a quando li spendi o al riposo lungo.";
  controls.append(createLabel, createButton, convertLabel, convertButton, note);
  return controls;
}

function buildTwinnedSpellControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const label = document.createElement("label");
  label.textContent = "Livello dell'incantesimo (0–9)";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "9";
  input.step = "1";
  input.value = "0";
  label.appendChild(input);
  const button = classFeatureButton(
    "Conferma consumo",
    "Costo: 1 per trucchetto, altrimenti pari al livello dell'incantesimo",
    () => {
      const cost = classFeatureTwinnedSpellCost(input.value);
      if (cost === null) throw new Error("Inserisci un livello di incantesimo tra 0 e 9.");
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        resourceValues: { [SORCERY_POINTS_POOL_ID]: cost },
      });
    },
    "Incantesimo Raddoppiato confermato.",
  );
  controls.append(label, button);
  return controls;
}

// A species teleport (speciesTeleportCore.js): the creatures selected first (the season's, or Spring's willing one),
// then the card folds to its header while the GM picks the free cell within range on the map (the boss's teleport
// tool), then one command moves the token, spends the use and applies the season or the resistance.
async function teleportWithSpeciesTrait(feature) {
  if (!item || classFeatureMutating) return;
  const sourceId = item.id;
  const targetIds = (await OBR.player.getSelection().catch(() => []) || []).filter((id) => id !== sourceId);
  const status = $("classFeatureRunStatus");
  status.textContent = "Scegli sulla mappa la casella di arrivo; Esc annulla.";
  status.dataset.tone = "";
  const popoverId = `${ID}/initiative-card-modal`;
  let height = 0;
  try {
    height = Number(await OBR.popover.getHeight(popoverId)) || 560;
    await OBR.popover.setHeight(popoverId, 48);
  } catch {}
  let result;
  try {
    result = await requestSpellAreaPlacement({ ruleId: speciesTeleportRuleId(feature), casterId: sourceId,
      context: { phase: "species-trait", pointSelection: true, directPointSelection: true, autoConfirmPoint: true } },
    { broadcast: OBR.broadcast, windowRef: window });
  } catch (error) {
    result = { status: "error", error: String(error?.message || error) };
  }
  try {
    if (height) await OBR.popover.setHeight(popoverId, height);
  } catch {}
  const position = result?.status === "confirmed" ? spellTeleportDestinationPosition(result.preview) : null;
  if (!position) {
    status.textContent = result?.status === "cancelled" ? "Teletrasporto annullato." : `Destinazione non scelta${result?.error ? `: ${result.error}` : ""}.`;
    return;
  }
  await runClassFeatureMutation(
    () => applySpeciesTeleport({ sourceId, featureId: feature.id, targetIds, position }),
    `${feature.name}: teletrasporto eseguito.`,
  );
}

function buildSpeciesTeleportControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const info = speciesTeleportInfo(feature, profile);
  const note = document.createElement("small");
  note.textContent = info.spec ? `${info.text} Seleziona prima le creature, poi Teletrasporta.` : info.text;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Teletrasporta";
  button.title = "Scegli la casella di arrivo sulla mappa; l'uso si spende col teletrasporto";
  button.disabled = classFeatureMutating || classFeatureResourceRemaining(feature, state) === 0;
  button.addEventListener("click", () => void teleportWithSpeciesTrait(feature));
  controls.append(note, button);
  return controls;
}

// A species' natural weapon (speciesNaturalWeaponCore.js): added to the card's attacks, filled from the trait, with a
// partial save of the card (the other fields stay as stored).
async function addSpeciesNaturalWeapon(feature) {
  const operation = sceneLifecycle.capture({ operationId: `initiative-natural-weapon:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !isGM || !item) return;
  const status = $("classFeatureRunStatus");
  const attack = speciesNaturalWeaponAction(feature, profile);
  const state = speciesNaturalWeaponState(feature, profile);
  if (!attack || state.present) return;
  if (state.full) {
    status.textContent = "Attacchi al completo: togline uno dalla scheda.";
    status.dataset.tone = "error";
    return;
  }
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await saveInitiativeCard(item.id, item.name, { quickActions: [...(Array.isArray(profile?.quickActions) ? profile.quickActions : []), attack] }, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
      preserveExhaustion: true,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    [item] = await OBR.scene.items.getItems([item.id]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    profile = getInitiativeCard(item);
    renderClassFeatures();
    renderQuickActions();
    status.textContent = `${attack.label} aggiunto agli Attacchi.`;
    status.dataset.tone = "success";
  } catch (error) {
    status.textContent = error?.message || "Salvataggio non riuscito.";
    status.dataset.tone = "error";
  }
}

function buildNaturalWeaponControl(feature) {
  const attack = speciesNaturalWeaponAction(feature, profile);
  const state = speciesNaturalWeaponState(feature, profile);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = state.present ? "Già tra gli Attacchi" : "Aggiungi agli Attacchi";
  button.title = attack ? `${attack.label}: ${attack.components[0]?.formula || ""} in mischia` : "";
  button.disabled = !attack || state.present;
  button.addEventListener("click", () => void addSpeciesNaturalWeapon(feature));
  return button;
}

// The option of a species trait that asks a die for its temporary hit points (Fey Gift's Hospitality), or null.
function speciesChoiceDieOption(feature, choiceId) {
  if (!feature?.speciesId || !choiceId) return null;
  return (Array.isArray(feature.choiceOptions) ? feature.choiceOptions : [])
    .find((option) => option?.id === choiceId && option?.temporaryHp?.bonusDie) || null;
}

// An innate spell of the species (speciesInnateSpellCore.js): the spell panel opens on the spell, without a slot, at
// the trait's level; the cast spends the trait's use and takes its DC.
async function openSpeciesSpell(feature) {
  const request = speciesSpellOpenRequest(feature, item?.id);
  if (!request) return;
  await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, { type: "open", ...request }, { destination: "LOCAL" });
}

function buildSpeciesSpellControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const cast = speciesSpellCast({ actionId: speciesSpellActionId(feature.id), card: profile, resources: state?.resources });
  const note = document.createElement("small");
  note.textContent = cast?.dc !== null && cast?.dc !== undefined
    ? `Senza slot · CD ${cast.dc} (${cast.abilityLabel}); l'uso si spende al lancio.`
    : "Senza slot; l'uso si spende al lancio.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Lancia";
  button.title = "Apre il pannello incantesimi su questo incantesimo, senza slot";
  button.disabled = classFeatureMutating;
  button.addEventListener("click", async () => {
    if (!item) return;
    await openSpeciesSpell(feature);
    closeInitiativeCardPopover();
  });
  controls.append(note, button);
  return controls;
}

// A breath weapon opens the PC attack console: the creatures of its area, their saves and the damage; its use is
// spent when the attack is confirmed there.
// Acid Spit (one creature) shows Sputa; the metallic breath one button per option.
function buildBreathControls(feature) {
  const variants = Object.entries(feature.breath?.variants || {});
  const entries = variants.length
    ? variants.map(([variant, option]) => [option.label.replace(/^Soffio /u, "").replace(/^./u, (letter) => letter.toUpperCase()), variant])
    : [[feature.breath?.shape === "target" ? "Sputa" : "Soffia", ""]];
  const buttons = entries.map(([label, variant]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = "Apre la console d'attacco: creature, tiri salvezza ed effetti. L'uso si spende alla conferma.";
    button.disabled = classFeatureMutating;
    button.addEventListener("click", async () => {
      if (!item) return;
      await openPcAttackPopover(item.id, pcAttackBreathActionId(feature.id, variant));
      closeInitiativeCardPopover();
    });
    return button;
  });
  if (buttons.length === 1) return buttons[0];
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  controls.append(...buttons);
  return controls;
}

// A species trait that changes hit points (speciesHpTraitCore.js): the roll it needs, the amount from the sheet; the
// runtime writes the HP and spends the use in one command (one Undo).
function buildSpeciesHpTraitControls(feature, state, active = []) {
  const spec = feature.hpTrait;
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const spent = classFeatureResourceRemaining(feature, state) === 0;
  const hp = Number(item?.metadata?.[META_KEY]?.hp);
  const note = (text) => {
    const small = document.createElement("small");
    small.textContent = text;
    controls.appendChild(small);
    return small;
  };
  const numberField = (labelText, { min = 1, max = null, placeholder = "" } = {}) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.step = "1";
    input.inputMode = "numeric";
    if (max !== null) input.max = String(max);
    if (placeholder) input.placeholder = placeholder;
    label.appendChild(input);
    controls.appendChild(label);
    return input;
  };
  const apply = (label, title, values, message, disabled = false) => {
    controls.appendChild(classFeatureButton(label, title, async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      await applySpeciesHpTrait({ sourceId: item.id, featureId: feature.id, targetIds, ...values() });
    }, message, spent || disabled));
  };
  const amount = spec.amount ? speciesHpTraitAmount(spec.amount, profile) : null;
  const amountText = amount === null ? "?" : String(amount);
  if (spec.kind === "relentless") {
    note(hp > 0 ? "Disponibile a 0 PF, quando il personaggio ci scende." : "A 0 PF: il personaggio può restare a 1 PF.");
    apply("Resta a 1 PF", "Riporta i PF da 0 a 1 e spende l'uso", () => ({}), `${feature.name}: resta a 1 PF.`, !(hp <= 0));
  } else if (spec.kind === "heal") {
    const dice = speciesHealDice(spec, profile);
    note(dice
      ? `Tira ${dice.label} al tavolo e inserisci il totale. Seleziona la creatura toccata (nessuna: il personaggio stesso).`
      : `Cura ${amountText} PF (${speciesHpTraitAmountLabel(spec.amount)}). Seleziona la creatura toccata (nessuna: il personaggio stesso).`);
    const input = dice ? numberField(`Totale ${dice.label}`, { min: dice.min, max: dice.max, placeholder: `${dice.min}–${dice.max}` }) : null;
    apply("Cura", "Cura la creatura selezionata entro 1,5 m e spende l'uso", () => ({ value: input?.value ?? "" }), `${feature.name} usata.`);
  } else if (spec.kind === "temp" && spec.onHit) {
    note(`Se il morso colpisce: ${amountText} PF temporanei (${speciesHpTraitAmountLabel(spec.amount)}). L'uso si spende anche se manca.`);
    apply("Colpito", `Ottieni ${amountText} PF temporanei e spendi l'uso`, () => ({ hit: true }), `${feature.name}: PF temporanei applicati.`);
    apply("Mancato", "Spende soltanto l'uso", () => ({ hit: false }), `${feature.name}: uso speso.`);
  } else if (spec.kind === "temp") {
    note(`${amountText} PF temporanei (${speciesHpTraitAmountLabel(spec.amount)}); non si sommano a quelli che hai già.`);
    apply("Usa", `Ottieni ${amountText} PF temporanei e spendi l'uso`, () => ({}), `${feature.name}: PF temporanei applicati.`);
  } else if (spec.kind === "shift") {
    const alreadyActive = active.some((entry) => entry.featureId === feature.id);
    note(`Ottieni ${amountText} PF temporanei${spec.bonusDie ? ` + ${spec.bonusDie}` : ""} (${speciesHpTraitAmountLabel(spec.amount)}).`);
    const input = spec.bonusDie ? numberField(`${spec.bonusDie} tirato`, { min: 1, max: 6, placeholder: "1–6" }) : null;
    controls.appendChild(classFeatureButton(
      "Attiva",
      alreadyActive ? "La mutazione è già attiva" : "Attiva la mutazione con i suoi PF temporanei",
      () => activateClassFeature({ sourceId: item.id, featureId: feature.id, value: input?.value ?? "" }),
      `${feature.name} attivata.`,
      spent || alreadyActive,
    ));
  } else if (spec.kind === "reduce") {
    const hint = speciesReductionHint(spec, profile);
    const info = note("Ultimi danni: ricerca nella cronologia…");
    const rollInput = numberField(`Riduzione (${hint})`, { min: 1, placeholder: hint });
    const damageInput = numberField("Danni subiti", { min: 1 });
    void previewSpeciesHpTrait({ sourceId: item.id, featureId: feature.id }).then(({ lastDamage }) => {
      if (lastDamage) {
        damageInput.value = String(lastDamage.amount);
        damageInput.disabled = true;
        info.textContent = `Ultimi danni dalla cronologia: ${lastDamage.amount} (PF ${lastDamage.beforeHP} → ${lastDamage.afterHP}).`;
      } else {
        info.textContent = "Ultimi danni non trovati nella cronologia: inseriscili a mano.";
      }
    }).catch(() => {
      info.textContent = "Inserisci i danni subiti.";
    });
    apply("Riduci", "Restituisce i PF della riduzione e spende l'uso",
      () => ({ value: rollInput.value, damage: damageInput.value }), `${feature.name}: danni ridotti.`);
  }
  return controls;
}

function buildResourceOnlyControls(feature) {
  return classFeatureButton(
    "Conferma consumo",
    "Consuma soltanto la risorsa; non crea etichette o effetti automatici",
    () => activateClassFeature({ sourceId: item.id, featureId: feature.id }),
    `${feature.name} confermata.`,
  );
}

function buildUnsettlingWordsControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("bardo-ispirazione-bardica-usi");
  const die = resolveClassFeatureResourceDie(pool, profile?.characterBuild);
  const faces = Number(String(die || "").match(/d(\d+)/iu)?.[1]);
  const remaining = classFeatureResourceRemaining(feature);

  const note = document.createElement("small");
  note.textContent = "Tira il dado di Ispirazione Bardica al tavolo; inserisci soltanto il risultato già ottenuto e seleziona una creatura entro 18 m.";

  const valueLabel = document.createElement("label");
  valueLabel.textContent = `Risultato del dado${die ? ` (${die})` : ""}`;
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "1";
  valueInput.step = "1";
  valueInput.inputMode = "numeric";
  valueInput.required = true;
  if (Number.isInteger(faces) && faces > 0) valueInput.max = String(faces);
  valueInput.placeholder = Number.isInteger(faces) && faces > 0 ? `1–${faces}` : "risultato";
  valueInput.title = Number.isInteger(faces) && faces > 0
    ? `Inserisci un intero tra 1 e ${faces}`
    : "Dado di Ispirazione Bardica non disponibile";
  valueLabel.appendChild(valueInput);

  const button = classFeatureButton(
    "Conferma risultato",
    "Consuma un uso di Ispirazione Bardica e crea il promemoria sul bersaglio",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        value: valueInput.value,
      });
    },
    `${feature.name} registrata.`,
    remaining === 0 || !Number.isInteger(faces) || faces < 1,
  );
  controls.append(note, valueLabel, button);
  return controls;
}

function buildTurnCreaturesControls(feature, { legacyTurnUndead = false } = {}) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const remaining = classFeatureResourceRemaining(feature);

  const note = document.createElement("small");
  note.textContent = legacyTurnUndead
    ? "Dopo aver risolto al tavolo i TS Saggezza e Distruggere Non Morti, seleziona soltanto i fallimenti non distrutti. Tipo, vista, udito, GS e danni restano manuali."
    : "Dopo aver risolto al tavolo i TS Saggezza, seleziona soltanto le creature che hanno fallito. Tipo, vista, udito e danni restano manuali.";

  const failedTargets = classFeatureButton(
    legacyTurnUndead ? "Marca fallimenti" : "Applica ai fallimenti selezionati",
    `Consuma un uso e applica ${feature.name} ai token selezionati`,
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: "failed-targets",
      });
    },
    `${feature.name} applicata ai fallimenti selezionati.`,
    remaining === 0,
  );
  const noTargets = classFeatureButton(
    legacyTurnUndead ? "Nessun bersaglio da marcare" : "Nessun fallimento",
    `Consuma l'uso di ${feature.name} senza creare etichette`,
    () => activateClassFeature({
      sourceId: item.id,
      featureId: feature.id,
      mode: "no-targets",
    }),
    `Uso di ${feature.name} consumato senza etichette.`,
    remaining === 0,
  );
  controls.append(note, failedTargets, noTargets);
  return controls;
}

function buildTurnUndeadControls(feature) {
  return buildTurnCreaturesControls(feature, { legacyTurnUndead: true });
}

function buildUniversalSpeechControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";

  const note = document.createElement("small");
  note.textContent = "Seleziona uno o più token, includendo il Bardo se desiderato. Visibilità e limite basato sul Carisma restano conferme del tavolo.";

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Pagamento";
  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["daily", "Uso gratuito (recupera con riposo lungo)"],
    ["slot", "Slot già speso"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);

  const confirmationLabel = document.createElement("label");
  const confirmation = document.createElement("input");
  confirmation.type = "checkbox";
  confirmationLabel.append(confirmation, " Confermo che lo slot è già stato speso");
  const syncConfirmation = () => {
    confirmationLabel.hidden = modeSelect.value !== "slot";
    if (modeSelect.value !== "slot") confirmation.checked = false;
  };
  modeSelect.addEventListener("change", syncConfirmation);
  syncConfirmation();

  const button = classFeatureButton(
    "Attiva Linguaggio Universale",
    "Crea un promemoria di comprensione unidirezionale per 1 ora",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: modeSelect.value,
        slotConfirmed: confirmation.checked,
      });
    },
    `${feature.name} attivato.`,
  );
  controls.append(note, modeLabel, confirmationLabel, button);
  return controls;
}

function buildNightEyesControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";

  const note = document.createElement("small");
  note.textContent = "La scurovisione personale di 90 m resta descrittiva. Seleziona creature consenzienti entro 3 m; visibilità e limite basato su SAG restano conferme del tavolo.";

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Pagamento";
  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["daily", "Uso gratuito (recupera con riposo lungo)"],
    ["slot", "Slot già speso"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);

  const confirmationLabel = document.createElement("label");
  const confirmation = document.createElement("input");
  confirmation.type = "checkbox";
  confirmationLabel.append(confirmation, " Confermo che lo slot è già stato speso");
  const syncConfirmation = () => {
    confirmationLabel.hidden = modeSelect.value !== "slot";
    if (modeSelect.value !== "slot") confirmation.checked = false;
  };
  modeSelect.addEventListener("change", syncConfirmation);
  syncConfirmation();

  const button = classFeatureButton(
    "Condividi Occhi della Notte",
    "Crea un promemoria di scurovisione condivisa per 1 ora",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: modeSelect.value,
        slotConfirmed: confirmation.checked,
      });
    },
    feature.name + " attivato.",
  );
  controls.append(note, modeLabel, confirmationLabel, button);
  return controls;
}

function buildContagiousInspirationControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const note = document.createElement("small");
  note.textContent = "Conferma al tavolo il successo dell'Ispirazione precedente, poi seleziona un nuovo destinatario diverso dal Bardo entro 18 m.";
  const button = classFeatureButton(
    "Conferma reazione",
    "Consuma soltanto il pool di Ispirazione Contagiosa e concede la normale Ispirazione Bardica",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
      });
    },
    `${feature.name} registrata.`,
  );
  controls.append(note, button);
  return controls;
}

function buildSpellThiefControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-spell-thief-controls";

  const note = document.createElement("small");
  note.textContent = "Seleziona una sola creatura-lanciatore sulla mappa; trigger, CD e TS sono già stati confermati al tavolo.";

  const spellLabel = document.createElement("label");
  spellLabel.textContent = "Incantesimo";
  const spellInput = document.createElement("input");
  spellInput.type = "text";
  spellInput.placeholder = "Nome o ID dal catalogo";
  spellInput.setAttribute("list", "quickActionSpellOptions");
  spellInput.autocomplete = "off";
  spellInput.spellcheck = false;
  spellLabel.appendChild(spellInput);

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Risoluzione";
  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["deny", "Solo effetto negato"],
    ["steal", "Incantesimo rubato per 8 ore"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);

  const confirmationLabel = document.createElement("label");
  const confirmation = document.createElement("input");
  confirmation.type = "checkbox";
  confirmationLabel.append(confirmation, " Confermo che il Ladro può lanciare questo livello");

  const syncConfirmation = () => {
    confirmationLabel.hidden = modeSelect.value !== "steal";
    confirmation.checked = modeSelect.value !== "steal" ? false : confirmation.checked;
  };
  modeSelect.addEventListener("change", syncConfirmation);
  syncConfirmation();

  const button = classFeatureButton(
    "Conferma reazione",
    "Consuma 1 uso dopo la conferma manuale del trigger e del TS",
    async () => {
      const spell = getSpellDefinition(spellInput.value);
      if (!spell) throw new Error("Seleziona un incantesimo dal catalogo.");
      const targetIds = await classFeatureSelectionTargetIds(feature);
      return activateClassFeature({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        spellId: spell.id,
        spellMode: modeSelect.value,
        spellLevelConfirmed: confirmation.checked,
      });
    },
    `${feature.name} registrata.`,
  );
  controls.append(note, spellLabel, modeLabel, confirmationLabel, button);
  return controls;
}

function buildLayOnHandsControls(feature, state) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls class-feature-lay-on-hands-controls";
  const remaining = classFeatureResourceRemaining(feature, state);
  const valueLabel = document.createElement("label");
  valueLabel.textContent = "Punti";
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "1";
  valueInput.step = "1";
  valueInput.value = remaining === 0 ? "" : "1";
  if (remaining !== null) valueInput.max = String(remaining);
  valueInput.title = remaining === null
    ? "Punti della riserva da spendere"
    : `Massimo ${remaining} punti disponibili`;
  valueLabel.appendChild(valueInput);

  const conditionLabel = document.createElement("label");
  conditionLabel.textContent = "Malattie/veleni";
  const conditionInput = document.createElement("input");
  conditionInput.type = "number";
  conditionInput.min = "1";
  conditionInput.step = "1";
  conditionInput.value = "1";
  if (remaining !== null) conditionInput.max = String(Math.floor(remaining / 5));
  conditionLabel.appendChild(conditionInput);

  const makeButton = (label, title, operation, message) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.disabled = classFeatureMutating || remaining === 0;
    button.addEventListener("click", () => void runClassFeatureMutation(operation, message));
    return button;
  };
  const heal = makeButton(
    "Cura",
    "Spendi punti per ripristinare HP",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      await applyLayOnHands({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        value: valueInput.value,
        mode: "heal",
      });
    },
    `${feature.name} usata per curare.`,
  );
  const disease = makeButton(
    "Rimuovi",
    "Spendi 5 punti per ogni malattia o veleno",
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      await applyLayOnHands({
        sourceId: item.id,
        featureId: feature.id,
        targetIds,
        mode: "disease-poison",
        conditionCount: conditionInput.value,
      });
    },
    `${feature.name} usata per malattie/veleni.`,
  );
  controls.append(valueLabel, heal, conditionLabel, disease);
  return controls;
}

function buildPurifyingTouchControls(feature) {
  const controls = document.createElement("div");
  controls.className = "class-feature-special-controls";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Rimuovi incantesimo";
  button.title = "Seleziona un bersaglio e scegli un suo incantesimo attivo";
  button.disabled = classFeatureMutating;
  button.addEventListener("click", () => void runClassFeatureMutation(
    async () => {
      const targetIds = await classFeatureSelectionTargetIds(feature);
      const selected = await choosePurifyingSpell(targetIds);
      await purifyClassFeatureSpell({ sourceId: item.id, featureId: feature.id, ...selected });
    },
    `${feature.name} applicato.`,
  ));
  controls.appendChild(button);
  return controls;
}

function buildAdditionalSpellsSummary({ subclass, entries }) {
  const box = document.createElement("div");
  box.className = "class-feature-additional-spells";
  const title = document.createElement("strong");
  title.textContent = "Incantesimi del " + (subclass?.name || "sottoclasse");
  const note = document.createElement("small");
  note.textContent = "Sempre preparati; non contano nel limite degli incantesimi preparati.";
  box.append(title, note);
  const list = document.createElement("ul");
  list.className = "class-feature-additional-spells-list";
  const byLevel = new Map();
  for (const entry of entries) {
    const spells = byLevel.get(entry.level) || [];
    const definition = getSpellDefinition(entry.name);
    spells.push(definition?.catalogLabel || entry.name);
    byLevel.set(entry.level, spells);
  }
  for (const [level, spells] of byLevel) {
    const row = document.createElement("li");
    row.className = "class-feature-additional-spell-row";
    const levelLabel = document.createElement("strong");
    levelLabel.className = "class-feature-additional-spell-level";
    levelLabel.textContent = `Livello ${level}`;
    const names = document.createElement("span");
    names.className = "class-feature-additional-spell-names";
    names.textContent = spells.join(", ");
    row.append(levelLabel, names);
    list.appendChild(row);
  }
  box.appendChild(list);
  return box;
}

function renderClassFeatures() {
  if (!profile || !item) return;
  const enabled = getEnabledClassFeatures(profile);
  const orderedEnabled = orderClassFeaturesByParent(enabled);
  const state = getClassFeatureState(item);
  const active = activeClassFeatureInstances(state, currentRoundValue);

  const buildSummary = $("classBuildSummary");
  const speciesLabel = speciesDisplayName(profile?.[SPECIES_FIELD]);
  const giftLabel = supernaturalGiftDisplayName(profile?.[SUPERNATURAL_GIFT_FIELD]);
  const buildLabels = [...(speciesLabel ? [speciesLabel] : []), ...(giftLabel ? [giftLabel] : []), ...classFeatureBuildLabel(profile.characterBuild)];
  buildSummary.replaceChildren(...(
    buildLabels.length
      ? buildLabels.map((text) => {
        const badge = document.createElement("span");
        badge.className = "class-build-badge";
        badge.textContent = text;
        return badge;
      })
      : [classFeatureEmpty("Nessuna classe configurata.")]
  ));

  const resources = classFeatureResourceEntries(
    state,
    enabled,
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile.characterBuild,
    profile?.abilityModifiers,
  );
  $("classFeatureResources").replaceChildren(...(
    resources.length
      ? resources.map(buildClassFeatureResourceRow)
      : [classFeatureEmpty("Nessuna risorsa da tracciare.")]
  ));
  const restActions = $("classFeatureRestActions");
  restActions.hidden = !isGM || !resources.length;
  restActions.replaceChildren(...(restActions.hidden ? [] : buildRestActions("classFeatureRunStatus").childNodes));

  $("classFeatureActive").replaceChildren(...(
    active.length
      ? active.map((instance) => {
        const feature = CLASS_FEATURE_BY_ID.get(instance.featureId);
        const row = document.createElement("div");
        row.className = "class-feature-active-row";
        const theme = classFeatureTheme(feature);
        row.style.setProperty("--feature-accent", theme.accent);
        row.style.setProperty("--feature-background", `${theme.background}26`);
        const copy = document.createElement("div");
        copy.className = "class-feature-active-copy";
        const name = document.createElement("strong");
        name.textContent = feature
          ? classFeatureInstanceDisplayName(feature, instance)
          : instance.featureId;
        const detail = document.createElement("small");
        const remaining = classFeatureRemainingRounds(instance, currentRoundValue);
        const targetCount = instance.targetIds.filter((id) => id !== item.id).length;
        const projection = classFeatureEffectProjection(
          feature,
          instance.choiceId,
          profile?.characterBuild,
        );
        const bardicInspirationDie = (
          feature?.id === BARDIC_INSPIRATION_FEATURE_ID
          || projection.conditionEffectId === BARDIC_INSPIRATION_FEATURE_ID
        )
          ? resources.find((entry) => entry.pool.id === "bardo-ispirazione-bardica-usi")?.die
          : null;
        const targeting = classFeatureTargeting(feature, profile?.characterBuild);
        const isAuraToggle = targeting.mode === "aura"
          && feature?.trackingMode !== "instant";
        const parentFeatureId = classFeatureDurationParentFeatureId(feature);
        const parentFeature = parentFeatureId
          ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
          : null;
        const durationTiming = classFeatureDurationTiming(feature);
        const temporarySlotLevel = feature?.id === SORCERY_SOURCE_FEATURE_ID
          ? Number(String(instance.choiceId || "").replace(/^slot-/, ""))
          : null;
        const durationLabel = bardicInspirationDie
          ? `Dado concesso: ${bardicInspirationDie}`
          : Number.isInteger(temporarySlotLevel) && temporarySlotLevel >= 1
          ? `slot temporaneo di livello ${temporarySlotLevel}; termina quando speso o al riposo lungo`
          : durationTiming === "next-turn"
          ? feature?.id === UNSETTLING_WORDS_FEATURE_ID
            ? "fino all'inizio del prossimo turno"
            : "fino al prossimo turno"
          : durationTiming === "next-turn-end"
            ? "fino al termine del prossimo turno"
          : durationTiming === "turn-end"
            ? "fino alla fine del turno corrente"
          : parentFeature
            ? `fino al termine di ${parentFeature.name || parentFeatureId}`
          : remaining === null
            ? "durata manuale"
            : remaining > CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
              ? "durata estesa"
              : `${remaining} round rimanenti`;
        detail.textContent = [
          durationLabel,
          targeting.mode === "aura"
            ? `aura ${targeting.rangeMeters ? `${targeting.rangeMeters} m` : "attiva"}`
            : "",
          targetCount ? `${targetCount} bersaglio${targetCount === 1 ? "" : "i"}` : "",
        ].filter(Boolean).join(" · ");
        copy.append(name, detail);
        const unsettlingValue = feature?.id === UNSETTLING_WORDS_FEATURE_ID
          ? String(instance.choiceId || "").match(/^value-(\d+)$/u)?.[1]
          : "";
        const manualDetail = unsettlingValue
          ? `Il bersaglio sottrae ${unsettlingValue} al prossimo tiro salvezza; tiro e risultato restano manuali.`
          : projection.targetEffect?.detail || "";
        if (manualDetail) {
          const manual = document.createElement("small");
          manual.className = "class-feature-manual";
          manual.textContent = `Manuale al tavolo: ${manualDetail}`;
          copy.appendChild(manual);
        }
        row.appendChild(copy);
        if (isGM) {
          const end = document.createElement("button");
          end.type = "button";
          end.className = "class-feature-end";
          end.textContent = "×";
          end.title = `Termina ${feature?.name || "capacità"}`;
          end.setAttribute("aria-label", end.title);
          end.disabled = classFeatureMutating;
          end.addEventListener("click", () => void runClassFeatureMutation(
            () => deactivateClassFeature(item.id, instance.instanceId),
            `${feature?.name || "Capacità"} terminata.`,
          ));
          row.appendChild(end);
        }
        return row;
      })
      : [classFeatureEmpty("Nessuna capacità attiva.")]
  ));

  $("classFeatureList").replaceChildren(...(
    orderedEnabled.length
      ? orderedEnabled.map((feature) => {
        const card = document.createElement("article");
        card.className = "class-feature-card";
        const theme = classFeatureTheme(feature);
        const runtimeSupport = classFeatureRuntimeSupport(feature);
        const referenceOnly = classFeatureIsReferenceOnly(feature);
        const targeting = classFeatureTargeting(feature, profile?.characterBuild);
        const isAuraToggle = targeting.mode === "aura"
          && feature.trackingMode !== "instant";
        const parentFeatureId = classFeatureParentFeatureId(feature);
        const parentFeature = parentFeatureId
          ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
          : null;
        if (parentFeature) {
          card.classList.add("class-feature-subfeature");
          card.dataset.parentFeatureId = parentFeature.id;
        }
        if (referenceOnly) card.classList.add("class-feature-reference-only");
        else if (!runtimeSupport.ready) card.classList.add("class-feature-not-automated");
        card.style.setProperty("--feature-accent", theme.accent);
        card.style.setProperty("--feature-background", `${theme.background}26`);
        const head = document.createElement("div");
        head.className = "class-feature-head";
        const copy = document.createElement("div");
        copy.className = "class-feature-copy";
        const name = document.createElement("strong");
        const displayName = classFeatureDisplayNameWithParent(feature);
        name.textContent = displayName;
        const meta = document.createElement("span");
        meta.className = "class-feature-meta";
        meta.textContent = classFeatureMetaText(feature);
        copy.append(name, meta);
        if (referenceOnly || !runtimeSupport.ready) {
          const status = document.createElement("small");
          status.className = "class-feature-runtime-status";
          status.textContent = referenceOnly
            ? "Promemoria Descrittivo"
            : "Non ancora automatizzata: gestione manuale al tavolo";
          copy.appendChild(status);
        }
        head.appendChild(copy);
        let featureControls = null;
        const appendFeatureControl = (control) => {
          if (!control) return;
          if (!featureControls) {
            featureControls = document.createElement("div");
            featureControls.className = "class-feature-controls";
          }
          featureControls.appendChild(control);
        };
        if (isGM && !referenceOnly) {
          const adapter = String(feature.runtimeSupport?.adapter || "").trim();
          if (adapter === "lay-on-hands") {
            appendFeatureControl(buildLayOnHandsControls(feature, state));
          } else if (adapter === "purifying-touch") {
            appendFeatureControl(buildPurifyingTouchControls(feature));
          } else if (adapter === "unsettling-words") {
            appendFeatureControl(buildUnsettlingWordsControls(feature));
          } else if (adapter === "turn-undead") {
            appendFeatureControl(buildTurnUndeadControls(feature));
          } else if (adapter === "turn-creatures") {
            appendFeatureControl(buildTurnCreaturesControls(feature));
          } else if (adapter === "universal-speech") {
            appendFeatureControl(buildUniversalSpeechControls(feature));
          } else if (adapter === "night-eyes") {
            appendFeatureControl(buildNightEyesControls(feature));
          } else if (adapter === "bardic-inspiration"
            && feature.id === CONTAGIOUS_INSPIRATION_FEATURE_ID) {
            appendFeatureControl(buildContagiousInspirationControls(feature));
          } else if (adapter === "sorcery-source") {
            appendFeatureControl(buildSorcerySourceControls(feature, state));
          } else if (adapter === "sorcerous-restoration") {
            appendFeatureControl(buildSorcerousRestorationControls(feature, state));
          } else if (adapter === "wild-magic-surge") {
            appendFeatureControl(buildWildMagicSurgeControls());
          } else if (adapter === "wild-magic-tides") {
            appendFeatureControl(buildWildMagicTidesControls());
          } else if (adapter === "spell-thief") {
            appendFeatureControl(buildSpellThiefControls(feature));
          } else if (feature.speciesTeleport) {
            appendFeatureControl(buildSpeciesTeleportControls(feature, state));
          } else if (feature.innateSpell) {
            appendFeatureControl(buildSpeciesSpellControls(feature, state));
          } else if (feature.hpTrait) {
            appendFeatureControl(buildSpeciesHpTraitControls(feature, state, active));
          } else if (feature.breath) {
            appendFeatureControl(buildBreathControls(feature));
          } else if (adapter === "resource-only" && feature.id === TWINNED_SPELL_FEATURE_ID) {
            appendFeatureControl(buildTwinnedSpellControls(feature));
          } else if (adapter === "resource-only") {
            appendFeatureControl(buildResourceOnlyControls(feature));
          } else {
          const enabledList = (Array.isArray(enabled) ? enabled : []).map((entry) => entry.id);
          const choiceControl = classFeatureChoiceControl(feature, {
            enabledFeatureIds: enabledList,
          });
          const autoChoiceControls = classFeatureAutoChoiceControls(feature, {
            enabledFeatureIds: enabledList,
          });
          if (choiceControl) appendFeatureControl(choiceControl);
          for (const control of autoChoiceControls.values()) appendFeatureControl(control);
          // An option that gives temporary hit points with a die (Fey Gift's Hospitality): the roll, entered here.
          const dieOptions = (Array.isArray(feature.choiceOptions) ? feature.choiceOptions : []).filter((option) => option?.temporaryHp?.bonusDie);
          let speciesDieInput = null;
          if (feature.speciesId && dieOptions.length) {
            const label = document.createElement("label");
            label.textContent = `${dieOptions[0].temporaryHp.bonusDie} tirato (${dieOptions.map((option) => option.label.replace(/ \(.*\)$/u, "")).join(", ")})`;
            speciesDieInput = document.createElement("input");
            speciesDieInput.type = "number";
            speciesDieInput.min = "1";
            speciesDieInput.step = "1";
            speciesDieInput.inputMode = "numeric";
            label.appendChild(speciesDieInput);
            appendFeatureControl(label);
          }
          // A species trait with a save (Daunting Roar, Taunt): its DC, and whom to select before Attiva.
          const speciesSave = speciesTraitSave(feature, profile);
          if (speciesSave) {
            const note = document.createElement("small");
            note.textContent = `${speciesSave.label}: seleziona sulla mappa solo chi lo fallisce, poi Attiva.`;
            appendFeatureControl(note);
          }
          const activate = document.createElement("button");
          activate.type = "button";
          const activeInstance = active.find((entry) => entry.featureId === feature.id) || null;
          const alreadyActive = Boolean(activeInstance);
          const canGrantInspiration = adapter === "bardic-inspiration";
          activate.textContent = !runtimeSupport.ready
            ? "Non disponibile"
            : feature.trackingMode === "instant"
              ? "Usa"
              : isAuraToggle && alreadyActive
                ? "Disattiva"
                : "Attiva";
          const requiredFeatureIds = Array.from(new Set([
            ...(classFeatureAutoActivateParentFeatureId(feature)
              ? []
              : [classFeatureDurationParentFeatureId(feature)]),
            classFeatureRequiredActiveFeatureId(feature),
          ].filter(Boolean)));
          const missingRequiredFeatureId = requiredFeatureIds.find((requiredId) =>
            !active.some((entry) => entry.featureId === requiredId)
          ) || "";
          const parentActive = !missingRequiredFeatureId;
          activate.disabled = classFeatureMutating
            || (!isAuraToggle && alreadyActive && !canGrantInspiration)
            || !runtimeSupport.ready
            || !parentActive;
          if (isAuraToggle) {
            activate.setAttribute("aria-pressed", String(alreadyActive));
          }
          activate.title = !runtimeSupport.ready
            ? "Questa capacità non è ancora automatizzata"
            : !parentActive
              ? `Richiede prima ${CLASS_FEATURE_BY_ID.get(missingRequiredFeatureId)?.name || "la capacità collegata"}`
            : isAuraToggle
              ? alreadyActive ? "Disattiva l’aura" : "Attiva l’aura"
            : alreadyActive && !canGrantInspiration
              ? "La capacità è già attiva"
            : classFeatureTargetMode(feature, profile?.characterBuild) === "selection"
              ? "Usa i token selezionati come bersagli"
              : "Attiva sul personaggio";
          activate.addEventListener("click", () => void runClassFeatureMutation(
            async () => {
              if (isAuraToggle && activeInstance) {
                await deactivateClassFeature(item.id, activeInstance.instanceId);
                return;
              }
              await activateClassFeature({
                sourceId: item.id,
                featureId: feature.id,
                choiceId: classFeatureChoiceSelection(choiceControl),
                autoChoiceIds: classFeatureAutoChoiceSelection(autoChoiceControls),
                ...(speciesDieInput ? { value: speciesDieInput.value } : {}),
              });
            },
            isAuraToggle && alreadyActive
              ? `${feature.name} disattivata.`
              : feature.trackingMode === "instant"
                ? `${feature.name} usata.`
                : `${feature.name} attivata.`,
          ));
          appendFeatureControl(activate);
          }
        }
        // A species' natural weapon, passive or not: added to the attacks from here.
        if (isGM && feature.naturalWeapon) appendFeatureControl(buildNaturalWeaponControl(feature));
        card.appendChild(head);
        const descriptionText = classFeatureDescription(feature);
        if (descriptionText) {
          const description = rulesTextBlock(descriptionText, { className: "class-feature-description" });
          description.title = descriptionText;
          card.appendChild(description);
        }
        if (featureControls) card.appendChild(featureControls);
        if (feature.id.endsWith("-incantesimi")) {
          const additionalSpells = getAdditionalSubclassSpellEntries(
            profile,
            feature.classId,
          );
          if (additionalSpells.entries.length) {
            card.appendChild(buildAdditionalSpellsSummary(additionalSpells));
          }
        }
        return card;
      })
      : [classFeatureEmpty(
        profile.characterBuild?.length
          ? "Nessuna capacità attiva abilitata."
          : "Configura classe e livello in Modifica."
      )]
  ));
  renderMonsterTraits(resources.length > 0);
}

// An NPC's Capacità are its stat block's (fase 4): traits, reactions and legendary actions, from the full stat block kept
// in the GM's browser, as the console lists them. Species and class features stay a character's: of the class part only
// the resources remain, when the monster has some (a spellcaster's slots).
function renderMonsterTraits(hasResources) {
  const ref = monsterStatblockTextRef({ isGM, attitude: item?.metadata?.[META_KEY]?.attitude, card: profile });
  const box = $("monsterTraits");
  box.dataset.ref = ref;
  box.hidden = !ref;
  for (const id of ["classBuildSummary", "classFeatureActiveTitle", "classFeatureActive", "classFeatureListTitle", "classFeatureList"]) $(id).hidden = !!ref;
  for (const id of ["classFeatureResourcesTitle", "classFeatureResources"]) $(id).hidden = !!ref && !hasResources;
  if (!ref) return;
  void statblockTextLoader().view(ref, { fromArchive: profile?.[MONSTER_PROFILE_FIELD]?.source === "5etools",
    revision: JSON.stringify(profile?.[MONSTER_PROFILE_FIELD] || null) }).then((view) => {
    if (box.dataset.ref !== ref) return;
    const entries = pcAttackMonsterTraitEntries(view);
    if (!entries.length) {
      box.replaceChildren(classFeatureEmpty(view ? "Lo statblock non ha tratti, reazioni né azioni leggendarie."
        : "Il testo dello statblock non è in questo browser: reimporta il mostro (o aggiungi il suo libro all'archivio)."));
      return;
    }
    const nodes = [];
    for (const group of [...new Set(entries.map((entry) => entry.group))]) {
      const title = document.createElement("span");
      title.className = "section-title";
      title.textContent = PC_ATTACK_MONSTER_GROUP_TITLES[group] || "";
      const list = document.createElement("div");
      list.className = "monster-trait-list";
      for (const entry of entries.filter((candidate) => candidate.group === group)) {
        const card = document.createElement("div");
        card.className = "monster-trait";
        const text = document.createElement("p");
        if (group === "monster-legendary") {
          const cost = document.createElement("span");
          cost.className = "monster-trait-cost";
          cost.textContent = `costo ${legendaryActionCost(entry.label)}`;
          text.appendChild(cost);
        }
        const name = document.createElement("b");
        name.textContent = `${entry.label}. `;
        text.append(name, document.createTextNode(entry.text || ""));
        card.appendChild(text);
        list.appendChild(card);
      }
      nodes.push(title, list);
    }
    box.replaceChildren(...nodes);
  });
}

function populateSpellbookDatalist() {
  $("spellbookSpellOptions").replaceChildren(...spellbookSearchOptions().map((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    return option;
  }));
}

function setSpellbookEditStatus(message = "", tone = "") {
  $("spellbookEditStatus").textContent = message;
  $("spellbookEditStatus").dataset.tone = tone;
}

function buildSpellbookEditor() {
  draftSpellbook = sanitizeSpellbook(profile?.[SPELLBOOK_FIELD]);
  $("spellbookSearch").value = "";
  setSpellbookEditStatus();
  renderSpellbookEditor();
}

// The draft as rows, by level and then name; ★ and ✕ change the draft, Salva stores it.
function renderSpellbookEditor() {
  const pinned = new Set(draftSpellbook.pinnedIds);
  const rows = spellbookGroups(draftSpellbook).flatMap((group) => group.spells);
  $("spellbookAdd").disabled = rows.length >= MAX_SPELLBOOK_SPELLS;
  $("spellbookEditorList").replaceChildren(...rows.map((spell) => {
    const row = document.createElement("div");
    row.className = "spellbook-editor-row";
    const level = document.createElement("span");
    level.className = "spellbook-level";
    level.textContent = spell.level === 0 ? "T" : spell.level === null ? "?" : `${spell.level}°`;
    level.title = spell.level === 0 ? "Trucchetto" : spell.level === null ? "Fuori catalogo" : `${spell.level}° livello`;
    const name = document.createElement("span");
    name.textContent = spell.label;
    name.title = spell.label;
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "spellbook-pin";
    pin.textContent = "★";
    pin.setAttribute("aria-pressed", pinned.has(spell.id) ? "true" : "false");
    const pinFull = !pinned.has(spell.id) && pinned.size >= MAX_SPELLBOOK_PINNED;
    pin.disabled = !spell.launchable || pinFull;
    pin.title = !spell.launchable
      ? "Non si lancia dalla card: non può stare tra i preferiti"
      : pinFull
        ? `Massimo ${MAX_SPELLBOOK_PINNED} preferiti`
        : pinned.has(spell.id) ? "Togli dai preferiti del menu 🪄" : "Aggiungi ai preferiti del menu 🪄";
    pin.setAttribute("aria-label", `${pin.title}: ${spell.label}`);
    pin.addEventListener("click", () => {
      const pinnedIds = pinned.has(spell.id)
        ? draftSpellbook.pinnedIds.filter((id) => id !== spell.id)
        : [...draftSpellbook.pinnedIds, spell.id];
      draftSpellbook = sanitizeSpellbook({ ...draftSpellbook, pinnedIds });
      renderSpellbookEditor();
    });
    // ✎ marks a spell "Aggiunto manualmente" (outside the class list): a label only, nothing else changes.
    const manualIds = draftSpellbook.manualIds || [];
    const manual = document.createElement("button");
    manual.type = "button";
    manual.className = "spellbook-pin spellbook-manual";
    manual.textContent = "✎";
    manual.setAttribute("aria-pressed", manualIds.includes(spell.id) ? "true" : "false");
    manual.title = manualIds.includes(spell.id)
      ? "Togli il segno «Aggiunto manualmente»"
      : "Segna come aggiunto manualmente (fuori dalla lista della classe)";
    manual.setAttribute("aria-label", `${manual.title}: ${spell.label}`);
    manual.addEventListener("click", () => {
      draftSpellbook = sanitizeSpellbook({
        ...draftSpellbook,
        manualIds: manualIds.includes(spell.id)
          ? manualIds.filter((id) => id !== spell.id)
          : [...manualIds, spell.id],
      });
      renderSpellbookEditor();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = `Togli ${spell.label} dal libro`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => {
      draftSpellbook = sanitizeSpellbook({
        ...draftSpellbook,
        spellIds: draftSpellbook.spellIds.filter((id) => id !== spell.id),
      });
      setSpellbookEditStatus();
      renderSpellbookEditor();
    });
    row.append(level, name, pin, manual, remove);
    return row;
  }));
  renderSpellbookSubclassHelp();
}

// Below the book: the spells the subclass gives (always there, not edited here) and, for a warlock, the spells
// its patron adds to the list it chooses from, one click to put one in the book.
function renderSpellbookSubclassHelp() {
  const granted = subclassGrantedSpells(profile);
  const note = $("spellbookGrantedNote");
  note.hidden = !granted.length;
  note.textContent = granted.length
    ? `🔒 Sempre preparati da ${granted[0].source || "sottoclasse"} (si aggiornano con il livello, non si modificano qui): ${granted.map((entry) => spellbookSpell(entry.spellId).label).join(", ")}.`
    : "";
  const suggestions = subclassSuggestedSpells(profile)
    .filter((entry) => !draftSpellbook.spellIds.includes(entry.spellId));
  const box = $("spellbookSuggestions");
  box.hidden = !suggestions.length;
  if (!suggestions.length) {
    box.replaceChildren();
    return;
  }
  const title = document.createElement("span");
  title.textContent = `Suggeriti dal patrono (${suggestions[0].source}): la lista ampliata tra cui scegliere.`;
  box.replaceChildren(title, ...suggestions.map((entry) => {
    const label = spellbookSpell(entry.spellId).label;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `+ ${label}`;
    button.title = `Aggiungi ${label} al libro`;
    button.disabled = draftSpellbook.spellIds.length >= MAX_SPELLBOOK_SPELLS;
    button.addEventListener("click", () => {
      draftSpellbook = sanitizeSpellbook({ ...draftSpellbook, spellIds: [...draftSpellbook.spellIds, entry.spellId] });
      setSpellbookEditStatus(`Aggiunto: ${label}. Premi Salva per conservarlo.`, "success");
      renderSpellbookEditor();
    });
    return button;
  }));
}

function addSpellbookSpell() {
  const input = $("spellbookSearch");
  const query = input.value.trim();
  if (!query) return;
  const spell = getSpellDefinition(query);
  if (!spell) {
    setSpellbookEditStatus(`"${query}" non è nel catalogo: sceglilo dall'elenco.`, "error");
    return;
  }
  const label = spellbookSpell(spell.id).label;
  if (draftSpellbook.spellIds.includes(spell.id)) {
    setSpellbookEditStatus(`${label} è già nel libro.`, "error");
    return;
  }
  if (draftSpellbook.spellIds.length >= MAX_SPELLBOOK_SPELLS) {
    setSpellbookEditStatus(`Massimo ${MAX_SPELLBOOK_SPELLS} incantesimi.`, "error");
    return;
  }
  draftSpellbook = sanitizeSpellbook({ ...draftSpellbook, spellIds: [...draftSpellbook.spellIds, spell.id] });
  input.value = "";
  setSpellbookEditStatus(`Aggiunto: ${label}. Premi Salva per conservarlo.`, "success");
  renderSpellbookEditor();
  input.focus();
}

function populateQuickActionDatalists() {
  $("quickActionSpellOptions").replaceChildren(...spellOptions.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    return option;
  }));
  $("quickActionConditionOptions").replaceChildren(...APPLICABLE_CONDITION_LIST.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.label = formatConditionName(name);
    return option;
  }));
}

function syncQuickActionAddState() {
  const count = $("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']").length;
  $("quickActionAdd").disabled = count >= MAX_QUICK_ACTIONS;
  $("quickActionAdd").title = count >= MAX_QUICK_ACTIONS
    ? `Massimo ${MAX_QUICK_ACTIONS} azioni rapide`
    : "Aggiungi azione rapida";
  const attackCount = $("attackEditorList").querySelectorAll("[data-quick-action-row='1']").length;
  $("attackAdd").disabled = attackCount >= MAX_QUICK_ACTION_ATTACKS;
  $("attackAdd").title = attackCount >= MAX_QUICK_ACTION_ATTACKS
    ? `Massimo ${MAX_QUICK_ACTION_ATTACKS} attacchi`
    : "Aggiungi attacco";
}

function quickActionFeatureOptions(currentId = "") {
  const available = getEnabledClassFeatures(profile)
    .filter((feature) => classFeatureRuntimeSupport(feature).ready);
  const byId = new Map(available.map((feature) => [feature.id, feature]));
  const current = CLASS_FEATURE_BY_ID.get(String(currentId || "").trim());
  if (current && !byId.has(current.id)) byId.set(current.id, current);
  return Array.from(byId.values())
    .sort((a, b) => classFeatureDisplayNameWithParent(a)
      .localeCompare(classFeatureDisplayNameWithParent(b), "it"));
}

// attack: a row of the Attacks tab (kind fixed to "attack", no Type field); otherwise a quick action row,
// whose Type offers no attack.
function buildQuickActionEditorRow(action = null, { attack: attackRow = false } = {}) {
  const current = action || {
    id: quickActionId(),
    label: "",
    kind: attackRow ? "attack" : "spell",
    targetMode: "selection",
    launchMode: "auto",
    slotLevel: null,
    turns: null,
    conditionName: "",
    expiryMode: "manual",
    duration: null,
  };

  const row = document.createElement("div");
  row.className = "quick-action-editor-row";
  row.dataset.quickActionRow = "1";
  row.dataset.actionId = current.id || quickActionId();
  // A monster's attack fields (save, bonus, recharge…) have no input here yet: the row keeps them for the save.
  const monsterFields = quickActionMonsterAttackFields(current);
  if (Object.keys(monsterFields).length) row.dataset.monsterAttackFields = JSON.stringify(monsterFields);

  const head = document.createElement("div");
  head.className = "quick-action-editor-head";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.maxLength = 80;
  labelInput.placeholder = "Etichetta pulsante";
  labelInput.value = current.label || "";
  labelInput.dataset.quickActionField = "label";

  const tools = document.createElement("div");
  tools.className = "quick-action-editor-tools";
  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "↑";
  up.title = "Sposta su";
  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "↓";
  down.title = "Sposta giù";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.title = "Rimuovi";
  tools.append(up, down, remove);
  head.append(labelInput, tools);

  const grid = document.createElement("div");
  grid.className = "quick-action-editor-grid";
  const kindSelect = selectControl(attackRow ? [["attack", "Attacco"]] : [
    ["spell", "Incantesimo"],
    ["condition", "Condizione"],
    ["feature", "Capacità di classe"],
  ], attackRow ? "attack" : current.kind || "spell");
  kindSelect.dataset.quickActionField = "kind";
  const currentFeature = CLASS_FEATURE_BY_ID.get(current.featureId);
  const targetSelect = selectControl([
    ["selection", "Selezione corrente"],
    ["self", "Su di sé"],
  ], current.kind === "feature"
    ? classFeatureTargetMode(currentFeature)
    : current.targetMode || "selection");
  targetSelect.dataset.quickActionField = "targetMode";

  const referenceInput = document.createElement("input");
  referenceInput.type = "text";
  referenceInput.maxLength = 160;
  referenceInput.autocomplete = "off";
  referenceInput.spellcheck = false;
  referenceInput.value = quickActionReference(current);
  referenceInput.dataset.quickActionField = "reference";

  const featureOptions = [["", "Scegli capacità"]];
  for (const feature of quickActionFeatureOptions(current.featureId)) {
    featureOptions.push([feature.id, classFeatureDisplayNameWithParent(feature)]);
  }
  if (
    current.featureId
    && !featureOptions.some(([value]) => value === current.featureId)
  ) {
    featureOptions.push([current.featureId, current.featureId]);
  }
  const featureSelect = selectControl(featureOptions, current.featureId || "");
  featureSelect.dataset.quickActionField = "featureId";

  const launchModeSelect = selectControl([
    ["auto", "Lancia subito se possibile"],
    ["review", "Apri il pannello prima del lancio"],
  ], current.launchMode || "auto");
  launchModeSelect.dataset.quickActionField = "launchMode";

  const slotInput = document.createElement("input");
  slotInput.type = "number";
  slotInput.min = "1";
  slotInput.max = "9";
  slotInput.placeholder = "Catalogo";
  slotInput.value = current.slotLevel ?? "";
  slotInput.dataset.quickActionField = "slotLevel";

  const turnsInput = document.createElement("input");
  turnsInput.type = "number";
  turnsInput.min = "1";
  turnsInput.max = "999";
  turnsInput.placeholder = "Catalogo";
  turnsInput.value = current.turns ?? "";
  turnsInput.dataset.quickActionField = "turns";

  // The cost of a spell: a slot of the character, uses of its own (a feat, a species, an item: back at the long
  // rest) or nothing.
  const costSelect = selectControl([
    ["slot", "Slot incantesimo"],
    ["uses", "Usi propri"],
    ["free", "Gratuito"],
  ], current.cost || "slot");
  costSelect.dataset.quickActionField = "cost";
  const usesInput = document.createElement("input");
  usesInput.type = "number";
  usesInput.min = "1";
  usesInput.max = String(MAX_QUICK_ACTION_USES);
  usesInput.value = current.uses ?? "1";
  usesInput.dataset.quickActionField = "uses";

  const expirySelect = selectControl([
    ["manual", "Manuale"],
    ["rounds", "N round"],
    ["turn-start", "Inizio turno"],
    ["turn-end", "Fine turno"],
  ], current.expiryMode || "manual");
  expirySelect.dataset.quickActionField = "expiryMode";

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.max = "999";
  durationInput.value = current.duration ?? "1";
  durationInput.dataset.quickActionField = "duration";

  // An attack's source, one field for source and range: a melee or ranged weapon (components written here),
  // a cantrip (picked in the attack console among the cantrips ticked here; none ticked = all of them) or a leveled
  // attack spell (lotto L4, the same way, with its slot).
  const sourceSelect = selectControl([
    ["melee", "Arma da mischia"],
    ["ranged", "Arma a distanza"],
    ["cantrip", "Trucchetto"],
    ["spell", "Incantesimo d'attacco"],
  ], ["cantrip", "spell"].includes(current.source?.kind) ? current.source.kind : current.range === "ranged" ? "ranged" : "melee");
  sourceSelect.dataset.quickActionField = "attackSource";
  // Section header shared by the attack sub-editors: a title, a muted hint aligned right.
  const sectionHead = (title, hint = "") => {
    const head = document.createElement("div");
    head.className = "quick-action-section-head";
    const titleNode = document.createElement("span");
    titleNode.textContent = title;
    head.append(titleNode);
    if (hint) {
      const hintNode = document.createElement("small");
      hintNode.textContent = hint;
      head.append(hintNode);
    }
    return head;
  };
  const cantripsBox = document.createElement("div");
  cantripsBox.className = "quick-action-section";
  cantripsBox.dataset.quickActionField = "cantrips";
  const cantripList = document.createElement("div");
  cantripList.className = "quick-action-check-grid";
  const knownCantrips = new Set(current.source?.spellIds || []);
  cantripList.append(...PC_ATTACK_CANTRIPS.map((cantrip) => {
    const option = document.createElement("label");
    option.className = "quick-action-check";
    // Booming Blade and Green-Flame Blade are cast with a melee weapon attack, not from the cantrip console.
    const weapon = cantrip.delivery === "weapon";
    option.title = weapon ? `${cantrip.name}: si usa dall'attacco con arma da mischia` : cantrip.name;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.cantripId = cantrip.spellId;
    box.checked = knownCantrips.has(cantrip.spellId);
    const name = document.createElement("span");
    name.textContent = weapon ? `${cantrip.name} (arma)` : cantrip.name;
    option.append(box, name);
    return option;
  }));
  cantripsBox.append(sectionHead("Trucchetti conosciuti", "nessuno spuntato: tutti"), cantripList);
  const attackSpellsBox = document.createElement("div");
  attackSpellsBox.className = "quick-action-section";
  attackSpellsBox.dataset.quickActionField = "attackSpells";
  const attackSpellList = document.createElement("div");
  attackSpellList.className = "quick-action-check-grid";
  const knownAttackSpells = new Set(current.source?.kind === "spell" ? current.source.spellIds || [] : []);
  attackSpellList.append(...PC_ATTACK_SPELLS.map((spell) => {
    const option = document.createElement("label");
    option.className = "quick-action-check";
    option.title = spell.name;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.attackSpellId = spell.spellId;
    box.checked = knownAttackSpells.has(spell.spellId);
    const name = document.createElement("span");
    name.textContent = `${spell.name} (${spell.level}°)`;
    option.append(box, name);
    return option;
  }));
  attackSpellsBox.append(sectionHead("Incantesimi conosciuti", "nessuno spuntato: tutti"), attackSpellList);

  // Attack components: the damage type and an optional formula shown as a hint (never evaluated).
  const componentsBox = document.createElement("div");
  componentsBox.className = "quick-action-section";
  componentsBox.dataset.quickActionField = "components";
  const componentRows = document.createElement("div");
  componentRows.className = "quick-action-component-list";
  const addComponent = document.createElement("button");
  addComponent.type = "button";
  addComponent.className = "quick-action-add";
  addComponent.textContent = "+ Componente";
  // A monster's save without damage (Frightful Presence: a condition on a failed save) keeps no component.
  const damagelessSave = !!monsterFields.onFail;
  const syncComponentState = () => {
    const rows = componentRows.querySelectorAll("[data-attack-component='1']");
    addComponent.disabled = rows.length >= MAX_QUICK_ACTION_ATTACK_COMPONENTS;
    rows.forEach((componentRow) => {
      componentRow.querySelector("button").disabled = rows.length <= 1 && !damagelessSave;
    });
  };
  const addComponentRow = (component = {}) => {
    const componentRow = document.createElement("div");
    componentRow.dataset.attackComponent = "1";
    componentRow.className = "quick-action-component-row";
    const typeSelect = selectControl(
      DAMAGE_TYPES.map((type) => [type.id, type.label.charAt(0).toUpperCase() + type.label.slice(1)]),
      component.type || "slashing",
    );
    typeSelect.dataset.componentField = "type";
    typeSelect.setAttribute("aria-label", "Tipo di danno");
    const formulaInput = document.createElement("input");
    formulaInput.type = "text";
    formulaInput.maxLength = 24;
    formulaInput.placeholder = "es. 1d8+3";
    formulaInput.value = component.formula || "";
    formulaInput.dataset.componentField = "formula";
    formulaInput.setAttribute("aria-label", "Formula (promemoria)");
    const removeComponent = document.createElement("button");
    removeComponent.type = "button";
    removeComponent.className = "quick-action-icon-button";
    removeComponent.textContent = "×";
    removeComponent.title = "Rimuovi componente";
    removeComponent.setAttribute("aria-label", "Rimuovi componente");
    removeComponent.addEventListener("click", () => {
      componentRow.remove();
      syncComponentState();
    });
    componentRow.append(typeSelect, formulaInput, removeComponent);
    componentRows.appendChild(componentRow);
    syncComponentState();
  };
  addComponent.addEventListener("click", () => addComponentRow());
  (current.kind === "attack" && current.components?.length ? current.components : damagelessSave ? [] : [{}]).forEach(addComponentRow);
  componentsBox.append(sectionHead("Componenti di danno", "formula solo come promemoria"), componentRows, addComponent);

  const makeLabel = (text, control, className = "") => {
    const label = document.createElement("label");
    if (className) label.className = className;
    label.append(text, control);
    return label;
  };
  const kindLabel = makeLabel("Tipo", kindSelect);
  kindLabel.hidden = attackRow;
  const targetLabel = makeLabel("Bersaglio", targetSelect);
  const referenceLabel = makeLabel("Incantesimo", referenceInput, "wide");
  const featureLabel = makeLabel("Capacità", featureSelect, "wide");
  const launchModeLabel = makeLabel("Lancio", launchModeSelect);
  const slotLabel = makeLabel("Slot", slotInput);
  const turnsLabel = makeLabel("Durata in round", turnsInput);
  const costLabel = makeLabel("Costo", costSelect);
  const usesLabel = makeLabel("Usi per riposo lungo", usesInput);
  const expiryLabel = makeLabel("Scadenza", expirySelect);
  const durationLabel = makeLabel("Occorrenze", durationInput);
  const sourceLabel = makeLabel("Fonte", sourceSelect);
  grid.append(
    kindLabel,
    sourceLabel,
    targetLabel,
    referenceLabel,
    featureLabel,
    launchModeLabel,
    slotLabel,
    turnsLabel,
    costLabel,
    usesLabel,
    expiryLabel,
    durationLabel,
    componentsBox,
    cantripsBox,
    attackSpellsBox,
  );

  const syncKind = () => {
    const spell = kindSelect.value === "spell";
    const feature = kindSelect.value === "feature";
    const attack = kindSelect.value === "attack";
    const selectedFeature = CLASS_FEATURE_BY_ID.get(featureSelect.value);
    referenceLabel.firstChild.textContent = spell ? "Incantesimo" : "Condizione";
    referenceLabel.hidden = feature || attack;
    featureLabel.hidden = !feature;
    if (feature || attack) referenceInput.removeAttribute("list");
    else referenceInput.setAttribute(
      "list",
      spell ? "quickActionSpellOptions" : "quickActionConditionOptions",
    );
    targetSelect.disabled = feature || attack;
    if (feature && selectedFeature) {
      targetSelect.value = classFeatureTargetMode(selectedFeature);
    }
    if (attack) targetSelect.value = "selection";
    launchModeLabel.hidden = !spell;
    slotLabel.hidden = !spell;
    turnsLabel.hidden = !spell;
    costLabel.hidden = !spell;
    usesLabel.hidden = !spell || costSelect.value !== "uses";
    expiryLabel.hidden = spell || feature || attack;
    durationLabel.hidden = spell || feature || attack || expirySelect.value === "manual";
    const cantrip = attack && sourceSelect.value === "cantrip";
    // An attack's target is always picked in the attack console: no target field here.
    targetLabel.hidden = attack;
    sourceLabel.hidden = !attack;
    const attackSpell = attack && sourceSelect.value === "spell";
    componentsBox.hidden = !attack || cantrip || attackSpell;
    cantripsBox.hidden = !cantrip;
    attackSpellsBox.hidden = !attackSpell;
  };

  kindSelect.addEventListener("change", () => {
    referenceInput.value = "";
    if (!labelInput.value.trim()) labelInput.value = "";
    syncKind();
    (kindSelect.value === "feature" ? featureSelect
      : kindSelect.value === "attack" ? labelInput : referenceInput).focus();
  });
  featureSelect.addEventListener("change", () => {
    const feature = CLASS_FEATURE_BY_ID.get(featureSelect.value);
    if (feature) {
      targetSelect.value = classFeatureTargetMode(feature);
      if (!labelInput.value.trim()) labelInput.value = classFeatureDisplayNameWithParent(feature);
    }
    syncKind();
  });
  referenceInput.addEventListener("change", () => {
    if (kindSelect.value === "spell") {
      const spell = getSpellDefinition(referenceInput.value);
      if (spell) {
        referenceInput.value = spell.catalogLabel || spell.displayName || spell.name;
        if (!labelInput.value.trim()) labelInput.value = spell.displayName || spell.name;
      }
    } else if (kindSelect.value === "condition" && !labelInput.value.trim()) {
      labelInput.value = referenceInput.value.trim();
    }
  });
  expirySelect.addEventListener("change", syncKind);
  sourceSelect.addEventListener("change", syncKind);
  costSelect.addEventListener("change", syncKind);
  up.addEventListener("click", () => {
    const previous = row.previousElementSibling;
    if (previous) previous.before(row);
  });
  down.addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) next.after(row);
  });
  remove.addEventListener("click", () => {
    row.remove();
    syncQuickActionAddState();
  });

  row.append(head, grid);
  syncKind();
  return row;
}

function buildQuickActionEditor() {
  const actions = Array.isArray(profile?.quickActions) ? profile.quickActions : [];
  $("quickActionEditorList").replaceChildren(...actions
    .filter((action) => !isAttackQuickAction(action))
    .map((action) => buildQuickActionEditorRow(action)));
  $("attackEditorList").replaceChildren(...actions
    .filter(isAttackQuickAction)
    .map((action) => buildQuickActionEditorRow(action, { attack: true })));
  $("attackImportText").value = "";
  $("attackImportStatus").textContent = "";
  $("attackImportStatus").dataset.tone = "";
  setAttackImportOpen(false);
  syncQuickActionAddState();
}

// Attacks pasted as a block (prepared from a character sheet) become editor rows: nothing is saved until
// Salva. A row whose name is already in the list is skipped, so an import never duplicates or overwrites.
function setAttackImportOpen(open) {
  $("attackImport").hidden = !open;
  $("attackImportToggle").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) $("attackImportText").focus();
}

function importAttacks() {
  const status = $("attackImportStatus");
  const { attacks, invalid, error } = parseQuickActionAttackImport($("attackImportText").value);
  if (error) {
    status.textContent = error;
    status.dataset.tone = "error";
    return;
  }
  const list = $("attackEditorList");
  const nameKey = (value) => String(value || "").trim().toLocaleLowerCase("it");
  const names = new Set(Array.from(list.querySelectorAll("[data-quick-action-row='1'] [data-quick-action-field='label']"))
    .map((input) => nameKey(input.value)));
  let added = 0;
  let duplicates = 0;
  let overLimit = 0;
  for (const attack of attacks) {
    if (names.has(nameKey(attack.label))) {
      duplicates += 1;
      continue;
    }
    if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTION_ATTACKS) {
      overLimit += 1;
      continue;
    }
    list.appendChild(buildQuickActionEditorRow({ ...attack, id: quickActionId() }, { attack: true }));
    names.add(nameKey(attack.label));
    added += 1;
  }
  syncQuickActionAddState();
  const notes = [
    duplicates ? `${duplicates} già ${duplicates === 1 ? "presente" : "presenti"} (stesso nome)` : "",
    overLimit ? `${overLimit} oltre il limite di ${MAX_QUICK_ACTION_ATTACKS}` : "",
    invalid ? `${invalid} non ${invalid === 1 ? "valido" : "validi"}` : "",
  ].filter(Boolean);
  status.textContent = `${added ? `${added === 1 ? "Aggiunto 1 attacco" : `Aggiunti ${added} attacchi`}: controllali e premi Salva.` : "Nessun attacco aggiunto."}${notes.length ? ` Saltati: ${notes.join(", ")}.` : ""}`;
  status.dataset.tone = added ? "success" : "error";
  if (added) {
    $("attackImportText").value = "";
    setAttackImportOpen(false);
  }
}

// Character sheet import: a JSON block read into sections; the GM picks some and they fill the editor
// on every tab. Nothing is saved until Salva, as with the Attacks import.
let sheetImportResult = null;
// 5eTools' documents loaded while editing (files and pasted blocks, fase 2, lotto 3): the picker lists their monsters and
// the derived ones find their base among all of them. Only in memory, dropped when the edit starts again.
let fiveToolsInputs = [];
const MAX_FIVE_TOOLS_OPTIONS = 200;
// The books of the online archive this browser keeps (fase 3, lotto 4): their files join the loaded ones in the picker,
// listed first so a file the GM loads now wins over the kept copy.
let fiveToolsArchiveInputs = [];
let fiveToolsArchivePanel = null;
let fiveToolsLocalOptions = null;
const allFiveToolsInputs = () => [...fiveToolsArchiveInputs, ...fiveToolsInputs];
// The 2024 stat blocks, turned on in this browser's options (fase 3, lotto 6, decision D1).
const fiveTools2024 = () => fiveToolsArchiveBase("fiveTools2024") === true;
function fiveToolsArchiveBase(key = "fiveToolsArchive") {
  try {
    fiveToolsLocalOptions ||= createLocalOptionsStore();
    return fiveToolsLocalOptions.readPersisted()?.tools?.[key] || "";
  } catch {
    return "";
  }
}
function archivePanel() {
  fiveToolsArchivePanel ||= createFiveToolsArchivePanel({
    container: $("sheetImportArchiveBody"),
    readBase: fiveToolsArchiveBase,
    allow2024: fiveTools2024,
    onChange: (data) => { fiveToolsArchiveInputs = data; renderFiveToolsPicker(); },
  });
  return fiveToolsArchivePanel;
}
// A monster's hit points chosen in the import, written after the sheet's Salva: { hp, overwrite, sameName } or null.
let pendingMonsterHitPoints = null;
// The token's new name from a monster's stat block, written after Salva (fase 4, lotto 2), or "".
let pendingMonsterName = "";
// The monster's 5eTools portrait as the token's image, written after Salva (fase 4, lotto 3): { url, width, height } or null.
let pendingMonsterPortrait = null;
// The monster's full stat block, kept in this browser after Salva (fase 4, lotto 4b): a record or null.
let pendingMonsterText = null;
// The tracker's Leggendario mode from the stat block, set after Salva (fase 4, lotto 5): { actions, resistances } or null.
let pendingMonsterLegendary = null;
// The full stat blocks kept in this browser, each reference read once (monsterStatblockTextLoader.js).
let monsterStatblockTextLoader = null;
const statblockTextLoader = () => (monsterStatblockTextLoader ||= createMonsterStatblockTextLoader());
// The import's two automatic steps, remembered in this browser: rename the token, set its hit points.
const STATBLOCK_IMPORT_PREFS_KEY = `${ID}/statblock-import-prefs`;
function statblockImportPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STATBLOCK_IMPORT_PREFS_KEY) || "{}");
    return { rename: stored.rename !== false, hitPoints: stored.hitPoints !== false };
  } catch {
    return { rename: true, hitPoints: true };
  }
}
function rememberStatblockImportPrefs(prefs) {
  try { localStorage.setItem(STATBLOCK_IMPORT_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

// The namesakes of a monster's token get its stat block (fase 4, lotto 1); "" when there is nothing to copy.
async function shareMonsterStatblock(source, card, { isCurrent = () => true, sceneIdentity = null } = {}) {
  const items = await OBR.scene.items.getItems();
  if (!isCurrent()) return "";
  const targets = monsterStatblockTargets(items, source.id, card).filter((target) => !sameMonsterStatblock(getInitiativeCard(target), card));
  if (!targets.length) return "";
  const statblock = monsterStatblockOf(card);
  const failed = [];
  for (const target of targets) {
    if (!isCurrent()) break;
    try {
      await saveInitiativeCard(target.id, target.name, statblock, { isCurrent, sceneIdentity });
    } catch (error) {
      failed.push(`${target.name || target.id} (${error?.message || error})`);
    }
  }
  const copied = targets.length - failed.length;
  return [copied ? `Statblock copiato su ${copied} ${copied === 1 ? "altro token" : "altri token"} «${source.name}».` : "",
    failed.length ? `Non copiato su: ${failed.join(", ")}.` : ""].filter(Boolean).join(" ");
}

function setSheetImportStatus(message = "", tone = "") {
  $("sheetImportStatus").textContent = message;
  $("sheetImportStatus").dataset.tone = tone;
}

function resetSheetImport() {
  sheetImportResult = null;
  $("sheetImportSections").replaceChildren();
  $("sheetImportSections").hidden = true;
  $("sheetImportApplyRow").hidden = true;
  setSheetImportStatus();
}

function setSheetImportOpen(open) {
  $("sheetImport").hidden = !open;
  $("sheetImportToggle").setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) {
    $("sheetImportText").value = "";
    resetSheetImport();
    return;
  }
  $("sheetImportText").focus();
  // The kept books of the online archive: their monsters in the picker at once, no network.
  void archivePanel().refresh().catch((error) => console.warn("[5etools] archive:", error?.message || error));
}

function sheetImportNames() {
  return {
    classNameOf: (classId) => CLASS_FEATURE_CLASSES.find((entry) => entry.id === classId)?.name || classId,
    subclassNameOf: (classId, subclassId) => getClassFeatureSubclasses(classId)
      .find((entry) => entry.id === subclassId)?.name || "",
    spellNameOf: (spellId) => spellbookSpell(spellId).label,
  };
}

function readSheetImport() {
  resetSheetImport();
  // A new block replaces the hit points chosen from the previous one; closing the panel after Applica keeps them.
  pendingMonsterHitPoints = null;
  pendingMonsterName = "";
  pendingMonsterPortrait = null;
  pendingMonsterText = null;
  pendingMonsterLegendary = null;
  const text = $("sheetImportText").value;
  // 5eTools' JSON (a monster, a list, a bestiary): its monsters join the picker; one alone is read at once.
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (data && isFiveToolsData(data)) {
    fiveToolsInputs.push(data);
    const { monsters: pasted, excluded2024 } = fiveToolsCollection([data], { allow2024: fiveTools2024() });
    renderFiveToolsPicker(pasted.length === 1 ? pasted[0] : null);
    if (pasted.length === 1) void readFiveToolsMonster(pasted[0]);
    else if (pasted.length) setSheetImportStatus("Scegli il mostro nell'elenco.");
    else setSheetImportStatus(excluded2024 ? "Mostri delle regole 2024: per importarli accendi «Importa anche i mostri delle regole 2024» in Opzioni → Console attacchi (si giocano con le regole 2014 del plugin)." : "Nel blocco non c'è nessun mostro.", "error");
    return;
  }
  const parsed = parseCharacterSheetImport(text);
  // A stat block of the plugin's format with its full text ("text"): kept like a 5eTools monster's (lotto 4b).
  if (parsed.monster?.ref && typeof data?.text === "string") parsed.statblockText = monsterStatblockTextRecord({ ref: parsed.monster.ref, name: parsed.name, text: data.text });
  renderSheetImportResult(parsed);
}

// The loaded files: each one's monsters join the picker; a file that is not JSON is named in the status.
async function loadSheetImportFiles(files) {
  const failed = [];
  let added = 0;
  for (const file of Array.from(files || [])) {
    try {
      const data = JSON.parse(await file.text());
      const monsters = fiveToolsMonsters(data);
      if (!monsters.length) throw new Error("nessun mostro");
      fiveToolsInputs.push(data);
      added += monsters.length;
    } catch {
      failed.push(file.name);
    }
  }
  const { monsters } = fiveToolsCollection(allFiveToolsInputs(), { allow2024: fiveTools2024() });
  renderFiveToolsPicker(monsters.length === 1 ? monsters[0] : null);
  if (monsters.length === 1 && !failed.length) void readFiveToolsMonster(monsters[0]);
  else setSheetImportStatus([added ? "Scegli il mostro nell'elenco." : "", failed.length ? `Non letti (non sono JSON di 5eTools): ${failed.join(", ")}.` : ""]
    .filter(Boolean).join(" "), failed.length ? "error" : "");
}

// The picker: the monsters matching the search (at most 200), their count and books, the 2024 ones left out.
function renderFiveToolsPicker(selected = null) {
  const collection = fiveToolsCollection(allFiveToolsInputs(), { allow2024: fiveTools2024() });
  $("sheetImportPicker").hidden = !collection.monsters.length;
  if (!collection.monsters.length) return;
  const select = $("sheetImportMonster");
  const keep = selected || collection.monsters.find((monster) => fiveToolsMonsterLabel(monster) === select.value) || null;
  const matches = fiveToolsSearch(collection.monsters, $("sheetImportSearch").value, MAX_FIVE_TOOLS_OPTIONS);
  select.replaceChildren(...matches.map((monster) => {
    const option = document.createElement("option");
    option.value = fiveToolsMonsterLabel(monster);
    option.textContent = fiveToolsMonsterLabel(monster);
    return option;
  }));
  if (keep && matches.includes(keep)) select.value = fiveToolsMonsterLabel(keep);
  const total = fiveToolsSearch(collection.monsters, $("sheetImportSearch").value, Infinity).length;
  $("sheetImportPool").textContent = [
    `${collection.monsters.length} ${collection.monsters.length === 1 ? "mostro" : "mostri"} (${collection.sources.join(", ")})`,
    total > matches.length ? `ne mostro ${matches.length} su ${total}: affina la ricerca` : "",
    collection.excluded2024 ? `${collection.excluded2024} delle regole 2024 esclusi` : "",
  ].filter(Boolean).join(" · ");
}

// A 5eTools monster read into the sections, as a pasted stat block, with the line of what the console registers and
// what stays at the table.
async function readFiveToolsMonster(monster, { retried = false } = {}) {
  resetSheetImport();
  pendingMonsterHitPoints = null;
  pendingMonsterName = "";
  pendingMonsterPortrait = null;
  pendingMonsterText = null;
  pendingMonsterLegendary = null;
  const { pool } = fiveToolsCollection(allFiveToolsInputs());
  const converted = fiveToolsMonsterToStatblock(monster, { pool, allow2024: fiveTools2024() });
  // A derived monster whose base is in a book not kept yet: the archive downloads it, once (decision D2).
  if (converted.missingSource && !retried && archivePanel().hasBase()) {
    setSheetImportStatus(`Scarico dall'archivio il libro della base (${converted.missingSource})…`);
    if (await archivePanel().ensureSource(converted.missingSource)) return readFiveToolsMonster(monster, { retried: true });
  }
  if (converted.error) {
    setSheetImportStatus(converted.error, "error");
    return;
  }
  const parsed = parseCharacterSheetImport(JSON.stringify(converted.block));
  parsed.statblockText = monsterStatblockTextRecord({ ref: converted.block.ref, name: converted.block.name, fiveTools: converted.monster });
  renderSheetImportResult(parsed, {
    summary: fiveToolsImportSummary(converted, monster),
    report: converted.report,
    portrait: fiveToolsTokenUrl(fiveToolsArchiveBase("fiveToolsImages"), converted.block.portrait?.fiveTools),
  });
}

// The sections of a read block (a sheet, a stat block, a 5eTools monster) with their checkboxes; summary and report:
// the 5eTools line and what stays at the table.
function renderSheetImportResult(result, { summary = "", report = [], portrait = "" } = {}) {
  if (result.error) {
    setSheetImportStatus(result.error, "error");
    return;
  }
  sheetImportResult = result;
  const names = sheetImportNames();
  const rows = SHEET_IMPORT_SECTIONS
    .filter((section) => result.sections[section.id] !== undefined)
    .map((section) => {
      const row = document.createElement("label");
      row.className = "sheet-import-section";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.sheetImportSection = section.id;
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = section.label;
      const summary = document.createElement("small");
      summary.textContent = sheetImportSectionSummary(section.id, result.sections[section.id], names);
      summary.title = summary.textContent;
      copy.append(title, summary);
      row.append(checkbox, copy);
      if (SHEET_IMPORT_LIST_SECTIONS.includes(section.id)) {
        // A monster's stat block replaces the one the card had (fase 4): its lists start on Sostituisci.
        const mode = selectControl([["add", "Aggiungi"], ["replace", "Sostituisci"]], result.monster ? "replace" : "add");
        mode.dataset.sheetImportMode = section.id;
        mode.title = "Aggiungi i mancanti all'elenco attuale o sostituiscilo";
        row.appendChild(mode);
      } else {
        row.appendChild(document.createElement("span"));
      }
      return row;
    });
  // A legendary monster (fase 4, lotto 5, decision D7): the tracker's Leggendario mode after Salva, on this token and its
  // namesakes, never where a boss mode is set.
  if (result.monster && result.legendary) {
    const label = document.createElement("label");
    label.className = "sheet-import-hp-option sheet-import-legendary";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.sheetImportLegendary = "1";
    const { actions, resistances } = result.legendary;
    label.append(box, document.createTextNode(`Leggendario: ${actions} azioni${resistances ? `, ${resistances} resistenze` : ""} (anche agli omonimi; mai a chi ha già una modalità boss)`));
    rows.push(label);
  }
  // A monster's name for the token (fase 4, lotto 2): only the token in the sheet, after Salva.
  const newName = result.monster ? statblockTokenName(result.name, item?.name) : "";
  if (newName) {
    const label = document.createElement("label");
    label.className = "sheet-import-hp-option sheet-import-rename";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = statblockImportPrefs().rename;
    box.dataset.sheetImportRename = newName;
    label.append(box, document.createTextNode(`Rinomina il token in «${newName}»`));
    rows.push(label);
  }
  if (report.length) {
    const notes = document.createElement("p");
    notes.className = "sheet-import-report";
    notes.textContent = `Al tavolo: ${report.join("; ")}.`;
    rows.push(notes);
  }
  if (result.unresolved.length) {
    const unresolved = document.createElement("p");
    unresolved.className = "sheet-import-unresolved";
    unresolved.textContent = `Non riconosciuti, da sistemare a mano: ${result.unresolved.join(", ")}.`;
    rows.push(unresolved);
  }
  $("sheetImportSections").replaceChildren(...rows);
  if (result.hitPoints) void appendSheetImportHitPoints(result);
  if (portrait) void appendSheetImportPortrait(result, portrait);
  $("sheetImportSections").hidden = false;
  $("sheetImportApplyRow").hidden = false;
  const kind = result.monster ? "Statblock" : "Scheda";
  setSheetImportStatus(summary ? `${summary} Scegli le sezioni da applicare.`
    : `${result.name ? `${kind} di ${result.name}: s` : "S"}cegli le sezioni da applicare.`);
}

// A monster's hit points: the stat block's average (editable: the plugin never rolls the formula), ticked; replacing the
// token's current hit points only when asked; the other tokens with its name, when there are some.
async function appendSheetImportHitPoints(result) {
  const items = await OBR.scene.items.getItems().catch(() => []);
  if (sheetImportResult !== result) return;
  const self = items.find((entry) => entry.id === item?.id) || item;
  const meta = self?.metadata?.[META_KEY] || {};
  const row = document.createElement("label");
  row.className = "sheet-import-section";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = statblockImportPrefs().hitPoints;
  checkbox.dataset.sheetImportHp = "1";
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = "Punti ferita";
  const summary = document.createElement("small");
  summary.textContent = `Media dello statblock${result.hitPoints.formula ? ` (${result.hitPoints.formula})` : ""} · dopo Salva`;
  copy.append(title, summary);
  const value = document.createElement("input");
  value.type = "number";
  value.min = "1";
  value.max = "9999";
  value.step = "1";
  value.value = String(result.hitPoints.average);
  value.className = "sheet-import-hp-value";
  value.dataset.sheetImportHpValue = "1";
  value.setAttribute("aria-label", "Punti ferita da impostare");
  row.append(checkbox, copy, value);
  const options = [];
  const option = (dataset, text, checked = false) => {
    const label = document.createElement("label");
    label.className = "sheet-import-hp-option";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.dataset[dataset] = "1";
    label.append(box, document.createTextNode(text));
    options.push(label);
  };
  // Replaced by default, unless the token is wounded (fase 4: a monster in a fight never goes back to full).
  if (hasCanonicalHitPoints(self)) {
    const replace = statblockReplacesHitPoints(meta);
    option("sheetImportHpOverwrite", `Sostituisci i PF attuali (${meta.hp}/${meta.hpMax})${replace ? "" : ": il token è ferito"}`, replace);
  }
  // The tokens with the same name get the same stat block (lotto 1) and, ticked, its hit points; never a wounded one.
  const namesakes = monsterNamesakes(items, item?.id).filter((entry) => entry.metadata?.[META_KEY]?.attitude !== "pc");
  if (namesakes.length) option("sheetImportHpNamesakes", "Anche agli altri token con lo stesso nome (mai a quelli feriti)", true);
  const unresolved = $("sheetImportSections").querySelector(".sheet-import-unresolved");
  for (const node of [row, ...options]) $("sheetImportSections").insertBefore(node, unresolved);
}

// The monster's portrait from 5eTools' images (fase 4, lotto 3): offered only once the file has loaded (its size keeps
// the token's footprint), off by default; a monster without one in the mirror offers nothing.
async function appendSheetImportPortrait(result, url) {
  const image = new Image();
  const loaded = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth > 0 && image.naturalHeight > 0); };
    image.onerror = () => { clearTimeout(timer); resolve(false); };
    image.src = url;
  });
  if (sheetImportResult !== result || !loaded) return;
  const label = document.createElement("label");
  label.className = "sheet-import-hp-option sheet-import-portrait";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = false;
  box.dataset.sheetImportPortrait = url;
  box.dataset.width = String(image.naturalWidth);
  box.dataset.height = String(image.naturalHeight);
  image.alt = "";
  image.className = "sheet-import-portrait-preview";
  label.append(box, image, document.createTextNode("Usa il ritratto di 5eTools come immagine del token"));
  const rename = $("sheetImportSections").querySelector(".sheet-import-rename");
  $("sheetImportSections").insertBefore(label, rename?.nextSibling || $("sheetImportSections").querySelector(".sheet-import-report, .sheet-import-unresolved"));
}

// Empties one section of the stat block in the editor (fase 4, lotto 1): the stats, the abilities and saves, the
// defenses, the attacks (the quick actions stay), the Multiattack, the notes.
function clearSheetImportSection(id) {
  if (id === "classes") {
    $("classBuildEditorList").replaceChildren();
    syncClassBuildAddState();
    buildClassFeatureEditor();
  } else if (id === "spells") {
    draftSpellbook = sanitizeSpellbook(null);
    renderSpellbookEditor();
  } else if (id === "innate") {
    for (const row of innateSpellRows()) row.remove();
    syncQuickActionAddState();
  } else if (id === "stats") {
    for (const inputId of ["armorClassInput", "speedInput", "passivePerceptionInput", "spellSaveDCInput", "spellAttackBonusInput"]) $(inputId).value = "";
  } else if (id === "abilities" || id === "saves") {
    for (const key of ABILITY_KEYS) $(`${id === "abilities" ? "ability" : "save"}-${key}`).value = "";
  } else if (id === "defenses") {
    for (const type of DAMAGE_TYPES) $(`defense-${type.id}`).value = "";
  } else if (id === "attacks") {
    $("attackEditorList").replaceChildren();
    syncQuickActionAddState();
  } else if (id === "multiattack") {
    if (draftMonsterProfile) {
      const { multiattack: _dropped, ...rest } = draftMonsterProfile;
      draftMonsterProfile = rest;
    }
  } else if (id === "notes") {
    $("notesInput").value = "";
  }
}

// The quick actions that are a spell cast without a slot (free or with uses of its own): a stat block's innate spells.
function innateSpellRows() {
  return Array.from($("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']")).filter((row) =>
    row.querySelector("[data-quick-action-field='kind']")?.value === "spell"
    && ["free", "uses"].includes(row.querySelector("[data-quick-action-field='cost']")?.value));
}

// A monster's innate spells as quick actions (fase 4, lotto 4): Sostituisci removes the previous ones (the spells cast
// without a slot), the other quick actions stay; a spell already there is not added twice.
function applyImportedInnateSpells(actions, mode) {
  const list = $("quickActionEditorList");
  if (mode === "replace") for (const row of innateSpellRows()) row.remove();
  const spellKey = (row) => getSpellDefinition(row.querySelector("[data-quick-action-field='reference']")?.value || "")?.id || "";
  const present = new Set(Array.from(list.querySelectorAll("[data-quick-action-row='1']")).map(spellKey).filter(Boolean));
  for (const action of actions) {
    if (present.has(action.spellId)) continue;
    if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTIONS) break;
    list.appendChild(buildQuickActionEditorRow({ ...action, id: quickActionId() }));
    present.add(action.spellId);
  }
  syncQuickActionAddState();
}

function applyImportedAttacks(attacks, mode) {
  const list = $("attackEditorList");
  if (mode === "replace") list.replaceChildren();
  const nameKey = (value) => String(value || "").trim().toLocaleLowerCase("it");
  const names = new Set(Array.from(list.querySelectorAll("[data-quick-action-row='1'] [data-quick-action-field='label']"))
    .map((input) => nameKey(input.value)));
  for (const attack of attacks) {
    if (names.has(nameKey(attack.label))) continue;
    if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTION_ATTACKS) break;
    list.appendChild(buildQuickActionEditorRow({ ...attack, id: quickActionId() }, { attack: true }));
    names.add(nameKey(attack.label));
  }
  syncQuickActionAddState();
}

// Only the values the block states are written: a missing value keeps what the editor holds. Classes,
// species and defenses are a whole: the imported ones replace the current ones.
function applySheetImport() {
  if (!sheetImportResult) return;
  const { sections } = sheetImportResult;
  const chosen = Array.from($("sheetImportSections").querySelectorAll("[data-sheet-import-section]"))
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.sheetImportSection);
  const modeOf = (id) => $("sheetImportSections").querySelector(`[data-sheet-import-mode="${id}"]`)?.value || "add";
  if (!chosen.length && !$("sheetImportSections").querySelector("[data-sheet-import-hp]")?.checked) {
    setSheetImportStatus("Nessuna sezione scelta.", "error");
    return;
  }
  // A monster's stat block replaces the previous one as a whole: what it lacks is emptied, what it replaces is
  // emptied before being written; a section the GM unticked stays as it is.
  if (sheetImportResult.monster) {
    for (const id of monsterStatblockSectionsToClear({ sections, chosen })) clearSheetImportSection(id);
  }
  for (const id of chosen) {
    const section = sections[id];
    if (id === "classes") {
      // A subclass the block lacks, or that was not recognised, keeps the one the editor already holds.
      const current = collectCharacterBuildEditor();
      const build = section.map((entry) => ({
        ...entry,
        subclassId: entry.subclassId || current.find((row) => row.classId === entry.classId)?.subclassId || "",
      }));
      $("classBuildEditorList").replaceChildren(...build.map((entry) => buildClassBuildEditorRow(entry)));
      syncClassBuildAddState();
      buildClassFeatureEditor();
      // A monster's class only gives its slots (fase 4, lotto 4, decision D5): its class features start off.
      if (sheetImportResult.monster) {
        for (const feature of getAvailableClassFeatures(collectCharacterBuildEditor())) draftEnabledFeatureIds.delete(feature.id);
        buildClassFeatureEditor();
      }
    } else if (id === "species") {
      $("speciesInput").value = section.id;
      buildSpeciesAncestryOptions(section.id, section.ancestryId);
    } else if (id === "supernaturalGift") {
      $("supernaturalGiftInput").value = section.id;
    } else if (id === "stats") {
      const inputs = {
        armorClass: "armorClassInput",
        speed: "speedInput",
        passivePerception: "passivePerceptionInput",
        spellSaveDC: "spellSaveDCInput",
        spellAttackBonus: "spellAttackBonusInput",
      };
      for (const [key, inputId] of Object.entries(inputs)) {
        if (section[key] !== undefined) $(inputId).value = section[key];
      }
    } else if (id === "abilities" || id === "saves") {
      for (const key of ABILITY_KEYS) {
        if (section[key] !== null && section[key] !== undefined) {
          $(`${id === "abilities" ? "ability" : "save"}-${key}`).value = section[key];
        }
      }
    } else if (id === "defenses") {
      for (const type of DAMAGE_TYPES) $(`defense-${type.id}`).value = damageDefenseFor(section, type.id) || "";
    } else if (id === "spells") {
      draftSpellbook = mergeImportedSpellbook(draftSpellbook, section, modeOf(id));
      renderSpellbookEditor();
    } else if (id === "attacks") {
      applyImportedAttacks(section, modeOf(id));
    } else if (id === "innate") {
      applyImportedInnateSpells(section, modeOf(id));
    } else if (id === "multiattack") {
      draftMonsterProfile = { ...(draftMonsterProfile || {}), multiattack: section };
    } else if (id === "notes") {
      $("notesInput").value = section;
    }
  }
  // A monster's hit points: set after Salva, through the tracker's HP command.
  const hpBox = $("sheetImportSections").querySelector("[data-sheet-import-hp]");
  const hpValue = Number($("sheetImportSections").querySelector("[data-sheet-import-hp-value]")?.value);
  if (hpBox?.checked && !(Number.isInteger(hpValue) && hpValue >= 1 && hpValue <= 9999)) {
    setSheetImportStatus("Punti ferita: un numero intero da 1 a 9999.", "error");
    return;
  }
  pendingMonsterHitPoints = hpBox?.checked ? {
    hp: hpValue,
    overwrite: !!$("sheetImportSections").querySelector("[data-sheet-import-hp-overwrite]")?.checked,
    sameName: !!$("sheetImportSections").querySelector("[data-sheet-import-hp-namesakes]")?.checked,
  } : null;
  if (pendingMonsterHitPoints) chosen.push("hitPoints");
  const renameBox = $("sheetImportSections").querySelector("[data-sheet-import-rename]");
  pendingMonsterName = renameBox?.checked ? renameBox.dataset.sheetImportRename : "";
  if (pendingMonsterName) chosen.push("name");
  const portraitBox = $("sheetImportSections").querySelector("[data-sheet-import-portrait]");
  pendingMonsterPortrait = portraitBox?.checked ? { url: portraitBox.dataset.sheetImportPortrait,
    width: Number(portraitBox.dataset.width), height: Number(portraitBox.dataset.height) } : null;
  if (pendingMonsterPortrait) chosen.push("portrait");
  pendingMonsterText = sheetImportResult.monster && sheetImportResult.statblockText ? sheetImportResult.statblockText : null;
  pendingMonsterLegendary = $("sheetImportSections").querySelector("[data-sheet-import-legendary]")?.checked ? sheetImportResult.legendary : null;
  if (pendingMonsterLegendary) chosen.push("legendary");
  if (pendingMonsterText) chosen.push("statblockText");
  if (sheetImportResult.monster) {
    rememberStatblockImportPrefs({ rename: renameBox ? renameBox.checked : statblockImportPrefs().rename,
      hitPoints: hpBox ? hpBox.checked : statblockImportPrefs().hitPoints });
  }
  // A monster's block marks the card as a monster's (its source), whatever sections were applied.
  if (sheetImportResult.monster) {
    // The stat block's own fields (immunities, Evasion) are the new block's, never the old monster's (fase 5, lotto 2).
    const kept = Object.fromEntries(Object.entries(draftMonsterProfile || {}).filter(([field]) => !MONSTER_PROFILE_STATBLOCK_FIELDS.includes(field)));
    draftMonsterProfile = sanitizeMonsterProfile({ ...kept, ...sheetImportResult.monster });
  }
  const labelsById = new Map([...SHEET_IMPORT_SECTIONS.map((section) => [section.id, section.label]), ["hitPoints", "Punti ferita (dopo Salva)"],
    ["name", "Nome del token (dopo Salva)"], ["portrait", "Ritratto del token (dopo Salva)"],
    ["statblockText", "Testo dello statblock (dopo Salva)"], ["legendary", "Leggendario (dopo Salva)"]]);
  setSheetImportStatus(
    `Compilato: ${chosen.map((id) => labelsById.get(id)).join(", ")}. Controlla le schede e premi Salva.`,
    "success",
  );
}

// Both editors save into quickActions: the quick actions first, then the attacks.
function collectQuickActions() {
  const rows = [
    ...$("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']"),
    ...$("attackEditorList").querySelectorAll("[data-quick-action-row='1']"),
  ];
  const drafts = rows.map((row) => {
    const field = (name) => row.querySelector(`[data-quick-action-field='${name}']`);
    const kind = field("kind").value;
    if (kind === "feature") {
      const featureId = field("featureId").value.trim();
      const feature = CLASS_FEATURE_BY_ID.get(featureId);
      if (!feature) throw new Error("Scegli una capacità di classe valida.");
      const label = field("label").value.trim() || classFeatureDisplayNameWithParent(feature);
      return {
        id: row.dataset.actionId,
        label,
        kind,
        featureId,
        targetMode: classFeatureTargetMode(feature),
      };
    }
    if (kind === "attack" && field("attackSource").value === "spell") {
      const spellIds = Array.from(row.querySelectorAll("[data-attack-spell-id]"))
        .filter((box) => box.checked).map((box) => box.dataset.attackSpellId);
      return {
        id: row.dataset.actionId,
        label: field("label").value.trim() || "Incantesimi d'attacco",
        kind,
        source: { kind: "spell", spellIds },
      };
    }
    if (kind === "attack" && field("attackSource").value === "cantrip") {
      const spellIds = Array.from(row.querySelectorAll("[data-cantrip-id]"))
        .filter((box) => box.checked).map((box) => box.dataset.cantripId);
      return {
        id: row.dataset.actionId,
        label: field("label").value.trim() || "Trucchetto",
        kind,
        source: { kind: "cantrip", spellIds },
      };
    }
    if (kind === "attack") {
      const label = field("label").value.trim();
      if (!label) throw new Error("Dai un nome a ogni attacco.");
      const components = Array.from(row.querySelectorAll("[data-attack-component='1']")).map((componentRow) => ({
        type: componentRow.querySelector("[data-component-field='type']").value,
        formula: componentRow.querySelector("[data-component-field='formula']").value.trim(),
      }));
      return {
        id: row.dataset.actionId,
        label,
        kind,
        range: field("attackSource").value,
        components,
        ...(row.dataset.monsterAttackFields ? JSON.parse(row.dataset.monsterAttackFields) : {}),
      };
    }
    const reference = field("reference").value.trim();
    const label = field("label").value.trim() || reference;
    if (!reference || !label) throw new Error("Completa nome e contenuto di ogni azione rapida.");
    if (kind === "spell") {
      const spell = getSpellDefinition(reference);
      if (!spell) throw new Error(`Incantesimo non riconosciuto: ${reference}`);
      return {
        id: row.dataset.actionId,
        label,
        kind,
        spellId: spell.id,
        launchMode: field("launchMode").value,
        targetMode: field("targetMode").value,
        slotLevel: field("slotLevel").value,
        turns: field("turns").value,
        applyAutomations: true,
        cost: field("cost").value,
        uses: field("uses").value,
      };
    }
    return {
      id: row.dataset.actionId,
      label,
      kind,
      conditionName: reference,
      targetMode: field("targetMode").value,
      expiryMode: field("expiryMode").value,
      duration: field("duration").value,
    };
  });
  const actions = sanitizeQuickActions(drafts);
  if (actions.length !== drafts.length) {
    throw new Error("Una o più azioni rapide non sono valide.");
  }
  return actions;
}

function populateSubclassSelect(select, classId, selectedId = "") {
  const options = [["", "Nessuna / non scelta"]];
  for (const subclass of getClassFeatureSubclasses(classId)) {
    options.push([subclass.id, subclass.name]);
  }
  select.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
  select.value = options.some(([value]) => value === selectedId) ? selectedId : "";
  select.disabled = options.length === 1;
}

function collectCharacterBuildEditor({ validate = false } = {}) {
  const rows = Array.from(
    $("classBuildEditorList").querySelectorAll("[data-class-build-row='1']")
  );
  const drafts = rows.map((row) => ({
    classId: row.querySelector("[data-class-build-field='classId']").value,
    level: row.querySelector("[data-class-build-field='level']").value,
    subclassId: row.querySelector("[data-class-build-field='subclassId']").value,
  })).filter((entry) => entry.classId);
  if (validate && new Set(drafts.map((entry) => entry.classId)).size !== drafts.length) {
    throw new Error("Ogni classe può comparire una sola volta.");
  }
  return sanitizeCharacterBuild(drafts);
}

function syncClassBuildAddState() {
  const count = $("classBuildEditorList")
    .querySelectorAll("[data-class-build-row='1']").length;
  $("classBuildAdd").disabled = count >= MAX_CHARACTER_CLASSES;
  $("classBuildAdd").title = count >= MAX_CHARACTER_CLASSES
    ? `Massimo ${MAX_CHARACTER_CLASSES} classi`
    : "Aggiungi una classe";
}

function buildClassFeatureEditor() {
  const build = collectCharacterBuildEditor();
  const available = getAvailableClassFeatures(build);
  for (const feature of available) {
    if (!draftKnownAvailableFeatureIds.has(feature.id) && feature.defaultEnabled) {
      draftEnabledFeatureIds.add(feature.id);
    }
    draftKnownAvailableFeatureIds.add(feature.id);
  }

  const list = $("classFeatureEditorList");
  if (!available.length) {
    list.replaceChildren(classFeatureEmpty(
      build.length
        ? "Nessuna capacità attivabile per questa configurazione."
        : "Aggiungi almeno una classe."
    ));
    return;
  }

  const buildFeatureOption = (feature) => {
    const option = document.createElement("label");
    option.className = "class-feature-editor-option";
    const parentFeatureId = classFeatureParentFeatureId(feature);
    const parentFeature = parentFeatureId
      ? CLASS_FEATURE_BY_ID.get(parentFeatureId)
      : null;
    if (parentFeature) {
      option.classList.add("class-feature-editor-suboption");
      option.dataset.parentFeatureId = parentFeature.id;
    }
    const checkbox = document.createElement("input");
    checkbox.type = feature.optionGroup ? "radio" : "checkbox";
    if (feature.optionGroup) {
      checkbox.name = `class-feature-group-${feature.optionGroup}`;
    }
    checkbox.dataset.classFeatureId = feature.id;
    checkbox.checked = draftEnabledFeatureIds.has(feature.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        draftEnabledFeatureIds.add(feature.id);
        if (feature.optionGroup) {
          for (const peer of available.filter((entry) =>
            entry.optionGroup === feature.optionGroup && entry.id !== feature.id
          )) {
            draftEnabledFeatureIds.delete(peer.id);
            for (const peerCheckbox of list.querySelectorAll("input[data-class-feature-id]")) {
              if (peerCheckbox.dataset.classFeatureId === peer.id) peerCheckbox.checked = false;
            }
          }
        }
      } else {
        draftEnabledFeatureIds.delete(feature.id);
      }
    });
    const copy = document.createElement("span");
    copy.className = "class-feature-editor-option-copy";
    const name = document.createElement("strong");
    name.textContent = parentFeature ? `↳ ${feature.name}` : feature.name;
    const meta = document.createElement("small");
    meta.textContent = classFeatureIsReferenceOnly(feature)
      ? classFeatureMetaText(feature)
      : classFeatureRuntimeSupport(feature).ready
        ? classFeatureMetaText(feature)
        : `${classFeatureMetaText(feature)} · solo riferimento`;
    copy.append(name, meta);
    option.append(checkbox, copy);
    return option;
  };
  const availableIds = new Set(available.map((feature) => feature.id));
  const childrenByParent = new Map();
  for (const feature of available) {
    const parentId = classFeatureParentFeatureId(feature);
    if (!parentId || !availableIds.has(parentId)) continue;
    const children = childrenByParent.get(parentId) || [];
    children.push(feature);
    childrenByParent.set(parentId, children);
  }
  const roots = available.filter((feature) => {
    const parentId = classFeatureParentFeatureId(feature);
    return !parentId || !availableIds.has(parentId);
  });
  const nodes = [];
  for (const feature of roots) {
    nodes.push(buildFeatureOption(feature));
    const children = childrenByParent.get(feature.id) || [];
    if (!children.length) continue;
    const subgroup = document.createElement("div");
    subgroup.className = "class-feature-editor-subgroup";
    subgroup.dataset.parentFeatureId = feature.id;
    const label = document.createElement("small");
    label.textContent = `Scelte di ${feature.name}`;
    subgroup.append(label, ...children.map(buildFeatureOption));
    nodes.push(subgroup);
  }
  list.replaceChildren(...nodes);
}

function buildClassBuildEditorRow(entry = {}) {
  const row = document.createElement("div");
  row.className = "class-build-editor-row";
  row.dataset.classBuildRow = "1";

  const classSelect = selectControl([
    ["", "Scegli classe"],
    ...CLASS_FEATURE_CLASSES.map((classEntry) => [classEntry.id, classEntry.name]),
  ], entry.classId || "");
  classSelect.dataset.classBuildField = "classId";

  const levelInput = document.createElement("input");
  levelInput.type = "number";
  levelInput.min = "1";
  levelInput.max = "20";
  levelInput.step = "1";
  levelInput.value = entry.level || 1;
  levelInput.dataset.classBuildField = "level";

  const subclassSelect = document.createElement("select");
  subclassSelect.dataset.classBuildField = "subclassId";
  populateSubclassSelect(subclassSelect, classSelect.value, entry.subclassId || "");

  const makeLabel = (text, control) => {
    const label = document.createElement("label");
    label.append(text, control);
    return label;
  };
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "class-build-remove";
  remove.textContent = "×";
  remove.title = "Rimuovi classe";

  classSelect.addEventListener("change", () => {
    populateSubclassSelect(subclassSelect, classSelect.value);
    buildClassFeatureEditor();
  });
  levelInput.addEventListener("change", buildClassFeatureEditor);
  subclassSelect.addEventListener("change", buildClassFeatureEditor);
  remove.addEventListener("click", () => {
    row.remove();
    syncClassBuildAddState();
    buildClassFeatureEditor();
  });

  row.append(
    makeLabel("Classe", classSelect),
    makeLabel("Livello", levelInput),
    makeLabel("Sottoclasse", subclassSelect),
    remove,
  );
  return row;
}

function buildClassBuildEditor() {
  const build = sanitizeCharacterBuild(profile?.characterBuild);
  $("classBuildEditorList").replaceChildren(...(
    build.length
      ? build.map((entry) => buildClassBuildEditorRow(entry))
      : [buildClassBuildEditorRow()]
  ));
  const available = getAvailableClassFeatures(build);
  draftEnabledFeatureIds = new Set(
    profile?.classFeaturesConfigured === true
      ? profile.enabledClassFeatureIds
      : available.filter((feature) => feature.defaultEnabled).map((feature) => feature.id)
  );
  draftKnownAvailableFeatureIds = new Set(available.map((feature) => feature.id));
  syncClassBuildAddState();
  buildClassFeatureEditor();
}

function collectEnabledClassFeatureIds(characterBuild) {
  const available = getAvailableClassFeatures(characterBuild);
  const availableById = new Map(available.map((feature) => [feature.id, feature]));
  const seenOptionGroups = new Set();
  const result = [];
  for (const id of draftEnabledFeatureIds) {
    const feature = availableById.get(id);
    if (!feature) continue;
    if (feature.optionGroup) {
      if (seenOptionGroups.has(feature.optionGroup)) continue;
      seenOptionGroups.add(feature.optionGroup);
    }
    result.push(id);
  }
  return result;
}

function applyFactionTheme() {
  const meta = item?.metadata?.[META_KEY] || {};
  const attitude = String(meta.attitude || (meta.inInitiative === true ? "ally" : "neutral"))
    .trim()
    .toLowerCase();
  document.documentElement.dataset.faction = ["pc", "ally", "neutral", "enemy"].includes(attitude)
    ? attitude
    : "neutral";
}

function renderPortrait() {
  const portrait = $("portrait");
  const fallback = $("portraitFallback");
  const name = String(item?.name || "").trim();
  fallback.textContent = name.slice(0, 1).toUpperCase() || "?";
  const source = String(item?.image?.url || item?.image?.src || item?.image?.href || item?.data?.src || "").trim();
  portrait.querySelector("img")?.remove();
  fallback.style.display = "grid";
  if (!source) return;
  const image = document.createElement("img");
  image.alt = "";
  image.src = source;
  image.addEventListener("load", () => { fallback.style.display = "none"; });
  image.addEventListener("error", () => image.remove());
  portrait.appendChild(image);
}

// What the token looked like at the last full render: the scene sends every item on every change, and the card
// redraws only when its own token changed.
let renderedItemSignature = "";

function sourceItemSignature(entry) {
  try {
    return JSON.stringify([entry?.name, entry?.image?.url, entry?.metadata]);
  } catch {
    return "";
  }
}

function renderView() {
  renderedItemSignature = sourceItemSignature(item);
  const meta = item?.metadata?.[META_KEY] || {};
  $("title").textContent = item?.name || "Scheda personaggio";
  const buildLabels = classFeatureBuildLabel(profile.characterBuild);
  $("characterBuildLine").textContent = buildLabels.join(" / ");
  $("characterBuildLine").hidden = buildLabels.length === 0;
  renderPortrait();
  $("hp").textContent = `${valueText(meta.hp)} / ${valueText(meta.hpMax)}`;
  $("armorClass").textContent = valueText(profile.armorClass);
  $("passivePerception").textContent = valueText(profile.passivePerception);
  $("speed").textContent = valueText(profile.speed, profile.speed === null ? "" : " m");
  $("spellSaveDC").textContent = valueText(profile.spellSaveDC);
  $("spellAttackBonus").textContent = signedText(profile.spellAttackBonus);
  $("notes").textContent = profile.notes || "";
  $("notesBlock").hidden = !profile.notes;
  renderQuickActions();
  renderSpellbook();
  renderClassFeatures();
  $("exhaustion").textContent = String(exhaustionPending ?? (profile.exhaustion || 0));
  for (const [id, disabled] of [
    ["exhaustionDown", exhaustionSaving || !isGM || profile.exhaustion <= 0],
    ["exhaustionUp", exhaustionSaving || !isGM || profile.exhaustion >= 5],
  ]) {
    const button = $(id);
    button.style.display = isGM ? "inline-block" : "none";
    button.disabled = disabled;
  }
  $("saves").replaceChildren(...SAVE_KEYS.map((key) => {
    const row = document.createElement("div");
    row.className = "save";
    const label = document.createElement("span");
    label.textContent = labels[key];
    const value = document.createElement("strong");
    value.textContent = signedText(profile.savingThrows[key]);
    row.append(label, value);
    return row;
  }));
  renderAbilityModifiers();
  renderDamageDefenses();
  void renderStatblockText();
}

// The full stat block at the bottom of the Stats tab: an NPC's sheet, for the GM, from this browser's memory.
async function renderStatblockText() {
  const block = $("statblockTextBlock");
  const ref = monsterStatblockTextRef({ isGM, attitude: item?.metadata?.[META_KEY]?.attitude, card: profile });
  block.dataset.ref = ref;
  if (!ref) {
    block.hidden = true;
    return;
  }
  // The one kept at its import, else the monster in the archive's books kept in this browser (lotto 4b).
  const view = await statblockTextLoader().view(ref, { fromArchive: profile?.[MONSTER_PROFILE_FIELD]?.source === "5etools",
    revision: JSON.stringify(profile?.[MONSTER_PROFILE_FIELD] || null) });
  if (block.dataset.ref !== ref) return;
  const body = $("statblockText");
  if (!view) {
    const missing = document.createElement("p");
    missing.className = "statblock-text-missing";
    missing.textContent = "Il testo non è in questo browser: reimporta il mostro (o aggiungi il suo libro all'archivio).";
    body.replaceChildren(missing);
  } else {
    const nodes = view.header.map((row) => {
      const line = document.createElement("p");
      line.className = "statblock-text-line";
      if (row.label) {
        const label = document.createElement("b");
        label.textContent = `${row.label} `;
        line.appendChild(label);
      }
      line.appendChild(document.createTextNode(row.text));
      return line;
    });
    for (const section of view.sections) {
      if (section.title) {
        const title = document.createElement("h4");
        title.className = "statblock-text-title";
        title.textContent = section.title;
        nodes.push(title);
      }
      for (const entry of section.entries) {
        const line = document.createElement("p");
        line.className = "statblock-text-entry";
        if (entry.name) {
          const name = document.createElement("b");
          name.textContent = `${entry.name}. `;
          line.appendChild(name);
        }
        line.appendChild(document.createTextNode(entry.text));
        nodes.push(line);
      }
    }
    body.replaceChildren(...nodes);
  }
  block.hidden = false;
}

// Modificatori di caratteristica: massimi dei pool a formula e CD delle capacità di classe.
function renderAbilityModifiers() {
  const modifiers = sanitizeAbilityModifiers(profile?.[ABILITY_MODIFIERS_FIELD]);
  $("abilityModifiers").replaceChildren(...ABILITY_KEYS.map((key) => {
    const row = document.createElement("div");
    row.className = "save";
    const label = document.createElement("span");
    label.textContent = labels[key];
    const value = document.createElement("strong");
    value.textContent = signedText(modifiers[key]);
    row.append(label, value);
    return row;
  }));
  $("abilityModifiersBlock").hidden = !hasAbilityModifiers(modifiers);
}

function buildAbilityModifierInputs() {
  $("abilityModifierInputs").replaceChildren(...ABILITY_KEYS.map((key) => {
    const label = document.createElement("label");
    label.textContent = labels[key];
    const input = document.createElement("input");
    input.id = `ability-${key}`;
    input.type = "number";
    input.min = "-5";
    input.max = "10";
    input.inputMode = "numeric";
    label.appendChild(input);
    return label;
  }));
}

// Actor Profile damage defenses: read by Boss Actions per damage type.
function renderDamageDefenses() {
  const defenses = profileDamageDefenses(profile);
  const tags = DAMAGE_TYPES
    .map((type) => ({ type: type.id, defense: damageDefenseFor(defenses, type.id) }))
    .filter((row) => row.defense)
    .map(damageDefenseTag);
  $("damageDefenses").textContent = tags.join(" · ");
  $("damageDefensesBlock").hidden = tags.length === 0;
}

function buildDefenseInputs() {
  $("defenseInputs").replaceChildren(...DAMAGE_TYPES.map((type) => {
    const label = document.createElement("label");
    label.textContent = type.label;
    const select = document.createElement("select");
    select.id = `defense-${type.id}`;
    for (const [value, text] of DEFENSE_CHOICES) select.appendChild(new Option(text, value));
    label.appendChild(select);
    return label;
  }));
}

function buildSpeciesAncestryOptions(speciesId, ancestryId = "") {
  const select = $("speciesAncestryInput");
  const species = getSpecies(speciesId);
  const options = species?.ancestries || [];
  $("speciesAncestryLabel").textContent = species?.optionLabel || "Ascendenza";
  select.replaceChildren(new Option(options.length ? "Scegli…" : "—", ""), ...options
    .map((entry) => new Option(entry.damageLabel ? `${entry.label} · ${entry.damageLabel}` : entry.label, entry.id)));
  select.disabled = !options.length;
  select.value = species?.ancestries.some((entry) => entry.id === ancestryId) ? ancestryId : "";
}

function buildSpeciesEditor() {
  const current = sanitizeSpecies(profile?.[SPECIES_FIELD]);
  const select = $("speciesInput");
  // Grouped by manual, in the book's order.
  const groups = new Map();
  for (const entry of SPECIES) {
    if (!groups.has(entry.sourceLabel)) groups.set(entry.sourceLabel, Object.assign(document.createElement("optgroup"), { label: entry.sourceLabel }));
    groups.get(entry.sourceLabel).append(new Option(entry.label, entry.id));
  }
  select.replaceChildren(new Option("Nessuna", ""), ...groups.values());
  select.value = current?.id || "";
  buildSpeciesAncestryOptions(current?.id, current?.ancestryId);
  const gift = $("supernaturalGiftInput");
  gift.replaceChildren(new Option("Nessuno", ""), ...SUPERNATURAL_GIFTS.map((entry) => new Option(`${entry.label} · ${entry.sourceLabel}`, entry.id)));
  gift.value = sanitizeSupernaturalGift(profile?.[SUPERNATURAL_GIFT_FIELD])?.id || "";
  const ability = $("speciesSpellAbilityInput");
  ability.replaceChildren(new Option("La più alta tra Int, Sag e Car", ""), new Option("Intelligenza", "int"),
    new Option("Saggezza", "wis"), new Option("Carisma", "cha"));
  ability.value = sanitizeSpeciesSpellAbility(profile?.[SPECIES_SPELL_ABILITY_FIELD]) || "";
  syncSpeciesSpellAbilityRow();
}

// The innate spells' ability, only for the species whose book leaves it to the player.
function syncSpeciesSpellAbilityRow() {
  $("speciesSpellAbilityRow").hidden = !speciesHasSpellAbilityChoice($("speciesInput").value);
}

function collectSpecies() {
  return sanitizeSpecies({ id: $("speciesInput").value, ancestryId: $("speciesAncestryInput").value });
}

function collectSupernaturalGift() {
  return sanitizeSupernaturalGift({ id: $("supernaturalGiftInput").value });
}

function collectDamageDefenses() {
  const result = { resistances: [], immunities: [], vulnerabilities: [] };
  for (const type of DAMAGE_TYPES) {
    const list = DEFENSE_LIST_BY_KIND[$(`defense-${type.id}`).value];
    if (list) result[list].push(type.id);
  }
  return sanitizeDamageDefenses(result);
}

function setEditing(active) {
  editing = !!active;
  // The editor writes the whole book: a preparation in progress is left as stored.
  spellPreparationDraft = null;
  if (!editing) {
    renderClassFeatures();
    syncCardTabs();
    return;
  }
  $("armorClassInput").value = profile.armorClass ?? "";
  $("passivePerceptionInput").value = profile.passivePerception ?? "";
  $("speedInput").value = profile.speed ?? "";
  $("exhaustionInput").value = profile.exhaustion ?? 0;
  $("spellSaveDCInput").value = profile.spellSaveDC ?? "";
  $("spellAttackBonusInput").value = profile.spellAttackBonus ?? "";
  $("notesInput").value = profile.notes ?? "";
  buildQuickActionEditor();
  buildSpellbookEditor();
  draftMonsterProfile = Object.hasOwn(profile || {}, MONSTER_PROFILE_FIELD) ? sanitizeMonsterProfile(profile[MONSTER_PROFILE_FIELD]) : undefined;
  pendingMonsterHitPoints = null;
  pendingMonsterName = "";
  pendingMonsterPortrait = null;
  pendingMonsterText = null;
  pendingMonsterLegendary = null;
  fiveToolsInputs = [];
  $("sheetImportSearch").value = "";
  $("sheetImportPicker").hidden = true;
  setSheetImportOpen(false);
  buildSpeciesEditor();
  buildClassBuildEditor();
  const abilityModifiers = sanitizeAbilityModifiers(profile?.[ABILITY_MODIFIERS_FIELD]);
  for (const key of ABILITY_KEYS) $(`ability-${key}`).value = abilityModifiers[key] ?? "";
  for (const key of SAVE_KEYS) $(`save-${key}`).value = profile.savingThrows[key] ?? "";
  const defenses = sanitizeDamageDefenses(profile?.[DAMAGE_DEFENSES_FIELD]);
  for (const type of DAMAGE_TYPES) $(`defense-${type.id}`).value = damageDefenseFor(defenses, type.id) || "";
  $("status").textContent = "";
  syncCardTabs();
}

async function adjustExhaustion(delta) {
  const operation = sceneLifecycle.capture({ operationId: `initiative-exhaustion:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !isGM || !item || exhaustionSaving) return;
  const next = Math.max(0, Math.min(5, Number(profile.exhaustion || 0) + delta));
  if (next === profile.exhaustion) return;
  exhaustionSaving = true;
  exhaustionPending = next;
  renderView();
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await saveInitiativeCard(item.id, item.name, { ...profile, exhaustion: next }, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    [item] = await OBR.scene.items.getItems([item.id]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    profile = getInitiativeCard(item);
  } catch (err) {
    console.warn("[initiative-card] Indebolimento:", err?.message || err);
  } finally {
    exhaustionSaving = false;
    exhaustionPending = null;
    if (sceneLifecycle.isReady()) renderView();
  }
}

function buildSaveInputs() {
  $("saveInputs").replaceChildren(...SAVE_KEYS.map((key) => {
    const label = document.createElement("label");
    label.textContent = labels[key];
    const input = document.createElement("input");
    input.id = `save-${key}`;
    input.type = "number";
    input.min = "-99";
    input.max = "99";
    label.appendChild(input);
    return label;
  }));
}

function subscribeToSourceItemChanges() {
  OBR.scene.items.onChange((items) => {
    const next = (Array.isArray(items) ? items : [])
      .find((entry) => entry?.id === sourceId);
    if (!next) return;
    item = next;
    if (editing || classFeatureMutating || quickActionLaunching) return;
    // Another token moved, a label or a bar changed: the card stays as drawn, its buttons under the cursor.
    const signature = sourceItemSignature(next);
    if (signature && signature === renderedItemSignature) return;
    profile = getInitiativeCard(item);
    applyFactionTheme();
    renderView();
  });
}

function subscribeToSceneStateChanges() {
  OBR.scene.onMetadataChange((metadata) => {
    const nextRound = Math.max(
      1,
      Math.floor(Number(metadata?.[`${ID}/state`]?.round) || 1)
    );
    if (nextRound === currentRoundValue) return;
    currentRoundValue = nextRound;
    if (editing || classFeatureMutating || quickActionLaunching) return;
    renderView();
  });
}

OBR.onReady(async () => {
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      item = null;
      profile = null;
      editing = false;
      classFeatureMutating = false;
      quickActionLaunching = false;
      document.querySelectorAll("input, select, textarea, button").forEach((control) => {
        if (control.id !== "close") control.disabled = true;
      });
      $("status").textContent = "Scena cambiata: riapri la scheda.";
      $("classFeatureRunStatus").textContent = "Scena cambiata: riapri la scheda.";
      closeInitiativeCardPopover();
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      window.location.reload();
    }
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    $("title").textContent = "Scheda non disponibile";
    $("hp").textContent = "Scena non disponibile: riapri la scheda.";
    return;
  }
  try {
    const [items, role, sceneMetadata] = await Promise.all([
      OBR.scene.items.getItems([sourceId]),
      OBR.player.getRole(),
      OBR.scene.getMetadata().catch(() => ({})),
    ]);
    if (!sceneLifecycle.isReady()) throw new Error("Scena cambiata: riapri la scheda.");
    item = items[0] || null;
    isGM = role === "GM";
    currentRoundValue = Math.max(
      1,
      Math.floor(Number(sceneMetadata?.[`${ID}/state`]?.round) || 1)
    );
    if (!item) throw new Error("Token non trovato");
    applyFactionTheme();
    // The realignment of the Room registry and of the token runs after the first render (deferWrites).
    profile = await loadInitiativeCard(item, { hydrate: isGM, deferWrites: true });
    populateQuickActionDatalists();
    populateSpellbookDatalist();
    buildAbilityModifierInputs();
    buildSaveInputs();
    buildDefenseInputs();
    subscribeToSourceItemChanges();
    subscribeToSceneStateChanges();
    renderView();
    // The rules text of the class features arrives after the first render (classFeatureDescriptions.js).
    void loadClassFeatureDescriptions()
      .then(() => {
        if (sceneLifecycle.isReady() && !editing && !classFeatureMutating) renderClassFeatures();
      })
      .catch((error) => console.warn("[initiative-card] class feature descriptions:", error?.message || error));
    if (isGM && !hasInitiativeCardValues(profile)) setEditing(true);
    else syncCardTabs();
    if (!editing) await runRequestedQuickActionOnce();
  } catch (err) {
    $("title").textContent = "Scheda non disponibile";
    $("edit").style.display = "none";
    $("hp").textContent = err?.message || "Errore";
  }
});

$("close").addEventListener("click", closeInitiativeCardPopover);
$("edit").addEventListener("click", () => setEditing(true));
$("cancel").addEventListener("click", () => setEditing(false));
$("statsTab").addEventListener("click", () => setCardTab("stats"));
$("spellbookTab").addEventListener("click", () => setCardTab("spellbook"));
$("spellbookAdd").addEventListener("click", addSpellbookSpell);
$("sheetImportToggle").addEventListener("click", () => setSheetImportOpen($("sheetImport").hidden));
$("sheetImportClose").addEventListener("click", () => setSheetImportOpen(false));
$("sheetImportRead").addEventListener("click", readSheetImport);
$("sheetImportFileButton").addEventListener("click", () => $("sheetImportFile").click());
$("sheetImportFile").addEventListener("change", () => {
  const files = $("sheetImportFile").files;
  void loadSheetImportFiles(files).finally(() => { $("sheetImportFile").value = ""; });
});
$("sheetImportSearch").addEventListener("input", () => renderFiveToolsPicker());
// The archive's list of books is read when the GM opens "Archivio online", not before.
$("sheetImportArchive").addEventListener("toggle", () => {
  if ($("sheetImportArchive").open && archivePanel().hasBase()) void archivePanel().loadIndex();
});
$("sheetImportMonster").addEventListener("change", () => {
  const monster = fiveToolsCollection(allFiveToolsInputs(), { allow2024: fiveTools2024() }).monsters
    .find((entry) => fiveToolsMonsterLabel(entry) === $("sheetImportMonster").value);
  if (monster) void readFiveToolsMonster(monster);
});
$("sheetImportApply").addEventListener("click", applySheetImport);
// Enter adds the spell: it must not submit the whole sheet.
$("spellbookSearch").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addSpellbookSpell();
});
$("quickActionsTab").addEventListener("click", () => setCardTab("quick-actions"));
$("attacksTab").addEventListener("click", () => setCardTab("attacks"));
$("classFeaturesTab").addEventListener("click", () => setCardTab("class-features"));
$("exhaustionDown").addEventListener("click", () => void adjustExhaustion(-1));
$("exhaustionUp").addEventListener("click", () => void adjustExhaustion(1));
$("quickActionAdd").addEventListener("click", () => {
  const list = $("quickActionEditorList");
  if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTIONS) return;
  const row = buildQuickActionEditorRow();
  list.appendChild(row);
  syncQuickActionAddState();
  row.querySelector("[data-quick-action-field='label']")?.focus();
});
$("attackImportToggle").addEventListener("click", () => setAttackImportOpen($("attackImport").hidden));
$("attackImportCancel").addEventListener("click", () => setAttackImportOpen(false));
$("attackImportApply").addEventListener("click", importAttacks);
$("attackAdd").addEventListener("click", () => {
  const list = $("attackEditorList");
  if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTION_ATTACKS) return;
  const row = buildQuickActionEditorRow(null, { attack: true });
  list.appendChild(row);
  syncQuickActionAddState();
  row.querySelector("[data-quick-action-field='label']")?.focus();
});
$("speciesInput").addEventListener("change", () => {
  buildSpeciesAncestryOptions($("speciesInput").value);
  syncSpeciesSpellAbilityRow();
});
$("classBuildAdd").addEventListener("click", () => {
  const list = $("classBuildEditorList");
  if (list.querySelectorAll("[data-class-build-row='1']").length >= MAX_CHARACTER_CLASSES) {
    return;
  }
  const row = buildClassBuildEditorRow();
  list.appendChild(row);
  syncClassBuildAddState();
  buildClassFeatureEditor();
  row.querySelector("[data-class-build-field='classId']")?.focus();
});
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const operation = sceneLifecycle.capture({ operationId: `initiative-card-save:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || !isGM || !item) return;
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  $("status").textContent = "";
  try {
    const ownerSceneContext = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const savingThrows = Object.fromEntries(SAVE_KEYS.map((key) => [key, $(`save-${key}`).value]));
    const characterBuild = collectCharacterBuildEditor({ validate: true });
    const damageDefenses = collectDamageDefenses();
    // Only profiles that use defenses (or already had the field) store it.
    const defensePatch = hasDamageDefenses(damageDefenses) || Object.hasOwn(profile || {}, DAMAGE_DEFENSES_FIELD)
      ? { [DAMAGE_DEFENSES_FIELD]: damageDefenses } : {};
    const abilityModifiers = sanitizeAbilityModifiers(
      Object.fromEntries(ABILITY_KEYS.map((key) => [key, $(`ability-${key}`).value])),
    );
    // Come le difese: il campo si scrive solo se usato o già presente.
    const abilityPatch = hasAbilityModifiers(abilityModifiers) || Object.hasOwn(profile || {}, ABILITY_MODIFIERS_FIELD)
      ? { [ABILITY_MODIFIERS_FIELD]: abilityModifiers } : {};
    const species = collectSpecies();
    // The option label varies (Marchio, Stirpe, Retaggio...): a message without an article fits every one.
    if (speciesOptionMissing(species)) throw new Error(`Specie: scegli un'opzione in «${getSpecies(species.id).optionLabel}».`);
    const speciesPatch = species || Object.hasOwn(profile || {}, SPECIES_FIELD) ? { [SPECIES_FIELD]: species } : {};
    // Come la specie: il dono si scrive solo se scelto o già presente.
    const gift = collectSupernaturalGift();
    const giftPatch = gift || Object.hasOwn(profile || {}, SUPERNATURAL_GIFT_FIELD) ? { [SUPERNATURAL_GIFT_FIELD]: gift } : {};
    // Come il dono: la caratteristica degli incantesimi di specie si scrive solo se scelta o già presente.
    const spellAbility = speciesHasSpellAbilityChoice(species?.id) ? sanitizeSpeciesSpellAbility($("speciesSpellAbilityInput").value) : null;
    const spellAbilityPatch = spellAbility || Object.hasOwn(profile || {}, SPECIES_SPELL_ABILITY_FIELD)
      ? { [SPECIES_SPELL_ABILITY_FIELD]: spellAbility } : {};
    // Come la specie: il libro si scrive solo se usato o già presente.
    const spellbook = sanitizeSpellbook(draftSpellbook);
    const spellbookPatch = hasSpellbook(spellbook) || Object.hasOwn(profile || {}, SPELLBOOK_FIELD)
      ? { [SPELLBOOK_FIELD]: spellbook } : {};
    // The monster's full stat block, in this browser only (lotto 4b): the card's reference finds it again. Kept before the
    // card is written, so a console already open finds it when the card's change reloads it (fase 4, lotto 5).
    const statblockText = pendingMonsterText;
    pendingMonsterText = null;
    let statblockTextStatus = "";
    if (statblockText) {
      try {
        const kept = await statblockTextLoader().put(statblockText);
        if (!kept.persisted) statblockTextStatus = `Testo dello statblock tenuto solo per questa sessione: ${kept.reason}.`;
      } catch (error) {
        statblockTextStatus = `Testo dello statblock non salvato: ${error?.message || error}.`;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    // Come il libro: il profilo del mostro si scrive solo se importato o già presente.
    const monsterPatch = draftMonsterProfile !== undefined ? { [MONSTER_PROFILE_FIELD]: draftMonsterProfile } : {};
    await saveInitiativeCard(item.id, item.name, {
      armorClass: $("armorClassInput").value,
      passivePerception: $("passivePerceptionInput").value,
      speed: $("speedInput").value,
      exhaustion: $("exhaustionInput").value,
      spellSaveDC: $("spellSaveDCInput").value,
      spellAttackBonus: $("spellAttackBonusInput").value,
      notes: $("notesInput").value,
      quickActions: collectQuickActions(),
      characterBuild,
      enabledClassFeatureIds: collectEnabledClassFeatureIds(characterBuild),
      classFeaturesConfigured: true,
      savingThrows,
      ...defensePatch,
      ...abilityPatch,
      ...speciesPatch,
      ...giftPatch,
      ...spellAbilityPatch,
      ...spellbookPatch,
      ...monsterPatch,
    }, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    // The monster's name for this token (fase 4, lotto 2): before the hit points, so its namesakes are those of the new
    // name, as the shared stat block's.
    const newName = pendingMonsterName;
    pendingMonsterName = "";
    let nameStatus = "";
    if (newName) {
      try {
        await OBR.scene.items.updateItems([item.id], (drafts) => { setTokenDisplayName(drafts[0], newName); });
        nameStatus = `Token rinominato in «${newName}».`;
      } catch (error) {
        nameStatus = `Nome non cambiato: ${error?.message || error}.`;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    // The monster's portrait as this token's image (fase 4, lotto 3): only this token, its footprint on the map kept.
    const portrait = pendingMonsterPortrait;
    pendingMonsterPortrait = null;
    let portraitStatus = "";
    if (portrait) {
      try {
        let changed = false;
        await OBR.scene.items.updateItems([item.id], (drafts) => { changed = setTokenPortrait(drafts[0], portrait); });
        portraitStatus = changed ? "Ritratto del token cambiato." : "Ritratto non cambiato: il token non è un'immagine.";
      } catch (error) {
        portraitStatus = `Ritratto non cambiato: ${error?.message || error}.`;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    // A monster's hit points from its stat block: after the card, as their own command (History, Undo).
    const hitPoints = pendingMonsterHitPoints;
    pendingMonsterHitPoints = null;
    let hitPointsStatus = "";
    if (hitPoints) {
      try {
        const { applyMonsterHitPoints } = await import("./monsterHitPointsImport.js");
        const { plan } = await applyMonsterHitPoints({ sourceId: item.id, ...hitPoints, sceneIdentity: ownerSceneContext.sceneIdentity,
          isCurrent: () => sceneLifecycle.isCurrent(operation) });
        hitPointsStatus = monsterHitPointsSummary(plan, hitPoints.hp);
      } catch (error) {
        hitPointsStatus = `Scheda salvata; PF non impostati: ${error?.message || error}`;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    // The tracker's Leggendario mode (fase 4, lotto 5): written as its menu writes it (D8), merged into each token's
    // metadata, outside the History; a token that already has a boss mode keeps it, spent pips included.
    const legendary = pendingMonsterLegendary;
    pendingMonsterLegendary = null;
    let legendaryStatus = "";
    if (legendary) {
      try {
        const plan = planMonsterLegendary({ items: await OBR.scene.items.getItems(), sourceId: item.id, legendary });
        let written = 0;
        if (plan.targetIds.length) {
          await OBR.scene.items.updateItems(plan.targetIds, (drafts) => {
            for (const draft of drafts) if (setMonsterLegendary(draft, legendary)) written += 1;
          });
        }
        legendaryStatus = monsterLegendarySummary({ written, skipped: plan.skipped });
      } catch (error) {
        legendaryStatus = `Leggendario non attivato: ${error?.message || error}.`;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    [item] = await OBR.scene.items.getItems([item.id]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    profile = getInitiativeCard(item);
    // Tokens with the same name carry the same stat block (fase 4): a monster's card goes to its namesakes, their own
    // state (hit points, conditions, uses) untouched.
    const shareStatus = await shareMonsterStatblock(item, profile, { isCurrent: () => sceneLifecycle.isCurrent(operation),
      sceneIdentity: ownerSceneContext.sceneIdentity });
    if (!sceneLifecycle.isCurrent(operation)) return;
    renderView();
    setEditing(false);
    const savedStatus = [nameStatus, portraitStatus, hitPointsStatus, legendaryStatus, shareStatus, statblockTextStatus].filter(Boolean).join(" ");
    if (savedStatus) $("status").textContent = savedStatus;
  } catch (err) {
    $("status").textContent = err?.message || "Salvataggio non riuscito";
  } finally {
    if (submit) submit.disabled = false;
  }
});

window.addEventListener("pagehide", () => sceneLifecycle.dispose());

import {
  spellPillCounter,
  spellExpiryDescription,
} from "./spellExpiryCore.js";
import { enableInlineNameEditor } from "./initiativeEditors.js";
import { CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS } from "./classFeatureCore.js";
import {
  effectSummaryPartsFor,
  spellEffectPillLabel,
  spellEffectRemovableFromCard,
  spellEffectStandsAlone,
} from "./effectLabelCore.js";
import { buildEffectSummaryContainer } from "./effectSummaryViewCore.js";
import { getSpellSummaryParts } from "./spells-srd.js";
import { spellPillHasActions } from "./spellPillActionsCore.js";
import { COMPACT_CARD_WIDTH } from "./constants.js";
import { cardPlayerAssignmentTitle } from "./playerAssignmentCore.js";
import { HIT_AREA_MIN_SIZE, extendHitArea } from "./hitAreaCore.js";
import { CARD_ICON_BUTTON_SIZE, buildCardIconGlyph, markHiddenTokenPortrait, styleCardIconButton } from "./cardIconButton.js";
import { canOpenInitiativeCardSheet, initiativeCardSheetLabel } from "./initiativeCardSheetAccessCore.js";
import { trackerDeathSaves, VITAL_STATE } from "./trackerVitalStateCore.js";
import { quickHPBarSegments, quickHPStateOf, TEMP_HP_COLOR } from "./quickHpCore.js";

// Lot L4 of the tracker UI study: a creature at 0 HP. KO keeps some colour; a dead one turns grey. The classic card
// and syncTrackerHPNow use the same filters.
export const KNOCKED_OUT_CARD_FILTER = "saturate(.42) brightness(.72)";
export const DEAD_CARD_FILTER = "grayscale(.92) brightness(.6)";

// CAP-TEMP: the colour of the temporary hit points beside the HP (quickHpCore.js), for the cards built from here.
export { TEMP_HP_COLOR };

export { COMPACT_CARD_WIDTH };
export const COMPACT_CARD_HEIGHT = 120;
// Space above every portrait; the boss frame is centred on the portrait, so it is placed with the same value.
const COMPACT_PORTRAIT_MARGIN_TOP = 4;
// The corner badges (initiative, KO, E/EP/L/xN) share one size, and a second badge on the right stacks below the first.
const COMPACT_CORNER_BADGE_SIZE = 24;
const COMPACT_STACKED_BADGE_TOP = 6 + COMPACT_CORNER_BADGE_SIZE + 4;

function compactSpellKey(name) {
  return String(name || "").trim().toLowerCase();
}

function compactConditionName(name) {
  return name;
}

function spellSummaryParts(spell) {
  const spellId = String(spell?.spellId || "").trim();
  // summaryParts are presentation-only, so refresh the static Antilife Shell
  // summary at read time as well as at cast time. This keeps already persisted
  // instances from rendering the retired, verbose set of micropills without
  // mutating their canonical metadata.
  if (spellId === "telekinesis") return getSpellSummaryParts(spellId);
  if (spellId === "antilife-shell") return getSpellSummaryParts(spellId);
  if (spellId === "delayed-blast-fireball") {
    return getSpellSummaryParts(spellId, "", spell?.castContext || {});
  }
  return spell?.summaryParts;
}

function themeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;
}

export function __compactConditionPillLabel(
  instance,
  { formatConditionName = compactConditionName } = {},
) {
  const name = String(instance?.condition || "").trim();
  let label = formatConditionName(name) || name || "Condizione";
  if (name === "Indebolimento") {
    label += ` ${Math.max(1, Math.floor(Number(instance?.level) || 1))}`;
  }
  const expiry = instance?.expiry || {};
  const remaining = Math.max(0, Math.floor(Number(expiry.remaining) || 0));
  const resourceDie = String(instance?.resourceDie || "").trim();
  if (resourceDie) label += ` (${resourceDie})`;
  else if (expiry.mode === "rounds" && remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS) {
    label += ` (${remaining})`;
  } else if (expiry.mode === "turn-start") {
    const visibleRemaining = remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
      ? remaining
      : 0;
    label += ` (I${visibleRemaining > 1 ? `:${visibleRemaining}` : ""})`;
  } else if (expiry.mode === "turn-end") {
    const visibleRemaining = remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS
      ? remaining
      : 0;
    label += ` (F${visibleRemaining > 1 ? `:${visibleRemaining}` : ""})`;
  }
  else if (expiry.mode === "concentration") label += " (C)";
  return label;
}

// Lot L3 of the tracker UI study: the number on a condition's square in the compact row. Rounds left, as the label
// shows them (up to the visible limit), or the level of Indebolimento; 0 for none.
export function compactConditionIconCount(instance) {
  if (String(instance?.condition || "").trim() === "Indebolimento") {
    return Math.max(1, Math.floor(Number(instance?.level) || 1));
  }
  const expiry = instance?.expiry || {};
  const remaining = Math.max(0, Math.floor(Number(expiry.remaining) || 0));
  return expiry.mode === "rounds" && remaining && remaining <= CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS ? remaining : 0;
}

// formatting.conditionEmoji(instance) and formatting.conditionAccent(name) (lot L3, conditions.js): the emoji a condition
// shows alone in the compact row, and the colour of its square.
export function __compactEffectItems(
  conditionInstances,
  spells,
  concentrating,
  formatting = {},
) {
  const formatConditionInstance = typeof formatting.formatConditionInstance === "function"
    ? formatting.formatConditionInstance
    : (instance) => __compactConditionPillLabel(instance, formatting);
  const showEffectSummaryParts = formatting.showEffectSummaryParts !== false;
  const spellKey = typeof formatting.spellKey === "function"
    ? formatting.spellKey
    : compactSpellKey;
  // Buffs and debuffs appear inside their spell's pill; a consumable or a gift (effectId "buff:…")
  // has no spell, so it is a pill of its own, and so is a spell's effect with no pill here.
  const spellInstanceIds = spells.map((spell) => String(spell?.instanceId || "").trim()).filter(Boolean);
  const effects = conditionInstances.filter((instance) =>
    (instance?.effectKind !== "buff" && instance?.effectKind !== "debuff")
    || String(instance?.effectId || "").startsWith("buff:")
    || spellEffectStandsAlone(instance, spellInstanceIds)
  ).map((instance) => {
    const summaryParts = showEffectSummaryParts
      ? effectSummaryPartsFor(instance, { suppressSaveReminderParts: true })
      : [];
    const standaloneKind = instance?.effectKind === "buff" || instance?.effectKind === "debuff"
      ? instance.effectKind
      : "";
    // Lot L3 of the tracker UI study: a condition of the catalog (or Ira, Santuario del Crepuscolo) carries its emoji,
    // drawn alone in the compact row with the number of its rounds (or the level of Indebolimento).
    const icon = !standaloneKind && !spellEffectStandsAlone(instance, spellInstanceIds)
      && typeof formatting.conditionEmoji === "function"
      ? String(formatting.conditionEmoji(instance) || "").trim()
      : "";
    return {
      kind: instance?.type === "class-feature" ? "class-feature" : standaloneKind || "condition",
      instanceId: String(instance?.id || ""),
      ...(icon
        ? {
          icon,
          iconCount: compactConditionIconCount(instance),
          iconColor: typeof formatting.conditionAccent === "function" ? formatting.conditionAccent(instance?.condition) : null,
        }
        : {}),
      ...(standaloneKind && instance.theme && typeof instance.theme === "object" ? { theme: { ...instance.theme } } : {}),
      label: __compactConditionPillLabel(instance, spellEffectStandsAlone(instance, spellInstanceIds)
        ? { ...formatting, formatConditionName: spellEffectPillLabel }
        : formatting),
      title: formatConditionInstance(instance),
      ...(summaryParts.length ? { summaryParts } : {}),
      ...(spellEffectStandsAlone(instance, spellInstanceIds) && !spellEffectRemovableFromCard(instance) ? { fixed: true } : {}),
      ...(instance?.type === "class-feature"
        ? {
          classFeatureInstance: instance,
          theme: instance.theme && typeof instance.theme === "object"
            ? { ...instance.theme }
            : null,
        }
        : {}),
    };
  });
  for (const spell of spells) {
    const counter = spellPillCounter(spell);
    const spellName = String(spell?.name || "Incantesimo");
    const spellInstanceId = String(spell?.instanceId || "").trim();
    const ownSummaryParts = showEffectSummaryParts
      ? effectSummaryPartsFor({ summaryParts: spellSummaryParts(spell) })
      : [];
    const linkedEffectSummaryParts = spellInstanceId
      ? conditionInstances.flatMap((instance) => (
        (instance?.effectKind === "buff" || instance?.effectKind === "debuff")
        && String(instance?.parentEffectId || "").trim() === spellInstanceId
          ? showEffectSummaryParts
            ? effectSummaryPartsFor(instance, { suppressSaveReminderParts: true })
            : []
          : []
      ))
      : [];
    const summaryParts = Array.from(
      new Map([
        ...ownSummaryParts,
        ...linkedEffectSummaryParts,
      ].map((part) => [part.id, part])).values(),
    );
    const linkedEffectDetails = spellInstanceId
      ? Array.from(new Set(
        conditionInstances
          .filter((instance) => (
            (instance?.effectKind === "buff" || instance?.effectKind === "debuff")
            && String(instance?.parentEffectId || "").trim() === spellInstanceId
          ))
          .map((instance) => String(instance?.effectDetail || "").trim())
          .filter(Boolean),
      ))
      : [];
    effects.push({
      kind: "spell",
      key: spellKey(spell?.name),
      ...(spellInstanceId ? { spellInstanceId } : {}),
      // The ⚡ of a spell with active actions (spell-pill-actions.js).
      ...(spellInstanceId && spellPillHasActions(spell)
        ? { actionsSpell: { instanceId: spellInstanceId, spellId: String(spell?.spellId || ""), name: spellName } }
        : {}),
      label: counter ? `${spellName} (${counter})` : spellName,
      title: [
        `${spellName} · ${spellExpiryDescription(spell)}${spell?.conc ? " · concentrazione" : ""}`,
        ...linkedEffectDetails,
      ].join(" · "),
      ...(summaryParts.length ? { summaryParts } : {}),
    });
  }
  if (concentrating && !spells.some((spell) => spell?.conc)) {
    effects.push({
      kind: "concentration",
      label: "Concentrazione",
      title: "Concentrazione attiva",
      ...(formatting.concentrationSpellKey
        ? { referenceEntry: formatting.concentrationSpellKey }
        : {}),
    });
  }
  return effects;
}

function compactDocument(documentRef) {
  if (!documentRef?.createElement) {
    throw new TypeError("Un documento DOM valido è richiesto per renderizzare la card compatta");
  }
  return documentRef;
}

export function compactStatusBadge(
  text,
  title,
  tone = "neutral",
  { documentRef = globalThis.document } = {},
) {
  const badge = compactDocument(documentRef).createElement("span");
  badge.textContent = text;
  badge.title = title;
  const colors = tone === "concentration"
    ? { background: "#2563eb", border: "#93c5fd" }
    : tone === "resistance"
      ? { background: "#1e3a8a", border: "#93c5fd" }
      : tone === "legendary"
        ? { background: "#991b1b", border: "#fca5a5" }
        : { background: "rgba(8,12,21,.92)", border: "rgba(255,255,255,.34)" };
  Object.assign(badge.style, {
    minWidth: "17px",
    height: "17px",
    boxSizing: "border-box",
    padding: "0 4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${colors.border}`,
    borderRadius: "999px",
    background: colors.background,
    color: "#fff",
    fontSize: "var(--obrt-type-micro, 10px)",
    fontWeight: "700",
    lineHeight: "1",
    boxShadow: "0 1px 4px rgba(0,0,0,.55)",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  });
  return badge;
}

// The × that ends an effect, pinned to the pill's right edge, so a long label is cut before it and never hides it. Its
// 24px clickable square reaches past the pill, so the pill clips with a margin instead of at its border (the text still
// ends in "…").
function appendCompactEffectRemoveButton(pill, title, run, documentRef) {
  const terminate = compactDocument(documentRef).createElement("button");
  terminate.type = "button";
  terminate.textContent = "×";
  terminate.dataset.cardSelectionIgnore = "1";
  terminate.title = title;
  terminate.setAttribute("aria-label", terminate.title);
  pill.style.paddingRight = "14px";
  pill.style.overflow = "clip";
  pill.style.overflowClipMargin = "8px";
  Object.assign(terminate.style, {
    position: "absolute",
    right: "2px",
    top: "50%",
    transform: "translateY(-50%)",
    minWidth: "10px",
    width: "10px",
    height: "10px",
    padding: "0",
    border: "0",
    borderRadius: "50%",
    background: "rgba(0,0,0,.22)",
    color: "inherit",
    font: "inherit",
    fontSize: "9px",
    fontWeight: "800",
    lineHeight: "10px",
    cursor: "pointer",
  });
  terminate.addEventListener("mouseenter", () => {
    terminate.style.background = "rgba(220,38,38,.72)";
  });
  terminate.addEventListener("mouseleave", () => {
    terminate.style.background = "rgba(0,0,0,.22)";
  });
  terminate.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (terminate.disabled) return;
    terminate.disabled = true;
    Promise.resolve(run())
      .catch((error) => {
        terminate.disabled = false;
        console.warn("[initiative-card] terminate effect:", error?.message || error);
      });
  });
  extendHitArea(terminate, { documentRef: compactDocument(documentRef) });
  pill.appendChild(terminate);
  return terminate;
}

// Lot U11 (UX-04): what the drawer's × can end besides a class feature. Not on the card's own pill, where a × was
// turned down on 23/10 as too easy to hit by mistake; the drawer is opened on purpose.
function compactEffectRemovable(effect) {
  if (effect?.fixed === true) return false;
  return (effect?.kind === "condition" || effect?.kind === "buff" || effect?.kind === "debuff")
    ? !!effect.instanceId
    : effect?.kind === "spell" && !!(effect.spellInstanceId || effect.key);
}

export function __buildCompactEffectPill(
  effect,
  preview = false,
  {
    documentRef = globalThis.document,
    spellColor = null,
    onTerminateClassFeature = null,
    onSpellActions = null,
    onRemoveEffect = null,
  } = {},
) {
  const pill = compactDocument(documentRef).createElement("span");
  pill.textContent = effect.label;
  pill.title = effect.title || effect.label;
  if (effect.instanceId) pill.dataset.conditionInstanceId = effect.instanceId;
  if (effect.spellInstanceId) pill.dataset.spellInstanceId = effect.spellInstanceId;
  if (effect.kind === "concentration" && effect.referenceEntry) {
    pill.dataset.referenceType = "spells";
    pill.dataset.referenceEntry = effect.referenceEntry;
  }
  const resolvedSpellColor = effect.kind === "spell" && typeof spellColor === "function"
    ? spellColor(effect.key)
    : null;
  const effectTheme = effect.theme && typeof effect.theme === "object"
    ? effect.theme
    : null;
  const background = effectTheme
    ? themeColor(effectTheme.background, "rgba(8,12,21,.94)")
    : effect.kind === "buff"
    ? "#15803d"
    : effect.kind === "debuff"
      ? "#b91c1c"
      : effect.kind === "concentration"
        ? "#2563eb"
        : resolvedSpellColor?.solid || "rgba(8,12,21,.94)";
  const border = effectTheme
    ? themeColor(effectTheme.accent, "rgba(255,255,255,.38)")
    : effect.kind === "buff"
    ? "#86efac"
    : effect.kind === "debuff"
      ? "#fca5a5"
      : effect.kind === "concentration"
        ? "#93c5fd"
        : resolvedSpellColor?.border || "rgba(255,255,255,.38)";
  // A block, not a flex box: text-overflow only works on a block container, and a centred flex item that overflows
  // is cut on both sides. The line height centres the text inside the border.
  Object.assign(pill.style, {
    position: "relative",
    minWidth: "0",
    maxWidth: preview ? "100%" : "196px",
    height: preview ? "14px" : "17px",
    // The card's pill keeps a thin padding: the text used to overflow into a wider one, so names like
    // "Pozione di Eroismo" stay whole now that the overflow is cut with an ellipsis.
    padding: preview ? "0 2px" : "0 5px",
    display: "inline-block",
    verticalAlign: "middle",
    boxSizing: "border-box",
    overflow: "hidden",
    border: `1px solid ${border}`,
    borderRadius: "999px",
    background,
    color: effectTheme
      ? themeColor(effectTheme.text, "#fff")
      : "#fff",
    fontFamily: "var(--obrt-font-ui)",
    fontSize: "8px",
    fontWeight: "600",
    lineHeight: preview ? "12px" : "15px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(0,0,0,.45)",
  });
  if (effect.kind === "spell" && effect.actionsSpell && typeof onSpellActions === "function") {
    const actions = compactDocument(documentRef).createElement("button");
    actions.type = "button";
    actions.textContent = "⚡";
    actions.dataset.cardSelectionIgnore = "1";
    actions.dataset.spellPillActions = "1";
    actions.title = `Azioni di ${effect.actionsSpell.name || effect.label}`;
    actions.setAttribute("aria-label", actions.title);
    // Pinned to the right edge like the × of a class feature, so a long label is cut before it.
    pill.style.paddingRight = "14px";
    pill.style.overflow = "clip";
    pill.style.overflowClipMargin = "8px";
    Object.assign(actions.style, {
      position: "absolute",
      right: "2px",
      top: "50%",
      transform: "translateY(-50%)",
      minWidth: "11px",
      width: "11px",
      height: "11px",
      padding: "0",
      border: "0",
      borderRadius: "50%",
      background: "rgba(0,0,0,.28)",
      color: "inherit",
      font: "inherit",
      fontSize: "7px",
      lineHeight: "11px",
      cursor: "pointer",
    });
    actions.addEventListener("mouseenter", () => {
      actions.style.background = "rgba(37,99,235,.8)";
    });
    actions.addEventListener("mouseleave", () => {
      actions.style.background = "rgba(0,0,0,.28)";
    });
    actions.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSpellActions(effect.actionsSpell, event);
    });
    pill.appendChild(actions);
  }
  if (effect.kind === "class-feature" && effect.classFeatureInstance &&
      typeof onTerminateClassFeature === "function") {
    appendCompactEffectRemoveButton(pill, `Termina ${effect.label}`,
      () => onTerminateClassFeature(effect.classFeatureInstance), documentRef);
  } else if (typeof onRemoveEffect === "function" && compactEffectRemovable(effect)) {
    appendCompactEffectRemoveButton(pill, `${effect.kind === "spell" ? "Termina" : "Rimuovi"} ${effect.label}`,
      () => onRemoveEffect(effect), documentRef);
    // The spell's ⚡ moves left of the ×.
    const actions = Array.from(pill.children || []).find((child) => child.dataset?.spellPillActions === "1");
    if (actions) {
      actions.style.right = "14px";
      pill.style.paddingRight = "26px";
    }
  }
  return buildEffectSummaryContainer(effect, pill, {
    documentRef,
    preview,
  });
}

export function buildCompactCardShell(
  entry,
  {
    active,
    boss,
    virtual,
    faction,
    rgba,
    canSeeHP,
    showHP,
    knockedOut,
    dead = false,
    hasExpandableEffects,
    groupKey,
    selectionItemIds,
    dragAllowed,
    zoomScale,
    documentRef = globalThis.document,
  },
) {
  const card = compactDocument(documentRef).createElement("article");
  card.dataset.itemId = entry.id;
  card.dataset.initiative = String(entry.initiative || 0);
  card.dataset.groupCollapsed = entry.__groupCollapsed ? "1" : "0";
  card.dataset.groupKey = groupKey;
  card.dataset.trackerCard = "1";
  card.dataset.compactCard = "1";
  card.dataset.hpCanSee = canSeeHP ? "1" : "0";
  card.dataset.hpVisible = showHP ? "1" : "0";
  card.__hpMode = entry?.hpDisclosure?.mode || (showHP ? "exact" : "hidden");
  card.dataset.knockedOut = knockedOut ? "1" : "0";
  card.dataset.hasEffectOverflow = hasExpandableEffects ? "1" : "0";
  card.dataset.isEpic = entry.isEpic ? "1" : "0";
  card.__selectionItemIds = selectionItemIds;
  card.setAttribute("draggable", dragAllowed ? "true" : "false");
  card.setAttribute(
    "aria-label",
    `${entry.name || "Creatura"}, iniziativa ${entry.initiative ?? 0}`,
  );
  card.title = virtual
    ? entry.name
    : "Clic: seleziona token. Ctrl/Shift+clic: selezione multipla. Clic destro: azioni";
  Object.assign(card.style, {
    position: "relative",
    flex: `0 0 ${COMPACT_CARD_WIDTH}px`,
    width: `${COMPACT_CARD_WIDTH}px`,
    minWidth: `${COMPACT_CARD_WIDTH}px`,
    height: `${COMPACT_CARD_HEIGHT}px`,
    padding: "3px 5px 2px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    color: "#fff",
    border: `${active ? 2 : 1}px solid ${rgba(faction.border, active ? .98 : .78)}`,
    borderRadius: "11px",
    background: active
      ? `linear-gradient(155deg, ${rgba(faction.base, .86)}, ${rgba(faction.base, .60)} 56%, rgba(24,31,41,.96))`
      : `linear-gradient(155deg, ${rgba(faction.base, .50)}, ${rgba(faction.base, .30)} 54%, rgba(20,27,37,.95))`,
    boxShadow: active
      ? `0 0 0 2px ${rgba(faction.border, .92)}, 0 0 16px 3px ${rgba(faction.border, .48)}, inset 0 1px 0 rgba(255,255,255,.18)`
      : `0 4px 10px rgba(0,0,0,.28), inset 0 0 0 1px ${rgba(faction.border, .12)}`,
    cursor: selectionItemIds.length ? "pointer" : "default",
    filter: dead
      ? DEAD_CARD_FILTER
      : knockedOut ? KNOCKED_OUT_CARD_FILTER : active ? "brightness(1.13)" : "none",
    opacity: dead ? ".8" : knockedOut ? ".84" : "1",
    transform: "translateZ(0)",
    scale: active ? String(zoomScale) : "1",
    transformOrigin: "50% 50%",
    // Lot M1 of the animations study: the active card's growth and glow with the expanded view's timing (380ms, ease).
    transition: "scale var(--obrt-motion-move, 380ms) cubic-bezier(.25,.1,.25,1), filter var(--obrt-motion-fast, 120ms) ease, box-shadow var(--obrt-motion-move, 380ms) cubic-bezier(.25,.1,.25,1), border-color var(--obrt-motion-fast, 120ms) ease",
    zIndex: active ? "5" : boss ? "3" : "1",
  });
  // A collapsed group is a deck (choice B): two edges behind the card, with room kept beside and under it.
  if (entry.__groupCollapsed) {
    card.style.boxShadow = [card.style.boxShadow, groupDeckShadow(faction.border, { rgba, step: 3 })].filter(Boolean).join(", ");
    card.style.marginRight = `${groupDeckRoom(3)}px`;
    card.dataset.groupDeck = "1";
  }
  card.__selectionBaseShadow = card.style.boxShadow;
  return card;
}

export function buildCompactCardIndicators(
  entry,
  {
    active,
    isLair,
    faction,
    rgba,
    documentRef = globalThis.document,
  },
) {
  const document = compactDocument(documentRef);
  const initiativeBadge = document.createElement("span");
  initiativeBadge.textContent = String(entry.initiative ?? 0);
  initiativeBadge.title = "Iniziativa";
  Object.assign(initiativeBadge.style, {
    position: "absolute",
    left: "6px",
    top: "6px",
    minWidth: `${COMPACT_CORNER_BADGE_SIZE}px`,
    height: `${COMPACT_CORNER_BADGE_SIZE}px`,
    padding: "0 4px",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${rgba(faction.border, active ? .98 : .78)}`,
    borderRadius: "999px",
    background: "rgba(7,11,18,.96)",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "700",
    boxShadow: "0 2px 6px rgba(0,0,0,.56)",
    zIndex: "4",
  });

  let statusBadge = null;
  if (entry.__groupCollapsed && entry.__groupCount > 1) {
    statusBadge = compactStatusBadge(
      `x${entry.__groupCount}`,
      "Gruppo collassato",
      "neutral",
      { documentRef },
    );
  } else if (entry.isEpicAction || entry.isEpic || isLair) {
    statusBadge = compactStatusBadge(
      entry.isEpicAction ? "EP" : entry.isEpic ? "E" : "L",
      entry.isEpicAction ? "Azione Epica" : entry.isEpic ? "Boss Epico" : "Azione di Tana",
      entry.isEpicAction || entry.isEpic ? "legendary" : "neutral",
      { documentRef },
    );
  }
  if (statusBadge) {
    Object.assign(statusBadge.style, {
      position: "absolute",
      right: "6px",
      top: "6px",
      height: `${COMPACT_CORNER_BADGE_SIZE}px`,
      minWidth: `${COMPACT_CORNER_BADGE_SIZE}px`,
      zIndex: "5",
    });
  }

  let activeMarker = null;
  if (active) {
    activeMarker = document.createElement("span");
    activeMarker.title = "Turno attivo";
    activeMarker.setAttribute("aria-label", activeMarker.title);
    Object.assign(activeMarker.style, {
      position: "absolute",
      top: "2px",
      left: "50%",
      width: "0",
      height: "0",
      transform: "translateX(-50%)",
      borderLeft: "5px solid transparent",
      borderRight: "5px solid transparent",
      borderTop: `7px solid ${faction.border}`,
      zIndex: "6",
    });
  }

  return {
    initiativeBadge,
    statusBadge,
    activeMarker,
  };
}

// The character sheet in one click, for the same creatures as the classic card's icon (PCs and allies, GM and
// players). It stands under the initiative badge, on its axis: the GM's launchers make a column on the portrait's
// right (trackerQuickActions.js).
export function buildCompactSheetButton(
  entry,
  {
    onOpen,
    documentRef = globalThis.document,
    isGM = false,
  } = {},
) {
  if (typeof onOpen !== "function" || !canOpenInitiativeCardSheet(entry, { isGM })) {
    return null;
  }
  const document = compactDocument(documentRef);
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.compactSheetButton = "1";
  button.title = `Apri ${initiativeCardSheetLabel(entry).toLocaleLowerCase("it")}`;
  button.setAttribute("aria-label", button.title);
  styleCardIconButton(button, "sheet");
  Object.assign(button.style, {
    position: "absolute",
    left: `${6 + (COMPACT_CORNER_BADGE_SIZE - CARD_ICON_BUTTON_SIZE) / 2}px`,
    top: `${COMPACT_STACKED_BADGE_TOP}px`,
    cursor: "pointer",
    zIndex: "4",
  });
  button.appendChild(buildCardIconGlyph("character-sheet.svg", 10, document));
  extendHitArea(button, { documentRef: document });
  // The card is draggable and selects its token on click: the icon keeps both gestures to itself.
  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    onOpen();
  });
  return button;
}

export function buildCompactCardPortrait(
  entry,
  {
    active,
    boss,
    portraitSize,
    faction,
    rgba,
    bossFrameSrc,
    bossFrameScale,
    bossFrameMask,
    isGM = false,
    documentRef = globalThis.document,
  },
) {
  const document = compactDocument(documentRef);
  const portrait = document.createElement("div");
  Object.assign(portrait.style, {
    position: "relative",
    width: `${portraitSize}px`,
    height: `${portraitSize}px`,
    flex: `0 0 ${portraitSize}px`,
    marginTop: `${COMPACT_PORTRAIT_MARGIN_TOP}px`,
    overflow: "hidden",
    border: `2px solid ${faction.border}`,
    borderRadius: "50%",
    boxSizing: "border-box",
    background: `linear-gradient(145deg, ${rgba(faction.base, .42)}, rgba(31,39,51,.94))`,
    boxShadow: active
      ? `0 0 0 1px ${rgba(faction.border, .92)}, 0 0 9px ${rgba(faction.border, .36)}, 0 3px 9px rgba(0,0,0,.38)`
      : "0 3px 9px rgba(0,0,0,.38)",
    zIndex: "2",
  });

  if (entry.portrait) {
    const image = document.createElement("img");
    image.src = entry.portrait;
    image.alt = "";
    Object.assign(image.style, {
      width: "100%",
      height: "100%",
      display: "block",
      objectFit: "cover",
      objectPosition: "50% 50%",
      transform: "scale(1.04)",
    });
    portrait.appendChild(image);
  } else {
    const fallback = document.createElement("div");
    fallback.textContent = String(entry.name || "?").slice(0, 1).toUpperCase();
    Object.assign(fallback.style, {
      width: "100%",
      height: "100%",
      display: "grid",
      placeItems: "center",
      fontSize: "23px",
      fontWeight: "700",
      background: `linear-gradient(145deg, ${rgba(faction.base, .60)}, rgba(8,12,21,.92))`,
    });
    portrait.appendChild(fallback);
  }
  // A token the GM keeps hidden: its portrait dimmed with the eye struck through (GM only, the players never see the card).
  if (isGM && entry.hiddenToken === true) {
    markHiddenTokenPortrait(portrait, portrait.children[portrait.children.length - 1], portraitSize, document);
  }

  let bossFrame = null;
  if (boss) {
    bossFrame = document.createElement("img");
    const bossFrameSize = Math.round(portraitSize * bossFrameScale);
    bossFrame.src = bossFrameSrc;
    bossFrame.alt = "";
    bossFrame.setAttribute("aria-hidden", "true");
    bossFrame.draggable = false;
    Object.assign(bossFrame.style, {
      position: "absolute",
      left: "50%",
      top: `${3 + COMPACT_PORTRAIT_MARGIN_TOP + (portraitSize / 2)}px`,
      width: `${bossFrameSize}px`,
      height: `${bossFrameSize}px`,
      objectFit: "contain",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
      filter: "drop-shadow(0 2px 4px rgba(0,0,0,.72))",
      WebkitMaskImage: bossFrameMask,
      maskImage: bossFrameMask,
      zIndex: "3",
    });
  }

  return { portrait, bossFrame };
}

// The width a compact card gives its name: 92px, less 5px of padding and 1px of border a side.
const COMPACT_NAME_WIDTH = 80;
let compactNameCanvas = null;

// True when the name fits the compact card at its weight (11px, the UI font). Without a canvas (tests) it counts the
// characters, about as many as fit.
function compactNameFits(text, { bold = false } = {}) {
  try {
    compactNameCanvas ??= globalThis.document?.createElement?.("canvas") || null;
    const context = compactNameCanvas?.getContext?.("2d");
    if (context) {
      // The interface's font (--obrt-font-ui, public/ui-typography.css: Figtree since lot L7), as the name is drawn.
      context.font = `${bold ? 700 : 600} 11px "Figtree", "Helvetica Neue", Helvetica, Arial, sans-serif`;
      return context.measureText(String(text)).width <= COMPACT_NAME_WIDTH;
    }
  } catch {}
  return String(text).length <= 13;
}

// Lot L2 of the tracker UI study: a name with an epithet after a comma ("Auril, Vergine del Gelo") that does not fit
// the compact card shows the part before the comma ("Auril"), not "Auril, Vergin…". The whole name stays in the
// card's title and in the classic card. fits(text, { bold }) answers whether a text fits (injected by the tests).
export function compactCardDisplayName(name, { bold = false, fits = compactNameFits } = {}) {
  const full = String(name ?? "");
  const comma = full.indexOf(",");
  if (comma <= 0 || fits(full, { bold })) return full;
  return full.slice(0, comma).trim() || full;
}

// A collapsed group as a deck (18/11, the user's choice B): two cards' edges behind it, offset down and to the right by
// `step` and twice `step`, in the faction's border colour. Drawn as box-shadows, under the card and never over its
// content; the card keeps `step * 2` px of room for them (groupDeckRoom).
export function groupDeckShadow(border, { rgba, step = 4 } = {}) {
  const fill = "rgba(14,19,28,.96)";
  return [
    `${step}px ${step}px 0 -1.5px ${fill}`,
    `${step}px ${step}px 0 0 ${rgba(border, .62)}`,
    `${step * 2}px ${step * 2}px 0 -1.5px ${fill}`,
    `${step * 2}px ${step * 2}px 0 0 ${rgba(border, .38)}`,
  ].join(", ");
}

export function groupDeckRoom(step = 4) {
  return step * 2;
}

export function buildCompactCardName(
  entry,
  {
    active,
    boss = false,
    documentRef = globalThis.document,
  },
) {
  const name = compactDocument(documentRef).createElement("div");
  // A collapsed group says only its name: the deck behind the card and the xN badge tell it is a group (choice B).
  name.textContent = entry.__groupCollapsed
    ? compactCardDisplayName(entry.__groupBase, { bold: !!active })
    : compactCardDisplayName(entry.name, { bold: !!active });
  name.title = entry.__groupCollapsed
    ? `${entry.__groupBase} (x${entry.__groupCount})`
    : entry.name;
  Object.assign(name.style, {
    width: "100%",
    height: "14px",
    // Under a boss the name starts below the frame's ring, which overhangs the portrait.
    marginTop: boss ? "6px" : "1px",
    overflow: "hidden",
    color: active ? "#fff" : "rgba(255,255,255,.90)",
    fontSize: "var(--obrt-type-tracker-name, 11px)",
    fontWeight: active ? "700" : "600",
    lineHeight: "14px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px #000",
  });
  // Online room profile (lot O3): the player who plays it, as a white underline (dotted; solid on the player's own
  // character). Never their Owlbear colour, which can read as a faction.
  if (entry.assignedPlayer && !entry.__groupCollapsed) {
    const mine = entry.assignedPlayer.mine === true;
    name.dataset.cardPlayer = mine ? "mine" : "assigned";
    name.title = `${name.title} · ${cardPlayerAssignmentTitle(entry.assignedPlayer)}`;
    name.style.textDecoration = mine ? "underline solid #fff" : "underline dotted rgba(255,255,255,.75)";
    name.style.textDecorationThickness = mine ? "2px" : "1px";
    name.style.textUnderlineOffset = "2px";
  }
  return name;
}

// A virtual turn (a boss's epic action, the lair) has no HP and no effects of its own: a label says what the turn is,
// so the card does not look half empty. Null for every other card.
export function buildCompactVirtualTurnLabel(
  entry,
  {
    isLair = false,
    faction,
    rgba,
    documentRef = globalThis.document,
  },
) {
  if (!entry?.isEpicAction && !isLair) return null;
  const label = compactDocument(documentRef).createElement("div");
  label.dataset.cardVirtualTurnLabel = "1";
  label.textContent = entry.isEpicAction ? "Azione Epica" : "Azione di Tana";
  Object.assign(label.style, {
    maxWidth: "100%",
    marginTop: "4px",
    // 6px a side: with 8px "Azione Epica" missed its last letters by less than a pixel (lot L2).
    padding: "2px 6px",
    boxSizing: "border-box",
    overflow: "hidden",
    border: `1px dashed ${rgba(faction.border, .7)}`,
    borderRadius: "999px",
    background: rgba(faction.base, .18),
    color: "rgba(255,255,255,.86)",
    fontSize: "var(--obrt-type-tracker-meta, 10px)",
    fontWeight: "600",
    lineHeight: "12px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  return label;
}

// CAP-TEMP: the temporary hit points inside an HP bar, right after the HP's fill, as a reserve on top of them
// (quickHPBarSegments): a light cyan part, created when there are some and removed when none. track: the bar that holds
// the fill; segments: { hpRatio, tempRatio }.
export function writeHPBarTempSegment(track, segments = {}, { documentRef = globalThis.document } = {}) {
  if (!track) return null;
  let part = Array.from(track.children || []).find((child) => child?.dataset?.hpTempFill === "1") || null;
  const ratio = Math.max(0, Math.min(1, Number(segments.tempRatio) || 0));
  if (!ratio) {
    part?.remove?.();
    return null;
  }
  if (!part) {
    part = compactDocument(documentRef).createElement("div");
    part.dataset.hpTempFill = "1";
    Object.assign(part.style, { position: "absolute", top: "0", bottom: "0", background: TEMP_HP_COLOR, pointerEvents: "none" });
    track.appendChild(part);
  }
  if (!track.style.position) track.style.position = "relative";
  part.style.left = `${Math.max(0, Math.min(1, Number(segments.hpRatio) || 0)) * 100}%`;
  part.style.width = `${ratio * 100}%`;
  return part;
}

// "HP 78 / 100" with the current value standing out and the label and the maximum quieter. The card and the live HP
// sync (syncTrackerHPNow) both write it here, so an HP change keeps the same look. It never throws: if the parts
// cannot be built, the plain text is written instead, and the caller goes on to update the bar. The temporary hit
// points follow as "+N" in blue (CAP-TEMP).
export function writeCompactHPText(
  hpText,
  hp,
  hpMax,
  { documentRef = globalThis.document, tempHp = 0 } = {},
) {
  const state = quickHPStateOf({ hp: Math.round(Number(hp) || 0), hpMax: Math.round(Number(hpMax) || 0), tempHp });
  const current = String(state.hp);
  const maximum = String(Math.round(Number(hpMax) || 0));
  const temporary = state.tempHp > 0 ? ` +${state.tempHp}` : "";
  if (hpText?.dataset) hpText.dataset.tempHp = String(state.tempHp);
  try {
    const document = compactDocument(documentRef);
    const part = (text, style) => {
      const span = document.createElement("span");
      span.textContent = text;
      Object.assign(span.style, style);
      return span;
    };
    // One look for the whole text (white, the container's weight): no part stands out from the others.
    hpText.replaceChildren(
      part("PF ", {}),
      part(current, {}),
      part(` / ${maximum}`, {}),
      ...(temporary ? [part(temporary, { color: TEMP_HP_COLOR })] : []),
    );
  } catch {
    hpText.textContent = `PF ${current} / ${maximum}${temporary}`;
  }
}

// The same text as writeCompactHPText, as HTML: the inline HP editor writes its result with innerHTML (formatHP).
export function compactHPTextHTML(hp, hpMax, tempHp = 0) {
  const state = quickHPStateOf({ hp: Math.round(Number(hp) || 0), hpMax: Math.round(Number(hpMax) || 0), tempHp });
  const maximum = Math.round(Number(hpMax) || 0);
  const temporary = state.tempHp > 0 ? `<span style="color:${TEMP_HP_COLOR}"> +${state.tempHp}</span>` : "";
  return `<span>PF </span><span>${state.hp}</span><span> / ${maximum}</span>${temporary}`;
}

// GM: a click on the HP text opens the classic card's inline editor (bindHPEditorForEntry), with the same save path.
// Tagged like the classic HP pill, so the editor's hand-off and Tab to the next card find it.
export function markCompactHPTextEditable(hpText, entryId) {
  if (!hpText?.dataset || !entryId) return hpText;
  hpText.dataset.badge = "hp";
  hpText.dataset.itemId = String(entryId);
  hpText.title = "Clic: modifica i PF (-7 danno, +5 cura, oppure il nuovo valore)";
  Object.assign(hpText.style, {
    position: "relative",
    cursor: "text",
    pointerEvents: "auto",
  });
  return hpText;
}

// GM: the initiative badge opens the classic card's inline editor (bindInitiativeEditorForEntry), with the same save
// path. Tagged like the classic badge, so "Compila iniziativa" finds it, marks the pending ones and moves from one to
// the next; the resting border and shadow are what the fill mode puts back.
export function markCompactInitiativeBadgeEditable(badge, entry) {
  if (!badge?.dataset || !entry?.id) return badge;
  badge.dataset.badge = "init";
  badge.dataset.itemId = String(entry.id);
  badge.dataset.initTouched = entry.initTouched === true ? "1" : "0";
  badge.title = entry.__groupCollapsed
    ? "Clic: modifica l'iniziativa del gruppo"
    : "Clic: modifica l'iniziativa";
  badge.style.cursor = "text";
  badge.__initNormalBorder = badge.style.border;
  badge.__initNormalShadow = badge.style.boxShadow;
  return badge;
}

// Drawers on a compact card's right (effects, companions): placed past the card's edge, with the card's right margin
// grown by as much, so the strip makes room and the bar never grows downwards. Docks stand in the order they are
// added; only the last one may change width afterwards (resize), since the ones before it do not move.
const COMPACT_SIDE_DOCK_GAP = 3;
export function appendCompactSideDock(card, element, width) {
  const start = (Number(card.__compactSideDockWidth) || 0) + COMPACT_SIDE_DOCK_GAP;
  Object.assign(element.style, {
    position: "absolute",
    top: "0",
    bottom: "0",
    left: `calc(100% + ${start}px)`,
    boxSizing: "border-box",
  });
  card.style.overflow = "visible";
  card.appendChild(element);
  const resize = (nextWidth) => {
    const dockWidth = Math.max(0, Math.round(Number(nextWidth) || 0));
    element.style.width = `${dockWidth}px`;
    card.__compactSideDockWidth = start + dockWidth;
    card.style.marginRight = `${card.__compactSideDockWidth}px`;
  };
  resize(width);
  return { element, resize };
}

// The effects past the first, in a drawer on the card's right (opened from the card's pill or "+N") instead of a list
// under the bar: the same pills as on the card (14px, 8px text, the card's width), with their detail lines, in columns
// as tall as the card. It has no close button of its own, which would take the pills' room: the card's pill closes it
// as it opened it.
const EFFECTS_DRAWER_COLUMN_WIDTH = 80;
const EFFECTS_DRAWER_INNER_HEIGHT = 106;
const EFFECTS_DRAWER_PADDING = 5;
const EFFECTS_DRAWER_GAP = 4;
const EFFECTS_DRAWER_PILL_HEIGHT = 14;
const EFFECTS_DRAWER_DETAIL_HEIGHT = 16;

function compactEffectsDrawerItemHeight(effect) {
  const details = Array.isArray(effect?.summaryParts) ? effect.summaryParts.length : 0;
  return EFFECTS_DRAWER_PILL_HEIGHT + details * EFFECTS_DRAWER_DETAIL_HEIGHT;
}

// Effects grouped in columns, top to bottom, each column as tall as the card allows (a taller effect gets its own).
export function compactEffectsDrawerColumns(effects = []) {
  const columns = [];
  let column = null;
  let used = 0;
  for (const effect of (Array.isArray(effects) ? effects : []).filter(Boolean)) {
    const height = compactEffectsDrawerItemHeight(effect);
    if (!column || used + 2 + height > EFFECTS_DRAWER_INNER_HEIGHT) {
      column = [];
      columns.push(column);
      used = height;
    } else {
      used += 2 + height;
    }
    column.push(effect);
  }
  return columns;
}

export function compactEffectsDrawerWidth(columnCount) {
  const columns = Math.max(1, Math.floor(Number(columnCount) || 0));
  return EFFECTS_DRAWER_PADDING * 2
    + columns * EFFECTS_DRAWER_COLUMN_WIDTH + (columns - 1) * EFFECTS_DRAWER_GAP;
}

export function appendCompactEffectsDrawer(
  card,
  effects = [],
  {
    spellColor = null,
    onTerminateClassFeature = null,
    onSpellActions = null,
    onRemoveEffect = null,
    documentRef = globalThis.document,
  } = {},
) {
  const columns = compactEffectsDrawerColumns(effects);
  if (!card || !columns.length) return null;
  const document = compactDocument(documentRef);
  const drawer = document.createElement("div");
  drawer.dataset.compactEffectsDrawer = "1";
  drawer.dataset.cardSelectionIgnore = "1";
  drawer.title = "Altri effetti: clicca di nuovo la pillola della card per chiudere";
  Object.assign(drawer.style, {
    display: "flex",
    alignItems: "stretch",
    gap: `${EFFECTS_DRAWER_GAP}px`,
    padding: `${EFFECTS_DRAWER_PADDING}px`,
    border: "1px solid rgba(148,163,184,.42)",
    borderRadius: "10px",
    background: "rgba(13,18,27,.9)",
    boxShadow: "0 4px 10px rgba(0,0,0,.28)",
    zIndex: "6",
    pointerEvents: "auto",
  });
  // Clicks in the drawer stay there: on the card they would select the token.
  drawer.addEventListener("click", (event) => event.stopPropagation());
  drawer.addEventListener("pointerdown", (event) => event.stopPropagation());

  for (const columnEffects of columns) {
    const column = document.createElement("div");
    Object.assign(column.style, {
      flex: `0 0 ${EFFECTS_DRAWER_COLUMN_WIDTH}px`,
      width: `${EFFECTS_DRAWER_COLUMN_WIDTH}px`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: "2px",
      minWidth: "0",
    });
    for (const effect of columnEffects) {
      // The card's pill (preview): same height, text and width as the one on the card.
      const pill = __buildCompactEffectPill(effect, true,
        { documentRef, spellColor, onTerminateClassFeature, onSpellActions, onRemoveEffect });
      Object.assign(pill.style, { display: "block", width: "100%" });
      // __buildCompactEffectPill already holds the effect's details: wrapping it again showed them twice.
      column.appendChild(pill);
    }
    drawer.appendChild(column);
  }
  appendCompactSideDock(card, drawer, compactEffectsDrawerWidth(columns.length));
  return drawer;
}

// The KO badge sits on the portrait, across its lower part: the top-right corner is left to the GM's launchers
// (trackerQuickActions.js). Shared with syncTrackerHPNow, which adds the badge when HP drop to 0 between renders.
const COMPACT_KO_BADGE_HEIGHT = 18;
export function compactKnockedOutBadgeStyle(portraitSize = 49) {
  const size = Number(portraitSize) || 49;
  return {
    position: "absolute",
    left: "50%",
    right: "auto",
    top: `${3 + COMPACT_PORTRAIT_MARGIN_TOP + size - COMPACT_KO_BADGE_HEIGHT - 3}px`,
    transform: "translateX(-50%)",
    height: `${COMPACT_KO_BADGE_HEIGHT}px`,
    minWidth: "26px",
    zIndex: "6",
  };
}

// Lot L4 of the tracker UI study: the badge of a creature at 0 HP, on the compact and the classic card and from
// syncTrackerHPNow. "down": KO; "dead": the skull of boss.svg (the Boss console's icon), titled "Morto".
export function buildVitalStateBadge(kind, { title = "Fuori combattimento", documentRef = globalThis.document } = {}) {
  const dead = kind === VITAL_STATE.DEAD;
  const badge = compactStatusBadge(dead ? "" : "KO", dead ? "Morto" : title, "neutral", { documentRef });
  badge.dataset.cardKoBadge = "1";
  badge.dataset.vitalState = dead ? VITAL_STATE.DEAD : VITAL_STATE.DOWN;
  if (dead) {
    badge.setAttribute("aria-label", "Morto");
    const icon = compactDocument(documentRef).createElement("span");
    icon.setAttribute("aria-hidden", "true");
    const mask = `url("${import.meta.env?.BASE_URL || "/"}boss.svg") center / contain no-repeat`;
    Object.assign(icon.style, {
      display: "block",
      width: "12px",
      height: "12px",
      backgroundColor: "#e5e7eb",
      mask,
      WebkitMask: mask,
      // The skull is drawn left of the file's centre, as in the Boss console's circle (trackerQuickActions.js).
      transform: "translateX(0.6px)",
    });
    badge.appendChild(icon);
  }
  return badge;
}

// Lot L4: a PC's death saves where its empty HP bar was, three successes and three failures, as BG3 shows them on the
// portrait. tally: { successes, failures }, 0 to 3 each (trackerDeathSaves). size: the side of a mark.
export function buildDeathSavePips(tally, { size = 7, documentRef = globalThis.document } = {}) {
  if (!tally) return null;
  const document = compactDocument(documentRef);
  const successes = Math.max(0, Math.min(3, Math.floor(Number(tally.successes) || 0)));
  const failures = Math.max(0, Math.min(3, Math.floor(Number(tally.failures) || 0)));
  const row = document.createElement("div");
  row.dataset.deathSaves = "1";
  row.title = `Tiri contro la morte: ${successes} ${successes === 1 ? "successo" : "successi"}, `
    + `${failures} ${failures === 1 ? "fallimento" : "fallimenti"}`;
  row.setAttribute("aria-label", row.title);
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    height: `${size + 2}px`,
    pointerEvents: "auto",
  });
  const mark = (filled, color) => {
    const pip = document.createElement("span");
    Object.assign(pip.style, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      boxSizing: "border-box",
      border: `1px solid ${color}`,
      background: filled ? color : "rgba(0,0,0,.55)",
      flex: "0 0 auto",
    });
    return pip;
  };
  for (let index = 0; index < 3; index += 1) row.appendChild(mark(index < successes, "#22c55e"));
  const divider = document.createElement("span");
  Object.assign(divider.style, { width: "1px", height: `${size + 2}px`, margin: "0 2px", background: "rgba(255,255,255,.28)" });
  row.appendChild(divider);
  for (let index = 0; index < 3; index += 1) row.appendChild(mark(index < failures, "#ef4444"));
  return row;
}

// Lot L4: concentration always in view on the compact card, a C where the KO would sit, even with its spell in the
// effects drawer. A creature at 0 HP shows its KO there instead.
export function buildCompactConcentrationBadge(portraitSize = 49, { title = "Concentrazione", documentRef = globalThis.document } = {}) {
  const badge = compactStatusBadge("C", title, "concentration", { documentRef });
  badge.dataset.cardConcentrationBadge = "1";
  Object.assign(badge.style, {
    ...compactKnockedOutBadgeStyle(portraitSize),
    minWidth: `${COMPACT_KO_BADGE_HEIGHT}px`,
    width: `${COMPACT_KO_BADGE_HEIGHT}px`,
    padding: "0",
    borderRadius: "50%",
    pointerEvents: "none",
  });
  return badge;
}

export function buildCompactCardHP(
  entry,
  {
    showHP,
    safeHP,
    hpMax,
    hpPercent,
    knockedOut,
    dead = false,
    hpColorByPct,
    portraitSize = 49,
    documentRef = globalThis.document,
  },
) {
  const document = compactDocument(documentRef);
  const hpText = document.createElement("div");
  hpText.dataset.cardHpText = "1";
  const disclosure = entry?.hpDisclosure;
  const hpMode = disclosure?.mode || "exact";
  const statusLabels = {
    // The compact card's 80px hold "A terra", not "Fuori combattimento" (lot L2); the classic card keeps the long form.
    down: "A terra",
    critical: "Critico",
    bloodied: "Ferito",
    hurt: "Provato",
    healthy: "In salute",
  };
  if (showHP && hpMode === "exact") {
    writeCompactHPText(hpText, safeHP, hpMax, { documentRef, tempHp: entry?.__groupCollapsed ? 0 : entry?.tempHp });
  } else {
    hpText.textContent = !showHP || hpMode === "bar"
      ? ""
      : statusLabels[disclosure?.status] || "Stato sconosciuto";
  }
  Object.assign(hpText.style, {
    display: showHP && hpMode !== "bar" ? "block" : "none",
    width: "100%",
    height: "11px",
    overflow: "hidden",
    // White at one weight; a knocked-out creature's text stays dimmed, like the rest of its card.
    color: knockedOut ? "rgba(255,255,255,.58)" : "#fff",
    fontSize: "var(--obrt-type-tracker-meta, 10px)",
    fontWeight: "600",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "11px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const hpTrack = document.createElement("div");
  Object.assign(hpTrack.style, {
    display: showHP ? "block" : "none",
    width: "calc(100% - 8px)",
    height: "5px",
    marginTop: "1px",
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,.76)",
    borderRadius: "999px",
    background: "rgba(0,0,0,.64)",
    boxSizing: "border-box",
  });
  const hpFill = document.createElement("div");
  hpFill.dataset.hpFill = "1";
  hpFill.dataset.itemId = entry.id;
  // CAP-TEMP: the temporary hit points after the HP, on their total (only with the exact HP).
  const bar = showHP && hpMode === "exact" && !entry?.__groupCollapsed
    ? quickHPBarSegments({ hp: safeHP, hpMax, tempHp: entry?.tempHp })
    : { hpRatio: hpPercent, tempRatio: 0 };
  Object.assign(hpFill.style, {
    width: showHP ? `${bar.hpRatio * 100}%` : "0%",
    height: "100%",
    background: knockedOut ? "#475569" : hpColorByPct(hpPercent),
  });
  hpTrack.appendChild(hpFill);
  if (showHP) writeHPBarTempSegment(hpTrack, bar, { documentRef });

  let knockedOutBadge = null;
  if (knockedOut) {
    const knockedOutTitle = hpMode === "exact"
      ? `Fuori combattimento: 0 / ${hpMax}`
      : "Fuori combattimento";
    // Lot L4: KO, or the skull of a dead creature.
    knockedOutBadge = buildVitalStateBadge(dead ? VITAL_STATE.DEAD : VITAL_STATE.DOWN, { title: knockedOutTitle, documentRef });
    Object.assign(knockedOutBadge.style, compactKnockedOutBadgeStyle(portraitSize));
  }

  return {
    hpText,
    hpTrack,
    hpFill,
    knockedOutBadge,
  };
}

// hiddenCount: the effects "+N" stands for, every one but the label's. Without a label (previewPill null, lot L2) it
// counts them all and stays in view when the drawer is open, as "−": it is then the only way to close it.
// iconStrip (lot L3): the row of conditions, which opens the drawer too; with it, "+N" may be missing (every effect in
// view) and hides while the drawer is open, as with the label.
export function syncCompactEffectsToggleState({
  previewPill,
  moreEffectsButton,
  iconStrip = null,
  effectsCount,
  opened,
  hiddenCount = effectsCount - 1,
}) {
  const expanded = opened ? "true" : "false";
  const otherToggle = previewPill || iconStrip;
  const label = previewPill && !iconStrip
    ? (opened ? "Nascondi gli altri effetti" : `Mostra altri ${hiddenCount} effetti`)
    : iconStrip
      ? (opened ? "Nascondi gli effetti" : "Mostra gli effetti")
      : (opened ? "Nascondi gli effetti" : `Mostra ${hiddenCount === 1 ? "1 effetto" : `${hiddenCount} effetti`}`);

  if (moreEffectsButton) {
    moreEffectsButton.textContent = otherToggle || !opened ? `+${hiddenCount}` : "−";
    // Writing the text drops the children: the clickable square goes back in.
    if (moreEffectsButton.__hitArea) moreEffectsButton.appendChild(moreEffectsButton.__hitArea);
    moreEffectsButton.style.display = opened && otherToggle ? "none" : "inline-flex";
    moreEffectsButton.setAttribute("aria-expanded", expanded);
    moreEffectsButton.setAttribute("aria-label", label);
    moreEffectsButton.title = label;
  }
  for (const toggle of [previewPill, iconStrip]) {
    if (!toggle) continue;
    toggle.setAttribute("aria-expanded", expanded);
    toggle.setAttribute("aria-label", label);
  }
}

export function bindCompactEffectsToggle({
  previewPill,
  moreEffectsButton,
  iconStrip = null,
  effectsCount,
  hiddenCount = effectsCount - 1,
  requestToggle,
}) {
  const handleToggle = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const opened = await requestToggle();
    syncCompactEffectsToggleState({
      previewPill,
      moreEffectsButton,
      iconStrip,
      effectsCount,
      opened,
      hiddenCount,
    });
  };

  if (moreEffectsButton) {
    moreEffectsButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    moreEffectsButton.addEventListener("click", handleToggle);
  }
  for (const toggle of [previewPill, iconStrip]) {
    if (!toggle) continue;
    toggle.addEventListener("pointerdown", (event) => event.stopPropagation());
    toggle.addEventListener("click", handleToggle);
    toggle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      void handleToggle(event);
    });
  }

  return handleToggle;
}

export function enableCompactCardRename({
  card,
  name,
  getOriginalName,
  borderColor,
  dragAllowed,
  saveName,
  onError = () => {},
  documentRef = globalThis.document,
}) {
  const document = compactDocument(documentRef);
  name.title = "Doppio clic per rinominare il token";
  name.style.cursor = "text";
  enableInlineNameEditor({
    card,
    trigger: name,
    getOriginalName,
    dragAllowed,
    buildInput: (originalName) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = originalName;
      input.maxLength = 120;
      input.autocomplete = "off";
      input.spellcheck = false;
      Object.assign(input.style, {
        width: "100%",
        height: "20px",
        marginTop: "0",
        padding: "1px 4px",
        border: `1px solid ${borderColor}`,
        borderRadius: "5px",
        background: "rgba(5,9,15,.97)",
        color: "#fff",
        fontSize: "var(--obrt-type-tracker-name, 11px)",
        fontWeight: "700",
        textAlign: "center",
        outline: "none",
      });
      return input;
    },
    saveName,
    restoreName: (displayedName) => {
      name.textContent = compactCardDisplayName(displayedName);
      name.title = displayedName;
    },
    onError,
    stopInputDblclick: true,
  });
}

export function buildCompactLegendaryResourcePips(
  resource,
  {
    label,
    buildPips,
  },
) {
  if (!resource || Number(resource.max) <= 0) return null;
  const max = Number(resource.max) || 0;
  const current = Math.max(0, Math.min(
    max,
    Number(resource.current) || 0,
  ));
  const pips = buildPips();
  pips.style.gap = "1px";
  pips.style.flex = "0 0 auto";
  pips.setAttribute("role", "group");
  pips.setAttribute("aria-label", `${label}: ${current}/${max}`);
  pips.title = `${label}: ${current}/${max}`;
  return pips;
}

// The status row of a compact card is 80px wide (92px, less padding and border). Lot L2 of the tracker UI study: the
// legendary pips share it with the first effect's label (7px diamonds and, for the resistances, 8px shields, 1px apart,
// 2px between the row's parts). Below COMPACT_PREVIEW_PILL_MIN_WIDTH the label would show two letters ("Sc…"): it is
// then not drawn, and "+N" counts every effect. pipSize: the diamonds' side (LEG_PIPS_CFG.size in initiativeList.js);
// the shields are one pixel larger (initiativeCardBossClassic.js).
const COMPACT_STATUS_ROW_WIDTH = 80;
export const COMPACT_PREVIEW_PILL_MIN_WIDTH = 34;

// The status row's room left by the legendary pips, in px.
function compactStatusRoom({ legendaryMax = 0, resistanceMax = 0, pipSize = 7 } = {}) {
  const group = (count, size) => {
    const pips = Math.max(0, Math.floor(Number(count) || 0));
    return pips ? pips * size + (pips - 1) + 2 : 0;
  };
  const size = Math.max(0, Number(pipSize) || 0);
  return COMPACT_STATUS_ROW_WIDTH - group(legendaryMax, size) - group(resistanceMax, size + 1);
}

export function compactPreviewPillFits({ legendaryMax = 0, resistanceMax = 0, pipSize = 7 } = {}) {
  return compactStatusRoom({ legendaryMax, resistanceMax, pipSize }) >= COMPACT_PREVIEW_PILL_MIN_WIDTH;
}

// Lot L3 of the tracker UI study: the status row of a compact card. The effects with an emoji of their own (the
// conditions, Ira…) come first, as 16px squares 2px apart, as many as fit; in the room left, the first effect without
// one as a label, if it keeps four letters; "+N" counts the rest, and the drawer lists every effect with its name. With
// no condition the row is the one of lot L2: the first effect as a label (none when the legendary pips leave it two
// letters), the rest in the drawer. Returns { icons, preview, hiddenCount, drawer }.
const COMPACT_ICON_CHIP_SIZE = 16;
const COMPACT_ICON_CHIP_GAP = 2;

export function compactStatusLayout(effects, { legendaryMax = 0, resistanceMax = 0, pipSize = 7 } = {}) {
  const list = Array.isArray(effects) ? effects.filter(Boolean) : [];
  const room = compactStatusRoom({ legendaryMax, resistanceMax, pipSize });
  const iconEffects = list.filter((effect) => effect.icon);
  if (!iconEffects.length) {
    const preview = list.length && room >= COMPACT_PREVIEW_PILL_MIN_WIDTH ? list[0] : null;
    return { icons: [], preview, hiddenCount: list.length - (preview ? 1 : 0), drawer: list.slice(preview ? 1 : 0) };
  }
  const step = COMPACT_ICON_CHIP_SIZE + COMPACT_ICON_CHIP_GAP;
  const icons = iconEffects.slice(0, Math.max(1, Math.floor((room + COMPACT_ICON_CHIP_GAP) / step)));
  const plain = list.filter((effect) => !effect.icon);
  const left = room - icons.length * step;
  const preview = plain.length && left >= COMPACT_PREVIEW_PILL_MIN_WIDTH ? plain[0] : null;
  return { icons, preview, hiddenCount: list.length - icons.length - (preview ? 1 : 0), drawer: list };
}

// Lot L3: a condition of the compact row, its emoji in a square of its colour (iconColor, the border of its pill), with
// its rounds or level in a small white disc. Its name is in the title and in the drawer.
export function buildCompactConditionIconChip(effect, { documentRef = globalThis.document } = {}) {
  const document = compactDocument(documentRef);
  const chip = document.createElement("span");
  chip.dataset.compactConditionIcon = "1";
  if (effect.instanceId) chip.dataset.conditionInstanceId = effect.instanceId;
  chip.title = effect.title || effect.label;
  const color = /^#[0-9a-f]{6}$/iu.test(String(effect.iconColor || "")) ? effect.iconColor : "#e5e7eb";
  Object.assign(chip.style, {
    position: "relative",
    width: `${COMPACT_ICON_CHIP_SIZE}px`,
    height: `${COMPACT_ICON_CHIP_SIZE}px`,
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    border: `1px solid ${color}`,
    borderRadius: "5px",
    background: "rgba(7,11,18,.92)",
    boxShadow: "0 1px 4px rgba(0,0,0,.45)",
  });
  const emoji = document.createElement("span");
  emoji.dataset.compactConditionEmoji = "1";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = effect.icon;
  Object.assign(emoji.style, {
    fontSize: "10px",
    lineHeight: "1",
    pointerEvents: "none",
  });
  chip.appendChild(emoji);
  const count = Math.max(0, Math.floor(Number(effect.iconCount) || 0));
  if (count) {
    const badge = document.createElement("span");
    badge.dataset.compactConditionIconCount = "1";
    badge.textContent = String(count);
    Object.assign(badge.style, {
      position: "absolute",
      right: "-4px",
      bottom: "-4px",
      minWidth: "10px",
      height: "10px",
      padding: "0 2px",
      boxSizing: "border-box",
      borderRadius: "5px",
      background: "#f8fafc",
      color: "#0b1220",
      fontFamily: "var(--obrt-font-ui)",
      fontSize: "8px",
      fontWeight: "800",
      lineHeight: "10px",
      textAlign: "center",
      pointerEvents: "none",
    });
    chip.appendChild(badge);
  }
  return chip;
}

export function buildCompactCardStatus(
  compactEffects,
  {
    // compactStatusLayout's answer. With conditions the row is drawn from it (buildCompactIconStatusRow, lot L3);
    // without, its label decides showPreview (lot L2).
    layout = null,
    showPreview = layout && !layout.icons?.length ? !!layout.preview || !compactEffects.length : true,
    hasExpandableEffects = compactEffects.length > (showPreview ? 1 : 0),
    effectsPopoverOpen = false,
    spellColor = null,
    onTerminateClassFeature = null,
    onSpellActions = null,
    documentRef = globalThis.document,
  } = {},
) {
  const document = compactDocument(documentRef);
  const status = document.createElement("div");
  // La card mostra sempre e soltanto la pill canonica. I summaryParts restano
  // disponibili per il popover dettagliato, ma non devono entrare nella
  // preview: altrimenti il wrapper 100% della summary allarga la pill oltre
  // lo spazio della card.
  const firstEffect = compactEffects[0] || null;
  const previewEffect = firstEffect && Array.isArray(firstEffect.summaryParts)
    ? { ...firstEffect, summaryParts: [] }
    : firstEffect;
  status.dataset.cardSelectionIgnore = "1";
  Object.assign(status.style, {
    width: "100%",
    minHeight: "14px",
    height: "14px",
    flex: "0 0 14px",
    marginTop: "0",
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "2px",
    overflow: "visible",
    border: "0",
    background: "transparent",
    fontFamily: "inherit",
  });
  if (layout?.icons?.length) {
    return buildCompactIconStatusRow(status, compactEffects, layout, {
      hasExpandableEffects,
      effectsPopoverOpen,
      spellColor,
      onTerminateClassFeature,
      onSpellActions,
      document,
    });
  }
  let previewPill = null;
  let effectSlot = null;
  if (compactEffects.length) {
    effectSlot = document.createElement("div");
    Object.assign(effectSlot.style, {
      position: "relative",
      minWidth: "0",
      // Without the label (lot L2) the slot holds only "+N", at its own width.
      flex: showPreview ? "1 1 auto" : "0 0 auto",
      height: "14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    });
    status.appendChild(effectSlot);
  }
  if (compactEffects.length && showPreview) {
    previewPill = __buildCompactEffectPill(previewEffect, true, {
      spellColor,
      onTerminateClassFeature,
      onSpellActions,
      documentRef,
    });
    previewPill.style.flex = "1 1 100%";
    if (hasExpandableEffects) {
      previewPill.setAttribute("role", "button");
      previewPill.setAttribute("tabindex", "0");
      previewPill.style.cursor = "pointer";
      // The pill is 14px tall: a 24px band behind it, as wide as the slot, takes the clicks just above and below it
      // and passes them to the pill. It comes first, so the pill and the "+N" button stay on top of it.
      const pillHitArea = document.createElement("span");
      pillHitArea.dataset.hitArea = "1";
      pillHitArea.setAttribute("aria-hidden", "true");
      Object.assign(pillHitArea.style, {
        position: "absolute",
        left: "0",
        right: "0",
        top: "50%",
        height: `${HIT_AREA_MIN_SIZE}px`,
        transform: "translateY(-50%)",
        cursor: "pointer",
      });
      pillHitArea.addEventListener("pointerdown", (event) => event.stopPropagation());
      pillHitArea.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        previewPill.click();
      });
      effectSlot.appendChild(pillHitArea);
    }
    effectSlot.appendChild(previewPill);
  }

  let moreEffectsButton = null;
  if (hasExpandableEffects) {
    moreEffectsButton = createCompactMoreEffectsButton(document);
    // Without the label (lot L2) "+N" takes its place in the row instead of hanging below it.
    if (!previewPill) {
      Object.assign(moreEffectsButton.style, { position: "relative", top: "auto", left: "auto", transform: "none" });
    }
    effectSlot.appendChild(moreEffectsButton);
    syncCompactEffectsToggleState({
      previewPill,
      moreEffectsButton,
      effectsCount: compactEffects.length,
      opened: effectsPopoverOpen,
      hiddenCount: compactEffects.length - (previewPill ? 1 : 0),
    });
  }

  return {
    status,
    effectSlot,
    previewPill,
    moreEffectsButton,
    iconStrip: null,
  };
}

// "+N" under the status row: it counts the hidden effects (the label is set by syncCompactEffectsToggleState), so it
// never reads as "add".
function createCompactMoreEffectsButton(document) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.cardSelectionIgnore = "1";
  Object.assign(button.style, {
    position: "absolute",
    top: "calc(100% + 1px)",
    left: "50%",
    minWidth: "16px",
    height: "16px",
    padding: "0 4px",
    boxSizing: "border-box",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,.34)",
    borderRadius: "999px",
    background: "rgba(8,12,21,.92)",
    color: "#fff",
    fontFamily: "inherit",
    fontSize: "var(--obrt-type-micro, 10px)",
    fontWeight: "800",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 1px 4px rgba(0,0,0,.45)",
    transform: "translateX(-50%)",
    zIndex: "22",
  });
  button.__hitArea = extendHitArea(button, { documentRef: document });
  return button;
}

// Lot L3: the status row with conditions (compactStatusLayout): their squares, the first effect without one as a label
// when it fits, "+N" under the row for the rest. The squares, the label and "+N" all open the drawer, which has every
// name.
function buildCompactIconStatusRow(status, compactEffects, layout, {
  hasExpandableEffects,
  effectsPopoverOpen,
  spellColor,
  onTerminateClassFeature,
  onSpellActions,
  document,
}) {
  status.style.position = "relative";
  const iconStrip = document.createElement("span");
  iconStrip.dataset.compactConditionIcons = "1";
  iconStrip.dataset.cardSelectionIgnore = "1";
  Object.assign(iconStrip.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: `${COMPACT_ICON_CHIP_GAP}px`,
    flex: "0 0 auto",
    height: `${COMPACT_ICON_CHIP_SIZE}px`,
    cursor: hasExpandableEffects ? "pointer" : "default",
    pointerEvents: "auto",
  });
  for (const effect of layout.icons) iconStrip.appendChild(buildCompactConditionIconChip(effect, { documentRef: document }));
  if (hasExpandableEffects) {
    iconStrip.setAttribute("role", "button");
    iconStrip.setAttribute("tabindex", "0");
  }
  status.appendChild(iconStrip);

  let effectSlot = null;
  let previewPill = null;
  if (layout.preview) {
    effectSlot = document.createElement("div");
    Object.assign(effectSlot.style, {
      position: "relative",
      minWidth: "0",
      flex: "1 1 auto",
      height: "14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    });
    const previewEffect = Array.isArray(layout.preview.summaryParts)
      ? { ...layout.preview, summaryParts: [] }
      : layout.preview;
    previewPill = __buildCompactEffectPill(previewEffect, true, {
      spellColor,
      onTerminateClassFeature,
      onSpellActions,
      documentRef: document,
    });
    previewPill.style.flex = "1 1 100%";
    if (hasExpandableEffects) {
      previewPill.setAttribute("role", "button");
      previewPill.setAttribute("tabindex", "0");
      previewPill.style.cursor = "pointer";
    }
    effectSlot.appendChild(previewPill);
    status.appendChild(effectSlot);
  }

  let moreEffectsButton = null;
  if (layout.hiddenCount > 0) {
    moreEffectsButton = createCompactMoreEffectsButton(document);
    status.appendChild(moreEffectsButton);
  }
  syncCompactEffectsToggleState({
    previewPill,
    moreEffectsButton,
    iconStrip,
    effectsCount: compactEffects.length,
    opened: effectsPopoverOpen,
    hiddenCount: layout.hiddenCount,
  });
  return { status, effectSlot, previewPill, moreEffectsButton, iconStrip };
}

export function deriveCompactCardPresentation(
  entry,
  activeId,
  { isGM = false, virtual = false } = {},
) {
  const members = Array.isArray(entry?.__groupMembers) && entry.__groupMembers.length
    ? entry.__groupMembers
    : [entry];
  const active = members.some((member) => member?.id === activeId);
  const boss = !!entry?.isEpic
    || Number(entry?.paragonActions) > 1
    || Number(entry?.legendary?.max) > 0
    || entry?.bossDisclosure === "summary";
  const attitude = String(entry?.attitude || "").toLowerCase();
  const disclosure = entry?.hpDisclosure && typeof entry.hpDisclosure === "object"
    ? entry.hpDisclosure
    : null;
  const canSeeHP = isGM || (disclosure ? disclosure.mode !== "hidden" : attitude === "pc");
  const hp = disclosure && disclosure.mode !== "exact"
    ? Number(disclosure.ratio)
    : Number(entry?.hp);
  const hpMax = disclosure && disclosure.mode !== "exact"
    ? (disclosure.mode === "hidden" ? 0 : 1)
    : Number(entry?.hpMax);
  // A collapsed group shows no HP, as the classic card (lot L20): they were its first member's, read as the group's.
  const hasHP = !virtual && !entry?.__groupCollapsed && Number.isFinite(hpMax) && hpMax > 0;
  const showHP = canSeeHP && hasHP;
  // The HP up to the maximum: a token of the old encoding keeps its part above as temporary hit points (CAP-TEMP).
  const safeHP = hasHP && Number.isFinite(hp)
    ? (disclosure && disclosure.mode !== "exact" ? Math.max(0, hp) : quickHPStateOf({ hp, hpMax }).hp)
    : 0;
  const hpPercent = hasHP ? Math.max(0, Math.min(1, safeHP / hpMax)) : 0;
  // Lot L4 of the tracker UI study: the state the tracker built from the real HP (entry.vitalState), for every viewer
  // whatever the HP disclosure (D3a); without it (older callers, the tests) the KO of the visible HP, as before.
  const vitalState = virtual || entry?.__groupCollapsed
    ? VITAL_STATE.ALIVE
    : entry?.vitalState || (showHP && safeHP <= 0 ? VITAL_STATE.DOWN : VITAL_STATE.ALIVE);
  const knockedOut = vitalState !== VITAL_STATE.ALIVE;
  const dead = vitalState === VITAL_STATE.DEAD;
  const deathSaves = trackerDeathSaves({ attitude, vitalState, conditions: entry?.conditions, deathSaves: entry?.deathSaves });
  const effectMembers = entry?.__groupCollapsed ? [] : members;

  return {
    members,
    active,
    boss,
    attitude,
    // 57, not 59: the boss frame's ring reaches 9px below the portrait, and the name needs that room under it
    // without making the card taller.
    portraitSize: boss ? 57 : 49,
    canSeeHP,
    hp,
    hpMax,
    hasHP,
    showHP,
    safeHP,
    hpPercent,
    knockedOut,
    dead,
    deathSaves,
    effectMembers,
  };
}

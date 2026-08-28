import {
  spellPillCounter,
  spellExpiryDescription,
} from "./spellExpiryCore.js";
import { enableInlineNameEditor } from "./initiativeEditors.js";
import { CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS } from "./classFeatureCore.js";
import { effectSummaryPartsFor } from "./effectLabelCore.js";
import { buildEffectSummaryContainer } from "./effectSummaryViewCore.js";
import { getSpellSummaryParts } from "./spells-srd.js";

export const COMPACT_CARD_WIDTH = 92;
export const COMPACT_CARD_HEIGHT = 120;

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
  const effects = conditionInstances.filter((instance) =>
    instance?.effectKind !== "buff" && instance?.effectKind !== "debuff"
  ).map((instance) => {
    const summaryParts = showEffectSummaryParts
      ? effectSummaryPartsFor(instance, { suppressSaveReminderParts: true })
      : [];
    return {
      kind: instance?.type === "class-feature" ? "class-feature" : "condition",
      label: __compactConditionPillLabel(instance, formatting),
      title: formatConditionInstance(instance),
      ...(summaryParts.length ? { summaryParts } : {}),
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
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1",
    boxShadow: "0 1px 4px rgba(0,0,0,.55)",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  });
  return badge;
}

export function __buildCompactEffectPill(
  effect,
  preview = false,
  {
    documentRef = globalThis.document,
    spellColor = null,
    onTerminateClassFeature = null,
  } = {},
) {
  const pill = compactDocument(documentRef).createElement("span");
  pill.textContent = effect.label;
  pill.title = effect.title || effect.label;
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
  Object.assign(pill.style, {
    minWidth: "0",
    maxWidth: preview ? "100%" : "196px",
    height: preview ? "14px" : "17px",
    padding: "0 5px",
    display: "inline-flex",
    alignItems: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    border: `1px solid ${border}`,
    borderRadius: "999px",
    background,
    color: effectTheme
      ? themeColor(effectTheme.text, "#fff")
      : "#fff",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: "8px",
    fontWeight: "600",
    lineHeight: "1",
    justifyContent: "center",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(0,0,0,.45)",
  });
  if (effect.kind === "class-feature" && effect.classFeatureInstance &&
      typeof onTerminateClassFeature === "function") {
    const terminate = compactDocument(documentRef).createElement("button");
    terminate.type = "button";
    terminate.textContent = "×";
    terminate.dataset.cardSelectionIgnore = "1";
    terminate.title = `Termina ${effect.label}`;
    terminate.setAttribute("aria-label", terminate.title);
    Object.assign(terminate.style, {
      minWidth: "10px",
      width: "10px",
      height: "10px",
      marginLeft: "2px",
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
      flex: "0 0 10px",
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
      Promise.resolve(onTerminateClassFeature(effect.classFeatureInstance))
        .catch((error) => {
          terminate.disabled = false;
          console.warn("[initiative-card] terminate class feature:", error?.message || error);
        });
    });
    pill.appendChild(terminate);
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
    : "Click: seleziona token. Ctrl/Shift+click: selezione multipla. Click destro: azioni";
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
    filter: knockedOut ? "saturate(.42) brightness(.72)" : active ? "brightness(1.13)" : "none",
    opacity: knockedOut ? ".84" : "1",
    transform: "translateZ(0)",
    scale: active ? String(zoomScale) : "1",
    transformOrigin: "50% 50%",
    transition: "scale 160ms ease, filter 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
    zIndex: active ? "5" : boss ? "3" : "1",
  });
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
    minWidth: "25px",
    height: "25px",
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
      height: "24px",
      minWidth: "27px",
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
    marginTop: boss ? "6px" : "4px",
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
      top: `${3 + (boss ? 6 : 4) + (portraitSize / 2)}px`,
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

export function buildCompactCardName(
  entry,
  {
    active,
    documentRef = globalThis.document,
  },
) {
  const name = compactDocument(documentRef).createElement("div");
  name.textContent = entry.__groupCollapsed
    ? `${entry.__groupBase} (Gruppo)`
    : entry.name;
  name.title = entry.__groupCollapsed
    ? `${entry.__groupBase} (x${entry.__groupCount})`
    : entry.name;
  Object.assign(name.style, {
    width: "100%",
    height: "14px",
    marginTop: "1px",
    overflow: "hidden",
    color: active ? "#fff" : "rgba(255,255,255,.90)",
    fontSize: "9px",
    fontWeight: active ? "700" : "600",
    lineHeight: "14px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textShadow: "0 1px 3px #000",
  });
  return name;
}

export function buildCompactCardHP(
  entry,
  {
    showHP,
    safeHP,
    hpMax,
    hpPercent,
    knockedOut,
    hpColorByPct,
    documentRef = globalThis.document,
  },
) {
  const document = compactDocument(documentRef);
  const hpText = document.createElement("div");
  hpText.dataset.cardHpText = "1";
  const disclosure = entry?.hpDisclosure;
  const hpMode = disclosure?.mode || "exact";
  const statusLabels = {
    down: "Fuori combattimento",
    critical: "Critico",
    bloodied: "Ferito",
    hurt: "Provato",
    healthy: "In salute",
  };
  hpText.textContent = !showHP || hpMode === "bar"
    ? ""
    : hpMode === "status"
      ? (statusLabels[disclosure?.status] || "Stato sconosciuto")
      : `HP ${Math.round(safeHP)} / ${Math.round(hpMax)}`;
  Object.assign(hpText.style, {
    display: showHP && hpMode !== "bar" ? "block" : "none",
    width: "100%",
    height: "11px",
    overflow: "hidden",
    color: knockedOut ? "rgba(255,255,255,.58)" : "rgba(226,232,240,.82)",
    fontSize: "8px",
    fontWeight: "500",
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
  Object.assign(hpFill.style, {
    width: showHP ? `${hpPercent * 100}%` : "0%",
    height: "100%",
    background: knockedOut ? "#475569" : hpColorByPct(hpPercent),
  });
  hpTrack.appendChild(hpFill);

  let knockedOutBadge = null;
  if (knockedOut) {
    const knockedOutTitle = hpMode === "exact"
      ? `Fuori combattimento: 0 / ${hpMax}`
      : "Fuori combattimento";
    knockedOutBadge = compactStatusBadge(
      "KO",
      knockedOutTitle,
      "neutral",
      { documentRef },
    );
    knockedOutBadge.dataset.cardKoBadge = "1";
    Object.assign(knockedOutBadge.style, {
      position: "absolute",
      right: "6px",
      top: entry.__groupCollapsed && entry.__groupCount > 1 ? "34px" : "6px",
      height: "21px",
      zIndex: "6",
    });
  }

  return {
    hpText,
    hpTrack,
    hpFill,
    knockedOutBadge,
  };
}

export function syncCompactEffectsToggleState({
  previewPill,
  moreEffectsButton,
  effectsCount,
  opened,
}) {
  const expanded = opened ? "true" : "false";
  const label = opened
    ? "Nascondi gli altri effetti"
    : `Mostra altri ${effectsCount - 1} effetti`;

  moreEffectsButton.style.display = opened ? "none" : "inline-flex";
  moreEffectsButton.setAttribute("aria-expanded", expanded);
  moreEffectsButton.setAttribute("aria-label", label);
  moreEffectsButton.title = label;
  previewPill.setAttribute("aria-expanded", expanded);
  previewPill.setAttribute("aria-label", label);
}

export function bindCompactEffectsToggle({
  previewPill,
  moreEffectsButton,
  effectsCount,
  requestToggle,
}) {
  const handleToggle = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const opened = await requestToggle();
    syncCompactEffectsToggleState({
      previewPill,
      moreEffectsButton,
      effectsCount,
      opened,
    });
  };

  moreEffectsButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  moreEffectsButton.addEventListener("click", handleToggle);
  previewPill.addEventListener("pointerdown", (event) => event.stopPropagation());
  previewPill.addEventListener("click", handleToggle);
  previewPill.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    void handleToggle(event);
  });

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
        fontSize: "9px",
        fontWeight: "700",
        textAlign: "center",
        outline: "none",
      });
      return input;
    },
    saveName,
    restoreName: (displayedName) => {
      name.textContent = displayedName;
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

export function buildCompactCardStatus(
  compactEffects,
  {
    hasExpandableEffects = compactEffects.length > 1,
    effectsPopoverOpen = false,
    spellColor = null,
    onTerminateClassFeature = null,
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

  let previewPill = null;
  let effectSlot = null;
  if (compactEffects.length) {
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
    previewPill = __buildCompactEffectPill(previewEffect, true, {
      spellColor,
      onTerminateClassFeature,
      documentRef,
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
  if (hasExpandableEffects) {
    moreEffectsButton = document.createElement("button");
    moreEffectsButton.type = "button";
    moreEffectsButton.textContent = "+";
    moreEffectsButton.dataset.cardSelectionIgnore = "1";
    Object.assign(moreEffectsButton.style, {
      position: "absolute",
      top: "calc(100% + 1px)",
      left: "50%",
      width: "16px",
      height: "16px",
      padding: "0 0 1px",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid rgba(255,255,255,.34)",
      borderRadius: "50%",
      background: "rgba(8,12,21,.92)",
      color: "#fff",
      fontFamily: "inherit",
      fontSize: "13px",
      fontWeight: "800",
      lineHeight: "1",
      cursor: "pointer",
      boxShadow: "0 1px 4px rgba(0,0,0,.45)",
      transform: "translateX(-50%)",
      zIndex: "22",
    });
    effectSlot.appendChild(moreEffectsButton);
    syncCompactEffectsToggleState({
      previewPill,
      moreEffectsButton,
      effectsCount: compactEffects.length,
      opened: effectsPopoverOpen,
    });
  }

  return {
    status,
    effectSlot,
    previewPill,
    moreEffectsButton,
  };
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
  const hasHP = !virtual && Number.isFinite(hpMax) && hpMax > 0;
  const showHP = canSeeHP && hasHP;
  const safeHP = hasHP && Number.isFinite(hp) ? Math.max(0, hp) : 0;
  const hpPercent = hasHP ? Math.max(0, Math.min(1, safeHP / hpMax)) : 0;
  const knockedOut = showHP && !entry?.__groupCollapsed && safeHP <= 0;
  const effectMembers = entry?.__groupCollapsed ? [] : members;

  return {
    members,
    active,
    boss,
    attitude,
    portraitSize: boss ? 59 : 49,
    canSeeHP,
    hp,
    hpMax,
    hasHP,
    showHP,
    safeHP,
    hpPercent,
    knockedOut,
    effectMembers,
  };
}

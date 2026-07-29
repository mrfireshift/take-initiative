function classicDocument(documentRef) {
  if (!documentRef?.createElement) {
    throw new TypeError("A document with createElement is required");
  }
  return documentRef;
}

function hasVisibleCardConditions(cardEffectData = {}) {
  const instances = Array.isArray(cardEffectData.instances)
    ? cardEffectData.instances
    : [];
  if (instances.some((instance) =>
    instance?.effectKind !== "buff" && instance?.effectKind !== "debuff"
  )) {
    return true;
  }

  const hiddenEffectNames = new Set(instances
    .filter((instance) =>
      instance?.effectKind === "buff" || instance?.effectKind === "debuff"
    )
    .map((instance) =>
      String(instance?.condition || instance?.name || "")
        .trim()
        .toLocaleLowerCase("it")
    )
    .filter(Boolean));
  const visibleFlags = Object.entries(cardEffectData.flags || {}).some(
    ([name, active]) =>
      active !== false
      && !hiddenEffectNames.has(String(name).trim().toLocaleLowerCase("it"))
  );
  const visibleCustom = (Array.isArray(cardEffectData.custom)
    ? cardEffectData.custom
    : []
  ).some((entry) => {
    const name = typeof entry === "string"
      ? entry
      : entry?.condition || entry?.name;
    const key = String(name || "").trim().toLocaleLowerCase("it");
    return !!key && !hiddenEffectNames.has(key);
  });
  return visibleFlags || visibleCustom;
}

export function deriveClassicCardPresentation(
  entry,
  {
    isGM = false,
    isLair = false,
    isEpicAction = false,
    cardEffectData = {},
  } = {},
) {
  const hasLegendary = !!(entry?.legendary && Number(entry.legendary.max) > 0);
  const hasParagon = Number(entry?.paragonActions) > 1;
  const isEpic = !!entry?.isEpic;
  const isBoss = hasLegendary || hasParagon || isEpic;
  const hpValue = Number.isFinite(Number(entry?.hp)) ? Number(entry.hp) : 0;
  const hpMax = Number.isFinite(Number(entry?.hpMax)) ? Number(entry.hpMax) : 0;
  const attitude = String(entry?.attitude || "").toLowerCase();
  const hpVisible = isGM || ["ally", "pc"].includes(attitude);
  const knockedOut = hpVisible
    && !entry?.__groupCollapsed
    && !isLair
    && !isEpicAction
    && hpMax > 0
    && hpValue <= 0;
  const playerCardHasHP = !isGM
    && !entry?.__groupCollapsed
    && ["ally", "pc"].includes(attitude);
  const playerBossVerticalOffset = isBoss && !isGM && !playerCardHasHP
    ? (hasLegendary ? 16 : 7)
    : 0;
  const hasCardEffects = !entry?.__groupCollapsed && (
    hasVisibleCardConditions(cardEffectData)
    || (Array.isArray(entry?.spells) && entry.spells.length > 0)
    || !!entry?.isConcentrating
  );
  const dragAllowed = !(isLair || isEpicAction || isEpic);

  return {
    hasLegendary,
    hasParagon,
    isEpic,
    isBoss,
    hpValue,
    hpMax,
    hpVisible,
    knockedOut,
    playerCardHasHP,
    playerBossVerticalOffset,
    hasCardEffects,
    dragAllowed,
  };
}

export function buildClassicCardShell(
  entry,
  {
    groupKey,
    selectionItemIds,
    hpVisible,
    hpMax,
    knockedOut,
    dragAllowed,
    documentRef = globalThis.document,
  },
) {
  const card = classicDocument(documentRef).createElement("div");
  card.dataset.itemId = entry.id;
  card.dataset.initiative = String(entry.initiative || 0);
  card.dataset.groupCollapsed = entry.__groupCollapsed ? "1" : "0";
  card.dataset.groupKey = groupKey;
  card.dataset.trackerCard = "1";
  card.dataset.hpCanSee = hpVisible ? "1" : "0";
  card.dataset.hpVisible = hpVisible && hpMax > 0 ? "1" : "0";
  card.dataset.knockedOut = knockedOut ? "1" : "0";
  card.dataset.isEpicAction = entry.isEpicAction ? "1" : "0";
  card.__selectionItemIds = selectionItemIds;
  card.title = "Click: seleziona token. Ctrl/Shift+click: selezione multipla. Click destro: azioni";
  card.style.cursor = selectionItemIds.length ? "pointer" : "default";
  card.setAttribute("draggable", dragAllowed ? "true" : "false");
  return card;
}

export function applyClassicCardFrame(
  card,
  faction,
  {
    isBoss,
    bossConfig,
    rgba,
    instaTransform,
    outlineW = 2,
    frameW = 4,
    rOuter = 12,
    rInner = 12,
    documentRef = globalThis.document,
  },
) {
  const document = classicDocument(documentRef);
  card.style.position = "relative";
  card.style.marginLeft = "20px";
  card.style.background = `linear-gradient(105deg, ${rgba(faction.base, .38)} 0%, ${rgba(faction.base, .16)} 58%, rgba(31,39,51,.94) 100%)`;
  card.style.border = "none";
  card.style.borderRadius = `${rInner}px`;
  card.style.overflow = "visible";

  const outline = document.createElement("div");
  Object.assign(outline.style, {
    position: "absolute",
    inset: "0",
    border: `${outlineW}px solid ${rgba(faction.border, .72)}`,
    borderRadius: `${rOuter}px`,
    pointerEvents: "none",
    zIndex: "0",
  });

  const ringFill = document.createElement("div");
  Object.assign(ringFill.style, {
    position: "absolute",
    inset: `${outlineW}px`,
    border: `1px solid ${rgba(faction.base, .22)}`,
    background: "transparent",
    borderRadius: `${Math.max(0, rOuter - outlineW)}px`,
    pointerEvents: "none",
    zIndex: "0",
  });

  const ringHole = document.createElement("div");
  Object.assign(ringHole.style, {
    position: "absolute",
    inset: `${outlineW + frameW}px`,
    borderRadius: `${rInner}px`,
    background: "transparent",
    pointerEvents: "none",
    zIndex: "0",
  });

  const sheen = document.createElement("div");
  Object.assign(sheen.style, {
    position: "absolute",
    inset: `${outlineW}px`,
    background: "linear-gradient(135deg, rgba(255,255,255,.10), transparent 42%)",
    borderRadius: `${Math.max(0, rOuter - outlineW)}px`,
    pointerEvents: "none",
    zIndex: "0",
  });

  card.append(outline, ringFill, ringHole, sheen);
  const baseScale = isBoss ? (bossConfig?.scale ?? 1) : 1;
  const baseTransform = `translateZ(0) scale(${baseScale})`;
  if (card.dataset.zoomState !== "base") {
    instaTransform(card, baseTransform);
    card.dataset.zoomState = "base";
  }
  card.style.zIndex = isBoss ? String(bossConfig.zIndex) : "";

  return {
    outline,
    ringFill,
    ringHole,
    sheen,
  };
}

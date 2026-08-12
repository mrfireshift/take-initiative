import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenRule,
  spellBoardTokenView,
} from "./spellBoardTokenCore.js";

const normalizedId = (value) => String(value || "").trim();
const collapsedCompanionGroups = new Set();

function rawItem(value) {
  return value?.item || value || null;
}

export function isSpellBoardTokenItem(item) {
  const value = rawItem(item);
  const metadata = value?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  return value?.layer === "PROP"
    && metadata?.kind === "spell-board-token"
    && !!getSpellBoardTokenRule(metadata.spellId)
    && !!normalizedId(metadata.instanceId)
    && !!normalizedId(metadata.casterId);
}

function changedRecordItem(record, side) {
  return rawItem(record?.[side]);
}

export function hasSpellBoardTokenChange(event) {
  const changed = [
    ...(Array.isArray(event?.items) ? event.items : []),
    ...(Array.isArray(event?.removedItems) ? event.removedItems : []),
  ];
  if (changed.some(isSpellBoardTokenItem)) return true;
  return (Array.isArray(event?.changedRecords) ? event.changedRecords : [])
    .some((record) => (
      isSpellBoardTokenItem(changedRecordItem(record, "before"))
      || isSpellBoardTokenItem(changedRecordItem(record, "after"))
    ));
}

export function spellBoardTokenTrackerItems(items = []) {
  const unique = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const value = rawItem(item);
    if (!value?.id || !isSpellBoardTokenItem(value)) continue;
    unique.set(value.id, value);
  }
  return [...unique.values()];
}

export function spellBoardTokenForSpell(items = [], casterId = "", spell = null) {
  const normalizedCasterId = normalizedId(casterId);
  const instanceId = normalizedId(spell?.id || spell?.instanceId);
  const spellId = normalizedId(spell?.spellId);
  if (!normalizedCasterId || !instanceId) return null;
  const item = spellBoardTokenTrackerItems(items).find((candidate) => {
    const metadata = candidate.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
    return normalizedId(metadata?.casterId) === normalizedCasterId
      && normalizedId(metadata?.instanceId) === instanceId
      && (!spellId || normalizedId(metadata?.spellId) === spellId);
  });
  if (!item) return null;
  const view = spellBoardTokenView(item);
  return view ? { ...view, item } : null;
}

export function updateSpellBoardTokenSnapshot(previousItems = [], event = null) {
  const current = new Map(
    spellBoardTokenTrackerItems(previousItems).map((item) => [item.id, item]),
  );
  for (const item of Array.isArray(event?.removedItems) ? event.removedItems : []) {
    if (item?.id) current.delete(item.id);
  }
  for (const record of Array.isArray(event?.changedRecords) ? event.changedRecords : []) {
    const before = changedRecordItem(record, "before");
    const after = changedRecordItem(record, "after");
    const itemId = after?.id || before?.id;
    if (!itemId) continue;
    if (isSpellBoardTokenItem(after)) current.set(itemId, after);
    else current.delete(itemId);
  }
  for (const item of Array.isArray(event?.items) ? event.items : []) {
    if (!item?.id) continue;
    if (isSpellBoardTokenItem(item)) current.set(item.id, item);
    else current.delete(item.id);
  }
  return [...current.values()];
}

export function spellBoardTokenCompanionsByCasterId(items = []) {
  const companions = new Map();
  for (const item of spellBoardTokenTrackerItems(items)) {
    const metadata = item.metadata[SPELL_BOARD_TOKEN_META_KEY];
    const rule = getSpellBoardTokenRule(metadata.spellId);
    const view = spellBoardTokenView(item);
    const casterId = normalizedId(metadata.casterId);
    if (!rule || !casterId) continue;
    const list = companions.get(casterId) || [];
    const actionLabel = (rule.actions || []).some((action) =>
      action?.actionEconomy === "bonus"
    ) || rule.command?.actionEconomy === "bonus" ? "(Azione Bonus)" : "";
    list.push({
      itemId: item.id,
      instanceId: normalizedId(metadata.instanceId),
      casterId,
      spellId: rule.spellId,
      label: rule.label,
      objectSizeLabel: view?.objectSizeLabel || "",
      iconUrl: item.image?.url || rule.assetPath,
      actionLabel: [view?.objectSizeLabel, actionLabel].filter(Boolean).join(" · "),
      state: view?.state || {},
      hp: view?.state?.hp,
      hpMax: view?.state?.hpMax,
    });
    companions.set(casterId, list);
  }
  for (const list of companions.values()) {
    list.sort((left, right) => (
      left.label.localeCompare(right.label, "it")
      || left.instanceId.localeCompare(right.instanceId)
      || left.itemId.localeCompare(right.itemId)
    ));
  }
  return companions;
}

export function spellBoardTokenCompanionsForEntry(entry, companionsByCasterId) {
  if (!entry || entry.__groupCollapsed) return [];
  if (entry.__paragonIndex !== undefined && Number(entry.__paragonIndex) > 0) return [];
  const casterId = normalizedId(entry.__paragonBaseId || entry.id);
  return casterId ? (companionsByCasterId?.get(casterId) || []) : [];
}

export function spellBoardTokenCompanionRenderPlan(entries = [], items = []) {
  const companionsByCasterId = spellBoardTokenCompanionsByCasterId(items);
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    entryId: entry?.id || null,
    companionIds: spellBoardTokenCompanionsForEntry(entry, companionsByCasterId)
      .map((companion) => companion.itemId),
  }));
}

function companionDimensions(companion, compact) {
  return {
    height: compact ? 20 : 24,
    gap: 2,
  };
}

function companionPortraitDimensions(compact) {
  return {
    size: compact ? 26 : 34,
    left: compact ? -4 : -8,
    contentOffset: compact ? 28 : 34,
  };
}

function rgbaColor(hex, alpha, fallback) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
  if (!match) return fallback;
  const channels = match.slice(1).map((value) => parseInt(value, 16));
  return `rgba(${channels[0]},${channels[1]},${channels[2]},${alpha})`;
}

export function spellBoardTokenCompanionStackHeight(companions = [], { compact = false } = {}) {
  const list = Array.isArray(companions) ? companions : [];
  if (!list.length) return 0;
  return list.reduce((total, companion) => (
    total + companionDimensions(companion, compact).height + 2
  ), 0);
}

export function buildSpellBoardTokenCompanionCard(
  companion,
  {
    compact = false,
    faction = null,
    onBindHP = null,
    documentRef = globalThis.document,
  } = {},
) {
  if (!documentRef?.createElement) throw new TypeError("A document is required");
  const card = documentRef.createElement("div");
  const factionBase = faction?.base || "#1e40af";
  const factionBorder = faction?.border || "rgba(147,197,253,.72)";
  const factionBackground = faction?.base
    ? `linear-gradient(145deg, ${rgbaColor(factionBase, .76, "rgba(30,64,175,.86)")}, ${rgbaColor(factionBase, .5, "rgba(30,64,175,.66)")} 56%, rgba(20,27,37,.95))`
    : "rgba(30,64,175,.86)";
  const hasHP = Number.isFinite(Number(companion?.hp))
    && Number.isFinite(Number(companion?.hpMax))
    && Number(companion.hpMax) > 0;
  const hp = hasHP ? Math.max(0, Math.floor(Number(companion.hp))) : 0;
  const hpMax = hasHP ? Math.max(0, Math.floor(Number(companion.hpMax))) : 0;
  const { height } = companionDimensions(companion, compact);
  card.dataset.spellBoardTokenCompanion = "1";
  card.dataset.spellBoardTokenId = companion.itemId;
  card.dataset.spellBoardTokenCasterId = companion.casterId;
  card.title = `${companion.label} nel turno del caster`;
  card.setAttribute("aria-label", card.title);
  const portrait = companionPortraitDimensions(compact);
  Object.assign(card.style, {
    height: `${height}px`,
    minHeight: `${height}px`,
    position: "relative",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: compact
      ? `1px 5px 1px ${portrait.contentOffset}px`
      : `2px 7px 2px ${portrait.contentOffset}px`,
    border: `1px solid ${factionBorder}`,
    borderRadius: "6px",
    background: factionBackground,
    color: "#fff",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: compact ? "8px" : "9px",
    fontWeight: "700",
    lineHeight: "1",
    overflow: "visible",
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 6px rgba(0,0,0,.35)",
    zIndex: "6",
  });

  const icon = documentRef.createElement("img");
  icon.dataset.spellBoardTokenCompanionPortrait = "1";
  icon.src = companion.iconUrl;
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  Object.assign(icon.style, {
    position: "absolute",
    left: `${portrait.left}px`,
    top: "50%",
    width: `${portrait.size}px`,
    height: `${portrait.size}px`,
    transform: "translateY(-50%)",
    border: `2px solid ${factionBorder}`,
    borderRadius: "50%",
    boxSizing: "border-box",
    background: "rgba(15,23,42,.96)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    objectFit: "cover",
    zIndex: "2",
    pointerEvents: "none",
  });
  const content = documentRef.createElement("span");
  Object.assign(content.style, {
    minWidth: "0",
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: companion.actionLabel || hasHP ? "4px" : "0",
    overflow: "hidden",
  });
  const label = documentRef.createElement("span");
  label.textContent = companion.label;
  Object.assign(label.style, {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  content.appendChild(label);
  let hpBadge = null;
  if (hasHP) {
    hpBadge = documentRef.createElement("span");
    hpBadge.dataset.badge = "hp";
    hpBadge.dataset.itemId = String(companion.itemId);
    hpBadge.dataset.spellBoardTokenHp = "1";
    hpBadge.dataset.spellBoardTokenLabel = companion.label;
    hpBadge.textContent = `HP ${hp} / ${hpMax}`;
    hpBadge.title = `Punti ferita di ${companion.label}. Clicca per modificare`;
    Object.assign(hpBadge.style, {
      flex: "0 0 auto",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      opacity: ".86",
      fontSize: compact ? "7px" : "8px",
      whiteSpace: "nowrap",
      pointerEvents: "auto",
      cursor: "text",
    });
    content.appendChild(hpBadge);
  }
  card.appendChild(icon);
  card.appendChild(content);
  if (hpBadge && typeof onBindHP === "function") onBindHP(hpBadge, companion);
  if (companion.actionLabel) {
    const action = documentRef.createElement("span");
    action.textContent = companion.actionLabel;
    Object.assign(action.style, {
      flex: "0 1 auto",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      opacity: ".82",
      fontSize: compact ? "6px" : "8px",
      whiteSpace: "nowrap",
    });
    content.appendChild(action);
  }
  return card;
}

export function appendSpellBoardTokenCompanions(
  card,
  companions = [],
  {
    compact = false,
    faction = null,
    onBindHP = null,
    documentRef = globalThis.document,
  } = {},
) {
  const list = Array.isArray(companions) ? companions : [];
  if (!card || !list.length) return 0;
  const stackHeight = spellBoardTokenCompanionStackHeight(list, { compact });
  const groupKey = normalizedId(list[0]?.casterId) || "unknown-caster";
  card.style.position = card.style.position || "relative";
  card.style.overflow = "visible";
  const children = [];
  let offset = 2;
  list.forEach((companion) => {
    const child = buildSpellBoardTokenCompanionCard(companion, {
      compact,
      faction,
      onBindHP,
      documentRef,
    });
    child.style.position = "absolute";
    child.style.left = "0";
    child.style.right = "0";
    child.style.top = `calc(100% + ${offset}px)`;
    card.appendChild(child);
    children.push(child);
    offset += companionDimensions(companion, compact).height + 2;
  });
  if (list.length > 1) {
    const toggle = documentRef.createElement("button");
    toggle.type = "button";
    toggle.dataset.spellBoardTokenCompanionToggle = "1";
    toggle.title = "Comprimi o espandi le pedine evocate";
    toggle.setAttribute("aria-label", "Comprimi o espandi le pedine evocate");
    Object.assign(toggle.style, {
      position: "absolute",
      right: "4px",
      top: "50%",
      transform: "translateY(-50%)",
      width: "16px",
      height: "16px",
      padding: "0",
      border: "0",
      borderRadius: "50%",
      background: "rgba(15,23,42,.55)",
      color: "#fff",
      fontSize: "12px",
      lineHeight: "16px",
      textAlign: "center",
      pointerEvents: "auto",
      cursor: "pointer",
      zIndex: "8",
    });
    const applyGroupState = () => {
      const isCollapsed = collapsedCompanionGroups.has(groupKey);
      card.style.marginBottom = `${isCollapsed
        ? companionDimensions(list[0], compact).height + 2
        : stackHeight}px`;
      children.forEach((child, index) => {
        child.style.display = isCollapsed && index > 0 ? "none" : "";
      });
      toggle.textContent = isCollapsed ? "▸" : "▾";
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
    };
    toggle.addEventListener?.("click", (event) => {
      event?.stopPropagation?.();
      if (collapsedCompanionGroups.has(groupKey)) collapsedCompanionGroups.delete(groupKey);
      else collapsedCompanionGroups.add(groupKey);
      applyGroupState();
    });
    children[0].appendChild(toggle);
    applyGroupState();
  } else {
    card.style.marginBottom = `${stackHeight}px`;
  }
  return stackHeight;
}

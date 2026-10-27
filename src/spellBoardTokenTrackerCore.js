import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenRule,
  spellBoardTokenView,
} from "./spellBoardTokenCore.js";
import { buildCardIconGlyph, styleCardIconButton } from "./cardIconButton.js";

const normalizedId = (value) => String(value || "").trim();
// Summoned tokens start collapsed: only the groups the GM expanded are remembered, for this page.
// The key includes the cast instances, so a new cast starts collapsed and a reload forgets them all.
const expandedCompanionGroups = new Set();

function rawItem(value) {
  return value?.item || value || null;
}

// A summon's portrait. The token stores its image as an absolute URL, with the origin of the page that created it
// (spellBoardToken.js): a token made on a dev server or on an older host shows a broken image elsewhere. When the
// image is one of the plugin's own assets (spell-token-*), the portrait reads the same file from the page showing
// it; an image the GM set stays as it is.
export function spellBoardTokenPortraitUrl(item, fallbackPath = "") {
  const url = normalizedId(item?.image?.url);
  if (!url) return fallbackPath;
  let file = "";
  try {
    file = new URL(url, "http://plugin.invalid").pathname.split("/").pop() || "";
  } catch {
    return url;
  }
  return /^spell-token-[a-z0-9-]+\.(?:webp|svg|png)$/u.test(file) ? `/${file}` : url;
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
      baseLabel: rule.label,
      number: view?.number || null,
      objectSizeLabel: view?.objectSizeLabel || "",
      iconUrl: spellBoardTokenPortraitUrl(item, rule.assetPath),
      actionLabel: [view?.objectSizeLabel, actionLabel].filter(Boolean).join(" · "),
      state: view?.state || {},
      hp: view?.state?.hp,
      hpMax: view?.state?.hpMax,
      // A token with a sheet of its own (Mano arcana): CA, HP, abilities and speeds, read from its rule.
      ...(rule.actorCard === true ? { actorCard: true } : {}),
      ...(rule.actorActions === true ? { actorActions: true } : {}),
    });
    companions.set(casterId, list);
  }
  for (const list of companions.values()) {
    list.sort((left, right) => (
      left.label.localeCompare(right.label, "it")
      || left.instanceId.localeCompare(right.instanceId)
      || (left.number || 0) - (right.number || 0)
      || left.itemId.localeCompare(right.itemId)
    ));
    numberCompanionGroups(list);
  }
  return companions;
}

// Tokens of the same cast keep the number written on the map label. Tokens placed before the
// numbering existed get a display-only number from their stable order.
function numberCompanionGroups(list) {
  const groups = new Map();
  for (const companion of list) {
    const key = `${companion.spellId}|${companion.instanceId}`;
    groups.set(key, [...(groups.get(key) || []), companion]);
  }
  for (const group of groups.values()) {
    if (group.length > 1 && group.some((companion) => !companion.number)) {
      group.forEach((companion, index) => { companion.number = index + 1; });
    }
    for (const companion of group) {
      if (companion.number && (group.length > 1 || companion.number > 1)) {
        companion.label = `${companion.baseLabel} ${companion.number}`;
      }
    }
  }
}

const COMPANION_BASE_SHADOW = "0 2px 6px rgba(0,0,0,.35)";

export function applySpellBoardTokenCompanionSelection(element, selectedIds) {
  if (!element?.style) return;
  const selected = !!selectedIds?.has?.(element.dataset?.sharedHpTokenId || element.dataset?.spellBoardTokenId);
  element.dataset.selectionState = selected ? "all" : "none";
  element.style.boxShadow = selected
    ? `${COMPANION_BASE_SHADOW}, 0 0 0 2px rgba(255,255,255,.96), 0 0 10px 3px rgba(255,255,255,.6)`
    : COMPANION_BASE_SHADOW;
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
    onSelect = null,
    onOpenCard = null,
    onOpenActions = null,
    selectedIds = null,
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
  if (companion.sharedHp) {
    card.dataset.sharedHpCompanion = "1";
    card.dataset.sharedHpTokenId = companion.itemId;
    card.dataset.sharedHpSourceId = companion.casterId;
  } else {
    card.dataset.spellBoardTokenCompanion = "1";
    card.dataset.spellBoardTokenId = companion.itemId;
    card.dataset.spellBoardTokenCasterId = companion.casterId;
  }
  card.title = companion.sharedHp ? `${companion.label} · HP condivisi` : `${companion.label} nel turno del caster`;
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
    fontSize: "var(--obrt-type-micro, 10px)",
    fontWeight: "700",
    lineHeight: "1",
    overflow: "visible",
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
    boxShadow: COMPANION_BASE_SHADOW,
    zIndex: "6",
  });
  // Like a creature card: a click selects the token on the map (Ctrl/Cmd adds to the selection).
  if (typeof onSelect === "function") {
    card.style.pointerEvents = "auto";
    card.style.cursor = "pointer";
    card.title = `${companion.label}: clicca per selezionare la pedina`;
    card.addEventListener?.("click", (event) => {
      event?.stopPropagation?.();
      if (card.dataset.companionCollapsedGroup === "1") return;
      if (event?.target?.closest?.("button, [data-badge]")) return;
      onSelect(companion, event);
    });
    applySpellBoardTokenCompanionSelection(card, selectedIds);
  }

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
    if (companion.sharedHp) {
      hpBadge.dataset.sharedHpBadge = "1";
      hpBadge.dataset.sharedHpLabel = companion.label;
    } else {
      hpBadge.dataset.spellBoardTokenHp = "1";
      hpBadge.dataset.spellBoardTokenLabel = companion.label;
    }
    hpBadge.textContent = `HP ${hp} / ${hpMax}`;
    hpBadge.title = `Punti ferita di ${companion.label}. Clicca per modificare`;
    Object.assign(hpBadge.style, {
      flex: "0 0 auto",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      opacity: ".86",
      fontSize: "var(--obrt-type-micro, 10px)",
      whiteSpace: "nowrap",
      pointerEvents: "auto",
      cursor: "text",
    });
    content.appendChild(hpBadge);
  }
  if (companion.actorCard && typeof onOpenCard === "function") {
    const sheet = documentRef.createElement("button");
    sheet.type = "button";
    sheet.dataset.spellBoardTokenSheet = "1";
    sheet.title = `Apri la scheda di ${companion.label}`;
    sheet.setAttribute("aria-label", sheet.title);
    styleCardIconButton(sheet, "sheet");
    Object.assign(sheet.style, { flex: "0 0 auto", pointerEvents: "auto", cursor: "pointer" });
    sheet.appendChild(buildCardIconGlyph("character-sheet.svg", 9, documentRef));
    sheet.addEventListener?.("pointerdown", (event) => event?.stopPropagation?.());
    sheet.addEventListener?.("click", (event) => {
      event?.stopPropagation?.();
      event?.preventDefault?.();
      onOpenCard(companion, event);
    });
    content.appendChild(sheet);
  }
  // Azioni: the hand's actions (Pugno serrato, Afferra…), at any time, without waiting for its caster's turn.
  if (companion.actorActions && typeof onOpenActions === "function") {
    const actions = documentRef.createElement("button");
    actions.type = "button";
    actions.dataset.spellBoardTokenActions = "1";
    actions.title = `Azioni di ${companion.label}`;
    actions.setAttribute("aria-label", actions.title);
    styleCardIconButton(actions, "sheet");
    Object.assign(actions.style, { flex: "0 0 auto", pointerEvents: "auto", cursor: "pointer" });
    actions.appendChild(buildCardIconGlyph("spells.svg", 9, documentRef));
    actions.addEventListener?.("pointerdown", (event) => event?.stopPropagation?.());
    actions.addEventListener?.("click", (event) => {
      event?.stopPropagation?.();
      event?.preventDefault?.();
      onOpenActions(companion, event);
    });
    content.appendChild(actions);
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
  const originalTitle = card.title;
  const originalPadding = card.style.padding;
  card.__setCompanionGroupSummary = (summary) => {
    const collapsed = !!summary;
    card.dataset.companionCollapsedGroup = collapsed ? "1" : "0";
    label.textContent = summary || companion.label;
    icon.style.display = collapsed ? "none" : "";
    for (const detail of Array.from(content.children).slice(1)) detail.style.display = collapsed ? "none" : "";
    card.style.padding = collapsed ? "2px 24px 2px 7px" : originalPadding;
    card.title = summary || originalTitle;
    card.setAttribute("aria-label", summary || (companion.sharedHp ? `${companion.label} · HP condivisi` : `${companion.label} nel turno del caster`));
  };
  return card;
}

export function appendSpellBoardTokenCompanions(
  card,
  companions = [],
  {
    compact = false,
    faction = null,
    onBindHP = null,
    onSelect = null,
    onOpenCard = null,
    onOpenActions = null,
    selectedIds = null,
    onStackChange = null,
    documentRef = globalThis.document,
  } = {},
) {
  const list = Array.isArray(companions) ? companions : [];
  if (!card || !list.length) return 0;
  const stackHeight = spellBoardTokenCompanionStackHeight(list, { compact });
  const groupKey = [
    normalizedId(list[0]?.casterId) || "unknown-caster",
    ...[...new Set(list.map((companion) => normalizedId(companion?.instanceId)))].sort(),
  ].join("|");
  card.style.position = card.style.position || "relative";
  card.style.overflow = "visible";
  const children = [];
  let offset = 2;
  list.forEach((companion) => {
    const child = buildSpellBoardTokenCompanionCard(companion, {
      compact,
      faction,
      onBindHP,
      onSelect,
      onOpenCard,
      onOpenActions,
      selectedIds,
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
    const hasShared = list.some(companion => companion.sharedHp);
    const hasSummons = list.some(companion => !companion.sharedHp);
    const summary = `${hasShared && hasSummons ? "Token collegati ed evocazioni" : hasShared ? "Token collegati" : "Evocazioni"} · ${list.length}`;
    const portraits = documentRef.createElement("span");
    portraits.dataset.companionGroupPortraits = "1";
    portraits.setAttribute("aria-hidden", "true");
    const portraitSize = compact ? 24 : 30;
    const portraitOverlap = compact ? 13 : 10;
    const previewMembers = list.slice(0, 3);
    const portraitsWidth = previewMembers.length * portraitSize - (previewMembers.length - 1) * portraitOverlap;
    Object.assign(portraits.style, { position: "absolute", left: "-6px", top: "50%", transform: "translateY(-50%)",
      alignItems: "center", height: `${portraitSize}px`, pointerEvents: "none" });
    previewMembers.forEach((companion, index) => {
      const portrait = documentRef.createElement("img");
      portrait.src = companion.iconUrl || "/quick-damage.svg";
      portrait.alt = "";
      portrait.title = companion.label;
      Object.assign(portrait.style, { width: `${portraitSize}px`, height: `${portraitSize}px`,
        flex: `0 0 ${portraitSize}px`, marginLeft: index ? `-${portraitOverlap}px` : "0",
        borderRadius: "50%", border: `1px solid ${faction?.border || "rgba(255,255,255,.7)"}`,
        boxSizing: "border-box", background: "#0f172a", objectFit: "cover",
        boxShadow: "0 1px 3px rgba(0,0,0,.65)", zIndex: String(previewMembers.length - index) });
      portraits.appendChild(portrait);
    });
    const toggle = documentRef.createElement("button");
    toggle.type = "button";
    toggle.dataset.spellBoardTokenCompanionToggle = "1";
    toggle.title = list.some(companion => companion.sharedHp)
      ? "Comprimi o espandi i token collegati" : "Comprimi o espandi le pedine evocate";
    toggle.setAttribute("aria-label", toggle.title);
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
      const isCollapsed = !expandedCompanionGroups.has(groupKey);
      card.style.marginBottom = `${isCollapsed
        ? companionDimensions(list[0], compact).height + 2
        : stackHeight}px`;
      children.forEach((child, index) => {
        child.style.display = isCollapsed && index > 0 ? "none" : "flex";
      });
      children[0].__setCompanionGroupSummary(isCollapsed ? summary : null);
      portraits.style.display = isCollapsed ? "flex" : "none";
      if (isCollapsed) children[0].style.paddingLeft = `${portraitsWidth}px`;
      toggle.textContent = isCollapsed ? "▸" : "▾";
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
    };
    toggle.addEventListener?.("click", (event) => {
      event?.stopPropagation?.();
      if (expandedCompanionGroups.has(groupKey)) expandedCompanionGroups.delete(groupKey);
      else expandedCompanionGroups.add(groupKey);
      applyGroupState();
      onStackChange?.(Number.parseFloat(card.style.marginBottom) || 0);
    });
    children[0].appendChild(toggle);
    children[0].appendChild(portraits);
    applyGroupState();
  } else {
    card.style.marginBottom = `${stackHeight}px`;
  }
  return stackHeight;
}

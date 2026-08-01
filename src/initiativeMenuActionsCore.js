import {
  isAllowedCompactAdminMenuAction,
  isAllowedInitiativeCardMenuAction,
} from "./menuPopoverProtocolCore.js";

const COMPACT_ADMIN_MENU_ACTION_SELECTORS = Object.freeze({
  "reset-round": "[data-reset-round='1']",
  history: "[data-history='1']",
  "add-all": "[data-add-all-initiative='1']",
  "fill-initiative": "[data-fill-initiative='1']",
  factions: "[data-faction-configurator='1']",
  "clear-initiative": "[data-clear-initiative='1']",
});

export function resolveCompactAdminMenuAction(data) {
  if (data?.type !== "action" ||
      !isAllowedCompactAdminMenuAction(data.action)) return null;
  const action = String(data.action);
  const selector = COMPACT_ADMIN_MENU_ACTION_SELECTORS[action];
  return selector ? { action, selector } : null;
}

export function deriveInitiativeCardBossMode(entry) {
  if (entry?.isEpic) return "epic";
  if (Number(entry?.paragonActions) > 1) return "paragon";
  if (Number(entry?.legendary?.max) > 0) return "legendary";
  return "none";
}

export function buildInitiativeCardContextMenuPayload({
  sourceEntry,
  scopeIds = [],
  hasActiveConcentration = false,
} = {}) {
  const normalizedScopeIds = Array.isArray(scopeIds) ? scopeIds : [];
  const isBulkScope = normalizedScopeIds.length > 1;
  const menuTitle = sourceEntry?.__groupCollapsed
    ? sourceEntry?.__groupBase
    : sourceEntry?.name;
  const classFeatures = !isBulkScope && Array.isArray(sourceEntry?.classFeatures)
    ? sourceEntry.classFeatures.slice(0, 64)
    : [];
  const showClassFeatureResourceReset = !isBulkScope
    && ["pc", "ally"].includes(sourceEntry?.attitude);

  return {
    title: isBulkScope
      ? `${menuTitle || "Azioni"} (${normalizedScopeIds.length})`
      : (menuTitle || "Azioni"),
    isBulkScope,
    scopeCount: normalizedScopeIds.length,
    expandedTokenMenu: !sourceEntry?.__groupCollapsed,
    hasActiveConcentration: !!hasActiveConcentration,
    attitude: sourceEntry?.attitude,
    activeMode: deriveInitiativeCardBossMode(sourceEntry),
    groupCollapsed: !!sourceEntry?.__groupCollapsed,
    showInitiativeCard: !isBulkScope &&
      ["pc", "ally"].includes(sourceEntry?.attitude),
    showBossMenu: !isBulkScope && sourceEntry?.attitude === "enemy",
    ...(classFeatures.length ? { classFeatures } : {}),
    ...(showClassFeatureResourceReset ? { showClassFeatureResourceReset: true } : {}),
  };
}

export async function routeInitiativeCardContextMenuAction(
  context,
  data,
  handlers = {},
) {
  const action = String(data?.action || "");
  const value = String(data?.value || "");
  if (!isAllowedInitiativeCardMenuAction(action, value)) return false;

  const sourceEntry = context?.sourceEntry;
  const scopeIds = context?.scopeIds;
  const invoke = async (name, ...args) => {
    if (typeof handlers[name] !== "function") return false;
    await handlers[name](...args);
    return true;
  };

  if (action === "conditions") {
    if (!await invoke("selectScope", scopeIds)) return false;
    return invoke("openConditions", sourceEntry);
  }
  if (action === "clear-conditions") {
    return invoke("clearConditions", scopeIds);
  }
  if (action === "spells") {
    if (!await invoke("selectScope", scopeIds)) return false;
    return invoke("openSpells", sourceEntry);
  }
  if (action === "clear-spells") {
    return invoke("clearSpells", scopeIds);
  }
  if (action === "clear-concentration") {
    return invoke("clearConcentrations", scopeIds, sourceEntry);
  }
  if (action === "class-feature-activate") {
    return invoke("activateClassFeature", sourceEntry, value, scopeIds);
  }
  if (action === "class-feature-deactivate") {
    return invoke("deactivateClassFeature", sourceEntry, value);
  }
  if (action === "class-feature-reset-resources") {
    return invoke("resetClassFeatureResources", sourceEntry);
  }
  if (action === "initiative-card") {
    return invoke("openInitiativeCard", sourceEntry);
  }
  if (action === "attitude") {
    return invoke("setAttitude", scopeIds, value);
  }
  if (action === "boss-mode") {
    return invoke("setBossMode", sourceEntry, value);
  }
  if (action === "remove") {
    return invoke("removeFromInitiative", scopeIds);
  }
  return false;
}

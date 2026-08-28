import { ID } from "./constants.js";
import { gridGeometryFromBounds, gridPlanarDistance } from "./distance3dCore.js";
import { areaHitsBounds, buildArea, buildCircleArea } from "./aoeGeometryCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  CHAIN_LIGHTNING_TARGETING,
  resolveChainLightningTargeting,
} from "./chainLightningTargetingCore.js";
import { resolveSpellSaveTargeting } from "./spellSaveTargetingCore.js";
import { getSpellSaveWorkflowRule } from "./spellSaveWorkflowRules.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import {
  getSpellCatalog,
  getSpellDefinition,
  getSpellSummaryParts,
} from "./spells-srd.js";
import { buildSpellUnifiedCatalogEntries } from "./spellUnifiedPanelCatalogCore.js";
import {
  findActiveSpellConcentration,
} from "./spellCastPhaseCore.js";
import {
  getSpellOverviewActions,
} from "./spellActiveActionCore.js";
import {
  getSpellUnifiedActiveActionDeclarations,
} from "./spellUnifiedPanelCore.js";
import {
  getTrackerBaseItemId,
  spellOverviewGroups,
  spellTurnsLabel,
} from "./spellsPanelViewCore.js";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenPlacementRule,
  spellBoardTokenView,
} from "./spellBoardTokenCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";
import { getSpellAreaRuleForPlacement, getSpellAreaRules } from "./spellAreaRules.js";
import { getMobileAuraRule, SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import { pendingSpellZoneTriggerActivations } from "./spellZoneTriggerCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const CONC_META_KEY = `${ID}/concentration`;

const GRID_UNIT_METERS = Object.freeze({
  m: 1,
  meter: 1,
  meters: 1,
  metro: 1,
  metri: 1,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
});

export const SPELL_UNIFIED_VIRTUAL_IDS = Object.freeze([
  "__LAIR__",
  "__EPIC__",
  "__PARAGON__",
]);

function text(value) {
  return String(value || "").trim();
}

const FACTION_LABELS = Object.freeze({
  pc: "PG",
  ally: "Alleati",
  neutral: "Neutrali",
  enemy: "Nemici",
});

function factionKey(value) {
  const normalized = text(value).toLocaleLowerCase("it");
  if (Object.prototype.hasOwnProperty.call(FACTION_LABELS, normalized)) return normalized;
  if (["friendly", "friend", "good"].includes(normalized)) return "ally";
  if (["hostile", "foe", "bad"].includes(normalized)) return "enemy";
  return "neutral";
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
}

export function uniqueSceneIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function isVirtualId(value) {
  const id = text(value);
  return SPELL_UNIFIED_VIRTUAL_IDS.some((virtualId) => (
    id === virtualId || id.startsWith(virtualId)
  ));
}

function sceneApi(obr) {
  if (!obr?.scene?.items?.getItems) throw new Error("scene-runtime-unavailable");
  return obr.scene.items;
}

export async function getContextOrSelectionIds(obr) {
  try {
    const context = await obr?.contextMenu?.getContext?.();
    const ids = (context?.items || []).map((item) => item?.id).filter(Boolean);
    if (ids.length) return uniqueSceneIds(ids);
  } catch {}
  try {
    return uniqueSceneIds(await obr?.player?.getSelection?.());
  } catch {
    return [];
  }
}

export async function getCardTargetIds(obr, sourceId, initiativeCharacters = []) {
  try {
    const selected = uniqueSceneIds(await obr?.player?.getSelection?.());
    if (selected.length) {
      const activeIds = new Set(initiativeCharacters.map((item) => item?.id).filter(Boolean));
      const valid = selected.filter((id) => activeIds.has(id));
      if (valid.length) return valid;
    }
  } catch {}
  return sourceId ? [sourceId] : [];
}

export async function getAllInitiativeCharacters(obr, sourceId = "") {
  try {
    const metadata = await obr.scene.getMetadata();
    const order = Array.isArray(metadata?.[STATE_KEY]?.order)
      ? metadata[STATE_KEY].order
      : [];
    const orderedIds = uniqueSceneIds(order.map(getTrackerBaseItemId))
      .filter((id) => !isVirtualId(id));
    const orderedSet = new Set(orderedIds);
    const items = await sceneApi(obr).getItems((item) => {
      const meta = item.metadata?.[META_KEY];
      return item.layer === "CHARACTER"
        && !!meta
        && !isVirtualId(item.id)
        && (meta.inInitiative === true || orderedSet.has(item.id) || item.id === sourceId);
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const active = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    for (const item of items) {
      if (!active.some((candidate) => candidate.id === item.id)
        && (item.metadata?.[META_KEY]?.inInitiative === true || item.id === sourceId)) {
        active.push(item);
      }
    }
    if (active.length) return active;
  } catch (error) {
    console.warn("[spell-unified-panel] initiative lookup:", error?.message || error);
  }

  try {
    const items = await sceneApi(obr).getItems(
      (item) => item.layer === "CHARACTER" && !!item.metadata?.[META_KEY],
    );
    return items
      .filter((item) => !isVirtualId(item.id))
      .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "it"));
  } catch {
    return [];
  }
}

export async function getAppliedAt(obr) {
  try {
    const metadata = await obr.scene.getMetadata();
    const state = metadata?.[STATE_KEY] || {};
    const order = Array.isArray(state.order) ? state.order : [];
    return {
      round: Math.max(1, Number(state.round || 1)),
      actorId: order[state.current] || null,
      phase: "turn",
      turnKey: currentInitiativeTurnKey(state),
    };
  } catch {
    return null;
  }
}

export async function getCasterConcentrations(obr, casterId) {
  if (!text(casterId)) return {};
  const [item] = await sceneApi(obr).getItems([casterId]);
  const concentrations = item?.metadata?.[META_KEY]?.[CONC_META_KEY];
  return concentrations && typeof concentrations === "object" ? concentrations : {};
}

export async function getActiveConcentration(obr, casterId, spell) {
  const concentrations = await getCasterConcentrations(obr, casterId);
  return findActiveSpellConcentration(concentrations, spell);
}

function targetCandidate(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const boardToken = spellBoardTokenView(item);
  const faction = factionKey(meta.attitude);
  const attitude = FACTION_LABELS[faction];
  const hp = Number(meta.hp);
  const hpMax = Number(meta.hpMax);
  const label = [
    item?.name,
    item?.text?.plainText,
    item?.id,
    "Token",
  ].map(text).find(Boolean) || "Token";
  return {
    key: item.id,
    label,
    subtitle: boardToken
      ? `Pedina · ${boardToken.objectSizeLabel || boardToken.sizeCategory || "Oggetto"}`
      : `Creatura · ${attitude}`,
    faction,
    factionLabel: FACTION_LABELS[faction],
    hp: Number.isFinite(hp) ? hp : null,
    hpMax: Number.isFinite(hpMax) ? hpMax : null,
  };
}

export async function getAllSpellTargetItems(obr) {
  const characters = await getAllInitiativeCharacters(obr, "");
  const boardTokens = await sceneApi(obr).getItems((item) => (
    item?.layer === "PROP"
      && item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.kind === "spell-board-token"
      && Number.isFinite(Number(item?.metadata?.[META_KEY]?.hpMax))
  )).catch(() => []);
  const byId = new Map();
  for (const item of [...characters, ...boardTokens]) {
    if (item?.id) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function gridMetersPerCell(scale = {}) {
  const parsed = scale?.parsed && typeof scale.parsed === "object"
    ? scale.parsed
    : scale;
  const multiplier = Number(parsed?.multiplier);
  const unit = text(parsed?.unit).toLocaleLowerCase("it");
  return (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.5)
    * (GRID_UNIT_METERS[unit] || 1);
}

function itemGeometry(item, bounds, dpi) {
  if (bounds) return gridGeometryFromBounds(bounds, dpi);
  if (item?.position && Number.isFinite(Number(item.position.x))
    && Number.isFinite(Number(item.position.y))) {
    return {
      position: {
        x: Number(item.position.x),
        y: Number(item.position.y),
      },
      size: { width: dpi, height: dpi },
    };
  }
  return null;
}

async function sceneGeometry(obr, ids = [], items = null) {
  const normalizedIds = uniqueSceneIds(ids);
  if (!normalizedIds.length) return { dpi: 150, metersPerCell: 1.5, byId: new Map() };
  const [liveItems, dpiValue, scale, bounds] = await Promise.all([
    Array.isArray(items)
      ? Promise.resolve(items.filter((item) => normalizedIds.includes(item?.id)))
      : sceneApi(obr).getItems(normalizedIds),
    obr?.scene?.grid?.getDpi?.().catch?.(() => 150) || Promise.resolve(150),
    obr?.scene?.grid?.getScale?.().catch?.(() => ({ parsed: { multiplier: 1.5, unit: "m" } }))
      || Promise.resolve({ parsed: { multiplier: 1.5, unit: "m" } }),
    Promise.all(normalizedIds.map(async (id) => [
      id,
      await obr?.scene?.items?.getItemBounds?.([id]).catch?.(() => null) || null,
    ])),
  ]);
  const dpi = Math.max(1, Number(dpiValue) || 150);
  const boundsById = new Map(bounds);
  const byId = new Map(
    (Array.isArray(liveItems) ? liveItems : []).map((item) => [
      item.id,
      itemGeometry(item, boundsById.get(item.id), dpi),
    ]),
  );
  return {
    dpi,
    metersPerCell: gridMetersPerCell(scale),
    byId,
  };
}

function distanceBetween(first, second, geometry) {
  const from = geometry.byId.get(first);
  const to = geometry.byId.get(second);
  if (!from || !to) return null;
  return gridPlanarDistance(
    from.position,
    to.position,
    geometry.dpi,
    geometry.metersPerCell,
    from.size,
    to.size,
  ).distance;
}

function circleCommands(radius, Command) {
  const handle = radius * 0.5522847498;
  return [
    [Command.MOVE, radius, 0],
    [Command.CUBIC, radius, handle, handle, radius, 0, radius],
    [Command.CUBIC, -handle, radius, -radius, handle, -radius, 0],
    [Command.CUBIC, -radius, -handle, -handle, -radius, 0, -radius],
    [Command.CUBIC, handle, -radius, radius, -handle, radius, 0],
    [Command.CLOSE],
  ];
}

export async function startSpellUnifiedTargetingReference(
  obr,
  {
    targetId = "",
    radiusMeters = null,
    label = "Raggio bersagli",
  } = {},
) {
  const normalizedTargetId = text(targetId);
  const radius = Number(radiusMeters);
  if (!normalizedTargetId || !Number.isFinite(radius) || radius <= 0) return null;
  if (typeof obr?.interaction?.startItemInteraction !== "function") return null;
  const { buildPath, Command } = await import("@owlbear-rodeo/sdk");
  const geometry = await sceneGeometry(obr, [normalizedTargetId]);
  const target = geometry.byId.get(normalizedTargetId);
  const radiusPixels = radius / geometry.metersPerCell * geometry.dpi;
  if (!target?.position || !(radiusPixels > 0)) return null;
  const reference = buildPath()
    .commands(circleCommands(radiusPixels, Command))
    .fillRule("evenodd")
    .fillColor("#38bdf8")
    .fillOpacity(0.04)
    .strokeColor("#38bdf8")
    .strokeOpacity(0.8)
    .strokeWidth(Math.max(2, geometry.dpi * 0.025))
    .position(target.position)
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .name(label)
    .build();
  return obr.interaction.startItemInteraction([reference]);
}

function spatialMode({ contract = null, command = null } = {}) {
  return text(
    contract?.presentation?.targeting?.spatialRules?.mode
      || command?.resolution?.targeting?.spatial?.mode
      || command?.targeting?.spatialValidation?.mode,
  );
}

function isChainSpatial({ contract = null, command = null } = {}) {
  const mode = spatialMode({ contract, command });
  const rule = command?.resolution?.targeting?.rule;
  return mode === "primary-and-secondary-range"
    || rule?.spellId === CHAIN_LIGHTNING_TARGETING.spellId;
}

export async function getSpellAreaSpatialValidation(
  obr,
  { contract = null, session = {}, command = null } = {},
) {
  const spell = getSpellDefinition(
    contract?.spell?.id || command?.spell?.spellId,
  );
  const targetIds = uniqueSceneIds(
    command?.targeting?.targetIds || session?.targetIds,
  );
  const casterId = text(command?.spell?.casterId || session?.casterId);
  const primaryId = text(
    command?.targeting?.primaryTargetId
      || session?.primaryTargetId,
  );
  if (isChainSpatial({ contract, command })) {
    const secondaryIds = targetIds.filter((id) => id !== primaryId);
    const geometry = await sceneGeometry(
      obr,
      [casterId, primaryId, ...secondaryIds],
    );
    const secondaryDistancesMeters = Object.fromEntries(secondaryIds.map((id) => [
      id,
      distanceBetween(primaryId, id, geometry),
    ]));
    return {
      primaryDistanceMeters: distanceBetween(casterId, primaryId, geometry),
      secondaryDistancesMeters,
    };
  }

  const contractSpatial = contract?.presentation?.targeting?.spatialRules;
  if (text(contractSpatial?.mode) === "placement-range") {
    const placementPosition = session?.placement?.preview?.position
      || session?.placement?.position
      || null;
    const x = Number(placementPosition?.x);
    const y = Number(placementPosition?.y);
    const maximum = Number(contractSpatial?.maxMeters);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(maximum > 0)) {
      return {
        mode: "placement-range",
        maxMeters: maximum,
        distancesMeters: {},
        invalidTargetIds: targetIds,
      };
    }
    const geometry = await sceneGeometry(obr, targetIds);
    const handPosition = { x, y };
    const handSize = { width: geometry.dpi, height: geometry.dpi };
    const distancesMeters = Object.fromEntries(targetIds.map((id) => {
      const target = geometry.byId.get(id);
      if (!target) return [id, null];
      const measured = gridPlanarDistance(
        handPosition,
        target.position,
        geometry.dpi,
        geometry.metersPerCell,
        handSize,
        target.size,
      ).distance;
      return [id, measured];
    }));
    const invalidTargetIds = targetIds.filter((id) => {
      const distance = Number(distancesMeters[id]);
      return !Number.isFinite(distance) || distance > maximum + 1e-6;
    });
    return {
      mode: "placement-range",
      maxMeters: maximum,
      distancesMeters,
      invalidTargetIds,
    };
  }

  const rule = spell ? getSpellSaveWorkflowRule(spell.id) : null;
  const spatial = rule?.targeting?.spatial || spell?.targeting?.spatial;
  if (!spatial) return {};
  const geometry = await sceneGeometry(
    obr,
    [
      ...(spatial.mode === "caster-range" ? [casterId] : []),
      ...targetIds,
    ],
  );
  if (spatial.mode === "pairwise-distance") {
    const pairwiseDistancesMeters = [];
    for (let index = 0; index < targetIds.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < targetIds.length; nextIndex += 1) {
        const firstId = targetIds[index];
        const secondId = targetIds[nextIndex];
        pairwiseDistancesMeters.push({
          targetIds: [firstId, secondId],
          distanceMeters: distanceBetween(firstId, secondId, geometry),
        });
      }
    }
    return { pairwiseDistancesMeters };
  }
  if (spatial.mode === "caster-range") {
    return {
      casterDistancesMeters: Object.fromEntries(targetIds.map((id) => [
        id,
        distanceBetween(casterId, id, geometry),
      ])),
    };
  }
  return {};
}

export async function validateSpellUnifiedTargetSelection(
  obr,
  { contract = null, session = {}, targetIds = [] } = {},
) {
  const spatialRules = contract?.presentation?.targeting?.spatialRules;
  if (text(spatialRules?.mode) === "placement-range") {
    const normalizedTargetIds = uniqueSceneIds(targetIds);
    const spatial = await getSpellAreaSpatialValidation(obr, { contract, session });
    const invalidDistanceTargetIds = Array.isArray(spatial?.invalidTargetIds)
      ? spatial.invalidTargetIds
      : [];
    return {
      valid: invalidDistanceTargetIds.length === 0,
      errors: invalidDistanceTargetIds.length ? ["target-out-of-range"] : [],
      invalidDistanceTargetIds,
    };
  }
  if (text(spatialRules?.mode) !== "primary-and-secondary-range") {
    return { valid: true, errors: [], invalidDistanceTargetIds: [] };
  }
  const normalizedTargetIds = uniqueSceneIds(targetIds);
  const primaryId = text(session?.primaryTargetId);
  const spatial = await getSpellAreaSpatialValidation(obr, {
    contract,
    session: {
      ...session,
      targetIds: normalizedTargetIds,
      primaryTargetId: primaryId,
    },
  });
  const rule = {
    ...CHAIN_LIGHTNING_TARGETING,
    primaryRangeMeters: Number(spatialRules.primaryRangeMeters)
      || CHAIN_LIGHTNING_TARGETING.primaryRangeMeters,
    secondaryRangeMeters: Number(spatialRules.secondaryRangeMeters)
      || CHAIN_LIGHTNING_TARGETING.secondaryRangeMeters,
  };
  return resolveChainLightningTargeting({
    spellId: rule.spellId,
    slotLevel: session?.slotLevel ?? contract?.presentation?.slot?.default,
    primaryId,
    secondaryIds: normalizedTargetIds.filter((id) => id !== primaryId),
    primaryDistanceMeters: spatial.primaryDistanceMeters,
    secondaryDistancesMeters: spatial.secondaryDistancesMeters,
    rule,
    ignoreTargetLimit: session?.ignoreTargetLimit === true,
  });
}

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

async function validatePrismaticWallOccupiedPlacement(obr, {
  command = null,
  spell = null,
  items = [],
} = {}) {
  if (
    spell?.id !== "prismatic-wall"
    || command?.source?.kind !== "cast"
    || command?.placement?.status !== "confirmed"
  ) return { valid: true, errors: [] };
  const preview = command.placement.preview;
  const start = finitePoint(preview?.start);
  const end = finitePoint(preview?.end);
  const gridOrigin = finitePoint(preview?.gridOrigin);
  const dpi = Number(preview?.dpi);
  const choice = String(
    command?.placement?.ruleChoice
      || command?.spell?.choiceValue
      || "",
  ).trim();
  const rule = getSpellAreaRuleForPlacement(
    String(command?.placement?.ruleId || "prismatic-wall:cast").trim(),
    choice,
  );
  if (!rule || !start || !end || !gridOrigin || !Number.isFinite(dpi) || dpi <= 0) {
    return { valid: false, errors: ["placement-geometry-missing"] };
  }
  const shape = String(rule.geometry?.shape || "").trim();
  const area = shape === "circle"
    ? buildCircleArea(start, end, dpi, gridOrigin)
    : shape === "line"
      ? buildArea("line", start, end, dpi, gridOrigin, {
        widthSquares: Number(preview.widthSquares) || 1,
        widthAnchor: rule.geometry?.widthAnchor,
      })
      : null;
  if (!area || area.type !== shape) {
    return { valid: false, errors: ["placement-invalid"] };
  }
  const creatures = (Array.isArray(items) ? items : [])
    .filter((item) => item?.layer === "CHARACTER" && item?.id);
  const bounds = await Promise.all(creatures.map((item) =>
    obr?.scene?.items?.getItemBounds?.([item.id]).catch?.(() => null)
      || Promise.resolve(null)
  ));
  const occupied = creatures.some((item, index) => {
    const itemBounds = bounds[index];
    return !!itemBounds && areaHitsBounds(area, itemBounds);
  });
  return occupied
    ? { valid: false, errors: ["prismatic-wall-placement-occupied"] }
    : { valid: true, errors: [] };
}

export async function validateSpellAreaSceneSpatial(
  obr,
  { command = null, spell = null, items = [], targetIds = [], caster = null } = {},
) {
  const mode = text(command?.targeting?.mode);
  const liveIds = new Set((Array.isArray(items) ? items : [])
    .map((item) => text(item?.id))
    .filter(Boolean));
  if (mode === "geometric") {
    const placementIds = uniqueSceneIds(command?.placement?.targetIds);
    if (placementIds.some((id) => liveIds.size > 0 && !liveIds.has(id))) {
      return { valid: false, errors: ["target-missing"] };
    }
    if (command?.targeting?.areaAnchor === "primary-target") {
      const primaryId = text(command?.targeting?.primaryTargetId);
      const anchorTargetId = text(
        command?.placement?.anchorTargetId
          || command?.placement?.preview?.anchorTargetId,
      );
      if (!primaryId || !anchorTargetId) {
        return { valid: false, errors: ["placement-anchor-required"] };
      }
      if (anchorTargetId !== primaryId) {
        return { valid: false, errors: ["placement-anchor-mismatch"] };
      }
      if (liveIds.size > 0 && !liveIds.has(primaryId)) {
        return { valid: false, errors: ["target-missing"] };
      }
      if (placementIds.length && !placementIds.includes(primaryId)) {
        return { valid: false, errors: ["primary-not-selected"] };
      }
      const capturedOrigin = command?.placement?.preview?.anchorOrigin;
      if (capturedOrigin) {
        const geometry = await sceneGeometry(obr, [primaryId], items);
        const liveOrigin = geometry.byId.get(primaryId)?.position;
        const capturedX = Number(capturedOrigin.x);
        const capturedY = Number(capturedOrigin.y);
        if (liveOrigin
          && Number.isFinite(capturedX)
          && Number.isFinite(capturedY)
          && Math.hypot(liveOrigin.x - capturedX, liveOrigin.y - capturedY) > 1e-6) {
          return { valid: false, errors: ["placement-anchor-stale"] };
        }
      }
    }
    if (command?.targeting?.spatialValidation?.mode === "placement-range") {
      const invalidTargetIds = Array.isArray(command.targeting.spatialValidation.invalidTargetIds)
        ? command.targeting.spatialValidation.invalidTargetIds
        : [];
      return {
        valid: invalidTargetIds.length === 0,
        errors: invalidTargetIds.length ? ["target-out-of-range"] : [],
      };
    }
    const prismaticPlacement = await validatePrismaticWallOccupiedPlacement(obr, {
      command,
      spell,
      items,
    });
    if (!prismaticPlacement.valid) return prismaticPlacement;
    return { valid: true, errors: [] };
  }

  const spatial = await getSpellAreaSpatialValidation(obr, {
    command: {
      ...command,
      spell: {
        ...(command?.spell || {}),
        spellId: command?.spell?.spellId || spell?.id,
        casterId: command?.spell?.casterId || caster?.id,
      },
      targeting: {
        ...(command?.targeting || {}),
        targetIds: uniqueSceneIds(targetIds),
      },
    },
  });
  if (isChainSpatial({ command })) {
    const rule = {
      ...CHAIN_LIGHTNING_TARGETING,
      ...(command?.resolution?.targeting?.rule || {}),
    };
    const primaryId = text(command?.targeting?.primaryTargetId);
    const result = resolveChainLightningTargeting({
      spellId: rule.spellId,
      slotLevel: command?.spell?.slotLevel,
      primaryId,
      secondaryIds: uniqueSceneIds(targetIds).filter((id) => id !== primaryId),
      primaryDistanceMeters: spatial.primaryDistanceMeters,
      secondaryDistancesMeters: spatial.secondaryDistancesMeters,
      rule,
      ignoreTargetLimit: command?.targeting?.ignoreTargetLimit === true,
    });
    return { valid: result.valid, errors: [...result.errors] };
  }
  const workflowRule = spell ? getSpellSaveWorkflowRule(spell.id) : null;
  const spellSpatial = spell?.targeting?.spatial && typeof spell.targeting.spatial === "object"
    ? spell.targeting.spatial
    : null;
  const targetingRule = workflowRule?.targeting?.spatial
    ? workflowRule
    : spellSpatial
      ? {
        spellId: spell.id,
        targeting: {
          ...(spell?.targeting && typeof spell.targeting === "object"
            ? spell.targeting
            : {}),
          spatial: spellSpatial,
        },
      }
      : null;
  if (!targetingRule) return { valid: true, errors: [] };
  const result = resolveSpellSaveTargeting({
    spellId: spell.id,
    rule: targetingRule,
    slotLevel: command?.spell?.slotLevel,
    targetIds: uniqueSceneIds(targetIds),
    choiceValue: command?.spell?.choiceValue,
    targetContexts: command?.targeting?.targetContexts || {},
    ignoreTargetLimit: command?.targeting?.ignoreTargetLimit === true,
    ...spatial,
  });
  return { valid: result.valid, errors: [...result.errors] };
}

export function buildSpellCatalogEntries() {
  return buildSpellUnifiedCatalogEntries();
}

function persistentRuleForGroup(group, spell) {
  if (spell?.boardToken) {
    return getSpellBoardTokenPlacementRule(spell.id);
  }
  if (group?.castContext?.mobileAura === true) {
    return getMobileAuraRule(spell?.id);
  }
  return getSpellAreaRules(spell?.id, { triggerType: "cast" })
    .find((rule) => rule?.kind === "zone") || null;
}

function persistentTriggers(rule) {
  return (Array.isArray(rule?.zonePolicy?.triggers) ? rule.zonePolicy.triggers : [])
    .map((trigger) => ({
      type: text(trigger?.type || trigger?.timing || trigger?.event),
      resolution: text(trigger?.resolution || trigger?.resolutionKind),
      label: text(trigger?.label || trigger?.data?.label),
    }))
    .filter((trigger) => trigger.type || trigger.label);
}

function persistentProjection(group, spell) {
  const rule = persistentRuleForGroup(group, spell);
  const kind = text(rule?.kind);
  if (!kind) return null;
  const item = kind === "board-token"
    ? group?.boardToken
    : kind === "aura"
      ? group?.auraItem
      : group?.zoneRoot;
  const lifecyclePresent = group?.lifecyclePresent !== false;
  const itemPresent = !!item;
  return {
    kind,
    spellId: text(group?.spellId || spell?.id),
    instanceId: text(group?.instanceId),
    casterId: text(group?.casterId),
    slotLevel: Number.isInteger(Number(group?.castContext?.slotLevel))
      ? Number(group.castContext.slotLevel)
      : null,
    castContext: group?.castContext && typeof group.castContext === "object"
      ? { ...group.castContext }
      : {},
    ruleId: text(rule?.id),
    triggers: persistentTriggers(rule),
    lifecyclePresent,
    itemPresent,
    state: lifecyclePresent
      ? itemPresent ? "present" : "scene-item-missing"
      : itemPresent ? "lifecycle-missing" : "orphaned",
    itemId: text(item?.itemId || item?.id),
    token: kind === "board-token" ? item : null,
    tokens: kind === "board-token"
      ? cloneValue(group?.boardTokens || (item ? [item] : []))
      : [],
  };
}

function overviewProjection(group, currentTurnKey = "") {
  const spell = getSpellDefinition(group?.spellId || group?.storedName);
  const targetIds = group?.targets instanceof Map
    ? [...group.targets.keys()]
    : [];
  const runtimeActions = getSpellOverviewActions({
    spell,
    castContext: group?.castContext,
    casterId: group?.casterId,
    targetIds,
    effectInstances: group?.effectInstances,
    zoneItemId: group?.zoneItemId,
    appliedAt: group?.appliedAt,
    currentTurnKey,
  });
  const declarations = getSpellUnifiedActiveActionDeclarations(spell);
  const declarationsById = new Map(declarations.map((action) => [action.id, action]));
  const actions = runtimeActions.map((action) => {
    const declaration = declarationsById.get(text(action?.id));
    return {
      ...(declaration ? cloneValue(declaration) : {}),
      ...cloneValue(action),
      type: text(action?.type) || "manual",
      definition: cloneValue(declaration?.definition || action),
      available: !text(action?.unavailableReason),
      disabled: !!text(action?.unavailableReason),
      disabledReason: text(action?.unavailableReason),
    };
  });
  const actionIds = new Set(actions.map((action) => text(action?.id)));
  for (const declaration of declarations) {
    if (declaration.resolutionKind !== "zone-movement") continue;
    if (!group?.zoneItemId || actionIds.has(declaration.id)) continue;
    actions.push({
      ...cloneValue(declaration),
      type: "manual",
      available: true,
      disabled: false,
      disabledReason: "",
      definition: cloneValue(declaration.definition || declaration),
    });
  }
  const context = {
    spellId: text(group?.spellId || spell?.id),
    instanceId: text(group?.instanceId),
    casterId: text(group?.casterId),
    casterName: text(group?.casterName),
    name: text(group?.name),
    storedName: text(group?.storedName || group?.name),
    castContext: cloneValue(group?.castContext || {}),
    summaryParts: getSpellSummaryParts(
      spell,
      "",
      cloneValue(group?.castContext || {}),
    ),
    terminalResolution: cloneValue(group?.castContext?.terminalResolution || null),
    pendingTermination: cloneValue(group?.pendingTermination || null),
    appliedAt: cloneValue(group?.appliedAt),
    targetIds: targetIds.map(text).filter(Boolean),
    targetNames: group?.targets instanceof Map ? [...group.targets.values()].map(text) : [],
    turns: Array.isArray(group?.turns) ? [...group.turns] : [],
    counters: Array.isArray(group?.counters) ? [...group.counters] : [],
    effectInstances: cloneValue(group?.effectInstances || []),
    zoneItemId: text(group?.zoneItemId),
    parentZoneId: text(group?.zoneItemId),
    sceneEpoch: currentSceneEpoch(),
    revision: Number.isInteger(Number(group?.revision)) ? Number(group.revision) : null,
    turnKey: text(currentTurnKey),
    concentration: group?.concentrating === true,
    concentrationRef: text(group?.concentrationRef || group?.instanceId || group?.storedName),
    uses: cloneValue(group?.uses || group?.castContext?.uses),
    turn: cloneValue(group?.turn || group?.castContext?.turn),
    round: cloneValue(group?.round || group?.castContext?.round),
  };
  const persistent = persistentProjection(group, spell);
  return {
    key: group.key,
    name: group.name,
    casterName: group.casterName,
    instanceId: text(group.instanceId),
    targetNames: context.targetNames,
    targetIds: context.targetIds,
    durationLabel: spellTurnsLabel(group.turns || [], group.counters || []),
    concentrating: group.concentrating === true,
    prepared: actions.some((action) => action.type === "resolve"),
    actions,
    context,
    summaryParts: context.summaryParts,
    actionLabels: actions
      .filter((action) => action.type === "manual" || action.type === "resolve")
      .map((action) => action.buttonLabel || action.label)
      .filter(Boolean),
    zoneLabel: group.zoneItemId ? "Zona sul campo" : "",
    tokenLabel: group.boardToken
      ? "Pedina sul campo"
      : group.boardTokenRule
        ? "Pedina non posizionata"
        : "",
    persistent,
  };
}

export async function getSpellOverviewSnapshot(obr, sourceId = "") {
  const [items, appliedAt] = await Promise.all([
    getAllInitiativeCharacters(obr, sourceId),
    getAppliedAt(obr),
  ]);
  const boardTokenItems = await sceneApi(obr).getItems((item) => (
    item?.layer === "PROP" && !!item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]
  )).catch(() => []);
  const staticZoneItems = await sceneApi(obr).getItems((item) => (
    !!item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]
  )).catch(() => []);
  const auraItems = await sceneApi(obr).getItems((item) => (
    !!item?.metadata?.[SPELL_AURA_META_KEY]
  )).catch(() => []);
  const boardTokenByInstance = new Map();
  for (const view of boardTokenItems.map((item) => spellBoardTokenView(item)).filter(Boolean)) {
    const list = boardTokenByInstance.get(view.instanceId) || [];
    list.push(view);
    boardTokenByInstance.set(view.instanceId, list);
  }
  const zoneRootByContext = new Map(
    staticZoneItems
      .filter((item) => item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root")
      .map((item) => {
        const metadata = item.metadata[SPELL_STATIC_ZONE_META_KEY];
        return [`${metadata.instanceId}\u0000${metadata.casterId}`, item];
      }),
  );
  const auraByInstance = new Map(
    auraItems
      .map((item) => [
        text(item?.metadata?.[SPELL_AURA_META_KEY]?.instanceId),
        item,
      ])
      .filter(([instanceId]) => instanceId),
  );
  const groups = spellOverviewGroups(items);
  const groupByInstance = new Map(
    groups
      .filter((group) => text(group?.instanceId))
      .map((group) => [text(group.instanceId), group]),
  );
  const syntheticGroups = [];
  for (const item of staticZoneItems) {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY] || {};
    if (metadata.role !== "root") continue;
    const instanceId = text(metadata.instanceId);
    if (!instanceId || groupByInstance.has(instanceId)) continue;
    const spell = getSpellDefinition(metadata.spellId);
    syntheticGroups.push({
      key: `scene-zone:${instanceId}`,
      instanceId,
      storedName: text(spell?.displayName || metadata.spellId),
      spellId: text(metadata.spellId),
      castContext: metadata.ruleChoice ? { choice: metadata.ruleChoice } : null,
      appliedAt: null,
      name: spell?.displayName || metadata.spellId || "Zona senza lifecycle",
      casterId: text(metadata.casterId),
      casterName: items.find((candidate) => candidate.id === metadata.casterId)?.name
        || text(metadata.casterId)
        || "Non indicato",
      concentrating: false,
      targets: new Map(),
      turns: [],
      counters: [],
      effectInstances: [],
      lifecyclePresent: false,
    });
  }
  for (const views of boardTokenByInstance.values()) {
    const view = views[0];
    if (!view?.instanceId || groupByInstance.has(view.instanceId)) continue;
    const spell = getSpellDefinition(view.spellId);
    syntheticGroups.push({
      key: `scene-token:${view.instanceId}`,
      instanceId: view.instanceId,
      storedName: view.label,
      spellId: view.spellId,
      castContext: null,
      appliedAt: null,
      name: spell?.displayName || view.label || "Pedina senza lifecycle",
      casterId: view.casterId,
      casterName: items.find((candidate) => candidate.id === view.casterId)?.name
        || view.casterId
        || "Non indicato",
      concentrating: false,
      targets: new Map(),
      turns: [],
      counters: [],
      effectInstances: [],
      lifecyclePresent: false,
    });
  }
  return [...groups, ...syntheticGroups].map((group) => {
    group.boardTokens = boardTokenByInstance.get(group.instanceId) || [];
    group.boardToken = group.boardTokens[0] || null;
    group.boardTokenRule = getSpellDefinition(group.spellId || group.storedName)?.boardToken || null;
    group.zoneRoot = zoneRootByContext.get(
      `${group.instanceId}\u0000${group.casterId}`,
    ) || null;
    group.zoneItemId = group.zoneRoot?.id || group.boardToken?.itemId || "";
    group.auraItem = auraByInstance.get(group.instanceId) || null;
    return overviewProjection(group, appliedAt?.turnKey || "");
  });
}

export async function getPendingSpellZoneTriggers(
  obr,
  { spellId = "", casterId = "", activationId = "" } = {},
) {
  const items = await sceneApi(obr).getItems((item) => (
    !!item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]
      || !!item?.metadata?.[SPELL_AURA_META_KEY]
  )).catch(() => []);
  const wantedSpellId = text(spellId);
  const wantedCasterId = text(casterId);
  const wantedActivationId = text(activationId);
  return pendingSpellZoneTriggerActivations(items).filter((activation) => (
    (!wantedSpellId || text(activation?.spellId) === wantedSpellId)
    && (!wantedCasterId || text(activation?.casterId) === wantedCasterId)
    && (!wantedActivationId || text(activation?.id || activation?.activationId) === wantedActivationId)
  ));
}

export function createSpellUnifiedPanelSceneProvider(obr, { sceneLifecycle = null } = {}) {
  let targetingReferenceCleanup = null;
  let targetingReferenceSequence = 0;
  const clearTargetingReference = () => {
    targetingReferenceSequence += 1;
    targetingReferenceCleanup?.();
    targetingReferenceCleanup = null;
  };
  const showTargetingReference = async (options = {}) => {
    const operation = sceneLifecycle?.capture?.({ operationId: "spell-panel-targeting-reference" }) || null;
    if (sceneLifecycle && !sceneLifecycle.isCurrent(operation)) return;
    clearTargetingReference();
    const requestSequence = targetingReferenceSequence;
    try {
      const interaction = await startSpellUnifiedTargetingReference(obr, options);
      if (sceneLifecycle && !sceneLifecycle.isCurrent(operation)) {
        interaction?.[1]?.();
        return;
      }
      if (requestSequence !== targetingReferenceSequence) {
        interaction?.[1]?.();
        return;
      }
      targetingReferenceCleanup = interaction?.[1] || null;
    } catch (error) {
      if (requestSequence === targetingReferenceSequence) {
        console.warn(
          "[spell-unified-panel] targeting reference:",
          error?.message || error,
        );
      }
    }
  };
  return {
    getCatalogEntries: () => buildSpellCatalogEntries(),
    getCasters: (sourceId = "") => getAllInitiativeCharacters(obr, sourceId),
    getTargetCandidates: () => getAllSpellTargetItems(obr),
    getContextOrSelectionIds: () => getContextOrSelectionIds(obr),
    getCardTargetIds: (sourceId, casters) => getCardTargetIds(obr, sourceId, casters),
    getAppliedAt: () => getAppliedAt(obr),
    getCasterConcentrations: (casterId) => getCasterConcentrations(obr, casterId),
    getActiveConcentration: (casterId, spell) => getActiveConcentration(obr, casterId, spell),
    getOverview: (sourceId = "") => getSpellOverviewSnapshot(obr, sourceId),
    getPendingZoneTriggers: (filters = {}) => getPendingSpellZoneTriggers(obr, filters),
    getAreaExecutionRuntime: () => ({
      sceneEpoch: sceneLifecycle?.currentEpoch?.() ?? currentSceneEpoch(),
      isCurrent: (epoch) => sceneLifecycle
        ? sceneLifecycle.isCurrent(sceneLifecycle.capture({}))
          && Number(epoch) === Number(sceneLifecycle.currentEpoch?.())
        : isCurrentSceneEpoch(epoch),
      getSpatialValidation: (input) => getSpellAreaSpatialValidation(obr, input),
      validateSpatial: (input) => validateSpellAreaSceneSpatial(obr, input),
      getInitiativeActorId: async () => (await getAppliedAt(obr))?.actorId || null,
    }),
    validateTargetSelection: (input) => validateSpellUnifiedTargetSelection(obr, input),
    showTargetingReference,
    clearTargetingReference,
    getSelection: () => Promise.resolve(obr?.player?.getSelection?.()).catch(() => []),
    setSelection: (ids, replace = true) => Promise.resolve(
      obr?.player?.select?.(uniqueSceneIds(ids), replace),
    ).catch(() => null),
    onSelectionChange: (callback) => {
      try {
        return obr?.player?.onChange?.((player) => {
          callback(uniqueSceneIds(player?.selection));
        }) || null;
      } catch {
        return null;
      }
    },
    onSceneItemsChange: (callback) => {
      let active = true;
      let unsubscribe = null;
      const fallback = () => {
        try {
          if (active) unsubscribe = obr?.scene?.items?.onChange?.(callback) || null;
        } catch {
          unsubscribe = null;
        }
      };
      void import("./sceneItemEvents.js").then(({ subscribeSceneItemChanges }) => {
        if (!active) return;
        unsubscribe = subscribeSceneItemChanges(callback) || null;
      }).catch(fallback);
      return () => {
        active = false;
        unsubscribe?.();
        unsubscribe = null;
      };
    },
    targetCandidate: targetCandidate,
  };
}

export function spellCatalogSource() {
  return getSpellCatalog();
}

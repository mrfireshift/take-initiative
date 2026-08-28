import { spellPillCounter } from "./spellExpiryCore.js";
import { compactLinkedSpellEffectLabel } from "./effectLabelCore.js";

const DEFAULT_FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export const EFFECTS_LAYOUT_CONFIG = Object.freeze({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1,
  labelHeight: 27,
  spellPadX: 12,
  spellMaxWidth: 300,
  conditionPadX: 9,
  conditionStroke: 1,
  conditionMaxWidth: 300,
  summaryPartFontSize: 13,
  summaryPartLabelHeight: 19,
  summaryPartPadX: 6,
  summaryPartMaxWidth: 240,
  summaryPartColumns: 2,
  summaryPartGap: 2,
  compactConditionIconLimit: 3,
  conditionBackground: "#0e131f",
  conditionBackgroundOpacity: 0.9,
  buffBackground: "#15803d",
  debuffBackground: "#b91c1c",
  textFill: "#f8fafc",
  textStroke: "rgba(2,6,23,.55)",
  textStrokeWidth: 1,
  maxViewScale: 1.35,
  stackGap: 1,
  stackClearanceScale: 1,
  stackTopInset: -4 / 70,
  compactStackTopInset: 0,
  stackOffsetY: -1,
  // Una sola spine condivisa: vale sia per stack compatto sia per stack esteso.
  // Rientra del 25% nel token, come nello schizzo OBR.
  labelOffsetX: 0.75,
  compactLabelOffsetX: 0.75,
  conditionZIndex: 100000,
  spellZIndex: 220000,
  dotDiameter: 42,
  dotFontSize: 23,
  dotZIndex: 100021,
});

export function effectsLayoutSceneSnapshotItems(snapshot, {
  sceneEpoch,
  minimumGeneration,
} = {}) {
  if (!snapshot || snapshot.complete !== true || !Array.isArray(snapshot.items)) {
    return null;
  }
  if (Number(snapshot.sceneEpoch) !== Number(sceneEpoch)) return null;
  if (
    minimumGeneration === null
    || minimumGeneration === undefined
    || !Number.isFinite(Number(minimumGeneration))
  ) {
    return null;
  }
  if (Number(snapshot.generation) < Number(minimumGeneration)) return null;
  return snapshot.items;
}

export async function resolveEffectsLayoutSceneItems({
  snapshot,
  sceneEpoch,
  minimumGeneration,
  readItems,
} = {}) {
  const snapshotItems = effectsLayoutSceneSnapshotItems(snapshot, {
    sceneEpoch,
    minimumGeneration,
  });
  if (snapshotItems) return { items: snapshotItems, source: "snapshot" };
  if (typeof readItems !== "function") {
    throw new TypeError("effects-layout-scene-items-reader-required");
  }
  return { items: await readItems(), source: "sdk" };
}

export function effectsLayoutTargetScope(batch = {}) {
  if (batch?.full === true) return null;
  const ids = new Set([
    ...(Array.isArray(batch?.conditions) ? batch.conditions : []),
    ...(Array.isArray(batch?.concentration) ? batch.concentration : []),
  ].map((value) => String(value || "").trim()).filter(Boolean));
  return ids.size ? ids : null;
}

export function expandEffectsLayoutTargetScope(tokens = [], requestedScope = null) {
  if (!(requestedScope instanceof Set)) return null;
  const expanded = new Set(requestedScope);
  const requestedSources = new Set(requestedScope);
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (!requestedSources.has(token?.id)) continue;
    for (const assignment of Array.isArray(token?.assignments) ? token.assignments : []) {
      for (const targetId of Array.isArray(assignment?.targets) ? assignment.targets : []) {
        const id = String(targetId || "").trim();
        if (id) expanded.add(id);
      }
    }
  }
  return expanded;
}

export function effectsLayoutDesiredInScope(desired = [], targetScope = null) {
  if (!(targetScope instanceof Set)) return Array.isArray(desired) ? desired : [];
  return (Array.isArray(desired) ? desired : [])
    .filter((entry) => targetScope.has(String(entry?.targetId || "")));
}

function normalizedKey(value) {
  return String(value || "").trim().toLowerCase();
}

function themeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;
}

function visualTokenBox(token, sceneDpi) {
  const scaleX = Math.abs(Number(token?.scale?.x)) || 1;
  const scaleY = Math.abs(Number(token?.scale?.y)) || 1;
  const safeSceneDpi = Math.max(1, Number(sceneDpi) || 70);
  const imageDpi = Math.max(1, Number(token?.grid?.dpi) || safeSceneDpi);
  const imageWidth = Number(token?.image?.width);
  const imageHeight = Number(token?.image?.height);
  const intrinsicWidth = Number(token?.width) ||
    (Number.isFinite(imageWidth) ? imageWidth / imageDpi * safeSceneDpi : safeSceneDpi);
  const intrinsicHeight = Number(token?.height) ||
    (Number.isFinite(imageHeight) ? imageHeight / imageDpi * safeSceneDpi : safeSceneDpi);
  const width = Math.max(1, intrinsicWidth * scaleX);
  const height = Math.max(1, intrinsicHeight * scaleY);
  const x = Number(token?.position?.x) || 0;
  const y = Number(token?.position?.y) || 0;
  return {
    left: x - width / 2,
    top: y - height / 2,
    width,
    height,
    diameter: Math.max(1, Math.min(width, height)),
  };
}

function conditionWidth(label, measureText, config) {
  if (String(label || "").endsWith("…")) return config.conditionMaxWidth;
  return Math.min(
    config.conditionMaxWidth,
    Math.ceil(measureText(label, config.fontSize, config.fontWeight))
      + config.conditionPadX * 2
      + config.conditionStroke * 4,
  );
}

function summaryPartWidth(label, measureText, config) {
  const fontSize = Number(config.summaryPartFontSize) || config.fontSize;
  const padX = Number(config.summaryPartPadX) || config.conditionPadX;
  const stroke = Number(config.conditionStroke) || 1;
  const maxWidth = Number(config.summaryPartMaxWidth) || config.conditionMaxWidth;
  return Math.min(
    maxWidth,
    Math.ceil(measureText(label, fontSize, config.fontWeight))
      + padX * 2
      + stroke * 4,
  );
}

function layoutRowGroups(rows, config) {
  const groups = [];
  const summaryColumns = Math.max(
    1,
    Math.floor(Number(config.summaryPartColumns) || 2),
  );
  const sourceRows = Array.isArray(rows) ? rows : [];

  for (let index = 0; index < sourceRows.length;) {
    const row = sourceRows[index];
    if (!row?.summaryPart) {
      groups.push([row]);
      index += 1;
      continue;
    }
    if (row.stack === true) {
      groups.push([row]);
      index += 1;
      continue;
    }

    const parentKey = row.summaryParentKey || row.key;
    const group = [];
    while (
      index < sourceRows.length
      && sourceRows[index]?.summaryPart
      && (sourceRows[index]?.summaryParentKey || sourceRows[index]?.key) === parentKey
      && group.length < summaryColumns
    ) {
      group.push(sourceRows[index]);
      index += 1;
    }
    groups.push(group);
  }

  return groups;
}

function fitConditionText(label, measureText, config) {
  const raw = String(label || "").trim();
  if (!raw) return raw;
  const maxTextWidth = Math.max(
    1,
    Number(config.conditionMaxWidth)
      - Number(config.conditionPadX) * 2
      - Number(config.conditionStroke) * 4,
  );
  if (measureText(raw, config.fontSize, config.fontWeight) <= maxTextWidth) {
    return raw;
  }

  const characters = Array.from(raw);
  const ellipsis = "…";
  let low = 0;
  let high = characters.length;
  let best = ellipsis;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("").trimEnd()}${ellipsis}`;
    if (measureText(candidate, config.fontSize, config.fontWeight) <= maxTextWidth) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function spellWidth(label, measureText, config) {
  return Math.min(
    config.spellMaxWidth,
    Math.ceil(measureText(label, config.fontSize, config.fontWeight)) + config.spellPadX * 2,
  );
}

function compactConditionIcon(row) {
  const explicitIcon = String(row?.icon || row?.theme?.emoji || "").trim();
  if (explicitIcon) return explicitIcon;

  const firstToken = String(row?.text || "").trim().split(/\s+/)[0];
  return firstToken && !/^[\p{L}\p{N}]/u.test(firstToken) ? firstToken : "•";
}

function compactRowsForTarget(rows, { measureText, config }) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  // In compact mode the canonical condition keeps its icon, while every
  // summaryParts cluster collapses into the aggregate marker on the right.
  // This keeps the compact projection consistent for declarative details and
  // dynamic progress alike; the full rows remain available in expanded view.
  const conditionRows = sourceRows.filter((row) =>
    row.kind === "condition" && row.summaryPart !== true
  );
  const conditionSummaryRows = sourceRows.filter((row) =>
    row.kind === "condition" && row.summaryPart === true
  );
  const spellRows = sourceRows.filter((row) =>
    row.kind === "spell" && row.summaryPart !== true
  );
  const spellSummaryRows = sourceRows.filter((row) =>
    row.kind === "spell" && row.summaryPart === true
  );
  const spellEffectRows = sourceRows.filter((row) => row.kind === "spell-effect");
  const configuredLimit = Number(config.compactConditionIconLimit);
  const limit = Math.max(
    0,
    Math.floor(Number.isFinite(configuredLimit)
      ? configuredLimit
      : EFFECTS_LAYOUT_CONFIG.compactConditionIconLimit),
  );
  const targetId = sourceRows[0]?.targetId || "";

  const compactRows = conditionRows.slice(0, limit).map((row, index) => {
    const text = compactConditionIcon(row);
    const key = `compact:icon:${row.key}`;

    return {
      ...row,
      identity: `condition|${targetId}|${key}`,
      key,
      kind: "condition",
      compactMode: "condition-icon",
      text,
      width: conditionWidth(text, measureText, config),
      sortKey: `1|${String(index).padStart(3, "0")}|${row.key}`,
      offsetY: 0,
    };
  });

  const summaryParts = [];
  const hiddenConditionCount = Math.max(0, conditionRows.length - limit);
  if (hiddenConditionCount > 0) summaryParts.push(`+${hiddenConditionCount}`);
  if (spellRows.length > 0) summaryParts.push(`✨${spellRows.length}`);
  const effectKeys = new Set([
    ...spellEffectRows.map((row) => row.summaryParentKey || row.key),
    ...spellSummaryRows.map((row) => row.summaryParentKey || row.key),
    ...conditionSummaryRows.map((row) => row.summaryParentKey || row.key),
  ]);
  if (effectKeys.size > 0) summaryParts.push(`✦${effectKeys.size}`);

  if (summaryParts.length > 0) {
    const text = summaryParts.join(" · ");
    compactRows.push({
      identity: `condition|${targetId}|compact:count`,
      kind: "condition",
      compactMode: "effect-count",
      targetId,
      casterId: null,
      key: "compact:count",
      text,
      width: conditionWidth(text, measureText, config),
      height: config.labelHeight,
      backgroundColor: config.conditionBackground,
      backgroundOpacity: config.conditionBackgroundOpacity,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      fontWeight: config.fontWeight,
      lineHeight: config.lineHeight,
      textFill: config.textFill,
      textStroke: config.textStroke,
      textStrokeWidth: config.textStrokeWidth,
      maxViewScale: config.maxViewScale,
      pointerDirection: "LEFT",
      zIndex: config.conditionZIndex,
      sortKey: "2|compact-count",
      offsetY: 0,
    });
  }

  return compactRows;
}

function findSpellEntry(target, assignment) {
  const entries = Array.isArray(target?.spellEntries) ? target.spellEntries : [];
  const match = entries.find((spell) => {
    if (assignment.instanceId && spell.instanceId) {
      return spell.instanceId === assignment.instanceId;
    }
    return normalizedKey(spell.name) === normalizedKey(assignment.key) &&
      (!spell.casterId || spell.casterId === assignment.casterId);
  });
  if (match) return match;
  if (Number.isFinite(assignment.turns) || assignment.expiry) {
    return { turns: assignment.turns, expiry: assignment.expiry };
  }
  return null;
}

function planDot(token, assignments, config, sceneDpi) {
  const concentrationKey = String(token?.concentrationKey || "").trim();
  if (!concentrationKey) return null;
  const assignment = assignments.find((entry) =>
    entry.isConc && normalizedKey(entry.key) === normalizedKey(concentrationKey)
  );
  const color = assignment?.color || {
    solid: "hsl(0, 70%, 45%)",
    fillOpacity: 1,
  };
  const box = visualTokenBox(token, sceneDpi);
  const radius = box.diameter / 2;
  const circleInset = radius * (0.9 - Math.SQRT1_2);
  return {
    identity: `dot|${token.id}`,
    kind: "dot",
    targetId: token.id,
    casterId: token.id,
    key: concentrationKey,
    text: "C",
    x: box.left + circleInset,
    y: box.top + circleInset,
    width: config.dotDiameter,
    height: config.dotDiameter,
    backgroundColor: color.solid,
    backgroundOpacity: 1,
    pointerDirection: "DOWN",
    fontFamily: config.fontFamily,
    fontSize: config.dotFontSize,
    fontWeight: 700,
    lineHeight: 1,
    textFill: "#ffffff",
    textStroke: "rgba(0,0,0,.85)",
    textStrokeWidth: 2,
    maxViewScale: config.maxViewScale,
    zIndex: config.dotZIndex,
  };
}

export function planEffectsLayout({
  tokens = [],
  sceneDpi = 70,
  measureText = (text, fontSize) => String(text || "").length * fontSize * 0.55,
  config = EFFECTS_LAYOUT_CONFIG,
  compact = false,
  expandedTargetIds = [],
  expansionMode = "selected",
  showEffectSummaryParts = true,
} = {}) {
  const expandedIds = new Set(
    (expandedTargetIds instanceof Set
      ? [...expandedTargetIds]
      : Array.isArray(expandedTargetIds)
        ? expandedTargetIds
        : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const tokenById = new Map(tokens.filter((token) => token?.id).map((token) => [token.id, token]));
  const expandAll = expansionMode === "all";
  const rowsByTarget = new Map();
  const spellContextByTarget = new Map();
  const spellContextByInstance = new Map();
  const spellRowIdentities = new Set();
  const desired = [];

  const appendRow = (targetId, row) => {
    if (!rowsByTarget.has(targetId)) rowsByTarget.set(targetId, []);
    rowsByTarget.get(targetId).push(row);
  };

  const appendSpellRow = ({ caster, target, assignment, key, title }) => {
    const targetId = target.id;
    const identity = `spell|${targetId}|${caster.id}|${key}`;
    const spellEntry = findSpellEntry(
      target,
      { ...assignment, casterId: caster.id },
    ) || findSpellEntry(
      caster,
      { ...assignment, casterId: caster.id },
    );
    const isGustOfWind = key === "gust-of-wind" || key === "folata di vento";
    const hideTargetCounter = isGustOfWind && target.id !== caster.id;
    const counter = spellEntry === null || hideTargetCounter
      ? ""
      : spellPillCounter(spellEntry);
    const text = counter ? `${title} (${counter})` : title;
    const sortPrefix = `0|${key}|${caster.id}`;
    const context = {
      title,
      sortPrefix,
      backgroundColor: assignment.color?.solid || "hsl(0, 70%, 45%)",
      backgroundOpacity: assignment.color?.fillOpacity ?? 0.88,
    };
    const instanceId = String(assignment.instanceId || "").trim();
    if (instanceId) {
      spellContextByTarget.set(`${targetId}|${instanceId}`, context);
    }
    if (spellRowIdentities.has(identity)) return context;
    spellRowIdentities.add(identity);
    appendRow(targetId, {
      identity,
      kind: "spell",
      targetId,
      casterId: caster.id,
      key,
      text,
      width: spellWidth(text, measureText, config),
      height: config.labelHeight,
      backgroundColor: context.backgroundColor,
      backgroundOpacity: context.backgroundOpacity,
      pointerDirection: "LEFT",
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      fontWeight: config.fontWeight,
      lineHeight: config.lineHeight,
      textFill: config.textFill,
      textStroke: config.textStroke,
      textStrokeWidth: config.textStrokeWidth,
      maxViewScale: config.maxViewScale,
      zIndex: config.spellZIndex,
      sortKey: `${sortPrefix}|0`,
      offsetY: config.stackOffsetY,
    });
    if (showEffectSummaryParts !== false && Array.isArray(spellEntry?.summaryParts)) {
      const summaryParts = spellEntry.summaryParts
        .map((part, index) => ({
          id: String(part?.id || part?.key || `part-${index + 1}`).trim(),
          label: String(part?.label || part?.text || "").trim(),
          ...(part?.stack === true ? { stack: true } : {}),
        }))
        .filter((part) => part.id && part.label)
        .slice(0, 12);
      for (const [partIndex, part] of summaryParts.entries()) {
        const summaryKey = `${key}:summary:${part.id}`;
        appendRow(targetId, {
          identity: `spell|${targetId}|${caster.id}|${summaryKey}`,
          kind: "spell",
          targetId,
          casterId: caster.id,
          key: summaryKey,
          text: part.label,
          width: summaryPartWidth(part.label, measureText, config),
          height: config.summaryPartLabelHeight,
          backgroundColor: context.backgroundColor,
          backgroundOpacity: context.backgroundOpacity,
          pointerDirection: "LEFT",
          fontFamily: config.fontFamily,
          fontSize: config.summaryPartFontSize,
          fontWeight: config.fontWeight,
          lineHeight: config.lineHeight,
          textFill: config.textFill,
          textStroke: config.textStroke,
          textStrokeWidth: config.textStrokeWidth,
          maxViewScale: config.maxViewScale,
          zIndex: config.spellZIndex,
          summaryPart: true,
          summaryParentKey: key,
          summaryPartId: part.id,
          ...(part.stack === true ? { stack: true } : {}),
          sortKey: `${sortPrefix}|0|summary|${String(partIndex).padStart(3, "0")}`,
          offsetY: 0,
        });
      }
    }
    return context;
  };

  for (const caster of tokens) {
    const assignments = Array.isArray(caster.assignments) ? caster.assignments : [];
    const dot = planDot(caster, assignments, config, sceneDpi);
    if (dot) desired.push(dot);

    for (const assignment of assignments) {
      const key = normalizedKey(assignment.key);
      if (!key) continue;
      const title = String(
        assignment.displayName || assignment.key || ""
      ).trim();
      const instanceId = String(assignment.instanceId || "").trim();
      if (instanceId) {
        spellContextByInstance.set(instanceId, {
          caster,
          assignment,
          key,
          title,
        });
      }
      const targets = Array.isArray(assignment.targets) && assignment.targets.length
        ? assignment.targets
        : [caster.id];
      for (const targetId of new Set(targets.filter(Boolean))) {
        const target = tokenById.get(targetId);
        if (!target) continue;
        appendSpellRow({ caster, target, assignment, key, title });
      }
    }
  }

  for (const token of tokens) {
    for (const condition of Array.isArray(token.conditionParts) ? token.conditionParts : []) {
      const key = String(condition?.key || "").trim();
      const rawText = String(condition?.label || "").trim();
      if (!key || !rawText) continue;
      const spellEffect = condition?.kind === "spell-effect";
      const buff = spellEffect && condition?.tone === "buff";
      const debuff = spellEffect && condition?.tone === "debuff";
      const theme = condition?.theme && typeof condition.theme === "object"
        ? condition.theme
        : null;
      const themedBackground = themeColor(
        theme?.background,
        buff ? config.buffBackground : debuff ? config.debuffBackground : "",
      );
      const themedText = themeColor(theme?.text, config.textFill);
      const parentEffectId = String(condition?.parentEffectId || "").trim();
      let spellContext = parentEffectId
        ? spellContextByTarget.get(`${token.id}|${parentEffectId}`)
        : null;
      if (!spellContext && parentEffectId) {
        const source = spellContextByInstance.get(parentEffectId);
        if (source) {
          spellContext = appendSpellRow({
            caster: source.caster,
            target: token,
            assignment: source.assignment,
            key: source.key,
            title: source.title,
          });
        }
      }
      const linkedToSpell = !!spellContext;
      // Se una membership usa esattamente il nome della spell padre (es.
      // Muro di Luce), la condition instance serve solo come ponte dinamico
      // per proiettare la pill della spell sul bersaglio. Renderizzare anche
      // una seconda pill spell-effect produrrebbe una duplicazione visiva.
      const redundantParentLabel = spellEffect && linkedToSpell
        && rawText.localeCompare(spellContext.title, "it", { sensitivity: "base" }) === 0;
      if (redundantParentLabel) continue;
      const compactText = linkedToSpell
        ? compactLinkedSpellEffectLabel(rawText, spellContext.title)
        : rawText;
      const text = fitConditionText(compactText, measureText, config);
      const baseRow = {
        identity: `condition|${token.id}|${key}`,
        kind: spellEffect ? "spell-effect" : "condition",
        targetId: token.id,
        casterId: null,
        key,
        icon: String(condition?.icon || theme?.emoji || "").trim(),
        text,
        width: conditionWidth(text, measureText, config),
        height: config.labelHeight,
        backgroundColor: linkedToSpell
          ? spellContext.backgroundColor
          : themedBackground || config.conditionBackground,
        backgroundOpacity: linkedToSpell
          ? spellContext.backgroundOpacity
          : config.conditionBackgroundOpacity,
        pointerDirection: "LEFT",
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        fontWeight: config.fontWeight,
        lineHeight: config.lineHeight,
        textFill: linkedToSpell ? config.textFill : themedText,
        textStroke: config.textStroke,
        textStrokeWidth: config.textStrokeWidth,
        maxViewScale: config.maxViewScale,
        zIndex: config.conditionZIndex,
        sortKey: linkedToSpell
          ? `${spellContext.sortPrefix}|1|${key}`
          : `${spellEffect ? "-1" : "1"}|${key}`,
        offsetY: 0,
      };
      const declaredSummaryParts = Array.isArray(condition?.summaryParts)
        ? condition.summaryParts
          .map((part, index) => ({
            id: String(part?.id || `part-${index + 1}`).trim(),
            label: String(part?.label || "").trim(),
            ...(part?.stack === true ? { stack: true } : {}),
          }))
          .filter((part) => part.id && part.label)
        : [];
      const summaryParts = showEffectSummaryParts === false
        ? []
        : declaredSummaryParts;

      // Solo una riga spell-effect collegata ha già la pill parent sopra.
      // Nel layout esteso una condition canonica parent-linked, come
      // Trattenuto, resta visibile insieme alle proprie mini pill; la
      // proiezione compatta le sostituisce più avanti con il marker aggregato.
      const hideBaseRow = spellEffect && linkedToSpell && declaredSummaryParts.length > 0;
      if (!hideBaseRow) appendRow(token.id, baseRow);
      for (const [partIndex, part] of summaryParts.entries()) {
        const summaryKey = `${key}:summary:${part.id}`;
        appendRow(token.id, {
          ...baseRow,
          identity: `condition|${token.id}|${summaryKey}`,
          key: summaryKey,
          text: part.label,
          width: summaryPartWidth(part.label, measureText, config),
          height: config.summaryPartLabelHeight,
          fontSize: config.summaryPartFontSize,
          summaryPart: true,
          summaryParentKey: key,
          summaryPartId: part.id,
          ...(part.stack === true ? { stack: true } : {}),
          sortKey: `${baseRow.sortKey}|summary|${String(partIndex).padStart(3, "0")}`,
        });
      }
    }
  }

  for (const [targetId, sourceRows] of rowsByTarget) {
    const target = tokenById.get(targetId);
    if (!target) continue;
    const expandedTarget = expandAll
      || (expansionMode === "selected" && expandedIds.has(targetId));
    const compactTarget = compact && !expandedTarget;
    const rows = compactTarget
      ? compactRowsForTarget(sourceRows, { measureText, config })
      : sourceRows;
    const box = visualTokenBox(target, sceneDpi);
    const baseY = compactTarget
      ? box.top + box.height * config.compactStackTopInset
      : box.top + box.diameter * config.stackTopInset;
    const stackSpineX = Math.round(box.left + box.width * config.labelOffsetX);
    let centerY = baseY;
    let previousStackHeight = 0;
    const layoutRows = [...rows];
    layoutRows.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    const rowGroups = layoutRowGroups(layoutRows, config);
    // La dorsale è identica in entrambe le modalità: le pill si sviluppano
    // nella casella adiacente e non cambiano ancoraggio quando si espandono.

    for (let groupIndex = 0; groupIndex < rowGroups.length; groupIndex += 1) {
      const group = rowGroups[groupIndex];
      const groupHeights = group.map((row) =>
        Math.ceil(row.height * config.stackClearanceScale)
      );
      const stackHeight = Math.max(...groupHeights, 0);
      centerY = groupIndex === 0
        ? baseY + stackHeight / 2
        : centerY + previousStackHeight / 2 + config.stackGap + stackHeight / 2;
      let columnX = stackSpineX;
      for (let columnIndex = 0; columnIndex < group.length; columnIndex += 1) {
        const row = group[columnIndex];
        desired.push({
          ...row,
          x: columnX,
          y: Math.round(centerY + row.offsetY),
        });
        columnX += Number(row.width) || 0;
        if (columnIndex < group.length - 1) {
          columnX += Number(config.summaryPartGap) || config.stackGap;
        }
      }
      previousStackHeight = stackHeight;
    }
  }

  const uniqueDesired = new Map();
  for (const entry of desired) uniqueDesired.set(entry.identity, entry);
  return [...uniqueDesired.values()]
    .sort((left, right) => left.identity.localeCompare(right.identity));
}

export function planEffectsWidgetDiff({ desired = [], existing = [], needsUpdate } = {}) {
  const desiredByIdentity = new Map(desired.map((entry) => [entry.identity, entry]));
  const existingByIdentity = new Map();
  const deleteIds = new Set();

  for (const entry of existing) {
    if (!entry?.item?.id || !entry.valid || !entry.identity) {
      if (entry?.item?.id) deleteIds.add(entry.item.id);
      continue;
    }
    if (!existingByIdentity.has(entry.identity)) existingByIdentity.set(entry.identity, []);
    existingByIdentity.get(entry.identity).push(entry.item);
  }

  const additions = [];
  const updates = [];
  for (const [identity, spec] of desiredByIdentity) {
    const matches = (existingByIdentity.get(identity) || [])
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const keeper = matches.shift();
    for (const duplicate of matches) deleteIds.add(duplicate.id);
    if (!keeper) additions.push(spec);
    else if (typeof needsUpdate === "function" && needsUpdate(keeper, spec)) {
      updates.push({ item: keeper, spec });
    }
    existingByIdentity.delete(identity);
  }

  for (const matches of existingByIdentity.values()) {
    for (const item of matches) deleteIds.add(item.id);
  }

  return {
    additions,
    updates,
    deleteIds: [...deleteIds].sort(),
  };
}

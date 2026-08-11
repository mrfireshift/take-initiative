import { ID } from "./constants.js";

export const SPELL_BOARD_TOKEN_META_KEY = `${ID}/spellBoardToken`;
const META_KEY = `${ID}/meta`;

const freezeAction = (action) => Object.freeze({
  ...action,
  ...(action.entityAction ? { entityAction: Object.freeze({ ...action.entityAction }) } : {}),
});

const weaponReference = ({ id, label, detail }) => freezeAction({
  id,
  label,
  buttonLabel: label,
  detail,
  actionEconomy: "bonus",
  subjectMode: "none",
  displayOnly: true,
  effects: Object.freeze([]),
});

const handMode = ({ id, label, mode, detail }) => freezeAction({
  id,
  label,
  buttonLabel: label,
  detail,
  actionEconomy: "bonus",
  subjectMode: "selected",
  maxTargets: 1,
  countLabelSingular: "bersaglio",
  countLabelPlural: "bersagli",
  emptySelectionTitle: "Seleziona la creatura o il token interessato dalla modalità della mano.",
  tooManySelectionTitle: "Mano arcana può interessare un solo bersaglio per comando.",
  entityAction: Object.freeze({ type: "set-mode", mode }),
  effects: Object.freeze([]),
});

export const SPELL_BOARD_TOKEN_RULES = Object.freeze({
  "spiritual-weapon": Object.freeze({
    spellId: "spiritual-weapon",
    label: "Arma spirituale",
    assetPath: "/spell-token-spiritual-weapon.svg",
    creationRangeMeters: 18,
    movementMeters: 6,
    reachMeters: 1.5,
    concentration: false,
    actions: Object.freeze([weaponReference({
      id: "spiritual-weapon-attack",
      label: "Attacco · 1d8 + mod",
      detail: "Azione bonus: muovi la pedina fino a 6 m e attacca una creatura entro 1,5 m. +1d8 ogni due livelli di slot sopra il 2°.",
    })]),
  }),
  "arcane-sword": Object.freeze({
    spellId: "arcane-sword",
    label: "Spada arcana",
    assetPath: "/spell-token-arcane-sword.svg",
    creationRangeMeters: 18,
    movementMeters: 6,
    reachMeters: 1.5,
    concentration: true,
    actions: Object.freeze([weaponReference({
      id: "arcane-sword-attack",
      label: "Attacco · 3d10 forza",
      detail: "Azione bonus: muovi la pedina fino a 6 m e ripeti l'attacco contro un bersaglio entro 1,5 m.",
    })]),
  }),
  "tasha-lama-del-disastro": Object.freeze({
    spellId: "tasha-lama-del-disastro",
    label: "Lama del Disastro",
    assetPath: "/spell-token-blade-of-disaster.svg",
    creationRangeMeters: 18,
    movementMeters: 9,
    reachMeters: 1.5,
    concentration: true,
    ignoresBarriers: true,
    actions: Object.freeze([weaponReference({
      id: "blade-of-disaster-attacks",
      label: "Fino a 2 attacchi · 4d12",
      detail: "Azione bonus: muovi la pedina fino a 9 m e compi fino a due attacchi entro 1,5 m. Critico con 18-20: 12d12 forza. La lama attraversa le barriere.",
    })]),
  }),
  "arcane-hand": Object.freeze({
    spellId: "arcane-hand",
    label: "Mano arcana",
    assetPath: "/spell-token-arcane-hand.svg",
    sizeCategory: "Large",
    spaceCells: 2,
    fillsSpace: false,
    creationRangeMeters: 36,
    movementMeters: 18,
    reachMeters: 1.5,
    concentration: true,
    armorClass: 20,
    strength: 26,
    dexterity: 10,
    hasHitPoints: true,
    actions: Object.freeze([
      handMode({
        id: "arcane-hand-interposing",
        label: "Mano interposta",
        mode: "interposing",
        detail: "Fornisce mezza copertura contro il bersaglio scelto e ne ostacola il movimento verso il caster.",
      }),
      handMode({
        id: "arcane-hand-forceful",
        label: "Mano possente",
        mode: "forceful",
        detail: "Risolvi al tavolo la prova contrapposta di Forza e l'eventuale spinta; la mano resta entro 1,5 m dal bersaglio.",
      }),
      handMode({
        id: "arcane-hand-grasping",
        label: "Afferra / stritola",
        mode: "grasping",
        detail: "Afferra una creatura Enorme o inferiore; nei turni successivi può infliggere 2d6 + modificatore contundenti, con scaling dello slot.",
      }),
      handMode({
        id: "arcane-hand-clenched",
        label: "Pugno · 4d8 forza",
        mode: "clenched",
        detail: "Attacco in mischia con incantesimo entro 1,5 m. +2d8 per ogni slot sopra il 5°.",
      }),
    ]),
  }),
});

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const normalizedId = (value) => String(value || "").trim();

function maximumHitPoints(rule, casterHpMax) {
  if (!rule?.hasHitPoints) return null;
  const value = Number(casterHpMax);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

export function getSpellBoardTokenRule(spellOrId) {
  const id = normalizedId(typeof spellOrId === "object" ? spellOrId?.id : spellOrId);
  return SPELL_BOARD_TOKEN_RULES[id] || null;
}

export function spellBoardTokenDisplayName(spellOrId, casterName = "") {
  const rule = getSpellBoardTokenRule(spellOrId);
  if (!rule) return "";
  return `${rule.label}-${normalizedId(casterName) || "Caster"}`;
}

export function getSpellBoardTokenPlacementRule(spellOrId) {
  const rule = getSpellBoardTokenRule(spellOrId);
  if (!rule) return null;
  return Object.freeze({
    id: `${rule.spellId}:board-token`,
    spellId: rule.spellId,
    trigger: Object.freeze({ type: "cast" }),
    kind: "board-token",
    geometry: Object.freeze({
      shape: "square",
      size: Object.freeze({ value: 1.5, unit: "m", measure: "side" }),
    }),
    placement: Object.freeze({
      origin: "point",
      direction: "none",
      anchor: "world",
      range: Object.freeze({
        value: rule.creationRangeMeters,
        unit: "m",
        measure: "range",
      }),
    }),
    targeting: Object.freeze({
      filter: "all",
      includeCaster: false,
      confirmTargets: false,
    }),
    boardToken: rule,
  });
}

export function getSpellBoardTokenPlacementRuleById(ruleId) {
  const normalizedRuleId = normalizedId(ruleId);
  if (!normalizedRuleId.endsWith(":board-token")) return null;
  return getSpellBoardTokenPlacementRule(
    normalizedRuleId.slice(0, -":board-token".length),
  );
}

export function spellBoardTokenPlacementPosition(preview) {
  const value = preview?.position || preview?.start;
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function createSpellBoardTokenId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `spell-board-token:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function spellBoardTokenCanonicalMetadata({ spellId = "", casterHpMax = null } = {}) {
  const rule = getSpellBoardTokenRule(spellId);
  const maximumHp = maximumHitPoints(rule, casterHpMax);
  return maximumHp === null ? null : { hp: maximumHp, hpMax: maximumHp };
}

export function spellBoardTokenScale(spellOrId) {
  const rule = getSpellBoardTokenRule(spellOrId);
  const cells = Math.max(1, Math.floor(Number(rule?.spaceCells) || 1));
  return { x: cells, y: cells };
}

export function spellBoardTokenMetadata({
  spellId = "",
  instanceId = "",
  casterId = "",
  slotLevel = null,
  casterHpMax = null,
} = {}) {
  const rule = getSpellBoardTokenRule(spellId);
  const normalizedInstanceId = normalizedId(instanceId);
  const normalizedCasterId = normalizedId(casterId);
  if (!rule) throw new Error("spell-board-token-rule-required");
  if (!normalizedInstanceId) throw new Error("spell-board-token-instance-required");
  if (!normalizedCasterId) throw new Error("spell-board-token-caster-required");
  const maximumHp = maximumHitPoints(rule, casterHpMax);
  return {
    version: 1,
    kind: "spell-board-token",
    spellId: rule.spellId,
    instanceId: normalizedInstanceId,
    casterId: normalizedCasterId,
    slotLevel: Math.max(0, Math.floor(Number(slotLevel) || 0)),
    movementMeters: rule.movementMeters,
    reachMeters: rule.reachMeters,
    ...(rule.sizeCategory ? { sizeCategory: rule.sizeCategory } : {}),
    ...(rule.spaceCells ? { spaceCells: rule.spaceCells } : {}),
    ...(rule.fillsSpace !== undefined ? { fillsSpace: rule.fillsSpace } : {}),
    state: {
      revision: 0,
      ...(maximumHp ? { hp: maximumHp, hpMax: maximumHp } : {}),
      ...(rule.spellId === "arcane-hand" ? { mode: "", targetIds: [] } : {}),
    },
  };
}

export function spellBoardTokenItems(items = [], {
  instanceId = "",
  casterId = "",
} = {}) {
  const wantedInstanceId = normalizedId(instanceId);
  const wantedCasterId = normalizedId(casterId);
  return (Array.isArray(items) ? items : []).filter((item) => {
    const metadata = item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
    if (metadata?.kind !== "spell-board-token" || !metadata?.instanceId) return false;
    if (wantedInstanceId && normalizedId(metadata.instanceId) !== wantedInstanceId) return false;
    if (wantedCasterId && normalizedId(metadata.casterId) !== wantedCasterId) return false;
    return true;
  });
}

function activeInstanceSets(plan) {
  const before = new Set();
  const after = new Set();
  for (const change of Array.isArray(plan?.changes) ? plan.changes : []) {
    for (const spell of Array.isArray(change?.before?.spells) ? change.before.spells : []) {
      const instanceId = normalizedId(spell?.instanceId);
      if (instanceId) before.add(instanceId);
    }
    for (const spell of Array.isArray(change?.after?.spells) ? change.after.spells : []) {
      const instanceId = normalizedId(spell?.instanceId);
      if (instanceId) after.add(instanceId);
    }
    for (const value of Object.values(change?.before?.concentrations || {})) {
      const instanceId = normalizedId(value?.instanceId);
      if (instanceId) before.add(instanceId);
    }
    for (const value of Object.values(change?.after?.concentrations || {})) {
      const instanceId = normalizedId(value?.instanceId);
      if (instanceId) after.add(instanceId);
    }
  }
  return { before, after };
}

export function spellBoardTokenItemsEndedByPlan(items = [], plan = null) {
  const active = activeInstanceSets(plan);
  return spellBoardTokenItems(items).filter((item) => {
    const instanceId = normalizedId(
      item.metadata[SPELL_BOARD_TOKEN_META_KEY]?.instanceId,
    );
    return active.before.has(instanceId) && !active.after.has(instanceId);
  });
}

export function spellBoardTokenView(item) {
  const metadata = item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  const rule = getSpellBoardTokenRule(metadata?.spellId);
  if (!item?.id || !metadata || !rule) return null;
  const canonicalMetadata = item?.metadata?.[META_KEY] || {};
  const state = {
    ...clone(metadata.state || {}),
    ...(rule.hasHitPoints && Object.prototype.hasOwnProperty.call(canonicalMetadata, "hp")
      ? { hp: canonicalMetadata.hp }
      : {}),
    ...(rule.hasHitPoints && Object.prototype.hasOwnProperty.call(canonicalMetadata, "hpMax")
      ? { hpMax: canonicalMetadata.hpMax }
      : {}),
  };
  const modeLabel = (rule.actions || []).find(
    (action) => normalizedId(action?.entityAction?.mode) === normalizedId(state.mode),
  )?.label || "";
  return {
    itemId: item.id,
    instanceId: normalizedId(metadata.instanceId),
    casterId: normalizedId(metadata.casterId),
    spellId: rule.spellId,
    label: rule.label,
    movementMeters: rule.movementMeters,
    reachMeters: rule.reachMeters,
    creationRangeMeters: rule.creationRangeMeters,
    sizeCategory: rule.sizeCategory || null,
    spaceCells: Math.max(1, Math.floor(Number(rule.spaceCells) || 1)),
    fillsSpace: rule.fillsSpace !== false,
    armorClass: rule.armorClass || null,
    strength: rule.strength || null,
    dexterity: rule.dexterity ?? null,
    ignoresBarriers: rule.ignoresBarriers === true,
    state,
    modeLabel,
  };
}

export function planSpellBoardTokenStateUpdate({
  item = null,
  instanceId = "",
  action = null,
  hp = undefined,
  targetIds = [],
} = {}) {
  const metadata = item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  const rule = getSpellBoardTokenRule(metadata?.spellId);
  const errors = [];
  if (!item?.id || !metadata || !rule) errors.push("spell-board-token-required");
  if (normalizedId(instanceId) !== normalizedId(metadata?.instanceId)) {
    errors.push("spell-board-token-instance-stale");
  }
  const canonicalMetadata = item?.metadata?.[META_KEY] || {};
  const current = {
    ...clone(metadata?.state || {}),
    ...(rule?.hasHitPoints && Object.prototype.hasOwnProperty.call(canonicalMetadata, "hp")
      ? { hp: canonicalMetadata.hp }
      : {}),
    ...(rule?.hasHitPoints && Object.prototype.hasOwnProperty.call(canonicalMetadata, "hpMax")
      ? { hpMax: canonicalMetadata.hpMax }
      : {}),
  };
  const next = clone(current);
  if (hp !== undefined) {
    const maximum = Math.max(0, Math.floor(Number(current.hpMax) || 0));
    const requested = Math.floor(Number(hp));
    if (!rule.hasHitPoints || !maximum) errors.push("spell-board-token-hp-unavailable");
    else if (!Number.isFinite(requested) || requested < 0 || requested > maximum) {
      errors.push("spell-board-token-hp-invalid");
    } else next.hp = requested;
  }
  if (action) {
    const actionType = normalizedId(action.type);
    if (actionType !== "set-mode") errors.push("spell-board-token-action-invalid");
    const allowedModes = new Set(
      (rule.actions || []).map((entry) => normalizedId(entry?.entityAction?.mode)).filter(Boolean),
    );
    const mode = normalizedId(action.mode);
    if (!allowedModes.has(mode)) errors.push("spell-board-token-mode-invalid");
    else {
      next.mode = mode;
      next.targetIds = Array.from(new Set(
        (Array.isArray(targetIds) ? targetIds : [])
          .map(normalizedId)
          .filter(Boolean),
      ));
      next.lastActionId = normalizedId(action.actionId) || mode;
    }
  }
  if (errors.length) return { valid: false, errors, before: current, after: null };
  next.revision = Math.max(0, Math.floor(Number(current.revision) || 0)) + 1;
  return {
    valid: true,
    errors: [],
    before: current,
    after: next,
    metadata: { ...clone(metadata), state: next },
  };
}

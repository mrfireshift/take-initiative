import { ID } from "../src/constants.js";
import { CLASS_FEATURE_CATALOG } from "../src/classFeatureCatalog.js";
import { normalizeCustomAura } from "../src/customAuraCore.js";
import { staticSpellZoneMetadata } from "../src/spellStaticZoneCore.js";

export const PERFORMANCE_SCENARIO_DEFAULTS = Object.freeze({
  tokens: 40,
  zones: 10,
  effects: 100,
  movements: 100,
  hpChanges: 100,
  advanceTurns: 30,
});

export const PERFORMANCE_META_KEY = `${ID}/meta`;
export const PERFORMANCE_STATE_KEY = `${ID}/state`;
export const PERFORMANCE_SPELLS_KEY = `${ID}/spells`;
export const PERFORMANCE_CONCENTRATION_KEY = `${ID}/concentration`;
export const PERFORMANCE_STATIC_ZONE_KEY = `${ID}/spellStaticZone`;
export const PERFORMANCE_SPELL_AURA_KEY = `${ID}/spellAura`;
export const PERFORMANCE_CLASS_AURA_KEY = `${ID}/classFeatureAura`;
export const PERFORMANCE_CUSTOM_AURA_KEY = `${ID}/customAura`;

const TWILIGHT_FEATURE_ID = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";

function hashSeed(seed) {
  let value = 2166136261;
  for (const character of String(seed ?? "take-initiative-perf")) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 3266489917) >>> 0;
    state ^= state >>> 13;
    return (state >>> 0) / 0x100000000;
  };
}

function clone(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function tokenId(index) {
  return `token-${String(index + 1).padStart(2, "0")}`;
}

function zoneId(index) {
  return `zone-${String(index + 1).padStart(2, "0")}`;
}

function actorId(sceneMarker, index) {
  return `actor_${sceneMarker.toLowerCase()}_${String(index + 1).padStart(2, "0")}`;
}

function tokenPosition(index, random) {
  const column = index % 10;
  const row = Math.floor(index / 10);
  return {
    x: column * 2 + Math.round(random() * 0.4 * 100) / 100,
    y: row * 2 + Math.round(random() * 0.4 * 100) / 100,
  };
}

function effectRecord(index, targetId, sourceId, sceneMarker) {
  const instanceId = `effect-instance-${sceneMarker.toLowerCase()}-${String(index + 1).padStart(3, "0")}`;
  return {
    id: `effect-${sceneMarker.toLowerCase()}-${String(index + 1).padStart(3, "0")}`,
    instanceId,
    condition: index % 3 === 0 ? "Blessed" : index % 3 === 1 ? "Rallentato" : "Protetto",
    active: true,
    sourceId,
    targetId,
    parentEffectId: `projection-${sceneMarker.toLowerCase()}-${String((index % 10) + 1).padStart(2, "0")}`,
    duration: { mode: index % 2 ? "rounds" : "turn-boundary", rounds: 2 + (index % 4) },
    expiry: { mode: index % 2 ? "rounds" : "turn-boundary", round: 2 + (index % 4) },
    owner: {
      domain: "effects",
      ownerRealm: "background-gm",
      scene: sceneMarker,
    },
  };
}

function createToken(index, sceneMarker, random, effectsByToken, tokenCount) {
  const id = tokenId(index);
  const hpMax = 80 + (index % 9) * 5;
  const hp = hpMax - (index % 7) * 3;
  const attitude = index % 5 === 0 ? "enemy" : index % 3 === 0 ? "ally" : "pc";
  const meta = {
    actorProfileId: actorId(sceneMarker, index),
    hp,
    hpMax,
    initiative: 20 - (index % 12),
    inInitiative: true,
    attitude,
    visibility: index % 4 === 0 ? "gm" : "all",
    conditions: { instances: effectsByToken[index] || [] },
    [PERFORMANCE_SPELLS_KEY]: [],
    [PERFORMANCE_CONCENTRATION_KEY]: {},
    customAuras: [],
    performanceFixture: {
      scene: sceneMarker,
      tokenIndex: index,
      tracked: true,
      tokenCount,
    },
  };

  if (index < 2) {
    const instanceId = `mobile-aura-${sceneMarker.toLowerCase()}-${index + 1}`;
    const spell = {
      spellId: "spirit-guardians",
      instanceId,
      casterId: id,
      name: "Guardiani Spirituali",
      concentration: true,
      duration: { mode: "rounds", rounds: 10 },
      castContext: { mobileAura: true },
    };
    meta[PERFORMANCE_SPELLS_KEY].push(spell);
    meta[PERFORMANCE_CONCENTRATION_KEY][instanceId] = {
      instanceId,
      spellId: spell.spellId,
      name: spell.name,
      startedRound: 1,
    };
  }

  if (index >= 2 && index < 4) {
    meta.classFeatureState = {
      instances: [{
        instanceId: `class-aura-${sceneMarker.toLowerCase()}-${index - 1}`,
        featureId: TWILIGHT_FEATURE_ID,
        sourceId: id,
        targetIds: [id],
        suppressedTargetIds: [],
        startedRound: 1,
        expiresRound: 10,
      }],
    };
  }

  if (index >= 4 && index < 7) {
    meta.customAuras = [normalizeCustomAura({
      id: `custom-aura-${sceneMarker.toLowerCase()}-${index - 3}`,
      enabled: true,
      name: "Aura sintetica",
      radiusMeters: 6,
      targeting: {
        filter: index % 2 ? "friendly" : "all",
        includeSource: index % 2 === 0,
      },
      pill: {
        enabled: true,
        label: "Vantaggio sintetico",
        detail: "Projection di performance",
        kind: index % 2 ? "buff" : "debuff",
      },
    })];
  }

  return {
    id,
    type: "IMAGE",
    layer: "CHARACTER",
    name: `Creature ${String(index + 1).padStart(2, "0")}`,
    position: tokenPosition(index, random),
    rotation: 0,
    scale: { x: 1, y: 1 },
    width: index % 4 === 0 ? 2 : 1,
    height: index % 4 === 0 ? 2 : 1,
    visible: true,
    locked: false,
    zIndex: 100 + index,
    image: { url: `https://example.invalid/perf-token-${index + 1}.png`, width: 256, height: 256 },
    metadata: { [PERFORMANCE_META_KEY]: meta },
  };
}

function createZone(index, sceneMarker) {
  const id = zoneId(index);
  const position = {
    x: 3 + (index % 5) * 4,
    y: 3 + Math.floor(index / 5) * 4,
  };
  const metadata = {
    performanceFixture: {
      scene: sceneMarker,
      zoneIndex: index,
      kind: index < 3
        ? "static-zone"
        : index < 5
          ? "spell-aura"
          : index < 7
            ? "class-feature-aura"
            : "custom-aura",
    },
  };
  if (index < 3) {
    metadata[PERFORMANCE_STATIC_ZONE_KEY] = staticSpellZoneMetadata({
      instanceId: `static-zone-${sceneMarker.toLowerCase()}-${index + 1}`,
      ruleId: "spirit-guardians-zone",
      spellId: "spirit-guardians",
      casterId: tokenId(index),
      role: "root",
      targetIds: [tokenId(index)],
      zoneOrigin: position,
    });
  } else if (index < 5) {
    metadata[PERFORMANCE_SPELL_AURA_KEY] = {
      instanceId: `spell-aura-visual-${sceneMarker.toLowerCase()}-${index - 2}`,
      sourceId: tokenId(index - 3),
      owner: "spell-aura-controller",
    };
  } else if (index < 7) {
    metadata[PERFORMANCE_CLASS_AURA_KEY] = {
      instanceId: `class-aura-visual-${sceneMarker.toLowerCase()}-${index - 4}`,
      sourceId: tokenId(index - 3),
      owner: "class-feature-aura-controller",
    };
  } else {
    metadata[PERFORMANCE_CUSTOM_AURA_KEY] = {
      instanceId: `custom-aura-visual-${sceneMarker.toLowerCase()}-${index - 6}`,
      sourceId: tokenId(index - 3),
      owner: "custom-aura-controller",
    };
  }
  return {
    id,
    type: "SHAPE",
    layer: "FOREGROUND",
    name: `Area ${String(index + 1).padStart(2, "0")}`,
    position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    width: 6,
    height: 6,
    visible: true,
    locked: true,
    zIndex: 10 + index,
    shape: { width: 6, height: 6 },
    metadata,
  };
}

function createScene(sceneMarker, config, seed) {
  const random = seededRandom(`${seed}:${sceneMarker}`);
  const effectsByToken = Array.from({ length: config.tokens }, () => []);
  const tokenIds = Array.from({ length: config.tokens }, (_, index) => tokenId(index));
  for (let index = 0; index < config.effects; index += 1) {
    const targetIndex = index % config.tokens;
    const targetId = tokenId(targetIndex);
    const sourceId = tokenId((targetIndex + 1 + (index % 7)) % config.tokens);
    effectsByToken[targetIndex].push(effectRecord(index, targetId, sourceId, sceneMarker));
  }
  const tokens = Array.from({ length: config.tokens }, (_, index) => (
    createToken(index, sceneMarker, random, effectsByToken, config.tokens)
  ));
  const zones = Array.from({ length: config.zones }, (_, index) => createZone(index, sceneMarker));
  const order = tokenIds.slice();
  const state = {
    order,
    current: 0,
    round: 1,
    collapsed: Object.fromEntries(order.map((id) => [id, false])),
    paragonInits: {
      [`paragon-${sceneMarker.toLowerCase()}`]: {
        initiative: 30,
        source: "performance-fixture",
      },
    },
  };
  return {
    id: `scene-${sceneMarker.toLowerCase()}`,
    identity: `performance-scene-${sceneMarker}`,
    ready: true,
    metadata: {
      [PERFORMANCE_STATE_KEY]: state,
      performanceFixture: {
        scene: sceneMarker,
        tokenCount: tokens.length,
        zoneCount: zones.length,
        effectCount: config.effects,
      },
    },
    items: [...tokens, ...zones],
  };
}

export function createPerformanceFixture({
  seed = "take-initiative-step-6",
  config = PERFORMANCE_SCENARIO_DEFAULTS,
} = {}) {
  const normalized = {
    ...PERFORMANCE_SCENARIO_DEFAULTS,
    ...(config || {}),
  };
  const sceneA = createScene("A", normalized, seed);
  const sceneB = createScene("B", normalized, seed);
  const tokenIds = Array.from({ length: normalized.tokens }, (_, index) => tokenId(index));
  const zoneIds = Array.from({ length: normalized.zones }, (_, index) => zoneId(index));
  const effectsA = sceneA.items
    .flatMap((item) => item.metadata?.[PERFORMANCE_META_KEY]?.conditions?.instances || []);
  const effectsB = sceneB.items
    .flatMap((item) => item.metadata?.[PERFORMANCE_META_KEY]?.conditions?.instances || []);
  return {
    seed: String(seed),
    config: normalized,
    scenes: [sceneA, sceneB],
    tokenIds,
    zoneIds,
    effectIds: effectsA.map((effect) => effect.id),
    expected: {
      sceneA: {
        identity: sceneA.identity,
        tokenIds: tokenIds.slice(),
        zoneIds: zoneIds.slice(),
        effectIds: effectsA.map((effect) => effect.id),
        initialState: clone(sceneA.metadata[PERFORMANCE_STATE_KEY]),
        initialHp: Object.fromEntries(sceneA.items
          .filter((item) => item.layer === "CHARACTER")
          .map((item) => [item.id, item.metadata[PERFORMANCE_META_KEY].hp])),
      },
      sceneB: {
        identity: sceneB.identity,
        tokenIds: tokenIds.slice(),
        zoneIds: zoneIds.slice(),
        effectIds: effectsB.map((effect) => effect.id),
        initialState: clone(sceneB.metadata[PERFORMANCE_STATE_KEY]),
        initialHp: Object.fromEntries(sceneB.items
          .filter((item) => item.layer === "CHARACTER")
          .map((item) => [item.id, item.metadata[PERFORMANCE_META_KEY].hp])),
      },
    },
    productiveFixtureInputs: {
      classFeatureId: TWILIGHT_FEATURE_ID,
      classFeatureAvailable: CLASS_FEATURE_CATALOG.features.some((feature) => feature.id === TWILIGHT_FEATURE_ID),
      customAuraNormalizer: "normalizeCustomAura",
      staticZoneBuilder: "staticSpellZoneMetadata",
    },
  };
}

export function countPerformanceFixture(fixture) {
  const scene = fixture?.scenes?.[0];
  const tokens = scene?.items?.filter((item) => item.layer === "CHARACTER") || [];
  const zones = scene?.items?.filter((item) => item.metadata?.performanceFixture?.kind) || [];
  const effects = tokens.flatMap((item) => item.metadata?.[PERFORMANCE_META_KEY]?.conditions?.instances || []);
  return {
    tokens: tokens.length,
    zones: zones.length,
    effects: effects.length,
  };
}


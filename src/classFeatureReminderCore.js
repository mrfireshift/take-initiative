import { ID } from "./constants.js";
import { getEnabledClassFeatures } from "./classFeatureCatalog.js";
import {
  activeClassFeatureInstances,
  CLASS_FEATURE_STATE_FIELD,
} from "./classFeatureCore.js";

const META_KEY = `${ID}/meta`;

export const RELENTLESS_RAGE_FEATURE_ID = "barbaro-ira-implacabile";
export const RAGE_FEATURE_ID = "barbaro-ira";

function itemMeta(item) {
  return item?.metadata?.[META_KEY] || {};
}

function initiativeCardProfile(item) {
  const profile = itemMeta(item).initiativeCard;
  return profile && typeof profile === "object" ? profile : {};
}

function hpValue(item) {
  const value = Number(itemMeta(item).hp);
  return Number.isFinite(value) ? value : null;
}

function portraitUrl(item) {
  return String(
    item?.image?.url
      || item?.image?.src
      || item?.image?.href
      || item?.data?.src
      || "",
  ).trim().slice(0, 2048);
}

export function isZeroHPTransition(beforeItem, afterItem) {
  const beforeHP = hpValue(beforeItem);
  const afterHP = hpValue(afterItem);
  return beforeHP !== null && beforeHP > 0
    && afterHP !== null && afterHP <= 0;
}

export function relentlessRageIsEnabled(item) {
  const enabled = getEnabledClassFeatures(initiativeCardProfile(item));
  return enabled.some((feature) => feature.id === RELENTLESS_RAGE_FEATURE_ID);
}

export function rageIsActive(item, currentRound = null) {
  const state = itemMeta(item)[CLASS_FEATURE_STATE_FIELD];
  return activeClassFeatureInstances(state, currentRound)
    .some((instance) => instance.featureId === RAGE_FEATURE_ID);
}

export function shouldAnnounceRelentlessRage({
  beforeItem,
  afterItem,
  currentRound = null,
} = {}) {
  return isZeroHPTransition(beforeItem, afterItem)
    && relentlessRageIsEnabled(afterItem)
    && rageIsActive(afterItem, currentRound);
}

export function relentlessRageNotice({
  item,
  activationId,
  turnKey = "",
} = {}) {
  const id = String(item?.id || "").trim();
  const noticeId = String(activationId || "").trim();
  if (!id || !noticeId) return null;
  const name = String(item?.name || "Token").trim() || "Token";
  return {
    activationId: noticeId,
    ...(String(turnKey || "").trim() ? { turnKey: String(turnKey).trim() } : {}),
    timing: "damage",
    effectName: "Ira Implacabile",
    saveLabel: "TS Costituzione CD 10",
    kind: "effect-reminder",
    eyebrow: "Ira Implacabile",
    instruction: "A 0 PF durante l'Ira: effettua un TS Costituzione CD 10. Se lo supera, resta a 1 PF; dopo ogni uso la CD aumenta di 5 e un riposo breve o lungo la riporta a 10.",
    target: {
      id,
      name: name.slice(0, 100),
      portrait: portraitUrl(item),
    },
  };
}

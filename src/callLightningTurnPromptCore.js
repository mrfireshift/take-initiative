import { ID } from "./constants.js";
import { getSpellDefinition } from "./spells-srd.js";
import {
  buildSpellActiveResolutionPayload,
  getSpellResolutionAction,
} from "./spellActiveResolutionCore.js";
import { spellOverviewGroups } from "./spellsPanelViewCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

export const CALL_LIGHTNING_TURN_PROMPT_ACTION_ID = "call-lightning-strike";
export const STORM_SPHERE_TURN_PROMPT_ACTION_ID = "storm-sphere-lightning";
export const WIND_INVESTITURE_TURN_PROMPT_ACTION_ID = "wind-investiture-gust";
export const FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID = "flame-investiture-line";
export const STONE_INVESTITURE_TURN_PROMPT_ACTION_ID = "stone-investiture-quake";
export const MAXIMILIAN_GRAB_TURN_PROMPT_ACTION_ID = "maximilian-earth-grasp-grab";
export const MAXIMILIAN_CRUSH_TURN_PROMPT_ACTION_ID = "maximilian-earth-grasp-crush";
export const EYEBITE_SAVED_TURN_PROMPT_ACTION_ID = "eyebite-saved";
export const EYEBITE_ASLEEP_TURN_PROMPT_ACTION_ID = "eyebite-asleep";
export const EYEBITE_PANICKED_TURN_PROMPT_ACTION_ID = "eyebite-panicked";
export const EYEBITE_SICKENED_TURN_PROMPT_ACTION_ID = "eyebite-sickened";
export const ENERVATION_TURN_PROMPT_ACTION_ID = "enervation-repeat";
export const CROWN_OF_STARS_TURN_PROMPT_ACTION_ID = "crown-of-stars-launch";
export const WALL_OF_LIGHT_TURN_PROMPT_ACTION_ID = "wall-of-light-beam";

const TURN_PROMPT_SPELLS = Object.freeze([
  Object.freeze({
    spellId: "call-lightning",
    actionId: CALL_LIGHTNING_TURN_PROMPT_ACTION_ID,
  }),
  Object.freeze({
    spellId: "xanathar-sfera-della-tempesta",
    actionId: STORM_SPHERE_TURN_PROMPT_ACTION_ID,
  }),
  Object.freeze({
    spellId: "xanathar-investitura-del-vento",
    actionId: WIND_INVESTITURE_TURN_PROMPT_ACTION_ID,
    ownerContext: "caster",
    availableAfterCast: true,
  }),
  Object.freeze({
    spellId: "xanathar-investitura-della-fiamma",
    actionId: FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID,
    ownerContext: "mobileAura",
    availableAfterCast: true,
  }),
  Object.freeze({
    spellId: "xanathar-investitura-della-pietra",
    actionId: STONE_INVESTITURE_TURN_PROMPT_ACTION_ID,
    ownerContext: "caster",
    availableAfterCast: true,
  }),
  Object.freeze({
    spellId: "xanathar-debilitazione",
    actionId: ENERVATION_TURN_PROMPT_ACTION_ID,
    ownerContext: "target",
    availableAfterCast: true,
  }),
  Object.freeze({
    spellId: "xanathar-corona-di-stelle",
    actionId: CROWN_OF_STARS_TURN_PROMPT_ACTION_ID,
    ownerContext: "caster",
    availableAfterCast: true,
    availableOnCastTurn: true,
  }),
  Object.freeze({
    spellId: "xanathar-muro-di-luce",
    actionId: WALL_OF_LIGHT_TURN_PROMPT_ACTION_ID,
    ownerContext: "caster",
    availableAfterCast: true,
  }),
  Object.freeze({
    spellId: "xanathar-stretta-della-terra-di-maximilian",
    actionIds: Object.freeze([
      MAXIMILIAN_GRAB_TURN_PROMPT_ACTION_ID,
      MAXIMILIAN_CRUSH_TURN_PROMPT_ACTION_ID,
    ]),
    ownerContext: "boardToken",
    availableAfterCast: true,
    choice: true,
  }),
  Object.freeze({
    spellId: "eyebite",
    actionIds: Object.freeze([
      EYEBITE_SAVED_TURN_PROMPT_ACTION_ID,
      EYEBITE_ASLEEP_TURN_PROMPT_ACTION_ID,
      EYEBITE_PANICKED_TURN_PROMPT_ACTION_ID,
      EYEBITE_SICKENED_TURN_PROMPT_ACTION_ID,
    ]),
    ownerContext: "caster",
    availableAfterCast: true,
    choice: true,
  }),
]);

function baseActorId(value) {
  return String(value || "").trim().replace(/::p\d+$/u, "");
}

export function spellTurnPromptSelectedCandidateId(request = null, selection = []) {
  if (request?.kind !== "choice") return "";
  const candidates = Array.isArray(request?.candidateTargets) ? request.candidateTargets : [];
  const exact = new Set(candidates.map((entry) => String(entry?.id || "").trim()).filter(Boolean));
  const byActor = new Map(
    candidates
      .map((entry) => [baseActorId(entry?.id), String(entry?.id || "").trim()])
      .filter(([actorId, itemId]) => actorId && itemId),
  );
  for (const value of Array.isArray(selection) ? selection : []) {
    const id = String(value || "").trim();
    if (exact.has(id)) return id;
    const mapped = byActor.get(baseActorId(id));
    if (mapped) return mapped;
  }
  return "";
}

function turnPromptOwnerInstanceIds(items, actorId, prompt, turnKey = "") {
  const ownerIds = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const spells = item?.metadata?.[META_KEY]?.[SPELLS_KEY];
    for (const spell of Array.isArray(spells) ? spells : []) {
      const instanceId = String(spell?.instanceId || "").trim();
      const casterId = baseActorId(spell?.casterId || item?.id);
      const ownsPrompt = prompt?.ownerContext === "mobileAura"
        ? spell?.castContext?.mobileAura === true
        : prompt?.ownerContext === "boardToken"
          ? spell?.castContext?.boardToken === true
          : prompt?.ownerContext === "caster"
            ? baseActorId(item?.id) === casterId
            : prompt?.ownerContext === "target"
              ? baseActorId(item?.id) !== casterId
              : spell?.castContext?.staticZoneOwner === true;
      const appliedTurnKey = String(spell?.appliedAt?.turnKey || "").trim();
      const castOnCurrentTurn = !!turnKey && !!appliedTurnKey && appliedTurnKey === turnKey;
      if (
        spell?.spellId === prompt?.spellId
        && ownsPrompt
        && instanceId
        && casterId === actorId
        && (!castOnCurrentTurn || prompt?.availableOnCastTurn === true)
      ) {
        ownerIds.add(instanceId);
      }
    }
  }
  return ownerIds;
}

function turnPromptZoneItemId(items, instanceId, casterId, prompt = null) {
  return (Array.isArray(items) ? items : []).find((item) => {
    if (prompt?.ownerContext === "boardToken") {
      const metadata = item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
      return metadata?.kind === "spell-board-token"
        && String(metadata.instanceId || "") === String(instanceId || "")
        && String(metadata.casterId || "") === String(casterId || "");
    }
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    return metadata?.role === "root"
      && String(metadata.instanceId || "") === String(instanceId || "")
      && String(metadata.casterId || "") === String(casterId || "");
  })?.id || "";
}

function promptActionIds(prompt) {
  if (Array.isArray(prompt?.actionIds)) return prompt.actionIds;
  return prompt?.actionId ? [prompt.actionId] : [];
}

function choiceCandidateTargets(items, group, actions) {
  const excludedEffectIds = new Set(
    (Array.isArray(actions) ? actions : [])
      .flatMap((action) => Array.isArray(action?.excludedTargetEffectIds)
        ? action.excludedTargetEffectIds
        : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const excludedItemIds = new Set(
    (Array.isArray(group?.effectInstances) ? group.effectInstances : [])
      .filter((effect) => excludedEffectIds.has(String(effect?.effectId || "").trim()))
      .map((effect) => String(effect?.itemId || "").trim())
      .filter(Boolean),
  );
  const casterId = baseActorId(group?.casterId);
  return (Array.isArray(items) ? items : [])
    .filter((item) => (
      item?.layer === "CHARACTER"
      && baseActorId(item?.id) !== casterId
      && !excludedItemIds.has(String(item?.id || "").trim())
    ))
    .map((item) => ({
      id: String(item.id || "").trim(),
      name: String(item.name || "").trim() || "Token",
    }))
    .filter((item) => item.id);
}

export function spellTurnPromptRequests({
  items = [],
  actorId = "",
  sceneEpoch = 0,
  turnKey = "",
} = {}) {
  const actor = baseActorId(actorId);
  if (!actor) return [];
  const normalizedTurnKey = String(turnKey || "").trim();
  const groups = spellOverviewGroups(items);
  const requests = [];
  for (const prompt of TURN_PROMPT_SPELLS) {
    const spell = getSpellDefinition(prompt.spellId);
    const actions = promptActionIds(prompt)
      .map((actionId) => getSpellResolutionAction(prompt.spellId, actionId))
      .filter(Boolean);
    const ownerInstanceIds = turnPromptOwnerInstanceIds(
      items,
      actor,
      prompt,
      normalizedTurnKey,
    );
    if (!spell || !actions.length || !ownerInstanceIds.size) continue;
    for (const group of groups.filter((candidate) => (
      candidate?.spellId === prompt.spellId
      && baseActorId(candidate?.casterId) === actor
      && ownerInstanceIds.has(String(candidate?.instanceId || "").trim())
    ))) {
      const zoneItemId = turnPromptZoneItemId(
        items,
        group?.instanceId,
        group?.casterId,
        prompt,
      );
      const payloads = actions.map((action) => buildSpellActiveResolutionPayload({
        spell,
        action,
        group,
        sceneEpoch,
        ...(zoneItemId ? { zoneItemId } : {}),
        ...(normalizedTurnKey ? { turnKey: normalizedTurnKey } : {}),
      }));
      if (prompt.choice === true && payloads.length > 1) {
        requests.push({
          kind: "choice",
          spellId: prompt.spellId,
          spellName: payloads[0]?.spellName || spell.displayName || spell.name,
          instanceId: String(group?.instanceId || "").trim(),
          casterId: String(group?.casterId || "").trim(),
          casterName: payloads[0]?.casterName || "",
          zoneItemId,
          turnKey: normalizedTurnKey,
          sceneEpoch,
          actions: payloads,
          ...(prompt.spellId === "eyebite"
            ? { candidateTargets: choiceCandidateTargets(items, group, actions) }
            : {}),
        });
      } else {
        requests.push(...payloads.map((payload) => ({ kind: "action", payload })));
      }
    }
  }
  return requests;
}

export function callLightningTurnPromptPayloads({
  items = [],
  actorId = "",
  sceneEpoch = 0,
  turnKey = "",
} = {}) {
  return spellTurnPromptRequests({ items, actorId, sceneEpoch, turnKey })
    .flatMap((request) => request.kind === "action"
      ? [request.payload]
      : Array.isArray(request.actions) ? request.actions : []);
}

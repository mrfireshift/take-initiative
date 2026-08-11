import { ID } from "./constants.js";
import { getSpellDefinition } from "./spells-srd.js";
import {
  buildSpellActiveResolutionPayload,
  getSpellResolutionAction,
} from "./spellActiveResolutionCore.js";
import { spellOverviewGroups } from "./spellsPanelViewCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

export const CALL_LIGHTNING_TURN_PROMPT_ACTION_ID = "call-lightning-strike";
export const STORM_SPHERE_TURN_PROMPT_ACTION_ID = "storm-sphere-lightning";
export const FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID = "flame-investiture-line";

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
    spellId: "xanathar-investitura-della-fiamma",
    actionId: FLAME_INVESTITURE_TURN_PROMPT_ACTION_ID,
    ownerContext: "mobileAura",
    availableAfterCast: true,
  }),
]);

function baseActorId(value) {
  return String(value || "").trim().replace(/::p\d+$/u, "");
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
        : spell?.castContext?.staticZoneOwner === true;
      if (
        spell?.spellId === prompt?.spellId
        && ownsPrompt
        && instanceId
        && casterId === actorId
        && !(
          prompt?.availableAfterCast === true
          && String(spell?.appliedAt?.turnKey || "").trim()
          && String(spell.appliedAt.turnKey).trim() === turnKey
        )
      ) {
        ownerIds.add(instanceId);
      }
    }
  }
  return ownerIds;
}

function turnPromptZoneItemId(items, instanceId, casterId) {
  return (Array.isArray(items) ? items : []).find((item) => {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    return metadata?.role === "root"
      && String(metadata.instanceId || "") === String(instanceId || "")
      && String(metadata.casterId || "") === String(casterId || "");
  })?.id || "";
}

export function callLightningTurnPromptPayloads({
  items = [],
  actorId = "",
  sceneEpoch = 0,
  turnKey = "",
} = {}) {
  const actor = baseActorId(actorId);
  if (!actor) return [];
  const normalizedTurnKey = String(turnKey || "").trim();
  const groups = spellOverviewGroups(items);
  const payloads = [];
  for (const prompt of TURN_PROMPT_SPELLS) {
    const spell = getSpellDefinition(prompt.spellId);
    const action = getSpellResolutionAction(prompt.spellId, prompt.actionId);
    const ownerInstanceIds = turnPromptOwnerInstanceIds(
      items,
      actor,
      prompt,
      normalizedTurnKey,
    );
    if (!spell || !action || !ownerInstanceIds.size) continue;
    payloads.push(...groups
      .filter((group) => (
        group?.spellId === prompt.spellId
        && baseActorId(group?.casterId) === actor
        && ownerInstanceIds.has(String(group?.instanceId || "").trim())
      ))
      .map((group) => buildSpellActiveResolutionPayload({
        spell,
        action,
        group,
        sceneEpoch,
        zoneItemId: turnPromptZoneItemId(
          items,
          group?.instanceId,
          group?.casterId,
        ),
        ...(normalizedTurnKey ? { turnKey: normalizedTurnKey } : {}),
      })));
  }
  return payloads;
}

import { getSpellDefinition } from "./spells-srd.js";

function record(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function realTokenId(value) {
  return nonempty(value) && !value.startsWith("__") && !/::p\d+$/.test(value);
}

export function normalizeMonsterActionContext(value, { casterId, spellId } = {}) {
  if (!record(value, ["actor", "cause", "referencedSpell", "spellcasting"])) return null;
  const actor = value.actor;
  const cause = value.cause;
  if (!record(actor, ["id", "tokenId", "name", "bossInstanceId"])
    || ![actor.id, actor.tokenId].every(realTokenId)
    || actor.id !== actor.tokenId
    || ![actor.name, actor.bossInstanceId].every(nonempty)) return null;
  const causeKeys = [
    "kind", "profileId", "profileRevision", "phaseId", "bossInstanceId",
    "actionId", "actionName", "actionInstanceId",
  ];
  if (!record(cause, causeKeys)
    || !causeKeys.every((key) => nonempty(cause[key]))
    || cause.kind !== "monster-action"
    || !/^[a-f\d]{64}$/i.test(cause.profileRevision)
    || cause.bossInstanceId !== actor.bossInstanceId
    || (casterId !== undefined && actor.id !== casterId)) return null;
  const result = { actor: { ...actor }, cause: { ...cause } };
  if (value.referencedSpell !== undefined) {
    const reference = value.referencedSpell;
    if (!record(reference, ["id", "name"]) || ![reference.id, reference.name].every(nonempty)) return null;
    const spell = getSpellDefinition(reference.id);
    if (!spell || spell.id !== reference.id || spell.name !== reference.name
      || (spellId !== undefined && spell.id !== spellId)) return null;
    result.referencedSpell = { ...reference };
  } else if (spellId !== undefined) return null;
  if (value.spellcasting !== undefined) {
    const spellcasting = value.spellcasting;
    if (!record(spellcasting, ["saveDC", "attackBonus"]) || !Object.keys(spellcasting).length
      || !Object.values(spellcasting).every(Number.isInteger)
      || (spellcasting.saveDC !== undefined && (spellcasting.saveDC < 0 || spellcasting.saveDC > 99))) return null;
    result.spellcasting = { ...spellcasting };
  }
  return result;
}

export function createMonsterActionContext({
  profile, binding, bossInstanceId, tokenId, actorName, action, actionInstanceId, spellId: chosenSpellId,
} = {}) {
  const execution = action?.execution || {};
  // A Spellcasting reference lists its spells (v8) or names Slow alone (v1-v7); the chosen one must be listed.
  const spellIds = execution.kind === "spell-reference"
    ? (Array.isArray(execution.spells) ? execution.spells.map((entry) => entry?.spellId) : [execution.spellId]) : [];
  const chosen = execution.kind === "spell-reference" ? chosenSpellId ?? spellIds[0] : undefined;
  if (execution.kind === "spell-reference" && !spellIds.includes(chosen)) return null;
  const spell = execution.kind === "spell-reference" ? getSpellDefinition(chosen) : null;
  if (execution.kind === "spell-reference" && !spell) return null;
  const spellcasting = {
    ...(execution.saveDC === undefined || execution.saveDC === null ? {} : { saveDC: execution.saveDC }),
    ...(execution.attackBonus === undefined || execution.attackBonus === null ? {} : { attackBonus: execution.attackBonus }),
  };
  if (binding && (
    binding.profileId !== profile?.profileId
    || binding.profileRevision !== profile?.profileRevision
    || binding.phaseId !== profile?.phaseId
    || (profile?.bossDefinitionId && binding.bossDefinitionId !== profile.bossDefinitionId)
  )) return null;
  return normalizeMonsterActionContext({
    actor: { id: tokenId, tokenId, name: actorName, bossInstanceId },
    cause: {
      kind: "monster-action", profileId: profile?.profileId,
      profileRevision: profile?.profileRevision, phaseId: profile?.phaseId,
      bossInstanceId, actionId: action?.id, actionName: action?.name, actionInstanceId,
    },
    ...(spell ? { referencedSpell: { id: spell.id, name: spell.name } } : {}),
    ...(Object.keys(spellcasting).length ? { spellcasting } : {}),
  });
}

export function applyMonsterActionContext(causality, context) {
  if (context === undefined || context === null) return causality;
  const spellId = causality?.cause?.spellId || causality?.spellId;
  const normalized = normalizeMonsterActionContext(context, {
    casterId: causality?.casterId || causality?.actor?.id,
    ...(spellId ? { spellId } : {}),
  });
  if (!normalized) throw new Error("monster-action-context-invalid");
  const spell = normalized.referencedSpell && getSpellDefinition(normalized.referencedSpell.id);
  return {
    ...causality,
    actor: normalized.actor,
    cause: normalized.cause,
    ...(spell ? {
      referencedSpell: {
        ...(causality?.cause || {}),
        id: spell.id, name: spell.name, displayName: spell.displayName || spell.name,
        level: spell.level, school: spell.school,
      },
    } : {}),
  };
}

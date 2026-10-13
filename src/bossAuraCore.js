// Boss trait auras (profile v11) as custom auras on the bound token. Pure data: no DOM, no SDK.
// A managed aura has a stable id per boss definition, phase and aura key; it is created when missing.
// On a rebind the mechanics follow the profile (who it affects, pills, reminders), while the GM keeps
// what the aura editor is for: radius, colours, name and whether the aura and each pill or reminder is on.
import { normalizeCustomAura, normalizeCustomAuras } from "./customAuraCore.js";

export const BOSS_AURA_ID_PREFIX = "boss-aura:";

// Palettes per aura key: frost for Auril's auras, void for Shothragoth's (as their area drawings).
const AURA_STYLES = Object.freeze({
  "aura-gelida": Object.freeze({ fillColor: "#38bdf8", strokeColor: "#e0f2fe", fillOpacity: 0.18, strokeWidth: 1.4 }),
  "primal-blizzard": Object.freeze({ fillColor: "#e2e8f0", strokeColor: "#f8fafc", fillOpacity: 0.12, strokeWidth: 1 }),
  "primal-blizzard-wind": Object.freeze({ fillColor: "#94a3b8", strokeColor: "#cbd5e1", fillOpacity: 0.05, strokeWidth: 0.6 }),
  // Shothragoth: the void palette of his area drawings.
  "presenza-incompatibile": Object.freeze({ fillColor: "#2e1065", strokeColor: "#c4b5fd", fillOpacity: 0.22, strokeWidth: 1.4 }),
});

export function bossAuraId(profile, key) {
  return `${BOSS_AURA_ID_PREFIX}${profile?.bossDefinitionId}:${profile?.phaseId}:${key}`;
}

export function isBossManagedAura(aura, bossDefinitionId = "") {
  const id = String(aura?.id || "");
  return id.startsWith(BOSS_AURA_ID_PREFIX) && (!bossDefinitionId || id.startsWith(`${BOSS_AURA_ID_PREFIX}${bossDefinitionId}:`));
}

// Every trait aura of the profile, in profile order, as a normalized custom aura.
export function bossProfileAuras(profile) {
  return (Array.isArray(profile?.abilities) ? profile.abilities : []).flatMap((ability) =>
    (Array.isArray(ability?.auras) ? ability.auras : []).map((aura) => normalizeCustomAura({
      id: bossAuraId(profile, aura.key),
      enabled: true,
      name: aura.name,
      radiusMeters: (aura.radiusFeet / 5) * 1.5,
      ...(AURA_STYLES[aura.key] ? { style: { ...AURA_STYLES[aura.key] } } : {}),
      // Every creature hostile to the boss (the boss's other tokens, the Titan, stay out), or the player
      // characters only when the profile says so (the Primal Blizzard push).
      targeting: { filter: aura.targets === "pc" ? "pc" : "hostile", includeSource: false },
      pills: aura.pills.map((pill) => ({ id: pill.key, enabled: true, label: pill.label, detail: pill.detail, kind: pill.kind })),
      reminders: aura.reminders.map((reminder) => ({
        id: reminder.key, enabled: true, event: reminder.event, label: reminder.label, resolution: reminder.resolution,
        ...(reminder.resolution === "manual-save" ? { ability: reminder.ability, dcMode: "fixed", dc: reminder.dc } : {}),
        ...(reminder.resolution === "concentration-save" ? { dcMode: "fixed", dc: reminder.dc } : {}),
        ...(reminder.damage ? { damage: { dice: reminder.damage.dice, type: reminder.damage.type } } : {}),
        // A failed save leaves a standard condition (Primal Blizzard: Prono), independent of the aura.
        ...(reminder.failureCondition ? { failureCondition: { condition: reminder.failureCondition } } : {}),
      })),
    })));
}

// The token's aura list with this profile's auras. Unrelated auras are kept untouched; managed auras of the
// same boss that this profile does not define (e.g. another phase on the same token) are removed.
// replace: true rewrites this profile's auras from the profile (the console's "Ripristina aure").
function withProfileMechanics(aura, wanted) {
  const keepSwitch = (current) => (entry) => {
    const existing = current.find((value) => value.id === entry.id);
    return existing ? { ...entry, enabled: existing.enabled } : entry;
  };
  const next = { ...aura, targeting: { ...wanted.targeting }, pills: wanted.pills.map(keepSwitch(aura.pills)),
    reminders: wanted.reminders.map(keepSwitch(aura.reminders)) };
  return JSON.stringify(next) === JSON.stringify(aura) ? aura : next;
}
export function mergeBossAuras(values = [], profile, { replace = false } = {}) {
  const current = normalizeCustomAuras(values);
  const wanted = bossProfileAuras(profile);
  const wantedIds = new Set(wanted.map((aura) => aura.id));
  const removed = current.filter((aura) => isBossManagedAura(aura, profile?.bossDefinitionId) && !wantedIds.has(aura.id));
  const kept = current.filter((aura) => !removed.includes(aura));
  const added = [], restored = [], updated = [];
  const next = kept.map((aura) => {
    if (!wantedIds.has(aura.id)) return aura;
    const definition = wanted.find((entry) => entry.id === aura.id);
    if (replace) {
      restored.push(aura.name);
      return definition;
    }
    const completed = withProfileMechanics(aura, definition);
    if (completed !== aura) updated.push(aura.name);
    return completed;
  });
  for (const aura of wanted) {
    if (next.some((entry) => entry.id === aura.id)) continue;
    next.push(aura);
    added.push(aura.name);
  }
  return { auras: next, added, restored, updated, removed: removed.map((aura) => aura.name),
    changed: JSON.stringify(next) !== JSON.stringify(current) };
}

export function removeBossAuras(values = [], bossDefinitionId = "") {
  const current = normalizeCustomAuras(values);
  const next = current.filter((aura) => !isBossManagedAura(aura, bossDefinitionId));
  return { auras: next, removed: current.filter((aura) => !next.includes(aura)).map((aura) => aura.name), changed: next.length !== current.length };
}

// What the console shows: each profile aura, whether it is on the token and enabled.
export function bossAuraStatus(values = [], profile) {
  const current = normalizeCustomAuras(values);
  return bossProfileAuras(profile).map((aura) => {
    const onToken = current.find((entry) => entry.id === aura.id);
    return { id: aura.id, name: aura.name, present: !!onToken, enabled: onToken?.enabled === true };
  });
}

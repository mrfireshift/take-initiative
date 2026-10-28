import { getSpellDefinition } from "./spells-srd.js";

// The actions of an active spell, from its pill on the tracker card (spell-pill-actions.js): the same overview and
// the same executor as the spell panel, one click for an action that asks nothing, its own popup for the others.
const text = (value) => String(value ?? "").trim();

// Whether the pill gets its ⚡: the spell has active actions (Mirror Image, Hunter's Mark, Call Lightning...).
export function spellPillHasActions(spell) {
  const definition = getSpellDefinition(text(spell?.spellId) || text(spell?.name));
  return Array.isArray(definition?.activeActions) && definition.activeActions.length > 0;
}

// The counter of the spell (castContext.uses): "2/3 duplicati".
export function spellPillCounterLabel(castContext) {
  const uses = castContext?.uses;
  const remaining = Math.floor(Number(uses?.remaining));
  const total = Math.floor(Number(uses?.total));
  if (!uses || !Number.isFinite(remaining) || remaining < 0) return "";
  return `${remaining}${Number.isFinite(total) && total > 0 ? `/${total}` : ""}${text(uses.label) ? ` ${text(uses.label)}` : ""}`;
}

// An action that needs creatures takes them from the map selection.
export function spellPillActionNeedsTargets(action) {
  return action?.requiresTargets === true || text(action?.subjectMode) === "selected";
}

// Whether one click runs it (lotto A on the pill, lotto B in the panel): nothing to choose in the panel first. A
// popup resolution (a heal, a save) counts, it asks its inputs in its own popup; creatures to select, a choice to
// make or a zone to move do not.
const PANEL_INPUT_RESOLUTION_KINDS = new Set(["zone-movement", "zone-direction"]);
export function spellActionRunsDirectly(action) {
  if (!action || spellPillActionNeedsTargets(action)) return false;
  if (PANEL_INPUT_RESOLUTION_KINDS.has(text(action.resolutionKind))) return false;
  if (action.choice && typeof action.choice === "object") return false;
  if (action.movement?.choice && typeof action.movement.choice === "object") return false;
  return true;
}

export function buildSpellPillActionsView(overview) {
  if (!overview) return null;
  const context = overview.context || {};
  const actions = (Array.isArray(overview.actions) ? overview.actions : [])
    .filter((action) => text(action?.id))
    .map((action) => ({
      id: text(action.id),
      label: text(action.buttonLabel || action.label) || "Azione",
      detail: text(action.detail),
      disabled: action.disabled === true || action.available === false,
      reason: text(action.disabledReason || action.unavailableReason),
      needsTargets: spellPillActionNeedsTargets(action),
      direct: spellActionRunsDirectly(action),
    }));
  return {
    title: text(overview.name || context.name || context.storedName) || "Incantesimo",
    casterName: text(context.casterName || overview.casterName),
    counter: spellPillCounterLabel(context.castContext),
    actions,
  };
}

// The reason a result came back without running, in the GM's words.
export function spellPillActionErrorText(result) {
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const first = errors.map((error) => (typeof error === "string" ? error : text(error?.message) || text(error?.code)))
    .find(Boolean);
  return first || "Azione non eseguita: riapri il menu.";
}

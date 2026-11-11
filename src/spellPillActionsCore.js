import { getSpellDefinition } from "./spells-srd.js";
import { spellPreparedResolutionInPanel } from "./spellCastPhaseCore.js";

// The actions of an active spell, from its pill on the tracker card (spell-pill-actions.js): the same overview and
// the same executor as the spell panel, one click for an action that asks nothing, its own popup for the others.
const text = (value) => String(value ?? "").trim();

// Whether the pill gets its ⚡: the spell has active actions (Mirror Image, Hunter's Mark, Call Lightning...).
export function spellPillHasActions(spell) {
  const definition = getSpellDefinition(text(spell?.spellId) || text(spell?.name));
  if (text(spell?.castContext?.phase) === "prepare" && spellPreparedResolutionInPanel(definition)) return true;
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
// popup resolution (a heal, a save) counts, it asks its inputs in its own popup; a zone to move or to turn (Sposta la
// sfera, Cambia direzione) counts too, the area tool asks for it on the map. Creatures to select or a choice to make
// do not.
export function spellActionRunsDirectly(action) {
  if (!action || spellPillActionNeedsTargets(action) || action.completesInPanel === true) return false;
  if (action.choice && typeof action.choice === "object") return false;
  if (action.movement?.choice && typeof action.movement.choice === "object") return false;
  return true;
}

// The actions the area tool completes on the map: the ⚡ menu says how, and waits for the ✓ of the tool.
const AREA_TOOL_RESOLUTION_KINDS = new Set(["zone-movement", "zone-direction"]);
export function spellActionUsesAreaTool(action) {
  return AREA_TOOL_RESOLUTION_KINDS.has(text(action?.resolutionKind));
}

// What to do on the map while the area tool waits, in the GM's words.
export function spellAreaToolActionHint(action) {
  return text(action?.resolutionKind) === "zone-direction"
    ? "Scegli la nuova direzione sulla mappa, poi premi ✓ nella barra dello strumento (Esc annulla)."
    : "Trascina l'area sulla mappa, a caselle intere, poi premi ✓ Conferma movimento (Esc annulla).";
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
      areaTool: spellActionUsesAreaTool(action),
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

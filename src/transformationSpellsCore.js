// Trasformazioni, lotto W7 (docs/PIANO_TRASFORMAZIONI.md): the four spells of a form (PHB 2014) through the spell panel.
// - Shapechange (Trasformazione): the caster, its own limit (its level).
// - Polymorph (Metamorfosi): one creature, a beast up to its challenge rating or level; no effect at 0 HP.
// - True Polymorph (Metamorfosi Pura): the same with any type.
// - Animal Shapes (Forme Animali): any number of willing creatures, each its own beast, Large or smaller, CR 4 or lower.
// Each target the spell takes gets a pill of the spell's instance with the form of its row («Forma»): the pill ends with
// the caster's concentration, and the coordinator swaps the hit points (lotto W5). Pure: the area panel's executor puts
// these applications among the resolution's own.
import { ID } from "./constants.js";
import {
  TRANSFORMATION_SPELL_TEMPLATES,
  characterTotalLevel,
  sanitizeTransformationForm,
  transformationFormAllowed,
  transformationPillParts,
  transformationSpellTemplate,
} from "./transformationFormsCore.js";

const META_KEY = `${ID}/meta`;
const meta = (item) => item?.metadata?.[META_KEY] || {};

export const TRANSFORMATION_FORM_CONTEXT_FIELD = "form";

const DETAIL = Object.freeze({
  shapechange: "Prende i PF della forma; i suoi tornano alla fine, e a 0 PF della forma con il danno in eccesso. "
    + "Tiene capacità, competenze e mente; cambia forma con un'azione.",
  polymorph: "Prende i PF della forma; i suoi tornano alla fine, e a 0 PF della forma con il danno in eccesso. "
    + "Caratteristiche e mente della bestia; niente incantesimi né azioni che richiedono le mani o la voce.",
  "true-polymorph": "Prende i PF della forma; i suoi tornano alla fine, e a 0 PF della forma con il danno in eccesso. "
    + "Caratteristiche e mente della forma. Se la concentrazione dura l'ora intera, resta finché non viene dissolta.",
  "animal-shapes": "Prende i PF della forma; i suoi tornano alla fine, e a 0 PF della forma con il danno in eccesso. "
    + "Tiene Intelligenza, Saggezza e Carisma; non parla né lancia incantesimi.",
  // Lotto W7e (Xanathar): its own hit points stay, the form's come as temporary ones.
  "mass-polymorph": "Tiene i suoi PF e ha come PF temporanei quelli della forma, che altre fonti non sostituiscono: senza più "
    + "PF temporanei, o morto, torna alla sua forma. Caratteristiche e mente della bestia; non parla né lancia incantesimi.",
});

/**
 * The context of the limits (transformationLimits) for a spell's target: Polymorph and True Polymorph read the target's
 * level (a character's, from its card) or its challenge rating, which a monster's card does not keep, so the table checks
 * it (crUnknown); Shapechange reads the caster's level.
 */
export function transformationSpellContext({ spellId = "", target = null, caster = null } = {}) {
  const template = transformationSpellTemplate(spellId);
  if (!template) return null;
  const shapechange = template.kind === "shapechange";
  const level = characterTotalLevel(meta(shapechange ? caster : target).initiativeCard?.characterBuild);
  return { kind: template.kind, ...(shapechange ? { casterLevel: level } : { targetLevel: level }), crUnknown: true };
}

/**
 * The pills of a cast: for each target the spell takes (takenIds: a failed save, or a willing creature), the form of its
 * row (targetContexts[id].form). items: the targets and the caster as the scene has them. Returns { applications, errors }:
 * the applications as saveSpellResolutionOperations reads them (one target each), the errors in Italian.
 */
export function transformationSpellApplications({
  spellId = "", takenIds = [], targetContexts = {}, items = [], caster = null,
} = {}) {
  const template = transformationSpellTemplate(spellId);
  if (!template) return { applications: [], errors: [] };
  const byId = new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [item.id, item]));
  const applications = [];
  const errors = [];
  for (const id of [...new Set((Array.isArray(takenIds) ? takenIds : []).map(String))]) {
    const item = byId.get(id);
    const name = String(item?.name || "Il bersaglio").trim();
    if (template.kind === "shapechange" && caster?.id && id !== caster.id) {
      errors.push(`${template.conditionName}: il bersaglio è chi lancia, non ${name}.`);
      continue;
    }
    const hp = meta(item).hp;
    if ((template.kind === "polymorph" || template.kind === "true-polymorph") && hp !== undefined && hp !== null
      && Number(hp) <= 0) {
      errors.push(`${name} è a 0 PF: ${template.conditionName} non ha effetto.`);
      continue;
    }
    const form = sanitizeTransformationForm(targetContexts?.[id]?.[TRANSFORMATION_FORM_CONTEXT_FIELD]);
    if (!form) {
      errors.push(`${name}: scegli la forma.`);
      continue;
    }
    const check = transformationFormAllowed(form, transformationSpellContext({ spellId, target: item, caster }));
    if (!check.allowed) {
      errors.push(`${name}: forma non ammessa. ${check.reasons.join(" ")}`);
      continue;
    }
    const parts = transformationPillParts({ template, form, label: template.conditionName, detail: DETAIL[template.kind],
      portrait: targetContexts?.[id]?.formPortrait || null });
    // Lotto W7e: the form's temporary hit points (the coordinator gives them with the pill) end it when gone, and no
    // other source replaces them.
    const temporary = template.hitPoints === "temporary" ? { endsWhenTempHpGone: true, tempHpLocked: true } : {};
    applications.push({
      targetIds: [id],
      conditionName: template.conditionName,
      options: { displayLabel: parts.displayLabel, effectDetail: parts.detail, mechanics: { ...parts.mechanics, ...temporary } },
    });
  }
  return { applications, errors };
}

// The same context from levels already read (the spell panel's candidates carry the target's level, characterLevel):
// what the «Forma» field of a row checks while the GM chooses.
export function transformationSpellFieldContext({ spellId = "", targetLevel = 0, casterLevel = 0 } = {}) {
  const template = transformationSpellTemplate(spellId);
  if (!template) return null;
  return template.kind === "shapechange"
    ? { kind: template.kind, casterLevel: Math.max(0, Math.floor(Number(casterLevel) || 0)), crUnknown: true }
    : { kind: template.kind, targetLevel: Math.max(0, Math.floor(Number(targetLevel) || 0)), crUnknown: true };
}

// G28: the spells whose form changes while they last, with an action (Shapechange: the creature in the form; Animal
// Shapes: the caster, for each creature it changed).
export const TRANSFORMATION_CHANGE_KINDS = Object.freeze(["shapechange", "animal-shapes"]);

/**
 * The form a creature may change to while a spell lasts (G28), for the attack console: { kind, context, casterName } of
 * its active pill, or null when it has none of those spells. The limits are the spell's (transformationLimits):
 * Shapechange the creature's level, Animal Shapes a beast up to CR 4 and Large.
 */
export function transformationChangeOf(item, items = []) {
  const instances = meta(item).conditions?.instances;
  const pill = (Array.isArray(instances) ? instances : []).find((instance) => instance && instance.active !== false
    && TRANSFORMATION_CHANGE_KINDS.includes(instance.mechanics?.transformation?.kind) && instance.mechanics.transformation.form);
  if (!pill) return null;
  const kind = pill.mechanics.transformation.kind;
  const caster = (Array.isArray(items) ? items : []).find((entry) => entry?.id === pill.sourceId) || null;
  return {
    kind,
    instanceId: String(pill.id || ""),
    formName: String(pill.mechanics.transformation.form.name || ""),
    casterId: String(pill.sourceId || ""),
    casterName: String(caster?.name || pill.sourceName || "").trim(),
    context: kind === "shapechange"
      ? { kind, casterLevel: characterTotalLevel(meta(item).initiativeCard?.characterBuild), crUnknown: true }
      : { kind },
  };
}

/**
 * G28: the pill of the new form, in place of the one the creature has. The copy keeps what ties it to the spell (its
 * source, its spell and instance, its expiry) with a new id (newInstanceId), so the coordinator reads it as a form that
 * arrives on a form: the creature's own HP stay put aside, the new form's come (Shapechange: not above the current ones),
 * and the old pill makes way (planCommandTransformationWrites). { instance, error }, error in Italian.
 */
export function planTransformationFormChange({ item = null, form = null, portrait = null, newInstanceId = "" } = {}) {
  const change = transformationChangeOf(item);
  if (!change) return { instance: null, error: "Nessuna Trasformazione o Forme Animali attiva su questa creatura." };
  const clean = sanitizeTransformationForm(form);
  if (!clean) return { instance: null, error: "Scegli la forma nuova." };
  const check = transformationFormAllowed(clean, change.context);
  if (!check.allowed) return { instance: null, error: `Forma non ammessa: ${check.reasons.join(" ")}` };
  if (!String(newInstanceId || "").trim()) return { instance: null, error: "Identità della pill mancante." };
  const instances = meta(item).conditions.instances;
  const old = instances.find((instance) => String(instance?.id || "") === change.instanceId);
  const template = Object.values(TRANSFORMATION_SPELL_TEMPLATES).find((entry) => entry.kind === change.kind);
  const parts = transformationPillParts({ template, form: clean, label: template.conditionName, detail: DETAIL[change.kind], portrait });
  const { transformation: _form, movement: _movement, damageDefenses: _defenses, ...otherMechanics } = old.mechanics || {};
  return {
    instance: {
      ...old,
      id: String(newInstanceId),
      active: true,
      displayLabel: parts.displayLabel,
      effectDetail: parts.detail,
      mechanics: { ...otherMechanics, ...parts.mechanics },
    },
    error: "",
  };
}

// G28: the console's «Cambia forma» in the Capacità tab, for a creature in the form of Shapechange or Animal Shapes: one
// entry of the picker (the shape of transformationFormEntries), with what the action does. [] without such a form.
export function transformationChangeEntries(item, items = []) {
  const change = transformationChangeOf(item, items);
  if (!change) return [];
  const text = change.kind === "shapechange"
    ? "Con un'azione: una forma nuova, con le stesse regole della prima. Se ha più PF della forma attuale, i PF restano quelli attuali; i suoi restano da parte fino alla fine."
    : `Con un'azione di ${change.casterName || "chi lancia"}: una forma nuova per questa creatura, una bestia fino a GS 4 e Grande. Arriva con i suoi PF; quelli della creatura restano da parte fino alla fine.`;
  return [{
    key: "form::change", tab: "features", actionId: "", spellId: "", featureId: "", label: "Cambia forma", mode: "monster",
    group: "form-change", text, activation: "azione", species: false, level: null, concentration: false, ritual: false,
    recordOnly: false, pinned: false, change,
  }];
}

// Trasformazioni (16/11/2026): the stat block of a form to read. Its traits (Keen Smell, Pack Tactics…), its Multiattack
// and the actions that are no attack, its reactions, and the whole stat block, in the attack console's Capacità tab while
// the creature is in the form, and behind the «Statblock» button of the «Forma» field. Nothing here is spent or
// automated: the table applies what they say.
// The text comes from the GM's browser (monsterStatblockTextLoader.js: the 5eTools archive, by the form's reference
// "Brown Bear|MM"); without it (a player online, a form pasted as text) from the form's snapshot: its traits' names and
// its Multiattack. Pure.
import { activeTransformation, transformationFormSummary } from "./transformationFormsCore.js";

export const TRANSFORMATION_FORM_GROUP_TITLES = Object.freeze({
  "form-trait": "Forma: tratti",
  "form-action": "Forma: multiattacco e altre azioni",
  "form-reaction": "Forma: reazioni",
  "form-statblock": "Forma: statblock",
  // G28: a new form while Shapechange or Animal Shapes lasts (the console's «Cambia forma»).
  "form-change": "Forma: cambia forma",
});

const NO_TEXT = "Il testo è nell'archivio di 5eTools del GM.";
const ATTACK_TEXT = /\b(?:Weapon|Spell) Attack\b|\bAttack Roll\b|\bto hit\b/i;

// The reference of a form's stat block in the GM's archive ("Brown Bear|MM"), "" for a form typed or pasted as text.
export function transformationFormStatblockRef(form) {
  const ref = String(form?.ref || "").trim();
  return form?.source === "5etools" && /^[^|]+\|[A-Za-z0-9-]{1,24}$/.test(ref) ? ref : "";
}

// The form of a creature's meta, or null.
export function transformationFormOf(meta) {
  return activeTransformation(meta)?.form || null;
}

// The stat block as text: its header ("Armor Class 11 (natural armor)"), then each section with its title and its
// entries ("Keen Smell. The bear has…"). view: { header, sections } of monsterStatblockTextView.
export function transformationStatblockText(view) {
  const header = (Array.isArray(view?.header) ? view.header : [])
    .map((row) => [row?.label, row?.text].filter(Boolean).join(" ")).filter(Boolean);
  const sections = (Array.isArray(view?.sections) ? view.sections : []).map((section) => [
    ...(section.title ? [section.title.toUpperCase()] : []),
    ...(Array.isArray(section.entries) ? section.entries : []).map((entry) => [entry.name ? `${entry.name}.` : "", entry.text].filter(Boolean).join(" ")),
  ].join("\n"));
  return [header.join("\n"), ...sections].filter(Boolean).join("\n\n");
}

// The snapshot's own text, without the archive: its summary, its traits' names, its Multiattack.
function snapshotText(form) {
  return [transformationFormSummary(form), form.notes || "", form.multiattack ? `Multiattack. ${form.multiattack}` : "", NO_TEXT]
    .filter(Boolean).join("\n\n");
}

function snapshotTraitNames(form) {
  const match = String(form?.notes || "").match(/Tratti:\s*([^.]+)\./);
  return match ? match[1].split(",").map((name) => name.trim()).filter(Boolean) : [];
}

/**
 * The entries of the console's Capacità tab for a form: { key, label, mode: "monster", group, text, … }, as the
 * monsters' traits (pcAttackMonsterTraitsCore.js), in four groups (TRANSFORMATION_FORM_GROUP_TITLES). view: the form's
 * stat block from the GM's browser, or null.
 */
export function transformationFormEntries(form, view = null) {
  if (!form?.name) return [];
  const entries = [];
  const push = (group, label, text) => entries.push({
    key: `form::${entries.length}`, tab: "features", actionId: "", spellId: "", featureId: "", label, mode: "monster", group,
    text: text || NO_TEXT, activation: group === "form-reaction" ? "reazione" : "", species: false, level: null,
    concentration: false, ritual: false, recordOnly: false, pinned: false,
  });
  const sections = Array.isArray(view?.sections) ? view.sections : null;
  if (sections) {
    for (const entry of sections.find((section) => !section.title)?.entries || []) if (entry.name) push("form-trait", entry.name, entry.text);
    for (const section of sections.filter((candidate) => ["Actions", "Bonus Actions"].includes(candidate.title))) {
      // The attacks are in the Attacchi tab already: here the Multiattack and what is no attack (a breath, a howl).
      for (const entry of section.entries || []) {
        if (entry.name && (/^multiattack/i.test(entry.name) || !ATTACK_TEXT.test(entry.text || ""))) {
          push("form-action", section.title === "Bonus Actions" ? `${entry.name} (azione bonus)` : entry.name, entry.text);
        }
      }
    }
    for (const entry of sections.find((section) => section.title === "Reactions")?.entries || []) if (entry.name) push("form-reaction", entry.name, entry.text);
    push("form-statblock", `Statblock: ${form.name}`, transformationStatblockText(view));
    return entries;
  }
  for (const name of snapshotTraitNames(form)) push("form-trait", name, "");
  if (form.multiattack) push("form-action", "Multiattack", form.multiattack);
  push("form-statblock", `Statblock: ${form.name}`, snapshotText(form));
  return entries;
}

// A monster's stat block in the character sheet's import (attacchi dei mostri, lotto 4): its actions become the card's
// attacks with the monster's fields (quickActionsCore.js), its Multiattack the card's monster profile, its hit points
// a value the tracker sets (lotto 5). The block's other keys (AC, abilities, saves, defenses) are the character sheet's
// (characterSheetImportCore.js), which calls this module. Names in Italian or English; what is not recognised is
// reported, never guessed. Distances in feet, as stat blocks print them ("10 ft", 10), or in metres ("3 m").
import { MAX_QUICK_ACTION_ATTACKS, MAX_QUICK_ACTION_ATTACK_NOTE, sanitizeQuickAction } from "./quickActionsCore.js";
import { MAX_MONSTER_MULTIATTACK, MONSTER_PROFILE_SOURCES } from "./monsterProfileCore.js";

// The conditions a failed save applies: the names of CONDITION_LIST (conditions.js), kept here so the import does not
// load the tracker's condition module; English and the usual Italian forms too.
const CONDITION_ALIASES = Object.freeze({
  Accecato: ["blinded", "accecata"],
  Affascinato: ["charmed", "affascinata"],
  Afferrato: ["grappled", "afferrata"],
  Assordato: ["deafened", "assordata"],
  Avvelenato: ["poisoned", "avvelenata"],
  Incapacitato: ["incapacitated", "incapacitata"],
  Invisibile: ["invisible"],
  Paralizzato: ["paralyzed", "paralysed", "paralizzata"],
  Pietrificato: ["petrified", "pietrificata"],
  "Privo di sensi": ["unconscious", "priva di sensi"],
  Prono: ["prone", "prona"],
  Spaventato: ["frightened", "spaventata"],
  Stordito: ["stunned", "stordita"],
  Trattenuto: ["restrained", "trattenuta"],
});
export const MONSTER_IMPORT_CONDITIONS = Object.freeze(Object.keys(CONDITION_ALIASES));

const AREA_ALIASES = Object.freeze({
  cone: ["cone", "cono"], line: ["line", "linea"], sphere: ["sphere", "sfera", "radius", "raggio", "emanation", "emanazione"],
  cube: ["cube", "cubo"], cylinder: ["cylinder", "cilindro"], target: ["target", "targets", "bersaglio", "bersagli", "creature", "creatura"],
});

function key(value) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\r\n?/g, "\n").trim() : "";
}

const CONDITION_BY_KEY = new Map(Object.entries(CONDITION_ALIASES).flatMap(([name, aliases]) => [name, ...aliases].map((alias) => [key(alias), name])));
const AREA_BY_KEY = new Map(Object.entries(AREA_ALIASES).flatMap(([shape, aliases]) => aliases.map((alias) => [key(alias), shape])));

// "+7", 7, "7" -> 7; else null.
function integer(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const match = text(value).match(/^([+\-−]?)\s*(\d+)$/);
  if (!match) return null;
  return ["-", "−"].includes(match[1]) ? -Number(match[2]) : Number(match[2]);
}

// 10, "10 ft", "10 piedi" -> 10 feet; "3 m", "4,5 m" -> 10 and 15 feet (1,5 m every 5 feet); else null.
export function monsterImportFeet(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const match = text(value).toLowerCase().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(ft|feet|foot|piedi|piede|m|metri|metro)?\.?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  return ["m", "metri", "metro"].includes(match[2]) ? Math.round((amount / 1.5) * 5) : Math.round(amount);
}

// "5", 5, "5-6", "5–6", "Ricarica 5–6" -> 5; else null.
function rechargeOf(value) {
  if (value === undefined || value === null || value === "") return null;
  const match = text(value).match(/(\d)(?:\s*[-–]\s*6)?\s*$/);
  return match ? Number(match[1]) : null;
}

// 3, "3", "3/day", "3/giorno" -> 3; else null.
function usesOf(value) {
  if (value === undefined || value === null || value === "") return null;
  const match = text(value).match(/^(\d+)\s*(?:\/\s*(?:day|giorno|g))?$/i);
  return match ? Number(match[1]) : null;
}

function isMultiattack(entry) {
  return /^(multiattack|multiattacco|attacco multiplo)$/i.test(text(entry?.name ?? entry?.label ?? entry?.nome));
}

/**
 * The actions of a monster's block (data.actions, or data.azioni): { attacks, multiattack, manual }. attacks are attack
 * drafts without an id, for the card editor; multiattack the text of data.multiattack or of a "Multiattack" action;
 * manual the names of the actions with neither damage nor save (for the table). resolveDamageType and resolveAbility
 * are the sheet import's (Italian or English names); unresolved collects what was not recognised.
 */
export function importedMonsterActions(data, { resolveDamageType, resolveAbility, unresolved = [] } = {}) {
  const source = Array.isArray(data?.actions ?? data?.azioni) ? data.actions ?? data.azioni : [];
  const attacks = [];
  const manual = [];
  let multiattack = text(data?.multiattack ?? data?.multiattacco);
  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      unresolved.push("un'azione non valida");
      continue;
    }
    const label = text(entry.name ?? entry.label ?? entry.nome).slice(0, 80);
    const note = text(entry.note ?? entry.nota ?? entry.text ?? entry.testo);
    if (isMultiattack(entry)) {
      if (!multiattack) multiattack = note;
      continue;
    }
    if (!label) {
      unresolved.push("un'azione senza nome");
      continue;
    }
    const result = monsterAttackDraft(entry, label, note, { resolveDamageType, resolveAbility, unresolved });
    if (result) attacks.push(result);
    else manual.push(label);
  }
  if (attacks.length > MAX_QUICK_ACTION_ATTACKS) unresolved.push(`${attacks.length - MAX_QUICK_ACTION_ATTACKS} azioni oltre il limite di ${MAX_QUICK_ACTION_ATTACKS} attacchi`);
  if (manual.length) unresolved.push(`azioni senza danni né tiro salvezza, da gestire al tavolo: ${manual.join(", ")}`);
  if (multiattack.length > MAX_MONSTER_MULTIATTACK) unresolved.push(`multiattacco tagliato a ${MAX_MONSTER_MULTIATTACK} caratteri`);
  return { attacks: attacks.slice(0, MAX_QUICK_ACTION_ATTACKS), multiattack: multiattack.slice(0, MAX_MONSTER_MULTIATTACK), manual };
}

// One action as an attack draft, or null when it has neither damage nor a save (nothing the console can register).
function monsterAttackDraft(entry, label, note, { resolveDamageType, resolveAbility, unresolved }) {
  const where = `«${label}»`;
  const rawDamage = Array.isArray(entry.damage ?? entry.danni ?? entry.components) ? entry.damage ?? entry.danni ?? entry.components : [];
  const components = [];
  for (const component of rawDamage) {
    const type = resolveDamageType(component?.type ?? component?.tipo);
    if (!type) {
      unresolved.push(`${where}: tipo di danno "${text(component?.type ?? component?.tipo)}"`);
      continue;
    }
    const formula = text(component.formula ?? component.dice ?? component.dadi).replace(/\s+/g, "");
    components.push({ type, ...(formula ? { formula } : {}) });
  }
  const save = entry.save ?? entry.ts;
  const attack = entry.attack ?? entry.attacco;
  const fields = { label, kind: "attack", id: "import", components };
  const hasAttack = !!attack && typeof attack === "object";
  // An attack whose hit asks for a save too (Ghoul, Giant Spider): the attack is registered, the save stays at the
  // table (phase 1b), in the action's note.
  if (hasAttack && save && typeof save === "object") unresolved.push(`${where}: il tiro salvezza al colpo resta da gestire al tavolo`);
  if (!hasAttack && save && typeof save === "object") {
    const ability = resolveAbility(save.ability ?? save.caratteristica);
    const dc = integer(save.dc ?? save.cd);
    if (!ability) unresolved.push(`${where}: caratteristica del tiro salvezza "${text(save.ability ?? save.caratteristica)}"`);
    if (dc === null) unresolved.push(`${where}: CD del tiro salvezza mancante`);
    Object.assign(fields, { save: ability, saveDC: dc, saveHalf: save.half === true || save.meta === true });
    const area = monsterArea(entry.area, where, unresolved);
    if (area) fields.area = area;
    const condition = text(entry.onFail?.condition ?? entry.seFallito?.condizione);
    if (condition) {
      const name = CONDITION_BY_KEY.get(key(condition));
      if (name) fields.onFail = { condition: name };
      else unresolved.push(`${where}: condizione "${condition}"`);
    }
  } else if (hasAttack) {
    const bonus = integer(attack.bonus ?? attack.toHit);
    if (bonus === null) unresolved.push(`${where}: bonus al tiro per colpire mancante`);
    const reach = monsterImportFeet(attack.reach ?? attack.portata);
    const range = attack.range && typeof attack.range === "object" ? attack.range : null;
    const normal = monsterImportFeet(range?.normal ?? range?.normale);
    const long = monsterImportFeet(range?.long ?? range?.lunga);
    const kind = key(attack.type ?? attack.tipo ?? (typeof attack.range === "string" ? attack.range : ""));
    Object.assign(fields, {
      range: ["ranged", "distanza", "a distanza"].includes(kind) || (!["melee", "mischia"].includes(kind) && normal !== null && reach === null) ? "ranged" : "melee",
      ...(bonus !== null ? { attackBonus: bonus } : {}),
      ...(reach !== null ? { reachFeet: reach } : {}),
      ...(normal !== null ? { rangeFeet: { normal, ...(long !== null ? { long } : {}) } } : {}),
    });
  } else if (!components.length) return null;
  const recharge = rechargeOf(entry.recharge ?? entry.ricarica);
  if (recharge !== null) fields.recharge = recharge;
  const uses = usesOf(entry.uses ?? entry.usi ?? entry.perDay);
  if (uses !== null) fields.uses = uses;
  if (note) fields.note = note.slice(0, MAX_QUICK_ACTION_ATTACK_NOTE);
  if (note.length > MAX_QUICK_ACTION_ATTACK_NOTE) unresolved.push(`${where}: nota tagliata a ${MAX_QUICK_ACTION_ATTACK_NOTE} caratteri`);
  const action = sanitizeQuickAction(fields);
  if (!action) {
    unresolved.push(`${where}: né danni validi né un tiro salvezza con condizione`);
    return null;
  }
  // A value the model drops (a DC 40, a recharge 7) is a value the block got wrong: the GM hears about it.
  for (const [field, labelText] of [["recharge", "ricarica"], ["uses", "usi al giorno"], ["attackBonus", "bonus al tiro"], ["saveDC", "CD del tiro salvezza"]]) {
    if (field === "saveDC" && !fields.save) continue;
    if (fields[field] !== undefined && fields[field] !== null && action[field] === undefined) unresolved.push(`${where}: ${labelText} non valido`);
  }
  const { id: _id, ...draft } = action;
  return draft;
}

// { shape, size, width, targets }: a cone, line, sphere, cube or cylinder of size feet, or up to targets creatures.
function monsterArea(value, where, unresolved) {
  if (!value || typeof value !== "object") return null;
  const raw = text(value.shape ?? value.forma);
  const shape = AREA_BY_KEY.get(key(raw));
  if (!shape) {
    unresolved.push(`${where}: forma dell'area "${raw}"`);
    return null;
  }
  if (shape === "target") return { shape, maxTargets: integer(value.targets ?? value.maxTargets ?? value.bersagli) ?? 1 };
  const sizeFeet = monsterImportFeet(value.size ?? value.sizeFeet ?? value.misura);
  if (sizeFeet === null) {
    unresolved.push(`${where}: misura dell'area mancante`);
    return null;
  }
  const widthFeet = monsterImportFeet(value.width ?? value.widthFeet ?? value.larghezza);
  return { shape, sizeFeet, ...(shape === "line" && widthFeet !== null ? { widthFeet } : {}) };
}

// The block's hit points, for the tracker (lotto 5): { average, formula }, or null.
export function importedMonsterHitPoints(data) {
  const value = data?.hitPoints ?? data?.hp ?? data?.puntiFerita ?? data?.pf;
  const source = value && typeof value === "object" ? value : { average: value };
  const average = integer(source.average ?? source.media ?? source.value);
  if (average === null || average < 1 || average > 9999) return null;
  const formula = text(source.formula ?? source.dadi).replace(/\s+/g, "").slice(0, 24);
  return { average, ...(formula ? { formula } : {}) };
}

// A block is a monster's when it says so ("kind": "monster") or carries a monster's actions.
export function isMonsterStatblock(data) {
  return key(data?.kind ?? data?.tipo) === "monster" || key(data?.kind ?? data?.tipo) === "mostro"
    || Array.isArray(data?.actions) || Array.isArray(data?.azioni);
}

export function monsterImportSource(data) {
  const source = key(data?.source ?? data?.fonte);
  return MONSTER_PROFILE_SOURCES.includes(source) ? source : "manual";
}

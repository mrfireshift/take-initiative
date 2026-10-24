// Counterspell (PHB 2014): what the GM names in its popup (counterspell.html) before the cast, the rule that decides
// whether the spell is countered, and the words the History label and the combat log use. Pure: the cast itself is
// the ordinary recorded cast (spellCastRecord.js), with this context on its causality.
export const COUNTERSPELL_SPELL_ID = "counterspell";
export const COUNTERSPELL_BASE_LEVEL = 3;
export const COUNTERSPELL_RANGE_METERS = 18;
export const COUNTERSPELL_OUTCOMES = Object.freeze({ COUNTERED: "countered", FAILED: "failed" });
export const COUNTERSPELL_CHECK_RESULTS = Object.freeze({ PASSED: "passed", FAILED: "failed" });

function text(value, limit = 120) {
  return String(value ?? "").trim().slice(0, limit);
}

function spellLevel(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const level = Math.floor(Number(value));
  return Number.isInteger(level) && level >= 0 && level <= 9 ? level : null;
}

export function isCounterspell(spellOrId) {
  const id = typeof spellOrId === "object" ? spellOrId?.id : spellOrId;
  return text(id) === COUNTERSPELL_SPELL_ID;
}

// A spell of the Counterspell's slot level or lower is countered; a higher one asks an ability check with the
// caster's spellcasting ability, DC 10 + the spell's level.
export function counterspellCheck({ slotLevel = COUNTERSPELL_BASE_LEVEL, spellLevel: level = null } = {}) {
  const slot = Math.max(COUNTERSPELL_BASE_LEVEL, spellLevel(slotLevel) ?? COUNTERSPELL_BASE_LEVEL);
  const countered = spellLevel(level);
  if (countered === null) return { known: false, automatic: false, dc: null, slotLevel: slot };
  return countered <= slot
    ? { known: true, automatic: true, dc: null, slotLevel: slot }
    : { known: true, automatic: false, dc: 10 + countered, slotLevel: slot };
}

// The outcome: automatic, or the check's result (the total of the check, when typed, decides it against the DC).
export function counterspellOutcome({ check = null, checkResult = "", checkTotal = null } = {}) {
  if (!check?.known) return null;
  if (check.automatic) return COUNTERSPELL_OUTCOMES.COUNTERED;
  const total = Math.floor(Number(checkTotal));
  const result = String(checkTotal ?? "").trim() !== "" && Number.isInteger(total)
    ? (total >= check.dc ? COUNTERSPELL_CHECK_RESULTS.PASSED : COUNTERSPELL_CHECK_RESULTS.FAILED)
    : text(checkResult);
  if (result === COUNTERSPELL_CHECK_RESULTS.PASSED) return COUNTERSPELL_OUTCOMES.COUNTERED;
  if (result === COUNTERSPELL_CHECK_RESULTS.FAILED) return COUNTERSPELL_OUTCOMES.FAILED;
  return null;
}

/**
 * The context the cast records: who was countered, which spell at which level, the check and the outcome; the slot the
 * countered caster lost, when the plugin spent it. ok false names what is missing.
 */
export function planCounterspellContext({
  target = null,
  spell = null,
  spellName = "",
  spellLevel: level = null,
  slotLevel = COUNTERSPELL_BASE_LEVEL,
  checkResult = "",
  checkTotal = null,
  targetSlot = "",
} = {}) {
  const targetId = text(target?.id);
  if (!targetId) return { ok: false, error: "Scegli chi sta lanciando l'incantesimo." };
  const name = text(spell?.displayName || spell?.name || spellName);
  if (!name) return { ok: false, error: "Scrivi quale incantesimo viene contrastato." };
  const resolvedLevel = spellLevel(level) ?? spellLevel(spell?.level);
  if (resolvedLevel === null) return { ok: false, error: "Indica il livello dell'incantesimo contrastato." };
  const check = counterspellCheck({ slotLevel, spellLevel: resolvedLevel });
  const outcome = counterspellOutcome({ check, checkResult, checkTotal });
  if (!outcome) return { ok: false, error: `Prova di caratteristica da incantatore, CD ${check.dc}: segna l'esito.` };
  const total = Math.floor(Number(checkTotal));
  return {
    ok: true,
    context: {
      targetId,
      targetName: text(target?.name) || "Creatura",
      ...(spell?.id ? { spellId: text(spell.id) } : {}),
      spellName: name,
      spellLevel: resolvedLevel,
      slotLevel: check.slotLevel,
      automatic: check.automatic,
      ...(check.automatic ? {} : {
        dc: check.dc,
        check: {
          result: outcome === COUNTERSPELL_OUTCOMES.COUNTERED ? COUNTERSPELL_CHECK_RESULTS.PASSED : COUNTERSPELL_CHECK_RESULTS.FAILED,
          ...(String(checkTotal ?? "").trim() !== "" && Number.isInteger(total) ? { total } : {}),
        },
      }),
      outcome,
      ...(text(targetSlot) && outcome === COUNTERSPELL_OUTCOMES.COUNTERED ? { targetSlot: text(targetSlot) } : {}),
    },
  };
}

const levelText = (level) => (Number(level) === 0 ? "trucchetto" : `${level}°`);

// "Controincantesimo (3°) su Auril: Cono di freddo (5°) · annullato"
export function counterspellLabel(context) {
  if (!context) return "Incantesimo: Controincantesimo";
  const result = context.outcome === COUNTERSPELL_OUTCOMES.COUNTERED ? "annullato" : "non annullato";
  return `Controincantesimo (${levelText(context.slotLevel)}) su ${context.targetName}: ${context.spellName} (${levelText(context.spellLevel)}) · ${result}`;
}

// The combat log's lines (combatLogPresentationCore.js): the spell countered, how, and what it cost its caster.
export function counterspellLogLines(context) {
  if (!context || typeof context !== "object") return [];
  const how = context.automatic
    ? `annullato automaticamente (slot ${levelText(context.slotLevel)} ≥ ${levelText(context.spellLevel)})`
    : `prova CD ${context.dc}${Number.isInteger(context.check?.total) ? ` (totale ${context.check.total})` : ""} ${context.check?.result === COUNTERSPELL_CHECK_RESULTS.PASSED ? "riuscita" : "fallita"}`;
  return [
    `Contrastato: ${text(context.targetName)} · ${text(context.spellName)} (${levelText(context.spellLevel)})`,
    `Esito: ${context.outcome === COUNTERSPELL_OUTCOMES.COUNTERED ? "annullato" : "l'incantesimo ha effetto"} · ${how}`,
    ...(context.targetSlot ? [`${text(context.targetName)} perde: ${text(context.targetSlot)}`] : []),
  ];
}

// The countered caster's spells first in the popup's list: the spell actions of its sheet (its spellbook).
export function counterspellSuggestedSpellIds(targetItem, metaKey) {
  const actions = targetItem?.metadata?.[metaKey]?.initiativeCard?.quickActions;
  return Array.from(new Set((Array.isArray(actions) ? actions : [])
    .filter((action) => action?.kind === "spell" && text(action.spellId))
    .map((action) => text(action.spellId))));
}

// The import of a stat block pasted as text (statblock da testo, lotto ST2, docs/STUDIO_IMPORT_STATBLOCK_TESTO.md §4): the
// parser's 5eTools monster read by the 5eTools adapter as any other (decision D1), with the card's own origin: source
// "manual" and the reference "Nome|testo" (decision D4), no portrait. Pure; the sheet's import panel loads it only when
// the pasted text is not JSON.
import { fiveToolsMonsterToStatblock } from "./fiveToolsMonsterCore.js";
import { looksLikeStatblockText, parseStatblockText } from "./monsterStatblockTextParseCore.js";

export { looksLikeStatblockText };

// The line over the sections, as 5eTools' one: "Da testo: Frost Raider, 2 azioni registrabili, 1 da gestire al tavolo."
export function statblockTextImportSummary(block, counts) {
  const parts = [`${counts?.full || 0} ${counts?.full === 1 ? "azione registrabile" : "azioni registrabili"}`];
  if (counts?.partial) parts.push(`${counts.partial} con il tiro salvezza al colpo nella nota`);
  if (counts?.manual) parts.push(`${counts.manual} da gestire al tavolo`);
  return `Da testo: ${block?.name || ""}, ${parts.join(", ")}.`;
}

/**
 * A stat block pasted as text: { block, monster, report, summary, error }. block goes to the sheet's import as it is;
 * monster is what the GM's browser keeps for the Statblock originale, the Capacità tab and the reaction prompts (decision
 * D5); report holds the parser's lines and the adapter's, in Italian; error refuses the text with the parser's reason.
 */
export function statblockTextImport(text, { allow2024 = false } = {}) {
  const parsed = parseStatblockText(text);
  if (parsed.error) return { block: null, monster: null, report: parsed.report, summary: "", error: parsed.error };
  const converted = fiveToolsMonsterToStatblock(parsed.monster, { allow2024 });
  if (converted.error || !converted.block) {
    return { block: null, monster: null, report: parsed.report, summary: "", error: converted.error || "Statblock non leggibile." };
  }
  const { portrait: _portrait, ...rest } = converted.block;
  const block = { ...rest, source: "manual" };
  return { block, monster: converted.monster, report: [...parsed.report, ...converted.report], summary: statblockTextImportSummary(block, converted.counts), error: "" };
}

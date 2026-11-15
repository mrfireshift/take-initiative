// A 5eTools monster as text, the way the parser of lotto ST1 reads it (docs/STUDIO_IMPORT_STATBLOCK_TESTO.md §6.1): the
// name, then the header and the sections of fiveToolsStatblockSections(), as the plugin prints its Statblock originale.
// abilities: "inline" (one line, as the Stats tab prints them) or "table" (the six names on a line and the scores on the
// next, as the Monster Manual).
import { fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";

export function printedStatblockText(monster, { abilities = "inline" } = {}) {
  const { header, sections } = fiveToolsStatblockSections(monster);
  const lines = [String(monster?.name || "")];
  for (const row of header) {
    if (!row.label && /^STR \d/.test(row.text) && abilities === "table") {
      const scores = [...row.text.matchAll(/([A-Z]{3}) (\d+ \([^)]*\))/g)];
      lines.push(scores.map((score) => score[1]).join(" "), scores.map((score) => score[2]).join(" "));
    } else lines.push(row.label ? `${row.label} ${row.text}` : row.text);
  }
  for (const section of sections) {
    if (section.title) lines.push(section.title);
    for (const entry of section.entries) lines.push(entry.name ? `${entry.name}. ${entry.text}` : entry.text);
  }
  return lines.join("\n");
}

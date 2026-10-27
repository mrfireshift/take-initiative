// The rules text of a spell, a class feature or a condition as the blocks a view draws: paragraphs, bulleted lists
// and tables. The texts mark them with plain characters (scripts/restore-srd-text-structure.mjs, the supplement
// catalogs, referenceData.js): a line break between paragraphs, "• ", "- " or "* " at the start of a list item,
// " | " between the cells of a table row, the first row being the header.

const LIST_ITEM = /^[•*-]\s+/u;
const CELL_SEPARATOR = /\s+\|\s+/u;

// [{ kind: "paragraph", text } | { kind: "list", items: [text] } | { kind: "table", rows: [[cell]] }], in order.
// Consecutive items, or rows, make one list, or one table; every other line is a paragraph.
export function rulesTextBlocks(text) {
  const blocks = [];
  for (const rawLine of String(text ?? "").replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const previous = blocks[blocks.length - 1];
    const cells = line.split(CELL_SEPARATOR);
    if (cells.length > 1) {
      if (previous?.kind === "table") previous.rows.push(cells);
      else blocks.push({ kind: "table", rows: [cells] });
    } else if (LIST_ITEM.test(line) && line.replace(LIST_ITEM, "")) {
      const item = line.replace(LIST_ITEM, "");
      if (previous?.kind === "list") previous.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks;
}

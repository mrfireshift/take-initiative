// Builds the rules compendium of the DM encyclopedia (src/rules-reference-it.json) from the SRD 5.1 Italian PDF, read
// through Xpdf's pdftotext in its default mode, which writes every paragraph of the PDF on a line of its own:
//
//   pdftotext -enc UTF-8 SRD_CC_v5.1_IT.pdf srd-it.txt
//   node scripts/generate-srd-rules-reference.mjs --pdf-text=srd-it.txt [--preview=anteprima.md]
//
// The outline (scripts/srd-rules-outline-it.json) is written by hand: pdftotext does not tell a chapter heading from
// a section or an entry. It lists, in PDF order, the headings that start a topic section or entry, the parts left out
// and where each range stops, plus the tables rebuilt by hand. The script only cuts the text at those headings:
// every line between the first heading and the stop of a range lands in exactly one heading, text or table, the words
// of every text are the words of its lines in the same order, and the words of a rebuilt table are the words of the
// lines it replaces (checked before writing, in any order: pdftotext reads some tables by column; a table may repeat
// its header or a label, never add a word).
//
// The same function builds the rules of a private manual (scripts/generate-private-rules.mjs): its outline then says
// how its pages end (footer), how its PDF pages map to the book's (pageOffset), the prefix of its ids (idPrefix) and
// the OCR mistakes to fix line by line before anything else (corrections: [{ from, to }], regular expressions).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTLINE_PATH = path.join(ROOT, "scripts", "srd-rules-outline-it.json");
const OUTPUT_PATH = path.join(ROOT, "src", "rules-reference-it.json");

const FOOTER = /^Rivendita vietata\..*Systems Reference Document 5\.1 \d+$/u;
const PARAGRAPH_END = /[.!?:;»"”)]$/u;
const CONTINUATION_START = /^(?:\(?[a-zàèéìòù]|\d+[°ª]?\s+[a-zàèéìòù])/u;
const INLINE_BULLET = /\s+•\s+/u;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/u.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

export function slugify(value) {
  return String(value)
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function words(text) {
  return String(text).match(/[\p{L}\p{N}]+/gu) || [];
}

// Every non-empty line of the PDF text but the page footers, with its page (1-based, the footer's number) and its
// line in the page (0-based, blank lines counted), the way to point at a line whose text repeats on the page. The
// corrections apply to every line, in order; one that writes a line break splits the line.
export function pdfLines(pdfText, { footer = FOOTER, corrections = [] } = {}) {
  const fixes = corrections.map(({ from, to }) => [new RegExp(from, "gu"), to]);
  const lines = [];
  pdfText.replace(/\r\n?/gu, "\n").split("\f").forEach((pageText, pageIndex) => {
    pageText.split("\n").forEach((raw, line) => {
      // A correction may split a line (a heading the OCR glued to its paragraph): each part is a line of its own.
      for (const part of fixes.reduce((value, [pattern, to]) => value.replace(pattern, to), raw).split("\n")) {
        const text = part.trim();
        if (!text || footer.test(text)) continue;
        lines.push({ page: pageIndex + 1, line, text });
      }
    });
  });
  return lines;
}

function headingLines(node) {
  return Array.isArray(node.heading) ? node.heading : [node.heading];
}

function findHeading(lines, node, from) {
  const heading = headingLines(node);
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].page > node.page) break;
    if (lines[index].page !== node.page) continue;
    if (heading.every((text, offset) => lines[index + offset]?.text === text)) return index;
  }
  throw new Error(`Titolo non trovato a p. ${node.page} dopo la riga ${from}: ${heading.join(" / ")}`);
}

// The line of the page with that number, or the first line of the page equal to the text, else the first one starting
// with it.
function findTableLine(lines, page, prefix, from, label, lineNumber) {
  if (lineNumber !== undefined) {
    const index = lines.findIndex((line) => line.page === page && line.line === lineNumber);
    if (index >= from && lines[index].text.startsWith(prefix)) return index;
    throw new Error(`Tabella "${label}": riga ${lineNumber} di p. ${page} non trovata o diversa da: ${prefix}`);
  }
  let partial = -1;
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].page > page) break;
    if (lines[index].page !== page) continue;
    if (lines[index].text === prefix) return index;
    if (partial < 0 && lines[index].text.startsWith(prefix)) partial = index;
  }
  if (partial >= 0) return partial;
  throw new Error(`Tabella "${label}": riga non trovata a p. ${page}: ${prefix}`);
}

// A rebuilt table holds every word of its PDF lines, as many times at least, and no word they do not have. omit lists
// the words a table may hold fewer times: a header the PDF repeats where the table goes on in the next column or page.
function checkTableWords(label, run, rebuilt, omit = []) {
  const count = (list) => list.reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());
  const source = count(words(run));
  for (const word of words(omit.join(" "))) source.set(word, (source.get(word) || 0) - 1);
  const target = count(words(rebuilt));
  const missing = [...source].filter(([word, times]) => (target.get(word) || 0) < times).map(([word]) => word);
  const added = [...target.keys()].filter((word) => !source.has(word));
  if (missing.length || added.length) {
    throw new Error(`Tabella "${label}": parole mancanti [${missing.join(" ")}], parole in più [${added.join(" ")}]`);
  }
}

// A private manual's small tables, rebuilt from the lines the PDF gives one cell at a time (outline.autoTables: the
// header, as [["Attività", "CD"]]): after the header, a label then its number, in turn ("10 identificare un veleno",
// a number glued to the next label by the OCR, counts as both). An upper-case line just before the header becomes the
// caption. The cells are the lines' own text, so no word changes; fewer than two rows leave the lines as they were.
const TABLE_VALUE = /^\d+(?:\s*[-–]\s*\d+)?$/u;
const TABLE_VALUE_AND_LABEL = /^(\d+(?:\s*[-–]\s*\d+)?)\s+(\D.*)$/u;

// A die table with its header on one line ({ header: "d100 Effetto", columns: ["d100", "Effetto"] }): each row starts
// with its range ("01-06 Per le 2 ore…", or the range alone on a line before the text), a line that starts with no
// range goes on the previous row's text, an upper-case heading ends the table.
const DIE_RANGE = /^(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)$/u;
const DIE_ROW = /^(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s+(\D.*)$/u;
const isUpperHeading = (text) => {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 4 && letters === letters.toLocaleUpperCase("it") && text.length < 70;
};

function dieTable(parts, index, spec) {
  const rows = [];
  let range = null;
  let next = index + 1;
  for (; next < parts.length; next += 1) {
    const text = parts[next].text;
    if (text === undefined || isUpperHeading(text)) break;
    // The header again, where the table goes on in the next column or page.
    if (text === spec.header) continue;
    const row = DIE_ROW.exec(text);
    if (range === null && row) rows.push([row[1], row[2]]);
    else if (range === null && DIE_RANGE.test(text)) range = text;
    else if (range !== null && !DIE_RANGE.test(text)) {
      rows.push([range, text]);
      range = null;
    } else if (rows.length && range === null) rows.at(-1)[1] += ` ${text}`;
    else break;
  }
  if (range !== null) next -= 1;
  return { rows: [spec.columns, ...rows], next };
}

function autoTables(parts, headers = []) {
  const out = [];
  for (let index = 0; index < parts.length; index += 1) {
    const die = headers.find((spec) => !Array.isArray(spec) && parts[index]?.text === spec.header);
    if (die) {
      const { rows, next } = dieTable(parts, index, die);
      const consumed = parts.slice(index, next).map((part) => part.text).filter((text, offset) => offset === 0 || text !== die.header).join(" ");
      if (rows.length < 3 || words(consumed).join(" ") !== words(rows.flat().join(" ")).join(" ")) {
        out.push(parts[index]);
        continue;
      }
      out.push({ table: rows });
      index = next - 1;
      continue;
    }
    const header = headers.filter(Array.isArray).find((cells) => cells.every((cell, offset) => parts[index + offset]?.text === cell));
    if (!header) {
      out.push(parts[index]);
      continue;
    }
    const rows = [];
    let label = null;
    let next = index + header.length;
    for (; next < parts.length; next += 1) {
      const text = parts[next].text;
      if (text === undefined) break;
      const glued = TABLE_VALUE_AND_LABEL.exec(text);
      if (label !== null && glued) {
        rows.push([label, glued[1]]);
        label = glued[2];
      } else if (label !== null && TABLE_VALUE.test(text)) {
        rows.push([label, text]);
        label = null;
      } else if (label === null && !TABLE_VALUE.test(text) && text.length < 120) {
        label = text;
      } else break;
    }
    if (label !== null) next -= 1;
    if (rows.length < 2) {
      out.push(parts[index]);
      continue;
    }
    const caption = out.at(-1)?.text;
    if (caption && caption === caption.toLocaleUpperCase("it") && /\p{L}{3}/u.test(caption)) out[out.length - 1] = { caption };
    const consumed = parts.slice(index, next).map((part) => part.text).join(" ");
    if (words(consumed).join(" ") !== words([header, ...rows].flat().join(" ")).join(" ")) {
      throw new Error(`Tabella ricostruita con parole diverse: ${consumed.slice(0, 60)}`);
    }
    out.push({ table: [header, ...rows] });
    index = next - 1;
  }
  return out;
}

// The blocks of a table spec: { rows } alone, or { blocks: [{ caption, rows }] } when the PDF puts several tables, or
// a table split by group, in one run of lines.
function tableBlocks(table) {
  return table.blocks || [{ rows: table.rows }];
}

// A body's lines as the text rulesTextCore.js draws: paragraphs split by a blank line, "• " list items and
// " | " table rows on lines of their own. A line that does not end a sentence, followed by one that starts in lower
// case, is one paragraph the PDF broke at a column or a page.
function bodyText(parts) {
  const blocks = [];
  for (const part of parts) {
    if (part.table) {
      blocks.push({ kind: "table", text: part.table.map((row) => row.join(" | ")).join("\n") });
      continue;
    }
    if (part.caption) {
      blocks.push({ kind: "caption", text: part.caption });
      continue;
    }
    const previous = blocks[blocks.length - 1];
    const text = part.text;
    if (previous?.kind === "paragraph" && !PARAGRAPH_END.test(previous.text) && CONTINUATION_START.test(text)) {
      previous.text = `${previous.text} ${text}`;
      continue;
    }
    if (text.startsWith("•") && previous?.kind === "list") {
      previous.text += `\n${text}`;
      continue;
    }
    blocks.push({ kind: text.startsWith("•") ? "list" : "paragraph", text });
  }
  return blocks.map((block) => {
    if (block.kind !== "list" && block.kind !== "paragraph") return block.text;
    return block.text
      .split("\n")
      .map((line) => line.split(INLINE_BULLET).join("\n• "))
      .map((line) => line.replace(/^•\s*/u, "• "))
      .join("\n");
  }).join("\n\n");
}

export function buildRulesReference(pdfText, outline) {
  const lines = pdfLines(pdfText, {
    footer: outline.footer ? new RegExp(outline.footer, "u") : FOOTER,
    corrections: outline.corrections || [],
  });
  const prefix = outline.idPrefix || "";
  const owner = new Array(lines.length).fill(null);
  const claim = (index, label) => {
    if (owner[index] !== null) throw new Error(`Riga ${index} (p. ${lines[index].page}) usata due volte: ${label} e ${owner[index]}`);
    owner[index] = label;
  };

  // Headings, in order.
  const located = [];
  let cursor = 0;
  for (const node of outline.nodes) {
    if (node.kind === "topic") {
      located.push({ node });
      continue;
    }
    const index = findHeading(lines, node, cursor);
    const size = headingLines(node).length;
    for (let offset = 0; offset < size; offset += 1) claim(index + offset, `titolo ${headingLines(node).join(" ")}`);
    located.push({ node, index, size });
    cursor = index + size;
  }

  // Tables: the run of lines they replace, inside one body.
  const tablesByStart = new Map();
  for (const table of outline.tables || []) {
    const start = findTableLine(lines, table.page, table.first, 0, table.label, table.firstLine);
    const end = findTableLine(lines, table.lastPage ?? table.page, table.last, start, table.label, table.lastLine);
    const run = lines.slice(start, end + 1).map((line) => line.text).join("\n");
    if (!table.drop) {
      const rebuilt = tableBlocks(table).map((block) => [block.caption || "", ...block.rows.flat()].join(" ")).join(" ");
      // A table transcribed from the page's image, where the OCR garbled the cells beyond correcting ("lo" for "1°"),
      // keeps the words of the transcription.
      if (!table.transcribed) checkTableWords(table.label, run, rebuilt, table.omit);
      for (const block of tableBlocks(table)) {
        const widths = new Set(block.rows.map((row) => row.length));
        if (widths.size !== 1 || block.rows[0].length < 2) throw new Error(`Tabella "${table.label}": righe di lunghezza diversa`);
      }
    }
    for (let index = start; index <= end; index += 1) claim(index, `tabella ${table.label}`);
    tablesByStart.set(start, { table, end });
  }

  const topics = [];
  const entries = [];
  const excluded = [];
  let topic = null;
  let section = null;
  const ids = new Set();

  for (let position = 0; position < located.length; position += 1) {
    const { node, index, size } = located[position];
    if (node.kind === "topic") {
      // A topic the outline comes back to keeps its sections: a manual moves between subjects.
      const topicId = node.id || slugify(node.name);
      topic = topics.find((item) => item.id === topicId);
      if (!topic) {
        topic = { id: topicId, name: node.name, sections: [] };
        topics.push(topic);
      }
      section = null;
      continue;
    }
    if (node.kind === "end") continue;
    const next = located.slice(position + 1).find((item) => item.index !== undefined);
    if (!next) throw new Error(`Manca la fine del testo dopo: ${headingLines(node).join(" ")}`);
    const parts = [];
    let bodyWords = [];
    for (let line = index + size; line < next.index; line += 1) {
      const table = tablesByStart.get(line);
      if (table) {
        if (!table.table.drop) {
          for (const block of tableBlocks(table.table)) {
            if (block.caption) parts.push({ caption: block.caption });
            parts.push({ table: block.rows });
          }
        }
        line = table.end;
        continue;
      }
      claim(line, `testo ${headingLines(node).join(" ")}`);
      parts.push({ text: lines[line].text });
      bodyWords.push(...words(lines[line].text));
    }
    const name = node.name || headingLines(node).join(" ");
    if (node.kind === "exclude") {
      excluded.push({ name, page: node.page, words: bodyWords.length });
      continue;
    }
    if (!topic) throw new Error(`Voce fuori da un argomento: ${name}`);
    if (node.kind === "section") {
      section = { id: node.id || prefix + slugify(name), name };
      topic.sections.push(section);
    }
    if (!parts.length) continue;
    const tabled = autoTables(parts, outline.autoTables);
    const text = bodyText(tabled);
    const captions = new Set(tabled.filter((part) => part.caption).map((part) => part.caption));
    const textWords = words(text.split("\n").filter((line) => !line.includes(" | ") && !captions.has(line)).join("\n"));
    const sourceWords = words(tabled.filter((part) => part.text !== undefined).map((part) => part.text).join("\n"));
    if (textWords.join(" ") !== sourceWords.join(" ")) throw new Error(`Parole cambiate nel testo di: ${name}`);
    const id = node.id || (node.kind === "section" ? section.id : prefix + slugify(name));
    if (ids.has(id)) throw new Error(`Id ripetuto: ${id} (${name})`);
    ids.add(id);
    entries.push({
      id,
      topic: topic.id,
      section: section?.id ?? null,
      name,
      page: node.page + (outline.pageOffset || 0),
      text,
      aliases: node.aliases || [],
      related: node.related || [],
      optional: Boolean(node.optional),
    });
  }

  // Every line from the first heading of a range to its stop has an owner.
  let inRange = false;
  const stops = new Set(located.filter((item) => item.node.kind === "end").map((item) => item.index));
  const starts = new Set();
  located.forEach((item, position) => {
    if (item.index === undefined) return;
    const previous = located.slice(0, position).reverse().find((other) => other.index !== undefined);
    if (!previous || previous.node.kind === "end") starts.add(item.index);
  });
  for (let index = 0; index < lines.length; index += 1) {
    if (starts.has(index)) inRange = true;
    if (stops.has(index)) inRange = false;
    if (inRange && owner[index] === null) throw new Error(`Riga senza voce a p. ${lines[index].page}: ${lines[index].text}`);
  }

  for (const entry of entries) {
    for (const related of entry.related) {
      if (related.startsWith("condition:")) continue;
      if (!ids.has(related)) throw new Error(`"${entry.name}" rimanda a una voce che non esiste: ${related}`);
    }
  }

  return {
    reference: {
      schemaVersion: 1,
      language: "it",
      ruleset: outline.ruleset || "D&D 5e SRD 5.1 (2014)",
      source: outline.source,
      license: outline.license || "CC-BY-4.0",
      generatedAt: new Date().toISOString().slice(0, 10),
      topics: topics.map((item) => ({ ...item, sections: item.sections.filter((candidate) => entries.some((entry) => entry.section === candidate.id && entry.topic === item.id)) })),
      entries,
    },
    excluded,
  };
}

export function rulesReport({ reference, excluded }, outline) {
  const out = [];
  for (const topic of reference.topics) {
    const topicEntries = reference.entries.filter((entry) => entry.topic === topic.id);
    const count = topicEntries.reduce((sum, entry) => sum + words(entry.text).length, 0);
    out.push(`${topic.name}: ${topicEntries.length} voci, ${count} parole`);
  }
  out.push(`Totale: ${reference.entries.length} voci, ${(outline.tables || []).filter((table) => !table.drop).length} tabelle`);
  out.push(`Esclusi: ${excluded.map((item) => `${item.name} (p. ${item.page}, ${item.words} parole)`).join("; ")}`);
  const long = reference.entries.filter((entry) => entry.text.length > 6000).map((entry) => `${entry.name} (${entry.text.length})`);
  if (long.length) out.push(`Voci oltre 6.000 caratteri: ${long.join(", ")}`);
  // Runs of short lines without a sentence end: tables the outline does not rebuild yet.
  for (const entry of reference.entries) {
    const paragraphs = entry.text.split("\n\n");
    let run = 0;
    for (const paragraph of paragraphs) {
      run = paragraph.length < 70 && !PARAGRAPH_END.test(paragraph) && !paragraph.includes(" | ") ? run + 1 : 0;
      if (run === 3) out.push(`Possibile tabella non ricostruita in "${entry.name}" (p. ${entry.page}): ${paragraph}`);
    }
  }
  return out.join("\n");
}

export function previewMarkdown({ reference }) {
  const out = [`# Anteprima del compendio SRD (${reference.entries.length} voci)`, ""];
  for (const topic of reference.topics) {
    out.push(`## ${topic.name}`, "");
    for (const entry of reference.entries.filter((item) => item.topic === topic.id)) {
      const section = topic.sections.find((item) => item.id === entry.section);
      out.push(`### ${entry.name}${entry.optional ? " — *regola opzionale*" : ""}`, "");
      out.push(`*${[topic.name, section?.name].filter(Boolean).join(" › ")} · p. ${entry.page}${entry.aliases.length ? ` · alias: ${entry.aliases.join(", ")}` : ""}${entry.related.length ? ` · vedi anche: ${entry.related.join(", ")}` : ""}*`, "");
      for (const block of entry.text.split("\n\n")) {
        if (block.includes(" | ")) {
          const [header, ...rows] = block.split("\n").map((row) => `| ${row} |`);
          out.push(header, `|${" --- |".repeat(header.split(" | ").length)}`, ...rows, "");
        } else {
          out.push(block, "");
        }
      }
    }
  }
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args["pdf-text"]) throw new Error("Uso: --pdf-text=srd-it.txt [--preview=anteprima.md]");
  const outline = JSON.parse(fs.readFileSync(OUTLINE_PATH, "utf8"));
  const result = buildRulesReference(fs.readFileSync(args["pdf-text"], "utf8"), outline);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result.reference, null, 2)}\n`, "utf8");
  if (args.preview) fs.writeFileSync(args.preview, previewMarkdown(result), "utf8");
  console.log(rulesReport(result, outline));
}

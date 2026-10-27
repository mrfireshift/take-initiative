// Draws a rules text (rulesTextCore.js) as DOM nodes: <p>, <ul> and <table>, every piece of text through
// textContent, never as HTML.
import { rulesTextBlocks } from "./rulesTextCore.js";

function element(documentRef, tagName, text) {
  const node = documentRef.createElement(tagName);
  if (text !== undefined) node.textContent = text;
  return node;
}

function tableNode(documentRef, rows) {
  const table = element(documentRef, "table");
  const [header, ...body] = rows;
  const head = element(documentRef, "thead");
  const headRow = element(documentRef, "tr");
  headRow.append(...header.map((cell) => element(documentRef, "th", cell)));
  head.append(headRow);
  table.append(head);
  if (body.length) {
    const tbody = element(documentRef, "tbody");
    tbody.append(...body.map((row) => {
      const tr = element(documentRef, "tr");
      tr.append(...row.map((cell) => element(documentRef, "td", cell)));
      return tr;
    }));
    table.append(tbody);
  }
  return table;
}

// The nodes of a text, to append in its container. paragraphClass goes on each <p>, for the views that already style
// their text paragraphs.
export function rulesTextNodes(text, { document: documentRef = globalThis.document, paragraphClass = "" } = {}) {
  return rulesTextBlocks(text).map((block) => {
    if (block.kind === "list") {
      const list = element(documentRef, "ul");
      list.className = "rules-list";
      list.append(...block.items.map((item) => element(documentRef, "li", item)));
      return list;
    }
    if (block.kind === "table") {
      const table = tableNode(documentRef, block.rows);
      table.className = "rules-table";
      return table;
    }
    const paragraph = element(documentRef, "p", block.text);
    if (paragraphClass) paragraph.className = paragraphClass;
    return paragraph;
  });
}

// A container with the text's nodes: a <div class="rules-text"> plus className.
export function rulesTextBlock(text, { document: documentRef = globalThis.document, className = "", paragraphClass = "" } = {}) {
  const block = element(documentRef, "div");
  block.className = ["rules-text", className].filter(Boolean).join(" ");
  block.append(...rulesTextNodes(text, { document: documentRef, paragraphClass }));
  return block;
}

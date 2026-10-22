// Minimal DOM double for the Boss Actions popover tests. It mirrors boss-actions.html ids only.
class FakeText {
  constructor(text) { this.textContent = String(text); this.parentNode = null; this.children = []; this.dataset = {}; }
  matches() { return false; }
}

export class FakeNode {
  constructor(doc, tag) {
    Object.assign(this, { ownerDocument: doc, tagName: String(tag).toUpperCase(), children: [], parentNode: null, dataset: {}, attributes: {},
      listeners: {}, className: "", id: "", textContent: "", checked: false, disabled: false, hidden: false, open: false, type: "", title: "" });
  }
  append(...nodes) {
    for (const value of nodes) {
      if (value === null || value === undefined) continue;
      const node = typeof value === "string" ? new FakeText(value) : value;
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this; this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  prepend(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this; this.children.unshift(node);
  }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) if (node.matches?.(selector)) return node;
    return null;
  }
  removeChild(node) { const index = this.children.indexOf(node); if (index >= 0) { this.children.splice(index, 1); node.parentNode = null; } return node; }
  replaceChildren(...nodes) { [...this.children].forEach((child) => this.removeChild(child)); this.append(...nodes); }
  replaceWith(node) {
    const parent = this.parentNode; if (!parent) return;
    const index = parent.children.indexOf(this);
    if (node.parentNode) node.parentNode.removeChild(node);
    parent.children.splice(index, 1, node); node.parentNode = parent; this.parentNode = null;
  }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  async emit(type, extra = {}) {
    const event = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra };
    await Promise.all((this.listeners[type] || []).map((callback) => callback(event)));
  }
  click() { return this.emit("click"); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    const attribute = selector.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
      const key = attribute[1].startsWith("data-") ? attribute[1].slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase()) : null;
      const actual = key ? this.dataset[key] : this.getAttribute(attribute[1]);
      return attribute[2] === undefined ? actual !== undefined && actual !== null : String(actual) === attribute[2];
    }
    return selector.toUpperCase() === this.tagName;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => { for (const child of node.children) { if (child.matches(selector)) found.push(child); visit(child); } };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set value(value) { this._value = String(value); }
  get value() {
    if (this.tagName === "SELECT" && !this.children.some((option) => option.value === this._value)) return "";
    return this._value ?? "";
  }
  get childElementCount() { return this.children.filter((child) => child instanceof FakeNode).length; }
  get offsetHeight() { return 44; }
}

const IDS = ["boss-name", "boss-phase", "boss-minimize", "boss-close", "boss-panel", "boss-list-view", "boss-abilities", "boss-manage-open",
  "boss-resolution", "boss-manage-view", "boss-manage-back", "boss-library", "boss-file", "boss-import", "boss-profile", "boss-bind",
  "boss-unbind", "boss-export", "boss-refresh", "boss-profile-info", "boss-profile-warning", "boss-delete-revision", "boss-prune",
  "boss-cleanup-info", "boss-resource-info", "boss-reset-resources", "boss-aura-info", "boss-restore-auras", "boss-status", "boss-undo"];

export function createBossActionsDocument() {
  const doc = {
    activeElement: null, listeners: {},
    createElement: (tag) => new FakeNode(doc, tag),
    getElementById: (id) => doc.root.querySelector("#" + id),
    querySelector: (selector) => doc.root.querySelector(selector),
    querySelectorAll: (selector) => doc.root.querySelectorAll(selector),
    addEventListener(type, callback) { (doc.listeners[type] ||= []).push(callback); },
    async keydown(key) { await Promise.all((doc.listeners.keydown || []).map((callback) => callback({ key, preventDefault() {} }))); },
  };
  doc.root = new FakeNode(doc, "body"); doc.body = doc.root;
  const header = new FakeNode(doc, "header"); header.className = "header"; doc.root.appendChild(header);
  for (const id of IDS) {
    const node = new FakeNode(doc, id === "boss-profile" ? "select" : ["boss-minimize", "boss-close", "boss-manage-open", "boss-manage-back", "boss-import", "boss-bind", "boss-unbind", "boss-export", "boss-refresh", "boss-undo", "boss-delete-revision", "boss-prune", "boss-reset-resources", "boss-restore-auras"].includes(id) ? "button" : "div");
    node.id = id; (id === "boss-name" || id === "boss-phase" || id === "boss-minimize" || id === "boss-close" ? header : doc.root).appendChild(node);
  }
  return doc;
}

export const textOf = (node) => [node.textContent, ...(node.children || []).map(textOf)].join(" ").replace(/\s+/g, " ");

// Session storage double shared across boots, to emulate a popover reload.
export function createMemorySessionStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), clear: () => data.clear() };
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyToolbarLayoutPresentation,
  buildGlobalPanelButton,
  buildToolbarButton,
  buildToolbarSection,
  decorateToolbarControl,
  setToolbarToggleVisual,
} from "../src/initiativeToolbar.js";

function createTestDocument() {
  const matches = (element, selector) => {
    if (selector === "img") return element.tagName === "IMG";
    if (selector === "[data-toolbar-control='1']") {
      return element.dataset.toolbarControl === "1";
    }
    if (selector === "[data-toolbar-caption='1']") {
      return element.dataset.toolbarCaption === "1";
    }
    return false;
  };
  const descendants = (element) => element.children.flatMap(
    (child) => [child, ...descendants(child)],
  );

  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        listeners: {},
        textContent: "",
        title: "",
        append(...children) {
          this.children.push(...children);
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        getAttribute(name) {
          return this.attributes[name] ?? null;
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        querySelector(selector) {
          return descendants(this).find((element) => matches(element, selector)) || null;
        },
        querySelectorAll(selector) {
          return descendants(this).filter((element) => matches(element, selector));
        },
      };
    },
  };
}

test("i builder toolbar conservano struttura, caption e icona", () => {
  const documentRef = createTestDocument();
  const button = buildToolbarButton("▲", { documentRef });
  const content = documentRef.createElement("div");
  const toolbar = buildToolbarSection("Incontro", content, { documentRef });
  const panel = buildGlobalPanelButton("Spells", "spells.svg", {
    invert: true,
    baseUrl: "/plugin/",
    documentRef,
  });

  assert.equal(button.type, "button");
  assert.equal(button.tabIndex, -1);
  assert.equal(button.style.height, "28px");
  assert.equal(toolbar.heading.textContent, "Incontro");
  assert.deepEqual(toolbar.section.children, [toolbar.heading, content]);
  assert.equal(panel.attributes["aria-label"], "Spells");
  assert.equal(panel.children[0].src, "/plugin/spells.svg");
  assert.equal(panel.children[0].style.filter, "brightness(0) invert(1)");
  assert.equal(panel.querySelector("[data-toolbar-caption='1']").textContent, "Spells");
});

test("decorateToolbarControl e toggle visuale preservano stati classic e compact", () => {
  const documentRef = createTestDocument();
  const control = documentRef.createElement("button");
  decorateToolbarControl(control, "Follow", { documentRef });
  setToolbarToggleVisual(control, false, { compact: false });

  assert.equal(control.dataset.toolbarControl, "1");
  assert.equal(control.querySelector("[data-toolbar-caption='1']").textContent, "Follow");
  assert.equal(control.attributes["aria-pressed"], "false");
  assert.equal(
    control.style.background,
    "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
  );

  setToolbarToggleVisual(control, true, { compact: true });
  assert.equal(control.attributes["aria-pressed"], "true");
  assert.equal(
    control.style.background,
    "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))",
  );
});

test("la presentazione toolbar passa tra layout esteso e compatto", () => {
  const documentRef = createTestDocument();
  const viewOptionsRow = documentRef.createElement("div");
  const sceneOptionsGroup = documentRef.createElement("div");
  const toolOptionsGroup = documentRef.createElement("div");
  const globalPanelsWrap = documentRef.createElement("div");
  const encounterToolbar = buildToolbarSection(
    "Incontro",
    sceneOptionsGroup,
    { documentRef },
  );
  const trackersToolbar = buildToolbarSection(
    "Tracker",
    toolOptionsGroup,
    { documentRef },
  );
  const activeControl = buildGlobalPanelButton("Effetti", "effects.svg", { documentRef });
  activeControl.setAttribute("aria-pressed", "true");
  const inactiveControl = buildGlobalPanelButton("Spell", "spells.svg", { documentRef });
  inactiveControl.setAttribute("aria-pressed", "false");
  viewOptionsRow.append(activeControl, inactiveControl);
  const context = {
    isGM: true,
    viewOptionsRow,
    encounterToolbar,
    trackersToolbar,
    sceneOptionsGroup,
    toolOptionsGroup,
    globalPanelsWrap,
  };

  applyToolbarLayoutPresentation(false, context);
  assert.equal(viewOptionsRow.style.width, "100%");
  assert.equal(encounterToolbar.heading.style.display, "block");
  assert.equal(activeControl.style.width, "100%");
  assert.equal(activeControl.querySelector("[data-toolbar-caption='1']").style.display, "block");
  assert.match(activeControl.style.border, /147,197,253/);
  // The caption has the button's whole width and ends in "…" rather than touching the edges.
  assert.equal(activeControl.style.padding, "0");
  assert.equal(activeControl.querySelector("[data-toolbar-caption='1']").style.textOverflow, "ellipsis");

  applyToolbarLayoutPresentation(true, context);
  assert.equal(viewOptionsRow.style.width, "116px");
  assert.equal(encounterToolbar.heading.style.display, "none");
  assert.equal(inactiveControl.style.width, "100%");
  // The compact panel shows each tool's caption under its icon, at 10px, inside a 42px button: the four tools and
  // the Focus toggle fit the 156px compact tracker without cutting the second row.
  assert.equal(inactiveControl.style.height, "42px");
  assert.equal(inactiveControl.style.flexDirection, "column");
  assert.equal(viewOptionsRow.style.padding, "6px 4px");
  assert.equal(toolOptionsGroup.style.gap, "4px");
  assert.equal(toolOptionsGroup.style.padding, "5px 0 0");
  const compactCaption = inactiveControl.querySelector("[data-toolbar-caption='1']");
  assert.equal(compactCaption.style.display, "block");
  assert.equal(compactCaption.style.fontSize, "var(--obrt-type-micro, 10px)");
  assert.equal(compactCaption.style.textOverflow, "ellipsis");
});

test("un toggle spento resta riconoscibile anche nel pannello compatto", () => {
  const documentRef = createTestDocument();
  const control = documentRef.createElement("label");
  setToolbarToggleVisual(control, false, { compact: true });
  assert.equal(control.style.borderColor, "rgba(148,163,184,.24)");
  assert.equal(
    control.style.background,
    "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
  );
});

test("la toolbar non GM resta nascosta", () => {
  const documentRef = createTestDocument();
  const viewOptionsRow = documentRef.createElement("div");
  applyToolbarLayoutPresentation(false, {
    isGM: false,
    viewOptionsRow,
    encounterToolbar: {},
    trackersToolbar: {},
    sceneOptionsGroup: {},
    toolOptionsGroup: {},
    globalPanelsWrap: {},
  });
  assert.equal(viewOptionsRow.style.display, "none");
});

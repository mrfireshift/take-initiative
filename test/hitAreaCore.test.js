import test from "node:test";
import assert from "node:assert/strict";
import { HIT_AREA_MIN_SIZE, extendHitArea } from "../src/hitAreaCore.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
      };
    },
  };
}

test("l'area cliccabile è un quadrato trasparente di 24px centrato sul controllo", () => {
  const documentRef = createTestDocument();
  const button = documentRef.createElement("button");
  button.style.width = "15px";
  button.style.height = "15px";

  const area = extendHitArea(button, { documentRef });

  assert.equal(HIT_AREA_MIN_SIZE, 24);
  assert.deepEqual(button.children, [area]);
  assert.equal(area.dataset.hitArea, "1");
  assert.equal(area.attributes["aria-hidden"], "true");
  assert.equal(area.style.width, "24px");
  assert.equal(area.style.height, "24px");
  assert.equal(area.style.transform, "translate(-50%, -50%)");
  assert.equal(area.style.background, "transparent");
  // The drawing keeps its size; the static control becomes the square's containing block.
  assert.equal(button.style.width, "15px");
  assert.equal(button.style.position, "relative");
});

test("l'area cliccabile non cambia il posizionamento di un controllo già posizionato", () => {
  const documentRef = createTestDocument();
  const button = documentRef.createElement("button");
  button.style.position = "absolute";
  extendHitArea(button, { documentRef });
  assert.equal(button.style.position, "absolute");
});

test("senza un controllo o un documento l'area cliccabile non viene creata", () => {
  assert.equal(extendHitArea(null, { documentRef: createTestDocument() }), null);
  assert.equal(extendHitArea({ style: {} }, { documentRef: null }), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  spellExpiryCounter,
  spellExpiryDescription,
} from "../src/spellExpiryCore.js";

test("le scadenze di turno distinguono fase, caster e bersaglio", () => {
  assert.equal(spellExpiryCounter({
    expiry: { mode: "turn-start", actor: "source", remaining: 1 },
  }), "I C");
  assert.equal(spellExpiryCounter({
    expiry: { mode: "turn-end", actor: "target", remaining: 2 },
  }), "F:2 B");
  assert.equal(spellExpiryDescription({
    expiry: { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" },
  }), "scade all'inizio del turno successivo del caster");
});

test("le durate a round mantengono il contatore numerico precedente", () => {
  assert.equal(spellExpiryCounter({ turns: 7 }), "7");
  assert.equal(spellExpiryDescription({ turns: 7 }), "7 round rimanenti");
});

test("le spell senza durata determinabile mostrano la rimozione manuale", () => {
  const spell = { turns: 1, expiry: { mode: "manual" } };
  assert.equal(spellExpiryCounter(spell), "M");
  assert.equal(spellExpiryDescription(spell), "rimozione manuale");
});

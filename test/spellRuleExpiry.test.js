import test from "node:test";
import assert from "node:assert/strict";

import {
  getSpellDefinition,
  getSpellEffects,
} from "../src/spells-srd.js";

const NEXT_TURN_EXPIRIES = Object.freeze({
  "Assorbire Elementi": ["turn-end", "source"],
  "Tocco gelido": ["turn-start", "source"],
  "Spruzzo colorato": ["turn-start", "source"],
  "Comando": ["turn-end", "target"],
  "Dardo tracciante": ["turn-end", "source"],
  "Messaggio": ["turn-start", "source"],
  "Inviare": ["turn-start", "source"],
  "Scudo": ["turn-start", "source"],
  "Cerchio di teletrasporto": ["turn-end", "source"],
  "Trasporto vegetale": ["turn-start", "source"],
  "Colpo accurato": ["turn-end", "source"],
  "Lama Roboante": ["turn-start", "source"],
  "Scheggia della Mente": ["turn-end", "source"],
  "Scudiscio Mentale di Tasha": ["turn-end", "target"],
});

test("le spell revisionate dichiarano esplicitamente il turno successivo", () => {
  for (const [name, [mode, actor]] of Object.entries(NEXT_TURN_EXPIRIES)) {
    const spell = getSpellDefinition(name);
    assert.ok(spell, name);
    assert.deepEqual(spell.expiry, {
      mode,
      actor,
      remaining: 1,
      anchor: "next-turn",
    }, name);
  }
});

test("Scheggia della Mente dura fino alla fine del turno successivo o al prossimo TS", () => {
  const [effect] = getSpellEffects("Scheggia della Mente");
  assert.equal(effect.manualRemoval, true);
  assert.equal(effect.endsParentOnRemoval, true);
  assert.deepEqual(effect.expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
});

test("Assorbire Elementi separa resistenza e danno caricato", () => {
  const effects = getSpellEffects("Assorbire Elementi", "fuoco");
  assert.equal(effects.length, 2);
  assert.deepEqual(effects[0].expiry, {
    mode: "turn-start",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.equal(effects[1].manualRemoval, true);
  assert.equal(effects[1].endsParentOnRemoval, true);
  assert.deepEqual(effects[1].expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
});

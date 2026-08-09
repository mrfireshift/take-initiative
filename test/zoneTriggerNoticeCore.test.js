import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeZoneTriggerNotice,
  planZoneTriggerNoticeDelivery,
  shouldClearZoneNoticeAtTurn,
  zoneTriggerNoticeDetail,
  zoneTriggerNoticeFromActivation,
} from "../src/zoneTriggerNoticeCore.js";
import { ID } from "../src/constants.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";

const META_KEY = `${ID}/meta`;

function validNotice(activationId, targetId = "target-1") {
  return {
    activationId,
    spellName: "Ragnatela",
    label: "TS Destrezza richiesto",
    targets: [{
      id: targetId,
      name: `Token ${targetId}`,
      portrait: `https://example.test/${targetId}.png`,
    }],
  };
}

test("consegna più notice valide consecutive mantenendone l'ordine", () => {
  const result = planZoneTriggerNoticeDelivery([
    validNotice("activation-1", "target-1"),
    validNotice("activation-2", "target-2"),
    validNotice("activation-3", "target-3"),
  ]);

  assert.deepEqual(
    result.notices.map((notice) => notice.activationId),
    ["activation-1", "activation-2", "activation-3"],
  );
  assert.deepEqual(
    result.announcedIds,
    ["activation-1", "activation-2", "activation-3"],
  );
});

test("deduplica gli ID già annunciati e i duplicati nello stesso batch", () => {
  const result = planZoneTriggerNoticeDelivery([
    validNotice("already-announced"),
    validNotice("new-activation", "target-2"),
    validNotice("new-activation", "target-3"),
  ], ["already-announced"]);

  assert.deepEqual(
    result.notices.map((notice) => notice.activationId),
    ["new-activation"],
  );
  assert.deepEqual(
    result.announcedIds,
    ["already-announced", "new-activation"],
  );
  assert.equal(result.notices[0].targets[0].id, "target-2");
});

test("una notice invalida non viene marcata e resta recuperabile", () => {
  const invalid = planZoneTriggerNoticeDelivery([{
    activationId: "recoverable",
    spellName: "Ragnatela",
    targets: [],
  }]);

  assert.deepEqual(invalid.notices, []);
  assert.deepEqual(invalid.announcedIds, []);

  const recovered = planZoneTriggerNoticeDelivery(
    [validNotice("recoverable", "target-later")],
    invalid.announcedIds,
  );

  assert.deepEqual(
    recovered.notices.map((notice) => notice.activationId),
    ["recoverable"],
  );
  assert.deepEqual(recovered.announcedIds, ["recoverable"]);
});

test("normalizza i target, scarta quelli senza ID e applica i fallback", () => {
  const notice = normalizeZoneTriggerNotice({
    activationId: "  activation-normalized  ",
    event: "turn-start",
    spellName: "   ",
    label: "",
    failureEffect: "  Trattenuto dalla Ragnatela.  ",
    targets: [
      {
        id: "  target-valid  ",
        name: "   ",
        portrait: "  https://example.test/portrait.png  ",
      },
      {
        id: "   ",
        name: "Da scartare",
      },
      null,
    ],
  });

  assert.deepEqual(notice, {
    activationId: "activation-normalized",
    timing: "turn-start",
    spellName: "Incantesimo",
    label: "Tiro salvezza richiesto",
    failureEffect: "Trattenuto dalla Ragnatela.",
    targets: [{
      id: "target-valid",
      name: "Token",
      portrait: "https://example.test/portrait.png",
    }],
  });
});

test("costruisce una notice persistita usando zona e token correnti", () => {
  const itemsById = new Map([
    ["zone", {
      id: "zone",
      name: "Zona: Ragnatela",
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: { casterId: "caster" },
      },
    }],
    ["caster", {
      id: "caster",
      name: "Lavera",
      metadata: {
        [META_KEY]: { initiativeCard: { spellSaveDC: 19 } },
      },
    }],
    ["target", {
      id: "target",
      name: "(6) Nothic",
      image: { url: "https://example.test/nothic.png" },
    }],
  ]);
  const notice = zoneTriggerNoticeFromActivation({
    id: "activation-2",
    zoneItemId: "zone",
    turnKey: "2:1:target",
    noticeTurnKey: "2:2:next",
    event: "turn-start",
    label: "TS Destrezza a inizio turno",
    failureEffect: "Trattenuto dalla Ragnatela.",
    targetIds: ["target"],
  }, itemsById);

  assert.equal(notice.activationId, "activation-2");
  assert.equal(notice.turnKey, "2:2:next");
  assert.equal(notice.timing, "turn-start");
  assert.equal(notice.spellName, "Ragnatela");
  assert.equal(notice.dc, 19);
  assert.equal(notice.casterName, "Lavera");
  assert.equal(notice.failureEffect, "Trattenuto dalla Ragnatela.");
  assert.equal(notice.targets[0].name, "(6) Nothic");
  assert.equal(
    notice.targets[0].portrait,
    "https://example.test/nothic.png",
  );

  itemsById.get("caster").metadata[META_KEY]
    .initiativeCard.spellSaveDC = 14;
  const updatedNotice = zoneTriggerNoticeFromActivation({
    id: "activation-3",
    zoneItemId: "zone",
    label: "TS Destrezza a inizio turno",
    targetIds: ["target"],
  }, itemsById);
  assert.equal(updatedNotice.dc, 14);
});

test("compone TS, CD e nome del caster su una sola riga", () => {
  const notice = {
    ...validNotice("activation-detail"),
    label: "TS Destrezza a inizio turno nella Ragnatela",
    failureEffect: "Trattenuto dalla Ragnatela.",
    casterName: "Lavera",
    targets: [{
      id: "nothic",
      name: "Nothic",
      portrait: "",
    }],
  };
  assert.equal(
    zoneTriggerNoticeDetail({ ...notice, dc: 19 }),
    "TS Destrezza CD 19 (Lavera) — Fallimento: Trattenuto dalla Ragnatela.",
  );
  assert.equal(
    zoneTriggerNoticeDetail(notice),
    "TS Destrezza (Lavera) — Fallimento: Trattenuto dalla Ragnatela.",
  );
});

test("un danno automatico produce una notice informativa senza TS o CD", () => {
  const itemsById = new Map([
    ["zone", {
      id: "zone",
      name: "Zona: Muro di Luce",
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: { casterId: "caster" },
      },
    }],
    ["caster", {
      id: "caster",
      name: "Lavera",
      metadata: {
        [META_KEY]: { initiativeCard: { spellSaveDC: 19 } },
      },
    }],
    ["target", {
      id: "target",
      name: "Nothic",
    }],
  ]);
  const notice = zoneTriggerNoticeFromActivation({
    id: "automatic-damage",
    zoneItemId: "zone",
    event: "turn-end",
    resolution: "informational",
    label: "4d8 danni radiosi automatici a fine turno nel Muro di Luce.",
    targetIds: ["target"],
  }, itemsById);

  assert.equal(notice.kind, "zone-effect");
  assert.equal(
    zoneTriggerNoticeDetail(notice),
    "4d8 danni radiosi automatici a fine turno nel Muro di Luce.",
  );
});

test("un TS informativo conserva istruzione, CD e caster", () => {
  const notice = {
    ...validNotice("concentration-save"),
    kind: "zone-effect",
    label: "TS Costituzione per mantenere la concentrazione; se fallisce, la perde.",
    dc: 18,
    casterName: "Lavera",
  };

  assert.equal(
    zoneTriggerNoticeDetail(notice),
    "TS Costituzione CD 18 (Lavera) per mantenere la concentrazione; se fallisce, la perde.",
  );
});

test("il reminder dello Spirito legge lo slot dell'istanza e avvisa sul tipo sconosciuto", () => {
  const itemsById = new Map([
    ["zone", {
      id: "zone",
      name: "Zona: Spirito Guaritore",
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: { casterId: "caster" },
      },
    }],
    ["caster", {
      id: "caster",
      metadata: {
        [META_KEY]: {
          [ID + "/spells"]: [{
            instanceId: "spirit-1",
            castContext: { slotLevel: 3 },
          }],
        },
      },
    }],
    ["target", {
      id: "target",
      name: "Bersaglio",
      metadata: { [META_KEY]: { hp: 4, hpMax: 10 } },
    }],
  ]);
  const notice = zoneTriggerNoticeFromActivation({
    id: "heal-activation",
    zoneItemId: "zone",
    instanceId: "spirit-1",
    resolution: "manual-heal",
    healing: { dice: "1d6", additionalPerSlotAbove: 1, baseSlot: 2 },
    targetIds: ["target"],
  }, itemsById);

  assert.equal(notice.resolution.mode, "manual-heal");
  assert.equal(notice.resolution.healing.dice, "2d6");
  assert.match(notice.instruction, /Costrutti e Non Morti/);
});

test("il cambio turno conserva un reminder già arrivato per lo stesso turno", () => {
  assert.equal(
    shouldClearZoneNoticeAtTurn("2:1:nothic", "2:1:nothic"),
    false,
  );
  assert.equal(
    shouldClearZoneNoticeAtTurn("2:0:lavera", "2:1:nothic"),
    true,
  );
  assert.equal(
    shouldClearZoneNoticeAtTurn("", "2:1:nothic"),
    true,
  );
});

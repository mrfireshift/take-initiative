import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeZoneTriggerNotice,
  planZoneTriggerNoticeDelivery,
  zoneTriggerNoticeFromActivation,
} from "../src/zoneTriggerNoticeCore.js";

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
    spellName: "   ",
    label: "",
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
    spellName: "Incantesimo",
    label: "Tiro salvezza richiesto",
    targets: [{
      id: "target-valid",
      name: "Token",
      portrait: "https://example.test/portrait.png",
    }],
  });
});

test("costruisce una notice persistita usando zona e token correnti", () => {
  const itemsById = new Map([
    ["zone", { id: "zone", name: "Zona: Ragnatela" }],
    ["target", {
      id: "target",
      name: "(6) Nothic",
      image: { url: "https://example.test/nothic.png" },
    }],
  ]);
  const notice = zoneTriggerNoticeFromActivation({
    id: "activation-2",
    zoneItemId: "zone",
    label: "TS Destrezza a inizio turno",
    targetIds: ["target"],
  }, itemsById);

  assert.equal(notice.activationId, "activation-2");
  assert.equal(notice.spellName, "Ragnatela");
  assert.equal(notice.targets[0].name, "(6) Nothic");
  assert.equal(
    notice.targets[0].portrait,
    "https://example.test/nothic.png",
  );
});

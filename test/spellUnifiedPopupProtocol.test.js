import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpellUnifiedPopupEvent,
  isSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_EVENT,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "../src/spellUnifiedPopupProtocol.js";

test("il protocollo popup filtra evento, istanza e azione", () => {
  const event = buildSpellUnifiedPopupEvent({
    source: "spell-active-resolution",
    status: SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED,
    instanceId: "instance-1",
    actionId: "action-1",
    popoverId: "popover-1",
    message: "ok",
  });

  assert.equal(event.type, SPELL_UNIFIED_PANEL_POPUP_EVENT);
  assert.equal(isSpellUnifiedPopupEvent(event, {
    instanceId: "instance-1",
    actionId: "action-1",
  }), true);
  assert.equal(isSpellUnifiedPopupEvent({ data: event }, {
    instanceId: "instance-2",
    actionId: "action-1",
  }), false);
  assert.equal(isSpellUnifiedPopupEvent(event, {
    instanceId: "instance-1",
    actionId: "action-1",
    popoverId: "other-popover",
  }), false);
});

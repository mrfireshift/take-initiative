import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPACT_ADMIN_MENU_ACTIONS,
  INITIATIVE_CARD_ATTITUDES,
  INITIATIVE_CARD_BOSS_MODES,
  createMenuMessage,
  createMenuRequestId,
  isAllowedCompactAdminMenuAction,
  isAllowedInitiativeCardMenuAction,
  isMenuMessageForRequest,
  menuPayloadStorageKey,
  readStoredMenuPayload,
  removeStoredMenuPayload,
  writeStoredMenuPayload,
} from "../src/menuPopoverProtocolCore.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("gli ID request dei menu sono deterministici con sorgenti iniettate", () => {
  const first = createMenuRequestId({
    now: () => 1234,
    random: () => 0.25,
  });
  const second = createMenuRequestId({
    now: () => 1234,
    random: () => 0.75,
  });

  assert.match(first, /^1234-[a-z0-9]{7}$/);
  assert.notEqual(first, second);
});

test("i messaggi sono accettati soltanto dalla request attiva", () => {
  const message = createMenuMessage("request-1", "action", {
    action: "history",
  });

  assert.deepEqual(message, {
    action: "history",
    type: "action",
    requestId: "request-1",
  });
  assert.equal(isMenuMessageForRequest(message, "request-1"), true);
  assert.equal(isMenuMessageForRequest(message, "request-2"), false);
  assert.equal(isMenuMessageForRequest(message, ""), false);
  assert.equal(isMenuMessageForRequest(null, "request-1"), false);
});

test("il payload del menu usa una chiave isolata e viene rimosso alla chiusura", () => {
  const storage = createMemoryStorage();
  const prefix = "plugin/menu/";
  const requestId = "request-1";
  const payload = { title: "Goblin", scopeCount: 2 };

  assert.equal(menuPayloadStorageKey(prefix, requestId), "plugin/menu/request-1");
  assert.equal(writeStoredMenuPayload(storage, prefix, requestId, payload), true);
  assert.deepEqual(readStoredMenuPayload(storage, prefix, requestId), payload);
  assert.equal(removeStoredMenuPayload(storage, prefix, requestId), true);
  assert.equal(readStoredMenuPayload(storage, prefix, requestId), null);
});

test("payload mancanti o corrotti non attraversano il protocollo", () => {
  const storage = createMemoryStorage();
  storage.setItem("plugin/menu/request-1", "{");

  assert.equal(readStoredMenuPayload(storage, "plugin/menu/", "request-1"), null);
  assert.equal(readStoredMenuPayload(storage, "plugin/menu/", ""), null);
  assert.equal(writeStoredMenuPayload(storage, "plugin/menu/", "", {}), false);
});

test("le azioni del menu admin sono limitate al contratto condiviso", () => {
  for (const action of COMPACT_ADMIN_MENU_ACTIONS) {
    assert.equal(isAllowedCompactAdminMenuAction(action), true, action);
  }
  assert.equal(isAllowedCompactAdminMenuAction("unknown"), false);
  assert.equal(isAllowedCompactAdminMenuAction(""), false);
});

test("le azioni parametrizzate della card accettano soltanto valori noti", () => {
  assert.equal(isAllowedInitiativeCardMenuAction("conditions"), true);
  assert.equal(isAllowedInitiativeCardMenuAction("remove"), true);
  for (const value of INITIATIVE_CARD_ATTITUDES) {
    assert.equal(isAllowedInitiativeCardMenuAction("attitude", value), true, value);
  }
  for (const value of INITIATIVE_CARD_BOSS_MODES) {
    assert.equal(isAllowedInitiativeCardMenuAction("boss-mode", value), true, value);
  }
  assert.equal(isAllowedInitiativeCardMenuAction("attitude", "hostile"), false);
  assert.equal(isAllowedInitiativeCardMenuAction("boss-mode", "mythic"), false);
  assert.equal(isAllowedInitiativeCardMenuAction("unknown"), false);
});

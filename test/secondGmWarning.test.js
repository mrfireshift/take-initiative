import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  otherGmConnections,
  secondGmWarningText,
  unwarnedGmConnections,
} from "../src/secondGmWarningCore.js";

mock.module("@owlbear-rodeo/sdk", { defaultExport: {} });
const { mountSecondGmWarning } = await import("../src/secondGmWarning.js");

const gm = (connectionId, name = "Federico") => ({ connectionId, name, role: "GM" });
const player = (connectionId, name) => ({ connectionId, name, role: "PLAYER" });

test("conta gli altri client GM, non se stesso né i giocatori", () => {
  const others = otherGmConnections([gm("self"), gm("tab-2"), player("p1", "Mario"), gm("tab-2")], "self");
  assert.deepEqual(others, [{ connectionId: "tab-2", name: "Federico" }]);
  assert.deepEqual(otherGmConnections([player("p1", "Mario")], "self"), []);
  assert.deepEqual(otherGmConnections(null, "self"), []);
});

test("avvisa una volta per connessione e nomina chi è", () => {
  const warned = new Set(["tab-2"]);
  assert.deepEqual(unwarnedGmConnections([{ connectionId: "tab-2" }, { connectionId: "co-gm" }], warned), [{ connectionId: "co-gm" }]);
  assert.match(secondGmWarningText([{ connectionId: "co-gm", name: "Anna" }]), /altro client GM \(Anna\)/);
  assert.doesNotMatch(secondGmWarningText([{ connectionId: "co-gm", name: "" }]), /\(/);
});

function fakeObr(initialPlayers) {
  const notices = [];
  let partyListener = null;
  return {
    notices,
    emit: (players) => partyListener(players),
    player: { getConnectionId: async () => "self" },
    party: {
      getPlayers: async () => initialPlayers,
      onChange: (listener) => { partyListener = listener; return () => {}; },
    },
    notification: { show: async (message, variant) => { notices.push({ message, variant }); } },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("il background del GM mostra l'avviso quando entra un secondo GM, e non lo ripete", async () => {
  const obr = fakeObr([player("p1", "Mario")]);
  mountSecondGmWarning({ obr });
  await settle();
  assert.equal(obr.notices.length, 0);

  obr.emit([player("p1", "Mario"), gm("tab-2")]);
  await settle();
  assert.equal(obr.notices.length, 1);
  assert.equal(obr.notices[0].variant, "WARNING");

  obr.emit([player("p1", "Mario"), gm("tab-2")]);
  await settle();
  assert.equal(obr.notices.length, 1);
});

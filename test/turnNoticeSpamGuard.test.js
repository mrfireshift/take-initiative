import test from "node:test";
import assert from "node:assert/strict";
import {
  TURN_NOTICE_SPAM_GUARD_ENABLED,
  enqueueTurnNoticeHostPayload,
  shouldSuppressTurnNoticeBroadcast,
} from "../src/turnNoticeHostCore.js";

test("lo spam conserva solo l'ultimo Turn Notice in attesa", () => {
  const first = { type: "show-turn-notice", turnKey: "r1:t1" };
  const latest = { type: "show-turn-notice", turnKey: "r1:t4" };
  assert.deepEqual(
    enqueueTurnNoticeHostPayload([first], latest),
    [latest],
  );
});

test("il latest-wins non elimina TS o reminder di zona", () => {
  const save = { type: "show-effect-save-notices", notices: [{ activationId: "save-1" }] };
  const first = { type: "show-turn-notice", turnKey: "r1:t1" };
  const zone = { type: "show-zone-trigger-notices", notices: [{ activationId: "zone-1" }] };
  const latest = { type: "show-turn-notice", turnKey: "r1:t4" };
  assert.deepEqual(
    enqueueTurnNoticeHostPayload([save, first, zone], latest),
    [save, latest, zone],
  );
});

test("una navigazione superata non trasmette il warning intermedio", () => {
  assert.equal(TURN_NOTICE_SPAM_GUARD_ENABLED, true);
  assert.equal(shouldSuppressTurnNoticeBroadcast({
    flushRevision: 3,
    currentRevision: 4,
    flushedActiveId: "token-3",
    latestActiveId: "token-4",
  }), true);
  assert.equal(shouldSuppressTurnNoticeBroadcast({
    flushRevision: 4,
    currentRevision: 4,
    flushedActiveId: "token-4",
    latestActiveId: "token-4",
  }), false);
});

test("il rollback del flag ripristina FIFO e broadcast intermedi", () => {
  const first = { type: "show-turn-notice", turnKey: "r1:t1" };
  const latest = { type: "show-turn-notice", turnKey: "r1:t4" };
  assert.deepEqual(
    enqueueTurnNoticeHostPayload([first], latest, { latestWins: false }),
    [first, latest],
  );
  assert.equal(shouldSuppressTurnNoticeBroadcast({
    enabled: false,
    flushRevision: 3,
    currentRevision: 4,
    hasPendingNavigation: true,
  }), false);
});

test("un layout hidden obsoleto non può chiudere un Turn Notice reso visibile dopo", async () => {
  const {
    acceptTurnNoticeLayoutRevision,
    shouldCloseTurnNoticeFromHiddenLayout,
  } = await import("../src/turnNoticeHostCore.js");

  const hidden = acceptTurnNoticeLayoutRevision(0, 1);
  assert.deepEqual(hidden, { accepted: true, revision: 1 });

  const visible = acceptTurnNoticeLayoutRevision(hidden.revision, 2);
  assert.deepEqual(visible, { accepted: true, revision: 2 });

  assert.equal(shouldCloseTurnNoticeFromHiddenLayout({
    scheduledLayoutRevision: hidden.revision,
    latestLayoutRevision: visible.revision,
    awaitingVisibleLayout: false,
    scheduledActivityRevision: 4,
    currentActivityRevision: 4,
    pendingPayloadCount: 0,
  }), false);
});

test("un layout arrivato fuori ordine viene scartato tramite revision monotona", async () => {
  const { acceptTurnNoticeLayoutRevision } = await import("../src/turnNoticeHostCore.js");
  const visible = acceptTurnNoticeLayoutRevision(0, 2);
  const staleHidden = acceptTurnNoticeLayoutRevision(visible.revision, 1);
  assert.deepEqual(visible, { accepted: true, revision: 2 });
  assert.deepEqual(staleHidden, { accepted: false, revision: 2 });
});

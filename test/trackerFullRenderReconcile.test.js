import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L28 of the bugfix pass: the full render of the tracker.
const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const slice = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} not found`);
  return source.slice(start, end);
};

class FakeElement {
  constructor(itemId, html, entry) {
    this.dataset = { trackerCard: "1", itemId };
    this.innerHTML = html;
    this.__entrySignature = signature(entry);
    this.track = null;
  }
  replaceWith(next) {
    const index = this.track.children.indexOf(this);
    this.track.children[index] = next;
    next.track = this.track;
  }
}

let signature;
function reconcileRuntime(track) {
  const runtime = new Function("track", "HTMLElement", `
    const __copyTrackerCardOuterState = () => {};
    const __initiativeDiag = () => {};
    const isCompactTrackerLayout = () => false;
    ${slice("function __trackerEntryListenerSignature(entry) {", "const ACTIVE_CARD_VISUAL_PROPERTIES")}
    return { reconcile: __reconcileTrackCardsById, signature: __trackerEntryListenerSignature };
  `)(track, FakeElement);
  signature = runtime.signature;
  return runtime;
}

test("L28 (RN-02): una card con lo stesso HTML ma azioni rapide cambiate viene sostituita", () => {
  const track = { children: [] };
  const runtime = reconcileRuntime(track);
  const oldEntry = { id: "fighter", name: "Guerriera", hp: 30, hpMax: 30, quickActions: [{ id: "longsword" }] };
  const live = new FakeElement("fighter", "<b>Guerriera</b>", oldEntry);
  live.track = track;
  track.children.push(live);

  const sameEntry = new FakeElement("fighter", "<b>Guerriera</b>", { ...oldEntry });
  assert.equal(runtime.reconcile([sameEntry]), true);
  assert.equal(track.children[0], live, "a card whose data did not change keeps its node");

  const changedEntry = { ...oldEntry, quickActions: [{ id: "greatsword" }] };
  const next = new FakeElement("fighter", "<b>Guerriera</b>", changedEntry);
  assert.equal(runtime.reconcile([next]), true);
  assert.equal(track.children[0], next, "the card's listeners read the new quick actions");
});

test("L28 (RN-02): le card compatte e classiche portano la firma dei loro dati", () => {
  const assignments = source.match(/card\.__entrySignature = __trackerEntryListenerSignature\(entry\);/g) || [];
  assert.equal(assignments.length, 2);
});

test("L28 (RN-03): un render scartato durante la navigazione lascia il tracker da ridisegnare", () => {
  const staleSkip = slice("if (__isStaleNavigationState(stateRaw)) {", "render:skipped-stale-navigation");
  assert.match(staleSkip, /__fullRenderDirty = true;/);
  assert.match(
    source,
    /reason === "metadata" && cleanDigest === __optimisticNavigationDigest && !__fullRenderDirty\)/,
    "the render that acknowledges the optimistic turn draws the tracker when a render was dropped",
  );
});

test("L28 (RN-07): il render completo aspetta la fine della rinomina", () => {
  const guard = slice("// Evita rimpiazzi DOM mentre c'è un editor aperto", "// costruisci la lista");
  assert.match(guard, /track\.querySelector\("\[data-renaming='1'\]"\)/);
  assert.match(guard, /__fullRenderDirty = true;/);
  assert.match(source, /track\.addEventListener\(TRACKER_RENAME_FINISHED_EVENT, \(\) => __scheduleEditorDirtyFlush\(\)\);/);
});

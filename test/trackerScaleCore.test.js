import test from "node:test";
import assert from "node:assert/strict";

import {
  classicTrackerScaledFrame,
  compactTrackerScale,
  compactTrackerScaledHeight,
  compactTrackerScaledWidth,
  effectiveTrackerScale,
  normalizeTrackerScale,
  TRACKER_SCALE_CHOICES,
  TRACKER_SCALE_MAX,
  TRACKER_SCALE_MIN,
} from "../src/trackerScaleCore.js";
import { compactTrackerViewportWidth } from "../src/trackerCompactSizingCore.js";
import {
  compactRoomOptionsForStorage,
  normalizeRoomOptions,
} from "../src/options/optionsNormalize.js";
import { normalizeLocalOptions } from "../src/options/optionsNormalize.js";
import { createDefaultLocalOptions, createDefaultRoomOptions } from "../src/options/optionsDefaults.js";
import {
  buildOptionsPanelPatches,
  normalizeOptionsPanelDraft,
} from "../src/options/optionsPanelCore.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import {
  selectGmTrackerScale,
  selectOptionsPanelModel,
  selectPlayerTrackerScale,
} from "../src/options/optionsSelectors.js";

// ---- normalization ----

test("trackerScale: default 1 nella room e nessuna voce salvata quando resta al default", () => {
  assert.equal(createDefaultRoomOptions().playerView.trackerScale, 1);
  assert.equal(normalizeRoomOptions({}).playerView.trackerScale, 1);
  assert.equal(compactRoomOptionsForStorage({}).playerView, undefined);
  assert.deepEqual(
    compactRoomOptionsForStorage({ playerView: { trackerScale: 1.5 } }).playerView,
    { trackerScale: 1.5 },
  );
});

test("trackerScale: valori validi, stringhe del pannello, fuori range e corrotti", () => {
  for (const choice of TRACKER_SCALE_CHOICES) assert.equal(normalizeTrackerScale(choice), choice);
  assert.equal(normalizeTrackerScale("1.5"), 1.5);
  assert.equal(normalizeTrackerScale("2"), 2);
  // slider from 50% to 200%, snapped to 5% without floating point leftovers
  assert.equal(TRACKER_SCALE_MIN, 0.5);
  assert.equal(TRACKER_SCALE_MAX, 2);
  assert.equal(normalizeTrackerScale(1.3), 1.3);
  assert.equal(normalizeTrackerScale(1.4), 1.4);
  assert.equal(normalizeTrackerScale(1.32), 1.3);
  assert.equal(normalizeTrackerScale(0.73), 0.75);
  assert.equal(normalizeTrackerScale("0.55"), 0.55);
  assert.equal(normalizeTrackerScale(0.5), 0.5);
  assert.equal(normalizeTrackerScale(0.2), 0.5);
  assert.equal(normalizeTrackerScale(-3), 0.5);
  assert.equal(normalizeTrackerScale(9), 2);
  for (let percent = 50; percent <= 200; percent += 5) {
    assert.equal(normalizeTrackerScale(percent / 100), percent / 100, String(percent));
  }
  for (const invalid of [undefined, null, "", "  ", "abc", NaN, Infinity, true, {}, []]) {
    assert.equal(normalizeTrackerScale(invalid), 1, String(invalid));
  }
  assert.equal(normalizeRoomOptions({ playerView: { trackerScale: "abc" } }).playerView.trackerScale, 1);
  assert.equal(normalizeRoomOptions({ playerView: { trackerScale: "1.75" } }).playerView.trackerScale, 1.75);
});

test("trackerScale: la normalizzazione conserva le altre voci playerView", () => {
  const room = normalizeRoomOptions({
    playerView: { trackerScale: 1.5, bossDetails: "hidden", futurePlayerPolicy: "keep" },
  });
  assert.equal(room.playerView.trackerScale, 1.5);
  assert.equal(room.playerView.bossDetails, "hidden");
  assert.equal(room.playerView.futurePlayerPolicy, "keep");
});

test("trackerScale: selector, modello e patch del pannello opzioni", () => {
  const options = resolveOptions({ room: { playerView: { trackerScale: 1.5 } } });
  assert.equal(selectPlayerTrackerScale(options), 1.5);
  assert.equal(selectOptionsPanelModel(options).room.trackerScale, 1.5);
  assert.equal(selectPlayerTrackerScale(resolveOptions({})), 1);

  const draft = normalizeOptionsPanelDraft({ room: { trackerScale: "1.75" } });
  assert.equal(draft.room.trackerScale, 1.75);
  const patches = buildOptionsPanelPatches({ room: { trackerScale: "2", bossDetails: "x" } });
  assert.equal(patches.room.playerView.trackerScale, 2);
  assert.equal(buildOptionsPanelPatches({}).room.playerView.trackerScale, 1);
});

test("trackerScale: i Player usano la scala Room, il GM quella locale (1 di default)", () => {
  assert.equal(effectiveTrackerScale(1.5, "PLAYER"), 1.5);
  assert.equal(effectiveTrackerScale(1.5, "player"), 1.5);
  assert.equal(effectiveTrackerScale(0.75, "PLAYER", 1.5), 0.75);
  assert.equal(effectiveTrackerScale(1.5, "GM"), 1);
  assert.equal(effectiveTrackerScale(1.5, "GM", 0.75), 0.75);
  assert.equal(effectiveTrackerScale(1.5, "GM", "1.25"), 1.25);
  assert.equal(effectiveTrackerScale(1.5, "GM", "abc"), 1);
  assert.equal(effectiveTrackerScale(1.5, null), 1);
  assert.equal(effectiveTrackerScale("abc", "PLAYER"), 1);
});

test("trackerScale GM: opzione locale con default 1, selector, modello e patch del pannello", () => {
  assert.equal(createDefaultLocalOptions().tracker.scale, 1);
  assert.equal(normalizeLocalOptions({}).tracker.scale, 1);
  assert.equal(normalizeLocalOptions({ tracker: { scale: "0.6" } }).tracker.scale, 0.6);
  assert.equal(normalizeLocalOptions({ tracker: { scale: "abc" } }).tracker.scale, 1);
  const local = normalizeLocalOptions({ tracker: { scale: 0.75, layout: "compact", futureLocal: "keep" } });
  assert.equal(local.tracker.layout, "compact");
  assert.equal(local.tracker.futureLocal, "keep");

  const options = resolveOptions({ local: { tracker: { scale: 0.75 } }, room: { playerView: { trackerScale: 1.5 } } });
  assert.equal(selectGmTrackerScale(options), 0.75);
  assert.equal(selectPlayerTrackerScale(options), 1.5);
  assert.equal(selectOptionsPanelModel(options).local.trackerScale, 0.75);
  assert.equal(selectGmTrackerScale(resolveOptions({})), 1);

  const draft = normalizeOptionsPanelDraft({ local: { trackerScale: "0.55" }, room: { trackerScale: "1.2" } });
  assert.equal(draft.local.trackerScale, 0.55);
  assert.equal(draft.room.trackerScale, 1.2);
  const patches = buildOptionsPanelPatches(draft);
  assert.equal(patches.local.tracker.scale, 0.55);
  assert.equal(patches.room.playerView.trackerScale, 1.2);
});

// ---- sizing ----

test("tracker esteso: con la scala a 1 le misure restano quelle storiche", () => {
  for (const [viewportWidth, viewportHeight] of [[1200, 900], [1920, 1080], [800, 400], [300, 200]]) {
    assert.deepEqual(
      classicTrackerScaledFrame(1, { viewportWidth, viewportHeight }),
      { scale: 1, width: 340, height: Math.max(360, Math.floor(viewportHeight - 124)) },
    );
  }
});

test("tracker esteso: con la scala a 1,5 la larghezza cresce in proporzione e resta nel viewport", () => {
  const frame = classicTrackerScaledFrame(1.5, { viewportWidth: 1920, viewportHeight: 1080 });
  assert.deepEqual(frame, { scale: 1.5, width: 510, height: 956 });
  // left 22 + width + 12 of margin within the screen
  assert.ok(22 + frame.width + 12 <= 1920);

  const narrow = classicTrackerScaledFrame(1.5, { viewportWidth: 500, viewportHeight: 900 });
  assert.ok(narrow.scale < 1.5 && narrow.scale >= 1);
  assert.ok(22 + narrow.width + 12 <= 500, JSON.stringify(narrow));
  assert.equal(narrow.width, Math.round(340 * narrow.scale));

  const tiny = classicTrackerScaledFrame(2, { viewportWidth: 300, viewportHeight: 900 });
  assert.deepEqual(tiny, { scale: 1, width: 340, height: 776 });
});

test("tracker esteso: il bordo di aggancio (inset) limita la scala", () => {
  const right = classicTrackerScaledFrame(2, { viewportWidth: 800, viewportHeight: 900, inset: 96 });
  assert.ok(96 + right.width + 12 <= 800, JSON.stringify(right));
});

test("barra compatta: con la scala a 1 le misure restano quelle storiche", () => {
  assert.equal(compactTrackerScale(1, { viewportHeight: 900 }), 1);
  assert.equal(compactTrackerScaledHeight(1, { viewportHeight: 900 }), 156);
  assert.equal(compactTrackerScaledHeight(1, { viewportHeight: 900, currentHeight: 152 }), 152);
  assert.equal(compactTrackerScaledHeight(1, { viewportHeight: 900, currentHeight: 400 }), 156);
  for (const width of [200, 394, 782, 1180, 1500]) {
    for (const viewportWidth of [300, 900, 1400]) {
      assert.equal(
        compactTrackerScaledWidth(width, 1, { viewportWidth }),
        compactTrackerViewportWidth(width, viewportWidth),
      );
      assert.equal(
        compactTrackerViewportWidth(width, viewportWidth, 1),
        compactTrackerViewportWidth(width, viewportWidth),
      );
    }
  }
});

test("barra compatta: con la scala a 1,5 altezza e larghezza crescono e restano nel viewport", () => {
  assert.equal(compactTrackerScale(1.5, { viewportHeight: 1080 }), 1.5);
  assert.equal(compactTrackerScaledHeight(1.5, { viewportHeight: 1080 }), 234);
  // a bar opened before the scale changed (156 px) still gets the full scaled height
  assert.equal(compactTrackerScaledHeight(1.5, { viewportHeight: 1080, currentHeight: 156 }), 234);
  assert.equal(compactTrackerScaledWidth(782, 1.5, { viewportWidth: 1920, viewportHeight: 1080 }), 1173);
  // capped by the screen (1920 - 32), above the unscaled 1180 cap
  assert.equal(compactTrackerScaledWidth(1180, 1.5, { viewportWidth: 1920, viewportHeight: 1080 }), 1770);
  assert.equal(compactTrackerScaledWidth(1180, 1.5, { viewportWidth: 1280, viewportHeight: 1080 }), 1248);

  const short = compactTrackerScale(2, { viewportHeight: 250 });
  assert.ok(short < 2 && short >= 1);
  assert.ok(compactTrackerScaledHeight(2, { viewportHeight: 250 }) <= 250 - 32);
});

test("sotto il 100%: la cornice del tracker esteso si restringe con la scala", () => {
  assert.deepEqual(
    classicTrackerScaledFrame(0.5, { viewportWidth: 1920, viewportHeight: 1080 }),
    { scale: 0.5, width: 170, height: 956 },
  );
  assert.deepEqual(
    classicTrackerScaledFrame(0.75, { viewportWidth: 300, viewportHeight: 900 }),
    { scale: 0.75, width: 255, height: 776 },
  );
});

test("sotto il 100%: la barra compatta si abbassa e si restringe con la scala", () => {
  assert.equal(compactTrackerScale(0.5, { viewportHeight: 1080 }), 0.5);
  assert.equal(compactTrackerScaledHeight(0.5, { viewportHeight: 1080 }), 78);
  // a bar opened at 100% (156 px) gets the reduced height
  assert.equal(compactTrackerScaledHeight(0.5, { viewportHeight: 1080, currentHeight: 156 }), 78);
  assert.equal(compactTrackerScaledHeight(0.75, { viewportHeight: 900, currentHeight: 156 }), 117);
  assert.equal(compactTrackerScaledWidth(782, 0.5, { viewportWidth: 1920, viewportHeight: 1080 }), 391);
  // the bar's own limits follow the scale (1180 * 0.5 = 590, 320 * 0.5 = 160)
  assert.equal(compactTrackerScaledWidth(1180, 0.5, { viewportWidth: 1920, viewportHeight: 1080 }), 590);
  assert.equal(compactTrackerViewportWidth(100, 1920, 0.5), 160);
  assert.equal(compactTrackerViewportWidth(100, 1920, 0.2), 160);
});

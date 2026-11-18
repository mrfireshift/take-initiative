// Lot M2 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): the notices left at full opacity, the popup closed
// under them (the turn notice: whole at 4.86s, gone the next frame). Now they fade in 180ms and the popup closes after.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function fakeWindow(reduced = false) {
  const timers = [];
  globalThis.window = {
    matchMedia: () => ({ matches: reduced }),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
  };
  return timers;
}

function fakePanel() {
  const classes = new Set();
  return { isConnected: true, classList: { add: (name) => classes.add(name) }, classes };
}

test("leaveNoticeThen: the panel fades, the closing waits 180ms", async () => {
  const timers = fakeWindow();
  const { leaveNoticeThen, NOTICE_LEAVE_MS } = await import("../src/noticeLeave.js");
  assert.equal(NOTICE_LEAVE_MS, 180);
  const panel = fakePanel();
  let closed = 0;
  const timer = leaveNoticeThen([panel], () => { closed += 1; });
  assert.ok(panel.classes.has("is-leaving"));
  assert.equal(closed, 0);
  assert.equal(timer, 1);
  assert.equal(timers[0].delay, 180);
  timers[0].callback();
  assert.equal(closed, 1);
});

test("leaveNoticeThen: at once with reduced motion or with nothing shown", async () => {
  const { leaveNoticeThen } = await import("../src/noticeLeave.js");
  fakeWindow(true);
  let closed = 0;
  assert.equal(leaveNoticeThen([fakePanel()], () => { closed += 1; }), 0);
  assert.equal(closed, 1);
  fakeWindow(false);
  assert.equal(leaveNoticeThen([], () => { closed += 1; }), 0);
  assert.equal(closed, 2);
});

test("the turn notice tells its layout after the fade, the zone reminders fade too", () => {
  const source = read("src/turn-notice.ts");
  const hide = source.slice(source.indexOf("function hideCurrent()"), source.indexOf("function requestTurnNoticeHostClose()"));
  assert.match(hide, /window\.setTimeout\(\(\) => \{\n\s+leaving\.remove\(\);\n\s+announceNoticeLayout\(\);\n\s+\}, FADE_MS\);/);
  assert.ok(hide.indexOf("announceNoticeLayout") > hide.indexOf('classList.add("is-leaving")'));
  assert.match(source, /leaveNoticeThen\(\[panel\], \(\) => \{\n\s+panel\.remove\(\);\n\s+announceNoticeLayout\(\);/);
  assert.match(read("turn-notice.html"), /\.zone-notice\.is-leaving \{ opacity: 0; transform: translate\(0, 5px\); \}/);
});

test("speed, concentration and boss: fade, then close; a new warning cancels the closing", () => {
  for (const page of ["speed-warning", "concentration-warning", "boss-link-notice"]) {
    const source = read(`src/${page}.ts`);
    assert.match(source, /if \(leaveTimer\) return;\n\s+leaveTimer = leaveNoticeThen\(document\.querySelectorAll\("#app \.warning"\), \(\) => \{\n\s+leaveTimer = 0;/, page);
    assert.match(source, /window\.clearTimeout\(leaveTimer\);\n\s+leaveTimer = 0;/, page);
    const html = read(`${page}.html`);
    assert.match(html, /\.warning \{ transition: opacity var\(--obrt-motion-base, 180ms\) ease, transform var\(--obrt-motion-base, 180ms\) ease; \}/, page);
    assert.match(html, /\.warning\.is-leaving \{ opacity: 0; transform: translate\(0, 5px\); \}/, page);
  }
});

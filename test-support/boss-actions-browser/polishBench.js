// The polish's bench (docs/PIANO_POLISH_INCANTESIMI.md): a spell cast from the real panel on the map of frame.html, with the
// plugin's real background service running, so zones, reminders and durations do what they do in a room. To load in the page:
//   const { zoneRun } = await import("/test-support/boss-actions-browser/polishBench.js");
//   JSON.stringify(await zoneRun({ spellId: "cloudkill", slot: 5, at: { x: 630, y: 595 } }));
const META = "com.thebigpicture.initiative/meta";
const STATE = "com.thebigpicture.initiative/state";
const SPELLS = "com.thebigpicture.initiative/spells";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";
const STATIC_ZONE = "com.thebigpicture.initiative/spellStaticZone";
const GRID = 70;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const frameBy = (needle) => [...document.querySelectorAll("iframe")].find((frame) => (frame.src || "").includes(needle));
const tracker = () => frameBy("surface=tracker").contentWindow;
const panel = () => frameBy("spell-unified-panel")?.contentWindow;
const host = () => window.__fakeObrHost;

function guard(win) {
  try {
    win.navigation?.addEventListener("navigate", (event) => {
      if (event.navigationType === "reload" && event.cancelable) event.preventDefault();
    });
    win.requestAnimationFrame = (callback) => win.setTimeout(() => callback(win.performance.now()), 16);
  } catch (error) { console.warn(error); }
}

// The errors of the page, reported by every run: a run that "works" with an exception in the background does not.
const errors = [];

export async function setupBench() {
  for (let attempt = 0; attempt < 60 && !/READY/.test(document.title); attempt += 1) await sleep(250);
  if (window.__polishBenchReady) return;
  window.__polishBenchReady = true;
  guard(window);
  window.addEventListener("error", (event) => errors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason?.message || event.reason)));
  guard(tracker());
  // The map's placement belongs to the bench's host: the real area tool, which needs a real canvas, would answer a second
  // request with "placement-session-busy". Only that listener goes; zones, reminders and notices run for real.
  const placementListeners = () => host().state.listeners.broadcast.get("com.thebigpicture.initiative/spell-area-placement") || new Set();
  const before = new Set(placementListeners());
  await import("/src/background.js");
  await sleep(1200);
  for (const listener of [...placementListeners()]) if (!before.has(listener)) placementListeners().delete(listener);
}

async function sdk(code) {
  return tracker().eval(`(async()=>{ const m = await import('/test-support/boss-actions-browser/fake-obr-sdk.js'); const OBR = m.default || m.OBR; ${code} })()`);
}

const items = () => host().state.items;
const token = (id) => items().find((item) => item.id === id);
const meta = (id) => token(id)?.metadata?.[META] || {};
const stateOf = () => host().state.sceneMetadata[STATE];
const creatures = () => items().filter((item) => item.layer === "CHARACTER" && item.metadata?.[META]?.inInitiative);

export async function moveToken(id, x, y) {
  await sdk(`await OBR.scene.items.updateItems([${JSON.stringify(id)}], (items) => { for (const item of items) item.position = { x: ${x}, y: ${y} }; });`);
  await sleep(600);
}

export async function selectOnMap(ids) {
  await sdk(`await OBR.player.select(${JSON.stringify(ids)}, true);`);
  await sleep(150);
}

export async function closePanel() {
  if (!frameBy("spell-unified-panel")) return;
  await sdk("await OBR.popover.close('com.thebigpicture.initiative/spells-modal');");
  for (let attempt = 0; attempt < 20 && frameBy("spell-unified-panel"); attempt += 1) await sleep(100);
}

export async function openPanel(spellId, casterId, slotLevel, extra = {}) {
  await closePanel();
  await tracker().eval(`(async()=>{
    const m = await import('/test-support/boss-actions-browser/fake-obr-sdk.js');
    const OBR = m.default || m.OBR;
    const { buildSpellUnifiedPanelRouteQuery } = await import('/src/spellUnifiedPanelRoutingCore.js');
    const query = buildSpellUnifiedPanelRouteQuery({ spellId: ${JSON.stringify(spellId)}, casterId: ${JSON.stringify(casterId)}, slotLevel: ${JSON.stringify(slotLevel)}, ...${JSON.stringify(extra)} });
    await OBR.popover.open({ id: 'com.thebigpicture.initiative/spells-modal', url: '/spell-unified-panel.html?' + query, width: 640, height: 640, anchorReference: 'POSITION', anchorPosition: { left: 300, top: 20 }, anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, disableClickAway: true });
  })()`);
  for (let attempt = 0; attempt < 40 && !panel(); attempt += 1) await sleep(100);
  guard(panel());
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const doc = panel()?.document;
    if (doc?.querySelector(".unified-primary-button") && doc.body.innerText.length > 40) break;
    await sleep(100);
  }
  await sleep(350);
}

const doc = () => panel().document;
const checkedTargets = () => [...doc().querySelectorAll(".unified-target-row")]
  .filter((row) => row.querySelector("input[type=checkbox]")?.checked).map((row) => row.dataset.targetKey);
const primary = () => doc().querySelector(".unified-primary-button");
const fieldLabels = () => [...doc().querySelectorAll(".unified-review-effect-input")].map((field) => field.innerText.replace(/\n+/g, " | "));

async function setField(id, value) {
  const input = doc().querySelector(`#spell-unified-sticky-${id}`);
  if (!input) return false;
  input.value = String(value);
  input.dispatchEvent(new (panel().Event)("change", { bubbles: true }));
  await sleep(200);
  return true;
}

const mapClick = (x, y) => document.querySelector("#map").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));

// Click the origin (and the direction of a cone or a line), then the tool's confirm: as the GM does on the map.
async function place(at, toward) {
  const start = [...doc().querySelectorAll("button")].find((button) => /Posiziona area|Aggiungi area|Riposiziona area/.test(button.textContent));
  if (start) { start.click(); await sleep(600); }
  if (at) { mapClick(at.x, at.y); await sleep(250); }
  if (toward) { mapClick(toward.x, toward.y); await sleep(250); }
  [...document.querySelectorAll("button")].find((button) => /Conferma sagoma/.test(button.title || button.textContent))?.click();
  await sleep(800);
}

const hasPlacement = () => [...doc().querySelectorAll("button")].some((button) => /Posiziona area|Aggiungi area/.test(button.textContent))
  || [...document.querySelectorAll("button")].some((button) => /Conferma sagoma/.test(button.title || button.textContent) && !button.hidden);

function snapshotCreature(id) {
  const value = meta(id);
  return {
    hp: value.hp,
    pills: (value[SPELLS] || []).map((pill) => `${pill.name}:${pill.turns}${pill.expiry?.mode ? `:${pill.expiry.mode}` : ""}`),
    conditions: (value.conditions?.instances || []).filter((entry) => entry.active !== false)
      .map((entry) => `${entry.condition}[${entry.expiry?.mode}${entry.expiry?.remaining ? `:${entry.expiry.remaining}` : ""}]`),
    concentrating: Object.values(value[CONCENTRATION] || {}).map((entry) => entry.name || entry.spellName),
  };
}

function scene() {
  return Object.fromEntries(creatures().map((item) => [item.id, snapshotCreature(item.id)])
    .filter(([, value]) => value.pills.length || value.conditions.length || value.concentrating.length));
}

// What the zone drew: the real cells of the scene item, in metres on the bench's 70 px grid.
function zonesDrawn() {
  return items().filter((item) => item.metadata?.[STATIC_ZONE] && /^Zona/.test(item.name || "")).map((item) => {
    const area = item.metadata?.["com.thebigpicture.initiative/aoeArea"]?.area || item.metadata?.[STATIC_ZONE]?.area || null;
    const zone = item.metadata[STATIC_ZONE];
    return {
      name: item.name,
      rule: zone.ruleId,
      members: zone.triggerRuntime?.memberIds || zone.targetIds || [],
      ...(area?.cells?.length ? { cells: area.cells.length } : {}),
    };
  });
}

function notices() {
  const frame = frameBy("turn-notice");
  if (!frame) return [];
  guard(frame.contentWindow);
  return [...frame.contentDocument.querySelectorAll(".zone-notice, [data-kind]")].map((section) => section.innerText.replace(/\n+/g, " | ").slice(0, 200));
}

// Answer the first reminder on screen: the outcome and, when it asks for it, the dice.
async function answerNotice(outcome = "failed", dice = 7) {
  const frame = frameBy("turn-notice");
  if (!frame) return null;
  const notice = frame.contentDocument;
  const row = notice.querySelector("[data-resolution-controls]");
  if (!row) return null;
  const input = row.querySelector("input");
  if (input) {
    input.value = String(dice);
    input.dispatchEvent(new (frame.contentWindow.Event)("input", { bubbles: true }));
    input.dispatchEvent(new (frame.contentWindow.Event)("change", { bubbles: true }));
    await sleep(120);
  }
  const button = row.querySelector(`[data-outcome="${outcome}"]`) || row.querySelector('[data-outcome="confirmed"]');
  if (!button) return null;
  button.click();
  await sleep(800);
  return button.dataset.outcome;
}

async function answerAll(outcome, dice) {
  const answers = [];
  for (let step = 0; step < 6; step += 1) {
    const answered = await answerNotice(outcome, dice);
    if (!answered) break;
    answers.push(answered);
    await sleep(200);
  }
  return answers;
}

// Only the creatures that changed since the last look: a run stays readable.
function changedSince(before, now) {
  const changes = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(now)])) {
    if (JSON.stringify(before[id]) !== JSON.stringify(now[id])) changes[id] = now[id] || null;
  }
  return changes;
}

export async function nextTurn() {
  [...tracker().document.querySelectorAll("button")].find((button) => button.textContent.trim() === "▼").click();
  await sleep(850);
  const state = stateOf();
  return String(state.order[state.current]);
}

// Cast from the panel. outcomes: "failed" for everyone by default, or { id: outcome }; damage and healing fill their field.
export async function castFromPanel({ spellId, caster = "dars", slot = null, variant = "", at = null, toward = null, targets = [], untick = [], outcomes = "failed", damage = 10, healing = 8, mapSelection = [], context = {} }) {
  await selectOnMap(mapSelection);
  await openPanel(spellId, caster, slot);
  const report = {};
  if (variant) {
    const select = doc().querySelector("#spell-unified-placement-choice") || doc().querySelector("#spell-unified-variant");
    if (select) {
      select.value = variant;
      select.dispatchEvent(new (panel().Event)("change", { bubbles: true }));
      await sleep(350);
    }
  }
  if (hasPlacement()) await place(at, toward);
  const pendingRows = () => [
    ...targets.filter((target) => !checkedTargets().includes(target)),
    ...untick.filter((target) => checkedTargets().includes(target)),
  ];
  const toggleRows = async () => {
    for (const target of pendingRows()) {
      doc().querySelector(`.unified-target-row[data-target-key="${target}"] input[type=checkbox]`)?.click();
      await sleep(180);
    }
  };
  await toggleRows();
  // Rows still locked after the placement: Modifica bersagli opens them, as the GM does.
  if (pendingRows().length) {
    [...doc().querySelectorAll("button")].find((button) => /Modifica bersagli/.test(button.textContent))?.click();
    await sleep(350);
    await toggleRows();
  }
  report.selected = checkedTargets();
  report.save = doc().querySelector("[data-cast-save]")?.textContent || null;
  report.fields = fieldLabels();
  for (const target of report.selected) {
    const wanted = typeof outcomes === "string" ? outcomes : outcomes[target] || "failed";
    const button = doc().querySelector(`.unified-target-row[data-target-key="${target}"] [data-outcome="${wanted}"]`);
    if (button) { button.click(); await sleep(150); }
  }
  // context: { targetId: { fieldId: value } }, the per-target fields of the panel (the d8 of Prismatic Spray).
  for (const [target, fields] of Object.entries(context)) {
    for (const [field, value] of Object.entries(fields)) {
      const control = doc().querySelector(`[id="spell-unified-context-${target}-${field}"]`);
      if (control) {
        control.value = String(value);
        control.dispatchEvent(new (panel().Event)("change", { bubbles: true }));
        await sleep(180);
      }
    }
  }
  await setField("damage", damage);
  await setField("healing", healing);
  report.previews =report.selected.map((target) => doc().querySelector(`.unified-target-row[data-target-key="${target}"]`)?.innerText.replace(/\n+/g, " | ").slice(0, 60));
  report.primary = primary().textContent;
  report.blocked = primary().disabled;
  if (!report.blocked) {
    primary().click();
    await sleep(1000);
    report.feedback = doc().querySelector(".unified-feedback")?.textContent || "";
  }
  await closePanel();
  return report;
}

const activeId = () => { const state = stateOf(); return String(state.order[state.current]); };
const reminderNotices = () => notices().filter((text) => !/INIZIATIVA \|/.test(text));

// Bring the turn to a creature first: a spell is normally cast on its caster's own turn, and durations count from there.
export async function advanceTo(id) {
  for (let step = 0; step < 14 && activeId() !== id; step += 1) await nextTurn();
  return activeId();
}

// Real damage from another caster's spell: the reminders with timing "damage" answer to the hpIntent event, not to a raw HP write.
export async function damageWith({ spellId = "shatter", caster = "sera", slot = 2, at, target = "mira", outcome = "failed", damage = 6 }) {
  const position = at || { x: token(target).position.x, y: token(target).position.y };
  return castFromPanel({ spellId, caster, slot, at: position, targets: [target], outcomes: { [target]: outcome }, damage });
}

// The panel's Termina, on the spell's own overview: the same end the GM reaches from the tracker's spell list.
export async function terminateFromPanel(spellId, caster = "dars") {
  const pill = (meta(caster)[SPELLS] || []).find((entry) => entry.spellId === spellId);
  if (!pill?.instanceId) return { terminated: false, reason: "no pill on the caster" };
  await selectOnMap([]);
  await openPanel(spellId, caster, null, { activeInstanceId: pill.instanceId });
  const button = doc().querySelector("[data-terminate-instance]");
  if (!button) { await closePanel(); return { terminated: false, reason: "no Termina" }; }
  button.click();
  await sleep(1000);
  await closePanel();
  return { terminated: true };
}

// A cast on one creature, then its reminders: a full round answering them, and damage when asked for (timing "damage").
export async function reminderRun({ spellId, caster = "dars", slot = null, variant = "", target = "mira", answer = "failed", dice = 7, turns = 9, onTurn = true, damageBy = null, outcomes = "failed", damage = 10 }) {
  await setupBench();
  if (onTurn) await advanceTo(caster);
  const log = { spellId, cast: await castFromPanel({ spellId, caster, slot, variant, targets: [target], outcomes, damage }) };
  await sleep(400);
  log.afterCast = snapshotCreature(target);
  log.casterAfterCast = snapshotCreature(caster);
  log.round = [];
  let seen = scene();
  for (let step = 0; step < turns; step += 1) {
    const active = await nextTurn();
    const shown = reminderNotices();
    const entry = { active };
    if (shown.length) {
      entry.shown = shown;
      entry.answered = await answerAll(answer, dice);
      await sleep(300);
    }
    const now = scene();
    const changes = changedSince(seen, now);
    if (shown.length || Object.keys(changes).length) log.round.push({ ...entry, changes });
    seen = now;
    if (answer === "passed" && !snapshotCreature(target).conditions.length) break;
  }
  if (damageBy) {
    log.damage = await damageWith({ target, ...damageBy });
    await sleep(1000);
    log.afterDamage = { shown: reminderNotices(), target: snapshotCreature(target) };
    if (log.afterDamage.shown.length) {
      log.afterDamage.answered = await answerAll(answer, dice);
      await sleep(300);
      log.afterDamage.after = snapshotCreature(target);
    }
  }
  log.final = snapshotCreature(target);
  log.errors = errors.slice();
  return log;
}

// The whole life of a zone: the cast, a full round with its reminders answered, a creature that enters and leaves, Termina.
export async function zoneRun({ spellId, caster = "dars", slot = null, variant = "", at = null, toward = null, targets = [], outcomes = "failed",
  stayer = "mira", walker = "goblin-a", walkTo = null, answer = "failed", dice = 7, turns = 9, arrange = {}, onTurn = true, damage = 10, end = "card" }) {
  await setupBench();
  for (const [id, position] of Object.entries(arrange)) await moveToken(id, position.x, position.y);
  if (onTurn) await advanceTo(caster);
  const log = { spellId, cast: await castFromPanel({ spellId, caster, slot, variant, at, toward, targets, outcomes, damage }) };
  await sleep(500);
  log.afterCast = scene();
  log.zones = zonesDrawn();
  log.round = [];
  let seen = scene();
  for (let step = 0; step < turns; step += 1) {
    const active = await nextTurn();
    const shown = reminderNotices();
    const entry = { active };
    if (shown.length) {
      entry.shown = shown;
      entry.answered = await answerAll(answer, dice);
      await sleep(300);
    }
    const now = scene();
    const changes = changedSince(seen, now);
    if (shown.length || Object.keys(changes).length) log.round.push({ ...entry, changes });
    seen = now;
  }
  if (walkTo) {
    const before = { ...token(walker).position };
    await moveToken(walker, walkTo.x, walkTo.y);
    await sleep(500);
    log.entered = { shown: reminderNotices(), walker: snapshotCreature(walker) };
    await answerAll(answer, dice);
    await sleep(300);
    log.afterEntered = snapshotCreature(walker);
    await moveToken(walker, before.x, before.y);
    await sleep(500);
    log.left = snapshotCreature(walker);
  }
  log.stayer = snapshotCreature(stayer);
  if (end === "panel") {
    log.terminate = await terminateFromPanel(spellId, caster);
  } else if (end === "card") {
    const terminate = [...tracker().document.querySelectorAll("button")].find((button) => /^Termina /.test(button.title || button.getAttribute("aria-label") || ""));
    if (terminate) {
      log.terminate = terminate.title || terminate.getAttribute("aria-label");
      terminate.click();
      await sleep(900);
    }
  }
  if (log.terminate) {
    await sleep(500);
    log.afterTermina = scene();
    log.zonesAfterTermina = zonesDrawn().length;
  }
  log.errors = errors.slice();
  return log;
}

// A prepared spell (a smite, Ensnaring Strike): the cast on the caster's turn, the popup at the token, the target selected on
// the map, the damage and the outcome, Risolvi. Then a round with its reminders answered. A fresh page: it uses the selection.
export async function preparedRun({ spellId, caster = "dars", slot = null, target = "goblin-a", outcome = "failed", damage = 3, turns = 5, answer = "failed", dice = 7 }) {
  await setupBench();
  await advanceTo(caster);
  const log = { spellId, cast: await castFromPanel({ spellId, caster, slot }) };
  await sleep(1500);
  const frame = () => [...document.querySelectorAll("iframe")].find((entry) => /spell-active-resolution/.test(entry.src || ""));
  if (!frame()) { log.errors = [...errors, "no resolution popup"]; return log; }
  guard(frame().contentWindow);
  await sleep(600);
  await selectOnMap([target]);
  await sleep(700);
  const popup = () => frame()?.contentDocument;
  const visible = () => [...popup().querySelectorAll("button")].filter((button) => button.offsetParent !== null);
  log.popup = popup().body.innerText.replace(/\n+/g, " | ").slice(0, 300);
  const field = popup().querySelector("#attackDamage");
  if (field) {
    field.value = String(damage);
    field.dispatchEvent(new (frame().contentWindow.Event)("input", { bubbles: true }));
    field.dispatchEvent(new (frame().contentWindow.Event)("change", { bubbles: true }));
    await sleep(200);
  }
  visible().find((button) => button.textContent.trim() === (outcome === "passed" ? "Superato" : outcome === "immune" ? "Immune" : "Fallito"))?.click();
  await sleep(250);
  const resolve = visible().find((button) => /^Risolvi/.test(button.textContent.trim()));
  log.resolveDisabled = resolve?.disabled ?? null;
  resolve?.click();
  await sleep(1300);
  log.afterResolve = { target: snapshotCreature(target), caster: snapshotCreature(caster) };
  log.round = [];
  let seen = scene();
  for (let step = 0; step < turns; step += 1) {
    const active = await nextTurn();
    const shown = reminderNotices();
    const entry = { active };
    if (shown.length) {
      entry.shown = shown;
      entry.answered = await answerAll(answer, dice);
      await sleep(300);
    }
    const now = scene();
    const changes = changedSince(seen, now);
    if (shown.length || Object.keys(changes).length) log.round.push({ ...entry, changes });
    seen = now;
  }
  log.final = { target: snapshotCreature(target), caster: snapshotCreature(caster) };
  log.errors = errors.slice();
  return log;
}

// A run in few words: who was hit, what the panel asked, every reminder with its turn, how it ended.
export const brief = (log) => ({
  selected: log.cast?.selected, save: log.cast?.save, fields: log.cast?.fields, feedback: log.cast?.feedback || log.cast?.primary,
  afterCast: log.afterCast,
  ...(log.zones ? { zones: log.zones.map((zone) => zone.members) } : {}),
  round: (log.round || []).map((entry) => `${entry.active}: ${(entry.shown || []).map((text) => text.slice(0, 110)).join(" // ")} ${entry.answered?.length ? `[${entry.answered}]` : ""} -> ${Object.keys(entry.changes || {}).join(",")}`),
  ...(log.entered ? { entered: log.entered.shown, afterEntered: log.afterEntered?.conditions, left: log.left?.conditions } : {}),
  stayer: log.stayer?.conditions,
  ...(log.terminate ? { end: log.terminate, afterEnd: log.afterTermina, zonesLeft: log.zonesAfterTermina } : {}),
  ...(log.afterDamage ? { afterDamage: log.afterDamage } : {}),
  errors: log.errors,
});

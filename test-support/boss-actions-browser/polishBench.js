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

// A prepared spell resolved from the panel, when its popup is not there (closed with the ×, off turn, out of combat): Risolvi among
// the active spells, the target selected on the map, Apri risoluzione, then the popup. To call with the spell already cast.
export async function resolveFromPanel({ spellId, caster = "dars", slot = null, target = "goblin-a", outcome = "failed", damage = 3 }) {
  const pill = (meta(caster)[SPELLS] || []).find((entry) => entry.spellId === spellId);
  if (!pill?.instanceId) return { errors: [...errors, "no pill on the caster"] };
  await selectOnMap([]);
  await openPanel(spellId, caster, slot, { activeInstanceId: pill.instanceId });
  const log = {};
  const popupFrame = () => frameBy("spell-active-resolution");
  const buttonState = () => ({ label: primary().textContent, off: primary().disabled, title: primary().title });
  [...doc().querySelectorAll("[data-active-instance]")].find((button) => !button.disabled)?.click();
  await sleep(800);
  log.withoutTarget = buttonState();
  log.panelText = doc().body.innerText.replace(/\s*\n+\s*/g, " | ").slice(-260);
  await selectOnMap([target]);
  await sleep(700);
  log.withTarget = buttonState();
  if (primary().disabled) { log.errors = errors.slice(); return log; }
  primary().click();
  await sleep(1500);
  log.feedback = doc().querySelector(".unified-feedback")?.textContent || "";
  if (!popupFrame()) { log.errors = [...errors, "no popup"]; return log; }
  guard(popupFrame().contentWindow);
  await sleep(500);
  const popup = () => popupFrame()?.contentDocument;
  const fire = (node, type) => node.dispatchEvent(new (popupFrame().contentWindow.Event)(type, { bubbles: true }));
  log.popup = popup().body.innerText.replace(/\s*\n+\s*/g, " | ").slice(0, 300);
  const visible = () => [...popup().querySelectorAll("button")].filter((button) => button.offsetParent !== null);
  const field = popup().querySelector("#attackDamage");
  if (field && field.offsetParent !== null) {
    field.value = String(damage);
    fire(field, "input");
    fire(field, "change");
    await sleep(200);
  }
  visible().find((button) => button.textContent.trim() === (outcome === "passed" ? "Superato" : outcome === "immune" ? "Immune" : "Fallito"))?.click();
  await sleep(250);
  const resolve = visible().find((button) => /^Risolvi/.test(button.textContent.trim()));
  log.resolve = resolve ? `${resolve.textContent.trim()}${resolve.disabled ? " (spento)" : ""}` : null;
  log.status = popup().getElementById("status")?.textContent || "";
  resolve?.click();
  await sleep(1500);
  log.popupOpen = !!popupFrame();
  log.target = snapshotCreature(target);
  log.caster = snapshotCreature(caster);
  log.errors = errors.slice();
  await closePanel();
  return log;
}

const hpOfAll = () => Object.fromEntries(creatures().map((item) => [item.id, meta(item.id).hp]));
const hpChanges = (before) => Object.fromEntries(Object.entries(hpOfAll())
  .filter(([id, hp]) => hp !== before[id]).map(([id, hp]) => [id, `${before[id]}→${hp}`]));

// P4. A spell's action from the ⚡, in the panel's list of active spells: where the GM reaches it from the tracker too. It casts
// the spell, opens the list and runs the action, filling what the panel asks. A fresh page: it uses the selection. nextRound: an
// action of the turns after the cast, on the caster's next turn.
export async function actionRun({ nextRound = false, castTargets = [], spellId, caster = "dars", slot = null, variant = "", at = { x: 1040, y: 600 }, toward = null, targets = ["goblin-a"], outcomes = "failed", damage = 10,
  actionId = "", actionVariant = "", actionTargets = ["goblin-a"], actionAt = { x: 1040, y: 600 }, actionToward = null, actionOutcome = "failed", actionDamage = 7, actionHealing = 7,
  arrange = { mira: { x: 960, y: 640 }, "goblin-a": { x: 1040, y: 600 }, "goblin-b": { x: 1040, y: 520 } }, onTurn = true, hostile = ["goblin-a", "goblin-b"] }) {
  await setupBench();
  for (const [id, position] of Object.entries(arrange)) await moveToken(id, position.x, position.y);
  for (const id of hostile) token(id).metadata[META].attitude = "enemy";
  if (onTurn) await advanceTo(caster);
  await selectOnMap([]);
  await openPanel(spellId, caster, slot);
  const firstOption = () => {
    const select = doc().querySelector("#spell-unified-placement-choice") || doc().querySelector("#spell-unified-variant");
    return select ? [...select.options].map((option) => option.value).find(Boolean) || "" : "";
  };
  const castVariant = variant || firstOption();
  const needsTarget = /Seleziona almeno un bersaglio/.test(primary().textContent);
  const log = {
    spellId,
    cast: await castFromPanel({ spellId, caster, slot, variant: castVariant, at, toward, targets: castTargets.length ? castTargets : needsTarget ? targets : [], outcomes, damage }),
  };
  await sleep(400);
  log.afterCast = scene();
  if (nextRound) {
    await nextTurn();
    await advanceTo(caster);
    await sleep(500);
    await answerAll("failed", 3);
  }
  const holder = items().find((item) => (item.metadata?.[META]?.[SPELLS] || []).some((pill) => pill.spellId === spellId));
  const pill = (holder?.metadata?.[META]?.[SPELLS] || []).find((entry) => entry.spellId === spellId);
  // A spell with no pill (the Illusory Dragon) is reached from the caster's concentration.
  const instanceId = pill?.instanceId || Object.values(meta(caster)[CONCENTRATION] || {})[0]?.instanceId;
  if (!instanceId) { log.errors = [...errors, "no pill after the cast"]; return log; }
  // Some actions light up only with their target selected on the map.
  await selectOnMap(actionTargets);
  await openPanel(spellId, caster, slot, { activeInstanceId: instanceId });
  const actionButtons = () => [...doc().querySelectorAll("[data-active-instance]")];
  log.buttons = actionButtons().map((button) => `${button.dataset.value || button.textContent.trim()}${button.disabled ? " (spento)" : ""}`);
  const button = actionButtons().find((entry) => (actionId ? entry.dataset.value === actionId : !entry.disabled));
  if (!button) { log.errors = [...errors, `no action to run: ${log.buttons.join(", ")}`]; await closePanel(); return log; }
  log.actionId = button.dataset.value;
  const actionLabel = button.textContent.trim();
  const before = scene();
  const hpBefore = hpOfAll();
  button.click();
  await sleep(1200);
  // Most actions resolve in the popup at the token, with the target selected on the map.
  const popupFrame = () => frameBy("spell-active-resolution");
  if (popupFrame()) {
    guard(popupFrame().contentWindow);
    await sleep(500);
    await selectOnMap(actionTargets);
    await sleep(700);
    const popup = () => popupFrame()?.contentDocument;
    const popupWindow = () => popupFrame()?.contentWindow;
    const shown = (node) => !!node && node.offsetParent !== null;
    const fire = (node, type) => node.dispatchEvent(new (popupWindow().Event)(type, { bubbles: true }));
    log.popup = popup().body.innerText.replace(/\n+/g, " | ").slice(0, 420);
    const placeButton = popup().getElementById("place");
    if (shown(placeButton) && !placeButton.disabled) {
      placeButton.click();
      await sleep(600);
      mapClick(actionAt.x, actionAt.y);
      await sleep(250);
      if (actionToward) mapClick(actionToward.x, actionToward.y);
      await sleep(250);
      [...document.querySelectorAll("button")].find((entry) => /Conferma sagoma/.test(entry.title || entry.textContent))?.click();
      await sleep(900);
      log.popupAfterPlace = popup()?.body.innerText.replace(/\n+/g, " | ").slice(0, 420);
    }
    for (const id of ["attackTarget", "saveTarget"]) {
      const select = popup().getElementById(id);
      if (shown(select) && !select.value && [...select.options].some((option) => option.value === actionTargets[0])) {
        select.value = actionTargets[0];
        fire(select, "change");
        await sleep(250);
      }
    }
    // An attack: the outcome first, the damage appears on a hit.
    const attackOutcomeButton = popup().querySelector(`[data-attack-outcome="${["hit", "critical", "miss"].includes(actionOutcome) ? actionOutcome : "hit"}"]`);
    if (shown(attackOutcomeButton)) {
      attackOutcomeButton.click();
      await sleep(300);
    }
    for (const id of ["attackDamage", "saveDamage", "damage", "healAmount"]) {
      const field = popup().getElementById(id);
      if (shown(field)) {
        field.value = String(actionDamage);
        fire(field, "input");
        fire(field, "change");
        await sleep(150);
      }
    }
    const outcomeLabel = { passed: "Superato", failed: "Fallito", immune: "Immune" }[actionOutcome];
    const outcomeButtons = [
      ...popup().querySelectorAll(`[data-save-outcome="${actionOutcome}"]`),
      ...[...popup().querySelectorAll("#targets button")].filter((entry) => entry.textContent.trim() === outcomeLabel),
    ].filter(shown);
    for (const entry of outcomeButtons) {
      if (!popupFrame()) break;
      entry.click();
      await sleep(250);
    }
    await sleep(500);
    if (popupFrame()) {
      const apply = popup().getElementById("apply");
      log.popupFilled = popup().body.innerText.replace(/\n+/g, " | ").slice(0, 420);
      log.primary = apply?.textContent.trim() || "(nessun pulsante)";
      log.blocked = apply ? apply.disabled : true;
      if (apply && !apply.disabled) {
        apply.click();
        await sleep(1300);
      }
    }
    log.status = popupFrame() ? popup()?.getElementById("status")?.textContent || "" : "(popup chiuso)";
    await closePanel();
    await sleep(300);
    log.changes = changedSince(before, scene());
    log.hp = hpChanges(hpBefore);
    log.zones = zonesDrawn().map((zone) => `${zone.name}: ${zone.members.join(",")}`);
    log.errors = errors.slice();
    return log;
  }
  // An action that needs nothing else has already run: the panel is back on the cast, and its button would cast the spell again.
  log.immediate = doc().querySelector(".unified-feedback")?.textContent || "";
  if (!primary().textContent.includes(actionLabel)) {
    log.primary = "(eseguita al clic)";
    log.feedback = log.immediate;
    await closePanel();
    await sleep(300);
    log.changes = changedSince(before, scene());
    log.hp = hpChanges(hpBefore);
    log.zones = zonesDrawn().map((zone) => `${zone.name}: ${zone.members.join(",")}`);
    log.errors = errors.slice();
    return log;
  }
  const choice = actionVariant || firstOption();
  const select = doc().querySelector("#spell-unified-placement-choice") || doc().querySelector("#spell-unified-variant");
  if (select && choice && select.value !== choice) {
    select.value = choice;
    select.dispatchEvent(new (panel().Event)("change", { bubbles: true }));
    await sleep(350);
  }
  if (hasPlacement()) await place(actionAt, actionToward);
  for (const target of actionTargets) {
    if (checkedTargets().includes(target)) continue;
    doc().querySelector(`.unified-target-row[data-target-key="${target}"] input[type=checkbox]`)?.click();
    await sleep(180);
  }
  log.selected = checkedTargets();
  log.save = doc().querySelector("[data-cast-save]")?.textContent || null;
  log.fields = fieldLabels();
  for (const target of log.selected) {
    const outcome = doc().querySelector(`.unified-target-row[data-target-key="${target}"] [data-outcome="${actionOutcome}"]`);
    if (outcome) { outcome.click(); await sleep(120); }
  }
  await setField("damage", actionDamage);
  await setField("healing", actionHealing);
  log.previews = log.selected.map((target) => doc().querySelector(`.unified-target-row[data-target-key="${target}"]`)?.innerText.replace(/\n+/g, " | ").slice(0, 80));
  log.primary = primary().textContent;
  log.blocked = primary().disabled;
  if (!log.blocked) {
    primary().click();
    await sleep(1000);
    log.feedback = doc().querySelector(".unified-feedback")?.textContent || "";
  }
  await closePanel();
  await sleep(300);
  log.changes = changedSince(before, scene());
  log.hp = hpChanges(hpBefore);
  log.zones = zonesDrawn().map((zone) => `${zone.name}: ${zone.members.join(",")}`);
  log.errors = errors.slice();
  return log;
}

// P4. The attack console, the page the GM uses: the card written on the token, the console opened by the tracker, its controls
// pressed. A fresh page for each attack that depends on the selection.
const consoleFrame = () => frameBy("/pc-attack.html");
const consoleDoc = () => consoleFrame()?.contentDocument;
const consoleWin = () => consoleFrame()?.contentWindow;

export async function setCard(id, card, fields = {}) {
  await sdk(`await OBR.scene.items.updateItems([${JSON.stringify(id)}], (items) => { for (const item of items) { const key = ${JSON.stringify(META)}; item.metadata[key] = { ...item.metadata[key], ...${JSON.stringify(fields)}, initiativeCard: ${JSON.stringify(card)} }; } });`);
  await sleep(500);
}

export async function closeConsole() {
  if (!consoleFrame()) return;
  await sdk("await OBR.popover.close('com.thebigpicture.initiative/pc-attack');");
  for (let attempt = 0; attempt < 20 && consoleFrame(); attempt += 1) await sleep(100);
}

export async function openConsole(source, actionId = "", spellId = "") {
  await closeConsole();
  await tracker().eval(`(async()=>{
    const { openPcAttackPopover, openPcAttackConsoleForActor } = await import('/src/pcAttackLauncher.js');
    ${actionId ? `await openPcAttackPopover(${JSON.stringify(source)}, ${JSON.stringify(actionId)}, ${JSON.stringify(spellId)});` : `await openPcAttackConsoleForActor(${JSON.stringify(source)});`}
  })()`);
  for (let attempt = 0; attempt < 40 && !consoleWin(); attempt += 1) await sleep(100);
  guard(consoleWin());
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (consoleDoc()?.getElementById("pc-attack-title")?.textContent.trim()) break;
    await sleep(100);
  }
  await sleep(500);
}

const consoleText = (id) => {
  const node = consoleDoc()?.getElementById(id);
  return node && !node.hidden ? node.innerText.replace(/\s*\n+\s*/g, " | ").trim() : "";
};

// The fixed row's button: Registra on an attack, Lancia or Usa on the other entries.
const consoleButton = () => ["pc-attack-apply", "pc-attack-launch-button"].map((id) => consoleDoc()?.getElementById(id)).find((button) => button && !button.hidden) || null;

// What the console says now: every line the GM reads, the entries of its picker and its button.
export function consoleView() {
  const doc = consoleDoc();
  if (!doc) return null;
  const button = consoleButton();
  return {
    title: consoleText("pc-attack-title"),
    turn: consoleText("pc-attack-turn"),
    picker: consoleText("pc-attack-picker-dropdown-button") || consoleText("pc-attack-cantrip-row"),
    facts: consoleText("pc-attack-facts"),
    subtitle: consoleText("pc-attack-subtitle"),
    note: consoleText("pc-attack-cantrip-note"),
    monsterNote: consoleText("pc-attack-monster-note"),
    spell: [...doc.querySelectorAll("#pc-attack-spell-controls select")].map((select) => `${select.getAttribute("aria-label") || select.title || "select"}=${select.value}`),
    target: consoleText("pc-attack-target-button"),
    outcomes: [...doc.querySelectorAll("#pc-attack-outcomes button")].filter((entry) => entry.offsetParent !== null).map((entry) => `${entry.textContent.trim()}${entry.getAttribute("aria-pressed") === "true" ? "*" : ""}`),
    damage: consoleText("pc-attack-damage"),
    placeholders: [...doc.querySelectorAll("#pc-attack-damage input")].map((input) => input.placeholder),
    defenses: consoleText("pc-attack-defenses"),
    total: consoleText("pc-attack-total"),
    launch: consoleText("pc-attack-launch"),
    area: consoleText("pc-attack-area-list"),
    status: consoleText("pc-attack-status"),
    button: button && !button.hidden ? `${button.textContent.trim()}${button.disabled ? " (spento)" : ""}` : "",
  };
}

// The console's tabs and their rows, tab by tab.
export async function consoleEntries() {
  const doc = consoleDoc();
  const tabs = {};
  for (const tab of [...doc.querySelectorAll("#pc-attack-picker-tabs button")]) {
    tab.click();
    await sleep(200);
    const rows = [...consoleDoc().querySelectorAll("#pc-attack-picker-list [data-picker-key], #pc-attack-picker-list button, #pc-attack-picker-menu button")];
    tabs[tab.textContent.trim()] = [...new Set(rows.map((row) => row.innerText.replace(/\s*\n+\s*/g, " · ").trim()))];
  }
  return tabs;
}

export async function consolePick(tabLabel, label) {
  const doc = consoleDoc();
  [...doc.querySelectorAll("#pc-attack-picker-tabs button")].find((tab) => tab.textContent.trim() === tabLabel)?.click();
  await sleep(200);
  const rows = [...consoleDoc().querySelectorAll("#pc-attack-picker-list button, #pc-attack-picker-menu button")];
  const row = rows.find((entry) => entry.innerText.includes(label));
  if (!row) return false;
  row.click();
  await sleep(300);
  return true;
}

const fireConsole = (node, type) => node.dispatchEvent(new (consoleWin().Event)(type, { bubbles: true }));

// A choice in the spell's row, by its current options: the slot level or the damage type.
export async function consoleChoose(value) {
  const select = [...consoleDoc().querySelectorAll("#pc-attack-spell-controls select")]
    .find((entry) => [...entry.options].some((option) => option.value === String(value)));
  if (!select) return false;
  select.value = String(value);
  fireConsole(select, "change");
  await sleep(250);
  return true;
}

export async function consoleOutcome(outcome) {
  const button = consoleDoc().querySelector(`#pc-attack-outcomes button[data-outcome="${outcome}"]`);
  if (!button || button.offsetParent === null) return false;
  button.click();
  await sleep(250);
  return true;
}

export async function consoleDamage(amount, component = "c1") {
  const input = consoleDoc().querySelector(`#pc-attack-damage input[data-damage-input="${component}"]`);
  if (!input) return false;
  input.value = String(amount);
  fireConsole(input, "input");
  await sleep(200);
  return true;
}

export async function consolePress() {
  const button = consoleButton();
  if (!button || button.disabled) return false;
  button.click();
  await sleep(1200);
  return true;
}

export const creatureNow = (id) => snapshotCreature(id);

// The slots left on a creature: only the pools of spell slots, level by level.
export function slotsOf(id) {
  const resources = meta(id).classFeatureState?.resources || {};
  return Object.fromEntries(Object.entries(resources).filter(([key]) => /slot/i.test(key)).map(([key, value]) => [key, value?.current ?? value]));
}

// An attack registered in the console: the target selected on the map, the spell and its slot, the outcome and the damage.
export async function consoleAttack({ source = "dars", actionId = "", spellId = "", target = "goblin-a", slot = null, type = "", outcome = "hit", amount = 7, press = true }) {
  await setupBench();
  await selectOnMap(target ? [target] : []);
  await openConsole(source, actionId, spellId);
  if (slot) await consoleChoose(slot);
  if (type) await consoleChoose(type);
  if (outcome) await consoleOutcome(outcome);
  if (amount !== null) await consoleDamage(amount);
  const log = { before: consoleView(), hpBefore: hpOfAll() };
  if (press) {
    log.pressed = await consolePress();
    log.after = consoleView();
    log.hp = hpChanges(log.hpBefore);
    log.target = target ? snapshotCreature(target) : null;
    log.source = snapshotCreature(source);
    log.slots = slotsOf(source);
  }
  log.errors = errors.slice();
  return log;
}

// A monster's stat block imported on its sheet, as the GM does: Modifica, Importa, Leggi, Applica al modulo, Salva.
export async function importMonster(id, data) {
  await setupBench();
  token(id).metadata[META].attitude = "enemy";
  await sdk(`await OBR.popover.open({ id: 'com.thebigpicture.initiative/initiative-card-modal', url: '/initiative-card-modal.html?source=${id}', width: 440, height: 560, anchorReference: 'POSITION', anchorPosition: { left: 700, top: 20 }, anchorOrigin: { horizontal: 'LEFT', vertical: 'TOP' }, transformOrigin: { horizontal: 'LEFT', vertical: 'TOP' } });`);
  const modalFrame = () => frameBy("/initiative-card-modal.html");
  for (let attempt = 0; attempt < 40 && !modalFrame(); attempt += 1) await sleep(100);
  guard(modalFrame().contentWindow);
  const modal = () => modalFrame().contentDocument;
  for (let attempt = 0; attempt < 60 && !modal()?.getElementById("edit"); attempt += 1) await sleep(100);
  await sleep(500);
  modal().getElementById("edit").click();
  await sleep(300);
  modal().getElementById("sheetImportToggle").click();
  await sleep(300);
  const text = modal().getElementById("sheetImportText");
  text.value = JSON.stringify(data);
  text.dispatchEvent(new (modalFrame().contentWindow.Event)("input", { bubbles: true }));
  modal().getElementById("sheetImportRead").click();
  await sleep(900);
  const report = { read: modal().getElementById("sheetImportStatus").innerText, sections: modal().getElementById("sheetImportSections").innerText.replace(/\s*\n+\s*/g, " | ").slice(0, 900) };
  modal().getElementById("sheetImportApply").click();
  await sleep(500);
  modal().querySelector("button.primary[type=submit]").click();
  await sleep(1800);
  await sdk("await OBR.popover.close('com.thebigpicture.initiative/initiative-card-modal');");
  await sleep(300);
  report.card = meta(id).initiativeCard;
  report.errors = errors.slice();
  return report;
}

// The ⚡ of a card: its menu opened from the tracker and a row pressed, as the GM does. The answer is on the screen: a console,
// the panel or a notification. The creature must be the only one with a ⚡, or the first in the order.
export async function quickActionRun(label) {
  const trackerDoc = frameBy("surface=tracker").contentDocument;
  const toggle = trackerDoc.querySelector("[data-tracker-quick-action-toggle]");
  if (!toggle) return { pressed: false, reason: "no ⚡" };
  toggle.click();
  await sleep(600);
  const menu = () => frameBy("/tracker-quick-actions.html");
  for (let attempt = 0; attempt < 20 && !menu(); attempt += 1) await sleep(100);
  if (!menu()) return { pressed: false, reason: "no menu" };
  guard(menu().contentWindow);
  await sleep(300);
  const rows = [...menu().contentDocument.querySelectorAll("button")];
  const view = rows.map((row) => `${row.innerText.replace(/\s*\n+\s*/g, " · ").trim()}${row.disabled ? " (spento)" : ""}`);
  const row = rows.find((entry) => entry.innerText.includes(label));
  if (!row || row.disabled) return { pressed: false, view };
  row.click();
  await sleep(1300);
  return { pressed: true, view, frames: [...document.querySelectorAll("iframe")].map((frame) => (frame.src || "").split("/").pop().split("?")[0]) };
}

// A registration in one line: what the console showed and what it wrote.
export const attackLine = (log) => ({
  facts: log.before?.facts, note: log.before?.note, spell: log.before?.spell, outcomes: log.before?.outcomes, damage: log.before?.damage,
  defenses: log.before?.defenses, total: log.before?.total, button: log.before?.button, pressed: log.pressed,
  status: log.after?.status, hp: log.hp, target: log.target, slots: log.slots, errors: log.errors,
});

// An action run in few words.
export const actionBrief = (log) => ({
  cast: `${log.cast?.primary}${log.cast?.blocked ? " (bloccato)" : ""}: ${log.cast?.feedback || ""}`,
  buttons: log.buttons,
  action: log.actionId,
  popup: log.popup,
  status: log.status,
  afterPlace: log.popupAfterPlace,
  zones: log.zones,
  save: log.save,
  fields: log.fields,
  selected: log.selected,
  primary: `${log.primary}${log.blocked ? " (bloccato)" : ""}`,
  feedback: log.feedback,
  changes: log.changes,
  errors: log.errors,
});

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

// Several actions in a line: one short line for each.
export const actionLine = (log) => [
  log.cast?.blocked ? `LANCIO BLOCCATO: ${log.cast?.primary}` : "",
  `${log.actionId || "-"}: ${log.primary || ""}${log.blocked ? " BLOCCATO" : ""}`,
  Object.keys(log.hp || {}).length ? `PF ${JSON.stringify(log.hp)}` : "",
  log.save || "",
  log.status && log.status !== "(popup chiuso)" ? `«${log.status.slice(0, 90)}»` : "",
  log.feedback ? `«${log.feedback.slice(0, 70)}»` : "",
  Object.entries(log.changes || {}).map(([id, value]) => `${id}: PF ${value?.hp} ${(value?.conditions || []).join(",")} ${(value?.pills || []).length}p`).join(" ; "),
  (log.errors || []).length ? `ERRORI ${log.errors.join("|").slice(0, 120)}` : "",
].filter(Boolean).join(" | ");

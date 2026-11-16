// Trasformazioni, lotto W4 (docs/PIANO_TRASFORMAZIONI.md): la velocità della forma sostituisce quella del druido (W4a,
// replaceMeters), anche più bassa; gli altri effetti valgono sopra. La taglia del token segue la forma e torna (W4b).
import assert from "node:assert/strict";
import test from "node:test";
import { resolveMovementProfile } from "../src/movementProfileCore.js";
import { TRANSFORMATION_TOKEN_BEFORE_FIELD, planTransformationTokenSizes } from "../src/transformationTokenSizeCore.js";

const formPill = (name, modes, extra = {}) => ({
  id: `class-feature:ws:${name}`, condition: "Forma Selvatica", active: true, effectId: "druido-forma-selvatica", parentEffectId: "ws",
  mechanics: { movement: { label: `Forma Selvatica · ${name}`, modes, ...extra } },
});
const wolf = formPill("Wolf", { walk: { replaceMeters: 12 } });
const toad = formPill("Giant Toad", { walk: { replaceMeters: 6 }, swim: { replaceMeters: 12 } });
const shark = formPill("Hunter Shark", { swim: { replaceMeters: 12 } }, { suppressModes: ["walk"] });
const speeds = (profile) => Object.fromEntries(profile.movementModes.map((mode) => [mode.id, mode.speedMeters]));

test("W4a: il passo della forma sostituisce quello del druido, anche se è più lento", () => {
  assert.deepEqual(speeds(resolveMovementProfile(9, [])), { walk: 9 });
  const shaped = resolveMovementProfile(9, [wolf]);
  assert.deepEqual(speeds(shaped), { walk: 12 });
  assert.ok(shaped.modes.walk.reasons.includes("Forma Selvatica · Wolf"), "the Movement panel names the form");
  assert.deepEqual(speeds(resolveMovementProfile(9, [toad])), { walk: 6, swim: 12 }, "slower than the druid: the toad's 6 m");
});

test("W4a: una forma che non cammina toglie il passo; nuota con il suo", () => {
  const profile = resolveMovementProfile(9, [shark], [], "swim");
  assert.deepEqual(speeds(profile), { swim: 12 });
  assert.equal(profile.activeMode, "swim");
});

test("W4a: Passo Veloce e le condizioni valgono sopra la forma", () => {
  assert.deepEqual(speeds(resolveMovementProfile(9, [wolf], [{ spellId: "longstrider" }])), { walk: 15 });
  assert.equal(resolveMovementProfile(9, [wolf, { id: "grab", condition: "Afferrato", active: true }]).speedMeters, 0);
  assert.deepEqual(speeds(resolveMovementProfile(9, [{ ...wolf, active: false }])), { walk: 9 }, "a pill turned off");
});

// W4b (G36): il pianificatore della taglia. Un token di una casella (immagine 300 px, griglia 300 dpi).

const META = "com.thebigpicture.initiative/meta";
const sizedForm = (name, size) => ({ id: `class-feature:ws:${name}`, condition: "Forma Selvatica", active: true,
  mechanics: { transformation: { kind: "wild-shape", keepsMind: true, form: { name, type: "beast", cr: "1", size, speeds: { walk: 12 }, actions: [] } } } });
const token = ({ scale = 1, pill = null, before } = {}) => ({
  id: "druid", type: "IMAGE", layer: "CHARACTER", image: { url: "https://assets.test/druid.png", mime: "image/png", width: 300, height: 300 },
  grid: { dpi: 300, offset: { x: 150, y: 150 } },
  scale: { x: scale, y: scale }, position: { x: 150, y: 150 },
  metadata: { [META]: { conditions: { instances: pill ? [pill] : [] }, ...(before === undefined ? {} : { [TRANSFORMATION_TOKEN_BEFORE_FIELD]: before }) } },
});

const OWN = { scale: { x: 1, y: 1 }, image: { url: "https://assets.test/druid.png", mime: "image/png", width: 300, height: 300 },
  grid: { dpi: 300, offset: { x: 150, y: 150 } } };

test("W4b: una forma Grande allarga il token e tiene la scala di prima; una seconda passata non fa niente", () => {
  assert.deepEqual(planTransformationTokenSizes([token({ pill: sizedForm("Brown Bear", "large") })], META),
    { resize: [{ id: "druid", cells: 2, before: OWN }], restore: [], portrait: [] });
  assert.deepEqual(planTransformationTokenSizes([token({ scale: 2, pill: sizedForm("Brown Bear", "large"), before: { scale: { x: 1, y: 1 } } })], META),
    { resize: [], restore: [], portrait: [] }, "already the bear's size");
  assert.deepEqual(planTransformationTokenSizes([token({ pill: sizedForm("Wolf", "medium") })], META), { resize: [], restore: [], portrait: [] },
    "a Medium form on a Medium druid: nothing to write");
});

test("W4b: cambiando forma la scala di prima resta quella del druido; finita la forma torna", () => {
  assert.deepEqual(planTransformationTokenSizes([token({ scale: 2, pill: sizedForm("Wolf", "medium"), before: { scale: { x: 1, y: 1 } } })], META),
    { resize: [{ id: "druid", cells: 1, before: null }], restore: [], portrait: [] });
  assert.deepEqual(planTransformationTokenSizes([token({ scale: 2, before: { scale: { x: 1, y: 1 } } })], META),
    { resize: [], restore: [{ id: "druid", scale: { x: 1, y: 1 } }], portrait: [] });
  const sheetPill = { ...sizedForm("Wolf", "medium"), mechanics: { transformation: { kind: "wild-shape" } } };
  assert.deepEqual(planTransformationTokenSizes([token({ scale: 2, pill: sheetPill, before: { scale: { x: 1, y: 1 } } })], META).restore,
    [{ id: "druid", scale: { x: 1, y: 1 } }], "a pill without a form is no form");
  assert.deepEqual(planTransformationTokenSizes([token({ scale: 2, pill: { ...sizedForm("Brown Bear", "large"), active: false },
    before: { scale: { x: 1, y: 1 } } })], META).restore.length, 1, "a pill turned off");
});

test("W4b: niente per i token senza geometria, gli allegati e le forme senza taglia", () => {
  const noGrid = { ...token({ pill: sizedForm("Brown Bear", "large") }), grid: undefined };
  const attached = { ...token({ pill: sizedForm("Brown Bear", "large") }), attachedTo: "other" };
  const noSize = token({ pill: sizedForm("Mystery", "") });
  assert.deepEqual(planTransformationTokenSizes([noGrid, attached, noSize, token()], META), { resize: [], restore: [], portrait: [] });
});

// 16/11/2026: the form's portrait on the token, and its own image back at the end.
const PORTRAIT = { url: "https://images.test/bestiary/tokens/MM/Brown%20Bear.webp", width: 280, height: 280, mime: "image/webp" };
const portraitForm = (name, size, portrait = PORTRAIT) => {
  const pill = sizedForm(name, size);
  pill.mechanics.transformation.portrait = portrait;
  return pill;
};

test("ritratto: il token indossa il ritratto della forma, tiene ciò che aveva e lo rimette alla fine", async () => {
  const { setTokenPortrait } = await import("../src/tokenPortraitCore.js");
  const { setTokenCells, tokenCells } = await import("../src/tokenSizeCore.js");
  const wolf = planTransformationTokenSizes([token({ pill: portraitForm("Wolf", "medium") })], META);
  assert.deepEqual(wolf, { resize: [], restore: [], portrait: [{ id: "druid", portrait: PORTRAIT, before: OWN }] });
  const bear = planTransformationTokenSizes([token({ pill: portraitForm("Brown Bear", "large") })], META);
  assert.deepEqual([bear.resize[0].before, bear.portrait[0].before], [OWN, null], "one before, with the resize");
  // As the controller writes: the portrait first (the cells stay), then the size.
  const draft = structuredClone(token({ pill: portraitForm("Brown Bear", "large") }));
  assert.equal(setTokenPortrait(draft, PORTRAIT), true);
  assert.equal(tokenCells(draft), 1, "the portrait keeps the footprint");
  setTokenCells(draft, 2);
  assert.deepEqual([draft.image.url, tokenCells(draft)], [PORTRAIT.url, 2]);
  // Worn, with the field: nothing more to do; the form gone: the token as it was.
  const worn = { ...draft, metadata: { [META]: { ...draft.metadata[META], [TRANSFORMATION_TOKEN_BEFORE_FIELD]: OWN } } };
  assert.deepEqual(planTransformationTokenSizes([worn], META), { resize: [], restore: [], portrait: [] });
  const ended = { ...worn, metadata: { [META]: { conditions: { instances: [] }, [TRANSFORMATION_TOKEN_BEFORE_FIELD]: OWN } } };
  assert.deepEqual(planTransformationTokenSizes([ended], META).restore,
    [{ id: "druid", scale: { x: 1, y: 1 }, image: OWN.image, grid: OWN.grid }]);
});

test("ritratto: una forma nuova senza ritratto rimette l'immagine; il boss non lo indossa", () => {
  const wearing = { ...token({ pill: sizedForm("Wolf", "medium"), before: OWN }), image: { ...PORTRAIT } };
  assert.deepEqual(planTransformationTokenSizes([wearing], META).portrait, [{ id: "druid", image: OWN.image, grid: OWN.grid }]);
  const boss = token({ pill: portraitForm("Wolf", "medium") });
  boss.metadata[META].initiativeCard = { bossActionBinding: { mode: "paragon" } };
  assert.deepEqual(planTransformationTokenSizes([boss], META).portrait, []);
  assert.deepEqual(planTransformationTokenSizes([token({ pill: portraitForm("Wolf", "medium", { url: "javascript:alert(1)", width: 1, height: 1 }) })],
    META).portrait, [], "an address that is not an image's");
});

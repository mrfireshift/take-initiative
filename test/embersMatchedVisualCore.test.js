import test from "node:test";
import assert from "node:assert/strict";
import {
  EMBERS_MATCHED_CLASS_FEATURE_IDS,
  EMBERS_MATCHED_SPELL_IDS,
  EMBERS_MATCHED_VISUAL_CHANNEL,
  buildMatchedVisualEvent,
  getMatchedSpellVisualDefinition,
  isMatchedClassFeatureVisual,
  matchedVisualEffectIds,
  matchedVisualLayerPlan,
} from "../src/embersMatchedVisualCore.js";

const sampleGeometry = {
  caster: { x: 100, y: 100 },
  targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
  targetIds: ["target-1"],
  preview: {
    type: "circle",
    start: { x: 700, y: 100 },
    end: { x: 1300, y: 100 },
    radius: 600,
    dpi: 150,
  },
  sceneDpi: 150,
};

test("il mapping copre le 54 spell riconciliate dall'audit e l'alias Blocca mostri", () => {
  assert.equal(EMBERS_MATCHED_SPELL_IDS.length, 55);
  assert.equal(new Set(EMBERS_MATCHED_SPELL_IDS).size, 55);
  for (const spellId of EMBERS_MATCHED_SPELL_IDS) {
    assert.ok(getMatchedSpellVisualDefinition(spellId), spellId);
  }
});

test("il contratto visuale mantiene il renderer Fireball dedicato", () => {
  const definition = getMatchedSpellVisualDefinition("fireball");
  assert.equal(definition.usesExistingFireballRenderer, true);
  assert.equal(buildMatchedVisualEvent({
    spellId: "fireball",
    ...sampleGeometry,
  }), null);
});

test("Guscio Anti-vita mantiene il VFX Embers dopo l'avvio senza duplicare eventi", () => {
  const definition = getMatchedSpellVisualDefinition("antilife-shell");
  assert.equal(definition.visuals.length, 1);
  assert.equal(definition.visuals[0].effectId, "antilifeShell");
  assert.equal(definition.visuals[0].attachedTo, "caster");
  assert.equal(definition.visuals[0].persistent, true);

  const event = buildMatchedVisualEvent({
    spellId: "antilife-shell",
    eventId: "antilife-shell-cast",
    lifecycleId: "antilife-shell-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 150 },
    targetIds: ["caster-1"],
    sceneDpi: 150,
    gridScale: { multiplier: 1.5, unit: "m" },
  });
  assert.equal(event.layers.length, 1);
  assert.equal(event.layers[0].persistent, true);
  assert.deepEqual(event.layers[0].center, { x: 100, y: 100 });
  assert.equal(matchedVisualLayerPlan(event.layers[0], event.dpi).duration, 4000);
});

test("tutte le entry non-Fireball producono almeno un layer WebM con geometria valida", () => {
  for (const spellId of EMBERS_MATCHED_SPELL_IDS.filter((id) => id !== "fireball")) {
    const event = buildMatchedVisualEvent({
      spellId,
      eventId: `${spellId}-event`,
      casterId: "caster-1",
      ...sampleGeometry,
    });
    assert.ok(event, spellId);
    assert.equal(event.type, "embers-matched");
    assert.ok(event.layers.length > 0, spellId);
    for (const layer of event.layers) {
      const plan = matchedVisualLayerPlan(layer, event.dpi);
      assert.ok(plan?.url, `${spellId}:${layer.effectId}`);
      assert.ok(plan.scale > 0, `${spellId}:${layer.effectId}`);
    }
  }
});

test("l'area usa il raggio scena e il target mantiene la rotazione", () => {
  const event = buildMatchedVisualEvent({
    spellId: "phb2014-nube-di-pugnali",
    eventId: "cloud-event",
    ...sampleGeometry,
  });
  const plan = matchedVisualLayerPlan(event.layers[0], event.dpi);
  assert.equal(event.layers[0].radius, 600);
  assert.equal(plan.rotation, 0);
  assert.match(plan.url, /CloudOfDaggers_01_Light_Blue_400x400\.webm$/);

  const projectile = buildMatchedVisualEvent({
    spellId: "fire-bolt",
    eventId: "bolt-event",
    ...sampleGeometry,
  });
  const projectilePlan = matchedVisualLayerPlan(projectile.layers[0], projectile.dpi);
  assert.equal(projectilePlan.rotation, 0);
  assert.deepEqual(projectilePlan.position, { x: 100, y: 100 });
});

test("Braccia di Hadar replica il blueprint Embers su caster e bersagli", () => {
  const event = buildMatchedVisualEvent({
    spellId: "phb2014-braccia-di-hadar",
    eventId: "arms-of-hadar-event",
    lifecycleId: "arms-of-hadar-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 700, y: 700 }, diameter: 150 },
    targets: [{ id: "target-1", center: { x: 1000, y: 700 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 150,
  });

  assert.equal(event.layers.length, 2);
  const [casterLayer, targetLayer] = event.layers;
  assert.deepEqual(event.layers.map((layer) => ({
    effectId: layer.effectId,
    anchor: layer.anchor,
    attachedTo: layer.attachedTo,
    layer: layer.layer,
    persistent: layer.persistent,
    targetId: layer.targetId,
    radius: layer.radius,
  })), [
    {
      effectId: "armsOfHadar",
      anchor: "target",
      attachedTo: "target",
      layer: "ATTACHMENT",
      persistent: false,
      targetId: "caster-1",
      // Embers: size = radius (4 cells) + caster.size (1 cell) => 5 cells.
      radius: 375,
    },
    {
      effectId: "armsOfHadar",
      anchor: "target",
      attachedTo: "target",
      layer: "ATTACHMENT",
      persistent: false,
      targetId: "target-1",
      // Embers: size = radius (4 cells) + target.size (1 cell) => 5 cells.
      radius: 375,
    },
  ]);
  assert.deepEqual(casterLayer.center, { x: 700, y: 700 });
  assert.deepEqual(targetLayer.center, { x: 1000, y: 700 });

  const plan = matchedVisualLayerPlan(casterLayer, event.dpi);
  assert.match(plan.url, /ArmsOfHadar_01_Dark_Purple_75OPA_500x500\.webm$/);
  assert.equal(plan.duration, 5000);
});

test("Catena di fulmini costruisce un primario e rimbalzi dal primario", () => {
  const event = buildMatchedVisualEvent({
    spellId: "chain-lightning",
    eventId: "chain-lightning-event",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 150 },
    targetIds: ["primary", "secondary-1", "secondary-2"],
    // L'ordine geometrico non deve sovrascrivere la sequenza esplicita dei
    // bersagli prodotta dal targeting locale.
    targets: [
      { id: "secondary-2", center: { x: 100, y: 700 }, diameter: 150 },
      { id: "secondary-1", center: { x: 700, y: 700 }, diameter: 150 },
      { id: "primary", center: { x: 700, y: 100 }, diameter: 150 },
    ],
    sceneDpi: 150,
  });

  assert.deepEqual(matchedVisualEffectIds("chain-lightning"), [
    "chainLightningPrimary",
    "chainLightningSecondary",
  ]);
  assert.equal(event.layers.length, 3);
  assert.deepEqual(event.layers.map((layer) => layer.effectId), [
    "chainLightningPrimary",
    "chainLightningSecondary",
    "chainLightningSecondary",
  ]);
  assert.deepEqual(event.layers.map((layer) => layer.delay), [0, 1000, 1000]);
  assert.deepEqual(event.layers.map((layer) => layer.targetId), [
    "primary",
    "secondary-1",
    "secondary-2",
  ]);
  assert.deepEqual(event.layers.map((layer) => ({
    source: layer.source,
    destination: layer.destination,
  })), [
    {
      source: { x: 100, y: 100 },
      destination: { x: 700, y: 100 },
    },
    {
      source: { x: 700, y: 100 },
      destination: { x: 700, y: 700 },
    },
    {
      source: { x: 700, y: 100 },
      destination: { x: 100, y: 700 },
    },
  ]);
  assert.ok(event.layers.every((layer) => layer.layer === "ATTACHMENT"));
  assert.ok(event.layers.every((layer) => layer.persistent === false));

  const primaryPlan = matchedVisualLayerPlan(event.layers[0], event.dpi);
  const secondaryPlan = matchedVisualLayerPlan(event.layers[1], event.dpi);
  assert.match(primaryPlan.url, /ChainLightning_01_Regular_Blue_15ft_Primary_1000x400\.webm$/);
  assert.match(secondaryPlan.url, /ChainLightning_01_Regular_Blue_15ft_Secondary_1000x400\.webm$/);
  assert.equal(primaryPlan.rotation, 0);
  assert.equal(secondaryPlan.rotation, 90);
});

test("Catena di fulmini senza secondari produce solo il segmento primario", () => {
  const event = buildMatchedVisualEvent({
    spellId: "chain-lightning",
    eventId: "chain-lightning-primary-only",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 150 },
    targetIds: ["primary"],
    targets: [{ id: "primary", center: { x: 700, y: 100 }, diameter: 150 }],
    sceneDpi: 150,
  });

  assert.equal(event.layers.length, 1);
  assert.equal(event.layers[0].effectId, "chainLightningPrimary");
  assert.equal(event.layers[0].delay, 0);
});

test("i cast self e target costruiscono il lifecycle persistente", () => {
  const self = buildMatchedVisualEvent({
    spellId: "shield",
    eventId: "shield-start",
    lifecycleId: "shield-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 },
    targetIds: [],
    sceneDpi: 100,
  });
  assert.equal(self.mode, "start");
  assert.equal(self.layers[0].effectId, "shieldIntro");
  assert.equal(self.layers[1].effectId, "shieldLoop");
  assert.equal(self.layers[1].persistent, true);
  assert.deepEqual(self.layers[1].center, { x: 100, y: 100 });
  assert.equal(self.layers[1].anchor, "caster");

  const target = buildMatchedVisualEvent({
    spellId: "hunters-mark",
    eventId: "mark-start",
    lifecycleId: "mark-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 150,
  });
  const loop = target.layers.find((layer) => layer.effectId === "huntersMarkLoop");
  assert.equal(loop.persistent, true);
  assert.equal(loop.targetId, "target-1");
});

test("un cast target che include il caster conserva l'ancora sul token", () => {
  const event = buildMatchedVisualEvent({
    spellId: "shield-of-faith",
    eventId: "shield-faith-self-target",
    lifecycleId: "shield-faith-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 },
    targets: [{ id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 }],
    targetIds: ["caster-1"],
    sceneDpi: 100,
  });
  const loop = event.layers.find((layer) => layer.effectId === "shieldFaithLoop");
  assert.equal(loop.targetId, "caster-1");
  assert.deepEqual(loop.center, { x: 100, y: 100 });
  assert.equal(loop.persistent, true);
  assert.equal(loop.attachedTo, "target");
});

test("un cast self senza targetIds aggancia comunque il loop al caster", () => {
  const event = buildMatchedVisualEvent({
    spellId: "shield-of-faith",
    eventId: "shield-faith-self-empty-targets",
    lifecycleId: "shield-faith-self-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 },
    targetIds: [],
    sceneDpi: 100,
  });
  const loop = event.layers.find((layer) => layer.effectId === "shieldFaithLoop");
  assert.equal(loop.targetId, "caster-1");
  assert.deepEqual(loop.center, { x: 100, y: 100 });
  assert.equal(loop.attachedTo, "target");
});

test("Folata di vento usa una sola animazione persistente con scala Embers e nessun outro dedicato", () => {
  const start = buildMatchedVisualEvent({
    spellId: "gust-of-wind",
    eventId: "gust-of-wind-start",
    lifecycleId: "gust-of-wind-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 150 },
    preview: {
      type: "rectangle",
      start: { x: 100, y: 100 },
      end: { x: 1900, y: 100 },
      widthSquares: 2,
      dpi: 150,
    },
    sceneDpi: 150,
  });

  assert.equal(start.layers.length, 1);
  const [layer] = start.layers;
  assert.equal(layer.effectId, "gustOfWind");
  assert.equal(layer.persistent, true);
  assert.equal(layer.attachedTo, "caster");
  assert.equal(layer.layer, "ATTACHMENT");
  const plan = matchedVisualLayerPlan(layer, start.dpi);
  assert.match(plan.url, /GustOfWind_01_White_1200x200\.webm$/);
  assert.equal(plan.duration, 4030);
  assert.equal(plan.scale, 2);
  assert.deepEqual(plan.position, { x: 100, y: 100 });
  assert.equal(plan.rotation, 0);

  const end = buildMatchedVisualEvent({
    spellId: "gust-of-wind",
    eventId: "gust-of-wind-end",
    lifecycleId: "gust-of-wind-instance",
    mode: "end",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 150 },
    preview: start.preview,
    sceneDpi: 150,
  });
  assert.deepEqual(end.layers, []);
});

test("Blocca persone segue il token e chiude il lifecycle senza outro Embers dedicato", () => {
  const start = buildMatchedVisualEvent({
    spellId: "hold-person",
    eventId: "hold-person-start",
    lifecycleId: "hold-person-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 },
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 100,
  });
  const intro = start.layers.find((layer) => layer.effectId === "holdPersonIntro");
  const loop = start.layers.find((layer) => layer.effectId === "holdPersonLoop");
  assert.equal(intro.attachedTo, "target");
  assert.equal(intro.layer, "ATTACHMENT");
  assert.equal(intro.targetId, "target-1");
  assert.equal(intro.persistent, false);
  assert.equal(matchedVisualLayerPlan(intro, start.dpi).duration, 5000);
  assert.match(matchedVisualLayerPlan(intro, start.dpi).url, /MarkerSimpleComplete001_001_Blue_600x600\.webm$/);
  assert.equal(loop.attachedTo, "target");
  assert.equal(loop.targetId, "target-1");
  assert.equal(loop.persistent, true);
  assert.equal(loop.layer, "ATTACHMENT");
  assert.match(matchedVisualLayerPlan(loop, start.dpi).url, /MarkerChainSpectralStandard01_02_Regular_Blue_Loop_400x400\.webm$/);

  const definition = getMatchedSpellVisualDefinition("hold-person");
  assert.deepEqual(definition.endVisuals, []);
  const end = buildMatchedVisualEvent({
    spellId: "hold-person",
    eventId: "hold-person-end",
    lifecycleId: "hold-person-instance",
    mode: "end",
    casterId: "caster-1",
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 100,
  });
  assert.equal(end.mode, "end");
  assert.deepEqual(end.layers, []);
});

test("Blocca mostri riusa in modo identico il visual lifecycle di Blocca persone", () => {
  const person = getMatchedSpellVisualDefinition("hold-person");
  const monster = getMatchedSpellVisualDefinition("hold-monster");
  assert.deepEqual(monster.visuals, person.visuals);
  assert.deepEqual(monster.endVisuals, person.endVisuals);

  const event = buildMatchedVisualEvent({
    spellId: "hold-monster",
    eventId: "hold-monster-start",
    lifecycleId: "hold-monster-instance",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 },
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 100,
  });
  assert.deepEqual(
    event.layers.map((layer) => ({
      effectId: layer.effectId,
      delay: layer.delay,
      persistent: layer.persistent,
      attachedTo: layer.attachedTo,
      layer: layer.layer,
      scale: layer.scale,
      targetId: layer.targetId,
    })),
    [
      {
        effectId: "holdPersonIntro",
        delay: 0,
        persistent: false,
        attachedTo: "target",
        layer: "ATTACHMENT",
        scale: 2,
        targetId: "target-1",
      },
      {
        effectId: "holdPersonLoop",
        delay: 350,
        persistent: true,
        attachedTo: "target",
        layer: "ATTACHMENT",
        scale: 1.5,
        targetId: "target-1",
      },
    ],
  );
});

test("Guardiani Spirituali usa il raggio dell'aura anche senza preview", () => {
  const event = buildMatchedVisualEvent({
    spellId: "spirit-guardians",
    eventId: "spirit-guardians-aura",
    lifecycleId: "spirit-guardians-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 100 },
    sceneDpi: 100,
    gridScale: { multiplier: 1.5, unit: "m" },
  });
  assert.equal(event.layers.length, 1);
  assert.equal(event.layers[0].radius, 300);
  assert.equal(matchedVisualLayerPlan(event.layers[0], event.dpi).scale, 2);
});

test("Ragnatela usa il lato della preview quadrata, non la diagonale", () => {
  const event = buildMatchedVisualEvent({
    spellId: "web",
    eventId: "web-square-area",
    lifecycleId: "web-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 100 },
    preview: {
      type: "square",
      start: { x: 500, y: 500 },
      end: { x: 900, y: 900 },
      dpi: 100,
    },
    sceneDpi: 100,
  });
  assert.equal(event.layers[0].radius, 200);
  assert.equal(event.layers[0].layer, "DRAWING");
  assert.equal(matchedVisualLayerPlan(event.layers[0], event.dpi).scale, 1);
});

test("Tempesta di Nevischio renderizza il VFX sotto i token", () => {
  const event = buildMatchedVisualEvent({
    spellId: "sleet-storm",
    eventId: "sleet-storm-area",
    lifecycleId: "sleet-storm-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 100 },
    preview: {
      type: "circle",
      start: { x: 500, y: 500 },
      end: { x: 800, y: 500 },
      dpi: 100,
    },
    sceneDpi: 100,
  });

  assert.equal(event.layers.length, 1);
  assert.equal(event.layers[0].layer, "DRAWING");
});

test("Sfera Infuocata aggancia il WebM al root della zona mobile", () => {
  const event = buildMatchedVisualEvent({
    spellId: "flaming-sphere",
    eventId: "flaming-sphere-zone",
    lifecycleId: "flaming-sphere-instance",
    casterId: "caster-1",
    zoneId: "zone-root-1",
    caster: { x: 100, y: 100, diameter: 100 },
    preview: {
      type: "circle",
      start: { x: 700, y: 100 },
      end: { x: 850, y: 100 },
      radius: 75,
      dpi: 100,
    },
    sceneDpi: 100,
  });
  assert.equal(event.zoneId, "zone-root-1");
  assert.equal(event.layers.length, 1);
  assert.equal(event.layers[0].persistent, true);
  assert.equal(event.layers[0].attachedTo, "zone");
  assert.equal(event.layers[0].anchor, "area");
});

test("Bagliore Lunare aggancia il loop al root della zona mobile", () => {
  const event = buildMatchedVisualEvent({
    spellId: "moonbeam",
    eventId: "moonbeam-zone",
    lifecycleId: "moonbeam-instance",
    casterId: "caster-1",
    zoneId: "zone-root-1",
    caster: { x: 100, y: 100, diameter: 100 },
    preview: {
      type: "circle",
      start: { x: 700, y: 100 },
      end: { x: 850, y: 100 },
      radius: 75,
      dpi: 100,
    },
    sceneDpi: 100,
  });

  const loop = event.layers.find((layer) => layer.effectId === "moonbeamRegular");
  assert.ok(loop);
  assert.equal(loop.persistent, true);
  assert.equal(loop.attachedTo, "zone");
  assert.equal(loop.anchor, "area");
});

test("Invocare il fulmine usa il WebM opaco e il raggio della nube persistente", () => {
  const event = buildMatchedVisualEvent({
    spellId: "call-lightning",
    eventId: "call-lightning-cloud",
    lifecycleId: "call-lightning-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 100 },
    preview: {
      type: "circle",
      start: { x: 700, y: 100 },
      end: { x: 2500, y: 100 },
      radius: 1800,
      dpi: 100,
    },
    sceneDpi: 100,
  });

  const layer = event.layers.find((entry) => entry.effectId === "callLightning");
  assert.ok(layer);
  assert.equal(layer.persistent, true);
  assert.equal(layer.anchor, "area");
  assert.equal(layer.radius, 1800);

  const plan = matchedVisualLayerPlan(layer, event.dpi);
  assert.match(plan.url, /CallLightning_01_Blue_1000x1000\.webm$/);
  assert.equal(plan.duration, 4000);
});

test("Muro di Fuoco seleziona una sola geometria e usa la variante giallo-fuoco", () => {
  const line = buildMatchedVisualEvent({
    spellId: "wall-of-fire",
    placementChoice: "line-hot-right",
    eventId: "wall-of-fire-line",
    lifecycleId: "wall-of-fire-line-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 150 },
    preview: {
      type: "line",
      start: { x: 100, y: 100 },
      end: { x: 1300, y: 100 },
      gridOrigin: { x: 0, y: 0 },
      widthSquares: 1,
      widthAnchor: "edge",
      dpi: 100,
    },
    sceneDpi: 100,
  });
  assert.equal(line.layers.length, 1);
  assert.equal(line.layers[0].effectId, "wallOfFireLine");
  assert.equal(line.layers[0].kind, "wall");
  assert.equal(line.layers[0].persistent, true);
  assert.equal(line.layers[0].layer, "ATTACHMENT");
  assert.equal(line.placementChoice, "line-hot-right");
  assert.deepEqual(line.layers[0].source, { x: 100, y: 150 });
  assert.deepEqual(line.layers[0].destination, { x: 1300, y: 150 });
  assert.match(
    matchedVisualLayerPlan(line.layers[0], line.dpi).url,
    /WallOfFire_01_Yellow_75OPA_500x100\.webm$/,
  );
  const linePlan = matchedVisualLayerPlan(line.layers[0], line.dpi);
  assert.equal(linePlan.scaleY, linePlan.scale);

  const ring = buildMatchedVisualEvent({
    spellId: "wall-of-fire",
    placementChoice: "ring-hot-inside",
    eventId: "wall-of-fire-ring",
    lifecycleId: "wall-of-fire-ring-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 150 },
    preview: {
      type: "circle",
      start: { x: 700, y: 700 },
      end: { x: 1000, y: 700 },
      radius: 300,
      dpi: 100,
    },
    sceneDpi: 100,
  });
  assert.equal(ring.layers.length, 1);
  assert.equal(ring.layers[0].effectId, "wallOfFireRing");
  assert.equal(ring.layers[0].kind, "circle");
  assert.equal(ring.layers[0].persistent, true);
  assert.equal(ring.layers[0].layer, "ATTACHMENT");
  assert.equal(ring.placementChoice, "ring-hot-inside");
  assert.match(
    matchedVisualLayerPlan(ring.layers[0], ring.dpi).url,
    /WallOfFire_01_Yellow_Ring_75OPA_400x400\.webm$/,
  );
});

test("Sortilegio separa intro one-shot PROP e loop agganciato al bersaglio", () => {
  const event = buildMatchedVisualEvent({
    spellId: "phb2014-sortilegio",
    eventId: "hex-lifecycle",
    lifecycleId: "hex-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 100,
  });
  const intro = event.layers.find((layer) => layer.effectId === "genericMarkerPurple");
  const loop = event.layers.find((layer) => layer.effectId === "markerHorror");
  assert.equal(intro.persistent, false);
  assert.equal(intro.layer, "PROP");
  assert.equal(intro.attachedTo, "");
  assert.equal(loop.persistent, true);
  assert.equal(loop.attachedTo, "target");
  assert.equal(loop.targetId, "target-1");
});

test("il piano visuale conserva attachment e duration override del blueprint Embers", () => {
  const shield = buildMatchedVisualEvent({
    spellId: "shield",
    eventId: "shield-timing",
    lifecycleId: "shield-timing-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    sceneDpi: 100,
  });
  assert.equal(shield.layers[0].duration, 1200);
  assert.equal(shield.layers[1].attachedTo, "caster");
  assert.equal(matchedVisualLayerPlan(shield.layers[0], shield.dpi).duration, 1200);

  const entangle = buildMatchedVisualEvent({
    spellId: "entangle",
    eventId: "entangle-timing",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    preview: {
      type: "circle",
      start: { x: 100, y: 100 },
      end: { x: 700, y: 100 },
      radius: 600,
      dpi: 150,
    },
    sceneDpi: 150,
  });
  assert.equal(entangle.layers[0].duration, 7000);
});

test("il lifecycle end di Scudo mantiene l'outro del catalogo", () => {
  const event = buildMatchedVisualEvent({
    spellId: "shield",
    eventId: "shield-end",
    lifecycleId: "shield-instance",
    mode: "end",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    sceneDpi: 100,
  });
  assert.equal(event.mode, "end");
  assert.equal(event.layers.length, 1);
  assert.equal(event.layers[0].effectId, "shieldOutroFade");
  const loopPlan = matchedVisualLayerPlan(buildMatchedVisualEvent({
    spellId: "shield",
    eventId: "shield-loop-geometry",
    lifecycleId: "shield-loop-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    sceneDpi: 100,
  }).layers[1], event.dpi);
  const outroPlan = matchedVisualLayerPlan(event.layers[0], event.dpi);
  assert.equal(outroPlan.duration, 1500);
  assert.equal(outroPlan.scale, loopPlan.scale);
});

test("Esilio mantiene il portale in loop e riproduce il rientro alla fine", () => {
  const start = buildMatchedVisualEvent({
    spellId: "banishment",
    eventId: "banishment-start",
    lifecycleId: "banishment-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 200 },
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 100,
  });
  const ray = start.layers.find((layer) => layer.effectId === "rangedSpell");
  const loop = start.layers.find((layer) => layer.effectId === "portal");
  assert.equal(ray.delay, 0);
  assert.equal(loop.delay, 600);
  assert.equal(loop.persistent, true);
  assert.equal(loop.attachedTo, "target");
  assert.equal(loop.targetId, "target-1");
  assert.equal(loop.layer, "ATTACHMENT");

  const end = buildMatchedVisualEvent({
    spellId: "banishment",
    eventId: "banishment-end",
    lifecycleId: "banishment-instance",
    mode: "end",
    casterId: "caster-1",
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    targetIds: ["target-1"],
    sceneDpi: 100,
  });
  assert.equal(end.layers.length, 1);
  assert.equal(end.layers[0].effectId, "portal");
  assert.equal(end.layers[0].persistent, false);
  assert.equal(end.layers[0].duration, 3000);
  assert.equal(end.layers[0].targetId, "target-1");
  assert.equal(end.layers[0].layer, "ATTACHMENT");
});

test("Scudo della Fede rimuove il loop senza inventare un outro", () => {
  const definition = getMatchedSpellVisualDefinition("shield-of-faith");
  assert.deepEqual(definition.endVisuals, []);
  const event = buildMatchedVisualEvent({
    spellId: "shield-of-faith",
    eventId: "shield-faith-end",
    lifecycleId: "shield-faith-instance",
    mode: "end",
    casterId: "caster-1",
    targetIds: ["target-1"],
    caster: { x: 100, y: 100, diameter: 200 },
    targets: [{ id: "target-1", center: { x: 700, y: 100 }, diameter: 150 }],
    sceneDpi: 100,
  });
  assert.equal(event.mode, "end");
  assert.deepEqual(event.layers, []);
});

test("Ispirazione Bardica è registrata come capacità, non come spell", () => {
  assert.deepEqual(EMBERS_MATCHED_CLASS_FEATURE_IDS, ["bardo-ispirazione-bardica"]);
  assert.equal(isMatchedClassFeatureVisual("bardo-ispirazione-bardica"), true);
  assert.equal(EMBERS_MATCHED_VISUAL_CHANNEL, "com.thebigpicture.initiative/embers-matched-visual");
});


test("Passo Velato conserva le durate Embers dei due one-shot", () => {
  const event = buildMatchedVisualEvent({
    spellId: "misty-step",
    eventId: "misty-step-vfx",
    lifecycleId: "misty-step-instance",
    casterId: "caster-1",
    caster: { x: 100, y: 100, diameter: 150 },
    preview: { end: { x: 700, y: 100 }, dpi: 100 },
    sceneDpi: 100,
  });
  const out = event.layers.find((layer) => layer.effectId === "mistyStepOut");
  const incoming = event.layers.find((layer) => layer.effectId === "mistyStepIn");
  assert.equal(out.delay, 0);
  assert.equal(incoming.delay, 1500);
  assert.equal(out.oneShot, true);
  assert.equal(incoming.oneShot, true);
  assert.equal(matchedVisualLayerPlan(out, event.dpi).duration, 3000);
  assert.equal(matchedVisualLayerPlan(incoming, event.dpi).duration, 4870);
});

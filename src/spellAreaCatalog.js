import { AREA_PLACEABLE_SPELL_IDS } from "./areaSaveSpellRules.js";
// Area and range of the catalog spells, generated from spells-srd.js (which this module must not import).
import { SPELL_AREA_GEOMETRY_BY_ID } from "./spellAreaIndex.js";

const FEET_TO_METERS = 0.3;
const SIGHT_RANGE_METERS = 1500;

const EXPLICIT_RULE_SPELL_IDS = new Set([
  "phb2014-allucinazione-di-forza",
  "burning-hands",
  "cone-of-cold",
  "call-lightning",
  "entangle",
  "delayed-blast-fireball",
  "fireball",
  "lightning-bolt",
  "moonbeam",
  "prismatic-wall",
  "spirit-guardians",
  "web",
  "xanathar-investitura-della-fiamma",
  "xanathar-investitura-del-ghiaccio",
]);

const PERSISTENT_ZONE_SPELL_IDS = new Set([
  "alarm",
  "antipathy-sympathy",
  "black-tentacles",
  "blade-barrier",
  "cloudkill",
  "control-water",
  "darkness",
  "daylight",
  "earthquake",
  "entangle",
  "flaming-sphere",
  "fog-cloud",
  "forbiddance",
  "forcecage",
  "globe-of-invulnerability",
  "grease",
  "guardian-of-faith",
  "gust-of-wind",
  "glyph-of-warding",
  "hallow",
  "hallucinatory-terrain",
  "ice-storm",
  "incendiary-cloud",
  "insect-plague",
  "magic-circle",
  "mirage-arcane",
  "moonbeam",
  "move-earth",
  "prismatic-wall",
  "private-sanctum",
  "reverse-gravity",
  "silence",
  "sleet-storm",
  "spike-growth",
  "stinking-cloud",
  "storm-of-vengeance",
  "symbol",
  "teleportation-circle",
  "tiny-hut",
  "wall-of-fire",
  "wall-of-force",
  "wall-of-ice",
  "wall-of-thorns",
  "web",
  "wind-wall",
  "zone-of-truth",
  "xanathar-collera-della-natura",
  "xanathar-alba",
  "xanathar-boschetto-druidico",
  "xanathar-controllare-venti",
  "xanathar-creare-falo",
  "xanathar-diavoletto-di-polvere",
  "xanathar-fulgore-nauseante",
  "xanathar-maelstrom",
  "xanathar-muro-di-luce",
  "xanathar-muro-di-sabbia",
  "xanathar-muro-dacqua",
  "plant-growth",
  "xanathar-oscurita-della-follia",
  "xanathar-pirotecnica",
  "xanathar-scossa-tellurica",
  "xanathar-sfera-acquea",
  "xanathar-sfera-della-tempesta",
  "xanathar-spirito-guaritore",
  "xanathar-tempio-degli-dei",
  "xanathar-trabocchetto",
  "xanathar-trasmutare-roccia",
  "xanathar-turbine",
  "phb2014-nube-di-pugnali",
  "phb2014-cordone-di-frecce",
  "phb2014-fame-di-hadar",
  "phb2014-tsunami",
]);

const MOBILE_AURA_SPELL_IDS = new Set([
  "antilife-shell",
  "antimagic-field",
  "pass-without-trace",
  "speak-with-plants",
  "xanathar-vento-di-interdizione",
  "xanathar-investitura-della-fiamma",
  "phb2014-aura-di-purezza",
  "phb2014-aura-di-vita",
  "phb2014-aura-di-vitalita",
  "phb2014-cerchio-di-potere",
]);

const MOVABLE_ZONE_SPELL_IDS = new Set([
  "cloudkill",
  "darkness",
  "daylight",
  "incendiary-cloud",
  "moonbeam",
  "flaming-sphere",
  "gust-of-wind",
  "xanathar-alba",
  "xanathar-diavoletto-di-polvere",
  "xanathar-sfera-acquea",
  "xanathar-spirito-guaritore",
]);

const DRIFTING_ZONE_SPELL_IDS = new Set([
  "cloudkill",
  "phb2014-tsunami",
]);

const DECLARATIVE_ZONE_MOVEMENTS = Object.freeze({
  "flaming-sphere": Object.freeze({
    mode: "bonus-action",
    economy: "bonus-action",
    maximumMeters: 9,
    triggerOnAreaMove: true,
    stopOnFirstContact: true,
  }),
  "xanathar-spirito-guaritore": Object.freeze({
    mode: "bonus-action",
    economy: "bonus-action",
    maximumMeters: 9,
    triggerOnAreaMove: false,
    stopOnFirstContact: false,
  }),
  "xanathar-diavoletto-di-polvere": Object.freeze({
    mode: "bonus-action",
    economy: "bonus-action",
    maximumMeters: 9,
    triggerOnAreaMove: false,
    stopOnFirstContact: false,
    choice: Object.freeze({
      id: "dust-terrain",
      required: false,
      options: Object.freeze([
        Object.freeze({
          value: "none",
          label: "Nessuna nube di detriti",
        }),
        Object.freeze({
          value: "dust-terrain",
          label: "Attraversa sabbia, polvere, terriccio o ghiaia",
        }),
      ]),
    }),
  }),
});

// Override curati per record senza geometria strutturata o per campi SRD che
// descrivono l'altezza/estensione massima invece del raggio utile sulla mappa.
const AREA_OVERRIDES = Object.freeze({
  // A 15-foot cube that starts from the caster: a face touches the caster's token and the cube goes the way the GM
  // points, as a monster's cube (spellAreaRules.js). Centred on a vertex of the caster it always took the caster in.
  thunderwave: {
    shape: "rectangle",
    widthMeters: 4.5,
    origin: "caster-adjacent",
  },
  // Zones of lotto L3 (2014 texts).
  "xanathar-muro-di-sabbia": {
    shape: "line",
    sizeMeters: 9,
    widthMeters: 3,
    origin: "point",
    rangeMeters: 27,
    heightMeters: 3,
    note: "Muro di sabbia 9 × 3 × 3 m: blocca la vista, non il movimento.",
  },
  // CAP-TERRAIN, lotto G1 (2014): a line of 9 m or a ring of 6 m in diameter, 30 cm thick.
  "xanathar-muro-dacqua": {
    shape: "line",
    sizeMeters: 9,
    widthMeters: 0.3,
    origin: "point",
    rangeMeters: 18,
    heightMeters: 3,
    snapOrigin: "vertex",
    widthAnchor: "edge",
    placementOptional: false,
    placementChoices: [
      { id: "line", label: "Muro lineare, 9 m", shape: "line", sizeMeters: 9, widthMeters: 0.3, snapOrigin: "vertex", widthAnchor: "edge" },
      { id: "ring", label: "Muro circolare, 6 m di diametro", shape: "circle", sizeMeters: 3, widthMeters: 0.3, ring: true, innerSizeMeters: 2.7 },
    ],
    note: "A distanza attraverso il muro: svantaggio. Fuoco attraverso il muro: danni dimezzati. Il freddo lo congela: sezioni di 1,5 m con CA 5 e 15 PF, al tavolo.",
  },
  // CAP-TERRAIN, lotto G1 (2014): the use with an action; the 8 hours' one has no zone, it is cast without placing it.
  "plant-growth": {
    shape: "circle",
    sizeMeters: 30,
    origin: "point",
    rangeMeters: 45,
    note: "Le aree escluse e i vegetali mancanti restano al tavolo. Per l'uso da 8 ore (terra fertile) lancia senza posizionare la zona.",
  },
  "blade-barrier": {
    shape: "line",
    sizeMeters: 30,
    widthMeters: 1.5,
    origin: "point",
    rangeMeters: 27,
    placementChoices: [
      { id: "line", label: "Muro lineare, 30 m", shape: "line", sizeMeters: 30, widthMeters: 1.5 },
      { id: "ring", label: "Muro circolare, 18 m di diametro", shape: "circle", sizeMeters: 9, widthMeters: 1.5, ring: true, innerSizeMeters: 7.5 },
    ],
  },
  "wall-of-thorns": {
    shape: "line",
    sizeMeters: 18,
    widthMeters: 1.5,
    origin: "point",
    rangeMeters: 36,
    placementChoices: [
      { id: "line", label: "Muro lineare, 18 m", shape: "line", sizeMeters: 18, widthMeters: 1.5 },
      { id: "ring", label: "Muro circolare, 6 m di diametro", shape: "circle", sizeMeters: 3, widthMeters: 1.5, ring: true, innerSizeMeters: 1.5 },
    ],
  },
  "wall-of-force": {
    shape: "line",
    sizeMeters: 30,
    widthMeters: 0.3,
    origin: "point",
    rangeMeters: 36,
    snapOrigin: "vertex",
    widthAnchor: "edge",
    placementOptional: false,
    placementChoices: [
      { id: "panels", label: "Dieci pannelli in linea", shape: "line", sizeMeters: 30, widthMeters: 0.3, snapOrigin: "vertex", widthAnchor: "edge" },
      { id: "dome", label: "Cupola o sfera di 3 m", shape: "circle", sizeMeters: 3 },
    ],
    note: "Nulla attraversa il muro; immune ai danni e a Dissolvi magie, Disintegrazione lo distrugge.",
  },
  // Pyrotechnics (XGtE): the fireworks blind within 3 m of the flame (Constitution save); the smoke fills 6 m for
  // 1 minute. One zone for both: with the smoke the GM marks every outcome as passed.
  // Transmute Rock (XGtE): a 12 m cube; only the mud stays on the map.
  "xanathar-trasmutare-roccia": {
    shape: "square",
    sizeMeters: 12,
    origin: "point",
    rangeMeters: 36,
    placementOptional: false,
    initialSave: { ability: "str" },
    initialSaveByChoice: {
      "mud-to-rock": { ability: "dex" },
      "falling-mud": { ability: "dex" },
    },
    instantChoices: ["mud-to-rock", "falling-mud"],
    note: "Il fango resta finché non viene dissolto; il fango in roccia lavora su fango profondo al massimo 3 m.",
  },
  "xanathar-pirotecnica": {
    shape: "circle",
    sizeMeters: 3,
    origin: "point",
    rangeMeters: 18,
    placementOptional: false,
    initialSave: { ability: "con" },
    placementChoices: [
      { id: "fireworks", label: "Fuochi d'artificio: 3 m attorno alla fiamma", shape: "circle", sizeMeters: 3 },
      { id: "smoke", label: "Fumo: 6 m attorno alla fiamma", shape: "circle", sizeMeters: 6 },
    ],
    note: "La fiamma scelta si spegne. Fumo: nessun TS, segnare ogni esito come superato.",
  },
  // The difficult terrain lasts until the end of the caster's next turn; the save is the cast's.
  "ice-storm": {
    shape: "circle",
    sizeMeters: 6,
    origin: "point",
    rangeMeters: 90,
    heightMeters: 12,
    placementOptional: false,
    initialSave: { ability: "dex" },
  },
  "forbiddance": {
    shape: "square",
    sizeMeters: 60,
    origin: "point",
    rangeMeters: 1.5,
    heightMeters: 9,
    note: "Niente teletrasporto né viaggi planari nell'area; il danno colpisce soltanto i tipi scelti.",
  },
  "antipathy-sympathy": {
    shape: "circle",
    sizeMeters: 18,
    origin: "point",
    rangeMeters: 18,
  },
  "color-spray": {
    note: "Dopo la sagoma, sblocca la selezione e mantieni soltanto le creature coperte dal totale di dadi",
  },
  "divine-word": {
    shape: "circle",
    sizeMeters: 9,
    origin: "caster",
  },
  // Range "Self": the 30-foot reach of the creatures it covers.
  "pass-without-trace": {
    shape: "circle",
    sizeMeters: 9,
    origin: "caster",
  },
  "flame-strike": {
    shape: "circle",
    sizeMeters: 3,
  },
  "incendiary-cloud": {
    placementOptional: false,
  },
  "xanathar-controllare-venti": {
    placementOptional: false,
  },
  "forcecage": {
    shape: "square",
    sizeMeters: 6,
    placementChoices: [
      { id: "cage", label: "Gabbia 4×4", sizeMeters: 6 },
      { id: "box", label: "Box solida 2×2", sizeMeters: 3 },
    ],
  },
  "flaming-sphere": {
    shape: "square",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 18,
    membershipPaddingSquares: 1,
  },
  "guardian-of-faith": {
    shape: "circle",
    sizeMeters: 4.5,
  },
  "gust-of-wind": {
    shape: "rectangle",
    sizeMeters: 18,
    widthMeters: 3,
    origin: "caster-adjacent",
    followCaster: true,
  },
  "glyph-of-warding": {
    shape: "circle",
    sizeMeters: 6,
    origin: "point",
    rangeMeters: 1.5,
  },
  "hypnotic-pattern": {
    shape: "square",
    sizeMeters: 9,
    origin: "point",
    rangeMeters: 36,
  },
  "holy-aura": {
    note: "Mantieni selezionate soltanto le creature scelte dal caster",
  },
  "mass-cure-wounds": {
    note: "L'incantesimo può curare al massimo sei creature",
  },
  "wall-of-ice": {
    shape: "line",
    sizeMeters: 30,
    widthMeters: 1.5,
    origin: "point",
    rangeMeters: 36,
    note: "La sagoma rappresenta fino a dieci pannelli contigui in linea; cupola, sfera e singole sezioni distrutte restano da gestire manualmente.",
  },
  "misty-step": {
    shape: "square",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 9,
    note: "Seleziona la casella libera di destinazione entro 9 metri",
  },
  "dimension-door": {
    shape: "square",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 150,
    centered: true,
    note: "Seleziona il punto di arrivo entro 150 metri; visibilità, visualizzazione, descrizione e spazio libero restano assistiti dal GM.",
  },
  "move-earth": {
    shape: "square",
    sizeMeters: 12,
    origin: "point",
    rangeMeters: 36,
  },
  // Symbol (2014): the sphere opens where the glyph is, wherever the caster may be by then.
  "symbol": {
    shape: "circle",
    sizeMeters: 18,
    origin: "point",
    rangeMeters: SIGHT_RANGE_METERS,
    placementOptional: false,
    initialSave: { ability: "con" },
    initialSaveByChoice: {
      despair: { ability: "cha" },
      fear: { ability: "wis" },
      insanity: { ability: "int" },
      sleep: { ability: "wis" },
      stunning: { ability: "wis" },
    },
    note: "Posiziona la sfera dove si trova il glifo. Cosa lo innesca e la prova per scorgerlo restano al tavolo.",
  },
  "sleep": {
    note: "Dopo la sagoma, sblocca la selezione e mantieni soltanto le creature coperte dal totale di dadi",
  },
  "xanathar-coltello-di-ghiaccio": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 18,
  },
  "xanathar-diavoletto-di-polvere": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 18,
  },
  "xanathar-sfera-della-tempesta": {
    placementOptional: false,
  },
  "xanathar-turbine": {
    shape: "circle",
    sizeMeters: 3,
    origin: "point",
    rangeMeters: 90,
    heightMeters: 9,
    initialSave: { ability: "dex" },
    placementOptional: false,
    carriedEffectIds: ["xanathar-turbine-restrained"],
    ownerLabelTargets: "none",
  },
  "xanathar-investitura-della-fiamma": {
    shape: "line",
    sizeMeters: 4.5,
    widthMeters: 1.5,
    origin: "caster-adjacent",
  },
  "xanathar-investitura-della-pietra": {
    shape: "circle",
    sizeMeters: 4.5,
    origin: "caster",
  },
  "xanathar-drago-illusorio": {
    shape: "cone",
    sizeMeters: 18,
    origin: "point",
    rangeMeters: 36,
  },
  "xanathar-minuscole-meteore-di-melf": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 36,
    note: "La sagoma rappresenta l'esplosione di una meteora",
  },
  "wall-of-fire": {
    shape: "line",
    sizeMeters: 18,
    widthMeters: 0.3,
    origin: "point",
    rangeMeters: 36,
    placementOptional: false,
    placementChoices: [
      {
        id: "line-hot-left",
        label: "Muro lineare — lato caldo a sinistra",
        shape: "line",
        sizeMeters: 18,
        widthMeters: 0.3,
        snapOrigin: "vertex",
        widthAnchor: "edge",
        hotBand: { side: "left", widthMeters: 3 },
      },
      {
        id: "line-hot-right",
        label: "Muro lineare — lato caldo a destra",
        shape: "line",
        sizeMeters: 18,
        widthMeters: 0.3,
        snapOrigin: "vertex",
        widthAnchor: "edge",
        hotBand: { side: "right", widthMeters: 3 },
      },
      {
        id: "ring-hot-inside",
        label: "Muro circolare — lato caldo interno",
        shape: "circle",
        sizeMeters: 3,
        widthMeters: 0.3,
        innerSizeMeters: 2.7,
        ring: true,
        hotBand: { side: "inside", widthMeters: 3 },
      },
      {
        id: "ring-hot-outside",
        label: "Muro circolare — lato caldo esterno",
        shape: "circle",
        sizeMeters: 3,
        widthMeters: 0.3,
        innerSizeMeters: 2.7,
        ring: true,
        hotBand: { side: "outside", widthMeters: 3 },
      },
    ],
  },
  "wind-wall": {
    shape: "line",
    sizeMeters: 15,
    widthMeters: 0.3,
    origin: "point",
    rangeMeters: 36,
    placementOptional: false,
    initialSave: { ability: "str" },
    note: "Linea retta fino a 15 m; forme continue diverse ammesse dal RAW restano manuali.",
  },
  "xanathar-muro-di-luce": {
    shape: "line",
    sizeMeters: 18,
    widthMeters: 1.5,
    origin: "point",
    rangeMeters: 36,
    // Il punto scelto è sia un vertice della griglia sia un vertice della
    // footprint del muro: lo spessore si sviluppa tutto da un solo lato.
    snapOrigin: "vertex",
    widthAnchor: "edge",
  },
  "xanathar-tempio-degli-dei": {
    shape: "square",
    sizeMeters: 36,
    origin: "point",
    rangeMeters: 36,
  },
  "xanathar-onda-di-marea": {
    shape: "line",
    sizeMeters: 9,
    widthMeters: 3,
    origin: "point",
    rangeMeters: 36,
  },
  "xanathar-parola-radiosa": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "caster",
  },
  "xanathar-passo-del-tuono": {
    shape: "circle",
    sizeMeters: 3,
    origin: "caster",
  },
  "xanathar-rombo-di-tuono": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "caster",
  },
  "xanathar-scossa-tellurica": {
    shape: "circle",
    sizeMeters: 3,
    origin: "caster",
    // Lotto L3: a zone for the difficult terrain it leaves, with the Dexterity save of the cast.
    initialSave: { ability: "dex" },
    note: "Su pietra o terra smossa, il terreno diventa difficile finché non viene sgombrato; lo sgombero manuale richiede 1 minuto per ogni porzione di diametro 1,5 m.",
  },
  "xanathar-vampa-di-aganazzar": {
    shape: "line",
    sizeMeters: 9,
    widthMeters: 1.5,
    origin: "caster-adjacent",
  },
  "phb2014-raffica-di-spine": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 180,
  },
  "phb2014-cordone-di-frecce": {
    shape: "circle",
    sizeMeters: 9,
    origin: "point",
    rangeMeters: 1.5,
  },
  "teleportation-circle": {
    shape: "circle",
    sizeMeters: 1.5,
    origin: "point",
    rangeMeters: 3,
    note: "La misura rappresenta il raggio del cerchio",
  },
  "phb2014-freccia-folgorante": {
    shape: "circle",
    sizeMeters: 3,
    origin: "point",
    rangeMeters: 180,
  },
  "phb2014-tsunami": {
    shape: "line",
    sizeMeters: 90,
    widthMeters: 15,
    origin: "point",
    rangeMeters: SIGHT_RANGE_METERS,
  },
});

const SHAPE_BY_CATALOG_TYPE = Object.freeze({
  cone: "cone",
  cube: "square",
  cylinder: "circle",
  line: "line",
  radius: "circle",
  sphere: "circle",
});

function roundedMeters(value) {
  return Math.round(Number(value) * 10) / 10;
}

function metricNumber(value) {
  const match = String(value || "")
    .trim()
    .replace(",", ".")
    .match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function catalogSizeMeters(area) {
  if (Number.isFinite(Number(area?.size))) {
    return roundedMeters(Number(area.size) * FEET_TO_METERS);
  }
  return roundedMeters(metricNumber(area?.sizeText));
}

function rangeMeters(value) {
  const text = String(value || "").trim().toLocaleLowerCase("it");
  if (!text) return 0;
  if (text === "touch" || text === "contatto") return 1.5;
  if (text === "sight" || text === "vista") return SIGHT_RANGE_METERS;
  if (text.includes("mile")) return roundedMeters(metricNumber(text) * 1609.3);
  if (text.includes("feet") || text.includes("foot") || text.includes("ft")) {
    return roundedMeters(metricNumber(text) * FEET_TO_METERS);
  }
  if (text.includes("metr") || text.includes("km")) {
    const amount = metricNumber(text);
    return roundedMeters(text.includes("km") ? amount * 1000 : amount);
  }
  return 0;
}

function selfRange(value) {
  const text = String(value || "").trim().toLocaleLowerCase("it");
  return text === "self" || text.startsWith("incantatore");
}

// How far from its caster a spell's targets can be, from the range its text gives. A touch is 1,5 m, which reaches the
// neighbouring cells (distance3dCore.gridRangeSquares); "Incantatore (raggio di N metri)" is that radius. Null when the
// map has nothing to measure: self, sight, unlimited, special.
export function spellTargetRangeMeters(spell) {
  const text = String(spell?.range || "").trim().toLocaleLowerCase("it");
  if (text === "sight" || text === "vista") return null;
  if (selfRange(text)) return text.includes("raggio") ? metricNumber(text) || null : null;
  return rangeMeters(text) || null;
}

function defaultOrigin(shape, spellRange) {
  if (!selfRange(spellRange)) return "point";
  return ["cone", "line", "rectangle"].includes(shape)
    ? "caster-adjacent"
    : "caster";
}

function catalogSpec(spell) {
  const override = AREA_OVERRIDES[spell.id] || {};
  const shape = override.shape || SHAPE_BY_CATALOG_TYPE[spell.area?.type] || "";
  const sizeMeters = override.sizeMeters || catalogSizeMeters(spell.area);
  const origin = override.origin || defaultOrigin(shape, spell.range);
  const resolvedRange = override.rangeMeters || rangeMeters(spell.range);
  if (!shape || !sizeMeters || (origin === "point" && !resolvedRange)) {
    throw new Error(`Missing curated spell area geometry: ${spell.id}`);
  }
  return Object.freeze({
    spellId: spell.id,
    shape,
    sizeMeters,
    ...(Number.isFinite(Number(override.heightMeters))
      ? { heightMeters: Number(override.heightMeters) }
      : {}),
    ...(["line", "rectangle"].includes(shape)
      ? { widthMeters: override.widthMeters || 1.5 }
      : {}),
    origin,
    ...(origin === "point" ? { rangeMeters: resolvedRange } : {}),
    ...(override.snapOrigin === "vertex" ? { snapOrigin: "vertex" } : {}),
    ...(override.centered === true ? { centered: true } : {}),
    ...(override.widthAnchor === "edge" ? { widthAnchor: "edge" } : {}),
    kind: MOBILE_AURA_SPELL_IDS.has(spell.id)
      ? "aura"
      : PERSISTENT_ZONE_SPELL_IDS.has(spell.id)
        ? "zone"
        : "instant",
    movement: DECLARATIVE_ZONE_MOVEMENTS[spell.id]
      || (DRIFTING_ZONE_SPELL_IDS.has(spell.id)
        ? "drift"
        : MOVABLE_ZONE_SPELL_IDS.has(spell.id)
          ? "manual"
          : "fixed"),
    ...(Number.isInteger(override.membershipPaddingSquares)
      ? { membershipPaddingSquares: override.membershipPaddingSquares }
      : {}),
    ...(Array.isArray(override.placementChoices)
      ? { placementChoices: override.placementChoices }
      : {}),
    ...(typeof override.placementOptional === "boolean"
      ? { placementOptional: override.placementOptional }
      : {}),
    ...(override.initialSave && typeof override.initialSave === "object"
      ? { initialSave: { ...override.initialSave } }
      : {}),
    ...(override.initialSaveByChoice && typeof override.initialSaveByChoice === "object"
      ? { initialSaveByChoice: { ...override.initialSaveByChoice } }
      : {}),
    ...(Array.isArray(override.instantChoices)
      ? { instantChoices: [...override.instantChoices] }
      : {}),
    ...(Array.isArray(override.carriedEffectIds)
      ? {
        carriedEffectIds: Array.from(new Set(
          override.carriedEffectIds
            .map((effectId) => String(effectId || "").trim())
            .filter(Boolean),
        )),
      }
      : {}),
    ...(override.ownerLabelTargets
      ? { ownerLabelTargets: String(override.ownerLabelTargets).trim() }
      : {}),
    ...(override.followCaster === true ? { followCaster: true } : {}),
    ...(override.note ? { note: override.note } : {}),
  });
}

const SPELLS_BY_ID = new Map(
  Object.entries(SPELL_AREA_GEOMETRY_BY_ID).map(([id, spell]) => [id, { id, ...spell }]),
);

export const CATALOG_SPELL_AREA_SPECS = Object.freeze(
  AREA_PLACEABLE_SPELL_IDS
    .filter((spellId) => !EXPLICIT_RULE_SPELL_IDS.has(spellId))
    .map((spellId) => {
      const spell = SPELLS_BY_ID.get(spellId);
      if (!spell) throw new Error(`Missing area spell in catalog: ${spellId}`);
      return catalogSpec(spell);
    }),
);

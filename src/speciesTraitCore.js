// Species traits stored in the Actor Profile (initiativeCard.species).
// Pure data: no SDK, no metadata writes. Traits use the class-feature record shape, so the
// class-feature runtime activates them (pill, duration, resource pool) like any other feature.
// First tranche: dragonborn only (PHB 2014 and the Fizban's chromatic, metallic and gem variants).

export const SPECIES_FIELD = "species";

const ancestry = (id, label, damageType, damageLabel) => Object.freeze({ id, label, damageType, damageLabel });

const DRAGON_ANCESTRIES = Object.freeze({
  nero: ancestry("nero", "Nero", "acid", "acido"),
  blu: ancestry("blu", "Blu", "lightning", "fulmine"),
  verde: ancestry("verde", "Verde", "poison", "veleno"),
  rosso: ancestry("rosso", "Rosso", "fire", "fuoco"),
  bianco: ancestry("bianco", "Bianco", "cold", "freddo"),
  ottone: ancestry("ottone", "Ottone", "fire", "fuoco"),
  bronzo: ancestry("bronzo", "Bronzo", "lightning", "fulmine"),
  rame: ancestry("rame", "Rame", "acid", "acido"),
  oro: ancestry("oro", "Oro", "fire", "fuoco"),
  argento: ancestry("argento", "Argento", "cold", "freddo"),
  ametista: ancestry("ametista", "Ametista", "force", "forza"),
  cristallo: ancestry("cristallo", "Cristallo", "radiant", "radiosi"),
  smeraldo: ancestry("smeraldo", "Smeraldo", "psychic", "psichici"),
  zaffiro: ancestry("zaffiro", "Zaffiro", "thunder", "tuono"),
  topazio: ancestry("topazio", "Topazio", "necrotic", "necrotici"),
});
const pick = (...ids) => Object.freeze(ids.map((id) => DRAGON_ANCESTRIES[id]));

export const SPECIES = Object.freeze([
  Object.freeze({
    id: "dragonide",
    label: "Dragonide",
    sourceLabel: "Manuale del Giocatore 2014",
    ancestries: pick("nero", "blu", "ottone", "bronzo", "rame", "oro", "verde", "rosso", "argento", "bianco"),
  }),
  Object.freeze({
    id: "dragonide-cromatico",
    label: "Dragonide cromatico",
    sourceLabel: "Il Tesoro dei Draghi di Fizban",
    ancestries: pick("nero", "blu", "verde", "rosso", "bianco"),
  }),
  Object.freeze({
    id: "dragonide-metallico",
    label: "Dragonide metallico",
    sourceLabel: "Il Tesoro dei Draghi di Fizban",
    ancestries: pick("ottone", "bronzo", "rame", "oro", "argento"),
  }),
  Object.freeze({
    id: "dragonide-gemma",
    label: "Dragonide di gemma",
    sourceLabel: "Il Tesoro dei Draghi di Fizban",
    ancestries: pick("ametista", "cristallo", "smeraldo", "zaffiro", "topazio"),
  }),
]);
const SPECIES_BY_ID = new Map(SPECIES.map((entry) => [entry.id, entry]));

export function getSpecies(id) {
  return SPECIES_BY_ID.get(String(id || "").trim()) || null;
}

export function sanitizeSpecies(value) {
  const species = getSpecies(value?.id);
  if (!species) return null;
  const ancestryId = String(value?.ancestryId || "").trim();
  return { id: species.id, ancestryId: species.ancestries.some((entry) => entry.id === ancestryId) ? ancestryId : "" };
}

export function speciesAncestry(value) {
  const clean = sanitizeSpecies(value);
  return clean ? getSpecies(clean.id).ancestries.find((entry) => entry.id === clean.ancestryId) || null : null;
}

export function speciesDisplayName(value) {
  const clean = sanitizeSpecies(value);
  if (!clean) return "";
  const ancestryValue = speciesAncestry(clean);
  return ancestryValue
    ? `${getSpecies(clean.id).label} (${ancestryValue.label.toLocaleLowerCase("it")} · ${ancestryValue.damageLabel})`
    : getSpecies(clean.id).label;
}

// Every dragonborn resists its ancestry's damage type: a passive defense of the profile.
export function speciesDamageDefenses(value) {
  const ancestryValue = speciesAncestry(value);
  return ancestryValue ? { resistances: [ancestryValue.damageType] } : {};
}

const THEME = Object.freeze({ emoji: "🐉", accent: "#a78bfa", background: "#3b0764", text: "#f5f3ff" });
const SELF_TARGETING = Object.freeze({ mode: "self", rangeMeters: null, maxTargets: 1, excludeSource: false });
const NOT_AUTOMATED = Object.freeze({ status: "not-automated", adapter: null, reason: "adapter-not-implemented" });
const CONDITION_ADAPTER = Object.freeze({ status: "implemented", adapter: "condition", reason: null });

const pool = (id, name, capacity, refresh) => Object.freeze({
  id, name, capacity: Object.freeze(capacity), maximumByClassLevel: null,
  refresh: Object.freeze(refresh.map((event) => Object.freeze({ event, amount: "massimo" }))), refreshByClassLevel: Object.freeze([]),
});

export const SPECIES_RESOURCE_POOLS = Object.freeze([
  pool("specie-dragonide-arma-a-soffio-usi", "Arma a soffio", { type: "fixed", value: 1 }, ["riposo_breve", "riposo_lungo"]),
  pool("specie-dragonide-fizban-arma-a-soffio-usi", "Arma a soffio", { type: "formula", expression: "bonus_competenza" }, ["riposo_lungo"]),
  pool("specie-dragonide-cromatico-interdizione-cromatica-usi", "Interdizione Cromatica", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-dragonide-metallico-arma-a-soffio-metallica-usi", "Arma a soffio metallica", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-dragonide-gemma-volo-della-gemma-usi", "Volo della Gemma", { type: "fixed", value: 1 }, ["riposo_lungo"]),
]);

function trait({ key, speciesId, ancestryValue, name, description, minimumLevel = 1, activation, poolId, effectPlan = null, rounds = null, page }) {
  const species = getSpecies(speciesId);
  return Object.freeze({
    id: `specie-${speciesId}-${key}-${ancestryValue.id}`,
    name,
    description,
    classId: "",
    subclassId: "",
    speciesId,
    ancestryId: ancestryValue.id,
    minimumLevel,
    source: speciesId === "dragonide" ? "phb2014" : "fizban",
    sourceLabel: species.sourceLabel,
    page,
    collection: "tratti-specie",
    defaultEnabled: true,
    automationLevel: effectPlan ? "assistita" : "manuale",
    completenessStatus: "partial",
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    runtimeSupport: effectPlan ? CONDITION_ADAPTER : NOT_AUTOMATED,
    activation: Object.freeze({ primary: activation }),
    trackedResourcePoolIds: Object.freeze([poolId]),
    targetMode: "self",
    targeting: SELF_TARGETING,
    theme: THEME,
    effectPlan,
    breaksConcentration: false,
    duration: Object.freeze({ rounds }),
    trackingMode: effectPlan ? "active" : "instant",
    resourceCosts: Object.freeze([Object.freeze({ poolId, amount: 1 })]),
  });
}

function breathWeapon(speciesId, ancestryValue) {
  const phb = speciesId === "dragonide";
  return trait({
    key: "arma-a-soffio", speciesId, ancestryValue, name: `Arma a soffio (${ancestryValue.damageLabel})`, activation: phb ? "azione" : "azione_attacco",
    poolId: phb ? "specie-dragonide-arma-a-soffio-usi" : "specie-dragonide-fizban-arma-a-soffio-usi", page: phb ? 34 : 20,
    description: phb
      ? `Esala energia distruttiva: danni da ${ancestryValue.damageLabel} 2d6 (3d6 al 6°, 4d6 all'11°, 5d6 al 16° livello), TS con CD 8 + Costituzione + competenza, metà se superato. Una volta per riposo breve o lungo.`
      : `Sostituisce un attacco: cono di 4,5 m o linea di 9 m, TS Destrezza con CD 8 + Costituzione + competenza, 1d10 danni da ${ancestryValue.damageLabel} (2d10 al 5°, 3d10 all'11°, 4d10 al 17° livello), metà se superato. Usi pari al bonus di competenza per riposo lungo.`,
  });
}

function chromaticWarding(ancestryValue) {
  return trait({
    key: "interdizione-cromatica", speciesId: "dragonide-cromatico", ancestryValue, name: "Interdizione Cromatica", minimumLevel: 5,
    activation: "azione", poolId: "specie-dragonide-cromatico-interdizione-cromatica-usi", rounds: 10, page: 21,
    description: `Dal 5° livello, con un'azione, ottieni per 1 minuto l'immunità ai danni da ${ancestryValue.damageLabel}. Una volta per riposo lungo.`,
    effectPlan: Object.freeze({
      kind: "condition",
      conditionName: "Interdizione Cromatica",
      effectKind: "buff",
      detail: `Immunità ai danni da ${ancestryValue.damageLabel} per 1 minuto.`,
      mechanics: Object.freeze({ damageDefenses: Object.freeze({ immunities: Object.freeze([ancestryValue.damageType]) }) }),
    }),
  });
}

function metallicBreath(ancestryValue) {
  return trait({
    key: "arma-a-soffio-metallica", speciesId: "dragonide-metallico", ancestryValue, name: "Arma a soffio metallica", minimumLevel: 5,
    activation: "azione", poolId: "specie-dragonide-metallico-arma-a-soffio-metallica-usi", page: 22,
    description: "Dal 5° livello, con un'azione, cono di 4,5 m: TS Costituzione (soffio debilitante, Incapacitato fino all'inizio del tuo prossimo turno) o TS Forza (soffio repulsivo, spinto di 6 m e Prono). Una volta per riposo lungo.",
  });
}

function gemFlight(ancestryValue) {
  return trait({
    key: "volo-della-gemma", speciesId: "dragonide-gemma", ancestryValue, name: "Volo della Gemma", minimumLevel: 5,
    activation: "azione_bonus", poolId: "specie-dragonide-gemma-volo-della-gemma-usi", rounds: 10, page: 21,
    description: "Dal 5° livello, con un'azione bonus, ali spettrali ti danno per 1 minuto una velocità di volare pari alla velocità camminando; puoi fluttuare. Una volta per riposo lungo.",
    effectPlan: Object.freeze({
      kind: "condition",
      conditionName: "Volo della Gemma",
      displayLabel: "Volo della Gemma · Volo",
      effectKind: "buff",
      detail: "Velocità di volare pari alla velocità camminando per 1 minuto; può fluttuare.",
    }),
  });
}

export const SPECIES_FEATURES = Object.freeze(SPECIES.flatMap((species) => species.ancestries.flatMap((ancestryValue) => [
  breathWeapon(species.id, ancestryValue),
  ...(species.id === "dragonide-cromatico" ? [chromaticWarding(ancestryValue)] : []),
  ...(species.id === "dragonide-metallico" ? [metallicBreath(ancestryValue)] : []),
  ...(species.id === "dragonide-gemma" ? [gemFlight(ancestryValue)] : []),
])));

// A species trait is available for the profile's species and ancestry once the total character
// level reaches it. Without a class build the level is unknown, so every trait stays available.
export function speciesFeaturesForProfile(profile, totalCharacterLevel = 0) {
  const clean = sanitizeSpecies(profile?.[SPECIES_FIELD]);
  if (!clean?.ancestryId) return [];
  const level = Number(totalCharacterLevel) || 0;
  return SPECIES_FEATURES.filter((feature) => feature.speciesId === clean.id && feature.ancestryId === clean.ancestryId
    && (!level || level >= feature.minimumLevel));
}

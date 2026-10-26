import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_CARD_ALIAS_FIELD,
  ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD,
  decodeInitiativeCardRegistryFromRoom,
  decodeInitiativeCardRoomProfile,
  encodeInitiativeCardRegistryForRoom,
  encodeInitiativeCardRoomProfile,
  findInitiativeCardRegistryEntry,
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardRegistryKeys,
  mergeInitiativeCardRegistries,
  resolveInitiativeCardActorMatch,
  retainInitiativeCardRegistryWithinByteBudget,
} from "../src/initiativeCardRegistryCore.js";
import { getAvailableClassFeatures, getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import { jsonBytes } from "../src/roomMetadataBudget.js";
import { shouldRoomInitiativeCardWin } from "../src/initiativeCardConflict.js";
import { isLegacyActorMigrationEligible } from "../src/actorIdentityCore.js";

test("initiative card identity survives scene-specific names and URL query changes", () => {
  const first = { name: "Edelbrand", image: { url: "https://assets.test/hero.png?version=1" } };
  const second = { name: "Nome scena diverso", image: { url: "https://assets.test/hero.png?version=2" } };
  const [assetKey] = initiativeCardRegistryKeys(first);
  const entry = { profile: { armorClass: 18 }, updatedAt: 100 };
  assert.equal(findInitiativeCardRegistryEntry({ [assetKey]: entry }, second), entry);
});

test("initiative card identity keeps the legacy normalized-name fallback", () => {
  const entry = { profile: { armorClass: 17 }, updatedAt: 100 };
  assert.equal(
    findInitiativeCardRegistryEntry({ guardia: entry }, { name: "(3) Guardia" }),
    entry
  );
});

test("registry merge preserves the newest copy from room or local storage", () => {
  const older = { profile: { armorClass: 14 }, updatedAt: 100 };
  const newer = { profile: { armorClass: 19 }, updatedAt: 200 };
  assert.deepEqual(mergeInitiativeCardRegistries({ hero: older }, { hero: newer }), { hero: newer });
  assert.deepEqual(mergeInitiativeCardRegistries({ hero: newer }, { hero: older }), { hero: newer });
});

test("dopo il collegamento il cambio di nome e ritratto usa actorProfileId", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const item = {
    id: "scene-b",
    name: "Nome nuovo",
    image: { url: "https://assets.test/new.png?rev=2" },
    metadata: { [metadataKey]: { actorProfileId: "actor-aria" } },
  };
  const entry = {
    actorProfileId: "actor-aria",
    profile: { armorClass: 18 },
    updatedAt: 20,
  };
  assert.equal(findInitiativeCardRegistryEntry({ old: entry }, item), entry);
});

test("un mostro con lo stesso asset non viene collegato alla migrazione PC/alleati", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const monster = {
    id: "monster",
    name: "Goblin",
    image: { url: "https://assets.test/goblin.png" },
    metadata: { [metadataKey]: { attitude: "enemy" } },
  };
  const [assetKey] = initiativeCardRegistryKeys(monster);
  resolveInitiativeCardActorMatch({ [assetKey]: { profile: { armorClass: 15 } } }, monster);
  assert.equal(isLegacyActorMigrationEligible(monster), false);
});

test("un token ricreato in iniziativa recupera le azioni rapide dalla memoria", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const quickAction = {
    id: "fireball",
    label: "Palla di fuoco",
    kind: "spell",
    spellId: "fireball",
    workflow: "area",
    targetMode: "selection",
  };
  const recreated = {
    id: "new-token",
    name: "Omar",
    layer: "CHARACTER",
    metadata: { [metadataKey]: { inInitiative: true } },
  };
  const alreadyHydrated = {
    ...recreated,
    id: "hydrated-token",
    metadata: {
      [metadataKey]: {
        inInitiative: true,
        initiativeCard: { quickActions: [quickAction] },
      },
    },
  };
  const outsideInitiative = {
    ...recreated,
    id: "outside-token",
    metadata: { [metadataKey]: {} },
  };
  const registry = {
    omar: {
      profile: { quickActions: [quickAction] },
      updatedAt: 100,
    },
  };

  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(
      [recreated, alreadyHydrated, outsideInitiative],
      registry,
      { metadataKey },
    ).map((item) => item.id),
    ["new-token"],
  );
});

test("un token ricreato recupera anche la configurazione multiclasse", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const recreated = {
    id: "new-paladin",
    name: "Alaric",
    layer: "CHARACTER",
    metadata: { [metadataKey]: { inInitiative: true } },
  };
  const registry = {
    alaric: {
      profile: {
        characterBuild: [
          { classId: "paladino", level: 3 },
          { classId: "stregone", level: 2 },
        ],
        enabledClassFeatureIds: [
          "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia",
        ],
      },
      updatedAt: 100,
    },
  };

  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(
      [recreated],
      registry,
      { metadataKey },
    ).map((item) => item.id),
    ["new-paladin"],
  );
});

test("un profilo token vuoto non impedisce il recupero delle azioni rapide dalla Room", () => {
  const metadataKey = "com.thebigpicture.initiative/meta";
  const quickAction = {
    id: "fireball",
    label: "Palla di fuoco",
    kind: "spell",
    spellId: "fireball",
    targetMode: "selection",
  };
  const token = {
    id: "token-with-empty-profile",
    name: "Omar",
    layer: "CHARACTER",
    metadata: {
      [metadataKey]: {
        inInitiative: true,
        initiativeCard: { quickActions: [] },
      },
    },
  };

  assert.deepEqual(
    initiativeCardQuickActionMemoryCandidates(
      [token],
      { omar: { profile: { quickActions: [quickAction] }, updatedAt: 100 } },
      { metadataKey },
    ).map((item) => item.id),
    ["token-with-empty-profile"],
  );
});

const ROOM_CODEC_BUILD = [{ classId: "guerriero", level: 20, subclassId: "guerriero-maestro-di-battaglia" }];
const roomCodecDefaults = (characterBuild) =>
  getEnabledClassFeatures({ characterBuild }).map((feature) => feature.id);

function roomCodecProfile(enabledClassFeatureIds = roomCodecDefaults(ROOM_CODEC_BUILD)) {
  return {
    armorClass: 18,
    characterBuild: ROOM_CODEC_BUILD,
    enabledClassFeatureIds,
    classFeaturesConfigured: true,
    actorProfileId: "actor-room-codec",
  };
}

function sortedIds(ids) {
  return [...ids].sort();
}

test("registry Room: un profilo configurato salva soltanto la differenza dai default", () => {
  const defaults = roomCodecDefaults(ROOM_CODEC_BUILD);
  const extra = getAvailableClassFeatures(ROOM_CODEC_BUILD)
    .find((feature) => !defaults.includes(feature.id)).id;
  const enabled = [...defaults.slice(1), extra];
  const profile = roomCodecProfile(enabled);

  const encoded = encodeInitiativeCardRoomProfile(profile, roomCodecDefaults);
  assert.equal(encoded.classFeaturesConfigured, false);
  assert.deepEqual(encoded.enabledClassFeatureIds, [extra]);
  assert.deepEqual(encoded[ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD], [defaults[0]]);
  assert.ok(jsonBytes(encoded) < jsonBytes(profile) / 2);

  const decoded = decodeInitiativeCardRoomProfile(encoded, roomCodecDefaults);
  assert.equal(decoded.classFeaturesConfigured, true);
  assert.equal(Object.hasOwn(decoded, ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD), false);
  assert.deepEqual(sortedIds(decoded.enabledClassFeatureIds), sortedIds(enabled));
  assert.deepEqual(
    getEnabledClassFeatures(decoded).map((feature) => feature.id),
    getEnabledClassFeatures(profile).map((feature) => feature.id),
  );
});

test("registry Room: un client senza decodifica ricade sui default, non su un elenco vuoto", () => {
  const profile = roomCodecProfile();
  const encoded = encodeInitiativeCardRoomProfile(profile, roomCodecDefaults);
  assert.deepEqual(encoded.enabledClassFeatureIds, []);
  assert.deepEqual(encoded[ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD], []);
  assert.deepEqual(
    getEnabledClassFeatures(encoded).map((feature) => feature.id),
    getEnabledClassFeatures(profile).map((feature) => feature.id),
  );
});

test("registry Room: i profili legacy con l'elenco completo restano leggibili", () => {
  const legacy = roomCodecProfile();
  assert.equal(decodeInitiativeCardRoomProfile(legacy, roomCodecDefaults), legacy);

  // Un client precedente ha riscritto l'elenco completo conservando il campo sconosciuto.
  const rewritten = {
    ...legacy,
    enabledClassFeatureIds: legacy.enabledClassFeatureIds.slice(0, 2),
    [ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD]: [],
  };
  const decoded = decodeInitiativeCardRoomProfile(rewritten, roomCodecDefaults);
  assert.deepEqual(decoded.enabledClassFeatureIds, legacy.enabledClassFeatureIds.slice(0, 2));
  assert.equal(decoded.classFeaturesConfigured, true);
  assert.equal(Object.hasOwn(decoded, ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD), false);
});

test("registry Room: profili non configurati o senza risparmio restano nel formato legacy", () => {
  const unconfigured = { ...roomCodecProfile(), classFeaturesConfigured: false };
  assert.equal(encodeInitiativeCardRoomProfile(unconfigured, roomCodecDefaults), unconfigured);
  const noBuild = { armorClass: 12, characterBuild: [], enabledClassFeatureIds: [], classFeaturesConfigured: true };
  assert.equal(encodeInitiativeCardRoomProfile(noBuild, roomCodecDefaults), noBuild);
  assert.equal(encodeInitiativeCardRoomProfile(roomCodecProfile(), undefined).classFeaturesConfigured, true);
});

test("registry Room: la codifica riduce il peso di cinque PG di 20° e il round-trip è esatto", () => {
  const registry = {};
  for (let index = 0; index < 5; index += 1) {
    const entry = {
      actorProfileId: `actor-${index}`,
      name: `PG ${index}`,
      profile: roomCodecProfile(),
      updatedAt: 100 + index,
    };
    registry[`asset:https://assets.test/pg-${index}.png`] = entry;
    registry[`pg ${index}`] = entry;
  }
  const encoded = encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults);
  assert.ok(jsonBytes(encoded) < jsonBytes(registry) * 0.6);
  const decoded = decodeInitiativeCardRegistryFromRoom(encoded, roomCodecDefaults);
  assert.deepEqual(Object.keys(decoded), Object.keys(registry));
  for (const [key, entry] of Object.entries(decoded)) {
    assert.equal(entry.updatedAt, registry[key].updatedAt);
    assert.deepEqual(
      sortedIds(entry.profile.enabledClassFeatureIds),
      sortedIds(registry[key].profile.enabledClassFeatureIds),
    );
    assert.equal(entry.profile.classFeaturesConfigured, true);
  }
  const retained = retainInitiativeCardRegistryWithinByteBudget(encoded);
  assert.ok(Object.keys(retained).length > Object.keys(retainInitiativeCardRegistryWithinByteBudget(registry)).length);
});

test("registry Room: voci eliminate e voci legacy piatte attraversano la codifica invariate", () => {
  const deleted = { name: "Gone", deleted: true, updatedAt: 5 };
  const flat = { armorClass: 13, updatedAt: 6 };
  const registry = { gone: deleted, flat };
  assert.deepEqual(encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults), registry);
  assert.deepEqual(decodeInitiativeCardRegistryFromRoom(registry, roomCodecDefaults), registry);
  assert.deepEqual(decodeInitiativeCardRegistryFromRoom(undefined, roomCodecDefaults), {});
});

const ROOM_ALIAS_ASSET_KEY = "asset:https://assets.test/alias-hero.png";

function roomAliasRegistry({ updatedAt = 200 } = {}) {
  const entry = {
    actorProfileId: "actor-alias-hero",
    name: "Alias Hero",
    profile: roomCodecProfile(),
    updatedAt,
  };
  return { [ROOM_ALIAS_ASSET_KEY]: entry, "alias hero": entry };
}

test("registry Room: la chiave secondaria identica diventa un alias della chiave asset", () => {
  const registry = roomAliasRegistry();
  const encoded = encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults);
  assert.deepEqual(encoded["alias hero"], { [ROOM_CARD_ALIAS_FIELD]: ROOM_ALIAS_ASSET_KEY, updatedAt: 200 });
  assert.equal(encoded[ROOM_ALIAS_ASSET_KEY].profile.actorProfileId, "actor-room-codec");
  assert.ok(jsonBytes(encoded["alias hero"]) < 80);

  const decoded = decodeInitiativeCardRegistryFromRoom(encoded, roomCodecDefaults);
  assert.deepEqual(Object.keys(decoded), Object.keys(registry));
  assert.deepEqual(decoded["alias hero"], decoded[ROOM_ALIAS_ASSET_KEY]);
  assert.equal(Object.hasOwn(decoded["alias hero"], ROOM_CARD_ALIAS_FIELD), false);
  assert.deepEqual(
    sortedIds(decoded["alias hero"].profile.enabledClassFeatureIds),
    sortedIds(registry["alias hero"].profile.enabledClassFeatureIds),
  );
  // Una scena con un'immagine diversa trova la scheda dal nome.
  const renamedAsset = { name: "Alias Hero", image: { url: "https://assets.test/other.png" } };
  assert.equal(findInitiativeCardRegistryEntry(decoded, renamedAsset).name, "Alias Hero");
});

test("registry Room: voci diverse sotto le due chiavi restano piene", () => {
  const registry = roomAliasRegistry();
  registry["alias hero"] = { ...registry["alias hero"], name: "Altro nome" };
  const encoded = encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults);
  assert.equal(Object.hasOwn(encoded["alias hero"], ROOM_CARD_ALIAS_FIELD), false);
  assert.equal(Object.hasOwn(encoded[ROOM_ALIAS_ASSET_KEY], ROOM_CARD_ALIAS_FIELD), false);
  // Senza chiave asset la primaria è la prima in ordine alfabetico.
  const entry = { name: "N", profile: { armorClass: 11 }, updatedAt: 3 };
  const byName = encodeInitiativeCardRegistryForRoom({ zeta: entry, alfa: entry }, roomCodecDefaults);
  assert.deepEqual(byName.zeta, { [ROOM_CARD_ALIAS_FIELD]: "alfa", updatedAt: 3 });
  assert.equal(byName.alfa, entry);
});

test("registry Room: gli alias pendenti spariscono in decodifica", () => {
  const encoded = encodeInitiativeCardRegistryForRoom(roomAliasRegistry(), roomCodecDefaults);
  const alias = encoded["alias hero"];

  // Primaria scartata dalla retain di un client precedente.
  assert.deepEqual(decodeInitiativeCardRegistryFromRoom({ "alias hero": alias }, roomCodecDefaults), {});
  // Primaria riscritta da un client precedente con un'altra voce.
  const rewritten = {
    [ROOM_ALIAS_ASSET_KEY]: { name: "Altro PG", profile: { armorClass: 9 }, updatedAt: 999 },
    "alias hero": alias,
  };
  assert.deepEqual(
    Object.keys(decodeInitiativeCardRegistryFromRoom(rewritten, roomCodecDefaults)),
    [ROOM_ALIAS_ASSET_KEY],
  );
  // Catene e alias senza destinazione non si risolvono.
  const chained = {
    ...encoded,
    third: { [ROOM_CARD_ALIAS_FIELD]: "alias hero", updatedAt: 200 },
    empty: { [ROOM_CARD_ALIAS_FIELD]: "", updatedAt: 200 },
  };
  assert.deepEqual(
    Object.keys(decodeInitiativeCardRegistryFromRoom(chained, roomCodecDefaults)),
    [ROOM_ALIAS_ASSET_KEY, "alias hero"],
  );
});

test("registry Room: le copie doppie legacy restano leggibili e migrano agli alias", () => {
  const raw = JSON.parse(JSON.stringify(roomAliasRegistry()));
  const decoded = decodeInitiativeCardRegistryFromRoom(raw, roomCodecDefaults);
  assert.deepEqual(decoded, raw);
  const encoded = encodeInitiativeCardRegistryForRoom(decoded, roomCodecDefaults);
  assert.equal(encoded["alias hero"][ROOM_CARD_ALIAS_FIELD], ROOM_ALIAS_ASSET_KEY);
  assert.ok(jsonBytes(encoded) < jsonBytes(raw) / 3);
});

test("registry Room: un client precedente sul valore grezzo legge la voce piena, non l'alias", () => {
  const encoded = encodeInitiativeCardRegistryForRoom(roomAliasRegistry(), roomCodecDefaults);
  const sameToken = { name: "Alias Hero", image: { url: "https://assets.test/alias-hero.png?v=2" } };
  assert.equal(findInitiativeCardRegistryEntry(encoded, sameToken), encoded[ROOM_ALIAS_ASSET_KEY]);
  // L'alias non ha actorProfileId: la ricerca per attore lo ignora.
  const linkedToken = {
    name: "Alias Hero",
    metadata: { "com.thebigpicture.initiative/meta": { actorProfileId: "actor-alias-hero" } },
  };
  assert.equal(findInitiativeCardRegistryEntry(encoded, linkedToken), encoded[ROOM_ALIAS_ASSET_KEY]);
  // Caso limite: solo il nome coincide. L'alias non ha valori e non batte un token compilato.
  const nameOnly = { name: "Alias Hero" };
  assert.equal(findInitiativeCardRegistryEntry(encoded, nameOnly), encoded["alias hero"]);
  assert.equal(shouldRoomInitiativeCardWin({
    hasRoomVersion: true,
    hasTokenProfile: true,
    roomDeleted: false,
    roomHasValues: false,
    tokenHasValues: true,
    roomUpdatedAt: 200,
    tokenUpdatedAt: 1,
  }), false);
});

test("registry Room: la retain tiene ogni alias accanto alla sua voce", () => {
  const registry = {};
  for (let index = 0; index < 6; index += 1) {
    const entry = {
      actorProfileId: `actor-${index}`,
      name: `PG ${index}`,
      profile: roomCodecProfile(),
      // Stesso timestamp per tutti: l'ordine per chiave separerebbe asset e nomi.
      updatedAt: 500,
    };
    registry[`asset:https://assets.test/pg-${index}.png`] = entry;
    registry[`pg ${index}`] = entry;
  }
  const encoded = encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults);
  const fullBytes = jsonBytes(encoded);
  const budget = Math.floor(fullBytes / 2);
  const retained = retainInitiativeCardRegistryWithinByteBudget(encoded, budget);
  assert.ok(jsonBytes(retained) <= budget);
  const keys = Object.keys(retained);
  assert.ok(keys.length >= 2);
  for (const [key, entry] of Object.entries(retained)) {
    const target = entry[ROOM_CARD_ALIAS_FIELD];
    if (target === undefined) continue;
    assert.ok(Object.hasOwn(retained, target), `${key} senza la sua voce`);
    assert.equal(keys.indexOf(key), keys.indexOf(target) + 1);
  }
  const pairs = Object.values(retained).filter((entry) => !Object.hasOwn(entry, ROOM_CARD_ALIAS_FIELD));
  const aliases = keys.length - pairs.length;
  // Al limite del budget l'ultima voce può entrare senza alias: resta trovabile per asset e attore.
  assert.ok(aliases >= pairs.length - 1, "le voci conservate portano con sé il proprio alias");

  // Con budget eccedente la retain scarta gli alias pendenti.
  const dangling = {
    ...encoded,
    orphan: { [ROOM_CARD_ALIAS_FIELD]: "asset:https://assets.test/gone.png", updatedAt: 900 },
  };
  assert.equal(
    Object.hasOwn(retainInitiativeCardRegistryWithinByteBudget(dangling, fullBytes), "orphan"),
    false,
  );
});

// Attacchi dei mostri, lotto 6: le schede dei mostri restano nel registro locale del GM e sul token, mai nella Room.
const monsterEntry = (name, updatedAt, extra = {}) => ({
  actorProfileId: `actor-${name}`, name,
  profile: { armorClass: 15, monster: { source: "manual", multiattack: "Due colpi." },
    quickActions: [{ id: "bite", label: "Morso", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d6+2" }], attackBonus: 4 }], ...extra },
  updatedAt,
});

test("registry Room: le schede dei mostri e i loro alias restano fuori, PG e alias dei PG intatti", () => {
  const goblin = monsterEntry("Goblin", 300);
  const registry = { ...roomAliasRegistry(), "asset:https://assets.test/goblin.png": goblin, goblin };
  const encoded = encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults);
  assert.deepEqual(Object.keys(encoded).sort(), [ROOM_ALIAS_ASSET_KEY, "alias hero"].sort());
  assert.deepEqual(encoded["alias hero"], { [ROOM_CARD_ALIAS_FIELD]: ROOM_ALIAS_ASSET_KEY, updatedAt: 200 });
  const decoded = decodeInitiativeCardRegistryFromRoom(encoded, roomCodecDefaults);
  assert.equal(decoded["alias hero"].name, "Alias Hero");
  assert.equal(decoded.goblin, undefined);
});

test("registry Room: un profilo senza mostro (monster null) resta, una voce eliminata resta", () => {
  const former = monsterEntry("Ex mostro", 10, { monster: null });
  const deleted = { name: "Gone", deleted: true, updatedAt: 5 };
  const encoded = encodeInitiativeCardRegistryForRoom({ former, gone: deleted }, roomCodecDefaults);
  assert.deepEqual(Object.keys(encoded).sort(), ["former", "gone"]);
});

test("registry Room: con i mostri fuori, dieci statblock importati non spingono via le schede dei PG", () => {
  const registry = {};
  for (let index = 0; index < 4; index += 1) {
    const entry = { actorProfileId: `actor-${index}`, name: `PG ${index}`, profile: roomCodecProfile(), updatedAt: 100 + index };
    registry[`asset:https://assets.test/pg-${index}.png`] = entry;
    registry[`pg ${index}`] = entry;
  }
  // Più recenti dei PG e grandi come uno statblock vero (cinque azioni con note): senza il filtro il budget terrebbe
  // loro e scarterebbe i PG.
  const actions = Array.from({ length: 5 }, (_, action) => ({ id: `a${action}`, label: `Azione ${action}`, kind: "attack", range: "melee",
    components: [{ type: "slashing", formula: "2d6+4" }], attackBonus: 6, reachFeet: 5, note: "Il bersaglio deve superare un TS Costituzione CD 13 o è avvelenato." }));
  for (let index = 0; index < 10; index += 1) registry[`mostro ${index}`] = monsterEntry(`Mostro ${index}`, 1000 + index, { quickActions: actions });
  const unfiltered = retainInitiativeCardRegistryWithinByteBudget(registry);
  assert.ok(Object.keys(unfiltered).filter((key) => key.startsWith("pg ")).length < 4, "senza filtro i PG verrebbero scartati");
  const retained = retainInitiativeCardRegistryWithinByteBudget(encodeInitiativeCardRegistryForRoom(registry, roomCodecDefaults));
  const kept = decodeInitiativeCardRegistryFromRoom(retained, roomCodecDefaults);
  for (let index = 0; index < 4; index += 1) assert.equal(kept[`pg ${index}`]?.name, `PG ${index}`, `PG ${index}`);
  assert.equal(Object.keys(kept).some((key) => key.startsWith("mostro")), false);
});

test("registro locale e Room: la scheda del mostro si ritrova dalla copia locale", () => {
  const goblin = monsterEntry("Goblin", 300);
  const local = { goblin };
  const room = decodeInitiativeCardRegistryFromRoom(encodeInitiativeCardRegistryForRoom(local, roomCodecDefaults), roomCodecDefaults);
  const merged = mergeInitiativeCardRegistries(local, room);
  assert.deepEqual(merged.goblin, goblin);
  // Una vecchia voce Room non da mostro, più vecchia, non vince sulla copia locale.
  const stale = { goblin: { name: "Goblin", profile: { armorClass: 12 }, updatedAt: 100 } };
  assert.deepEqual(mergeInitiativeCardRegistries(local, stale).goblin, goblin);
});

import { ID } from "./constants.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  activeSpellInstanceIds,
  staleStaticSpellZoneItemIds,
} from "./spellStaticZoneCore.js";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  spellBoardTokenItems,
} from "./spellBoardTokenCore.js";

const normalizedId = (value) => String(value || "").trim();
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

function uniqueIds(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizedId)
      .filter(Boolean),
  )];
}

/**
 * Plans a conservative cleanup of plugin-derived scene items only.
 *
 * Token metadata is read to determine whether a spell instance is still
 * active, but no token item is ever returned for deletion and no metadata is
 * mutated here. The caller must still perform the actual delete operation.
 */
export function planPluginDerivedDataCleanup(items = []) {
  const sceneItems = Array.isArray(items) ? items : [];
  const activeInstanceIds = activeSpellInstanceIds(sceneItems, {
    metaKey: META_KEY,
    spellsKey: SPELLS_KEY,
    concentrationKey: CONCENTRATION_KEY,
  });
  const staleZoneIds = staleStaticSpellZoneItemIds(sceneItems, {
    metaKey: META_KEY,
    spellsKey: SPELLS_KEY,
    concentrationKey: CONCENTRATION_KEY,
  });
  const staleBoardTokenIds = spellBoardTokenItems(sceneItems)
    .filter((item) => !activeInstanceIds.has(normalizedId(
      item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.instanceId,
    )))
    .map((item) => item?.id)
    .filter(Boolean);
  const deleteIds = uniqueIds([...staleZoneIds, ...staleBoardTokenIds]);
  const tokenIds = new Set(
    sceneItems
      .filter((item) => item?.metadata?.[META_KEY])
      .map((item) => normalizedId(item.id))
      .filter(Boolean),
  );
  return {
    deleteIds,
    staleZoneIds: uniqueIds(staleZoneIds),
    staleBoardTokenIds: uniqueIds(staleBoardTokenIds),
    tokenIds,
    tokenMetadataTouched: false,
    metadataKeys: Object.freeze({
      staticZone: SPELL_STATIC_ZONE_META_KEY,
      boardToken: SPELL_BOARD_TOKEN_META_KEY,
      token: META_KEY,
    }),
  };
}

import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenRule,
  spellBoardTokenItems,
  spellBoardTokenCanonicalMetadata,
  spellBoardTokenDisplayName,
  spellBoardTokenMetadata,
  spellBoardTokenScale,
} from "./spellBoardTokenCore.js";

const META_KEY = `${ID}/meta`;

function assetUrl(path) {
  const origin = String(globalThis.location?.origin || "http://localhost");
  return new URL(path, origin).href;
}

export function buildSpellBoardTokenItem({
  entityId = "",
  spellId = "",
  instanceId = "",
  casterId = "",
  slotLevel = null,
  casterHpMax = null,
  casterName = "",
  position = null,
} = {}) {
  const rule = getSpellBoardTokenRule(spellId);
  if (!rule) throw new Error("spell-board-token-rule-required");
  if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) {
    throw new Error("spell-board-token-position-required");
  }
  const itemName = spellBoardTokenDisplayName(spellId, casterName);
  const boardTokenMetadata = spellBoardTokenMetadata({
    spellId,
    instanceId,
    casterId,
    slotLevel,
    casterHpMax,
  });
  const canonicalMetadata = spellBoardTokenCanonicalMetadata({ spellId, casterHpMax });
  const builder = buildImage(
    {
      width: 512,
      height: 512,
      url: assetUrl(rule.assetPath),
      mime: "image/svg+xml",
    },
    {
      dpi: 512,
      offset: { x: 256, y: 256 },
    },
  );
  if (String(entityId || "").trim()) builder.id(String(entityId).trim());
  return builder
    .position({ x: Number(position.x), y: Number(position.y) })
    .plainText(itemName)
    .textItemType("LABEL")
    .textPadding(0)
    .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
    .fontSize(16)
    .fontWeight(700)
    .textLineHeight(1)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .textFillColor("#f8fafc")
    .textStrokeColor("rgba(2,6,23,.9)")
    .textStrokeWidth(2)
    .scale(spellBoardTokenScale(spellId))
    .rotation(0)
    .locked(false)
    .disableHit(false)
    .layer("PROP")
    .visible(true)
    .metadata({
      ...(canonicalMetadata ? { [META_KEY]: canonicalMetadata } : {}),
      [SPELL_BOARD_TOKEN_META_KEY]: boardTokenMetadata,
    })
    .name(itemName)
    .build();
}

export async function getSpellBoardTokenItems(selector = {}) {
  const items = await OBR.scene.items.getItems((item) => (
    item?.layer === "PROP" && !!item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]
  ));
  return spellBoardTokenItems(items, selector);
}

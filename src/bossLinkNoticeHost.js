// Rimebound Link: the GM's popover, opened like the speed warning (centred near the top of the viewport, no paper,
// closed by its own timer, a click or Esc). The effects coordinator calls it after a commit, for the GM only.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { bossLinkNoticeCard } from "./bossLinkResistanceCore.js";

export const BOSS_LINK_NOTICE_POPOVER_ID = `${ID}/boss-link-notice`;

export async function openBossLinkNotice(notices) {
  const card = bossLinkNoticeCard(notices);
  if (!card) return false;
  let viewportWidth = 1200;
  let viewportHeight = 800;
  const [reportedWidth, reportedHeight] = await Promise.all([
    OBR.viewport.getWidth().catch(() => viewportWidth),
    OBR.viewport.getHeight().catch(() => viewportHeight),
  ]);
  viewportWidth = Number(reportedWidth) || viewportWidth;
  viewportHeight = Number(reportedHeight) || viewportHeight;
  const cardWidth = Math.min(500, Math.max(312, viewportWidth - 40));
  const top = Math.max(12, Math.round(viewportHeight * 0.09));
  await OBR.popover.close(BOSS_LINK_NOTICE_POPOVER_ID).catch(() => {});
  await OBR.popover.open({
    id: BOSS_LINK_NOTICE_POPOVER_ID,
    url: `/boss-link-notice.html?payload=${encodeURIComponent(JSON.stringify(card))}`,
    width: cardWidth + 8,
    height: 118 + Math.max(0, card.lines.length - 1) * 18,
    anchorReference: "POSITION",
    anchorPosition: { left: viewportWidth / 2, top: Math.max(8, top - 4) },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 12,
  });
  return true;
}

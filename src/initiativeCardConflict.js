export function shouldRoomInitiativeCardWin({
  hasRoomVersion,
  hasTokenProfile,
  roomDeleted,
  roomHasValues,
  tokenHasValues,
  roomUpdatedAt,
  tokenUpdatedAt,
}) {
  if (!hasRoomVersion) return false;
  if (!hasTokenProfile) return true;
  if (roomDeleted) return roomUpdatedAt >= tokenUpdatedAt;
  if (roomHasValues !== tokenHasValues) return roomHasValues;
  return roomUpdatedAt >= tokenUpdatedAt;
}
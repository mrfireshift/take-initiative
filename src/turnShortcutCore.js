// Turn keys of the tracker (lot 6.8): Space or → for the next turn, ← for the previous one. The tracker presses its own
// turn buttons with them, so they go through the same queues and revision checks as a click. OBR gives extensions no
// global shortcuts: the keys reach the tracker only while it has the keyboard focus (after a click in it).
// Returns 1 (next), -1 (previous) or 0 (not a turn key here).
export function turnShortcutDirection({
  key = "",
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  shiftKey = false,
  repeat = false,
  isComposing = false,
  // Typing in a field, an inline editor open (HP, initiative, "Compila iniziativa"), or a focused button (Space
  // would press it): the key is not a turn key.
  editableTarget = false,
  buttonTarget = false,
  editing = false,
  enabled = false,
} = {}) {
  if (!enabled || editing || editableTarget || buttonTarget || repeat || isComposing) return 0;
  if (ctrlKey || metaKey || altKey || shiftKey) return 0;
  if (key === "ArrowRight" || key === " " || key === "Spacebar") return 1;
  if (key === "ArrowLeft") return -1;
  return 0;
}

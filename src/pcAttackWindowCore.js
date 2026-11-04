// The attack console's window follows its content (decision D1 of docs/AUDIT_UX_PANNELLO_ATTACCHI.md): as tall as it
// needs, never beyond the screen, and during an attack it does not shrink, so that Registra does not move up and down as
// the outcome changes. The numbers only: pc-attack.js measures and asks the popover. Pure.
export const PC_ATTACK_MIN_HEIGHT = 160;
export const PC_ATTACK_MAX_HEIGHT = 720;
const SCREEN_MARGIN = 12;

// The tallest the window can be, with its top where it is.
export function pcAttackWindowLimit({ top = 0, viewport = Infinity, max = PC_ATTACK_MAX_HEIGHT } = {}) {
  return Math.max(PC_ATTACK_MIN_HEIGHT, Math.min(max, viewport - top - SCREEN_MARGIN));
}

// The height that stays during an attack: the tallest it has been, until the attack changes. key: the attack in progress,
// "" when there is none (a spell to cast, a feature to use), which has none to keep.
export function pcAttackWindowFloor({ key = "", lastKey = "", floor = 0, content = 0 } = {}) {
  if (!key) return 0;
  return key === lastKey ? Math.max(floor, content) : content;
}

// content: what the panel needs; floor: what it keeps during an attack; menu: what an open menu needs, only while open.
// capped: the content does not fit, and the long lists give way (then the panel scrolls).
export function pcAttackWindowHeight({ content = 0, floor = 0, menu = 0, limit = PC_ATTACK_MAX_HEIGHT } = {}) {
  const wanted = Math.max(content, floor);
  return {
    height: Math.max(PC_ATTACK_MIN_HEIGHT, Math.min(limit, Math.max(wanted, menu))),
    capped: content > limit,
  };
}

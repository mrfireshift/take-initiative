import { buildSpellChips } from "./spells.js";
import { spellPillHasActions } from "./spellPillActionsCore.js";
import {
  applyClassicCardFrame,
  buildClassicCardShell,
  deriveClassicCardPresentation,
  classicCardSpells,
} from "./initiativeCardClassic.js";
import {
  appendClassicEpicTags,
  classicEpicTagOverhang,
  buildClassicBossChrome,
  buildClassicLegendaryResourceDock,
  buildClassicParagonDock,
} from "./initiativeCardBossClassic.js";
import {
  bindGroupHPDeltaEditor,
  enableClassicCardRename,
} from "./initiativeEditors.js";
import { compactStatusBadge } from "./initiativeCardCompact.js";
import { canOpenInitiativeCardSheet } from "./initiativeCardSheetAccessCore.js";
import { fitCardToChipDock } from "./initiativeChipOverflow.js";
import { buildReactionIndicator } from "./reactionIndicator.js";
import {
  CARD_ICON_BUTTON_SIZE,
  CARD_ICON_LIFT,
  buildCardIconGlyph,
  styleCardIconButton,
} from "./cardIconButton.js";
import { extendHitArea } from "./hitAreaCore.js";
import { hasReactionUsed } from "./reactionTrackerCore.js";

export function buildClassicTrackerCard(e, context) {
  const {
    state,
    showEffectSummaryParts = true,
    nextId,
    boardTokenItems = [],
    isGM: IS_GM,
    constants: {
      BADGE_RIGHT,
      BADGE_SIZE,
      BOSS_PORTRAIT_FRAME_SCALE,
      BOSS_PORTRAIT_FRAME_SRC,
      CHIP_GAP_PX,
      CONDITIONS,
      DEFAULT_LEGENDARY_RESISTANCES,
      EPIC_TAG_CFG,
      LEG_BOSS_CFG,
      LEG_PIPS_CFG,
      LEG_RESOURCE_CFG,
      PAR_CTRL_CFG,
      ZOOM_CFG,
    },
    operations: {
      __applyTrackerSelectionState,
      __bindInitiativeCardContextMenu,
      __buildConditionChipsSafe,
      __bindSpellBoardTokenHPEditor,
      __findSpellBoardToken,
      __groupKey,
      __instaTransform,
      __safeConditions,
      __selectTrackerEntry,
      __selectionIdsForEntry,
      __spellColor,
      __spellKey,
      __removeConditionOnTrackerCard,
      __terminateClassFeatureOnTrackerCard,
      __terminateSpellOnTrackerCard,
      __openSpellPillActions,
      applyGroupHPMaxDeltaWithRenderLock,
      armDocClickIgnore,
      bindHPEditorForEntry,
      bindInitiativeEditorForEntry,
      bindReferenceChips,
      closeOpenEditors,
      factionColors,
      formatHPHTML,
      getEditingHPForId,
      isEpicActionId,
      isLairId,
      mountChipsWithOverflow,
      mountTrackerQuickActions,
      openInitiativeCardPopup,
      parseRelativeHPDelta,
      reconcileStateWithItems,
      renderAll,
      rgba,
      saveClassicTrackerEntryName,
      setLegendaryCurrent,
      setLegendaryMax,
      setLegendaryResistanceCurrent,
      setLegendaryResistanceMax,
      setParagonActions,
      setSceneState,
      toggleReactionUsedOnTrackerCard,
    },
  } = context;

    const c = factionColors(e.attitude);
    const cardEffectData = __safeConditions(e.__groupCollapsed ? null : e.conditions);
    const {
      hasLegendary: HAS_LEG,
      hasParagon: HAS_PAR,
      isEpic: IS_EPIC,
      isBoss: IS_BOSS,
      hpValue: CLASSIC_HP_VALUE,
      hpMax: CLASSIC_HP_MAX,
      hpVisible: CLASSIC_HP_VISIBLE,
      knockedOut: KNOCKED_OUT,
      playerCardHasHP: PLAYER_CARD_HAS_HP,
      playerBossVerticalOffset: PLAYER_BOSS_VERTICAL_OFFSET,
      hasCardEffects: HAS_CARD_EFFECTS,
      dragAllowed: DRAG_OK,
    } = deriveClassicCardPresentation(e, {
      isGM: IS_GM,
      isLair: isLairId(e.id),
      isEpicAction: isEpicActionId(e.id),
      cardEffectData,
    });
    const card = buildClassicCardShell(e, {
      groupKey: e.__groupKey || __groupKey(e),
      selectionItemIds: __selectionIdsForEntry(e),
      hpVisible: CLASSIC_HP_VISIBLE,
      hpMax: CLASSIC_HP_MAX,
      knockedOut: KNOCKED_OUT,
      dragAllowed: DRAG_OK,
    });
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, [contenteditable='true'], [role='button'], [data-badge], [data-card-selection-ignore]")) return;
      event.stopPropagation();
      void __selectTrackerEntry(e, event);
    });
    __bindInitiativeCardContextMenu(card, e);

// base card
card.style.minWidth = "284px";
card.style.maxWidth = "284px";
card.style.padding  = "0px 0px 0px";
card.style.boxSizing = "border-box";
card.style.color = "#fff";
card.style.display = "flex";
card.style.flexDirection = "column";
card.style.alignItems = "stretch";
card.style.gap = "0";

// altezza base + boost se boss
const BASE_CARD_H = 60;
const MAIN_CARD_H = IS_BOSS ? (BASE_CARD_H + LEG_BOSS_CFG.extraHeight) : BASE_CARD_H;
const EFFECT_ROW_H = HAS_CARD_EFFECTS ? 14 : 0;
const CARD_H = MAIN_CARD_H + EFFECT_ROW_H;
card.style.height = CARD_H + "px";

// applica cornice stile BG3 (come prima)
applyClassicCardFrame(card, c, {
  isBoss: IS_BOSS,
  bossConfig: LEG_BOSS_CFG,
  rgba,
  instaTransform: __instaTransform,
  outlineW: 1.5,
  frameW: 2,
  rOuter: 16,
  rInner: 14
});

// sostituisci l'assegnazione fissa dell'altezza:
card.style.height = CARD_H + "px";
;
if (HAS_LEG) {
  card.style.transform = `scale(${LEG_BOSS_CFG.scale})`;
  card.style.zIndex = String(LEG_BOSS_CFG.zIndex);
  
  // aggiungi un alone dorato soft senza togliere le ombre esistenti
  const prev = card.style.boxShadow || "";
  card.style.boxShadow = (prev ? (prev + ", ") : "") + LEG_BOSS_CFG.shadow;
} else {
  card.style.transform = "none";
}
  const baseScale = IS_BOSS ? (LEG_BOSS_CFG?.scale ?? 1) : 1;
  card.style.transform = `translateZ(0) scale(${baseScale})`;
  card.style.scale = "1";
  card.style.zIndex = IS_BOSS ? String(LEG_BOSS_CFG.zIndex) : "";

    const isActive = e.__groupMembers
  ? e.__groupMembers.some(m => m.id === state.order[state.current])
  : (state.order[state.current] === e.id);

const isNext = e.__groupMembers
  ? e.__groupMembers.some(m => m.id === nextId)
  : (nextId === e.id);

  if (isActive) {
    // gradiente “tintato” col colore di fazione
    card.style.background =
      `linear-gradient(105deg,
        ${rgba(c.base, .94)} 0%,
        ${rgba(c.base, .80)} 52%,
        rgba(40,51,68,.86) 100%
      )`;

    card.style.boxShadow =
      `0 0 0 2px ${c.border},
      0 0 20px 4px ${rgba(c.base, .58)},
      inset 0 0 0 2px rgba(255,255,255,.48)`;

    card.dataset.active = "1";

    // A halo pulsing in the faction colour marks the active turn (the GM view has no ⚔️ badge). It is a child of
    // its own: the selection adds its glow to the card's box-shadow, and the halo only animates its opacity
    // (index.html, tbp-active-turn-pulse). Its markup stays the same from one render to the next, so the tracker keeps
    // the live card instead of rebuilding it (portrait and listeners) on every render; a card that is rebuilt keeps
    // the pulse in phase by starting its animation at the document's time origin, like every other halo of the page.
    const halo = document.createElement("div");
    halo.dataset.activeTurnHalo = "1";
    Object.assign(halo.style, {
      position: "absolute",
      inset: "0",
      borderRadius: "inherit",
      pointerEvents: "none",
      boxShadow: `0 0 0 2px ${c.border}, 0 0 26px 8px ${rgba(c.base, .78)}`,
      animation: "tbp-active-turn-pulse 1.6s ease-in-out infinite alternate",
    });
    halo.addEventListener("animationstart", () => {
      for (const animation of halo.getAnimations?.() || []) animation.startTime = 0;
    }, { once: true });
    card.insertBefore(halo, card.firstChild);
{

  // --- ZOOM ATTIVO: anima SOLTANTO quando cambia l’attivo ---
  const baseScale   = IS_BOSS ? (LEG_BOSS_CFG?.scale ?? 1) : 1;
  card.style.scale = String(ZOOM_CFG.scale);
  card.dataset.zoomState = "active";

    card.style.zIndex = "6";
  }

  // Badge "turno attivo" (⚔️) dimensionato in proporzione alla card/boss. Solo nella vista player: il GM
  // riconosce il turno dall'alone e usa quel lato del ritratto per ⚡ 🪄 🗡️ (trackerQuickActions.js).
if (isActive && !IS_GM) {
  // Fattore di scala: i boss usano avatar 1.5× (vedi AVA = AVA_BASE * 1.5)
  const K = IS_BOSS ? 1.3 : 1;

  const BADGE_BASE_SIZE = 18;  // size standard
  const BADGE_BASE_LEFT = -15;  // offset standard
  const BADGE_BASE_FONT = 12;  // font standard

  const S = Math.round(BADGE_BASE_SIZE * K);  // diametro badge
  const L = Math.round(BADGE_BASE_LEFT * K);  // distanza da sinistra
  const F = Math.round(BADGE_BASE_FONT * K);  // font-size

  const activeBadge = document.createElement("div");
  activeBadge.textContent = "⚔️";
  Object.assign(activeBadge.style, {
    position: "absolute",
    left: IS_BOSS ? "-8px" : `${L}px`,
    top: IS_BOSS ? "auto" : "50%",
    bottom: IS_BOSS ? "0px" : "auto",
    transform: IS_BOSS ? "none" : "translateY(55%)",
    width: `${S}px`,
    height: `${S}px`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${F}px`,
    fontWeight: "700",
    color: "#fff",
    background: c.border,
    boxShadow: "0 2px 6px rgba(0,0,0,.85), 0 0 0 2px rgba(0,0,0,.6)",
    zIndex: IS_BOSS ? "8" : "4",
    pointerEvents: "none",
  });
  card.appendChild(activeBadge);
}
  }

  if (isNext && !isActive) {
    // stessa tinta ma molto più soft
    card.dataset.next = "1";
    card.style.boxShadow =
      `0 0 0 1px ${c.glow},
      inset 0 0 0 1px rgba(255,255,255,.28)`;
  }

  if (KNOCKED_OUT) {
    card.style.filter = "saturate(.42) brightness(.72)";
    card.style.opacity = ".84";
  }

  // --- header: avatar + name + badge (tutto in riga)

  // --- costanti avatar/overlap ---
  const AVA_BASE  = 58;                 // diametro avatar “normale”
  const OVER_BASE = 12;                 // sporgenza normale

// Se ha azioni leggendarie, avatar più grande e un filo più “sporgente”
  const AVA  = IS_BOSS ? 72 : AVA_BASE;
  const OVER = IS_BOSS ? 0 : OVER_BASE;
  const AVATAR_LEFT = IS_BOSS ? -12 : -OVER;

  // header: avatar + name + badge
  const header = document.createElement("div");
  const CONTENT_LEFT = IS_BOSS ? 76 : (AVA - OVER + 12);
  const BOSS_CONTENT_OFFSET = IS_BOSS
    ? Math.round((MAIN_CARD_H - BASE_CARD_H) / 2)
    : 0;
  const CENTER_SINGLE_LINE_NAME = !!e.__groupCollapsed || !!e.isEpicAction || isEpicActionId(e.id);
  Object.assign(header.style, {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: `${MAIN_CARD_H}px`,
    flex: `0 0 ${MAIN_CARD_H}px`,
    width: "100%",
    padding: "0",
    paddingLeft: `${CONTENT_LEFT}px`,      // spazio per il testo (riusa la costante)
    paddingRight: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
    boxSizing: "border-box",
  });

  // Wrapper + img: clip perfetto e cover affidabile
const AVATAR_ZOOM = 1.20; // ↑ porta a 1.08/1.12 se alcuni ritratti hanno “cornici” interne

const avatarWrap = document.createElement("div"); // contiene e clippa
Object.assign(avatarWrap.style, {
  position: "absolute",
  left: `${AVATAR_LEFT}px`,
  top: "50%",
  transform: "translateY(-50%)",
  width: `${AVA}px`,
  height: `${AVA}px`,
  borderRadius: "50%",
  overflow: "hidden",
  zIndex: IS_BOSS ? "3" : "2",
  boxShadow: `
    0 0 0 2px ${c.base},
    0 0 0 4px black,
    0 0 10px ${c.glow}
  `,
  transition: "width .15s ease, height .15s ease, left .15s ease"
});

let avatarInner;
if (e.portrait) {
  avatarInner = document.createElement("img");
  avatarInner.src = e.portrait;
  avatarInner.alt = e.name;
  Object.assign(avatarInner.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",           // << riempi sempre il cerchio
    objectPosition: "50% 50%",
    display: "block",
    transform: `scale(${AVATAR_ZOOM})`, // << micro-zoom opzionale
    transformOrigin: "50% 50%",
  });
} else {
  avatarInner = document.createElement("div"); // fallback con iniziale
  avatarInner.textContent = e.name.slice(0,1).toUpperCase();
  Object.assign(avatarInner.style, {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "18px",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
    transform: `scale(${AVATAR_ZOOM})`,
    transformOrigin: "50% 50%",
  });
}

avatarWrap.appendChild(avatarInner);

let knockedOutBadge = null;
card.dataset.koBadgeLeft = `${AVATAR_LEFT + AVA - 17}px`;
card.dataset.koBadgeTop = IS_BOSS ? "2px" : "1px";
if (KNOCKED_OUT) {
  knockedOutBadge = compactStatusBadge("KO", `Fuori combattimento: 0 / ${CLASSIC_HP_MAX}`);
  knockedOutBadge.dataset.cardKoBadge = "1";
  Object.assign(knockedOutBadge.style, {
    position: "absolute",
    left: `${AVATAR_LEFT + AVA - 17}px`,
    top: IS_BOSS ? "2px" : "1px",
    height: "20px",
    minWidth: "25px",
    zIndex: "8",
    pointerEvents: "none",
  });
}

const {
  portraitFrame: bossPortraitFrame,
  topRow: bossTopRow,
  hpRow: legendaryHPRow,
  bossHPBarBottom: BOSS_HP_BAR_BOTTOM,
} = buildClassicBossChrome({
  isBoss: IS_BOSS,
  hasLegendary: HAS_LEG,
  groupCollapsed: !!e.__groupCollapsed,
  isGM: IS_GM,
  playerBossVerticalOffset: PLAYER_BOSS_VERTICAL_OFFSET,
  avatarSize: AVA,
  avatarLeft: AVATAR_LEFT,
  mainCardHeight: MAIN_CARD_H,
  contentLeft: CONTENT_LEFT,
  badgeRight: BADGE_RIGHT,
  badgeSize: BADGE_SIZE,
  portraitFrameSrc: BOSS_PORTRAIT_FRAME_SRC,
  portraitFrameScale: BOSS_PORTRAIT_FRAME_SCALE,
});

  // nome (parte subito a destra dell’avatar)
  const name = document.createElement("div");
  name.title = e.__groupCollapsed ? `${e.__groupBase} (${e.__groupCount})` : e.name;


  Object.assign(name.style, {
  flex: "1 1 auto",
  minWidth: "0",
  display: "flex",
  alignItems: "center",
  gap: "6px",
});
if (HAS_LEG && !e.__groupCollapsed) {
  Object.assign(name.style, {
    position: "absolute",
    top: "15px",
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
  });
}

const nameLabel = document.createElement("span");
nameLabel.textContent = e.__groupCollapsed ? `${e.__groupBase} (Gruppo)` : e.name;
Object.assign(nameLabel.style, {
  flex: "1 1 auto",
  minWidth: "0",
  textAlign: "left",
  fontSize: "15px",
  fontWeight: "700",
  letterSpacing: "-.01em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
if (IS_GM && !e.__groupCollapsed && !isLairId(e.id) && !isEpicActionId(e.id)) {
  enableClassicCardRename({
    card,
    name,
    nameLabel,
    getOriginalName: () => e.name,
    borderColor: c.border,
    dragAllowed: DRAG_OK,
    saveName: (nextName) => saveClassicTrackerEntryName(e, nextName),
    onError: (error) => {
      console.warn("[initiative] rename token:", error?.message || error);
    },
  });
}
name.appendChild(nameLabel);


let cardToolsDock = null;
let placeCardToolInRadialSlot = null;
if (IS_GM && !isLairId(e.id) && !isEpicActionId(e.id)) {
  cardToolsDock = document.createElement("div");
  if (e.__groupCollapsed) {
    Object.assign(cardToolsDock.style, {
      position: "absolute",
      top: "calc(50% + 9px)",
      left: `${AVA - OVER + 18}px`,
      right: "auto",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      zIndex: "12",
      pointerEvents: "auto",
    });
  } else {
    Object.assign(cardToolsDock.style, {
      position: "absolute",
      left: `-${OVER}px`,
      top: "50%",
      transform: "translateY(-50%)",
      width: `${AVA}px`,
      height: `${AVA}px`,
      zIndex: "12",
      pointerEvents: "none",
    });

    const radialAngles = IS_BOSS ? [212, 180, 132] : [228, 180, 132];
    const radialButtonSize = 20;
    const radialRadius = (AVA / 2) - 2;
    const radialLeftOffset = IS_BOSS ? -8 : -4;
    placeCardToolInRadialSlot = (button, slot) => {
      const angle = (radialAngles[slot] ?? 0) * (Math.PI / 180);
      const center = AVA / 2;
      const left = center + (Math.cos(angle) * radialRadius) - (radialButtonSize / 2) + radialLeftOffset;
      const top = center + (Math.sin(angle) * radialRadius) - (radialButtonSize / 2);
      Object.assign(button.style, {
        position: "absolute",
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        width: `${radialButtonSize}px`,
        minWidth: `${radialButtonSize}px`,
        height: `${radialButtonSize}px`,
        padding: "0",
        pointerEvents: "auto",
      });
    };
  }
  header.appendChild(cardToolsDock);
}

if (cardToolsDock && e.__groupCollapsed) {
  const groupDeltaButton = document.createElement("button");
  groupDeltaButton.type = "button";
  groupDeltaButton.textContent = "±";
  groupDeltaButton.title = "Ricalibra HP correnti e massimi di tutto il gruppo";
  groupDeltaButton.setAttribute("aria-label", groupDeltaButton.title);
  Object.assign(groupDeltaButton.style, {
    flex: "0 0 auto",
    minWidth: "24px",
    width: "24px",
    height: "20px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,.22)",
    background: "rgba(0,0,0,.52)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
  });
  extendHitArea(groupDeltaButton);
  bindGroupHPDeltaEditor({
    button: groupDeltaButton,
    card,
    armClickIgnore: armDocClickIgnore,
    closeEditors: closeOpenEditors,
    parseRelativeDelta: parseRelativeHPDelta,
    applyDelta: (delta) =>
      applyGroupHPMaxDeltaWithRenderLock(e.id, delta),
    onError: (error) => {
      console.warn("[hp] group delta error:", error?.message || error);
    },
  });
  cardToolsDock.appendChild(groupDeltaButton);
}

  // ---- TAGs spostabili (posizione salvata in scena)
  const tagsDock = document.createElement("div");
  tagsDock.dataset.cardSelectionIgnore = "1";
  Object.assign(tagsDock.style, {
    position: "absolute",
    display: "flex",
    gap: "6px",
    alignItems: "center",
    transform: "translate(-50%, -50%)",
    pointerEvents: "auto",
    zIndex: "5",
  });
  // posizione percentuale (left/top) letta dallo stato
  (function setTagsDockPosFromState(){
    const tp = (state?.ui?.tagsDock) || { x: 0.72, y: 0.50 };
    tagsDock.style.left = (tp.x * 100) + "%";
    tagsDock.style.top  = (tp.y * 100) + "%";
  })();

  // Drag dei tag (solo GM): trascina l’intero dock
  if (IS_GM) {
    tagsDock.style.cursor = "grab";
    let dragging = false, rect = null, pid = 0;
    const onMove = async (ev) => {
      if (!dragging || !rect) return;
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top)  / rect.height;
      const nx = Math.max(0.05, Math.min(0.95, x));
      const ny = Math.max(0.10, Math.min(0.90, y));
      tagsDock.style.left = (nx * 100) + "%";
      tagsDock.style.top  = (ny * 100) + "%";
      await setSceneState(prev => ({
        ...(prev || {}),
        ui: { ...(prev?.ui || {}), tagsDock: { x: nx, y: ny } }
      }));
    };
    const onUp = () => {
      dragging = false;
      tagsDock.releasePointerCapture?.(pid);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      tagsDock.style.cursor = "grab";
    };
    tagsDock.addEventListener("pointerdown", (ev) => {
      if (!IS_GM) return;
      ev.stopPropagation();
      pid = ev.pointerId || 0;
      dragging = true;
      tagsDock.setPointerCapture?.(pid);
      rect = header.getBoundingClientRect();
      tagsDock.style.cursor = "grabbing";
      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
    });
  }

const epicTagDocks = appendClassicEpicTags(header, e, {
  isEpic: IS_EPIC,
  config: EPIC_TAG_CFG,
  badgeRight: BADGE_RIGHT,
  badgeSize: BADGE_SIZE,
});
// The "Azione Epica" / "Boss Epico" tag overhangs the card's top: the card keeps that room above it, so the tag never
// reaches the card above (its open pills, or its halo and scale when it is the active one).
if (epicTagDocks.length) {
  const overhang = classicEpicTagOverhang(EPIC_TAG_CFG, { isEpic: IS_EPIC, isEpicAction: !!e.isEpicAction });
  if (overhang) card.style.marginTop = `${overhang}px`;
}
// --- CHIP ×N SULL'AVATAR (solo se collassato) ---
if (e.__groupCollapsed && e.__groupCount > 1) {
  const CHIP = 32;            // diametro chip (regola qui)
  const OFFSET = 7;           // quanto rientra dall'angolo

  const cnt = document.createElement("div");
  cnt.textContent = `×${e.__groupCount}`;
  Object.assign(cnt.style, {
    position: "absolute",
    left:  (AVA - OVER - (CHIP / 2)) + "px",               // AVA - OVER - CHIP/2
    top:   `calc(50% + ${(AVA / 2) - (CHIP / 2) - OFFSET}px)`, // 50% + AVA/2 - CHIP/2 - offset
    width:  CHIP + "px",
    height: CHIP + "px",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    color: "#fff",
    background: "rgba(0,0,0,.85)",
    border: "1px solid rgba(255,255,255,.22)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    zIndex: "6",
    pointerEvents: "none",
  });
  header.appendChild(cnt);
}

  Object.assign(name.style, {
    position: "absolute",
    top: HAS_LEG
      ? "8px"
      : `${((!IS_GM && !PLAYER_CARD_HAS_HP && !IS_BOSS) || CENTER_SINGLE_LINE_NAME)
        ? Math.round((MAIN_CARD_H - 22) / 2)
        : (8 + BOSS_CONTENT_OFFSET)}px`,
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + (HAS_LEG ? 102 : 10)}px`,
    height: HAS_LEG ? "20px" : "22px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flex: "1 1 auto",
    minWidth: "0",                 // necessario per ellissi in flex
    fontSize: "15px",
    fontWeight: "700",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    zIndex: "4",
  });
  if (bossTopRow) {
    Object.assign(name.style, {
      position: "relative",
      top: "auto",
      left: "auto",
      right: "auto",
      width: "auto",
      maxWidth: "100%",
      height: "20px",
      flex: "0 1 auto",
      justifyContent: "flex-start",
      textAlign: "left",
      zIndex: "1",
    });
  }
  if (!IS_GM && !bossTopRow) {
    name.style.justifyContent = "flex-start";
    name.style.textAlign = "left";
  }

  // badge iniziativa (ancorato a destra, centrato verticalmente)
  const badge = document.createElement("div");
  badge.textContent = String(e.initiative);
  badge.title = "Click per modificare l'iniziativa";
  Object.assign(badge.style, {
  position: "absolute",
  right: BADGE_RIGHT + "px",
  top: `${MAIN_CARD_H / 2}px`,
  transform: "translateY(-50%)",
  width: BADGE_SIZE + "px",
  height: BADGE_SIZE + "px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "1",
  color: "#fff",
  background: "rgba(24,32,44,.84)",
  border: `1px solid ${rgba(c.border, .88)}`,
  borderRadius: "50%",
  boxShadow: `0 4px 12px rgba(0,0,0,.42), inset 0 0 0 1px ${rgba(c.base, .18)}`,
  cursor: "text",
});

// --- Dock per condizioni
const condDock = document.createElement("div");
const HAS_HP_BAR = (IS_GM || CLASSIC_HP_VISIBLE) && !e.__groupCollapsed && !isLairId(e.id) && !isEpicActionId(e.id);
const CHIP_DOCK_TOP = HAS_HP_BAR
  ? (IS_BOSS ? MAIN_CARD_H - 4 - BOSS_HP_BAR_BOTTOM : MAIN_CARD_H - 7) + 5
  : MAIN_CARD_H - 5;
condDock.style.position = "absolute";
condDock.style.top = `${CHIP_DOCK_TOP}px`;
condDock.style.left = `${CONTENT_LEFT}px`;
condDock.style.right = "10px";
condDock.style.minHeight = "18px";
condDock.style.zIndex = "10";
condDock.style.overflow = "visible"; // importantissimo per far “uscire” l’overlay
condDock.style.display = "flex";
condDock.style.flexDirection = "row";
condDock.style.alignItems = "center";   // ancora a sinistra
condDock.style.gap = CHIP_GAP_PX + "px";
header.appendChild(condDock);

// --- CHIPS: condizioni + incantesimi in un unico gruppo con overflow condiviso ---
const fragAll = document.createDocumentFragment();

// 1) Condizioni
const condData = cardEffectData;
const hasAny = (Object.keys(condData.flags).length > 0) || (condData.custom && condData.custom.length > 0) || condData.instances.length > 0;
if (hasAny) {
  const fragCond = __buildConditionChipsSafe(condData, {
    cap: CONDITIONS,
    compact: true,
    showEffectSummaryParts,
    onRemove: IS_GM && !isLairId(e.id) && !isEpicActionId(e.id)
      ? (group) => __removeConditionOnTrackerCard(e.id, group)
      : null,
    onTerminateClassFeature: IS_GM
      ? (instance) => __terminateClassFeatureOnTrackerCard(e.id, instance)
      : null,
  });
  if (fragCond) fragAll.appendChild(fragCond);
}

// 2) Incantesimi
const trackerSpells = classicCardSpells(e);
if (trackerSpells.length) {
  const canTerminate = IS_GM && !isLairId(e.id) && !isEpicActionId(e.id);
  for (const spell of trackerSpells) {
    const boardToken = typeof __findSpellBoardToken === "function"
      ? __findSpellBoardToken(boardTokenItems, e.id, spell)
      : null;
    const spellChipOptions = canTerminate && !spell.trackerConcentrationOnly
      ? { onTerminate: (entry) => __terminateSpellOnTrackerCard(e.id, entry) }
      : {};
    // The ⚡ of a spell with active actions: they run from the pill, without the spell panel.
    if (canTerminate && !spell.trackerConcentrationOnly && spell.instanceId
      && typeof __openSpellPillActions === "function" && spellPillHasActions(spell)) {
      spellChipOptions.onActions = (entry, event) => __openSpellPillActions(e, entry, event);
    }
    if (boardToken?.state?.hpMax > 0) {
      spellChipOptions.boardTokenHP = {
        itemId: boardToken.itemId,
        hp: boardToken.state.hp,
        hpMax: boardToken.state.hpMax,
      };
    }
    const fragSp = buildSpellChips([spell], {
      ...spellChipOptions,
      concentrating: spell.trackerConcentration,
      concentrationOnly: spell.trackerConcentrationOnly,
      showEffectSummaryParts,
    });
    if (boardToken && typeof __bindSpellBoardTokenHPEditor === "function") {
      const hpPill = fragSp.querySelector?.('[data-spell-board-token-hp="1"]');
      if (hpPill) __bindSpellBoardTokenHPEditor(hpPill, boardToken, spell);
    }

  // colore pieno = stesso del badge "C"
    const chips = Array.from(fragSp.childNodes).filter(n => n.nodeType === 1);
    for (let i = 0; i < chips.length; i++) {
      const k   = __spellKey(spell?.name);
      const col = __spellColor(k);
      const el  = chips[i];
    el.style.background = col.solid; // ⟵ colore pieno, no alpha
    // NON toccare font/padding/radius/border/shadow: gestiscili in spells.js
  }

    fragAll.appendChild(fragSp);
    }
}

// 3) Monta TUTTO assieme: affiancate finché ci stanno, poi a capo; 3 visibili, poi "…"
condDock.style.gap = CHIP_GAP_PX + "px";
mountChipsWithOverflow(condDock, fragAll, { compact: true, limit: 3 });
bindReferenceChips(condDock);

if (e.__groupCollapsed) {
  // Sulla card collassata l’iniziativa modifica l’intero gruppo
  badge.title = "Click per modificare l'iniziativa del gruppo";
  badge.style.cursor = "text";
}

  badge.style.userSelect = "none";
  badge.dataset.badge  = "init";
  badge.dataset.itemId = e.id;
  badge.dataset.initTouched = e.initTouched === true ? "1" : "0";
  badge.__initNormalBorder = badge.style.border;
  badge.__initNormalShadow = badge.style.boxShadow;

bindInitiativeEditorForEntry(badge, e);

if (e.__groupCollapsed) {
  const chev = document.createElement("div");
  chev.dataset.cardSelectionIgnore = "1";
  chev.textContent = "▸";
  Object.assign(chev.style, {
    position: "absolute",
    left: "2px",                   // ← a sinistra del badge ⚔ (che sta a ~24px)
    top: "50%",
    transform: "translateY(30%)",  // stessa verticale del badge ⚔
    width: "22px",                 // stessa taglia del badge ⚔
    height: "22px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "700",
    color: "#fff",
    background: "rgba(0,0,0,.80)",
    border: "1px solid rgba(255,255,255,.22)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    cursor: "pointer",
    userSelect: "none",
    zIndex: "6",
  });
  chev.title = `Espandi gruppo “${e.__groupBase}”`;
  chev.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await setSceneState(prev => {
      const c = { ...(prev.collapsed || {}) };
      delete c[e.__groupKey];
      return { ...prev, collapsed: c };
    });
  });
  header.appendChild(chev);
}

else if (e.__groupFirst) {
  const chev = document.createElement("div");
  chev.dataset.cardSelectionIgnore = "1";
  chev.textContent = "▾";
  Object.assign(chev.style, {
    position: "absolute",
    left: "24px",
    top: "50%",
    transform: "translateY(30%)",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "700",
    color: "#fff",
    background: "rgba(0,0,0,.80)",
    border: "1px solid rgba(255,255,255,.22)",
    boxShadow: "0 2px 6px rgba(0,0,0,.55)",
    cursor: "pointer",
    userSelect: "none",
    zIndex: "6",
  });
  chev.title = `Comprimi gruppo “${e.__groupBase}”`;
  chev.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await setSceneState(prev => {
      const c = { ...(prev.collapsed || {}) };
      c[e.__groupKey] = true;
      return { ...prev, collapsed: c };
    });
  });
  header.appendChild(chev);
}
const legendaryResourceDock = buildClassicLegendaryResourceDock(e, {
  isGM: IS_GM,
  playerBossVerticalOffset: PLAYER_BOSS_VERTICAL_OFFSET,
  contentLeft: CONTENT_LEFT,
  badgeRight: BADGE_RIGHT,
  badgeSize: BADGE_SIZE,
  resourceConfig: LEG_RESOURCE_CFG,
  pipsConfig: LEG_PIPS_CFG,
  defaultResistances: DEFAULT_LEGENDARY_RESISTANCES,
  onActionCurrent: async (nextCurrent) => {
    if (!IS_GM) return;
    try { await setLegendaryCurrent(e.id, nextCurrent); } catch {}
  },
  onActionMax: (nextMax) => setLegendaryMax(e.id, nextMax),
  onResistanceCurrent: async (nextCurrent) => {
    if (!IS_GM) return;
    try {
      await setLegendaryResistanceCurrent(e.id, nextCurrent);
    } catch {}
  },
  onResistanceMax: (nextMax) =>
    setLegendaryResistanceMax(e.id, nextMax),
});
if (legendaryResourceDock) header.appendChild(legendaryResourceDock);

const paragonDock = buildClassicParagonDock(e, {
  isGM: IS_GM,
  config: PAR_CTRL_CFG,
  badgeRight: BADGE_RIGHT,
  badgeSize: BADGE_SIZE,
  onSetActions: async (baseId, nextActions) => {
    await setParagonActions(baseId, nextActions);
    await reconcileStateWithItems();
    await renderAll();
  },
  onError: (error) => {
    console.warn(
      "[paragon] set actions error:",
      error?.message || error
    );
  },
});
if (paragonDock) header.appendChild(paragonDock);

  header.append(avatarWrap);
  if (knockedOutBadge) header.appendChild(knockedOutBadge);
  if (bossPortraitFrame) header.appendChild(bossPortraitFrame);
  if (bossTopRow) {
    bossTopRow.appendChild(name);
    header.appendChild(bossTopRow);
    if (legendaryHPRow) header.appendChild(legendaryHPRow);
    header.appendChild(badge);
  } else {
    header.append(name, badge);
  }
// La card cresce per contenere le righe di chip, misurate a schermo.
fitCardToChipDock(card, condDock, { baseHeight: CARD_H, dockTop: CHIP_DOCK_TOP });


  card.appendChild(header);

// === HP: il GM usa i valori canonici, il Player il view model proiettato.
const _playerCanSeeHP = CLASSIC_HP_VISIBLE;
const _hpDisclosure = e.hpDisclosure && typeof e.hpDisclosure === "object"
  ? e.hpDisclosure
  : null;
const _hpMode = _hpDisclosure?.mode || "exact";

if ((IS_GM || _playerCanSeeHP) && !e.__groupCollapsed && !isLairId(e.id) && !isEpicActionId(e.id)) {
  const hpControlsRow = document.createElement("div");
  Object.assign(hpControlsRow.style, {
    position: "absolute",
    top: IS_BOSS ? "0px" : `${MAIN_CARD_H - 32}px`,
    left: `${CONTENT_LEFT}px`,
    right: `${BADGE_RIGHT + BADGE_SIZE + 10}px`,
    height: IS_BOSS ? `${MAIN_CARD_H - 4}px` : "25px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "4px",
    paddingBottom: IS_BOSS ? "0" : "6px",
    boxSizing: "border-box",
    zIndex: "3",
    pointerEvents: IS_BOSS ? "none" : "auto",
  });

  const pill = document.createElement("div");
  pill.title = IS_GM
    ? "Click: modifica HP. +N/-N sui token selezionati; ± modifica anche gli HP massimi"
    : _hpMode === "status" ? "Stato HP" : "Barra HP";
  pill.style.position = "relative";
  pill.style.marginRight = "0";
  pill.style.padding = "0";
  pill.style.fontSize = "12px";
  pill.style.fontWeight = "700";
  pill.style.lineHeight = "13px";
  pill.style.color = "#fff";
  pill.style.background = "transparent";
  pill.style.border = "none";
  pill.style.borderRadius = "0";
  pill.style.boxShadow = "none";
  pill.style.cursor = "text";
  pill.style.zIndex = "3";
  pill.style.pointerEvents = "auto";
  // Room for "999/999" at least, with digits of equal width: the icons after it start in the same column on every card.
  pill.style.minWidth = "7ch";
  pill.style.fontVariantNumeric = "tabular-nums";

  const hpVal  = CLASSIC_HP_VALUE;
  const hpMaxV = CLASSIC_HP_MAX;
  const _statusLabels = {
    down: "Fuori combattimento",
    critical: "Critico",
    bloodied: "Ferito",
    hurt: "Provato",
    healthy: "In salute",
  };
  pill.innerHTML = _hpMode === "bar"
    ? ""
    : _hpMode === "status"
      ? (_statusLabels[_hpDisclosure?.status] || "Stato sconosciuto")
      : formatHPHTML(hpVal, hpMaxV);
  pill.style.display = _hpMode === "bar" ? "none" : "block";
  if (KNOCKED_OUT) pill.style.color = "rgba(255,255,255,.58)";
  pill.dataset.badge  = "hp";
  pill.dataset.itemId = e.id;

  // === Barra HP visuale accanto alla pill ===
  const hpBarWrap = document.createElement("div");
  hpBarWrap.style.position = "absolute";
  hpBarWrap.style.left = "0";
  hpBarWrap.style.right = "0";
  hpBarWrap.style.bottom = IS_BOSS ? `${BOSS_HP_BAR_BOTTOM}px` : "0";
  hpBarWrap.style.width = "auto";
  hpBarWrap.style.height = "6px";
  hpBarWrap.style.boxSizing = "border-box";
  hpBarWrap.style.background = "rgba(0,0,0,.68)";
  hpBarWrap.style.border = "1px solid rgba(0,0,0,.85)";
  hpBarWrap.style.borderRadius = "999px";
  hpBarWrap.style.overflow = "hidden";
  hpBarWrap.style.zIndex = "3";
  hpBarWrap.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,.65)";

  const initPct = hpMaxV > 0 ? Math.max(0, Math.min(1, hpVal / hpMaxV)) : 0;
  const hpFill = document.createElement("div");
  hpFill.dataset.hpFill = "1";
  hpFill.dataset.itemId = e.id;
  hpFill.style.width = (initPct * 100) + "%";
  hpFill.style.height = "100%";
  hpFill.style.background = KNOCKED_OUT
    ? "#475569"
    : initPct > 0.66 ? "#16a34a" : initPct > 0.33 ? "#facc15" : "#dc2626";

  hpBarWrap.appendChild(hpFill);

  let hpDeltaButton = null;
  const setHPDeltaButtonActive = (active) => {
    if (!hpDeltaButton) return;
    hpDeltaButton.setAttribute("aria-pressed", String(!!active));
    hpDeltaButton.style.background = active
      ? "rgba(245,158,11,.42)"
      : "rgba(0,0,0,.52)";
    hpDeltaButton.style.borderColor = active
      ? "rgba(251,191,36,.82)"
      : "rgba(255,255,255,.22)";
  };

  let initiativeCardButton = null;
  // A character's or an ally's sheet; the GM opens every creature's (a monster's stat block).
  if (canOpenInitiativeCardSheet(e, { isGM: IS_GM })) {
    initiativeCardButton = document.createElement("button");
    initiativeCardButton.type = "button";
    initiativeCardButton.title = "Apri scheda personaggio";
    initiativeCardButton.setAttribute("aria-label", initiativeCardButton.title);
    // Same look as the reaction indicator (cardIconButton.js), in the sheet's blue.
    styleCardIconButton(initiativeCardButton, "sheet");
    initiativeCardButton.style.cursor = "pointer";
    initiativeCardButton.appendChild(buildCardIconGlyph("character-sheet.svg", 10));
    extendHitArea(initiativeCardButton);
    initiativeCardButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
    });
    initiativeCardButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      void openInitiativeCardPopup(e);
    });
  }
  if (IS_GM && e.attitude !== "pc") {
    hpDeltaButton = document.createElement("button");
    hpDeltaButton.type = "button";
    hpDeltaButton.textContent = "±";
    hpDeltaButton.title = "Ricalibra HP correnti e massimi dello stesso +N/-N";
    hpDeltaButton.setAttribute("aria-label", hpDeltaButton.title);
    hpDeltaButton.setAttribute("aria-pressed", "false");
    Object.assign(hpDeltaButton.style, {
      flex: "0 0 auto",
      minWidth: `${CARD_ICON_BUTTON_SIZE}px`,
      width: `${CARD_ICON_BUTTON_SIZE}px`,
      height: `${CARD_ICON_BUTTON_SIZE}px`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.22)",
      background: "rgba(0,0,0,.52)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "700",
      lineHeight: "1",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.35)",
      pointerEvents: "auto",
    });
    extendHitArea(hpDeltaButton);
    hpDeltaButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      armDocClickIgnore(350);
    });
    hpDeltaButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      armDocClickIgnore(350);

      if (
        pill.dataset.hpEditing === "1" &&
        getEditingHPForId() === e.id &&
        typeof pill.__setLinkedHPMaxDelta === "function"
      ) {
        pill.__setLinkedHPMaxDelta(!pill.__linkedHPMaxDelta);
        pill.__iHP?.focus({ preventScroll: true });
        pill.__iHP?.select();
        return;
      }

      pill.dataset.hpOpenLinkedDelta = "1";
      const rect = pill.getBoundingClientRect();
      pill.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: rect.left + 1,
        clientY: rect.top + (rect.height / 2),
      }));
    });
    hpDeltaButton.style.fontSize = "12px";
  }

  // Reaction indicator (reactionTrackerCore.js): the GM marks it on any creature, players see it on PCs and allies.
  const reactionIndicator = IS_GM || ["pc", "ally"].includes(e.attitude)
    ? buildReactionIndicator({
      used: hasReactionUsed(cardEffectData),
      interactive: IS_GM && typeof toggleReactionUsedOnTrackerCard === "function",
      onToggle: () => toggleReactionUsedOnTrackerCard(e),
    })
    : null;

  const hpCaption = document.createElement("span");
  hpCaption.textContent = "HP";
  Object.assign(hpCaption.style, {
    color: "rgba(255,255,255,.62)",
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "13px",
    pointerEvents: "none",
  });

  // Right after the HP value (which has a fixed minimum width), on every card: reaction first, so it always sits in
  // the same column, then the sheet (PCs, allies) and the GM's ±, only those present.
  const hpRowIcons = [reactionIndicator, initiativeCardButton, hpDeltaButton].filter(Boolean);
  // All drawn at the same size (cardIconButton.js) and lifted a little, so they keep 3px above the HP bar.
  for (const icon of hpRowIcons) icon.style.marginBottom = CARD_ICON_LIFT;

  if (legendaryHPRow) {
    hpCaption.style.fontSize = "9px";
    hpCaption.style.lineHeight = "11px";
    legendaryHPRow.append(hpCaption, pill, ...hpRowIcons);
    hpControlsRow.appendChild(hpBarWrap);
  } else if (bossTopRow) {
    hpCaption.style.fontSize = "9px";
    hpCaption.style.lineHeight = "11px";
    bossTopRow.append(hpCaption, pill, ...hpRowIcons);
    hpControlsRow.appendChild(hpBarWrap);
  } else {
    hpControlsRow.append(hpCaption, pill, ...hpRowIcons);
    hpControlsRow.appendChild(hpBarWrap);
  }
  card.appendChild(hpControlsRow);

// === apertura editor HP su pointerdown (con handoff robusto) ===

if (IS_GM) {
  bindHPEditorForEntry(pill, hpFill, setHPDeltaButtonActive, e);
}
}
      // The launchers stand on the portrait: in the header, whose height is the portrait's, however the card grows.
      mountTrackerQuickActions?.(card, e, { anchor: header });
      __applyTrackerSelectionState(card);
      return card;
}


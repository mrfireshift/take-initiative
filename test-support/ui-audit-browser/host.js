import OBR, { fakeHost } from "@owlbear-rodeo/sdk";
import { markSceneEpochReady } from "/src/sceneEpoch.js";
import { mountHistoryOwner } from "/src/historyOwner.js";
import { mountEffectsMutationCoordinatorService } from "/src/effectsMutations.js";
import { openTrackerPopover } from "/src/trackerPopover.js";
import { SPELL_BOARD_TOKEN_META_KEY, spellBoardTokenMetadata, spellBoardTokenDisplayName } from "/src/spellBoardTokenCore.js";
import { captureCombatSnapshot } from "/src/combatSnapshot.js";
import { buildCombatSnapshotSvg } from "/src/combatSnapshotCore.js";
import "/src/sync-open.js";

const KEY = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const CONC = "com.thebigpicture.initiative/concentration";
const potion = id => ({ id, condition: "Pozione di Eroismo", effectId: "buff:pozione-di-eroismo", effectKind: "buff",
  summaryParts: [{ id: "temporary-hp", label: "10 PF temp." }], theme: { accent: "#34d399", background: "#064e3b" } });
const token = (id, name, hp, hpMax, initiative, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER",
  image: { url: "/quick-damage.svg" }, position: { x: 100, y: 100 },
  metadata: { [KEY]: { inInitiative: true, attitude: "pc", hp, hpMax, initiative, ...extra } } });
fakeHost.state.role = new URLSearchParams(location.search).get("role") === "PLAYER" ? "PLAYER" : "GM";
fakeHost.state.items = [
  token("omar", "Omar", 78, 100, 23, { conditions: { instances: [potion("potion-omar")] }, [SPELLS]: [{ name: "Benedizione" }] }),
  token("auril", "Auril, Vergine del Gelo", 495, 495, 20, { attitude: "enemy", epic: true, sharedHpTrackerVisibility: "all",
    conditions: { instances: [{ id: "oath", condition: "Giuramento di Inimicizia", turns: 9, theme: { accent: "#f59e0b", background: "#78350f" } }] } }),
  token("lavera", "Lavera", 98, 98, 20, {
    conditions: { instances: [{ id: "inspiration", condition: "Ispirazione Bardica", resourceDie: "d10", theme: { accent: "#38bdf8", background: "#0c4a6e" } }] },
    [SPELLS]: [{ name: "Animare oggetti", turns: 5, casterId: "lavera", instanceId: "animate-lavera", conc: true }],
    [CONC]: { "animare oggetti": { targets: ["lavera"], instanceId: "animate-lavera" } },
  }),
  token("klos", "Klos", 143, 133, 14, { conditions: { instances: [potion("potion-klos")] },
    [SPELLS]: [{ name: "Ingrandire/ridurre" }, { name: "Saltare", turns: 6 }, { name: "Velocità", turns: 8 }] }),
  token("legendary", "Boss leggendario", 120, 200, 10, { attitude: "enemy", legendary: { max: 3, current: 2 }, [SPELLS]: [{ name: "Scudo della fede", turns: 4 }] }),
  // Extra rows for the audit: low HP, many conditions, a downed PC, a dead enemy and an ally.
  token("goblin-boss", "Goblin capobanda dal nome molto lungo", 6, 21, 9, { attitude: "enemy",
    conditions: { instances: [{ id: "prone", condition: "Prono" }, { id: "poison", condition: "Avvelenato", turns: 3 },
      { id: "fright", condition: "Spaventato", turns: 2 }, { id: "grab", condition: "Afferrato" }] } }),
  token("brann", "Brann", 0, 45, 8, { conditions: { instances: [{ id: "ko", condition: "Privo di sensi" }] } }),
  token("wolf", "Lupo alleato", 11, 11, 7, { attitude: "ally" }),
  token("goblin", "Goblin", 0, 7, 5, { attitude: "enemy" }),
];
const sharedPortraits = ["/boss-auril-hand-slam-cracked.webp", "/boss-auril-hand-slam-collapsed.webp", "/spell-token-arcane-hand.webp"];
for (const [index, name] of ["Mano del Titano", "Testa del Titano", "Corpo del Titano"].entries()) {
  const item = token(`titan-${index}`, name, 495, 495, 0, { inInitiative: false, attitude: "enemy",
    sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true });
  item.image.url = sharedPortraits[index]; fakeHost.state.items.push(item);
}
const objectAssets = ["/spell-token-animated-tiny-small.webp", "/spell-token-animated-medium.webp", "/spell-token-animated-large-huge.webp"];
for (let index = 0; index < 10; index++) {
  fakeHost.state.items.push({ id: `object-${index + 1}`, name: spellBoardTokenDisplayName("animate-objects", "Lavera", index + 1), type: "IMAGE", layer: "PROP",
    image: { url: objectAssets[index % 3] }, position: { x: 100, y: 100 }, metadata: {
      [SPELL_BOARD_TOKEN_META_KEY]: spellBoardTokenMetadata({ spellId: "animate-objects", instanceId: "animate-lavera", casterId: "lavera", number: index + 1, objectSize: "small" }),
      [KEY]: { hp: 25, hpMax: 25, attitude: "pc" },
    } });
}
fakeHost.state.sceneMetadata = { "com.thebigpicture.initiative/state": { round: 1, current: 0, order: ["omar", "auril", "lavera", "klos", "legendary", "goblin-boss", "brann", "wolf", "goblin"] } };
const frames = new Map();
fakeHost.onPopover = (action, options, previous) => {
  if (action === "close") { frames.get(options.id)?.remove(); frames.delete(options.id); return; }
  let frame = frames.get(options.id);
  if (!frame || (action === "open" && previous?.url !== options.url)) {
    frame?.remove(); frame = document.createElement("iframe"); frame.title = options.id.split("/").at(-1);
    frame.src = options.url; frames.set(options.id, frame); document.body.append(frame);
  }
  const current = fakeHost.state.popovers.get(options.id) || options;
  const left = current.anchorPosition.left - (current.transformOrigin?.horizontal === "RIGHT" ? current.width : current.transformOrigin?.horizontal === "CENTER" ? current.width / 2 : 0);
  const top = current.anchorPosition.top - (current.transformOrigin?.vertical === "BOTTOM" ? current.height : current.transformOrigin?.vertical === "CENTER" ? current.height / 2 : 0);
  Object.assign(frame.style, { width: `${current.width}px`, height: `${current.height}px`, left: `${Math.max(0, left)}px`, top: `${Math.max(0, top)}px` });
};
const layoutParam = new URLSearchParams(location.search).get("layout") === "compact" ? "compact" : "classic";
localStorage.setItem("com.thebigpicture.initiative/tracker-layout", layoutParam);
markSceneEpochReady("ui-audit-preview");
await mountHistoryOwner(); await mountEffectsMutationCoordinatorService();
await openTrackerPopover({ refresh: true });
document.getElementById("open-manual").onclick = () => OBR.popover.open({ id: "com.thebigpicture.initiative/quick-hp-modal",
  url: "/quick-hp-modal.html", width: 560, height: Math.min(760, innerHeight - 32),
  anchorPosition: { left: 16, top: 16 }, anchorReference: "POSITION",
  anchorOrigin: { horizontal: "LEFT", vertical: "TOP" }, transformOrigin: { horizontal: "LEFT", vertical: "TOP" }, hidePaper: true });
document.getElementById("capture-snapshot").onclick = async () => {
  const snapshot = await captureCombatSnapshot();
  document.getElementById("snapshot-json").textContent = JSON.stringify(snapshot, null, 2);
  document.getElementById("snapshot-board").innerHTML = buildCombatSnapshotSvg(snapshot);
};

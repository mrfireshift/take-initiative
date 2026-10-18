import { fakeHost } from "@owlbear-rodeo/sdk";
import { markSceneEpochReady } from "/src/sceneEpoch.js";
import { mountHistoryOwner } from "/src/historyOwner.js";
import { mountEffectsMutationCoordinatorService } from "/src/effectsMutations.js";
import { openTrackerPopover } from "/src/trackerPopover.js";
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
  token("auril", "Auril, Vergine del Gelo", 495, 495, 20, { attitude: "enemy", epic: true,
    conditions: { instances: [{ id: "oath", condition: "Giuramento di Inimicizia", turns: 9, theme: { accent: "#f59e0b", background: "#78350f" } }] } }),
  token("lavera", "Lavera", 98, 98, 20, {
    conditions: { instances: [{ id: "inspiration", condition: "Ispirazione Bardica", resourceDie: "d10", theme: { accent: "#38bdf8", background: "#0c4a6e" } }] },
    [SPELLS]: [{ name: "Animare oggetti", turns: 5, casterId: "lavera", instanceId: "animate-lavera", conc: true }],
    [CONC]: { "animare oggetti": { targets: ["lavera"], instanceId: "animate-lavera" } },
  }),
  token("klos", "Klos", 143, 133, 14, { conditions: { instances: [potion("potion-klos")] },
    [SPELLS]: [{ name: "Ingrandire/ridurre" }, { name: "Saltare", turns: 6 }, { name: "Velocità", turns: 8 }] }),
  token("legendary", "Boss leggendario", 120, 200, 10, { attitude: "enemy", legendary: { max: 3, current: 2 }, [SPELLS]: [{ name: "Scudo della fede", turns: 4 }] }),
];
fakeHost.state.sceneMetadata = { "com.thebigpicture.initiative/state": { round: 1, current: 0, order: ["omar", "auril", "lavera", "klos", "legendary"] } };
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
localStorage.setItem("com.thebigpicture.initiative/tracker-layout", "classic");
markSceneEpochReady("tracker-polish-preview");
await mountHistoryOwner(); await mountEffectsMutationCoordinatorService();
await openTrackerPopover({ refresh: true });

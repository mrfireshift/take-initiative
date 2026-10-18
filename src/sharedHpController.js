import { ID } from "./constants.js";
import { resolveSharedHpGroup } from "./sharedHpCore.js";

const KEY = `${ID}/meta`;
export function createSharedHpController({ api, runMutation, getSceneContext, isCurrent }) {
  let busy = false;
  async function read(tokenIds = []) {
    const context = await getSceneContext();
    if (!isCurrent(context)) throw new Error("Scena cambiata: riapri HP condivisi.");
    if (await api.player.getRole() !== "GM") throw new Error("Solo il GM può gestire gli HP condivisi.");
    const items = await api.scene.items.getItems();
    if (!isCurrent(context)) throw new Error("Scena cambiata: riapri HP condivisi.");
    const real = items.filter(item => item.layer === "CHARACTER" && !item.attachedTo);
    const tokens = real.filter(item => tokenIds.includes(item.id));
    const candidates = real.filter(item => {
      const meta = item.metadata?.[KEY] || {};
      return !meta.sharedHpSourceId && meta.hp !== null && meta.hp !== undefined
        && Number.isFinite(Number(meta.hp)) && Number(meta.hpMax) > 0;
    });
    return { items: real, tokens, candidates, context, groups: tokens.map(item => resolveSharedHpGroup(real, item.id)) };
  }
  async function submit(operation, suppliedContext) {
    if (busy) return { status: "rejected", reason: "shared-hp-busy" };
    busy = true;
    try {
      const context = suppliedContext || await getSceneContext();
      if (!isCurrent(context)) return { status: "rejected", reason: "shared-hp-stale-scene" };
      if (await api.player.getRole() !== "GM") return { status: "rejected", reason: "shared-hp-gm-only" };
      if (!isCurrent(context)) return { status: "rejected", reason: "shared-hp-stale-scene" };
      return await runMutation([operation], { commandId: context.commandId, sceneIdentity: context.sceneIdentity,
        history: true, kind: "hp", label: operation.type === "shared-hp:link" ? "Collegati HP condivisi" : "Scollegati HP condivisi",
        targetIds: operation.targetIds });
    } finally { busy = false; }
  }
  return { read,
    link: (sourceId, targetIds, context) => submit({ type: "shared-hp:link", sourceId, targetIds,
      ...(context?.expectedSourceHP ? { expectedSourceHP: context.expectedSourceHP } : {}) }, context),
    unlink: (targetIds, context) => submit({ type: "shared-hp:unlink", targetIds }, context),
  };
}

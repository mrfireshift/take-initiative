import OBR from "@owlbear-rodeo/sdk";
import {
  cleanupOwnedEffectsLabels,
  mountEffectsReconciler,
  reconcileAllEffectsLabels,
  unmountEffectsReconciler,
} from "./effectsReconciler.js";
import { mountSpellAuraController } from "./spellAuraController.js";
import { mountClassFeatureAuraController } from "./classFeatureAuraController.js";
import { mountCustomAuraController } from "./customAuraController.js";
import { mountStaticSpellZoneController } from "./spellStaticZone.js";
import { mountEffectSaveReminderController } from "./effectSaveReminderController.js";
import { mountClassFeatureReminderController } from "./classFeatureReminderController.js";
import { mountPreparedSpellResolutionController } from "./preparedSpellResolutionController.js";
import { mountCallLightningTurnPromptController } from "./callLightningTurnPromptController.js";
import { mountEffectsMutationCoordinatorService } from "./effectsMutations.js";
import { mountTurnNoticeHost } from "./turnNoticeHost.js";
import "./sync-open.js";
import "./speedMoveTool.js";
import {
  cleanupClocksTool,
  mountClocksTool,
  reconcileClocksTool,
  unmountClocksTool,
} from "./clocksTool.js";
import {
  cleanupDistance3dTool,
  mountDistance3dTool,
  reconcileDistance3dTool,
  unmountDistance3dTool,
} from "./distance3dTool.js";
import {
  cleanupReferenceTool,
  mountReferenceTool,
  reconcileReferenceTool,
  unmountReferenceTool,
} from "./referenceTool.js";
import "./aoeTargetTool.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import {
  selectClocksToolEnabled,
  selectDistance3dToolEnabled,
  selectEmbersAnimationsEnabled,
  selectMapEffectLabelsEnabled,
  selectReferenceToolEnabled,
} from "./options/optionsSelectors.js";
import {
  bindOptionalRuntimeOption,
  createOptionalRuntimeLifecycle,
} from "./options/optionalRuntimeLifecycle.js";
import { mountCombatLogEventSink } from "./combatLog.js";
import { readLegacyHPMemoryForItem } from "./hpMemory.js";
import { migrateInitiativeCardActorIdentities } from "./initiativeCards.js";
import {
  actorVitalsRecordFor,
  isValidActorVitalsRecord,
} from "./actorVitalsCore.js";
import {
  actorVitalsStore,
  saveActorCanonicalHP,
  startActorVitalsRuntime,
} from "./actorVitalsStore.js";
import { isLegacyActorMigrationEligible } from "./actorIdentityCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  mountFireballVisualRenderer,
  unmountFireballVisualRenderer,
} from "./fireballVisualRenderer.js";
import {
  mountEmbersMatchedVisualRenderer,
  unmountEmbersMatchedVisualRenderer,
} from "./embersMatchedVisualRenderer.js";

function mountEmbersVisualRenderers() {
  mountFireballVisualRenderer();
  mountEmbersMatchedVisualRenderer();
}

async function unmountEmbersVisualRenderers() {
  await Promise.all([
    unmountFireballVisualRenderer(),
    unmountEmbersMatchedVisualRenderer(),
  ]);
}

async function bootstrapActorVitalsRuntime() {
  try {
    if (await OBR.player.getRole() === "GM") {
      const migrationEpoch = currentSceneEpoch();
      const items = await OBR.scene.items.getItems();
      const legacyHPByItemId = new Map();
      for (const item of items) {
        if (!isLegacyActorMigrationEligible(item)) continue;
        const legacyHP = await readLegacyHPMemoryForItem(item, migrationEpoch);
        if (legacyHP) legacyHPByItemId.set(item.id, legacyHP);
      }
      const migration = await migrateInitiativeCardActorIdentities(items, {
        isCurrent: () => isCurrentSceneEpoch(migrationEpoch),
      });
      if (isCurrentSceneEpoch(migrationEpoch)) {
        const existingVitals = await actorVitalsStore.read();
        for (const link of migration.links || []) {
          if (!isCurrentSceneEpoch(migrationEpoch)) break;
          const legacyHP = legacyHPByItemId.get(link.itemId);
          if (!legacyHP || isValidActorVitalsRecord(
            actorVitalsRecordFor(existingVitals, link.actorProfileId),
          )) continue;
          await saveActorCanonicalHP(
            link.actorProfileId,
            legacyHP.hp,
            legacyHP.hpMax,
            { sceneEpoch: migrationEpoch, force: true },
          );
        }
      }
    }
  } catch (error) {
    console.warn("[initiative-card] actor identity migration:", error?.message || error);
  }
  await startActorVitalsRuntime().catch((error) => {
    console.warn("[actorVitals] runtime bootstrap:", error?.message || error);
  });
}

const optionalRuntimes = [
  [selectMapEffectLabelsEnabled, createOptionalRuntimeLifecycle({
    name: "map-effect-labels",
    mount: mountEffectsReconciler,
    unmount: unmountEffectsReconciler,
    cleanupOwnedOutputs: cleanupOwnedEffectsLabels,
    reconcileFull: reconcileAllEffectsLabels,
  })],
  [selectClocksToolEnabled, createOptionalRuntimeLifecycle({
    name: "clocks-tool",
    mount: mountClocksTool,
    unmount: unmountClocksTool,
    cleanupOwnedOutputs: cleanupClocksTool,
    reconcileFull: reconcileClocksTool,
  })],
  [selectDistance3dToolEnabled, createOptionalRuntimeLifecycle({
    name: "distance-3d-tool",
    mount: mountDistance3dTool,
    unmount: unmountDistance3dTool,
    cleanupOwnedOutputs: cleanupDistance3dTool,
    reconcileFull: reconcileDistance3dTool,
  })],
  [selectReferenceToolEnabled, createOptionalRuntimeLifecycle({
    name: "reference-tool",
    mount: mountReferenceTool,
    unmount: unmountReferenceTool,
    cleanupOwnedOutputs: cleanupReferenceTool,
    reconcileFull: reconcileReferenceTool,
  })],
  [selectEmbersAnimationsEnabled, createOptionalRuntimeLifecycle({
    name: "embers-animations",
    mount: mountEmbersVisualRenderers,
    unmount: unmountEmbersVisualRenderers,
  })],
];

OBR.onReady(() => {
  void startRuntimeOptions().catch(() => {});
  mountCombatLogEventSink();
  mountTurnNoticeHost();
  void bootstrapActorVitalsRuntime();
  void mountEffectsMutationCoordinatorService().then(async () => {
    await Promise.all(optionalRuntimes.map(([selector, lifecycle]) => (
      bindOptionalRuntimeOption({
        service: runtimeOptionsService,
        selector,
        lifecycle,
      }).ready
    )));
    void mountSpellAuraController();
    void mountClassFeatureAuraController();
    void mountCustomAuraController();
    void mountStaticSpellZoneController();
    void mountEffectSaveReminderController();
    void mountClassFeatureReminderController();
    void mountPreparedSpellResolutionController();
    void mountCallLightningTurnPromptController();
  }).catch((error) => {
    console.warn("[background] bootstrap:", error?.message || error);
  });
});

import OBR from "@owlbear-rodeo/sdk";
import { mountEffectsReconciler } from "./effectsReconciler.js";
import { mountSpellAuraController } from "./spellAuraController.js";
import { mountStaticSpellZoneController } from "./spellStaticZone.js";
import { mountEffectSaveReminderController } from "./effectSaveReminderController.js";
import { mountPreparedSpellResolutionController } from "./preparedSpellResolutionController.js";
import "./sync-open.js";
import "./speedMoveTool.js";
import "./clocksTool.js";
import "./distance3dTool.js";
import "./referenceTool.js";
import "./aoeTargetTool.js";

OBR.onReady(() => {
  void mountEffectsReconciler();
  void mountSpellAuraController();
  void mountStaticSpellZoneController();
  void mountEffectSaveReminderController();
  void mountPreparedSpellResolutionController();
});

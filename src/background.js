import OBR from "@owlbear-rodeo/sdk";
import { mountEffectsReconciler } from "./effectsReconciler.js";
import "./sync-open.js";
import "./speedMoveTool.js";
import "./clocksTool.js";
import "./distance3dTool.js";
import "./referenceTool.js";
import "./aoeTargetTool.js";

OBR.onReady(() => {
  void mountEffectsReconciler();
});

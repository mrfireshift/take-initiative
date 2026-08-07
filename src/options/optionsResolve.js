import { OPTIONS_SCHEMA_VERSION, SCENE_OVERRIDE_PATHS } from "./optionsDefaults.js";
import {
  cloneOptionsValue,
  normalizeLocalOptions,
  normalizeRoomOptions,
  normalizeSceneOptions,
} from "./optionsNormalize.js";

function setPath(target, path, value) {
  const parts = String(path).split(".");
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = cloneOptionsValue(value);
}

export function resolveOptions({ local, room, scene, legacyLocal } = {}) {
  const normalizedLocal = normalizeLocalOptions(local, { legacy: legacyLocal });
  const normalizedRoom = normalizeRoomOptions(room);
  const normalizedScene = normalizeSceneOptions(scene);
  const shared = cloneOptionsValue(normalizedRoom);
  const overriddenPaths = [];

  for (const path of SCENE_OVERRIDE_PATHS) {
    const entry = normalizedScene.overrides[path];
    if (entry?.mode !== "override") continue;
    setPath(shared, path, entry.value);
    overriddenPaths.push(path);
  }

  return {
    version: OPTIONS_SCHEMA_VERSION,
    local: normalizedLocal,
    shared,
    source: {
      roomVersion: normalizedRoom.version,
      sceneVersion: normalizedScene.version,
      overriddenPaths,
      room: cloneOptionsValue(normalizedRoom),
      scene: cloneOptionsValue(normalizedScene),
    },
  };
}

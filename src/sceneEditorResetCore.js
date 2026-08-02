export function cancelSceneEditorsWithoutCommit(editors = [], options = {}) {
  const cancellations = [];
  for (const editor of editors || []) {
    if (typeof editor?.__cancelFn !== "function") continue;
    try {
      cancellations.push(Promise.resolve(editor.__cancelFn({
        deferRender: true,
        sceneEpochBoundary: true,
        ...options,
      })).catch(() => {}));
    } catch {}
  }
  return Promise.all(cancellations);
}

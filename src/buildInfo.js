const fallbackBuildInfo = Object.freeze({
  schemaVersion: 1,
  version: "0.0.0-development",
  commit: "unknown",
  shortCommit: "unknown",
  dirty: true,
  sourceDateEpoch: 0,
  builtAt: new Date(0).toISOString(),
});

export const BUILD_INFO = Object.freeze(
  typeof __TAKE_INITIATIVE_BUILD_INFO__ === "object"
    ? { ...__TAKE_INITIATIVE_BUILD_INFO__ }
    : fallbackBuildInfo
);

if (typeof globalThis === "object") {
  globalThis.__tbpBuildInfo = BUILD_INFO;
}

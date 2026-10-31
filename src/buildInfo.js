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

// Lot U11 (UX-18): the version line in Opzioni → Manutenzione. builtAt is the commit's date (reproducible builds), so
// the line says so; a build with uncommitted changes says that too.
export function buildInfoLabel(info = BUILD_INFO) {
  const version = String(info?.version || "").trim() || "sconosciuta";
  const parts = [`Versione ${version}`];
  const epoch = Number(info?.sourceDateEpoch) || 0;
  if (epoch > 0) {
    const date = new Date(epoch * 1000);
    const pad = (value) => String(value).padStart(2, "0");
    parts.push(`commit del ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`);
  }
  const commit = String(info?.shortCommit || "").trim();
  if (commit && commit !== "unknown") parts.push(commit.slice(0, 8));
  if (info?.dirty) parts.push("con modifiche locali");
  return parts.join(" · ");
}

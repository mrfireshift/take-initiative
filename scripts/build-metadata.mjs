import { execFileSync } from "node:child_process";

function normalizedCommit(value) {
  const commit = String(value || "").trim();
  return /^[0-9a-f]{7,64}$/i.test(commit) ? commit.toLowerCase() : "unknown";
}

function normalizedEpoch(value) {
  const epoch = Math.floor(Number(value));
  return Number.isFinite(epoch) && epoch >= 0 ? epoch : 0;
}

function booleanEnvironment(value) {
  if (value === undefined) return null;
  return ["1", "true", "yes"].includes(String(value).trim().toLowerCase());
}

export function gitOutput(args, { cwd = process.cwd() } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function createBuildMetadata({
  version,
  env = process.env,
  cwd = process.cwd(),
  runGit = (args) => gitOutput(args, { cwd }),
} = {}) {
  const commit = normalizedCommit(
    env.TAKE_INITIATIVE_BUILD_SHA || runGit(["rev-parse", "HEAD"])
  );
  const dirtyOverride = booleanEnvironment(env.TAKE_INITIATIVE_BUILD_DIRTY);
  const dirty = dirtyOverride ?? Boolean(runGit(["status", "--porcelain"]));
  const sourceDateEpoch = normalizedEpoch(
    env.SOURCE_DATE_EPOCH ||
      runGit(["show", "-s", "--format=%ct", commit === "unknown" ? "HEAD" : commit])
  );

  return Object.freeze({
    schemaVersion: 1,
    version: String(version || "0.0.0-unknown"),
    commit,
    shortCommit: commit === "unknown" ? commit : commit.slice(0, 12),
    dirty,
    sourceDateEpoch,
    builtAt: new Date(sourceDateEpoch * 1000).toISOString(),
  });
}

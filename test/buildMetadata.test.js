import test from "node:test";
import assert from "node:assert/strict";
import { createBuildMetadata } from "../scripts/build-metadata.mjs";

test("build metadata usa commit e timestamp Git come identita deterministica", () => {
  const responses = new Map([
    ["rev-parse HEAD", "ABCDEF1234567890"],
    ["status --porcelain", ""],
    ["show -s --format=%ct abcdef1234567890", "1720000000"],
  ]);
  const metadata = createBuildMetadata({
    version: "1.3.0-dev.0",
    env: {},
    runGit: (args) => responses.get(args.join(" ")) || "",
  });

  assert.deepEqual(metadata, {
    schemaVersion: 1,
    version: "1.3.0-dev.0",
    commit: "abcdef1234567890",
    shortCommit: "abcdef123456",
    dirty: false,
    sourceDateEpoch: 1720000000,
    builtAt: "2024-07-03T09:46:40.000Z",
  });
});

test("build metadata accetta override CI e segnala una build dirty", () => {
  const metadata = createBuildMetadata({
    version: "1.3.0-dev.0",
    env: {
      TAKE_INITIATIVE_BUILD_SHA: "1234567890abcdef",
      TAKE_INITIATIVE_BUILD_DIRTY: "true",
      SOURCE_DATE_EPOCH: "1800000000",
    },
    runGit: () => {
      throw new Error("Git non deve essere interrogato quando gli override sono completi");
    },
  });

  assert.equal(metadata.commit, "1234567890abcdef");
  assert.equal(metadata.shortCommit, "1234567890ab");
  assert.equal(metadata.dirty, true);
  assert.equal(metadata.sourceDateEpoch, 1800000000);
});

// ARCH-009 step 6: which test files run with the History and the recovery journal in IndexedDB
// (test-support/localHistoryStorageMode.js).

// Run inside `npm test`: History, Undo and recovery end to end, through the public APIs.
export const LOCAL_STORE_INTEGRATION_SUITES = Object.freeze([
  "historyLocalStore.test.js",
  "effectsRecoveryLocalStore.test.js",
  "historyOwnerCore.test.js",
  "historyOwnerLifecycle.test.js",
  "bossActionExecutionIntegration.test.js",
  "bossActionGroupIntegration.test.js",
  "pcAttackExecutionIntegration.test.js",
  "reminderResolutionBrokerReplay.test.js",
  "concentrationWarningUndoIntegration.test.js",
  "actorVitalsHistoryUndoIntegration.test.js",
  "historyUndoFailureInjection.test.js",
  "spellBoardTokenUndoIntegration.test.js",
  "classFeatureUndoIntegration.test.js",
  "p0HpHistoryAuthority.test.js",
  "deathSavesIntegration.test.js",
  "hpConcentrationHistoryPending.test.js",
]);

// Left out of `npm run test:local-store`, with the reason. They are not storage defects: these files read or write the
// History or the journal straight in the fake scene metadata, or depend on a localStorage shared by their tests.
export const SCENE_ONLY_SUITES = Object.freeze({
  "arch05aPostCommitRecoveryDiagnostic.test.js": "simulates crashes by reading and writing the journal in the scene key",
  "historyOwnerWithItemMetaHistory.test.js": "asserts on the History entries in the scene key",
  "historyMovementUndoIntegration.test.js": "edits a History entry in the scene key to make it legacy",
  "historyCorrectivePassContract.test.js": "replays a retry from the History value read in the scene key",
  "pcAttackPopover.test.js": "the console remembers its last entry in localStorage, shared by the file's tests",
  "initiativeCardSaveTransportRegression.test.js": "a registry test reads the local card copy left by an earlier test",
  "localHistoryStorageIntegration.test.js": "runs the integration suites itself",
});

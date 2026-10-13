# Boss Action Profile tranche 1 — Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development for independent parser/storage and UI tasks, with root integration and review. Test first; leave the patch uncommitted for review.

**Goal:** import the two real HTML stat blocks, bind local definitions to Actor Profiles, execute Icekiss, Blizzard Strike and catalog Slow with existing History/Undo and Combat Log v3.

**Architecture:** full versioned definitions live locally; Actor Profiles hold compact references; token metadata holds a distinct boss instance/runtime state. Runtime consumes validated structured definitions, never HTML or prose. HP remains canonical token metadata.

**Tech Stack:** JavaScript/Vite multipage app, Owlbear SDK, Node test runner, localStorage. No IndexedDB migration.

**Spec:** user-approved audit and IMPLEMENTATION TRANCHE 1 in this conversation; real HTML fixtures under test/fixtures/boss-actions.

## Global Constraints

- No second combat engine, History/Undo, Combat Log or spell mechanics.
- No shared manifestations, phase transition, passive listeners, forced movement, special recharge or sequencing.
- No full definition/raw HTML in Room initiative-card registry.
- Preserve names, metadata keys, canonical HP, tracker render guards and Epic slots.
- All resolution decisions precede one coordinated mutation.

## Review Focus

- Virtual Epic/current-turn IDs never become the action actor.
- Changed scene/binding or concurrent HP invalidates the pending resolution.
- Duplicate tokens share definitions but get distinct runtime instance identities.
- Unsupported/imported hostile prose cannot obtain execution mechanics.
- Export/import never truncates raw source or typed damage components.

## Task 1 — inert parser and definition storage

Files: src/bossActionProfileCore.js, src/bossActionProfileStore.js, test/bossActionProfile*.test.js, test/fixtures/boss-actions/*.html.
Interfaces: importBossActionHTML(html,{sourceName}) async; validateBossActionProfile(profile); createBossActionProfileStore({storage}) with put/get/list/exportProfile/importProfile; sanitizeBossActionBinding(value).
- [ ] Test both fixture counts (21/15), source hash/raw preservation, exact three descriptor grammars, unknown safety, malformed/hostile markup, version/schema rejection, lossless export and compact binding.
- [ ] Run tests red; implement strict structured validation and local versioned storage; run green.

## Task 2 — coordinated execution and binding

Files: src/bossActionExecutionCore.js, src/bossActionExecution.js, src/initiativeCards.js; test/bossActionExecution*.test.js.
Interfaces: getBossActionPresentation(sourceId); bindBossActionProfile(tokenId,profile); unbindBossActionProfile(tokenId); executeBossAction(request); launchBossActionSpell({sourceId,actionId}).
- [ ] Test Icekiss melee/ranged/miss, independent components, Blizzard fail/full and success/shared half rounding, manual remainder/no movement, real actor provenance, stale preconditions, one production History entry and complete Undo, rename/duplicate/reload/bind/unbind.
- [ ] Run red; reuse calculateQuickHPChange, scaledQuickHPAmount and runEffectsMutation hp:set plus compact runtime patch; run green.

## Task 3 — catalog Slow provenance

Files: src/monsterActionContextCore.js; narrow additions to spellUnifiedPanelRoutingCore, spellUnifiedAreaAdapter, spellAreaResolutionCommandCore, spellAreaResolutionExecutor, combatLogV3Core.
Interface: createMonsterActionContext, normalizeMonsterActionContext, applyMonsterActionContext; optional monsterActionContext carried through existing route/session/command.
- [ ] Test route to History/log identity, inherited spell DC, invalid/virtual caster rejection, same catalog Slow and ordinary spell regression.
- [ ] Run red; add optional validated context without changing spell mechanics or Undo boundaries; run green.

## Task 4 — thin UI and real-token launchers

Files: boss-actions.html, src/boss-actions.js, src/bossActionsViewCore.js, test/bossActionsViewCore.test.js; minimal launcher edits in contextMenu.js, initiativeList.js and vite.config.js.
- [ ] Test partial/manual rendering, unsupported safety, target/outcome validation and whole resolution draft before commit.
- [ ] Run red; add import/bind/unbind/export and categorized buttons. Slow opens existing unified panel. No mechanics in view; no profile in Quick Actions.
- [ ] Run green and inspect integration diff for render/metadata behavior.

## Task 5 — review and verification

- [ ] Run targeted boss/parser/Slow/log/History tests.
- [ ] Run full npm test, then npm run build.
- [ ] Review HP/condition consequences, source identity, retention, export integrity and omitted mechanics; record exact results.

# AGENTS.md

## Project context

This project is an Owlbear Rodeo initiative tracker extension.

The plugin tracks initiative, HP, active turn state, conditions, spells, boss mechanics, tracker cards, map HP bars, and turn labels.

The project is already functional. Do not rewrite the architecture unless explicitly requested.

## Core rules

Preserve existing behavior.

Prefer small, reviewable patches.

Do not perform broad refactors while fixing bugs.

Do not rename existing functions, constants, metadata keys, or files unless explicitly requested.

Do not simplify active-turn logic, render queues, stale-state guards, or metadata reconciliation unless the task specifically targets those systems.

Do not replace metadata objects wholesale. Always merge existing metadata.

## Metadata

The token metadata key is:

`com.thebigpicture.initiative/meta`

The scene tracker state key is:

`com.thebigpicture.initiative/state`

These keys must not be changed.

Token metadata is the source of truth for creature-specific data such as HP, max HP, initiative, attitude, conditions, spells, and boss-specific values.

Scene metadata is the source of truth for global tracker state such as initiative order and current turn.

## Fragile areas

`src/initiativeList.js` is a large state/UI/effects hub. Treat it as fragile.

Before editing `src/initiativeList.js`, identify the exact function involved and change only the necessary block.

`renderAll()` intentionally guards against destroying active inline editors. Do not bypass those guards.

Active-turn navigation uses queues, revision checks, stale-state filtering, and virtual IDs. Do not assume every ID in `state.order` is a real scene item.

Virtual Lair, Paragon, and Epic IDs may appear in the initiative order.

Map HP bars are scene attachment items. Do not update, delete, or recreate attachment items indiscriminately.

Spell ticking and round-change logic may exist in more than one nearby path. Inspect both paths before changing spell or round behavior.

## HP rules

Canonical HP fields are:

`meta.hp`
`meta.hpMax`

Do not introduce alternative HP fields unless explicitly requested.

Tracker HP bars and map HP bars must derive from the same canonical HP metadata.

Do not store visual bar widths as source data.

Persistent PC fallback memory lives in `src/hpMemory.js`. Do not remove or bypass it casually.

## Working method

For every task:

1. Identify the exact files and functions involved.
2. Explain the intended patch before editing.
3. Modify the smallest possible amount of code.
4. Preserve existing function names.
5. Run the available build command after changes.
6. Report the changed files, what changed, and the build result.

If a requested change could affect HP sync, active turn, initiative order, map HP bars, or metadata loops, stop and explain the risk before editing.

# Boss Actions tranche 2A / 2B and UX pass

User scope: extend the existing vertical slice with Polar Ray and Rock, add visible 1/Round and 1/Phase resources, then improve finding actions and choosing targets. Stop before new advanced mechanics.

- 2A: parser/definition v2, ranged single/dual typed damage, preserve real grammar/raw text and legacy v1 exports; Rock stays PARTIAL with manual Gather prerequisite; Polar printed total21 is independent of derived component averages10+10.
- 2B: pure usage counters in existing bossActionState; canonical scene round; no reset listener. Use existing coordinated metadata patches and History for damage, Slow and explicit manual registration. Missing/malformed round or counters fail closed. Keep usage across same-phase revisions and reset runtime identity for duplicated tokens.
- Slow: validate stored action binding at commit; local catalog mechanics remain canonical; consume only actual resolution, including all-passed saves; same History restores resource/concentration/conditions.
- Shared coordinator: optional scene metadata field precondition and precommit recheck; SDK scene/items remain separate writes, documented limitation.
- UX: executable actions first, manual references/library collapsed, searchable action/target access, selection from map, clear outcomes/components/manual confirmations/resources.
- Verify targeted tests, independent review, full npm test and build. No commit/push/PR, no tranche3 mechanics.

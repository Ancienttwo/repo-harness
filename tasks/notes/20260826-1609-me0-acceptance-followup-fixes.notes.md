# Implementation Notes: me0-acceptance-followup-fixes

> **Status**: Active
> **Plan**: plans/plan-20260826-1609-me0-acceptance-followup-fixes.md
> **Contract**: tasks/contracts/20260826-1609-me0-acceptance-followup-fixes.contract.md
> **Review**: tasks/reviews/20260826-1609-me0-acceptance-followup-fixes.review.md
> **Last Updated**: 2026-08-26 16:09
> **Lifecycle**: notes

## Design Decisions

- Non-domain CLI failures in `src/cli/commands/engineer.ts` emit `invalid_argument`, not the `cli_argument_invalid` code the follow-up brief suggested. `invalid_argument` is the code the repo already uses for CLI argument validation (`src/cli/commands/operator.ts:80`, `src/cli/commands/fleet.ts:72`, `fleet.ts:99`, `fleet.ts:347`); `cli_argument_invalid` and `internal_error` both had zero occurrences before this change. Following the established code keeps one vocabulary for consumers that branch on the `error` field, so only the unknown-exception bucket introduces a new code (`internal_error`).
- `engineer.ts:252` (retire requires non-null expected current/binding IDs) and `engineer.ts:318` (`--sender-kind` closed set) throw `CliArgumentError` alongside the four parsing helpers, even though they are inline checks rather than helper calls. They are argument validation, so leaving them as bare `Error` would have routed them into the new `internal_error` bucket — strictly worse than the `engineer_binding_invalid` they produced before. Converting them keeps the three-way split (domain code / `invalid_argument` / `internal_error`) semantically true for every reachable throw in the file.

## Deviations From Plan Or Spec

- The canonical-bytes swap in `src/effects/engineers/binding-store.ts` is not behavior-neutral as the plan scope line claims, and needed a follow-up correction. `expectedRetired` is assembled across two events — every field except `retired_at` comes from the active binding in `current.json`, while `retired_at` comes from the retire event being replayed. A corrupt store can therefore pair `retired_at < bound_at`, which `validateEngineerBinding` rejects (`src/core/engineers/profile-binding.ts:347`) from inside `canonicalEngineerBindingBytes`. That escaping `EngineerProfileBindingError('engineer_binding_invalid')` masked the `binding_state_corrupt` this path owes its callers; the previous `JSON.stringify` comparison could not throw. The comparison now sits in the same try/catch shape as the sibling parser at `binding-store.ts:203-212`, remapping any non-`binding_state_corrupt` domain error onto `fail('binding_state_corrupt', ..., error)`. `tests/unit/engineer-binding-store.test.ts:216` pins it with a forged retire event; reverting the try/catch makes that test report `engineer_binding_invalid`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

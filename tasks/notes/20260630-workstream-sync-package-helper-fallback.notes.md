# Workstream Sync Package Helper Fallback Notes

> **Date**: 2026-06-30
> **Scope**: `scripts/workstream-sync.sh`,
> `assets/templates/helpers/workstream-sync.sh`

## Problem

`repo-harness run workstream-sync ensure` failed in repos that had adopted the
package helper runtime and no longer carried repo-local
`scripts/capability-resolver.ts`.

The helper still required the repo-local resolver even though the package runtime
already ships `capability-resolver.ts` as a sibling helper and sets
`REPO_HARNESS_HELPER_SOURCE_PATH` for bundled helper execution.

## Decision

Keep direct repo-local execution working, but add package-runtime sibling
fallbacks:

- `capability_resolver` first uses `scripts/capability-resolver.ts` when present,
  then falls back to the bundled sibling helper.
- `context_contract_sync` first uses `scripts/context-contract-sync.sh` when
  present, then falls back to the bundled sibling helper.

This preserves package-runtime adoption without reintroducing retired downstream
helper wrappers.

## Verification

- `bun test tests/cli/run.test.ts`

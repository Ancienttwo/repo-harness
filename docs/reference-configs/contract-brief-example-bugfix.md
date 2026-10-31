# Bugfix Issue and PR Brief Example

This example shows the issue and PR text for a bugfix. It replaces the retired
bugfix-contract example. The GitHub issue and PR own task state; no contract,
plan or review file is needed.

## Issue

### Goal

Make `isNonEmptyLabel("")` return `false`.

### Root Cause

`tests/fixtures/root-cause/regression-guard.test.ts:11` calls a function that
always returned `true`. It never checks `label.length`, so an empty label was
treated as non-empty.

### Reproduction

`bun test tests/fixtures/root-cause/regression-guard.test.ts` fails on the
unfixed code: `expect(isNonEmptyLabel("")).toBe(false)` receives `true`.

### Scope

- Fix `isNonEmptyLabel`.
- Keep the regression guard.
- Out of scope: whitespace-only labels and other label callers.

### Acceptance

- The reproduction command passes after the fix.
- `bun run check:type` passes.
- No other caller behavior changes.

## Pull Request

### Goal

Fix the empty-label decision and keep the regression guard.

### Changes

- Return `false` when the label length is zero.
- Keep the regression test that fails before the fix.

### Verification

- `bun test tests/fixtures/root-cause/regression-guard.test.ts`: pass.
- `bun run check:type`: pass.

### Risk and Rollback

Risk: a caller that relies on empty labels being non-empty would change behavior.
No such caller exists in the repository. Rollback: revert the single commit.

# Implementation Notes: mcp-allowed-root-canonicalization

> **Status**: Active
> **Plan**: plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md
> **Contract**: tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md
> **Review**: tasks/reviews/20260730-2346-mcp-allowed-root-canonicalization.review.md
> **Last Updated**: 2026-07-31 00:20
> **Lifecycle**: notes

## Design Decisions

- Moved the "strip a platform realpath canonicalization prefix" step out of
  the per-index matcher loop in `partsContainDeniedRoot` and into a single
  pre-processing pass (`stripPlatformCanonicalizationPrefix`), applied once
  per candidate path when `sensitiveAllowedRootReason` builds
  `candidateParts`. The carve-out now recognizes both `/private/var` and
  `/private/tmp` as the same class of macOS `realpathSync` artifact,
  replacing the single hardcoded `index === 0 && parts[1] === 'var'` special
  case that only covered `/private/var`.
- Rationale: `workspaces.ts:215` calls `realpathSync` on every configured
  allowed root. On macOS, `/tmp` resolves to `/private/tmp` — the same class
  of canonicalization artifact as `/var` resolving to `/private/var`, which
  the matcher already exempted. The old special case lived inside the
  per-index matcher loop and only fired for the one-segment `private/**`
  glob at `index === 0` when `parts[1] === 'var'`; `/tmp` roots hit the
  ordinary `deniedParts.every(...)` match one line below and got denied as
  if `/private` were a user-owned sensitive directory — a category error,
  since `private/**` exists to deny repo-relative paths like
  `<repo>/private/...`, not the OS's own temp-directory realpath prefix.
  Stripping the prefix once, before any glob is matched, fixes the actual
  category error instead of teaching the matcher a second magic
  index/segment combination to skip.
- The strip only fires when `parts[0] === 'private' && (parts[1] === 'var'
  || parts[1] === 'tmp')`; a real user path like `/Users/x/private/tmp/y`
  does not start with `private`, so it is untouched. A real `private`
  segment that survives *after* the two-segment prefix is stripped (e.g.
  `/private/tmp/work/private/repo`) still matches `private/**` normally,
  since the strip removes exactly the leading `private/var` or
  `private/tmp` pair and nothing else — this is the contract Falsifier's
  cheapest proof point (case 7 below).

## Deviations From Plan Or Spec

- None recorded. Implementation follows the plan's fix surface
  (`partsContainDeniedRoot` + `sensitiveAllowedRootReason` in
  `src/cli/mcp/policy.ts`) and guard text exactly.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add a second hardcoded special case (`parts[1] === 'tmp'`) next to the existing `parts[1] === 'var'` check inside the matcher loop | Rejected | Perpetuates the category error per-glob-per-index instead of fixing it once; a third canonicalization prefix would need a third special case |
| Strip the canonicalization prefix once when building `candidateParts` in `sensitiveAllowedRootReason`, before any glob loop runs | Chosen | Matches the plan's fix surface exactly, removes the special case from `partsContainDeniedRoot` entirely, and generalizes to any future `/private/*` realpath prefix without new matcher branches |

## Open Questions

- None.

## 7-Case Comparison (plan table, verified against fixed `policy.ts`)

Verified with an ad-hoc script calling `sensitiveAllowedRootReason` directly
for all 7 cases from the plan (script was not committed — scratch
verification only). All 7 match the plan's expected column:

| Input | Expected | Actual (post-fix) | Result |
|---|---|---|---|
| `/private/tmp/...` | allow | `undefined` | PASS |
| `/private/var/folders/...` | allow | `undefined` | PASS |
| `/var/folders/...` | allow | `undefined` | PASS |
| `/Users/example/private/repo` | deny (`private/**`) | `private/**` | PASS |
| `/Users/example/secrets/repo` | deny (`secrets/**`) | `secrets/**` | PASS |
| `.../node_modules/pkg` | deny (`node_modules/**`) | `node_modules/**` | PASS |
| `/private/tmp/work/private/repo` | deny (`private/**`, real segment survives prefix strip) | `private/**` | PASS |

## Non-Obvious Observation (out of scope, not fixed here)

A full-suite `bun test` run in this worktree hit the pre-existing flake
already tracked in `tasks/todos.md` ("Helper-scripts full-suite flake:
`tests/helper-scripts.test.ts:5267`"), unrelated to `policy.ts` or MCP code.
It reproduced even with `REPO_HARNESS_SOURCE_ROOT` unset in this shell,
which is new information against that row's "strongest signal" theory (which
previously only had evidence tying the flake to that env var being
exported). Not corrected here — outside this contract's Allowed Paths and
unrelated to the canonicalization root cause — but worth flagging for
whoever picks up that row next: the trigger surface may be broader than the
env-var theory alone.

## Evidence Links

- Pre-fix RED artifact: `tasks/notes/20260730-mcp-allowed-root-canonicalization.pre-fix.log` (`PRE_FIX_EXIT=1`, 2 fail / 1 pass)
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

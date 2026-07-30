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

## Non-Obvious Observation (superseded — now corrected in this package)

> Superseded by "Co-Packaged Correction: bootstrap resume/current write
> order" below. The observation that the flake reproduced without
> `REPO_HARNESS_SOURCE_ROOT` was the right lead; the env-var theory was
> wrong. Kept for the reasoning trail.

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

## Co-Packaged Correction: bootstrap resume/current write order

The `tests/helper-scripts.test.ts:5267` flake quoted above turned out not to
be a test-isolation problem. It is a production bootstrap ordering defect,
corrected in this package.

### Why it landed here instead of its own package

Circular gate dependency. This contract's exit criteria bind full `bun test`,
which the ordering defect fails under load. A standalone package opened from
`main` would pin `TMPDIR=/tmp` in its own gate runner and then be blocked by
the `policy.ts` canonicalization fix that has not reached `main` yet. Each
change is the other's verification precondition, so they share one
verification boundary and one package.

### Attribution: production, not fixture

The fixture never writes either file. Both are written by the production
helper:

- `scripts/ensure-task-workflow.sh` `ensure_auxiliary_files` created
  `.ai/harness/handoff/resume.md`, called before
  `ensure_current_status_snapshot`, which runs
  `refresh-current-status.sh --clear --write` and rewrites `tasks/current.md`.
- Measured gap between the two writes: ~86 ms
  (`resume=…803.508949692`, `current=…803.605257171`).
- `scripts/check-task-workflow.sh:629-640` (`check_current_resume_freshness`,
  call site `:1204`) compares whole-second mtimes via `file_mtime`
  (`stat -f '%m'`), with no tolerance and no gating.

So any bootstrap whose two writes straddle a second boundary leaves the repo
failing its own `check-task-workflow.sh --strict`. Both ends are public
runner commands (`assets/workflow-contract.v1.json:176`;
`src/cli/hook/prompt-handler.ts:693` emits `run ensure-task-workflow` to
users), so real users hit this, not just the suite.

Natural reproduction, production script only, no test code, idle machine:

```
iter 11 ok (delta=.083825424s)
iter 12 INVERTED (resume=1785439846 current=1785439847 delta=.086893719s)
IDLE inversions: 1 / 12
```

Deterministic causal probe in a workspace built only from packaged helpers:

```
=== baseline (no forced skew) ===
1785439899 tasks/current.md
1785439899 .ai/harness/handoff/resume.md
EXIT=0

=== forced: current.md +1s ===
1785439900 tasks/current.md
1785439899 .ai/harness/handoff/resume.md
EXIT=1
[workflow] Resume packet is older than current status snapshot: .ai/harness/handoff/resume.md < tasks/current.md. Run repo-harness run prepare-handoff --reason <reason> or repo-harness run codex-handoff-resume.
```

### The fix and why this shape

Extracted the resume-packet creation out of `ensure_auxiliary_files` into its
own `ensure_resume_packet`, invoked after `ensure_current_status_snapshot`.
That makes the resume packet the last of the three handoff-related writes, so
both freshness invariants (`resume >= .ai/harness/handoff/current.md` and
`resume >= tasks/current.md`) hold by construction.

Rejected alternatives:

- Reordering the top-level `ensure_auxiliary_files` /
  `ensure_current_status_snapshot` calls: broader blast radius, since
  `refresh-current-status.sh` reads artifacts that `ensure_auxiliary_files`
  scaffolds.
- Adding a tolerance to `check-task-workflow.sh`: the consumer's comparison
  is correct. Bootstrap was producing a genuinely stale packet; widening the
  check would hide real staleness. The consumer is unchanged.

Post-fix, the ordering is one-directional rather than luck-dependent: resume
now lands ~5 ms *after* current, and 0/12 inversions.

### `tests/helper-scripts.test.ts:5267` deliberately left untouched

It does not pin mtimes, and that is exactly why it caught this. It is a live
guard on the bootstrap ordering invariant. Pinning it with `utimesSync` would
have turned it green while leaving the production defect in place for users.
Sibling scan of the same file (26 `check-task-workflow.sh` call sites, 3
expecting exit 0):

| Site | mtime handling | Exposed |
|---|---|---|
| `tests/helper-scripts.test.ts:5204` | rewrites `resume.md` after `ensure` (`:5198-5201`), so resume is newer | no |
| `tests/helper-scripts.test.ts:5267` | none — relies on bootstrap ordering | yes, this failure |
| `tests/helper-scripts.test.ts:5353` | explicit `touch -t` pin at `:5340-5346` | no |

The negative case at `:5157-5177` also pins with `touch -t`. The pinning
pattern already existed; `:5267` is the one site that exercises the real
ordering, and it stays that way.

### todos row retired

The `tasks/todos.md` "Helper-scripts full-suite flake" row is removed: its
subject is fixed here. Its recorded hypothesis (a `REPO_HARNESS_SOURCE_ROOT`
env leak changing helper resolution in test subprocesses) was wrong — the
env var only correlated because gate runs are slower, which widens the
window for the two writes to straddle a second boundary.

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

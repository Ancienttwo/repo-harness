> **Archived**: 2026-08-20 12:19
> **Related Plan**: plans/archive/plan-20260820-0515-archctx-node-resilience.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1219

# Implementation Notes: archctx-node-resilience

> **Status**: Active
> **Plan**: plans/plan-20260820-0515-archctx-node-resilience.md
> **Contract**: tasks/contracts/20260820-0515-archctx-node-resilience.contract.md
> **Review**: tasks/reviews/20260820-0515-archctx-node-resilience.review.md
> **Last Updated**: 2026-08-20 05:15
> **Lifecycle**: notes

## Design Decisions

- Shared module lives at `src/effects/runtime/node-candidates.ts`. `scripts/check-state-boundaries.ts`
  enforces two directions: pure core (`src/core/state|workflow|capabilities`) may not import
  `src/cli` or `src/effects` (`CORE_REVERSE_IMPORT`), and `src/effects/**` may not import
  `src/cli` (`checkEffectDependencies` / `EFFECTS_REVERSE_IMPORT`). `src/cli` importing
  `src/effects` is legal and already practiced (`helper-runner.ts` imports
  `../../effects/process-runner`). So the only legal shared home for a module consumed by both
  `src/cli/runtime/helper-runner.ts` and `src/effects/architecture/archctx-provider.ts` is under
  `src/effects/`. The module declares no name in `CANONICAL_SYMBOL_OWNERS` and does not match
  `CLI_AUTHORITY_NAME`, so no owner entry or suppression was needed. Evidence:
  `bun scripts/check-state-boundaries.ts` -> `[state-boundaries] OK: 168 TypeScript files checked`.
- Only the *candidate enumeration* moved. Version filtering stays with each caller because the two
  execute candidates under different process authorities: `helper-runner` uses the bounded
  `runProcess` with a protected PATH and `inheritEnv: false`; the provider uses `spawnSync` with the
  caller's env, matching its existing PATH tier. Sharing the enumeration is the single source of
  truth the ledger row asked for; sharing the execution would have merged two different trust
  boundaries.
- `trustedNodeCandidates(home)` takes the home directory as a parameter instead of reading
  `userInfo().homedir` internally. `helper-runner` passes `userInfo().homedir` (byte-identical
  behavior, its existing tests are the guard); the parameter is what makes a fixture nvm layout
  testable at all, since `userInfo()` reads the OS passwd entry and cannot be redirected by env.
- The provider takes an optional `trustedCandidateSource` (second parameter, plus
  `ArchctxProviderOptions.trustedNodeCandidateSource`), defaulting to the real scan. This matches
  the file's existing `RunArchctxProcess` injection seam and is the only way to write a
  deterministic fail-closed test: this machine has `/opt/homebrew/bin/node` and
  `/usr/local/bin/node` present, so an "exhausted" case cannot be produced by fixture paths alone.

## Deviations From Plan Or Spec

- The pre-existing test `fails closed when PATH has no Node runtime compatible with archctx`
  (`tests/architecture-projection-provider.test.ts`) asserted the exact semantics this contract
  changes, so it was rewritten rather than kept: it now scopes the trusted tier to an empty source
  and additionally asserts the extended error message. This is the intended semantic change, not a
  regression.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Move the whole `trustedNodeRuntime()` (scan + version check + exec) into the shared module | Rejected | The two callers execute candidates under different process authorities (bounded protected-env runner vs. caller-env `spawnSync`); merging them would move a trust boundary that no one asked to move |
| Derive the provider's home from `env.HOME` instead of an injected candidate source | Rejected | Would add a second env-derived semantic to a function whose env contract is already explicit, and still could not make the fail-closed case deterministic (fixed system paths are not under `$HOME`) |
| Reorder candidates so nvm precedes `/usr/local/bin` and `/opt/homebrew/bin` | Rejected | T1 requires byte-identical helper-runner behavior; ordering is part of that behavior |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Sandbox self-proof (the configuration failing since 0.15.3), reproducing the bounded verifier's
  scrubbed + protected shape (`REPO_HARNESS_*` stripped whole, PATH carrying no compatible node):
  `env -i HOME=$HOME USER=$USER LOGNAME=$USER TMPDIR=/tmp LANG=en_US.UTF-8
  PATH=/Users/ancienttwo/.bun/bin:/usr/bin:/bin:/usr/sbin:/sbin bash scripts/check-architecture-sync.sh`
  - pre-fix provider (`d1914de4`): exit 1, `[ArchitectureProjection] ... state=error ... blocking=1`
  - post-fix provider (`5d9c7faa`): exit 0, `[ArchitectureProjection] ... state=ready ... blocking=0`
  - out-of-sandbox control: exit 0
- Machine node inventory that makes the tier meaningful: `/usr/bin/node` absent,
  `/usr/local/bin/node` v22.16.0 (out of range), `/opt/homebrew/bin/node` v26.5.0 (out of range),
  `~/.nvm/versions/node/v24.18.0` in range. The trusted tier version-filters past the two
  out-of-range system binaries and lands on the nvm runtime.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

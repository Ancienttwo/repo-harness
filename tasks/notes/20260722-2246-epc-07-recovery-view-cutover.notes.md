# Implementation Notes: epc-07-recovery-view-cutover

> **Status**: Active
> **Plan**: plans/plan-20260722-2246-epc-07-recovery-view-cutover.md
> **Contract**: tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md
> **Review**: tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md
> **Last Updated**: 2026-07-23 00:00
> **Lifecycle**: notes

## Design Decisions

- Single materializer split into a pure-ish TS module
  (`src/effects/evidence/recovery-materializer.ts`) consumed directly by
  `stop-handler.ts` (the authoritative, real-time path) and a standalone,
  self-contained `scripts/recovery-view-cli.ts` (mirrored to
  `assets/templates/helpers/recovery-view-cli.ts`) consumed by the three
  retained bash entrypoints. The two implementations are intentionally
  duplicated, not shared via import, because the bash scripts are
  distributed to downstream repos that never receive this package's `src/`
  tree (proven by `tests/helper-scripts.test.ts`'s `copyHelpers()` fixture).
  Both were fixed for the same two behavioral divergences discovered while
  making `tests/helper-scripts.test.ts` pass (legacy-slug artifact-path
  fallback; git-shortstat + "N untracked files" working-tree summary) --
  see Deviations below.
- Checkpoint publish reordered to run before the projection-batch commit in
  `runStopHandler` so the materializer's evidence read reflects the
  freshest checkpoint for the current Stop, not the previous one.
- Resume view's legacy marker (`generated-by: repo-harness
  codex-handoff-resume v1`) preserved verbatim as a stable
  external-observable-contract string for `session-context.ts`'s
  `resumeAvailable()` (EPC-08 surface, not touched). The D8 Provenance block
  is the real, machine-checkable materializer identity going forward.
- `workflow_ensure_harness_surface`'s handoff/resume bootstrap placeholder
  (an undeclared fifth writer, Phase A finding) retired same-package,
  mirroring the EPC-05 precedent already documented in the adjacent code
  comment for `checks/latest.json`'s own retired `{}` bootstrap.
- `scripts/recovery-view-cli.ts` had to be registered in
  `assets/workflow-contract.v1.json`'s `helpers.scripts`/`helpers.descriptions`
  (plus the byte-identical `.ai/harness/workflow-contract.json` copy) after
  discovering `scripts/sync-helper-sources.ts --write` fails closed on any
  unregistered file under `assets/templates/helpers/` -- a manually placed
  mirror is not a valid shortcut. See contract Detailed Design for the full
  two-correction record.

## Deviations From Plan Or Spec

- The plan's first Phase-B draft proposed a `src/cli/commands/` subcommand
  for the three bash scripts to shell into. Corrected during Phase B (before
  any bash script was written) once `tests/helper-scripts.test.ts`'s
  `copyHelpers()` fixture proved the distributed scripts never receive
  `src/`. Replaced with the standalone `scripts/recovery-view-cli.ts`
  design. Recorded with rationale in the contract, not ad hoc.
- Two real, pre-existing behavioral divergences between the bash
  `workflow_write_handoff`/`workflow_active_contract` family and
  `stop-handler.ts`'s own private helpers were discovered while making
  `tests/helper-scripts.test.ts` pass against the unified materializer
  (these existed silently before EPC-07; unifying the two paths onto one
  implementation surfaced them for the first time):
  1. Contract/review/notes artifact-path resolution was missing the
     legacy slug-only fallback (`workflow_preferred_or_legacy_path`)
     bash's resolvers already had. Fixed in both implementations by
     porting `workflow_plan_slug_from_path`/`workflow_plan_artifact_stem_from_path`-equivalent
     logic (the "transient plan slug" title-based rename refinement was
     deliberately not ported -- unexercised by any test, out of the
     EXECUTION_BOUNDARY as an absent requirement).
  2. The handoff "Working tree" summary was a flat "N changed/untracked
     paths" count in `stop-handler.ts`'s TS port, not bash's
     `git diff --shortstat` + "; N untracked files" wording. Fixed in both
     implementations to match bash's exact wording.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Register `recovery-view-cli.ts` as an independently-invocable `repo-harness run` helper vs. keep it purely internal connective tissue | Registered (required, not optional) | `sync-helper-sources.ts --write` fails closed on any unregistered file under `assets/templates/helpers/`; registration was a hard requirement discovered at implementation time, not a design preference |
| Keep the legacy resume marker literal vs. rename to a materializer-specific marker | Keep literal | Preserves `session-context.ts`'s `resumeAvailable()` external contract without touching EPC-08 internals; the D8 Provenance block is the honest machine-checkable identity |
| Drop the now-redundant `prepare-handoff.sh` -> `codex-handoff-resume.sh` double-invocation | Left alone | Harmless (idempotent, same deterministic content both times); removing it is an optimization the Goal does not require |
| Port the "transient plan slug" title-based rename refinement | Not ported | Unexercised by any relevant test; absent requirement under EXECUTION_BOUNDARY |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Phase A inventory + reconciled verdicts: `tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The `sync-helper-sources.ts --write` fail-closed-on-unregistered-file
  behavior is a real, repeat-relevant discovery for any future new
  `scripts/*.ts` helper -- candidate for `tasks/lessons.md` if another task
  independently rediscovers it.
- Promote to `docs/researches/` only when it is durable repo knowledge with
  evidence.
- Promote to harness asset files only after verification across more than
  one task or fixture.

# Transactional Adoption Planner Notes

> **Status**: Done
> **Sprint**: `plans/sprints/20260616-architecture-upgrade-sprint.md`

## Phase 1 Evidence

- Added the adoption operation model under `src/core/adoption/` with stable operation IDs, mode typing, plan summaries, `.gitignore` managed block planning, and JSON/text renderers.
- Added the safe operation applicator subset under `src/effects/` for `mkdir`, `writeFile ifMissing`, and `appendManagedBlock`.
- Wired only `repo-harness adopt --dry-run --json` to the TypeScript planner. Default apply and human-readable dry-run still go through the existing `runInit()` / `scripts/migrate-project-template.sh` compatibility path.
- Added fixture-backed tests and a CLI smoke test in `tests/cli/adoption-plan.test.ts`.

## Verification

```bash
bun test tests/cli/adoption-plan.test.ts
```

Result: pass, 9 tests.

```bash
bun test
```

Result: pass, 763 tests.

```bash
bash scripts/check-ci.sh
```

Result: pass; CI ran install, `bun test --timeout 60000 --max-concurrency 4`,
workflow checks, repository inspection, migration dry-run, and package dry-run.

```bash
bun src/cli/index.ts adopt --repo . --dry-run --json
```

Result: pass; source entrypoint emitted `protocol: 1`, `command: "adopt"`, and
`apply: false` without writing repo files.

## Documentation

- Added `docs/architecture/transactional-adoption-planner.md` covering protocol
  v1, safe operation support, `.gitignore` block handling, compatibility
  invariants, and the next migration path.
- Updated `docs/CHANGELOG.md` under Unreleased.

## Decisions

- The JSON dry-run output redacts operation content and exposes `contentHash` plus a short preview so stdout stays reviewable and does not dump large generated templates.
- Self-host mode records a skipped `runCheck` operation plus warning instead of migrating hooks/helpers in this sprint, preserving the self-host source repo boundary.
- The first `.gitignore` planner step uses a single `repo-harness generated-runtime` managed block and supports replacing the legacy `claude-runtime-temp` block.
- Existing HOME target validation is reused before the new planner path, so
  `adopt --dry-run --json` does not bypass the previous safety guard.

## Environment Caveat

- `which repo-harness` currently resolves to `/Users/kito/.bun/bin/repo-harness`
  at version `0.5.3`, and that global package still emits the previous
  `runInit()` JSON shape. The sprint code is verified through the source
  entrypoint and will become the plain `repo-harness` behavior after the local
  CLI is refreshed from this branch or the package is published.

## Checklist Closeout

- Updated `plans/sprints/20260616-architecture-upgrade-sprint.md` checkboxes to
  reflect the verified sprint implementation, DoD, review checklist, PR test
  checklist, and minimal executable checklist.
- Left section 12, "下一 sprint 预留 backlog", unchecked because those items are
  intentionally deferred migration candidates rather than completed work in
  this sprint.

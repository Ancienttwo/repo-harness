# repo-harness 0.8.4 Release Filing

- Date: 2026-06-30
- Package: `repo-harness@0.8.4`
- Source commit: release tag target `v0.8.4` from base `5ee1bbd`
- Release scope: patch release for package-dispatched `workstream-sync` helper resolution.
- Publish status: ready for `npm publish`; registry publish pending
- Hold reason: none after release gate

## Scope

- Fixed `repo-harness run workstream-sync ensure` so package runtime calls can
  resolve bundled sibling helpers when target repos no longer vendor
  `scripts/capability-resolver.ts` or `scripts/context-contract-sync.sh`.
- Preserved repo-local helper precedence for self-host development checkouts.

## Verification

- Passed: `bun run check:release`
  - `bun test`: 1003 pass, 1 skip, 0 fail, 10522 expect calls
  - `bash scripts/check-deploy-sql-order.sh`: OK
  - `bash scripts/check-architecture-sync.sh`: advisory, blocking=0
  - `bash scripts/check-task-sync.sh`: OK
  - `bash scripts/check-task-workflow.sh --strict`: OK
  - package dry-run: OK
  - `bash scripts/check-tarball-install-smoke.sh`: `repo-harness-0.8.4.tgz`
    installs and packaged CLI bins start
- Pending: `git tag v0.8.4`
- Pending: `npm publish`
- Pending: `bash scripts/check-release-published.sh 0.8.4`

## Skill Eval Evidence

- `full_test_count`: 1003 Bun tests
- `dry_run_ratio`: unavailable; no separate skill-eval benchmark was run in this
  patch release gate
- `grader_pass_rate`: unavailable; no separate skill-eval benchmark was run in
  this patch release gate
- `effectiveness_authority`: release gate authoritative for package readiness;
  skill-eval authority unavailable for this patch

## Readiness Notes

- CodeGraph local install parity is outside this release worktree and remains
  dirty in the primary checkout; this filing covers only the package helper
  fallback patch line.

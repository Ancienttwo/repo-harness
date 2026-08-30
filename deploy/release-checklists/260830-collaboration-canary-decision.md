# Collaboration Canary Release Gate

- Date: 2026-08-30
- Surface: C1-C9 collaborative work exchange and agent succession
- Decision evidence: `docs/researches/20260830-c9-real-multi-agent-canary.md`
- Live command: `bun scripts/c9-collaboration-canary.ts --live`

## Required Evidence

- [x] usefulness rubric and three matched cases frozen before the accepted run
- [x] baseline and treatment repositories, Git common dirs and HOMEs isolated
- [x] three real concurrent read-only Workers per treatment
- [x] provider-authoritative input/cached/output token counts and wall time
- [x] at least one source-signal reuse and handoff adoption in every treatment
- [x] context injections below 1,500 estimated tokens
- [x] tracked source bytes unchanged and writer count never above one
- [x] Task/Lease/Publication/Acceptance digest unchanged in every arm
- [x] C9-A and C9-B pass
- [x] persistent `EngineerSeatV2` decision: NO-GO
- [x] Phase 5 Review marketplace: inactive
- [x] Phase 6 guarded merge: inactive

## Release Checks

- [x] `bun test --timeout 60000` (3,549 pass, 2 skip, 0 fail)
- [x] `bun run check:type`
- [x] `bun run build:operator-web`
- [x] `bash scripts/check-deploy-sql-order.sh`
- [x] `bash scripts/check-architecture-sync.sh`
- [x] `bash scripts/check-task-sync.sh`
- [x] `repo-harness run check-task-workflow --strict`
- [x] `bun scripts/inspect-project-state.ts --repo . --format text`
- [x] `bun src/cli/index.ts init --repo . --dry-run`
- [x] package/tarball protocol-consumer scan passes (`bun run smoke:tarball-install`)

Do not promote persistent same-capability seats, independent review supply, or
unattended merge as part of this release. Reopen only with a new repeated live
matrix that satisfies the frozen gate rather than by reinterpreting this run.

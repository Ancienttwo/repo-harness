# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (archive-workflow)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Persist a transaction manifest on partial `--experimental-ts-apply` failure (record applied + failed ops, or auto reverse-rollback on failure) | 0.6.1 scoped to the success-then-undo recovery path; crash/interrupt recovery is a larger applicator change | Today a mid-apply failure leaves applied ops with backups but no manifest, so the new `adopt rollback` cannot unwind them — only fully-successful applies are recoverable | When `--experimental-ts-apply` graduates toward default (0.7.x parity work) or a real partial-failure recovery need surfaces |
| Stop `restore_backup` rollback from leaving a stray `.bak` in the default `BACKUP_ROOT`; make `check-tarball-install-smoke.sh` resilient to an offline `bun add` (cache `commander`) | LOW-impact polish, no correctness effect | Minor backup litter during restore; the release-gate smoke needs network/cache for one dep | When touching fs-transaction backups again, or wiring the smoke into a fully-offline CI lane |

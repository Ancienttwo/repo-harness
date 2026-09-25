# repo-harness 0.19.3 Release Preparation

- Integration base: `6a0977924c4b9d23f503fe9e67a734b77e1b8f77` (origin/main after PR #451; previously `7afcbc46d0b623442e98a92ca42d093619576e64`, `2c00d4da5d0d769223791791c01ae6b501ab2c5f`).
- Package / skill / template: `0.19.3`; previous published release: `0.19.2`.
- Scope: committed mainline Task observation/reply and persistence work, exact
  interrupted architecture acceptance recovery, and archctx/archctx-contracts
  `0.5.11` dependency integration.
- Authorization: the user approved dependency updates and publication and
  explicitly selected npm Web Auth. Global installation, persistent user
  configuration and shared daemon replacement are separate operations.
- Status: preparation; no 0.19.3 publication or final acceptance is claimed.

## Evidence boundaries

The source recovery gate passed before version integration. That is not the
canonical AcceptanceReceipt for this release candidate. The registry lock,
full release gate, exact-candidate hosted CI, canonical acceptance and published
readback remain pending until their actual evidence is recorded below.

One frozen-candidate `check:release` execution owns source checks, all tests,
real-install/Herdr cases and clean tarball-install smoke. Use file isolation,
four jobs and per-file concurrency one. Its evidence is the contract's
expensive Verification Plan check; avoid independently repeating its component
lanes. Check product/skill/template version consistency separately.

The published 0.19.2 archive contains both `scripts/architecture-queue.sh` and
`assets/templates/helpers/architecture-queue.sh`. A stale user source-root
override can select an incomplete local install instead. The 0.19.3 archive
must prove its own helper contents; publishing does not repair that user config.

## Completion evidence

- Upstream registry packages and exact dependency lock: pass, 0.5.11; downloaded tarballs match tested artifacts and fresh registry installation passes. Bun generated both exact pins and integrity values.
- Product/skill/template version consistency: pass, 0.19.3.
- Canonical full release verification and semantic acceptance: pending.
- Exact-head Required / CI: pending.
- Tag, npm Web Auth publication and `check:release-published`: pending.

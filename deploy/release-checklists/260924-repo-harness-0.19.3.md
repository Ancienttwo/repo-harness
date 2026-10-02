# repo-harness 0.19.3 Release Preparation

- Previous preparation base: `6a0977924c4b9d23f503fe9e67a734b77e1b8f77` (origin/main after PR #451; previously `7afcbc46d0b623442e98a92ca42d093619576e64`, `2c00d4da5d0d769223791791c01ae6b501ab2c5f`).
- Package / skill / template: `0.19.3`; previous published release: `0.19.2`.
- Scope: committed mainline Task observation/reply and persistence work, exact
  interrupted architecture acceptance recovery, and archctx/archctx-contracts
  `0.5.12` dependency integration, projection-profile support and validated Bun
  handoff to the fleet installer.
- Authorization: the user approved dependency updates and publication and
  explicitly selected npm Web Auth. Global installation, persistent user
  configuration and shared daemon replacement are separate operations.
- Current adoption base: `176ec3c87548c4904a95e8c559eb579ca662a408` (#454 merged).
- Owner approved merge, publication and normal downstream adoption on 2026-09-27.
- Status: upstream 0.5.12 publication and registry lock verified on 2026-09-27; final consumer acceptance is in progress. No 0.19.3 publication is claimed.

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

- Upstream registry packages and exact dependency lock: both 0.5.12 packages installed from npm with matching registry integrities; actual CLI capability handshake passes. Earlier file-tarball and 0.5.11 evidence remain historical.
- Product/skill/template version consistency: pass, 0.19.3.
- Canonical full release verification and semantic acceptance: pending.
- Exact-head Required / CI: pending.
- Tag, npm Web Auth publication and `check:release-published`: pending.

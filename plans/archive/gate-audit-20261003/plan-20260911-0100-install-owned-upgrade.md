> **Status**: Executing
> **Created**: 20260911-0100
> **Slug**: install-owned-upgrade
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Focused installer/adoption/detector suites plus repository integrity checks
> **Rollback Surface**: Scoped source revert; no published artifact or live host mutation
> **Workflow Profile**: standard
> **Execution Mode**: worktree
> **Substantive Change SHA256**: `sha256:94e7e29bc8c6d8d5e67c077dceaf544668d509cfe8e2f1b1505b84c2d3c398ff`

# Honor installation ownership on 0.19 upgrade and seed the Herdr pin

## Scope and decision
Installed fleet roles and bundled cross-review trees refused legitimate package upgrades because both compared candidate bytes only, ignoring the existing protocol-2 ownership ledger. Separately, TypeScript adoption omitted the canonical Herdr version pin the shell seeds already declared, so a missing floor surfaced as runtime `unavailable` instead of a configuration error.

P1: `scripts/install-agent-fleet.sh#compareAndWrite` and `src/cli/commands/init.ts#syncBundledItemsAtHome` own installed-host writes; `src/core/adoption/standard-plan.ts` owns repository policy defaults; `scripts/check-agent-tooling.sh` owns readiness classification.
P2: package upgrade -> ownership receipt lookup -> unchanged-owned file/tree replacement -> transaction capture -> readiness probe. The pressure point is that ownership evidence existed but was never read on either write path.
P3: reuse `readInstalledProfile` and `managedInstallSurfaceIsCurrent` rather than adding a force flag or inferring ownership. Unknown or user-edited content still fails closed. A malformed explicit Herdr declaration stays authoritative and must be corrected deliberately; defaults never override it.

## Scope paths
`scripts/` and `assets/templates/helpers/` fleet and tooling helpers, `src/cli/commands/init.ts`, `src/cli/installer/install-profile.ts`, `src/core/adoption/standard-plan.ts`, the fleet contract asset, the named regression tests and their ownership fixture helper, `docs/researches/20260911-install-019-owned-upgrade.md`, `docs/CHANGELOG.md`, this plan, and the archived BRC14/BRC15 pause handoff.

## Task Breakdown
- [x] Read installation ownership on both write paths and include deep-worker in transaction capture.
- [x] Synchronize entire bundled skill trees with rollback on copy failure.
- [x] Seed the canonical Herdr pin in TypeScript adoption and report a missing or malformed floor as `configuration-error`.
- [x] Cover both hosts, reference-only changes, and subsequent user edits with regression tests.
- [x] Record the release note and the verified boundary; preserve the BRC14/BRC15 pause handoff as history.

## Promotion Gate
- Merge/PR unit: the installer ownership repair plus the Herdr policy seed ship as one revertible commit.
- Rollback surface: revert the scoped source commit. Nothing is published and no live host configuration is mutated.
- Verification boundary: focused installer, adoption, bundled-runtime and detector suites, plus the repository integrity checks and required remote CI.
- Review/acceptance boundary: `docs/researches/20260911-install-019-owned-upgrade.md` holds the root-cause evidence and coverage rationale.

## Verification
- `bun run check:hooks`, `bun run check:helpers`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`.
- Focused suites named in the research file. No full-suite trigger: required CI owns the branch-wide run.

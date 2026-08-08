> **Archived**: 2026-08-08 19:37
> **Related Plan**: plans/archive/plan-20260808-1326-archctx-stage2-authority-cutover.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260808-1937

# Task Review: archctx-stage2-authority-cutover

> **Status**: Complete
> **Plan**: plans/plan-20260808-1326-archctx-stage2-authority-cutover.md
> **Contract**: tasks/contracts/20260808-1326-archctx-stage2-authority-cutover.contract.md
> **Notes File**: tasks/notes/20260808-1326-archctx-stage2-authority-cutover.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-08 17:12
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:9091ceb43cb3000d92c14541a436adbf6452e5b287a9272f351583ee72b34d1d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 1eaf63019aadd2129376987957170d8310b35c3f

## Human Review Card

- Verdict: pass
- Change type: migration
- Intended files changed: capability node YAMLs plus the policy switch; the registry file and every consumer surface that reads it; the post-edit drift card; ownership markers on the ten baseline module docs; gitignore re-include for the nodes directory.
- Actual files changed: 62 across two commits. `1ffe78de` 60 files (+1539 -328); `65b808b4` 2 workflow artifacts (+28 -3). No file outside the contract `allowed_paths` after the amendment recorded in `65b808b4`.
- Commands passed: `bun test` 2261 tests / 0 fail (601.9s, inside the accepted prepare-acceptance run); `bun run check:type`; `bun src/cli/index.ts init --repo . --dry-run`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `bash scripts/check-deploy-sql-order.sh`; `check-task-workflow --strict` on worktree runtime; `capability-resolver list/validate`; `sync-helper-sources --check` (52); `sync-hook-sources --check` (3).
- Residual risks: see Residual Risks / Follow-ups below.
- Reviewer action required: none; acceptance recorded as `external_pass` with zero findings.
- Rollback: single-commit revert of `1ffe78de` restores registry authority, the registry file, and the pre-thin drift card together. The nodes directory and the doc markers are additive and inert under `capability_source: "registry"`, so a revert needs no follow-up cleanup.

## Mode Evidence

- Selected route: acceptance gate on a delivered migration work-package; three review rounds plus an authorized ship execution.
- P1/P2/P3 evidence: captured planning output in `plans/plan-20260808-1326-archctx-stage2-authority-cutover.md`; consumer census and boundary judgments in the implementation notes.
- Root cause or plan evidence: not applicable (task profile is `migration`, not `bugfix`).

## Verification Evidence

- Waza `/check` run: not used; acceptance ran the contract's own exit criteria through `verify-sprint --prepare-acceptance` on the worktree runtime with an explicit `REPO_HARNESS_SOURCE_ROOT` (the installed 0.13.2 helper predates nodes authority).
- Commands run: all eleven contract exit-criteria checks PASS, `[ContractVerify] total=11 failed=0 status=Fulfilled`, `Sprint verification passed`, `PREPARE_EXIT=0`.
- Manual checks (run by the gatekeeper, independent of the delivery's own claims):
  - Round-trip: the retired registry recovered from `git show` and compared field by field against the nodes resolution (`domain`, `name`, ordered `prefixes`, `contract_files`, `architecture_module`, `workstream_dir`, `lsp_profile`, `verification_hints`). Equal for all ten; the single divergence is the documented `workflow-engine-contract-assets` prefix swap from the deleted registry file to `.archcontext/model/nodes`.
  - Path-match parity: fifteen real paths resolved through both the worktree (nodes) and the `main` checkout (registry) resolvers — same capability and same matched prefix 15/15, including the `src/cli/mcp` vs `src/cli/mcp/general-repo-access.ts` longest-prefix contest and `scripts/lib` directory form.
  - Downstream invariance: two throwaway repos initialised with isolated `HOME`/`REPO_HARNESS_HOME`, one from this worktree and one from `main`; `diff -r` differs only in fixture names and transaction timestamps. New repos still get `capability_source: "registry"` and `.ai/context/capabilities.json`.
  - Fail-closed directions: `check-task-workflow --strict` in a fixture repo reports `Missing required file: .ai/context/capabilities.json` under registry mode with the file removed, `Missing required directory: .archcontext/model/nodes` under archcontext with no nodes, and OK in both healthy shapes; the `main` helper agrees on the registry-mode baseline.
  - Resurrection: `ensure-task-workflow.sh` against an archcontext copy does not recreate the registry, and does recreate it when the copy is flipped to registry mode (the gate is live and directional); `capability-config add` fails closed.
  - Marker purity: `12 0` numstat on each of the ten docs, and a `-U0` filter for any added line that is neither a marker nor blank returns nothing.
- Supporting artifacts: `.ai/harness/checks/latest.json` (status pass); run snapshot below; retained failure log for the one flaky run at `.ai/harness/runs/run-20260808T154936-62658-bun-test.log`.
- Implementation notes reviewed: yes — round-trip gate, consumer census (re-run and independently confirmed at 59 survivors with zero `docs/architecture/modules/**` hits), deviations, deferred items, tradeoffs, and both boundary judgments.
- Run snapshot: `.ai/harness/runs/run-20260808T165543-99081-20260808-1326-archctx-stage2-authority-cutover.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:9091ceb43cb3000d92c14541a436adbf6452e5b287a9272f351583ee72b34d1d
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 1eaf63019aadd2129376987957170d8310b35c3f
> **Verification Evidence SHA256**: sha256:ed8535274b1d40ebb3885f842928f2e5b2973bf45629bb33243103f65d183a27
> **Issued At**: 2026-08-08T09:11:40.067Z

- Summary: Capability authority cut over to .archcontext/model/nodes. Independently re-verified: nodes-vs-retired-registry round-trip equal on every compared field (sole documented divergence is the contract-assets prefix swapped from the deleted registry file to the nodes dir); 15/15 path-match parity against the main checkout's registry resolver; downstream fixture init byte-identical between worktree and main runtimes modulo fixture names; check-task-workflow fail-closed in all four directions (registry present/absent, archcontext with/without nodes dir); ensure-task-workflow and capability-config both refuse to resurrect the registry under archcontext, and seed correctly when flipped back to registry; marker insertion is 12/0 per doc with zero non-marker added lines; gitignore re-include verified by git check-ignore; helper (52) and hook (3) projections drift-clean. Two gatekeeper fix rounds closed: eight machine-managed capability-context blocks and five architecture-doc authority sentences regenerated off the deleted registry, and the consumer census corrected to account for every survivor. Full suite green in this session.
- Findings: none

## Behavior Diff Notes

- This repo resolves capabilities from `.archcontext/model/nodes/*.yaml`; `.ai/context/capabilities.json` is deleted. One-way and fail-closed, no dual-read.
- `resolve-effective-state` hashes whichever authority `capability_source` selects. Registry-mode hashing stays byte-identical (single-file `sourceHash`), so existing state fixtures and goldens are untouched; archcontext folds the sorted node files into one revision so any node edit still moves `authority_revision`.
- `capability-context sync --apply` no longer writes the JSON registry under archcontext; contract-file drift raises `CapabilitySourceError` naming the node to fix. This replaces a previously silent registry rewrite with a loud refusal.
- The SessionStart architecture drift card is a three-line checkpoint nudge instead of an eight-line block with a fenced command. The `# Architecture Queue` header is retained because `session-context.ts:1420-1422` matches on it.
- Downstream-generated repos are unaffected: scaffold defaults, the workflow-contract asset, and the three policy seeders all still declare `registry`, asserted by `tests/create-project-dirs.runtime.test.ts`.

## Residual Risks / Follow-ups

- **`waitForPath` 2000 ms deadline in `tests/unit/closeout-runner-guardrails.test.ts:57`.** This bound has now disrupted acceptance across several rounds: one full-suite run failed `the parent hard timeout returns even when the supervisor event loop is stopped` at 2038.97 ms under load while the same file is 24/24 green in isolation and the same commit's suite is green at lower load. Worse, the flake masked a real gate failure for two runs (see the next item). It is a surviving member of the a2381159 family and was deliberately left alone by the timeout sweep as a pre-existing tight bound. It needs its own slice; explicitly not folded into this work-package.
- **`verify-sprint` reports only the first failure class.** The run that failed on the flake recorded `failure_class: "contract_failure"` while its own snapshot already carried `allowed_paths_check.outside: ["AGENTS.md", "CLAUDE.md"]`; the allowed_paths breach only surfaced once the flaky command went green. A multi-failure run should surface every failing gate. Diagnostic shape only, no gate is wrong.
- **Eight present-tense registry statements survive in the frozen human regions of `docs/architecture/modules/**`.** They sit outside the `archctx:*` markers, so reprojection will never touch them, and this slice's Goal freezes that region byte-for-byte. The hardest is the I4 invariant row at `docs/architecture/modules/workflow-engine/contract-assets.md:297`, which asserts the deleted registry is the sole runtime capability authority and has no automated backstop of any kind. Needs a manual editorial pass.
- **`check-architecture-sync` freshness delegation to the archctx CLI** stays deferred, gated on the archctx §3.5 release plus a local CLI newer than npm 0.3.0.
- **`.archcontext/` is absent from `WORKFLOW_SURFACE_DIR_PREFIXES`** (`src/effects/review/diff-fingerprint.ts:345`), so node edits classify as implementation surface where registry edits classified as workflow surface. The fix also needs the `pre-edit-guard.sh` case-pattern and its `.ai/hooks/` projection.
- **`runCapabilityContextSync` partial-apply window** (`src/cli/commands/capability-context.ts:472-505`): under archcontext the contract blocks are written inside the loop and the `CapabilitySourceError` fires after it, so blocks land, the pending queue is not cleared, and the process exits non-zero. Idempotent on retry and loud, but real; six capabilities currently sit at `needs-normalize` and will hit it.
- **Installed-version lag**: `repo-harness` 0.13.2 on this machine does not know nodes authority, so plain `run check-task-workflow --strict` reports the registry file missing. Every acceptance command here used the worktree runtime with an explicit `REPO_HARNESS_SOURCE_ROOT`. Resolves on the next release.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Contract holds: nodes and the retired registry resolve identically, 15/15 path-match parity, four-way fail-closed on the requiredFiles selector, both resurrection paths gated and proven directional. Point off for the eight frozen doc statements the migration could not carry. |
| Product depth | 9/10 | Absorbed the 20260705 §7 correction properly — consumer surfaces migrated in the same package instead of stranding dual authority — and kept downstream generated repos byte-identical. |
| Design quality | 9/10 | Single selector, no dual-read, no fallback; `capability_registry_file` deliberately kept inert rather than deleted, because seeder merge semantics would re-add it. The reasoning is recorded rather than silently applied. |
| Code quality | 8/10 | Comments explain the invariant at each branch and registry-mode hashing stays byte-identical. Two rounds were needed to regenerate machine-managed output after its generator changed, and the consumer census overclaimed completeness twice before it held. |

## Failing Items

- None outstanding. Three gatekeeper rounds raised and closed: (1) eight machine-managed capability-context blocks left naming the deleted registry after their generator changed, plus five architecture-doc authority sentences and four domain `Source` lines contradicting the template this slice itself updated; (2) a consumer census that claimed grep-verified completeness while omitting thirteen files; (3) the same census, after the first correction, still asserting no surviving hit named the registry as current authority while `docs/architecture/modules/**` went unaccounted. A fourth issue surfaced during the ship sequence — the `allowed_paths` gate rejecting `AGENTS.md` and `CLAUDE.md` — and was closed by the contract amendment in `65b808b4`.

## Retest Steps

- Re-run: `REPO_HARNESS_SOURCE_ROOT=$PWD bun src/cli/index.ts run verify-sprint --prepare-acceptance` from the worktree; expect eleven PASS lines and `status=Fulfilled`.
- Re-check: `bun scripts/capability-resolver.ts list --format json` against `git show <pre-cutover>:.ai/context/capabilities.json` for round-trip equality; a temp-dir `init` for downstream registry-mode invariance; `bun scripts/sync-helper-sources.ts --check` and `bun scripts/sync-hook-sources.ts --check` for projection drift.

## Summary

- Pass. The authority cutover is correct, one-way, fail-closed, and provably invisible to downstream generated repos; the round-trip gate was reproduced independently rather than taken on the delivery's word. Three review rounds were needed, all on the same theme: generated artifacts and audit claims lagging the change they described, never the migration logic itself. Rollback is a single-commit revert.

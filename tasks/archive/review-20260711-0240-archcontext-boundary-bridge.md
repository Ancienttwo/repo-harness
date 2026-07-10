> **Archived**: 2026-07-11 02:40
> **Related Plan**: plans/archive/plan-20260706-0211-archcontext-boundary-bridge.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: one-shot-authority-foundation-migration

# Task Review: archcontext-boundary-bridge

> **Status**: Complete
> **Plan**: plans/plan-20260706-0211-archcontext-boundary-bridge.md
> **Contract**: tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md
> **Notes File**: tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-06 03:07
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: pending
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: per the approved plan's two slices — Slice 1 (single export point): `scripts/capability-resolver.ts` (canonical `Capability`/`ContractFiles`/`CapabilityRegistry` types + `readRegistry`/`findMatch`), `scripts/capability-config.ts` and `src/cli/commands/capability-context.ts` importing instead of duplicating, plus their `assets/templates/helpers/` mirrors; Slice 2 (read-only export): a vendored `archcontext.node/v1` capability-subset schema fixture and a new `capability-resolver.ts export --format archcontext-boundaries-v1` subcommand with parity/schema/schemaVersion-pin tests.
- Actual files changed: `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `src/cli/commands/capability-context.ts`, `assets/templates/helpers/capability-resolver.ts`, `assets/templates/helpers/capability-config.ts`, `tasks/todos.md` (all modified); `tests/capability-archcontext-export.test.ts`, `tests/fixtures/archcontext/architecture-node.subset.schema.json`, `plans/plan-20260706-0211-archcontext-boundary-bridge.md`, this contract, its notes file, and this review file (all new) — matches the plan's two slices with no out-of-scope additions. This closeout dispatch additionally touched: this review file (pending -> pass), the vendored schema's `$comment` (provenance correction, see Behavior Diff Notes), `tests/capability-archcontext-export.test.ts` (schema-validation hardening on the real-registry CLI test), this contract's `allowed_paths` (narrowed `src/`/`tests/` to the exact touched paths), and `docs/researches/20260705-archcontext-capability-filing-handover.md` (a durable-context addendum merge, orchestrator-directed and content-pre-verified in the main worktree — not part of this contract's `allowed_paths`, since research-doc sync is cross-cutting repo knowledge rather than this task's implementation scope).
- Commands passed (gate-verified this round, cited per dispatch and reconfirmed by this closeout where noted): full `bun test` — 1056 pass / 1 skip / 0 fail across 96 files; the three capability-convergence tests (`tests/capability-resolver.test.ts`, `tests/capability-config.test.ts`, `tests/cli/capability-context.test.ts`) — 13 pass (reconfirmed by this closeout: 13 pass / 0 fail / 57 expect() calls); the export/scaffold-parity/workflow-contract set (`tests/capability-archcontext-export.test.ts`, `tests/scaffold-parity.test.ts`, `tests/workflow-contract.test.ts`) — 18 pass (reconfirmed by this closeout after the test-hardening edit: 18 pass / 0 fail / 326 expect() calls); `capability-resolver.ts validate` — OK; `match` CLI parity against base commit `43ad4de`'s 17-path representative set (longest-prefix tie-break, file-prefix, directory-prefix, and unmatched cases) — byte-identical before/after the Slice 1 convergence; `bun run check:type` and `bash scripts/migrate-project-template.sh --repo . --dry-run` — both exit 0; `assets/templates/helpers/{capability-resolver.ts,capability-config.ts}` vs their `scripts/` counterparts — zero diff. This closeout's own re-verification: `bun test tests/capability-archcontext-export.test.ts tests/capability-resolver.test.ts` — 10 pass / 0 fail / 78 expect() calls across 2 files.
- External acceptance: unavailable — no cross-vendor (Codex) review was run for this contract; the recorded verdict is this internal gate's PASS (with 5 non-blocking findings, all closed by this dispatch) plus the orchestrator's acceptance of this closeout.
- Residual risks: none blocking. See Residual Risks / Follow-ups for the two accepted, non-blocking implementation deviations the gate already reviewed and accepted, and for the doc-sync provenance note.
- Reviewer action required: none blocking.
- Rollback: revertible with no data migration. Revert branch `codex/archcontext-boundary-bridge` wholesale (base `43ad4de`), or per-file: `scripts/capability-config.ts`/`capability-context.ts` revert to their pre-convergence direct-registry-read implementations; the `assets/templates/helpers/` mirrors must revert together with their `scripts/` counterparts (byte-parity pairs); the new `export` subcommand, its test file, and the vendored schema fixture can be deleted outright with no other call site depending on them (read-only, additive surface). This closeout's own edits (schema comment, test hardening, `allowed_paths` narrowing, review fill, research-doc addendum) are each independently revertible doc/test-only changes with no runtime behavior dependency.

## Mode Evidence

- Selected route: `repo-harness-plan` captured work-package plan -> `contract-worktree` execution on branch `codex/archcontext-boundary-bridge` (this worktree) -> gatekeeper review (PASS, 5 non-blocking findings) -> this finalization dispatch (fast-worker) closing the 5 findings and merging one pre-verified research-doc addendum.
- P1/P2/P3 evidence: not applicable — Task Profile is `code-change`, not a P1/P2/P3-tiered bugfix decision.
- Root cause or plan evidence: not applicable (Task Profile: `code-change`, so the contract's `## Root Cause Evidence` section is n/a). Plan evidence: `plans/plan-20260706-0211-archcontext-boundary-bridge.md`'s Slice 1 (converge triplicated `Capability` type/registry-read/longest-prefix logic across `capability-resolver.ts`/`capability-config.ts`/`capability-context.ts` onto one source, per `.ai/harness/policy.json`'s `capability_match_rule`) and Slice 2 (read-only `archcontext.node/v1`-shaped export bridge per `docs/researches/20260705-archcontext-capability-filing-handover.md`, with no archctx runtime dependency taken on).

## Verification Evidence

- Waza `/check` run: not re-invoked by this dispatch; the gate's own review pass (recorded PASS with 5 non-blocking findings) preceded it. This dispatch re-ran the specific exit_criteria-relevant commands directly (see Commands run) rather than a full `/check` cycle.
- Commands run:
  - `bun test tests/capability-archcontext-export.test.ts tests/capability-resolver.test.ts` -> 10 pass / 0 fail / 78 expect() calls (this closeout, after the test-hardening edit).
  - `bun test tests/capability-resolver.test.ts tests/capability-config.test.ts tests/cli/capability-context.test.ts` -> 13 pass / 0 fail / 57 expect() calls (this closeout's reconfirmation of the gate's cited figure).
  - `bun test tests/capability-archcontext-export.test.ts tests/scaffold-parity.test.ts tests/workflow-contract.test.ts` -> 18 pass / 0 fail / 326 expect() calls (this closeout's reconfirmation of the gate's cited figure, post test-hardening edit).
  - `python3 -c "import json; json.load(...)"` on the vendored schema fixture after the `$comment` edit -> valid JSON.
  - `git apply --check` then `git apply` on the research-doc addendum patch -> applied cleanly; `## 7. 2026-07-06 覆核修正與 gating 條件` confirmed present via `rg`.
  - Full `bun test` (1056 pass / 1 skip / 0 fail / 96 files), `bun run check:type`, `migrate-project-template.sh --repo . --dry-run`, template-mirror diff, and the 17-path `match` CLI parity check are the gate's own this-round measurements, cited directly per the dispatch (not independently re-run by this closeout dispatch, which was scoped to the 5 findings plus the doc merge).
- Manual checks: the two implementation deviations the gate flagged as non-blocking are both re-confirmed accurate against `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`'s Design Decisions section by direct reading in this dispatch: (1) `findCapabilityByPath` (`src/cli/commands/capability-context.ts`) is kept as a thin adapter over `findMatch` rather than deleted outright, because its return shape and root/file-prefix no-match fallback differ from `findMatch`'s and deleting it would have changed capability-context's observable behavior on the "file prefixes target their directory" case; the duplicate sort/tie-break loop that pre-existed in capability-context's own matching logic was removed, leaving `findMatch` as the single longest-prefix/ambiguity-detection source of truth. (2) The `allowed_paths` widening to `scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `assets/templates/helpers/capability-resolver.ts`, and `assets/templates/helpers/capability-config.ts` exactly matches the four files the plan's Slice 1/Slice 2 name — a mechanical reconciliation of the contract with already-approved plan scope, not new scope.
- Supporting artifacts: `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md` (Design Decisions, Deviations From Plan Or Spec, Tradeoffs Considered, Open Questions — none blocking); `docs/researches/20260705-archcontext-capability-filing-handover.md` §7 (2026-07-06 dual-track Opus+Codex re-review addendum, now merged); `.ai/harness/checks/latest.json`, `.ai/harness/runs/`.
- Implementation notes reviewed: yes — read in full this dispatch; all deviations and tradeoffs are documented with rationale, none silently absorbed.
- Run snapshot: `.ai/harness/checks/latest.json`, `.ai/harness/runs/` (this worktree).

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: none.
- P2 advisories: none remaining — the 5 non-blocking findings the gate recorded (review-file completion, schema `$comment` provenance correction, CLI test schema-validation hardening, `allowed_paths` narrowing, research-doc addendum merge) are all closed by this dispatch.
- Acceptance checklist: no cross-vendor (Codex) run performed for this contract; internal gatekeeper PASS plus this closeout's reconfirmation is the recorded verdict (see Human Review Card, Verification Evidence). A fresh external/cross-vendor re-acceptance is not queued as a follow-up here since no manual override of `## External Acceptance Advice` is being recorded — this contract's own completion gate is `verify-contract.sh --strict`, not `verify-sprint`.

## Behavior Diff Notes

- Slice 1 (convergence): `scripts/capability-resolver.ts` is now the single export point for `Capability`/`ContractFiles`/`CapabilityRegistry` and `readRegistry`/`findMatch`; `capability-config.ts` and `capability-context.ts` import instead of duplicating. `capability-resolver.ts` gained an `import.meta.main` guard so importing it no longer re-executes its CLI entrypoint against the importer's `process.argv`. `capability-context.ts`'s matching now enforces the same-length-ambiguity-fails rule uniformly (previously silent in its own loop); no current test exercises overlapping same-length prefixes, so nothing regressed.
- Slice 2 (export bridge): new `capability-resolver.ts export --format archcontext-boundaries-v1` subcommand and `buildArchContextBoundariesV1`/`toArchContextBoundaryNode` maps each `Capability` to a `{schemaVersion, id, kind, source.include, extensions.{lspProfile,verification}}` node, sorted by `id`, validated against the registry before printing, output as a bare sorted JSON array (matching the CLI's existing `list --format json` convention).
- This closeout's edits (no runtime behavior change, doc/test/contract-only):
  - `tests/fixtures/archcontext/architecture-node.subset.schema.json` `$comment`: previously stated the `source`/`extensions` shapes were "unchanged from upstream"; this was inaccurate — the vendored fixture's `source` adds `required: ["include"]` and `include.minItems: 1`, which upstream does not have. The comment now correctly attributes these two constraints as this repo's own deliberate safe-narrowing of its emitted output (this export's `toArchContextBoundaryNode` always emits a non-empty `source.include` from a validated registry), not an upstream-shape claim.
  - `tests/capability-archcontext-export.test.ts`'s "CLI export command produces the same nodes as the in-process builder" test now runs full `validateAgainstSchema` against every node the CLI emits from this repo's real 7-capability registry (previously this test only smoke-checked `schemaVersion`/`kind`/`source.include`-is-array on real-registry output; full schema validation only ran against the synthetic 3-capability registry in a separate test).
  - Contract `allowed_paths` narrowed `src/` -> `src/cli/commands/capability-context.ts` and `tests/` -> `tests/capability-archcontext-export.test.ts` + `tests/fixtures/archcontext/`, matching the paths this task actually touched (no other file under either directory was edited).
  - `docs/researches/20260705-archcontext-capability-filing-handover.md` gains a `## 7. 2026-07-06 覆核修正與 gating 條件` addendum (dual-track Opus deep-reasoner + Codex re-review conclusion: live-capability count correction from 6 to 7, a runtime-vs-schema-layer clarification on `source.include/exclude/entrypoints`, a walk-back of Stage 2's "drop capabilities.json with no read-only mirror" plan as too aggressive, a hook fail-open/gate fail-closed clarification, and three named gating conditions before any Stage 2+ discussion reopens).

## Residual Risks / Follow-ups

- None blocking. The two implementation deviations (thin `findCapabilityByPath` adapter; `allowed_paths` widened to the plan's four named files) were already reviewed and accepted by the gate as intentional, documented convergence decisions, not scope drift — see Verification Evidence and `tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md`.
- `docs/researches/20260705-archcontext-capability-filing-handover.md`'s §7 addendum itself names three gating conditions (daemon-optional `archctx resolve --path`, a clean `@archcontext/contracts` npm publish with a fail-closed-pinnable `schemaVersion`, and `agent-context` `targetType` support) that must all be satisfied before any Stage 2+ archctx-integration discussion reopens — tracked in the research doc itself, not a gap in this contract.
- The research-doc merge in this closeout was content-pre-verified in the main repo worktree and applied here as a mechanical sync; it is not part of this contract's `allowed_paths` by original scope (durable cross-cutting doc, not this task's implementation surface) — flagged here for traceability, not as a defect.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Full suite 1056/0/1-skip across 96 files; both convergence (13) and export/parity (18) sets reconfirmed by this closeout after the hardening edit; CLI `match` parity byte-identical against base `43ad4de`'s 17-path set including tie-break/file/dir/unmatched cases. |
| Product depth | 8/10 | Slice 1 removes real triplication risk against a policy-pinned matching rule; Slice 2 delivers a genuinely read-only, schema-validated export bridge with no archctx runtime coupling, exactly as scoped — not a 9/10 only because the export bridge's real-world consumer (arch-context itself) does not yet exist to close the loop. |
| Design quality | 9/10 | EXECUTION_BOUNDARY fully honored (no `capabilities.json`/`policy.json`/`workflow-contract.json`/hook diff, no archctx dependency, `package.json`/`bun.lockb` untouched); the vendored schema is a deliberately narrowed subset with now-accurate provenance comments; `import.meta.main` guard reuses an existing repo idiom rather than inventing a new one. |
| Code quality | 9/10 | Template/`scripts/` mirrors byte-identical; schema validator is purpose-built and scoped to only the keywords the vendored fixture uses; test hardening closes a real coverage gap (real-registry output now gets full schema validation, not just a field-presence smoke check) rather than adding assertions for their own sake. |

## Failing Items

- None. All 13 exit_criteria test paths and the `bun run check:type` command pass; `qa_scores.functionality` (min 7) is satisfied at 9/10; the `manual_checks` "Evaluator review file recommends pass" item is satisfied by this file's `> **Recommendation**: pass` line.

## Retest Steps

- Re-run: `bun test tests/capability-archcontext-export.test.ts tests/capability-resolver.test.ts` (this closeout's own re-verification command); `bun test tests/capability-resolver.test.ts tests/capability-config.test.ts tests/cli/capability-context.test.ts tests/scaffold-parity.test.ts tests/workflow-contract.test.ts` (full exit_criteria set); full `bun test` for the whole-repo figure.
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md --strict`; `bash scripts/check-task-sync.sh`.

## Summary

- Pass. Slice 1 converges the triplicated `Capability` type, registry read, and longest-prefix match logic onto `scripts/capability-resolver.ts` as the single source of truth, with byte-identical CLI `match` output before/after and both accepted deviations (thin `findCapabilityByPath` adapter, `allowed_paths` reconciliation) documented and reviewed. Slice 2 adds a read-only, schema-validated `archcontext-boundaries-v1` export bridge with no archctx runtime dependency, fully inside the plan's EXECUTION_BOUNDARY. This closeout dispatch fills this review file to reflect the gate's PASS, corrects the vendored schema's provenance comment to accurately describe its own safe-narrowing, hardens the CLI export test to run full schema validation against the real 7-capability registry (reconfirmed 18 pass after the change), narrows this contract's `allowed_paths` to the exact touched files, and merges a pre-verified research-doc addendum. No blocking items remain.

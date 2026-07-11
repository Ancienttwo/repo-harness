# Task Review: bdd2-eval-foundation

> **Status**: Done
> **Plan**: plans/plan-20260712-0450-bdd2-eval-foundation.md
> **Contract**: tasks/contracts/20260712-0450-bdd2-eval-foundation.contract.md
> **Notes File**: tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-12 05:43
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:077fe6e0295b56e4c72f6ab916e798f523b2857fc2fc0d4344f9ac20cd2a01cf
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: eval-only
- Intended files changed: BDD² PRD/Sprint/work-package artifacts;
  `evals/bdd2/**`; `scripts/run-bdd2-evals.ts`; focused tests; tracked current
  status and ignored handoff evidence.
- Actual files changed: the 20 non-review paths in the reviewed fingerprint — 11
  `evals/bdd2` authority files, PRD/Sprint/plan, runner, contract/current/notes,
  and two tests. This review is excluded from the fingerprint by design.
- Commands passed: full `bun test`; focused BDD² tests; typecheck; manifest
  validation; deterministic dry-run plan; deploy SQL; architecture sync; task
  sync; inspector; direct migration dry-run.
- External acceptance: unavailable before PR; the PR is the human acceptance surface.
- Residual risks: full 12-task arms and actual model profiles are intentionally not
  sealed in E-01; strict workflow has a pre-existing brain-mirror drift; local Codex
  Waza installed-copy and worktree CodeGraph index readiness are partial.
- Reviewer action required: review the PR's treatment prompts, leakage boundary,
  sealed-run contract, and decision to keep Browser/ImageGen in gated E-04.
- Rollback: revert the E-01 commit; no runtime cutover, migration, user data, or
  compatibility path exists.

## Mode Evidence

- Selected route: `eval-only` isolated contract worktree.
- P1 map: `evals/bdd2/evaluation-manifest.json` is the sole machine authority;
  prompts/tasks/truth/rubric are hashed inputs; the script is local experiment
  orchestration; raw runs remain ignored; review/notes hold durable conclusions.
- P2 trace: manifest validation -> task/condition/repetition coordinates ->
  agent-visible prompt without truth/condition metadata -> frozen agent command ->
  deterministic private coordinate + random 128-bit blind packet -> later
  condition-blind adjudication.
- P3 decision: a dedicated BDD² text-treatment runner is smaller and safer than
  refactoring the existing skill-installation benchmark. `foundation` permits only
  validation/planning; `sealed` requires exact held-out counts, frozen model/sampling
  profiles, and a clean Git HEAD whose commit and manifest hash are recorded. Every
  authority member, including the runner itself, must also be tracked at that HEAD.
- Plan evidence: approved PRD Phase E handoff explicitly forbids public product
  surface before a recorded evaluation pass.

## Verification Evidence

| Command | Result |
|---|---|
| `bun test` | 1146 pass, 1 platform skip, 0 fail; 11540 expectations across 99 files |
| `bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts` | 11 pass, 0 fail after PR #53 review remediation |
| `bun run check:type` | pass |
| `bun scripts/run-bdd2-evals.ts validate` | pass; foundation authority valid and unsealed |
| `bun scripts/run-bdd2-evals.ts plan --experiment S --partition development --dry-run` | pass; stable opaque coordinates emitted |
| `repo-harness run check-deploy-sql-order` | pass |
| `repo-harness run check-architecture-sync` | pass; advisory, 0 blocking |
| `repo-harness run check-task-sync` | pass |
| `bun scripts/inspect-project-state.ts --repo . --format text` | pass; no drift signals or required decisions |
| `bash scripts/migrate-project-template.sh --repo . --dry-run` | pass |
| `LC_ALL=C repo-harness run check-task-workflow --strict` | baseline fail only: `harness-overview.md` differs from its brain mirror |

- Strict workflow finding is not introduced by this branch: both flagged files are
  unchanged from `origin/main`, and the same BrainSync failure occurs on the base.
  Syncing the brain mirror would edit an unrelated path outside this contract.
- Default-locale `awk` also failed on Unicode PRD prose; `LC_ALL=C` reaches the real
  check and leaves only the baseline BrainSync finding. This is a workflow-tooling
  locale limitation, not a malformed PRD.
- Full suite ran before the final bounded path/placeholder hardening; the focused
  suite and typecheck were rerun after those edits and directly cover them.
- Manual checks: agent packets contain no truth issue IDs or condition labels;
  blind packets contain no private condition/agent/model/sampling coordinates;
  no public skill, CLI/MCP mutation tool, hook/check integration, Brief catalog,
  sidecar, or lifecycle exists in the diff.
- PR #53 automated review P1 is covered by random, non-enumerable public packet IDs
  while reproducible condition-derived coordinates remain private. Automated review
  P2 is covered by a sealed-run check that every manifest-listed authority path is
  tracked at clean HEAD; an ignored alternate manifest now has a regression test.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: pending PR reviewer
> **External Source**: https://github.com/Ancienttwo/repo-harness/pull/53
> **External Started**: 2026-07-12T05:27:00+08:00
> **External Completed**: pending
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:077fe6e0295b56e4c72f6ab916e798f523b2857fc2fc0d4344f9ac20cd2a01cf
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none after local remediation; GitHub re-review is still pending.
- P2 advisories: E-02/E-03 must expand the held-out sets to 12 tasks per hypothesis
  and seal actual agent profiles before any real execution. The runner enforces this.
- Review threads addressed locally: non-reversible blind IDs and tracked sealed
  authority. No GitHub reply or manual thread resolution was performed without
  explicit user authorization.
- Acceptance checklist: verify prompt fairness, task/truth separation, condition
  blinding, clean-HEAD provenance, manifest/hash fail-closed behavior, and Phase E
  product-surface prohibition.

## Behavior Diff Notes

- The approved PRD and ordered Sprint now make `shape`, `audit`, Browser evidence,
  ImageGen prototypes, and implementation pilot separate hypotheses and gates.
- Foundation manifests are content-addressed and non-executable. Real execution is
  impossible until the full held-out sets and model/sampling/command profiles are
  sealed.
- Agent-visible tasks use an exact schema that rejects truth or condition fields.
  Truth sets are separate hashed files; symlinks and repository escapes fail closed.
- Blind response packets receive independent 128-bit random IDs and omit treatment
  identity and execution metadata; deterministic coordinates remain only in the
  private reveal map with condition/repetition/model/sampling.
- The manifest now pins the runner hash as well as prompt/task/truth/rubric/schema
  hashes. Sealed execution rejects ignored or untracked manifests and authority
  inputs even when ordinary Git status is otherwise clean.
- Browser and ImageGen are explicitly retained in BDD2-E-04, gated on separate S/A
  passes. No adapter was deleted or prematurely productized.

## Residual Risks / Follow-ups

- E-01 proves reproducibility mechanics, not BDD² product value. It contains small
  development/held-out seed sets only; no effectiveness claim is authorized.
- Prompt fairness and the full 12-task composition require human review during the
  E-02/E-03 sealing PRs.
- The pre-existing brain mirror drift prevents a green strict workflow trace until
  its owning work-package syncs the mirror.
- Advisory tooling reports Codex Waza installed copies and the linked-worktree
  CodeGraph index as partial; neither affected this source diff or its tests.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Functionality | 9/10 | All in-scope execution, validation, blinding, and provenance paths are covered; real evidence is correctly blocked until seal. |
| Product depth | 9/10 | Preserves Browser/ImageGen and Brief value as tested hypotheses while preventing unvalidated product surface. |
| Design quality | 9/10 | One authority, separate truth boundary, opaque packets, and explicit foundation/sealed lifecycle only where evaluation requires it. |
| Code quality | 9/10 | Exact schemas, runner/input hashes, tracked clean-HEAD provenance, CSPRNG blinding, symlink/path protection, applied model/sampling placeholders, deterministic private coordinates, no compatibility path. |

## Failing Items

- None in the reviewed diff.
- Out-of-scope base failure: brain mirror drift in strict workflow.

## Retest Steps

1. `bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts`
2. `bun run check:type`
3. `bun scripts/run-bdd2-evals.ts validate`
4. `bun scripts/run-bdd2-evals.ts plan --experiment S --partition development --dry-run`
5. After the baseline brain mirror is fixed, rerun
   `LC_ALL=C repo-harness run check-task-workflow --strict`.

## Summary

Pass. E-01 creates an evaluation-only, content-addressed, blind runner foundation
without any BDD product surface. It fails closed on drift, leakage, symlink/path
escape, incomplete held-out arms, unapplied model/sampling profiles, dirty source
state, untracked/ignored authority, reversible blind IDs, and attempted execution
before seal. The full repository suite and focused tests pass. Browser/ImageGen and
Behavior Brief remain explicitly preserved for their gated hypotheses; the only red
workflow signal is an unrelated base BrainSync drift that this contract correctly
does not absorb.

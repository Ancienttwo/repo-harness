# Plan: Agent fleet specialist roles and native Explore boundary

> **Status**: Archived
> **Created**: 2026-07-12 22:15 +0800
> **Slug**: agent-fleet-specialists
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: the two new repo-owned roles must install from the packaged authority, generate deterministic Claude/Codex projections, preserve fail-closed fleet behavior, and leave native host Explore unwrapped and unmerged.
> **Rollback Surface**: revert this work-package commit and reinstall the six-role fleet; no data or schema migration is involved.

## Why

The repo-owned four-role fleet now has one deterministic authority, but two distinct execution gaps remain: bugfix investigations do not have a specialist that produces the evidence shape expected by the existing root-cause gate, and harness/adoption evaluation has no named read-only persona that runs the existing evaluators without becoming a second benchmark authority. The host-native Explore agent also needs an explicit routing boundary so it is not treated as an inheritable prompt base or duplicated as another repo persona.

## Goal

Add `root-cause-prover` and `harness-evaluator` to the repo-owned agent fleet, fold migration auditing into the evaluator's adoption profile, document native Explore as an informal host capability rather than a mergeable authority, and install the verified six-role fleet into the user's actual Claude/Codex agent directories.

## Scope

- In scope:
  - Add repo-owned source definitions and deterministic Claude/Codex projections for `root-cause-prover` and `harness-evaluator`.
  - Extend installer, tooling readiness, policy seeds, mirrors, and focused tests from four to six managed roles.
  - Give `root-cause-prover` a bounded diagnosis/evidence contract aligned to the existing four-field bugfix root-cause gate without changing that gate.
  - Give `harness-evaluator` `skills` and `adoption` profiles that invoke existing benchmark/adopt/inspection surfaces in disposable state; migration auditing is the adoption profile, not another identity.
  - Keep `evals/bdd2/**` explicitly forbidden to `harness-evaluator`.
  - Document native `Explore` as suitable for informal, non-contract discovery; formal contract explorer work uses the complete repo-owned `explorer` persona. No prompt inheritance or incremental merge is claimed.
  - Update changelog, architecture/workflow artifacts, package/install smoke, and the real user-level fleet after repository verification.
- Out of scope:
  - `trust-boundary-auditor` and `release-operator` personas.
  - Changes to `scripts/contract-run.ts` or the parallel `agent-fleet-worker-routing-telemetry` work-package.
  - Changes to root-cause gate implementation, eval methodology, benchmark datasets, or `evals/bdd2/**`; the existing skill runner may gain only the fail-closed disposable-repo/HOME boundary needed by this role.
  - Native subagent hook governance, host adapter changes, compatibility aliases, prompt inheritance, remote fallback, or dual authority.

## Agentic Routing

- Selected route: stacked isolated worktree based on the verified repo-owned fleet commit; two independent read-only explorer passes, sequential parent implementation, independent reviewer.
- P1 map: `agents/fleet/*.md` authority -> installer validation/model mapping -> `.claude/.codex` projections -> policy/tooling readiness -> actual HOME install. Existing root-cause and eval/adoption commands remain consumers, not modified authorities.
- P2 trace: fleet install resolves package source, preflights all six definitions, writes six Claude Markdown plus six Codex TOML targets, and tooling readiness compares installed Claude definitions with the same packaged authority. Routing docs decide whether informal discovery uses native Explore or formal work uses the named fleet explorer.
- P3 decision: create only two identities where output contract and lifecycle differ materially; merge migration audit into an evaluator profile; leave security/release identities deferred; make every repo-owned persona a complete source rather than an untestable delta over a host prompt.

## Detailed Design

1. `root-cause-prover`: Opus/Sol high, workspace-write, production-source edits forbidden. It may write diagnosis evidence and a candidate regression guard only inside the task's allowed paths or isolated investigation worktree. Output begins `DIAGNOSIS: CONFIRMED|LIKELY|BLOCKED` and reports `root_cause`, `repro`, `regression_guard`, `pre_fix_failure_artifact`, uncertainty, and recommended parent action.
2. `harness-evaluator`: Opus/Sol high, workspace-write only inside an orchestrator-provided complete disposable repo/HOME. `skills` profile runs the existing skill runner through its enforcing disposable mode; `adoption` uses one guarded invocation that injects the validated roots into project-state inspection and adopt dry-run. The shared guard rejects the source checkout and real HOME in either argument position, non-sibling roots, incomplete repo state, and (for skills) output paths outside the disposable repo before writing. Existing migration/audit fixtures are read-only context rather than separate writable commands. If dispatched without that boundary, it returns BLOCKED. Output begins `EVAL: PASS|REGRESSION|INCONCLUSIVE|BLOCKED`. It never touches `evals/bdd2/**`.
3. Installer uses an explicit writable-role set for `fast-worker`, `root-cause-prover`, and `harness-evaluator`; all other roles generate read-only Codex sandboxes. Source validation remains all-or-nothing before target mutation.
4. Native Explore is documented as a runtime fallback for informal discovery only. The repo-owned `explorer` stays a complete named contract persona with CodeGraph-first evidence, structured findings, and the execution boundary. No `explore` alias or inheritance layer is added.
5. Real HOME installation happens only after focused/full/package/workflow review passes, using the verified installer with `--force` to replace the stale user-level custom explorer and install all six roles.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Root-cause role gains broad source-write behavior | Medium | High | Prompt forbids production edits; writable set is explicit; task allowed paths/worktree remain authoritative; tests assert sandbox mapping. |
| Evaluator writes into the source checkout | Medium | High | Workspace-write is valid only when its working root and HOME are disposable; otherwise the persona returns BLOCKED. |
| Evaluator becomes a competing benchmark authority | Medium | High | Persona only invokes existing surfaces; `evals/bdd2/**` hard boundary and no eval implementation changes. |
| Native Explore and fleet explorer form dual authority | Medium | Medium | Docs distinguish informal runtime capability from formal named persona; no alias, wrapper, or prompt merge. |
| Package or real HOME misses a new role | Medium | High | Six-source tarball assertion plus source/package temporary-HOME smoke before actual HOME install. |
| Parallel worker-routing work is absorbed | Low | High | Its contract/code paths are explicitly excluded; stacked worktree starts from the verified fleet branch only. |

## Promotion Gate

- **Merge/PR unit**: the two specialist personas, six-role distribution contract, and native Explore routing boundary.
- **Rollback surface**: revert one specialist work-package commit and reinstall the prior four-role fleet.
- **Verification boundary**: focused installer/tooling/bootstrap/runtime tests, full suite, helper parity, package contents, temporary-HOME source/package installs, workflow/architecture gates, and actual HOME readback.
- **Review/acceptance boundary**: independent review proves role separation, sandbox mapping, no BDD2 changes, no native prompt inheritance, and no overlap with worker-routing telemetry.
- **High-risk surface**: user-level agent installation and the diagnosis role's workspace-write sandbox.
- **Why not checklist row**: this adds packaged public agent identities and changes user-level runtime configuration as one independently reversible distribution boundary.

## Evidence Contract

- **State/progress path**: this plan, generated contract/review/notes, `tasks/current.md`, and final HOME readback.
- **Verification evidence**: focused/full tests, package listing, two temporary-HOME smokes, strict workflow/architecture checks, external review, and six-role installed hashes.
- **Evaluator rubric**: one packaged source; exactly six managed roles; deterministic projections; correct sandbox mapping; no BDD2 or worker-routing code changes; native Explore remains unwrapped.
- **Stop condition**: all task rows complete, review recommends pass, architecture queue is clear, final sprint verification passes, and actual HOME contains the verified six-role projections.
- **Rollback surface**: revert the specialist commit and rerun the previous installer.

## Task Breakdown

- [x] Map the existing root-cause and evaluation/adoption consumers without changing their authority.
- [x] Add and project `root-cause-prover` and `harness-evaluator` with correct sandbox/output contracts.
- [x] Extend installer, tooling, policy seeds, mirrors, docs, and focused regression tests to six roles.
- [x] Document the native Explore versus fleet explorer routing boundary without inheritance or aliases.
- [x] Sync workflow/architecture artifacts and clear touched capability queues.
- [x] Run focused, full, package, temporary-HOME, workflow, and independent-review gates.
- [x] Commit the verified work-package, then install and read back the six-role fleet in actual HOME.

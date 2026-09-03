# Plan: Module 1: Cutover Closure Gate and policy.refactor reader skeleton

> **Status**: Draft
> **Created**: 20260903-1713
> **Slug**: refactor-cutover-closure-gate
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: prd:plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md#Module 1
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: PR #230 historical replay, three closed error milestones, canonical digest compatibility, policy fail-closed defaults, and full repository checks form one reviewable gate.
> **Rollback Surface**: Revert the single work-package implementation commit; no persisted data, workflow activation, provider state, or external side effect is introduced.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md`
> **Task Review**: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md`
> **Implementation Notes**: `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: prd:plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md#Module 1
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260903-1713-refactor-cutover-closure-gate.md`
- Sprint contract: `tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md`
- Sprint review: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md`
- Implementation notes: `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260903-1713-refactor-cutover-closure-gate.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260903-1713-refactor-cutover-closure-gate.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md`
- Review file: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md`
- Implementation notes file: `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260903-1713-refactor-cutover-closure-gate.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single work-package implementation commit; no persisted data, workflow activation, provider state, or external side effect is introduced.
- **Verification boundary**: PR #230 historical replay, three closed error milestones, canonical digest compatibility, policy fail-closed defaults, and full repository checks form one reviewable gate.
- **Review/acceptance boundary**: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260903-1713-refactor-cutover-closure-gate.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md`, `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md`, and `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single work-package implementation commit; no persisted data, workflow activation, provider state, or external side effect is introduced.

## Captured Planning Output

# Module 1: Cutover Closure Gate and policy.refactor reader skeleton

## Approved design summary

- **Building**: one provider-independent Cutover Closure evaluator plus its packaged helper/schema projection, and one closed `policy.refactor` reader skeleton. The evaluator consumes an explicit upstream-shaped kill list and a six-category closure declaration, checks an exact Git candidate tree without CodeGraph or archctx, emits `CutoverClosureV1` with a canonical digest, and proves the design against merged PR #230.
- **Not building**: no `plan-to-todo`, `contract-run`, `verify-contract`, `verify-sprint`, or AcceptanceReceipt wiring; no Task Profile change; no skill-hooks retirement; no dogfood deletion; no architecture model/projection change; no provider, Refactor Mode state machine, route, program, board, MCP, compatibility parser, alias, fallback, cache, or migration.
- **Approach**: salvage only deterministic mechanics from WIP commit `3fe8f4db02098d92b602868611b1bddde79894dc`; rewrite every public input/output/error/policy shape from the PRD and upstream contract. This retains paid-for scanning evidence without making the superseded protocol a second authority.
- **Key decisions**: exact Git object reads define candidate state; six categories are exactly-once; only upstream selector kinds exist; all failure codes collapse to the PRD three-code set; `require_cutover_closure` is a policy-controlled context flag and remains `false`; historical PR #230 is the falsifier.
- **Unknowns**: none block this work-package. Upstream refactor provider/CLI publication is intentionally irrelevant to Module 1.

## Goal calibration

- **Implicit assumptions**: full repository history remains available to the repository test job; if PR #230 objects disappear, the First Proof Point fails closed instead of substituting a synthetic proof. `RefactorKillListEntryV1.selectorId` is an opaque exact selector string; if upstream later assigns semantics beyond exact `path|relation|symbol`, this Module 1 contract must be revised before activation. The packaged helper must remain self-contained; if downstream helpers gain a shared runtime module later, deduplication is a separate work-package.
- **Critical missing information**: none. The upstream contract fixes selector/evidence shapes, the PRD fixes closure semantics/defaults, and the adopted reconciliation fixes salvage boundaries.
- **Common failure mode**: preserving A's old `surface_class/items/literal/pass|fail` protocol beside the new protocol would create dual authority and false closure; any old vocabulary in product code is a failing oracle.

## P1: Global architecture map

- **Authorities**: `/Users/ancienttwo/Projects/arch-context/packages/contracts/src/refactor.ts` owns `REFACTOR_KILL_LIST_KINDS`, `RefactorKillListEntryV1`, `REFACTOR_EXECUTION_EVIDENCE_KINDS`, and `RefactorExecutionEvidenceRefV1`; `plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md` owns Module 1 behavior, `CutoverClosureV1`, policy defaults, and the First Proof Point; `docs/researches/20260903-cutover-closure-wip-reconciliation.md` owns the adopted salvage/drop decision.
- **Runtime components**: `scripts/cutover-closure.ts` is the single parser/evaluator/CLI authority; `assets/templates/helpers/cutover-closure.ts` is its byte-identical packaged projection; `assets/workflow-contract.v1.json#cutoverClosure` is the registry authority and `.ai/harness/workflow-contract.json` its deterministic installed projection; `src/core/refactor/policy.ts` owns the closed policy-section reader.
- **Entrypoints**: the First Proof Point invokes `bun scripts/cutover-closure.ts verify --repo . --contract tests/fixtures/cutover-closure/pr-230.contract.md --head 4f7cb37e0edf74a8d0b334a8a24370ac48807f86 --output .ai/harness/checks/pr-230-cutover-closure.v1.json`; required-context tests append `--require-cutover-closure`. Policy consumers call `readRefactorPolicy(value)` or `loadRefactorPolicy(repoRoot)`. No existing workflow helper invokes either in this slice.
- **Tests**: `tests/unit/cutover-closure-gate.test.ts`, `tests/fixtures/cutover-closure/pr-230.contract.md`, `tests/unit/refactor-policy.test.ts`, `tests/workflow-contract.test.ts`, `tests/cli/run.test.ts`, and existing `tests/unit/helper-projection-drift.test.ts` / `scripts/sync-helper-sources.ts --check` are authoritative verification surfaces.
- **Scale signal**: this is an acknowledged 13-file product/test surface, not a new service. At 10x repository size, repeated fixed-string scans fail first; v1 accepts that cost under the 45-second degradation threshold and does not add a cache before the falsifier passes.

## P2: Concrete data flow

1. The CLI resolves `--contract`, `--head`, and `--output` as safe repo-relative paths/refs; resolves `headSha` to an exact 40-hex commit; refuses symlink escapes, missing Git objects, dirty-tree substitution, and unsafe output locators.
2. It parses exactly one `## Refactor Kill List` JSON fence as a raw `RefactorKillListEntryV1[]` and exactly one `## Cutover Closure` JSON fence as `{ "protocol": 1, "entries": CutoverClosureEntryV1[] }`. No alternate headings, legacy fields, aliases, or inferred selectors are accepted.
3. The validator admits only `path|relation|symbol`; every kill-list selector must appear exactly once in the closure inventory, no closure selector may be absent from the kill list, and all six categories must occur exactly once. `retained_with_reason` requires non-empty `reason` and RFC3339 `expiry`; expiry must be later than the candidate commit timestamp. Shape, completeness, duplicate, expired-retention, registry, or unsafe-path failures return only `refactor_closure_incomplete`.
4. `path` checks use Git object existence at `headSha`; `symbol` uses exact word fixed-string search; `relation` uses exact fixed-string search. Both searches enumerate the exact candidate Git tree, never the worktree, CodeGraph, archctx, AST semantics, language heuristics, directory-name classification, or diff-based guessing. Only selectors whose disposition is `removed` are absence-gated; other dispositions are declaration evidence, not locally reinterpreted semantics.
5. Remaining removed selectors produce `residues[{selector,foundAt[]}]`, `status:'residue'`, stderr code `refactor_closure_residue`, and non-zero exit. A required invocation with no kill list produces `status:'incomplete'`, stderr code `refactor_closure_missing`, and non-zero exit. A non-required invocation with no kill list produces `status:'not_applicable'`, empty selectors/residues, and zero exit.
6. Success emits exactly the PRD `CutoverClosureV1`: protocol/kind, contract path and raw-byte SHA-256, exact head SHA, six entries, empty residues, `status:'closed'`, and `closureSha256`. `closureSha256` is lowercase bare 64-hex over the repository canonical-JSON algorithm with `closureSha256` omitted; object keys sort recursively and array order remains significant. The output file is the future evidence `locator`; `{kind:'cutover_closure', locator, sha256:closureSha256}` must satisfy the upstream bare-digest invariant.
7. `readRefactorPolicy` reads only `policy.refactor.mode` and `policy.refactor.require_cutover_closure`, defaults them to `off` and `false`, accepts only `off|shadow|active` and boolean respectively, and throws on malformed values. `loadRefactorPolicy` treats a missing file/section as those defaults but never turns malformed JSON or values into an enabled state. This slice does not activate or consume the flag in workflow wiring; the CLI's explicit `--require-cutover-closure` supplies the required-context test seam.

## P3: Design decision

The public contract is a clean break from A. Salvage by reading individual files from `3fe8f4db02098d92b602868611b1bddde79894dc`, not by cherry-picking the commit: keep safe-path checks, bounded traversal ideas, exact path/symbol scans, projection parity, deadline validation, and test-fixture mechanics; rewrite old `surface_class`, `items`, `literal`, `remove|replace|retain_live|retain_migration`, broad issue codes, `pass|fail`, prefixed/non-canonical hashes, Task Profile coupling, and all verifier wiring. The invariant is explicit inventory completeness plus exact absence at a named Git head. The close alternative—replaying all of A—was rejected because it preserves obsolete semantics, unrelated ownership migration, and stale projections.

This plan assumes exact fixed-string relation evidence is sufficient for Module 1. If PR #230 cannot be classified without semantic inference, the premise collapses: stop with policy still `off` / `require_cutover_closure:false`, do not add heuristics or wiring, record the counterexample in the task review/research, and return the PRD to design.

## Public interfaces and validation contract

### Contract input

`## Refactor Kill List` contains a JSON array using the upstream shape exactly:

```json
[
  {"kind":"path","selectorId":"src/core/engineers/provider-thread-effect.ts","required":true},
  {"kind":"path","selectorId":"src/effects/engineers/provider-thread-effect-store.ts","required":true},
  {"kind":"symbol","selectorId":"ProviderThreadEffectIntentV1","required":true},
  {"kind":"symbol","selectorId":"buildProviderThreadEffectIntent","required":true},
  {"kind":"path","selectorId":"tests/unit/me3a-provider-thread-effect.test.ts","required":true},
  {"kind":"relation","selectorId":"src/core/engineers/provider-thread-effect.ts","required":true},
  {"kind":"relation","selectorId":"repo-harness/provider-thread-effects/v1","required":true}
]
```

`## Cutover Closure` contains only protocol and the six exactly-once entries. For PR #230 the handwritten inventory is:

```json
{
  "protocol": 1,
  "entries": [
    {"category":"old_implementation","disposition":"removed","selectors":[{"kind":"path","value":"src/core/engineers/provider-thread-effect.ts"},{"kind":"path","value":"src/effects/engineers/provider-thread-effect-store.ts"},{"kind":"symbol","value":"ProviderThreadEffectIntentV1"}],"reason":null,"expiry":null},
    {"category":"callers","disposition":"removed","selectors":[{"kind":"symbol","value":"buildProviderThreadEffectIntent"}],"reason":null,"expiry":null},
    {"category":"fallback","disposition":"not_applicable","selectors":[],"reason":null,"expiry":null},
    {"category":"tests","disposition":"removed","selectors":[{"kind":"path","value":"tests/unit/me3a-provider-thread-effect.test.ts"}],"reason":null,"expiry":null},
    {"category":"docs_and_projections","disposition":"migrated","selectors":[{"kind":"relation","value":"src/core/engineers/provider-thread-effect.ts"}],"reason":null,"expiry":null},
    {"category":"compatibility_expiry","disposition":"retained_with_reason","selectors":[{"kind":"relation","value":"repo-harness/provider-thread-effects/v1"}],"reason":"PR #230 retains a bounded V1 store archive/removal migration in agent-runtime-effect-store.ts","expiry":"2027-08-31T00:00:00Z"}
  ]
}
```

No new named input protocol is introduced: these are strict contract sections composed from the frozen upstream entry and PRD closure-entry types. Output is the sole `CutoverClosureV1` protocol.

### Closed error surface

| Code | Trigger | Process/result oracle |
|---|---|---|
| `refactor_closure_residue` | one or more `removed` selectors still exist at exact `headSha` | exit 1; `status:'residue'`; non-empty sorted `residues`; no warning path |
| `refactor_closure_incomplete` | malformed/duplicate/extra selector, missing one of six categories, invalid disposition/reason/expiry, unsafe locator/ref, registry/projection mismatch, or unreadable required evidence | exit 1; `status:'incomplete'`; no old/internal code escapes |
| `refactor_closure_missing` | required context has no kill-list section | exit 1; `status:'incomplete'`; no inferred selector |

## First Proof Point: merged PR #230

- **Historical subject**: PR `#230`, merge/squash commit `4f7cb37e0edf74a8d0b334a8a24370ac48807f86`, base `aef4edff1fd21ca97643e0d13cf5fd29ba746d69`.
- **Why this PR**: its diff deletes the old core implementation `src/core/engineers/provider-thread-effect.ts`, store `src/effects/engineers/provider-thread-effect-store.ts`, and old unit test; migrates CLI/MCP/overlay callers; changes architecture/spec/research docs; and intentionally retains bounded `repo-harness/provider-thread-effects/v1` migration references. It therefore exercises old implementation, callers, tests, docs/projections, and compatibility rather than a toy rename.
- **Positive milestone**: the handwritten kill list/inventory above against head `4f7cb37e...` returns exit 0, `status:'closed'`, six entries, empty residues, and a recomputable bare `closureSha256` whose evidence-ref projection passes the upstream invariant.
- **Residue milestone**: run the same contract against base `aef4edff...`; `ProviderThreadEffectIntentV1`, `buildProviderThreadEffectIntent`, all three removed paths, and their locations must yield only `refactor_closure_residue`, exit 1, and non-empty deterministic `residues[]`.
- **Incomplete milestone**: remove the `fallback` entry; the result must yield only `refactor_closure_incomplete`, exit 1, and never downgrade to warning or infer the category.
- **Missing milestone**: remove `## Refactor Kill List` and invoke `--require-cutover-closure`; the result must yield only `refactor_closure_missing`, exit 1, and no selectors. Run without the flag must return `not_applicable`, exit 0, and still infer nothing.
- **Falsifier/stop**: fail the work-package if the positive case cannot close or the negative cases cannot be distinguished using only explicit inventory plus exact Git reads, if the same input produces different canonical bytes/digest, or if a passing result requires path-language heuristics, CodeGraph, archctx, manual waiver, or unlisted data. Stop before wiring; keep policy off/false; record the exact counterexample; do not broaden the selector/error schema.

## File changes

| File | Action | Decision-complete scope |
|---|---|---|
| `tests/unit/cutover-closure-gate.test.ts` | add first | unit/CLI tests for strict parsing, six-category completeness, selectors, dispositions, three errors, canonical digest, exact-head scans, unsafe paths/symlinks, and no legacy vocabulary |
| `tests/fixtures/cutover-closure/pr-230.contract.md` | add first | exact handwritten PR #230 kill list and six-category inventory above |
| `tests/unit/refactor-policy.test.ts` | add first | defaults off/false; valid modes/boolean; malformed JSON/section/value fail closed; no silent enablement |
| `tests/workflow-contract.test.ts` | modify first | assert canonical/installed manifest equality, exact cutoverClosure vocabulary/authority/evidence shape, and helper inventory registration |
| `tests/cli/run.test.ts` | modify first | assert `cutover-closure` appears once in the existing Planning & execution group and stays within help budgets |
| `scripts/cutover-closure.ts` | add | sole self-contained evaluator/CLI; public protocol entirely PRD/C-shaped; salvage mechanics only from WIP SHA |
| `assets/templates/helpers/cutover-closure.ts` | add by canonical sync | byte-identical packaged projection; never hand-maintained authority |
| `assets/workflow-contract.v1.json` | modify | add exact `cutoverClosure` protocol/category/disposition/selector/error/authority/projection/evidence registry and helper entry |
| `.ai/harness/workflow-contract.json` | sync | byte-identical installed projection of the canonical manifest |
| `scripts/workflow-contract.ts` | modify | closed validation for the new manifest section; no alternate/legacy values |
| `assets/templates/helpers/workflow-contract.ts` | sync | byte-identical packaged projection of the manifest validator |
| `src/core/refactor/policy.ts` | add | `RefactorPolicy`, `readRefactorPolicy`, `loadRefactorPolicy`; only mode and require flag, defaults off/false |
| `src/cli/commands/run.ts` | modify | register the new helper in the existing help group; no new command or workflow invocation |

No dependency, package, service, credential, database, migration, architecture projection, or external provider is added.

## Change Assessment contract

The projected task contract must contain object oracles, never bare strings:

```json
{"protocol":1,"oracles":[{"id":"cutover-closure-protocol-and-first-proof","kind":"deterministic_test","paths":["scripts/cutover-closure.ts","assets/templates/helpers/cutover-closure.ts","assets/workflow-contract.v1.json",".ai/harness/workflow-contract.json","scripts/workflow-contract.ts","assets/templates/helpers/workflow-contract.ts","src/cli/commands/run.ts","tests/unit/cutover-closure-gate.test.ts","tests/fixtures/cutover-closure/pr-230.contract.md","tests/workflow-contract.test.ts","tests/cli/run.test.ts"]},{"id":"refactor-policy-reader-defaults","kind":"deterministic_test","paths":["src/core/refactor/policy.ts","tests/unit/refactor-policy.test.ts"]}]}
```

## Verification commands

```bash
bun test tests/unit/cutover-closure-gate.test.ts tests/unit/refactor-policy.test.ts tests/workflow-contract.test.ts tests/cli/run.test.ts --timeout 60000
bun test tests/unit/helper-projection-drift.test.ts --timeout 60000
bun scripts/sync-helper-sources.ts --check
cmp scripts/cutover-closure.ts assets/templates/helpers/cutover-closure.ts
cmp scripts/workflow-contract.ts assets/templates/helpers/workflow-contract.ts
bun scripts/cutover-closure.ts verify --repo . --contract tests/fixtures/cutover-closure/pr-230.contract.md --head 4f7cb37e0edf74a8d0b334a8a24370ac48807f86 --output .ai/harness/checks/pr-230-cutover-closure.v1.json
bun test --timeout 60000
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

## Success, rollback, and stop conditions

- **Success**: all six categories are exactly-once; Scenario 1-3 and PR #230 First Proof Point pass; output canonical digest is upstream-compatible; policy remains off/false; all focused/root checks pass; forbidden surfaces are untouched.
- **Rollback**: revert this work-package's implementation commit; no persisted user data or external state exists. Removing the new helper/schema/policy/test files and restoring the two workflow manifests returns the prior state.
- **Stop**: stop before any workflow wiring if the falsifier triggers, upstream contract changes, the WIP SHA cannot be read, exact-head evidence cannot remain deterministic, or implementation requires a path outside the file table. Do not solve any stop by reintroducing A's public protocol, heuristics, alias, fallback, or extra scope.

## Self-decided defaults

- Use PR #230 because it is the smallest recent merged example that simultaneously deletes old implementation/store/test, migrates real callers, updates docs, and retains an explicit compatibility seam.
- Treat relation selectors as opaque exact fixed strings over the named Git tree, not graph semantics.
- Use candidate commit time—not wall-clock time—for deterministic compatibility-expiry validation.
- Require exactly one entry for each of the six categories and exact one-to-one coverage of every kill-list selector.
- Make all `CutoverClosureV1` SHA-256 fields lowercase bare 64-hex so `closureSha256` feeds `RefactorExecutionEvidenceRefV1` without translation.
- Keep required-context selection as an explicit CLI flag in this unwired slice; the policy reader defaults off/false and no existing workflow consumes it.
- Keep the work-package single-phase: the evaluator, schema projection, reader, tests, and falsifier form one verification boundary and no partial phase is independently useful.

## Task Breakdown
- [ ] **T1 — Freeze red tests and PR #230 fixture first.** Add or modify the four focused test files plus the exact fixture before product code. **Oracle:** `bun test tests/unit/cutover-closure-gate.test.ts tests/unit/refactor-policy.test.ts tests/workflow-contract.test.ts tests/cli/run.test.ts --timeout 60000` exits non-zero specifically because helper/policy/schema are absent, while the fixture asserts PR/base SHAs resolve.
- [ ] **T2 — Land the closed policy reader skeleton.** Implement only mode plus `require_cutover_closure`, with absence→off/false and malformed values→throw. **Oracle:** focused policy tests pass; `rg -n 'provider|proposal_author|workflow_routing|post_merge' src/core/refactor/policy.ts` returns no matches.
- [ ] **T3 — Implement strict contract parsing and completeness before scans.** Admit exactly the two JSON sections, six categories, four dispositions, three selector kinds, exact kill-list coverage, retained reason/expiry, and three public error codes. **Oracle:** parser/table tests pass and `rg -n 'surface_class|literal|retain_live|retain_migration|closure_missing|live_reference_remaining' scripts/cutover-closure.ts assets/templates/helpers/cutover-closure.ts` returns no matches.
- [ ] **T4 — Implement exact-head evaluator and canonical evidence.** Use Git object reads for path/relation/symbol, deterministic sorted residues, raw contract digest, canonical closure digest, and safe locator checks; never inspect the dirty worktree as candidate authority. **Oracle:** positive/residue/digest/order/symlink tests pass twice byte-identically; evidence ref has kind `cutover_closure`, non-empty locator, and bare 64-hex digest.
- [ ] **T5 — Register and project schema/helper without workflow wiring.** Update the canonical manifest, its installed projection, validator, CLI help group, and byte-identical helper mirrors. **Oracle:** `bun scripts/sync-helper-sources.ts --check`, `bun test tests/unit/helper-projection-drift.test.ts tests/workflow-contract.test.ts tests/cli/run.test.ts --timeout 60000`, and `cmp` for both source/mirror pairs all pass.
- [ ] **T6 — Execute the PR #230 First Proof Point.** Run positive head plus residue/incomplete/missing variants exactly as specified above, capturing command/output in the eventual review evidence. **Oracle:** four milestones return the stipulated exit/status/code/residue results; runtime stays under 45 seconds; repeated positive output and digest are byte-identical.
- [ ] **T7 — Prove scope exclusion and full repository safety.** Confirm no forbidden wiring/profile/hook/architecture files changed and run full required checks. **Oracle:** the path set from the contract worktree metadata record's exact `base_commit` through `HEAD` is a subset of the 13-file table; forbidden-path `git diff --quiet`; `bun test --timeout 60000`, deploy SQL order, architecture sync, task sync, strict workflow check, project-state audit, and init dry-run all pass.
- [ ] **T8 — Close exact-subject review evidence without activation.** Project the two object oracles into the task contract, perform read-only Waza `/check` review, and bind the final subject while leaving policy default off/false and adding no workflow caller. **Oracle:** Change Assessment validates both object oracles, review recommends pass, `repo-harness run check-task-workflow --strict` ends `[workflow] OK`, and `rg -n 'cutover-closure|require_cutover_closure' scripts/{plan-to-todo.sh,verify-contract.sh,verify-sprint.sh,contract-run.ts}` returns no matches.

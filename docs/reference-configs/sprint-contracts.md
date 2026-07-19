# Task Contracts and Sprint Backlogs

Task contracts are the repo-local agreement between planner, generator, and evaluator.
Sprint backlogs are the ordered program layer that expands into task contracts.

## Three-Layer Glossary

The word "sprint" historically named a single execution slice in this harness. The current vocabulary is exactly three layers:

| Term | Layer | Artifact | Owner |
|------|-------|----------|-------|
| **PRD** | Product planning | `plans/prds/<stamp>-<slug>.prd.md` using `.claude/templates/prd.template.md`; lifecycle `Draft -> Approved -> Superseded` | PM + architect planning |
| **Sprint** | Program execution backlog | `plans/sprints/<stamp>-<slug>.sprint.md` (Source PRD + Architecture Notes + ordered Backlog + Execution Log) | PM + architect planning |
| **Task Contract** | Execution slice | `tasks/contracts/<plan-stem>.contract.md` plus its review/notes trio | One plan, one worktree |

- A PRD decomposes `docs/spec.md` intent into product direction, users, success criteria, acceptance scenarios, module behavior, data model, performance targets, and developer handoff. `repo-harness-prd` writes PRDs with compact/standard tiers and evidence rules for `[UNKNOWN]` / `[UNVERIFIED]` facts.
- A Sprint decomposes a PRD or `docs/spec.md` into an ordered backlog; each backlog task executes as one task-contract slice through the existing plan -> contract -> worktree -> verify flow.
- `tasks/todos.md` stays the deferred-goal ledger; it never carries the sprint backlog or any active checklist.
- Backlog row mode is a granularity decision. `contract` rows are allowed to become a top-level plan plus task contract only when they are captured as `Artifact Level: work-package` and pass the plan Promotion Gate. `inline` and `checklist-row` work stays inside the sprint backlog or active plan `## Task Breakdown` and must not generate contract/review/notes artifacts.
- Legacy filenames: `verify-sprint.sh` and `new-sprint.sh` predate the program layer and are kept for downstream compatibility. Read them as task-contract verification helpers. New generated artifact headings and plan metadata should use **Task Contract** and **Task Review**.
- Sprint lifecycle: `Draft -> Approved -> Executing -> Done -> Archived`, tracked in the sprint file's `> **Status**:` line. Use `repo-harness run sprint-backlog` for sprint operations; `.ai/harness/sprint/active-sprint` (runtime state, not committed) marks the single active sprint. Harness installs predating the sprint layer must upgrade the global/package runtime before invoking it. `repo-harness run check-task-workflow --strict` rejects Approved/Executing sprints whose PRD/source section is placeholder-only or whose backlog rows lack a concrete acceptance line.

## Inventory First

- Every execution-ready `plans/plan-*.md` should name the active plan, owning worktree, expected contract, review, notes file, deferred-goal ledger, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, scope authority, plan switching rule, and worktree isolation path. Checks latest files are runtime evidence pointers/cache, not commit surface.
- Every execution-ready `plans/plan-*.md` should declare `> **Artifact Level**: work-package`, `> **Promotion Reason**:`, `> **Verification Boundary**:`, and `> **Rollback Surface**:`. It should also fill `## Promotion Gate` with the merge/PR unit, rollback surface, verification boundary, review/acceptance boundary, high-risk surface, and why this cannot remain a checklist row.
- Every `tasks/contracts/*.contract.md` should repeat the source plan, deferred-goal ledger, review, notes, checks, run snapshots, scope gate, and completion gate.
- If the inventory is incomplete, keep the plan in Draft or revise the contract before editing implementation files.

## Required Sections

- Goal
- Scope and non-goals
- Allowed paths
- Task Profile
- Delegation contract
- Exit criteria
- Verification commands
- Risks and rollback point

## Task Profiles

New task contracts should declare `> **Task Profile**:` before ownership
metadata. The profile sets the default human expectation for writable scope and
review focus.

| Profile | Default expectation |
|---|---|
| `code-change` | Runtime behavior may change within the contract's explicit allowed paths. |
| `bugfix` | Same allowed-path defaults as `code-change`; additionally requires a concrete `## Root Cause Evidence` section (`root_cause`, `repro`, `regression_guard`, `pre_fix_failure_artifact`) and passes an additional pre-fix failure evidence gate (see below). |
| `docs-only` | Documentation, plans, notes, and reviews only; `src/` and `tests/` are not allowed by default. |
| `ledger-closeout` | Close already-landed workflow evidence only; runtime source, tests, and hook paths are not allowed by default. |
| `migration` | Scripts, templates, assets, docs, and tests may change; preserve user-authored files. |
| `eval-only` | Eval, fixture, run, docs, and review surfaces only; runtime `src/` is not allowed by default. |
| `delegated-run` | Worker edits only contract-defined paths; parent remains the gate owner. |

Older contracts without `Task Profile` remain valid as legacy contracts, but
new generated contracts should include the field.

## Delegation Contract Fields

New contracts include a `## Delegation Contract` YAML block between allowed paths and exit criteria. This block is the forward-compatible contract-kappa surface for future delegated execution; it is metadata unless a runner such as `contract-run` consumes it.

- `budget`: optional limits for `tokens`, `runner_invocations`, and `wall_time_minutes`. `null` means the current session/default command limits apply. `wall_time_minutes` is a hard limit mechanically enforced via the bounded process runner deadline; a non-null `tokens` is REJECTED at preflight (contract-run has no token-budget enforcement mechanism, so it refuses to run with an unenforced constraint instead of silently treating it as advisory).
- `permission_scope`: the execution permission model. The default `mode: inherit_allowed_paths` means worker edits are limited by the contract `allowed_paths`; `writable_paths: []` means no narrower override; `network: inherited` means no new network permission is granted by the contract itself.
- `roles`: named responsibilities for `parent`, `explorer`, `worker`, and `verifier`. The parent remains the approval/checkpoint owner; explorer and verifier are read-only; worker may edit only within `allowed_paths` or a narrower `writable_paths` list. The verifier rubric is exactly the contract `exit_criteria`.

Existing contracts without this block remain valid. `repo-harness run verify-contract` continues to evaluate only the `exit_criteria` YAML block, so adding delegation metadata must not make old or new contracts fail verification.

## Root Cause Evidence Gate

As of this revision, `repo-harness run verify-contract` (and the equivalent `contract-run.ts` brief preflight) additionally evaluates the markdown `## Root Cause Evidence` section, but **only** when the contract's `> **Task Profile**:` header is `bugfix`. This is a deliberate, scoped expansion of the exit-criteria-only promise above: contracts with any other `Task Profile` (including contracts that omit the field entirely, which remain legacy passthrough) are unaffected and continue to be evaluated exit-criteria-only.

For a `bugfix` contract, the gate requires all four `## Root Cause Evidence` fields to be filled in with concrete (non-template) content:

- `root_cause` and `repro` must be non-empty and not the template placeholder text.
- `regression_guard` must name a test path that also appears under `exit_criteria.tests_pass`.
- `pre_fix_failure_artifact` must point to a file that exists, contains a non-zero `PRE_FIX_EXIT=` line, and contains the `regression_guard` path string. Capture it on the unfixed code with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — a pipe swallows the exit status). A passing run (for example one that only prints `0 fail`) does not satisfy this gate; the artifact must show the pre-fix failure with a nonzero recorded exit code.

Both `verify-contract.sh` and `contract-run.ts` implement this check independently against the same fixture expectations so that a `bugfix` contract cannot pass one gate while failing the other.

## Evidence Requirements Gate

New task contracts include a `## Evidence Requirements` fenced yaml block between `Allowed Paths` and `Delegation Contract`:

```yaml
evidence_requirements:
  benchmark: not_applicable
```

`benchmark` is a reviewed contract declaration, not an inference from `evals/harness/reports/profile-comparison.*` presence, changed filenames, or `Task Profile`. It accepts exactly two values, `required` or `not_applicable`. A missing `## Evidence Requirements` block, more than one such block in the contract, a missing `benchmark:` key, or any other value fails closed wherever the declaration is consulted: `workflow_external_acceptance_status`, `workflow_benchmark_evidence_checks_match`, and `verify-sprint.sh`'s `benchmark_evidence.status` derivation. Unlike `Task Profile`, there is no legacy-passthrough exemption for an absent block.

- `not_applicable` preserves any existing benchmark report on disk and excludes it from this contract's acceptance and checks binding: the coupled review's `Benchmark Evidence SHA256` must read literally `not-applicable`, `.ai/harness/checks/latest.json`'s `benchmark_evidence.status` must read `not_applicable`, and report presence no longer fails the checks match.
- `required` keeps byte-exact strictness: the current authoritative report's fingerprint and benchmark subject hash must resolve, and both the review's `Benchmark Evidence SHA256` and the recorded checks fingerprint/subject must match that current evidence exactly; a missing or drifted report fails.

## Verification Execution Boundary

`verify-contract.sh --read-only` is read-only for contract state writes only: it does not rewrite the contract `> **Status**:` line. It executes `tests_pass` with Bun and `commands_succeed` in a non-login Bash with `BASH_ENV` unset. One fixed absolute 600-second budget covers the whole invocation; each command records duration, exit status, signal, and timeout state, and expiry terminates the command's process group before the verifier returns. The budget is not a policy or environment knob.

Verification is an evidence consumer. `commands_succeed` must not launch profile benchmarks/providers, `adopt`, evidence-producer scripts, or substantive installs; the verifier rejects those command shapes before execution. Produce expensive evidence explicitly, validate its subject/provenance/bytes, then let `verify-sprint` consume that frozen artifact through `verify-contract --read-only`.

A verifier consumes already-produced evidence; it must not become the producer of expensive, runtime-heavy evidence (for example, a full multi-provider/multi-profile benchmark matrix). An authoritative matrix or similarly expensive one-time evidence run belongs outside `commands_succeed`: the author runs it once on a clean checkout before merge and commits the resulting tracked report (for example `evals/harness/reports/profile-comparison.json`/`.md`); the contract then verifies that report's bytes and provenance, not a live re-run.

## Status Rules

- `Pending`: drafted but not approved for execution
- `Active`: approved for implementation
- `Blocked`: waiting on a missing dependency or decision
- `Verified`: all machine checks passed; awaiting or holding review
- `Archived`: sprint is complete or superseded

## Review Coupling

- A contract is not truly done until the matching review file records a passing recommendation.
- `tasks/reviews/<plan-stem>.review.md` should be filled from Waza `/check` after verification and cite the contract, implementation notes, checks file, run snapshot, canonical `## External Acceptance Advice`, and any manual observations. Rubric v2 binds both sections to `Reviewed Subject SHA256` with scope `normalized-final-content`; target revision is metadata and invalidates acceptance only when target movement overlaps reviewed paths.
- `tasks/notes/<plan-stem>.notes.md` captures task-local decisions and should be archived or promoted deliberately, not left as hidden long-term memory.
- Closeout is promote-then-archive: durable truths move into `docs/architecture/`, `docs/researches/`, `docs/spec.md`, or `tasks/lessons.md` before `archive-workflow.sh` moves fulfilled plan/contract/review/notes/todo artifacts into `plans/archive/` and `tasks/archive/`.

### Manual Check Evidence

`exit_criteria.manual_checks` remains a scalar list of exact requirements. The built-in
`Evaluator review file recommends pass` criterion continues to read the review
recommendation directly. Every other manual criterion must have one exact matching item
under the coupled review's `## Manual Check Evidence` section:

```markdown
- [x] Paid tenant can reopen the saved view after refresh
  - Evidence: Chrome run 20260710-1130, screenshot artifacts/refresh.png
```

The checkbox must be checked and `Evidence:` must contain a concrete observation,
command result, screenshot/artifact path, or reviewer note. Missing, unchecked,
text-mismatched, empty, or placeholder-only evidence fails closed. A summary elsewhere
in the review does not satisfy this gate; copy the contract requirement exactly so the
evaluator never guesses semantic equivalence.

## Worktree Lifecycle

- When `.ai/harness/policy.json` has `worktree_strategy.auto_for_contract_tasks: true`, `repo-harness run plan-to-todo --plan <approved-plan>` starts a linked `codex/<slug>` worktree instead of mutating the primary tree.
- `contract-worktree start` records the exact source `HEAD` as `base_commit` in
  `.ai/harness/worktrees/<slug>.json`. `verify-sprint` uses that immutable commit as its
  default branch diff base, so later base-branch or `origin/main` drift cannot add
  pre-task commits to `allowed_paths` evaluation. Explicit `REPO_HARNESS_DIFF_BASE`,
  `HARNESS_DIFF_BASE`, and CI `GITHUB_BASE_REF` values retain precedence. Legacy
  metadata without `base_commit` first resolves the last reachable commit before its
  recorded `started_at`, then falls back to the recorded `base_branch`; the next fresh
  worktree start records immutable provenance.
- Execute the sprint in that linked worktree. The primary worktree remains a merge target and must stay clean before merge-back.
- After implementation, run Waza `/check` so the review file recommends pass, record canonical passing `## External Acceptance Advice` from the peer reviewer for the current review subject and benchmark evidence, then run `repo-harness run contract-worktree finish`. Human Review Card remains the reading summary but is not an acceptance authority. The finish command gates on canonical acceptance before `repo-harness run verify-sprint`, commits the branch, and fast-forwards the target branch only when the target worktree is clean.

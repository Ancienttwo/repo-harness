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

- A PRD decomposes `docs/spec.md` intent into product direction, users, success criteria, acceptance scenarios, module behavior, data model, performance targets, and developer handoff. `repo-harness-product`'s PRD mode writes PRDs with compact/standard tiers and evidence rules for `[UNKNOWN]` / `[UNVERIFIED]` facts.
- A Sprint decomposes a PRD or `docs/spec.md` into an ordered backlog; each backlog task executes as one task-contract slice through the existing plan -> contract -> worktree -> verify flow.
- `tasks/todos.md` stays the deferred-goal ledger; it never carries the sprint backlog or any active checklist.
- Backlog row mode is a granularity decision. `contract` rows are allowed to become a top-level plan plus task contract only when they are captured as `Artifact Level: work-package` and pass the plan Promotion Gate. `inline` and `checklist-row` work stays inside the sprint backlog or active plan `## Task Breakdown` and must not generate contract/review/notes artifacts.
- Legacy filenames: `verify-sprint.sh` and `new-sprint.sh` predate the program layer and are kept for downstream compatibility. Read them as task-contract verification helpers. New generated artifact headings and plan metadata should use **Task Contract** and **Task Review**.
- Sprint lifecycle: `Draft -> Approved -> Executing -> Done -> Archived`, tracked in the sprint file's `> **Status**:` line. Use `repo-harness run sprint-backlog` for sprint operations; `.ai/harness/sprint/active-sprint` (runtime state, not committed) marks the single active sprint. Harness installs predating the sprint layer must upgrade the global/package runtime before invoking it. `repo-harness run check-task-workflow --strict` rejects Approved/Executing sprints whose PRD/source section is placeholder-only or whose backlog rows lack a concrete acceptance line.

## Sprint Backlog Schema

The `## Backlog` table has two schema versions, declared once in the sprint
header as `> **Backlog Schema**: 2`. An absent marker means schema 1; any other
declared value fails closed.

| Schema | Row shape | Task identity |
|---|---|---|
| 1 (retired) | `\| # \| Status \| Task \| Mode \| Acceptance \| Plan \|` | derived: `digest(protocol + repo identity + sprint path + exact Task cell)` |
| 2 | `\| # \| ID \| Status \| Task \| Mode \| Acceptance \| Plan \|` | read: the persisted `ID` cell, 64 lowercase hex characters |

Schema 2 exists because display text and identity are two data. Under schema 1 a
harmless title clarification produced a different `task_id`, which orphaned live
Leases and claim-scoped messages, broke the Work Graph carrier's mapping, and
made the renamed row freshly claimable. Under schema 2:

- `task_id` is the `ID` cell verbatim, minted once when the row is created and
  never edited, copied between rows, or regenerated;
- `task_revision = digest(protocol-v2 + task_id + exact Task cell + Mode cell + Acceptance cell)`,
  so a title, Mode, or Acceptance edit still drifts every offer and claim taken
  before it while identity survives;
- the Status and Plan cells stay out of both derivations, so a sibling row
  completing cannot invalidate a live claim;
- the row `#` index is not identity, so reordering rows changes nothing;
- `WorkPackageDefinitionV1.task_id` is the Work Graph join key. `task_ref`
  survives only as a derived display projection on the *projected* work package
  and must never be joined on.

A missing, malformed (not 64 lowercase hex), or duplicated `ID` cell fails
closed in `projectCanonicalTasks`, in every claim/offer/board path built on it,
and in `repo-harness run check-task-workflow --strict`.

### Migrating a schema 1 sprint

```bash
repo-harness sprint migrate-schema --sprint <repo-relative sprint> --target-ref <ref>
```

The migration is one-shot and fail-closed. It reads the sprint at one canonical
ref, derives each row's existing schema 1 identity, and refuses when: the
working tree copy differs from that ref, two rows share a Task cell (their
schema 1 identity is the same value, so no mapping preserves both), a row has an
empty Task cell or a duplicate index, any affected row still holds a
non-released Lease, or the same-commit Work Graph carrier names a `task_ref`
that is not exactly one canonical row. On success it writes the `ID` column and
the carrier's `task_id` join keys, re-reads the result, proves every persisted id
equals its pre-migration derived id, and writes
`<sprint stem>.schema-migration.v1.json` binding the old/new sprint bytes, the
old/new Work Graph bytes, and the target commit.

`src/core/state/sprint-schema-v1.ts` is the only surviving schema 1 identity
derivation and is reachable exclusively from this command. Its compatibility
owner and removal trigger are recorded in `tasks/todos.md`.

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
- `regression_guard` must name a test path that also appears as a `package_test` check in `Verification Plan`.
- `pre_fix_failure_artifact` must point to a file that exists, contains a non-zero `PRE_FIX_EXIT=` line, and contains the `regression_guard` path string. Capture it on the unfixed code with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — a pipe swallows the exit status). A passing run (for example one that only prints `0 fail`) does not satisfy this gate; the artifact must show the pre-fix failure with a nonzero recorded exit code.

Both `verify-contract.sh` and `contract-run.ts` implement this check independently against the same fixture expectations so that a `bugfix` contract cannot pass one gate while failing the other.

## Evidence Requirements Gate

New task contracts include a `## Evidence Requirements` fenced yaml block between `Allowed Paths` and `Delegation Contract`:

```yaml
evidence_requirements:
  benchmark: not_applicable
```

`benchmark` is a reviewed contract declaration, not an inference from `evals/harness/reports/profile-comparison.*` presence, changed filenames, or `Task Profile`. It accepts exactly two values, `required` or `not_applicable`. A missing `## Evidence Requirements` block, more than one such block in the contract, a missing `benchmark:` key, or any other value fails closed in AcceptanceReceipt evidence normalization, `workflow_benchmark_evidence_checks_match`, and `verify-sprint.sh`'s `benchmark_evidence.status` derivation. Unlike `Task Profile`, there is no legacy-passthrough exemption for an absent block.

## Acceptance Policy and Receipt

Every new contract freezes reviewer, source, and waiver rule in a strict protocol-2 `## Acceptance Policy` JSON block. Claude hosts use `reviewer=Codex, source=codex-review`; Codex hosts use `reviewer=Codex, source=codex-plugin`, backed by OpenAI's official Claude Code Codex plugin app-server runtime. Protocol 1 remains readable only for historical receipts. `verify-sprint --prepare-acceptance` produces the final local evidence bundle; one semantic reviewer then returns `external_pass` or `reject`, or the named contract owner creates one typed UserWaiverGrant when the policy allows it. The grant binds the normalized contract and goal authorities, not a subject hash. Each user-waiver AcceptanceReceipt is then materialized from that grant and still binds the exact normalized implementation subject, verification and benchmark evidence, target revision, and reviewed paths. A semantic change invalidates the old receipt and requires fresh passing verification, but the same unchanged grant may materialize the new exact receipt without another owner prompt. Contract/goal authority changes or revocation invalidate the grant. Review Markdown is a deterministic projection, never authoring authority; user waiver never becomes external pass and never authorizes provider disclosure or merge.

Every new contract also carries exactly one strict `## Change Assessment` JSON
block. Its v1 shape is `{"protocol":1,"oracles":[...]}`; every oracle has a
stable id, one of `deterministic_test`, `runtime_readback`, or
`manual_acceptance`, and literal subject paths or `*`. Empty oracles are valid
only for a final subject that routes no risk. For every routed reason, an
allowed oracle kind must cover every selected path (or declare `*`); covering
one path in a multi-path reason leaves the other path in `oracle_gap`.
`manual_acceptance` is a legal declaration for human-facing acceptance context,
but it does not satisfy the machine-verifiable oracle required by
`authority_change`, `pattern_novelty`, or `irreversible_effect`. Change Assessment is recomputed
at `verify-sprint --prepare-acceptance`, never from a Hook journal or model
judgment. It binds a `ReviewSelectionPacket` to the exact final subject hash,
policy review base, target revision, selected paths, reasons, and declared
oracles. Its closed reason set is `authority_change`, `irreversible_effect`,
`pattern_novelty`, `reviewer_disagreement`, and `oracle_gap`; an unmet oracle
blocks. `pattern_novelty` routes only additions in a rename-aware whole diff
relative to the policy base, not a token already present in final content or a
pure rename destination; untracked files are wholly new. Reviewer disagreement
is an append-only post-review escalation on the same packet, never a new
diff/base authority. After escalation, rerun `verify-sprint --prepare-acceptance`:
it revalidates the packet against a freshly recomputed base and puts the overlay
in canonical evidence. Finalization rejects a checks file whose assessment no
longer equals the current packet, so the prior evidence and receipt are stale.
The v1 cutover is intentionally fail-closed: an in-flight contract created
before this block existed must add and review its explicit declaration before
running the upgraded verifier; no compatibility oracle is inferred.

`AcceptanceReceipt` remains protocol 2 and the sole merge authority. It strictly
recomputes the active policy/contract base assessment from the exact final
subject before accepting an envelope; a self-hashed declared assessment or
packet is not sufficient. It binds
the packet through the canonical verification-evidence hash rather than adding
duplicate receipt fields. Historical receipt verification recomputes the packet against its frozen target
revision. Current publication separately requires an exact current-base
integration decision; target movement does not erase historical test facts.

- `not_applicable` preserves any existing benchmark report on disk and excludes it from this contract's acceptance and checks binding: the coupled review's `Benchmark Evidence SHA256` must read literally `not-applicable`, `.ai/harness/checks/latest.json`'s `benchmark_evidence.status` must read `not_applicable`, and report presence no longer fails the checks match.
- `required` keeps byte-exact strictness: the current authoritative report's fingerprint and benchmark subject hash must resolve, and both the review's `Benchmark Evidence SHA256` and the recorded checks fingerprint/subject must match that current evidence exactly; a missing or drifted report fails.

## Verification Execution Boundary

`Verification Plan` JSON is the only executable contract authority. `verify-contract --read-only` suppresses contract header writes and delegates execution to `verification-plan execute`; `verification-plan evaluate`, automatic done/Stop hooks, receipt verification, and merge seals only consume evidence. Explicit preflight checks run before verification checks, and a failing preflight prevents expensive execution. Command checks use non-login Bash with `BASH_ENV` unset; package tests use the nearest package test script. The existing process supervisor owns timeout, process-group cleanup, and command-level expensive-run locking.

Execution identity binds a complete Git-visible tree, the descriptor, cwd, toolchain, and declared environment. A changed tree may require `baseline_with_delta`: the author names an immutable successful baseline and current delta checks. It never means the new tree passed the old full suite. An expensive miss returns `needs_verification_plan` unless the operator supplies an explicit rerun reason. Legacy executable YAML is rejected; use `migrate-verification-plan --contract <path> --mapping <json> --write` for the one-shot, author-mapped migration.

### Long Gate Commands Belong to the Orchestrator

The same 600-second ceiling applies to the host stream watchdog that kills a
delegated agent after 600 seconds of silence. Any gate command expected to
exceed roughly five minutes (`verify-sprint`, a full `bun test`) is run by the
orchestrator's main loop in the background, not foreground-waited inside a
dispatched worker. An agent handed such a command names the command and returns
BLOCKED on its role's machine-readable first line (`RESULT:` / `VERDICT:` /
`RECOMMENDATION:`), handing control back; it does not stand watch. The
standing advisory is injected at SubagentStart under the
`[repo-harness:long-command-guardrail]` marker.

Verification commands consume previously produced external evidence. Command checks must not launch profile benchmarks/providers, `init`, evidence-producer scripts, or substantive installs; the verifier rejects those command shapes before execution. Produce expensive evidence explicitly, validate its subject/provenance/bytes, then let `verify-sprint` consume that frozen artifact through `verify-contract --read-only`.

A verifier consumes already-produced evidence; it must not become the producer of expensive, runtime-heavy evidence (for example, a full multi-provider/multi-profile benchmark matrix). An authoritative matrix or similarly expensive one-time evidence run belongs outside command checks: the author runs it once on a clean checkout before merge and commits the resulting tracked report (for example `evals/harness/reports/profile-comparison.json`/`.md`); the contract then verifies that report's bytes and provenance, not a live re-run.

## Profile Snapshots and Scope Changes

SessionStart's workflow profile describes the state observed at that time.
PreEdit resolves the proposed edit together with the current implementation diff;
additional paths, capabilities, or an explicit raised profile may require a
standard/strict workflow even when the earlier snapshot was lite. Current edit
authority supersedes historical ceremony guidance. Lite requires no plan but
allows user-requested planning. A missing-plan guard reports its current profile,
reasons, and state revision; standard needs one approved plan, while strict
retains the contract/worktree requirements. Do not resolve this transition by
disabling guards or treating a cached lite profile as permission to edit.

## Testing Policy and Artifact Standards

This section owns test selection, test-file creation, execution ownership and
test-document authoring. Root `AGENTS.md` owns repository-specific required
commands; the active contract's JSON `Verification Plan` owns its executable
checks. Templates, role prompts and reports refer here rather than maintaining
another policy. These are author/reviewer requirements: they do not imply a
new runtime validator, automatic coverage selector or CI evidence importer.

### Select the smallest sufficient coverage

Start with a concrete changed behavior, failure condition and owning boundary.
Find existing tests before choosing a command or adding a test. Record the
uncovered behavior and the expected observable result, not a desired test count.

| Change or risk | Sufficient starting point | Escalation condition |
| --- | --- | --- |
| Prose, formatting, task ledger | Relevant document/projection checks and required repository integrity | An executable template, generated configuration or runtime contract changes |
| Local decision or bug fix | Existing focused tests; add or extend the smallest regression guard for the missing behavior | A named caller, persistence or process boundary is not exercised |
| Cross-module behavior | Named composition/integration tests plus relevant focused checks | A concrete integration risk remains outside those named checks |
| CLI, installer, package or platform boundary | Real entrypoint/artifact/platform smoke for each changed boundary, with branch cases tested below that boundary | The public boundary cannot be represented by the focused smoke set |
| Explicit user, CI or release gate | Its required checks against the required subject and environment | Changes to that gate require their own authorized policy change |

A new full-suite criterion must cite either an explicit user/release/CI
requirement or the concrete integration gap, why named checks cannot cover it,
and expected cost. Merely writing a full-suite command into a contract is not
its own justification. Changed paths, file count, review depth, a new commit,
new test files, or an evidence cache miss do not establish necessity. Unknown
impact first requires tracing the owning path; if that leaves an uncovered
integration risk, document it and broaden coverage explicitly.

Local development defaults to focused checks plus the repository's required
integrity checks. Existing CI and release full-suite gates remain mandatory.
This policy does not authorize skipping a main-push suite because a PR passed,
or treating different platforms or source/package entrypoints as equivalent.

### Admit a test case or file

Before adding coverage, identify these four facts in the existing brief, plan
or contract Acceptance Notes; a short task may state them in its final report:

- The requirement or invariant, concrete trigger and observable failure.
- The existing covering test(s), and the specific gap requiring the addition.
- The lowest layer that can expose that failure; any reason to use a real
  process, filesystem, network, package install or platform boundary.
- The focused command and expected setup/runtime cost, including expensive
  fixtures or external dependencies when present.

Prefer extending the owning test file or parameterizing distinct inputs with
one stable oracle. Create a new file only for an independently meaningful
behavior/boundary, fixture isolation need, or an existing file that cannot
coherently own the case. Name it for behavior or boundary, not a task/date/PR.
Do not add assertions that only mirror implementation text, count symbols, or
pin incidental formatting unless those bytes are the actual public contract.
Mechanical prose/formatting changes do not need new product tests. Bug fixes
retain the required pre-fix failing guard and concrete Root Cause Evidence;
reuse an existing failing guard when it already proves the defect.

An end-to-end test must demonstrate a real boundary: keep distinct success,
error, ownership, recovery and platform scenarios when they prove different
invariants. Do not replay the entire installation or workflow merely to check
another pure input branch. Multiple layers covering similar inputs need a
named difference in the failure each catches. Delete a superseded test only
after mapping its assertions to retained coverage; equal names or input data
are not proof of redundancy.

Keep mutable HOME, repositories, environment and process state isolated.
Shared immutable fixtures are acceptable when copying/resetting preserves that
isolation. Prefer real synchronization signals to sleeps, retries or longer
timeouts. Measure process/setup cost before adding fixture caches or parallelism.
Do not add production-only abstractions solely to make tests faster when an
existing test seam or lower-level consumer can express the case.

For repeated test scaffolding, compare fixture semantics before copying another
`run`, `withTempRepo` or `initRepo`. When at least two real consumers need the
same process/temp-repository lifecycle, give that fixture one owner under the
existing test-helper directory. Keep domain builders separate. The shared
helper must make cwd, environment isolation, exit/output handling, timeout and
cleanup ownership explicit; do not hide retries or inherit the user's real
HOME by default. Do not create a configurable universal fixture framework for
unobserved future consumers.

Audit large test files by owned boundary and fixture cost. Before splitting a
helper-script suite, map each scenario to any existing script-specific tests;
move cases to their owner and remove only proven redundant coverage. Preserve
composition cases that catch failures across those scripts. Group budget or
other cross-cutting tests by their actual authority and behavior; issue numbers
belong in provenance, not a competing naming hierarchy. Report test discovery
and coverage preservation when moving files. Deduplicating wrapper source is a
maintenance improvement; fewer actual spawns, copies or installs must be
measured separately before claiming a runtime improvement.

For a slow-file investigation, separate fixture construction/copying, Git and
CLI subprocess time, and intentional waiting/concurrency. Count invocations of
shared heavy fixtures as well as duplicated helper definitions. A helper used
by many files can still rebuild the same costly baseline for every test. Where
setup itself is not under test, consider constructing an immutable seed once
and deriving a private repository/HOME for each case; preserve required commit
history, permissions and cleanup. Keep fresh construction where initialization
or history creation is the behavior being tested.

A concurrency flag alone is not evidence of parallel execution. Verify that
the runner actually schedules independent tests/files before changing limits.
Do not enable concurrency on tests sharing process-global state or a checkout.
Real locking, process recovery and provider waits need their own observed
bounds and completion signals, not a blanket speed target. Real pack/install
smokes may share a frozen tarball only when the tested artifact is identical;
keep distinct environments and installation paths, and test the packaging
lifecycle itself when that is the requirement.

### Execute once at each evidence boundary

The parent/contract owner selects final coverage. The implementation worker
runs focused checks while editing; after implementation and criteria are
frozen, one assigned execution owner prepares canonical acceptance evidence.
A long command follows the orchestrator ownership rule above. Do not first
manually execute every final check and then repeat them through preparation.

Declare each executable once. Compare kind, command/path, cwd and declared
environment inputs, not just IDs; two IDs do not justify the same execution.
Expand known aggregate scripts during planning so a full suite or `check:ci`
does not silently duplicate separately declared leaf checks. Do not infer shell
command equivalence with a second parser. A genuinely distinct input, platform,
artifact or process boundary remains a separate check with its own rationale.

Use the supported fields `phase`, `cost`, `evidence_policy`, `necessity` and
`inputs.env`. Full suites and known costly setup belong to `cost: expensive`;
do not label them normal to avoid rerun controls. Put executable preflight
checks before verification. The `necessity` names the behavior/gap or gate;
expected duration and coverage reasoning live in Acceptance Notes, not invented
JSON fields. Before an expensive run, state its cost and why it is necessary.

Reviewers, done/Stop handlers, finalize, finish and ship validate existing
subject-bound evidence. They do not rerun tests to make the evidence their own.
A reviewer reports missing, stale or failed evidence to the execution owner;
newly discovered uncovered risk returns to the parent for a revised plan.
For a review without canonical contract evidence, use the repository's scoped
verification rules and report the actual evidence limits.

An unchanged retry consumes valid exact evidence. An expensive miss or input
drift requires an explicit revised Verification Plan or rerun reason, never an
automatic repeat. After a passing full suite and a bounded edit, preserve the
old run as a historical baseline and use named current delta checks when the
full-suite trigger no longer applies. Record the baseline/run reference,
changed inputs, delta coverage and residual risk. Do not relabel the old pass
as a full-suite pass for the new subject or waive an explicit user/release gate.
Failed, timed-out or incomplete runs are not passes; newer same-input failure
must not be hidden by an older success. Stop after three fail/fix/reverify
rounds for the same issue and report the remaining cause.

### Create only the artifact that owns the decision

| Information | Existing home | Creation rule |
| --- | --- | --- |
| A small change's scope and coverage | Brief/final response; approved plan when the workflow profile requires one | No separate test plan/report for each small change |
| Executable acceptance checks | Contract `Verification Plan` JSON | Only when the task has a contract; exactly one executable authority |
| Coverage choice, cost, baseline/delta and omissions | Contract `Acceptance Notes`, or the active plan for standard work | Update the existing decision; do not create parallel command lists |
| Actual command results, timing and provenance | Canonical execution records in the existing evidence/run store | Produced by the executor; do not hand-author success records or duplicate logs in Markdown |
| Acceptance judgment and evidence references | Existing `tasks/reviews/` artifact when required | Consume the recorded checks; no new report for every retry or role |
| Reusable testing knowledge | Owning architecture/spec/research document or `tasks/lessons.md` | Keep stable decisions and source pointers; archive task snapshots |

A standalone testing document is justified only by a reusable subsystem test
strategy, a distinct operator/manual procedure, or an explicitly required
external deliverable. First check whether the owning document can hold it.
Name its owner, audience, source of truth and update/removal trigger. A new
feature, test file, run, failure or reviewer alone is not a creation trigger.
Do not create per-test Markdown, dated pass reports, or another coverage ledger.

A required plan/acceptance report records only:

1. The behavior/risk and changed boundary; existing coverage and any omission.
2. Check IDs pointing to the single executable plan, plus full/expensive-run
   justification and expected cost when applicable.
3. Execution evidence references and disposition (`executed`, exact reuse,
   historical baseline plus current delta, failed, missing or not run), with
   the verified subject and relevant environment. Preserve baseline identity.
4. Failures, incomplete coverage and the bounded next action, or why coverage
   is sufficient. Keep actual duration in run evidence and summarize material
   cost deviations instead of copying passing logs.

Example: a version-hint branch change extends the owning decision tests and
keeps one relevant CLI integration smoke. Acceptance Notes explain the
untested boundary, if any; the contract references those tests once. A new
installer E2E file and a dated test report are not required just because the
branch changed.

Template examples are not default requirements. Select actual existing paths
and commands; leave `checks: []` only when there truly are no executable
criteria, with a rationale in the existing artifact. Required repository checks
still apply. Do not invent a task-named test file, add a generic typecheck or
create a notes/report file solely to satisfy a copied placeholder.

## Cutover Package Discipline

Distilled from the Hook Runtime Diet sprint (HRD-03..05, 2026-07-20). Apply
to every contract that retires a script/module, renames a field, or moves an
authority.

1. **Pre-enumeration gate (one amendment round).** Before any code, grep the
   retired filenames AND the surfaces they write across `src/`, `scripts/`,
   `tests/`, `docs/`, `README*` (all locales), `assets/`, `.ai/hooks/`.
   Classify every hit live vs historical with evidence in the notes file.
   Hand back the enumeration for exactly one Allowed Paths amendment round;
   reactive widening across gate rounds is the failure mode this prevents.
2. **Falsifier first.** Port the two smallest units first and byte-diff them
   against the base SHA before touching the main body; if they need a
   subprocess or shell-only semantics to stay observable-identical, stop.
3. **Risk-scoped acceptance.** Name the composition and boundary checks for
   the cutover. Require a full suite only when those focused checks cannot
   cover an observed cross-module risk or a release gate explicitly requires
   it. Prepare expensive criteria once through `verify-sprint --prepare-acceptance`
   after freezing code; declare each check once in the JSON
   `Verification Plan` before that run. Workers and reviewers consume its
   subject-bound results rather than executing independent copies.
4. **Composition fixtures.** Parity suites must include end-to-end cases
   through the production entrypoint (`runHook()` or equivalent) and
   combined-feature differentials; single-feature fixtures miss joins,
   budget filtering, and entrypoint drops.
5. **Golden delta policy.** A characterization golden regenerates at most
   once per package under a per-field authorized policy: runtime-shape
   fields may move where contracted, decision-semantic fields never move,
   and the per-field before/after lands in the notes and PR body.
6. **Dead-code claims need base-SHA proof.** A cleanup advisory (including a
   gatekeeper's) is a claim: prove deadness against the base SHA's owning
   function and grep for real exercisers before dropping; refuse with
   evidence otherwise and record the adjudication in the contract.

## Status Rules

- `Pending`: drafted but not approved for execution
- `Active`: approved for implementation
- `Blocked`: waiting on a missing dependency or decision
- `Verified`: all machine checks passed; awaiting or holding review
- `Archived`: sprint is complete or superseded

## Review Coupling

- A contract is not truly done until its typed `AcceptanceReceipt` records a contract-allowed final disposition.
- `tasks/reviews/<plan-stem>.review.md` is a human-readable projection of the typed `AcceptanceReceipt` plus any manual observations. It is not an authoring authority. The receipt binds `Reviewed Subject SHA256` with scope `normalized-final-content`; its canonical verification evidence includes an exact-target `ReviewSelectionPacket`, so any target revision movement requires fresh prepared verification.
- `tasks/notes/<plan-stem>.notes.md` captures task-local decisions and should be archived or promoted deliberately, not left as hidden long-term memory.
- Closeout is promote-then-archive: durable truths move into `docs/architecture/`, `docs/researches/`, `docs/spec.md`, or `tasks/lessons.md` before `archive-workflow.sh` moves fulfilled plan/contract/review/notes/todo artifacts into `plans/archive/` and `tasks/archive/`.

### Manual Check Evidence

`exit_criteria.manual_checks` remains a scalar list of exact requirements. Every manual
criterion must have one exact matching item under the coupled review's
`## Manual Check Evidence` section. Semantic acceptance is never represented as a
manual-check string; it lives only in the typed `AcceptanceReceipt`:

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
- After implementation, run `repo-harness run verify-sprint --prepare-acceptance`, obtain exactly one semantic disposition from the contract-frozen reviewer (or an explicitly allowed typed user waiver), record the `AcceptanceReceipt`, then run `repo-harness run verify-sprint`. The final verification projects the receipt into the review file. The finish command consumes that same receipt, creates a provider-free exact local seal, applies the allowlisted lifecycle archive, and publishes one synthesized target commit whose tree is byte-identical to the verified lifecycle HEAD. The target base must remain frozen and its worktree must remain clean through publication.
- When architecture projection policy is `automatic`, `--prepare-acceptance` materializes it before computing the review subject. The generated `docs/architecture/.projection-manifest.json` is an exact workflow-owned publication output and does not need to be repeated in every contract `allowed_paths`; every other generated architecture/context path still needs explicit contract scope and otherwise fails closed. Provider unavailability or a non-publishable projection status aborts preparation. After a synthesized commit containing a manifest delta lands, closeout verifies the exact clean published tree and advances the architecture drift cursor to that publication SHA; recovery retries this acknowledgement before committing its journal. Post-publication Stop projection is recovery only, and closeout never restores or discards a dirty target manifest.
- On the primary checkout, a Stop drain whose only effect is a digest-only manifest restamp publishes itself as one single-path commit, so the steady state stays clean for those dirty gates instead of needing a manual batching commit. The classifier is the provider's own result — exactly one `update` entry for `docs/architecture/.projection-manifest.json` and no pending human action — so a semantic projection delta is never auto-committed. The git gate is fail-closed on top of that: primary worktree, attached local branch, clean index, the manifest as the only dirty tracked path, and no `commit.gpgsign`. The commit is synthesized with `commit-tree` plus an `update-ref` compare-and-swap, which runs no user hooks and reads no untracked or unstaged state, so staged content and working files are never swept in. Nothing is pushed and the architecture drift cursor is not touched; a publication that leaves the branch ahead of its remote prints one push advisory, and every skip or fault prints one advisory and still exits 0. `repo-harness architecture-projection publish-restamp --json` runs the same classifier, gate, and synthesis for manual recovery and exits non-zero unless it published.

## Publication Granularity

- The public history unit is one work-package, not one agent checkpoint, verifier transition, receipt projection, or archive step. `contract-worktree finish --merge` therefore adds exactly one commit to the target branch for the complete verified package.
- Checkpoint commits remain legal on the linked source branch. They provide recovery and red/green traceability while work is active, but local publication does not copy their topology into the target branch. `finish --no-merge` deliberately retains them because PR shipping owns the later provider merge/squash boundary.
- Product code, regression tests, required documentation, deterministic generated projections, and workflow closeout belong to the same publication commit. Standalone `WIP`, `fixup!`, `squash!`, acceptance rebind, contract fulfillment, review finalization, projection refresh, and archive-closeout commits are process state and must not land as target history.
- A second public commit is allowed only for an external fact that cannot exist before publication, such as package-registry, deployment, notarization, or store readback. It may update only release/deploy/readback evidence and must not change product code, tests, or contract semantics.
- Do not enforce granularity with changed-line or changed-file thresholds. A one-line correction may be a complete work-package; the deciding boundaries are independent rollback, verification, approval, consumer, and release ownership.
- If two changes have independent rollback or acceptance boundaries, split them into separate work-packages rather than preserving multiple commits inside one package publication.
- A synthesized publication honors `commit.gpgsign=true` by invoking `git commit-tree -S`; signing failure or an invalid signing-policy value aborts before target mutation. Repositories that do not configure signing retain the ordinary unsigned commit-tree path.
- If the verified lifecycle tree already equals the frozen target tree, finish refuses to create an empty publication commit. Resolve the already-landed work-package through the explicit no-op/cleanup path instead of manufacturing public history.
- Once target publication lands, any later in-process assertion or journal-write failure retains the source lifecycle state and in-progress journal. `recover reconcile` completes that exact effect; automatic abort may run only before publication is observable.
- Recovery recognizes only one legacy shape: an in-progress pre-cutover finish journal with no `publication_prepared` phase whose recorded lifecycle HEAD is already an ancestor of the target. Keep this probe through the next major release so operators can `recover abort|reconcile` interrupted upgrades; before that major upgrade, resolve every such journal. Remove the fallback in that major once the transaction store contains no matching in-progress journal.

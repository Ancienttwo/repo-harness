> **Archived**: 2026-07-22 03:02
> **Related Plan**: plans/archive/plan-20260714-1353-design-options-proactive-choice.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260722-0302

# Task Contract: design-options-proactive-choice

> **Status**: Fulfilled
> **Plan**: plans/plan-20260714-1353-design-options-proactive-choice.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 14:01
> **Review File**: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md`
> **Notes File**: `tasks/notes/20260714-1353-design-options-proactive-choice.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The owner's 2026-07-14 product decision authorizes the first product surface from the BDD line: the human-in-the-loop design-options workflow the adjudication explicitly left open. Three sealed experiment rounds established the constraints (the agent must never close preference/taste questions; ceilings are guidance prose, not validators; tools are host capabilities). If this ships wrong — an agent that recommends, a validator that enforces, an adapter that wraps tools — it resurrects a killed surface and betrays the evidence; if skipped, the owner's requirement (proactive multi-direction visual proposals with human choice) stays unmet.

## Goal

Ship the design-options convention per the plan's Task Breakdown (DO-01..04): author `assets/reference-configs/design-options.md` (trigger heuristic, four-step flow with authority-ceiling guidance, presentation contract with the not-concluding statement, choice capture as user_evidence, absent-user STOP, design-brief hand-off pointer, worked example, lineage delineation) mirrored to `docs/reference-configs/`; register the trigger in the agentic-development-flow routing table + `.ai/harness/policy.json` routing mirror + one clause on the existing root CLAUDE.md/AGENTS.md routing sentence; make it discoverable (`docs show design-options`, adopt pipeline stub only if needed); keep every content-contract test green. Zero new runtime machinery.

## Scope

- In scope: the two design-options doc copies, the two agentic-development-flow copies, the policy.json routing key, root CLAUDE.md + AGENTS.md single-clause extension, workflow-contract JSON pair only if routing is mirrored there, the one-line adoption stub only if DO-03 needs it, and the named content-contract tests that break.
- Out of scope: every killed BDD surface (Shape card/catalog, Behavior Audit, Browser/ImageGen adapters, authority validators, counting linters, ledgers/lifecycles/sidecars), new CLI/MCP/hook/skill installs, new capability domains, eval sprints, I3/Phase P unlocks, edits to BDD2/EA1/PS1 artifacts.
- Taste constraints: smallest honest artifact set; guidance prose over machinery; the agent presents and the human closes — no recommendation language anywhere in the convention; root contract stays concise (one clause, not a new section).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop and escalate if making the behavior real appears to require an adapter, catalog, sidecar, lifecycle, linter, new CLI/MCP/hook, or skill-install change — the minimal-convention premise would be wrong and needs a fresh owner decision.
- Stop at merged convention + green checks + passing review; productization beyond this convention needs a separate owner decision.

## Falsifier

The minimal-convention premise is wrong if the convention cannot be made reachable and triggerable without new runtime machinery. Cheapest proof, before deep authoring: confirm `bun src/cli/index.ts docs show <existing-id>` serves reference-configs by id and that adding a doc + routing row needs no code beyond the optional one-line adoption stub; if `docs show design-options` cannot resolve after DO-01 without out-of-scope code, stop and escalate.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-1353-design-options-proactive-choice.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-1353-design-options-proactive-choice.review.md`
- Notes file: `tasks/notes/20260714-1353-design-options-proactive-choice.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260714-1353-design-options-proactive-choice.md
  - assets/reference-configs/design-options.md
  - docs/reference-configs/design-options.md
  - assets/reference-configs/agentic-development-flow.md
  - docs/reference-configs/agentic-development-flow.md
  - CLAUDE.md
  - AGENTS.md
  - .ai/harness/policy.json # agentic_development.routing key only
  - assets/workflow-contract.v1.json # only if routing is mirrored there
  - .ai/harness/workflow-contract.json # only if routing is mirrored there
  - src/core/adoption/standard-plan.ts # reference-config shipped-set line + the agentic_development.routing default entry (cross-review P2)
  - tests/output-parity.test.ts
  - tests/prompt-routing-explicit-first.test.ts
  - tests/action-command-skills.test.ts
  - tests/workflow-contract.test.ts
  - tests/global-working-rules-distribution.test.ts
  - tests/cli/docs.test.ts
  - tests/cli/adoption-plan.test.ts # only if the stub changes adoption expectations
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260714-1353-design-options-proactive-choice.contract.md
  - tasks/reviews/20260714-1353-design-options-proactive-choice.review.md
  - tasks/notes/20260714-1353-design-options-proactive-choice.notes.md
  - .ai/harness/handoff/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/reference-configs/design-options.md
    - docs/reference-configs/design-options.md
  artifacts_exist:
    - tasks/notes/20260714-1353-design-options-proactive-choice.notes.md
  tests_pass:
    - path: tests/output-parity.test.ts
    - path: tests/prompt-routing-explicit-first.test.ts
    - path: tests/cli/docs.test.ts
  commands_succeed:
    - bun run check:type
    - bun src/cli/index.ts docs show design-options
    - bun src/cli/index.ts adopt --repo . --dry-run
    - bash scripts/check-task-sync.sh
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: `docs show design-options` serves the convention; routing row, policy key, and root clause agree; assets and docs copies byte-consistent where parity demands.
- Edge cases: absent-user STOP branch present in the doc; no recommendation language; ceilings stated as guidance; worked example covers the full flow including choice capture.
- Regression risks: content-contract test enumerations; root CLAUDE.md/AGENTS.md sync; adoption dry-run stability — covered by tests_pass and commands_succeed.

## Rollback Point

- Commit / checkpoint: `1317bad2` (worktree base on main)
- Revert strategy: revert the branch (pure prose/config); no data migration, no runtime code beyond the optional one-line stub; BDD2/EA1/PS1 evidence untouched.

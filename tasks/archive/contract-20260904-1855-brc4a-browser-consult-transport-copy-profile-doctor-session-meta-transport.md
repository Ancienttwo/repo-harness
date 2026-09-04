> **Archived**: 2026-09-04 18:55
> **Related Plan**: plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260904-1855
> **Archive Projection V1**: `plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` => `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Archive Projection V1**: `tasks/notes/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.notes.md` => `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Archive Projection V1**: `tasks/contracts/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.contract.md` => `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Archive Projection V1**: `tasks/reviews/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.review.md` => `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`

# Task Contract: brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-02 23:48
> **Review File**: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Notes File**: `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`docs/researches/20260902-gpt-pro-connector-readback-probe.md` measured the two Oracle
browser transports against a real signed-in Chrome profile: the current wrapper transport
(`--browser-cookie-path`, a copied cookie DB path) landed 1 of 3 runs, while
`--copy-profile` with an explicit `--browser-chrome-profile` landed 2 of 2. Cookie DB reads
against a running Chrome see a locked or half-written file, so the failure is silent: Oracle
reports `No ChatGPT cookies were applied` and drives an anonymous login page instead of the
user's account. Every downstream GPT Pro lane in this sprint (issue authoring, main audit)
depends on the bound account actually being used, so leaving the unreliable transport in
place would make campaign evidence unattributable.

## Goal

With a repo-local ChatGPT profile binding, `browser-consult --provider oracle` sends exactly
one transport: `--copy-profile <user-data-dir> --browser-chrome-profile <profile-directory>`.
`--browser-cookie-path` is no longer emitted anywhere, and there is no fallback between the
two. A resolved Oracle binary without both flags fails closed with
`ORACLE_COPY_PROFILE_UNSUPPORTED` before prompt submission; a binding that cannot name a
deterministic Chrome profile fails closed with `ORACLE_PROFILE_NOT_FOUND`.
`browser-doctor --provider oracle --json` reports `copyProfile` and `browserChromeProfile`
capabilities and requires both for `status: "ready"`. `BrowserSessionMeta.browser.transport`
records `copy_profile` or `oracle_session` on every written session, including dry runs.
Oracle's `A session with the same prompt is already running` refusal maps to
`ORACLE_SESSION_ALREADY_RUNNING` with reattach/cleanup recovery and never an automatic
`--force`.

## Scope

- In scope: `src/cli/chatgpt-browser/{oracle-provider,engine,session-store,types}.ts`,
  `tests/cli/chatgpt-browser.test.ts`, the profile-binding and wrapper-mapping sections of
  `docs/repo-harness-chatgpt-browser-engine.md`, and the matching failure-mode text in
  `assets/skills/repo-harness-chatgpt/references/consult.md`.
- Out of scope: `REQUIRED_ORACLE_VERSION` (still `0.14.1`; no version bump is part of this
  acceptance line), the native CDP provider, the `browserCookiePath` capability probe itself
  (doctor still reports it), campaign/controller code, and any real browser round trip.
- Taste constraints: single transport, no compatibility shim, no silent fallback. Every new
  failure path fails closed with a named code and an actionable recovery string.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if `--copy-profile` cannot in fact carry the bound account into the
Oracle browser session — for example if Oracle ignores `--browser-chrome-profile` and still
resolves the `Local State` `last_used` profile, or if copying a live profile fails the same
way a live cookie DB read does. Cheapest proof point: `oracle --debug-help | grep
browser-chrome-profile` to confirm the flag exists on the pinned CLI, then the recorded
run 5/6 evidence in `docs/researches/20260902-gpt-pro-connector-readback-probe.md`, where
`--copy-profile --browser-chrome-profile "Profile 13"` reached the signed-in account twice
out of two attempts.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Notes file: `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"chatgpt-browser-transport-tests","kind":"deterministic_test","paths":["*"]},{"id":"oracle-cli-transport-flag-readback","kind":"runtime_readback","paths":["*"]},{"id":"brc4a-human-acceptance","kind":"manual_acceptance","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
  - tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
  - tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - docs/repo-harness-chatgpt-browser-engine.md
  - assets/skills/repo-harness-chatgpt/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
  tests_pass:
    - path: tests/cli/chatgpt-browser.test.ts
  commands_succeed:
    - bun run check:type
    - bun test tests/cli/chatgpt-browser.test.ts --timeout 60000
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: bound-profile consults emit `--copy-profile <user-data-dir>
  --browser-chrome-profile <profile-directory>` and never `--browser-cookie-path`; doctor
  requires both new capabilities for `ready`; session meta records `browser.transport`.
- Edge cases: binding without `profileDirectory`, missing `Local State`, Oracle binary
  without the transport flags, and a detached Oracle worker holding the same prompt — each
  fails closed with its own code instead of degrading the transport.
- Regression risks: the bound-profile path now probes the resolved binary (`--help`,
  `--debug-help`, and the existing thinking-time parser probe) before every real consult, so
  a fake or stripped Oracle binary that used to run will now be rejected. Local
  `browser-doctor` stays `action_required` on this machine because the installed Oracle is
  0.18.0 while `REQUIRED_ORACLE_VERSION` is pinned at 0.14.1; that version gate is
  deliberately untouched here.

## Rollback Point

- Commit / checkpoint: `main@b62e6a07dc23b773a643ed454797b475176f084f` (branch base after rebase)
- Revert strategy: revert the branch commits on
  `codex/brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport`; the
  change is confined to the `src/cli/chatgpt-browser` package plus its tests and docs.

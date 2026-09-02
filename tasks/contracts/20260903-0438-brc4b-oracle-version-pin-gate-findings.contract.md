# Task Contract: brc4b-oracle-version-pin-gate-findings

> **Status**: Active
> **Plan**: plans/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-03 04:38
> **Review File**: `tasks/reviews/20260903-0438-brc4b-oracle-version-pin-gate-findings.review.md`
> **Notes File**: `tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`REQUIRED_ORACLE_VERSION` was pinned to `0.14.1` while the only Oracle installed on this
machine is `0.18.0`, so `validateOracleVersion` returned `ORACLE_VERSION_UNSUPPORTED` and
`browser-doctor --provider oracle` was permanently `action_required`. The `--copy-profile`
transport PR #290 landed therefore could never run against a real Oracle binary: every real
consult fails closed at the version gate before prompt submission. Left unfixed, the whole
GPT Pro browser lane stays unusable and #290's transport work stays unexercised outside
fixtures. The same gate round left four MEDIUM findings that keep stale surface in the
runtime: a `browserCookiePath` capability nothing sends, a stale-session log match placed
above the exit-status check, and a `browser.transport` derivation that mislabels native
sessions as `copy_profile`.

## Goal

`bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` reports
`status: "ready"`, `versionCompatible: true`, and `missingCapabilities: []` against the
installed Oracle `0.18.0`. `REQUIRED_ORACLE_VERSION` stays an exact match and is only raised
to `0.18.0`. `browserCookiePath` is removed from `OracleCapabilities`, the capability probe,
the empty-capability set, and the doctor readiness surface. The
`A session with the same prompt is already running` match only classifies inside the
`result.status !== 0` branch, so a clean exit keeps the answer file authoritative.
`BrowserSessionMeta.browser.transport` is derived from the provider: Oracle with a binding is
`copy_profile`, Oracle without one is `oracle_session`, and the deprecated native provider is
the new `native_profile`.

## Scope

- In scope: `src/cli/chatgpt-browser/{oracle-provider,engine,session-store,types}.ts`,
  `tests/cli/chatgpt-browser.test.ts`, and the doctor capability map sentence in
  `docs/repo-harness-chatgpt-browser-engine.md`.
- Out of scope: replacing the exact-version match with a floor/range comparison, the
  `--browser-cookie-path` "never sent" statement in the wrapper-mapping paragraph (still
  true), the native CDP provider's own behavior, doc line 217's claim that Oracle rejects
  `--copy-profile` with `--browser-manual-login` (re-verified against Oracle 0.18.0
  `dist/src/cli/browserConfig.js:90-91`, still correct), and any real browser round trip.
- Taste constraints: pin value only, no compatibility shim for older Oracle versions, no
  fallback between transports, and no new capability abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If Oracle `0.18.0` were missing a flag the wrapper sends, raising the pin would turn a loud
version failure into a silent runtime failure. Cheapest proof point:
`bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` against the installed
binary must report every probed capability `true` and `missingCapabilities: []` — the probe
reads the real `--help`/`--debug-help` surface, so a missing flag shows up there before any
prompt is submitted.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/chatgpt-browser/oracle-provider.ts:66` pinned `REQUIRED_ORACLE_VERSION = '0.14.1'`, so `validateOracleVersion` rejected the installed Oracle `0.18.0` with `ORACLE_VERSION_UNSUPPORTED` and every doctor run and real consult failed closed on version alone.
- repro: `bun src/cli/index.ts chatgpt browser-doctor --provider oracle --json` returned `"status": "action_required"` with `"code": "ORACLE_VERSION_UNSUPPORTED"` and `"version": "0.18.0", "requiredVersion": "0.14.1"`.
- regression_guard: tests/cli/chatgpt-browser.test.ts (`oracle doctor reports ready on the pinned 0.18.0 surface without a cookie-path flag`)
- pre_fix_failure_artifact: .ai/harness/evidence/brc4b-pre-fix.txt

## Workflow Inventory

- Source plan: `plans/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260903-0438-brc4b-oracle-version-pin-gate-findings.review.md`
- Notes file: `tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"chatgpt-browser-pin-and-gate-findings","kind":"deterministic_test","paths":["*"]},{"id":"oracle-0-18-0-doctor-readback","kind":"runtime_readback","paths":["*"]}]}
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
  - tasks/contracts/20260903-0438-brc4b-oracle-version-pin-gate-findings.contract.md
  - tasks/reviews/20260903-0438-brc4b-oracle-version-pin-gate-findings.review.md
  - tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/evidence/
  - .claude/templates/
  - src/
  - tests/
  - docs/repo-harness-chatgpt-browser-engine.md
  - assets/skills/repo-harness-chatgpt/
  - README.md
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
    - tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md
  tests_pass:
    - path: tests/cli/chatgpt-browser.test.ts
    - path: tests/readme-dx.test.ts
  commands_succeed:
    - bun run check:type
    - bun test tests/cli/chatgpt-browser.test.ts --timeout 60000
    - bun test tests/readme-dx.test.ts --timeout 60000
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: doctor reports `ready` against the installed Oracle `0.18.0`; a bound
  dry run still renders exactly `--copy-profile` plus `--browser-chrome-profile` and no
  `--browser-cookie-path`.
- Edge cases: a clean Oracle exit whose log happens to contain the stale-session sentence is
  still resolved from the answer file; an Oracle older or newer than the pin is still rejected
  before any side effect.
- Regression risks: the pin remains an exact match, so a future Oracle release re-breaks
  doctor until this constant is reviewed and raised again — that is the intended fail-closed
  behavior, not drift.

## Rollback Point

- Commit / checkpoint: main@9e922e47 (branch base)
- Revert strategy: revert branch `codex/brc4b-oracle-version-pin-gate-findings`; no data,
  protocol, or on-disk session-format change is involved beyond the additive
  `native_profile` transport value.

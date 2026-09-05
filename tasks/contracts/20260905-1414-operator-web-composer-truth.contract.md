# Task Contract: operator-web-composer-truth

> **Status**: Fulfilled
> **Plan**: plans/plan-20260905-1414-operator-web-composer-truth.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 14:14
> **Review File**: `tasks/reviews/20260905-1414-operator-web-composer-truth.review.md`
> **Notes File**: `tasks/notes/20260905-1414-operator-web-composer-truth.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Task Board's one write is the only place a human addresses a running agent
session, so a composer that misnames its target is worse than a missing one: it
tells the operator nobody holds a task whose claim it is printing two panels
higher, and the operator sends into a queue believing it will not be read. The
same panel fails AA on its single write control, discards a typed message when
the IME cancel key is pressed, and renders server English inside a Chinese
board. If this ships wrong, the board keeps looking authoritative while stating
facts the Fleet snapshot contradicts.

## Goal

The composer names its actual target for every lease state in both locales, the
send button clears 4.5:1 in every state it renders, Escape cannot discard a
draft, error copy is client-owned and keyed by the typed code, the worklist
counts cards and repositories where each is labelled, the footer reports an
unobserved protocol as absent, and the browser fixture is a payload the
production decoder accepts without a test-side rewrite.

## Scope

- In scope:
  - `src/operator-web/App.tsx` composer target copy, Escape guard, counts
    authority, footer protocol, localized error and aria surfaces.
  - `src/operator-web/i18n.ts` lease-state target sentences, repository and API
    error copy in `en` and `zh`, aria labels.
  - `src/operator-web/types.ts` nullable `^sha256:[0-9a-f]{64}$` for
    `inbox.effect_sha256`; exported closed code vocabularies.
  - `src/operator-web/styles.css` `.composer__send` colour pair.
  - `src/operator-web/fixture.ts` decoder-valid identity plus lease-state cards.
  - `tests/operator-web/**` and `tests/unit/operator-web-types.test.ts` guards;
    removal of the test-side `decodableSnapshot` identity rewrite.
- Out of scope:
  - server, collector, inbox, any protocol change, any new dependency.
  - the POST envelope and the scope decision: `task` scope for a non-bound lease
    is correct because the server accepts claim scope only for `bound`.
  - a client-side `counts.unclassified` total; the server-side field lands in a
    sibling work package.
- Taste constraints: no browser modal dialogs, no new dependency, both `en` and
  `zh` copy for every new string, 44px minimum targets at 900px and below.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `src/effects/fleet/task-inbox.ts` accepted claim-scoped delivery for a lease
that is not `bound`, the defect would be the scope decision rather than the
copy, and this change would be papering over a real routing bug. Cheapest proof
point: `sendTaskMessageWithAuthority` fails `recipient_unavailable` whenever
`record.state !== 'bound'` (`src/effects/fleet/task-inbox.ts:718`), so task
scope is the only delivery a non-bound lease can accept.

## Root Cause Evidence

- root_cause: the composer derived all of its copy from `composerScope`, which
  returns `'task'` for every lease that is not `bound`, so a card with a live
  `claim_id` under `reserving`/`completing`/`reviewing`/`unknown` rendered
  "Nobody holds this task now" while the identity panel printed that claim
  (`src/operator-web/App.tsx:1272-1283`, `:1485-1559` before this change).
- repro: `bun test --timeout 60000 tests/operator-web/operator-interactions.test.tsx`
  with the lease-state fixture; in the browser, open a task whose lease is
  `reserving` with a live claim and expand the composer.
- regression_guard: tests/operator-web/operator-interactions.test.tsx
- pre_fix_failure_artifact: .ai/harness/evidence/pre-fix/operator-interactions.log

## Workflow Inventory

- Source plan: `plans/plan-20260905-1414-operator-web-composer-truth.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260905-1414-operator-web-composer-truth.review.md`
- Notes file: `tasks/notes/20260905-1414-operator-web-composer-truth.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"operator-web-composer-truth-deterministic","kind":"deterministic_test","paths":["src/operator-web/App.tsx","src/operator-web/i18n.ts","src/operator-web/types.ts","src/operator-web/styles.css","src/operator-web/fixture.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260905-1414-operator-web-composer-truth.md
  - tasks/todos.md
  - tasks/contracts/20260905-1414-operator-web-composer-truth.contract.md
  - tasks/reviews/20260905-1414-operator-web-composer-truth.review.md
  - tasks/notes/20260905-1414-operator-web-composer-truth.notes.md
  - src/operator-web/
  - tests/
  - docs/architecture/
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
    - src/operator-web/App.tsx
    - src/operator-web/i18n.ts
    - src/operator-web/types.ts
    - src/operator-web/styles.css
    - src/operator-web/fixture.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260905-1414-operator-web-composer-truth.notes.md
    - .ai/harness/evidence/pre-fix/operator-interactions.log
  tests_pass:
    - path: tests/operator-web/operator-interactions.test.tsx
    - path: tests/operator-web/operator-ui.test.tsx
    - path: tests/operator-web/operator-collaboration.test.tsx
    - path: tests/unit/operator-web-types.test.ts
  commands_succeed:
    - bun run build:operator-web
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: the composer names the holder and its lease state for a
  live claim under any non-bound lease, keeps scope `task` and the POST envelope
  unchanged, and still says nobody holds an unheld task.
- Edge cases: `bound` with no recorded claim, and a claim that appears after a
  task-scoped draft was frozen, each get their own sentence rather than reusing
  another state's. An error code outside the closed set renders the server's
  English labelled as untranslated.
- Regression risks: the composer copy keys are exhaustive `Record`s over the
  lease-state union, so a protocol that adds a lease state fails typecheck here.
  The `.composer__send` disabled pair overrides the shared button's opacity;
  a future change to `.operator-button:disabled` ordering could re-apply it.

## Rollback Point

- Commit / checkpoint: 1a9a5ae1 (branch base)
- Revert strategy: revert the two commits on `codex/operator-web-composer-truth`;
  `src/operator-web/**` and `tests/**` move together and nothing outside the
  browser bundle depends on them.

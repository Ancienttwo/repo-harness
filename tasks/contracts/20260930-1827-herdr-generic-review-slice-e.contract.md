# Task Contract: herdr-generic-review-slice-e Receipt implementation

> **Substantive Change SHA256**: `sha256:400a850d49623b97c9072f05a0fff34038d846a1ae3cf31db2c3240b3e32db0c`

> **Status**: Active
> **Plan**: plans/plan-20260930-1827-herdr-generic-review-slice-e.md
> **Task Profile**: strict
> **Owner**: chris
> **Capability ID**: root
> **Review File**: `tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md`
> **Notes File**: `tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md`

## Why

User-approved generic review needs a Receipt independent of reviewer launch transport, retaining the existing production authority and domain-verification protection.

## Goal

Complete launcher-independent generic-review Receipt binding and wire fleet deep-reasoner review through task-agent; preserve three-round/domain/close-fence rules, remove exactly the approved six exclusive legacy files and update their shared consumers atomically.

## Scope

- In scope: existing schema/policy/functions and byte-identical helper projection, existing test consumers/fixture builders, canonical gates, actual RUN2/RUN3 notes and the approved DELETE6 / EDIT36 / RETAIN27 cutover inventory.
- Out of scope: hand-written vendor adapters/argv/output parsers, OAR upstream changes, new model requests or canary items, campaign implementation, the three retained cross-review source files, global config/trust edits, main checkout/user pane changes, merge.

## Stop Conditions

Any workflow gate requiring an unresolved user decision is reported, not bypassed. The user has approved the traced DELETE6 / EDIT36 / RETAIN27 inventory; delete only those six after generic wiring. All source verification stays zero-model. Local commits only. Push/PR/merge are not authorized. Aimpact 18:41 releases reviewer-written result_ref and stock OAR Claude bypass only inside proved inherited OS isolation. Aimpact 20:30 supersedes that knob: delete inherited OAR_CODEX_SANDBOX before Session creation, use stock default danger-full-access with cwd=output, protected only by admitted Seatbelt. Zero-prompt native startup is authorized; no model prompts. Grok is unsupported. Retired Receipt source names have no alias. No launcher-specific field enters validity.

## Falsifier

A required Receipt field that can be tampered without verifier rejection, or a launch-dependent byte/validity difference, fails this slice.

## Root Cause Evidence

Not applicable: approved schema implementation, not a production bugfix.

## Change Assessment
```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy
```json
{"protocol":1,"reviewer":"Claude","user_waiver":"forbidden"}
```

## Allowed Paths
```yaml
allowed_paths:
  - tests/unit/hook-entry-single-file-bundle.test.ts
  - tsconfig.json
  - tests/herdr-task-lifecycle.test.ts
  - src/effects/terminal/task-session.ts
  - src/effects/review/oar-review-host.ts
  - src/effects/review/review-isolation.ts
  - bun.lock
  - package.json
  - tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md
  - tasks/contracts/20260912-1053-release-0-19-1.contract.md
  - assets/skills/repo-harness-cross-review/references/generic-review.md
  - tests/generic-review.test.ts
  - src/effects/review/generic-review.ts
  - src/core/review/generic-review.ts
  - src/cli/commands/review.ts
  - tests/skill-surface/retired-names-scan.test.ts
  - tests/skill-surface/cross-review-package.test.ts
  - tests/skill-surface/catalog.test.ts
  - tests/harness-benchmark-matrix.test.ts
  - tests/expensive-test-gate.test.ts
  - src/cli/index.ts
  - docs/spec.md
  - assets/skills/repo-harness-test/references/running.md
  - assets/skills/repo-harness-test/references/authoring.md
  - assets/skills/repo-harness-cross-review/SKILL.md
  - assets/skill-commands/manifest.json
  - README.zh-CN.md
  - README.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - tests/claude-review.test.ts
  - src/effects/review/claude-review-session.ts
  - src/effects/review/claude-review-host.ts
  - src/core/review/claude-review.ts
  - src/cli/commands/claude-review.ts
  - assets/skills/repo-harness-cross-review/references/claude-mode.md
  - plans/plan-20260930-1827-herdr-generic-review-slice-e.md
  - tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md
  - tasks/reviews/20260930-1827-herdr-generic-review-slice-e.review.md
  - tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md
  - scripts/acceptance-receipt.ts
  - assets/templates/helpers/acceptance-receipt.ts
  - tests/acceptance-receipt.test.ts
  - tests/acceptance-receipt-evidence-fingerprint.test.ts
  - tests/merge-gate.test.ts
  - tests/evidence-attested-import.test.ts
  - tests/unit/issue-284-dependency-authority.test.ts
  - tests/helpers/repo-fixture.ts
  - tests/historical-plan-classifier.test.ts
  - tests/characterization/repair-campaign-authority-freeze.test.ts
  - tests/unit/me4c-integration-product-acceptance.test.ts
  - tests/unit/merge-readiness-v1-effect.test.ts
  - src/effects/evidence/checks-materializer.ts
  - src/cli/hook/prompt-handler.ts
  - scripts/classify-historical-plans.ts
  - assets/templates/helpers/classify-historical-plans.ts
  - assets/templates/contract.template.md
  - .claude/templates/contract.template.md
  - assets/hooks/lib/workflow-state.sh
  - .ai/hooks/lib/workflow-state.sh
  - .ai/hooks/.projection.json
  - scripts/harness-trace-grade.sh
  - assets/templates/helpers/harness-trace-grade.sh
  - assets/reference-configs/sprint-contracts.md
  - docs/reference-configs/sprint-contracts.md
  - tests/archive-evidence-gates.test.ts
  - tests/harness-trace-grade.test.ts
  - tests/workflow-state-lib.test.ts
  - tests/verify-sprint.test.ts
  - tests/evidence-checks-materializer.test.ts
  - tests/evidence-projection-drift.test.ts
  - tests/helpers/helper-script-fixture.ts
  - tests/plan-to-todo.test.ts
  - tests/prompt-handler.test.ts
  - tests/fixtures/harness-traces/code-change-pass.json
  - tests/fixtures/harness-traces/migration-pass.json
  - tests/fixtures/harness-traces/ledger-closeout-pass.json
  - tests/fixtures/harness-traces/bugfix-pass.json
  - tests/fixtures/harness-traces/docs-only-pass.json
  - tests/fixtures/harness-traces/eval-only-pass.json
  - tests/fixtures/harness-traces/frontend-pass.json
```

## Evidence Requirements
```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Delegation Contract
```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 0
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: edit_and_gatekeep
      purpose: approved_receipt_slice
    verifier:
      mode: read_only
      purpose: designated_advisor_review
```

## Verification Plan
```json
{
  "protocol": 1,
  "checks": [
    {"id":"full-suite-local","kind":"command","command":"env -u REPO_HARNESS_TEST_EXPENSIVE -u BUN_TEST_FILES BUN_TEST_ISOLATE_FILES=1 REPO_HARNESS_NODE_BIN=/opt/homebrew/opt/node@24/bin/node BUN_TEST_JOBS=2 BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_TIMEOUT_MS=120000 bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'","cwd":".","phase":"verification","cost":"expensive","evidence_policy":"current_exact","necessity":"User 20:30 explicitly requires local full suite and merge-base classification; no GitHub CI or real model lanes","inputs":{"env":[]}},
    {
      "id": "isolation-first",
      "kind": "command",
      "command": "bun test tests/generic-review.test.ts -t \"OAR isolation\" --timeout 120000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Mandatory first falsifier: paired OS denials and descendants; stop before SDK host if not passed",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "host-build",
      "kind": "command",
      "command": "bun run build:oar-review-host",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Node >=24 OAR host package build",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "oar-domain",
      "kind": "command",
      "command": "bun test tests/generic-review.test.ts tests/acceptance-receipt.test.ts --timeout 120000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Zero-model SDK/file-result/domain tests; no native providers or model calls",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-agent-regression",
      "kind": "command",
      "command": "bun test tests/cli/task-agent.test.ts tests/herdr-task-lifecycle.test.ts --timeout 120000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing ownership and additive host path regression; private named fixtures only",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "mcp-regression",
      "kind": "command",
      "command": "bun test tests/cli/mcp-tools.test.ts --timeout 120000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Keep existing MCP goal communication behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "references",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "inspect",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "adoption-dry",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity check",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Exit Criteria
```yaml
exit_criteria:
  - Both approved RUN3 large cases produce a valid collected Result.
  - Receipt is written and verified through production functions, with fixed-time launcher-independent fixture bytes and required-field tamper rejections.
  - Existing RUN3 zeroSandbox assertion passes, custom-profile OS denial only.
  - Focused tests and required checks pass or exact gate decision/failure is reported without bypass.
  - Exact18-file retirement inventory is shown with refs/replacement plan, no deletion.
```

## E2 approval boundary

Gatekeeper Receipt round 2 PASS is recorded from the user. E2 wires review on task-agent/fleet, preserves domain findings/three rounds/close fence, then deletes the approved six files. Cross-review CLI/core/runner are RETAIN and must be retired only in a separate follow-up after E2 merges. Two named Active contracts are re-frozen in place; no historical receipt is translated. Local full suite, type and Required Checks precede commit/push/PR; skip GitHub CI, no merge without Aimpact.

## B release / mandatory holds

Advisor released B steps 1–6 locally. Concrete mechanism: macOS /usr/bin/sandbox-exec Seatbelt policy around the OAR host execution tree; no third-party sandbox library. Output tree is the only writable filesystem tree; subject, primary, owner record, journal and Git common dir deny, including host descendants and symlink/traversal escapes. Zero-model isolation must pass before SDK host implementation; failure stops the work. No fallback to chmod/worktree/fingerprints.

Historical 18:41 decision (runtime mode/startup/type superseded below at 20:30): reviewer authors result_ref; append only the communication exception through OAR SessionOptions.appendSystemPrompt, leaving RECOMMENDATION-first fleet content intact. Host root-turn text is observation only. Codex host env fixes workspace-write before Session creation, cwd=output; OS Seatbelt remains the sole write-protection authority. Stock OAR Claude bypass is authorized only under the proved inherited OS boundary; Grok is not wired. Claude actual_model is only init-derived in this OAR snapshot and cannot mint Receipt until upstream gap is closed. No launcher fields in Receipt. Local commits only; no remote operations or main changes.


## Aimpact 20:30 D2/D3/D4 release

Finish advisor corrections (a)(b)(c) first: preserve red fixture, only proved /dev/null device exception plus output-local TMPDIR, and OAR installation solely in Node host. Then D2 deletes inherited OAR_CODEX_SANDBOX before Session creation and uses stock default danger-full-access, admitted outer Seatbelt required. D3 is a zero-prompt native startup probe through OAR with real HOME; only OS-log-proved pure session/log/cache directories may become narrow allowances. Settings/hooks/trust/instructions/definitions/credentials remain denied; never redirect HOME or copy credentials. Unsupported native startup stays closed. D4 explicitly authorizes skipLibCheck true, including unchecked src/operator-web/styles.d.ts. Native/model evidence limitations remain recorded; local commits only.

Introduced full-suite failure decision: merge-base hook bundle wiring is 7/7 green; E2 adds the required OAR prepack build. Exact existing test path admitted before editing, only preserve all build stdout redirections and packaged OAR host assertion. No hook production change or new test file.

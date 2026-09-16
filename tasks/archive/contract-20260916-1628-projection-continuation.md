> **Archived**: 2026-09-16 16:28
> **Related Plan**: plans/archive/plan-20260916-0233-projection-continuation.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260916-1628
> **Archive Projection V1**: `plans/plan-20260916-0233-projection-continuation.md` => `plans/archive/plan-20260916-0233-projection-continuation.md`
> **Archive Projection V1**: `tasks/notes/20260916-0233-projection-continuation.notes.md` => `tasks/archive/notes-20260916-1628-projection-continuation.md`
> **Archive Projection V1**: `tasks/contracts/20260916-0233-projection-continuation.contract.md` => `tasks/archive/contract-20260916-1628-projection-continuation.md`
> **Archive Projection V1**: `tasks/reviews/20260916-0233-projection-continuation.review.md` => `tasks/archive/review-20260916-1628-projection-continuation.md`

# Task Contract: Projection continuation

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260916-0233-projection-continuation.md
> **Task Profile**: bugfix
> **Owner**: Codex
> **Capability ID**: root
> **Review Base**: d52f9a9be7a8056f6ece98e8ff1d7684cd3b7672
> **Review File**: tasks/archive/review-20260916-1628-projection-continuation.md
> **Notes File**: tasks/archive/notes-20260916-1628-projection-continuation.md

## Why

Host-budget exhaustion leaves valid work pending without an independent consumer. A completed Stop must be able to hand that exact job to a bounded continuation.

## Goal

Resume host-budget-yielded projection once after Stop using the existing queue and complete formal source acceptance with a typed receipt.

## Scope

- In scope: the frozen continuation implementation, existing evidence reuse, canonical acceptance and local contract closeout/integration approved by the user on 2026-09-16. Subsequent approval covers creating the missing local CodeGraph index, deterministic projection manifest refresh, and proof-only candidate reconciliation.
- Out of scope: registry publication, global installation, provider updates, semantic modeling and unrelated repository changes. Release/install requires its own concrete version boundary.

## Stop Conditions

- Stop if edits exceed the approved strict-queue-gate and archive-integrity follow-ups or a required gate cannot be satisfied from valid evidence.
- Stop before changes outside Allowed Paths or any relaxation of queue/provider/acceptance gates.

## Approved strict gate follow-up

On 2026-09-16 the user approved fixing the confirmed second-Stop bypass. Change only the Stop gate, existing Stop/process tests, deterministic projections, and task/research records. The queue remains authoritative. Strict blocks while pending, running or dead-letter work remains; advisory behavior stays advisory. Verify actual detached source/bundle execution and release after a successful receipt. Refresh affected evidence and formal acceptance on the new subject.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"continuation-process-and-queue-regressions","kind":"deterministic_test","paths":["src/cli/hook-entry.ts","src/cli/hook/stop-handler.ts","src/effects/architecture/projection-orchestrator.ts","src/effects/architecture/projection-continuation.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/archive-workflow.sh
  - assets/templates/helpers/archive-workflow.sh
  - tests/archive-evidence-gates.test.ts
  - docs/architecture/.projection-manifest.json
  - src/cli/hook/stop-handler.ts
  - src/cli/hook-entry.ts
  - src/effects/architecture/projection-orchestrator.ts
  - src/effects/architecture/projection-continuation.ts
  - tests/stop-handler.test.ts
  - tests/architecture-projection-orchestration.test.ts
  - tests/architecture-projection-continuation.test.ts
  - docs/researches/20260916-projection-continuation.md
  - plans/archive/plan-20260916-0233-projection-continuation.md
  - tasks/archive/contract-20260916-1628-projection-continuation.md
  - tasks/archive/notes-20260916-1628-projection-continuation.md
  - tasks/archive/review-20260916-1628-projection-continuation.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/architecture/projection-continuation.ts
    - tests/architecture-projection-continuation.test.ts
    - docs/researches/20260916-projection-continuation.md
  artifacts_exist:
    - .ai/harness/runs/projection-continuation/real-provider-continuation-receipt.json
```


## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Root Cause Evidence

- root_cause: archive-workflow.sh rewrites every matching path in the whole contract, including executable Verification Plan commands. Navigation projection changes the acceptance plan hash and invalidates the previously valid receipt.
- repro: bun run test tests/archive-evidence-gates.test.ts --test-name-pattern 'collision-safe archive pointers' before the helper fix; the archived command contains rewritten historical paths and fails the original section assertion.
- regression_guard: tests/archive-evidence-gates.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/projection-continuation/archive-plan-pre-fix.log

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "archive-freeze",
      "kind": "command",
      "command": "bun -e 'import { captureGitVirtualTreeSnapshot } from \"./src/effects/evidence/verification-execution.ts\"; import { execFileSync } from \"node:child_process\"; const current = captureGitVirtualTreeSnapshot(process.cwd()); const changed = execFileSync(\"git\", [\"diff\", \"--name-only\", \"0007ee85ee0fa5eb6110cfac9186444697aa2261\", current.tree_hash], {encoding:\"utf8\"}).trim().split(\"\\n\").filter(Boolean); const allowed = new Set([\"docs/architecture/.projection-manifest.json\", \"plans/plan-20260916-0233-projection-continuation.md\", \"tasks/contracts/20260916-0233-projection-continuation.contract.md\", \"tasks/notes/20260916-0233-projection-continuation.notes.md\", \"tasks/reviews/20260916-0233-projection-continuation.review.md\"]); const unexpected = changed.filter(path => !allowed.has(path)); if (unexpected.length) throw new Error(\"Changes outside the approved archive repair: \" + unexpected.join(\", \")); console.log(\"Verified bounded archive repair delta: \" + changed.join(\", \"));'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Prove helper and regression bytes are unchanged from the successful archive and receipt executions; only final task metadata and deterministic manifest provenance may differ.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "archive-delta",
      "kind": "command",
      "command": "bun -e 'import { captureGitVirtualTreeSnapshot } from \"./src/effects/evidence/verification-execution.ts\"; import { execFileSync } from \"node:child_process\"; const current = captureGitVirtualTreeSnapshot(process.cwd()); const changed = execFileSync(\"git\", [\"diff\", \"--name-only\", \"4c4790604cee79bb9fc37c6fcf2cf56345c9caab\", current.tree_hash], {encoding:\"utf8\"}).trim().split(\"\\n\").filter(Boolean); const allowed = new Set([\"scripts/archive-workflow.sh\", \"assets/templates/helpers/archive-workflow.sh\", \"tests/archive-evidence-gates.test.ts\", \"docs/researches/20260916-projection-continuation.md\", \"docs/architecture/.projection-manifest.json\", \"plans/plan-20260916-0233-projection-continuation.md\", \"tasks/contracts/20260916-0233-projection-continuation.contract.md\", \"tasks/notes/20260916-0233-projection-continuation.notes.md\", \"tasks/reviews/20260916-0233-projection-continuation.review.md\"]); const unexpected = changed.filter(path => !allowed.has(path)); if (unexpected.length) throw new Error(\"Changes outside the approved archive repair: \" + unexpected.join(\", \")); console.log(\"Verified bounded archive repair delta: \" + changed.join(\", \"));'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Bind unchanged continuation evidence to its verified source; permit only the approved archive helper, regression, generated mirror and task/research/provenance delta.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "archive-evidence",
      "kind": "package_test",
      "path": "tests/archive-evidence-gates.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Exercise the actual archive helper, collision-safe navigation and frozen Verification Plan bytes/hash, including prediction and receipt gates.",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-a95d332718bd41de9557.json",
        "execution_id": "vx-a95d332718bd41de9557"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "acceptance-receipt",
      "kind": "package_test",
      "path": "tests/acceptance-receipt.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Verify unchanged receipt authority, lifecycle projections and rejection of invalid evidence.",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-317d20e803eb49beb166.json",
        "execution_id": "vx-317d20e803eb49beb166"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "projection-manifest",
      "kind": "command",
      "command": "bun -e 'import { readFileSync } from \"node:fs\"; import { execFileSync } from \"node:child_process\"; import { deepStrictEqual } from \"node:assert\"; const path=\"docs/architecture/.projection-manifest.json\"; const old=JSON.parse(execFileSync(\"git\",[\"show\",\"31c9d1f5234b772ebe759fd9d2d567db2538e6de:\"+path],{encoding:\"utf8\"})); const now=JSON.parse(readFileSync(path,\"utf8\")); deepStrictEqual(now.semanticBaseline.semanticState,old.semanticBaseline.semanticState); deepStrictEqual(now.semanticBaseline.digests.flowProofDigest,old.semanticBaseline.digests.flowProofDigest); deepStrictEqual(now.provenance.modelDigest,old.provenance.modelDigest); deepStrictEqual(now.provenance.generatedFrom.codeGraphStatus,\"ready\"); const outputs=x=>JSON.stringify(x.targets.map(f=>[f.path,f.sourceDigest,f.outputDigest])); deepStrictEqual(outputs(now),outputs(old)); console.log(\"Provider manifest retains model, flow proof and document outputs; provenance refreshed\");'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Prove the index recovery changed provenance only, not architecture model, flow proof or generated document content.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "stop",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Verify detached projection lifecycle and existing ownership/Stop gates",
      "inputs": {
        "env": []
      },
      "path": "tests/stop-handler.test.ts",
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-365ef1e80f1a4430b36a.json",
        "execution_id": "vx-365ef1e80f1a4430b36a"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "orchestration",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Verify detached projection lifecycle and existing ownership/Stop gates",
      "inputs": {
        "env": []
      },
      "path": "tests/architecture-projection-orchestration.test.ts",
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-db8e9c3dbdaa49809c12.json",
        "execution_id": "vx-db8e9c3dbdaa49809c12"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "continuation",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Verify detached projection lifecycle and existing ownership/Stop gates",
      "inputs": {
        "env": []
      },
      "path": "tests/architecture-projection-continuation.test.ts",
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-6e1b1be1f61249cf9a80.json",
        "execution_id": "vx-6e1b1be1f61249cf9a80"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "late-write",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Verify detached projection lifecycle and existing ownership/Stop gates",
      "inputs": {
        "env": []
      },
      "path": "tests/architecture-projection-late-write-receipt.test.ts",
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-a67e1e32cab4444cb9ac.json",
        "execution_id": "vx-a67e1e32cab4444cb9ac"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "restamp",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Verify detached projection lifecycle and existing ownership/Stop gates",
      "inputs": {
        "env": []
      },
      "path": "tests/stop-handler-restamp-publication.test.ts",
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-09daee7f6a7a4f139461.json",
        "execution_id": "vx-09daee7f6a7a4f139461"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "types",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-d721a9f9d79f4f799563.json",
        "execution_id": "vx-d721a9f9d79f4f799563"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-513bdd5ea78248e39aa8.json",
        "execution_id": "vx-513bdd5ea78248e39aa8"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-9d91b8f0f99b4a9cbb3f.json",
        "execution_id": "vx-9d91b8f0f99b4a9cbb3f"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "references",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-4579cff62ab442de9064.json",
        "execution_id": "vx-4579cff62ab442de9064"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "sql-order",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-9e7b04d10cd94f1c90d8.json",
        "execution_id": "vx-9e7b04d10cd94f1c90d8"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity for this hook/process change",
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
      "necessity": "Required repository integrity for this hook/process change",
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
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "inspection",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-19644f1a66e848129517.json",
        "execution_id": "vx-19644f1a66e848129517"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    },
    {
      "id": "init",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "Required repository integrity for this hook/process change",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-e50348d0dca7476687dc.json",
        "execution_id": "vx-e50348d0dca7476687dc"
      },
      "delta_checks": [
        "archive-freeze",
        "archive-delta",
        "projection-manifest",
        "architecture",
        "task-sync",
        "workflow"
      ]
    }
  ]
}
```

## Acceptance Notes

Existing Stop and orchestration tests cover budget retention and manual retry, but not a consumer surviving parent exit. Add the smallest Stop dispatch regression and an isolated real-process lifecycle fixture covering source and bundled entrypoints. Process tests prove the OS lifetime boundary; they do not prove real-provider performance. Reuse the prior actual provider result and run one disposable real-provider smoke if the current model remains source-bound. No full benchmark or full-suite run is required for this bounded boundary.

## Base integration

Concurrent main commit d52f9a9b raised the architecture budget to 110 seconds and fixed owned-only-event retry starvation. This worktree was fast-forwarded to that exact base before final verification; the continuation preserves those changes. Prior 20-second/21-second wall-clock tests are historical evidence only. Current process tests use a host-only virtual clock advanced after provider return; detached children do not inherit that preload and consume the real configured budget. This avoids repeating 110-second sleeps while exercising actual source and bundled process entrypoints.

## Canonical evidence preparation

The exploratory commands and complete focused log passed on the exact integrated source, but were not produced by the canonical executor and therefore cannot satisfy this contract current_exact boundary. Prepare the frozen contract once through verification-plan execute; retain exploratory evidence as historical and do not claim it was imported. This explicit preparation is required by the read-only evidence gate, takes approximately two minutes, and does not add a full suite or benchmark. The Verification Plan uses native package_test path declarations (not command fields); each focused file executes once in this boundary.

## Local acceptance and evidence reuse

Gatekeeper PASS binds verified tree31c9d1f5234b772ebe759fd9d2d567db2538e6de. The final four task-record changes use native baseline_with_delta with an explicit full-tree path guard; task-sync/workflow remain current_exact. The user approved formal closeout on 2026-09-16. Contract remains Active until canonical acceptance and archive complete. The existing gatekeeper source review is retained as local evidence; the required official Codex plugin acceptance is a distinct formal boundary.

## Owner acceptance authorization

On 2026-09-16 the user explicitly approved changing user_waiver to allowed and signing off the concrete strict-gate repair (implementation 228dddc5, canonical preparation run-20260916T131135-79102). Record the disposition as user_waiver, never external_pass. This does not authorize publication or installation.

## Approved archive integrity follow-up

User approved fixing archive path rewriting of the frozen Verification Plan and completing the same owner-accepted closeout. Scope is the canonical archive helper, its generated helper projection, the existing archive evidence tests and task/research records. Preserve executable plan bytes and hash; continue rewriting navigation pointers; do not relax receipt validation or create compatibility authority. Verify red-green plus actual receipt validity before and after archive.

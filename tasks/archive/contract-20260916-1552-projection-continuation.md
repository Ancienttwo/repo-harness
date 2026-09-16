> **Archived**: 2026-09-16 15:52
> **Related Plan**: plans/archive/plan-20260916-0233-projection-continuation.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260916-1552
> **Archive Projection V1**: `plans/plan-20260916-0233-projection-continuation.md` => `plans/archive/plan-20260916-0233-projection-continuation.md`
> **Archive Projection V1**: `tasks/notes/20260916-0233-projection-continuation.notes.md` => `tasks/archive/notes-20260916-1552-projection-continuation.md`
> **Archive Projection V1**: `tasks/contracts/20260916-0233-projection-continuation.contract.md` => `tasks/archive/contract-20260916-1552-projection-continuation.md`
> **Archive Projection V1**: `tasks/reviews/20260916-0233-projection-continuation.review.md` => `tasks/archive/review-20260916-1552-projection-continuation.md`

# Task Contract: Projection continuation

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260916-0233-projection-continuation.md
> **Task Profile**: bugfix
> **Owner**: Codex
> **Capability ID**: root
> **Review Base**: d52f9a9be7a8056f6ece98e8ff1d7684cd3b7672
> **Review File**: tasks/archive/review-20260916-1552-projection-continuation.md
> **Notes File**: tasks/archive/notes-20260916-1552-projection-continuation.md

## Why

Host-budget exhaustion leaves valid work pending without an independent consumer. A completed Stop must be able to hand that exact job to a bounded continuation.

## Goal

Resume host-budget-yielded projection once after Stop using the existing queue and complete formal source acceptance with a typed receipt.

## Scope

- In scope: the frozen continuation implementation, existing evidence reuse, canonical acceptance and local contract closeout/integration approved by the user on 2026-09-16. Subsequent approval covers creating the missing local CodeGraph index, deterministic projection manifest refresh, and proof-only candidate reconciliation.
- Out of scope: registry publication, global installation, provider updates, semantic modeling and unrelated repository changes. Release/install requires its own concrete version boundary.

## Stop Conditions

- Stop if edits exceed the approved strict-queue-gate follow-up or a required gate cannot be satisfied from valid evidence.
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
  - tasks/archive/contract-20260916-1552-projection-continuation.md
  - tasks/archive/notes-20260916-1552-projection-continuation.md
  - tasks/archive/review-20260916-1552-projection-continuation.md
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

- root_cause: The continuation exposes an existing running claim as drain status idle; stop-handler.ts checks status instead of unfinished queue counts, so a second strict Stop bypasses delivery gating. The original missing-consumer repair remains covered by its prior red evidence.
- repro: bun test tests/architecture-projection-continuation.test.ts --test-name-pattern 'Stop yields' on candidate 88248407: hold the detached provider, invoke a second Stop, observe empty stdout instead of strict block.
- regression_guard: tests/architecture-projection-continuation.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/projection-continuation/strict-gate-pre-fix.log

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "metadata-delta",
      "kind": "command",
      "command": "bun -e 'import { captureGitVirtualTreeSnapshot } from \"./src/effects/evidence/verification-execution.ts\"; import { execFileSync } from \"node:child_process\"; const current = captureGitVirtualTreeSnapshot(process.cwd()); const changed = execFileSync(\"git\", [\"diff\", \"--name-only\", \"4c4790604cee79bb9fc37c6fcf2cf56345c9caab\", current.tree_hash], {encoding:\"utf8\"}).trim().split(\"\\n\").filter(Boolean); const allowed = new Set([\"docs/architecture/.projection-manifest.json\", \"plans/archive/plan-20260916-0233-projection-continuation.md\", \"tasks/archive/contract-20260916-1552-projection-continuation.md\", \"tasks/archive/notes-20260916-1552-projection-continuation.md\", \"tasks/archive/review-20260916-1552-projection-continuation.md\"]); const unexpected = changed.filter(path => !allowed.has(path)); if (unexpected.length) throw new Error(\"Non-metadata changes after verified candidate: \" + unexpected.join(\", \")); console.log(\"Verified metadata-only delta: \" + changed.join(\", \"));'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Bind owner acceptance to the verified strict-gate implementation; permit task metadata and deterministic manifest provenance only.",
      "inputs": {
        "env": []
      }
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
        "metadata-delta",
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
        "metadata-delta",
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
        "metadata-delta",
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
        "metadata-delta",
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
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-9ffe4d89d0ac4c2ebe9d.json",
        "execution_id": "vx-9ffe4d89d0ac4c2ebe9d"
      },
      "delta_checks": [
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-f7c108664c3044c19549.json",
        "execution_id": "vx-f7c108664c3044c19549"
      },
      "delta_checks": [
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-2ed144923e9e49d8b9bd.json",
        "execution_id": "vx-2ed144923e9e49d8b9bd"
      },
      "delta_checks": [
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-9a0ece5c6fa24b72ae74.json",
        "execution_id": "vx-9a0ece5c6fa24b72ae74"
      },
      "delta_checks": [
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-cb89fb6a1c3a4d1995cc.json",
        "execution_id": "vx-cb89fb6a1c3a4d1995cc"
      },
      "delta_checks": [
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-0c575a4f13d043d3aa10.json",
        "execution_id": "vx-0c575a4f13d043d3aa10"
      },
      "delta_checks": [
        "metadata-delta",
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
        "run_file": ".ai/harness/runs/verification-vx-3471582b944448f799b0.json",
        "execution_id": "vx-3471582b944448f799b0"
      },
      "delta_checks": [
        "metadata-delta",
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

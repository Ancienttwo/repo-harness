> **Archived**: 2026-09-22 00:59
> **Related Plan**: plans/archive/plan-20260921-1946-akn00-native-execution-admission.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260922-0059
> **Archive Projection V1**: `plans/plan-20260921-1946-akn00-native-execution-admission.md` => `plans/archive/plan-20260921-1946-akn00-native-execution-admission.md`
> **Archive Projection V1**: `tasks/notes/20260921-1946-akn00-native-execution-admission.notes.md` => `tasks/archive/notes-20260922-0059-akn00-native-execution-admission.md`
> **Archive Projection V1**: `tasks/contracts/20260921-1946-akn00-native-execution-admission.contract.md` => `tasks/archive/contract-20260922-0059-akn00-native-execution-admission.md`
> **Archive Projection V1**: `tasks/reviews/20260921-1946-akn00-native-execution-admission.review.md` => `tasks/archive/review-20260922-0059-akn00-native-execution-admission.md`

# Task Contract: akn00-native-execution-admission

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260921-1946-akn00-native-execution-admission.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: verification-evals-checks
> **Last Updated**: 2026-09-21 21:21
> **Review File**: `tasks/archive/review-20260922-0059-akn00-native-execution-admission.md`
> **Notes File**: `tasks/archive/notes-20260922-0059-akn00-native-execution-admission.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

当前Host版本与已注册probe不匹配；需要准确的非容器准入拒绝报告，避免把命令存在或注入测试当作写执行准入。

## Goal

实现固定Darwin arm64/Codex CLI 0.154.0、parent+delegated writer+只读verifier路径的只读准入报告。复用原ME-2B判定器；缺probe输出runtime_not_admitted；Campaign集成固定not_evaluated。

## Scope

- In scope: typed runtime discovery、准入组合报告、聚焦故障测试与实际model-free拒绝证据。
- Out of scope: AKN-01—07、生产runtime/权限/policy、Host探针中的模型调用、容器、provider外部写、安装升级。
- Taste constraints: 最小脚本边界；不复制ME-2B oracle，不新增通用Host框架。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

任何未注册probe、身份不匹配、半缺证据或测试注入能被CLI标成admitted，均否定本实现；最便宜的证明是故障测试加当前0.154.0真实拒绝读回。

## Workflow Inventory

- Source plan: `plans/archive/plan-20260921-1946-akn00-native-execution-admission.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260922-0059-akn00-native-execution-admission.md`
- Notes file: `tasks/archive/notes-20260922-0059-akn00-native-execution-admission.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "akn00-admission-tests", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/architecture/.projection-manifest.json
  - scripts/me2b-runtime-admission-canary.ts
  - tests/me2b-runtime-admission-canary.test.ts
  - scripts/akn00-native-execution-admission.ts
  - tests/akn00-native-execution-admission.test.ts
  - docs/researches/20260921-akn00-native-execution-admission.md
  - docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
  - plans/archive/plan-20260921-1946-akn00-native-execution-admission.md
  - tasks/archive/contract-20260922-0059-akn00-native-execution-admission.md
  - tasks/archive/review-20260922-0059-akn00-native-execution-admission.md
  - tasks/archive/notes-20260922-0059-akn00-native-execution-admission.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist:
    - scripts/akn00-native-execution-admission.ts
    - tests/akn00-native-execution-admission.test.ts
    - docs/researches/20260921-akn00-native-execution-admission.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "workflow-delta",
      "kind": "command",
      "command": "python3 -c 'import hashlib,os,pathlib,subprocess\nbase='\"'\"'6e4c4ffb4fb590d0132cee74039e9eda91c70218'\"'\"'\nallowed=set(['\"'\"'plans/plan-20260921-1946-akn00-native-execution-admission.md'\"'\"', '\"'\"'tasks/contracts/20260921-1946-akn00-native-execution-admission.contract.md'\"'\"', '\"'\"'tasks/notes/20260921-1946-akn00-native-execution-admission.notes.md'\"'\"', '\"'\"'tasks/reviews/20260921-1946-akn00-native-execution-admission.review.md'\"'\"'])\nallowed.add('\"'\"'docs/architecture/.projection-manifest.json'\"'\"')\nentries=subprocess.check_output(['\"'\"'git'\"'\"','\"'\"'ls-tree'\"'\"','\"'\"'-rz'\"'\"',base]).split(b'\"'\"'\\0'\"'\"')\nknown=set()\nfor entry in entries:\n if not entry: continue\n meta,raw=entry.split(b'\"'\"'\\t'\"'\"',1); name=os.fsdecode(raw); known.add(name)\n if name in allowed: continue\n mode,kind,wanted=meta.decode().split(); p=pathlib.Path(name)\n if mode=='\"'\"'120000'\"'\"': data=os.fsencode(os.readlink(p)); actualmode='\"'\"'120000'\"'\"'\n else: data=p.read_bytes(); actualmode='\"'\"'100755'\"'\"' if p.stat().st_mode & 0o111 else '\"'\"'100644'\"'\"'\n actual=hashlib.sha1(b'\"'\"'blob '\"'\"'+str(len(data)).encode()+b'\"'\"'\\0'\"'\"'+data).hexdigest()\n if actual!=wanted or actualmode!=mode: raise SystemExit('\"'\"'baseline input drift: '\"'\"'+name)\nextra=set(os.fsdecode(p) for p in subprocess.check_output(['\"'\"'git'\"'\"','\"'\"'ls-files'\"'\"','\"'\"'--others'\"'\"','\"'\"'--exclude-standard'\"'\"','\"'\"'-z'\"'\"']).split(b'\"'\"'\\0'\"'\"') if p)-known-allowed\nif extra: raise SystemExit('\"'\"'unexpected new paths: '\"'\"'+repr(sorted(extra)))\nprint('\"'\"'All non-workflow baseline files and modes unchanged; only scoped workflow documents and generated projection manifest may differ'\"'\"')\n'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "逐文件和权限验证冻结tree仅本包workflow文档及自动投影manifest可变；当前architecture/task检查覆盖其delta",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "admission-tests",
      "kind": "command",
      "command": "bun test tests/me2b-runtime-admission-canary.test.ts tests/akn00-native-execution-admission.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "H0版本/subject错配、缺失能力、测试注入、终止未知与CLI无副作用",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-40e483b1aeb3499bae0a.json",
        "execution_id": "vx-40e483b1aeb3499bae0a"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "native-readback",
      "kind": "command",
      "command": "bun -e 'import {readFileSync} from \"node:fs\"; import {createHash} from \"node:crypto\"; const root=\".ai/harness/runs/akn00/\"; const r=JSON.parse(readFileSync(root+\"host-report.json\",\"utf8\")); if(readFileSync(root+\"host-report.exit.txt\",\"utf8\").trim()!==\"2\" || readFileSync(root+\"host-report.stderr.txt\").length || r.evidence_kind!==\"live_host\" || r.decision.status!==\"runtime_not_admitted\" || !r.decision.reasons.includes(\"host_probe_not_registered\") || r.me2b_ref!==null || r.campaign_integration!==\"not_evaluated\") throw Error(\"invalid native refusal readback\"); const actual=\"sha256:\"+createHash(\"sha256\").update(readFileSync(r.subject.runtime.executable_realpath)).digest(\"hex\"); if(actual!==r.subject.runtime.executable_sha256) throw Error(\"runtime changed\"); if(JSON.parse(readFileSync(\".ai/harness/policy.json\",\"utf8\")).development_campaign.mode!==\"off\") throw Error(\"policy changed\"); console.log(\"Native refusal readback valid; Campaign not evaluated\");'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "验证已在隔离HOME采集的真实版本拒绝报告、入口摘要与policy未启用；不重复Host调用",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "跨脚本共享typed discovery与测试类型验证",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-16352de65ea949f89a6b.json",
        "execution_id": "vx-16352de65ea949f89a6b"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "check-hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-dd326c7a319d409891d6.json",
        "execution_id": "vx-dd326c7a319d409891d6"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "check-helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-3977eebfbbde48f7a8b0.json",
        "execution_id": "vx-3977eebfbbde48f7a8b0"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "check-reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-8d6c666258af4650acad.json",
        "execution_id": "vx-8d6c666258af4650acad"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "deploy-sql-order",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-e2b0d80313164ac28132.json",
        "execution_id": "vx-e2b0d80313164ac28132"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "required repository integrity",
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
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-b6693f9ee01c47e597ac.json",
        "execution_id": "vx-b6693f9ee01c47e597ac"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    }
  ]
}
```

## Acceptance Notes (Human Review)

- H0-01—08以聚焦组合测试覆盖；现有ME-2B测试保留其原oracle。新增test文件拥有独立报告/CLI隔离边界。
- 实际Host只执行版本/help inventory，不启动任何模型或写探针；记录JSON、exit=2、subject与原始证据hash。没有registered probe时不伪造profile或terminal证据。
- 不运行full suite或Host模型请求；2026-09-22用户已批准提交与独立验收，允许原codex-plugin只读评审。本地检查完成不代替独立AcceptanceReceipt。真实API未具备时准确负向裁决即此包目标。
- 验证只在本隔离worktree执行，证据绑定当前subject；正式验证前冻结source和contract，避免重复执行相同fingerprint。

## Rollback Point

- Commit / checkpoint: 0d4371c3f95e63851f4e083718f3337bf9646345
- Revert strategy: 回滚本包脚本/测试/结论与workflow记录，保留原始证据；生产权限和Campaign从未启用。

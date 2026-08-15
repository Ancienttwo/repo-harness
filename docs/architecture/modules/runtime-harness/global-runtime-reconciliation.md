# runtime-harness/global-runtime-reconciliation 架構文檔

<!-- BEGIN ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-global-runtime-reconciliation" sourceDigest="sha256:b4e5e49d2d11f89de55595cb338eed7e9bb4a078692549d01626234eeb4478dd" rendererVersion="archcontext.docs-renderer/v3" outputDigest="sha256:b49229f01693ab53ffb93884f78c1081c017083b4bfe3dc01cd2741b35f1b38a" verifiedAgainst="main@f6363fe9631634a171e8086166f711c800dbb2cb@2026-08-16T03:02:40+08:00" -->
> **狀態**:`active`
> **Verified against**:`main@f6363fe9631634a171e8086166f711c800dbb2cb`(2026-08-16)
> **Capability ID**:`capability.runtime-harness.global-runtime-reconciliation`(kind `capability`)
> **Matched Prefixes**:`package.json`、`bun.lock`、`src/cli/index.ts`、`src/cli/commands/global-runtime.ts`、`scripts/check-managed-runtime.ts`、`scripts/sync-codex-installed-copies.sh`、`src/effects/architecture/**`、`tests/cli/global-runtime-init.test.ts`、`tests/cli/global-runtime.test.ts`、`tests/architecture-projection-provider.test.ts`、`tests/architecture-projection-orchestration.test.ts`、`assets/reference-configs/external-tooling.md`、`docs/reference-configs/external-tooling.md`、`docs/reference-configs/install-profiles.md`
> **Local Contracts**:`AGENTS.md`、`CLAUDE.md`
> **事實優先級**:倉庫當前狀態 > 本文檔機器區 > 本文檔人工區。機器區(引言、§1、§2)由 ArchContext 從架構模型與 Git 狀態投影生成,手改會在下次投影被覆蓋。

Reconciles the installed repo-harness runtime, its mandatory ArchContext closure, and profile-owned external tooling.

## 1. P1:能力架構地圖

### 1.1 架構圖

```mermaid
flowchart LR
  p1_capability_runtime_harness_global_runtime_reconciliation_401730e8["Global Runtime Reconciliation"]:::component
  p1_component_global_runtime_reconciliation_primary_d41cdd38["Global Runtime Reconciler"]:::component
  p1_capability_runtime_harness_global_runtime_reconciliation_401730e8 -->|"Reconcile and verify the selected global runtime closure"| p1_component_global_runtime_reconciliation_primary_d41cdd38
  classDef actor fill:#111827,color:#ffffff,stroke:#f9fafb,stroke-width:2px
  classDef component fill:#075985,color:#ffffff,stroke:#bae6fd,stroke-width:2px
  classDef datastore fill:#3f6212,color:#ffffff,stroke:#d9f99d,stroke-width:2px
  classDef external fill:#7c2d12,color:#ffffff,stroke:#fed7aa,stroke-width:2px
```

- Proof: `proven` (`sha256:b19871282a72599ab60a8f1af86d532e425c81ff6498b6ea9020591153bc8e10`).
- Semantic nodes: `2`; declared relations: `1`.

### 1.2 模組職責表

| 宣告入口 | 錨點 | 職責 |
| --- | --- | --- |
| `entrypoint.global-runtime-reconciliation.update` | `src/cli/commands/global-runtime.ts#runGlobalRuntimeSetup` | `sink.global-runtime-reconciliation.readback` → `src/cli/commands/global-runtime.ts#reconcileManagedRuntime` |
| `entrypoint.global-runtime-reconciliation.candidate-readback` | `src/cli/commands/global-runtime.ts#verifyInstalledManagedRuntime` | `sink.global-runtime-reconciliation.candidate-readback` → `src/cli/commands/global-runtime.ts#reconcileManagedRuntime` |

### 1.3 規模信號

- 文件數:`17`
- 總行數:`9150`
- 匹配前綴:`package.json`、`bun.lock`、`src/cli/index.ts`、`src/cli/commands/global-runtime.ts`、`scripts/check-managed-runtime.ts`、`scripts/sync-codex-installed-copies.sh`、`src/effects/architecture/**`、`tests/cli/global-runtime-init.test.ts`、`tests/cli/global-runtime.test.ts`、`tests/architecture-projection-provider.test.ts`、`tests/architecture-projection-orchestration.test.ts`、`assets/reference-configs/external-tooling.md`、`docs/reference-configs/external-tooling.md`、`docs/reference-configs/install-profiles.md`
- 復算:`archctx docs plan --json`(掃描 `source.include` 減 `source.exclude`,跳過 `.git/` 與 `node_modules/`)

### 1.4 依賴邊界

出向關係:

- `calls` → `component.global-runtime-reconciliation.primary` — Reconcile and verify the selected global runtime closure

入向關係:

- 無。

## 2. P2:端到端數據流

> **Proof**: `proven` (`sha256:b19871282a72599ab60a8f1af86d532e425c81ff6498b6ea9020591153bc8e10`); selectors `1/1`.

```mermaid
%%{init: {"theme":"base","themeVariables":{"background":"#0d1117","actorBkg":"#312e81","actorBorder":"#c4b5fd","actorTextColor":"#ffffff","signalColor":"#e5e7eb","signalTextColor":"#e5e7eb","labelBoxBkgColor":"#4c1d95","labelBoxBorderColor":"#c4b5fd","labelTextColor":"#ffffff","noteBkgColor":"#78350f","noteBorderColor":"#fcd34d","noteTextColor":"#ffffff","sequenceNumberColor":"#ffffff"}}}%%
sequenceDiagram
  autonumber
  participant p2_update_command_da52852b as Global Runtime Reconciliation
  participant p2_reconciler_93a3ce0f as Global Runtime Reconciler
  p2_update_command_da52852b->>p2_reconciler_93a3ce0f: Install candidate and verify exact dependency closure
  alt Mandatory closure and selected profile tooling are ready
  p2_update_command_da52852b->>p2_reconciler_93a3ce0f: Return versioned reconciliation receipt
    Note over p2_update_command_da52852b: Continue host runtime refresh
  else Package， Node， capability， or tooling readback failed
  p2_update_command_da52852b->>p2_reconciler_93a3ce0f: Return typed failure before later host mutation
    Note over p2_update_command_da52852b: Stop update with recovery detail
  end
```
<!-- END ARCHCONTEXT:generated target="projection_target.entity.capability-runtime-harness-global-runtime-reconciliation" -->

## 3. P3:設計決策與不變量

## 4. 歷史決策記錄(append-only)

## Optimization Backlog

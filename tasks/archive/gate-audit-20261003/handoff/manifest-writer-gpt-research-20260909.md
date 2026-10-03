# GPT Research Handoff：projection manifest 是否真的被迟到 writer 覆盖

日期：2026-09-09。状态：调查未闭环。本文附有源码摘录、完整复现脚本及实际输出，可单独转交；接收方不必能访问本机的 `/tmp`。

## 后续补证：请优先采用这组时间线（2026-09-09）

继续调查后取得本 checkout 的 `HEAD`、`main`、`origin/main` reflog 与原 receipt。以下均为 UTC：

| 时间 | 本地 HEAD / main | 观察 |
|---|---|---|
| 04:41:38 | bc2328db | amend 后进入该 revision |
| 04:48:18 | 仍为 bc2328db | origin/main 被 fetch 到 22303134；本地 HEAD 没有前进 |
| 09:31:19 | 仍为 bc2328db | job-ca58d5a7 的 attempt 2 receipt：headSha/baseHeadSha=bc2328db，noop，files=[] |
| 09:37:22 | 仍为 bc2328db | job-387fd0b4 receipt 同样为 bc2328db，noop，files=[] |
| 10:43:52 | 3a30bd89 | 本地 pull 才 fast-forward |
| 11:08:30 | 仍为 3a30bd89 | job-ba2bec8a receipt：headSha/baseHeadSha=3a30bd89，noop，files=[] |

因此，旧 handoff 中“该时刻本 checkout 的 HEAD 已远新于 bc2328db”不适用于上述两笔完成记录；必须区分远端跟踪 ref 和本地 HEAD。这两笔 receipt 不能作为 queue 重用过期 expected.headSha 的证据。

另，`git show bc2328db:docs/architecture/.projection-manifest.json` 的 provenance.baseHeadSha 确实为 e2d876ce。e2d876ce 是更早时间创建的分支 commit，但 `git merge-base --is-ancestor e2d876ce bc2328db` 返回 1；不能把生成时间先后直接说成 Git ancestry 或语义回退。

后续又以只读 SQLite 查询找到实际 apply：journal `changeset_60b19e29-cba4-47bd-8609-875a9d10137e` 在 09:29:58.268Z 开始、09:29:58.858Z committed，`reason.taskSessionId=repo-harness.projection.job-ca58d5a7da32ca18d1e23f15`，draft base HEAD=bc2328db，files_json 明确记录 manifest 的 render_projection 写入。ChangeSet ID 为 `changeset.docs-projection-ee5cffd24c0be372`。09:31 的 noop 是同一个 job 的后续重试结果，不是这次写入。另两次 journal 在 10:47:01 和 11:54:35，base HEAD 分别为 3a30bd89、d48d2eee，也都与各自本地 reflog 一致。

writer 链已追到 CLI projection files → planUpdate/applyUpdate → daemon → ChangeSetEngine.applyFileOperation。标准 docs/protocol clean/noop 分支在 plan/apply 前返回，没有发现独立直接写 manifest 的生产源码路径。daemon 是 instance boolean guard 加 RPC 启动时 canonical workspace 的 exclusive lock。上述路径与 journal 序列化在 v0.5.8 和当前检查 revision 之间没有变化；相邻 #150 只改变 generated rebuild。

剩余边界：journal 的 changeSetMetadata 不保存 projectionFiles 的 body 和 per-file expectedHash，files_json 只记路径/backup/temp；没有恢复事故前后完整 bytes，也不能排除非 daemon 的外部写入。所以已定位一次实际 writer，并推翻上述记录的过期 request HEAD 假设，但不能升级成“所有迟到写入都不可能”。请优先回答现有证据是否还支持生产修复，勿继续按已反证的前提追一个假定 writer。

本地证据快照：`.ai/harness/handoff/manifest-writer-timeline-20260909.json`；可以用本文表格和三个完整 job ID 对照原 receipts。
另有 `.ai/harness/handoff/manifest-writer-journal-proof-20260909.json` 保存三笔筛选后的 journal 记录。后文原始研究问题中的“writer 尚未定位”已被此补记更新；缺的是原始写前/写后 bytes。

## 给 GPT 的任务

请独立研究下面的证据，先挑战问题定义，再定位写入者。不要直接接受“manifest 的旧 baseHeadSha 说明旧 writer 反向盖章”这个假设，也不要把直接 engine 的竞态直接认定为线上根因。

本轮只做研究、反例和最小下一步方案，不改生产代码，不发版、不全域安装、不调整 policy，不把不同问题捆绑成一个大修复。

需要回答：观察到的是正常保留生成时 provenance、真正的旧内容覆盖，还是第三种情况？如果确有逆写，哪个实际可达的 writer 在哪个边界越过了什么守卫？如果证据不足，请明确列出最少还缺什么，并给出一个有判别力的实验。

## 背景与边界

repo-harness 会调用 arch-context 的 projection/provider 路径，把架构文档和 `docs/architecture/.projection-manifest.json` 投影到 worktree，并检查输入快照是否仍成立。用户此前观察到 manifest stamp 看似倒退，提出需要迟到 writer 回归：A 开始处理旧输入并暂停；B 处理新输入并完成；恢复 A；A 不得把 B 覆盖成旧状态。

早先的根因假设已被源码否定。此次没有取得足以归因的原始事故 A/B 完整 manifest、进程身份及调用时间线。不能把“用户报告的现象”升级成“已证明的旧内容覆盖”。

涉及两个仓库：

- https://github.com/Ancienttwo/repo-harness
- https://github.com/Ancienttwo/arch-context

研究复现所用 arch-context 源码为 `bcafdfa5e54e8a8db30b947d9a7e46e0313a87a2`，已由 [PR #150](https://github.com/Ancienttwo/arch-context/pull/150) 合入，merge commit 为 `a2c34ca5326b506452fbcee49b2e745bddb642e5`。本机源码 worktree 是 `/Users/ancienttwo/Projects/arch-context-wt-projection-declared-writes`。其他机器应 checkout 该 revision，并替换附录脚本中的绝对 import 前缀。

## 已验证事实及其证明范围

### 1. Sticky provenance 能正常产生“旧 stamp”

入口：`packages/core/projection-engine/src/index.ts`，`stickyArchitectureDocumentationProjectionProvenance` / `architectureDocumentationStickyProvenanceDigest`，约 655–695 行。

sticky 比较使用 `sourceTreeDigest`、`modelDigest`、`rendererVersion`、`layoutVersion` 和 `generatedFrom`。它不以 `baseHeadSha` 或全 worktree identity 作为 freshness 判据。旧 provenance 通过校验且 sticky digest 相同时，直接保留旧 provenance；源码明确说明这是为了避免无关提交、提交 projection 本身以及 CodeGraph 注意到投影输出后导致 stamp 永远追逐 HEAD。

实际复现：prior HEAD 为 aaaa…，current HEAD 为 bbbb…，上述语义输入不变，render 输出仍保留 aaaa… 和 prior worktreeDigest。

**能证明**：旧 baseHeadSha / worktreeDigest 本身不能证明发生过迟到 writer。

**不能证明**：原始事故一定只是 sticky；也不能证明真实内容没回退，或其他输入都没变。

### 2. 普通的 A/B 迟到 apply 会被 hash guard 拒绝

用两个 draft 对同一旧 manifest 建计划，先 apply B，再 apply A。A 的 `expectedHash` 仍指向旧文件，抛出 `Expected hash mismatch`；文件保持 B-new，`aDidOverwriteB=false`。

**能证明**：直接 ChangeSetEngine 的“B 在 A 检查文件 hash 之前完成”这一具体顺序有守卫。

**不能证明**：覆盖全部暂停点、完整 daemon/CLI 路径、跨进程并发、文件缺失/删除场景、多文件事务或崩溃恢复。这里的 modelStore 是最小 stub，不是生产模型或端到端输入演进。

### 3. hash 检查后的 await 窗口能重现 engine 级覆盖

入口：`packages/core/changeset-engine/src/index.ts`，`ChangeSetEngine.applyFileOperation`，约 335–378 行。顺序为：

1. 校验目标路径和旧文件 `expectedHash`。
2. `await journal.recordChangeSetFile(...)`。
3. 把旧目标 rename 为 backup。
4. 写入当前 draft 的 body。

实际复现：两个独立 engine 实例；A 的 journal callback 在 hash 检查后调用并等待 B apply 完成，再返回让 A 继续。输出 `bApplied=true`、`aOverwroteB=true`，最终文件是 A。

这是确定性插入并发写入的测试 seam，不是一次观察到的生产 journal 行为。它证明该 engine 边界在缺少共同串行化时存在 TOCTOU 窗口；不能据此断言线上 daemon 能执行同样顺序。

### 4. 标准 daemon 有 writer 串行化边界

此前只读追踪发现，标准 daemon 的 apply 进入 `withWriter()`；同一个受管 runtime 的并发 writer 会被 `runtime writer is locked` 拒绝，RPC 路径另有 root lock。CLI/provider 还存在 profile、HEAD/model 和 per-file hash 前置检查。

这一条是源码追踪结论，本文的三个脚本没有端到端验证它。请在固定 revision 上定位 `applyUpdate`、`withWriter` 和 root-lock 调用，核对锁的真实作用域与生命周期，特别是跨进程、root canonicalization、daemon 重启、direct engine consumers。上述场景目前是待查问题，不是已确认漏洞。

## 已完成的相邻修复，勿混为同一问题

arch-context PR #150 修的是：只包含显式 `projectionFiles` 的 projection/context ChangeSet，仍额外调用通用 generated-projection writer，导致 `.archcontext/generated/ARCHITECTURE.md` 出现在申报写入集合之外。它改变了 harness 所观察的输入 digest，触发 snapshot fence 拒绝。

修正让这类显式投影不再额外执行该通用 writer；没有扩大 digest ignore、放松 snapshot fence 或改 receipt 规则。engine 24 项、CLI generated-present/missing 2 项、tarball 安装 smoke 和 PR 跨平台 CI 已通过。源码已合入，但此次没有发布新包或更换全域安装；不能把固定源码实验当作已部署 runtime 的证据。

repo-harness [PR #379](https://github.com/Ancienttwo/repo-harness/pull/379) 已把 Governance 与功能 Test 拆成独立 job，`Required / CI` 用 `always()` 聚合且要求全部成功。它只改善失败可见性，不修 writer。

“被回收 attempt 可能已写 worktree、但 receipt 被拒”的 provider apply lease 问题仍是另一个独立 slice。不要把 receipt admission、输入快照有效性、文件写入串行化、声明输出范围视为同一个保证。

## 建议的研究顺序

1. **P1 / Map**：列出 manifest 所有实际写入入口、writer owner、进程/daemon/root 边界、使用的源码或安装产物身份。区分 renderer 生成内容、engine 落盘、外部复制/恢复路径；给出确切文件、符号和调用链。
2. **P2 / Trace**：从一次实际调用追到 manifest 最终 bytes。对齐 A/B 的输入语义 digest、完整文件 hash、draft expectedHash、writer 身份和时间顺序。先判断是 generation stamp 留旧，还是正文/语义输入真的退回旧状态。
3. 检查所有可达的暂停点。至少区分 A 在规划后、hash 检查前、journal await 中及写入后暂停。说明每个点由谁拒绝或串行化；不要只重复已经 green 的普通 A/B 脚本。
4. **P3 / Decide**：只有建立了可达路径才建议生产改动；否则给一个可补齐归因的最小观察/实验方案。说明锁或 fence 的 owner、跨进程/崩溃/多文件事务约束，以及 10 倍并发时首先失效的边界。

不要以“再加一次 hash 检查”直接宣告原子性成立；需要证明检查与真正写入之间剩余窗口的处理方式。也不要直接删除 sticky：先解释它现有的固定点约束以及什么业务输入应当触发更新。

## 请返回的结果

- 一句话判断：已确认根因 / 候选根因 / 证据不足，并标注信心。
- 证据矩阵：每个假设的支持、反证、未知、对应源码或实验。
- 一条确切 writer 调用链，或为什么目前无法建立这条链。
- 一个最小可区分实验：输入、暂停点、B 的动作、恢复 A、预期文件/错误/receipt，以及什么结果会推翻当前判断。
- 若建议修复：最小独立 slice、必须保持的不变量、必要回归与明确非目标。若不能归因：不要给虚构修复，列出最少缺失证据。

附录是本机主线重跑过的实验，不是已提交的正式回归测试；三个命令都 exit 0，其中第三个成功复现了坏结果。请不要把“脚本 exit 0”理解成产品正确性通过。


## 附录 A：Sticky 源码

`packages/core/projection-engine/src/index.ts:655`，固定研究 revision 的摘录。

```ts
/**
 * HEAD and full-worktree identity describe when a projection was produced; they are not semantic
 * freshness inputs. Preserve that generation snapshot while the declared architecture source,
 * model, CodeGraph runtime, and layout inputs are unchanged, otherwise an unrelated commit (or
 * committing the projection itself) would make the manifest permanently chase HEAD. CodeGraph's
 * indexed status digest can legitimately advance when it notices projection-owned docs; that is
 * not an architecture input and must not make the manifest chase its own output. A malformed or
 * internally inconsistent prior provenance is never reused and is surfaced by the ordinary
 * manifest drift check.
 */
function stickyArchitectureDocumentationProjectionProvenance(
  current: ArchitectureDocumentationProjectionProvenanceV1,
  existingManifestBody: string | undefined
): ArchitectureDocumentationProjectionProvenanceV1 {
  if (!existingManifestBody) return current;
  try {
    const parsed = JSON.parse(existingManifestBody) as { provenance?: ArchitectureDocumentationProjectionProvenanceV1 };
    const prior = parsed.provenance;
    if (!prior) return current;
    assertArchitectureDocumentationProjectionProvenance(prior, current.rendererVersion);
    return architectureDocumentationStickyProvenanceDigest(prior) === architectureDocumentationStickyProvenanceDigest(current)
      ? prior
      : current;
  } catch {
    return current;
  }
}

function architectureDocumentationStickyProvenanceDigest(
  provenance: ArchitectureDocumentationProjectionProvenanceV1
): string {
  return digestJson({
    // `sourceTreeDigest` is the authoritative declared-source boundary. Do not use the full
    // worktree snapshot here: unrelated files and projection-owned outputs must not invalidate a
    // renderer fixed point merely because CodeGraph reindexed them.
    sourceTreeDigest: provenance.sourceTreeDigest,
    modelDigest: provenance.modelDigest,
    rendererVersion: provenance.rendererVersion,
    layoutVersion: provenance.layoutVersion,
    generatedFrom: provenance.generatedFrom
  } as unknown as Json);
```


## 附录 B：文件写入源码

`packages/core/changeset-engine/src/index.ts:335`，固定研究 revision 的摘录。

```ts
    operation: ChangeOperationKind,
    backups: { path: string; backupPath: string; tempPath?: string; existed: boolean }[],
    journalId: string | undefined,
    sequence: number,
    agentContextPaths: ReadonlySet<string> = EMPTY_PATH_SET
  ): Promise<void> {
    assertSafeTarget(root, path, pathScope(operation, agentContextPaths));
    const deps = this.requireDeps();
    const absolute = resolve(root, path);
    const existed = existsSync(absolute);
    const backupPath = `${absolute}.archctx-backup`;
    const tempPath = operation === "delete_entity" ? undefined : `${absolute}.archctx-tmp-${process.pid}-${sequence}`;
    if (existsSync(backupPath)) throw new Error(`Backup path already exists: ${path}`);
    if (existed) assertExpectedHash(absolute, expectedHash);
    else if (expectedHash !== "missing") throw new Error(`Expected missing file hash for new path: ${path}`);
    const backup = { path: absolute, backupPath, tempPath, existed };
    if (journalId) {
      await deps.journal?.recordChangeSetFile(journalId, {
        path,
        tempPath,
        backupPath,
        existed,
        operation
      });
    }
    backups.push(backup);
    if (existed) {
      renameSync(absolute, backupPath);
      fsyncDirectory(dirname(absolute));
    }
    if (operation === "delete_entity") {
      rmSync(absolute, { force: true });
    } else {
      atomicWriteFile(absolute, tempPath!, body);
    }
  }
}

export function planArchitectureCandidateChangeSet(input: ArchitectureCandidateChangeSetPlanInput): ArchitectureCandidateChangeSetPlan {
  assertNoAgentProposalDeltaPromotion(input.delta);
  assertPolicyEvaluationMatchesDelta(input.delta, input.policyEvaluation);
  const acceptedActionSet = new Set<ArchitectureCandidateDeltaPolicyAction>(input.acceptedActions ?? ["auto-accept"]);
  const candidatesById = new Map(input.delta.candidateChanges.map((candidate) => [candidate.candidateChangeId, candidate]));
  const decisionsByCandidateId = new Map(input.policyEvaluation.decisions.map((decision) => [decision.candidateChangeId, decision]));
```


## 附录 C：Sticky 复现

原脚本：`/tmp/archctx-sticky-proof.XXXXXX.ts`。跨机器使用时替换绝对源码 import 前缀。

```ts
import {
  ARCHITECTURE_DOCS_LAYOUT_VERSION,
  ARCHITECTURE_DOCS_RENDERER_VERSION,
  architectureDocumentationProjectionProvenance,
  renderArchitectureDocumentationProjection,
  type NativeModel,
} from "/Users/ancienttwo/Projects/arch-context-wt-projection-declared-writes/packages/core/projection-engine/src/index.ts";
const d = "sha256:" + "1".repeat(64);
const generatedFrom = { codeGraphPackage: "@colbymchenry/codegraph", codeGraphVersion: "1.5.0", codeGraphBinaryDigest: d, codeGraphStatus: "unavailable" as const };
const base = { sourceTreeDigest: d, modelDigest: d, codeGraphDigest: d, indexedWorktreeDigest: null, rendererVersion: ARCHITECTURE_DOCS_RENDERER_VERSION, layoutVersion: ARCHITECTURE_DOCS_LAYOUT_VERSION, generatedFrom };
const prior = architectureDocumentationProjectionProvenance({ ...base, baseHeadSha: "a".repeat(40), worktreeDigest: "sha256:" + "2".repeat(64) });
const current = architectureDocumentationProjectionProvenance({ ...base, baseHeadSha: "b".repeat(40), worktreeDigest: "sha256:" + "3".repeat(64) });
const model: NativeModel = { nodes: [], relations: [], flows: [] };
const plan = renderArchitectureDocumentationProjection({
  model, sourceDigest: d, provenance: current,
  verifiedAgainst: { branch: "main", commit: "b".repeat(40), committedAt: "2026-09-09T00:00:00Z" },
  sourceChangesSinceStamp: [], sourceScaleSignals: [], importGraphs: [], selectorEvidence: [],
  existingFiles: [{ path: "docs/architecture/.projection-manifest.json", body: JSON.stringify({ provenance: prior }) }],
});
console.log(JSON.stringify({ priorBase: prior.baseHeadSha, currentBase: current.baseHeadSha, outputBase: plan.provenance.baseHeadSha, priorWorktree: prior.worktreeDigest, outputWorktree: plan.provenance.worktreeDigest }, null, 2));

```

主线实际输出：

```json
{
  "priorBase": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "currentBase": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "outputBase": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "priorWorktree": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "outputWorktree": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
}

```


## 附录 D：普通 A/B 复现

原脚本：`/tmp/archctx-ab-proof.XXXXXX.ts`。跨机器使用时替换绝对源码 import 前缀。

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestJson } from "/Users/ancienttwo/Projects/arch-context-wt-projection-declared-writes/packages/contracts/src/index.ts";
import { ChangeSetEngine } from "/Users/ancienttwo/Projects/arch-context-wt-projection-declared-writes/packages/core/changeset-engine/src/index.ts";
const root = process.env.PROOF_ROOT ?? "/tmp/archctx-ab-fixed";
mkdirSync(join(root, "docs/architecture"), { recursive: true });
const path = "docs/architecture/.projection-manifest.json";
const abs = join(root, path);
const oldBody = '{"state":"A-old"}\n';
const newBody = '{"state":"B-new"}\n';
const aBody = '{"state":"A-late"}\n';
writeFileSync(abs, oldBody);
const bodyHash = (body: string) => digestJson({ body });
const base = { headSha: "a".repeat(40), worktreeDigest: bodyHash(oldBody), modelDigest: bodyHash(oldBody) };
const engine = new ChangeSetEngine({
  modelStore: { validateModel: async () => ({ valid: true, errors: [], modelDigest: bodyHash(oldBody) }) } as any,
  projection: { planGeneratedProjection: () => [] }
});
const op = (body: string, expectedHash: string) => ({ op: "render_projection" as const, expectedHash: "missing", projectionFiles: [{ path, expectedHash, body }] });
const a = engine.approve(engine.plan({ id: "A", base, reason: { taskSessionId: "A" }, operations: [op(aBody, bodyHash(oldBody))] }));
const b = engine.approve(engine.plan({ id: "B", base, reason: { taskSessionId: "B" }, operations: [op(newBody, bodyHash(oldBody))] }));
await engine.apply(root, b);
let aError = "none";
try { await engine.apply(root, a); } catch (error) { aError = error instanceof Error ? error.message : String(error); }
console.log(JSON.stringify({ bFinal: readFileSync(abs, "utf8"), aError, aDidOverwriteB: readFileSync(abs, "utf8") === aBody, fileExists: existsSync(abs) }, null, 2));

```

主线实际输出：

```json
{
  "bFinal": "{\"state\":\"B-new\"}\n",
  "aError": "Expected hash mismatch: /tmp/archctx-ab-parent.RIR2Pa/docs/architecture/.projection-manifest.json",
  "aDidOverwriteB": false,
  "fileExists": true
}

```


## 附录 E：hash-await-rename 复现

原脚本：`/tmp/archctx-toctou-proof.XXXXXX.ts`。跨机器使用时替换绝对源码 import 前缀。

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestJson } from "/Users/ancienttwo/Projects/arch-context-wt-projection-declared-writes/packages/contracts/src/index.ts";
import { ChangeSetEngine } from "/Users/ancienttwo/Projects/arch-context-wt-projection-declared-writes/packages/core/changeset-engine/src/index.ts";
const root = process.env.PROOF_ROOT ?? "/tmp/archctx-toctou-fixed";
mkdirSync(join(root, "docs/architecture"), { recursive: true });
const path = "docs/architecture/.projection-manifest.json";
const abs = join(root, path);
const oldBody = '{"state":"old"}\n';
const bBody = '{"state":"B"}\n';
const aBody = '{"state":"A"}\n';
writeFileSync(abs, oldBody);
const hash = (body: string) => digestJson({ body });
const base = { headSha: "a".repeat(40), worktreeDigest: hash(oldBody), modelDigest: hash(oldBody) };
const make = (id: string, body: string) => ({ id, base, reason: { taskSessionId: id }, operations: [{ op: "render_projection" as const, expectedHash: "missing", projectionFiles: [{ path, expectedHash: hash(oldBody), body }] }] });
const emptyProjection = { planGeneratedProjection: () => [] };
const modelStore = { validateModel: async () => ({ valid: true, errors: [], modelDigest: hash(oldBody) }) } as any;
const bEngine = new ChangeSetEngine({ modelStore, projection: emptyProjection });
const bDraft = bEngine.approve(bEngine.plan(make("B", bBody)));
let bApplied = false;
const aEngine = new ChangeSetEngine({
  modelStore,
  projection: emptyProjection,
  journal: {
    beginChangeSet: async () => "journal-A",
    recordChangeSetFile: async () => { await bEngine.apply(root, bDraft); bApplied = true; },
    commitChangeSet: async () => undefined,
    completeChangeSetCleanup: async () => undefined,
    abortChangeSet: async () => undefined,
    recoverPendingChangeSets: () => 0,
  }
});
const aDraft = aEngine.approve(aEngine.plan(make("A", aBody)));
await aEngine.apply(root, aDraft);
console.log(JSON.stringify({ bApplied, final: readFileSync(abs, "utf8"), aOverwroteB: readFileSync(abs, "utf8") === aBody }, null, 2));

```

主线实际输出：

```json
{
  "bApplied": true,
  "final": "{\"state\":\"A\"}\n",
  "aOverwroteB": true
}

```

# Plan: Fix AcceptanceReceipt evidence fingerprint key-order sensitivity

> **Status**: Archived
> **Created**: 20260731-0612
> **Slug**: receipt-fingerprint-normalization
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260731-0612-receipt-fingerprint-normalization.md`; after execution revert branch `codex/receipt-fingerprint-normalization` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md`
> **Task Review**: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md`
> **Implementation Notes**: `tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260731-0612-receipt-fingerprint-normalization.md`
- Sprint contract: `tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md`
- Sprint review: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md`
- Implementation notes: `tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260731-0612-receipt-fingerprint-normalization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260731-0612-receipt-fingerprint-normalization.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md`
- Review file: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md`
- Implementation notes file: `tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260731-0612-receipt-fingerprint-normalization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260731-0612-receipt-fingerprint-normalization.md`; after execution revert branch `codex/receipt-fingerprint-normalization` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260731-0612-receipt-fingerprint-normalization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md`, `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md`, and `tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260731-0612-receipt-fingerprint-normalization.md`; after execution revert branch `codex/receipt-fingerprint-normalization` or the explicitly reviewed diff.

## Captured Planning Output

# 修復 AcceptanceReceipt 證據指紋的 key-order 敏感性(acceptance-receipt.ts:244)

## Context

root-cause-prover 確定性復現(2026-07-31,/tmp 沙箱 + 現場 ledger 雙向證明):`scripts/acceptance-receipt.ts:244` 用 `sha256(JSON.stringify(canonical))` 計算 `verification_evidence_sha256`,而 `canonical.benchmark_evidence` / `canonical.commands` 直傳原 JSON 物件引用,其 key order 由 `src/effects/evidence/event-writer.ts:82-92` 的 inline/blob 分岔決定——inline(<8192B)保留 producer key order,blob(≥8192B)存 `canonicalize()` 遞迴排序版。語義完全不變的重物化因此翻掉指紋,`acceptance-receipt.ts:624` fail-closed 報 "verification evidence is stale",seal 與 verify 全掛。

非確定性來源已證明:同日兩包 seal 成功是因兩次 emit 都在 cap 以下;reference-configs-projection 的 payload 騎在 7693/8265 跨界,連死兩輪。事件數、順序、rebase 殘留、時間戳均已排除(不在 canonical 10 欄集合內)。

設計意圖依據 `docs/reference-configs/sprint-contracts.md:95`:「A semantic change invalidates the old receipt」——指紋本該是語義不變量,缺陷是歸一化漏掉了序列化順序這一維非語義波動。

## 修復面(唯一生產改動)

`scripts/acceptance-receipt.ts:244`:`sha256(JSON.stringify(canonical))` → `sha256(stableJson(canonical))`。`stableJson` 已存在同檔 `:105-110`,且已是 `waiverGrantFingerprint`(`:274`)的既有 local pattern——不新增抽象、不動儲存層。沙箱已驗:修後 guard 2 pass / 0 fail。

被否決的替代方案(記入 notes):
- 改 materializer / 停止第二次 emit:打破 EPC-05 不變量(latest.json 是 ledger 純投影、單一 writer),且丟失 `acceptance_receipt: pass` 合法證據。
- 讓 inline 也 canonicalize:動 event-writer 影響 idempotency key 與所有既有事件,治標;根因在比對端歸一化不完整。

## 已知副作用(接受,記入 notes 與 CHANGELOG 不需要——內部證據格式)

改算法後所有既有 receipt 指紋失效。現存唯一活 receipt 是 projection 包那份(本就卡死、必須重錄),無其他受害者。

## 步驟(TDD:RED → GREEN)

1. **RED**:落 guard `tests/acceptance-receipt-evidence-fingerprint.test.ts`(全文見附錄,prover 已在未修碼上實測 1 pass / 1 fail)。capture:
   `bun test tests/acceptance-receipt-evidence-fingerprint.test.ts > tasks/notes/20260731-receipt-fingerprint.pre-fix.log 2>&1; s=$?; echo "PRE_FIX_EXIT=$s" >> 同檔`
   確認末行 `PRE_FIX_EXIT=1`、含 guard 路徑、1 fail(第二個 fail-closed 對照 test 在未修碼上就綠)。commit。
2. **GREEN**:改 `:244` 一行。guard 2 pass。
3. **驗證**:
   - `bun test tests/acceptance-receipt-evidence-fingerprint.test.ts`(2 pass)
   - `bun test tests/acceptance-receipt.test.ts`(既有 receipt 測試零回歸)
   - `bun test` 全量、`bun run check:type`
4. **todos 帳目修正**:現有那條「accepted receipt event 把前一版 provenance 嵌進 run_trace」的 row 歸因有誤——真正嵌入者是 `scripts/verify-sprint.sh:547` 的 jq 疊加(它疊在已含 provenance 的 latest.json 上再 emit,那 557B 正是把 payload 推過 8192 cap 的元兇,同時造成 `tests/evidence-projection-drift.test.ts:265` 的活檔自洽斷言在閘窗口內被中間態打紅)。把該 row 改寫為準確描述(修復面:verify-sprint.sh:547 jq 管線剝除 `.provenance` 或 materializer 攤平前剝除;revisit trigger:下次動 verify-sprint 或 checks-materializer),本包**不修**它。
5. notes 記:非確定性證明摘要、否決方案、receipt 全域失效副作用、與缺陷四的分界。
6. RED/GREEN 分 commit,push。

## 明確不做(EXECUTION_BOUNDARY)

- 不動 `scripts/verify-sprint.sh`、`src/effects/evidence/checks-materializer.ts`、`src/effects/evidence/event-writer.ts`、`src/core/evidence/*`(缺陷四另立)。
- 不動 `tests/evidence-projection-drift.test.ts`。
- 不碰 projection 包分支。

## 附錄:guard 全文

(prover 交付版,repo-relative import;逐字落檔,不改寫)

```ts
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { buildReviewSubject } from '../src/effects/review/diff-fingerprint';
import { recordAcceptance, verifyAcceptance } from '../scripts/acceptance-receipt';

const tempDirs: string[] = [];
afterEach(() => { for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}
function commit(cwd: string, message: string): void { git(cwd, 'add', '-A'); git(cwd, 'commit', '-m', message); }

function contract(): string {
  return [
    '# Task Contract: demo', '', '> **Status**: Active', '> **Plan**: plans/plan-demo.md',
    '> **Owner**: kito', '', '## Acceptance Policy', '', '```json',
    '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}', '```', '',
  ].join('\n');
}

/**
 * The ledger's blob-offload path stores `canonicalize(payload)` -- keys sorted
 * recursively (src/core/evidence/canonical-json.ts) -- while the inline path
 * stores the producer's object as-is (src/effects/evidence/event-writer.ts:82-92).
 * `checks/latest.json` is spread verbatim from whichever form the winning event
 * carried (src/effects/evidence/checks-materializer.ts:239-254), so the same
 * verification result legitimately reaches disk in two different key orders.
 */
function deepSortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepSortKeys) as unknown as T;
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = deepSortKeys(record[key]);
  return out as unknown as T;
}

function passingChecks(root: string): Record<string, unknown> {
  const subject = buildReviewSubject(root, { targetRef: 'main' });
  expect(subject.status).toBe('ok');
  // Producer key order, as scripts/verify-sprint.sh emits it.
  return {
    schema: 'repo-harness-run-trace.v1',
    source: 'verify-sprint',
    status: 'pass',
    exit_code: 0,
    active_plan: 'plans/plan-demo.md',
    review_subject_sha256: subject.review_subject_sha256,
    benchmark_evidence: { status: 'not_applicable', report_sha256: '', benchmark_subject_sha256: '' },
    commands: [{ name: 'verify-sprint', command: 'repo-harness run verify-sprint', status: 'pass', exit_code: 0 }],
    guards: [
      { name: 'contract', status: 'pass' },
      { name: 'review', status: 'pass' },
      { name: 'allowed_paths', status: 'pass' },
    ],
    contract: { file: 'tasks/contracts/demo.contract.md' },
    review: { file: 'tasks/reviews/demo.review.md' },
  };
}

function writeChecks(root: string, checks: unknown): void {
  writeFileSync(join(root, '.ai', 'harness', 'checks', 'latest.json'), `${JSON.stringify(checks, null, 2)}\n`);
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-arfp-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-arfp-home-'));
  tempDirs.push(root, home);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Acceptance Test');
  git(root, 'config', 'user.email', 'acceptance@test.local');
  mkdirSync(join(root, '.ai', 'harness', 'checks'), { recursive: true });
  mkdirSync(join(root, 'plans'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'contracts'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'reviews'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.ai/harness/checks/\n');
  writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    worktree_strategy: { review_base: 'main' },
    merge_gate: { enabled: true, rule: 'fixture' },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'base.txt'), 'base\n');
  commit(root, 'base');
  writeFileSync(join(root, 'feature.txt'), 'candidate\n');
  writeFileSync(join(root, 'plans', 'plan-demo.md'), '# Plan: demo\n\n> **Status**: Executing\n');
  writeFileSync(join(root, 'tasks', 'contracts', 'demo.contract.md'), contract());
  writeFileSync(join(root, 'tasks', 'reviews', 'demo.review.md'), '# Review\n\n> **Recommendation**: pass\n');
  commit(root, 'candidate');
  return { root, home };
}

describe('AcceptanceReceipt verification-evidence fingerprint', () => {
  test('survives a semantics-preserving key-order change in checks/latest.json', async () => {
    const { root, home } = makeFixture();
    const checks = passingChecks(root);
    writeChecks(root, checks);

    const receipt = await recordAcceptance({
      root, authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
      disposition: 'external_pass', reviewer: 'Claude', source: 'claude-review',
      actor: null, summary: 'fixture acceptance', findings: [],
    });

    // Re-materialization through the ledger's blob path: identical semantics,
    // canonicalized (key-sorted) encoding. Nothing the receipt attested to changed.
    const reMaterialized = deepSortKeys(checks);
    expect(reMaterialized).toEqual(checks);
    expect(JSON.stringify(reMaterialized)).not.toBe(JSON.stringify(checks));
    writeChecks(root, reMaterialized);

    const verified = await verifyAcceptance({ root, authorityHome: home });
    expect(verified.verification_evidence_sha256).toBe(receipt.verification_evidence_sha256);
    expect(verified.disposition).toBe('external_pass');
  });

  test('still fails closed when the verification evidence changes semantically', async () => {
    const { root, home } = makeFixture();
    const checks = passingChecks(root);
    writeChecks(root, checks);
    await recordAcceptance({
      root, authorityHome: home,
      contract: 'tasks/contracts/demo.contract.md',
      verification: '.ai/harness/checks/latest.json',
      disposition: 'external_pass', reviewer: 'Claude', source: 'claude-review',
      actor: null, summary: 'fixture acceptance', findings: [],
    });
    writeChecks(root, {
      ...checks,
      commands: [
        { name: 'verify-sprint', command: 'repo-harness run verify-sprint', status: 'pass', exit_code: 0 },
        { name: 'extra', command: 'repo-harness run extra', status: 'pass', exit_code: 0 },
      ],
    });
    await expect(verifyAcceptance({ root, authorityHome: home })).rejects.toThrow('verification evidence is stale');
  });
});
```

註:第二個 test 是 fail-closed 負向對照,未修碼上已綠,修後必須仍綠——確保修復沒放寬語義失效檢查。

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Fix AcceptanceReceipt evidence fingerprint key-order sensitivity

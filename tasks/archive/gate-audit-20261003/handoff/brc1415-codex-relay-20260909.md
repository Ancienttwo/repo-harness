# BRC14/15 接力 Handoff → Codex（2026-09-09 22:30 HKT）

## 一句话结论

BRC14/15 **仍未通过**。canary 续跑已经真实走到 acquire 成功、Docker worker 派发前，被一个 harness 产品缺陷挡住：campaign worker 路径对同一份 contract 绑了两个权威（plan proof 绑 authored 版本，worker handoff 绑 projection 后的模板），模板永远过不了 brief preflight。**接手第一刀是修这个缺陷并合入 main，然后在同一个 campaign（若 grant 未过期）或新的替换 successor 上续跑到 audit/accept。**

主要参考文件（先读）：
- `AGENTS.md`（根）；`.ai/harness/handoff/brc1415-transfer-20260909.md`（前几轮的全部现场与结论，本文只写增量）
- 目标仓 runbook：`/Users/ancienttwo/Projects/byok-brc1415-canary/.canary-scratch/packaged-runbook.md`（含已修正的顺序、CDP 卷动脚本说明、SID）
- 用户裁决原文：`/tmp/brc-successor/owner-spec.md`；设计：`/tmp/brc-successor/design.md`（若 /tmp 已清，结论在 `docs/researches/20260909-campaign-successor-replacement.md`）

## 本轮已完成（均已回读核实）

- PR #375（测试 fixture 对齐 Astra）、#374（packaged helper acquire）、#378（successor 受控替换 + start_group guard + `campaign prepare-resume`）、#380（`automation budget repair`）全部合入。main = `60ef56c4`。冻结 source = `/Users/ancienttwo/Projects/repo-harness-wt-successor-replacement` @ `e6299a70`（= #380 head，CI run 34355766739 success）。所有 canary 命令用 `bun <该 worktree>/src/cli/index.ts`。
- 目标仓 `/Users/ancienttwo/Projects/byok-brc1415-canary`，branch `codex/brc1415-canary`，tip = `664cc07`（f435a737 materialization + 664cc07 plan/contract publication，已 push）。
- Campaign `byok-brc1415-20260909-replacement-delivery`（supersedes `packaged-delivery`，源 adoption 仍是 `delivery` 548bc0a5）：
  - grant `15f5fab2f69e4807218cc70e0682e08b93771d6666c7e7e7f98edf246bb6c0b4`，**expires 2026-09-09T15:35:33Z（23:35 HKT）**，caps provider 37 / turns 45 / runner 43（= packaged 剩余，不扩额）。
  - intent `sha256:903ca3272c194c67db37b3022b7e6890f63f5b53afa5b1787d1961d6b1290ee0`；author session `chgpt_20260909_214330_…`；SID（planning/acquire/closeout 必须完全一致）= `claude-brc1415-replacement-20260909`；host `codex`。
  - 已过：observe-revision verified（294be4e7）→ author 更新 #177 → slot02 followup 更新 #178 → adopt challenge_verified，publication `f435a737`（candidate ref 已 ff 进 target 并 push）→ `start_group`（state **group_running**）→ slot01 planning job（task `91eeb8782318cf6e1259743a6c745908f3bd9e2cc4e49020ee34ca90e32347de`，job `sha256:c933ac16…`）→ plan/contract `20260909-2204-brc177-replacement` 提交 `664cc07` → admission `plan_ready / execution_ready / blockers []` → **acquire 成功**：worktree `/Users/ancienttwo/Projects/byok-brc1415-canary-wt-brc177-replacement`，branch `codex/brc177-replacement`，selector `.canary-scratch/replacement-selector-01.json`。
  - budget run `2681068f534716442ca84b67f712543cce197400b44febc356e25727102ab3ee`：consumed agent_turns 9 / runner_invocations 8 / successful_acquisitions 1；provider_calls 8；open []；drift none；active_step null。
- 所有 scratch 证据前缀 `.canary-scratch/replacement-*`（revision/author/slot02-review/adoption/plan-01/admitted-01/acquired-01/worker-01*.json|log）。

## 阻断缺陷（源码已核，未修）

两次 `bun <src>/scripts/contract-run.ts run --repo <acquired-worktree> --contract tasks/contracts/20260909-2204-brc177-replacement.contract.md --campaign-handoff …/replacement-selector-01.json --campaign-provider codex-exec --json`（env `BRC_CAMPAIGN_IMAGE=sha256:72270cb0…`、`BRC_CAMPAIGN_AUTH_FILE=/Users/ancienttwo/.codex/auth.json`）都在派 worker 前失败：

1. 第一次 `status: fail, failure_class: incomplete_brief`（`.canary-scratch/replacement-worker-01.incomplete-brief.json`）。原因：fleet acquire 的 defaultProject 跑 `plan-to-todo --plan`，其 `render_contract_file`（`assets/templates/helpers/plan-to-todo.sh:424-470`，`scripts/plan-to-todo.sh` 同）**无条件**把 worktree 里的 contract 重渲染成模板（Goal/Why 占位、Task Profile 变 code-change）。
2. 在 worktree `git checkout -- tasks/contracts/<stem>.contract.md` 恢复 664cc07 版本、preflight 通过后，第二次失败 `campaign worker projected contract changed`（`src/effects/automation/campaign-worker.ts:127`）。原因：`:78` 在 acquire 返回时对 worktree 里 **projection 之后** 的文件重算 sha 绑进 handoff。
3. 双权威证据：admission 与 envelope 的 plan proof `contract_sha256 = sha256:e744eb71809b152649e5c76eadf505e81d47b028801019a7b4503d8926350432`（= 664cc07 提交的 contract），worker handoff 绑的是模板 digest。delivery 轮从未走到这里，所以之前没暴露。

### 修复边界（建议，等用户已同意后执行；用户当前指令是“交给 Codex 接力”，把 a/b 选择写在下方）

- `campaign-worker.ts:78`：handoff 的 `contract_sha256` 改为消费 `acquired.envelope.plan.contract_sha256`（已 admitted 的 plan proof），不再对 worktree 二次派生；`:127` 比对不变。
- projection 不得覆写已存在且非模板的 contract：`plan-to-todo.sh render_contract_file` 仅在 contract 缺失或仍为模板时渲染（判定用现有 brief-preflight 的 placeholder 规则，不要发明新 marker）；`assets/templates/helpers/plan-to-todo.sh` 与 `scripts/plan-to-todo.sh` 必须同步（tests/ 有 tarball/helper 同步断言）。
- 测试（model-free）：authored contract → admission（proof digest）→ acquire/projection → `contract-run run --campaign-handoff` 的 binding 校验通过且 brief preflight 通过；模板 contract 仍被 preflight 拒；projection 对缺失 contract 仍会渲染模板。现有 `tests/effects/campaign-worker*.test.ts`、`tests/cli/fleet-offer-acquire.test.ts`、`tests/unit/closeout-runner-guardrails.test.ts` 保持绿。
- 走 work-package：在 `/Users/ancienttwo/Projects/repo-harness-wt-successor-replacement` 或新 worktree（从 origin/main）capture-plan（`bun src/cli/index.ts run capture-plan -- --slug campaign-worker-contract-authority --status Approved --source waza-think --artifact-level work-package --promotion-reason verification_boundary …`），写 contract（allowed_paths 只含上述文件 + 测试 + docs），实现，`check:type` + 定向测试 + 仓库必需 integrity checks，early-push，PR，Required CI 绿后 squash merge。**不要跑全量 `bun test`。** 注意：main 移动后要 `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh` 重绑 notes 里的 Substantive Change SHA256；PR CI 用 merge ref 算 digest，main 有新 substantive 提交时先 merge main 再重绑。

## 修复合入后的续跑（两条路，按 grant 时窗选）

**路 a（grant 未过期，23:35 HKT 前能派 worker）**：同一 campaign 继续。
1. 更新冻结 source：若修复在新 worktree，把 `/Users/ancienttwo/Projects/byok-brc1415-canary/.canary-scratch/make-replacement-grant.ts` 无关（grant 已 mint）；只需后续命令改用合入后 head 的 worktree CLI。**注意** handoff/selector 是在旧 source 下 acquire 的；修复只改 worker binding 读取方式，selector 不变。
2. 在 acquired worktree 确认 contract = 664cc07 版本（`shasum -a 256` = e744eb71…），`git status` 只允许 projection 产生的 plan/notes/review/todos 修改。
3. 重跑上面的 `contract-run run …`（后台 + log；Docker probe `codex --version` → worker → verifier，可能 10–30 分钟）。清理两个残留容器 `docker ps -a | grep repo-harness-campaign-`（状态 Created，未启动；确认无挂载写入后 `docker rm`）。
4. worker/verifier pass → 自动 PR（publication）→ **人工 squash merge 进 `codex/brc1415-canary`**（用户或你，按用户授权）→ `campaign closeout --request …/replacement-selector-01.json --host codex --session-id claude-brc1415-replacement-20260909 --remote origin`（无 `--repo`，cwd=目标仓）。
5. #178：slot02 planning job → `--planning-result` outcome `not_reproducible`（surfaces/characterization null）→ 把 `.canary-scratch/delivery178-source-falsifier.log` 落到 tracked 路径（如 `tasks/evidence/brc178-falsifier.log`）+ decision artifact `tasks/decisions/brc178-not-planned.json`（kind `repo-harness-campaign-not-planned-decision` v1，字段见 runbook Phase 7）+ 一份列出两者 Allowed Paths 且过 `acceptance-receipt verify` 的 contract，提交后 `campaign close-not-planned --repo … --artifact … --contract … --host codex --session-id <SID>`。
6. `campaign audit --repo … --campaign-id … --group-number 1 --intent-sha256 <IS> --idempotency-key replacement-audit-1 --gitleaks-bin /opt/homebrew/bin/gitleaks`（state group_running 时自发 begin_group_audit；expected_final_main_sha = 当时 target tip；所有 slot 需 cleanup receipt 或 unfilled）→ `transition accept_group`（evidence_refs 恰好一个 = audit observation_sha256）→ `complete`/`complete_with_followups`。
7. 回填 sprint BRC14/BRC15 两行（`plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`），BRC14 还要核对既有 1→2→3→terminal model-free 证据；不临时扩门。

**路 b（grant 过期或来不及）**：
1. canonical stop 本 campaign（参考 `.canary-scratch/stop-packaged.ts` 改 campaign id/证据文件；先确认 open [] 且 active_step null；acquired lease 需先按既有 reconcile 路径释放/记录——`reconcile-delivery-acquire.ts` 是 provision 失败的先例，本次是成功 acquire 未执行，需查 `readLease`/claim compensation 的正规释放路径，不要手改 store）。
2. grant 过期后 run 会呈 `unsealed_exhaustion`：`bun <src> automation budget repair --repo <target> --run 2681068f534716442ca84b67f712543cce197400b44febc356e25727102ab3ee`。
3. `campaign prepare-resume --repo <target> --source-campaign-id byok-brc1415-20260909-delivery --source-group-number 1 --source-intent-sha256 sha256:548bc0a5… --superseded-campaign-id byok-brc1415-20260909-replacement-delivery --superseded-group-number 1 --superseded-intent-sha256 sha256:903ca327… --target-revision <当时 target tip> --out …/replacement2-resume-source.json`。**注意**：本 successor 有 adoption+publication，`assertReplaceableStoppedSuccessor` 会拒（要求 no adoption/publication）——这是 #378 设计的边界，替换只覆盖“未 adoption”的 successor。已 adoption 的 stopped successor 走原有 resume 分支（stopped + 有 publication + 零成功 acquisition）——但本轮 `successful_acquisitions = 1`，同样不满足。**因此路 b 实际需要先由用户裁决扩展替换/恢复边界**（或把 acquire 记为 no_progress 后再评估），不要绕 guard。
4. 新 grant caps 继续按剩余（37−8=29 / 45−9=36 / 43−8=35）不扩额；时窗需重开。

## 约束（沿用用户裁决，勿放宽）

- 一组两 slot，原 #177/#178，人工 merge，产品默认 off；#178 走证伪收尾不造 test-gap；不重抽 Issue；不复活 stopped grant；不加预算；未知结果先 reconcile 原请求。
- 不放宽 adopt 的 group_preparing 要求、不加 group_running→group_preparing；start_group 只在 adopt 之后、audit 之前。
- Oracle 只用 `REPO_HARNESS_ORACLE_BIN=/Users/ancienttwo/Projects/oracle-wt-fork-0.20.0/dist/bin/oracle-cli.js`（9db96a10，0.20.0）；Chrome Profile 13，current model，不覆盖 thinking。Oracle 等待超过 ~3 分钟且日志 “no thinking status detected” 时，用 runbook 里的 CDP 卷动脚本（`/tmp/brc-successor/cdp-scroll.ts`，连 `127.0.0.1:9222`，对 chatgpt 页面往上卷）唤醒捕获；不换 key 重发、不手拼 receipt。
- 不要打印 `.canary-scratch/*oauth-private*`。旧 engineer authorization `368611e4-…` 已过期但 acquire 只读本地 mapping，可继续用；MCP server 18765 已死且 Docker 路径不需要。
- 不碰其他 pane 的 worktree（repo-harness-wt-* 有二十多个）；不 stash。
- 提交/PR 文本不加 AI 署名。

## 证据与文件索引

- 仓库侧：`plans/plan-20260909-1909-campaign-successor-replacement.md` + 同名 contract/notes/review（在 successor-replacement worktree）；`docs/researches/20260909-campaign-successor-replacement.md`；`tasks/evidence/campaign-successor-replacement-pre-fix.log`。
- 目标侧：`.canary-scratch/replacement-*`、`packaged-*`、`packaged-runbook.md`、`packaged-budget-repair.json`、`replacement-preflight.json`；acquired worktree `.ai/harness/runs/contract-run-20260909T1406*`、`…T1407*`。
- 本文与 `brc1415-transfer-20260909.md` 都是 ignored handoff，未 commit。

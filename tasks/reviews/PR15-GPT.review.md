## 1. Verdict

截至 **2026-06-22 HKT**：

* `main since v0.7.4`: **FAIL**
* PR #13: **BLOCKED**
* PR #15: **NEEDS CHANGES**

未发现 P0。拒收主线的直接原因是：当前 HEAD 托管 CI 为红灯、MCP deny-glob 存在可读敏感文件的边界绕过、prompt-guard 的同前缀 sibling repo 判断错误，以及 `0.7.5` 的版本边界和发布闭环尚未建立。

## 2. Findings

### P0

无。

### P1 — 当前 `main` 的 Windows CI 在 checkout 阶段失败

* **Severity:** P1
* **Exact reference:** commit `4523848`; `.github/workflows/ci.yml` 的 `mcp-path-matrix`; tracked path `plans/sprints/20260617-Sprint: Harness Engineering Optimization — State, Review, Eval, Delegation.md`; GitHub Actions `CI #92`
* **Observed evidence:** `CI #92` 状态为 `Failure`。`windows-latest` 在执行任何 MCP 测试前，因文件名含 Windows 非法字符 `:` 而由 `git.exe` 返回 exit 128。Linux/macOS job 的存在不能替代 Windows job，因为此次提交专门增加了跨平台路径、symlink/junction 安全矩阵。([GitHub][1])
* **Why it matters:** 当前 HEAD 未满足自身声明的平台验收面；Windows 用户连仓库都无法正常 checkout，Windows junction、drive-letter、大小写及分隔符相关安全测试也实际上没有运行。
* **Concrete fix / verification:** 将该文件改为 Windows-safe 名称，更新所有引用、任务索引和文档链接；在同一修复 commit 上确认标准 `Test` 以及 Ubuntu/macOS/Windows 三个 `mcp-path-matrix` job 全绿。不能以“测试尚未开始，所以实现可能没问题”作为 release waiver。

### P1 — 显式 allowed-root 可使 `.ssh/**`、`.git/**`、`secrets/**` deny globs 失效

* **Severity:** P1
* **Exact reference:** commit `4523848`; `src/cli/mcp/workspaces.ts` → `realpathInsideRoot()`；`src/cli/mcp/setup.ts` → `normalizeAllowedRoots()`；`src/cli/mcp/policy.ts` → `COMMON_DENY_GLOBS`
* **Observed evidence:**
  `realpathInsideRoot()` 仅在 logical/physical relative path 不等于 `.` 时检查 deny globs。与此同时，`normalizeAllowedRoots()` 接受任意存在的目录，realpath 后直接加入授权根。默认规则使用 `.ssh/**`、`.git/**`、`secrets/**` 等相对路径模式。于是：

  * `--allow-root ~/.ssh` 后，`id_rsa` 的逻辑路径是 `id_rsa`，而不是 `.ssh/id_rsa`；
  * `--allow-root /repo/.git` 后，`config` 不匹配 `.git/**`；
  * `--allow-root /repo/secrets` 后，`token.txt` 不匹配 `secrets/**`。
    这与文档“Reader mode never disables deny globs”的承诺不一致。([GitHub][2])
* **Why it matters:** deny globs 被描述为即使 broad/user read 也不可关闭的纵深安全边界。当前实现却允许一个配置错误、迁移错误或指向敏感目录的 symlink 将 SSH 私钥、Git remote credentials 或 secrets 暴露给 MCP reader。
* **Concrete fix / verification:**

  1. 在 setup 和运行时均对 realpath 后的根做敏感根分类；直接指向 `.ssh`、`.git`、`secrets`、`credentials`、`private` 等目录时 fail closed。
  2. deny 判定必须同时考虑 canonical absolute path/root path components，而不能只看相对授权根的路径。
  3. 增加“敏感目录本身为 allowed root”、指向敏感目录的 symlink/junction、Windows 等价路径的回归测试，并让 `mcp doctor` 报出阻断原因。

### P1 — prompt-guard 对同前缀 sibling repo 的检测可被绕过

* **Severity:** P1
* **Exact reference:** commit `5f22aed`; `.ai/hooks/prompt-guard.sh` 和 `assets/hooks/prompt-guard.sh`; `prompt_foreign_repo_root()`
* **Observed evidence:** 函数在解析候选绝对路径后先执行：

  `[[ "$candidate" == "$current_root"* || "$candidate" == "$current_real"* ]] && continue`

  若当前仓库是 `/work/app`，prompt 指向 `/work/app2/docs/spec.md`，字符串前缀判断为真，代码会在执行 Git top-level 精确比较前直接跳过该候选。因此该 foreign repo 不会触发 RepoIsolationGate，后续自动创建 Draft plan 或 capture-plan 仍可能写入 `/work/app`。该代码同时存在于 repo-local 与 packaged hook 副本。([GitHub][3])
* **Why it matters:** `0.7.5` changelog 明确承诺 sibling repo 防串仓和跨 repo prompt 不创建本地 workflow artifact；这是该补丁版本的主要发布目的。当前实现没有覆盖真实常见的 `repo` / `repo2`、`service` / `service-api` 命名布局。([GitHub][4])
* **Concrete fix / verification:** 使用 canonical path 的边界安全比较：仅当 `candidate === root` 或 `candidate` 位于 `root + pathSeparator` 下时才视为当前仓库。更稳妥的做法是尽可能解析候选的 Git top-level，再与当前 canonical Git top-level 精确比较，不使用裸字符串前缀作为提前放行条件。补充同前缀 sibling、symlink sibling、不存在的目标子路径和跨平台路径测试。

### P1 — `0.7.5` 的版本边界与发布状态不成立

* **Severity:** P1
* **Exact reference:** commits `5f22aed`, `75b7a50`, `4523848`; `package.json`; `docs/CHANGELOG.md`; `deploy/release-checklists/260621-repo-harness-0.7.5.md`
* **Observed evidence:**

  * release checklist 把 `0.7.5` 定义为“只包含 repo-isolation hook hardening”的 patch；
  * npm 身份认证为 `ENEEDAUTH`，publish、registry readback、dist-tag、tag、GitHub release、clean-room `npx` 全部仍为 pending；
  * GitHub Releases 最新仍是 `v0.7.4`；
  * 但当前 `main` 在 release-prep 后又合入了 `4523848` 的大规模 MCP reader/auth/session 变更，而 `package.json` 仍声明 `0.7.5`，这些内容仍位于 changelog `[Unreleased]`。([GitHub][5])
* **Why it matters:** 从当前 HEAD 打包会发布 `[Unreleased]` MCP 功能，却仍标记为 `0.7.5`；从较早 commit 发布又会使 `main` 上的同版本源码与 registry tarball 不同。两者都会破坏版本可追溯性、`gitHead` 一致性和后续用户问题复现。
* **Concrete fix / verification:** 不得从当前 HEAD 发布 `0.7.5`。选择并冻结明确的 release commit：

  * 保留 patch 范围：以 `75b7a50` 为候选基线，加入 sibling-prefix 修复和必要的仓库路径修复后重新跑 release gates；
  * 或将 `4523848` 纳入下一个版本，把 `[Unreleased]` 切为明确版本并 bump package；按改动规模建议 `0.8.0`。
    随后完成 npm publish、registry integrity/shasum/`gitHead`/dist-tag readback、tag、GitHub release及 clean-room 安装。

### P1 — PR #13 依赖已被主线废弃的 full-disk 授权模型，且 alias 选择不具唯一性

* **Severity:** P1
* **Exact reference:** PR #13, commit `b27885d`; `src/cli/mcp/tools.ts` → `isFullDiskRead()`, `discoverHarnessRepos()`, `resolveFullDiskRepoAlias()`, `targetRepoRoot()`
* **Observed evidence:**

  * PR commit 的 parent 是 `e60a1d6`，即 `v0.7.4` 基线，而非当前 `main`；
  * PR 描述和实现都以“user-scope full-disk authorization”为前提；
  * `resolveFullDiskRepoAlias()` 调用 `discoverHarnessRepos({ query, limit: 1 })` 并取第一个结果；匹配规则允许 basename 相等、包含以及完整路径包含，没有“多候选即拒绝”；
  * 当前主线则拒绝 `--allow-full-disk-read`，并将 legacy `fullDiskRead` 强制写回 `false`。([GitHub][6])
* **Why it matters:** 该 PR 不只是需要 rebase，而是建立在已被 `[Unreleased]` 明确替换的安全模型上。模糊 alias 还可能把后续 workflow read/write 路由到同名或近似名称的错误仓库。
* **Concrete fix / verification:** 不合并现有实现。基于 current main 重写为 registered-adopted-repo resolution：优先 canonical path 或 registry ID；文本 alias 只允许唯一精确 basename，零结果或多结果都返回结构化错误和候选列表；禁止恢复全盘递归扫描。测试必须包含重复 basename、前缀碰撞、大小写差异、已取消 adoption 的 registry 项，以及 writer 使用错误 alias 时 fail closed。

### P2 — PR #15 的功能设计基本可接受，但没有 current-main 集成证据

* **Severity:** P2
* **Exact reference:** PR #15, commit `3aa1dbb`; `.ai/hooks/*`, `assets/hooks/*`, `src/cli/hook/*`, `route-registry.ts`, migration/scaffold tests
* **Observed evidence:** PR 采用 advisory 模式、报告有数量和字数上限，并声明通过现有 prompt-guard/stop-orchestrator owners 接入而不改变 public route tuples。其 branch check 曾成功；但该 commit 同样以 `e60a1d6` 为 parent，一次修改 41 个文件，包括随后被 `5f22aed` 修改的 `prompt-guard.sh`、hook runtime 和相关测试。该成功 check 发生在当前 main 的 `CI #92` 之前，不能证明与现有 hook isolation 和 MCP/package 变更集成后仍正确。([GitHub][7])
* **Why it matters:** 直接合并最可能产生的回归不是 minimal-change 规则本身，而是解决重叠时丢失 `HOOK_REPO_ROOT` 绑定、重新引入 sibling bug、破坏 scaffold/package parity，或者让旧 route fixture 覆盖新 route 实现。
* **Concrete fix / verification:** 在修复当前 main 的 P1 项后 rebase；明确保留 repo-binding 和 sibling-prefix 修复；重新运行 route tuple 精确快照、hook fail-open、explicit root conflict、adoption/migration、scaffold parity、tarball runtime parity及完整跨平台 CI。满足后可重新评为 READY。

## 3. Evidence Table

| Claim                                 | Source inspected                                          | Evidence                                                                                                               | Status                      |
| ------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `v0.7.4..main` 范围                     | main commit history、commit parents                        | `5f22aed → 75b7a50 → 4523848`，HEAD 为 `4523848`。([GitHub][8])                                                           | Confirmed                   |
| Managed user-level hook repo binding  | `5f22aed` runtime/installer diff、hook tests、changelog     | 显式 root 绑定和冲突跳过已实现；核心 route tuple 未见有意更改。([GitHub][3])                                                                 | PASS                        |
| Absolute-path foreign repo protection | 两份 `prompt-guard.sh`                                      | 普通 foreign repo 会被识别，但 raw prefix 提前放行同前缀 sibling。([GitHub][3])                                                        | FAIL                        |
| `workspaceReader` 工具面                 | reader/workspace/tools 源码、focused tests、closeout evidence | 六个 reader tools、session-local workspace IDs、大小限制、遍历和 symlink escape 测试均有实现证据；本地 focused/full suite 有通过记录。([GitHub][4]) | PASS，受 deny-root finding 限制 |
| Registered repos 与 `repo_path`        | `repo-registry.ts`, `server.ts`, `tools.ts`               | registry 项会 canonicalize 并重新验证 adoption；workflow tools 的 target repo 解析以 registered/adopted repo 为边界。([GitHub][9])     | PASS                        |
| Broad-read deny globs                 | `policy.ts`, `workspaces.ts`, setup/tests                 | 嵌套 `.ssh`/`secrets` 测试可阻断，但直接把敏感目录作为 root 时模式失去目录前缀。([GitHub][10])                                                     | FAIL                        |
| Legacy `fullDiskRead` fail-closed     | `setup.ts`, `mcp-setup.test.ts`                           | deprecated flag 被拒绝；检测 legacy true 后记录状态并写回 `fullDiskRead:false`。([GitHub][11])                                        | PASS                        |
| HTTP url-token / OAuth rotation       | `oauth.ts`, HTTP/OAuth/stdio tests                        | scope 限制、token 文件 `0600`、原子落盘、授权码 TTL/单次使用、refresh rotation 和旧 token 失效均有代码与测试。([GitHub][12])                          | PASS                        |
| Hosted platform CI                    | `.github/workflows/ci.yml`, Actions `#92`                 | 新矩阵已声明，但 Windows checkout 因非法文件名失败，未执行路径测试。([GitHub][1])                                                               | FAIL                        |
| Package/tarball readiness             | package manifest、release checklist、local closeout         | dry-run pack、tarball smoke和本地 suite 有通过记录；npm publish/readback/tag/clean-room 安装缺失。([GitHub][13])                      | PARTIAL                     |
| PR #13 merge readiness                | PR、commit diff、current setup                              | 旧 full-disk 模型、旧 base、非唯一 alias 选择，与 current main 安全方向冲突。([GitHub][14])                                                | BLOCKED                     |
| PR #15 merge readiness                | PR、commit/file diff、branch CI                             | advisory 设计和旧基线测试合理，但缺少 current-main 重新集成和矩阵结果。([GitHub][15])                                                          | NEEDS CHANGES               |

## 4. Verification Gaps

1. **没有成功的 current-main Windows checkout 或测试结果。** 因此 junction、Windows absolute path 和 package runtime parity 仍没有托管证据。

2. **没有真实 ChatGPT Connector 公网 HTTPS E2E。** 本地 HTTP/stdio、OAuth 和 refresh rotation 测试较充分，但真实 Connector 创建、重连、refresh 后继续调用以及旧 token 被服务端拒绝仍是缺口；项目自己的 review prep 也把 live public origin 标为 pending。([GitHub][13])

3. **没有 `repo-harness@0.7.5` 的 registry 证据。** 缺 publish、integrity/shasum、`gitHead`、dist-tag、tag、GitHub release和 clean-room `npx`。([GitHub][5])

4. **PR #13/#15 没有基于当前 `4523848` 之后修复版 main 的集成 CI。** 现有绿灯只能证明各自旧基线上的 branch state。([GitHub][16])

5. **缺少两个直接针对已发现边界的 regression cases：** 同前缀 sibling repo；敏感目录本身或其 symlink/junction 作为 allowed root。现有嵌套敏感路径测试不能覆盖这两类问题。

## 5. Release Recommendation

### `0.7.5`

**不可视为完成。** npm auth blocker记录得足够清楚，但它不是唯一阻塞；hook 的同前缀 sibling bug 仍违反该版本最核心的修复承诺。

建议将 `0.7.5` 保持为窄 patch：以 `75b7a50` 为候选基线，加入 sibling-prefix 修复及 Windows-safe tracked-path 修复，完成 CI、pack、publish/readback、tag 和 clean-room smoke 后再宣布完成。

### `[Unreleased]`

**当前不应在 `package.json` 仍为 `0.7.5` 的状态下继续累积。** 应先恢复明确 release boundary：

* 若先发 hook patch，则把 `4523848` 留给下一版本；
* 若 MCP reader/auth/session 要一起发布，则先把 `[Unreleased]` 切为明确版本并 bump package。鉴于新增工具面、registry、跨 repo targeting、HTTP auth/session 和安全迁移面，建议使用 **`0.8.0`**，而不是继续塞入 `0.7.5`。

### PR #13

**延后并重写；不建议合并现有 PR。** 更合适的是关闭或 supersede 当前 full-disk 实现，在 registered-repo 模型上重新提交一个唯一、可审计、歧义 fail-closed 的 alias resolver。

### PR #15

**延后，但不必拆掉功能设计。** 在 main 的两项 P1 代码问题和 Windows CI 修复后 rebase，单独作为下一版本的 hook feature 合并。不要把它并入当前 `0.7.5` patch；其 41-file adoption/migration/runtime 改动面需要独立 release note 和集成验收。

[1]: https://github.com/Ancienttwo/repo-harness/actions/runs/27909874566 "feat(mcp): add single-connector workspace reader · Ancienttwo/repo-harness@4523848 · GitHub"
[2]: https://github.com/Ancienttwo/repo-harness/blob/4523848/src/cli/mcp/workspaces.ts "repo-harness/src/cli/mcp/workspaces.ts at 4523848edbd6efccb431464d44168bc7ca47eefa · Ancienttwo/repo-harness · GitHub"
[3]: https://github.com/Ancienttwo/repo-harness/commit/5f22aed "chore(release): prepare repo-harness 0.7.5 · Ancienttwo/repo-harness@5f22aed · GitHub"
[4]: https://github.com/Ancienttwo/repo-harness/blob/4523848/docs/CHANGELOG.md "repo-harness/docs/CHANGELOG.md at 4523848edbd6efccb431464d44168bc7ca47eefa · Ancienttwo/repo-harness · GitHub"
[5]: https://github.com/Ancienttwo/repo-harness/blob/4523848/deploy/release-checklists/260621-repo-harness-0.7.5.md "repo-harness/deploy/release-checklists/260621-repo-harness-0.7.5.md at 4523848edbd6efccb431464d44168bc7ca47eefa · Ancienttwo/repo-harness · GitHub"
[6]: https://github.com/Ancienttwo/repo-harness/commit/b27885d "fix(mcp): resolve full-disk repo aliases · Ancienttwo/repo-harness@b27885d · GitHub"
[7]: https://github.com/Ancienttwo/repo-harness/commit/3aa1dbb "feat(hooks): add advisory minimal-change review · Ancienttwo/repo-harness@3aa1dbb · GitHub"
[8]: https://github.com/Ancienttwo/repo-harness/commits/main/ "Commits · Ancienttwo/repo-harness · GitHub"
[9]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/4523848/src/effects/repo-registry.ts "raw.githubusercontent.com"
[10]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/4523848edbd6efccb431464d44168bc7ca47eefa/src/cli/mcp/policy.ts "raw.githubusercontent.com"
[11]: https://github.com/Ancienttwo/repo-harness/blob/4523848/src/cli/mcp/setup.ts "repo-harness/src/cli/mcp/setup.ts at 4523848edbd6efccb431464d44168bc7ca47eefa · Ancienttwo/repo-harness · GitHub"
[12]: https://github.com/Ancienttwo/repo-harness/blob/4523848/src/cli/mcp/oauth.ts "repo-harness/src/cli/mcp/oauth.ts at 4523848edbd6efccb431464d44168bc7ca47eefa · Ancienttwo/repo-harness · GitHub"
[13]: https://github.com/Ancienttwo/repo-harness/commit/4523848 "feat(mcp): add single-connector workspace reader · Ancienttwo/repo-harness@4523848 · GitHub"
[14]: https://github.com/Ancienttwo/repo-harness/pull/13 "fix(mcp): resolve full-disk repo aliases by Ancienttwo · Pull Request #13 · Ancienttwo/repo-harness · GitHub"
[15]: https://github.com/Ancienttwo/repo-harness/pull/15 "feat(hooks): add advisory minimal-change review by Ancienttwo · Pull Request #15 · Ancienttwo/repo-harness · GitHub"
[16]: https://github.com/Ancienttwo/repo-harness/actions/runs/27874987453/job/82492913894?pr=13 "fix(mcp): resolve full-disk repo aliases · Ancienttwo/repo-harness@b27885d · GitHub"

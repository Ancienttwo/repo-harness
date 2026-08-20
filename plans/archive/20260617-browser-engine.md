可以。这里的 **browser engine** 应该作为 `repo-harness` 的一个独立能力来设计：

## Execution Status

Implemented in `codex/browser-engine` through the MVP boundary recommended by this design:

- [x] Task 1: CLI scaffold for `repo-harness chatgpt browser-*`.
- [x] Task 2: repo-local session store under `.ai/harness/chatgpt/sessions`.
- [x] Task 3: file policy, inline prompt assembler, and dry-run preview.
- [x] Task 4: Oracle provider wrapper for `oracle --engine browser`, including provider session/conversation parsing and explicit local artifact import.
- [x] Task 5: MCP tools behind explicit `--enable-chatgpt-browser`, including consult/read/list/continue/open and structured content.
- [x] Task 6: Codex Skill and user guide.
- [x] Follow-up, open, and cleanup CLI surfaces are implemented against the repo-local session store.
- [x] Task 7: Native browser spike. Implemented as a fail-closed provider against installed Google Chrome by default, using direct local Chrome DevTools Protocol instead of bundled Chromium. Verified `Reply exactly OK` against a fresh Chrome profile with captured output `OK`.

```text
repo-harness chatgpt browser-consult
```

它的职责不是连接 ChatGPT Connector，也不是调用 OpenAI API，而是：

```text
本地 CLI / MCP tool
  -> 控制已登录的 Chrome / Edge
  -> 在 ChatGPT Web 里真实创建会话
  -> 发送 prompt / 文件 / follow-up
  -> 等待网页端返回
  -> 抓取最终回答
  -> 保存本地 session
  -> 把结果返回给 CLI / MCP / Codex
```

Oracle 的 `--engine browser` 已经验证了这条路线：它支持 launcher mode，也就是自己启动 Chrome 并通过 CDP 驱动 ChatGPT Web；也支持 attach-running mode，也就是附着到已经运行并登录的 Chrome session。Oracle 文档还写到 browser mode 会把 prompt bundle 通过 ChatGPT Web UI 发送，而不是走 Responses API，并且保存和 API run 一致的 session metadata/logs。([GitHub][1])

下面这份可以直接保存为：

```text
plans/prds/repo-harness-chatgpt-browser-engine.prd.md
```

---

# PRD / Technical Design: repo-harness ChatGPT Browser Engine

## 1. 项目名称

**repo-harness ChatGPT Browser Engine**

一句话：

> Use a locally authenticated ChatGPT Web session as a controllable planning/review engine, without using the OpenAI API.

---

## 2. 背景

`repo-harness` 当前的核心是把 agent workflow 固化到 repo-local artifacts：PRD、sprint、plan、contract、review evidence、checks、handoff。之前设计的 MCP Connector 方案是：

```text
ChatGPT Web -> MCP Connector -> repo-harness workflow files
```

这条路依赖 ChatGPT Developer Mode / MCP Connector 可用性。OpenAI 当前文档显示，ChatGPT custom apps / full MCP support / developer mode 主要面向 Business、Enterprise、Edu workspace，并且由 workspace admin/owner 控制。([OpenAI Help Center][2])

但用户现在要的是另一条路：

```text
repo-harness local CLI -> ChatGPT Web
```

也就是本地工具主动发起 ChatGPT 网页会话，并拿回结果。这不需要 ChatGPT Connector，不需要 OpenAI API key，不需要把本地 repo 暴露给 ChatGPT Connector。它需要的是本机或远程机器上有一个已经登录 ChatGPT 的浏览器 session。

Oracle 已经证明这个 pattern 可行：它的 browser mode 支持 ChatGPT launcher mode、attach-running mode，以及通过已登录 Chrome cookies/session 驱动网页端会话；它还支持 follow-up、session recovery、browser archive、Deep Research、附件策略、remote browser host 等能力。([GitHub][1])

---

## 3. 目标

### 3.1 核心目标

实现一个 `repo-harness` browser engine，让本地命令可以：

```bash
repo-harness chatgpt browser-consult \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Review this sprint plan" \
  --file plans/sprints/foo.sprint.md
```

然后得到：

```text
sessionId
status
output
conversationUrl
transcriptPath
artifacts
```

### 3.2 repo-harness workflow 目标

Browser engine 的结果要能进入 repo-harness workflow：

```text
ChatGPT browser consult result
  -> .ai/harness/chatgpt/sessions/<sessionId>/
  -> .ai/harness/handoff/chatgpt-review.md
  -> plans/prds/*.prd.md
  -> plans/sprints/*.sprint.md
  -> .ai/harness/handoff/codex-goal.md
```

### 3.3 MCP 目标

给 Codex / Claude / ChatGPT Connector 暴露本地 tool：

```text
run_chatgpt_browser_consult
read_chatgpt_browser_session
list_chatgpt_browser_sessions
continue_chatgpt_browser_session
```

这样 Codex 可以在本地 workflow 中调用 ChatGPT Web 做二次规划或评审。

---

## 4. 非目标

MVP 不做这些：

```text
1. 不走 OpenAI API。
2. 不要求 OPENAI_API_KEY。
3. 不把 ChatGPT Web session cookie 上传到远端。
4. 不默认开启远程 CDP。
5. 不默认 headless。
6. 不默认自动登录 ChatGPT。
7. 不读取或保存用户密码、2FA、SSO 凭据。
8. 不默认并发跑大量 ChatGPT tabs。
9. 不绕过 ChatGPT 网页端限制、rate limit、captcha、workspace policy。
10. 不把 ChatGPT conversation 当作唯一 source of truth；本地 session store 才是 repo-harness 的审计记录。
```

---

## 5. 关键概念

### 5.1 Browser engine

Browser engine 是一个本地执行引擎：

```text
input:
  prompt
  files
  model
  thinking mode
  chatgptUrl
  followups
  timeout
  capture mode

output:
  sessionId
  final answer
  transcript
  conversation URL
  artifacts
  diagnostics
```

### 5.2 ChatGPT Web conversation

Browser engine 会在 ChatGPT Web 里真实创建或继续一个 conversation：

```text
https://chatgpt.com/c/<conversation-id>
```

这个 conversation 属于用户自己的 ChatGPT 账号。

### 5.3 repo-harness local session

本地 session 是 repo-harness 保存的审计记录：

```text
.ai/harness/chatgpt/sessions/<sessionId>/
  meta.json
  prompt.md
  transcript.md
  output.md
  events.jsonl
  artifacts/
  diagnostics/
```

这和 ChatGPT Web conversation 是两件事：

```text
ChatGPT Web conversation:
  网页端真实聊天记录

repo-harness local session:
  本地可审计、可复用、可给 Codex 读取的结果缓存
```

---

## 6. 产品形态

## 6.1 CLI commands

新增 command group：

```bash
repo-harness chatgpt
```

子命令：

```bash
repo-harness chatgpt browser-setup
repo-harness chatgpt browser-consult
repo-harness chatgpt browser-followup
repo-harness chatgpt browser-session
repo-harness chatgpt browser-list
repo-harness chatgpt browser-doctor
repo-harness chatgpt browser-open
repo-harness chatgpt browser-cleanup
```

---

## 6.2 MVP CLI examples

### 首次设置

```bash
repo-harness chatgpt browser-setup --repo .
```

输出：

```text
Created:
  .repo-harness/chatgpt-browser.local.json
  .ai/harness/chatgpt/sessions/

Next:
  repo-harness chatgpt browser-consult --manual-login --keep-browser --prompt "Say hi"
```

### 首次登录

```bash
repo-harness chatgpt browser-consult \
  --manual-login \
  --keep-browser \
  --model "GPT-5.5 Pro" \
  --prompt "Say hi"
```

行为：

```text
1. 启动带 repo-harness automation profile 的 Chrome。
2. 打开 chatgpt.com。
3. 如果未登录，等待用户手动登录。
4. 登录完成后，发送 prompt。
5. 等待回答。
6. 保存 transcript 和 output。
```

Oracle 的 manual-login mode 也是类似逻辑：启动 headful Chrome，使用持久 automation profile，第一次让用户登录 chatgpt.com，后续复用同一 profile；它还支持 `--browser-keep-browser` 方便首次登录和调试。([GitHub][1])

### 正常调用

```bash
repo-harness chatgpt browser-consult \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Review the current sprint and identify execution risks." \
  --file plans/sprints/repo-harness-chatgpt-mcp-connector-mvp.sprint.md \
  --write-output .ai/harness/handoff/chatgpt-review.md
```

返回：

```text
Session: chgpt_20260617_120530_review-sprint
Status: completed
Output: .ai/harness/chatgpt/sessions/chgpt_20260617_120530_review-sprint/output.md
Transcript: .ai/harness/chatgpt/sessions/chgpt_20260617_120530_review-sprint/transcript.md
Conversation: https://chatgpt.com/c/...
```

### 多轮 follow-up

```bash
repo-harness chatgpt browser-consult \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Review this PRD for hidden risks." \
  --file plans/prds/foo.prd.md \
  --follow-up "Challenge your previous recommendation. What would fail in production?" \
  --follow-up "Now give the final decision and smallest safe next step."
```

Oracle 的 browser follow-up 支持在同一个 ChatGPT conversation 里提交后续 prompt，并把每个 captured turn 写进 CLI output 和 `transcript.md`；它也明确建议 follow-up 用在架构、tradeoff、review 这类需要 challenge pass 的场景。([GitHub][1])

### 继续已有 session

```bash
repo-harness chatgpt browser-followup \
  --session chgpt_20260617_120530_review-sprint \
  --prompt "Convert your review into a Codex-ready implementation goal."
```

### 读取 session

```bash
repo-harness chatgpt browser-session chgpt_20260617_120530_review-sprint
```

### 列出 session

```bash
repo-harness chatgpt browser-list --limit 20
```

---

# 7. 架构设计

## 7.1 High-level architecture

```text
┌──────────────────────────────┐
│ repo-harness CLI / MCP tool   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ ChatGPT Browser Engine        │
│ - session planner             │
│ - prompt assembler            │
│ - browser controller          │
│ - model selector              │
│ - response watcher            │
│ - transcript extractor        │
│ - artifact downloader         │
│ - session store               │
└──────────────┬───────────────┘
               │ CDP / Playwright
               ▼
┌──────────────────────────────┐
│ Chrome / Edge                 │
│ signed into ChatGPT Web       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ ChatGPT Web Conversation      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Local repo-harness session    │
│ .ai/harness/chatgpt/sessions  │
└──────────────────────────────┘
```

---

## 7.2 Engine modes

### Mode A: launcher mode

`repo-harness` 启动自己的 Chrome：

```text
repo-harness
  -> launch Chrome with user-data-dir
  -> open ChatGPT
  -> drive page
  -> close or keep browser
```

优点：

```text
- 最可控
- profile 独立
- 不干扰用户日常 Chrome
- 适合本机自动化
```

缺点：

```text
- 首次需要登录
- SSO / captcha / Cloudflare challenge 需要人工处理
```

配置：

```bash
repo-harness chatgpt browser-consult \
  --manual-login \
  --profile-dir ~/.repo-harness/chatgpt-browser-profile \
  --keep-browser
```

### Mode B: attach-running mode

附着到已经运行的 Chrome：

```text
Chrome --remote-debugging-port=9222
repo-harness -> connect CDP -> open new tab -> drive ChatGPT
```

优点：

```text
- 可以复用用户已经登录的真实浏览器
- 对公司 SSO / device trust 更友好
- 适合高级用户
```

缺点：

```text
- 需要用户手动开启 remote debugging
- 安全边界更敏感
- 容易误碰用户已有 tabs，必须只操作 engine-owned tab
```

Oracle 文档也区分 launcher mode 和 attach-running mode：launcher mode 由 Oracle 启动 Chrome 并通过 CDP 驱动 ChatGPT Web；attach-running mode 则附着到已经运行的本地 Chrome session，打开专用 tab，并尽量不干扰原浏览器进程/profile。([GitHub][1])

### Mode C: remote browser host

远程机器持有已登录浏览器，本地 repo-harness 发送任务过去：

```text
repo-harness client on Linux / SSH box
  -> repo-harness chatgpt browser-host on Mac/Windows
  -> local Chrome signed into ChatGPT
  -> result streams back
```

Oracle 的 bridge workflow 就是类似模式：在 Windows 上保留 authenticated ChatGPT session，Linux client 通过 host 路由 browser runs 和 MCP browser runs，避免把 browser cookies 导出到 Linux。([GitHub][3])

MVP 可以先不实现 remote host，但设计接口时要预留：

```bash
repo-harness chatgpt browser-host
repo-harness chatgpt browser-consult --remote-host http://127.0.0.1:8787
```

---

# 8. Session store 设计

## 8.1 默认目录

建议存到 repo-local：

```text
.ai/harness/chatgpt/sessions/<sessionId>/
```

不要默认存到全局 `~/.repo-harness`，因为 repo-harness 的核心价值是 repo-local handoff。

可选加一个 global cache：

```text
~/.repo-harness/chatgpt/sessions/
```

但 MVP 默认 repo-local。

---

## 8.2 Session ID

格式：

```text
chgpt_<YYYYMMDD_HHMMSS>_<slug>
```

示例：

```text
chgpt_20260617_120530_review-sprint
```

生成规则：

```text
- 时间戳
- prompt title / first words slug
- 冲突时加 -2 / -3
```

---

## 8.3 Session directory

```text
.ai/harness/chatgpt/sessions/chgpt_20260617_120530_review-sprint/
  meta.json
  prompt.md
  transcript.md
  output.md
  events.jsonl
  browser.json
  diagnostics/
    screenshot-before-send.png
    screenshot-timeout.png
    dom-last-assistant.html
    model-picker-diagnostic.json
  artifacts/
    generated-file.zip
    generated-image.png
```

---

## 8.4 `meta.json`

```json
{
  "version": 1,
  "sessionId": "chgpt_20260617_120530_review-sprint",
  "engine": "chatgpt-browser",
  "status": "completed",
  "repo": "/path/to/repo",
  "createdAt": "2026-06-17T19:05:30.000Z",
  "updatedAt": "2026-06-17T19:12:20.000Z",
  "model": {
    "requested": "GPT-5.5 Pro",
    "resolvedLabel": "GPT-5.5 Pro",
    "thinking": "heavy",
    "verified": true
  },
  "browser": {
    "mode": "manual-login",
    "profileDir": "~/.repo-harness/chatgpt-browser-profile",
    "runtime": {
      "pid": 12345,
      "debugPort": 56789
    },
    "chatgptUrl": "https://chatgpt.com/",
    "conversationUrl": "https://chatgpt.com/c/..."
  },
  "input": {
    "promptPath": "prompt.md",
    "files": [
      {
        "path": "plans/sprints/foo.sprint.md",
        "delivery": "inline",
        "sha256": "..."
      }
    ],
    "followups": 2
  },
  "output": {
    "outputPath": "output.md",
    "transcriptPath": "transcript.md",
    "artifactsDir": "artifacts"
  },
  "diagnostics": {
    "timeouts": 0,
    "reattachable": true,
    "lastCaptureAt": "2026-06-17T19:12:20.000Z"
  }
}
```

---

## 8.5 `transcript.md`

```markdown
# ChatGPT Browser Session: chgpt_20260617_120530_review-sprint

- Status: completed
- Model: GPT-5.5 Pro
- Thinking: heavy
- Conversation: https://chatgpt.com/c/...
- Created: 2026-06-17T19:05:30.000Z

## User Turn 1

<initial prompt>

## Assistant Turn 1

<assistant answer>

## User Turn 2

<follow-up prompt>

## Assistant Turn 2

<assistant answer>

## Final Output

<final answer used as output.md>
```

---

## 8.6 `events.jsonl`

```jsonl
{"ts":"2026-06-17T19:05:30.000Z","event":"session.created","sessionId":"chgpt_..."}
{"ts":"2026-06-17T19:05:31.000Z","event":"browser.launch.started"}
{"ts":"2026-06-17T19:05:34.000Z","event":"browser.chatgpt.loaded"}
{"ts":"2026-06-17T19:05:40.000Z","event":"model.selected","label":"GPT-5.5 Pro"}
{"ts":"2026-06-17T19:05:42.000Z","event":"prompt.submitted","chars":12400}
{"ts":"2026-06-17T19:08:00.000Z","event":"assistant.waiting","elapsedMs":138000}
{"ts":"2026-06-17T19:12:20.000Z","event":"assistant.captured","chars":8300}
{"ts":"2026-06-17T19:12:21.000Z","event":"session.completed"}
```

Do not log passwords, cookies, auth headers, session tokens, or raw browser storage.

---

# 9. Browser controller 设计

## 9.1 推荐技术选型

优先顺序：

```text
1. Playwright over CDP
2. Puppeteer over CDP
3. Raw Chrome DevTools Protocol
```

推荐：**Playwright**。

原因：

```text
- selector API 更稳定
- file upload 支持好
- browser context/profile 操作清晰
- tracing / screenshot / debugging 成熟
- TypeScript 生态友好
```

但要暴露一层自己的 adapter，不要让业务逻辑绑定 Playwright：

```ts
interface BrowserAdapter {
  launchOrAttach(options: BrowserLaunchOptions): Promise<BrowserHandle>;
  openChatGPT(url: string): Promise<PageHandle>;
  ensureLoggedIn(): Promise<LoginState>;
  selectModel(model: ModelRequest): Promise<ModelSelectionResult>;
  submitPrompt(input: PromptSubmission): Promise<void>;
  waitForAssistant(options: WaitOptions): Promise<ResponseCapture>;
  extractTranscript(): Promise<Transcript>;
  downloadArtifacts(): Promise<Artifact[]>;
  close(): Promise<void>;
}
```

---

## 9.2 Browser lifecycle

状态机：

```text
idle
  -> resolving_config
  -> starting_browser | attaching_browser
  -> opening_chatgpt
  -> waiting_for_login
  -> preparing_conversation
  -> selecting_model
  -> preparing_attachments
  -> submitting_prompt
  -> waiting_for_response
  -> capturing_response
  -> running_followups
  -> saving_session
  -> completed

error states:
  -> login_required_timeout
  -> model_selection_failed
  -> prompt_submit_failed
  -> assistant_timeout
  -> incomplete_capture
  -> browser_crashed
  -> rate_limited
  -> auth_challenge
```

---

## 9.3 Browser launch

Launcher mode command shape:

```bash
chrome \
  --user-data-dir ~/.repo-harness/chatgpt-browser-profile \
  --remote-debugging-port 0 \
  --no-first-run \
  --no-default-browser-check
```

配置：

```json
{
  "browser": {
    "mode": "manual-login",
    "profileDir": "~/.repo-harness/chatgpt-browser-profile",
    "chromePath": null,
    "headless": false,
    "keepBrowser": false,
    "debugPort": 0,
    "maxConcurrentTabs": 2
  }
}
```

MVP 默认：

```text
headful: true
manualLogin: true
keepBrowser: false after login
profileDir: ~/.repo-harness/chatgpt-browser-profile
```

---

## 9.4 Attach-running mode

用户手动启动：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.repo-harness/chatgpt-browser-profile"
```

然后：

```bash
repo-harness chatgpt browser-consult \
  --attach-running \
  --remote-chrome 127.0.0.1:9222 \
  --prompt "Say hi"
```

安全要求：

```text
- 只连接 localhost，除非用户显式传远程地址。
- 远程地址必须提示风险。
- 每次 run 打开专用 tab。
- 只关闭自己创建的 tab。
- 不读取用户已有 tabs 内容。
```

Oracle remote Chrome 文档也提醒，如果 CDP 暴露到非本机地址，应锁在 VPN 或 SSH tunnel 后面；每次 run 应打开 dedicated CDP target/new tab，并在结束后关闭，避免影响已有 tabs。([GitHub][1])

---

# 10. Login 设计

## 10.1 Login strategy

MVP 只支持 manual login：

```text
1. 打开 ChatGPT。
2. 检测是否已登录。
3. 未登录则显示提示。
4. 用户在浏览器里完成登录 / SSO / 2FA / captcha。
5. Engine poll 登录状态。
6. 登录成功后继续。
```

CLI 输出：

```text
ChatGPT login required.
A Chrome window has been opened.
Complete login manually in the browser.
repo-harness will continue automatically after login.
```

不要做：

```text
- 不让 CLI 输入用户名/密码。
- 不读取 password manager。
- 不保存 2FA。
- 不复制 cookies 到日志。
```

---

## 10.2 Login detection

可使用多重信号：

```text
- 当前 URL 不是 /auth/login
- composer textarea/contenteditable 出现
- sidebar/new chat button 出现
- account/workspace picker 已通过
- 没有明显 captcha/challenge modal
```

返回：

```ts
type LoginState =
  | { status: 'authenticated' }
  | { status: 'login_required'; reason: string }
  | { status: 'challenge_required'; reason: string }
  | { status: 'workspace_picker_required'; reason: string }
  | { status: 'unknown'; diagnosticsPath: string };
```

---

# 11. ChatGPT URL / Project 支持

## 11.1 Base URL

默认：

```text
https://chatgpt.com/
```

允许覆盖：

```bash
--chatgpt-url "https://chatgpt.com/g/g-xxx/project"
```

用途：

```text
- 指定 Custom GPT
- 指定 ChatGPT Project
- 指定已有 conversation
```

---

## 11.2 Project mode

MVP 支持打开 Project URL 作为会话入口，但不管理 Project Sources。

```bash
repo-harness chatgpt browser-consult \
  --chatgpt-url "https://chatgpt.com/g/g-xxx/project" \
  --prompt "Use this project context and review the attached sprint."
```

Project Sources 管理后续再做。Oracle 当前也把 Project Sources 设计成窄范围、非破坏性的能力：preview upload plan、list current sources、append files；delete/replace/sync 被刻意留到 UI 路径更安全、更充分测试之后。([GitHub][1])

---

# 12. Model selection 设计

## 12.1 输入

```bash
--model "GPT-5.5 Pro"
--thinking heavy
--model-strategy select
```

配置：

```ts
type ModelRequest = {
  model: string;
  thinking?: 'light' | 'standard' | 'extended' | 'heavy';
  strategy: 'select' | 'current' | 'ignore';
  failClosed: boolean;
};
```

策略：

```text
select:
  尝试打开 model picker 并选择目标模型。

current:
  不切模型，只读取当前模型 label 并记录。

ignore:
  完全跳过模型检测，适合 UI 变化时人工确认。
```

MVP 默认：

```text
strategy: select
failClosed: true for Pro/Thinking models
```

原因：

```text
如果用户要求 GPT-5.5 Pro / heavy thinking，但 UI 没选中，宁可失败，也不要静默用 weaker model。
```

Oracle 对 GPT-5.5 Pro Extended 的处理也采取 fail-closed 思路：如果不能确认 Extended，就失败，而不是静默提交到更弱 effort；同时写入 bounded、redacted 的 picker diagnostic。([GitHub][1])

---

## 12.2 Model selector abstraction

不要在业务逻辑里硬编码 UI selectors。

```ts
interface ModelSelector {
  detectCurrentModel(page: PageHandle): Promise<ModelDetection>;
  selectModel(page: PageHandle, request: ModelRequest): Promise<ModelSelectionResult>;
  selectThinking(page: PageHandle, thinking: ThinkingLevel): Promise<ThinkingSelectionResult>;
}
```

输出：

```json
{
  "requested": "GPT-5.5 Pro",
  "resolvedLabel": "GPT-5.5 Pro",
  "thinkingRequested": "heavy",
  "thinkingResolved": "heavy",
  "verified": true
}
```

---

# 13. Prompt assembler

## 13.1 输入结构

```ts
type BrowserConsultInput = {
  title?: string;
  prompt: string;
  files?: FileInput[];
  followups?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  chatgptUrl?: string;
  outputMode?: 'final' | 'transcript';
  writeOutput?: string;
};
```

---

## 13.2 Prompt bundle format

Browser composer 里只发送用户 prompt 和文件内容，不发送 repo-harness hidden system prompt。

````markdown
# Task

<user prompt>

# Context files

## File: plans/sprints/foo.sprint.md

```markdown
<file content>
````

# Instructions

Return:

1. Summary
2. Risks
3. Recommended next step
4. Codex-ready goal if applicable

````

---

## 13.3 文件输入策略

参考 Oracle 的 attachment policy：

```text
auto:
  小文本 inline paste
  大文本或二进制上传

never:
  所有文件必须 inline-compatible
  二进制/过大文件直接拒绝

always:
  尽量作为附件上传
````

Oracle browser mode 里有 `--browser-attachments auto|never|always`，默认 auto：文本内容到一定大小以内 inline，较大或 raw files 上传；它也支持把多个文件 bundle 成 text 或 ZIP。([GitHub][1])

repo-harness MVP 建议：

```text
default: inline-only
max inline chars: 120k
binary upload: disabled by default
upload attachments: experimental flag
```

原因：

```text
- ChatGPT Web file upload UI 更容易变。
- Inline 对 PRD/sprint/review 最够用。
- 上传文件涉及更多失败点和隐私边界。
```

MVP flags：

```bash
--file plans/sprints/foo.sprint.md
--attachment-mode inline
--max-inline-chars 120000
```

后续 flags：

```bash
--attachment-mode auto
--bundle-files
--bundle-format zip
```

---

# 14. Prompt submission

## 14.1 Composer detection

需要支持 ChatGPT UI 变化，因此采用多 selector fallback：

```text
- textarea
- contenteditable composer
- [data-testid] selectors
- ARIA label
- role textbox
```

伪代码：

```ts
async function findComposer(page) {
  return firstVisible([
    page.getByRole('textbox'),
    page.locator('textarea'),
    page.locator('[contenteditable="true"]'),
    page.locator('[data-testid*="composer"]')
  ]);
}
```

---

## 14.2 清空草稿

发送前必须清空 stale draft：

```text
1. focus composer
2. select all
3. delete
4. verify empty
5. paste prompt
```

Oracle changelog 里也提到 browser mode 曾经 harden 过“clear stale ChatGPT composer drafts before initial browser submissions”，这个问题值得在 repo-harness 一开始就纳入验收。([GitHub][4])

---

## 14.3 发送策略

```text
primary:
  click send button

fallback:
  keyboard shortcut

validation:
  after send, composer should clear or user message should appear
```

不要盲目 Enter，因为多行 prompt 可能误触。

---

# 15. Response watcher

## 15.1 等待状态

状态：

```text
submitted
assistant_started
thinking
streaming
tool_running
finalizing
completed
timeout
rate_limited
auth_required
challenge_required
network_error
```

可观察信号：

```text
- assistant message count 增加
- stop button 出现/消失
- composer disabled/enabled
- streaming text changes
- “thinking” indicator
- “used tool” / “called tool”
- rate limit banner
- login modal
```

---

## 15.2 Heartbeat

长任务要定期输出：

```text
[browser] ChatGPT thinking... elapsed=180s lastChange=20s
[browser] Waiting for assistant response... elapsed=420s
```

Oracle browser mode 也会对长 Pro/Thinking run 输出 heartbeat；在遇到 assistant timeout 时，它会保存 incomplete capture、reattach/runtime diagnostics，并让 `oracle session <id>` 有机会恢复最终答案。([GitHub][1])

---

## 15.3 Timeout policy

配置：

```json
{
  "timeouts": {
    "loginMs": 300000,
    "modelSelectMs": 60000,
    "submitMs": 60000,
    "assistantMs": 1800000,
    "stableMs": 5000,
    "reattachDelayMs": 30000,
    "reattachTimeoutMs": 300000
  }
}
```

默认：

```text
login: 5 min
model select: 1 min
assistant: 30 min
stable capture: 5 sec no DOM change
```

---

## 15.4 Incomplete capture

如果超时但 conversation 仍可能继续：

```text
status: incomplete_capture
reatachable: true
conversationUrl: saved if available
debugPort: saved if available
tabTargetId: saved if available
```

用户可以：

```bash
repo-harness chatgpt browser-session <id> --reattach
```

---

# 16. Response capture

## 16.1 Capture priority

优先级：

```text
1. ChatGPT copy button result，保留 Markdown
2. DOM extraction from latest assistant message
3. Accessibility tree extraction
4. Screenshot + diagnostic only
```

建议实现：

```ts
interface ResponseExtractor {
  captureLatestAssistantMarkdown(page: PageHandle): Promise<CapturedMessage>;
  captureFullTranscript(page: PageHandle): Promise<Transcript>;
}
```

---

## 16.2 稳定性判断

不要在 streaming 中途抓最后一个 DOM snapshot。

完成条件：

```text
- stop button disappears
- assistant message text stable for N ms
- composer available again
- no active “thinking” indicator
```

如果 UI 中出现“继续生成”：

```text
- MVP: mark incomplete and report
- V1: click continue once with explicit flag
```

---

## 16.3 Transcript normalization

输出：

```markdown
## Assistant Turn 1

<markdown>

<!-- capture metadata:
source=copy-button|dom
chars=12345
capturedAt=...
-->
```

---

# 17. Artifact handling

## 17.1 Generated files

如果 ChatGPT 返回下载文件：

```text
- 只下载 assistant response 中 ChatGPT-owned download links
- 保存到 artifacts/
- 记录原始 filename
- 记录 sha256
- 不跟随外部任意 URL
```

Oracle 的 artifact downloader 也采用窄策略：只跟随 assistant response 中 ChatGPT-owned file/download URLs；外部 links 保留在 transcript，但不下载。([GitHub][1])

---

## 17.2 Generated images

V1 可支持：

```bash
repo-harness chatgpt browser-consult \
  --generate-image artifacts/icon.png \
  --prompt "Create..."
```

MVP 可以只保存 transcript，不处理图片下载。

---

# 18. Conversation archiving

MVP 默认：

```text
archive: never
```

原因：

```text
repo-harness browser engine 初期更需要用户能在 ChatGPT sidebar 里看到会话，方便调试。
```

V1 支持：

```bash
--archive auto|always|never
```

Oracle 的默认 archive 策略是 `auto`：只 archive 成功的一次性、非 Project、非 Deep Research、非 multi-turn 会话；失败、不完整、running、project、Deep Research、multi-turn 都不会自动 archive。([GitHub][1])

repo-harness 可以后续采用类似策略。

---

# 19. Concurrency 设计

## 19.1 MVP

默认：

```text
maxConcurrentTabs: 1
```

也就是同一个 profile 同时只跑一个 ChatGPT tab。

如果第二个请求进来：

```text
- queue
- 或 fail with "browser busy"
```

---

## 19.2 V1

支持 tab lease：

```text
.ai/harness/chatgpt/browser-lock.json
```

字段：

```json
{
  "profileDir": "~/.repo-harness/chatgpt-browser-profile",
  "leases": [
    {
      "sessionId": "chgpt_...",
      "tabId": "...",
      "startedAt": "...",
      "lastHeartbeatAt": "..."
    }
  ]
}
```

Oracle 在 concurrent agents / long Pro runs 中也采用 tab slot coordination：共享 manual-login profile 时，每个 browser run 先获取 tab slot，默认允许有限数量的并发 ChatGPT tabs，并序列化启动和 send/upload 阶段。([GitHub][1])

---

# 20. MCP tool 设计

Browser engine 可以通过 `repo-harness mcp serve` 暴露给 Codex。

## 20.1 Tools

```text
run_chatgpt_browser_consult
continue_chatgpt_browser_session
read_chatgpt_browser_session
list_chatgpt_browser_sessions
open_chatgpt_browser_session
```

---

## 20.2 `run_chatgpt_browser_consult`

Input:

```json
{
  "prompt": "Review this sprint and produce risks.",
  "title": "review sprint",
  "files": [
    "plans/sprints/foo.sprint.md"
  ],
  "model": "GPT-5.5 Pro",
  "thinking": "heavy",
  "followups": [
    "Challenge your previous recommendation.",
    "Return the final recommendation as a Codex goal."
  ],
  "writeOutput": ".ai/harness/handoff/chatgpt-review.md",
  "timeoutMs": 1800000,
  "dryRun": false
}
```

Output:

```json
{
  "sessionId": "chgpt_20260617_120530_review-sprint",
  "status": "completed",
  "output": "Final answer text...",
  "paths": {
    "sessionDir": ".ai/harness/chatgpt/sessions/chgpt_20260617_120530_review-sprint",
    "output": ".ai/harness/chatgpt/sessions/chgpt_20260617_120530_review-sprint/output.md",
    "transcript": ".ai/harness/chatgpt/sessions/chgpt_20260617_120530_review-sprint/transcript.md"
  },
  "conversationUrl": "https://chatgpt.com/c/...",
  "artifacts": []
}
```

---

## 20.3 MCP safety

默认 MCP profile：

```text
browser_consult: disabled
```

必须显式启用：

```bash
repo-harness mcp serve \
  --enable-chatgpt-browser \
  --chatgpt-browser-profile planner
```

原因：

```text
这个 tool 会操作用户登录的 ChatGPT Web，会创建真实网页会话。
```

MCP tool annotations：

```ts
annotations: {
  readOnlyHint: false,
  openWorldHint: true,
  destructiveHint: false
}
```

---

# 21. Codex Skill 设计

新增 Skill：

```text
.agents/skills/repo-harness-chatgpt-browser/SKILL.md
```

用途：

```text
- 让 Codex 调用本地 ChatGPT Browser Engine 做规划/评审
- 让 Codex 读取 browser session result
- 让 Codex 把 ChatGPT 结果转为 repo-harness artifacts
```

Codex Skills 官方定位是把 instructions、resources、optional scripts 打包成可复用能力，适用于 Codex CLI、IDE extension 和 Codex app。([OpenAI Developers][5])

Skill frontmatter：

```markdown
---
name: repo-harness-chatgpt-browser
description: Use when the user wants Codex to consult their logged-in ChatGPT Web session through repo-harness browser engine for planning, architecture review, PRD critique, or Codex goal generation.
---
```

Skill rules：

```markdown
# repo-harness-chatgpt-browser

Use this skill when the user asks to consult ChatGPT Web, GPT Pro, browser GPT, or logged-in ChatGPT.

Rules:
1. This uses the user's logged-in ChatGPT Web browser, not the OpenAI API.
2. Do not ask for or handle passwords, 2FA codes, SSO secrets, cookies, or browser tokens.
3. Before running a consult, explain that it will create or continue a ChatGPT Web conversation.
4. Prefer repo-harness CLI commands:
   - repo-harness chatgpt browser-doctor --repo .
   - repo-harness chatgpt browser-consult ...
   - repo-harness chatgpt browser-session <id>
5. Use browser consult for planning/review, not direct code editing.
6. Save useful results into repo-harness artifacts:
   - .ai/harness/handoff/chatgpt-review.md
   - .ai/harness/handoff/codex-goal.md
   - plans/prds/*.prd.md
   - plans/sprints/*.sprint.md
7. If login or captcha is required, stop and ask the user to complete it in the browser.
8. Do not enable remote CDP unless the user explicitly asks and understands the risk.
```

---

# 22. Config 设计

## 22.1 Local config

不要提交：

```text
.repo-harness/chatgpt-browser.local.json
```

示例：

```json
{
  "version": 1,
  "browser": {
    "mode": "manual-login",
    "profileDir": "~/.repo-harness/chatgpt-browser-profile",
    "chromePath": null,
    "headless": false,
    "keepBrowser": false,
    "maxConcurrentTabs": 1,
    "remoteChrome": null
  },
  "chatgpt": {
    "baseUrl": "https://chatgpt.com/",
    "defaultModel": "GPT-5.5 Pro",
    "defaultThinking": "heavy",
    "modelStrategy": "select",
    "failClosedModelSelection": true
  },
  "attachments": {
    "mode": "inline",
    "maxInlineChars": 120000,
    "uploadEnabled": false
  },
  "timeouts": {
    "loginMs": 300000,
    "assistantMs": 1800000,
    "stableCaptureMs": 5000
  },
  "sessions": {
    "root": ".ai/harness/chatgpt/sessions",
    "archive": "never"
  }
}
```

---

## 22.2 Gitignore

自动写入：

```gitignore
.repo-harness/chatgpt-browser.local.json
.repo-harness/chatgpt-browser.tokens.json
.ai/harness/chatgpt/browser-lock.json
.ai/harness/chatgpt/tmp/
```

Session 是否提交要给用户选择。

建议默认：

```text
sessions: commit-safe but may contain private prompts/output
```

所以 setup 时问或提供 flag：

```bash
--sessions-gitignored
--sessions-committable
```

默认更安全：

```text
.ai/harness/chatgpt/sessions/
```

加到 `.gitignore`。

但生成的 handoff/review 可以提交：

```text
.ai/harness/handoff/chatgpt-review.md
.ai/harness/handoff/codex-goal.md
```

---

# 23. Security 设计

## 23.1 最高风险点

```text
1. CDP remote debugging port 暴露。
2. browser profile 包含登录态。
3. ChatGPT 页面 UI 变化导致误操作。
4. Agent 诱导 browser engine 上传敏感文件。
5. 输出中包含私密 repo 信息。
6. 多 agent 并发操作同一个 browser profile。
```

---

## 23.2 Safety rules

MVP 强制：

```text
- browser profile 只存本地。
- 不导出 cookies。
- 不打印 cookies。
- 不读取 Chrome cookie DB。
- 不允许任意 URL navigation，除非 explicit --chatgpt-url 且 host allowlist。
- allowlist host: chatgpt.com。
- 远程 CDP 默认禁用。
- 文件输入走 repo-harness path allowlist。
- 默认不上传二进制文件。
- session logs 不记录 browser storage。
- diagnostics redacted。
```

---

## 23.3 Path policy

Browser consult 允许读取的文件应复用 repo-harness MCP policy：

```text
docs/**
plans/**
tasks/**
.ai/context/**
.ai/harness/**
AGENTS.md
CLAUDE.md
README.md
package.json
```

默认禁止：

```text
.env
.env.*
*.pem
*.key
*.p12
*.pfx
.ssh/**
.git/**
node_modules/**
dist/**
build/**
coverage/**
secrets/**
credentials/**
private/**
```

---

## 23.4 Prompt injection 防护

如果 ChatGPT 要读取文件，文件内容可能包含恶意提示。Browser engine 不需要“理解”文件，只负责传输，但 Codex 调用 browser engine 前要遵守：

```text
- 不自动包含整个 repo。
- 文件必须由用户、Codex Skill、或 repo-harness policy 明确选择。
- dry-run 显示将发送哪些文件。
- prompt preview 必须可查看。
```

命令：

```bash
repo-harness chatgpt browser-consult \
  --prompt "Review this" \
  --file plans/sprints/foo.sprint.md \
  --dry-run
```

Dry-run 输出：

```text
Would send:
  prompt chars: 420
  inline files:
    plans/sprints/foo.sprint.md 18.2 KB
Would use:
  model: GPT-5.5 Pro
  thinking: heavy
Would create:
  session: chgpt_...
No browser will be opened.
```

Oracle 的 MCP consult 也支持 `dryRun`，用于 inspect resolved run 而不创建 session 或触碰 Chrome。([GitHub][6])

---

# 24. Error handling

## 24.1 错误类型

```ts
type BrowserEngineErrorCode =
  | 'BROWSER_NOT_FOUND'
  | 'BROWSER_LAUNCH_FAILED'
  | 'REMOTE_CHROME_UNREACHABLE'
  | 'LOGIN_REQUIRED_TIMEOUT'
  | 'AUTH_CHALLENGE_REQUIRED'
  | 'MODEL_SELECTION_FAILED'
  | 'COMPOSER_NOT_FOUND'
  | 'PROMPT_SUBMIT_FAILED'
  | 'ATTACHMENT_FAILED'
  | 'ASSISTANT_TIMEOUT'
  | 'INCOMPLETE_CAPTURE'
  | 'RATE_LIMITED'
  | 'CONVERSATION_LOST'
  | 'OUTPUT_CAPTURE_FAILED'
  | 'POLICY_DENIED_FILE'
  | 'SESSION_NOT_FOUND';
```

---

## 24.2 User-facing errors

Example:

```text
ChatGPT login did not complete within 5 minutes.

A browser window is still open.
Complete login manually, then rerun:

  repo-harness chatgpt browser-session chgpt_... --reattach

Diagnostics:
  .ai/harness/chatgpt/sessions/chgpt_.../diagnostics/screenshot-timeout.png
```

Example:

```text
Model selection failed.

Requested:
  GPT-5.5 Pro / heavy

Detected:
  GPT-5.5 Thinking

Because fail-closed is enabled, the prompt was not submitted.

Retry with:
  --model-strategy current
or manually select the model in the browser and rerun.
```

---

# 25. Browser engine module layout

Suggested files:

```text
src/cli/commands/chatgpt.ts

src/cli/chatgpt-browser/
  index.ts
  types.ts
  config.ts
  engine.ts
  session-store.ts
  prompt-assembler.ts
  file-policy.ts
  artifact-store.ts
  errors.ts
  diagnostics.ts
  redaction.ts

src/cli/chatgpt-browser/browser/
  adapter.ts
  playwright-adapter.ts
  launcher.ts
  attach.ts
  login.ts
  navigation.ts
  model-selector.ts
  composer.ts
  response-watcher.ts
  extractor.ts
  artifact-downloader.ts
  archive.ts
  tab-lease.ts

src/cli/chatgpt-browser/mcp/
  tools.ts
  run-chatgpt-browser-consult.ts
  read-chatgpt-browser-session.ts
  list-chatgpt-browser-sessions.ts
  continue-chatgpt-browser-session.ts

src/cli/chatgpt-browser/skill/
  templates/SKILL.md
  templates/references/browser-engine.md
```

---

# 26. TypeScript API 草案

## 26.1 Engine

```ts
export interface ChatGptBrowserEngine {
  consult(input: BrowserConsultInput): Promise<BrowserConsultResult>;
  followup(input: BrowserFollowupInput): Promise<BrowserConsultResult>;
  reattach(sessionId: string): Promise<BrowserConsultResult>;
  readSession(sessionId: string): Promise<StoredBrowserSession>;
  listSessions(filter?: SessionListFilter): Promise<StoredBrowserSessionSummary[]>;
}
```

---

## 26.2 Input

```ts
export interface BrowserConsultInput {
  repoRoot: string;
  title?: string;
  prompt: string;
  files?: BrowserFileInput[];
  followups?: string[];
  chatgptUrl?: string;
  model?: string;
  thinking?: 'light' | 'standard' | 'extended' | 'heavy';
  modelStrategy?: 'select' | 'current' | 'ignore';
  timeoutMs?: number;
  dryRun?: boolean;
  writeOutput?: string;
  sessionRoot?: string;
  browser?: BrowserRuntimeOptions;
  attachments?: BrowserAttachmentOptions;
}
```

---

## 26.3 Result

```ts
export interface BrowserConsultResult {
  sessionId: string;
  status:
    | 'completed'
    | 'running'
    | 'incomplete_capture'
    | 'failed'
    | 'cancelled';
  output?: string;
  conversationUrl?: string;
  paths: {
    sessionDir: string;
    prompt: string;
    transcript?: string;
    output?: string;
    events: string;
    artifactsDir: string;
  };
  model?: {
    requested?: string;
    resolvedLabel?: string;
    thinking?: string;
    verified: boolean;
  };
  artifacts: BrowserArtifact[];
  diagnostics?: BrowserDiagnostics;
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
}
```

---

# 27. Integration with repo-harness artifacts

## 27.1 Common recipes

### PRD review

```bash
repo-harness chatgpt browser-consult \
  --title "review prd oauth" \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Review this PRD. Return risks, missing acceptance criteria, and final recommendation." \
  --file plans/prds/oauth.prd.md \
  --write-output .ai/harness/handoff/chatgpt-prd-review.md
```

### Sprint challenge pass

```bash
repo-harness chatgpt browser-consult \
  --title "challenge sprint mcp browser" \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Challenge this sprint plan. Identify hidden blockers and unsafe assumptions." \
  --file plans/sprints/repo-harness-chatgpt-browser-engine.sprint.md \
  --follow-up "Now rewrite the top 5 changes needed as checklist items." \
  --write-output .ai/harness/handoff/chatgpt-sprint-challenge.md
```

### Codex goal generation

```bash
repo-harness chatgpt browser-consult \
  --title "codex goal from prd" \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Convert this PRD into a Codex execution goal. Include scope, files, checks, and done criteria." \
  --file plans/prds/foo.prd.md \
  --write-output .ai/harness/handoff/codex-goal.md
```

---

## 27.2 Handoff marker

After each successful consult, optionally append:

```text
.ai/harness/handoff/chatgpt-browser-latest.md
```

Content:

```markdown
# Latest ChatGPT Browser Consult

- Session: chgpt_20260617_120530_review-sprint
- Status: completed
- Model: GPT-5.5 Pro
- Output: .ai/harness/chatgpt/sessions/chgpt_.../output.md
- Transcript: .ai/harness/chatgpt/sessions/chgpt_.../transcript.md
- Conversation: https://chatgpt.com/c/...

## Summary

<first 20 lines or model-provided summary>
```

---

# 28. Comparison: native implementation vs Oracle provider

## Option A: Native repo-harness browser engine

Pros:

```text
- Full control over repo-harness workflow integration.
- Session store can be repo-local from day one.
- Policy, audit, handoff, MCP tools align with repo-harness.
- No shell-out dependency.
```

Cons:

```text
- Browser automation is fragile.
- Need to maintain selectors, model picker, capture logic.
- Need live manual tests.
```

---

## Option B: Oracle provider wrapper

Add:

```bash
repo-harness chatgpt browser-consult --provider oracle
```

Internally shell out:

```bash
oracle --engine browser ...
```

Pros:

```text
- Fastest path.
- Oracle already has browser mode, follow-ups, session recovery, manual-login, remote bridge, artifacts.
- Lower initial risk.
```

Cons:

```text
- Session store lives under Oracle first, then needs import/copy.
- repo-harness policy weaker unless wrapper validates inputs first.
- Dependency on Oracle CLI flags and behavior.
- Harder to provide tight MCP structured output unless wrapper normalizes Oracle output.
```

Oracle README shows MCP support through `oracle-mcp`, a `chatgpt-pro-heavy` preset for browser mode, `dryRun`, and saved browser/API sessions that can be continued or re-read.([GitHub][6])

---

## Recommendation

Implement in two phases:

```text
Phase 1:
  Oracle-compatible provider shell-out for fast validation.

Phase 2:
  Native browser engine if the workflow proves valuable and we need tighter repo-harness integration.
```

CLI shape should hide provider detail:

```bash
repo-harness chatgpt browser-consult \
  --provider oracle
```

Later:

```bash
repo-harness chatgpt browser-consult \
  --provider native
```

Default can initially be:

```text
provider: oracle if installed
provider: native once stable
```

---

# 29. Oracle provider adapter design

## 29.1 Command mapping

Input:

```bash
repo-harness chatgpt browser-consult \
  --model "GPT-5.5 Pro" \
  --thinking heavy \
  --prompt "Review this sprint" \
  --file plans/sprints/foo.sprint.md \
  --follow-up "Challenge your review" \
  --write-output .ai/harness/handoff/chatgpt-review.md
```

Oracle command:

```bash
oracle --engine browser \
  --browser-manual-login \
  --model "GPT-5.5 Pro" \
  --browser-thinking-time heavy \
  --prompt "Review this sprint" \
  --file plans/sprints/foo.sprint.md \
  --browser-follow-up "Challenge your review" \
  --write-output .ai/harness/handoff/chatgpt-review.md
```

---

## 29.2 Result import

After Oracle run:

```text
1. Parse stdout for session ID.
2. Locate ~/.oracle/sessions/<id>.
3. Copy or reference:
   - transcript.md
   - output.log / output.md
   - artifacts/
   - meta.json
4. Normalize into:
   .ai/harness/chatgpt/sessions/<repoHarnessSessionId>/
```

---

## 29.3 Provider interface

```ts
interface ChatGptBrowserProvider {
  name: 'oracle' | 'native';
  doctor(): Promise<ProviderDoctorResult>;
  consult(input: BrowserConsultInput): Promise<BrowserConsultResult>;
  followup(input: BrowserFollowupInput): Promise<BrowserConsultResult>;
  readSession(sessionId: string): Promise<StoredBrowserSession>;
}
```

---

# 30. `browser-doctor`

Command:

```bash
repo-harness chatgpt browser-doctor --repo .
```

Checks:

```text
Repo:
  - git repo
  - repo-harness adopted
  - session root exists
  - .gitignore policy

Browser:
  - Chrome/Edge detected
  - profile dir exists or can be created
  - Playwright browsers installed, if native
  - remote debugging attach config valid, if attach mode

ChatGPT:
  - can open chatgpt.com
  - logged in status
  - composer detected
  - model picker detectable, if possible

Provider:
  - oracle installed, if provider=oracle
  - oracle version
  - native dependencies available, if provider=native

Security:
  - no remote CDP unless explicit
  - local config ignored by git
  - sessions ignored or explicitly committable
```

Output:

```json
{
  "status": "ready",
  "provider": "oracle",
  "browser": {
    "chrome": "found",
    "mode": "manual-login",
    "profileDir": "~/.repo-harness/chatgpt-browser-profile"
  },
  "chatgpt": {
    "login": "authenticated",
    "composer": "detected"
  },
  "repo": {
    "sessionRoot": ".ai/harness/chatgpt/sessions",
    "gitignored": true
  },
  "next": [
    "repo-harness chatgpt browser-consult --prompt \"Say hi\""
  ]
}
```

---

# 31. Manual setup guide

Generate:

```text
docs/repo-harness-chatgpt-browser-engine.md
```

Sections:

```text
1. What this does
2. What this does not do
3. First-time login
4. Normal browser consult
5. Follow-up consult
6. Read sessions
7. Write result to handoff
8. Use from Codex Skill
9. Use through MCP
10. Troubleshooting
11. Security notes
```

---

# 32. Testing strategy

## 32.1 Unit tests

```text
- session ID generation
- config loading
- prompt assembly
- file allow/deny policy
- inline file rendering
- session store writes
- transcript normalization
- artifact metadata
- provider command mapping
- Oracle stdout parser
- dry-run output
```

---

## 32.2 Integration tests without ChatGPT

Use fake browser page:

```text
- fake composer
- fake assistant stream
- fake model picker
- fake copy button
```

Tests:

```text
- can paste prompt
- can clear stale draft
- can click send
- can wait until response stable
- can extract markdown
- can save transcript
```

---

## 32.3 Manual live tests

Manual because ChatGPT Web UI and account state are real-world dependencies.

Checklist:

```text
- [ ] First login run opens Chrome and waits.
- [ ] Already-logged-in run sends prompt.
- [ ] Model selection selects requested model.
- [ ] Wrong model fails closed when required.
- [ ] Simple response captured.
- [ ] Markdown code fence preserved.
- [ ] Multi-line prompt preserved.
- [ ] Follow-up stays in same conversation.
- [ ] Timeout produces incomplete_capture.
- [ ] Reattach can recover completed response.
- [ ] Result writes to output path.
- [ ] Session transcript includes conversation URL.
- [ ] Denied file cannot be sent.
- [ ] Dry run does not open browser.
```

Oracle’s own manual browser regression checklist includes smoke tests for simple prompts, Markdown capture, attachments, multi-turn browser consults, archive behavior, remote Chrome, and attach-running. That is a good reference structure for repo-harness live validation.([GitHub][7])

---

# 33. Acceptance criteria

## AC1: Browser consult

Given:

```bash
repo-harness chatgpt browser-consult --prompt "Reply exactly OK"
```

Then:

```text
- A ChatGPT Web conversation is created or reused.
- Prompt is submitted.
- Final answer is captured.
- Local session is saved.
- CLI prints sessionId and output.
```

---

## AC2: No API dependency

Given no `OPENAI_API_KEY`:

```bash
unset OPENAI_API_KEY
```

Then:

```text
repo-harness chatgpt browser-consult still works if ChatGPT Web is logged in.
```

---

## AC3: Manual login

Given user is not logged in:

```text
- browser opens
- CLI waits
- user logs in manually
- engine resumes
```

No password or 2FA is entered through repo-harness.

---

## AC4: Follow-up

Given:

```bash
repo-harness chatgpt browser-consult \
  --prompt "Give one risk" \
  --follow-up "Challenge it" \
  --follow-up "Give final answer"
```

Then:

```text
- All turns occur in the same ChatGPT conversation.
- transcript.md contains all user and assistant turns.
- output.md contains final assistant turn.
```

---

## AC5: Session re-read

Given a completed session:

```bash
repo-harness chatgpt browser-session <id>
```

Then:

```text
- Prints status.
- Prints output path.
- Prints transcript path.
- Prints final answer unless --metadata-only.
```

---

## AC6: Policy-denied file

Given:

```bash
repo-harness chatgpt browser-consult \
  --prompt "Read this" \
  --file .env
```

Then:

```text
- Command fails before opening browser.
- Error explains file is denied.
- No browser prompt is submitted.
```

---

## AC7: MCP tool

Given MCP server started with browser enabled:

```bash
repo-harness mcp serve --enable-chatgpt-browser
```

When Codex calls:

```text
run_chatgpt_browser_consult
```

Then:

```text
- Browser consult runs locally.
- Tool returns structuredContent with sessionId/status/output.
- Session is saved.
```

---

# 34. Milestones

## Milestone 1: Oracle provider wrapper

Deliver:

```text
repo-harness chatgpt browser-setup
repo-harness chatgpt browser-consult --provider oracle
repo-harness chatgpt browser-session
repo-harness chatgpt browser-list
session import from ~/.oracle
dry-run
file policy
```

Success:

```text
Can use ChatGPT Web through Oracle and save repo-harness local sessions.
```

---

## Milestone 2: repo-harness session store

Deliver:

```text
.ai/harness/chatgpt/sessions/<id>/
meta.json
prompt.md
transcript.md
output.md
events.jsonl
artifacts/
```

Success:

```text
Codex can read browser consult results without knowing Oracle internals.
```

---

## Milestone 3: MCP tools

Deliver:

```text
run_chatgpt_browser_consult
read_chatgpt_browser_session
list_chatgpt_browser_sessions
continue_chatgpt_browser_session
```

Success:

```text
Codex can call ChatGPT browser engine through repo-harness MCP.
```

---

## Milestone 4: Codex Skill

Deliver:

```text
.agents/skills/repo-harness-chatgpt-browser/SKILL.md
docs/repo-harness-chatgpt-browser-engine.md
```

Success:

```text
Codex knows when and how to consult ChatGPT Web safely.
```

---

## Milestone 5: Native browser engine

Deliver:

```text
Playwright adapter
manual-login profile
model selector
composer sender
response watcher
transcript extractor
reattach
```

Success:

```text
repo-harness can run without Oracle provider.
```

---

# 35. Recommended implementation order

```text
1. Add CLI scaffold:
   repo-harness chatgpt browser-*

2. Add config + session store.

3. Add file policy + dry-run.

4. Add Oracle provider wrapper.

5. Add browser-session/list commands.

6. Add write-output and handoff integration.

7. Add MCP tools.

8. Add Codex Skill.

9. Add native Playwright spike.

10. Promote native provider after live tests pass.
```

---

# 36. Sprint-ready task checklist

## Task 1: CLI scaffold

```yaml
id: chatgpt-browser-cli
priority: P0
```

Checklist:

* [ ] Add `repo-harness chatgpt` command group.
* [ ] Add `browser-setup`.
* [ ] Add `browser-consult`.
* [ ] Add `browser-session`.
* [ ] Add `browser-list`.
* [ ] Add `browser-doctor`.
* [ ] Add help text that clearly says this uses ChatGPT Web, not API.

Done when:

* [ ] `repo-harness chatgpt --help` works.
* [ ] All subcommands have useful help output.

---

## Task 2: Session store

```yaml
id: chatgpt-browser-session-store
priority: P0
```

Checklist:

* [ ] Implement session ID generation.
* [ ] Create session directory.
* [ ] Write `meta.json`.
* [ ] Write `prompt.md`.
* [ ] Write `output.md`.
* [ ] Write `transcript.md`.
* [ ] Write `events.jsonl`.
* [ ] Add artifact directory.
* [ ] Add session list/read APIs.

Done when:

* [ ] A fake consult can write a complete session.
* [ ] `browser-session <id>` can read it.
* [ ] `browser-list` can list sessions.

---

## Task 3: File policy and prompt assembler

```yaml
id: chatgpt-browser-prompt-assembler
priority: P0
```

Checklist:

* [ ] Implement file allowlist.
* [ ] Implement denied paths.
* [ ] Implement path traversal block.
* [ ] Implement inline file rendering.
* [ ] Implement max inline chars.
* [ ] Implement dry-run preview.
* [ ] Add tests.

Done when:

* [ ] Allowed files are included.
* [ ] `.env` is rejected.
* [ ] Dry-run shows exactly what would be sent.

---

## Task 4: Oracle provider wrapper

```yaml
id: chatgpt-browser-oracle-provider
priority: P0
```

Checklist:

* [ ] Detect `oracle` CLI.
* [ ] Map repo-harness input to Oracle flags.
* [ ] Support `--engine browser`.
* [ ] Support `--browser-manual-login`.
* [ ] Support model.
* [ ] Support thinking.
* [ ] Support files.
* [ ] Support follow-ups.
* [ ] Support write-output.
* [ ] Parse Oracle session ID.
* [ ] Import Oracle session artifacts.
* [ ] Normalize result.

Done when:

* [ ] `browser-consult --provider oracle` returns a repo-harness session.
* [ ] Result can be read with `browser-session`.

---

## Task 5: MCP tools

```yaml
id: chatgpt-browser-mcp-tools
priority: P1
```

Checklist:

* [ ] Add `run_chatgpt_browser_consult`.
* [ ] Add `read_chatgpt_browser_session`.
* [ ] Add `list_chatgpt_browser_sessions`.
* [ ] Add `continue_chatgpt_browser_session`.
* [ ] Require explicit `--enable-chatgpt-browser`.
* [ ] Return structuredContent.
* [ ] Add safety warning in tool description.

Done when:

* [ ] Codex can call the tool through repo-harness MCP.
* [ ] Tool saves local session and returns output.

---

## Task 6: Codex Skill

```yaml
id: chatgpt-browser-codex-skill
priority: P1
```

Checklist:

* [ ] Create Skill template.
* [ ] Explain browser engine.
* [ ] Explain no API key.
* [ ] Explain login handling.
* [ ] Explain security rules.
* [ ] Explain common consult recipes.
* [ ] Add install command.

Done when:

* [ ] Skill installs into `.agents/skills/repo-harness-chatgpt-browser/`.
* [ ] Codex can use it to run a consult and read the result.

---

## Task 7: Native browser spike

```yaml
id: chatgpt-browser-native-spike
priority: P2
```

Checklist:

* [ ] Add Playwright dependency or adapter.
* [ ] Launch persistent profile.
* [ ] Open ChatGPT.
* [ ] Detect login.
* [ ] Find composer.
* [ ] Paste prompt.
* [ ] Send prompt.
* [ ] Wait for answer.
* [ ] Extract latest assistant text.
* [ ] Save session.
* [ ] Add manual smoke notes.

Done when:

* [ ] Native provider can run `Reply exactly OK`.
* [ ] Transcript is saved.
* [ ] Known selector fragility is documented.

---

# 37. 最终建议

先不要一上来重写完整 browser automation。最佳路线是：

```text
第一步：
  做 repo-harness browser engine 的 CLI / session store / file policy / MCP interface。

第二步：
  provider 先接 Oracle。
  这样马上能验证“本地调用网页登录 ChatGPT 并拿回结果”。

第三步：
  等 workflow 稳定后，再做 native Playwright provider。
```

最终产品边界应该是：

```text
repo-harness chatgpt browser-consult
  = 本地发起 ChatGPT Web 会话，保存结果，返回 sessionId/output

repo-harness mcp run_chatgpt_browser_consult
  = 让 Codex/agent 可以请求 ChatGPT Web 做规划或评审

repo-harness session store
  = 本地 source of truth

ChatGPT Web conversation
  = 用户账号里的真实网页会话，但不是 repo-harness 的唯一记录
```

这条路线比 ChatGPT Connector 更适合你的当前需求，因为它不需要 ChatGPT Developer Mode，也不需要 OpenAI API key；但它会更依赖网页 UI 稳定性，所以必须用 **manual login、dry-run、session store、reattach、diagnostics、严格文件 policy** 来把风险包住。

[1]: https://github.com/steipete/oracle/blob/main/docs/browser-mode.md "oracle/docs/browser-mode.md at main · steipete/oracle · GitHub"
[2]: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt?utm_source=chatgpt.com "Developer mode and MCP apps in ChatGPT"
[3]: https://github.com/steipete/oracle/blob/main/docs/bridge.md "oracle/docs/bridge.md at main · steipete/oracle · GitHub"
[4]: https://github.com/steipete/oracle/blob/main/CHANGELOG.md?utm_source=chatgpt.com "CHANGELOG.md - steipete/oracle"
[5]: https://developers.openai.com/codex/skills?utm_source=chatgpt.com "Agent Skills – Codex"
[6]: https://github.com/steipete/oracle "GitHub - steipete/oracle: Ask the oracle when you're stuck. Invoke GPT-5 Pro with a custom context and files. · GitHub"
[7]: https://github.com/steipete/oracle/blob/main/docs/manual-tests.md "oracle/docs/manual-tests.md at main · steipete/oracle · GitHub"

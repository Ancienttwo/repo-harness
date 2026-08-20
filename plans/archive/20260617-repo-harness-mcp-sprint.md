# Sprint: repo-harness ChatGPT MCP Connector MVP

## 0. Metadata

```yaml
id: sprint-repo-harness-chatgpt-mcp-connector-mvp
status: active
prd: plans/prds/20260617-repo-harness-mcp-prd.md
target_branch: codex/repo-harness-mcp-connector
primary_agent: codex
secondary_agent: chatgpt-planner
risk_level: medium
default_profile: planner
```

## 1. Sprint Goal

Build the MVP for an internal `repo-harness` MCP sidecar that lets ChatGPT Connector act as a safe planner/reviewer for a repo-harness adopted repository, while Codex remains the executor.

The sprint should deliver:

* `repo-harness mcp serve`
* read-only workflow tools
* planning writer tools
* ChatGPT setup guide generation
* Codex MCP config helper
* Codex Skill installation
* idea -> PRD -> checklist Sprint -> Codex Goal chain
* security guardrails
* tests and manual E2E checklist

The MVP must **not** expose arbitrary shell, direct source-code editing, or automatic `codex exec` orchestration by default.

---

## 2. Non-goals

Do not implement these in this sprint:

* [x] Do not make ChatGPT Web Pro available as a Codex model.
* [x] Do not implement general-purpose local filesystem MCP access.
* [x] Do not expose `run_shell` as a public MCP tool.
* [x] Do not allow ChatGPT to modify application source files through MCP.
* [x] Do not implement default `run_codex_goal` / `codex exec` runner.
* [x] Do not automate ChatGPT login, 2FA, admin approval, or browser account actions.
* [x] Do not store OpenAI, ChatGPT, Codex, tunnel, OAuth, or workspace secrets in git.

---

## 3. Definition of Done

The sprint is complete when all of the following are true:

* [x] `repo-harness mcp serve --transport stdio --profile planner` starts successfully.
* [x] `repo-harness mcp serve --transport http --port 8765 --profile planner` starts successfully.
* [x] HTTP server exposes `/health`.
* [x] HTTP server exposes `/mcp`.
* [x] MCP server exposes safe read-only tools.
* [x] MCP server exposes planning-only write tools.
* [x] Planner profile cannot read denied paths.
* [x] Planner profile cannot write application source files.
* [x] `repo-harness mcp doctor --repo .` reports actionable setup status.
* [x] `repo-harness mcp setup chatgpt --repo .` generates local config and manual setup guide.
* [x] `repo-harness mcp setup codex --repo . --scope project` safely patches `.codex/config.toml`.
* [x] `repo-harness mcp install-skill --repo .` installs the Codex Skill.
* [x] MCP exposes `write_prd_from_idea`.
* [x] MCP exposes `write_checklist_sprint` with per-task staging gates.
* [x] MCP exposes `prepare_codex_goal_from_sprint`.
* [x] `repo-harness mcp prepare-goal --repo . --prd <prd> --sprint <sprint>` writes `.ai/harness/handoff/codex-goal.md` and prints a host-native `/goal` prompt.
* [x] Unit tests cover path policy, writes, redaction, and config patching.
* [x] Manual E2E has been run on a sample repo.
* [x] `.gitignore` prevents local MCP secrets and audit logs from being committed.
* [x] README or generated guide explains the ChatGPT Connector setup flow.
* [x] No secrets, local tokens, tunnel URLs, OAuth passphrases, or user auth files are committed.

---

## 4. Agent Operating Rules

Agents working on this sprint must follow these rules:

* [x] Prefer small, reviewable changes.
* [x] Preserve existing CLI style and command registration patterns.
* [x] Do not rewrite unrelated repo-harness architecture.
* [x] Do not introduce source-code editing through MCP in MVP.
* [x] Do not bypass repo-harness workflow files.
* [x] Add tests with each functional module where practical.
* [x] Keep generated local secrets out of git.
* [x] Update this sprint checklist as work completes.
* [x] If blocked, write a blocker note under `.ai/harness/handoff/`.

---

## 5. Expected User Workflow

### 5.1 ChatGPT Planner Flow

User runs locally:

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --port 8765 --profile planner
```

User exposes local server through a tunnel, then adds the `/mcp` endpoint in ChatGPT Connector.

In ChatGPT:

```text
Use repo-harness to inspect this repo.
Create a PRD for <feature>.
Do not edit source code.
Write the PRD, convert it to a checklist Sprint, and prepare a Codex goal prompt.
```

Expected written artifacts:

```text
plans/prds/<feature>.prd.md
plans/sprints/<feature>.sprint.md
.ai/harness/handoff/codex-goal.md
```

### 5.2 Codex Executor Flow

User runs:

```bash
repo-harness mcp setup codex --repo . --scope project
codex
```

Then in Codex:

```text
Use repo-harness-chatgpt-bridge.
Execute the latest ChatGPT-generated Codex goal.
```

Codex reads:

```text
.ai/harness/handoff/codex-goal.md
plans/prds/<feature>.prd.md
docs/spec.md
tasks/current.md
.ai/harness/handoff/resume.md
```

Codex then implements, runs checks, writes review evidence, and updates handoff.

Local CLI equivalent for Sprint to Goal:

```bash
repo-harness mcp prepare-goal --repo . --prd plans/prds/<feature>.prd.md --sprint plans/sprints/<feature>.sprint.md --reference-repo <optional-readonly-reference>
```

---

# Sprint Backlog

## Epic A: Discovery and Baseline

### A1. Inspect existing CLI architecture

* [x] Inspect `src/cli/index.ts`.
* [x] Inspect existing command builders under `src/cli/commands/`.
* [x] Inspect `run`, `tools`, `brain`, `docs`, `install`, and `adopt` command patterns.
* [x] Identify current test runner and test layout.
* [x] Identify package manager and script commands.
* [x] Confirm how repo root is resolved today.
* [x] Confirm how repo-harness adopted state is detected today.
* [x] Confirm how helper scripts are invoked today.

Acceptance criteria:

* [x] Agent has a short implementation note in `.ai/harness/handoff/mcp-discovery.md`.
* [x] Note includes command registration pattern.
* [x] Note includes preferred test command.
* [x] Note includes risk notes for path handling and config patching.

---

## Epic B: CLI Command Scaffold

### B1. Add `repo-harness mcp` command group

Likely files:

```text
src/cli/commands/mcp.ts
src/cli/index.ts
```

Tasks:

* [x] Create `buildMcpCommand()`.
* [x] Add top-level `mcp` command.
* [x] Register `mcp` in CLI entrypoint.
* [x] Add `mcp --help`.
* [x] Add `mcp serve --help`.
* [x] Add `mcp doctor --help`.
* [x] Add `mcp setup --help`.
* [x] Add `mcp install-skill --help`.

Initial command shape:

```bash
repo-harness mcp serve
repo-harness mcp doctor
repo-harness mcp setup chatgpt
repo-harness mcp setup codex
repo-harness mcp install-skill
repo-harness mcp print-chatgpt-guide
```

Acceptance criteria:

* [x] `repo-harness mcp --help` works.
* [x] `repo-harness mcp serve --help` works.
* [x] `repo-harness mcp doctor --help` works.
* [x] Invalid subcommands produce useful errors.
* [x] No existing CLI command behavior regresses.

---

## Epic C: Policy, Paths, and Security Core

### C1. Implement policy model

Likely files:

```text
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
src/cli/mcp/types.ts
```

Tasks:

* [x] Define `McpProfileName`.
* [x] Define `McpPolicy`.
* [x] Define planner profile.
* [x] Define executor profile.
* [x] Define future orchestrator profile but keep disabled.
* [x] Add read allowlist globs.
* [x] Add write allowlist globs.
* [x] Add deny globs.
* [x] Add max file size limit.
* [x] Add path traversal prevention.
* [x] Add symlink escape prevention.
* [x] Add repo-root confinement.
* [x] Add normalized POSIX-style path matching.

Planner read allowlist:

```text
AGENTS.md
CLAUDE.md
SKILL.md
docs/spec.md
docs/reference-configs/**
plans/**
tasks/current.md
tasks/contracts/**
tasks/reviews/**
tasks/notes/**
.ai/context/**
.ai/harness/handoff/**
.ai/harness/checks/**
```

Planner write allowlist:

```text
plans/prds/**
plans/sprints/**
plans/plan-*.md
.ai/harness/handoff/codex-goal.md
.ai/harness/handoff/chatgpt-plan.md
```

Default denied paths:

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
.cache/**
.DS_Store
```

Acceptance criteria:

* [x] Allowed workflow files can be read.
* [x] Denied files cannot be read.
* [x] Files outside repo root cannot be read.
* [x] Symlink escape is blocked.
* [x] Planner writes are restricted to planning/handoff files.
* [x] Planner cannot write `src/**`, `app/**`, `packages/**`, `package.json`, lockfiles, or CI config.

---

### C2. Add redaction helpers

Likely files:

```text
src/cli/mcp/redaction.ts
```

Tasks:

* [x] Add basic secret-like pattern redaction.
* [x] Redact obvious API keys.
* [x] Redact bearer tokens.
* [x] Redact private key blocks.
* [x] Redact OAuth-style tokens.
* [x] Apply redaction to tool output errors.
* [x] Avoid storing raw sensitive content in audit logs.

Acceptance criteria:

* [x] Tool outputs do not expose redacted patterns.
* [x] Errors do not print full local secret values.
* [x] Audit log stores hashes or metadata, not raw prompts/secrets.

---

### C3. Add audit log

Likely files:

```text
src/cli/mcp/audit.ts
```

Tasks:

* [x] Create `.ai/harness/mcp/` when needed.
* [x] Write `.ai/harness/mcp/audit.log`.
* [x] Log timestamp.
* [x] Log tool name.
* [x] Log target path when applicable.
* [x] Log result status.
* [x] Log input hash instead of raw input.
* [x] Redact errors.
* [x] Ensure audit log path is gitignored.

Acceptance criteria:

* [x] Read tools can log access metadata.
* [x] Write tools log writes.
* [x] No raw secret content appears in audit log.
* [x] Audit logging failure does not crash normal tool execution.

---

## Epic D: MCP Server Core

### D1. Add MCP server factory

Likely files:

```text
src/cli/mcp/server.ts
src/cli/mcp/instructions.ts
```

Tasks:

* [x] Add MCP server construction.
* [x] Add server name.
* [x] Add server version.
* [x] Add server instructions.
* [x] Register read-only tools.
* [x] Register write tools.
* [x] Apply profile filtering.
* [x] Add structured error handling.
* [x] Add JSON-safe outputs.
* [x] Add tests or smoke tests for server creation.

Server instruction text should communicate:

```text
repo-harness exposes repo-local workflow artifacts, not general filesystem access.
Use it to read product intent, plans, contracts, checks, reviews, and handoff.
For ChatGPT, act as planner/reviewer: write PRDs, sprints, plans, and Codex goal prompts.
Do not edit application source through this server. Codex is the executor.
Before writing a plan, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans.
```

Acceptance criteria:

* [x] Server can be created with planner profile.
* [x] Server can be created with executor profile.
* [x] Server rejects unknown profile.
* [x] Tool list changes according to profile.
* [x] Instructions are present and concise.

---

### D2. Implement STDIO transport

Likely files:

```text
src/cli/mcp/transports/stdio.ts
```

Tasks:

* [x] Add `--transport stdio`.
* [x] Wire MCP server to STDIO transport.
* [x] Suppress noisy logs on stdout.
* [x] Send operational logs to stderr.
* [x] Ensure process exits cleanly.
* [x] Add smoke test or manual test command.

Command:

```bash
repo-harness mcp serve --repo . --transport stdio --profile planner
```

Acceptance criteria:

* [x] STDIO transport starts.
* [x] STDIO transport works with local MCP-compatible clients.
* [x] No human-readable logs corrupt JSON-RPC stdout.
* [x] Errors are printed to stderr.

---

### D3. Implement HTTP transport

Likely files:

```text
src/cli/mcp/transports/http.ts
```

Tasks:

* [x] Add `--transport http`.
* [x] Add `--host`.
* [x] Add `--port`.
* [x] Add `/health`.
* [x] Add `/mcp`.
* [x] Bind to `127.0.0.1` by default.
* [x] Avoid binding to `0.0.0.0` unless explicitly requested.
* [x] Add basic request size limit.
* [x] Add graceful shutdown.
* [x] Add CORS behavior only if needed.
* [x] Add useful startup output.

Command:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Acceptance criteria:

* [x] `curl http://127.0.0.1:8765/health` returns healthy JSON.
* [x] `/mcp` endpoint is available.
* [x] Default host is localhost.
* [x] Startup message includes local endpoint.
* [x] Startup message does not print secrets.

---

## Epic E: Read-only MCP Tools

### E1. `harness_status`

Tasks:

* [x] Implement `harness_status`.
* [x] Return repo root.
* [x] Return adopted state.
* [x] Return available workflow roots.
* [x] Return active profile.
* [x] Return current git branch when available.
* [x] Mark as read-only.

Acceptance criteria:

* [x] Tool works in adopted repo.
* [x] Tool returns useful error in non-adopted repo.
* [x] Tool does not leak denied paths.

---

### E2. `harness_doctor`

Tasks:

* [x] Implement `harness_doctor`.
* [x] Reuse existing doctor logic if available.
* [x] Return structured JSON.
* [x] Mark as read-only.
* [x] Redact local paths if needed only for remote clients.

Acceptance criteria:

* [x] Tool returns pass/warn/fail sections.
* [x] Tool handles missing repo-harness artifacts.
* [x] Tool output is compact enough for model consumption.

---

### E3. `list_workflow_files`

Tasks:

* [x] Implement allowlist-based workflow file listing.
* [x] Include relative paths.
* [x] Include file size.
* [x] Include modified time if simple.
* [x] Exclude denied paths.
* [x] Exclude files above configured max size.
* [x] Mark as read-only.

Acceptance criteria:

* [x] Lists `docs/spec.md` when present.
* [x] Lists `plans/**` when present.
* [x] Lists `.ai/harness/handoff/**` when present.
* [x] Does not list `.env`.
* [x] Does not list `.git/**`.

---

### E4. `read_workflow_file`

Tasks:

* [x] Implement file read by relative path.
* [x] Enforce allowlist.
* [x] Enforce denylist.
* [x] Enforce max file size.
* [x] Normalize path.
* [x] Block `../`.
* [x] Block symlink escape.
* [x] Redact output.
* [x] Mark as read-only.

Acceptance criteria:

* [x] Can read `docs/spec.md`.
* [x] Can read files under `plans/`.
* [x] Can read `.ai/harness/handoff/resume.md`.
* [x] Cannot read `.env`.
* [x] Cannot read `../outside`.
* [x] Cannot read symlink to outside repo.

---

### E5. `latest_handoff`

Tasks:

* [x] Implement latest handoff discovery.
* [x] Prefer `.ai/harness/handoff/resume.md`.
* [x] Include `codex-goal.md` status.
* [x] Include `chatgpt-plan.md` status.
* [x] Return concise summary.
* [x] Mark as read-only.

Acceptance criteria:

* [x] Tool works when handoff exists.
* [x] Tool gives useful empty state when missing.
* [x] Tool does not fail if optional files are absent.

---

### E6. `latest_checks`

Tasks:

* [x] Implement checks summary.
* [x] Read `.ai/harness/checks/**`.
* [x] Return latest check files.
* [x] Include timestamps and relative paths.
* [x] Mark as read-only.

Acceptance criteria:

* [x] Tool works with no check files.
* [x] Tool returns latest check artifacts when present.
* [x] Tool output stays concise.

---

## Epic F: Planning Writer Tools

### F1. `write_prd`

Tasks:

* [x] Implement PRD writer.
* [x] Accept title.
* [x] Accept slug.
* [x] Accept markdown body.
* [x] Slugify filename.
* [x] Write to strict-compatible `plans/prds/<YYYYMMDD>-<HHMM>-<slug>.prd.md`.
* [x] Create directory if needed.
* [x] Prevent overwrite by default.
* [x] Support explicit overwrite flag.
* [x] Add frontmatter.
* [x] Audit write.
* [x] Run content validation.

Input shape:

```json
{
  "title": "Add GitHub OAuth Login",
  "slug": "github-oauth-login",
  "body": "...",
  "overwrite": false
}
```

Acceptance criteria:

* [x] Valid PRD writes to `plans/prds/*.prd.md`.
* [x] Invalid path is rejected.
* [x] Overwrite is blocked by default.
* [x] Audit log records write.
* [x] Output returns relative path and status.

---

### F2. `write_sprint`

Tasks:

* [x] Implement sprint writer.
* [x] Accept title.
* [x] Accept slug.
* [x] Accept markdown body.
* [x] Write to `plans/sprints/<slug>.sprint.md`.
* [x] Create directory if needed.
* [x] Prevent overwrite by default.
* [x] Add frontmatter.
* [x] Audit write.

Acceptance criteria:

* [x] Valid sprint writes to `plans/sprints/*.sprint.md`.
* [x] Overwrite requires explicit flag.
* [x] Planner profile can write sprint.
* [x] Planner profile cannot write outside `plans/sprints/**`.

---

### F3. `write_plan`

Tasks:

* [x] Implement implementation plan writer.
* [x] Accept title.
* [x] Accept slug.
* [x] Accept markdown body.
* [x] Write to `plans/plan-<slug>.md`.
* [x] Prevent overwrite by default.
* [x] Add frontmatter.
* [x] Audit write.

Acceptance criteria:

* [x] Writes only `plans/plan-*.md`.
* [x] Rejects nested arbitrary paths.
* [x] Output includes relative path.

---

### F4. `write_codex_goal`

Tasks:

* [x] Implement Codex goal writer.
* [x] Write only `.ai/harness/handoff/codex-goal.md`.
* [x] Accept markdown body.
* [x] Validate required sections.
* [x] Prevent empty or tiny goals.
* [x] Include source-of-truth references.
* [x] Include scope.
* [x] Include required checks.
* [x] Include done criteria.
* [x] Include handoff update requirement.
* [x] Audit write.

Required sections:

```text
# Codex Goal
## Source of truth
## Role
## Scope
## Required workflow
## Required checks
## Done when
```

Acceptance criteria:

* [x] Valid goal writes successfully.
* [x] Missing required sections are rejected with actionable error.
* [x] Goal path is fixed and cannot be changed by model input.
* [x] Audit log records write.

---

### F5. `append_handoff_note`

Tasks:

* [x] Implement handoff note appender.
* [x] Append to `.ai/harness/handoff/chatgpt-plan.md`.
* [x] Add timestamp header.
* [x] Add actor field.
* [x] Add concise note body.
* [x] Audit write.

Acceptance criteria:

* [x] Notes append without overwriting existing content.
* [x] Notes are timestamped.
* [x] Notes remain inside allowed handoff path.

---

### F6. `run_workflow_check`

Tasks:

* [x] Implement fixed workflow check runner.
* [x] Do not expose arbitrary command input.
* [x] Run existing repo-harness workflow check helper.
* [x] Capture stdout/stderr.
* [x] Redact output.
* [x] Return exit code.
* [x] Apply timeout.
* [x] Audit execution.

Allowed command should be fixed, for example:

```bash
repo-harness run check-task-workflow -- --strict
```

Acceptance criteria:

* [x] Tool runs only the fixed workflow check.
* [x] Tool does not accept arbitrary shell.
* [x] Tool returns structured success/failure.
* [x] Timeout is enforced.

---

## Epic G: ChatGPT Setup Automation

### G1. Local MCP config generation

Likely files:

```text
src/cli/mcp/setup/chatgpt.ts
src/cli/mcp/config.ts
```

Tasks:

* [x] Create `.repo-harness/` if missing.
* [x] Generate `.repo-harness/mcp.local.json`.
* [x] Generate auth passphrase or token if selected.
* [x] Store secret only in local ignored file or environment instruction.
* [x] Add `.repo-harness/mcp.local.json` to `.gitignore`.
* [x] Add `.repo-harness/mcp.tokens.json` to `.gitignore`.
* [x] Add `.repo-harness/mcp.oauth.json` to `.gitignore`.
* [x] Add `.repo-harness/mcp.oauth-tokens.json` to `.gitignore`.
* [x] Add `.ai/harness/mcp/audit.log` to `.gitignore`.
* [x] Print next-step commands.

Command:

```bash
repo-harness mcp setup chatgpt --repo .
```

Acceptance criteria:

* [x] Setup creates local config.
* [x] Setup does not commit secrets.
* [x] Setup prints server start command.
* [x] Setup prints tunnel instruction.
* [x] Setup prints guide path.

---

### G2. Generate ChatGPT manual guide

Likely files:

```text
src/cli/mcp/setup/guide.ts
docs/repo-harness-chatgpt-mcp-setup.md
```

Tasks:

* [x] Generate `docs/repo-harness-chatgpt-mcp-setup.md`.
* [x] Include prerequisites.
* [x] Include server start command.
* [x] Include tunnel example.
* [x] Include ChatGPT Connector steps.
* [x] Include test prompt.
* [x] Include PRD-generation prompt.
* [x] Include Codex handoff prompt.
* [x] Include troubleshooting.
* [x] Include security notes.
* [x] Avoid embedding secrets in guide.

Acceptance criteria:

* [x] Guide is generated.
* [x] Guide is safe to commit.
* [x] Guide includes copy-paste commands.
* [x] Guide clearly marks manual ChatGPT UI steps.

---

### G3. `print-chatgpt-guide`

Tasks:

* [x] Add command:

```bash
repo-harness mcp print-chatgpt-guide --repo .
```

* [x] Print the same instructions to stdout.
* [x] Support `--write` to write guide file.
* [x] Support `--endpoint <url>` to include known tunnel endpoint.
* [x] Do not print auth secret unless explicit `--show-secret` is provided.
* [x] Prefer not to implement `--show-secret` unless necessary.

Acceptance criteria:

* [x] Command works without tunnel.
* [x] Command works with provided endpoint.
* [x] Output is usable as human tutorial.

---

## Epic H: Codex Setup Automation

### H1. Patch `.codex/config.toml`

Likely files:

```text
src/cli/mcp/setup/codex.ts
src/cli/mcp/setup/toml.ts
```

Tasks:

* [x] Detect existing `.codex/config.toml`.
* [x] Create `.codex/` if missing.
* [x] Preserve unrelated config.
* [x] Add or update `[mcp_servers.repo_harness]`.
* [x] Use STDIO by default.
* [x] Add `enabled_tools`.
* [x] Add approval mode.
* [x] Create backup before patching.
* [x] Support `--dry-run`.
* [x] Support `--scope project`.
* [x] Optionally support `--scope user` later.

Default config:

```toml
[mcp_servers.repo_harness]
command = "repo-harness"
args = [
  "mcp",
  "serve",
  "--repo",
  ".",
  "--transport",
  "stdio",
  "--profile",
  "executor"
]
enabled_tools = [
  "harness_status",
  "read_workflow_file",
  "latest_handoff",
  "latest_checks",
  "write_codex_goal",
  "run_workflow_check"
]
default_tools_approval_mode = "prompt"
```

Acceptance criteria:

* [x] `.codex/config.toml` is created if absent.
* [x] Existing config is preserved.
* [x] Backup is created before modification.
* [x] Dry run prints planned patch.
* [x] Config uses relative repo path when safe.
* [x] No secrets are written.

---

### H2. Validate Codex setup

Tasks:

* [x] Add Codex checks to `mcp doctor`.
* [x] Check `codex` command availability.
* [x] Check `.codex/config.toml` presence.
* [x] Check `repo_harness` MCP server entry.
* [x] Check required enabled tools.
* [x] Provide next-step command.

Acceptance criteria:

* [x] Doctor reports Codex configured/unconfigured.
* [x] Doctor provides exact fix command.
* [x] Doctor does not fail if Codex is not installed.

---

## Epic I: Codex Skill

### I1. Add Skill template

Likely files:

```text
src/cli/mcp/skill/templates/SKILL.md
src/cli/mcp/skill/templates/references/chatgpt-connector-manual.md
src/cli/mcp/skill/templates/references/workflow.md
```

Tasks:

* [x] Create Skill template.
* [x] Include frontmatter.
* [x] Define when to use.
* [x] Define planner/executor boundary.
* [x] Define setup behavior.
* [x] Define execution behavior.
* [x] Define computer-use safety rules.
* [x] Define handoff update requirements.
* [x] Define secrets handling rules.

Skill frontmatter:

```markdown
---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, sprints, checks, and handoffs.
---
```

Acceptance criteria:

* [x] Skill has clear trigger description.
* [x] Skill tells Codex to read `codex-goal.md`.
* [x] Skill tells Codex not to handle secrets.
* [x] Skill tells Codex not to automate ChatGPT login unless explicitly requested.
* [x] Skill tells Codex to update review evidence and handoff.

---

### I2. Add `install-skill` command

Tasks:

* [x] Add command:

```bash
repo-harness mcp install-skill --repo .
```

* [x] Install to:

```text
.agents/skills/repo-harness-chatgpt-bridge/
```

* [x] Create directories if needed.
* [x] Preserve existing skill unless `--overwrite`.
* [x] Support `--dry-run`.
* [x] Print installed files.

Acceptance criteria:

* [x] Skill installs into repo.
* [x] Existing skill is not overwritten by default.
* [x] Dry run works.
* [x] No secrets are written.

---

### I3. Computer-use assisted setup instructions

Tasks:

* [x] Add a reference doc for optional computer-use assisted setup.
* [x] Clearly mark as experimental.
* [x] Require user confirmation for browser/account actions.
* [x] Instruct agent not to type passwords.
* [x] Instruct agent not to type 2FA codes.
* [x] Instruct agent not to approve workspace/admin prompts without user confirmation.
* [x] Instruct agent to stop before final connector creation if unsure.
* [x] Include manual fallback path.

Acceptance criteria:

* [x] Skill supports assisted setup safely.
* [x] Skill does not imply full automation is guaranteed.
* [x] Manual path remains primary.

---

## Epic J: `mcp doctor`

### J1. Implement doctor command

Likely files:

```text
src/cli/mcp/doctor.ts
```

Command:

```bash
repo-harness mcp doctor --repo .
```

Tasks:

* [x] Check git repo.
* [x] Check repo-harness adoption.
* [x] Check `docs/spec.md`.
* [x] Check `plans/`.
* [x] Check `tasks/`.
* [x] Check `.ai/context/`.
* [x] Check `.ai/harness/handoff/`.
* [x] Check `.ai/harness/checks/`.
* [x] Check local MCP config.
* [x] Check `.gitignore` entries.
* [x] Check Codex config.
* [x] Check Skill installation.
* [x] Check HTTP server if `--endpoint` is passed.
* [x] Print human-readable output by default.
* [x] Support `--json`.

Example JSON shape:

```json
{
  "status": "needs_chatgpt_connector",
  "repo": "/path/to/repo",
  "mcp": {
    "config": "present",
    "planner_profile": "valid"
  },
  "chatgpt": {
    "local_endpoint": "http://127.0.0.1:8765/mcp",
    "public_endpoint": null,
    "manual_steps_required": true
  },
  "codex": {
    "configured": true,
    "skill_installed": true
  },
  "warnings": [
    "ChatGPT requires an HTTPS tunnel before connector setup."
  ]
}
```

Acceptance criteria:

* [x] Human output is readable.
* [x] JSON output is machine-readable.
* [x] Warnings include exact next command.
* [x] Doctor does not require server to be running unless endpoint check requested.

---

## Epic K: Tests

### K1. Unit tests: path policy

Tasks:

* [x] Test allowed read path.
* [x] Test denied read path.
* [x] Test path traversal.
* [x] Test symlink escape.
* [x] Test allowed write path.
* [x] Test denied source write.
* [x] Test max file size.
* [x] Test slug generation.

Acceptance criteria:

* [x] All policy tests pass.
* [x] Tests cover Unix-style and platform-native path separators.

---

### K2. Unit tests: writer tools

Tasks:

* [x] Test `write_prd`.
* [x] Test `write_sprint`.
* [x] Test `write_plan`.
* [x] Test `write_codex_goal`.
* [x] Test overwrite prevention.
* [x] Test validation error messages.
* [x] Test audit entries.

Acceptance criteria:

* [x] Writer tools only write allowed paths.
* [x] Invalid inputs produce actionable errors.
* [x] Audit log is written without secrets.

---

### K3. Unit tests: config patching

Tasks:

* [x] Test new `.codex/config.toml`.
* [x] Test patch existing config.
* [x] Test preserve unrelated config.
* [x] Test backup creation.
* [x] Test dry run.
* [x] Test repeated setup idempotency.

Acceptance criteria:

* [x] Running setup twice does not duplicate config.
* [x] Existing config remains valid.
* [x] Dry run does not write files.

---

### K4. Integration tests: server

Tasks:

* [x] Start STDIO server smoke test.
* [x] Start HTTP server smoke test.
* [x] Check `/health`.
* [x] Check MCP tool listing if test harness supports it.
* [x] Call read-only tool.
* [x] Call writer tool against temp repo.
* [x] Verify denied paths remain blocked.

Acceptance criteria:

* [x] HTTP server starts and stops cleanly.
* [x] STDIO server does not print logs to stdout.
* [x] Tool calls work in temp repo.

---

### K5. Manual E2E test

Use a disposable repo.

Steps:

* [x] Create or select sample repo.
* [x] Run `repo-harness adopt --repo .` if needed.
* [x] Run `repo-harness mcp setup chatgpt --repo .`.
* [x] Run `repo-harness mcp setup codex --repo . --scope project`.
* [x] Run `repo-harness mcp install-skill --repo .`.
* [x] Start HTTP MCP server.
* [x] Start tunnel manually.
* [x] Add ChatGPT Connector manually.
* [x] Ask ChatGPT to call `harness_status`.
* [x] Ask ChatGPT to read latest handoff.
* [x] Ask ChatGPT to write a test PRD.
* [x] Ask ChatGPT to write Codex goal.
* [x] Open Codex.
* [x] Ask Codex to use the Skill and read latest goal.
* [x] Confirm Codex can follow goal.
* [x] Confirm review evidence and handoff are updated.

Acceptance criteria:

* [x] ChatGPT can read workflow state.
* [x] ChatGPT can write PRD.
* [x] ChatGPT can write Codex goal.
* [x] Codex can consume the goal.
* [x] No source files are modified by ChatGPT MCP tools.
* [x] No secrets appear in logs.

---

## Epic L: Documentation

### L1. Add generated setup guide content

Tasks:

* [x] Add guide template.
* [x] Include setup commands.
* [x] Include ChatGPT Connector manual steps.
* [x] Include tunnel explanation.
* [x] Include test prompts.
* [x] Include common errors.
* [x] Include security warnings.
* [x] Include fallback workflow when ChatGPT MCP is unavailable.

Acceptance criteria:

* [x] Guide can be generated by CLI.
* [x] Guide can be committed safely.
* [x] Guide is enough for manual setup without reading source code.

---

### L2. Add README section or docs link

Tasks:

* [x] Add short README mention.
* [x] Link to generated guide.
* [x] Explain planner/executor split.
* [x] Explain that ChatGPT does not execute code in MVP.
* [x] Explain Codex remains executor.
* [x] Explain MCP support depends on user ChatGPT workspace availability.

Acceptance criteria:

* [x] README update is concise.
* [x] README does not overpromise automatic ChatGPT configuration.
* [x] README positions MCP as optional sidecar.

---

## Epic M: Release Hygiene

### M1. Git hygiene

Tasks:

* [x] Ensure `.repo-harness/mcp.local.json` is ignored.
* [x] Ensure `.repo-harness/mcp.tokens.json` is ignored.
* [x] Ensure `.repo-harness/mcp.oauth.json` is ignored.
* [x] Ensure `.repo-harness/mcp.oauth-tokens.json` is ignored.
* [x] Ensure `.ai/harness/mcp/audit.log` is ignored.
* [x] Ensure generated guide does not contain secrets.
* [x] Ensure test fixtures do not contain fake realistic secrets unless redacted.
* [x] Review `git diff` for accidental local paths or tokens.

Acceptance criteria:

* [x] `git status` contains only intended files.
* [x] No local machine secrets or private paths are committed.
* [x] No tunnel URL is committed unless it is clearly placeholder text.

---

### M2. Final validation commands

Run project-appropriate checks. Minimum:

```bash
repo-harness mcp doctor --repo .
repo-harness mcp setup chatgpt --repo . --dry-run
repo-harness mcp setup codex --repo . --scope project --dry-run
repo-harness mcp install-skill --repo . --dry-run
```

Also run the project’s standard checks:

```bash
bun test
bun run typecheck
bun run lint
```

If commands differ, record actual commands in handoff.

Acceptance criteria:

* [x] All available tests pass.
* [x] Typecheck passes.
* [x] Lint passes or known unrelated failures are documented.
* [x] Manual smoke test result is documented.

---

# Implementation Order

Agents should follow this sequence unless blocked:

1. [x] Discovery and baseline.
2. [x] CLI scaffold.
3. [x] Policy and path security.
4. [x] MCP server core.
5. [x] STDIO transport.
6. [x] HTTP transport.
7. [x] Read-only tools.
8. [x] Writer tools.
9. [x] `mcp doctor`.
10. [x] ChatGPT setup and guide generation.
11. [x] Codex config setup.
12. [x] Codex Skill installation.
13. [x] Tests.
14. [x] Documentation.
15. [x] Manual E2E.
16. [x] Final cleanup and handoff.
17. [x] idea -> PRD -> checklist Sprint -> Goal chain.

---

# Agent Task Cards

## Task Card 1: CLI Scaffold

```yaml
id: mcp-cli-scaffold
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Create `src/cli/commands/mcp.ts`.
* [x] Add `buildMcpCommand()`.
* [x] Register command in CLI entrypoint.
* [x] Add subcommands with placeholder actions.
* [x] Verify help output.
* [x] Add basic smoke test if test framework exists.

Done when:

* [x] `repo-harness mcp --help` works.
* [x] `repo-harness mcp serve --help` works.
* [x] Existing commands still work.

---

## Task Card 2: Policy Engine

```yaml
id: mcp-policy-engine
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Implement profile types.
* [x] Implement planner profile.
* [x] Implement executor profile.
* [x] Implement denylist.
* [x] Implement allowlist matching.
* [x] Implement path normalization.
* [x] Implement repo-root confinement.
* [x] Implement symlink escape check.
* [x] Add tests.

Done when:

* [x] Planner can read workflow files.
* [x] Planner cannot read secrets.
* [x] Planner cannot write source files.

---

## Task Card 3: MCP Server Core

```yaml
id: mcp-server-core
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Add server factory.
* [x] Add instructions.
* [x] Register placeholder tools.
* [x] Add STDIO transport.
* [x] Add HTTP transport.
* [x] Add `/health`.
* [x] Add structured errors.

Done when:

* [x] STDIO server starts.
* [x] HTTP server starts.
* [x] `/health` responds.
* [x] Tools are listed by MCP client.

---

## Task Card 4: Read-only Tools

```yaml
id: mcp-read-tools
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Implement `harness_status`.
* [x] Implement `harness_doctor`.
* [x] Implement `list_workflow_files`.
* [x] Implement `read_workflow_file`.
* [x] Implement `latest_handoff`.
* [x] Implement `latest_checks`.
* [x] Add tests.

Done when:

* [x] ChatGPT can inspect workflow state.
* [x] Denied paths remain blocked.
* [x] Outputs are concise and redacted.

---

## Task Card 5: Planning Writer Tools

```yaml
id: mcp-planning-writers
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Implement `write_prd`.
* [x] Implement `write_sprint`.
* [x] Implement `write_plan`.
* [x] Implement `write_codex_goal`.
* [x] Implement `append_handoff_note`.
* [x] Implement `run_workflow_check`.
* [x] Add validation.
* [x] Add audit logging.
* [x] Add tests.

Done when:

* [x] ChatGPT can write PRD.
* [x] ChatGPT can write Codex goal.
* [x] ChatGPT cannot write source files.
* [x] Workflow check can be run through fixed command only.

---

## Task Card 6: ChatGPT Setup

```yaml
id: mcp-chatgpt-setup
priority: P1
status: done
owner: codex
```

Checklist:

* [x] Implement `mcp setup chatgpt`.
* [x] Generate local config.
* [x] Update `.gitignore`.
* [x] Generate guide.
* [x] Print server start command.
* [x] Print tunnel command example.
* [x] Print ChatGPT Connector steps.
* [x] Add dry-run if practical.

Done when:

* [x] User can run one command and receive all local setup artifacts.
* [x] ChatGPT UI steps are documented.
* [x] No secrets are written to tracked files.

---

## Task Card 7: Codex Setup

```yaml
id: mcp-codex-setup
priority: P1
status: done
owner: codex
```

Checklist:

* [x] Implement `mcp setup codex`.
* [x] Create `.codex/config.toml` if missing.
* [x] Preserve existing config.
* [x] Add `repo_harness` MCP server.
* [x] Add backup.
* [x] Add dry-run.
* [x] Add doctor validation.

Done when:

* [x] Project-level Codex MCP config is generated safely.
* [x] Running setup twice is idempotent.
* [x] Existing user config is preserved.

---

## Task Card 8: Codex Skill

```yaml
id: mcp-codex-skill
priority: P1
status: done
owner: codex
```

Checklist:

* [x] Create Skill template.
* [x] Add `SKILL.md`.
* [x] Add manual setup reference.
* [x] Add workflow reference.
* [x] Add computer-use safety rules.
* [x] Implement `install-skill`.
* [x] Add dry-run.
* [x] Add overwrite protection.

Done when:

* [x] Skill installs into `.agents/skills/repo-harness-chatgpt-bridge/`.
* [x] Skill tells Codex how to consume `codex-goal.md`.
* [x] Skill does not encourage unsafe browser automation.

---

## Task Card 9: Doctor and Diagnostics

```yaml
id: mcp-doctor
priority: P1
status: done
owner: codex
```

Checklist:

* [x] Implement repo checks.
* [x] Implement MCP config checks.
* [x] Implement Codex config checks.
* [x] Implement Skill checks.
* [x] Implement guide checks.
* [x] Add `--json`.
* [x] Add actionable next steps.

Done when:

* [x] Doctor explains what is ready.
* [x] Doctor explains what is missing.
* [x] Doctor gives exact commands to fix missing setup.

---

## Task Card 10: Final E2E

```yaml
id: mcp-final-e2e
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Create disposable test repo.
* [x] Adopt repo-harness.
* [x] Run ChatGPT setup.
* [x] Run Codex setup.
* [x] Install Skill.
* [x] Start HTTP MCP server.
* [x] Verify `/health`.
* [x] Connect through local MCP test client if available.
* [x] Manually connect ChatGPT if available.
* [x] Write sample PRD.
* [x] Write sample Codex goal.
* [x] Confirm Codex can read latest goal.
* [x] Run checks.
* [x] Update handoff.

Done when:

* [x] E2E result is documented in `.ai/harness/handoff/mcp-e2e-result.md`.
* [x] Known limitations are documented.
* [x] Sprint checklist is updated.

---

## Task Card 11: Goal Chain Surface

```yaml
id: mcp-goal-chain
priority: P0
status: done
owner: codex
```

Checklist:

* [x] Implement `write_prd_from_idea` for idea -> PRD.
* [x] Implement `write_checklist_sprint` for PRD -> checklist Sprint.
* [x] Implement `prepare_codex_goal_from_sprint` for Sprint -> Goal.
* [x] Implement `repo-harness mcp prepare-goal` as the local CLI equivalent.
* [x] Ensure generated Sprint task cards include checklist items and staging gates.
* [x] Ensure generated Goal uses a language-neutral `/goal` shape with read, worktree execution, stage-before-continue, user-language reporting, and optional reference repo lines.
* [x] Keep direct Codex execution out of MCP; local Codex owns `/goal` execution.
* [x] Add tests for the full chain and CLI handoff.
* [x] Update guide and bridge Skill references.

Done when:

* [x] ChatGPT can move from idea to PRD to checklist Sprint to Codex Goal through MCP tools.
* [x] A local user can run `repo-harness mcp prepare-goal --repo . --prd <prd> --sprint <sprint>` and receive a host-native `/goal` prompt.
* [x] The stage-gate contract is explicit in generated Sprint and Goal artifacts.
* [x] No default `codex exec` or remote runner is exposed.

---

# Required File Outputs

By the end of the sprint, expected new or changed files include:

```text
src/cli/commands/mcp.ts
src/cli/mcp/server.ts
src/cli/mcp/instructions.ts
src/cli/mcp/types.ts
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
src/cli/mcp/redaction.ts
src/cli/mcp/audit.ts
src/cli/mcp/transports/stdio.ts
src/cli/mcp/transports/http.ts
src/cli/mcp/tools/harness-status.ts
src/cli/mcp/tools/harness-doctor.ts
src/cli/mcp/tools/list-workflow-files.ts
src/cli/mcp/tools/read-workflow-file.ts
src/cli/mcp/tools/latest-handoff.ts
src/cli/mcp/tools/latest-checks.ts
src/cli/mcp/tools/write-prd.ts
src/cli/mcp/tools/write-sprint.ts
src/cli/mcp/tools/write-plan.ts
src/cli/mcp/tools/write-codex-goal.ts
src/cli/mcp/tools/append-handoff-note.ts
src/cli/mcp/tools/run-workflow-check.ts
src/cli/mcp/setup/chatgpt.ts
src/cli/mcp/setup/codex.ts
src/cli/mcp/setup/guide.ts
src/cli/mcp/doctor.ts
src/cli/mcp/skill/templates/SKILL.md
src/cli/mcp/skill/templates/references/chatgpt-connector-manual.md
src/cli/mcp/skill/templates/references/workflow.md
```

Potential generated repo files:

```text
docs/repo-harness-chatgpt-mcp-setup.md
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
.agents/skills/repo-harness-chatgpt-bridge/references/chatgpt-connector-manual.md
.agents/skills/repo-harness-chatgpt-bridge/references/workflow.md
```

Local ignored files:

```text
.repo-harness/mcp.local.json
.repo-harness/mcp.tokens.json
.repo-harness/mcp.oauth.json
.repo-harness/mcp.oauth-tokens.json
.ai/harness/mcp/audit.log
```

---

# Final Sprint Review Checklist

Before closing the sprint:

* [x] All P0 task cards are complete.
* [x] P1 task cards are complete or explicitly deferred.
* [x] Tests pass.
* [x] Typecheck passes.
* [x] Lint passes or unrelated failures are documented.
* [x] Local MCP E2E result is documented.
* [x] README/docs are updated.
* [x] Generated guide is safe to commit.
* [x] Codex Skill is safe to commit.
* [x] `.gitignore` covers local MCP config and audit logs.
* [x] No secret-like content appears in git diff.
* [x] No arbitrary shell MCP tool exists.
* [x] No default Codex runner exists.
* [x] ChatGPT planner can only write planning/handoff artifacts.
* [x] Codex executor remains responsible for implementation.
* [x] Handoff files summarize completed work, checks, and the ChatGPT UI manual E2E result.

---

# Sprint Closeout Template

At the end of the sprint, write this to:

```text
.ai/harness/handoff/mcp-connector-sprint-closeout.md
```

```markdown
# Sprint Closeout: repo-harness ChatGPT MCP Connector MVP

## Completed

-

## Not completed

-

## Tests run

-

## Manual E2E result

-

## Security review

- Denied paths tested:
- Source write blocking tested:
- Secrets redaction tested:
- Audit log checked:

## Known limitations

-

## Follow-up sprint candidates

- Enable authenticated HTTP mode hardening
- Add better MCP client test harness
- Add optional tunnel helper
- Add optional orchestrator profile
- Add experimental `run_codex_goal`
- Add richer ChatGPT review tools
- Add generated PRD/sprint templates

## Next recommended task

-
```

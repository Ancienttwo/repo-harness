> **Archived**: 2026-09-04 18:55
> **Related Plan**: plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260904-1855
> **Archive Projection V1**: `plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` => `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Archive Projection V1**: `tasks/notes/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.notes.md` => `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Archive Projection V1**: `tasks/contracts/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.contract.md` => `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Archive Projection V1**: `tasks/reviews/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.review.md` => `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`

# Plan: Sprint task: BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport

> **Status**: Archived
> **Created**: 20260902-2348
> **Slug**: brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`; after execution revert branch `codex/brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Substantive Change SHA256**: `sha256:117898eb6fb02ff73456beb39c3d3b2df1258def8aaa75d5151109e652c7dd3f`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Task Review**: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
> **Implementation Notes**: `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md#BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport
- Due diligence:
  - P1 map: `src/cli/chatgpt-browser` is the whole boundary. `engine.ts` owns
    `browserDoctor`/`runBrowserConsult` and merges the repo-local binding
    (`binding.ts`, `.repo-harness/chatgpt-browser.local.json`) into
    `BrowserConsultInput`; `oracle-provider.ts` owns binary resolution, the help/version
    capability probe, argv construction, and process supervision;
    `session-store.ts` owns the persisted `meta.json`; `types.ts` owns the shared
    contract. `src/cli/commands/chatgpt.ts` and `src/cli/mcp/tools.ts` are thin call
    sites and need no change. Out of scope: the deprecated native CDP provider and
    `REQUIRED_ORACLE_VERSION`.
  - P2 trace: `browser-consult --provider oracle` -> `runBrowserConsult` ->
    `withBrowserBinding` reads the binding and fills `profileDir`/`profileDirectory` ->
    `runOracleProvider` resolves and version-checks the binary -> `buildOracleCommand`
    appends the transport flags -> `runOracleProcess` spawns Oracle in a controlled
    `ORACLE_HOME_DIR` -> the `--write-output` answer file plus exit status decide status
    -> `writeBrowserSession` persists `meta.json`. The pressure point is the single line
    in `buildOracleCommand` that used to append `--browser-cookie-path` from
    `resolveOracleCookiePath`, plus its precheck in `runOracleProvider`.
  - P3 decision rationale: the cookie-DB path existed because it needed no Oracle-side
    profile support, but the probe in
    `docs/researches/20260902-gpt-pro-connector-readback-probe.md` showed it reads a
    locked or half-written SQLite file from a running Chrome and fails silently (1/3
    runs). `--copy-profile` moves the copy into Oracle, where it is the supported path
    (2/2 runs). Both transports coexisting would reintroduce the silent failure, so this
    is a same-package cutover with no fallback: the flag pair is required, the capability
    is required for doctor `ready`, and every unusable state fails closed with its own
    code. At 10x scale the first thing to break is profile selection ambiguity, which is
    why a binding without an explicit `profileDirectory` is rejected instead of letting
    Oracle guess from `Local State` `last_used`.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Sprint contract: `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Sprint review: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Implementation notes: `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`.

## Approach
### Strategy
Cut the bound-profile transport over to `--copy-profile` + `--browser-chrome-profile`
inside `src/cli/chatgpt-browser`, delete the cookie-path derivation in the same
work-package, and make every newly reachable failure state explicit
(`ORACLE_COPY_PROFILE_UNSUPPORTED`, `ORACLE_PROFILE_NOT_FOUND`,
`ORACLE_SESSION_ALREADY_RUNNING`). Extend `tests/cli/chatgpt-browser.test.ts` first so the
transport assertions fail before the source change lands.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep `--browser-cookie-path`, add `--copy-profile` as a fallback | No behavior removed | Two transports means the silent-login failure stays reachable and untestable | Reject |
| Single `--copy-profile` transport, cookie path deleted | One observable transport, fail-closed on every unusable state | A pinned Oracle without the flags stops working instead of degrading | Use |
| Also bump `REQUIRED_ORACLE_VERSION` to 0.18.0 so this machine reports ready | Local doctor turns green | Not in the acceptance line; a version bump is its own compatibility surface | Defer |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/cli/chatgpt-browser/oracle-provider.ts` | Edit | `OracleCapabilities` + `detectCapabilities` gain `copyProfile`/`browserChromeProfile`; `buildOracleCommand` emits the copy-profile pair instead of `--browser-cookie-path`; `resolveOracleCookiePath` is replaced by `validateOracleProfileBinding`; `runOracleProvider` gains the capability gate, the binding gate, and the running-session mapping |
| `src/cli/chatgpt-browser/types.ts` | Edit | `BrowserSessionTransport` union and the required `BrowserSessionMeta.browser.transport` field |
| `src/cli/chatgpt-browser/session-store.ts` | Edit | Persist `browser.transport` on every written session, including dry runs |
| `src/cli/chatgpt-browser/engine.ts` | Edit | `EMPTY_ORACLE_CAPABILITIES` gains the two new capabilities so doctor readiness and `missingCapabilities` cover them |
| `tests/cli/chatgpt-browser.test.ts` | Edit | Fixture helpers plus transport, fail-closed, doctor, dry-run, and running-session cases |
| `docs/repo-harness-chatgpt-browser-engine.md` | Edit | Profile-binding, wrapper-mapping, capability-list, and manual-login paragraphs |
| `assets/skills/repo-harness-chatgpt/references/consult.md` | Edit | Bound-profile rule and the failure-mode list |

### Code Snippets
None beyond the file changes above; the transport is a two-flag argv change plus its gates.

### Data Flow
`.repo-harness/chatgpt-browser.local.json` -> `withBrowserBinding` -> `BrowserConsultInput`
-> `runOracleProvider` gates -> `buildOracleCommand` argv -> Oracle process ->
`writeBrowserSession` -> `meta.json` `browser.transport`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The bound-profile path now probes the resolved binary before every real consult | High | A stripped or fake Oracle that used to run is rejected | Intentional: the probe is the readiness authority, and `browser-doctor` reports the same capabilities |
| `--copy-profile` copies a live Chrome profile | Medium | A large profile makes startup slower than a cookie-file read | Accepted; the probe measured 2/2 successful runs, and correctness outweighs startup cost |
| Local doctor stays `action_required` because Oracle 0.18.0 != pinned 0.14.1 | High | This machine cannot reach `ready` until the version pin moves | Out of scope here; recorded in the notes file and the contract acceptance notes |

## Task Contracts
- Contract file: `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Review file: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Implementation notes file: `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`; after execution revert branch `codex/brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`, `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`, and `tasks/archive/notes-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260904-1855-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md`; after execution revert branch `codex/brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport

## Context

- Sprint: `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`
- Backlog row: 5
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `BRC4a — browser-consult transport：`--copy-profile` 透传、doctor 能力探测、session meta transport` so that the acceptance line holds: 有 profile 绑定时 `browser-consult` 的唯一 oracle 传输为 `--copy-profile <user-data-dir> --browser-chrome-profile <profile-directory>`，不再传 `--browser-cookie-path`，两者不共存、无静默回退；oracle 缺 `--copy-profile` 或 `--browser-chrome-profile` 时 fail closed（`ORACLE_COPY_PROFILE_UNSUPPORTED`）；`browser-doctor` capabilities 新增 `copyProfile` 与 `browserChromeProfile`，`status: ready` 要求二者为 true；`BrowserSessionMeta.browser` 新增 `transport: 'copy_profile'` 并落盘；dry-run 命令行断言含 `--copy-profile` 与 `--browser-chrome-profile` 且不含 `--browser-cookie-path`；oracle 输出 `A session with the same prompt is already running` 映射为 `ORACLE_SESSION_ALREADY_RUNNING` 并附 recovery，不自动加 `--force`；`docs/repo-harness-chatgpt-browser-engine.md` 同步，先 grep `tests/` 的字面串断言再改文档；依据：`docs/researches/20260902-gpt-pro-connector-readback-probe.md`

## Task Breakdown

- [x] Extend `tests/cli/chatgpt-browser.test.ts` with the failing transport, fail-closed, doctor-capability, dry-run-meta, and running-session cases (red first).
- [x] `src/cli/chatgpt-browser/types.ts`: add `BrowserSessionTransport` and the required `BrowserSessionMeta.browser.transport` field.
- [x] `src/cli/chatgpt-browser/oracle-provider.ts`: probe `copyProfile`/`browserChromeProfile`, emit `--copy-profile`/`--browser-chrome-profile`, delete `resolveOracleCookiePath` and `ORACLE_PROFILE_COOKIE_NOT_FOUND`, add `validateOracleProfileBinding`, the `ORACLE_COPY_PROFILE_UNSUPPORTED` gate, and the `ORACLE_SESSION_ALREADY_RUNNING` mapping.
- [x] `src/cli/chatgpt-browser/session-store.ts`: persist `browser.transport` on every session write.
- [x] `src/cli/chatgpt-browser/engine.ts`: extend `EMPTY_ORACLE_CAPABILITIES` so doctor readiness and `missingCapabilities` include the transport flags.
- [x] `docs/repo-harness-chatgpt-browser-engine.md` and `assets/skills/repo-harness-chatgpt/references/consult.md`: replace cookie-database wording with the copy-profile transport and the new error codes.
- [x] Verify: `bun test tests/cli/chatgpt-browser.test.ts --timeout 60000`, `bun run check:type`, `oracle --help`/`--debug-help` flag readback, `browser-doctor --provider oracle --json`, `browser-consult --dry-run`, then the contract and workflow gates.

## Annotations

- None outstanding.

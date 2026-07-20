# Implementation Notes: hrd-04-session-start-consolidation

> **Status**: Active
> **Plan**: plans/plan-20260720-0829-hrd-04-session-start-consolidation.md
> **Contract**: tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md
> **Review**: tasks/reviews/20260720-0829-hrd-04-session-start-consolidation.review.md
> **Last Updated**: 2026-07-20 (implementation pass complete, pending final verification)
> **Lifecycle**: notes

## Design Decisions

### Ripple enumeration (pre-implementation gate, per contract's CRITICAL PROCESS REQUIREMENT)

Per the dispatch brief's explicit instruction ("BEFORE implementing, enumerate
the complete retirement ripple... If ANY live consumer is outside the
contract's Allowed Paths, STOP THERE and hand back the enumeration BEFORE
writing code"), this section is written before any implementation or
falsifier code. `grep -rn` for `session-start-context\.sh`,
`minimal-change-context\.sh`, `security-sentinel\.sh` across
`src/ scripts/ tests/ docs/ README* assets/ .ai/hooks/` returned ~150 hits.
Every hit was individually inspected (not just pattern-matched) and
classified below.

**Baseline confirmed**: `tests/fixtures/loop-runtime/characterization.json`
`SessionStart.default` cell: `child_invocations: {git: 23, bun_cli: 3,
bun_generic: 0}`, `write_set: [.ai/harness/runs/hook-invocations.jsonl,
.ai/harness/security/latest.json, .ai/harness/security/state.sha256,
.ai/harness/state/effective.json]` — matches the contract's stated frozen
baseline exactly.

#### Category A — already in Allowed Paths (no ripple issue)

`src/cli/hook/route-registry.ts`, `src/cli/hook/runtime.ts` (incl. its
`taskState`/`securityBoundary` script-name branches at ~575-576),
`tests/hook-runtime.test.ts`, `tests/hook-contracts.test.ts`,
`tests/hook-protocol.test.ts`, `tests/hook-runtime-characterization.test.ts`,
`tests/fixtures/loop-runtime/characterization.json`, both `run-hook.sh`
copies (Codex-stdout special-case at line 96 keys on the literal string
`"session-start-context.sh"` — in scope to reconcile), both `assets/hooks`
and `.ai/hooks` copies of the 3 retiring scripts, and both
`projection.json`/`.projection.json` re-sync targets.

#### Category B — confirmed NOT live (verified by direct inspection, several cross-checked against HRD-03 precedent)

| Path | Why it is not a live ripple consumer |
|---|---|
| `scripts/repo-harness.sh`, `scripts/hook-shim.sh` | Explicitly a "Bash prototype of the repo-harness CLI (Phase 0.5)"; superseded by `repo-harness hook <event> --route <route-id>` (`src/cli/commands/hook.ts`'s own docstring: "Replaces the per-script scripts/hook-shim.sh"). Not referenced from `package.json`, CI, or `install-profile.ts`. **Precedent-confirmed**: HRD-03 retired `worktree-guard.sh`/`pre-edit-guard.sh`, both still named in `build_hooks_json()` here today, untouched by that package. |
| `tests/hook-shim-trust.test.ts`, `tests/hook-shim-resolution.test.ts` | Exercise the shim's own dispatch/trust logic against a fake stub `run-hook.sh` (`echo "RAN-HOOK $1"`); `"session-start-context.sh"` is used only as an arbitrary hook-name string argument, never the real file. Read in full — no path depends on the retiring scripts existing. |
| `scripts/inspect-project-state.ts:126` (+ projected `assets/templates/helpers/inspect-project-state.ts:126`) | `generatedClaudeHookPaths` is a fixed fingerprint list for the OLD pre-repo-harness `.claude/hooks/*` per-project convention (`.claude/hooks/run-hook.sh`, `finalize-handoff.sh`, etc.), unrelated to the current `.ai/hooks/*` set. Also owned by its own architecture contract (`workflow-engine-inspection-migration`, root `CLAUDE.md`), outside this capability entirely. |
| `assets/workflow-contract.v1.json:607` (`.claude/hooks/session-start-context.sh` inside `migrations.legacyPaths`) | Same OLD `.claude/hooks/*` legacy-cleanup manifest. **Precedent-confirmed**: `.claude/hooks/pre-edit-guard.sh` and `.claude/hooks/worktree-guard.sh` remain listed here today, untouched by HRD-03. |
| `tests/cli/migrate.test.ts:30` | `LEGACY_CODEX` is a hand-built fixture string representing an OLD project-level `.codex/hooks.json` payload fed *into* the migrate command; pure string fixture, asserts on migration mechanics, not on the real script file existing. |
| `tests/create-project-dirs.runtime.test.ts:180,186,197`, `tests/init-project.settings.runtime.test.ts:37` | All assert `existsSync(...).toBe(false)` for `.ai/hooks/session-start-context.sh` (or the legacy `.claude/hooks/` path) in profiles where hooks are never vendored. Remain trivially true after retirement. |
| `docs/researches/*`, `docs/architecture/requests/archive/2026/*`, `docs/CHANGELOG.md`, `docs/architecture/modules/runtime-harness/hook-adapters.md` | Dated/historical/architecture-owned narrative. `docs/researches/20260612-loop-in-hook-vs-nlah-loop-engineering.md` already cites a stale line count ("389行") for this same script, proof these are point-in-time snapshots, not maintained parity text. **Precedent-confirmed**: HRD-03 touched none of these despite an analogous retirement. |
| `assets/reference-configs/hook-operations.md`, `assets/reference-configs/minimal-change-hooks.md` | Diffed directly against the `docs/reference-configs/` canonical copies: **already stale post-HRD-03** (`assets/reference-configs/hook-operations.md` still says `pre-edit-guard.sh blocks implementation edits...`, never updated to the mutation-guard wording). No sync tool enforces parity (no reference in `scripts/sync-helper-sources.ts` or any other sync script). Precedent-confirmed left alone by cutover packages. |

#### Category C — confirmed LIVE, outside Allowed Paths (genuine ripple; blocks implementation per Stop Conditions)

| # | Path | Evidence | Category (matches HRD-03's own ripple taxonomy) |
|---|---|---|---|
| 1 | `tests/cli/hook.test.ts` (3060 lines) | ~15+ tests build fake `session-start-context.sh`/`minimal-change-context.sh`/`security-sentinel.sh` shell stubs to exercise `SessionStart.default`'s *generic* script-loop mechanics: soft-skip-all list (`~398-400`), partial-missing-skip (`~505-520`), `HOOK_REPO_ROOT` propagation (`~657-683`), conflicting-root no-op with `script-ran`/`sentinel-ran` sentinels (`~715-716`), plus more at `~801,830,857-859,1313,1378,1395+`. Once `SessionStart.default` dispatches unconditionally to the in-process builder (mirroring `isMutationGuardRoute`), the generic script loop no longer runs for this route and every one of these fixtures loses its premise. | Same class as HRD-03's `tests/cli/hook.test.ts` finding (4 of 54 retargeted/adapted then, larger here since SessionStart had 3 required-but-soft scripts vs. PreToolUse.edit's 2 fully-required ones). |
| 2 | `tests/cli/route-registry.test.ts` | `getRoute('SessionStart','default')?.scripts` hardcoded to the 3 names (`~54-57`), directly adjacent to the `PreToolUse.edit` assertion (`toEqual([])`) HRD-03 already retargeted in this same test. Must become `[]` symmetrically. The `KNOWN` script-name set (`~101-104`) can keep the 3 names as a harmless superset, or be trimmed. | Same file, same class as HRD-03's route-registry retarget. |
| 3 | `tests/cli/doctor.test.ts` | `repo-hook-scripts warns when pinned repo route scripts are missing` (`~213`) asserts `hooks.detail` contains `'security-sentinel.sh'` as a script `checkHookScriptDrift()` (doctor.ts) reports missing. Once `route.scripts` is `[]`, `security-sentinel.sh` is no longer a route script that check ever considers. | Same class as HRD-03's real `doctor.ts`/`install-profile.ts` regression discovery — a genuine product-check test, not incidental. |
| 4 | `tests/create-project-dirs.runtime.test.ts` (~line 652) | In the "repo-pinned scripts install" scenario (runs the real `scripts/create-project-dirs.sh` against a `hook_source: repo` pin), asserts `existsSync(.ai/hooks/session-start-context.sh)).toBe(true)`. Flips to `false` once the source is deleted from `assets/hooks/`. (`scripts/create-project-dirs.sh` itself appears to be a directory copy, not a per-file hardcode — needs confirming during implementation, but the test assertion itself is a certain break regardless.) | New for HRD-04 (SessionStart-specific vendoring assertion; no HRD-03 analog since PreToolUse.edit's scripts were never conditionally vendored this way in that test). |
| 5 | `tests/sprint-backlog.test.ts` (~640-690) | `"session-start hook injects active sprint context..."` test directly `spawnSync`s `.ai/hooks/session-start-context.sh` twice (inert-without-marker, then active-with-fixture) to verify the Active Sprint section's gating and content (`backlog=0/2`, `task-a`, the `$think` guidance line). This is exactly the "tests spawning them directly" category named in the dispatch brief. | New for HRD-04; the direct-spawn pattern HRD-03's own brief explicitly warned to check for. |
| 6 | `tests/readme-dx.test.ts` (~line 84) | `hookAuthority` = `section(readme, "Hook Authority Map")` (README.md's own section, not hook-operations.md) is asserted to `.toContain("minimal-change-context.sh")`. Editing README's Hook Authority Map / route table (item 7 below) breaks this literal assertion. | Cascades from item 7; same "live-doc sweep has a test locked to its exact wording" class HRD-03's Gate Round-1 surfaced. |
| 7 | `README.md`, `README.ja.md`, `README.fr.md`, `README.es.md`, `README.zh-CN.md` | Each carries the SessionStart route-table row + prose/mermaid diagram naming the 3 scripts (README.md: `~31,562,586,588,589`; ja: `~29,337,350,351`; fr: `~33,361,374,375`; es: `~33,357,370,371`; zh-CN: `~28,394,412,414`). | Same class as HRD-03's Gate Round-1 "Live-doc sweep" finding — doing it proactively this time per the brief's explicit instruction. Note: `README.fr.md` still shows the *pre-HRD-03* wording for the `PreToolUse.edit` row (`worktree-guard.sh`, `pre-edit-guard.sh`), i.e. HRD-03's own doc sweep appears to have missed this locale — flagging for consistency, not blaming this package. |
| 8 | `docs/reference-configs/hook-operations.md` | `SessionStart.default runs session-start-context.sh, minimal-change-context.sh, and security-sentinel.sh...` (`~33-34`) and delegation-mode prose naming `session-start-context.sh` as the injecting mechanism (`~21`). | Same file HRD-03's Gate Round-1 already edited once (for the PreToolUse.edit row); needs a second, this-package's edit for its SessionStart row. |
| 9 | `docs/reference-configs/minimal-change-hooks.md` | `"SessionStart.default runs minimal-change-context.sh after the normal..."` (`~10`). | New doc for HRD-04, same live-reference-doc class. |
| 10 | `scripts/ensure-task-workflow.sh` (~1143) + synced projection `assets/templates/helpers/ensure-task-workflow.sh` (~1143) | Generated-rule JSON string naming `session-start-context.sh` as the mechanism injecting the standing delegation-authorization block at SessionStart. This pair *is* sync-checked (`bun run check:helpers`), unlike `reference-configs/`. | Identical to HRD-03's Gate Round-1 "Generated-rule emitters" finding — same two files, same fix shape (edit `scripts/`, then `bun run sync:helpers`). |
| 11 | `scripts/lib/project-init-lib.sh` (~1997) | Identical generated-rule string; confirmed (per HRD-03's own notes) to have no synced-projection counterpart — single copy, single edit. | Same class as #10. |

11 confirmed-live path groups outside Allowed Paths (locale READMEs counted
as one item). This is larger than HRD-03's eventual 9-path amendment, but
every category is either identical to one HRD-03 already hit (hook.test.ts /
route-registry.test.ts / doctor test / README+hook-operations.md /
generated-rule-emitters) or a SessionStart-specific analog of the same shape
(create-project-dirs vendoring assertion, sprint-backlog direct-spawn,
readme-dx section-lock, minimal-change-hooks.md). Per the contract's Stop
Conditions ("Stop and hand back if the change would require editing a path
outside Allowed Paths... one amendment round"), implementation (including the
Falsifier prototype) is not started pending a scope decision on these 11
paths. Recommended Allowed Paths addition, if accepted:

```
tests/cli/hook.test.ts
tests/cli/route-registry.test.ts
tests/cli/doctor.test.ts
tests/create-project-dirs.runtime.test.ts
tests/sprint-backlog.test.ts
tests/readme-dx.test.ts
README.md
README.ja.md
README.fr.md
README.es.md
README.zh-CN.md
docs/reference-configs/hook-operations.md
docs/reference-configs/minimal-change-hooks.md
scripts/ensure-task-workflow.sh
assets/templates/helpers/ensure-task-workflow.sh
scripts/lib/project-init-lib.sh
```

**AMENDMENT ACCEPTED**: the contract's Scope section now carries this
enumeration verbatim (18 paths, including the conditional
`scripts/create-project-dirs.sh`) in one round. Implementation proceeded
below.

### Falsifier result

Ported `minimal-change-context.sh` (16 lines) and `security-sentinel.sh` (115
lines) as pure section emitters in `src/cli/hook/session-context.ts`, then
diffed their output against the (still-present, pre-retirement) bash scripts
on identical fixtures using a throwaway comparison harness (bash raw stdout
piped through a verbatim copy of runtime.ts's private
`extractSessionStartContext`, compared to the new TS function's direct
return value):

- `minimal-change-context.sh`: 4/4 scenarios byte-identical (no-policy
  mode=off, mode=advice defaults, `max_context_words` truncation,
  `session_context=false` suppression). Reduces to one function pair already
  shared with the CLI (`loadMinimalChangePolicy` + `renderMinimalChangeSessionContext`)
  -- no subprocess needed at all, `bun_cli` contribution 0.
- `security-sentinel.sh`: 9/9 assertions byte-identical across 3 scenarios
  (cache-miss/no-findings, cache-hit/skip, cache-miss/suspicious-hook),
  checking section content AND the two durable cache files
  (`latest.json`, `state.sha256`) byte-for-byte. The fingerprint gate and
  cache read/write port with plain `fs`/`crypto` calls; the scan itself
  calls `runSecurityScan()` (`src/cli/commands/security.ts`) in-process --
  the same function `doctor.ts` already calls, confirmed via
  `formatSecurityScan(report, true) === JSON.stringify(report, null, 2)`
  (no transform) -- collapsing `bun_cli` to 0 for this section too.

Falsifier not tripped for either script: nothing in `minimal-change-context.sh`
or `security-sentinel.sh` depends on shell-only environment semantics: HOME
resolution, file existence/mtime, JSON parsing, and SHA-256 hashing are all
directly observable from Node. Proceeded to the 641-line main script.

One test-harness bug found and fixed during falsifier validation (not a
product bug): the harness captured `now_ms` before the bash run + a
snapshot-restore `cp -R` cycle, so the restored fixture's freshly-stamped
mtimes could land *after* the injected clock reading fed to the TS side,
intermittently tripping the tooling-advisory freshness check's own
`now >= mtime` guard. Fixed by recomputing `now_ms` immediately before each
side's own run; 6/6 repeat runs clean after the fix.

### Main script port (`session-start-context.sh`, 641 lines) -- falsifier-style validation

Before wiring, ran a second throwaway comparison harness (same
extract-and-diff methodology, `HOME`-isolated per scenario) against the real
bash script across 7 scenarios: fully-empty (null), resume+todo-signal
(capped resume blob + Input Priority prefix), capability+architecture queue,
active-sprint backlog, current-status on a non-target branch
(local+target-metadata blocks with NO blank line between them -- a real bug
this harness caught and fixed, see below), codex-delegation-auto +
tooling-advisory (fresh-cache render), idle-status-on-target-branch (null).
All 7 byte-identical after two fixes:

1. **No blank line between the two `current_status_snapshot_context` bash
   heredocs.** Bash's `cat <<EOF1; ...; cat <<EOF2` concatenates directly --
   my first draft inserted a blank line before "Target snapshot metadata:".
   Fixed by removing it.
2. **`HOME` leaking from the real machine into the delegation-mode
   scenario.** `codex_delegation_auto_context`'s global-config check
   (`${HOME:-}/.repo-harness/config.json`) is genuinely HOME-sensitive and
   this repo's own dev machine has a real `~/.repo-harness/config.json`
   (`delegation.mode: "explicit"`) that legitimately overrides repo policy
   per the documented precedence -- a harness bug (forgot to isolate `HOME`
   for this specific scenario), not a product bug. Fixed by isolating `HOME`
   for every scenario, matching what the security-sentinel falsifier already
   did correctly.

### Section port table

| Bash section / function | TS port | Notes |
|---|---|---|
| `minimal-change-context.sh` (whole file) | `minimalChangeSessionContent` / `minimalChangeSessionSection` | Direct reuse of `loadMinimalChangePolicy` + `renderMinimalChangeSessionContext`; no subprocess. |
| `security-sentinel.sh` (whole file) | `securitySentinelSessionContent` / `securitySentinelSessionSection` | Fingerprint (raw hex sha256, matching `shasum -a 256`) + cache read/write ported by hand; scan via in-process `runSecurityScan()`. |
| `resume_current_for_handoff` + capped resume blob | `resumeBlock`, `resumeAvailable`, `resumeCurrentForHandoff`, `capResumeContent` | Cap algorithm (`length(total) < 12000` checked before append, can overshoot by one line) ported exactly; uses JS `.length` (UTF-16 code units) vs awk's locale-dependent char/byte count -- documented low-risk approximation for astral-plane characters only. |
| `active_plan_exists` / `active_todo_exists` / `handoff_section_has_signal` | same names (camelCase) | `getActivePlan()` duplicates mutation-guard.ts's private helper verbatim (that file is outside Allowed Paths); `**Status**:`-line extraction (`planStatusField`) replicates bash's `| xargs` whitespace-collapse, not just `.trim()` (mutation-guard.ts's own `extractStatusFromText` does not collapse -- an existing, accepted, dormant divergence there; this port stays faithful to the ORIGINAL bash instead of copying that divergence). |
| `capability_context_pending` | `capabilityContextPendingContext` | jq's per-row error-continue semantics on a malformed entry (missing `capability_id`/`path`) not replicated -- documented simplification for a shape this repo's own writer never produces; `pending_count` still counts every pending row regardless. |
| `architecture_queue_pending` | `architectureQueuePendingContext` | `date -j -f '%Y-%m-%d'` (LOCAL time) matched with JS `Date(y, m-1, d)` (also local time), not `Date.parse(...Z)` (UTC) -- verified this distinction matters (this machine's TZ is +0800). |
| `pending_plan_capture_context` + `workflow_pending_orchestration_*` | `pendingPlanCaptureContext`, `pendingOrchestrationIsFresh/Summary/Field`, `readPendingOrchestration` | Direct JSON.parse replaces jq; `// empty` + `!= "null"` guards collapse to one string-or-empty check since the writer (`workflow_write_pending_orchestration`) always emits string fields. |
| `current_status_snapshot_context` + `current_status_field` | `currentStatusSnapshotContext`, `currentStatusField` | `git branch --show-current` / `git rev-parse --verify --quiet` / `git show ref:path` ported as real `execFileSync` calls (git has no in-process equivalent) -- this is where the golden's `git` count (23->22) still mostly lives. |
| `active_sprint_context` + two backlog awk scripts | `activeSprintContext`, `sprintBacklogProgress` | The two independent bash awk scripts (done/total tally, next-unchecked-task) merged into one JS loop -- pure consolidation, neither observes the other's state, output unchanged. |
| `tooling_update_advisory_context` (fresh-cache path) | `toolingUpdateAdvisoryContext` (fresh branch), `renderToolingUpdateContext`, `toolingUpdateReportWasRendered/MarkReportRendered` | Full fidelity, pure in-process JSON read, no subprocess. |
| `tooling_update_advisory_context` (`REPO_HARNESS_TOOLING_ADVISORY_SYNC=1` branch) | `toolingUpdateSyncPopulateAndRender`, `repoHarnessSetupCheckSubprocess` | **Kept as a real subprocess** (two-tier `bun $REPO_HARNESS_CLI` / `repo-harness` on PATH, mirroring bash exactly) rather than collapsing to in-process `runInitHook()` -- see "SYNC path" decision below. |
| `tooling_update_advisory_context` (default async-trigger branch) | lock-`mkdir` attempt only, no populate | **Deliberately not ported** -- see "async path" decision below. |
| `codex_delegation_auto_context` + `effective_delegation_mode` / `delegation_max_agents_value` | `codexDelegationAutoContext`, `effectiveDelegationMode`, `delegationMaxAgentsValue` | Direct JSON.parse of both config files replaces the `jq`-gated bash resolution (this repo's dev machine confirmed to have `jq` installed, so no behavioral gap observed, but the TS port no longer depends on `jq` being present at all -- a strict improvement, not a divergence, since the underlying JSON is always directly parseable). |
| `input_priority_context` | `INPUT_PRIORITY_CONTEXT` constant | Static text, `<<'EOF'` quoted heredoc ported as a plain string. |
| Final composition (`context=`... accumulation) | `sessionStartMainContent` | `appendBlock()` reproduces the "single `\n` separator, first non-empty becomes the base" accumulation exactly; `safely()` wraps each sub-block so one section's bug can't take down the rest (mirrors bash's pervasive `|| true`). |

### Design decision: tooling-advisory SYNC path kept as a real subprocess

Initial design deliberately skipped the entire stale-cache path (both SYNC
and default-async) as a documented cost-only simplification, reasoning that
neither contributes content to the *triggering* session and the golden
benchmark never sets `REPO_HARNESS_TOOLING_ADVISORY_SYNC=1`. Retargeting
`tests/hook-runtime.test.ts`'s "emits tooling update agent actions once per
cached report" test (in Allowed Paths from the start, not part of the
amendment) surfaced that this reasoning was wrong for the SYNC branch
specifically: that test deliberately intercepts the subprocess call via a
fake PATH-injected `repo-harness` binary to keep the report content
controlled and deterministic (log-file-verified argv, canned `agent_actions`
JSON). Calling the real in-process `runInitHook()` (`src/cli/commands/init-hook.ts`,
confirmed callable exactly like `runSecurityScan()`) instead of spawning a
subprocess would have bypassed that interception point entirely, making the
section's content depend on whatever this machine's REAL tooling state
happens to be -- a non-deterministic test. Kept the subprocess for this one
branch; since it only fires under an opt-in env var never set in the golden
run, this has zero effect on the `bun_cli: 3 -> 0` cost result.

### Design decision: tooling-advisory default async path still not ported

Confirmed via full-repo grep across `tests/hook-runtime.test.ts`,
`tests/hook-runtime-characterization.test.ts`, `tests/hook-contracts.test.ts`,
`tests/hook-protocol.test.ts` that no test exercises the DEFAULT
(non-SYNC) stale-cache path's eventual population (would require a
wait/poll, unusual for a test). This path never produces content for the
triggering session either way (bash forks a detached background process and
returns immediately); reproducing detached background population in-process
would need real child-process backgrounding for a side channel with zero
observable content this session. Only the lock-directory `mkdir` attempt is
mirrored (so a concurrent populate elsewhere still sees the same signal on
disk); actual population now only happens via the SYNC path or an explicit
`repo-harness setup check --check-updates` run. Documented cost-only gap, not
silently dropped.

### Bug found and fixed via the new unit test suite: `runSecurityScan()` HOME propagation

`securitySentinelSessionContent` correctly threads the injected `env`
through to `computeSecurityFingerprint` (the changed-only gate), but the
first implementation called `runSecurityScan({ cwd: repoRoot })` without an
explicit `home`, so the ACTUAL scan fell through to `runSecurityScan`'s own
`homeDir()` default, which reads `process.env.HOME` directly -- diverging
from the injected `env.HOME` whenever they differ. In production `env` is
always `process.env` itself (same reference), so this was unobservable
end-to-end; it surfaced only when `tests/session-context.test.ts` called the
function in-process with a distinct fake `env` object (no real subprocess to
carry the override, unlike the falsifier harness's `HOME=$home bun ...`
subprocess invocations, which happened to mask it). Fixed by passing
`home: env.HOME` explicitly -- `runSecurityScan` already exposes exactly
this override for testability. Both `tests/session-context.test.ts` and a
direct `bun -e` repro confirmed the fix.

### Ripple application (18 approved paths)

| # | Path | Disposition |
|---|---|---|
| 1 | `tests/cli/hook.test.ts` | 4 tests retargeted (2 SessionStart script-loop-mechanics tests rewritten for the new unconditional-builder shape incl. a durable-side-effect-even-with-stdio-override check; 3 HOOK_REPO_ROOT-propagation tests retargeted to `PostToolUse.bash`; "hooks-drift" test replaced with a no-drift regression guard; "global budget" test's fake-script vehicle replaced with a real active-sprint fixture; 2 delegation-mode tests retargeted to call `sessionStartMainContent()` directly). 3 tests already end-to-end (full CLI dispatcher) needed zero code changes, only stale-comment fixes. 55/55 pass. |
| 2 | `tests/cli/route-registry.test.ts` | `SessionStart.default` scripts assertion -> `[]` (mirrors the adjacent `PreToolUse.edit` assertion). `KNOWN` script-name set left with the 3 retired names as a harmless superset, matching HRD-03's own precedent for `worktree-guard.sh`/`pre-edit-guard.sh`. 10/10 pass. |
| 3 | `tests/cli/doctor.test.ts` | "warns when scripts missing" test's example script retargeted from `security-sentinel.sh` (no longer a route script) to `prompt-guard.sh`. 22/22 pass. |
| 4 | `tests/create-project-dirs.runtime.test.ts` | One `.toBe(true)` assertion for the now-nonexistent vendored file retargeted to `post-bash.sh` (equally representative). Confirmed `scripts/create-project-dirs.sh` itself does a directory copy (no hardcoded filenames) -- no source edit needed. |
| 5 | `tests/sprint-backlog.test.ts` | Direct-spawn vehicle (`spawnSync bash .../session-start-context.sh`) retargeted to `sessionStartMainContent()` with identical Active Sprint assertions; `installHooks()` helper (now fully unused) removed along with its now-dead `cpSync`/`ASSETS_HOOKS_DIR` dependencies. 23/23 pass, faster (no subprocess spawns). |
| 6 | `tests/readme-dx.test.ts` | `hookAuthority` assertion swapped from `"minimal-change-context.sh"` to `"session-context.ts"`; added an explicit `not.toContain("session-start-context.sh")` guard. 8/8 pass. |
| 7 | `README.md`, `README.ja.md`, `README.fr.md`, `README.es.md`, `README.zh-CN.md` | Route table row, prose, and mermaid diagram (3-script chain -> 1 in-process-builder box fanning into 3 content kinds) updated in all 5. `README.fr.md` additionally got the `PreToolUse.edit` row HRD-03 catch-up (`worktree-guard.sh`/`pre-edit-guard.sh` -> `src/cli/hook/mutation-guard.ts`) -- confirmed via grep this was the only locale still carrying the pre-HRD-03 wording. Fence-balance verified (`grep -c '^```'` even in all 5 files) after editing. |
| 8 | `docs/reference-configs/hook-operations.md` | Both prose references (delegation-mode injection mechanism; the `SessionStart.default` paragraph) updated to name the in-process builder. |
| 9 | `docs/reference-configs/minimal-change-hooks.md` | Runtime-path bullet updated. |
| 10 | `scripts/ensure-task-workflow.sh` + synced `assets/templates/helpers/ensure-task-workflow.sh` | Generated-rule JSON string updated, re-synced via `bun run sync:helpers` (49 helpers, verified via `check:helpers`). |
| 11 | `scripts/lib/project-init-lib.sh` | Same generated-rule string updated (no projected copy exists for this file, confirmed by HRD-03's own notes). |
| — | `scripts/create-project-dirs.sh` (conditional) | Grepped for the 3 filenames -- zero hits, confirmed directory-copy-based, no edit per the contract's own conditional clause. |
| — | `assets/hooks/run-hook.sh` + `.ai/hooks/run-hook.sh` (already in original Allowed Paths) | Removed the now-dead `"$HOOK_NAME" != "session-start-context.sh"` exemption (that HOOK_NAME can never occur again through this dispatcher); re-synced via `bun run sync:hooks`. |

### Additional dead-code removal in `src/cli/hook/runtime.ts` (not separately listed above, same file already in Allowed Paths)

Two blocks became provably unreachable once `SessionStart.default`'s
`route.scripts` became `[]` (SessionStart has exactly one route, so nothing
can iterate the generic script loop for it any more) and were removed rather
than left dead, consistent with "remove the retired path in the same
work-package":
1. The per-script `session-start-context.sh` / `security-sentinel.sh`
   stdout->section extraction block inside the script loop (and the
   now-fully-unused `extractSessionStartContext` helper it was the only
   caller of).
2. The `sessionStartCollectStdout && skippedScripts.length > 0` "hooks-drift"
   synthetic section (`skippedScripts` can never be non-empty while that
   flag is true any more).

### Design decision: builder runs unconditionally, not gated on `sessionStartCollectStdout`

First draft gated the entire builder call (scriptsRun entry + durable side
effects + telemetry) behind `sessionStartCollectStdout` (`opts.stdio ===
undefined`), by analogy with `effectiveStateSessionSection`'s own identical
gating. Reconsidered after realizing the OLD 3-script loop's actual
behavior was different: scripts ran (with real side effects) via the
generic loop regardless of `sessionStartCollectStdout` -- that flag only
gated the stdout->section EXTRACTION step, not execution. `tests/cli/hook.test.ts`'s
`stdio: 'ignore'` fixtures depended on exactly this (scripts still run,
just silenced). Fixed: the builder call itself is now gated only on
`isSessionStartBuilderRoute`; only pushing its sections into
`sessionStartContexts` (the JSON-payload assembly step) stays gated on
`sessionStartCollectStdout`, matching the old per-script extraction gating
exactly.

### Known, documented, out-of-Allowed-Paths residual: `assets/hooks/prompt-guard.sh:888` comment

One code comment (`# is delivered once by session-start-context.sh.`,
describing the Codex cross-review-availability-note mechanism) still names
the retired script. `prompt-guard.sh` is not in this contract's Allowed
Paths (not part of the approved 18-item amendment, and discovered only via
the full retirement grep after implementation, not flagged in the original
enumeration). Non-functional (a developer-facing comment, not agent/user
guidance or a generated-rule string), single line, low real-world impact.
Left unedited per the "Allowed paths only" hard constraint; flagged here for
the record rather than silently left out of the enumeration.

A full-repo re-grep (beyond the original ripple's scoped directories) after
implementation surfaced two more, both confirmed non-live and left
unedited, same reasoning:

- `.ai/harness/policy.json` (this worktree's own installed runtime policy,
  not a source template) carries a copy of the SAME generated-rule string
  fixed in `scripts/ensure-task-workflow.sh` / `project-init-lib.sh`,
  embedded at some earlier `ensure-task-workflow` sync. Not in Allowed
  Paths; a generated runtime artifact meant to be refreshed by re-running
  that ensure-script, not hand-edited -- same category as the already-stale
  `assets/reference-configs/*` projection HRD-03 also left alone.
- `references/hooks-guide.md` names `session-start-context.sh` as a
  "bundled hook asset". Inspected in full: this doc is already
  significantly stale independent of HRD-04 (it also lists
  `worktree-guard.sh` and `finalize-handoff.sh` -- names retired by HRD-03
  and even earlier renames, respectively -- as current). Confirmed via the
  same HRD-03-precedent test: that package left this file's
  `worktree-guard.sh` reference untouched despite retiring it, confirming
  `references/` (distinct from the actively-maintained `docs/reference-configs/`)
  is not part of the live-docs-sweep obligation for these cutover packages.

### Golden delta (per-field before/after), `tests/fixtures/loop-runtime/characterization.json`

`SessionStart.default` cell only (confirmed via `git diff` -- exactly one
8-line hunk in a 269-line file, matching the contract's "any other cell
shifting fails this contract" bar):

| Field | Before | After |
|---|---|---|
| `scripts_run` | `["session-start-context.sh", "minimal-change-context.sh", "security-sentinel.sh"]` | `["session-context"]` |
| `child_invocations.git` | `23` | `22` |
| `child_invocations.bun_cli` | `3` | `0` |
| `child_invocations.bun_generic` | `0` | `0` (unchanged) |
| `skipped_scripts` / `failed_script` / `exit_code` / `reason` | `[]` / `null` / `0` / `"ok"` | **identical** |
| `stdout` / `stderr` | `""` / `""` | **identical** (byte-identical, not just both-empty by coincidence -- the fixture repo has no actionable content either before or after) |
| `write_set` | `[hook-invocations.jsonl, security/latest.json, security/state.sha256, state/effective.json]` | **identical** |

Regenerated exactly once via `UPDATE_HOOK_RUNTIME_CHARACTERIZATION_GOLDEN=1`,
preceded by a run against the pre-regeneration golden (captured above) per
HRD-03's own discipline. No other route's cell changed (confirmed by the
single-hunk `git diff`, not just by inspection).

### Cost numbers (SessionStart.default, from the golden)

| | Old (3 scripts) | New (in-process builder) |
|---|---|---|
| `scripts_run` entries | 3 | 1 |
| `git` children | 23 | 22 |
| `bun_cli` children | 3 | 0 |
| `bun_generic` children | 0 | 0 |

`bun_cli` fully collapses to 0 in the golden's fixture scenario (bare repo,
no `REPO_HARNESS_TOOLING_ADVISORY_SYNC` set). `git` drops by 1 (the
generic-loop overhead of spawning 3 separate bash scripts disappears; the
REMAINING git calls are genuine data dependencies -- `current_status_snapshot_context`'s
`git branch --show-current` / `git rev-parse --verify` / `git show` calls,
`runSecurityScan()`'s own internal repo-root re-resolution -- with no
in-process equivalent, ported as real `execFileSync` calls, matching HRD-03's
own precedent of the git count dropping only modestly (22->21 there) rather
than to zero.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

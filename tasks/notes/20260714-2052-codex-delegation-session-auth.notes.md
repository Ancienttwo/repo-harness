# Implementation Notes: codex-delegation-session-auth

> **Status**: Active
> **Plan**: plans/plan-20260714-2052-codex-delegation-session-auth.md
> **Contract**: tasks/contracts/20260714-2052-codex-delegation-session-auth.contract.md
> **Review**: tasks/reviews/20260714-2052-codex-delegation-session-auth.review.md
> **Last Updated**: 2026-07-14 20:52
> **Lifecycle**: notes

## Design Decisions

- `codex-delegation-advisor.sh`: after deleting the auto-mode branch, `explicit`
  is provably `true` at every remaining use site (the script now exits at
  `if (!explicit) process.exit(0);` before reaching them). Collapsed the
  `explicit ? A : B` ternaries for `mode`, `stop_fallback`, `trigger`, and the
  context-sentence string down to their single reachable branch (`"explicit"`,
  `true`, `trigger.name`, the explicit sentence) instead of keeping dead
  `: "auto"` / `: "auto-mode"` / auto-sentence branches that can never execute.
  Kept the `explicit` variable itself (still self-documents intent) and kept
  `isDelegationDiscussion` plus its use inside the `triggers.find()` predicate
  (the `spawn-subagents` trigger's `skipDiscussion` gate) byte-for-byte — that
  is still load-bearing for excluding discussion-shaped prompts from
  triggering. Only the second, now-unreachable standalone
  `if (isDelegationDiscussion(prompt)) process.exit(0);` call that used to
  live inside the deleted `if (!explicit) { ... }` auto-mode block was removed,
  since code after an unconditional `process.exit(0)` on the line above it can
  never run.
- `session-start-context.sh`: implemented the relocated mode resolution
  (`delegation_mode_from_file`, `effective_delegation_mode`,
  `delegation_max_agents_value`) using `jq`, matching this file's own existing
  convention for simple nested-JSON-field reads (e.g. `active_sprint_context`'s
  unconditional `jq` use), rather than porting the original JS
  `readGlobalDelegationMode` into a `bun -e`/`node -e` snippet. This file has
  no other hard bun/node dependency (only the optional
  `render_tooling_update_context` helper drops into node/bun, with its own
  guard), so a new hard dependency would have been inconsistent. If `jq` is
  unavailable, `delegation_mode_from_file` returns 1 and
  `effective_delegation_mode` falls back through to `"explicit"`, i.e. the new
  block silently does not fire rather than hard-failing the whole hook —
  consistent with every other advisory block in this script failing closed to
  "no output" when its data source is unavailable.
- The new block interpolates the real resolved `policy.json`
  `delegation.max_agents` value (defaulting to `2` when absent/non-integer),
  matching how the existing `codex-delegation-advisor.sh` explicit-trigger
  text also renders the real `${maxAgents}` rather than a placeholder.
- Chose the heading `# Delegation Standing Authorization` for the new block.
  It does not match any of the four headings
  (`Pending Plan Capture|Capability Context Queue|Architecture Queue|Active
  Sprint`) that `src/cli/hook/runtime.ts`'s `scriptActionable` regex
  recognizes as "this session-start-context.sh output is actionable" — see
  the Out of Scope note below for why that matters and why it was not changed.
- Test placement: the three new/rewritten SessionStart assertions (global-auto
  precedence, global-explicit precedence, and the codex+auto/explicit/claude
  matrix) all invoke `.ai/hooks/session-start-context.sh` directly via
  `spawnSync('bash', ...)`, mirroring the pattern already established for this
  script throughout `tests/hook-runtime.test.ts` (the `runHook` helper), rather
  than through the full TS CLI dispatcher (`bun cli hook SessionStart --route
  default`, i.e. `src/cli/hook/runtime.ts`'s `dispatchHook` +
  `budgetSessionContext`). This is deliberate, not an oversight — see Out of
  Scope below.
- The new `tests/hook-runtime.test.ts` SessionStart test isolates `HOME` to an
  empty temp dir. The real dev machine's `~/.repo-harness/config.json` has
  `delegation.mode: "explicit"`, which takes precedence over repo policy; an
  earlier draft of the test without HOME isolation passed or failed depending
  on which machine ran it. Mirrors the existing `emptyHome`/`home` isolation
  pattern already used by the three delegation dispatcher tests in
  `tests/cli/hook.test.ts`.

## Slice 2 Design Decisions

Slice 2 amended the contract to bring both slice-1 "Out of Scope" findings
in scope, plus two more items. Recorded here; the slice-1 sections above are
left as-authored (historical record of what slice 1 actually decided/found).

- **Advisor authority downgrade** (`assets/hooks/codex-delegation-advisor.sh`
  line ~323): replaced the "Treat the active task contract ... as the
  authoritative execution brief ... Do not re-derive scope from this
  conversation" sentence with the exact current-turn-authority framing named
  in the amended contract. Touched only this one array entry in the `context`
  list. Verified the runner-preference paragraph (which separately mentions
  "the contract brief" and `contract-run` for a completely different purpose
  — runner degradation, not authority) and the EXECUTION_BOUNDARY block are
  both untouched (`grep` before/after). Updated the one test assertion that
  pinned the deleted sentence (`tests/cli/hook.test.ts`, was
  `toContain('authoritative execution brief')`) to assert the new sentence
  instead.
- **`runtime.ts` actionable-gate fix** (`src/cli/hook/runtime.ts` line ~475):
  added `|Delegation Standing Authorization` as a fifth alternative to the
  `scriptActionable` heading regex — a one-line, additive change, no
  budget-system redesign, no change to `session-context-budget.ts` (its
  generic "some section actionable" gate is correct as-is; the gap was
  entirely in the heading allowlist). Added the regression test named in the
  contract to `tests/cli/hook.test.ts`: full `[CLI, 'hook', 'SessionStart',
  '--route', 'default']` dispatch on an idle codex+auto temp repo. Before
  committing to the fix as correct, temporarily reverted the regex change
  alone and reran just that test to confirm it fails with exactly the
  originally-observed symptom (empty `result.stdout`), then restored the fix
  and confirmed the test passes — the regression test is proven to catch the
  actual bug, not just decorative.
- **Bootstrap default copies harmonized, not just individually patched**
  (`scripts/lib/project-init-lib.sh` ~1980, `scripts/ensure-task-workflow.sh`
  ~1130, `assets/templates/helpers/ensure-task-workflow.sh` ~1130): before
  slice 2 these three disagreed with each other (project-init-lib.sh had the
  full old sentence; the other two had a shorter variant omitting the
  auto-mode clause entirely). All three now carry the exact same new rule
  text used in `.ai/harness/policy.json`, resolving that pre-existing
  three-way inconsistency as a side effect rather than just swapping in a
  second inconsistent "new" text per file. Confirmed this does not collide
  with the existing `PI_TEMPLATE_CONTRACT`/`ensure-task-workflow.sh`
  byte-identical parity test in `tests/helper-scripts.test.ts`: that test
  compares a *different* embedded heredoc (the `.claude/templates/
  contract.template.md` seed, `CONTRACT_TEMPLATE_EOF`/`EOF_TEMPLATE_CONTRACT`,
  lines ~383-521 / ~239-377) that is entirely disjoint from the
  `delegation.rule` line (~1130 / ~1980) — verified via `grep -n` on both
  markers before editing. `scripts/ensure-task-workflow.sh` and
  `assets/templates/helpers/ensure-task-workflow.sh` were edited identically
  and reconfirmed byte-identical (`diff`, then `bun run check:helpers`).
- **Docs consistency, semantic alignment only**: `docs/reference-configs/
  hook-operations.md`'s `UserPromptSubmit.delegation` paragraph gained
  "regardless of `delegation.mode`" plus one sentence describing the
  SessionStart auto mechanism; `README.md`'s `--delegation-mode` paragraph
  gained one sentence describing the same runtime split. Neither paragraph
  was restructured. Found (but left alone, see Out of Scope) that
  `assets/reference-configs/hook-operations.md` is currently byte-identical
  to the `docs/` copy but has no enforced sync test or script — only
  `docs/reference-configs/` is in `allowed_paths`.
- Translated `README.*.md` variants (es/zh-CN/ja/fr) do not contain the
  `--delegation-mode` paragraph at all, so there is no parity gap to create
  there.

## Deviations From Plan Or Spec

- None. The plan's Task Breakdown items were all implemented as specified in
  slice 1; slice 2 items were implemented exactly as specified in the
  coordinator's amendment message and the updated contract.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Port `readGlobalDelegationMode` into a `bun -e`/`node -e` snippet inside `session-start-context.sh` | Reject | Would add a new hard bun/node dependency to a script that is otherwise jq/awk/bash only (one narrow existing exception, itself optional); jq already handles this shape of lookup elsewhere in the same file |
| Give the new block a heading matching one of the four `scriptActionable`-recognized headings so it survives the TS dispatcher's actionable gate | Reject | Would be a semantically dishonest heading purely to exploit a regex loophole; superseded in slice 2 by fixing the regex properly |
| Extend `src/cli/hook/runtime.ts`'s `scriptActionable` regex to also recognize the new heading | **Done in slice 2** | `src/cli/hook/runtime.ts` moved into `allowed_paths`; implemented as a minimal additive regex alternative plus a regression test |
| Keep the `explicit ? auto-branch : explicit-branch` ternaries in the advisor with the auto-branch text merely blanked out | Reject | Leaves dead, unreachable branches; the contract frames this as a deletion-shaped change, and `explicit` is providably always `true` by construction after the new early exit |
| Give each of the 3 bootstrap files its own independently-worded "new" rule text | Reject | Would trade one three-way inconsistency for another; used one identical string everywhere instead |

## Open Questions

- None.

## Out of Scope / Future Work

Discovered during implementation. Items 1 and 2 below were slice-1 findings;
the coordinator amended the contract to bring both in scope for slice 2 (see
"Slice 2 Design Decisions" above) — **both are now RESOLVED**, kept here only
as the historical record of what was found and why. Item 3 is a new,
lower-stakes finding from slice 2 itself, deliberately left out of scope.

1. **RESOLVED IN SLICE 2.** SessionStart budget-aggregation "actionable" gate
   can silently swallow the new block in production Codex sessions.
   Confirmed empirically (not
   just by reading), via a temp repo with `HOOK_HOST=codex`,
   `delegation.mode=auto`, and otherwise fully idle state (no resume, no
   active plan/contract, no pending capture, no architecture/capability
   queue, no active sprint, no security-sentinel finding):
   - Direct `bash .ai/hooks/session-start-context.sh` invocation: emits the
     new "Delegation Standing Authorization" block correctly.
   - Through the real production Codex path
     (`repo-harness-hook SessionStart --route default`, i.e.
     `src/cli/hook/runtime.ts`'s `dispatchHook`, which is what
     `~/.codex/hooks.json` actually invokes for `SessionStart`): the SAME
     script, SAME repo state, produces **empty stdout**. The block is
     silently dropped.
   - Root cause: `src/cli/hook/runtime.ts:474-481` marks a
     `session-start-context.sh` output section `actionable` only if its text
     matches
     `/^# (Pending Plan Capture|Capability Context Queue|Architecture
     Queue|Active Sprint)/m` (four fixed headings). `session-context-budget.ts:264`
     (`budgetSessionContext`) then does
     `const actionable = normalized.some((section) => section.actionable);`
     and if **no** section across the whole SessionStart route is
     actionable, it returns the entire aggregated payload as empty
     (`session-context-budget.ts:265-275`, `no-actionable-state`), regardless
     of whether some non-actionable section (like ours) had real, non-empty,
     in-budget content.
   - Net effect: the Goal ("standing delegation authorization is injected
     exactly once per session at SessionStart") only holds in production when
     *something else* in that SessionStart route also happens to be
     actionable in the same session (an active plan/contract, a pending
     capture, a security finding, etc.). In the common case of an idle
     session with delegation.mode=auto and nothing else going on — arguably
     the single most important case for a *standing* authorization notice —
     the agent gets nothing.
   - Recommended follow-up (not implemented, needs its own dispatch/contract
     touching `src/cli/`): extend the `scriptActionable` regex in
     `src/cli/hook/runtime.ts:475` to also recognize `# Delegation Standing
     Authorization`, or replace the heading-text heuristic with something
     structural (e.g. session-start-context.sh emitting a small sidecar
     actionable-count signal) so a fifth conditionally-emitted block does not
     require another regex edit.
   - This is why the three new/rewritten SessionStart tests in this
     work-package deliberately invoke `session-start-context.sh` directly
     (bypassing the TS dispatcher) rather than through the full CLI route —
     testing through the dispatcher would either flakily pass (only if some
     other signal happened to also be present in the temp repo) or
     legitimately fail on the exact gap described above, which is out of this
     contract's allowed_paths to fix.

2. **RESOLVED IN SLICE 2.** Stale copies of the old `delegation.rule` sentence outside `assets/`,
   found via the contract's requested `rg` sweep, not touched because they
   sit outside `allowed_paths` (`scripts/`, `assets/templates/` are not
   `assets/hooks/`):
   - `scripts/lib/project-init-lib.sh:1980` — full old sentence, byte-identical
     to the stale one this task replaced in `.ai/harness/policy.json`. This is
     a bootstrap-time default written into a *new* repo's `policy.json` by
     `repo-harness init`/adopt, so new repos would start with the now-inaccurate
     rule text until this is mirrored.
   - `scripts/ensure-task-workflow.sh:1130` — a shorter variant that omits the
     auto-mode addendum entirely (`"...only injects bounded subagent context
     after explicit user authorization such as /delegate, /parallel, spawn
     subagents, or parallel investigation"`, no mention of `auto` at all).
     Not factually wrong under the new semantics, just incomplete/inconsistent
     with the other bootstrap copy.
   - `assets/templates/helpers/ensure-task-workflow.sh:1130` — mirrors the
     `scripts/ensure-task-workflow.sh` copy above.
   - Recommended follow-up: mirror the new `.ai/harness/policy.json`
     `delegation.rule` text (or an equivalent) into all three, in a work-package
     that includes `scripts/` and `assets/templates/` in its `allowed_paths`.
   - Checked and ruled out as needing changes: `assets/workflow-contract.v1.json`
     and `.ai/harness/workflow-contract.json` do not embed this sentence (only
     an unrelated `.ai/harness/delegation` path reference), so the contract's
     "stop and report BLOCKED" clause for those two files was not triggered.

3. **`assets/reference-configs/hook-operations.md` now soft-drifts from the
   edited `docs/reference-configs/hook-operations.md`** (slice-2 finding, not
   touched). The two files were byte-identical before this task's
   `docs/reference-configs/hook-operations.md` edit. Searched for an enforced
   parity mechanism (a `sync-*`/`check:*` script pair analogous to
   `sync-hook-sources.ts`/`sync-helper-sources.ts`, or a direct
   `readFileSync(...) === readFileSync(...)` test) and found none; the only
   test referencing `assets/reference-configs/hook-operations.md` region is
   unrelated. `allowed_paths` for this contract lists `docs/reference-configs/`
   only, not `assets/reference-configs/`, so `assets/reference-configs/
   hook-operations.md` was left as-is rather than widening scope to a path
   the contract does not name. Recommended follow-up: either add
   `assets/reference-configs/` to a future contract's `allowed_paths` and
   mirror this same paragraph edit there, or confirm with the maintainer that
   `assets/reference-configs/` is intentionally a point-in-time reference
   copy with no live-sync contract, in which case no further action is
   needed.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

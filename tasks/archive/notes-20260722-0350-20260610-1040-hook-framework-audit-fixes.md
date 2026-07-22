# Implementation Notes: hook-framework-audit-fixes

> **Status**: Active
> **Plan**: plans/plan-20260610-1040-hook-framework-audit-fixes.md
> **Contract**: tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md
> **Review**: tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md
> **Last Updated**: 2026-06-10 13:25
> **Lifecycle**: notes

## Design Decisions

- ...

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

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Slice 4 — dead-hook triage verdicts (2026-06-10)

Key discovery that changed the plan's disposition: `src/cli/hook/route-registry.ts`
is the framework's declared single source of truth for event×script wiring, and it
already routes `security-sentinel.sh` at SessionStart. The "8 dead hooks" were a
Phase 0.5 bash-shim ↔ Phase 1 route-registry drift, not uniformly dead code.

| Hook | Verdict | Basis |
|---|---|---|
| finalize-handoff.sh | DELETE (absorbed) | stop-orchestrator.sh:104-126 reimplements it verbatim incl. the [FinalizeHandoff] tag |
| tdd-guard-hook.sh | DELETE (absorbed) | pre-edit-guard.sh owns edit-time TDD/BDD reminders (header + lines 96-154) |
| pre-code-change.sh | DELETE (absorbed) | pre-edit-guard.sh owns asset-layer + ContractScopeGuard warnings |
| atomic-commit.sh | DELETE (deprecated) | self-declared "Deprecated: not enabled by the shared settings template" |
| atomic-pending.sh | DELETE (deprecated) | same self-declaration |
| security-sentinel.sh | REWIRE (settings entry) | route-registry SessionStart already lists it; added to build_hooks_json + both legacy templates as a second command in the same entry (NOT chained inside session-start-context.sh, which would double-run under the Phase 1 CLI) |
| anti-simplification.sh | REWIRE (aggregated) | unique compat/branch-complexity nudge; chained from post-edit-guard.sh — registry deliberately keeps one PostToolUse-edit entry, so in-script aggregation preserves parity |
| changelog-guard.sh | REWIRE (aggregated) | release-command-only reminder; chained from post-bash.sh via TOOL_COMMAND env (stdin already consumed by parent) |

Test surface updates: scaffold-parity expected-file list, route-registry KNOWN set,
representative-hook swaps in create-project-dirs.runtime + migration-script tests,
cwd-drift test vehicle switched atomic-pending → trace-event (same SCRIPT_DIR
fallback property via hook-input.sh).

## Plan deviations log

- P2-5 reframed: hook-input.sh:118 WARN was NOT fully dead — `HOOK_STDIN_JSON_VALID=""`
  is reachable on invalid JSON. The actual gap was the silent `unknown` (no jq/bun)
  path; fixed with a once-per-process warning instead.
- prompt-guard regression tests went into tests/hook-runtime.test.ts (reuses the
  fixture infra) instead of a new tests/prompt-guard-intent.test.ts.
- /health route keeps diagnostic interrogatives (为什么/why/not firing) as health
  verbs when paired with tooling nouns — required by the existing
  "continuation diagnostics" contract test; review intent still wins for
  review/audit phrasing because the health branch demands a verb+noun pair.

## Check closeout (2026-06-10)

- Local acceptance passed for the merge batch: `bun test` (604 pass, 6 skip, 0 fail),
  required root checks, `git diff --check`, and temp-`HOME`
  `scripts/repo-harness.sh install --target both` smoke.
- `check-task-workflow --strict` initially failed only because
  `.ai/harness/handoff/resume.md` was older than `current.md`; refreshed with
  `bash scripts/codex-handoff-resume.sh --cwd . --reason check-refresh` and reran
  strict workflow successfully.
- At the 12:41 merge-batch closeout, Slice 5 was intentionally deferred and
  tracked in `tasks/todo.md`; that historical state is superseded by the Slice 5
  closeout below.

## Slice 5 closeout (2026-06-10)

- Post-edit downstream chain stays advisory but no longer silent: architecture drift,
  context contract sync, capability context request, and brain-doc sync failures now
  emit `[SyncChain] WARN` with the failing stage and exit status.
- `architecture-drift.sh` now separates resolver stderr from JSON, validates that
  capability resolver output starts as an object before parsing, and prunes stale
  pending rows for the same capability before writing a new pending request.
- `archive-architecture-request.sh` clears matching pending request pointers in
  root `AGENTS.md` and `CLAUDE.md` when a request is archived.
- Generated host settings now include `timeout: 30` for managed Claude/Codex hook
  entries in both installer code and legacy templates.
- `sync-brain-docs.sh` validates source realpaths stay inside the repo and target
  realpaths/parents stay inside the configured brain root, preventing repo or brain
  symlink escapes.
- Post-edit brain sync now does a manifest fast path before launching the Node helper:
  if `.ai/harness/brain-manifest.json` is absent or the changed path is not present
  in the manifest, the hook returns without starting `sync-brain-docs.sh`.

## Slice 5 verification notes (2026-06-10)

- Focused suite passed: `bun test tests/cli/install.test.ts tests/cli/status.test.ts tests/helper-scripts.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts`
  -> 192 pass, 0 fail.
- Full suite passed: `bun test` -> 607 pass, 6 skip, 0 fail.
- Final required checks passed after compressing `docs/reference-configs/hook-operations.md`
  and `assets/reference-configs/hook-operations.md` to 80 lines for the brain
  stub budget and refreshing `.ai/harness/handoff/resume.md`.
- Timing observations after Slice 5: `prompt-guard.sh` review prompt fixture was
  `real 0.43` in three runs; `post-edit-guard.sh` docs/reference-configs
  manifest-miss fixture was `real 0.18` in three runs and emitted only the
  architecture no-drift line, confirming the brain-sync helper was skipped.
- The earlier 12:41 deferred state is historical; Slice 5 is now complete and
  removed from `tasks/todo.md`.

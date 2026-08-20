> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: orphan-family-sweep

# Release Acceptance Review: repo-harness 0.4.2 -> 0.4.3

> **Status**: Passed
> **Scope**: `v0.4.2..HEAD` (9 commits) plus uncommitted 0.4.3 release prep
> **Checklist**: deploy/release-checklists/260613-repo-harness-0.4.3.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-13 05:20
> **Recommendation**: pass — ready for explicit publish/tag/release follow-through

## Review Surface

- Committed range `v0.4.2..HEAD`: 67 files, +3336/−221, three feature lines
  (runtime docs externalization `47fd84b`, init-hook bootstrap audit `20f0df0`,
  first-principles edit guard `7ffb2e7` + plan completeness gate fix `b469477`).
- Dirty worktree release prep: version bumps across `package.json`,
  `assets/skill-version.json`, `.claude/.skill-version`,
  `src/cli/commands/status.ts`, READMEs (5 locales), `docs/CHANGELOG.md`,
  `scripts/check-npm-release.sh` handoff-refresh fix, version-expectation test.
- Untracked: 0.4.3 release checklist, 0.4.3 prep notes, and a stale `0314`
  Draft plan skeleton.

## Findings and Dispositions

1. **Fixed — bundled handoff-protocol drift.**
   `assets/reference-configs/handoff-protocol.md` was missing the current-input
   priority step that commit `b8657c9` added to `docs/reference-configs/` only.
   Pre-existing drift, but 0.4.3 makes `assets/` the sole packaged copy
   (`docs/reference-configs/` removed from package files) and self-migration
   apply mode copies assets over docs in this repo, so the stale copy would
   ship downstream and could clobber the newer docs copy. Synced; copies are
   byte-identical again (`cmp` verified).
2. **Fixed — `init-hook.ts` unguarded user-level file read** (Codex P2,
   verified). `globalRulesChecks` read `~/.codex/AGENTS.md` /
   `~/.claude/CLAUDE.md` with bare `readFileSync`; an unreadable path (EISDIR /
   EACCES) crashed the read-only audit. Now reports `needs_agent` with an
   `unreadable (...)` detail. Regression test added
   (`tests/cli/init-hook.test.ts`, directory-at-path EISDIR case); EISDIR
   trigger demonstrated in-session.
3. **Resolved by evidence — release checklist re-run requirement** (Codex P2).
   The "re-run evidence required before publish" item is satisfied: a
   concurrent session recorded an isolated detached-worktree gate pass
   (`706/0`), and this acceptance ran the full gate on the final fixed tree
   (`707/0`). Checklist updated with the acceptance evidence section.
4. **Open (maintainer call) — stale `0314` Draft plan** (found independently by
   both reviewers). `plans/plan-20260613-0314-think-scan-init-hook.md` is an
   untracked empty Draft skeleton referencing nonexistent `0314`
   contract/review/notes; the fulfilled artifact is the committed `0328` set.
   Archive or delete before the release commit; left untouched as user work.
5. **Advisory (follow-up candidate) — first-principles guard new-file blind
   spot.** `first-principles-guard.sh` reads `git diff -- <file>`, which is
   empty for untracked files, so a brand-new file (e.g. a fresh
   factory/manager module — the canonical overengineering shape) never
   triggers the guard. Advisory-by-design hook; not a release blocker.
6. **Note — `docs/reference-configs/loop-engine-*.md`** exist only in `docs/`
   (repo-local sprint outputs, not in either documentation profile list); they
   are intentionally not bundled. No action.

## Verification Evidence

- `bash scripts/check-npm-release.sh` (pre-fix baseline, this session):
  `706 pass / 0 fail`, gate exit 0, `[release] OK: npm package gate passed.`
  Covers `bun install --frozen-lockfile`, full `bun test`,
  `check-deploy-sql-order.sh`, `check-architecture-sync.sh`,
  `check-task-sync.sh`, `prepare-handoff.sh` + `codex-handoff-resume.sh`,
  `check-task-workflow.sh --strict`, `inspect-project-state.ts`,
  `migrate-project-template.sh --repo . --dry-run`, npm registry uniqueness
  for `0.4.3`, and `npm pack --dry-run`.
- `bash scripts/check-npm-release.sh` (final fixed tree, this session):
  `707 pass / 0 fail` across 68 files, gate exit 0.
- `bun test tests/cli/init-hook.test.ts tests/cli/docs.test.ts
  tests/cli/doctor.test.ts`: `27 pass / 0 fail` (includes the new
  unreadable-file regression test).
- `npm pack --dry-run` (final tree): `repo-harness-0.4.3.tgz`, `270` files,
  includes updated `assets/reference-configs/handoff-protocol.md`,
  `src/cli/commands/init-hook.ts`, `assets/hooks/first-principles-guard.sh`.
- Mirror parity (`cmp`): all four changed hooks `.ai/hooks/ == assets/hooks/`;
  helper scripts `scripts/ == assets/templates/helpers/`;
  `assets/workflow-contract.v1.json == .ai/harness/workflow-contract.json`;
  `docs/reference-configs/handoff-protocol.md ==
  assets/reference-configs/handoff-protocol.md` (after fix).
- Version-field consistency re-verified in-session: `package.json`,
  `assets/skill-version.json` (+0.4.3 history entry), `.claude/.skill-version`,
  `CLI_VERSION` in `status.ts`, version test, README stamps (5 locales),
  CHANGELOG `[0.4.3] - 2026-06-13` section; no stale `0.4.2` stamps outside
  history/fixtures.

## Residual Risks / Follow-ups

- Stale `0314` Draft plan disposition pending maintainer decision (finding 4).
- First-principles guard untracked-file coverage gap (finding 5) is a
  candidate `tasks/todos.md` entry, not a blocker.
- Publish, tag, GitHub release, and registry readback remain explicit
  follow-through actions per the checklist.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex
> **External Source**: codex-review
> **External Started**: 2026-06-13T04:57:05+0800
> **External Completed**: 2026-06-13T04:59:45+0800

- P1 blockers: none
- P2 advisories:
  - [P2] `plans/plan-20260613-0314-think-scan-init-hook.md` is an untracked empty Draft placeholder that references missing `0314` contract/review/notes files; the fulfilled artifact is `20260613-0328`. Remove/archive/complete it before filing the release scope.
  - [P2] `src/cli/commands/init-hook.ts` reads user-level Global Working Rules files with unguarded `readFileSync`; unreadable files can crash the read-only audit instead of returning `warn`/`needs_agent`.
  - [P2] `deploy/release-checklists/260613-repo-harness-0.4.3.md` is internally inconsistent: it records `check-npm-release.sh` passed after the handoff fix but still says re-run evidence is required before publish.
- Acceptance checklist: pass

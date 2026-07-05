# Implementation Notes: frontend-task-profile

> **Status**: Active
> **Plan**: plans/plan-20260706-0140-frontend-task-profile.md
> **Contract**: tasks/contracts/20260706-0140-frontend-task-profile.contract.md
> **Review**: tasks/reviews/20260706-0140-frontend-task-profile.review.md
> **Last Updated**: 2026-07-06 01:40
> **Lifecycle**: notes

## Design Decisions

- Design-brief match rule in `verify-contract.sh`/helper: `docs/design/` path-prefix OR basename containing the substring `design` (case-insensitive), implemented as a single `if [[ "$task_profile" == "frontend" ]]` block placed after the existing per-profile `allowed_paths` conditional block and before the generic `files_exist` existence loop (~line 554 area). Both `DESIGN` and `design-brief` already contain `design`, so one substring check covers the plan's two named patterns without a second branch. Verified with manual probes (prefix-only match, basename-only match, and an arbitrary non-matching filename correctly rejected) — see Verification Evidence.
- Scaffold registration uses each file's own dominant local pattern rather than one global style: `scripts/ensure-task-workflow.sh`'s `ensure_templates()` embeds the full template body in a heredoc guarded by `[[ ! -f ... ]]` (the only pattern that function uses for all 7 prior templates, including `prd.template.md`; it has zero instances of the newer copy-only style and does not even know about `sprint.template.md`, a pre-existing gap left untouched). `scripts/lib/project-init-lib.sh`'s `pi_install_templates()` instead uses the copy-if-source-exists-else-skip pattern with no embedded fallback, matching its two most recent additions (`prd.template.md`, `sprint.template.md`). `project-init-lib.sh` has no helper-mirror copy (confirmed: no `assets/templates/helpers/project-init-lib.sh` exists), so it was a single-file edit.
- `assets/workflow-contract.v1.json` `artifacts.requiredFiles` was **not** extended with `.claude/templates/design-brief.template.md`. `prd.template.md` — the closest structural analog (also a newer, profile-specific template, also scaffolded via both generators and also gated by `check_required_file` in `scripts/check-task-workflow.sh`) — is likewise absent from that list. The two enumeration mechanisms (`workflow-contract.v1.json requiredFiles` vs `check-task-workflow.sh check_required_file` calls) already disagree for `prd.template.md`; this preserves that existing asymmetry instead of inventing new coverage the dispatch brief's own fallback clause ("if templates are NOT enumerated there, verify and record that, don't invent an entry") anticipated.
- Verified empirically (not just "looks reasonable"): an initial pass added the template file and the `ensure-task-workflow.sh` embed but forgot the `project-init-lib.sh` registration block; a `scripts/create-project-dirs.sh` smoke test in a scratch tmp dir caught the omission (file missing from scaffolded `.claude/templates/`) before it was reported as done. Fixed and re-verified with the same smoke test plus a matching `ensure-task-workflow.sh`-only smoke test.

## Deviations From Plan Or Spec

- None. All six Task Breakdown rows implemented as captured; no scope changes.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Chinese-only vs. bilingual (English anchor + Chinese gloss) section headers for `design-brief.template.md` | Bilingual | Matches this repo's mixed-language convention (contract/plan prose is Chinese under English headers); dispatch brief explicitly allowed Chinese headers; English anchor keeps headers grep/tool-friendly alongside `contract.template.md`/`prd.template.md`. |
| Register `design-brief.template.md` in `assets/workflow-contract.v1.json` `requiredFiles` | Skip | `prd.template.md`, the nearest analog, is already excluded; matching established precedent over forcing new exhaustiveness. |
| Single "contains design" substring match vs. two explicit alternations (`DESIGN`, `design-brief`) | Single substring check | Both named patterns are subsets of "contains design" case-insensitively; simpler code, same accepted set, still rejects arbitrary filenames (verified). |

## Open Questions

Adjacent findings observed during the repo-wide enum scan and scaffold-registration research, **not implemented** because the paths sit outside this contract's `allowed_paths`:

- `scripts/plan-to-todo.sh:948` and its helper mirror `assets/templates/helpers/plan-to-todo.sh:948` embed the same "Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run" fallback line (used only when `.claude/templates/review.template.md` is missing at generation time) and still lack `frontend`. This is a display hint only — `harness-trace-grade.sh` checks `review_card_change_type == task_profile` by equality, not against this string — but it will show a stale option list to humans. Needs its own `allowed_paths` grant.
- `assets/reference-configs/sprint-contracts.md`'s `## Task Profiles` table (documents each profile's default expectation) still lists only the six pre-existing profiles; also outside `allowed_paths`. A `frontend` row with no allowed_paths restriction (per this contract's explicit Out-of-scope) would fit a future docs-only slice.
- `docs/researches/20260616-harness-engineering-frameworks.md:77` references the pre-frontend profile list in prose; historical research doc, outside `allowed_paths`, informational only.
- `scripts/check-task-workflow.sh` calls `check_required_file` for `prd.template.md` and `implementation-notes.template.md` but has no such call for `sprint.template.md` or (now) `design-brief.template.md`; this script is outside `allowed_paths`. Whether `design-brief.template.md` should become hard-required (like `prd.template.md`) or stay copy-if-present (like `sprint.template.md`) is an open call for whoever owns that script.
- Pre-existing, unrelated drift observed but not touched: `assets/templates/contract.template.md` has one extra line ("- Taste constraints: ...") absent from `.claude/templates/contract.template.md`. Both paths are technically inside this contract's `allowed_paths`, but the drift predates this branch and is unrelated to frontend-task-profile; left alone to avoid unrelated scope creep (matches "do not rewrite anything WP4 added — only append").
- Environment-only gap, not a code defect: `bash scripts/check-task-workflow.sh --strict` (one of this contract's required `commands_succeed` exit criteria) currently fails on "[BrainSync] Entry ... brain file differs from source" for `docs/reference-configs/agentic-development-flow.md` and `external-tooling.md`. `git diff --stat HEAD` confirms neither file changed on this branch; `scripts/sync-brain-docs.sh` resolves its vault root to `~/Library/Mobile Documents/.../brain` (an external, machine-local iCloud path outside this repo/worktree) unless `REPO_HARNESS_BRAIN_ROOT` is set. Pre-existing local vault drift, unrelated to any commit in this branch and not addressable from this contract's `allowed_paths`; recommend `bash scripts/sync-brain-docs.sh` (write mode) on the primary checkout, independent of this task.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

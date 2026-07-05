# Implementation Notes: dev-loop-distillation

> **Status**: Active
> **Plan**: plans/plan-20260705-1419-dev-loop-distillation.md
> **Contract**: tasks/contracts/20260705-1419-dev-loop-distillation.contract.md
> **Review**: tasks/reviews/20260705-1419-dev-loop-distillation.review.md
> **Last Updated**: 2026-07-05 14:19
> **Lifecycle**: notes

## Design Decisions

- A1: reconciled helper mirrors with `cat src > dest` rather than `cp`, specifically to preserve each destination's existing permission bits (scripts/ helpers stay `755` executable even though 3 of their `assets/templates/helpers/` mirrors are `644`; that mode split pre-dates this slice and is out of scope).
- A3: `workflow_write_handoff` (assets/hooks/lib/workflow-state.sh:1739) now writes the resume packet immediately after the handoff heredoc, reusing in-scope vars, mirroring `scripts/codex-handoff-resume.sh`'s section shape (title/Generated/Resume Prompt/Source Artifacts) without refactoring that script (accepted dual-writer per plan YAGNI #6).
- A3 (scope addition beyond the plan's named file): `assets/hooks/stop-orchestrator.sh`'s `minimal_change_append_handoff` rewrites `.ai/harness/handoff/current.md` a second time *after* `refresh_handoff`/`workflow_write_handoff` already ran, whenever a minimal-change-review verdict exists. That left resume.md older than handoff.md in that one code path, provable with the new `tests/hook-runtime.test.ts` assertion (mtime comparison failed before this fix: resume `...453` < handoff `...735`). Fixed by having `minimal_change_append_handoff` `touch -r` the resume file onto the handoff file's mtime after its own mutation — no content rewrite needed since the resume packet never references minimal-change-review data. Verified live in this worktree by piping a synthetic Stop event into `.ai/hooks/stop-orchestrator.sh` directly (see report).
- B1: pre-edit STOP check confirmed `.claude/templates/contract.template.md` and `assets/templates/contract.template.md` differed only at line 30 (E4 wording) before editing, matching the plan's audit claim — proceeded to apply the identical Why/Stop Conditions/Exemplar insertion plus the E4 wording fix to both, which made them byte-identical as a side effect (verified with `diff -q`).
- B1: this repo's own contract (`tasks/contracts/20260705-1419-dev-loop-distillation.contract.md`) already carries hand-added `## Why`/`## Stop Conditions` sections predating this slice; left untouched per the task brief's explicit instruction that this file is not part of B1's scope.
- B1: audited `tests/scaffold-parity.test.ts` (~:139-144) and `tests/create-project-dirs.runtime.test.ts` (~:43) for content assertions that the new template sections could break — both use `toContain`/existence checks only (no full-content or line-count comparison), so no assertion changes were needed there; both still pass after the template edit.
- B1: the `render_contract_file` heredoc fallback in `plan-to-todo.sh` (fires only when `.claude/templates/contract.template.md` is absent in the target repo) got the same three additions in its own pre-existing local shape (`Pending` status, narrower `allowed_paths`, no `runner:` block, different `exit_criteria` shape) rather than being replaced with the canonical template's full content — the plan's mirror obligation is about keeping `scripts/plan-to-todo.sh` and its `assets/templates/helpers/` copy byte-identical to each other, not about making the embedded fallback match the two standalone template files verbatim.
- B2: the `<stopConds 非空時,以縮排 bullet 附在上行之下>` line in the plan was descriptive, not literal source; implemented as a local (non-exported) transform inside `buildRun` — split the raw `sectionBody` text on newlines, trim, drop blanks, prefix each remaining bullet with two spaces — rather than a new top-level helper, since it has exactly one call site and the plan's "用既有 helpers，不新增抽象" instruction was about the why/goal/scope/stopConds/exemplar pre-extraction, not a ban on any local formatting logic.
- B2: verified both conditional branches by hand (not just via the no-Exemplar/no-Stop-Conditions fixture already in the test suite): wrote a scratch contract with `## Why`, `## Stop Conditions`, and `> **Exemplar**` all populated, ran `bun scripts/contract-run.ts dry-run` against it, and inspected the emitted worker/verifier prompts directly. Confirmed the Exemplar line appears, the two Stop Conditions bullets render indented directly under the "Hand back..." sentence with no blank line between, and Goal/Scope/Why render their raw (un-flattened) section text — a multi-line Scope or Why section will produce a multi-line "Scope: ..."/"Why: ..." block in the verifier prompt, since the plan's spec only says trim (strip leading/trailing whitespace), not flatten-to-one-line. Judged this acceptable: the full contract text is still available file-coupled below for disambiguation, and flattening was never requested.

## Deviations From Plan Or Spec

- A1 checkbox tick shipped in its own follow-up commit (`9b17f9e`) instead of inside the A1 code commit (`d272379`): the tick was missed when d272379 was authored, and the no-amend policy in effect forbids folding it back in after the fact. A2 and A3 bundle their checkbox ticks correctly into their main commits.
- A1: `archive-workflow.sh` and `new-sprint.sh` diffs against their packaged mirrors are *not* limited to the single `REPO_HARNESS_TARGET_REPO_ROOT` prologue line the plan described — they also add a `helper_dir="$SCRIPT_DIR"` capture and swap hardcoded `scripts/<sibling>.sh` invocations for `$helper_dir/<sibling>.sh` (plus one help-text wording change in new-sprint.sh, `scripts/new-plan.sh` → `repo-harness run new-plan`). Judged this as the same portability-fix bundle rather than a STOP-triggering unrelated logic change: `helper_dir` is strictly required once the prologue can `cd "$REPO_HARNESS_TARGET_REPO_ROOT"`, otherwise the old hardcoded relative path would resolve against the wrong directory after that `cd`. Proceeded with the packaged-over-dev overwrite; full diffs are in the execution report to the parent.
- A3: touched one file outside the plan's literal list for A3 (`assets/hooks/stop-orchestrator.sh`) to close the gap above. This was necessary to make A3's own stated Why/Goal (resume.md never stale after a Stop) actually hold under the "exercise the function directly" verification the task brief itself required; the plan's STOP conditions for A3 did not anticipate this second-writer interaction.
- B5 removed from this branch's scope by parent/orchestrator directive (not a self-decided deviation): a parallel branch `codex/projection-brief-advisory` delivers a superior form that actually invokes `contract-run preflight` after projection and prints `[BriefPreflight]` advisories, rather than this plan's static `[Brief]` hint text. B5 was not implemented here; the plan's Task Breakdown row for B5 was rewritten in the B1 commit to point at that branch and name a revisit trigger (restart the row if that branch does not land).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Amend `d272379` to fold in the A1 checkbox tick vs. a separate commit | Separate commit (`9b17f9e`) | No-amend policy is explicit; an extra tiny bookkeeping commit has no real downside |
| Reorder `stop-orchestrator.sh` (`minimal_change_append_handoff` before `refresh_handoff`) vs. touch resume's mtime after both run | Touch resume's mtime after | Reordering breaks the awk begin/end idempotent strip-and-reappend, which depends on `refresh_handoff` having already written a fresh baseline handoff to strip from |

## Open Questions

- (A1's "extra hunk beyond the prologue" question was resolved via P3 judgment above, not left pending.)
- Parallel branch `codex/projection-brief-advisory`'s `[BriefPreflight]` advisory message text enumerates Goal/Scope/Allowed Paths/Exit Criteria but not `## Why` (as of this writing). Once B3 lands here (making `## Why` the one mandatory preflight-checked field), the ideal form of that advisory should also print the actual `brief_preflight.issues` list from `contract-run preflight`, which would automatically surface a missing/placeholder Why without either branch needing to hardcode a Why-specific message. Follow-up for whichever branch merges second.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
- capture-plan.sh auto-appends `## Annotations` + duplicate `## Task Breakdown` even when the body already contains one (observed twice: Phase-2 plan and this plan's capture); candidate fix in capture-plan.sh (out of Phase 3 scope).
- The minimal-change-review handoff-append pattern (a hook rewriting `workflow_handoff_file()`'s content a second time after `workflow_write_handoff` already ran) is a reusable risk shape: any future hook doing the same thing must also resync `resume_file`'s mtime the way `minimal_change_append_handoff` now does. Worth a shared `workflow_touch_resume_to_handoff` helper if a third call site appears.

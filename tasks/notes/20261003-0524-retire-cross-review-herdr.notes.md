# Implementation notes: retire cross-review onto Herdr

> **Plan**: plans/plan-20261003-0524-retire-cross-review-herdr.md
> **Contract**: tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md
> **Review**: tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md

## Design Decisions

Basecc1fc8ee already merged #476. Delete only3frozen direct runtime files and unregister CLI imports/command. Bundled Skill, catalog, hints, active docs and existing tests now route new acceptance to existing persistent fleet deep-reasoner Herdr review. The removed command remains unknown, with no provider launch/alias/automatic replay. Generic OAR host, isolation, shared subject, task-agent and current generic-review Receipt source are untouched. No old codex/claude Receipt-source compatibility is restored.

The f070semantic delta is migrated through the owned0.6.1 archctx MCP ChangeSet, approved and applied through its actual token API, not hand-edited YAML. It changes4existing entities and uses executeVerificationContract -> executeCheck. New-worktree indexed preview had only evals/checks affected and exact8projected files; normal accept receipt2dbecac0 completed default refresh.26other modules remain byte-identical. Source replacements in AXR regeneration maps cannot recreate obsolete runtime anchors. Shared verification/evals fixtures stay intact.

## Authority and deferred work

Aimpactlatestheartbeat: PhaseDmustNOTstart; Draft-only, no Ready/merge. #473/#481 Grok/OAR integration, #474/#477/worktree-lifecycle, package/lock/tsconfig and upstream declarations are unchanged. No handwritten adapter/parser is added. Gatekeeper and13integrity checks are explicitly paused. New local CodeGraph index uses the existing vendored dependency and is ignored; it prevents an unverified-proof downgrade of26unrelated modules. No global install/config change.

The original4stale candidates were closed with real noop receipts and architecturegate0 in retire-cross-review worktree at84fc4198. Their workspace receipts are retained there, not transplanted or fabricated for this branch.

After this retirement PRmerges, owner-authorized read-only OAR session resume/attach experiment will write docs/researches/oar-session-handoff/findings.md and use a separate Draft PR; no experiment starts here. OARownsworker and Herdronlypane/visibility is the frozen future direction.

## Actual verification

bun run check:type exit0, /tmp/retire-herdr-type-final.log.10related files:217pass/0fail, each --timeout60000 --max-concurrency1. Results/logs .ai/harness/runs/retire-herdr/tests-final.json. Existing build:oar-review-host produced ignored dist bundle required by the merged tests. This is not a new native/provider canary, full-suite or CI/semantic acceptance claim.

Original failures retained: prompt hint still expected old route (fixed current assertion); generic/AcceptanceReceipt tests initially lacked the bundle (existing build then rerun). No source assertions weakened. Notes/review do not issue AcceptanceReceipt or recommendation.

## Residual risks / rollback

Only existing generic-review admitted behavior is reused; actual-model, native isolation/version and session cleanup limitations remain as documented by #476. Installed old versions/sessions require their existing operator lifecycle, not alias-based replay. Revert this scoped PR if needed; preserve all historical evidence and do not reset runtime state. PhaseDandcross-devicehandoff remain separate conditional work.

Verified normalized subject before workflow evidence update: `sha256:30f53ca286b82417f3d399eb8e035576cb7b15283fc02eb7042452ba751819e7`, targetcc1fc8ee. This is execution evidence, not a reviewer verdict.

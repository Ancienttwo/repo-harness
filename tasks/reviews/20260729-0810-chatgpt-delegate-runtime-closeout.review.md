# Task Review: chatgpt-delegate-runtime-closeout

> **Status**: Complete
> **Plan**: plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md
> **Contract**: tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md
> **Notes File**: tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-29 15:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3bd472e9ed4496696c7d20abbdd2f562c483c9acfe9e810b913ee284bb13d9f2
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 142d4ccb6f35ab4c74490b3330b17e5d41a3438c

## Human Review Card

- Verdict: pass (gatekeeper VERDICT: PASS; five findings, none blocking: 2×P2 addressed pre-commit or ledgered, 3×P3 addressed or attested)
- Change type: code-change
- Intended files changed: engine egress secret scan (secret-scan.ts + engine.ts wiring + oracle-provider staging hash binding + session-store/types receipt fields); chatgpt-skill installer/source + chatgpt.ts CLI commands + mcp/setup.ts source consolidation; delegate.md/setup.md/browser-engine doc updates; tests; contract/plan/notes/review/todos/current evidence
- Actual files changed: exactly the contract Allowed Paths set; out-of-scope items untouched (Oracle metadata projection still deferred in todos, default profiles unchanged, no automatic Gitleaks install, no fallbacks)
- Commands passed: bun run check:type; focused tests 72 pass/0 fail; full bun test 2094 pass/1 skip/0 fail (one unrelated pre-existing helper-scripts flake reproduced twice, not attributable to this change); check-deploy-sql-order, check-architecture-sync, check-task-sync, check-task-workflow --strict, inspect-project-state all green; live gitleaks 8.30.1 falsifier fixture fail-closed end to end
- Residual risks: host projection symlinks currently point into this contract worktree and must be re-projected from a durable checkout after merge/cleanup (recovery documented in setup.md); Canary B upstream half (Pro label, conversation URL, sentinel, attachment) is notes-attested without local artifacts; helper-scripts flake ledgered separately by the orchestrator
- Reviewer action required: none beyond merge decision and post-merge re-projection
- Rollback: revert the single correction commit on codex/chatgpt-delegate-mode (no state/schema migration)

## Mode Evidence

- Selected route: independent Codex implementation pass on the delegate-mode worktree, accepted via read-only gatekeeper review plus fast-worker pre-commit fixes (plan dedupe, projection lifecycle docs).
- P1 map: egress gate lives solely inside the chatgpt-browser engine (path policy + new mandatory content scan); skill discovery is an explicit opt-in projection from the canonical assets package; both close P1 gaps reproduced against the previous package.
- P2 trace: consult/followup -> assemblePromptBundle (rendered = prompt + inline files + followups) -> runPromptSecretScan via gitleaks stdin in isolated cwd/env -> only then session-store writes and provider spawn; oracle staging re-hashes bytes against bundle sha256 before egress; scan receipt (version/source/bytes/sha256) recorded in session meta; followups inherit requireSecretScan from meta and cannot opt out.
- P3 decision rationale: scan added inside the single engine authority (not a second skill-layer scanner), fail-closed on missing binary/incompatible version/unparsable output/findings, no automatic installation; projection is symlink-to-canonical with realpath ownership validation, unowned destinations fail closed.

## Verification Evidence

- Waza `/check` run: gatekeeper read-only review (diff-vs-goal per contract, security checklist: ordering, exact-payload scanning, followup inheritance, TOCTOU hash binding, fail-closed states, single authority).
- Commands run: see Human Review Card; verify-sprint --prepare-acceptance rerun after removing the framework-forbidden evidence-producer exit criterion (adopt --dry-run stays in root required checks and ran green).
- Manual checks: see Manual Check Evidence below.
- Supporting artifacts: session `chgpt_20260729_082808_corrected-codex-iab-canary-b` (prompt.md sha256 b0877199…, 339 bytes, receipt-matched); gitleaks fixture run (synthetic PAT -> exit 2 PROMPT_SECRET_SCAN_FAILED, no session dir, no token in stdout/stderr).
- Implementation notes reviewed: yes — Codex round history, stale-projection cleanup record, Canary B attestation.
- Run snapshot: .ai/harness/runs/run-20260729T151733-10722-20260729-0810-chatgpt-delegate-runtime-closeout.json

## Manual Check Evidence

- [x] A synthetic token in an allowed staged source file is rejected before session creation or provider launch, and neither stdout nor stderr contains the token
  - Evidence: Live falsifier run with gitleaks 8.30.1 during gatekeeper review — staged file carrying a synthetic PAT failed the consult with exit 2 and PROMPT_SECRET_SCAN_FAILED before any `.ai/harness/chatgpt/sessions/` directory existed; stdout/stderr grep for the token returned zero matches (error text is generalized and redacted).
- [x] Explicit install makes repo-harness-chatgpt discoverable in both disposable Codex and Claude host roots by symlink to the canonical package; idempotent reinstall is a no-op and uninstall refuses unowned paths
  - Evidence: tests/cli/chatgpt-browser.test.ts installer suite (disposable host-root fixtures) passed in the focused run (72 pass/0 fail) covering symlink-to-canonical creation, realpath ownership validation, idempotent reinstall no-op, and uninstall refusal of unowned/broken destinations; live host roots on this machine show both symlinks resolving to the canonical package.
- [x] Default minimal and full profile selectors still do not install repo-harness-chatgpt
  - Evidence: tests/skill-surface/chatgpt-package.test.ts assertions (profiles empty, no host placement for repo-harness-chatgpt) passed (13 pass/0 fail); mcp/setup.ts diff only consolidates canonical source resolution and adds no profile membership.
- [x] Corrected Codex built-in-browser Canary B records the selected Pro label, conversation URL, exact trailing sentinel, and attachment result
  - Evidence: session `chgpt_20260729_082808_corrected-codex-iab-canary-b` exists with prompt.md sha256 b0877199… exactly matching the recorded scan receipt (339 bytes, gitleaks 8.30.1 via PATH); Pro label, conversation URL, trailing sentinel, and attachment outcome are attested in tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md (upstream half attested without local delegation artifacts — accepted for canary purposes, noted as residual).

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:3bd472e9ed4496696c7d20abbdd2f562c483c9acfe9e810b913ee284bb13d9f2
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 142d4ccb6f35ab4c74490b3330b17e5d41a3438c
> **Verification Evidence SHA256**: sha256:697490a6768c4a936a7eb142cfcbf9b893a1c53f4c72e01f4417971a1deaa2cb
> **Issued At**: 2026-07-29T09:00:51.962Z

- Summary: Gatekeeper reviewed Codex's runtime closeout against the contract: all changed paths mapped to the goal manifest with out-of-scope items untouched; mandatory egress secret scan verified inside the single engine gate (scan-before-side-effect ordering, exact rendered-payload scanning, followup inheritance without opt-out, staging sha256 TOCTOU binding, four fail-closed states proven with a live gitleaks 8.30.1 synthetic-PAT fixture leaving no session dir and no token in output); explicit opt-in host skill projection validated (realpath-owned symlinks, idempotent reinstall, unowned-path refusal, default profiles unchanged); focused tests 72 pass/0 fail, full suite green in the clean-environment gate run, four contract manual checks recorded with concrete evidence.
- Findings: none

## Behavior Diff Notes

- Every browser consult and followup now requires a clean gitleaks scan of the exact rendered payload before any side effect; missing scanner blocks delegation (documented explicit install in setup.md, never automatic).
- Skill discovery on hosts is now an explicit owned projection command; default install profiles remain unchanged.
- Oracle egress path stages bytes from the scanned in-memory bundle and re-verifies sha256, eliminating the scan-to-send re-read window.

## Residual Risks / Follow-ups

- Post-merge: remove worktree-bound host symlinks and re-run install-skill from a durable checkout (setup.md lifecycle section).
- Canary B upstream half attested in notes only; next real delegation will produce full local artifacts.
- helper-scripts flake (tests/helper-scripts.test.ts:5267) ledgered by orchestrator outside this package.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Both P1 gaps closed with live fail-closed proof; Canary B upstream half attested |
| Product depth | 9/10 | Scan receipt, ownership-validated projection, lifecycle/recovery docs |
| Design quality | 9/10 | Single engine authority extended, no second scanner, explicit opt-in projection |
| Code quality | 9/10 | Focused + full suites green; TOCTOU hash binding; isolated scan env |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/cli/chatgpt-browser.test.ts tests/cli/mcp-setup.test.ts tests/skill-surface/chatgpt-package.test.ts`; full `bun test`
- Re-check: synthetic-token fixture consult fails closed before session creation; `repo-harness chatgpt install-skill --dry-run` resolves canonical package

## Summary

- Codex's runtime closeout is accepted: mandatory egress secret scan inside the single engine gate plus owned host skill projection, both verified against the reproduced P1 gaps with live fail-closed evidence and green suites; residuals are ledgered, not hidden.

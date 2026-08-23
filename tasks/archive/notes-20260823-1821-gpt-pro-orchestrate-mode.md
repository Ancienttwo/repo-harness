> **Archived**: 2026-08-23 18:21
> **Related Plan**: plans/archive/plan-20260822-1240-gpt-pro-orchestrate-mode.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-1821

# Implementation Notes: gpt-pro-orchestrate-mode

> **Status**: Active
> **Plan**: plans/plan-20260822-1240-gpt-pro-orchestrate-mode.md
> **Contract**: tasks/contracts/20260822-1240-gpt-pro-orchestrate-mode.contract.md
> **Review**: tasks/reviews/20260822-1240-gpt-pro-orchestrate-mode.review.md
> **Last Updated**: 2026-08-22 12:40
> **Lifecycle**: notes

## Design Decisions

- Extend `repo-harness-chatgpt` with a routed mode instead of creating a managed fleet role or parallel Skill; the missing boundary is orchestration policy, not an executable runtime.
- Keep the first slice protocol-only. Typed bindings, receipts, and runtime adapters require a concrete gap observed in the real IAB canary.
- Reuse `references/setup.md` for the user-facing enablement guide. `orchestrate.md` declares readiness requirements and routes missing prerequisites there instead of duplicating commands or authentication rules.
- Treat a pushed-branch code audit and an unpublished-worktree review as distinct evidence classes. The former requires a visible GitHub Connector read of the exact branch-head SHA; the latter is labeled `local-bundle review` and binds the remote base SHA to a secret-scanned local delta.

## Deviations From Plan Or Spec

- The first GPT Pro review reused visible GitHub evidence from the planning turn and hashed only the implementation diff. Local gatekeeping rejected that as insufficient for the final canary. The corrected round included a canonical untracked manifest, complete untracked content, aggregate local-delta identity, and a fresh visible GitHub Connector `fetch_commit` call.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `agents/fleet/gpt-pro-orchestrator.md` | Reject | GPT Pro Web lacks native child-agent identity, sandbox, lease, cancellation, and SubagentStart evidence. |
| Parallel `gpt-pro-orchestrator` Skill | Reject | It would create a second ChatGPT protocol authority. |
| `repo-harness-chatgpt/references/orchestrate.md` | Use | It preserves the existing canonical router and isolates task-level protocol from transport implementation. |

## Open Questions

- None. The user approved widening this work-package to isolate the two absent-host `trace-observer` cases from ambient Codex host identity.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused test: `bun test tests/skill-surface/chatgpt-package.test.ts --timeout 60000` — 17 pass, 0 fail, 104 assertions.
- Canary conversation: `https://chatgpt.com/c/6a892327-046c-83e8-a4d9-552ff8729929`; visible model label `Pro`; the planning turn exposes five visible `Called tool` entries and binds remote `origin/main` to `63f0ba11017e2edf9076eeb829fa6104943bdd12`.
- Review dry-run session: `chgpt_20260822_125420_gpt-pro-orchestrate-canary-review`; Gitleaks 8.30.1 passed; exact prompt SHA-256 `7c0201eb770bf701d87da436c3c2d5706332d25a9ba26204db64b49dfb7e4d82`; implementation diff SHA-256 `2889d6c8d8145b3a2e26608ead1ff6222566c1d83929cd19c901b16ec47ee958`.
- IAB file chooser did not emit a chooser event through the documented upload path. No prompt was submitted on those attempts and no transport fallback was used; after explicit user approval, the same exact scanned prompt was pasted into the existing conversation.
- After explicit user approval, Codex IAB submitted the exact scanned prompt into the same conversation. ChatGPT represented the long prompt as a `# Task` attachment, kept the visible `Pro` model, completed after 4m26s, and returned the exact `===END OF ORCHESTRATION REVIEW===` sentinel.
- GPT Pro verdict: `PASS`; GitHub MCP evidence: `verified`; findings: none. The review explicitly remained advisory and required local gatekeeper verification. Raw reply: `.ai/harness/handoff/gptpro/gpt-pro-orchestrate-gpt-review.md`.
- Corrected review dry-run session: `chgpt_20260822_133325_gpt-pro-orchestrate-final-review`; Gitleaks 8.30.1 passed; exact prompt SHA-256 `f23c3cfaf596d5912f6b294a1b4f60cf240d0a8d488e1737e9bd8da2cb2d9fc5`.
- Corrected local subject: tracked diff SHA-256 `4dbdfe113b750d7fb903b33278a5d9a70bb8cddb16cb986017a60a1613b8c488`; canonical untracked-manifest SHA-256 `3a4ddfaad2182bcfd76413ba1c4dd28c82ed65b49f472e0d3cd2fdd773149af9`; `orchestrate.md` SHA-256 `94703f1aec369fb574764750ffd4bc7638a1272756152fb9d514319b218708af`; aggregate local-delta SHA-256 `8150bdf73186b9fee915fc78b2184382d2fea8bf7ec9d22ef133ec885ba4e032` over exact tracked-diff bytes followed by exact manifest bytes.
- In the corrected same-conversation review, the visible Pro turn invoked GitHub Connector `fetch_commit` and returned `Ancienttwo/repo-harness@63f0ba11017e2edf9076eeb829fa6104943bdd12`. GPT Pro verdict: `PASS`; evidence: `verified`; review kind: `local-bundle review`; findings: none. Raw distilled reply: `.ai/harness/handoff/gptpro/gpt-pro-orchestrate-final-gpt-review.md`; parent-observed IAB tool activity: `.ai/harness/handoff/gptpro/gpt-pro-orchestrate-final-iab-observation.md`.
- Root required checks other than the full suite passed after installing dependencies from the frozen lockfile. The ambient-host full suite produced 2827 pass, 2 skip, 2 fail only because Codex injected `CODEX_SESSION_ID`/host variables into tests that intentionally exercise absent-host defaults; the same `tests/trace-observer.test.ts` passed 9/9 with host variables cleared. No single full-suite invocation exited zero, so acceptance remains blocked.
- Final strict contract verification recorded `17/18` criteria passing and `Partial`; the sole failure was the same contract-exact full suite (`2827 pass`, `2 skip`, `2 fail`). Retained log: `.ai/harness/runs/run-20260822T135919-18254-bun-test-timeout-60000.log`.
- After user-approved scope widening, the three `runTraceObserver` calls in the two absent-host cases now pass `env: {}` explicitly. The focused trace-observer and ChatGPT package run passed 26/26, and the contract-exact ambient-host full suite passed `2829 pass`, `2 skip`, `0 fail` in 857.32s.
- The remaining root checks all exited zero after the isolation correction: deploy SQL order, architecture sync, task sync, strict task workflow, project-state inspection, and init dry-run.
- The frozen Claude reviewer found one P1 (duplicate `Task Breakdown`) and five P2 findings. The reviewed subject was corrected by retaining one plan task authority, keeping review lifecycle state nonterminal until a typed receipt exists, making the `verified` marker assertion exclusive, freezing `local.delta` byte framing, standardizing `bundle_only`, and isolating every trace-observer test invocation from ambient env unless it supplies an explicit test env.
- The corrected focused tests passed 26/26. Contract-exact verification then passed the full suite with 2829 pass, 2 skip, 0 fail; its only failure was architecture sync after the first acceptance-freeze attempt dead-lettered because this manually opened worktree lacked the primary checkout's opted-in CodeGraph index.
- `codegraph init` indexed 547 files (11,042 nodes and 44,401 edges). The official `architecture-projection retry-dead-letter` plus two drains converged from a manifest restamp to `noop`; the queue finished with one receipt and zero pending/running/dead-letter jobs, and strict architecture sync passed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

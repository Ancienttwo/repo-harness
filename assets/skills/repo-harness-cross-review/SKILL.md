---
name: repo-harness-cross-review
description: Independent acceptance review through the persistent fleet deep-reasoner task-agent in Herdr. Generic review owns scope, request-bound Result validation and typed Receipt; the old direct advisory runtime is retired.
when_to_use: "cross review, second opinion, outside voice, codex review, independent review, 让 codex 审, 找外部意见, 二审"
---

# repo-harness-cross-review

Canonical routing guidance for the existing generic review domain. Runtime
ownership lives in `src/effects/review/generic-review.ts`, the OAR host and
`src/effects/terminal/task-session.ts`; the Skill does not implement a provider.

## Mode Selection

- Acceptance through persistent Herdr task-agent: `references/generic-review.md`.
- Migration from the retired direct Codex advisory command: `references/codex-mode.md`.
- Explicit harness selection belongs to `repo-harness review round --harness`.

## Boundaries

Prepare verification and the contract before review. The existing fleet
`deep-reasoner` role, addressed Herdr pane, isolated reviewer checkout and OAR
Session own the run. History/idle are observations; the request-bound file Result
and generic-review Receipt own acceptance. Unknown model, delivery or cleanup
stays unverified or pending. Never synthesize PASS, alias the retired command,
replay an ambiguous request or bypass a frozen reviewer policy. Review does not
merge; the owner makes that separate decision. Use only the documented admitted
runtime/isolation boundary; library permission approval is not an OS sandbox.

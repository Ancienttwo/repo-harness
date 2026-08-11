# Implementation Notes: codex-native-agent-authority

> **Status**: Active
> **Plan**: plans/plan-20260811-1344-codex-native-agent-authority.md
> **Contract**: tasks/contracts/20260811-1344-codex-native-agent-authority.contract.md
> **Review**: tasks/reviews/20260811-1344-codex-native-agent-authority.review.md
> **Last Updated**: 2026-08-11 14:12
> **Lifecycle**: notes

## Design Decisions

- Codex native `spawn_agent` with the exact installed `agent_type` is the only
  fleet identity/lifecycle authority. `agents/fleet/*.md` remains the authored
  persona source and installed TOML remains its deterministic Codex projection.
- Runtime observation is separate from prompt authorization:
  `.ai/harness/delegation/native-role-routing.json` points to event-scoped
  official `SubagentStart` observations, while `latest.json` remains bounded
  advisor/permission state. A native event can produce evidence without the
  advisor file existing.
- `SubagentStart` proves only `agent_type` and `model`. Reasoning effort is
  always recorded as `configured_unverified`; it is never inferred from TOML or
  private rollout data.
- Native observations use a dedicated evidence lock, retain only the current
  scope, and cap that scope at 32 observations. The checker never falls back to
  historical scopes; absent or unverified current evidence fails strict
  readiness.
- The installer no longer reads or writes `delegation.mode`. Existing user
  config keys are inert because no compatibility reader or migration shim is
  retained.
- Stop no longer converts an unobserved explicit delegation request into a
  second dispatch instruction. Advisor state records permission and native
  spawn lifecycle only; official role/model observations live exclusively in
  the native evidence projection.

## Deviations From Plan Or Spec

- The installed global repo-harness runtime still predates this branch, so the
  new advisor-independent pointer cannot be live-read until the package is
  installed after merge. Its self-initializing behavior is covered by the direct
  typed-hook test; live model routing is covered separately by the installed
  hook's official event evidence. No synthetic payload is presented as a live
  observation.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse advisor `latest.json` for native evidence | Rejected | It couples runtime observation to semantic permission state and loses evidence when no advisor ran. |
| Add a dedicated native evidence pointer | Selected | Authorization and official runtime observation have different lifecycles; the checker and hook are two real consumers of the pointer. |
| Preserve App-thread or process fallback | Rejected | It keeps a second identity authority and can silently change the selected persona/model. |
| Expand natural-language delegation regexes | Rejected | It creates a shadow semantic parser; only typed slash commands remain hook authorities. |
| Return an in-memory verified result when evidence persistence fails | Rejected | Runtime readiness is a durable evidence claim; lock or path failure must remain observable as `unverified`. |
| Share the advisor lifecycle lock with official event evidence | Rejected | A stuck or absent prompt-advisor transaction must not suppress an authoritative `SubagentStart` observation. |
| Keep every historical native observation | Rejected | Readiness is about the current scope; unbounded history grows disk and checker cost without adding current authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Live host: `codex-cli 0.147.0`; native explorer returned `FINDINGS: COMPLETE`;
  native fast-worker created and read back
  `.ai/harness/runs/native-fast-worker-canary.txt` with its installed
  `RESULT: DONE` protocol.
- Cross-model live canary: the installed hook recorded two official
  `SubagentStart` observations in one scope: `explorer` observed and configured
  as `gpt-5.6-luna`, and `deep-reasoner` observed and configured as
  `gpt-5.6-terra`. Main-checkout `check-agent-tooling.sh --host codex
  --strict-readiness` aggregated both as `verified` with no negative or
  unverified child observations. Reasoning effort remained unverified.
- Integration: `tests/subagent-handler.test.ts` directly exercises
  `SubagentStart` without UserPromptSubmit state and asserts verified model
  evidence, an absent advisor `latest.json`, and the native pointer.
- End to end: `tests/check-agent-tooling.test.ts` runs the typed
  `SubagentStart` writer and feeds its top-level pointer directly into strict
  Codex tooling readiness; synthetic checker fixtures no longer define a
  different schema from the runtime writer.
- Branch pointer readiness before deployment remains `unverified` because the
  global installed hook cannot write the new file until this package is
  installed. The existing installed evidence path nevertheless verifies the
  live Luna/Terra model split above; the branch test proves the pointer cutover.
- Comparison source: local `/Users/kito/Projects/oh-my-openagent` at
  `b1574d648918769ae51a5b173251b5e9924d3553`; its current V2-only spawn rule is
  stale for the observed Codex 0.147 schema and cross-model runtime evidence, so
  repo-harness follows the live schema instead of copying that rule.
- ChatGPT output was excluded after the user asked to stop using it; no decision
  or evidence in this work-package depends on that conversation.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

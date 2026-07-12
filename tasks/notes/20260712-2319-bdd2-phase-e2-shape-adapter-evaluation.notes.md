# Implementation Notes: bdd2-phase-e2-shape-adapter-evaluation

> **Status**: Active
> **Plan**: plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md
> **Contract**: tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md
> **Review**: tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md
> **Last Updated**: 2026-07-12 23:37
> **Lifecycle**: notes

## Design Decisions

- Current Behavior Audit treatment remains killed and is absent from E2 authority.
- Browser and ImageGen are independent hypotheses; neither blocks the other and
  neither depends on Audit.
- Adapter provider calls happen before authority seal. Evaluated Agents receive
  content-hashed frozen evidence in an isolated model-transport-only profile with
  browser, web-search, MCP, and external tools disabled. This is not presented as an
  OS-level network sandbox because the remote model call still requires transport.
- Outcome quality and evidence compliance use separate score authorities because
  screenshots/prototypes make complete treatment blindness impossible.
- Gate impact is unknowable before condition reveal, so owner review covers every
  schema-defined reviewer disagreement rather than selectively reviewing apparent
  gate-critical cases. Scores become immutable before reveal.
- Normalized outcomes are deterministic projections of structured Agent responses;
  no LLM rewrites or semantic stripping heuristics are allowed.
- I2 uses fresh materializations of one frozen fixture tree per coordinate.
- Proposal reviewers select correction operations; a frozen table projects them to
  cost points. Only I2 measures actual elapsed human correction minutes.
- Raw provider output remains ignored evidence, while selected redacted/compressed
  evaluation assets are tracked authority so clean-checkout hash validation remains
  possible.
- If both adapters pass, I2 evaluates their bundle and makes no component-level causal
  claim.

## Deviations From Plan Or Spec

- Provider preflight after the first seal rejected `gpt-5.6` for ChatGPT-account
  Codex transport before any held-out coordinate ran. Authority was re-sealed as
  revision `r2` with supported `gpt-5.4-mini`, medium reasoning, and the current
  `web_search="disabled"` config key. The failed development smoke remains ignored
  runtime evidence and is excluded from efficacy results.
- The final `r7` authority completed 72 S2, 24 EB, and 24 EI outputs. After locked
  scores were revealed, three scoring-semantics defects were observable: the owner
  proxy aggregation rule was not frozen, declared unsupported claims were counted as
  claims made, and tracked-artifact count was not derived from filesystem evidence.
  Scores were not edited. All three hypotheses were recorded `Reshape` under the
  fail-closed ambiguity rule; I2 was recorded `gated-not-run`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep old `Shape AND Audit` prerequisite | Reject | It caused two important adapter hypotheses to remain unrun. |
| Run providers live inside Agent coordinates | Reject | It destroys reproducibility and expands the external-tool boundary beyond model transport. |
| Pre-seal provider assets and inject them | Use | It tests evidence value while preserving a deterministic model-transport-only run envelope. |
| Claim fully blind adapter review | Reject | Adapter artifacts are inherently inferable; normalized outcome scoring limits rather than hides this fact. |

## Open Questions

- A future E3 may test only corrected scoring authority. It is not part of this plan
  and does not authorize Phase P.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

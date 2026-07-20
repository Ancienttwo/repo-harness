# Implementation Notes: solo-operator-acceptance-policy

> **Status**: Active
> **Plan**: plans/plan-20260721-0540-solo-operator-acceptance-policy.md
> **Contract**: tasks/contracts/20260721-0540-solo-operator-acceptance-policy.contract.md
> **Review**: tasks/reviews/20260721-0540-solo-operator-acceptance-policy.review.md
> **Last Updated**: 2026-07-21 05:40
> **Lifecycle**: notes

## Design Source

Independent Opus (`deep-reasoner`) design-review pass, dispatched fresh-context
this session with the full mechanism already mapped out (function line
numbers, subject-hash exclusion list, all real callers). Full transcript
summary below; this notes file is the durable record since the agent
transcript itself is not.

### Verified facts (re-confirmed by the orchestrator independently, not just trusted from the agent)

- `.ai/harness/policy.json` has no `assets/` mirror — confirmed via
  `find . -name policy.json` returning exactly one hit. No lockstep-mirror
  risk for the schema addition.
- Five real call sites all route through `workflow_external_acceptance_status`/
  `_pass`/`_expected_reviewer`/`_expected_source` with zero duplicate logic:
  `scripts/ship-worktrees.sh:373` (`require_finish_ready`), `scripts/verify-sprint.sh:579`,
  `scripts/contract-worktree.sh:731-732`, `scripts/archive-workflow.sh:105,129`,
  `.ai/hooks/prompt-guard.sh:915-916,1283,1290` (advisory messaging only —
  this one calls `_expected_reviewer`/`_expected_source` to render an advisory
  string; it is not changed by this contract, so under solo mode its advisory
  text will still suggest the cross-vendor command even though the solo path
  is also available — a known, accepted minor UX gap, not a correctness gap,
  since the actual gate function still accepts the solo path regardless of
  what the advisory text says).
- Neither `ship-worktrees.sh` nor `verify-sprint.sh` passes `$2` (`expected_reviewer`)
  to `workflow_external_acceptance_status`/`_pass`, so both always use the
  function's own default-derived expected reviewer — confirming a single
  edit inside `workflow_external_acceptance_status()` covers both real ship
  paths without any caller-side change.

## Design Decisions

- **Branch inside `workflow_external_acceptance_status()`, not `_expected_reviewer()`.**
  `_expected_reviewer()` can only return one vendor name; branching there
  cannot express "either vendor," and touching it would risk perturbing the
  cross-vendor path's own behavior. Branching in `_status()` keeps the
  off-path (flag absent/false/malformed) byte-identical to today by
  construction — the solo branch is purely additive.
- **`External Source: solo-operator-adversarial-review` is a new, mutually
  exclusive literal.** `workflow_external_acceptance_source_for_reviewer()`
  (unchanged) never emits this value — it only emits `claude-review` or
  `codex-review`. This is the actual anti-rubber-stamp lever: a review file
  that's a lazy copy of the normal template (source = `claude-review`) fails
  under solo mode exactly as it fails under cross-vendor mode today. The two
  acceptance paths become structurally disjoint.
- **`Solo Operator Acknowledgement` is a fixed literal, not free text.**
  Forces a conscious, diff-visible statement (matching the todos row's own
  "not a silent bypass" requirement) rather than a checkbox that could be
  satisfied by any non-empty string.
- **`Reviewer Session Identity`/`Implementer Session Identity` are attestation,
  not proof — documented as such, not oversold.** Investigated whether
  `HOOK_RUN_ID`/`CLAUDE_RUN_ID`/`CODEX_RUN_ID` could provide a real
  machine-verifiable binding: no. The review file is hand-authored (no
  programmatic writer stamps a review-time run-id into it), and the run-id
  trail files (`.ai/harness/events.jsonl`, `.ai/harness/runs/*.json`) are
  explicitly excluded from the review-subject hash
  (`isOperationalReviewPath()`, `src/effects/review/diff-fingerprint.ts:367-388`)
  — not tamper-evident, and authorable under any run-id an agent controlling
  its own env chooses. A hard non-equality gate on these would also produce
  false failures for the exact pattern this contract is meant to support:
  the orchestrator writing the review file in the same long-lived session
  that also drove implementation (as happened for HRD-05/06/07 this
  session). Kept as required, non-empty, non-equal self-attested fields —
  cheap, catches trivially-lazy identical-string failures, but the load-bearing
  anti-fraud property is the source-marker exclusivity plus the untouched
  subject-hash freshness binding, not these two fields.
- **Genuine machine-verifiable independence was considered and rejected as
  out of scope**: would require a signed reviewer receipt written through a
  hook under the reviewer's own env run-id — a materially larger build, and
  arguably redundant with the merge-gate SHA-bound receipt that already runs
  at the ship boundary (`.ai/harness/policy.json`'s `merge_gate` key).
- **Boolean-strictness gap found and closed**: `workflow_policy_get` reads
  via `jq -r "$path // empty"`, so a JSON string `"true"` (author error —
  should be a JSON boolean) also activates solo mode, identically to a
  correct boolean `true`. This does not weaken security (writing either form
  requires the same deliberate `policy.json` edit access), but it is a type
  error worth catching — added a `validateWorkflowPolicy` check that throws
  on a present-and-non-boolean value, matching this repo's existing
  eager-validation convention for other policy fields.
- **`solo_operator` is a top-level object with a `rule` string, not a bare
  boolean**, matching every other section of `policy.json`'s existing
  convention (each policy area documents its own caveat inline) rather than
  adding a naked flag with no home for the "don't use this when you don't
  need it" caveat.
- **The "could someone with both CLIs available flip this to dodge
  cross-vendor" risk is NOT code-enforced** — policy files in this repo only
  type/path-validate, they do not self-enforce conditional applicability.
  The `rule` string documents the caveat; the real guardrail is auditability
  (every solo acceptance is greppable via its distinct source marker) plus
  human/review-time judgment, not a runtime probe for "is a second CLI
  actually unavailable" (unreliable and explicitly out of scope).

## Deviations From Plan Or Spec (found and fixed during implementation)

- **The design's original TS-only mitigation for the boolean-strictness gap
  was insufficient; added a bash-layer fix too.** The design review flagged
  that `workflow_policy_get`'s `jq -r "$path // empty"` cannot distinguish a
  JSON string `"true"` from a real JSON boolean `true` (both unquote to the
  bare word `true`), and recommended a TS-side `validateWorkflowPolicy`
  check as the mitigation. That TS check only runs inside
  `resolveEffectiveState`, a completely different code path from
  `workflow_external_acceptance_status()` (pure bash, reads the policy file
  directly via `jq`) -- so the TS validator alone would NOT have stopped a
  malformed string `"true"` from activating solo mode through the actual
  acceptance gate, silently contradicting this contract's own policy `rule`
  text ("absent, false, or any non-boolean-true value... stays completely
  unchanged"). Proven empirically: a first test-writing pass with the
  original `workflow_policy_get '.external_acceptance.solo_operator' 'false'`
  read showed a `"solo_operator": "true"` (string) policy value DID activate
  solo mode's branch (test fixture 8, before the fix, observed a `fail`
  result from the solo-mode branch instead of the expected cross-vendor
  `pass`). Fixed by adding `workflow_policy_get_strict_boolean()`
  (`assets/hooks/lib/workflow-state.sh`, right after `workflow_policy_get`),
  which uses jq's own type-aware `if (X == true) then ... else ...`
  comparison -- verified directly at the jq level that this correctly
  distinguishes a JSON string `"true"` (false), a real boolean `true`
  (true), an arbitrary malformed string like `"yes"` (false), and an absent
  key (false). The TS `validateWorkflowPolicy` check is kept as a second,
  independent layer for any caller that goes through `resolveEffectiveState`
  (defense in depth, not redundant: it throws loudly on authoring error
  rather than silently degrading to false).

## Tradeoffs Considered

| Option | Decision | Reason |
|---|---|---|
| Modify `_expected_reviewer()` to return "either" | Reject | Single-vendor-string return type; branching there risks perturbing the cross-vendor path; `_status()` branch keeps it byte-identical |
| Hard machine-checked run-id non-equality gate | Reject (kept as soft attestation) | Not tamper-evident (hash-excluded, env-authorable); would false-fail the real orchestrator-writes-the-file pattern |
| Bare top-level `solo_operator: true/false` flag | Reject | Every other policy section is an object with a `rule`; no home for the caveat text otherwise |
| Runtime probe for "is a second CLI actually available" | Reject | Unreliable signal, explicitly out of scope; auditability + documentation is the realistic guardrail |

## Known One-Shot Effects

- No existing review file has ever carried the three new solo fields — this
  is a purely additive schema change with zero migration surface.

## Merge-Time Acceptance Correction

- The final acceptance pass found that the contract repeated a mistyped,
  nonexistent execution-base SHA in three places. Those references were
  corrected to the actual reviewed `origin/main` base
  `5e10ce8177e832978ad2bd42b49e5ed74e58342c`; no runtime code or target
  revision changed. The same closeout includes the verifier-produced contract
  status transition from `Active` to `Fulfilled`.
- Two broader suggestions (mode-aware prompt copy and downstream adoption
  defaults/fallback templates) remain outside this contract's explicit
  one-function enforcement boundary. The plan intentionally requires manual
  authoring of solo fields and explicitly excludes `prompt-guard.sh`; neither
  suggestion is required for the opt-in gate to work in this self-host repo.

## Open Questions

- None. If a sixth caller of `workflow_external_acceptance_status`/`_pass`
  with independent comparison logic is found post-merge, that is the
  contract's own named Stop Condition — handle as a fresh, scoped follow-up,
  not a silent patch.

## Evidence Links

- Design source: independent Opus `deep-reasoner` dispatch, this session, 2026-07-21.
- Deferred-goal row closed: `tasks/todos.md` ("No supported path for solo operators...").
- Checks: `.ai/harness/checks/latest.json`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The "session-identity fields are attestation not proof, and here is exactly why a real machine-verifiable binding isn't feasible without a much larger build" reasoning is a durable, non-obvious conclusion worth a `tasks/lessons.md` entry if a future contract is tempted to add a similar-looking "prove it's independent" field elsewhere in this codebase.

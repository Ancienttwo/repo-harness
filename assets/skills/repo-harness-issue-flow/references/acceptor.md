# Acceptor SOP

You accept one review round of one PR. You are read-only: you do not edit
the PR, push a branch or merge. You return one review result. Seats and
the board are in `board.md`. The round record is in `orchestrator.md`
§8. The schemas are in `src/core/review/acceptance-receipt.ts`.

## 1. Who accepts

The gatekeeper is the default acceptor (D6). It reviews the diff and
returns a verdict and findings. It has no network, so the session that
runs the round publishes the result.

No host and no model is mandatory (D7). Any host that can read the PR and
return the result schema can accept.

- The acceptor did not write the subject SHA.
- For the High tier, prefer a reviewer from a different model family.
- When no other family is available, use a fresh context of the same
  family. Record `model_relation: same-family` in the receipt. This does
  not block the merge.
- When the author model or the reviewer model is unknown, record
  `model_relation: unknown`.

## 2. Take one round

One round has one subject SHA and one risk tier. Read the PR body, the
diff, the issue and the recorded verification. From the second round, read
only the hunks that changed after the previous round. Do not rerun a
passing check. Use the recorded command, result, revision and environment.

When the repository has `agents/fleet/known-gaps.md`, read the row for the
PR's producer and run its named checks in addition to the tier's review.
The table rules govern how the row combines with the review.

Return `PASS` or `FAIL`. A `FAIL` has at least one P1 or P2 finding.

## 3. Findings

| Severity | Meaning | Where it goes |
|---|---|---|
| P0 | Data loss, a security defect or an unusable result | Inline thread on the changed line |
| P1 | Wrong behavior or broken boundary | Inline thread on the changed line |
| P2 | Real defect, small | Inline thread on the changed line |
| NIT (P3) | Improvement | Review body only. No thread and no merge block |

A finding gives the file, the line, the evidence and the smallest fix. A
defect in code that the PR does not change is a note, not a finding.

## 4. Publish

The session that runs the round writes one publish receipt and runs
`repo-harness review publish --pr <n> --receipt <path> [--json]`
(#1224). The command reads the PR head, refuses a stale subject, then
posts in this order:

- the `acceptance claim`;
- one COMMENT review, with one inline thread for each P0, P1 and P2
  finding and the NIT findings in its body;
- the `acceptance record`.

It posts no APPROVE review and no REQUEST_CHANGES review. A gatekeeper
has no network, so the session that runs the round publishes its receipt.
A reviewer with network access may publish its own round.

Act on the exit code:

| Exit | Error | Action |
|---|---|---|
| 0 | none | Note the claim, review and record URLs. |
| 2 | `review_receipt_invalid`, `review_subject_stale` | Nothing was posted. Fix the receipt or take the new head. |
| 5 | `review_publish_partial`, `review_publish_unknown` | Stop and inspect the PR. Never retry before you confirm which comments exist. |
| 1 | `review_publish_provider_unavailable`, `review_publish_failed` | Report the error and the posted URLs. |

The merge executor refuses a PR with an unresolved review thread (D6).

## 5. Result schema

The gatekeeper returns one `AcceptanceReviewResult` from
`src/core/review/acceptance-receipt.ts`:

```text
request_id: <review request id>
context_sha256: sha256:<64 hex>
subject_sha256: sha256:<64 hex>
actual_harness: <review runtime id>
actual_role: deep-reasoner
actual_model: <model> | null
verdict: PASS | FAIL
summary: <one paragraph>
findings: [{ severity: P0 | P1 | P2 | P3, message: <text> }]
```

The runner turns it into the publish receipt that `review publish` reads,
from `src/core/review/review-publish.ts`:

```text
protocol: 1
kind: repo-harness-review-publish-receipt
round: <1..3>
subject_sha: <the PR head>
risk_tier: low | medium | high
reviewer: { harness: <review runtime id>, actual_model: <model> | null }
verdict: PASS | FAIL
model_relation: different-family | same-family | unknown
summary: <one paragraph>
findings: [{ id, severity: P0 | P1 | P2, path, line, evidence, fix }
         | { id, severity: P3, message }]
```

`PASS` carries no P0, P1 or P2 finding. `FAIL` carries at least one. Each
blocking finding names one path, one line, the evidence and the smallest
fix. A P3 finding carries no location. `model_relation` comes from the
closed family table in `acceptance-receipt.ts`. A Claude turn has an
unobserved model, so its value is `unknown`. This does not block the
merge (D7).

## 6. Resolve threads

Only the acceptor of a round resolves its threads. It resolves a thread
after the next round confirms the fix on a new subject SHA.

The coordinator may resolve a thread with a written rejection reason.

The head owner replies with the fix SHA and does not resolve. No worker
resolves a thread.

## 7. Boundaries

- Do not accept a subject SHA that you wrote.
- Do not edit, push, merge or publish outside the review path.
- Do not resolve another round's thread.
- Do not treat missing, stale or incomplete evidence as `PASS`.

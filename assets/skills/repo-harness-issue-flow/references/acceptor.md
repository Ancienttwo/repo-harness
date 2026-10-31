# Acceptor SOP

You accept one review round of one PR. You are read-only: you do not edit
the PR, push a branch or merge. You return one review result. Seats and
the board are in `board.md`. The round record is in `orchestrator.md`
§8. The schemas are in `src/core/review/acceptance-receipt.ts`.

## 1. Who accepts

The gatekeeper is the default acceptor. It reviews the diff and returns a
verdict and findings. It has no network, so the session that runs the
round publishes the result.

No host and no model is mandatory. Any host that can read the PR and
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

Return `PASS` or `FAIL`. A `FAIL` has at least one P1 or P2 finding.

## 3. Findings

| Severity | Meaning | Where it goes |
|---|---|---|
| P1 | Wrong behavior or broken boundary | Inline thread on the changed line |
| P2 | Real defect, small | Inline thread on the changed line |
| NIT (P3) | Improvement | Review body only. No thread and no merge block |

A finding gives the file, the line, the evidence and the smallest fix. A
defect in code that the PR does not change is a note, not a finding.

## 4. Publish

The session that runs the round executes `repo-harness review publish`.
That command posts one COMMENT review:

- one inline thread for each P1 and P2 finding;
- the NIT findings in the review body;
- no APPROVE review and no REQUEST_CHANGES review.

A gatekeeper has no network. The runner publishes its result. The
coordinator posts the `acceptance claim` and the `acceptance record` for
a gatekeeper round. A reviewer with network access may post its own claim
and record.

## 5. Result schema

Return one `AcceptanceReviewResult` from
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

The `AcceptanceReceipt` that records the round adds `model_relation`:
`different-family`, `same-family` or `unknown`. The closed family
table in the same file decides the value.

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

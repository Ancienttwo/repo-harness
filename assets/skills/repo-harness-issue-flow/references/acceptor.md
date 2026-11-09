# Acceptor SOP

You take one review in one round of one PR. You are read-only: you do not edit
the PR, push a branch or merge. You return one review result. Claim roles
and the board are in `board.md`. The round record is in `orchestrator.md`
§8. The schemas are in `src/core/review/acceptance-receipt.ts`.

## 1. Who accepts

A Low PR that meets the Low accept-seat skip takes no round and no
acceptance record (`docs/reference-configs/agentic-development-flow.md`,
Review by risk). The board marks such a PR `accepted` via `tier_low` from
`Required / CI` and the closing-issue tiers only. That status is
provisional: the merging seat confirms the verification evidence in the PR
body before the merge.

The gatekeeper is the default acceptor (D6). It reviews the diff and
returns a verdict and findings. A seat without the `net` tool group has no
network, so the session that runs the round publishes the result.

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

One round has one subject SHA and one risk tier.

### 2.1 Evidence

`Required / CI` on the exact head runs the checks. The review packet
carries the acceptance contract, the diff scope, the head SHA, the CI
status of that head and the author's recorded evidence (the commands, the
results, the revision and the environment). The packet names no command
to run.

Read the PR body, the diff, the issue and that evidence. Run a command
only when the evidence is missing, stale or failed, to prove one
suspected defect, or as a known-gaps named check (below). Run it in a
disposable HOME. Never rerun a passing typecheck or test.

When the repository has `agents/fleet/known-gaps.md`, read the row for the
PR's producer and run its named checks in addition to the tier's review.
The table rules govern how the row combines with the review.

### 2.2 Rounds

1. **Round 1** is the full tier review. Round 1 of a High PR has two
   reviews of one subject SHA, and both take the same round number: the
   gatekeeper and a second reviewer, preferably from a different model
   family (§1). They run in parallel, and each is blind to the other's
   result. Each review has its own `acceptance claim` and its own record
   row.
2. **Round 2.** Only the reviewer or reviewers that raised a blocking
   finding take the round. Each reads the fix delta (the hunks that
   changed after round 1) and the sibling cases of each of its findings.
3. **Round 3** runs with no owner question when the round-2 findings are in
   the fix delta. It has the scope of round 2.
4. **After round 3.** The loop continues without the owner while each
   round has fewer findings than the round before, the scope does not grow
   and no new P0 or P1 finding appears. Round 5 is a hard stop. When every
   remaining finding is P2, all of them are in one bug family, and none
   concerns security, secrets, data or authentication, a recorded decision
   (the owner, or a joint decision of the orchestrator and the advisor) may
   move that family to one follow-up issue after round 3 or round 4. The
   coordinator then resolves each remaining P2 thread with a reply that
   links the follow-up issue (§6). The deferral takes effect at the next
   head: a fix, a sync with main, or the commit that adds the follow-up
   link. A `FAIL` row stays on its head, so the next round reviews that new
   head with those threads deferred. It must return `PASS` for that head
   before the PR merges, and its record names the follow-up issue. A `FAIL`
   in round 5 is a hard stop and takes no deferral.
   A grown scope, a new P0 or P1 finding, a blocking finding after round 5,
   or a security, secrets, data or authentication finding becomes a parked
   owner gate (`docs/reference-configs/agentic-development-flow.md`, Park a
   gate). Other work continues.

The worker fixes each finding by the class rule (`worker.md` §7).

Return `PASS` or `FAIL`. A `FAIL` has at least one P0, P1 or P2 finding.
Rule 4 decides whether a `FAIL` after round 3 takes another round, defers a
P2 family or becomes an owner gate. A merge always needs a `PASS` record.

### 2.3 Review bot reference

The review bot that the owner configured on GitHub
(`chatgpt-codex-connector[bot]` on PRs) is a reference. It never gates a
merge and no round waits for it. It does not comment on every PR. When it
has commented, every bot comment gets a response: each review thread, each
PR comment and each issue comment.

The coordinator decides each bot finding. When an acceptor round is
active, the acceptor reads the bot threads and comments on the current
head next to the diff and raises each real one as its own finding, with
its severity. When no round is active (a Low PR that skips the accept
seat, or a bot finding after the last round), the coordinator reads them.
The decision is one of:

| Decision | Meaning | Effect |
|---|---|---|
| `adopt` | The finding is real. | It is a finding of the review loop (§2.2) with its severity. A blocking one adopted after the last round goes to the author as a fix round, and a gatekeeper seat reviews the new head before the merge; the earlier `PASS` does not cover it. |
| `decline` | The finding is wrong, out of scope or not worth a fix. | One-line reason. It is not a finding of the loop. |
| `outdated` | The finding is on an older head, and the current head no longer contains the code. | No triage again. It is not a finding of the loop. |

The `acceptance record` and the publish receipt carry no bot decision
(`review publish` renders only severity findings). The coordinator posts
the decisions in one plain PR comment, one line each:
`Review-bot reference: <comment id or thread> adopt|decline|outdated: <reason>`.
The bot's "Codex Review Summary" with no findings
(`codex-review-state` `has_any_findings: false`) gets the line
`Review-bot reference: no findings at <sha>: no action` and no reply on
the summary. A summary with findings gets one decision per finding.

The coordinator writes the replies, so each role keeps one GitHub write
path. The acceptor stays read-only. The reply uses the `review reply`
shape (`templates.md`): `rejected` for a decline or an outdated finding,
`fixed <sha>` for an adopted one after its fix round, and `deferred
#<follow-up issue>` for a rule-4 deferral. An adopted P3 gets `fixed <sha>`
when it is fixed and `deferred #<follow-up issue>` otherwise, each with the
reason in `Why`. A thread that the coordinator answers with `rejected` or
`deferred` is resolved with its reply. An adopted thread with a fix is resolved when the
fix round that addresses it is pushed.

A bot finding that arrives after the merge is triaged once: `decline`, or
`adopt` as a new issue under the batch parent. The merged PR is not
reopened.

The merge executor still refuses a PR with an unresolved thread
(`unresolved_threads`). The change is who resolves a bot thread, not the
gate.

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
seat without the `net` tool group has no network, so the session that runs
the round publishes its receipt. A reviewer with the `net` tool group
publishes its own round with this one command and no other GitHub write.
The review brief states that limit. On every seat, Codex and Pi included,
the one-write limit is a brief rule only. On a Codex seat the sandbox
limits files only.

`review publish` accepts rounds 1 to 3 only. For a round above 3, the
session that runs the round posts the `acceptance record` by hand, in the
same shape (`templates.md`, acceptance record): one row with the fields
`Round`, `Role`, `Subject` (the full head SHA), `Verdict` (`PASS` or
`FAIL` with the finding counts), then the `Model relation` line and the
findings. Post line findings as review threads (`board.md` rule 5). Do not
write the verdict in free prose: the board cannot read it, and the PR does
not count as accepted.

Act on the exit code:

| Exit | Error | Action |
|---|---|---|
| 0 | none | Note the claim, review and record URLs. |
| 2 | `review_receipt_invalid`, `review_subject_stale` | Nothing was posted. Fix the receipt or take the new head. |
| 5 | `review_publish_partial`, `review_publish_unknown` | Stop and inspect the PR. Never retry before you confirm which comments exist. |
| 1 | `review_publish_provider_unavailable`, `review_publish_failed` | Report the error and the posted URLs. |

The merge executor refuses a PR with an unresolved review thread (D6).
A bot thread is a reference input (§2.3): the coordinator answers and
resolves it, and the bot never adds or removes a gate by itself.
A PR with a rule-4 deferral (§2.2) passes this check only after the
coordinator resolves the deferred P2 threads (§6).

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

The coordinator resolves a bot thread (§2.3). The coordinator may also
resolve a thread with a written rejection reason, or
with the follow-up issue link of a rule-4 deferral (§2.2). Both are a
`review reply` (`templates.md`).

The head owner replies with the fix SHA and does not resolve. No worker
resolves a thread.

## 7. Boundaries

- Do not accept a subject SHA that you wrote.
- Do not edit, push, merge or publish outside the review path.
- Do not resolve another round's thread.
- Do not treat missing, stale or incomplete evidence as `PASS`.

# Explicit refactor shadow entry

The public `repo-harness refactor discover --repo <root> --request <json>` entry
connects the existing ArchContext scan and lifecycle readback to one local proposal
agent and an assessment. It never records a recommendation, creates an execution
Lease or Work Package, or changes activation. Both the existing refactor policy
and activation must already allow shadow. `proposal_author` must be `local`.

Request example:

```json
{
  "request": {
    "schemaVersion": "archcontext.refactor-request/v1",
    "scope": { "kind": "repository" }
  },
  "providerCalls": 3,
  "authorCalls": 1,
  "timeoutMs": 120000
}
```

Without `selection`, a complete scan with observations returns
`awaiting_selection` and the candidate list. Select the exact upstream identity:

```json
"selection": {
  "recommendationId": "<candidate.recommendationId>",
  "recommendationFingerprint": "<candidate.recommendationFingerprint>"
}
```

Candidate aliases are display labels within one invocation. Lifecycle changes can
renumber them even at the same HEAD. The public entry rejects `candidateAlias`;
a missing or changed selected identity fails closed. To pin the checkout as well,
copy the discovery HEAD and worktree digest into the upstream request's
`expectedHeadSha` and `expectedWorktreeDigest` fields.

The budgets count semantic provider operations: scan plus lifecycle readback
cost two; proposal assessment costs one more. Author calls are limited to one,
with no automatic retry. One deadline covers the invocation. Evidence and the
final author JSON are bounded to 64 KiB. The evidence includes `repositoryFiles`,
the complete regular-file inventory read from the exact scan HEAD with Git
`ls-tree`. Staged-only paths and symlinks are excluded. The author must select
exact inventory paths; the consumer also checks live path containment. Module
ownership and structural measurements remain upstream. At larger repository sizes the evidence
budget or upstream partial coverage stops the run before authoring; the harness
does not truncate authoritative evidence and continue.

Missing/partial code facts and ambiguous ownership return `proof_required`;
no observations or upstream resolved/superseded candidates return `no_action`.
Neither invokes the author. Budget exhaustion stops before the next operation.

The local author uses the existing process supervisor and `codex exec` with a
read-only sandbox, ephemeral session, no user config, and a temporary working
directory. It reuses the existing Codex child environment policy and passes
only HOME/PATH, with no inherited credential variables. Authentication still belongs to Codex. Configured MCP integrations
are not loaded. This adapter consumes bounded evidence and strict JSON, not a
review transcript or GitHub Issue authoring result. Missing runtime/authentication
or malformed output is a failure, never a synthetic proposal. It does not change
the user's Codex config or select a fallback provider.

Before assessment, the harness pins the discovery HEAD/worktree digest through
the upstream request fields. It also compares the returned repository, workspace,
model and code-facts identity with discovery before exposing the assessment.
The author's allowed fields and responsibility are validated by the existing
upstream proposal contract. Scale and workflow route remain derived from the
ArchContext assessment.

Trigger claims and immutable result receipts live under the Git common directory
at `repo-harness/refactor-shadow/v1`. Their key binds the exact request, provider
version and identity, candidate id/fingerprint and author path. A fresh lifecycle readback
precedes reuse, so these files are not a second recommendation-status ledger.
Concurrent duplicate triggers reserve one author attempt. A completed duplicate
returns the existing result. Both an initial failed result and a duplicate failed
result exit nonzero at the CLI. An interrupted claim returns
`in_progress_or_interrupted` and never silently retries. There is no automatic
claim deletion/recovery command in this slice.

Upstream handoff source: `Ancienttwo/arch-context`, merge `8463767`,
`docs/researches/20260905-repo-harness-refactor-discovery-handoff.md`, D1.
The installed consumer baseline is now npm `archctx@0.5.7` and
`archctx-contracts@0.5.7`; see the [audit repair record](20260905-refactor-057-audit-repairs.md)
for the authority boundaries, regression evidence and installed-package checks.

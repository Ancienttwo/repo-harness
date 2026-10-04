> Historical snapshot preserved on 2026-09-10 from `d2845d1b7d119c70e7f2ac2f24d26dd46f47900d`. Status and observations below describe that original investigation; they grant no current execution authority. Consult [20260907-brc13-closeout.md](20260907-brc13-closeout.md) for the later implementation boundary and [consolidation provenance](20260910-inactive-branch-consolidation.md) for disposition.

# BRC13 closeout readiness

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Research only, main baseline `188ae352`. BRC13 implementation remains pending behind BRC10; this file is a preparation artifact for the later owning contract.

The inspected source has publication reconciliation and merge/absorption predicates, budgeted GitHub comment/close, Claim/Lease readers, and ordinary worktree cleanup. It does not yet have a campaign closeout intent, actual provider merge receipt, complete CleanupReceipt, multi-Task Issue closure aggregation, exact remote deletion consumer, or cleanup-pending gate on the next group.

Persist the closeout intent before generic publication reconciliation releases the reviewing Lease. The intent must preserve campaign/group/slot, adopted Issue source, all Task/revision/Claim identities, original worktree/branch/unit, publication receipt, exact remote ref and expected head. Do not reconstruct those identities after the Lease is gone.

Use the GitHub pull request read response as the actual merge OID authority, requiring merged state and exact repository/head/base identities. Before merge, `merge_commit_sha` is only a test merge; after merge it identifies the resulting merge/squash/rebase commit. Fresh-fetch current main and separately verify reachability. Source: https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request .

Reobserve adopted Issue source before closure. All mapped Tasks require valid merge evidence for completed closure; not_planned requires durable falsifier evidence. Persist comment/close intent first. Unknown response is read-reconciliation only, never blind resend. Reuse existing provider budget admission/outcome records without calling remote Git deletion a GitHub issue-close operation.

Remote deletion should name one complete ref and use `git push --force-with-lease=<full-ref>:<expected-oid> <remote> :<full-ref>`. Git documents the explicit expected-value comparison at https://git-scm.com/docs/git-push . A disposable local bare-remote probe confirmed stale expectation refuses deletion and preserves the new head, while exact expectation deletes the ref. Evidence: `/tmp/brc13-ref-delete-probe.json`. No real GitHub branch was changed. An already absent ref is an observed idempotent success; do not infer absence from an arbitrary command failure.

Before local worktree/branch deletion, reject dirty work and foreign Lease ownership and revalidate exact topology. The future design must establish a mutation barrier shared with acquisition/binding; a scan followed by an uncoordinated delete is insufficient. Existing Task locks and campaign capacity/binding locks should be evaluated before introducing another authority.

Only after merge reachability, Issue closure, remote branch deletion, local worktree removal and local branch removal may the complete cleanup receipt be published. Any unresolved phase leaves cleanup_pending and blocks fresh group audit/advancement. Recovery consumes exact persisted phase identities and never reruns an unknown external mutation.

## Existing owning boundaries

- `src/effects/publication/publication-lifecycle.ts#reconcilePublication`: remote target observation and publication/Lease reconciliation. Capture the campaign closeout identity before calling it.
- `src/effects/automation/campaign-provider-execution.ts`: actual GitHub read/comment/close budget reservations and outcomes; preserve unknown-mutation reconciliation.
- `src/effects/automation/campaign-step.ts`: unexpected-Issue heartbeat actions; it does not own a merged Task's closeout lifecycle.
- `scripts/contract-worktree.sh` and `assets/templates/helpers/contract-worktree.sh`: existing local worktree cleanup actuator and its packaged mirror. Campaign identity and foreign-Lease admission must precede destructive cleanup.
- `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md`: BRC13 ordering and exit requirements remain the authority. This research does not complete or start that row.

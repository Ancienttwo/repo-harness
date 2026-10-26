# Provider Observations, Historical Coordination and Worktree Safety

GitHub issues and PRs own current task identity, claim, status and dependency.
Protected admission binds an approved goal and scope to an exact execution
session and claim. Local boards expose observations; they cannot grant admission,
transfer a claim or complete an issue.

## Boundaries

| Boundary | Implementation | Current use |
| --- | --- | --- |
| Provider board | `src/core/state/provider-board.ts`, `src/effects/state/collect-provider-board-inputs.ts` | Join canonical REST repository/issue IDs to all exact admitted session bindings. |
| Shared session contracts and observation | `src/core/sessions/`, `src/effects/sessions/` | Validate closed selectors, discover bounded current sessions and reobserve the selected source and admission. Operator HTTP consumes these services. |
| Protected admission | `src/effects/admission/` | Read current approval and issue goal with the same authority-root and revocation guards used by review and execution. |
| Provider and profile inputs | `src/effects/github/`, `src/effects/profiles/profile-store.ts` | Share the GitHub adapter/policy reader and resolve explicitly selected tracked engineer contracts. |
| Hook slice | `src/effects/state/collect-slice-inputs.ts`, `src/cli/hook/board-slice-context.ts` | Render the newest bounded provider observation snapshot named by `receipt-head.json`, without network or session discovery. Render only the issue reference, state and execution status, never the provider title. A missing or stale head, or a snapshot over its limits, renders no slice. |
| Historical identity | `src/core/state/coordination-identity.ts` | Derive canonical task identity and task revision from Sprint rows for explicit history. No owner-record codec remains. Current boards do not read leases or claim tokens. |
| Shared task mutex | `src/effects/locking/task-lock.ts` | Serialize admitted inbox and feedback writes at the existing shared physical path. |
| Git repository topology | `src/effects/git/task-repository.ts` | Resolve exact primary and execution roots from Git topology. Workflow target policy remains in `src/effects/state/canonical-target.ts`. |
| Worktree safety | `src/effects/state/coordination-worktree-topology.ts` | Start, inspect and remove exact worktrees under topology, runtime and deletion guards without lease authority. |

The neutral source directories share implementations across consumers. They do
not create another task state store. Provider feedback remains a Publication
responsibility at `src/effects/fleet/provider-feedback.ts`; it joins the same
admitted inbox context to explicit provider PR evidence.

## Observation and delivery paths

`repo-harness state board --repository-id <registered-id> --json` reads provider
issue observations and admitted sessions for that registered repository. It
compares complete projected revisions, with at most three observations. A
continued change returns `changed_during_read`. Discovery failures remain typed
unavailable observations, not successful empty session lists.

The fleet preserves each exact session association. An issue without an admitted
session remains a provider issue card. Runtime progress does not determine issue
status. Engineer association requires an explicit profile and contract revision;
a matching actor name is not an engineer selection.

Current diff, activity and context routes require the closed session selector and
reobserve current admission. Historical routes are explicit. A missing current
session never falls back to Sprint or lease history. External-source bindings
also select an exact observation and admitted session for the same provider issue.

Admitted inbox delivery uses the admission SHA and exact claim reference and
revision. Runtime effects also bind the session digest and selected profile
revision. Owner preparation reserves a bounded pre-prompt companion without
marking messages delivered. The Node-safe host consumer checks native/request
attribution, local approval and expiry, then reads the companion without provider
calls or delivery writes. Exact input-scoped accepted OAR proof permits the owner
to commit delivery receipts. Missing or unknown acceptance leaves delivery pending;
recovery repeats the ledger commit without resending the prompt. Native host
attribution itself grants no admission.

The task mutex still resolves through the Git common directory and uses:

```text
<git-common-dir>/repo-harness/coordination/v1/locks/tasks/<64hex>.lock
```

Moving its implementation out of the retired lease reader did not create a new
lock namespace or change directory-lock behavior.

## Cleanup and history

`contract-worktree start`, `cleanup`, `sweep` and `status` retain exact worktree
identity and merge-proof checks. Dirty, locked, marked or unknown worktrees stay
protected. Runtime and architecture services close before checkout deletion.

`ship-worktrees` ships a branch PR. Its journal records operation progress,
not task authority. It keeps frozen-head checks, provider readback and explicit
branch recovery. Local merge and contract finish/recover paths are removed.
A historical lease-mode journal can be aborted before its push lands. The same
branch, HEAD and dirty-work checks still apply. Reconcile for that retired mode
returns the journal path for manual handling.

PR readiness observes explicit canonical provider identity, expected head/base,
checks, reviews and threads, then reobserves identity. Registry-scoped adapters
first bind the selected PR repository to the local GitHub origin. Product
integration also proves the provider's actual merge commit/tree locally and its
ancestry into the exact final candidate. A merged PR state alone is not proof.

Historical Sprint documents, owner bytes and message/reply codecs remain
available where explicit history uses them. Removing the lease, claim-token,
claim-actor, engineer-binding, publication-receipt and acquire readers does not
migrate or delete stored bytes. Historical
records cannot replace current approval, provider evidence or session selection.

## Verification surfaces

- `tests/unit/provider-board.test.ts` covers exact identity joins, simultaneous
  sessions, bounded rereads and typed discovery failures.
- `tests/effects/fleet-board.test.ts` covers actual provider fixtures, repository
  binding, cancellation, concurrency limits and per-card failure containment.
- `tests/effects/operator-task-diff.test.ts` covers current admission, exact
  session selection, bounded discovery and explicit history separation.
- `tests/effects/admitted-task-inbox.test.ts` covers exact recipient fences,
  retry, delivery and acknowledgement evidence, and bounded admitted activity
  pages. `tests/board-slice.test.ts` covers bounded hook output and cross-host
  byte equality.
- `tests/coordination-identity.test.ts` covers task identity, revision
  granularity and duplicate task ID refusal.
  `tests/coordination-lease-store.test.ts` retains shared lock and exact worktree
  cleanup tests; its filename does not imply an active lease reader.

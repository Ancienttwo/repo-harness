# Task Board audit and repair (#316, #317, #320)

## Scope and baseline

- Repository: `Ancienttwo/repo-harness`
- Audit baseline: `main` at `1a9a5ae1`
- Design contract: `docs/design/DESIGN-local-human-control-board-v1.md` (v2 "exactly one write", 2026-08-31 presentation amendment)
- Prior audit: `docs/researches/20260901-operator-board-audit-hardening.md`
- Audit slices, five in total:
  1. Operator server and API transport (`src/effects/operator/server.ts`)
  2. Fleet snapshot pipeline (`src/core/fleet/board.ts`, `src/effects/fleet/board.ts`)
  3. Browser UI (`src/operator-web/`)
  4. Task Message write plus collaboration read (`src/effects/fleet/task-inbox.ts`, `src/effects/fleet/task-message-request.ts`, `src/effects/operator/collaboration.ts`)
  5. Agent Runtime probe against a live board
- Shipped as three merged pull requests: #316 `codex/operator-web-composer-truth`, #317 `codex/operator-server-write-gate`, #320 `codex/fleet-board-card-containment`.

## P1 · Architecture map

The Task Board is a read projection with one write. `src/effects/fleet/board.ts` collects per-repository observations and hands them to the pure projection in `src/core/fleet/board.ts`, which assigns each card a column, an attention owner, and the fleet-level counts and digest. `src/core/operator/fleet-snapshot.ts` narrows that snapshot to the transport-safe `OperatorFleetSnapshotV1`, which `src/effects/operator/server.ts` serves alongside the per-repository collaboration projection from `src/effects/operator/collaboration.ts`. The browser in `src/operator-web/` is a strict decoder and a presentation client: it invents no identity and holds no second copy of a count. The single write is a Task Message — the browser POSTs one envelope, the server dispatches to `src/effects/fleet/task-message-request.ts`, which resolves the registered repository against `src/effects/repo-registry.ts` and publishes through `src/effects/fleet/task-inbox.ts` under the canonical task lock. Everything else on the board, including the collaboration slice, is observation only.

## Findings fixed

### #316 — browser composer truth, contrast, and drafts

Scope: `src/operator-web/App.tsx`, `src/operator-web/i18n.ts`, `src/operator-web/types.ts`, `src/operator-web/styles.css`, `src/operator-web/fixture.ts`.

- The composer named the wrong target. `composerScope` returns `'claim'` only for a `bound` lease, but the copy branched on scope alone, so a `reserving`, `completing`, `reviewing`, or `unknown` lease with a live claim was described as having no holder. The copy is now derived from claim identity plus lease state and names the holder for all seven lease states in both locales; the chosen scope and the POST envelope are unchanged, because `src/effects/fleet/task-inbox.ts` accepts claim scope only when the lease is `bound` and otherwise fails `recipient_unavailable`.
- The send button failed WCAG AA at 3.76:1. It moved to a darker carrot with `--text-inverse` for 5.43:1, and the disabled state received its own opaque neutral pair instead of inheriting the shared alpha, which composited a passing pair down to 2.6:1.
- Escape discarded a non-empty draft. The document-level handler in `App.tsx` now ignores the key when the event target is inside the composer panel and the body is non-empty; the explicit close control remains the deliberate discard path.
- Error copy became client-owned. Client error constants are keyed by code through `clientApiError` and the `i18n.ts` dictionary; the closed set of server codes is localized, and an unknown code renders the server's English `message` as an explicitly labelled passthrough.
- The counts had two authorities. The status bar now renders `snapshot.counts` only: the All chip counts cards, and the unreadable chip is labelled as repositories. The runtime probe had shown All = 929, which was 914 repositories plus 15 cards.
- The footer prints `—` when there is no snapshot instead of printing the protocol constant, and `effect_sha256` is validated as a nullable `^sha256:[0-9a-f]{64}$` rather than as any non-empty string.
- The UI fixture became a payload the production decoder accepts, with deterministic revision digests and claim UUIDs and cards for the previously unrepresented lease states. `decodableSnapshot()` was deleted and the tests that depended on it route through `decodeOperatorFleetSnapshot`.

### #317 — structural write gate and transport hardening

Scope: `src/effects/operator/server.ts`, `src/effects/operator/collaboration.ts`, `tests/effects/operator-write-boundary.test.ts`.

- `OPERATOR_ROUTES` had zero consumers, so the "exactly one write" boundary was a comment. The inventory is exported and gated: a test asserts exactly one entry with `write: true` and pins each inventory pattern to the dispatcher's own literals, with a negative probe that must fail the assertion.
- The shared Fleet in-flight collection is now cleared at cancellation rather than at settlement. Previously the abort path drained a grace period and waited for the collector process group, so a page reload inside that window inherited the dying collection and received a 503; the collaboration path already cleared synchronously.
- The write route gained bounded admission with a typed 503 (`task_message_busy`, fixed public sentence, `Retry-After`). The browser only ever has one send in flight, so the cap does not change product behaviour.
- Non-JSON bodies are refused with 415 after the Origin barrier, keeping the CSRF check first in the ordering.
- The collaboration worker payload is validated for `protocol` and `kind`, and its `repository_id` must equal the requested id; a mismatch is the typed `collaboration_repository_mismatch` refusal, with no id translation and no fallback to the requested id.
- The `/api` prefix is matched case-insensitively so no case variant can fall through to the SPA shell, while the route patterns themselves stay exact.
- Headers and observability: CSP gained `base-uri` and `form-action`, 405 responses carry `Allow`, and one stderr refusal line is emitted per non-2xx response through a single `sendRefusal` wrapper, carrying method, status, error code, and a truncated pathname — never the body, headers, or Origin value.

### #320 — card-level containment and write-lock protocol

Scope: `src/core/fleet/board.ts`, `src/effects/fleet/board.ts`, `src/effects/fleet/task-inbox.ts`, `src/effects/fleet/task-message-request.ts`, `src/core/operator/fleet-snapshot.ts`, `src/operator-web/types.ts`, `src/operator-web/i18n.ts`.

- Failure containment moved to the card. One throwing observation used to mark a whole repository `unreadable` with an empty card list; a card now carries a typed `error` from the closed `FleetBoardErrorV1` vocabulary with `column: null`, and the repository stays `ok` with `snapshot_consistency: 'degraded'`. No data is invented for the failed card. Repository-level `unreadable` is reserved for failures that occur before any card can be read.
- The inbox scan skips a non-current-revision event instead of aborting. A single stale event previously made an entire task inbox unreadable forever after a sprint row edit. `superseded_revision_count` makes the skip observable. `task_revision_mismatch` stays fail-closed on the send path, where the caller names one specific revision.
- `counts.unclassified` was added additively to the counts, the digest basis, and the transport projection; `FLEET_BOARD_PROTOCOL` stays 3.
- The round deadline can now preempt the synchronous phase. Collection yields to the event loop between repositories and re-checks liveness after each yield, and "still pending at the deadline" is a recorded in-flight token rather than a clock read after the await — a repository that finished before the deadline keeps its result instead of being relabelled `repo_collection_timeout`.
- Agent Runtime revision is folded into the per-card consistency check, so a torn join between repository-level statuses and per-card receipts is reported as `changed_during_read` on the card that observed it.
- The provider limiter transfers its slot inside `release()`, so the slot is never observably free between waking a waiter and that waiter incrementing the active count.
- Registered-path authority is compared through `realpathSync` on both sides. A registered path under a symlinked ancestor is accepted; a symlinked or non-directory leaf remains the rejected invariant.
- The operator write lock protocol is task-outer, registry-inner, with a single critical section that re-proves registration and `access_mode` and performs the write. The plan had specified the reverse — validate under the registry lock, release, then take the task lock — and an external review reproduced the revoke-after-check window that order leaves open on an intermediate commit: a revocation committing between the unlocked re-read and the write was still published. The repro now fails closed. The notes record the deadlock proof for the task → registry nesting.
- The browser decoder was extended in the same slice for the new card `error` and `counts.unclassified` fields, which are required members of a type `src/operator-web` shares, plus the `origin_required` code the merged server already returned.

## Verification summary

- Branch-local full suites on the frozen worktree heads: #316 4265 pass / 4 skip / 0 fail; #317 4192 pass / 4 skip / 0 fail; #320 4335 pass / 4 skip / 0 fail.
- `tsc --noEmit` clean and `bun run build:operator-web` successful on each branch.
- `verify-contract --strict`: 21/21 Fulfilled (#316), 27/27 Fulfilled (#317).
- The six repository-integrity checks exited 0 on each branch.
- Live probes: an Operator server reload race returning 200 after a sole-client disconnect, a `text/plain` POST returning 415, `/API/v1/fleet/snapshot` returning a JSON 404, and a board payload showing `counts.unclassified` equal to the number of cards with `column: null`, protocol 3, and no absolute paths.

## Decisions and preserved invariants

- `FLEET_BOARD_PROTOCOL` stays 3. Every new field is additive on both the collector payload and the transport projection.
- No invented data. A failed observation produces a typed error and null/empty fields, never a substituted value; an unknown server error code is passed through with an explicit label rather than being guessed at.
- The card error vocabulary stays closed and shared with the browser decoder's allowlist.
- `access_mode` on the registry entry is the operator board's write authority. The CLI and MCP `sendTaskMessage` sibling writes without the registry lock by design: it is not the operator boundary and does not claim that authority.
- R1 delivery and reachability still never move a card between columns. The runtime signal informs consistency, not classification.

## Deferred and open items

Recorded in `tasks/todos.md`. Two of them predate this closeout and were already in the ledger: deriving the claim-scope canonical fence from the lease record, and letting R1 delivery and reachability contribute to `attention_owner`.

1. `attention_owner` ignores the R1 `failed`, `reconciliation_required`, and `unavailable` states, and `addressed_to_current_claim` is currently equivalent to `unread_count > 0`. Both are product contract decisions rather than projection details.
2. The claim-scope canonical fence resolves through the main checkout's active-sprint marker rather than the lease's own `sprint_path` / `target_ref`, so a worktree agent whose marker differs is refused with `claim_mismatch`.
3. `task_label: null` conflates "no sprint row" with "a row whose Task cell is empty".
4. `superseded_revision_count` reaches only `repo-harness fleet inbox list --json`, which serializes the whole `listTaskInbox` result; the Fleet card summary does not carry it.
5. `scripts/check-ci.sh` halts at the first failing test file when `BUN_TEST_ISOLATE_FILES=1`, because the per-file loop runs under `set -e`. Any early failure hides the rest of the suite; observed 2026-09-05, everything sorting after `tests/architecture-projection-provider.test.ts` was unexercised for several `main` commits.

One machine-local observation is not a repo goal and is recorded here only: the local repository registry on the audit machine carried roughly 900 unreadable entries, which made every local snapshot `degraded`. The likely cause is test fixtures registered into the real registry rather than a disposable one.

## Closeout

The three work-package families — `fleet-board-card-containment`, `operator-server-write-gate`, and `operator-web-composer-truth` — were archived with `archive-workflow --outcome Superseded`. `--outcome Completed` was attempted first and refused: `archive-workflow: Completed requires current passing verify-sprint evidence`. The three families shipped through PR merge with gatekeeper acceptance rather than through the sealed acceptance-receipt chain, so the `Completed` gate has no receipt to verify from a closeout checkout. `Superseded` is the outcome that records the family as retired without asserting an acceptance receipt it never produced.

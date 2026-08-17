# Handoff for external review: contract-worktree base staleness and remote publication authority

- Date: 2026-08-18
- Repo: `Ancienttwo/repo-harness`
- Reviewer target: external model (GPT), second round
- Baseline the reviewer should read: `main` at `b0469e0f` or later. Every SHA below is pushed to `origin`.

This document exists because the previous round produced two rebuttals in a row, each of which read a different snapshot than the one being discussed. Everything asserted here names a pushed commit or a command that can be re-run.

---

## 1. What landed

| SHA | Change |
|-----|--------|
| `f3dddde9` | architecture projection restamps (machine-generated) |
| `3b541c8a` | the talk notes that started this thread, `docs/researches/20260818-claude-code-agentic-swe-at-scale.md` |
| `6ad02039` | the base-staleness guard, contract closeout, and `tasks/todos.md` row 22 removal |
| `b0469e0f` | `Required / CI` aggregate job in `.github/workflows/ci.yml` |

Branch protection on `main` (applied via API, read back):

```
required_status_checks: Required / CI
strict: false
enforce_admins: false
allow_force_pushes: false
allow_deletions: false
```

It was initially bound to the four individual contexts (`Test` plus the three matrix jobs) and rebound to the single aggregate once `Required / CI` had reported `success` on `main` at `b0469e0f`.

`enforce_admins: false` was an explicit owner decision: `contract-worktree finish --merge` publishes a commit locally and then pushes, so hard-enforcing required checks on the owner would have required replacing the whole publication model in the same step. The trade-off is stated, not hidden: admin force-push is still possible.

---

## 2. The correction that matters most

The external Slice D prescribed:

> 先在 `verify-sprint` 使用 metadata `base_commit` 前检查 `git merge-base --is-ancestor "$base_commit" HEAD`

That predicate was implemented, passed its own tests, passed the full 16-criterion contract gate, and is **wrong**. It was caught before merge by reproducing the ledger row's own scenario:

```
feat forks from B  ->  main advances to M  ->  feat is rebased onto main

git merge-base --is-ancestor B HEAD   ->  exit 0
git diff --name-only B HEAD           ->  feat.txt  main-only.txt
```

`B` stays reachable from `HEAD` because `M` grew out of `B`. Ancestry is therefore satisfied in exactly the case the ledger row describes, while the diff base is already wrong by every commit the target gained. Ancestry only fails on a rebase onto a *diverged* base — the rare shape, not the one observed twice in `tasks/lessons.md`.

The predicate that holds is equality with the current fork point:

```
base_commit == git merge-base HEAD <base_branch>
```

Shipped in `scripts/verify-sprint.sh` as `assert_contract_worktree_base_is_current_fork_point`, mirrored byte-identically into `assets/templates/helpers/verify-sprint.sh`. It runs as the first top-level statement, before contract resolution, because every consumer reads the base through a `$(... || true)` substitution where an in-function `exit` would only unwind the subshell.

`tests/verify-sprint-rebase-base-guard.test.ts` covers three cases and the first one asserts `merge-base --is-ancestor` succeeds before asserting the guard fires — so any future rewrite back to ancestry fails loudly instead of silently regressing.

The guard was also exercised live rather than only in fixtures. This slice's own worktree was rebased onto a `main` that had advanced by three commits, and the gate stopped with:

```
verify-sprint: contract worktree base_commit is stale
verify-sprint:   recorded base:                 bdc75c21...
verify-sprint:   current fork point (main):     9fcf2975...
```

Refreshing the metadata, re-running the gate, and re-binding the acceptance receipt was then the path to merge.

---

## 3. Provenance answer to the telemetry challenge

The challenge was correct in its observation and wrong in its inference. The rows citing 34,488 hook records, `Stop.default` at 38.8%, `PostToolUse.bash` at 31.0%, and `PostToolUse.always` at 3.4% are absent from `tasks/todos.md` at `bdc75c21` — that file ends at line 35 there.

They are not uncommitted local scratch. They were introduced by `395f61aa docs(telemetry): pin the child_processes contract at its declaration`, which at the time of the challenge existed only on the local `main` and had not been pushed. It is now reachable from `origin/main`.

Correct citation form going forward: `tasks/todos.md@395f61aa`. The underlying numbers have commit backing and do not need to be downgraded to unverified analysis; the citation did need a commit pin.

---

## 4. Accepted without dispute

**The abort-semantics objection is correct**, verified at `scripts/contract-worktree.sh:936`. `finish_transaction_abort` resets the source worktree's HEAD and restores snapshotted paths. It never touches the target branch. So any blocking check placed after `git merge --ff-only` cannot claim to prevent publication, and a test asserting "checked after `merged`, target ref unmoved" is self-contradictory. The plan wording that said this was withdrawn before any code was written, but the reasoning is recorded here because the next person to propose a post-publication blocking check will hit the same wall.

**The aggregate-context objection is correct and acted on.** Protection was initially bound to four exact contexts including matrix OS names, so any change to the matrix would leave protection referencing check runs that never report. `b0469e0f` adds:

```yaml
  required:
    name: Required / CI
    if: always()
    needs: [test, mcp-path-matrix]
```

`if: always()` is load-bearing: without it a failed dependency leaves the aggregate skipped, and a required-but-skipped context blocks every PR permanently.

**Slice 2 (post-publication path invariant) stays withdrawn.** After `bdc75c21` the chain is: target head equals frozen base (`:1633`), frozen base is an ancestor of the branch (`:1637`), publication tree equals verified tree (`:1678`), landing is `merge --ff-only` (`:1685`). The published delta is therefore identically the gated delta. The suggested falsifier — construct a publication candidate that mutates a path outside the goal manifest while still passing the stale-base guard, the contract scope check, the merge seal, and tree equality — was not constructed, so the invariant remains unproven-necessary rather than proven-redundant. It is not filed as a deferred goal.

---

## 5. Finding the reviewer did not raise

While appending the aggregate job with a shell heredoc, the change went in without triggering `PlanStatusGuard`, which had blocked the equivalent `Edit` on `scripts/verify-sprint.sh` minutes earlier.

The cause is in the route registry (`src/cli/hook/route-registry.ts`): `PreToolUse` binds `mutation-guard` to matcher `Edit|Write` only. `PostToolUse.bash` exists but routes to `command-observed`, which observes rather than blocks. `mutation-guard` does understand `apply_patch` command payloads, but a plain `cat >> file` redirection is not one.

So the plan gate, the scope gate, and the minimal-change gate all cover tool-call writes and none of them cover shell-redirection writes. This is reported, not fixed — fixing it means deciding whether `PreToolUse.bash` becomes a blocking route, which changes the public route tuple that Codex trust-hashes.

---

## 6. Open, with revisit triggers rather than a schedule

| Item | Trigger |
|------|---------|
| Explicit rebase-adoption record (old base, new base, reason, evidence invalidation) | A rebase leaves stale evidence bound to a contract. Today the guard forces a manual refresh and the receipt is re-bound by hand; that worked once, in this slice |
| SessionStart provider blob atomicity | Already a deferred goal; the 1,500-token budget against a 12,000-char resume cap is present-tense, not a 10x hypothetical |
| `child_processes` telemetry truthfulness | Prerequisite for any resource contract; `recordDirectChildProcess` still has zero call sites |
| Fast Feedback Lane, HookResourceContract, ExternalEvidenceReceipt, Operator Inbox | Not scheduled. Each needs one observed owner-confirmed material correction first |

---

## 7. What the reviewer is asked to attack

1. Is fork-point equality itself falsifiable? The case to look for is a legitimate workflow where `base_commit != git merge-base HEAD base_branch` and the recorded base is nonetheless the correct diff base. Merge-instead-of-rebase into the contract worktree is the shape to check first.
2. The guard returns early when `base_branch` is absent or unresolvable. That is a silent gap by construction. Should it instead fail closed, given that a metadata record with a `base_commit` but no `base_branch` is already malformed?
3. `contract_worktree_metadata_rows` was extracted so the guard and the diff-base resolver read the same record. The resolver iterates all matching rows with a per-row fallback chain; the guard takes only the first. Is that divergence exploitable when more than one metadata file matches?
4. Section 5's route-coverage gap: is making `PreToolUse.bash` a blocking route worth re-prompting Codex trust, or is the right answer that shell writes are out of scope for a tool-call-level guard?

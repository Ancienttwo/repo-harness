# Handoff for external review: contract-worktree base staleness and remote publication authority

- Date: 2026-08-18
- Repo: `Ancienttwo/repo-harness`
- Reviewer target: external model (GPT), second round
- Baseline the reviewer should read: `main` at `83d80780` or later. Every SHA below is pushed to `origin`.

This document exists because the previous round produced two rebuttals in a row, each of which read a different snapshot than the one being discussed. Everything asserted here names a pushed commit or a command that can be re-run.

---

## 1. What landed

| SHA | Change |
|-----|--------|
| `f3dddde9` | architecture projection restamps (machine-generated) |
| `3b541c8a` | the talk notes that started this thread, `docs/researches/20260818-claude-code-agentic-swe-at-scale.md` |
| `6ad02039` | the base-staleness guard, contract closeout, and `tasks/todos.md` row 22 removal |
| `b0469e0f` | `Required / CI` aggregate job in `.github/workflows/ci.yml` |
| `83d80780` | Stop-time advisory for implementation changes with no active plan |

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

A first draft of this section claimed the plan gate, the scope gate, and the minimal-change gate were all bypassed. That was wrong and is corrected here. The gates split cleanly by where they read their input:

- **Diff-derived, not bypassable.** `allowed_paths_check` reads `git_changed_files_list` (`scripts/verify-sprint.sh:357`), which is `git diff --name-only` plus `ls-files --others`. It cannot tell how the bytes arrived and does not need to. A shell write inside a contract worktree is caught exactly like an `Edit`.
- **Pre-write, bypassable.** `PlanStatusGuard` exists only inside `mutation-guard.ts` (`:552`) and fires only on the `Edit|Write` matcher. There is no diff-derived equivalent anywhere in `src/` or `scripts/`.

So the gap is one gate, not three: authorization that is enforced at write time is mechanism-dependent by construction, while authorization enforced on the resulting diff is not.

That reframes the fix. Building a shell-write parser for a blocking `PreToolUse.bash` would be a heuristic shadow parser over an unbounded surface — redirections, `tee`, `sed -i`, `python -c`, `eval`, subshells — which this repo's own rules forbid, and which would grant false confidence while staying trivially bypassable. It would also duplicate, unsoundly, what the diff-derived gate already does soundly.

The sound shape is to give the plan gate a diff-derived observation point alongside its pre-write one, so that "implementation changed without an approved plan" is decided from the changed set rather than from the tool that produced it. **This landed in `83d80780`**, advisory-only by owner decision.

`runStopHandler` now filters the changed set it already computes for the architecture drain — `computeArchitectureDriftChangedSet`, which reads `git status --porcelain -z` and is therefore indifferent to write mechanism — through the already-exported `isImplementationSurfacePath`. When no active plan is present and the result is non-empty it emits two stderr lines and appends one record to `.ai/harness/runs/unplanned-implementation.jsonl`. Exit code, the `decision: block` stdout path, lite profile, and sessions with an active plan are all untouched. `tests/stop-handler-unplanned-implementation.test.ts` covers fire, active-plan silence, workflow-surface silence, and clean tree.

Three choices in it are worth attacking:

- **Advisory, not enforce.** No data exists on how often this fires during ordinary work on `main`. The repo's own 2026-08-17 lesson is that tightening a gate against imagined receipts designs for the wrong thing, so the enforce decision is deliberately deferred until the JSONL can be read.
- **Plain JSONL, not a telemetry metric.** Adding a field to `hook-events.jsonl` would have been the obvious route, but `event-telemetry.ts` carries a measurement-completeness contract and already has one metric (`child_processes`) declared complete while never populated. Repeating that shape to collect data *about a gate* would be self-defeating.
- **No policy key.** Adding the switch before knowing whether anyone should flip it is designing the upgrade path ahead of the evidence.

---

## 6. Open, with revisit triggers rather than a schedule

| Item | Trigger |
|------|---------|
| Explicit rebase-adoption record (old base, new base, reason, evidence invalidation) | A rebase leaves stale evidence bound to a contract. Today the guard forces a manual refresh and the receipt is re-bound by hand; that worked once, in this slice |
| SessionStart provider blob atomicity | Already a deferred goal; the 1,500-token budget against a 12,000-char resume cap is present-tense, not a 10x hypothetical |
| Fast Feedback Lane, HookResourceContract, ExternalEvidenceReceipt, Operator Inbox | Not scheduled. Each needs one observed owner-confirmed material correction first |

---

## 7. What the reviewer is asked to attack

1. Is fork-point equality itself falsifiable? The case to look for is a legitimate workflow where `base_commit != git merge-base HEAD base_branch` and the recorded base is nonetheless the correct diff base. Merge-instead-of-rebase into the contract worktree is the shape to check first.
2. The guard returns early when `base_branch` is absent or unresolvable. That is a silent gap by construction. Should it instead fail closed, given that a metadata record with a `base_commit` but no `base_branch` is already malformed?
3. `contract_worktree_metadata_rows` was extracted so the guard and the diff-base resolver read the same record. The resolver iterates all matching rows with a per-row fallback chain; the guard takes only the first. Is that divergence exploitable when more than one metadata file matches?
4. The advisory in `83d80780` runs on `Stop.default`, already the largest measured share of hook time. It adds one `Array.filter` over an already-computed array and, only on a hit, one file append — no new subprocess and no second `git status`. Is that accounting complete, or is there a cost path in it that was missed?
5. Advisory-only means an agent can read the line and keep going. Is a signal nobody is forced to act on worth the code, or does it just become noise that trains everyone to ignore a `[PlanStatusGuard]` prefix that *does* block in its pre-write form?

---

## 8. Round-two findings, reproduced

The second external review landed four claims against `6ad02039`. Three were reproduced locally and are confirmed defects in what shipped; one made an outdated item in this document obsolete.

### Confirmed: the metadata-row selector is bypassable

`contract_worktree_metadata_rows` emits `\x1f`-joined rows and skips only rows that serialize to the empty string. A record matching this worktree with every field empty serializes to `\x1f\x1f`, which is **not** empty. The guard takes `head -1`, decodes empty fields, and returns silently; the resolver skips that row and takes the stale base from the next one.

Reproduced with two metadata files in one fixture — `00-empty.json` (exact-worktree match, all fields empty) and `10-stale.json` (branch match, pre-rebase base):

```
rows:
^_^_
bc6c41e2...^_main^_
resolver picks: bc6c41e2...        # the stale base
guard output:   (none)             # silently passed
```

With `00-empty.json` removed, the same fixture fires correctly. So the code comment in `contract_worktree_metadata_rows` — "the guard and the resolver must agree on which record describes this worktree" — asserts an invariant the implementation does not hold. That comment is the defect's best evidence against itself.

The reviewer is right that the fix is not to make the guard loop too. Guard and resolver must consume one selected record, chosen by a single typed selector with exact-worktree precedence, duplicate detection, and the source file carried through.

### Confirmed: `jq` absence silently disables the guard

`contract_worktree_metadata_rows` opens with `command -v jq >/dev/null 2>&1 || return 1`, and the guard converts that into "no rows" and returns 0. On the same fixture with a stale base, with `jq` on `PATH` the guard fires; with `jq` removed from `PATH` it produces no output and exits 0.

`jq` is documented as optional. A scope-base authority that describes itself as fail-closed must not disappear when an optional dependency is missing.

### Confirmed by code reading: `start` and the guard disagree on what `base_commit` means

`contract-worktree.sh` records `base_commit = source HEAD` when it creates a new branch and `merge-base(HEAD, base_branch)` when it reuses one. The guard asserts the second form unconditionally. Starting a contract from a parent branch that is ahead of `main` therefore trips the guard with "this worktree was rebased after start" when no rebase happened.

The reviewer's deeper point is the one that matters: this is not a guard false positive to patch, it is `base_commit` carrying two meanings — task scope origin and current integration fork point — that coincide only in linear workflows. Either `start` refuses a source that is ahead of the target, or the field splits.

### Obsolete: the `child_processes` item

Removed from section 6. `395f61aa` pinned the contract at the declaration: the metric counts direct route-runtime children, not handler-internal Git/Bun plumbing, and the zero call site is the HRD-09 sentinel — it goes non-zero only if a route regresses to the retired `run-hook.sh` shape, and two tests pin it to 0 deliberately. Wiring it in would have broken correct tests.

That commit's own message names the failure mode that produced the original item: reading `event-telemetry.ts` alone yields a convincing bug report because the contract lived only in a report legend. The same mistake was repeated here in this document.

### Not reproduced, accepted as credible

Criss-cross histories with multiple best merge bases, and a local `base_branch` lagging its upstream, were not reproduced in this session. Both mechanisms follow from documented `git merge-base` behaviour and the guard's single-value comparison, and both belong in the same work-package.

### Standing correction to section 5

The Stop advisory shipped in `83d80780` establishes the weak invariant only: at Stop, implementation diff is covered by a currently-Approved plan. It cannot establish that approval preceded the mutation — plan Draft, shell write, plan Approved, gate passes. Proving the temporal invariant needs mutation-time authorization capture, not a better diff read. The advisory should be read as covering the weak form.

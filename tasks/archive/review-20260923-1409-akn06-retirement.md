> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0926-akn06-retirement.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0926-akn06-retirement.md` => `plans/archive/plan-20260922-0926-akn06-retirement.md`
> **Archive Projection V1**: `tasks/notes/20260922-0926-akn06-retirement.notes.md` => `tasks/archive/notes-20260923-1409-akn06-retirement.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0926-akn06-retirement.contract.md` => `tasks/archive/contract-20260923-1409-akn06-retirement.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0926-akn06-retirement.review.md` => `tasks/archive/review-20260923-1409-akn06-retirement.md`

# AKN-06b review

> **Status**: Pending
> **Recommendation**: pending
> **Substantive Change SHA256**: `sha256:79ab23f445d36481486728a4d39450eb31aa092b7471c656b5930112dd89c575`
> **Plan**: plans/archive/plan-20260922-0926-akn06-retirement.md
> **Notes File**: tasks/archive/notes-20260923-1409-akn06-retirement.md
> **Checks File**: .ai/harness/checks/latest.json
> **Contract**: tasks/archive/contract-20260923-1409-akn06-retirement.md

Pre-fix evidence was captured before production edits on base 5018f0d7. No independent semantic review has run.

## Pre-fix failure evidence

Regression guard: `tests/cli/operator-serve.test.ts`. The timeout/disconnect cases expected503 busy but received200 while the old reader was unresolved; both close callers completed early, and shutdown started queued repo-b. Exact focused output follows.

```text
regression_guard: tests/cli/operator-serve.test.ts
bun test v1.4.0 (34cbb9a40)

tests/cli/operator-serve.test.ts:
repo-harness-operator refused method=GET status=503 code=collaboration_snapshot_timeout path="/api/v1/collaboration/repo-a/snapshot"
1252 |           if (ending === 'disconnect') abort.abort();
1253 |           const response = await first;
1254 |           if (ending === 'timeout') expect(response?.status).toBe(503);
1255 |           await waitFor(() => firstSignal?.aborted === true, 'reader cancellation not observed');
1256 |           const busy = await fetch(server.url + path);
1257 |           expect(busy.status).toBe(503);
                                     ^
error: expect(received).toBe(expected)

Expected: 503
Received: 200

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1257:31)
(fail) reader retirement > collaboration timeout holds its slot until retirement and refuses a premature same-source retry [1041.62ms]
1252 |           if (ending === 'disconnect') abort.abort();
1253 |           const response = await first;
1254 |           if (ending === 'timeout') expect(response?.status).toBe(503);
1255 |           await waitFor(() => firstSignal?.aborted === true, 'reader cancellation not observed');
1256 |           const busy = await fetch(server.url + path);
1257 |           expect(busy.status).toBe(503);
                                     ^
error: expect(received).toBe(expected)

Expected: 503
Received: 200

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1257:31)
(fail) reader retirement > collaboration disconnect holds its slot until retirement and refuses a premature same-source retry [16.48ms]
1279 |         const closed = [false, false];
1280 |         const first = server.close().then(() => { closed[0] = true; });
1281 |         const second = server.close().then(() => { closed[1] = true; });
1282 |         await waitFor(() => signal?.aborted === true, 'shutdown did not abort');
1283 |         await Bun.sleep(30);
1284 |         expect(closed).toEqual([false, false]);
                              ^
error: expect(received).toEqual(expected)

  [
-   false,
-   false,
+   true,
+   true,
  ]

- Expected  - 2
+ Received  + 2

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1284:24)
(fail) reader retirement > collaboration shutdown awaits retirement for every concurrent close caller [66.55ms]
1252 |           if (ending === 'disconnect') abort.abort();
1253 |           const response = await first;
1254 |           if (ending === 'timeout') expect(response?.status).toBe(503);
1255 |           await waitFor(() => firstSignal?.aborted === true, 'reader cancellation not observed');
1256 |           const busy = await fetch(server.url + path);
1257 |           expect(busy.status).toBe(503);
                                     ^
error: expect(received).toBe(expected)

Expected: 503
Received: 200

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1257:31)
(fail) reader retirement > diff timeout holds its slot until retirement and refuses a premature same-source retry [1021.55ms]
1252 |           if (ending === 'disconnect') abort.abort();
1253 |           const response = await first;
1254 |           if (ending === 'timeout') expect(response?.status).toBe(503);
1255 |           await waitFor(() => firstSignal?.aborted === true, 'reader cancellation not observed');
1256 |           const busy = await fetch(server.url + path);
1257 |           expect(busy.status).toBe(503);
                                     ^
error: expect(received).toBe(expected)

Expected: 503
Received: 200

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1257:31)
(fail) reader retirement > diff disconnect holds its slot until retirement and refuses a premature same-source retry [19.75ms]
1279 |         const closed = [false, false];
1280 |         const first = server.close().then(() => { closed[0] = true; });
1281 |         const second = server.close().then(() => { closed[1] = true; });
1282 |         await waitFor(() => signal?.aborted === true, 'shutdown did not abort');
1283 |         await Bun.sleep(30);
1284 |         expect(closed).toEqual([false, false]);
                              ^
error: expect(received).toEqual(expected)

  [
-   false,
-   false,
+   true,
+   true,
  ]

- Expected  - 2
+ Received  + 2

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1284:24)
(fail) reader retirement > diff shutdown awaits retirement for every concurrent close caller [58.38ms]
1303 |     try {
1304 |       await waitFor(() => starts.length === 1, 'reader not started');
1305 |       queued = fetch(server.url + '/api/v1/collaboration/repo-b/snapshot').catch(() => null);
1306 |       await Bun.sleep(30);
1307 |       const closing = server.close(); await Bun.sleep(30);
1308 |       expect(starts).toEqual(['repo-a']);
                            ^
error: expect(received).toEqual(expected)

  [
    "repo-a",
+   "repo-b",
  ]

- Expected  - 0
+ Received  + 1

      at <anonymous> (/Users/ancienttwo/Projects/repo-harness-wt-akn06-retirement/tests/cli/operator-serve.test.ts:1308:22)
(fail) reader retirement > closing cancels queued Collaboration observations before waiting for the active reader [78.91ms]

 0 pass
 43 filtered out
 7 fail
 9 expect() calls
Ran 7 tests across 1 file. [2.43s]

PRE_FIX_EXIT=1
```

## Implemented candidate and local verification

Collaboration capacity now retires only on reader completion, and its default Worker Promise settles only at exit. TaskDiff uses the existing bounded Task reader; context/activity/diff share its capacity and both injected/production completions participate in shutdown. All close callers wait for the same completion after every observer is cancelled. Existing route failures and typed decoding remain intact; shutdown explicitly returns Collaboration unavailable503 instead of a destroyed empty200.

The seven pre-fix failures pass after correction. A real default Worker blocked on a FIFO proves bounded HTTP timeout, retained busy scope and queued admission only after exit. Final focused suites pass 86 tests / 565 assertions including the actual TaskDiff Worker and exact scope/path guards; typecheck passes. Canonical logs are not claimed: local logs are under `.ai/harness/runs/akn06-retirement/`. All nine required repository-integrity checks pass; exact command results are in `.ai/harness/runs/akn06-retirement/integrity-results.json`.

`verify-contract --strict --read-only` also passes all 25 criteria (including the four-field pre-fix gate and the executable Verification Plan); report: `.ai/harness/runs/akn06-retirement/contract-preflight-final.json`. This is not the architecture-bound `verify-sprint` acceptance receipt.

No independent semantic review has run. Worktree indexing is not yet authorized; current CodeGraph proof, deterministic reconcile, canonical verification, semantic acceptance and the stage PR remain pending. No runtime installation or main merge occurred.

## Supersession

Superseded by the AKN-05/06 restack integration (`tasks/archive/notes-20260923-1351-akn05-06-restack.md`, PR #447). The per-slice verification and acceptance evidence recorded in this review is bound to pre-restack subjects and does not transfer to the integrated branch. Acceptance for the integrated code is PR #447 CI plus an independent gate.

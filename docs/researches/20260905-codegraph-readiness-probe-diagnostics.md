# CodeGraph readiness probe failure diagnostics

## Scope and observed failure

The BRC5 integrated full suite at source checkpoint `748b3018401bb8c34c639b99c3ef2439a60a20a2` reported 4255 pass, 1 fail and 4 skip. The sole failure was `tests/cli/codegraph-resolver.test.ts:94`: reading fixture `tool.log` raised ENOENT. The test, readiness script and resolver were unchanged from integration base `49c56b25f0c0871b85e6b2a53a4abb2e05913610`.

Original evidence: `.ai/harness/runs/run-20260905T153434-99468-bun-test-timeout-60000.log`. These ignored run artifacts are diagnostic evidence, not a passing acceptance receipt.

## Proven trace and limits

P1: `tests/cli/codegraph-resolver.test.ts` writes a fake CodeGraph executable and a fake timeout wrapper, then calls `scripts/ensure-codegraph.sh --check --json`. The CLI consumes the report from `scripts/check-agent-tooling.sh`.

P2: only the fake CodeGraph executable creates `tool.log`. The readiness script's `run()` captures spawn status, error and timeout. `codeGraphVersion()` reduces unsuccessful results to null (retrying timeout once); `detectCodeGraph()` consumes version and status output without returning the underlying execution error. A resolved executable plus unavailable index or incomplete host configuration can still yield `partial`, so the test's first five assertions pass before the missing log reveals that neither expected invocation reached the fake executable.

P3: preserve the read-only readiness contract and bounded process execution. Raising timeouts, fabricating a log, weakening assertions, or treating an isolated pass as a full-suite pass would not establish the missing cause. No product or test source was changed in this diagnosis. At higher concurrent process load the spawn boundary is a plausible pressure point, but this run did not measure or prove resource exhaustion.

## Controlled experiments

The preload below instruments only CodeGraph child spawns in the Node readiness process. Injection is explicit and test-only; it is not evidence that the historical failure had that injected cause.

| Experiment | Observed result |
|---|---|
| Unmodified spawn with instrumentation | 1 pass, 0 fail, 10 assertions; version and status probes both exited 0 (376 ms and 3 ms in the captured run) |
| Inject EAGAIN before both probes | Same tool.log ENOENT at line 94; first five assertions pass; two captured EAGAIN results |
| Inject ETIMEDOUT before probes | Same tool.log ENOENT at line 94; first five assertions pass; three captured timeout results, including the version retry |

Both distinct failures produce the historical symptom. The original run discarded the distinguishing fields and removed the fixture in finally, so its precise failure cause cannot be reconstructed from the retained log. The earlier unrelated full-run SIGTERM also has no identified sender; these experiments do not explain it.

## Capture the next real failure

Save this preload to `/tmp/brc5-codegraph-spawn-probe.cjs`. It records command basenames, status, signal, error and elapsed time, without dumping the environment.

```javascript
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const original = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
  const isProbe = [command, ...(args || [])].some(v => /(?:^|\/)codegraph$/.test(String(v)));
  if (!isProbe) return original.apply(this, arguments);
  const started = Date.now();
  const mode = process.env.BRC5_PROBE_INJECT || '';
  let result;
  if (mode === 'EAGAIN' || mode === 'ETIMEDOUT') {
    result = {status: null, signal: mode === 'ETIMEDOUT' ? 'SIGTERM' : null, stdout: '', stderr: '', error: Object.assign(new Error('injected '+mode), {code: mode})};
  } else { result = original.apply(this, arguments); }
  fs.appendFileSync(process.env.BRC5_PROBE_LOG, JSON.stringify({command:path.basename(command),args:(args||[]).map(String).map(x=>x.includes('/')?path.basename(x):x),duration_ms:Date.now()-started,status:result.status,signal:result.signal,error_code:result.error?.code||null,error_message:result.error?.message||null,injected:!!mode})+'\n');
  return result;
};

```

From the BRC5 worktree, run the existing focused test with instrumentation and no fault injection:

```bash
BRC5_PROBE_LOG=/tmp/brc5-codegraph-spawn-observed.jsonl NODE_OPTIONS=--require=/tmp/brc5-codegraph-spawn-probe.cjs bun test --timeout 60000 tests/cli/codegraph-resolver.test.ts
```

The controlled checks add `BRC5_PROBE_INJECT=EAGAIN` or `BRC5_PROBE_INJECT=ETIMEDOUT` to that command. They intentionally fail; their results must never be used as actual-environment diagnostics or passing verification.

The captured session artifacts are `/tmp/brc5-codegraph-spawn-normal.{log,jsonl}`, `/tmp/brc5-codegraph-spawn-eagain.{log,jsonl}`, and `/tmp/brc5-codegraph-spawn-timeout.{log,jsonl}`. A real failure's error_code/signal/status is the next required evidence before changing process handling or fixture timing. No additional expensive full-suite run is justified merely to obtain another identical ENOENT.

## Verification of this diagnostic artifact

Changed paths are this research document and the existing BRC5 notes only. The normal instrumented focused test passed; the two explicit fault injections failed at the expected assertion. All six repository-integrity checks passed: deployment SQL, architecture sync, task sync, strict task workflow, project inspection and init dry-run. The full suite was not repeated: this change adds documentation, while the controlled tests already prove the diagnostic distinction and no runtime behavior was modified.

## Approved probe-result output

The CodeGraph JSON report now contains `probes`, an ordered list of actual version/status executions. Each entry binds `bin_path` and `args` to `status`, `signal`, `error`, `error_code`, and `timed_out`. Both version attempts remain observable when the existing timeout retry executes. Readiness and retry behavior remain unchanged. `tests/cli/codegraph-resolver.test.ts` now proves normal success and injected EAGAIN, ETIMEDOUT, SIGTERM and nonzero exit output. This removes the information-loss blocker; it does not identify the original transient failure retroactively.

The integrated source3958ce3f subsequently passed the full suite (4363 pass, 0 fail, 4 skip; 354 files) as well as all 13 BRC5 contract criteria. The original CodeGraph fixture and all four new error-output cases passed in that full run. Formal acceptance did not finalize because origin/main moved during execution; test success and target-bound acceptance remain distinct claims.

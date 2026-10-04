> Historical snapshot preserved on 2026-09-10 from `fba4233a0376d0e83fae04cb99c08befc49c03da`. Status and observations below describe that original investigation; they grant no current execution authority. Consult [20260907-brc6a-admission.md](20260907-brc6a-admission.md) for the later implementation boundary and [consolidation provenance](20260910-inactive-branch-consolidation.md) for disposition.

# BRC6a live response-stream evidence producer

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Status and authority

Implementation candidate: Oracle `fbc9ed38b7147d204842a26baa047f63572f7e1f`, based on the accepted history collector `b6f35dcc`. It is isolated in `oracle-wt-brc6a-live-network-evidence`, with no global installation or main merge. This slice makes no GPT calls and reuses no stopped campaign budget.

BRC6a remains **pending exact-version provenance**. Completed conversation `6a9f0045-c728-83ea-a489-27796265282a` proves explicit GitHub app activation and content readback; historical tool results omit original `api_tool.call_tool` arguments. See the accepted history research on branch `codex/brc6a-conversation-evidence`, commit `068ec631`, `docs/researches/20260908-brc6a-conversation-history-evidence.md`. The new collector only preserves bytes that a future response actually emits. It does not invent arguments or receipts.

## P1/P2/P3 and implemented boundary

P1: CLI builds RunOracleOptions, browser/sessionRunner.ts projects it into BrowserRunOptions, and browser/index.ts owns local and direct-remote Chrome CDP lifecycles. Both initialize the same browser/networkEvidence.ts observer before navigation/submission and finalize before CDP close. The separate remote Oracle HTTP protocol and Gemini executor cannot carry this field and are explicitly rejected.

P2: Explicit `--write-network-evidence <new-path>` requires `--engine browser --wait`. Same-origin request identity and text/event-stream responses feed CDP Network.streamResourceContent: bufferedData is the initial prefix; Network.dataReceived.data supplies subsequent base64 bytes. Records distinguish them because a chunk can arrive before command resolution. Reconstruction prepends the buffer to numbered chunks. The [official CDP contract](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-streamResourceContent) documents this experimental mechanism; the local Chrome fixture verifies the installed implementation.

P3: Exclusive 0600 NDJSON is bounded to 64 MiB, 256 streams and 1024 pending request metadata entries. It omits request bodies, headers, cookies and query values; response content may be private. Missing footer, open stream, limit, stream failure or unavailable buffer means incomplete evidence. The path is a one-shot option absent from stored-session configuration and reattachment. No model/thinking selection or new prompt path was added. At 10x usage, caps or provider transport/parameter visibility drift fail first, explicitly; no alternative transport or semantic reconstruction is supplied.

New-file justification: one collector serves two existing CDP owners; its unit tests cover ordering/bounds, a CLI test covers rejected dispatch routes, and a standalone loopback fixture verifies real protocol bytes. No new dependencies. Twelve changed files include documentation and tests.

## Verification and limits

- Six focused suites: 136 tests passed (collector, CLI refusal, option propagation, existing browser/default/history behavior). Two additional test-only cases increase collector coverage from 10 to 12; the 12-case delta suite passed.
- TypeScript no-emit, build and changed-file lint passed. Actual tool exit codes are retained in ignored `.ai/harness/evidence/brc6a-live-network/oracle-verification.json`.
- `node --import tsx scripts/verify-network-evidence-local.ts`: real headless Chrome, empty disposable profile and loopback SSE reconstructed all 110 bytes exactly, including UTF-8 and split JSON. One streamed chunk plus initial buffer; permissions checked; Chrome/server/profile removed; zero model calls.
- Regressions cover origin/MIME exclusion, reordered buffer completion, missing chunks, HTTP/load/enable failures, pending-command stop, byte/stream/request limits, exclusive files and subscription rollback.
- Both lifecycle insertion/finalization sites are reviewed; the fixture exercises the shared collector against real CDP. It does not execute a full ChatGPT run. Disk-full and process-kill fault injection are not claimed; write/finalization failure yields incomplete status or missing footer.
- No full suite: named behavior checks and existing browser/default tests cover this opt-in boundary. Main WIP and earlier accepted branches remain separate.

## Prepared next probe — not executed or funded

Fresh authorization must cover exactly **one GPT request**, at most **600 seconds** assistant wait, no follow-up/retry/restart and no GitHub writes. Preserve the current UI model/thinking state and select a real GitHub inline app pill before send. Stop on activation failure, incomplete stream, missing original arguments, timeout or an unapproved extra call. Do not reference old stopped budgets.

The prepared command uses a fresh isolated Oracle home and new output directory, with CLI flags verified by a zero-call dry-run (exit 0, picker=current). The UI model is not inferred from the preview requested-model label. The live command is not executed by this implementation slice:

```bash
ORACLE_HOME_DIR=/tmp/brc6a-approved-live-probe/oracle-home \
node --import tsx bin/oracle-cli.ts \
  --engine browser --wait \
  --copy-profile "$HOME/Library/Application Support/Google/Chrome" \
  --browser-chrome-profile "Profile 13" \
  --browser-model-strategy current --browser-app GitHub \
  --browser-timeout 600s --browser-auto-reattach-interval 0 \
  --write-session /tmp/brc6a-approved-live-probe/session.json \
  --write-network-evidence /tmp/brc6a-approved-live-probe/stream.ndjson \
  --write-output /tmp/brc6a-approved-live-probe/answer.md \
  --prompt 'Read-only GitHub diagnostic. Use the selected GitHub app to fetch README.md from Ancienttwo/repo-harness-brc15a-canary-20260907 at commit 33d692aaa0ab593df0c160082b18fdac02c82e9c. Return the first 8 and last 4 lines, and any blob SHA and display URL actually returned by the tool. If the tool cannot pin that commit, say so. Do not infer a resolved commit from this prompt or a blob match. Do not write anything to GitHub.'
```

A capture only enables inspection. Original provider-emitted tool arguments must be paired with actual provider tool results, and repository/path/ref and exact-version authority assessed separately. Answer self-report is never a receipt. BRC14, BRC15a and BRC15 are not completed by this diagnostic.

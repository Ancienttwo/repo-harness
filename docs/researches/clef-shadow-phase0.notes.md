# Clef Phase 0 and shadow implementation

Date: 2026-10-22. Plan: the 2026-10-22 Clef decision-layer plan (removed with the plan archive in #1184).
Scope: Phase 0/1 and the Bot label command requested by the task brief.
No Copilot, Autopilot, report command, live configuration change or deployment.

## P1: boundary

The standalone Node plugin owns notification transport and shadow I/O.
`src/core/decision/pane-status.mjs` owns the question, decoder and shadow bands.
The helper projection installs the exact core bytes with the durable plugin.
`src/effects/terminal/herdr-decision.ts` reads blind records and writes Bot labels.
The current architecture model assigns the Herdr command and plugin to Task Agent Host.
That existing capability retains ownership. The plan's operator-notify owner name
is not the current model owner. No new capability is needed.

## P2: path

The existing event, session and workspace filters run first. Channel selection,
delivery, retries and debounce stay unchanged. After all channel attempts, an
eligible shadow event reads the pane through `HERDR_BIN_PATH`, redacts and bounds
the tail, reserves the UTC budget, calls both models, and saves one private record.
Both model calls have a three-second deadline and run in parallel.
The model answer never enters channel payloads or commands.
A runtime-supplied directory pointer in private `decision-state.json` lets the
label CLI locate state through `herdr plugin config-dir`. `--state-dir` is an
explicit input for a known directory. No Herdr private path layout is inferred.

## P3: invariant and bounds

Default mode is `off`. Only `off` and `shadow` are accepted at install.
Missing Cloudflare keys make the event use the original path without a tail read.
Only `claude` and `codex` done events enter shadow processing.
Delivery always finishes before pane reads, provider calls or shadow disk writes.
The original `agent_status` and channel set stay unchanged even if every model
answer is wrong, invalid or unavailable. Model output can only enter the log.
The first limit at 10x traffic is the shared 2,000-call UTC cap. An exclusive local
lock reserves calls across event processes. No inference retry runs.
The log keeps at most 14 days and 20 MiB. Records and labels have mode `600`.
A crashed process can leave a lock. Further shadow writes then fail closed and
print a fixed error. An operator must inspect that lock; code does not steal it.

## Phase 0 facts

| Question | Result and command/source |
| --- | --- |
| Clef-flash price and context | Official model page: 9B, 24,576 tokens, $0.038 per million input tokens, output free. [Model](https://developers.cloudflare.com/workers-ai/models/clef-flash/). |
| Clef price and context | Official [Clef model page](https://developers.cloudflare.com/workers-ai/models/clef/): 27B, 65,536 tokens, $0.24 per million input tokens, output free. |
| Neurons and reset | Official [pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/): 10,000 free Neurons per day, reset at 00:00 UTC. At 3,500 tokens per model, $0.038/M + $0.24/M gives $0.000973 per event and $0.2919 per 300 events, before free allowance. |
| Token permission | Official [REST guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) uses Workers AI Read/Edit. The [Run API](https://developers.cloudflare.com/api/resources/ai/methods/run/) lists Workers AI Write or Read. There is no confirmed permission named Workers AI Run. No token was created or changed. |
| Request and output | Official [input schema](https://developers.cloudflare.com/workers-ai/models/clef-flash/schema-input.json) and [output schema](https://developers.cloudflare.com/workers-ai/models/clef-flash/schema-output.json). REST uses the `success` / `result` envelope. All three answers and usage must validate. |
| Pane read from a plugin process | A real, disposable Herdr 0.9.3 session ran a probe plugin. Its event process used `herdr pane read <pane> --source recent --lines 120`; the two reads completed in 4 ms and 5 ms. Only byte counts were kept. No tail text is in this note. |
| Typed report marker | Two real events came from `report-agent --source repo-harness --agent codex --state working/idle`. Event data and `pane get` had no typed-source field. The exact event bodies are below. |
| Detector readback | The real task pane reported `agent_session.source: herdr:codex`. This is session identity, not evidence of typed lifecycle authority. A detector event JSON was not captured. |
| OSC 7501 event | Not captured. This pass cannot establish a typed-source event marker for OSC 7501. |
| External state discovery | Herdr 0.9.3 exposes `plugin config-dir`, but no state-dir command. The probe received `HERDR_PLUGIN_STATE_DIR`. The implementation projects that runtime value into a private pointer for the label CLI. [Pinned Herdr source](https://github.com/herdrdev/herdr/blob/v0.9.3/src/plugin_paths.rs). |
| Seven-day done count | `herdr plugin list --json --plugin aimpact.webhook-notify` returned an empty plugin list. `herdr plugin log list --plugin aimpact.webhook-notify --limit 10000` returned an empty log list. Event count is unavailable, not zero. |
| Token verification and ten real tails | Blocked: Cloudflare credentials are absent from the task environment and there is no installed plugin config. No `/user/tokens/verify` or paid inference call ran. No other credential store was searched. |

The probe used a separate HOME, config and named session. It stopped its own
server and removed its temporary directory. The live plugin registry, default
server and port 4318 were not changed.

Exact event bodies from the disposable runtime:

```json
{"event":"pane_agent_status_changed","data":{"type":"pane_agent_status_changed","pane_id":"w1:p1","workspace_id":"w1","agent_status":"working","agent":"codex"}}
{"event":"pane_agent_status_changed","data":{"type":"pane_agent_status_changed","pane_id":"w1:p1","workspace_id":"w1","agent_status":"idle","agent":"codex"}}
```

## Event contract (resolved by the approved PR #860 follow-up)

Herdr 0.9.3 uses two distinct names. The manifest subscription key is
`pane.agent_status_changed`. The emitted JSON body has
`event: "pane_agent_status_changed"`. The same real probe above proves both:
the dotted subscription dispatched the plugin process that captured the
underscore body. The handler now accepts only the underscore body name.
It does not accept a dotted alias. Both off and shadow fixtures use the real
wire name. Notification routing and `CLEF_MODE=off` as the default stay intact.

The first implementation preserved the old filter to keep the original off
contract. The user then approved this exact producer/consumer correction.
A focused regression failed on the old code: the real name produced no delivery,
and the wrong dotted body name produced four deliveries. The fixed code accepts
the real name and rejects both the dotted name and unrelated events. Existing
notification assertions remain unchanged; only their event inputs now match
the producer. This closes the event-name blocker, without proving live provider
acceptance, a detector done event, or an OSC 7501 event.

## Scope decisions and verification limits

- The Bot label command moves forward from Phase 2 because the task brief names it.
  The report and operator status expansion remain Phase 2 work.
- The private state pointer is a deterministic projection of Herdr's runtime path.
  It is not a second authoring path or a guessed directory fallback.
- Architecture ownership was updated through one managed ArchContext ChangeSet.
  Projection check reported `AC_CODE_FACTS_UNAVAILABLE`, reason `index-missing`.
  This checkout has no `.codegraph/`; no index was created. Generated architecture
  docs were not hand-edited. Projection freshness is not verified.
- Existing test assertions were kept. The Herdr test shim gained pane-read and
  unprefixed config-dir support. Its failure injection now requires a configured
  failure name, so an absent name cannot accidentally match a short command.
- Initial development checks found a Node ESM import extension error and missing
  fixture environment types. Both were fixed. The two affected runtime cases then
  passed. Final verification is recorded against the implementation commit in the PR.

## Independent review disposition

The Codex gatekeeper found no actionable issue in the first frozen diff.
Claude found OSC stripping that could remove result text between hyperlinks.
The strip now stops at ESC or BEL. A regression keeps two link labels and the
result between them. The plugin also rejects a missing injected Herdr binary,
and off-mode install clears unused Cloudflare keys before writing config.
Null tails require a null hash on label reads. New tests run two separate event
processes against a held real lock, prove contention before release, check the
single remaining budget reservation, and check stale-lock failure after delivery.

The plan's token-shaped redaction also removes some long SHAs and assignment-like
result text. This is a known calibration confound for Phase 2. Per-event records
are intentional even when channel delivery is debounced. A record with no tail
has no label evidence; the Bot must use `unclear`, rather than infer an outcome.
The masked mode prompt reuses the installer's existing terminal input contract.

Rollback: set `CLEF_MODE=off` for an installed candidate. For a merged change,
revert its squash commit and reinstall the shipped plugin. This task does not
merge, install on the live session, release or apply model decisions.

## Hosted CI repair on main 919b66d0

Run `39763734877` failed in two affected-test shards. The branch was rebased to
`919b66d0d55e1758f2f08e5dd8a8353c336f0723` before repair and final verification.

Shard 0 exposed an authority error: the approved Clef section was added only to
`docs/reference-configs/herdr-notify.md`. Its actual authoring source is
`assets/reference-configs/herdr-notify.md`. The unchanged projection test failed.
The source now contains that section. `bun run sync:reference-configs` regenerates
the projection without changing its approved bytes. The original assertions pass.

Shard 2 exposed a fixture IPC error before the product's UTF-8 cap could run.
The test stored its 144,119-byte pane output in `FIXTURE_TAIL`. On Linux with
4 KiB pages, a single environment entry can contain at most 131,072 bytes;
this entry was 144,133 bytes including its name, separator and NUL. Real Linux
`execFile` failed with `E2BIG` before the shim started. The unchanged plugin
correctly recorded `unavailable` and a null tail. The next assertion then raised
the reported `Buffer.byteLength(null)` error.

A disposable, offline container with cached Node 24.21.0 on Linux arm64 reproduced
the full failure path. Boundary probes accepted a 131,072-byte entry and rejected
131,073. The exact same 144,119-byte payload, SHA256
`aca38b0f6bdc6fc84acef271ad0371fe8d5a10f2022178b5e0d56ed6aca10281`,
passed through a file-reading shim and the unchanged plugin: one pane read,
an exact 16,382-byte Unicode suffix, and both models valid. This lower-layer
proof is separate from the final hosted Bun/Ubuntu test run.

The fixture now has one tail file, initialized with its original default text.
All three custom-tail cases write their original UTF-8 bytes there. Only the short
file path enters the child environment. The shim still adds the same newline.
The production read, failure handling and truncation code did not change.
Every existing assertion remains. New assertions pin the original input size,
require a string suffix of that input, and require the 16 KiB bound to be filled
within the maximum three-byte UTF-8 boundary adjustment. No input, timeout or
coverage was reduced, and no fallback or skip was added.

Sibling sweep found three uses of the old env-payload channel, all in the same
fixture file; all now use its single file channel. Projection checks cover all
25 canonical reference documents. Exact RED/GREEN commands, source hashes and
hosted verification remain in the PR evidence, not in a second acceptance store.

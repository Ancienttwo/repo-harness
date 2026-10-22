# Clef Phase 0 and shadow implementation

Date: 2026-10-22. Plan: `plans/plan-20261022-1429-cloudflare-clef-decision-layer.md`.
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

## Activation blocker

The observed Herdr event body uses `pane_agent_status_changed`. The existing
handler accepts only `pane.agent_status_changed`. The manifest subscription uses
the dotted name, but that is not the emitted body field. This task preserves the
existing filter because Phase 1 requires unchanged `off` behavior and unchanged
existing event-handler assertions. The probe is runtime evidence, not a mock.
No alias or dual parser was added. Correcting this producer/consumer contract
needs a bounded follow-up before live shadow activation. The implementation PR
must stay Draft while this blocker remains.

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

# C9 Real Multi-Agent Canary and Multi-Seat Decision

> Date: 2026-08-30
> Subject: final C9 work package on the accepted C7/C8 integration base `f8c63a7adb9b73a687501a7e36336797305398b1`
> Runtime: `codex-cli 0.150.1`, `gpt-5.6-luna`, read-only sandbox
> Decision: C9-A pass, C9-B pass, persistent `EngineerSeatV2` **NO-GO**

## Conclusion

Three matched real-provider cases completed with one baseline reader versus one
Module Engineer, three concurrent read-only delegated Workers and one real
read-only successor run. Every treatment cited the kickoff signal four times,
published and explicitly adopted one handoff, observed exactly one persisted
Module Engineer writer lineage, left tracked source bytes unchanged, and
preserved the Task/Lease/Publication/Acceptance store digest. This satisfies
C9-A and the three-case C9-B evidence count.

The treatment produced twelve rubric-qualified findings versus the baseline's
nine, while consuming 3.51x provider input tokens and 2.07x aggregate wall
time. A real successor produced its first useful contribution 54.58-58.73
seconds after the predecessor set completed. That restart exceeded baseline
time-to-first-useful in only one of three cases, so the repeated bottleneck gate
did not hold and `EngineerSeatV2` remains NO-GO. The canary grants no Review or
Merge authority; Phase 5 and Phase 6 remain inactive.

## Frozen Method

Before the successful full run, `scripts/c9-collaboration-canary.ts` froze:

- three real protocol traces: provider-output boundary, execution-context
  egress, and delivery-authority boundary;
- separate disposable repo, Git common directory and principal HOME roots for
  every baseline and treatment arm;
- usefulness v1: valid contribution schema, one existing allowed `file:line`,
  literal `Observation:` and `Implication:`, and a unique normalized title;
- persistent-seat GO only if all three treatments preserve authority,
  outproduce their baselines, and handoff restart exceeds baseline
  time-to-first-useful in every case.

The full command was:

```bash
bun scripts/c9-collaboration-canary.ts --live
```

## Results

| Case | Arm | Input | Cached input | Output | Wall | Useful | Useful / 10k | First useful | Reuse | Adoption | First adopted | Restart | Never read |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| provider output | baseline | 224,772 | 170,752 | 2,191 | 59.051s | 3 | 0.1322 | 58.591s | 0 | 0 | — | — | 100% |
| provider output | treatment | 1,134,129 | 907,520 | 10,041 | 145.914s | 4 | 0.0350 | 52.701s | 4 | 1 | 87.999s | 58.733s | 75% |
| execution-context egress | baseline | 224,548 | 179,968 | 2,256 | 61.875s | 3 | 0.1323 | 61.438s | 0 | 0 | — | — | 100% |
| execution-context egress | treatment | 830,084 | 628,992 | 8,709 | 115.410s | 4 | 0.0477 | 51.044s | 4 | 1 | 61.677s | 54.576s | 75% |
| delivery authority | baseline | 356,325 | 293,120 | 3,066 | 70.992s | 3 | 0.0835 | 70.570s | 0 | 0 | — | — | 100% |
| delivery authority | treatment | 859,978 | 662,784 | 8,178 | 135.115s | 4 | 0.0461 | 44.842s | 4 | 1 | 77.695s | 58.194s | 75% |
| **aggregate** | **baseline** | **805,645** | **643,840** | **7,513** | **191.918s** | **9** | **0.1107** | — | **0** | **0** | — | — | **100%** |
| **aggregate** | **treatment** | **2,824,191** | **2,199,296** | **26,928** | **396.439s** | **12** | **0.0421** | — | **12** | **3** | **75.790s mean** | **57.168s mean** | **75%** |

Codex JSONL is authoritative for token usage but emits no monetary price. Dollar
cost is therefore recorded as unavailable rather than inferred from an external
rate card; aggregate compute is the exact input/cached-input/output tuple above.

Every treatment injected four contexts. Initial packets were 275-286 estimated
tokens; successor packets were 556-598. All stayed below the frozen 1,500-token
ceiling. Selection nevertheless left three of four Worker signals unread in
each case, so the remaining pressure point is signal selection/noise rather
than context transport capacity.

## P1: Architecture Map

The canary crosses four existing boundaries:

1. delegation owns read-only capability, admission, execution packets, process
   receipts, Worker run refs and results;
2. collaboration owns append-only signals, context packets/bindings,
   contribution commits, handoffs and adoption receipts;
3. Task/Lease/Publication/Acceptance remain external read authorities and are
   hashed separately from delegation evidence;
4. the CLI/MCP/Operator surfaces are egress projections only.

The live experiment is source-checkout tooling. It writes only disposable
repositories and HOMEs. It introduces no hosted runtime, persistent seat,
second writer, Review marketplace or Merge path.

## P2: Concrete Trace

One treatment path was:

```text
Module Engineer kickoff signal
  -> stable Work Exchange collection
  -> bounded [CoordinationContextUntrusted] packet
  -> CollaborationRunContextBinding
  -> three admitted reader seats
  -> three concurrent codex exec --json read-only processes
  -> immutable process receipts and stdout blobs
  -> exact JSONL final-message/usage decode
  -> three contribution commits citing the kickoff
  -> one handoff
  -> successor context packet
  -> explicit Module Engineer adoption receipt
  -> admitted successor delegated run
  -> successor process receipt and useful contribution
```

Task/Lease/Publication/Acceptance store digest stayed
`sha256:db61b150911525d9554e70ce59000424b03740bc0630974d6e4596bae9751fa2`
before and after every arm. Tracked worktree bytes also stayed unchanged.

## P3: Design Decision

The live proof found two real integration gaps before the successful matrix:

- the delegated argv emits Codex JSONL, but the collector's adapter looked for
  raw marker lines and the fake Codex emitted that impossible raw shape;
- the generic 64 KiB process-output cap could truncate JSONL before its final
  agent message and provider-authoritative usage event.

The smallest coherent correction makes the shim emit exact JSONL, decodes one
complete turn before parsing the final message, and gives delegated Codex JSONL
a 1 MiB capture budget. It does not accept both wire shapes, synthesize a draft,
or retry through a fallback provider.

At 10x task volume the first observed failure would be provider context cost and
signal selection noise: the deliberate successor added three findings, but
treatment input grew 3.51x and useful findings per 10k tokens fell from 0.1107
to 0.0421. Persistent seats would retain sessions but would not prove better
selection or lower the frozen delegated packet's per-run model context. The
invariant to preserve is still one persistent Module Engineer, one observed
writer lineage, and N bounded read-only participants.

## Decisions

- C9-A: **PASS**.
- C9-B: **PASS** (three isolated matched cases).
- Persistent `EngineerSeatV2`: **NO-GO**.
- Formal Review marketplace / Phase 5: **inactive**; no reviewer-supply evidence was produced.
- Unattended merge / Phase 6: **inactive**; Phase 5 is inactive and no merge authority was tested.

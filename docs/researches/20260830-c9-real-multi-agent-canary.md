# C9 Real Multi-Agent Canary and Multi-Seat Decision

> Date: 2026-08-30
> Subject: `f8c63a7adb9b73a687501a7e36336797305398b1` plus the C9 adapter corrections in this work package
> Runtime: `codex-cli 0.150.1`, `gpt-5.6-luna`, read-only sandbox
> Decision: C9-A pass, C9-B pass, persistent `EngineerSeatV2` **NO-GO**

## Conclusion

Three matched real-provider cases completed with one baseline reader versus one
Module Engineer plus three concurrent read-only delegated Workers. Every
treatment cited the kickoff signal three times, published and explicitly
adopted one handoff, kept the writer count at one, left tracked source bytes
unchanged, and preserved the Task/Lease/Publication/Acceptance store digest.
This satisfies C9-A and the three-case C9-B evidence count.

The treatment produced the same nine rubric-qualified findings as the baseline,
while consuming 2.58x provider input tokens and 1.12x aggregate wall time. The
explicit handoff restart cost was only 1.04-1.17 seconds, far below the
baseline's 55.64-63.70 seconds to first useful finding. Delegated startup and
handoff therefore were not proven to be the bottleneck, so the PRD's gate keeps
`EngineerSeatV2` at NO-GO. The canary grants no Review or Merge authority;
Phase 5 and Phase 6 remain inactive.

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

| Case | Arm | Input | Cached input | Output | Wall | Useful | Useful / 10k | First useful | Reuse | Adoption | Restart | Never read |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| provider output | baseline | 352,640 | 297,216 | 2,773 | 67.530s | 3 | 0.0844 | 67.030s | 0 | 0 | — | 100% |
| provider output | treatment | 930,846 | 745,728 | 7,251 | 79.680s | 3 | 0.0320 | 45.500s | 3 | 1 | 1.163s | 66.67% |
| execution-context egress | baseline | 156,986 | 119,808 | 2,081 | 56.613s | 3 | 0.1886 | 56.175s | 0 | 0 | — | 100% |
| execution-context egress | treatment | 483,018 | 359,424 | 6,012 | 68.628s | 3 | 0.0613 | 49.919s | 3 | 1 | 1.172s | 66.67% |
| delivery authority | baseline | 307,432 | 237,056 | 2,866 | 72.847s | 3 | 0.0967 | 72.474s | 0 | 0 | — | 100% |
| delivery authority | treatment | 692,725 | 529,664 | 6,577 | 71.776s | 3 | 0.0429 | 39.813s | 3 | 1 | 1.036s | 66.67% |
| **aggregate** | **baseline** | **817,058** | **654,080** | **7,720** | **196.990s** | **9** | **0.1091** | — | **0** | **0** | — | **100%** |
| **aggregate** | **treatment** | **2,106,589** | **1,634,816** | **19,840** | **220.084s** | **9** | **0.0423** | — | **9** | **3** | **1.124s mean** | **66.67%** |

Codex JSONL is authoritative for token usage but emits no monetary price. Dollar
cost is therefore recorded as unavailable rather than inferred from an external
rate card; aggregate compute is the exact input/cached-input/output tuple above.

Every treatment injected four contexts. Initial packets were 275-286 estimated
tokens; successor packets were 571-589. All stayed below the frozen 1,500-token
ceiling. Selection nevertheless left two of three Worker signals unread in each
case, so the remaining pressure point is signal selection/noise, not context
transport capacity or handoff latency.

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
signal selection noise: treatment input grew without increasing useful
findings, while handoff restart remained local and small. Persistent seats
would retain sessions but would not prove better selection or lower the frozen
delegated packet's per-run model context. The invariant to preserve is still one
persistent Module Engineer, one writer, and N bounded read-only participants.

## Decisions

- C9-A: **PASS**.
- C9-B: **PASS** (three isolated matched cases).
- Persistent `EngineerSeatV2`: **NO-GO**.
- Formal Review marketplace / Phase 5: **inactive**; no reviewer-supply evidence was produced.
- Unattended merge / Phase 6: **inactive**; Phase 5 is inactive and no merge authority was tested.

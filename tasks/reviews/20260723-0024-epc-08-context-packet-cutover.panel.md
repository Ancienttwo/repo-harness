# EPC-08 Context Packet Panel Report

- Protocol: `epc-08-context-packet-panel/v1`
- Generated: 2026-07-22T17:08:02.409Z
- Base SHA: `9ea195b99db26895821e9ee3e29ad2f460895649`
- Method: `utf8_bytes_div_4`
- Runner command: `bun scripts/session-context-packet-panel.ts --repo . --iterations 20`
- Iterations per state (latency, descriptive): 20

## Panel (27 rows: 9 authority states x 3 profiles)

| Authority state | Profile | estimated_tokens | within_budget | latency p50 (ms) | latency p95 (ms) |
|---|---|---:|---|---:|---:|
| no-plan | lite | 0 | true | 619.08 | 669.73 |
| no-plan | standard | 0 | true | 625.38 | 661.47 |
| no-plan | strict | 0 | true | 626.92 | 658.99 |
| draft-plan | lite | 318 | true | 639.35 | 690.06 |
| draft-plan | standard | 318 | true | 638.28 | 665.61 |
| draft-plan | strict | 323 | true | 631.03 | 659.77 |
| approved-work-package | lite | 318 | true | 640.25 | 660.96 |
| approved-work-package | standard | 318 | true | 634.64 | 685.49 |
| approved-work-package | strict | 323 | true | 633.23 | 663.5 |
| executing | lite | 318 | true | 643.4 | 675.46 |
| executing | standard | 318 | true | 629.12 | 665.98 |
| executing | strict | 324 | true | 632.8 | 675.98 |
| completed | lite | 318 | true | 640.31 | 679.87 |
| completed | standard | 318 | true | 639 | 659.15 |
| completed | strict | 323 | true | 668.39 | 736.81 |
| foreign-worktree | lite | 306 | true | 660.13 | 688.42 |
| foreign-worktree | standard | 306 | true | 623.74 | 656.22 |
| foreign-worktree | strict | 306 | true | 627.73 | 661.65 |
| corrupt-policy | lite | 0 | true | 339.33 | 362.48 |
| corrupt-policy | standard | 0 | true | 342.36 | 370.15 |
| corrupt-policy | strict | 0 | true | 344.1 | 368.75 |
| invalid-capability-registry | lite | 318 | true | 636.38 | 661.51 |
| invalid-capability-registry | standard | 318 | true | 632.43 | 659.17 |
| invalid-capability-registry | strict | 324 | true | 634.12 | 677.81 |
| conflicting-active-markers | lite | 318 | true | 632.79 | 662.64 |
| conflicting-active-markers | standard | 318 | true | 631.24 | 665.37 |
| conflicting-active-markers | strict | 324 | true | 629.53 | 675.44 |

## Gate numbers (frozen, EPC-00)

- Max estimated_tokens per sample: 1500
- Panel p95(estimated_tokens) gate: 700
- Every sample <= 1500 and within_budget == true: PASS
- Panel p95(estimated_tokens): 324 (PASS, gate <= 700)
- Overall: PASS

## Notes

- One deterministic sample per state for `estimated_tokens`/`within_budget` (packet content is deterministic per fixture state, EPC-00 confirmation).
- The panel p95 gate above is computed over the 27 `estimated_tokens` samples (method `utf8_bytes_div_4`), per the frozen EPC-00 acceptance line -- it is NOT a latency gate.
- Latency is reported purely descriptively across 20 iterations per state (p50/p95 ms in the table above); EPC-00 sets no SessionStart-latency gate at all.

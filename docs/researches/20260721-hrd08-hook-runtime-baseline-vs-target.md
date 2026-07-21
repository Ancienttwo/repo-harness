# Hook Dispatch Diet Report

- Protocol: `loop-engine-hook-diet-report/v2`
- Generated: 2026-07-21T09:05:32.215Z
- Runtime authority: `hook-events.jsonl` (available)
- Runtime samples: 220/220 valid
- Invalid/malformed/mixed: 0/0/no

## Measurement method

- Event samples: `.ai/harness/runs/hrd08-hook-event-samples.jsonl`; every public route contributes an equal fixture sample count.
- Collection: `HRD08_CHARACTERIZATION_CYCLES=20 HRD08_HOOK_EVENT_EVIDENCE_OUT="$PWD/.ai/harness/runs/hrd08-hook-event-samples.jsonl" bun test tests/hook-runtime-characterization.test.ts`.
- Projection: `bun scripts/hook-dispatch-diet-report.ts --repo . --events .ai/harness/runs/hrd08-hook-event-samples.jsonl --out docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json --iterations 20 --baseline-ms 250 --json`.
- `child_processes` counts direct route-runtime children, not internal Git/Bun plumbing. Logical writes exclude the telemetry sink. Opaque legacy-step I/O remains incomplete rather than inferred.

## Baseline vs current

| Evidence | Before HRD-08 | Current |
|---|---|---|
| Runtime authority | per-script lines without safe event grouping | one `loop-engine-hook-event/v1` record/event |
| Runtime evidence | unavailable | available; 220 valid samples |
| LOOP-12 target results | not measured at event level | 6/7 pass |
| PreEdit latency | no event-level p50/p95 | p50 381.68 ms; p95 429.05 ms; target 150 ms; budget 250 ms |
| State snapshot synthetic probe | synthetic only | p95 356.54 ms against 250 ms baseline |

## LOOP-12 targets

| Target | Threshold | Samples | Complete | p50 | p95 | Result |
|---|---:|---:|---:|---:|---:|---|
| runtime_entries | exactly 1 | 220 | 220 | 1 | 1 | PASS |
| child_processes | at_most 1 | 220 | 220 | 1 | 1 | PASS |
| state_resolutions | exactly 1 | 40 | 40 | 1 | 1 | PASS |
| pre_edit_p95_ms | p95_at_most 150 (budget 250) | 20 | 20 | 381.68 | 429.05 | FAIL |
| post_edit_full_projection_writes | exactly 0 | 20 | 20 | 0 | 0 | PASS |
| post_edit_event_writes | at_most 1 | 20 | 20 | 1 | 1 | PASS |
| stop_write_transactions | at_most 1 | 20 | 20 | 1 | 1 | PASS |

## Full-metric route coverage

`Complete` here means every declared metric, including hidden legacy-step file I/O, is directly observable. Named LOOP-12 target coverage is reported separately above; opaque values never become zero/pass.

| Route | Samples | Fully complete | Full coverage |
|---|---:|---:|---:|
| SessionStart/default | 20 | 0 | 0 |
| PreToolUse/edit | 20 | 0 | 0 |
| PreToolUse/subagent | 20 | 0 | 0 |
| PostToolUse/edit | 20 | 0 | 0 |
| PostToolUse/bash | 20 | 0 | 0 |
| PostToolUse/always | 20 | 0 | 0 |
| UserPromptSubmit/default | 20 | 0 | 0 |
| UserPromptSubmit/delegation | 20 | 0 | 0 |
| SubagentStart/context | 20 | 0 | 0 |
| SubagentStop/quality | 20 | 0 | 0 |
| Stop/default | 20 | 0 | 0 |

## Static and synthetic gates

- Dispatch: PASS (11/11)
- Phase probe: FAIL (p95 baseline 250 ms)
- SessionStart context: PASS

## Conclusion

Event authority and structural write/process/state targets are now measurable. 6/7 LOOP-12 targets pass. PreEdit p95 is 429.05 ms, so it misses the 150 ms target and 250 ms budget. This measured miss is retained for the next optimization slice; HRD-08 does not relabel or hide it.

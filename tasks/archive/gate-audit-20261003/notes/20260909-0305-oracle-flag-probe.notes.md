# Implementation Notes: oracle-flag-probe

> **Status**: Active
> **Plan**: plans/plan-20260909-0305-oracle-flag-probe.md
> **Contract**: tasks/contracts/20260909-0305-oracle-flag-probe.contract.md
> **Review**: tasks/reviews/20260909-0305-oracle-flag-probe.review.md
> **Last Updated**: 2026-09-09 03:05
> **Lifecycle**: notes

## Design Decisions

- The four fork runtime flags (`--write-session`, `--write-network-evidence`,
  `--write-conversation-evidence`, `--browser-thinking-time`) collapse onto a
  single probe boolean instead of four independent capability probes. They ship
  only in the repo-harness Oracle fork and always land together, so a partial
  set is not a reachable build; probing each flag separately would multiply
  spawn cost while adding no state the recovery path can act on differently.
  The per-flag names are still kept in `ORACLE_RUNTIME_PROBE_CAPABILITIES` so
  the reported gap and the drift guard name the exact flags.
- The fork-build agent action fires only when *every* missing capability is a
  fork capability. A binary that also lacks upstream `--help` capabilities is an
  ordinary version/source problem, and pointing it at the fork build would hide
  the real defect.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Emit `chatgpt-oracle-upgrade-pinned` for a fork-flag gap | Rejected | `bun add -g @steipete/oracle@0.20.0` can never add fork-only flags, so the agent loops forever on the same action. |
| Emit `chatgpt-oracle-select-fork-build` pointing at `REPO_HARNESS_ORACLE_BIN` / `--oracle-bin` | Chosen | The only real recovery is selecting the fork binary; it needs a human/agent-supplied path, so `automatic: false` and `requires_agent: true` stay. |
| Probe each fork flag independently | Rejected | The flags are all-or-nothing per build; extra probes cost spawns and change no recovery. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

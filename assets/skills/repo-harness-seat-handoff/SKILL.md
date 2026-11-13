---
name: repo-harness-seat-handoff
description: Reset the current orchestrator or advisor seat on demand (project switch, long break) through the same handoff that the Stop hook starts at the context threshold.
when_to_use: "repo-harness-seat-handoff"
disable-model-invocation: true
---

# repo-harness-seat-handoff

Bot entrypoint. Explicit invoke only, inside the orchestrator or advisor seat that
resets. `rh seats handoff` owns the steps and the handoff template; this
skill copies neither.

1. Run `rh seats handoff`. It reads the seat from `REPO_HARNESS_SEAT` and
   `REPO_HARNESS_SEAT_REPOSITORY`, records a reset request for the current session and
   prints the steps.
2. A non-zero exit resets nothing. Report its `error` and `message` and stop:
   - `seat_identity_missing`: this session was not started by
     `rh seats argv <seat> --repository-id <id>`. Start the seat with
     `repo-harness-orchestrator` or `repo-harness-advisor`.
   - `seat_session_unknown` or `seat_context_unknown`: the SessionStart record or the
     transcript is not readable.
3. Follow the printed steps exactly, in order, then end your turn. The peer seat checks
   the handoff with `rh seats reset`, types the action that the steps name
   (`/compact` below a 32 MiB transcript, `/clear` at or above it) and sends the
   resume prompt.

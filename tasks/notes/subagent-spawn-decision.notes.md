# Implementation Notes: subagent spawn decision

## Decision

Treat subagent and parallel-agent execution as a main-agent decision based on task breadth, context impact, raw-log volume, and callable runner availability. Do not ask the user for spawn confirmation.

## Rationale

The prior harness wording made broad research sound like it had to spawn a subagent. That is the wrong invariant. The invariant is the quality and persistence of the research trace. The main Agent owns the executor choice and should spawn when the task would otherwise consume too much context or raw-log attention, while falling back to bounded in-thread research when no sidecar runner is callable or spawning is not worth the cost.

## Scope

- Policy writers now expose `spawn_decision`, `fallback_runner`, and a main-thread fallback rule under `sidecar_research`.
- Codex resume packets now put the spawn decision on the main agent and explicitly say not to ask the user for spawn confirmation.
- Generated Claude/Codex orchestration partials now use "research delegation" language instead of unconditional subagent offload.
- Reference docs now state that subagent/parallel execution is a context-impact decision owned by the main agent.

## Tradeoff

This keeps the harness portable across Codex, Claude, and future agent runtimes, but it means broad research is not always isolated from the primary context window. The fallback remains bounded and must persist evidence-backed conclusions to `tasks/research.md`.

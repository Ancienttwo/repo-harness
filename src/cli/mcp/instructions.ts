export const MCP_SERVER_INSTRUCTIONS = [
  'repo-harness exposes repo-local workflow artifacts, not general filesystem access.',
  'Use it to read product intent, plans, contracts, checks, reviews, and handoff.',
  'For ChatGPT, act as planner/reviewer: move ideas through PRDs, checklist Sprints with staging gates, and Codex goal prompts.',
  'Do not edit application source through this server. Codex is the executor.',
  'Do not run Codex remotely through planner or executor MCP profiles; prepare .ai/harness/handoff/codex-goal.md for the local Codex host instead.',
  'A local dev-mode runner may exist only when the orchestrator profile is explicitly enabled by user setting.',
  'Before writing a plan, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans.',
].join(' ');

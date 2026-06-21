export function buildMcpServerInstructions(opts: { readerEnabled?: boolean } = {}): string {
  return [
    'repo-harness exposes one MCP connector whose capabilities are selected by local configuration.',
    'Use workflow tools to read product intent, plans, contracts, checks, reviews, and handoff.',
    opts.readerEnabled === true
      ? 'This server also has read-only workspace capability enabled for the configured repo or allowed roots; use list_allowed_roots, open_workspace, tree, search_text, and read_text for repo documents/source, and never request secrets.'
      : 'General workspace reader tools are disabled unless the local user enables the workspace reader capability and allowed roots.',
    'For ChatGPT, act as planner/reviewer: move ideas through PRDs, checklist Sprints with staging gates, and Codex goal prompts.',
    'Do not edit application source through this server. Codex is the executor.',
    'Do not run Codex remotely through planner or executor MCP profiles; prepare .ai/harness/handoff/codex-goal.md for the local Codex host instead.',
    'A local dev-mode runner may exist only when the orchestrator profile is explicitly enabled by user setting.',
    'Before writing a plan, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans.',
  ].join(' ');
}

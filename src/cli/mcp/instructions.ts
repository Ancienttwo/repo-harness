export function buildMcpServerInstructions(opts: { readerEnabled?: boolean; codingEnabled?: boolean; engineerEnabled?: boolean } = {}): string {
  if (opts.engineerEnabled === true) {
    return [
      'repo-harness is serving the restricted Engineer profile for one verified OAuth authorization.',
      'Use engineer_status to confirm the server-derived principal and engineer_acquire only with exact Fleet offer fences.',
      'Tool payload identity fields are optimistic fences and never select the authenticated Engineer principal.',
      'This profile has no shell, generic file read/write, Binding mutation, generic Fleet mutation, Publication, Acceptance, browser, or agent-runner authority.',
    ].join(' ');
  }
  return [
    'repo-harness exposes one MCP connector whose capabilities are selected by local configuration.',
    'Use workflow tools to read product intent, plans, contracts, checks, reviews, and handoff.',
    opts.codingEnabled === true
      ? 'The explicitly enabled coding profile may open only read-write granted repos, defaults to isolated worktrees, and exposes workspace-relative read, guarded atomic patch, and local-user-authority Bash tools. Shell is open-world and is not a filesystem sandbox.'
      : 'Direct coding tools and arbitrary shell are disabled unless the local user enables the separate coding profile and explicit read-write repo grants.',
    opts.readerEnabled === true
      ? 'This server also has read-only workspace capability enabled for the configured repo or allowed roots; use list_allowed_roots, open_workspace, tree, search_text, and read_text for repo documents/source, and never request secrets.'
      : 'General workspace reader tools are disabled unless the local user enables the workspace reader capability and allowed roots.',
    'For ChatGPT, act as planner/reviewer: move ideas through PRDs, checklist Sprints with staging gates, and Codex goal prompts.',
    opts.codingEnabled === true
      ? 'Use direct coding tools only inside the returned workspace_id; preserve repo instructions and never request secret paths or credentials.'
      : 'Do not edit application source through this server. Codex is the executor.',
    'Do not run Codex remotely through planner or executor MCP profiles; prepare .ai/harness/handoff/codex-goal.md for the local Codex host instead.',
    'A local dev-mode runner may exist only when the orchestrator profile is explicitly enabled by user setting.',
    'Before writing a plan, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans.',
  ].join(' ');
}

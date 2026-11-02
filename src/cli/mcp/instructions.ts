export function buildMcpServerInstructions(opts: { readerEnabled?: boolean } = {}): string {
  return [
    'repo-harness exposes one MCP connector whose capabilities are selected by local configuration.',
    'Use workflow tools to read product intent, PRDs under docs/prds/, lessons, and checks.',
    opts.readerEnabled === true
      ? 'This server also has read-only workspace capability enabled for the configured repo or allowed roots; use list_allowed_roots, open_workspace, tree, search_text, and read_text for repo documents/source, and never request secrets.'
      : 'General workspace reader tools are disabled unless the local user enables the workspace reader capability and allowed roots.',
    'Do not edit application source through this server.',
    'Before writing a PRD, inspect docs/spec.md, tasks/lessons.md, and existing PRDs under docs/prds/.',
  ].join(' ');
}

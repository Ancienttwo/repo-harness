/** The `<cap>` path parameter of the architecture routes. */
export const CAPABILITY_ID = /^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$/u;

export const WORKSPACES = ['overview', 'architecture', 'docs', 'pipeline', 'agent-config'] as const;
export type Workspace = typeof WORKSPACES[number];
export interface WorkspaceLocation { readonly workspace: Workspace; readonly module: string | null }

/** `#architecture/<cap>` selects a module. Any other fragment falls back to Overview. */
export function parseWorkspaceLocation(hash: string): WorkspaceLocation {
  const [name, module, ...rest] = hash.replace(/^#/u, '').split('/');
  const workspace = WORKSPACES.find(item => item === name);
  if (!workspace || rest.length > 0) return { workspace: 'overview', module: null };
  if (module === undefined) return { workspace, module: null };
  return workspace === 'architecture' && CAPABILITY_ID.test(module) ? { workspace, module } : { workspace: 'overview', module: null };
}

export function workspaceHash({ workspace, module }: WorkspaceLocation): string {
  if (workspace === 'overview') return '';
  return module === null ? `#${workspace}` : `#${workspace}/${module}`;
}

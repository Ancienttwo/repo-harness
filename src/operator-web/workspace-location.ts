import { TOOL_CATALOG } from '../core/tools/catalog';

/** The `<cap>` path parameter of the architecture routes. */
export const CAPABILITY_ID = /^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$/u;

/**
 * Side-rail order and group. Home sits above the groups. Every entry has a data
 * source; a page that a later slice adds is absent, never a placeholder.
 */
export const WORKSPACES = [
  { id: 'home', group: null },
  { id: 'board', group: 'work' },
  { id: 'repositories', group: 'work' },
  { id: 'agents', group: 'setup' },
  { id: 'skills', group: 'setup' },
  { id: 'hooks', group: 'setup' },
  { id: 'architecture', group: 'observe' },
  { id: 'system', group: 'observe' },
  { id: 'tools', group: 'observe' },
] as const;
export type NavWorkspace = typeof WORKSPACES[number]['id'];
export type NavGroup = NonNullable<typeof WORKSPACES[number]['group']>;
/** The three pages read from one `repo-harness setup check` result. */
export const SETUP_WORKSPACES = ['agents', 'skills', 'hooks'] as const;
/** `repository` is the detail page of one repository; it is reached from the list, not the nav. */
export type Workspace = NavWorkspace | 'repository';

export interface WorkspaceLocation {
  readonly workspace: Workspace;
  /** `#architecture/<cap>` selects a module. */
  readonly module: string | null;
  /**
   * The drawer subject. `#board/<item>` opens one board item; its id is
   * URI-encoded in the hash. `#tools/<id>` opens one catalog entry.
   */
  readonly item: string | null;
}

const HOME: WorkspaceLocation = { workspace: 'home', module: null, item: null };
const ITEM_ID_LIMIT = 512;

function decodeItem(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  // eslint-disable-next-line no-control-regex
  return decoded.length > 0 && decoded.length <= ITEM_ID_LIMIT && !/[\u0000-\u001f\u007f]/u.test(decoded) ? decoded : null;
}

/** An empty or unknown fragment is Home. A malformed parameter also falls to Home. */
export function parseWorkspaceLocation(hash: string): WorkspaceLocation {
  const [name, parameter, ...rest] = hash.replace(/^#/u, '').split('/');
  if (rest.length > 0) return HOME;
  if (name === 'home' || name === 'repositories' || name === 'repository' || name === 'system' || name === 'agents' || name === 'skills' || name === 'hooks') {
    return parameter === undefined ? { workspace: name, module: null, item: null } : HOME;
  }
  if (name === 'architecture') {
    if (parameter === undefined) return { workspace: 'architecture', module: null, item: null };
    return CAPABILITY_ID.test(parameter) ? { workspace: 'architecture', module: parameter, item: null } : HOME;
  }
  if (name === 'tools') {
    if (parameter === undefined) return { workspace: 'tools', module: null, item: null };
    // Catalog ids already match the decoder's strict id pattern.
    return TOOL_CATALOG.tools.some(tool => tool.id === parameter) ? { workspace: 'tools', module: null, item: parameter } : HOME;
  }
  if (name === 'board') {
    if (parameter === undefined) return { workspace: 'board', module: null, item: null };
    const item = decodeItem(parameter);
    return item === null ? HOME : { workspace: 'board', module: null, item };
  }
  return HOME;
}

export function workspaceHash({ workspace, module, item }: WorkspaceLocation): string {
  if (workspace === 'board') return item === null ? '#board' : `#board/${encodeURIComponent(item)}`;
  if (workspace === 'architecture' && module !== null) return `#architecture/${module}`;
  if (workspace === 'tools' && item !== null) return `#tools/${item}`;
  return `#${workspace}`;
}

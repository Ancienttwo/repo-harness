/** The `<cap>` path parameter of the architecture routes. */
export const CAPABILITY_ID = /^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$/u;

/** Navigation order. Every entry has a data source; no placeholder pages. */
export const WORKSPACES = ['board', 'repositories', 'architecture', 'system'] as const;
/** `repository` is the detail page of one repository; it is reached from the list, not the nav. */
export type Workspace = typeof WORKSPACES[number] | 'repository';

export interface WorkspaceLocation {
  readonly workspace: Workspace;
  /** `#architecture/<cap>` selects a module. */
  readonly module: string | null;
  /** `#board/<item>` opens one board item in the drawer. The id is URI-encoded in the hash. */
  readonly item: string | null;
}

const BOARD: WorkspaceLocation = { workspace: 'board', module: null, item: null };
const ITEM_ID_LIMIT = 512;

function decodeItem(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  // eslint-disable-next-line no-control-regex
  return decoded.length > 0 && decoded.length <= ITEM_ID_LIMIT && !/[\u0000-\u001f\u007f]/u.test(decoded) ? decoded : null;
}

/** An empty or unknown fragment is the Board. A malformed parameter also falls to the Board. */
export function parseWorkspaceLocation(hash: string): WorkspaceLocation {
  const [name, parameter, ...rest] = hash.replace(/^#/u, '').split('/');
  if (rest.length > 0) return BOARD;
  if (name === 'repositories' || name === 'repository' || name === 'system') {
    return parameter === undefined ? { workspace: name, module: null, item: null } : BOARD;
  }
  if (name === 'architecture') {
    if (parameter === undefined) return { workspace: 'architecture', module: null, item: null };
    return CAPABILITY_ID.test(parameter) ? { workspace: 'architecture', module: parameter, item: null } : BOARD;
  }
  if (name === 'board' && parameter !== undefined) {
    const item = decodeItem(parameter);
    return item === null ? BOARD : { workspace: 'board', module: null, item };
  }
  return BOARD;
}

export function workspaceHash({ workspace, module, item }: WorkspaceLocation): string {
  if (workspace === 'board') return item === null ? '#board' : `#board/${encodeURIComponent(item)}`;
  if (workspace === 'architecture' && module !== null) return `#architecture/${module}`;
  return `#${workspace}`;
}

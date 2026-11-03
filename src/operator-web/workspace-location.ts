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
  { id: 'worktrees', group: 'work' },
  { id: 'docs', group: 'work' },
  { id: 'agents', group: 'setup' },
  { id: 'skills', group: 'setup' },
  { id: 'hooks', group: 'setup' },
  { id: 'cli', group: 'setup' },
  { id: 'bots', group: 'setup' },
  { id: 'architecture', group: 'observe' },
  { id: 'tests', group: 'observe' },
  { id: 'system', group: 'observe' },
  { id: 'tools', group: 'observe' },
] as const;
export type NavWorkspace = typeof WORKSPACES[number]['id'];
export type NavGroup = NonNullable<typeof WORKSPACES[number]['group']>;
/** The three pages read from one `repo-harness setup check` result. */
export const SETUP_WORKSPACES = ['agents', 'skills', 'hooks'] as const;
export type Workspace = NavWorkspace;

export interface WorkspaceLocation {
  readonly workspace: Workspace;
  /** `#architecture/<cap>` selects a module. */
  readonly module: string | null;
  /**
   * The page subject. `#board/<repository>/<parent>` names the board of one
   * parent issue and `#board/<repository>/<parent>/<issue>` opens one of its
   * issues in the drawer (see `boardPlace`). `#tools/<id>` opens one catalog entry.
   * `#docs/<path>` names one repository-relative file; the docs route decides
   * whether it may be read.
   */
  readonly item: string | null;
}

const HOME: WorkspaceLocation = { workspace: 'home', module: null, item: null };
const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISSUE_NUMBER = /^[1-9][0-9]{0,9}$/u;

/** The board subject of a `#board/...` item: a registered repository id, its parent issue and the drawer issue. */
export interface BoardPlace {
  readonly repository_id: string;
  readonly parent: number;
  readonly issue: number | null;
}

/** Null for a board without a subject and for any item that is not `<repository>/<parent>[/<issue>]`. */
export function boardPlace(item: string | null): BoardPlace | null {
  if (item === null) return null;
  const [repository, parent, issue, ...rest] = item.split('/');
  if (rest.length > 0 || repository === undefined || !REPOSITORY_ID.test(repository) || parent === undefined || !ISSUE_NUMBER.test(parent)) return null;
  if (issue !== undefined && !ISSUE_NUMBER.test(issue)) return null;
  return { repository_id: repository, parent: Number(parent), issue: issue === undefined ? null : Number(issue) };
}

export function boardLocation(place: BoardPlace): WorkspaceLocation {
  return { workspace: 'board', module: null, item: [place.repository_id, place.parent, ...(place.issue === null ? [] : [place.issue])].join('/') };
}
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
  if (name === 'docs') {
    if (parameter === undefined) return { workspace: 'docs', module: null, item: null };
    const segments = [parameter, ...rest].map(decodeItem);
    return segments.some(segment => segment === null) ? HOME : { workspace: 'docs', module: null, item: segments.join('/') };
  }
  if (name === 'board') {
    if (parameter === undefined) return { workspace: 'board', module: null, item: null };
    const place = boardPlace([parameter, ...rest].join('/'));
    return place === null ? HOME : boardLocation(place);
  }
  if (rest.length > 0) return HOME;
  if (name === 'home' || name === 'repositories' || name === 'worktrees' || name === 'system' || name === 'agents' || name === 'skills' || name === 'hooks' || name === 'cli' || name === 'bots' || name === 'tests') {
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
  return HOME;
}

export function workspaceHash({ workspace, module, item }: WorkspaceLocation): string {
  if (workspace === 'board') return item === null ? '#board' : `#board/${item}`;
  if (workspace === 'architecture' && module !== null) return `#architecture/${module}`;
  if (workspace === 'tools' && item !== null) return `#tools/${item}`;
  // Each segment is encoded on its own, so the path stays readable in the address bar.
  if (workspace === 'docs' && item !== null) return `#docs/${item.split('/').map(encodeURIComponent).join('/')}`;
  return `#${workspace}`;
}

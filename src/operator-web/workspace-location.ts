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
/** The three pages read from one `rh setup check` result. */
export const SETUP_WORKSPACES = ['agents', 'skills', 'hooks'] as const;
export type Workspace = NavWorkspace;

export interface WorkspaceLocation {
  readonly workspace: Workspace;
  /** `#architecture/<cap>` selects a module. */
  readonly module: string | null;
  /**
   * The page subject. `#board/<repository>/<parent>` names the board of one
   * parent issue and `#board/<repository>/<parent>/<issue>` opens one of its
   * issues in the drawer (see `boardPlace`). A leading `office` segment
   * (`#board/office`, `#board/office/<repository>/<parent>[/<issue>]`) selects
   * the office layout; without it the board is the list. `#board/office/<repository>`
   * is the room of a repository with no selected parent. `#tools/<id>` opens one catalog entry.
   * `#docs/<path>` names one repository-relative file; the docs route decides
   * whether it may be read.
   */
  readonly item: string | null;
}

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISSUE_NUMBER = /^[1-9][0-9]{0,9}$/u;
const REGISTERED_REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;

/** The two layouts of the Board page. The list is the default. */
export type BoardLayout = 'list' | 'office';
/** A registered repository id is `repo_<16 hex>`, so this segment never names a repository. */
const OFFICE_SEGMENT = 'office';
/** The landing page: the page of an empty fragment, and of any fragment that names no valid page. `#home` stays Home. */
export const DEFAULT_LOCATION: WorkspaceLocation = { workspace: 'board', module: null, item: OFFICE_SEGMENT };

/** The board subject of a `#board/...` item: a registered repository id, its parent issue, the drawer issue and the layout. */
export interface BoardPlace {
  readonly repository_id: string;
  readonly parent: number;
  readonly issue: number | null;
  readonly layout: BoardLayout;
}

/** The layout of a `#board/...` item, also when the item names no board. */
export function boardLayout(item: string | null): BoardLayout {
  return item !== null && item.split('/')[0] === OFFICE_SEGMENT ? 'office' : 'list';
}

/** Null for a board without a subject and for any item that is not `[office/]<repository>/<parent>[/<issue>]`. */
export function boardPlace(item: string | null): BoardPlace | null {
  if (item === null) return null;
  const layout = boardLayout(item);
  const [repository, parent, issue, ...rest] = item.split('/').slice(layout === 'office' ? 1 : 0);
  if (rest.length > 0 || repository === undefined || !REPOSITORY_ID.test(repository) || parent === undefined || !ISSUE_NUMBER.test(parent)) return null;
  if (issue !== undefined && !ISSUE_NUMBER.test(issue)) return null;
  return { repository_id: repository, parent: Number(parent), issue: issue === undefined ? null : Number(issue), layout };
}

/** The repository of an `office/<repository>` item: the room with no selected parent. */
export function boardRoom(item: string | null): string | null {
  if (item === null) return null;
  const [office, repository, ...rest] = item.split('/');
  return office === OFFICE_SEGMENT && repository !== undefined && rest.length === 0 && REGISTERED_REPOSITORY_ID.test(repository) ? repository : null;
}

export function boardRoomLocation(repository_id: string): WorkspaceLocation {
  return { workspace: 'board', module: null, item: `${OFFICE_SEGMENT}/${repository_id}` };
}

export function boardLocation(place: BoardPlace): WorkspaceLocation {
  const subject = [place.repository_id, place.parent, ...(place.issue === null ? [] : [place.issue])];
  return { workspace: 'board', module: null, item: (place.layout === 'office' ? [OFFICE_SEGMENT, ...subject] : subject).join('/') };
}

/** The Board page with no board selected: the parent list, or the office overview. */
export function boardHomeLocation(layout: BoardLayout): WorkspaceLocation {
  return { workspace: 'board', module: null, item: layout === 'office' ? OFFICE_SEGMENT : null };
}
const ITEM_ID_LIMIT = 512;

function decodeItem(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  // eslint-disable-next-line no-control-regex
  return decoded.length > 0 && decoded.length <= ITEM_ID_LIMIT && !/[\u0000-\u001f\u007f]/u.test(decoded) ? decoded : null;
}

/** An empty or unknown fragment is the default page. A malformed parameter also falls to the default page. */
export function parseWorkspaceLocation(hash: string): WorkspaceLocation {
  const [name, parameter, ...rest] = hash.replace(/^#/u, '').split('/');
  if (name === 'docs') {
    if (parameter === undefined) return { workspace: 'docs', module: null, item: null };
    const segments = [parameter, ...rest].map(decodeItem);
    return segments.some(segment => segment === null) ? DEFAULT_LOCATION : { workspace: 'docs', module: null, item: segments.join('/') };
  }
  if (name === 'board') {
    if (parameter === undefined) return boardHomeLocation('list');
    if (parameter === OFFICE_SEGMENT && rest.length === 0) return boardHomeLocation('office');
    const item = [parameter, ...rest].join('/');
    const room = boardRoom(item);
    if (room !== null) return boardRoomLocation(room);
    const place = boardPlace(item);
    return place === null ? DEFAULT_LOCATION : boardLocation(place);
  }
  if (rest.length > 0) return DEFAULT_LOCATION;
  if (name === 'home' || name === 'repositories' || name === 'worktrees' || name === 'system' || name === 'agents' || name === 'skills' || name === 'hooks' || name === 'cli' || name === 'bots' || name === 'tests') {
    return parameter === undefined ? { workspace: name, module: null, item: null } : DEFAULT_LOCATION;
  }
  if (name === 'architecture') {
    if (parameter === undefined) return { workspace: 'architecture', module: null, item: null };
    return CAPABILITY_ID.test(parameter) ? { workspace: 'architecture', module: parameter, item: null } : DEFAULT_LOCATION;
  }
  if (name === 'tools') {
    if (parameter === undefined) return { workspace: 'tools', module: null, item: null };
    // Catalog ids already match the decoder's strict id pattern.
    return TOOL_CATALOG.tools.some(tool => tool.id === parameter) ? { workspace: 'tools', module: null, item: parameter } : DEFAULT_LOCATION;
  }
  return DEFAULT_LOCATION;
}

export function workspaceHash({ workspace, module, item }: WorkspaceLocation): string {
  if (workspace === 'board') return item === null ? '#board' : `#board/${item}`;
  if (workspace === 'architecture' && module !== null) return `#architecture/${module}`;
  if (workspace === 'tools' && item !== null) return `#tools/${item}`;
  // Each segment is encoded on its own, so the path stays readable in the address bar.
  if (workspace === 'docs' && item !== null) return `#docs/${item.split('/').map(encodeURIComponent).join('/')}`;
  return `#${workspace}`;
}

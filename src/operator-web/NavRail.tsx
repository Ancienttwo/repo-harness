import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@cloudflare/kumo';
import {
  BookOpenTextIcon,
  CaretUpDownIcon,
  CpuIcon,
  DesktopIcon,
  FlaskIcon,
  FoldersIcon,
  GearSixIcon,
  GitForkIcon,
  HeadCircuitIcon,
  HouseIcon,
  KanbanIcon,
  ListIcon,
  MoonIcon,
  PlugsConnectedIcon,
  PlusIcon,
  PuzzlePieceIcon,
  RobotIcon,
  SidebarSimpleIcon,
  SunIcon,
  TerminalWindowIcon,
  TreeStructureIcon,
  WrenchIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { DevActivitySnapshotV2 } from '../core/dev-activity/types';
import { LogoMark } from './brand';
import { failedSources, openPullRequests, repositoryById, type DevActivityView } from './dev-activity';
import type { OperatorLocale, OperatorTranslate } from './i18n';
import { docSessionStartState, isSessionUnread, type DocSessions } from './doc-sessions';
import type { ThemePreference } from './theme';
import { PageLink, StatusDot, type DotTone } from './ui';
import { WORKSPACES, type NavGroup, type NavWorkspace, type Workspace, type WorkspaceLocation } from './workspace-location';

const NAV_ICON: Readonly<Record<NavWorkspace, ReactNode>> = {
  home: <HouseIcon size={16} />,
  board: <KanbanIcon size={16} />,
  repositories: <FoldersIcon size={16} />,
  worktrees: <GitForkIcon size={16} />,
  docs: <BookOpenTextIcon size={16} />,
  agents: <RobotIcon size={16} />,
  skills: <PuzzlePieceIcon size={16} />,
  hooks: <PlugsConnectedIcon size={16} />,
  cli: <TerminalWindowIcon size={16} />,
  bots: <HeadCircuitIcon size={16} />,
  architecture: <TreeStructureIcon size={16} />,
  tests: <FlaskIcon size={16} />,
  system: <CpuIcon size={16} />,
  tools: <WrenchIcon size={16} />,
  settings: <GearSixIcon size={16} />,
};

const GROUPS: readonly NavGroup[] = ['work', 'setup', 'observe'];

const THEME_ICON: Readonly<Record<ThemePreference, ReactNode>> = {
  system: <DesktopIcon size={16} />, light: <SunIcon size={16} />, dark: <MoonIcon size={16} />,
};

export const OPERATOR_RAIL_STORAGE_KEY = 'repo-harness:operator-rail';
export const OPERATOR_RECENT_REPOSITORIES_STORAGE_KEY = 'repo-harness:operator-recent-repositories';
const RECENT_LIMIT = 5;
const RECENT_SESSIONS_LIMIT = 8;

type RailScope = 'architecture' | 'pages';

function readStorage(key: string): string | null {
  try { return typeof window === 'undefined' ? null : localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* A blocked store keeps the choice for this page only. */ }
}

function storedCollapse(scope: RailScope): boolean | null {
  const value = readStorage(`${OPERATOR_RAIL_STORAGE_KEY}:${scope}`);
  return value === 'collapsed' ? true : value === 'expanded' ? false : null;
}

/**
 * The architecture page opens as the 64 px icon bar and every other page opens
 * expanded. A toggle changes only its own scope and stays in this browser.
 */
export function useRailCollapsed(workspace: Workspace): readonly [boolean, () => void] {
  const scope: RailScope = workspace === 'architecture' ? 'architecture' : 'pages';
  const [choices, setChoices] = useState<Readonly<Record<RailScope, boolean | null>>>(() => ({
    architecture: storedCollapse('architecture'), pages: storedCollapse('pages'),
  }));
  const collapsed = choices[scope] ?? scope === 'architecture';
  const toggle = useCallback(() => {
    writeStorage(`${OPERATOR_RAIL_STORAGE_KEY}:${scope}`, collapsed ? 'expanded' : 'collapsed');
    setChoices(current => ({ ...current, [scope]: !collapsed }));
  }, [scope, collapsed]);
  return [collapsed, toggle];
}

function readRecent(): readonly string[] {
  try {
    const value: unknown = JSON.parse(readStorage(OPERATOR_RECENT_REPOSITORIES_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function isActive(current: Workspace, workspace: NavWorkspace): boolean {
  return current === workspace || (workspace === 'repositories' && current === 'repository');
}

const HOME: WorkspaceLocation = { workspace: 'home', module: null, item: null };
const REPOSITORIES: WorkspaceLocation = { workspace: 'repositories', module: null, item: null };

export interface SwitchOption {
  readonly id: string;
  readonly label: string;
  readonly tone: DotTone;
  readonly status: string;
}

/** One line about a repository from Dev Activity: a failed source first, then work waiting on you, then open PRs. */
export function switchOption(snapshot: DevActivitySnapshotV2 | null, id: string, label: string, t: OperatorTranslate): SwitchOption {
  const repository = snapshot ? repositoryById(snapshot, id) : null;
  if (snapshot === null || repository === null) return { id, label, tone: 'unknown', status: t('switch.status.unknown') };
  const failed = failedSources(repository)[0];
  if (failed) {
    const source = t(`source.kind.${failed.kind}`);
    return failed.status === 'stale'
      ? { id, label, tone: 'warn', status: t('switch.status.stale', { source }) }
      : { id, label, tone: 'danger', status: t('switch.status.unavailable', { source }) };
  }
  const waiting = snapshot.attention.filter(row => row.repository_id === id).length;
  if (waiting > 0) return { id, label, tone: 'accent', status: t('switch.status.waiting', { count: waiting }) };
  return { id, label, tone: 'ok', status: t('switch.status.open', { count: openPullRequests(snapshot.items, id) }) };
}

export interface RepositorySwitchModel {
  /** `current` on a single-repository page, `scope` on a page across repositories. */
  readonly mode: 'current' | 'scope';
  /** The repository the page reads, or the board filter; null is every repository. */
  readonly selected: { readonly id: string; readonly label: string; readonly detail: string | null } | null;
  readonly options: readonly SwitchOption[];
  /** A single-repository page has no "all repositories" choice. */
  readonly allowAll: boolean;
  readonly onSelect: (id: string | null) => void;
}

function RepositorySwitch({ model, collapsed, locale, onManage, t }: {
  readonly model: RepositorySwitchModel; readonly collapsed: boolean; readonly locale: OperatorLocale;
  readonly onManage: () => void; readonly t: OperatorTranslate;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const away = (event: Event) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const close = () => { setOpen(false); setQuery(''); };
  const choose = (id: string | null) => {
    if (id !== null) {
      const next = [id, ...recent.filter(entry => entry !== id)].slice(0, RECENT_LIMIT);
      writeStorage(OPERATOR_RECENT_REPOSITORIES_STORAGE_KEY, JSON.stringify(next));
      setRecent(next);
    }
    close();
    if (id !== (model.selected?.id ?? null)) model.onSelect(id);
  };
  const needle = query.trim().toLowerCase();
  const rank = (id: string) => { const index = recent.indexOf(id); return index === -1 ? RECENT_LIMIT : index; };
  const matches = model.options
    .filter(option => needle === '' || option.label.toLowerCase().includes(needle))
    .map((option, index) => ({ option, index }))
    .sort((left, right) => rank(left.option.id) - rank(right.option.id) || left.index - right.index)
    .map(({ option }) => option);
  const shown = matches.slice(0, RECENT_LIMIT);
  const rest = matches.length - shown.length;
  const selectedId = model.selected?.id ?? null;
  const name = model.selected?.label ?? (model.mode === 'current' ? t('repository.select') : t('filter.allRepositories'));
  const tile = model.selected ? Array.from(model.selected.label)[0]?.toUpperCase() ?? '·' : String(model.options.length);
  // Uppercase monospace eyebrows are for English and protocol words; Chinese labels use the caption style.
  const eyebrow = locale === 'en' ? 'type-eyebrow uppercase text-kumo-brand' : 'type-caption text-kumo-subtle';
  const optionClass = (selected: boolean) => cn('flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left',
    selected ? 'bg-kumo-tint' : 'hover:bg-kumo-tint');
  return (
    <div ref={rootRef} className="relative" onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape' || !open) return;
      event.stopPropagation(); close(); buttonRef.current?.focus();
    }}>
      <button ref={buttonRef} type="button" aria-expanded={open} aria-controls={menuId} data-repository-switch={model.mode} data-selected={selectedId ?? ''}
        aria-label={collapsed ? `${model.mode === 'current' ? t('switch.current') : t('switch.scope')}: ${name}` : undefined}
        title={collapsed ? name : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-lg border bg-kumo-base p-2.5 text-left shadow-xs',
          open ? 'border-(--rh-accent) ring-3 ring-(--rh-accent-tint)' : 'border-kumo-interact hover:border-kumo-line',
          collapsed && 'rail:justify-center rail:p-1.5')}>
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-(--rh-accent-tint) font-mono text-sm font-semibold text-kumo-strong">{tile}</span>
        <span className={cn('min-w-0 flex-1', collapsed && 'rail:hidden')}>
          <span className={cn('block', eyebrow)}>{model.mode === 'current' ? t('switch.current') : t('switch.scope')}</span>
          <span className="block truncate font-(family-name:--font-display) text-sm font-semibold text-kumo-strong">{name}</span>
          {model.selected?.detail && <span className="block truncate font-mono text-xs text-kumo-subtle" data-switch-detail>{model.selected.detail}</span>}
        </span>
        <CaretUpDownIcon size={14} aria-hidden="true" className={cn('shrink-0 text-kumo-subtle', collapsed && 'rail:hidden')} />
      </button>
      {open && (
        <div id={menuId} role="dialog" aria-label={t('filter.repository')}
          className={cn('absolute top-full left-0 z-50 mt-1.5 flex w-[300px] max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-lg border border-kumo-line bg-kumo-overlay p-1.5 shadow-lg',
            collapsed && 'rail:top-0 rail:left-full rail:mt-0 rail:ml-2')}>
          <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('switch.search')} placeholder={t('switch.search')}
            className="h-8 rounded-md border border-kumo-line bg-kumo-base px-2.5 text-sm text-kumo-default placeholder:text-kumo-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand" />
          <ul className="flex flex-col gap-0.5">
            {model.allowAll && needle === '' && (
              <li>
                <button type="button" data-switch-option="" aria-current={selectedId === null ? 'true' : undefined} className={optionClass(selectedId === null)} onClick={() => choose(null)}>
                  <span className="text-sm font-medium text-kumo-strong">{t('filter.allRepositories')}</span>
                </button>
              </li>
            )}
            {shown.map(option => (
              <li key={option.id}>
                <button type="button" data-switch-option={option.id} aria-current={selectedId === option.id ? 'true' : undefined}
                  className={optionClass(selectedId === option.id)} onClick={() => choose(option.id)}>
                  <StatusDot tone={option.tone} className="mt-1.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm text-kumo-strong" data-switch-label>{option.label}</span>
                    <span className="block truncate text-xs text-kumo-subtle">{option.status}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2.5 py-2 text-sm text-kumo-subtle">{t('switch.none')}</li>}
          </ul>
          <PageLink to={REPOSITORIES} onOpen={() => { close(); onManage(); }} data-switch-manage className="rounded-md px-2.5 py-2 text-sm text-kumo-link hover:bg-kumo-tint">
            {rest > 0 ? t('switch.more', { count: rest }) : t('switch.manage')} ›
          </PageLink>
        </div>
      )}
    </div>
  );
}

function NavLink({ workspace, current, collapsed, attention, onOpen, t }: {
  readonly workspace: NavWorkspace; readonly current: Workspace; readonly collapsed: boolean; readonly attention: number | null;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const active = isActive(current, workspace);
  const label = t(`nav.${workspace}`);
  return (
    <PageLink to={{ workspace, module: null, item: null }} onOpen={onOpen} aria-current={active ? 'page' : undefined} data-workspace={workspace} title={collapsed ? label : undefined}
      className={cn('flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm',
        active ? 'bg-kumo-tint font-medium text-kumo-strong' : 'text-kumo-default hover:bg-kumo-tint',
        collapsed && 'rail:mx-auto rail:size-10 rail:justify-center rail:px-0')}>
      {NAV_ICON[workspace]}
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'rail:sr-only')}>{label}</span>
      {workspace === 'board' && attention !== null && attention > 0 && (
        <span data-needs-you={attention} className={cn('rounded-full bg-(--rh-accent) px-1.5 font-mono text-xs font-semibold tabular-nums text-(--rh-on-accent)', collapsed && 'rail:hidden')}>
          {attention}
        </span>
      )}
    </PageLink>
  );
}

/** 「新会话」 opens Home with the composer focused. It exists only where the server can start a doc session. */
function NewSessionButton({ collapsed, onNewSession, t }: { readonly collapsed: boolean; readonly onNewSession: () => void; readonly t: OperatorTranslate }) {
  return (
    <button type="button" onClick={onNewSession} data-new-session title={collapsed ? t('session.new') : undefined}
      className={cn('flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-kumo-default hover:bg-kumo-tint',
        collapsed && 'rail:mx-auto rail:size-10 rail:justify-center rail:px-0')}>
      <PlusIcon size={16} />
      <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'rail:sr-only')}>{t('session.new')}</span>
    </button>
  );
}

/** 「最近」: doc sessions in the order the server lists them, one truncated line each, with an unread dot. */
function RecentSessions({ docSessions, currentSession, collapsed, onOpen, t }: {
  readonly docSessions: DocSessions; readonly currentSession: string | null; readonly collapsed: boolean;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const { view } = docSessions;
  if (view.kind !== 'ready' || view.list.sessions.length === 0) return null;
  return (
    <div className={cn('flex flex-col', collapsed && 'rail:hidden')} data-recent-sessions>
      <p id="nav-group-recent" className="type-caption px-2.5 pt-4 pb-1 text-kumo-subtle">{t('session.recent')}</p>
      <ul aria-labelledby="nav-group-recent" className="flex flex-col gap-0.5">
          {view.list.sessions.slice(0, RECENT_SESSIONS_LIMIT).map(session => {
            const active = currentSession === session.session_id;
            const unread = !active && isSessionUnread(session);
            return (
              <li key={session.session_id}>
                <PageLink to={{ workspace: 'session', module: null, item: session.session_id }} onOpen={onOpen} data-recent-session={session.session_id} title={session.title}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm', active ? 'bg-kumo-tint font-medium text-kumo-strong' : 'text-kumo-default hover:bg-kumo-tint')}>
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  {unread && <><StatusDot tone="accent" /><span className="sr-only" data-unread>{t('session.unread')}</span></>}
                </PageLink>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

type OperatorStatus = 'loading' | 'ready' | 'refreshFailed' | 'unreachable';

const STATUS_TONE: Readonly<Record<OperatorStatus, DotTone>> = { loading: 'unknown', ready: 'ok', refreshFailed: 'warn', unreachable: 'danger' };

function operatorStatus(view: DevActivityView): OperatorStatus {
  if (view.kind === 'ready') return view.refreshFailed ? 'refreshFailed' : 'ready';
  return view.kind;
}

const RAIL_ID = 'operator-rail';

export interface NavRailProps {
  readonly current: Workspace;
  readonly attention: number | null;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly repositorySwitch: RepositorySwitchModel;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  /** Below 760 px the rail is a drawer; the page header's menu button opens it. */
  readonly drawerOpen: boolean;
  readonly onCloseDrawer: () => void;
  readonly activity: DevActivityView;
  /** The doc session list behind「新会话」 and「最近」; both are hidden while the server serves no session. */
  readonly docSessions?: DocSessions;
  /** The open doc session, highlighted in「最近」. */
  readonly currentSession?: string | null;
  readonly onNewSession?: () => void;
  readonly locale: OperatorLocale;
  readonly onLocale: (locale: OperatorLocale) => void;
  readonly theme: ThemePreference;
  readonly onTheme: () => void;
  readonly t: OperatorTranslate;
}

export function NavRail({
  current, attention, onOpen, repositorySwitch, collapsed, onToggleCollapsed, drawerOpen, onCloseDrawer,
  activity, docSessions, currentSession = null, onNewSession, locale, onLocale, theme, onTheme, t,
}: NavRailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onCloseDrawer(); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); opener?.focus?.(); };
  }, [drawerOpen, onCloseDrawer]);
  const open = (next: WorkspaceLocation) => { onCloseDrawer(); onOpen(next); };
  const status = operatorStatus(activity);
  const host = typeof window === 'undefined' ? null : window.location.host;
  const localeButton = (value: OperatorLocale, label: string) => (
    <button type="button" aria-pressed={locale === value} onClick={() => onLocale(value)}
      className={cn('h-7 min-w-7 cursor-pointer rounded-[5px] px-1.5 font-mono text-xs',
        locale === value ? 'bg-kumo-base font-semibold text-kumo-strong shadow-xs' : 'text-kumo-subtle hover:text-kumo-default')}>
      {label}
    </button>
  );
  const groupLinks = (group: NavGroup) => WORKSPACES.filter(entry => entry.group === group).map(entry => (
    <li key={entry.id}><NavLink workspace={entry.id} current={current} collapsed={collapsed} attention={attention} onOpen={open} t={t} /></li>
  ));
  return (
    <>
      {drawerOpen && <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40 rail:hidden" onClick={onCloseDrawer} data-rail-backdrop />}
      <aside id={RAIL_ID} data-nav-rail={collapsed ? 'collapsed' : 'expanded'} data-drawer={drawerOpen ? 'open' : 'closed'}
        className={cn('fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-3 border-r border-kumo-line bg-kumo-base px-3 pt-3 pb-3',
          'max-rail:duration-200 motion-reduce:transition-none',
          // Opening shows the drawer at once so its close button can take focus; closing keeps it visible until it slides out.
          drawerOpen ? 'max-rail:translate-x-0 max-rail:transition-[translate]' : 'max-rail:invisible max-rail:-translate-x-full max-rail:transition-[translate,visibility]',
          'rail:sticky rail:top-0 rail:z-20 rail:h-dvh rail:shrink-0',
          collapsed && 'rail:w-16 rail:px-2')}>
        <div className={cn('flex items-center gap-2 px-1', collapsed && 'rail:flex-col rail:px-0')}>
          <PageLink to={HOME} onOpen={open} className="flex min-w-0 items-center gap-2">
            <LogoMark height={36} />
            <span className={cn('type-title truncate text-kumo-strong', collapsed && 'rail:sr-only')}>repo-harness</span>
          </PageLink>
          <button type="button" onClick={onToggleCollapsed} aria-label={t('rail.toggle')} title={t('rail.toggle')} aria-expanded={!collapsed} aria-controls={RAIL_ID} data-rail-toggle
            className={cn('ml-auto grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default max-rail:hidden', collapsed && 'rail:ml-0')}>
            <SidebarSimpleIcon size={18} />
          </button>
          <button ref={closeRef} type="button" onClick={onCloseDrawer} aria-label={t('rail.close')}
            className="ml-auto grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-md text-kumo-subtle hover:bg-kumo-tint rail:hidden">
            <XIcon size={18} />
          </button>
        </div>
        {/* A pick routes like a nav link, so it closes the drawer too. */}
        <RepositorySwitch model={{ ...repositorySwitch, onSelect: id => { onCloseDrawer(); repositorySwitch.onSelect(id); } }}
          collapsed={collapsed} locale={locale} t={t} onManage={() => open(REPOSITORIES)} />
        {docSessions !== undefined && onNewSession !== undefined && docSessionStartState(docSessions.view).show && (
          <NewSessionButton collapsed={collapsed} onNewSession={() => { onCloseDrawer(); onNewSession(); }} t={t} />
        )}
        <nav aria-label={t('nav.label')} className="workspace-nav -mx-1 flex min-h-0 flex-1 flex-col px-1">
          {/* Settings stays outside the scroll area, so a long「最近」list never pushes it out of view. */}
          <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
            <ul><li><NavLink workspace="home" current={current} collapsed={collapsed} attention={attention} onOpen={open} t={t} /></li></ul>
            {GROUPS.map(group => (
              <div key={group} className="flex flex-col">
                <p id={`nav-group-${group}`} className={cn('type-caption px-2.5 pt-4 pb-1 text-kumo-subtle', collapsed && 'rail:sr-only')}>{t(`nav.group.${group}`)}</p>
                {collapsed && <hr aria-hidden="true" className="mx-2 my-2 hidden border-kumo-line rail:block" />}
                <ul aria-labelledby={`nav-group-${group}`} className="flex flex-col gap-0.5">{groupLinks(group)}</ul>
              </div>
            ))}
            {docSessions !== undefined && <RecentSessions docSessions={docSessions} currentSession={currentSession} collapsed={collapsed} onOpen={open} t={t} />}
          </div>
          <ul className="pt-4"><li><NavLink workspace="settings" current={current} collapsed={collapsed} attention={attention} onOpen={open} t={t} /></li></ul>
        </nav>
        <div className={cn('flex flex-col gap-2 border-t border-kumo-hairline px-1 pt-3', collapsed && 'rail:items-center rail:px-0')} data-operator-status={status}>
          <div className={cn('flex min-w-0 items-start gap-2 text-xs text-kumo-subtle', collapsed && 'rail:justify-center')} title={collapsed ? t(`rail.status.${status}`) : undefined}>
            <StatusDot tone={STATUS_TONE[status]} className="mt-1" />
            <span className={cn('min-w-0', collapsed && 'rail:sr-only')}>
              <span className="block truncate">{t(`rail.status.${status}`)}</span>
              {/* Protocol vocabulary: never translated. The full boundary lives on the System page. It wraps rather than truncates, so the exception stays visible. */}
              <span className="block">{host && <><span className="font-mono">{host}</span> · </>}read-only except Settings and Worktrees</span>
            </span>
          </div>
          <div className={cn('flex items-center gap-2', collapsed && 'rail:flex-col')}>
            <div className={cn('locale-switch inline-flex shrink-0 gap-0.5 rounded-md bg-kumo-recessed p-0.5', collapsed && 'rail:flex-col')} role="group" aria-label={t('status.language')}>
              {localeButton('en', t('status.languageEnglish'))}
              {localeButton('zh', t('status.languageChinese'))}
            </div>
            <button type="button" onClick={onTheme} aria-label={t('theme.toggle', { mode: t(`theme.${theme}`) })} title={t('theme.toggle', { mode: t(`theme.${theme}`) })}
              className={cn('ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default', collapsed && 'rail:ml-0')}>
              {THEME_ICON[theme]}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/** Opens the drawer below 760 px; above it the rail is always on screen. */
export function RailMenuButton({ expanded, onOpen, t }: { readonly expanded: boolean; readonly onOpen: () => void; readonly t: OperatorTranslate }) {
  return (
    <button type="button" onClick={onOpen} aria-label={t('rail.open')} aria-expanded={expanded} aria-controls={RAIL_ID} data-rail-open
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-kumo-default hover:bg-kumo-tint rail:hidden">
      <ListIcon size={18} />
    </button>
  );
}

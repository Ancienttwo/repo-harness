import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Loader, cn } from '@cloudflare/kumo';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import type { SetupSnapshotV1 } from '../core/setup/types';
import type { WorktreesSnapshot } from '../core/operator/worktrees';
import type { DevActivitySnapshotV2 } from '../core/dev-activity/types';
import type { NotifyStatusV1 } from '../core/operator/notify-status';
import type { RuntimeOverlay } from '../core/operator/runtime-status';
import { Board } from './Board';
import {
  DEFAULT_BOARD_FILTERS,
  fetchDevActivity,
  repositoryById,
  repositoryLabel,
  snapshotOf,
  sourceHealth,
  useDevActivity,
  type BoardFilters,
  type DevActivityReader,
  type DevActivityView,
} from './dev-activity';
import {
  asApiError,
  assertSnapshotRepository,
  REPOSITORY_UNAVAILABLE_ERROR,
  fetchOperatorRepositorySnapshot,
  fetchOperatorSnapshot,
} from './fleet-api';
import { Home } from './Home';
import { useLocale, type OperatorLocale, type OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { NavRail, RailMenuButton, switchOption, useRailCollapsed, type RepositorySwitchModel } from './NavRail';
import type { NotifyStatusReader } from './NotifyStatus';
import { RepositoriesPage } from './RepositoriesPage';
import { fetchCiRepairs, fetchRepositoryHead, useRepositoryHead, type CiRepairsReader, type RepositoryHeadReader } from './repository-reads';
import { fetchSetup, setupPageState, useSetup, type SetupReader, type SetupView } from './setup';
import { AgentsPage, HooksPage, SkillsPage } from './SetupPages';
import {
  RepositoryWorkspace,
  snapshotForState,
  staleErrorForState,
  type RepositoryViewState,
  type ObservationView,
} from './RepositoryWorkspace';
import { fetchRuntimeOverlay, useRuntimeOverlay, type RuntimeOverlayReader } from './RuntimeBadges';
import { SystemPage } from './SystemPage';
import { ToolsPage } from './ToolsPage';
import type { TaskActivityReader, TaskContextReader } from './TaskEvidence';
import type { TaskHistoryReader } from './TaskHistory';
import { parseTaskLocation, taskLocationSearch, type TaskLocation } from './task-location';
import { useTheme } from './theme';
import {
  decodeOperatorRepositorySnapshot,
  OPERATOR_PAYLOAD_INVALID_ERROR,
  projectSnapshotViewState,
  type OperatorRepositorySnapshotV1,
  type OperatorFleetCardV1,
  type OperatorFleetRepositoryV1,
  type OperatorFleetSnapshotV1,
  type OperatorSnapshotViewState,
} from './types';
import { useNow } from './ui';
import { useObservationRefresh } from './useObservationRefresh';
import { parseWorkspaceLocation, SETUP_WORKSPACES, workspaceHash, type Workspace, type WorkspaceLocation } from './workspace-location';
import { fetchWorktrees, useWorktrees, worktreesOf, type WorktreesReader, type WorktreesView } from './worktrees';
import { WorktreesPage } from './WorktreesPage';
import { taskKey } from './worklist';

export interface OperatorAppProps {
  /** A deterministic state injection used by browser fixtures and SSR checks. */
  readonly initialState?: OperatorSnapshotViewState;
  /** A deterministic initial response; production uses the same-origin API. */
  readonly initialSnapshot?: OperatorFleetSnapshotV1;
  readonly fetchSnapshot?: (signal?: AbortSignal) => Promise<OperatorFleetSnapshotV1>;
  /** The read-only repository snapshot read, injectable on the same terms. */
  readonly fetchRepositorySnapshot?: (repositoryId: string, signal: AbortSignal) => Promise<OperatorRepositorySnapshotV1>;
  /** A deterministic repository snapshot state for fixtures and server renders. */
  readonly initialRepositorySnapshot?: RepositoryViewState;
  /** Tests pin the locale; the browser resolves it from storage or navigator. */
  readonly initialLocale?: OperatorLocale;
  /** Server renders have no URL; they name the page to render. The browser reads the fragment. */
  readonly initialPlace?: WorkspaceLocation;
  readonly fetchDevActivity?: DevActivityReader;
  readonly initialDevActivity?: DevActivitySnapshotV2;
  readonly readRuntimeStatus?: RuntimeOverlayReader;
  readonly initialRuntimeOverlay?: RuntimeOverlay;
  readonly readTaskHistory?: TaskHistoryReader;
  readonly readTaskContext?: TaskContextReader;
  readonly readTaskActivity?: TaskActivityReader;
  readonly readNotifyStatus?: NotifyStatusReader;
  readonly initialNotifyStatus?: NotifyStatusV1;
  /** The cached `repo-harness setup check` result behind the Agents, Skills and Hooks pages. */
  readonly readSetup?: SetupReader;
  readonly initialSetup?: SetupSnapshotV1;
  /** The worktree collector's cached result behind the Worktree page, the Board cleanup signal and Home's reclaimable space. */
  readonly readWorktrees?: WorktreesReader;
  readonly initialWorktrees?: WorktreesSnapshot;
  /** The docs tree's commit: the short SHA under the current repository in the side rail. */
  readonly readRepositoryHead?: RepositoryHeadReader;
  /** The tests route's open CI repair issues, for Home's "Today" section. */
  readonly readCiRepairs?: CiRepairsReader;
}

export const OPERATOR_REPOSITORY_STORAGE_KEY = 'repo-harness:operator-repository';
export const OPERATOR_BOARD_REPOSITORY_STORAGE_KEY = 'repo-harness:operator-board-repository';
export const OPERATOR_TITLE = 'repo-harness';

/** The tab title carries the one "needs you" count. */
export function documentTitle(attention: number | null): string {
  return attention !== null && attention > 0 ? `(${attention}) ${OPERATOR_TITLE}` : OPERATOR_TITLE;
}

type Selection = NonNullable<TaskLocation['selection']>;

/** A Task link without a fragment, valid or refused, belongs to its repository page. */
function routeFor(hash: string, location: TaskLocation): WorkspaceLocation {
  if (hash.replace(/^#/u, '') === '' && (location.selection !== null || location.invalid)) return { workspace: 'repository', module: null, item: null };
  return parseWorkspaceLocation(hash);
}

function readStorage(key: string): string | null {
  try { return typeof window === 'undefined' ? null : localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* Browser storage is an optional UI preference. */ }
}

// Vite emits the workspace as its own chunk; the Board never loads it.
const ArchitectureWorkspace = lazy(() => import('./ArchitectureWorkspace').then(module => ({ default: module.ArchitectureWorkspace })));

/** Fleet names a duplicate display name by its registry id, so two rows never look the same. */
function fleetLabel(repositories: readonly OperatorFleetRepositoryV1[], repository: OperatorFleetRepositoryV1): string {
  return repositories.filter(other => other.display_name === repository.display_name).length > 1
    ? `${repository.display_name} · ${repository.repository_id}` : repository.display_name;
}

/** `owner · branch · short SHA`; a part with no source is left out, never guessed. */
function repositoryDetail(snapshot: DevActivitySnapshotV2 | null, id: string, head: string | null): string | null {
  const repository = snapshot ? repositoryById(snapshot, id) : null;
  const parts = [repository?.github?.split('/')[0], repository?.default_branch, head?.slice(0, 7)].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** One line: how old the board's data is and how its sources are doing. */
function Freshness({ view, now, t }: { readonly view: DevActivityView; readonly now: number; readonly t: OperatorTranslate }) {
  if (view.kind === 'loading') return <span className="inline-flex items-center gap-1.5"><Loader size={12} />{t('freshness.loading')}</span>;
  if (view.kind === 'unreachable') return <span className="text-kumo-danger">{t('freshness.unreachable')}</span>;
  const { snapshot } = view;
  const counts = sourceHealth(snapshot.repositories);
  const parts = [t('freshness.sourcesOk', { count: counts.ok })];
  if (counts.stale > 0) parts.push(t('freshness.stale', { count: counts.stale }));
  if (counts.unavailable > 0) parts.push(t('freshness.unavailable', { count: counts.unavailable }));
  const age = snapshot.collected_at ? ageWords(snapshot.collected_at, now, t) : null;
  return (
    <span className={cn('truncate', view.refreshFailed && 'text-kumo-warning')} data-freshness={view.refreshFailed ? 'refresh-failed' : snapshot.status}>
      {view.refreshFailed
        ? (age ? t('freshness.refreshFailed', { age }) : t('freshness.refreshFailedUnknown'))
        : (age ? t('freshness.updated', { age }) : t('freshness.neverCollected'))}
      {' · '}{parts.join(' · ')}
    </span>
  );
}

/** The same line for the Worktree page, about the collector result it shows. */
function WorktreesFreshness({ view, now, t }: { readonly view: WorktreesView; readonly now: number; readonly t: OperatorTranslate }) {
  if (view.kind === 'loading') return <span className="inline-flex items-center gap-1.5" data-freshness="pending" data-freshness-source="worktrees"><Loader size={12} />{t('freshness.worktrees.loading')}</span>;
  if (view.kind === 'unreachable') return <span className="text-kumo-danger" data-freshness="failed" data-freshness-source="worktrees">{t('freshness.worktrees.failed')}</span>;
  const { snapshot } = view;
  if (snapshot.status === 'unavailable' || snapshot.collected_at === null) {
    return <span data-freshness="pending" data-freshness-source="worktrees">{t('freshness.worktrees.pending')}</span>;
  }
  const age = ageWords(snapshot.collected_at, now, t);
  const unread = snapshot.repositories.filter(repository => repository.status === 'unavailable').length;
  return (
    <span className={cn('truncate', view.refreshFailed && 'text-kumo-warning')} data-freshness={view.refreshFailed ? 'refresh-failed' : snapshot.status} data-freshness-source="worktrees">
      {view.refreshFailed ? t('freshness.worktrees.refreshFailed', { age }) : t('freshness.worktrees.read', { age })}
      {unread > 0 && <>{' · '}{t('freshness.worktrees.partial', { count: unread })}</>}
    </span>
  );
}

/** The same line for the setup pages, about the setup check result they show. */
function SetupFreshness({ view, now, t }: { readonly view: SetupView; readonly now: number; readonly t: OperatorTranslate }) {
  const state = setupPageState(view);
  if (state.kind === 'pending') return <span className="inline-flex items-center gap-1.5" data-freshness="pending" data-freshness-source="setup"><Loader size={12} />{t('freshness.setup.loading')}</span>;
  if (state.kind === 'failed') {
    return <span className="text-kumo-danger" data-freshness="failed" data-freshness-source="setup">{t('freshness.setup.failed', { reason: t(`setup.reason.${state.reason}`) })}</span>;
  }
  const { snapshot } = state;
  const age = ageWords(snapshot.collected_at ?? '', now, t);
  const stale = snapshot.status === 'stale';
  const lead = stale ? t('freshness.setup.stale', { age }) : state.refreshFailed ? t('freshness.setup.refreshFailed', { age }) : t('freshness.setup.read', { age });
  const attention = snapshot.checks.length > 0 ? t('freshness.setup.attention', { count: snapshot.checks.length }) : t('freshness.setup.clear');
  return (
    <span className={cn('truncate', (stale || state.refreshFailed) && 'text-kumo-warning')} data-freshness={stale ? 'stale' : state.refreshFailed ? 'refresh-failed' : 'ready'} data-freshness-source="setup">
      {lead}{' · '}{attention}
    </span>
  );
}

export function OperatorApp({
  initialState,
  initialSnapshot,
  fetchSnapshot = fetchOperatorSnapshot,
  fetchRepositorySnapshot = fetchOperatorRepositorySnapshot,
  initialRepositorySnapshot,
  initialLocale,
  initialPlace,
  fetchDevActivity: readDevActivity = fetchDevActivity,
  initialDevActivity,
  readRuntimeStatus = fetchRuntimeOverlay,
  initialRuntimeOverlay,
  readTaskContext,
  readTaskActivity,
  readTaskHistory,
  readNotifyStatus,
  initialNotifyStatus,
  readSetup = fetchSetup,
  initialSetup,
  readWorktrees = fetchWorktrees,
  initialWorktrees,
  readRepositoryHead = fetchRepositoryHead,
  readCiRepairs = fetchCiRepairs,
}: OperatorAppProps) {
  const initial = initialState ?? (initialSnapshot ? projectSnapshotViewState(initialSnapshot) : { kind: 'loading', previous: null } as const);
  const [state, setState] = useState<OperatorSnapshotViewState>(initial);
  const [location, setLocation] = useState(() => parseTaskLocation(typeof window === 'undefined' ? '' : window.location.search));
  const [repositoryId, setRepositoryId] = useState<string | null>(() => location.repositoryId ?? readStorage(OPERATOR_REPOSITORY_STORAGE_KEY));
  const [view, setView] = useState<ObservationView>('organization');
  const [place, setPlace] = useState<WorkspaceLocation>(() => initialPlace ?? routeFor(typeof window === 'undefined' ? '' : window.location.hash, location));
  const searchRef = useRef(typeof window === 'undefined' ? '' : window.location.search);
  const [selection, setSelection] = useState<Selection | null>(location.selection);
  const [repositorySnapshot, setRepositorySnapshot] = useState<RepositoryViewState>(initialRepositorySnapshot ?? { kind: 'idle' });
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [filters, setFilters] = useState<BoardFilters>(() => ({ ...DEFAULT_BOARD_FILTERS, repositoryId: readStorage(OPERATOR_BOARD_REPOSITORY_STORAGE_KEY) }));
  const { locale, setLocale, t } = useLocale(initialLocale);
  const theme = useTheme();
  const now = useNow(15_000);
  const stateRef = useRef<OperatorSnapshotViewState>(initial);
  const workspace = place.workspace;
  const [systemMounted, setSystemMounted] = useState(workspace === 'system');
  if (workspace === 'system' && !systemMounted) setSystemMounted(true);
  const fleetActive = workspace === 'repository' || workspace === 'architecture';

  const snapshot = snapshotForState(state);
  const activeRepositoryId = repositoryId ?? snapshot?.repositories[0]?.repository_id ?? '';
  const activeRepository = snapshot?.repositories.find((repo) => repo.repository_id === activeRepositoryId) ?? null;
  useEffect(() => {
    if (!activeRepository) return;
    setRepositoryId(activeRepository.repository_id);
    writeStorage(OPERATOR_REPOSITORY_STORAGE_KEY, activeRepository.repository_id);
  }, [activeRepository]);

  const devActivity = useDevActivity(readDevActivity, initialDevActivity, refreshGeneration);
  const devSnapshot = snapshotOf(devActivity);
  const attention = devSnapshot ? devSnapshot.attention.length : null;
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = documentTitle(attention);
  }, [attention]);
  // Agents, Skills and Hooks share one cached setup check result; it is read only while one of them shows.
  const setup = useSetup(readSetup, initialSetup, refreshGeneration, (SETUP_WORKSPACES as readonly Workspace[]).includes(workspace));
  const runtime = useRuntimeOverlay(readRuntimeStatus, initialRuntimeOverlay, workspace === 'board', refreshGeneration);
  // One cached collector result feeds the Worktree page, the Board cleanup signal and Home's reclaimable row.
  const worktrees = useWorktrees(readWorktrees, initialWorktrees, refreshGeneration, workspace === 'worktrees' || workspace === 'board' || workspace === 'home');
  // A stored board filter for a repository that left the snapshot shows every repository.
  const boardFilters = devSnapshot && filters.repositoryId !== null && !devSnapshot.repositories.some(row => row.repository_id === filters.repositoryId)
    ? { ...filters, repositoryId: null } : filters;

  useEffect(() => {
    const restore = () => {
      const next = parseTaskLocation(window.location.search);
      setPlace(routeFor(window.location.hash, next));
      // A fragment-only change moves between pages; the Task location is unchanged.
      if (window.location.search === searchRef.current) return;
      searchRef.current = window.location.search;
      setLocation(next); setRepositoryId(next.repositoryId); setSelection(next.selection);
      setRepositorySnapshot({ kind: 'idle' });
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); };
  }, []);
  const navigate = (id: string | null, next: Selection | null, hash = window.location.hash) => {
    const search = taskLocationSearch(id, next);
    searchRef.current = search;
    window.history.pushState(null, '', window.location.pathname + search + hash);
    setLocation({ repositoryId: id, selection: next, invalid: false });
    setSelection(next);
  };
  const closeSelection = () => navigate(activeRepositoryId || null, null);
  const openPlace = useCallback((next: WorkspaceLocation) => {
    window.history.pushState(null, '', window.location.pathname + window.location.search + workspaceHash(next));
    setPlace(next);
  }, []);
  const switchRepository = (id: string) => {
    if (id !== activeRepository?.repository_id) { setRepositorySnapshot({ kind: 'idle' }); }
    setRepositoryId(id);
    navigate(id, null);
  };
  const openRepository = (id: string) => {
    if (id !== activeRepository?.repository_id) { setRepositorySnapshot({ kind: 'idle' }); }
    setRepositoryId(id);
    const next: WorkspaceLocation = { workspace: 'repository', module: null, item: null };
    navigate(id, null, workspaceHash(next));
    setPlace(next);
  };
  const busy = state.kind === 'loading' && fleetActive;

  const readFleet = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const previous = snapshotForState(stateRef.current);
    const staleError = staleErrorForState(stateRef.current);
    const loading: OperatorSnapshotViewState = { kind: 'loading', previous, ...(staleError ? { staleError } : {}) };
    stateRef.current = loading;
    setState(loading);
    try {
      const nextSnapshot = await fetchSnapshot(signal);
      if (signal.aborted) return false;
      if (previous?.service_epoch === nextSnapshot.service_epoch && nextSnapshot.sequence < previous.sequence) throw OPERATOR_PAYLOAD_INVALID_ERROR;
      if (previous && previous.service_epoch !== nextSnapshot.service_epoch) {
        setRepositorySnapshot({ kind: 'idle' });
        setRefreshGeneration(current => current + 1);
      }
      const nextState = projectSnapshotViewState(nextSnapshot);
      stateRef.current = nextState; setState(nextState);
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      const apiError = asApiError(error);
      const nextState: OperatorSnapshotViewState = previous
        ? { kind: 'stale', snapshot: previous, error: apiError }
        : { kind: 'fatal', error: apiError };
      stateRef.current = nextState; setState(nextState);
      return false;
    }
  }, [fetchSnapshot]);
  // Fleet feeds the repository and architecture pages only; the Board reads development activity.
  const requestFleet = useObservationRefresh(readFleet, 'fleet', { immediate: !initialState && !initialSnapshot, enabled: fleetActive });
  const refresh = () => {
    // Explicit refresh supersedes every scoped observation.
    setRepositorySnapshot({ kind: 'idle' });
    setRefreshGeneration(current => current + 1);
    requestFleet();
  };

  const selectedCard = selection && !selection.historical && snapshot
    ? activeRepository?.cards.find((card) => taskKey(card) === selection.key) ?? null
    : null;
  // A current URL carries no revision, so the first snapshot that resolves the
  // selection supplies the comparison baseline. Capturing it into the selection
  // puts URL-opened and restored panes under the same changed-definition
  // warning as clicked cards; later snapshots never move a stored baseline.
  useEffect(() => {
    if (!selection || selection.historical || selection.revision !== null || !selectedCard) return;
    const baseline = selectedCard.issue_revision;
    setSelection((current) => current !== null && !current.historical && current.revision === null && current.key === selection.key
      ? { ...current, revision: baseline }
      : current);
  }, [selection, selectedCard]);
  const revisionChangedFrom = selectedCard && selection && selectedCard.issue_revision !== selection.revision ? selection.revision : null;
  const snapshotRepositoryId = activeRepository?.repository_id ?? null;

  // One observation belongs to the selected repository; task selection shares it.
  const readRepositorySnapshot = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (snapshotRepositoryId === null) return false;
    setRepositorySnapshot({ kind: 'loading', repository_id: snapshotRepositoryId });
    try {
      const next = await fetchRepositorySnapshot(snapshotRepositoryId, signal);
      if (signal.aborted) return false;
      setRepositorySnapshot({ kind: 'ready', snapshot: assertSnapshotRepository(decodeOperatorRepositorySnapshot(next), snapshotRepositoryId) });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      setRepositorySnapshot({ kind: 'failed', repository_id: snapshotRepositoryId, error: asApiError(error, REPOSITORY_UNAVAILABLE_ERROR) });
      return false;
    }
  }, [snapshotRepositoryId, fetchRepositorySnapshot]);
  useObservationRefresh(readRepositorySnapshot, JSON.stringify([snapshotRepositoryId, refreshGeneration]), {
    enabled: !initialRepositorySnapshot && snapshotRepositoryId !== null && workspace === 'repository',
  });
  const selectCard = (card: OperatorFleetCardV1) => navigate(card.repository_id, { key: taskKey(card), providerRepositoryId: card.provider_repository_id, issueId: card.provider_issue_id, sessionBinding: card.execution?.selector.session_binding_sha256 ?? null, revision: card.issue_revision, historical: false });
  const setBoardRepository = (id: string | null) => {
    writeStorage(OPERATOR_BOARD_REPOSITORY_STORAGE_KEY, id);
    setFilters(current => ({ ...current, repositoryId: id }));
  };

  const [railCollapsed, toggleRail] = useRailCollapsed(workspace);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // Single-repository pages name the repository they read; the board's task drawer names its item's repository.
  const singleRepository = workspace === 'repository' || workspace === 'architecture';
  const drawerItem = workspace === 'board' && place.item !== null ? devSnapshot?.items.find(item => item.id === place.item) ?? null : null;
  const head = useRepositoryHead(readRepositoryHead, singleRepository ? activeRepository?.repository_id ?? null : drawerItem?.repository_id ?? null, refreshGeneration);
  const devRepositories = devSnapshot?.repositories ?? [];
  const activityOptions = devRepositories.map(row => switchOption(devSnapshot, row.repository_id, repositoryLabel(devRepositories, row.repository_id), t));
  const board: WorkspaceLocation = { workspace: 'board', module: null, item: null };
  const repositorySwitch: RepositorySwitchModel = singleRepository ? {
    mode: 'current',
    selected: activeRepository && snapshot ? {
      id: activeRepository.repository_id, label: fleetLabel(snapshot.repositories, activeRepository),
      detail: repositoryDetail(devSnapshot, activeRepository.repository_id, head),
    } : null,
    options: (snapshot?.repositories ?? []).map(row => switchOption(devSnapshot, row.repository_id, fleetLabel(snapshot!.repositories, row), t)),
    allowAll: false,
    onSelect: id => { if (id !== null) switchRepository(id); },
  } : drawerItem ? {
    mode: 'current',
    selected: { id: drawerItem.repository_id, label: repositoryLabel(devRepositories, drawerItem.repository_id), detail: repositoryDetail(devSnapshot, drawerItem.repository_id, head) },
    options: activityOptions,
    allowAll: true,
    onSelect: id => { setBoardRepository(id); openPlace(board); },
  } : workspace === 'board' ? {
    mode: 'scope',
    selected: boardFilters.repositoryId === null ? null : { id: boardFilters.repositoryId, label: repositoryLabel(devRepositories, boardFilters.repositoryId), detail: null },
    options: activityOptions,
    allowAll: true,
    onSelect: setBoardRepository,
  } : {
    mode: 'scope',
    selected: null,
    options: activityOptions,
    allowAll: true,
    // From a page across repositories, one repository opens its own page.
    onSelect: id => { if (id !== null) openRepository(id); },
  };

  return (
    <div
      className="operator-app min-h-dvh bg-kumo-canvas text-kumo-default rail:flex"
      data-state={state.kind}
      data-locale={locale}
      data-workspace={workspace}
      lang={locale === 'zh' ? 'zh' : 'en'}
    >
      <NavRail current={workspace} attention={attention} onOpen={openPlace} repositorySwitch={repositorySwitch}
        collapsed={railCollapsed} onToggleCollapsed={toggleRail} drawerOpen={drawerOpen} onCloseDrawer={closeDrawer}
        activity={devActivity} locale={locale} onLocale={setLocale} theme={theme.preference} onTheme={theme.cycle} t={t} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="operator-header sticky top-0 z-10 flex items-center gap-3 border-b border-kumo-line bg-kumo-canvas/95 px-4 py-2 backdrop-blur rail:px-6">
          <RailMenuButton expanded={drawerOpen} onOpen={openDrawer} t={t} />
          {/* One freshness line, about the source of the page on screen. */}
          <span className="min-w-0 flex-1 truncate text-xs text-kumo-subtle">
            {(SETUP_WORKSPACES as readonly Workspace[]).includes(workspace) ? <SetupFreshness view={setup} now={now} t={t} />
              : workspace === 'worktrees' ? <WorktreesFreshness view={worktrees} now={now} t={t} />
                : <Freshness view={devActivity} now={now} t={t} />}
          </span>
          <Button size="sm" variant="secondary" icon={<ArrowClockwiseIcon />} onClick={refresh} disabled={busy} className="shrink-0">
            <span className="max-sm:sr-only">{busy ? t('status.refreshing') : t('status.refresh')}</span>
          </Button>
        </header>
        <main className="operator-content mx-auto flex w-full max-w-[1680px] min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-10 rail:px-6" data-workspace={workspace}>
          {workspace === 'home' && <Home view={devActivity} worktrees={worktrees} readCiRepairs={readCiRepairs} generation={refreshGeneration} now={now} onOpen={openPlace} t={t} />}
          {workspace === 'board' && <Board view={devActivity} runtime={runtime} worktrees={worktreesOf(worktrees)} filters={boardFilters} onFilters={setFilters} itemId={place.item}
            onOpenItem={item => openPlace({ workspace: 'board', module: null, item })} onCloseItem={() => openPlace({ workspace: 'board', module: null, item: null })} now={now} t={t} />}
          {workspace === 'repositories' && <RepositoriesPage view={devActivity} onOpen={openRepository} t={t} />}
          {workspace === 'worktrees' && <WorktreesPage view={worktrees} now={now} t={t} />}
          {workspace === 'agents' && <AgentsPage view={setup} now={now} t={t} />}
          {workspace === 'skills' && <SkillsPage view={setup} now={now} t={t} />}
          {workspace === 'hooks' && <HooksPage view={setup} now={now} t={t} />}
          {workspace === 'tools' && <ToolsPage toolId={place.item} onOpen={id => openPlace({ workspace: 'tools', module: null, item: id })}
            onClose={() => openPlace({ workspace: 'tools', module: null, item: null })} locale={locale} t={t} />}
          {workspace === 'repository' && <RepositoryWorkspace
            state={state} activeRepository={activeRepository} activeRepositoryId={activeRepositoryId}
            location={location} selection={selection} selectedCard={selectedCard} revisionChangedFrom={revisionChangedFrom}
            view={view} onView={setView} repositorySnapshot={repositorySnapshot}
            refreshGeneration={refreshGeneration} onRefresh={refresh} onSelect={selectCard} onCloseSelection={closeSelection}
            readTaskContext={readTaskContext} readTaskActivity={readTaskActivity} readTaskHistory={readTaskHistory}
            onBack={() => openPlace({ workspace: 'repositories', module: null, item: null })} now={now} t={t} />}
          {workspace === 'architecture' && <>
            <header className="border-b border-kumo-hairline pb-4">
              <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.architecture')}</h1>
            </header>
            {!activeRepository ? <p role="status" className="text-sm text-kumo-subtle">{t('repository.select')}</p>
              : <Suspense fallback={<p role="status" className="text-sm text-kumo-subtle">{t('workspace.loading')}</p>}>
                <ArchitectureWorkspace repositoryId={activeRepository.repository_id} moduleId={place.module} refreshGeneration={refreshGeneration}
                  onModule={module => openPlace({ workspace: 'architecture', module, item: null })} t={t} />
              </Suspense>}
          </>}
          {/* Kept mounted after the first visit so its readers pause while away and read once on return. */}
          {systemMounted && <div hidden={workspace !== 'system'}>
            <SystemPage view={devActivity} now={now} refreshGeneration={refreshGeneration} active={workspace === 'system'}
              readNotifyStatus={readNotifyStatus} initialNotifyStatus={initialNotifyStatus}
              readRuntimeStatus={readRuntimeStatus} initialRuntimeOverlay={initialRuntimeOverlay} t={t} />
          </div>}
        </main>
      </div>
    </div>
  );
}

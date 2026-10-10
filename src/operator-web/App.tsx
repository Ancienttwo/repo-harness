import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Button, Loader, cn } from '@cloudflare/kumo';
import {
  ArrowClockwiseIcon,
  CpuIcon,
  DesktopIcon,
  FoldersIcon,
  KanbanIcon,
  MoonIcon,
  SunIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react';
import type { DevActivitySnapshotV1 } from '../core/dev-activity/types';
import type { NotifyStatusV1 } from '../core/operator/notify-status';
import type { RuntimeOverlay } from '../core/operator/runtime-status';
import type { PipelineBoardV2 } from '../core/pipeline/board';
import type { RepositoryObservationReader } from './AutomationSummary';
import { Board } from './Board';
import {
  DEFAULT_BOARD_FILTERS,
  fetchDevActivity,
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
  assertCollaborationRepository,
  COLLABORATION_UNAVAILABLE_ERROR,
  fetchOperatorCollaborationSnapshot,
  fetchOperatorSnapshot,
} from './fleet-api';
import { useLocale, type OperatorLocale, type OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { CarrotMark } from './marks';
import type { NotifyStatusReader } from './NotifyStatus';
import type { PipelineBoardReader } from './PipelineBoard';
import { RepositoriesPage } from './RepositoriesPage';
import {
  RepositorySwitch,
  RepositoryWorkspace,
  snapshotForState,
  staleErrorForState,
  type CollaborationViewState,
  type ObservationView,
} from './RepositoryWorkspace';
import { fetchRuntimeOverlay, useRuntimeOverlay, type RuntimeOverlayReader } from './RuntimeBadges';
import { SystemPage } from './SystemPage';
import type { TaskActivityReader, TaskContextReader } from './TaskEvidence';
import type { TaskHistoryReader } from './TaskHistory';
import { parseTaskLocation, taskLocationSearch, type TaskLocation } from './task-location';
import { useTheme, type ThemePreference } from './theme';
import {
  decodeOperatorCollaborationSnapshot,
  OPERATOR_PAYLOAD_INVALID_ERROR,
  projectSnapshotViewState,
  type OperatorCollaborationSnapshotV4,
  type OperatorFleetCardV1,
  type OperatorFleetSnapshotV1,
  type OperatorSnapshotViewState,
} from './types';
import { useNow } from './ui';
import { useObservationRefresh } from './useObservationRefresh';
import { parseWorkspaceLocation, workspaceHash, WORKSPACES, type Workspace, type WorkspaceLocation } from './workspace-location';
import { taskKey } from './worklist';

export interface OperatorAppProps {
  /** A deterministic state injection used by browser fixtures and SSR checks. */
  readonly initialState?: OperatorSnapshotViewState;
  /** A deterministic initial response; production uses the same-origin API. */
  readonly initialSnapshot?: OperatorFleetSnapshotV1;
  readonly fetchSnapshot?: (signal?: AbortSignal) => Promise<OperatorFleetSnapshotV1>;
  /** The read-only collaboration read, injectable on the same terms. */
  readonly fetchCollaboration?: (repositoryId: string, signal: AbortSignal, decisionAfter: string | null) => Promise<OperatorCollaborationSnapshotV4>;
  /** A deterministic collaboration state for fixtures and server renders. */
  readonly initialCollaboration?: CollaborationViewState;
  /** Tests pin the locale; the browser resolves it from storage or navigator. */
  readonly initialLocale?: OperatorLocale;
  /** Server renders have no URL; they name the page to render. The browser reads the fragment. */
  readonly initialPlace?: WorkspaceLocation;
  readonly fetchDevActivity?: DevActivityReader;
  readonly initialDevActivity?: DevActivitySnapshotV1;
  readonly readRuntimeStatus?: RuntimeOverlayReader;
  readonly initialRuntimeOverlay?: RuntimeOverlay;
  readonly fetchRepositoryObservation?: RepositoryObservationReader;
  readonly readTaskHistory?: TaskHistoryReader;
  readonly readTaskContext?: TaskContextReader;
  readonly readTaskActivity?: TaskActivityReader;
  readonly readNotifyStatus?: NotifyStatusReader;
  readonly initialNotifyStatus?: NotifyStatusV1;
  readonly readPipelineBoard?: PipelineBoardReader;
  readonly initialPipelineBoard?: PipelineBoardV2;
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

const NAV_ICON: Readonly<Record<typeof WORKSPACES[number], ReactNode>> = {
  board: <KanbanIcon size={18} />,
  repositories: <FoldersIcon size={18} />,
  architecture: <TreeStructureIcon size={18} />,
  system: <CpuIcon size={18} />,
};

function WorkspaceNav({ current, attention, onOpen, t }: {
  readonly current: Workspace; readonly attention: number | null; readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  return (
    // The rail's background and border stretch with the page; only the nav inside it sticks to the viewport.
    <div className="md:w-52 md:shrink-0 md:border-r md:border-kumo-line md:bg-kumo-base" data-nav-rail>
    <nav aria-label={t('nav.label')}
      className="workspace-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-kumo-line bg-kumo-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-0 md:h-dvh md:w-full md:flex-col md:border-t-0 md:bg-transparent md:px-3 md:py-4 md:backdrop-blur-none">
      <div className="hidden items-center gap-2 px-2 pb-5 md:flex">
        <CarrotMark height={20} className="brand-mark" />
        <span className="font-mono text-sm font-semibold text-kumo-strong">repo-harness</span>
      </div>
      <ul className="flex w-full justify-around md:flex-col md:gap-0.5">
        {WORKSPACES.map(workspace => {
          const next: WorkspaceLocation = { workspace, module: null, item: null };
          const active = current === workspace || (workspace === 'repositories' && current === 'repository');
          return (
            <li key={workspace} className="flex-1 md:flex-none">
              <a href={workspaceHash(next)} aria-current={active ? 'page' : undefined} data-workspace={workspace}
                className={cn('flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium md:flex-row md:gap-2.5 md:rounded-md md:px-2.5 md:py-1.5 md:text-sm',
                  active ? 'text-kumo-strong md:bg-kumo-tint' : 'text-kumo-subtle hover:text-kumo-default md:hover:bg-kumo-tint')}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault(); onOpen(next);
                }}>
                {NAV_ICON[workspace]}
                <span>{t(`nav.${workspace}`)}</span>
                {workspace === 'board' && attention !== null && attention > 0 && (
                  <span className="hidden rounded-full bg-kumo-warning-tint px-1.5 text-xs tabular-nums text-kumo-warning md:ml-auto md:inline">{attention}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      {/* Protocol vocabulary: never translated. The full boundary lives on the System page. */}
      <p className="mt-auto hidden px-2.5 text-xs text-kumo-subtle md:block">read-only</p>
    </nav>
    </div>
  );
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

const THEME_ICON: Readonly<Record<ThemePreference, ReactNode>> = {
  system: <DesktopIcon size={16} />, light: <SunIcon size={16} />, dark: <MoonIcon size={16} />,
};

function TopBar({ workspace, view, now, filters, onBoardRepository, attention, onNeedsYou, busy, onRefresh, locale, onLocale, theme, onTheme, t }: {
  readonly workspace: Workspace; readonly view: DevActivityView; readonly now: number;
  readonly filters: BoardFilters; readonly onBoardRepository: (id: string | null) => void;
  readonly attention: number | null; readonly onNeedsYou: () => void;
  readonly busy: boolean; readonly onRefresh: () => void;
  readonly locale: OperatorLocale; readonly onLocale: (locale: OperatorLocale) => void;
  readonly theme: ThemePreference; readonly onTheme: () => void;
  readonly t: OperatorTranslate;
}) {
  const snapshot = snapshotOf(view);
  const localeButton = (value: OperatorLocale, label: string) => (
    <button type="button" aria-pressed={locale === value} onClick={() => onLocale(value)}
      className={cn('h-7 cursor-pointer px-2 font-mono text-xs', locale === value ? 'bg-kumo-base font-semibold text-kumo-strong shadow-xs' : 'text-kumo-subtle hover:text-kumo-default', 'rounded-[5px]')}>
      {label}
    </button>
  );
  return (
    <header className="operator-topbar sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-kumo-line bg-kumo-base/95 px-4 py-2.5 backdrop-blur sm:gap-x-3 md:px-6">
      <span className="flex items-center gap-1.5 md:hidden">
        <CarrotMark height={18} className="brand-mark" />
        <span className="font-mono text-sm font-semibold text-kumo-strong max-[420px]:sr-only">repo-harness</span>
      </span>
      {/* On a phone the filter and the freshness line take their own row. */}
      <div className="order-last flex w-full min-w-0 items-center gap-2 text-xs text-kumo-subtle sm:order-none sm:w-auto sm:flex-1 sm:gap-3">
        {workspace === 'board' && snapshot && snapshot.repositories.length > 0 && (
          <label className="flex min-w-0 shrink-0 items-center">
            <span className="sr-only">{t('filter.repository')}</span>
            <select className="board-repo-filter h-8 max-w-40 rounded-md border border-kumo-line bg-kumo-base px-2 text-sm text-kumo-default focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none sm:max-w-56"
              value={filters.repositoryId ?? ''} onChange={event => onBoardRepository(event.target.value === '' ? null : event.target.value)}>
              <option value="">{t('filter.allRepositories')}</option>
              {snapshot.repositories.map(repository => <option key={repository.repository_id} value={repository.repository_id}>{repositoryLabel(snapshot.repositories, repository.repository_id)}</option>)}
            </select>
          </label>
        )}
        <span className="min-w-0 flex-1 truncate"><Freshness view={view} now={now} t={t} /></span>
      </div>
      <span className="flex-1 sm:hidden" />
      {attention !== null && (
        <button type="button" onClick={onNeedsYou} data-needs-you={attention}
          className={cn('inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium',
            attention > 0 ? 'bg-kumo-warning-tint text-kumo-warning' : 'bg-kumo-recessed text-kumo-subtle')}>
          {t('topbar.needsYou')}<span className="tabular-nums">{attention}</span>
        </button>
      )}
      <Button size="sm" variant="secondary" icon={<ArrowClockwiseIcon />} onClick={onRefresh} disabled={busy} className="shrink-0">
        <span className="max-sm:sr-only">{busy ? t('status.refreshing') : t('status.refresh')}</span>
      </Button>
      <div className="locale-switch inline-flex shrink-0 gap-0.5 rounded-md bg-kumo-recessed p-0.5" role="group" aria-label={t('status.language')}>
        {localeButton('en', t('status.languageEnglish'))}
        {localeButton('zh', t('status.languageChinese'))}
      </div>
      <Button size="sm" variant="ghost" shape="square" icon={THEME_ICON[theme]} onClick={onTheme}
        aria-label={t('theme.toggle', { mode: t(`theme.${theme}`) })} title={t('theme.toggle', { mode: t(`theme.${theme}`) })} className="shrink-0" />
    </header>
  );
}

export function OperatorApp({
  initialState,
  initialSnapshot,
  fetchSnapshot = fetchOperatorSnapshot,
  fetchCollaboration = fetchOperatorCollaborationSnapshot,
  initialCollaboration,
  initialLocale,
  initialPlace,
  fetchDevActivity: readDevActivity = fetchDevActivity,
  initialDevActivity,
  readRuntimeStatus = fetchRuntimeOverlay,
  initialRuntimeOverlay,
  fetchRepositoryObservation,
  readTaskContext,
  readTaskActivity,
  readTaskHistory,
  readNotifyStatus,
  initialNotifyStatus,
  readPipelineBoard,
  initialPipelineBoard,
}: OperatorAppProps) {
  const initial = initialState ?? (initialSnapshot ? projectSnapshotViewState(initialSnapshot) : { kind: 'loading', previous: null } as const);
  const [state, setState] = useState<OperatorSnapshotViewState>(initial);
  const [location, setLocation] = useState(() => parseTaskLocation(typeof window === 'undefined' ? '' : window.location.search));
  const [repositoryId, setRepositoryId] = useState<string | null>(() => location.repositoryId ?? readStorage(OPERATOR_REPOSITORY_STORAGE_KEY));
  const [view, setView] = useState<ObservationView>('organization');
  const [place, setPlace] = useState<WorkspaceLocation>(() => initialPlace ?? routeFor(typeof window === 'undefined' ? '' : window.location.hash, location));
  const searchRef = useRef(typeof window === 'undefined' ? '' : window.location.search);
  const [selection, setSelection] = useState<Selection | null>(location.selection);
  const [collaboration, setCollaboration] = useState<CollaborationViewState>(initialCollaboration ?? { kind: 'idle' });
  const [decisionPage, setDecisionPage] = useState<{ repositoryId: string; after: string | null } | null>(null);
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
  const runtime = useRuntimeOverlay(readRuntimeStatus, initialRuntimeOverlay, workspace === 'board', refreshGeneration);
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
      setCollaboration({ kind: 'idle' }); setDecisionPage(null);
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
    if (id !== activeRepository?.repository_id) { setCollaboration({ kind: 'idle' }); setDecisionPage(null); }
    setRepositoryId(id);
    navigate(id, null);
  };
  const openRepository = (id: string) => {
    if (id !== activeRepository?.repository_id) { setCollaboration({ kind: 'idle' }); setDecisionPage(null); }
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
        setCollaboration({ kind: 'idle' });
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
    // Explicit refresh supersedes every scoped observation and returns the
    // Decision inventory to page one. Automatic reads preserve the current page.
    setDecisionPage(null);
    setCollaboration({ kind: 'idle' });
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
    const baseline = selectedCard.task_revision;
    setSelection((current) => current !== null && !current.historical && current.revision === null && current.key === selection.key
      ? { ...current, revision: baseline }
      : current);
  }, [selection, selectedCard]);
  const revisionChangedFrom = selectedCard && selection && selectedCard.task_revision !== selection.revision ? selection.revision : null;
  const collaborationRepositoryId = activeRepository?.repository_id ?? null;
  const decisionAfter = decisionPage?.repositoryId === collaborationRepositoryId ? decisionPage.after : null;
  const changeDecisionPage = (after: string | null) => {
    if (!collaborationRepositoryId) return;
    setCollaboration({ kind: 'idle' });
    setDecisionPage({ repositoryId: collaborationRepositoryId, after });
  };

  // One observation belongs to the selected repository; task selection shares it.
  const readCollaboration = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    if (collaborationRepositoryId === null) return false;
    setCollaboration({ kind: 'loading', repository_id: collaborationRepositoryId });
    try {
      const next = await fetchCollaboration(collaborationRepositoryId, signal, decisionAfter);
      if (signal.aborted) return false;
      setCollaboration({ kind: 'ready', snapshot: assertCollaborationRepository(decodeOperatorCollaborationSnapshot(next), collaborationRepositoryId, decisionAfter) });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      setCollaboration({ kind: 'failed', repository_id: collaborationRepositoryId, error: asApiError(error, COLLABORATION_UNAVAILABLE_ERROR) });
      return false;
    }
  }, [collaborationRepositoryId, decisionAfter, fetchCollaboration]);
  useObservationRefresh(readCollaboration, JSON.stringify([collaborationRepositoryId, decisionAfter, refreshGeneration]), {
    enabled: !initialCollaboration && collaborationRepositoryId !== null && workspace === 'repository',
  });
  const selectCard = (card: OperatorFleetCardV1) => navigate(card.repository_id, { key: taskKey(card), taskId: card.task_id, revision: card.task_revision, historical: false });
  const setBoardRepository = (id: string | null) => {
    writeStorage(OPERATOR_BOARD_REPOSITORY_STORAGE_KEY, id);
    setFilters(current => ({ ...current, repositoryId: id }));
  };
  const openNeedsYou = () => {
    if (workspace !== 'board' || place.item !== null) openPlace({ workspace: 'board', module: null, item: null });
    // The queue renders on the next frame when the Board was not showing.
    setTimeout(() => {
      const target = document.getElementById('needs-you');
      target?.scrollIntoView?.({ block: 'start' });
      target?.focus();
    }, 0);
  };

  return (
    <div
      className="operator-app min-h-dvh bg-kumo-canvas text-kumo-default md:flex"
      data-state={state.kind}
      data-locale={locale}
      data-workspace={workspace}
      lang={locale === 'zh' ? 'zh' : 'en'}
    >
      <WorkspaceNav current={workspace} attention={attention} onOpen={openPlace} t={t} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar workspace={workspace} view={devActivity} now={now} filters={boardFilters} onBoardRepository={setBoardRepository}
          attention={attention} onNeedsYou={openNeedsYou} busy={busy} onRefresh={refresh}
          locale={locale} onLocale={setLocale} theme={theme.preference} onTheme={theme.cycle} t={t} />
        <main className="operator-content mx-auto flex w-full max-w-[1680px] min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10" data-workspace={workspace}>
          {workspace === 'board' && <Board view={devActivity} runtime={runtime} filters={boardFilters} onFilters={setFilters} itemId={place.item}
            onOpenItem={item => openPlace({ workspace: 'board', module: null, item })} onCloseItem={() => openPlace({ workspace: 'board', module: null, item: null })} now={now} t={t} />}
          {workspace === 'repositories' && <RepositoriesPage view={devActivity} onOpen={openRepository} t={t} />}
          {workspace === 'repository' && <RepositoryWorkspace
            state={state} activeRepository={activeRepository} activeRepositoryId={activeRepositoryId} onRepository={switchRepository}
            location={location} selection={selection} selectedCard={selectedCard} revisionChangedFrom={revisionChangedFrom}
            view={view} onView={setView} collaboration={collaboration} decisionAfter={decisionAfter} onDecisionPage={changeDecisionPage}
            refreshGeneration={refreshGeneration} onRefresh={refresh} onSelect={selectCard} onCloseSelection={closeSelection}
            fetchRepositoryObservation={fetchRepositoryObservation} readTaskContext={readTaskContext} readTaskActivity={readTaskActivity} readTaskHistory={readTaskHistory}
            onBack={() => openPlace({ workspace: 'repositories', module: null, item: null })} now={now} t={t} />}
          {workspace === 'architecture' && <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kumo-hairline pb-4">
              <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.architecture')}</h1>
              <RepositorySwitch snapshot={snapshot} repositoryId={activeRepository?.repository_id ?? ''} onRepository={switchRepository} t={t} />
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
              readPipelineBoard={readPipelineBoard} initialPipelineBoard={initialPipelineBoard}
              readRuntimeStatus={readRuntimeStatus} initialRuntimeOverlay={initialRuntimeOverlay} t={t} />
          </div>}
        </main>
      </div>
    </div>
  );
}

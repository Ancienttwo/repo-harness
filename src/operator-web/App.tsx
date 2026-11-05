import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Button, Loader, cn } from '@cloudflare/kumo';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import type { SetupSnapshotV2 } from '../core/setup/types';
import type { WorktreesSnapshot } from '../core/operator/worktrees';
import type { DevActivitySnapshotV2 } from '../core/dev-activity/types';
import type { NotifyStatusV1 } from '../core/operator/notify-status';
import type { RuntimeOverlay } from '../core/operator/runtime-status';
import { BoardPage, boardListRepository } from './BoardPage';
import { fetchBoardSummaries, type BoardSummariesReader } from './board-office';
import { postBossCommand, type BossCommandWriter } from './office-boss';
import { fetchAdvisorTranscript, postAdvisorMessage, type AdvisorMessageWriter, type AdvisorTranscriptReader } from './OfficeAdvisorDialog';
import { fetchBoard, fetchBoardParents, useBoard, useBoardParents, type BoardParentsReader, type BoardReader, type BoardView } from './board-view';
import { fetchBotAccess, fetchBotReviews, useBotAccess, useBotReviews, type BotAccessReader, type BotReviewsReader } from './bots';
import { BotsFreshness, BotsPage } from './BotsPage';
import { fetchAgentsSettings, postAgentsSettings, useAgentsSettingsForm, type AgentsSettingsReader, type AgentsSettingsWriter } from './settings';
import { fetchSeatsSettings, postSeatsSettings, useSeatsSettingsForm, type SeatsSettingsReader, type SeatsSettingsWriter } from './seats';
import { fetchQuota, useQuota, type QuotaReader } from './quota';
import {
  fetchDevActivity,
  repositoryById,
  snapshotOf,
  sourceHealth,
  useDevActivity,
  type DevActivityReader,
  type DevActivityView,
} from './dev-activity';
import { Home } from './Home';
import { useLocale, type OperatorLocale, type OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { NavRail, RailMenuButton, switchOption, useRailCollapsed, type RepositorySwitchModel } from './NavRail';
import type { ArchitectureMapReader } from './ArchitectureMap';
import type { ArchitectureSource } from './ArchitectureWorkspace';
import type { NotifyStatusReader } from './NotifyStatus';
import { RepositoriesPage } from './RepositoriesPage';
import {
  fetchCiRepairs,
  fetchDocsFile,
  fetchDocsTree,
  fetchExecution,
  fetchRepositoryHead,
  fetchTaskMessages,
  fetchTestsSnapshot,
  useRepositoryHead,
  type CiRepairsReader,
  type DocsFileReader,
  type DocsTreeReader,
  type ExecutionReader,
  type RepositoryHeadReader,
  type TaskMessagesReader,
  type TestsReader,
} from './repository-reads';
import { fetchSetup, setupPageState, useSetup, type SetupReader, type SetupView } from './setup';
import { AgentsPage, HooksPage, SkillsPage } from './SetupPages';
import { fetchRuntimeOverlay, type RuntimeOverlayReader } from './RuntimeBadges';
import { SystemPage } from './SystemPage';
import { TestsPage } from './TestsPage';
import { ToolsPage } from './ToolsPage';
import { CliPage, fetchCliInventory, useCliInventory, type CliInventoryReader } from './CliPage';
import type { CliInventorySnapshotV1 } from '../core/setup/cli-inventory';
import { useTheme } from './theme';
import { useNow } from './ui';
import { boardLayout, boardPlace, boardRoom, parseWorkspaceLocation, SETUP_WORKSPACES, WORKSPACES, workspaceHash, type Workspace, type WorkspaceLocation } from './workspace-location';
import {
  cleanupPlanPorts, fetchWorktrees, postWorktreeCleanup, useWorktreeCleanup, useWorktrees, worktreesOf,
  type WorktreeCleanupWriter, type WorktreesReader, type WorktreesView,
} from './worktrees';
import { WorktreesPage } from './WorktreesPage';
import type { CleanupPlanPorts } from './CleanupPlanReview';
import { fetchRepositories, registeredLabel, repositoriesOf, useRepositories, type RepositoriesReader } from './repositories';
import type { OperatorRepositoriesV1 } from '../core/operator/repositories';

export interface OperatorAppProps {
  /** The registered repositories: the switcher, the single-repository pages, the board parent list and the Repositories page. */
  readonly readRepositories?: RepositoriesReader;
  readonly initialRepositories?: OperatorRepositoriesV1;
  /** Tests pin the locale; the browser resolves it from storage or navigator. */
  readonly initialLocale?: OperatorLocale;
  /** Server renders have no URL; they name the page to render. The browser reads the fragment. */
  readonly initialPlace?: WorkspaceLocation;
  readonly fetchDevActivity?: DevActivityReader;
  readonly initialDevActivity?: DevActivitySnapshotV2;
  readonly readRuntimeStatus?: RuntimeOverlayReader;
  readonly initialRuntimeOverlay?: RuntimeOverlay;
  /** The board route of one repository and parent issue, behind the Board and its Task drawer. */
  readonly readBoard?: BoardReader;
  /** The parent list route of one repository, behind the Board page without a board. */
  readonly readBoardParents?: BoardParentsReader;
  /** The stored board summaries of one repository, behind the office overview. */
  readonly readBoardSummaries?: BoardSummariesReader;
  /** The boss command route of the office room (#1757). */
  readonly writeBossCommand?: BossCommandWriter;
  /** The advisor seat routes behind the dialog of the office room (#1809). */
  readonly readAdvisorTranscript?: AdvisorTranscriptReader;
  readonly writeAdvisorMessage?: AdvisorMessageWriter;
  readonly readNotifyStatus?: NotifyStatusReader;
  readonly initialNotifyStatus?: NotifyStatusV1;
  /** The cached `repo-harness setup check` result behind the Agents, Skills and Hooks pages. */
  readonly readSetup?: SetupReader;
  readonly initialSetup?: SetupSnapshotV2;
  /** The worktree collector's cached result behind the Worktree page, the Board cleanup signal and Home's reclaimable space. */
  readonly readWorktrees?: WorktreesReader;
  readonly initialWorktrees?: WorktreesSnapshot;
  /** Sends the Worktree page's one-click cleanup of the selected green rows. */
  readonly writeWorktreeCleanup?: WorktreeCleanupWriter;
  /** The cleanup plan routes behind the Worktree page's plan review; #1719 connects them. Without them the page offers no review. */
  readonly worktreeCleanupPlan?: CleanupPlanPorts;
  readonly readCliInventory?: CliInventoryReader;
  readonly initialCliInventory?: CliInventorySnapshotV1;
  /** The docs tree's commit: the short SHA under the current repository in the side rail. */
  readonly readRepositoryHead?: RepositoryHeadReader;
  /** The tests route's open CI repair issues, for Home's "Today" section. */
  readonly readCiRepairs?: CiRepairsReader;
  /** The execution route's verified task sessions: the agent on Home and the Board, and the task drawer's follow-up. */
  readonly readExecution?: ExecutionReader;
  /** The task messages route: the stored inbox of a verified task in the task drawer. */
  readonly readTaskMessages?: TaskMessagesReader;
  /** The architecture map route; the Architecture workspace reads it from the server when absent. */
  readonly readArchitectureMap?: ArchitectureMapReader;
  /** The Bot access collector's cached snapshot behind the Bots page. */
  readonly readBotAccess?: BotAccessReader;
  /** The Slack review collector's cached Dot review threads, the Bots page's second read. */
  readonly readBotReviews?: BotReviewsReader;
  /** The agents section and runtime probe behind the Agents page Hosts section, and its one write. */
  readonly readAgentsSettings?: AgentsSettingsReader;
  readonly writeAgentsSettings?: AgentsSettingsWriter;
  /** The seats section and its ranges behind the Agents page Seats section, and its one write. */
  readonly readSeatsSettings?: SeatsSettingsReader;
  readonly writeSeatsSettings?: SeatsSettingsWriter;
  /** The quota read model behind the Agents page Quota section: read when the page opens and on its Refresh. */
  readonly readQuota?: QuotaReader;
  /** The read-only tests page's snapshot read, injectable on the same terms. */
  readonly readTests?: TestsReader;
  /** The docs page's tree and file reads; the browser default is the same-origin docs routes. */
  readonly readDocsTree?: DocsTreeReader;
  readonly readDocsFile?: DocsFileReader;
}

export const OPERATOR_REPOSITORY_STORAGE_KEY = 'repo-harness:operator-repository';
export const OPERATOR_BOARD_REPOSITORY_STORAGE_KEY = 'repo-harness:operator-board-repository';
export const OPERATOR_TITLE = 'repo-harness';

/** The tab title carries the one "needs you" count. */
export function documentTitle(attention: number | null): string {
  return attention !== null && attention > 0 ? `(${attention}) ${OPERATOR_TITLE}` : OPERATOR_TITLE;
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
// The markdown renderer and Mermaid load only with the docs page.
const DocsPage = lazy(() => import('./DocsPage').then(module => ({ default: module.DocsPage })));

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

/** The board's line: when the shown board was observed, and whether the last read failed. */
function BoardFreshness({ view, now, t }: { readonly view: BoardView | null; readonly now: number; readonly t: OperatorTranslate }) {
  if (view === null) return null;
  if (view.kind === 'loading') return <span className="inline-flex items-center gap-1.5" data-freshness="pending" data-freshness-source="board"><Loader size={12} />{t('freshness.loading')}</span>;
  if (view.kind === 'failed') return <span className="text-kumo-danger" data-freshness="failed" data-freshness-source="board">{t('freshness.board.failed')}</span>;
  const age = ageWords(view.board.observed_at, now, t);
  return (
    <span className={cn('truncate', view.refreshFailed !== null && 'text-kumo-warning')} data-freshness={view.refreshFailed !== null ? 'refresh-failed' : 'ok'} data-freshness-source="board">
      {view.refreshFailed !== null ? t('freshness.refreshFailed', { age }) : t('freshness.board.observed', { age })}
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

/**
 * The architecture page's line: the model commit on screen and, for a map, when the server collected it,
 * the branch it follows and the archctx version that read it; for History, the head that pins the pages
 * and the milestones read of archctx's total.
 */
function ArchitectureFreshness({ source, now, t }: { readonly source: ArchitectureSource | null; readonly now: number; readonly t: OperatorTranslate }) {
  if (source === null) return null;
  if ('head' in source) {
    return <span data-freshness="ok" data-freshness-source="architecture-history" title={source.head}>
      {t('architectureHistory.header', { head: source.head.slice(0, 7), read: source.read, total: source.total })}
    </span>;
  }
  return (
    <span data-freshness="ok" data-freshness-source="architecture">
      {source.map === null ? t('freshness.architecture.model') : t('freshness.architecture.collected', { age: ageWords(source.map.collectedAt, now, t) })}
      {' · '}<code className="mono-value" title={source.commit}>{source.commit.slice(0, 7)}</code>
      {source.map !== null && <>
        {' · '}<span data-head-ref>{source.map.headRef ?? t('architecture.header.detached')}</span>
        {' · '}<span data-archctx-version>{t('architecture.header.archctx', { version: source.map.archctxVersion })}</span>
      </>}
    </span>
  );
}

/** The page title, once per page: the rail group, then the page name. */
function PageCrumb({ workspace, t }: { readonly workspace: Workspace; readonly t: OperatorTranslate }) {
  const group = WORKSPACES.find(entry => entry.id === workspace)!.group;
  return (
    <p className="operator-crumb">
      {group !== null && <><span>{t(`nav.group.${group}`)}</span><span aria-hidden="true">/</span></>}
      <strong>{t(`nav.${workspace}`)}</strong>
    </p>
  );
}

export function OperatorApp({
  readRepositories = fetchRepositories,
  initialRepositories,
  initialLocale,
  initialPlace,
  fetchDevActivity: readDevActivity = fetchDevActivity,
  initialDevActivity,
  readRuntimeStatus = fetchRuntimeOverlay,
  initialRuntimeOverlay,
  readBoard = fetchBoard,
  readBoardParents = fetchBoardParents,
  readBoardSummaries = fetchBoardSummaries,
  writeBossCommand = postBossCommand,
  readAdvisorTranscript = fetchAdvisorTranscript,
  writeAdvisorMessage = postAdvisorMessage,
  readNotifyStatus,
  initialNotifyStatus,
  readSetup = fetchSetup,
  initialSetup,
  readWorktrees = fetchWorktrees,
  initialWorktrees,
  writeWorktreeCleanup = postWorktreeCleanup,
  worktreeCleanupPlan = cleanupPlanPorts,
  readCliInventory = fetchCliInventory,
  initialCliInventory,
  readRepositoryHead = fetchRepositoryHead,
  readCiRepairs = fetchCiRepairs,
  readExecution = fetchExecution,
  readTaskMessages = fetchTaskMessages,
  readArchitectureMap,
  readBotAccess = fetchBotAccess,
  readBotReviews = fetchBotReviews,
  readAgentsSettings = fetchAgentsSettings,
  writeAgentsSettings = postAgentsSettings,
  readSeatsSettings = fetchSeatsSettings,
  writeSeatsSettings = postSeatsSettings,
  readQuota = fetchQuota,
  readTests = fetchTestsSnapshot,
  readDocsTree = fetchDocsTree,
  readDocsFile = fetchDocsFile,
}: OperatorAppProps) {
  const [repositoryId, setRepositoryId] = useState<string | null>(() => readStorage(OPERATOR_REPOSITORY_STORAGE_KEY));
  const [place, setPlace] = useState<WorkspaceLocation>(() => initialPlace ?? parseWorkspaceLocation(typeof window === 'undefined' ? '' : window.location.hash));
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const { locale, setLocale, t } = useLocale(initialLocale);
  const theme = useTheme();
  const now = useNow(15_000);
  const workspace = place.workspace;
  const [systemMounted, setSystemMounted] = useState(workspace === 'system');
  if (workspace === 'system' && !systemMounted) setSystemMounted(true);
  const [worktreesMounted, setWorktreesMounted] = useState(workspace === 'worktrees');
  if (workspace === 'worktrees' && !worktreesMounted) setWorktreesMounted(true);
  // Pages that name one repository: they own the repository switch and docs-tree head.
  const singleRepository = workspace === 'architecture' || workspace === 'tests' || workspace === 'docs';

  const repositories = useRepositories(readRepositories, initialRepositories, refreshGeneration);
  const registered = repositoriesOf(repositories);
  // Pin the first registered repository once it is known. The server sorts by name, so a later
  // registration that sorts first must not move the single-repository pages; only the switcher changes the pin.
  const firstRegistered = registered[0]?.repository_id ?? null;
  if (repositoryId === null && firstRegistered !== null) setRepositoryId(firstRegistered);
  useEffect(() => {
    if (repositoryId !== null) writeStorage(OPERATOR_REPOSITORY_STORAGE_KEY, repositoryId);
  }, [repositoryId]);
  const activeRepository = registered.find(repo => repo.repository_id === repositoryId) ?? null;

  const devActivity = useDevActivity(readDevActivity, initialDevActivity, refreshGeneration);
  const devSnapshot = snapshotOf(devActivity);
  const attention = devSnapshot ? devSnapshot.attention.length : null;
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = documentTitle(attention);
  }, [attention]);
  // The Office setup checklist shows the hc state of this read.
  const botAccess = useBotAccess(readBotAccess, refreshGeneration, workspace === 'bots' || workspace === 'board');
  const botReviews = useBotReviews(readBotReviews, refreshGeneration, workspace === 'bots');
  // Both sections are one file with one revision: a save of either one makes the other read again.
  const [agentsSaves, setAgentsSaves] = useState(0);
  const seatsSettings = useSeatsSettingsForm(readSeatsSettings, writeSeatsSettings, refreshGeneration, agentsSaves, workspace === 'agents');
  const agentsSettings = useAgentsSettingsForm(readAgentsSettings, writeAgentsSettings, refreshGeneration, seatsSettings.saves, workspace === 'agents');
  if (agentsSettings.saves !== agentsSaves) setAgentsSaves(agentsSettings.saves);
  const quota = useQuota(readQuota, workspace === 'agents');
  // Agents, Skills and Hooks share one cached setup check result; it is read only while one of them shows.
  const setup = useSetup(readSetup, initialSetup, refreshGeneration, (SETUP_WORKSPACES as readonly Workspace[]).includes(workspace));
  const cliInventory = useCliInventory(readCliInventory, initialCliInventory, refreshGeneration, workspace === 'cli');
  // One cached collector result feeds the Worktree page and Home's reclaimable row.
  const { view: worktrees, reload: reloadWorktrees } = useWorktrees(readWorktrees, initialWorktrees, refreshGeneration, workspace === 'worktrees' || workspace === 'home');
  const worktreeCleanup = useWorktreeCleanup(worktreesOf(worktrees), writeWorktreeCleanup, reloadWorktrees);
  const boardSubject = workspace === 'board' ? boardPlace(place.item) : null;
  const repositoryRoom = workspace === 'board' ? boardRoom(place.item) : null;
  const board = useBoard(readBoard, boardSubject, refreshGeneration);
  // The one owner of the board repository choice: the open board, the rail and the parent list set it.
  const [boardRepository, setBoardRepository] = useState<string | null>(() => readStorage(OPERATOR_BOARD_REPOSITORY_STORAGE_KEY));
  const chooseBoardRepository = useCallback((id: string) => {
    writeStorage(OPERATOR_BOARD_REPOSITORY_STORAGE_KEY, id);
    setBoardRepository(id);
  }, []);
  const openRepository = boardSubject?.repository_id ?? repositoryRoom;
  useEffect(() => {
    if (openRepository !== null) chooseBoardRepository(openRepository);
  }, [openRepository, chooseBoardRepository]);
  const boardOptions = registered.map(row => ({ id: row.repository_id, label: registeredLabel(registered, row.repository_id) }));
  // The parent list reads only on the list layout: the overview reads its own, and a second read at the same time gets parents_busy.
  const boardParents = useBoardParents(readBoardParents, workspace === 'board' && boardLayout(place.item) === 'list' && boardSubject === null ? boardListRepository(boardOptions, boardRepository) : null, refreshGeneration);

  useEffect(() => {
    const restore = () => setPlace(parseWorkspaceLocation(window.location.hash));
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); };
  }, []);
  const openPlace = useCallback((next: WorkspaceLocation) => {
    window.history.pushState(null, '', window.location.pathname + window.location.search + workspaceHash(next));
    setPlace(next);
  }, []);
  const switchRepository = (id: string) => setRepositoryId(id);
  const boardHome: WorkspaceLocation = { workspace: 'board', module: null, item: null };
  // A Repositories row opens the board parent list of that repository.
  const openRepositoryBoard = (id: string) => {
    chooseBoardRepository(id);
    openPlace(boardHome);
  };
  const refresh = () => setRefreshGeneration(current => current + 1);
  const [architectureSource, setArchitectureSource] = useState<ArchitectureSource | null>(null);

  const [railCollapsed, toggleRail] = useRailCollapsed(workspace);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const head = useRepositoryHead(readRepositoryHead, singleRepository ? activeRepository?.repository_id ?? null : openRepository, refreshGeneration);
  const options = registered.map(row => switchOption(devSnapshot, row.repository_id, registeredLabel(registered, row.repository_id), t));
  const repositorySwitch: RepositorySwitchModel = singleRepository ? {
    mode: 'current',
    selected: activeRepository ? {
      id: activeRepository.repository_id, label: registeredLabel(registered, activeRepository.repository_id),
      detail: repositoryDetail(devSnapshot, activeRepository.repository_id, head),
    } : null,
    options,
    allowAll: false,
    onSelect: id => { if (id !== null) switchRepository(id); },
  } : workspace === 'board' ? {
    // A board names one repository; another repository needs its own parent issue.
    mode: 'current',
    selected: openRepository === null ? null : { id: openRepository, label: registeredLabel(registered, openRepository), detail: repositoryDetail(devSnapshot, openRepository, head) },
    options,
    allowAll: false,
    onSelect: id => {
      if (id === null || id === openRepository) return;
      chooseBoardRepository(id);
      openPlace(boardHome);
    },
  } : {
    mode: 'scope',
    selected: null,
    options,
    allowAll: true,
    // From a page across repositories, one repository opens its docs, its first single-repository page.
    onSelect: id => {
      if (id === null) return;
      switchRepository(id);
      openPlace({ workspace: 'docs', module: null, item: null });
    },
  };

  return (
    <div
      className="operator-app min-h-dvh bg-kumo-canvas text-kumo-default rail:flex"
      data-repositories={repositories.kind}
      data-locale={locale}
      data-workspace={workspace}
      lang={locale}
    >
      <NavRail current={workspace} attention={attention} onOpen={openPlace} repositorySwitch={repositorySwitch}
        collapsed={railCollapsed} onToggleCollapsed={toggleRail} drawerOpen={drawerOpen} onCloseDrawer={closeDrawer}
        activity={devActivity} locale={locale} onLocale={setLocale} theme={theme.preference} onTheme={theme.cycle} t={t} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="operator-header sticky top-0 z-10 flex h-14 items-center gap-3 bg-kumo-canvas px-4 rail:px-6">
          <RailMenuButton expanded={drawerOpen} onOpen={openDrawer} t={t} />
          <PageCrumb workspace={workspace} t={t} />
          {/* One freshness line, about the source of the page on screen. */}
          <span className="min-w-0 flex-1 truncate text-right text-xs text-kumo-subtle">
            {workspace === 'cli' ? null : workspace === 'bots' ? <BotsFreshness view={botAccess} now={now} t={t} />
              : workspace === 'architecture' ? <ArchitectureFreshness source={architectureSource} now={now} t={t} />
              : (SETUP_WORKSPACES as readonly Workspace[]).includes(workspace) ? <SetupFreshness view={setup} now={now} t={t} />
              : workspace === 'worktrees' ? <WorktreesFreshness view={worktrees} now={now} t={t} />
              : workspace === 'board' ? <BoardFreshness view={board} now={now} t={t} />
              : <Freshness view={devActivity} now={now} t={t} />}
          </span>
          <Button size="sm" variant="secondary" icon={<ArrowClockwiseIcon />} onClick={refresh} className="shrink-0">
            <span className="max-sm:sr-only">{t('status.refresh')}</span>
          </Button>
        </header>
        <main className="operator-content mx-auto flex w-full max-w-[1680px] min-w-0 flex-1 flex-col gap-5 px-4 pt-1 pb-10 rail:px-6" data-workspace={workspace}>
          {workspace === 'home' && <Home view={devActivity} worktrees={worktrees} readCiRepairs={readCiRepairs} readExecution={readExecution} generation={refreshGeneration} now={now} onOpen={openPlace} t={t} />}
          {workspace === 'board' && <BoardPage layout={boardLayout(place.item)} place={boardSubject} room={repositoryRoom} view={board} readBoard={readBoard} writeBossCommand={writeBossCommand} readAdvisorTranscript={readAdvisorTranscript} writeAdvisorMessage={writeAdvisorMessage} mode={theme.mode} readBoardParents={readBoardParents} readBoardSummaries={readBoardSummaries} parents={boardParents} readExecution={readExecution} readTaskMessages={readTaskMessages} generation={refreshGeneration} now={now} onOpen={openPlace} t={t}
            repositories={boardOptions} chosenRepository={boardRepository} onRepository={chooseBoardRepository} setup={{ repositories, devActivity, botAccess }} />}
          {workspace === 'repositories' && <RepositoriesPage view={repositories} activity={devActivity} now={now} onOpen={openRepositoryBoard} t={t} />}
          {/* Kept mounted after the first visit so the open plan review and the plan selection survive a page change. */}
          {worktreesMounted && <div hidden={workspace !== 'worktrees'}>
            <WorktreesPage view={worktrees} cleanup={worktreeCleanup} plan={worktreeCleanupPlan} now={now} t={t} />
          </div>}
          {workspace === 'agents' && <AgentsPage view={setup} agents={agentsSettings} seats={seatsSettings} quota={quota} now={now} t={t} />}
          {workspace === 'skills' && <SkillsPage view={setup} now={now} t={t} onOpenTool={id => openPlace({ workspace: 'tools', module: null, item: id })} />}
          {workspace === 'hooks' && <HooksPage view={setup} now={now} t={t} />}
          {workspace === 'cli' && <CliPage view={cliInventory} now={now} t={t} />}
          {workspace === 'tools' && <ToolsPage toolId={place.item} onOpen={id => openPlace({ workspace: 'tools', module: null, item: id })}
            onClose={() => openPlace({ workspace: 'tools', module: null, item: null })} locale={locale} t={t} />}
          {workspace === 'docs' && <Suspense fallback={<p role="status" className="text-sm text-kumo-subtle">{t('workspace.loading')}</p>}>
            <DocsPage repositoryId={activeRepository?.repository_id ?? null} path={place.item} readTree={readDocsTree} readFile={readDocsFile}
              generation={refreshGeneration} mode={theme.mode} now={now} onOpen={openPlace} t={t} />
          </Suspense>}
          {workspace === 'tests' && <TestsPage repositoryId={activeRepository?.repository_id ?? null} readTests={readTests} generation={refreshGeneration} now={now} t={t} />}
          {workspace === 'architecture' && (!activeRepository ? <p role="status" className="text-sm text-kumo-subtle">{t('repository.select')}</p>
            : <Suspense fallback={<p role="status" className="text-sm text-kumo-subtle">{t('workspace.loading')}</p>}>
              <ArchitectureWorkspace repositoryId={activeRepository.repository_id} github={(devSnapshot && repositoryById(devSnapshot, activeRepository.repository_id)?.github) ?? null} moduleId={place.module} refreshGeneration={refreshGeneration} readMap={readArchitectureMap}
                onModule={module => openPlace({ workspace: 'architecture', module, item: null })} onSource={setArchitectureSource} t={t} />
            </Suspense>)}
          {workspace === 'bots' && <BotsPage view={botAccess} reviews={botReviews} now={now} t={t} />}
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

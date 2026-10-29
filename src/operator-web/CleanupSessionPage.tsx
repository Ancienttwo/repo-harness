import { useCleanupPlan, type CleanupPlanReader, type CleanupSessionWriter } from './cleanup-session';
import { SessionReadFailure, SessionRecord } from './DocSessionPage';
import { useDocSessionEvents, type DocSessionEventsReader, type DocSessions } from './doc-sessions';
import type { OperatorTranslate } from './i18n';
import type { WorkspaceLocation } from './workspace-location';
import type { WorktreesView } from './worktrees';

export interface CleanupSessionPageProps {
  /** The 32-hex id from `#cleanup/<id>`. */
  readonly sessionId: string;
  /** The one list read; `absent` means this server serves no session. */
  readonly docSessions: DocSessions;
  readonly readEvents: DocSessionEventsReader;
  readonly readPlan: CleanupPlanReader;
  readonly writeCleanup: CleanupSessionWriter;
  /** The collector rows the approval digest binds, and their re-read after a cleanup. */
  readonly worktrees: WorktreesView;
  readonly reloadWorktrees: () => void;
  readonly generation: number;
  readonly now: number;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly t: OperatorTranslate;
}

/** One worktree cleanup session (5-WTC). This shell shows the record; the plan and approval controls come with the page slice. */
export function CleanupSessionPage({ sessionId, docSessions, readEvents, readPlan, generation, t }: CleanupSessionPageProps) {
  const listed = docSessions.view.kind !== 'absent';
  const { view: plan } = useCleanupPlan(readPlan, listed ? sessionId : null, generation);
  const events = useDocSessionEvents(readEvents, listed ? sessionId : null);
  const header = (
    <header className="border-b border-kumo-hairline pb-4">
      <h1 className="text-xl font-semibold text-kumo-strong">{t('cleanupSession.title')}</h1>
    </header>
  );
  if (!listed) return <div className="flex min-w-0 flex-col gap-5" data-cleanup-session-page="absent">{header}<p role="status" className="text-sm text-kumo-subtle">{t('docSession.absent')}</p></div>;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-cleanup-session-page={sessionId}>
      {header}
      {plan.kind === 'unavailable' && <SessionReadFailure source={t('cleanupSession.source.plan')} reason={plan.reason} t={t} />}
      {/* The plan carries no runtime, so the record names the agent without one. */}
      <SessionRecord sessionId={sessionId} events={events} runtime={null} t={t} />
    </div>
  );
}

import type { ReactNode } from 'react';
import { Badge, Banner, Empty, Loader, cn } from '@cloudflare/kumo';
import { BellIcon, ChatsIcon, PlugIcon, SquaresFourIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type {
  BotAccessSnapshotV1,
  HcTerminalStatus,
  McpAuditProjection,
  RegistryRepoProjection,
} from '../core/operator/bot-access';
import { NOTIFY_CHANNELS, NOTIFY_INSTALL_COMMAND, NOTIFY_START_COMMAND, type NotifyDeliveryState, type NotifyDeliveryV1 } from '../core/operator/notify-status';
import type { SlackReviewReason, SlackReviewState, SlackReviewThreadV1 } from '../core/operator/slack-review';
import {
  botLabel,
  MCP_ACCESS_COMMAND,
  MCP_DOCTOR_COMMAND,
  type BotAccessReason,
  type BotAccessView,
  type BotLabel,
  type BotReviewsView,
} from './bots';
import type { OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { CommandLine, ExternalLink, SectionTitle, StatusDot, type DotTone } from './ui';

type Snapshot = BotAccessSnapshotV1;
type HcReady = Extract<Snapshot['hc'], { readonly state: 'ok' }>;

function Card({ section, children }: { readonly section: 'mcp' | 'notify' | 'hc' | 'reviews'; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={`bots-${section}-heading`} data-bots-section={section}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5">{children}</section>
  );
}

function Subheading({ children, count }: { readonly children: ReactNode; readonly count?: number }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-medium text-kumo-subtle">
      {children}
      {count !== undefined && <span className="rounded-full bg-kumo-recessed px-1.5 tabular-nums">{count}</span>}
    </h3>
  );
}

/** One fact with its dot; the words carry the state and the colour repeats it. */
function Line({ tone, children, className, ...data }: { readonly tone: DotTone; readonly children: ReactNode; readonly className?: string } & Record<`data-${string}`, string>) {
  return (
    <p {...data} className={cn('flex min-w-0 items-start gap-2 text-sm text-kumo-default', className)}>
      <StatusDot tone={tone} className="mt-1.5" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

function When({ at, now, t }: { readonly at: string; readonly now: number; readonly t: OperatorTranslate }) {
  return <time dateTime={at} title={at}>{t('bots.ago', { age: ageWords(at, now, t) })}</time>;
}

const ROWS = 'flex min-w-0 flex-col divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline';

function BotName({ label, t }: { readonly label: BotLabel; readonly t: OperatorTranslate }) {
  if (label.kind === 'registered') return <span className="font-medium text-kumo-strong" data-bot="registered">{label.name}</span>;
  return <span className="text-kumo-subtle" data-bot={label.kind}>{t(label.kind === 'unregistered' ? 'bots.bot.unregistered' : 'bots.bot.unknown')}</span>;
}

// --- MCP ---

function McpServer({ mcp, t }: { readonly mcp: Snapshot['mcp']; readonly t: OperatorTranslate }) {
  if (mcp.state !== 'ok') {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Line tone="danger" data-mcp-status={mcp.reason}>{t(`bots.mcp.reason.${mcp.reason}`)}</Line>
        <CommandLine command={MCP_DOCTOR_COMMAND} t={t} className="max-w-full md:max-w-3xl" />
      </div>
    );
  }
  const { doctor } = mcp;
  const warnings = [
    ...doctor.legacy_full_disk_read ? [t('bots.mcp.warn.legacyFullDisk')] : [],
    ...doctor.unsafe_allowed_root_count > 0 ? [t('bots.mcp.warn.unsafeRoots', { count: doctor.unsafe_allowed_root_count })] : [],
    ...doctor.config_version_ok ? [] : [t('bots.mcp.warn.configVersion')],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2" data-mcp-status={doctor.status}>
      <Line tone={doctor.status === 'not_adopted' ? 'warn' : 'ok'}>
        <span className="font-medium text-kumo-strong">{t(doctor.status === 'not_adopted' ? 'bots.mcp.notAdopted' : 'bots.mcp.ready')}</span>
        {doctor.package_version && <span className="text-kumo-subtle"> · repo-harness {doctor.package_version}</span>}
      </Line>
      {warnings.length > 0 && <>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-kumo-warning" data-mcp-warnings={warnings.length}>{warnings.map(text => <li key={text}>{text}</li>)}</ul>
        <CommandLine command={MCP_DOCTOR_COMMAND} t={t} className="max-w-full md:max-w-3xl" />
      </>}
    </div>
  );
}

const AUDIT_TONE: Readonly<Record<McpAuditProjection['status'], DotTone>> = { ok: 'ok', blocked: 'warn', failed: 'danger' };

function LastCall({ snapshot, audit, now, t }: { readonly snapshot: Snapshot; readonly audit: RegistryRepoProjection['last_audit']; readonly now: number; readonly t: OperatorTranslate }) {
  if (audit.state === 'missing') return <span className="text-xs text-kumo-subtle" data-last-call="missing">{t('bots.mcp.noCall')}</span>;
  if (audit.state === 'unavailable') return <span className="text-xs text-kumo-warning" data-last-call={audit.reason}>{t('bots.mcp.auditUnreadable')}</span>;
  const { entry } = audit;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-kumo-default" data-last-call={entry.status}>
      <StatusDot tone={AUDIT_TONE[entry.status]} />
      <span className="text-kumo-subtle">{t('bots.mcp.lastCall')}</span>
      <code className="font-mono">{entry.tool}</code>
      <span>· {t(`bots.mcp.call.${entry.status}`)}</span>
      <span className="text-kumo-subtle">· <When at={entry.at} now={now} t={t} /> ·</span>
      <BotName label={botLabel(snapshot, entry.bot)} t={t} />
    </span>
  );
}

function Repositories({ snapshot, now, t }: { readonly snapshot: Snapshot; readonly now: number; readonly t: OperatorTranslate }) {
  const { registry } = snapshot;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-registry={registry.state === 'ok' ? 'ok' : registry.reason}>
      <Subheading count={registry.state === 'ok' ? registry.repos.length : undefined}>{t('bots.mcp.repositories')}</Subheading>
      {registry.state !== 'ok' ? <Line tone="danger">{t(`bots.mcp.registry.${registry.reason}`)}</Line> : <>
        {registry.repos.length === 0
          ? <p className="text-sm text-kumo-subtle">{t('bots.mcp.repositoriesEmpty')}</p>
          : (
            <ul className={ROWS}>
              {registry.repos.map(repo => (
                <li key={repo.repo_id} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5 md:flex-row md:items-center md:gap-4" data-registry-repo={repo.repo_id} data-access-mode={repo.access_mode}>
                  <span className="flex min-w-0 items-center gap-2 md:w-72 md:shrink-0">
                    <span className="min-w-0 truncate text-sm font-medium text-kumo-strong" title={repo.repo_id}>{repo.label ?? repo.repo_id}</span>
                    <Badge variant="secondary">{t(`bots.mcp.mode.${repo.access_mode}`)}</Badge>
                  </span>
                  <LastCall snapshot={snapshot} audit={repo.last_audit} now={now} t={t} />
                </li>
              ))}
            </ul>
          )}
        <CommandLine command={MCP_ACCESS_COMMAND} t={t} className="max-w-full md:max-w-3xl" />
      </>}
    </div>
  );
}

function McpSection({ snapshot, now, t }: { readonly snapshot: Snapshot; readonly now: number; readonly t: OperatorTranslate }) {
  return (
    <Card section="mcp">
      <SectionTitle id="bots-mcp-heading"><PlugIcon size={16} aria-hidden="true" />{t('bots.mcp.title')}</SectionTitle>
      <McpServer mcp={snapshot.mcp} t={t} />
      <Repositories snapshot={snapshot} now={now} t={t} />
    </Card>
  );
}

// --- Notify ---

const DELIVERY_TONE: Readonly<Record<NotifyDeliveryState, DotTone>> = { succeeded: 'ok', failed: 'danger', unavailable: 'unknown', missing: 'neutral' };

function Delivery({ delivery, now, t }: { readonly delivery: NotifyDeliveryV1; readonly now: number; readonly t: OperatorTranslate }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-kumo-default">
      <StatusDot tone={DELIVERY_TONE[delivery.result]} />
      <span>{t(`notify.delivery.${delivery.result}`)}</span>
      {delivery.at && <span className="text-kumo-subtle">· <When at={delivery.at} now={now} t={t} /></span>}
    </span>
  );
}

function NotifySection({ snapshot, now, t }: { readonly snapshot: Snapshot; readonly now: number; readonly t: OperatorTranslate }) {
  const { notify } = snapshot;
  const reason = notify.state === 'unavailable' ? notify.reason : null;
  const command = reason === 'relay_stopped' ? NOTIFY_START_COMMAND
    : reason === 'notify_session_missing' || reason === 'notify_session_invalid' ? NOTIFY_INSTALL_COMMAND : null;
  return (
    <Card section="notify">
      <SectionTitle id="bots-notify-heading"><BellIcon size={16} aria-hidden="true" />{t('bots.notify.title')}</SectionTitle>
      {notify.state === 'unavailable'
        ? <Line tone={notify.reason === 'notify_status_pending' ? 'unknown' : notify.reason === 'relay_stopped' ? 'warn' : 'danger'} data-notify={notify.reason}>{t(`bots.notify.reason.${notify.reason}`)}</Line>
        : <>
          <Line tone="ok" data-notify="live">{t('bots.notify.relay')}</Line>
          <ul className={ROWS}>
            {NOTIFY_CHANNELS.map(channel => {
              const configured = notify.channels[channel] === 'configured';
              const delivery = notify.deliveries[channel];
              return (
                <li key={channel} className="flex min-w-0 flex-col gap-1 px-3 py-2.5 md:flex-row md:items-center md:gap-4"
                  data-notify-channel={channel} data-configured={String(configured)} data-delivery={delivery.result}>
                  <span className="text-sm font-medium text-kumo-strong md:w-32 md:shrink-0">{t(`bots.notify.channel.${channel}`)}</span>
                  <span className={cn('text-xs md:w-28 md:shrink-0', configured ? 'text-kumo-default' : 'text-kumo-subtle')}>{t(configured ? 'bots.notify.configured' : 'bots.notify.notConfigured')}</span>
                  {/* An unconfigured channel with no delivery has nothing more to say. */}
                  {(configured || delivery.result !== 'missing') && <Delivery delivery={delivery} now={now} t={t} />}
                </li>
              );
            })}
          </ul>
        </>}
      {command && <CommandLine command={command} t={t} className="max-w-full md:max-w-3xl" />}
    </Card>
  );
}

// --- hc ---

const STATUS_TONE: Readonly<Record<HcTerminalStatus, DotTone>> = { idle: 'neutral', working: 'active', blocked: 'warn', done: 'ok', error: 'danger', unknown: 'unknown' };

/** A core below the pin answered: both versions show, so it never reads as a missing core. */
function HcVersion({ version, t }: { readonly version: HcReady['version']; readonly t: OperatorTranslate }) {
  if (version.state !== 'ok') return <Line tone="warn" data-hc-version={version.reason}>{t(`bots.hc.reason.${version.reason}`)}</Line>;
  const { state, expected, actual } = version.value;
  const words = { version: actual.version, min: expected.min_version };
  return state === 'aligned'
    ? <Line tone="ok" data-hc-version="aligned">{t('bots.hc.aligned', words)}</Line>
    : <Line tone="warn" data-hc-version="mismatch" className="font-medium text-kumo-strong">{t('bots.hc.mismatch', words)}</Line>;
}

function HcTerminals({ terminals, t }: { readonly terminals: HcReady['terminals']; readonly t: OperatorTranslate }) {
  // A version mismatch already has its line above; the other reasons are read failures.
  if (terminals.state !== 'ok') {
    return terminals.reason === 'hc_terminals_failed'
      ? <Line tone="danger" data-hc-terminals={terminals.reason}>{t('bots.hc.reason.hc_terminals_failed')}</Line> : null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-2" data-hc-terminals="ok">
      <Subheading count={terminals.value.length}>{t('bots.hc.terminals')}</Subheading>
      {terminals.value.length === 0 ? <p className="text-sm text-kumo-subtle">{t('bots.hc.terminalsEmpty')}</p> : (
        <ul className={ROWS}>
          {terminals.value.map(terminal => (
            <li key={terminal.address} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm" data-hc-terminal={terminal.address} data-terminal-status={terminal.status}>
              <span className="inline-flex items-center gap-1.5 md:w-28 md:shrink-0">
                <StatusDot tone={STATUS_TONE[terminal.status]} pulse={terminal.status === 'working'} />
                {t(`bots.hc.status.${terminal.status}`)}
              </span>
              <code className="font-mono text-xs text-kumo-subtle">{terminal.address}</code>
              {terminal.name && <code className="font-mono text-xs">{terminal.name}</code>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HcSection({ snapshot, t }: { readonly snapshot: Snapshot; readonly t: OperatorTranslate }) {
  const { hc } = snapshot;
  return (
    <Card section="hc">
      <SectionTitle id="bots-hc-heading"><SquaresFourIcon size={16} aria-hidden="true" />{t('bots.hc.title')}</SectionTitle>
      {hc.state === 'unavailable' ? <Line tone={hc.reason === 'hc_missing' ? 'danger' : 'warn'} data-hc={hc.reason}>{t(`bots.hc.reason.${hc.reason}`)}</Line> : <>
        <HcVersion version={hc.version} t={t} />
        <Line tone="neutral" data-herdr-app={hc.herdr_app.state}>{t('bots.hc.herdrApp')}</Line>
        <HcTerminals terminals={hc.terminals} t={t} />
      </>}
    </Card>
  );
}

// --- Dot reviews ---

const REVIEW_TONE: Readonly<Record<SlackReviewState, DotTone>> = {
  waiting: 'neutral', acknowledged: 'active', result: 'ok', rejected: 'warn', head_mismatch: 'warn', request_invalid: 'danger',
};
const reviewReasonTone = (reason: SlackReviewReason): DotTone => reason === 'slack_pending' ? 'unknown' : reason === 'slack_rate_limited' ? 'warn' : 'danger';

function ReviewState({ thread, t }: { readonly thread: SlackReviewThreadV1; readonly t: OperatorTranslate }) {
  const count = thread.finding_count;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap md:w-56 md:shrink-0">
      <StatusDot tone={REVIEW_TONE[thread.state]} pulse={thread.state === 'acknowledged'} />
      {t(`bots.reviews.state.${thread.state}`)}
      {count !== null && <span data-review-findings={count}>· {t(count === 1 ? 'bots.reviews.findingsOne' : 'bots.reviews.findings', { count })}</span>}
    </span>
  );
}

function ReviewText({ text, t }: { readonly text: SlackReviewThreadV1['text']; readonly t: OperatorTranslate }) {
  if (text.state === 'none') return <p className="text-xs text-kumo-subtle" data-review-text="none">{t('bots.reviews.text.none')}</p>;
  if (text.state === 'text_withheld') return <p className="text-xs text-kumo-warning" data-review-text="text_withheld">{t('bots.reviews.text.withheld')}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-review-text="shown">
      <pre className="max-h-96 overflow-auto rounded-md bg-kumo-recessed p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]" tabIndex={0}>{text.value}</pre>
      {text.truncated && <p className="text-xs text-kumo-subtle" data-review-truncated="">{t('bots.reviews.text.truncated')}</p>}
    </div>
  );
}

/** One thread per row; the row opens the dot's result text. */
function ReviewRow({ thread, now, t }: { readonly thread: SlackReviewThreadV1; readonly now: number; readonly t: OperatorTranslate }) {
  return (
    <li className="min-w-0" data-review-thread={thread.thread_ts} data-review-state={thread.state}>
      <details className="group min-w-0">
        <summary className="cursor-pointer px-3 py-2.5 text-sm">
          <span className="[&>*]:me-3 [&>*]:align-middle">
          <ReviewState thread={thread} t={t} />
          {thread.repo !== null && thread.pr !== null
            ? <ExternalLink href={`https://github.com/${thread.repo}/pull/${thread.pr}`} className="font-medium">{`${thread.repo}#${thread.pr}`}</ExternalLink>
            : <span className="text-kumo-subtle">{t('bots.reviews.noPr')}</span>}
          {thread.head !== null && <code className="font-mono text-xs text-kumo-subtle" title={thread.head}>{thread.head.slice(0, 7)}</code>}
          <span className="text-xs text-kumo-subtle"><When at={thread.requested_at} now={now} t={t} /></span>
          </span>
        </summary>
        <div className="px-3 pb-3"><ReviewText text={thread.text} t={t} /></div>
      </details>
    </li>
  );
}

function ReviewsSection({ view, now, t }: { readonly view: BotReviewsView; readonly now: number; readonly t: OperatorTranslate }) {
  const title = <SectionTitle id="bots-reviews-heading" count={view.kind === 'ready' ? view.snapshot.threads.length : undefined}><ChatsIcon size={16} aria-hidden="true" />{t('bots.reviews.title')}</SectionTitle>;
  if (view.kind !== 'ready') {
    return (
      <Card section="reviews">
        {title}
        {view.kind === 'loading'
          ? <Line tone="unknown" data-reviews="loading">{t('bots.reviews.loading')}</Line>
          : <Line tone="danger" data-reviews={view.reason}>{t(`bots.reviews.read.${view.reason}`)}</Line>}
      </Card>
    );
  }
  const { snapshot } = view;
  const age = snapshot.collected_at === null ? null : ageWords(snapshot.collected_at, now, t);
  return (
    <Card section="reviews">
      {title}
      {snapshot.reason !== null && <Line tone={reviewReasonTone(snapshot.reason)} data-reviews={snapshot.reason}>{t(`bots.reviews.reason.${snapshot.reason}`)}</Line>}
      {snapshot.stale && age !== null && <Line tone="warn" data-reviews-stale="">{t('bots.reviews.stale', { age })}</Line>}
      {view.refreshFailed && <Line tone="warn" data-reviews-refresh="failed">{t('bots.reviews.refreshFailed')}</Line>}
      {snapshot.truncated && <Line tone="warn" data-reviews-truncated="">{t('bots.reviews.truncated')}</Line>}
      {(snapshot.reason === null || snapshot.stale) && (snapshot.threads.length === 0
        ? <p className="text-sm text-kumo-subtle" data-reviews="empty">{t('bots.reviews.empty')}</p>
        : <ul className={ROWS}>{snapshot.threads.map(thread => <ReviewRow key={thread.thread_ts} thread={thread} now={now} t={t} />)}</ul>)}
    </Card>
  );
}

// --- Page ---

type PageState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly reason: Exclude<BotAccessReason, 'bot_access_pending'> }
  | { readonly kind: 'ready'; readonly snapshot: Snapshot; readonly refreshFailed: boolean };

/** The first collection is a wait, not a failure. */
function pageState(view: BotAccessView): PageState {
  if (view.kind === 'loading') return { kind: 'pending' };
  if (view.kind === 'ready') return { kind: 'ready', snapshot: view.snapshot, refreshFailed: view.refreshFailed };
  return view.reason === 'bot_access_pending' ? { kind: 'pending' } : { kind: 'failed', reason: view.reason };
}

const stateName = (state: PageState) => state.kind === 'ready' && state.refreshFailed ? 'refresh-failed' : state.kind;

/**
 * Read-only: every control copies a command. Access changes, client revocation
 * and the notify install are credential and permission operations the user runs.
 */
export function BotsPage({ view, reviews, now, t }: { readonly view: BotAccessView; readonly reviews: BotReviewsView; readonly now: number; readonly t: OperatorTranslate }) {
  const state = pageState(view);
  return (
    <div className="flex min-w-0 flex-col gap-5" data-bots-page={stateName(state)} data-bots-reason={state.kind === 'failed' ? state.reason : undefined}>
      <header className="border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.bots')}</h1>
      </header>
      {state.kind === 'pending' && <Empty size="sm" icon={<Loader size={24} />} title={t('bots.pending.title')} description={t('bots.pending.body')} />}
      {state.kind === 'failed' && <Empty size="sm" icon={<WarningCircleIcon size={32} />} title={t('bots.failed.title')} description={t(`bots.reason.${state.reason}`)} />}
      {state.kind === 'ready' && <>
        {state.refreshFailed && (
          <Banner variant="alert" icon={<WarningIcon />} title={t('bots.refreshFailed.title')}
            description={t('bots.refreshFailed.body', { age: ageWords(state.snapshot.observed_at, now, t) })} />
        )}
        <McpSection snapshot={state.snapshot} now={now} t={t} />
        <NotifySection snapshot={state.snapshot} now={now} t={t} />
        <HcSection snapshot={state.snapshot} t={t} />
      </>}
      <ReviewsSection view={reviews} now={now} t={t} />
    </div>
  );
}

/** The header's one freshness line, about the Bot access snapshot on screen. */
export function BotsFreshness({ view, now, t }: { readonly view: BotAccessView; readonly now: number; readonly t: OperatorTranslate }) {
  const state = pageState(view);
  if (state.kind === 'pending') return <span className="inline-flex items-center gap-1.5" data-freshness="pending" data-freshness-source="bots"><Loader size={12} />{t('freshness.bots.pending')}</span>;
  if (state.kind === 'failed') return <span className="text-kumo-danger" data-freshness="failed" data-freshness-source="bots">{t('freshness.bots.failed', { reason: t(`bots.reason.${state.reason}`) })}</span>;
  const age = ageWords(state.snapshot.observed_at, now, t);
  return (
    <span className={cn('truncate', state.refreshFailed && 'text-kumo-warning')} data-freshness={stateName(state)} data-freshness-source="bots">
      {state.refreshFailed ? t('freshness.bots.refreshFailed', { age }) : t('freshness.bots.read', { age })}
    </span>
  );
}

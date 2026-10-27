import type { ReactNode } from 'react';
import { Badge, Banner, Empty, Loader, cn } from '@cloudflare/kumo';
import { BellIcon, PlugIcon, SquaresFourIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type {
  BotAccessSnapshotV1,
  HerdrAgentStatus,
  HerdrStatusProjection,
  McpAuditProjection,
  OAuthClientProjection,
  RegistryRepoProjection,
} from '../core/operator/bot-access';
import { NOTIFY_CHANNELS, type NotifyDeliveryState, type NotifyDeliveryV1 } from '../core/operator/notify-status';
import {
  botLabel,
  MCP_ACCESS_COMMAND,
  MCP_DOCTOR_COMMAND,
  notifyInstallCommand,
  revokeCommand,
  tokenLife,
  type BotAccessReason,
  type BotAccessView,
  type BotLabel,
} from './bots';
import type { OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { CommandLine, SectionTitle, StatusDot, type DotTone } from './ui';

type Snapshot = BotAccessSnapshotV1;
type HerdrReady = Extract<Snapshot['herdr'], { readonly state: 'ok' }>;

function Card({ section, children }: { readonly section: 'mcp' | 'notify' | 'herdr'; readonly children: ReactNode }) {
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
  if (mcp.state !== 'ok') return <Line tone="danger" data-mcp-status={mcp.reason}>{t(`bots.mcp.reason.${mcp.reason}`)}</Line>;
  const { doctor } = mcp;
  const warnings = [
    ...doctor.legacy_full_disk_read ? [t('bots.mcp.warn.legacyFullDisk')] : [],
    ...doctor.unsafe_allowed_root_count > 0 ? [t('bots.mcp.warn.unsafeRoots', { count: doctor.unsafe_allowed_root_count })] : [],
    ...doctor.config_version_ok ? [] : [t('bots.mcp.warn.configVersion')],
  ];
  const auth = doctor.auth_mode === 'missing' ? t('bots.mcp.authMode.missing')
    : doctor.auth_configured ? t(`bots.mcp.authMode.${doctor.auth_mode}`) : t('bots.mcp.authNotSet', { mode: t(`bots.mcp.authMode.${doctor.auth_mode}`) });
  return (
    <div className="flex min-w-0 flex-col gap-2" data-mcp-status={doctor.status}>
      <Line tone={doctor.status === 'not_adopted' ? 'warn' : 'ok'}>
        <span className="font-medium text-kumo-strong">{t(doctor.status === 'not_adopted' ? 'bots.mcp.notAdopted' : 'bots.mcp.ready')}</span>
        {doctor.package_version && <span className="text-kumo-subtle"> · repo-harness {doctor.package_version}</span>}
        <span className="text-kumo-subtle"> · {auth}</span>
      </Line>
      {warnings.length > 0 && <>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-kumo-warning" data-mcp-warnings={warnings.length}>{warnings.map(text => <li key={text}>{text}</li>)}</ul>
        <CommandLine command={MCP_DOCTOR_COMMAND} t={t} className="max-w-full md:max-w-3xl" />
      </>}
    </div>
  );
}

function TokenLifeText({ client, now, t }: { readonly client: OAuthClientProjection; readonly now: number; readonly t: OperatorTranslate }) {
  const life = tokenLife(client, now);
  const soon = life.kind === 'expired' || (life.kind === 'days' && life.days < 3);
  const text = life.kind !== 'days' ? t(`bots.token.${life.kind}`) : life.days === 0 ? t('bots.token.underDay') : t('bots.token.days', { count: life.days });
  return <span className={cn('text-xs whitespace-nowrap', soon ? 'text-kumo-warning' : 'text-kumo-subtle')} data-token={life.kind}>{text}</span>;
}

function ClientRow({ snapshot, client, now, t }: { readonly snapshot: Snapshot; readonly client: OAuthClientProjection; readonly now: number; readonly t: OperatorTranslate }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5" data-oauth-client={client.client_id}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <BotName label={botLabel(snapshot, client.bot)} t={t} />
        <code className="min-w-0 font-mono text-xs text-kumo-subtle [overflow-wrap:anywhere]">{client.client_id}</code>
        {client.profiles.map(profile => <Badge key={profile} variant="secondary">{profile}</Badge>)}
        <TokenLifeText client={client} now={now} t={t} />
      </div>
      <CommandLine command={revokeCommand(client.client_id)} t={t} className="max-w-full md:max-w-3xl" />
    </li>
  );
}

function Clients({ snapshot, now, t }: { readonly snapshot: Snapshot; readonly now: number; readonly t: OperatorTranslate }) {
  const { oauth } = snapshot;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-oauth={oauth.state === 'unavailable' ? oauth.reason : oauth.state}>
      <Subheading count={oauth.state === 'ok' ? oauth.clients.length : undefined}>{t('bots.mcp.clients')}</Subheading>
      {oauth.state === 'missing' && <p className="text-sm text-kumo-subtle">{t('bots.mcp.clientsMissing')}</p>}
      {oauth.state === 'unavailable' && <Line tone="danger">{t('bots.mcp.clientsUnreadable')}</Line>}
      {oauth.state === 'ok' && <>
        {oauth.clients.length === 0
          ? <p className="text-sm text-kumo-subtle">{t('bots.mcp.clientsEmpty')}</p>
          : <ul className={ROWS}>{oauth.clients.map(client => <ClientRow key={client.client_id} snapshot={snapshot} client={client} now={now} t={t} />)}</ul>}
        {oauth.unreadable_clients > 0 && <p className="text-xs text-kumo-warning">{t('bots.mcp.clientsSkipped', { count: oauth.unreadable_clients })}</p>}
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
      <Clients snapshot={snapshot} now={now} t={t} />
      <Repositories snapshot={snapshot} now={now} t={t} />
    </Card>
  );
}

// --- Notify ---

const DELIVERY_TONE: Readonly<Record<NotifyDeliveryState, DotTone>> = { succeeded: 'ok', failed: 'danger', unsupported: 'warn', unavailable: 'unknown', missing: 'neutral' };

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
  const session = snapshot.herdr.state === 'ok' ? snapshot.herdr.session : null;
  const enabled = notify.state === 'ok' && notify.status.linked === 'linked' && notify.status.enabled === 'enabled';
  const install = notify.state === 'ok' ? !enabled : notify.reason === 'notify_session_missing' || notify.reason === 'notify_session_invalid';
  return (
    <Card section="notify">
      <SectionTitle id="bots-notify-heading"><BellIcon size={16} aria-hidden="true" />{t('bots.notify.title')}</SectionTitle>
      {notify.state === 'unavailable'
        ? <Line tone={notify.reason === 'notify_status_pending' ? 'unknown' : 'danger'} data-notify={notify.reason}>{t(`bots.notify.reason.${notify.reason}`)}</Line>
        : <>
          <Line tone={enabled ? 'ok' : 'warn'} data-notify={enabled ? 'enabled' : 'off'}>
            {enabled ? t('bots.notify.enabled')
              : t('bots.notify.off', { link: t(`notify.link.${notify.status.linked}`), state: t(`notify.enable.${notify.status.enabled}`) })}
          </Line>
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
      {install && <CommandLine command={notifyInstallCommand(session)} t={t} className="max-w-full md:max-w-3xl" />}
    </Card>
  );
}

// --- Herdr ---

const SERVER_TONE: Readonly<Record<HerdrStatusProjection['server']['status'], DotTone>> = { running: 'ok', not_running: 'danger', unknown: 'unknown' };
const AGENT_TONE: Readonly<Record<HerdrAgentStatus, DotTone>> = { idle: 'neutral', working: 'active', blocked: 'warn', done: 'ok', unknown: 'unknown' };

/** Equal version names with a protocol mismatch would read as equal, so the protocols join them then. */
function versionWords(status: HerdrStatusProjection, t: OperatorTranslate): string | null {
  const version = status.server.version;
  if (version === null) return null;
  const fork = version.expected.revision.slice(0, 8);
  if (version.state === 'aligned') return t('bots.herdr.aligned', { version: version.expected.version, fork });
  const actualName = version.actual.version ?? t('bots.herdr.unknownVersion');
  if (version.expected.version !== version.actual.version) return t('bots.herdr.mismatch', { expected: version.expected.version, fork, actual: actualName });
  return t('bots.herdr.mismatch', {
    expected: `${version.expected.version} protocol ${version.expected.protocol}`, fork, actual: `${actualName} protocol ${version.actual.protocol ?? '?'}`,
  });
}

function HerdrServer({ session, status, t }: { readonly session: string; readonly status: HerdrReady['status']; readonly t: OperatorTranslate }) {
  if (status.state !== 'ok') return <Line tone="danger" data-herdr-server={status.reason}>{t(`bots.herdr.reason.${status.reason}`)}</Line>;
  const { server } = status.value;
  const words = versionWords(status.value, t);
  const aligned = server.version?.state === 'aligned';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Line tone={SERVER_TONE[server.status]} data-herdr-server={server.status}>
        <span className="font-medium text-kumo-strong">{t(`bots.herdr.server.${server.status}`)}</span>
        <span className="text-kumo-subtle"> · {t('bots.herdr.session', { session })}</span>
      </Line>
      {words && <Line tone={aligned ? 'ok' : 'warn'} data-herdr-version={server.version?.state ?? ''} className={aligned ? undefined : 'font-medium text-kumo-strong'}>{words}</Line>}
      {server.restart_needed && <Line tone="warn" data-herdr-restart="">{t('bots.herdr.restartNeeded')}</Line>}
    </div>
  );
}

const agentName = (agent: string, t: OperatorTranslate) => agent === 'claude' || agent === 'codex' ? t(`setup.host.${agent}`) : agent;

function HerdrPanes({ snapshot, panes, t }: { readonly snapshot: Snapshot; readonly panes: HerdrReady['snapshot']; readonly t: OperatorTranslate }) {
  // A version mismatch is not "not connected": the server answered, and only its pane state is not read.
  if (panes.state !== 'ok') return <Line tone={panes.reason === 'herdr_version_mismatch' ? 'warn' : 'danger'} data-herdr-panes={panes.reason}>{t(`bots.herdr.reason.${panes.reason}`)}</Line>;
  const { value } = panes;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-herdr-panes="ok">
      <p className="text-sm text-kumo-subtle">{t('bots.herdr.counts', { workspaces: value.workspaces, tabs: value.tabs, panes: value.panes })}</p>
      <Subheading count={value.agents.length}>{t('bots.herdr.agents')}</Subheading>
      {value.agents.length === 0 ? <p className="text-sm text-kumo-subtle">{t('bots.herdr.agentsEmpty')}</p> : (
        <ul className={ROWS}>
          {value.agents.map(agent => (
            <li key={agent.pane_id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm" data-herdr-agent={agent.pane_id} data-agent-status={agent.agent_status}>
              <span className="inline-flex items-center gap-1.5 md:w-28 md:shrink-0">
                <StatusDot tone={AGENT_TONE[agent.agent_status]} pulse={agent.agent_status === 'working'} />
                {t(`bots.herdr.agentStatus.${agent.agent_status}`)}
              </span>
              <code className="font-mono text-xs text-kumo-subtle">{agent.pane_id}</code>
              {agent.agent && <span>{agentName(agent.agent, t)}</span>}
              {agent.name && <code className="font-mono text-xs">{agent.name}</code>}
              <BotName label={botLabel(snapshot, agent.bot)} t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HerdrSection({ snapshot, t }: { readonly snapshot: Snapshot; readonly t: OperatorTranslate }) {
  const { herdr } = snapshot;
  return (
    <Card section="herdr">
      <SectionTitle id="bots-herdr-heading"><SquaresFourIcon size={16} aria-hidden="true" />{t('bots.herdr.title')}</SectionTitle>
      {herdr.state === 'unavailable' ? <>
        <Line tone="warn" data-herdr-server={herdr.reason}>{t(`bots.herdr.reason.${herdr.reason}`)}</Line>
        <CommandLine command={notifyInstallCommand(null)} t={t} className="max-w-full md:max-w-3xl" />
      </> : <>
        <HerdrServer session={herdr.session} status={herdr.status} t={t} />
        <HerdrPanes snapshot={snapshot} panes={herdr.snapshot} t={t} />
      </>}
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
export function BotsPage({ view, now, t }: { readonly view: BotAccessView; readonly now: number; readonly t: OperatorTranslate }) {
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
        <HerdrSection snapshot={state.snapshot} t={t} />
      </>}
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

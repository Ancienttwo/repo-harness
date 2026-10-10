import { useState, type ReactNode } from 'react';
import { Banner, Empty, Loader, cn } from '@cloudflare/kumo';
import { CaretDownIcon, CaretRightIcon, ChatCircleDotsIcon, CheckIcon, MinusIcon, PiIcon, TerminalWindowIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import {
  SETUP_HOSTS,
  type SetupCheck,
  type SetupCheckStatus,
  type SetupFleetRole,
  type SetupHookMismatch,
  type SetupHookRoute,
  type SetupHost,
  type SetupHostFacts,
  type SetupSkill,
  type SetupSnapshotV1,
} from '../core/setup/types';
import type { OperatorMessageKey, OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import {
  hostCommand,
  hostSentence,
  orderChecks,
  orderSkills,
  setupPageState,
  SETUP_CHECK_COMMAND,
  skillAbnormal,
  skillCell,
  type SetupPageState,
  type SetupView,
  type SkillCell,
} from './setup';
import { CommandLine, SectionTitle, StatusDot, type DotTone } from './ui';

export type SetupPage = 'agents' | 'skills' | 'hooks';

interface PageProps { readonly view: SetupView; readonly now: number; readonly t: OperatorTranslate }

const HOST_ICON: Readonly<Record<SetupHost, ReactNode>> = {
  claude: <ChatCircleDotsIcon size={16} aria-hidden="true" />,
  codex: <TerminalWindowIcon size={16} aria-hidden="true" />,
  pi: <PiIcon size={16} aria-hidden="true" />,
};

const CHECK_TONE: Readonly<Record<SetupCheckStatus, DotTone>> = { ok: 'ok', warn: 'warn', fail: 'danger', needs_agent: 'warn', na: 'neutral' };

const SKILL_CELL: Readonly<Record<SkillCell, { readonly key: OperatorMessageKey; readonly tone: DotTone }>> = {
  'ok link': { key: 'setup.skillState.okLink', tone: 'ok' },
  'ok copy': { key: 'setup.skillState.okCopy', tone: 'ok' },
  drift: { key: 'setup.skillState.drift', tone: 'warn' },
  missing: { key: 'setup.skillState.missing', tone: 'warn' },
  'stale copy': { key: 'setup.skillState.staleCopy', tone: 'warn' },
  'dangling link': { key: 'setup.skillState.danglingLink', tone: 'danger' },
  'wrong link': { key: 'setup.skillState.wrongLink', tone: 'danger' },
  'invalid path type': { key: 'setup.skillState.invalidPathType', tone: 'danger' },
  'source missing': { key: 'setup.skillState.sourceMissing', tone: 'danger' },
  'unowned real directory': { key: 'setup.skillState.unownedRealDirectory', tone: 'danger' },
  not_expected: { key: 'setup.skillState.notExpected', tone: 'neutral' },
};

const SKILL_PROJECTION_CHECK = 'doctor.skill-projection';
/** Checks shown before "Show N more"; the Hosts list must stay above the fold. */
const CHECK_PREVIEW = 3;

const hostName = (host: SetupHost, t: OperatorTranslate) => t(`setup.host.${host}`);

function Card({ labelledBy, children, className }: { readonly labelledBy: string; readonly children: ReactNode; readonly className?: string }) {
  return <section aria-labelledby={labelledBy} className={cn('flex min-w-0 flex-col gap-3 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5', className)}>{children}</section>;
}

function stateName(state: SetupPageState): string {
  if (state.kind !== 'data') return state.kind;
  if (state.snapshot.status === 'stale') return 'stale';
  return state.refreshFailed ? 'refresh-failed' : 'ready';
}

/** The shared frame: the first read, a failure, or data with its age. */
function SetupFrame({ page, view, now, t, children }: PageProps & { readonly page: SetupPage; readonly children: (snapshot: SetupSnapshotV1) => ReactNode }) {
  const state = setupPageState(view);
  const age = state.kind === 'data' && state.snapshot.collected_at ? ageWords(state.snapshot.collected_at, now, t) : null;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-setup-page={page} data-setup-state={stateName(state)}
      data-setup-reason={state.kind === 'failed' ? state.reason : state.kind === 'data' ? state.snapshot.reason ?? undefined : undefined}>
      <header className="border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t(`nav.${page}`)}</h1>
      </header>
      {state.kind === 'pending' && <Empty size="sm" icon={<Loader size={24} />} title={t('setup.pending.title')} description={t('setup.pending.body')} />}
      {state.kind === 'failed' && (
        <Empty size="sm" icon={<WarningCircleIcon size={32} />} title={t('setup.failed.title')}
          description={t('setup.failed.body', { reason: t(`setup.reason.${state.reason}`) })} commandLine={SETUP_CHECK_COMMAND} />
      )}
      {state.kind === 'data' && <>
        {state.snapshot.status === 'stale' && state.snapshot.reason && (
          <Banner variant="alert" icon={<WarningIcon />} title={age ? t('setup.stale.title', { age }) : t('setup.stale.titleUnknown')}
            description={t('setup.stale.body', { reason: t(`setup.reason.${state.snapshot.reason}`) })} />
        )}
        {state.snapshot.status !== 'stale' && state.refreshFailed && (
          <Banner variant="alert" icon={<WarningIcon />} title={t('setup.refreshFailed.title')}
            description={age ? t('setup.refreshFailed.body', { age }) : t('setup.refreshFailed.bodyUnknown')} />
        )}
        {children(state.snapshot)}
      </>}
    </div>
  );
}

/** One per-host value. On a phone the host name sits beside it; on wide screens the column header names it. */
function HostCell({ host, children, t }: { readonly host: SetupHost; readonly children: ReactNode; readonly t: OperatorTranslate }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-kumo-default md:w-32 md:shrink-0" data-host-cell={host}>
      <span className="text-kumo-subtle md:sr-only">{hostName(host, t)}</span>
      {children}
    </span>
  );
}

function HostCells({ render, t }: { readonly render: (host: SetupHost) => ReactNode; readonly t: OperatorTranslate }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 md:flex-nowrap md:gap-0">
      {SETUP_HOSTS.map(host => <HostCell key={host} host={host} t={t}>{render(host)}</HostCell>)}
    </span>
  );
}

/** Wide-screen column header; each cell already names its host for screen readers. */
function ColumnHeader({ lead, t }: { readonly lead: ReactNode; readonly t: OperatorTranslate }) {
  return (
    <div aria-hidden="true" className="hidden items-center gap-4 border-b border-kumo-hairline px-3 pb-2 text-xs font-medium text-kumo-subtle md:flex">
      <span className="flex min-w-0 flex-1 gap-4">{lead}</span>
      <span className="flex">{SETUP_HOSTS.map(host => <span key={host} className="w-32 shrink-0">{hostName(host, t)}</span>)}</span>
    </div>
  );
}

const ROW = 'flex min-w-0 flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:gap-4';

// --- Agents ---

/** One compact line per check; the multi-line detail opens below on request. */
function CheckRow({ check, t }: { readonly check: SetupCheck; readonly t: OperatorTranslate }) {
  const [open, setOpen] = useState(false);
  const detailId = `check-detail-${check.id}`;
  return (
    <li className="flex min-w-0 flex-col" data-check={check.id} data-check-status={check.status}>
      {/* Phone: title and Details on one row, the command full width below. Wide: one line. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 px-3 py-1.5 md:flex md:items-center md:gap-3">
        <p className="flex min-w-0 items-start gap-2 text-sm md:order-1 md:flex-1 md:items-center">
          <StatusDot tone={CHECK_TONE[check.status]} className="mt-1.5 md:mt-0" />
          <span className="min-w-0 [overflow-wrap:anywhere] md:flex md:items-center md:gap-2">
            <span className="font-medium text-kumo-strong md:truncate" title={check.title}>{check.title}</span>
            <span className="ml-2 text-xs whitespace-nowrap text-kumo-subtle md:ml-0 md:shrink-0">{t(`setup.check.status.${check.status}`)}</span>
          </span>
        </p>
        <button type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)}
          className="inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1.5 text-xs text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none md:order-3">
          {open ? <CaretDownIcon size={12} aria-hidden="true" /> : <CaretRightIcon size={12} aria-hidden="true" />}
          {t('setup.check.details')}
        </button>
        <div className="col-span-2 flex min-w-0 md:order-2 md:w-[28rem] md:shrink-0">
          {check.command
            ? <CommandLine command={check.command} t={t} className="min-w-0 flex-1 py-0.5" />
            : <span className="min-w-0 flex-1 px-2 text-xs text-kumo-subtle">{t('setup.check.noCommand')}</span>}
        </div>
      </div>
      {open && <pre id={detailId} className="mx-3 mb-2 rounded-md bg-kumo-recessed px-2 py-1.5 whitespace-pre-wrap font-mono text-xs leading-5 text-kumo-default [overflow-wrap:anywhere]">{check.detail}</pre>}
    </li>
  );
}

function AttentionSummary({ snapshot, t }: { readonly snapshot: SetupSnapshotV1; readonly t: OperatorTranslate }) {
  const checks = orderChecks(snapshot.checks);
  const tone: DotTone = checks.some(check => check.status === 'fail') ? 'danger' : checks.length > 0 ? 'warn' : 'ok';
  const summary = snapshot.summary;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? checks : checks.slice(0, CHECK_PREVIEW);
  return (
    <Card labelledBy="setup-attention-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="setup-attention-heading" className="flex items-center gap-2 text-base font-semibold text-kumo-strong" data-setup-attention={checks.length}>
          <StatusDot tone={tone} />
          {checks.length === 0 ? t('setup.agents.clear') : checks.length === 1 ? t('setup.agents.attentionOne') : t('setup.agents.attention', { count: checks.length })}
        </h2>
        {summary && <p className="text-xs text-kumo-subtle tabular-nums">{t('setup.agents.summary', { ok: summary.ok, warn: summary.warn, fail: summary.fail, needs_agent: summary.needs_agent, na: summary.na })}</p>}
      </div>
      {checks.length > 0 && (
        <ul className="flex flex-col divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline">
          {shown.map(check => <CheckRow key={check.id} check={check} t={t} />)}
        </ul>
      )}
      {checks.length > CHECK_PREVIEW && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} data-checks-more
          className="w-fit cursor-pointer rounded-md px-1.5 text-xs font-medium text-kumo-link hover:underline focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none">
          {expanded ? t('setup.agents.less') : t('setup.agents.more', { count: checks.length - CHECK_PREVIEW })}
        </button>
      )}
    </Card>
  );
}

function mismatchText(mismatch: SetupHookMismatch, t: OperatorTranslate): string {
  const kind = mismatch.kind === 'field-mismatch'
    ? t('setup.mismatch.field', { field: mismatch.field ?? t('setup.mismatch.someField') })
    : t(`setup.mismatch.${mismatch.kind}`);
  return `${mismatch.event} · ${mismatch.route_id ?? t('setup.mismatch.unnamed')} · ${kind}`;
}

function sentenceText(facts: SetupHostFacts, t: OperatorTranslate): string {
  const sentence = hostSentence(facts);
  switch (sentence.kind) {
    case 'not_reported': return t('setup.host.notReported', { host: hostName(facts.host, t) });
    case 'not_detected': return t('setup.host.notDetected');
    case 'not_inspected': return t('setup.host.notInspected');
    case 'not_configured': return t('setup.host.notConfigured', { managed: sentence.managed, expected: sentence.expected });
    case 'connected': {
      const parts = [t('setup.host.connected', { managed: sentence.managed, expected: sentence.expected })];
      if (sentence.mismatches > 0) parts.push(sentence.mismatches === 1 ? t('setup.host.mismatchOne') : t('setup.host.mismatches', { count: sentence.mismatches }));
      else if (sentence.projection === null) parts.push(t('setup.host.notCompared'));
      return parts.join(' · ');
    }
  }
}

function hostTone(facts: SetupHostFacts): DotTone {
  return facts.adapter_check === null ? 'neutral' : CHECK_TONE[facts.adapter_check];
}

function HostList({ snapshot, t }: { readonly snapshot: SetupSnapshotV1; readonly t: OperatorTranslate }) {
  return (
    <Card labelledBy="setup-hosts-heading">
      <SectionTitle id="setup-hosts-heading">{t('setup.hosts.title')}</SectionTitle>
      <ul className="flex flex-col divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline">
        {snapshot.hosts.map(facts => {
          const repair = hostCommand(snapshot.checks, facts.host);
          const mismatches = facts.adapter?.mismatches ?? [];
          return (
            <li key={facts.host} className="flex min-w-0 flex-col gap-2 px-3 py-3 md:flex-row md:items-start md:gap-4"
              data-host-row={facts.host} data-host-reported={String(facts.reported)}>
              <span className="flex shrink-0 items-center gap-2 md:w-44">
                <span className="text-kumo-subtle">{HOST_ICON[facts.host]}</span>
                <span className="text-sm font-medium text-kumo-strong">{hostName(facts.host, t)}</span>
                {facts.cli_version && <span className="font-mono text-xs text-kumo-subtle">{t('setup.host.version', { version: facts.cli_version })}</span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-start gap-2 text-sm text-kumo-default">
                  <StatusDot tone={hostTone(facts)} className="mt-1.5" />
                  <span className="min-w-0 [overflow-wrap:anywhere]" data-host-sentence>{sentenceText(facts, t)}</span>
                </span>
                {mismatches.length > 0 && (
                  <span className="pl-4 text-xs text-kumo-subtle [overflow-wrap:anywhere]" data-host-mismatch-summary>
                    {mismatches.slice(0, 3).map(mismatch => mismatchText(mismatch, t)).join('; ')}
                    {mismatches.length > 3 && ` ${t('setup.host.moreMismatches', { count: mismatches.length - 3 })}`}
                  </span>
                )}
              </span>
              <span className="min-w-0 md:w-80 md:shrink-0">
                {repair?.command
                  ? <CommandLine command={repair.command} t={t} />
                  : facts.adapter_check && <span className="text-xs text-kumo-subtle">{t(`setup.check.status.${facts.adapter_check}`)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function fleetCell(state: SetupFleetRole['hosts'][SetupHost], t: OperatorTranslate): ReactNode {
  if (state === null) return <><StatusDot tone="neutral" /><span className="text-kumo-subtle">{t('setup.fleet.notReported')}</span></>;
  return <><StatusDot tone={state === 'installed' ? 'ok' : 'warn'} /><span>{t(`setup.fleet.${state}`)}</span></>;
}

function FleetTable({ snapshot, t }: { readonly snapshot: SetupSnapshotV1; readonly t: OperatorTranslate }) {
  const unknown = t('setup.unknown');
  return (
    <Card labelledBy="setup-fleet-heading">
      <SectionTitle id="setup-fleet-heading" count={snapshot.fleet.length}>{t('setup.fleet.title')}</SectionTitle>
      {snapshot.fleet.length === 0 ? <p className="text-sm text-kumo-subtle">{t('setup.fleet.empty')}</p> : (
        <div className="flex min-w-0 flex-col">
          <ColumnHeader t={t} lead={<><span className="w-40 shrink-0">{t('setup.fleet.role')}</span><span className="w-36 shrink-0">{t('setup.fleet.modelEffort')}</span><span>{t('setup.fleet.description')}</span></>} />
          <ul className="flex flex-col divide-y divide-kumo-hairline">
            {snapshot.fleet.map(role => (
              <li key={role.name} className={ROW} data-fleet-role={role.name}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-4">
                  <span className="font-mono text-sm font-medium text-kumo-strong md:w-40 md:shrink-0 [overflow-wrap:anywhere]">{role.name}</span>
                  <span className="text-xs text-kumo-default md:w-36 md:shrink-0" data-fleet-model>
                    {role.model ?? unknown}<span className="text-kumo-subtle"> · </span>{role.effort ?? unknown}
                  </span>
                  <span className="min-w-0 text-xs text-kumo-subtle md:line-clamp-2" title={role.description ?? undefined}>{role.description ?? t('setup.fleet.noDescription')}</span>
                </span>
                <HostCells t={t} render={host => fleetCell(role.hosts[host], t)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function AgentsPage(props: PageProps) {
  return (
    <SetupFrame page="agents" {...props}>
      {snapshot => <>
        <AttentionSummary snapshot={snapshot} t={props.t} />
        <HostList snapshot={snapshot} t={props.t} />
        <FleetTable snapshot={snapshot} t={props.t} />
      </>}
    </SetupFrame>
  );
}

// --- Skills ---

function SkillRow({ skill, t }: { readonly skill: SetupSkill; readonly t: OperatorTranslate }) {
  return (
    <li className={ROW} data-skill={skill.name} data-skill-abnormal={String(skillAbnormal(skill))}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-4">
        <span className="font-mono text-sm font-medium text-kumo-strong md:w-56 md:shrink-0 [overflow-wrap:anywhere]">{skill.name}</span>
        <span className="min-w-0 text-xs text-kumo-subtle md:line-clamp-2" title={skill.summary ?? undefined}>{skill.summary ?? t('setup.skills.noSummary')}</span>
      </span>
      <HostCells t={t} render={host => {
        const cell = skillCell(skill.hosts[host]);
        const { key, tone } = SKILL_CELL[cell];
        return <span className="inline-flex items-center gap-1.5" data-skill-state={cell}><StatusDot tone={tone} /><span className={tone === 'neutral' ? 'text-kumo-subtle' : undefined}>{t(key)}</span></span>;
      }} />
    </li>
  );
}

export function SkillsPage(props: PageProps) {
  const { t } = props;
  return (
    <SetupFrame page="skills" {...props}>
      {snapshot => {
        const skills = orderSkills(snapshot.skills);
        const abnormal = skills.filter(skillAbnormal).length;
        // The skill projection check itself, when setup check flagged it; its detail explains missing rows.
        const projection = snapshot.checks.find(check => check.id === SKILL_PROJECTION_CHECK) ?? null;
        return (
          <Card labelledBy="setup-skills-heading">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <SectionTitle id="setup-skills-heading" count={skills.length}>{t('setup.skills.title')}</SectionTitle>
              {/* With no rows there is nothing to call consistent; the flagged check, if any, says why. */}
              {skills.length > 0 && (
                <span className={cn('inline-flex items-center gap-1.5 text-xs', abnormal > 0 ? 'text-kumo-warning' : 'text-kumo-subtle')} data-skills-abnormal={abnormal}>
                  <StatusDot tone={abnormal > 0 ? 'warn' : 'ok'} />
                  {abnormal === 0 ? t('setup.skills.allOk') : t('setup.skills.abnormal', { count: abnormal })}
                </span>
              )}
            </div>
            {projection && <ul className="rounded-lg border border-kumo-hairline" aria-label={t('setup.skills.check')}><CheckRow check={projection} t={t} /></ul>}
            {skills.length === 0 ? <p className="text-sm text-kumo-subtle">{t('setup.skills.empty')}</p> : (
              <div className="flex min-w-0 flex-col">
                <ColumnHeader t={t} lead={<><span className="w-56 shrink-0">{t('setup.skills.skill')}</span><span>{t('setup.skills.summary')}</span></>} />
                <ul className="flex flex-col divide-y divide-kumo-hairline">{skills.map(skill => <SkillRow key={skill.name} skill={skill} t={t} />)}</ul>
              </div>
            )}
          </Card>
        );
      }}
    </SetupFrame>
  );
}

// --- Hooks ---

function ManagedEntries({ snapshot, t }: { readonly snapshot: SetupSnapshotV1; readonly t: OperatorTranslate }) {
  return (
    <Card labelledBy="setup-managed-heading">
      <SectionTitle id="setup-managed-heading">{t('setup.hooks.managed')}</SectionTitle>
      <ul className="flex flex-col divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline">
        {snapshot.hosts.map(facts => {
          const mismatches = facts.adapter?.mismatches ?? [];
          return (
            <li key={facts.host} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5 md:flex-row md:items-start md:gap-4" data-managed-host={facts.host}>
              <span className="flex shrink-0 items-center gap-2 md:w-44">
                <span className="text-kumo-subtle">{HOST_ICON[facts.host]}</span>
                <span className="text-sm font-medium text-kumo-strong">{hostName(facts.host, t)}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex min-w-0 items-start gap-2 text-sm">
                  <StatusDot tone={hostTone(facts)} className="mt-1.5" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{sentenceText(facts, t)}</span>
                </span>
                {mismatches.length > 0 && (
                  <ul className="flex flex-col gap-1 pl-4" aria-label={t('setup.hooks.mismatches')}>
                    {mismatches.map((mismatch, index) => (
                      <li key={index} className="font-mono text-xs text-kumo-default [overflow-wrap:anywhere]" data-mismatch={mismatch.kind}>{mismatchText(mismatch, t)}</li>
                    ))}
                  </ul>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RouteRow({ route, t }: { readonly route: SetupHookRoute; readonly t: OperatorTranslate }) {
  return (
    <li className={ROW} data-route={route.route_id}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-4">
        <span className="font-mono text-sm text-kumo-strong md:w-64 md:shrink-0 [overflow-wrap:anywhere]">{route.route_id}</span>
        <span className="text-xs text-kumo-subtle [overflow-wrap:anywhere]">
          <span className="md:sr-only">{t('setup.hooks.matcher')}: </span>
          {route.matcher === null ? t('setup.hooks.allTools') : <code className="font-mono">{route.matcher}</code>}
        </span>
      </span>
      <HostCells t={t} render={host => route.hosts.includes(host)
        ? <span className="inline-flex items-center gap-1 text-kumo-success" data-route-host="supported"><CheckIcon size={14} aria-hidden="true" /><span className="text-kumo-default">{t('setup.hooks.supported')}</span></span>
        : <span className="inline-flex items-center gap-1 text-kumo-subtle" data-route-host="unsupported"><MinusIcon size={14} aria-hidden="true" />{t('setup.hooks.unsupported')}</span>} />
    </li>
  );
}

export function HooksPage(props: PageProps) {
  const { t } = props;
  return (
    <SetupFrame page="hooks" {...props}>
      {snapshot => <>
        <ManagedEntries snapshot={snapshot} t={t} />
        <Card labelledBy="setup-routes-heading">
          <SectionTitle id="setup-routes-heading" count={snapshot.hooks.reduce((total, event) => total + event.routes.length, 0)}>{t('setup.hooks.routes')}</SectionTitle>
          {snapshot.hooks.length === 0 ? <p className="text-sm text-kumo-subtle">{t('setup.hooks.empty')}</p> : (
            <div className="flex min-w-0 flex-col gap-4">
              <ColumnHeader t={t} lead={<><span className="w-64 shrink-0">{t('setup.hooks.route')}</span><span>{t('setup.hooks.matcher')}</span></>} />
              {snapshot.hooks.map(event => (
                <section key={event.event} aria-labelledby={`hook-event-${event.event}`} className="flex min-w-0 flex-col" data-hook-event={event.event}>
                  <h3 id={`hook-event-${event.event}`} className="flex items-center gap-2 px-3 pb-1 font-mono text-xs font-semibold text-kumo-strong">
                    {event.event}<span className="rounded-full bg-kumo-recessed px-1.5 font-sans font-medium tabular-nums text-kumo-subtle">{event.routes.length}</span>
                  </h3>
                  <ul className="flex flex-col divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline">
                    {event.routes.map(route => <RouteRow key={route.route_id} route={route} t={t} />)}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      </>}
    </SetupFrame>
  );
}

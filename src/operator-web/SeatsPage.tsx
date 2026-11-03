import { useState, type ReactNode } from 'react';
import { Banner, Button, Empty, Loader, Switch, cn } from '@cloudflare/kumo';
import { buildSeatLaunch, type SeatLimitLevel } from '../core/operator/seat-launch';
import { SEAT_TOOLS, type SeatId, type SeatRuntime, type SeatsSettingsV1 } from '../core/operator/seats-settings';
import type { SetupSnapshotV2 } from '../core/setup/types';
import type { OperatorTranslate } from './i18n';
import { seatChanges, setSeatEffort, setSeatModel, setSeatRole, setSeatRuntime, setSeatTool, type SeatsSettingsForm } from './seats';
import { SaveResult } from './SettingsPage';
import { saveNeedsReload } from './settings';
import { CommandLine, SectionTitle } from './ui';

const LEVEL_TONE: Readonly<Record<SeatLimitLevel, string>> = {
  enforced: 'bg-kumo-success-tint text-kumo-success',
  named_types_only: 'bg-kumo-warning-tint text-kumo-warning',
  common_commands: 'bg-kumo-warning-tint text-kumo-warning',
  instructions_only: 'bg-kumo-warning-tint text-kumo-warning',
};

// The plain command prints the argv alone, so `--argv "$(...)"` takes it as is. `seats argv` also names the pane and
// the tab (#1544), so no command types a name.
const ARGV: Readonly<Record<SeatId, string>> = {
  orchestrator: 'repo-harness seats argv orchestrator --repository-id <repository-id>',
  advisor: 'repo-harness seats argv advisor --repository-id <repository-id>',
  worker: 'repo-harness seats argv worker --repository-id <repository-id> --parent <n> --issue <n>',
};
const LAUNCH: Readonly<Record<SeatId, string>> = {
  orchestrator: `herdr-app do tab.new --name "$(${ARGV.orchestrator} --json | jq -r .tab)" --space <id> --folder <repo> --argv "$(${ARGV.orchestrator})"`,
  advisor: `herdr-app do pane.split --direction right --pane <orchestrator-pane> --argv "$(${ARGV.advisor})"`,
  worker: `herdr-app do tab.new --name "$(${ARGV.worker} --json | jq -r .tab)" --space <id> --folder <worktree> --argv "$(${ARGV.worker})" --task <packet>`,
};

/** The pane layout rule: Tab 1 holds the orchestrator, the advisor and one worker; later tabs hold workers only. */
const LAYOUT: readonly (readonly SeatId[])[] = [['orchestrator', 'advisor', 'worker'], ['worker', 'worker', 'worker']];

function Badge({ className, children }: { readonly className: string; readonly children: ReactNode }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap', className)}>{children}</span>;
}

function LimitBadge({ level, t }: { readonly level: SeatLimitLevel; readonly t: OperatorTranslate }) {
  return <span data-limit={level}><Badge className={LEVEL_TONE[level]}>{t(`seats.limit.${level}`)}</Badge></span>;
}

function Segmented<T extends string | null>({ label, options, value, onPick, disabled }: {
  readonly label: string; readonly options: readonly { readonly value: T; readonly label: string; readonly off?: boolean; readonly why?: string }[];
  readonly value: T; readonly onPick: (value: T) => void; readonly disabled: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-kumo-recessed p-0.5">
      {options.map(option => (
        <button key={option.value ?? ''} type="button" aria-pressed={option.value === value} disabled={disabled || option.off} title={option.why}
          onClick={() => onPick(option.value)}
          className={cn('h-7 rounded-md px-2.5 font-mono text-xs',
            option.value === value ? 'bg-kumo-base text-kumo-strong shadow-xs' : 'text-kumo-subtle',
            option.off ? 'cursor-not-allowed line-through opacity-60' : 'cursor-pointer')}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 border-t border-kumo-hairline px-4 py-3 first:border-t-0 sm:grid-cols-[120px_1fr] sm:px-5">
      <span className="text-sm text-kumo-subtle">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

function ToggleRow({ name, mono, badge, detail, why, on, locked, aria, onToggle }: {
  readonly name: string; readonly mono: boolean; readonly badge: ReactNode; readonly detail: string; readonly why: string | null;
  readonly on: boolean; readonly locked: boolean; readonly aria: string; readonly onToggle: (on: boolean) => void;
}) {
  return (
    <li className={cn('flex flex-wrap items-center gap-3 border-t border-kumo-hairline px-4 py-2.5 sm:px-5', locked && 'opacity-70')}>
      <span className={cn('w-36 shrink-0 text-sm text-kumo-strong', mono && 'font-mono')}>{name}</span>
      {badge}
      <span className="min-w-0 flex-[1_1_220px] truncate text-xs text-kumo-subtle" title={detail}>{detail}</span>
      {why !== null && <span className="text-xs text-kumo-subtle">{why}</span>}
      <Switch checked={on} disabled={locked} aria-label={aria} onCheckedChange={onToggle} />
    </li>
  );
}

function fleetDetail(setup: SetupSnapshotV2 | null, role: string): string {
  const entry = setup?.fleet.find(item => item.name === role);
  if (!entry) return '';
  const model = [entry.model, entry.effort].filter(Boolean).join(' ');
  return [model, entry.description].filter(Boolean).join(' · ');
}

function SeatCard({ seat, form, settings, setup, locked, t }: {
  readonly seat: SeatId; readonly form: SeatsSettingsForm; readonly settings: SeatsSettingsV1; readonly setup: SetupSnapshotV2 | null;
  readonly locked: boolean; readonly t: OperatorTranslate;
}) {
  const draft = form.draft![seat];
  const { ranges, defaults } = settings;
  const runtime = ranges.runtimes.find(entry => entry.id === draft.runtime)!;
  const range = ranges.seats[seat];
  const recommended = seat !== 'worker' && defaults[seat].runtime === draft.runtime ? defaults[seat] : null;
  const check = (on: boolean) => (on ? ' ✓' : '');
  const models = [
    { value: null, label: t('seats.model.hostDefault') },
    ...runtime.models.map(model => ({ value: model as string | null, label: model })),
    // A stored model the runtime no longer offers stays visible; Save then names it.
    ...(draft.model !== null && !runtime.models.includes(draft.model) ? [{ value: draft.model as string | null, label: draft.model }] : []),
  ];
  const efforts = [{ value: null, label: t('seats.effort.default') }, ...ranges.efforts.map(effort => ({ value: effort as string | null, label: effort, off: !runtime.effort }))];
  // The host agent types change only the argv; the limit levels do not depend on them, so the page passes none.
  const limits = buildSeatLaunch(seat, draft, 'seats', []).limits;
  const levelOf = (subject: string) => limits.find(limit => limit.subject === subject)?.level ?? null;
  const fleetLevel = levelOf('fleet');
  const noFleet = range.fleet.length === 0;
  // A stored role the server no longer lists stays visible, as a stored model does, so it can be switched off.
  const roles: readonly { readonly name: string; readonly writable: boolean | null }[] = [
    ...ranges.roles,
    ...draft.fleet.filter(name => !ranges.roles.some(role => role.name === name)).map(name => ({ name, writable: null })),
  ];
  return (
    <section aria-labelledby={`seat-${seat}-title`} data-seat-card={seat} className="flex flex-col overflow-hidden rounded-xl border border-kumo-line bg-kumo-base">
      <div className="flex flex-wrap items-center gap-3 border-b border-kumo-hairline px-4 py-4 sm:px-5">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold',
          draft.runtime === 'claude' ? 'bg-(--rh-agent-claude-tint) text-(--rh-agent-claude)' : draft.runtime === 'codex' ? 'bg-(--rh-agent-codex-tint) text-(--rh-agent-codex)' : 'bg-kumo-fill text-kumo-strong')}>
          {seat[0]!.toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={`seat-${seat}-title`} className="text-base font-semibold text-kumo-strong">{t(`seats.${seat}.title`)}</h2>
          <span className="text-xs text-kumo-subtle">{t(`seats.${seat}.duty`)}</span>
        </div>
        <Badge className="bg-kumo-fill text-kumo-subtle">{t(`seats.${seat}.count`)}</Badge>
      </div>

      <Field label={t('seats.field.runtime')}>
        <Segmented label={t('seats.field.runtime')} disabled={locked} value={draft.runtime as SeatRuntime}
          options={ranges.runtimes.map(entry => ({ value: entry.id, label: t(`seats.runtime.${entry.id}`), off: !entry.enabled && entry.id !== draft.runtime,
            why: entry.enabled ? undefined : t('seats.runtime.notEnabled') }))}
          onPick={value => form.edit(current => setSeatRuntime(current, seat, value, ranges))} />
        <span className={cn('text-xs', runtime.enabled ? 'text-kumo-subtle' : 'text-kumo-danger')} data-runtime-note>
          {!runtime.enabled ? t('seats.runtime.storedNotEnabled', { runtime: draft.runtime })
            : draft.runtime === 'pi' ? t('seats.runtime.piModel')
              : seat === 'orchestrator' && draft.runtime !== 'claude' ? t('seats.runtime.orchestratorMode') : t('seats.runtime.fromAgents')}
        </span>
      </Field>

      <Field label={t('seats.field.model')}>
        <Segmented label={t('seats.field.model')} disabled={locked} value={draft.model} options={models}
          onPick={value => form.edit(current => setSeatModel(current, seat, value))} />
        <span className="text-xs text-kumo-brand">
          {seat === 'worker' ? t('seats.rec.worker') : recommended?.model ? t('seats.rec.model', { model: recommended.model }) + check(draft.model === recommended.model) : ''}
        </span>
      </Field>

      <Field label={t('seats.field.effort')}>
        <Segmented label={t('seats.field.effort')} disabled={locked} value={draft.effort} options={efforts}
          onPick={value => form.edit(current => setSeatEffort(current, seat, value))} />
        {recommended?.effort && <span className="text-xs text-kumo-brand">{t('seats.rec.effort', { effort: recommended.effort }) + check(draft.effort === recommended.effort)}</span>}
      </Field>

      <ul aria-label={t('seats.tools.title')} data-seat-tools>
        <li className="flex flex-wrap items-center gap-3 bg-kumo-recessed px-4 py-2.5 sm:px-5">
          <span className="flex-1 text-sm font-medium text-kumo-strong">{t('seats.tools.title')}</span>
        </li>
        {SEAT_TOOLS.map((tool) => {
          const on = draft.tools.includes(tool);
          const ruled = !range.tools.includes(tool);
          // Codex always runs commands, so its Shell can be turned on but not off.
          const hostWhy = draft.runtime === 'pi' ? t('seats.tools.why.pi')
            : tool === 'read' ? t('seats.tools.why.read')
              : draft.runtime === 'codex' && tool === 'shell' && on ? t('seats.tools.why.codexShell')
                : draft.runtime === 'codex' && tool === 'tasks' ? t('seats.tools.why.codexTasks') : null;
          const why = ruled ? t(tool === 'edit' || tool === 'gh' ? `seats.tools.rule.${tool}` : 'seats.tools.rule.other') : hostWhy;
          // A group that is on has no limit; an off group shows how the host applies the limit.
          const level = levelOf(tool);
          return (
            <ToggleRow key={tool} name={t(`seats.tool.${tool}`)} mono={false} detail={level === null ? '' : t(`seats.limit.${level}.detail`)}
              badge={level === null ? null : <LimitBadge level={level} t={t} />}
              // An out-of-range group that the draft holds can only be switched off; the server refuses the section while it stays.
              why={why} locked={locked || (why !== null && !(ruled && on))} on={on}
              aria={t('seats.tools.allow', { tool: t(`seats.tool.${tool}`) })}
              onToggle={on => form.edit(current => setSeatTool(current, seat, tool, on))} />
          );
        })}
      </ul>

      <ul aria-label={t('seats.fleet.title')} data-seat-fleet>
        <li className="flex flex-wrap items-center gap-3 bg-kumo-recessed px-4 py-2.5 sm:px-5">
          <span className="flex-1 text-sm font-medium text-kumo-strong">{t('seats.fleet.title')}</span>
          {fleetLevel === null ? <span className="text-xs text-kumo-subtle">{t('seats.fleet.why.pi')}</span> : <LimitBadge level={fleetLevel} t={t} />}
        </li>
        {noFleet && <li className="m-4 rounded-lg bg-kumo-recessed px-3.5 py-3 text-sm sm:mx-5" data-fleet-locked>{t('seats.fleet.orchestratorLocked')}</li>}
        {/* With no allowed role, only stored roles show, so they can be switched off. */}
        {roles.filter(role => !noFleet || draft.fleet.includes(role.name)).map((role) => {
          const on = draft.fleet.includes(role.name);
          const why = role.writable === null ? t('seats.fleet.why.unknown') : !runtime.fleet ? t('seats.fleet.why.pi')
            : !range.fleet.includes(role.name) ? t(noFleet ? 'seats.fleet.why.none' : 'seats.fleet.why.writable') : null;
          return (
            <ToggleRow key={role.name} name={role.name} mono detail={fleetDetail(setup, role.name)}
              badge={role.writable === null ? null
                : <Badge className={role.writable ? 'bg-kumo-warning-tint text-kumo-warning' : 'bg-kumo-fill text-kumo-subtle'}>{t(role.writable ? 'seats.fleet.writable' : 'seats.fleet.readOnly')}</Badge>}
              why={why} locked={locked || (why !== null && !on)} on={on}
              aria={t('seats.fleet.allow', { role: role.name })}
              onToggle={next => form.edit(current => setSeatRole(current, seat, role.name, next))} />
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-kumo-hairline px-4 py-4 sm:px-5" data-seat-launch>
        <span className="text-sm font-medium text-kumo-strong">{t('seats.launch.title')}</span>
        <CommandLine command={LAUNCH[seat]} t={t} />
        <pre aria-label={t('seats.launch.config')} className="m-0 rounded-md bg-kumo-recessed px-3 py-2 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(draft)}</pre>
      </div>
    </section>
  );
}

export function SeatsPage({ form, setup, t }: { readonly form: SeatsSettingsForm; readonly setup: SetupSnapshotV2 | null; readonly t: OperatorTranslate }) {
  const [seat, setSeat] = useState<SeatId>('advisor');
  const { view, draft, base } = form;
  if (view.kind === 'loading') return <Empty icon={<Loader />} title={t('settings.pending.title')} />;
  if (view.kind === 'unavailable') {
    return <Banner variant="error" data-settings-unavailable={view.reason} title={t('settings.failed.title')} description={t(`settings.reason.${view.reason}`)} />;
  }
  const { settings } = view;
  const locked = saveNeedsReload(form.save) || form.save.kind === 'saving';
  const changedElsewhere = base !== null && form.request !== null && form.save.kind !== 'saving' && settings.config.revision !== base.revision;
  const changes = base !== null && draft !== null ? seatChanges(base, draft) : 0;
  return (
    <div className="flex flex-col gap-5" data-seats-page>
      <p className="text-sm text-kumo-subtle">{t('seats.lead')}</p>
      <section aria-labelledby="seats-layout-heading" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <SectionTitle id="seats-layout-heading">{t('seats.layout.title')}</SectionTitle>
          <span className="text-xs text-kumo-subtle">{t('seats.layout.hint')}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {LAYOUT.map((panes, tab) => (
            <div key={tab} className="flex min-w-0 flex-[1_1_300px] flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-base p-2.5">
              <span className="font-mono text-xs text-kumo-subtle">{t('seats.layout.tab', { n: tab + 1 })}</span>
              <div className="flex gap-1.5">
                {panes.map((id, index) => (
                  <button key={index} type="button" aria-pressed={id === seat} onClick={() => setSeat(id)} data-pane={id}
                    className={cn('flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left',
                      id === seat ? 'border-(--rh-accent) bg-(--rh-accent-tint)' : 'border-kumo-line bg-kumo-recessed hover:border-kumo-subtle')}>
                    <b className="text-sm font-semibold text-kumo-strong">{t(`seats.${id}.short`)}</b>
                    {draft && <span className="w-full truncate text-xs text-kumo-subtle">{[draft[id].runtime, draft[id].model ?? t('seats.model.hostDefault')].join(' · ')}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-kumo-subtle"><Badge className="bg-kumo-fill text-kumo-subtle">{t('seats.layout.ruleBadge')}</Badge>{t('seats.layout.rule')}</p>
      </section>

      {draft !== null && <SeatCard seat={seat} form={form} settings={settings} setup={setup} locked={locked} t={t} />}

      <SaveResult save={form.save} reload={form.reload} changedElsewhere={changedElsewhere} t={t} />
      {form.save.kind === 'saved' && <Banner variant="default" data-seats-saved description={t('seats.saved')} />}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3" data-seats-savebar>
        <span className="text-xs text-kumo-subtle">{t('seats.savebar.target')} · <span className="font-mono">{settings.config.revision === 'absent' ? 'absent' : `${settings.config.revision.slice(0, 13)}…`}</span></span>
        <span className="flex-1" />
        <span className="text-xs text-kumo-subtle">{changes === 0 ? t('seats.savebar.clean') : t('seats.savebar.dirty', { count: changes })}</span>
        <Button variant="ghost" onClick={form.discard} disabled={form.request === null || locked}>{t('settings.discard')}</Button>
        <Button variant="primary" onClick={form.submit} disabled={form.request === null || locked} data-save>
          {form.save.kind === 'saving' ? t('settings.saving') : t('settings.save')}
        </Button>
      </div>
      <p className="text-xs text-kumo-subtle">{t('seats.footnote')}</p>
    </div>
  );
}

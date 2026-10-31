import type { ReactNode } from 'react';
import { Banner, Button, Empty, Loader, Switch, cn } from '@cloudflare/kumo';
import type { AgentRuntimeSettingsEntryV1, AgentUse, AgentsSettingsV1 } from '../core/operator/agents-settings';
import type { OperatorApiErrorV1 } from './types';
import { isOperatorMessageKey, type OperatorMessageKey, type OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { saveNeedsReload, setDefaultDocs, setEnabled, setUse, type AgentsDraft, type AgentsSettingsForm, type AgentsSettingsView } from './settings';
import { SectionTitle, StatusDot, type DotTone } from './ui';

/** Copy for a refused save is keyed by its code; a code this bundle does not know shows the server's sentence, marked as such. */
function refusalText(error: OperatorApiErrorV1, t: OperatorTranslate): { readonly message: string; readonly next_action: string; readonly localized: boolean } {
  const message = `settings.error.${error.code}.message`;
  const action = `settings.error.${error.code}.action`;
  return isOperatorMessageKey(message) && isOperatorMessageKey(action)
    ? { message: t(message), next_action: t(action), localized: true }
    : { message: error.message, next_action: error.next_action, localized: false };
}

export function SettingsFreshness({ view, now, t }: { readonly view: AgentsSettingsView; readonly now: number; readonly t: OperatorTranslate }) {
  if (view.kind === 'loading') return <span className="inline-flex items-center gap-1.5" data-freshness="pending" data-freshness-source="settings"><Loader size={12} />{t('freshness.settings.pending')}</span>;
  if (view.kind === 'unavailable') {
    return <span className="text-kumo-danger" data-freshness="failed" data-freshness-source="settings">{t('freshness.settings.failed', { reason: t(`settings.reason.${view.reason}`) })}</span>;
  }
  const { runtimes } = view.settings;
  if (runtimes.collected_at === null) return <span data-freshness="pending" data-freshness-source="settings">{t('freshness.settings.notDetected')}</span>;
  const age = ageWords(runtimes.collected_at, now, t);
  const warn = runtimes.status === 'stale' || view.refreshFailed;
  return (
    <span className={cn('truncate', warn && 'text-kumo-warning')} data-freshness={runtimes.status === 'stale' ? 'stale' : view.refreshFailed ? 'refresh-failed' : 'ready'} data-freshness-source="settings">
      {t(runtimes.status === 'stale' ? 'freshness.settings.stale' : view.refreshFailed ? 'freshness.settings.refreshFailed' : 'freshness.settings.read', { age })}
    </span>
  );
}

const INSTALL_TONE: Readonly<Record<AgentRuntimeSettingsEntryV1['installation']['kind'], DotTone>> = {
  available: 'ok', not_found: 'neutral', unsupported: 'neutral', dependency_missing: 'warn', host_setup_required: 'warn', probe_failed: 'danger',
};

function installText(entry: AgentRuntimeSettingsEntryV1, t: OperatorTranslate): ReactNode {
  const { installation } = entry;
  switch (installation.kind) {
    case 'available':
      return <>{t(installation.via === 'bundled' ? 'settings.install.bundled' : 'settings.install.executable')}
        {installation.version !== null && <> · <span className="font-mono">{installation.version}</span></>}</>;
    case 'unsupported': return t('settings.install.unsupported', { reason: installation.reason });
    case 'dependency_missing': return <>{t('settings.install.dependency_missing')} <code className="font-mono">{installation.package}</code></>;
    default: return t(`settings.install.${installation.kind}`);
  }
}

const UNSUPPORTED_REASON = { docs: 'settings.use.docsIsolationUnverified', review: 'settings.use.reviewUnsupported' } as const satisfies Record<AgentUse, OperatorMessageKey>;

/** A runtime the section names but the probe no longer lists can only be turned off. */
type Row = { readonly id: string; readonly entry: AgentRuntimeSettingsEntryV1 | null };

function UseToggle({ use, row, draft, locked, onEdit, t }: {
  readonly use: AgentUse; readonly row: Row; readonly draft: AgentsDraft; readonly locked: boolean;
  readonly onEdit: (change: (draft: AgentsDraft) => AgentsDraft) => void; readonly t: OperatorTranslate;
}) {
  const on = (use === 'docs' ? draft.docs : draft.review).includes(row.id);
  const enabled = draft.enabled.includes(row.id);
  const unsupported = row.entry !== null && !(use === 'review' ? row.entry.review_supported : row.entry.docs_supported);
  // The server accepts a runtime the probe no longer lists only in a change that turns it off, so its uses
  // go only with the switch. Otherwise a use can be removed whatever the reason, and added only to an enabled runtime.
  const disabled = locked || row.entry === null || (!on && (!enabled || unsupported));
  const reason = unsupported ? t(UNSUPPORTED_REASON[use]) : !enabled ? t('settings.use.needsEnabled') : undefined;
  return (
    <button type="button" aria-pressed={on} disabled={disabled} title={disabled && !locked ? reason : undefined} data-use={use}
      onClick={() => onEdit(current => setUse(current, row.id, use, !on))}
      className={cn('inline-flex h-7 items-center rounded-md border px-2 text-xs',
        on ? 'border-transparent bg-(--rh-accent-tint) font-medium text-kumo-brand' : 'border-kumo-line text-kumo-default',
        unsupported && 'border-dashed',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-kumo-tint')}>
      {t(`settings.use.${use}`)}
    </button>
  );
}

function RuntimeRow({ row, draft, locked, docsAvailable, onEdit, t }: {
  readonly row: Row; readonly draft: AgentsDraft; readonly locked: boolean; readonly docsAvailable: boolean;
  readonly onEdit: (change: (draft: AgentsDraft) => AgentsDraft) => void; readonly t: OperatorTranslate;
}) {
  const enabled = draft.enabled.includes(row.id);
  const installed = row.entry?.installation.kind === 'available';
  // No runtime is docs-supported while the launch allowlist is empty, so the docs use and default stay off the page.
  const unsupported = row.entry === null ? [] : [
    ...(!docsAvailable || row.entry.docs_supported ? [] : [UNSUPPORTED_REASON.docs]),
    ...(row.entry.review_supported ? [] : [UNSUPPORTED_REASON.review]),
  ];
  return (
    <li className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4" data-runtime={row.id}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-kumo-strong">{row.id}</span>
          {docsAvailable && draft.default_docs === row.id && <span className="rounded-full bg-(--rh-accent) px-1.5 text-xs font-semibold text-(--rh-on-accent)">{t('settings.default')}</span>}
        </div>
        <p className="flex min-w-0 items-start gap-2 text-xs text-kumo-subtle" data-installation={row.entry?.installation.kind ?? 'missing'}>
          <StatusDot tone={row.entry ? INSTALL_TONE[row.entry.installation.kind] : 'unknown'} className="mt-1" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{row.entry ? installText(row.entry, t) : t('settings.install.missing')}</span>
        </p>
        {enabled && unsupported.length > 0 && <p className="text-xs text-kumo-subtle" data-use-reasons>{unsupported.map(key => t(key)).join(' ')}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {docsAvailable && <UseToggle use="docs" row={row} draft={draft} locked={locked} onEdit={onEdit} t={t} />}
        <UseToggle use="review" row={row} draft={draft} locked={locked} onEdit={onEdit} t={t} />
        {/* Not installed and off: there is nothing to turn on. An enabled runtime can always be turned off. */}
        {(installed || enabled) && (
          <Switch checked={enabled} disabled={locked || (!enabled && !installed)} aria-label={t('settings.enable', { runtime: row.id })}
            onCheckedChange={on => onEdit(current => setEnabled(current, row.id, on))} />
        )}
      </div>
    </li>
  );
}

function RuntimeGroup({ id, title, rows, draft, locked, docsAvailable, onEdit, t }: {
  readonly id: string; readonly title: string; readonly rows: readonly Row[]; readonly draft: AgentsDraft; readonly locked: boolean;
  readonly docsAvailable: boolean;
  readonly onEdit: (change: (draft: AgentsDraft) => AgentsDraft) => void; readonly t: OperatorTranslate;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-runtime-group={id}>
      <h3 id={id} className="type-caption text-kumo-subtle">{title}</h3>
      <ul className="divide-y divide-kumo-hairline rounded-lg border border-kumo-hairline">
        {rows.map(row => <RuntimeRow key={row.id} row={row} draft={draft} locked={locked} docsAvailable={docsAvailable} onEdit={onEdit} t={t} />)}
      </ul>
    </section>
  );
}

/** Shown only while a runtime has verified docs isolation; otherwise no runtime can take the docs use, so the default is not offered. */
function DefaultDocs({ draft, settings, locked, onEdit, t }: {
  readonly draft: AgentsDraft; readonly settings: AgentsSettingsV1; readonly locked: boolean;
  readonly onEdit: (change: (draft: AgentsDraft) => AgentsDraft) => void; readonly t: OperatorTranslate;
}) {
  const option = (value: string | null, label: ReactNode) => (
    <label key={value ?? ''} className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="radio" name="default-docs" value={value ?? ''} checked={draft.default_docs === value} disabled={locked}
        onChange={() => onEdit(current => setDefaultDocs(current, value))} className="accent-(--rh-accent)" />
      {label}
    </label>
  );
  const supported = new Set(settings.runtimes.entries.filter(entry => entry.docs_supported).map(entry => entry.id));
  const choices = draft.docs.filter(id => supported.has(id) || id === settings.config.default_docs);
  return (
    <fieldset className="flex flex-col gap-2" data-default-docs>
      <legend className="mb-2 text-sm font-semibold text-kumo-strong">{t('settings.defaultDocs.title')}</legend>
      {draft.docs.length === 0
        ? <p className="text-sm text-kumo-subtle">{t('settings.defaultDocs.empty')}</p>
        : <div className="flex flex-wrap gap-x-4 gap-y-2">
          {option(null, t('settings.defaultDocs.none'))}
          {choices.map(id => option(id, <span className="font-mono">{id}</span>))}
        </div>}
    </fieldset>
  );
}

function SaveResult({ form, changedElsewhere, t }: { readonly form: AgentsSettingsForm; readonly changedElsewhere: boolean; readonly t: OperatorTranslate }) {
  const { save } = form;
  const reload = <Banner.Action variant="secondary" onClick={form.reload}>{t('settings.reload')}</Banner.Action>;
  if (save.kind === 'refused' && save.error.code === 'reconcile_required') {
    return <Banner variant="alert" data-save-result="reconcile_required" title={t('settings.reconcile.title')} description={t('settings.reconcile.body')} action={reload} />;
  }
  if (save.kind === 'refused') {
    const text = refusalText(save.error, t);
    return (
      <Banner variant="error" data-save-result={save.error.code} title={`${t('settings.refused.title')} · ${save.error.code}`}
        description={<>{!text.localized && <span className="block text-xs">{t('settings.serverText')}</span>}
          <span className="block">{text.message}</span><span className="block">{text.next_action}</span></>}
        action={saveNeedsReload(save) ? reload : undefined} />
    );
  }
  if (save.kind === 'unreachable') return <Banner variant="error" data-save-result="unreachable" description={t('settings.unreachable')} />;
  if (save.kind === 'unreadable') return <Banner variant="alert" data-save-result="unreadable" description={t('settings.unreadable')} action={reload} />;
  if (changedElsewhere) return <Banner variant="alert" data-save-result="changed-elsewhere" description={t('settings.changedElsewhere')} action={reload} />;
  if (save.kind === 'saved') {
    return <p role="status" className="text-sm text-kumo-success" data-save-result="saved">{save.changed === 0 ? t('settings.savedNone') : t('settings.saved', { count: save.changed })}</p>;
  }
  return null;
}

function rowsOf(settings: AgentsSettingsV1): { readonly main: readonly Row[]; readonly extra: readonly Row[]; readonly missing: readonly Row[] } {
  const entries = settings.runtimes.entries;
  const listed = new Set(entries.map(entry => entry.id));
  return {
    main: entries.filter(entry => entry.group === 'default').map(entry => ({ id: entry.id, entry })),
    extra: entries.filter(entry => entry.group !== 'default').map(entry => ({ id: entry.id, entry })),
    missing: settings.config.enabled.filter(id => !listed.has(id)).map(id => ({ id, entry: null })),
  };
}

export function SettingsPage({ form, now, t }: { readonly form: AgentsSettingsForm; readonly now: number; readonly t: OperatorTranslate }) {
  const { view, draft, base } = form;
  const header = <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.settings')}</h1>;
  if (view.kind === 'loading') {
    return <div className="flex flex-col gap-5">{header}<Empty icon={<Loader />} title={t('settings.pending.title')} /></div>;
  }
  if (view.kind === 'unavailable') {
    return <div className="flex flex-col gap-5">{header}
      <Banner variant="error" data-settings-unavailable={view.reason} title={t('settings.failed.title')} description={t(`settings.reason.${view.reason}`)} />
    </div>;
  }
  const { settings } = view;
  const { runtimes } = settings;
  const locked = saveNeedsReload(form.save) || form.save.kind === 'saving';
  // During a save, a newer revision is most likely this page's own write.
  const changedElsewhere = base !== null && form.request !== null && form.save.kind !== 'saving' && settings.config.revision !== base.revision;
  const rows = rowsOf(settings);
  // The settings response is the one source: the docs use and default appear only while a runtime reports docs_supported.
  const docsAvailable = runtimes.entries.some(entry => entry.docs_supported);
  const stale = runtimes.status === 'stale' && runtimes.reason !== null && runtimes.collected_at !== null;
  return (
    <div className="flex flex-col gap-5">
      {header}
      <section aria-labelledby="settings-agents-heading" className="flex flex-col gap-4 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5">
        <SectionTitle id="settings-agents-heading">{t('settings.agents.title')}</SectionTitle>
        {/* The contract gives every runtime the same capabilities before a session opens, so they are stated once. */}
        {runtimes.entries[0] && (
          <p className="text-sm text-kumo-subtle" data-capabilities>
            {t(`settings.capability.stop.${runtimes.entries[0].capabilities.stop}`)}{' · '}{t(`settings.capability.steer.${runtimes.entries[0].capabilities.steer}`)}{' · '}{t(`settings.capability.withdraw.${runtimes.entries[0].capabilities.withdraw}`)}
          </p>
        )}
        {runtimes.status === 'unavailable' && runtimes.reason !== null && (
          <Banner variant={runtimes.reason === 'collection_pending' ? 'default' : 'error'} data-runtimes={runtimes.reason}
            description={t(`settings.runtimes.unavailable.${runtimes.reason}` as OperatorMessageKey)} />
        )}
        {stale && (
          <Banner variant="alert" data-runtimes="stale"
            description={t('settings.runtimes.stale', { age: ageWords(runtimes.collected_at!, now, t), reason: t(`settings.runtimes.reason.${runtimes.reason!}`) })} />
        )}
        {runtimes.status !== 'unavailable' && draft !== null && <>
          <RuntimeGroup id="settings-group-default" title={t('settings.group.default')} rows={rows.main} draft={draft} locked={locked} docsAvailable={docsAvailable} onEdit={form.edit} t={t} />
          <RuntimeGroup id="settings-group-extra" title={t('settings.group.extra')} rows={rows.extra} draft={draft} locked={locked} docsAvailable={docsAvailable} onEdit={form.edit} t={t} />
          <RuntimeGroup id="settings-group-missing" title={t('settings.group.missing')} rows={rows.missing} draft={draft} locked={locked} docsAvailable={docsAvailable} onEdit={form.edit} t={t} />
          {docsAvailable && <DefaultDocs draft={draft} settings={settings} locked={locked} onEdit={form.edit} t={t} />}
          {/* Next to Save, where the result of a save is read. */}
          <SaveResult form={form} changedElsewhere={changedElsewhere} t={t} />
          <div className="flex flex-wrap items-center gap-3 border-t border-kumo-hairline pt-4">
            <Button variant="primary" onClick={form.submit} disabled={form.request === null || locked} data-save>
              {form.save.kind === 'saving' ? t('settings.saving') : t('settings.save')}
            </Button>
            <Button variant="ghost" onClick={form.discard} disabled={form.request === null || locked}>{t('settings.discard')}</Button>
            {form.request !== null && !locked && <span className="text-sm text-kumo-subtle">{t('settings.unsaved')}</span>}
          </div>
        </>}
      </section>
    </div>
  );
}

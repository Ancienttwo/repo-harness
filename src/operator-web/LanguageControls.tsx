import { useMemo } from 'react';
import { Banner, cn } from '@cloudflare/kumo';
import { isOperatorMessageKey, type OperatorMessageKey, type OperatorTranslate } from './i18n';
import {
  DOCUMENTATION_LANGUAGES, REPORTING_PRESETS, useLanguageControl,
  type DocumentationLanguage, type DocumentationLanguageReader, type DocumentationLanguageWriter,
  type LanguageRead, type LanguageReader, type LanguageSave, type LanguageWriter, type ReportingHost, type ReportingPreset,
} from './language-settings';
import { WriteReloadBanner } from './operator-write';
import { CommandLine } from './ui';

type Option = ReportingPreset | DocumentationLanguage;

function Segmented<C extends Option>({ label, options, value, disabled, onChoose, t }: {
  readonly label: string; readonly options: readonly C[]; readonly value: string | null; readonly disabled: boolean;
  readonly onChoose: (choice: C) => void; readonly t: OperatorTranslate;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-md bg-kumo-recessed p-0.5">
      {options.map(option => (
        <button key={option} type="button" aria-pressed={value === option} disabled={disabled} data-language-option={option}
          onClick={() => onChoose(option)}
          className={cn('inline-flex h-7 items-center rounded px-2.5 text-xs',
            value === option ? 'bg-kumo-base font-medium text-kumo-strong shadow-xs' : 'text-kumo-default',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-kumo-tint')}>
          {t(`language.option.${option}`)}
        </button>
      ))}
    </div>
  );
}

/** A refusal is shown by code in the page language; a code this bundle does not know shows the server's sentence, marked as such. */
function Refusal({ save, t }: { readonly save: Extract<LanguageSave, { kind: 'refused' }>; readonly t: OperatorTranslate }) {
  const { error } = save;
  const message = `language.error.${error.code}.message`;
  const action = `language.error.${error.code}.action`;
  const known = isOperatorMessageKey(message);
  // The route names the exact command for a missing policy; any other action is fixed text.
  const next = error.code === 'policy_missing' ? <CommandLine command={error.next_action} t={t} />
    : <span className="block">{isOperatorMessageKey(action) ? t(action) : error.next_action}</span>;
  return (
    <Banner variant="error" data-save-result={error.code} title={`${t('settings.refused.title')} · ${error.code}`}
      description={<>{!known && <span className="block text-xs">{t('settings.serverText')}</span>}
        <span className="block">{known ? t(message) : error.message}</span>{next}</>} />
  );
}

function SaveResult({ save, t }: { readonly save: LanguageSave; readonly t: OperatorTranslate }) {
  switch (save.kind) {
    case 'saving': return <span className="text-xs text-kumo-subtle" data-save-result="saving">{t('language.saving')}</span>;
    case 'saved': return <span role="status" className="text-xs text-kumo-success" data-save-result="saved">{t('language.saved')}</span>;
    case 'refused': return <Refusal save={save} t={t} />;
    case 'reload_required': return <WriteReloadBanner t={t} />;
    case 'unreachable': return <Banner variant="error" data-save-result="unreachable" description={t('settings.unreachable')} />;
    case 'unreadable': return <Banner variant="alert" data-save-result="unreadable" description={t('settings.unreadable')} />;
    default: return null;
  }
}

/** A refused read (a missing policy, no adapter) shows like a refused save until the owner acts. */
function shownResult(control: { readonly read: LanguageRead<unknown> | null; readonly save: LanguageSave }): LanguageSave {
  return control.read?.state === 'refused' && control.save.kind === 'idle' ? { kind: 'refused', error: control.read.error } : control.save;
}

const hostStateKey = (state: string): OperatorMessageKey | null => {
  const key = `language.hostState.${state}`;
  return isOperatorMessageKey(key) ? key : null;
};
const presetKey = (preset: ReportingHost['preset']): OperatorMessageKey =>
  preset === null ? 'language.option.unknown' : `language.option.${preset}`;

function HostStates({ hosts, t }: { readonly hosts: readonly ReportingHost[]; readonly t: OperatorTranslate }) {
  return (
    <ul className="flex flex-col gap-1 text-xs text-kumo-subtle" data-language-hosts>
      {hosts.map(({ host, state, preset }) => {
        const stateKey = hostStateKey(state);
        return (
          <li key={host} data-language-host={host} data-language-host-state={state}>
            <span className="font-mono text-kumo-default">{host}</span> · {t(presetKey(preset))} · {stateKey ? t(stateKey) : state}
          </li>
        );
      })}
    </ul>
  );
}

/** The preset every host shares, or null when the hosts differ. A recorded `custom` stays the current value until the owner picks a preset. */
function sharedPreset(hosts: readonly ReportingHost[]): ReportingHost['preset'] | undefined {
  const first = hosts[0]?.preset;
  return hosts.length > 0 && hosts.every(host => host.preset === first) ? first : undefined;
}

export function ReportingLanguage({ headingId, read, write, generation, t }: {
  readonly headingId: string;
  readonly read: LanguageReader<readonly ReportingHost[]>; readonly write: LanguageWriter<ReportingPreset>;
  readonly generation: number; readonly t: OperatorTranslate;
}) {
  const control = useLanguageControl(read, write, generation);
  const hosts = control.read?.state === 'ok' ? control.read.value : null;
  const shared = hosts === null ? undefined : sharedPreset(hosts);
  const choice = shared === undefined || shared === 'custom' ? null : shared;
  return (
    <div className="flex flex-col gap-2" data-language-control="report">
      <div className="flex flex-wrap items-center gap-3">
        <span id={headingId} className="text-sm font-medium text-kumo-strong">{t('language.report.title')}</span>
        <Segmented label={t('language.report.title')} options={REPORTING_PRESETS} value={choice}
          disabled={hosts === null || control.save.kind === 'saving' || control.save.kind === 'reload_required'} onChoose={control.choose} t={t} />
        {shared === 'custom' && <span className="text-xs text-kumo-subtle" data-language-current="custom">{t('language.option.custom')}</span>}
        {control.read !== null && control.read.state !== 'ok' && <span className="text-xs text-kumo-subtle" data-language-read={control.read.state}>{t('language.readFailed')}</span>}
      </div>
      {/* Per-host state shows when the hosts differ, a preset is not one of the three, or a save was refused. */}
      {hosts !== null && (choice === null || control.save.kind === 'refused') && <HostStates hosts={hosts} t={t} />}
      <SaveResult save={shownResult(control)} t={t} />
    </div>
  );
}

/** One repository's control: a segmented choice, with the saved state and any refusal below it. */
export function DocumentationLanguageControl({ repositoryId, read, write, generation, t }: {
  readonly repositoryId: string; readonly read: DocumentationLanguageReader; readonly write: DocumentationLanguageWriter;
  readonly generation: number; readonly t: OperatorTranslate;
}) {
  const reader = useMemo(() => read(repositoryId), [read, repositoryId]);
  const writer = useMemo(() => write(repositoryId), [write, repositoryId]);
  const control = useLanguageControl(reader, writer, generation);
  const answer = control.read;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-language-control="documentation" data-repository-language={repositoryId}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-kumo-subtle">{t('language.docs.title')}</span>
        <Segmented label={t('language.docs.title')} options={DOCUMENTATION_LANGUAGES} value={answer?.state === 'ok' ? answer.value : null}
          disabled={answer?.state !== 'ok' || control.save.kind === 'saving' || control.save.kind === 'reload_required'} onChoose={control.choose} t={t} />
        {answer?.state === 'ok' && answer.value === null && <span className="text-xs text-kumo-subtle" data-language-current="unset">{t('language.option.unset')}</span>}
        {answer !== null && answer.state !== 'ok' && answer.state !== 'refused' && <span className="text-xs text-kumo-subtle" data-language-read={answer.state}>{t('language.readFailed')}</span>}
      </div>
      <SaveResult save={shownResult(control)} t={t} />
    </div>
  );
}

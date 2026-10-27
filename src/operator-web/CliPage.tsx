import { useCallback, useState } from 'react';
import { Banner, Empty, Loader } from '@cloudflare/kumo';
import { WarningCircleIcon } from '@phosphor-icons/react';
import { decodeCliInventory, type CliInventoryEntry, type CliInventorySnapshotV1 } from '../core/setup/cli-inventory';
import type { OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { CommandLine, ExternalLink } from './ui';
import { useObservationRefresh } from './useObservationRefresh';

export type CliInventoryReader = (signal: AbortSignal) => Promise<CliInventorySnapshotV1>;

/** Reads the background collector cache. Requests never start a probe. */
export async function fetchCliInventory(signal: AbortSignal): Promise<CliInventorySnapshotV1> {
  const response = await fetch('/api/v1/cli-inventory', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('cli_inventory_unavailable');
  return decodeCliInventory(await response.json());
}

interface CliView {
  readonly snapshot: CliInventorySnapshotV1 | null;
  readonly failed: boolean;
}

export function useCliInventory(read: CliInventoryReader, initial: CliInventorySnapshotV1 | undefined, generation: number, enabled: boolean): CliView {
  const [view, setView] = useState<CliView>({ snapshot: initial ?? null, failed: false });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const snapshot = await read(signal);
      if (signal.aborted) return false;
      setView({ snapshot, failed: false });
      return true;
    } catch {
      if (signal.aborted) return false;
      setView(current => ({ ...current, failed: true }));
      return false;
    }
  }, [read]);
  useObservationRefresh(observe, JSON.stringify(['cli-inventory', generation]), { enabled, immediate: initial === undefined || generation > 0 });
  return view;
}

function CliRow({ entry, now, t }: { readonly entry: CliInventoryEntry; readonly now: number; readonly t: OperatorTranslate }) {
  const github = entry.github;
  return <li data-cli-entry={entry.id} className="flex min-w-0 flex-col gap-2 py-4">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="break-all font-mono text-sm font-semibold text-kumo-strong">{entry.commands.join(', ')}</h2>
      <span className="text-xs text-kumo-subtle">{entry.source} · {entry.package ?? t('cli.noPackage')} · {entry.version ?? t('setup.unknown')}</span>
      {entry.deprecated && <span className="text-xs text-kumo-danger">{t('cli.deprecated')}</span>}
      {github?.archived && <span className="text-xs text-kumo-danger">{t('cli.archived')}</span>}
      {github?.moved && <span className="text-xs text-kumo-warning">{t('cli.moved')}</span>}
    </div>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-kumo-subtle">{t('cli.location')}</dt><dd className="break-all font-mono">{entry.location}</dd>
      <dt className="text-kumo-subtle">{t('cli.size')}</dt><dd>{entry.size_bytes === null ? t('setup.unknown') : t('cli.bytes', { count: entry.size_bytes })}</dd>
      <dt className="text-kumo-subtle">{t('cli.lastUsed')}</dt><dd>{entry.last_used_at === null ? t('cli.noUse') : <time dateTime={entry.last_used_at} title={entry.last_used_at}>{ageWords(entry.last_used_at, now, t)}</time>}</dd>
      <dt className="text-kumo-subtle">{t('cli.usage')}</dt><dd data-cli-unused={String(entry.unused)} className={entry.unused === true ? 'text-kumo-warning' : undefined}>
        {t(entry.unused === null ? 'cli.usageUnknown' : entry.unused ? 'cli.unused' : 'cli.used')}
      </dd>
    </dl>
    {github && <div className="flex flex-wrap gap-2 text-xs">
      {github.repo ? <>
        <ExternalLink href={`https://github.com/${github.repo}`}>{github.repo}</ExternalLink>
        <span>{github.stars === null ? t('cli.starsUnknown') : t('cli.stars', { count: github.stars })}</span>
        {github.monorepo && <span className="text-kumo-subtle">{t('cli.monorepo')}</span>}
      </> : <>
        <span className="text-kumo-subtle">{t('cli.candidates')}</span>
        {github.candidates.map(repo => <ExternalLink key={repo} href={`https://github.com/${repo}`}>{repo}</ExternalLink>)}
      </>}
    </div>}
    <details className="text-xs" data-cli-removal>
      <summary className="w-fit cursor-pointer py-1 text-kumo-link">{t('cli.uninstall')}</summary>
      {entry.uninstall === null ? <p className="text-kumo-subtle">{t('cli.noUninstall')}</p> : <div className="flex max-w-full flex-col gap-2 pt-2">
        {entry.uninstall.steps.map((command, index) => <CommandLine key={index} command={command} t={t} />)}
        {entry.uninstall.config && <div data-cli-config className="flex flex-col gap-1">
          <p className="text-kumo-subtle">{t('cli.config')}</p>
          <CommandLine command={entry.uninstall.config} t={t} />
        </div>}
      </div>}
    </details>
  </li>;
}

export function CliPage({ view, now, t }: { readonly view: CliView; readonly now: number; readonly t: OperatorTranslate }) {
  const { snapshot, failed } = view;
  const hasData = snapshot !== null && snapshot.status !== 'unavailable';
  const pending = !failed && (snapshot === null || snapshot.reason === 'collection_pending');
  const state = hasData ? failed ? 'refresh-failed' : snapshot.status : pending ? 'pending' : 'failed';
  return <div className="flex min-w-0 flex-col gap-5" data-cli-page data-cli-state={state}>
    <header className="border-b border-kumo-hairline pb-4">
      <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.cli')}</h1>
      <p className="mt-1 text-xs text-kumo-subtle">{t('cli.scope')}</p>
    </header>
    {!hasData && (pending
      ? <Empty size="sm" icon={<Loader size={24} />} title={t('cli.pending')} />
      : <Empty size="sm" icon={<WarningCircleIcon size={32} />} title={t('cli.failed')} />)}
    {hasData && <>
      {(failed || snapshot.status === 'stale') && <Banner variant="alert" title={t('cli.stale')} />}
      {snapshot.collected_at && <p className="text-xs text-kumo-subtle">{t('cli.collected', { age: ageWords(snapshot.collected_at, now, t) })}</p>}
      {snapshot.entries.length === 0 ? <Empty size="sm" title={t('cli.empty')} /> : (
        <ul className="min-w-0 divide-y divide-kumo-hairline rounded-xl border border-kumo-line bg-kumo-base px-4 sm:px-5">
          {snapshot.entries.map(entry => <CliRow key={entry.id} entry={entry} now={now} t={t} />)}
        </ul>
      )}
    </>}
  </div>;
}

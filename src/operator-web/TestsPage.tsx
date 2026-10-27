import { Loader } from '@cloudflare/kumo';
import {
  testRunCommand,
  type TestFileResultV1,
  type TestCaseV1,
  type TestsSnapshotV1,
} from '../core/operator/tests';
import type { OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { useTestsSnapshot, type TestsRead, type TestsReader } from './repository-reads';
import { Age, CommandLine, SectionTitle, StatusDot, type DotTone } from './ui';

export interface TestsPageProps {
  /** The repository the page reads; the page names itself when none is selected. */
  readonly repositoryId: string | null;
  readonly readTests: TestsReader;
  readonly generation: number;
  readonly now: number;
  readonly t: OperatorTranslate;
}

/** One file's rollup. A file with no JUnit entry is `none` and never renders as a pass. */
type FileRollup =
  | { readonly kind: 'passed'; readonly passed: number; readonly skipped: number; readonly duration_ms: number }
  | { readonly kind: 'failed'; readonly passed: number; readonly skipped: number; readonly duration_ms: number; readonly failed: readonly TestCaseV1[] }
  | { readonly kind: 'skipped'; readonly count: number; readonly duration_ms: number }
  | { readonly kind: 'none' };

function fileRollup(file: string, results: ReadonlyMap<string, TestFileResultV1>): FileRollup {
  const entry = results.get(file);
  if (!entry || entry.cases.length === 0) return { kind: 'none' };
  const failed = entry.cases.filter(entry => entry.result === 'failed');
  const skipped = entry.cases.filter(entry => entry.result === 'skipped').length;
  if (failed.length > 0) {
    return {
      kind: 'failed',
      passed: entry.cases.length - failed.length - skipped,
      skipped, duration_ms: entry.duration_ms, failed,
    };
  }
  return skipped === entry.cases.length
    ? { kind: 'skipped', count: skipped, duration_ms: entry.duration_ms }
    : { kind: 'passed', passed: entry.cases.length - skipped, skipped, duration_ms: entry.duration_ms };
}

const ROLLUP_TONE: Readonly<Record<FileRollup['kind'], DotTone>> = { passed: 'ok', failed: 'danger', skipped: 'warn', none: 'unknown' };

interface FileRow {
  readonly file: string;
  readonly capabilities: readonly string[];
  readonly command: string;
  readonly rollup: FileRollup;
}

/** `tests/<dir>` groups the inventory the way the tree is laid out; root files group as `tests`. */
function directoryOf(file: string): string {
  const rest = file.replace(/^tests\//u, '');
  const slash = rest.indexOf('/');
  return slash === -1 ? 'tests' : `tests/${rest.slice(0, slash)}`;
}

/** The projection is the inventory; result files outside it still show, with their own command. */
function fileRows(snapshot: TestsSnapshotV1): readonly FileRow[] {
  const projection = snapshot.projection.state === 'ok' ? snapshot.projection.files : [];
  const results = snapshot.results.state === 'ok' ? snapshot.results.files : [];
  const map = new Map<string, TestFileResultV1>(results.map(row => [row.file, row]));
  const rows = new Map<string, FileRow>();
  for (const entry of projection) {
    rows.set(entry.file, { file: entry.file, capabilities: entry.capabilities.map(link => link.id), command: entry.command, rollup: fileRollup(entry.file, map) });
  }
  for (const entry of results) {
    if (!rows.has(entry.file)) {
      rows.set(entry.file, { file: entry.file, capabilities: [], command: testRunCommand(entry.file), rollup: fileRollup(entry.file, map) });
    }
  }
  return [...rows.values()].sort((left, right) => left.file.localeCompare(right.file));
}

function Counts({ rollup, t }: { readonly rollup: FileRollup; readonly t: OperatorTranslate }) {
  if (rollup.kind === 'none') return null;
  return (
    <span className="flex flex-wrap justify-end gap-x-2 text-xs tabular-nums text-kumo-subtle" data-test-count={rollup.kind}>
      {rollup.kind === 'failed' && <span className="text-kumo-danger">{t('tests.count.failed', { count: rollup.failed.length })}</span>}
      {rollup.kind === 'skipped'
        ? <span>{t('tests.count.skipped', { count: rollup.count })}</span>
        : <>
          {rollup.passed > 0 && <span>{t('tests.count.passed', { count: rollup.passed })}</span>}
          {rollup.skipped > 0 && <span>{t('tests.count.skipped', { count: rollup.skipped })}</span>}
        </>}
      <span>{rollup.duration_ms} ms</span>
    </span>
  );
}

function FileRowView({ row, t }: { readonly row: FileRow; readonly t: OperatorTranslate }) {
  return (
    <li data-test-file={row.file} data-test-result={row.rollup.kind}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2.5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)]">
        <StatusDot tone={ROLLUP_TONE[row.rollup.kind]} className="translate-y-0.5" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-mono text-sm text-kumo-strong">{row.file}</span>
          {row.capabilities.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {row.capabilities.map(id => <span key={id} className="rounded bg-kumo-recessed px-1 font-mono text-xs text-kumo-subtle" data-capability={id}>{id}</span>)}
            </span>
          )}
          {row.rollup.kind === 'failed' && (
            <ul className="flex flex-col gap-0.5" data-test-failures>
              {row.rollup.failed.map(entry => (
                <li key={`${entry.suite ?? ''}>${entry.name}`} className="min-w-0 truncate font-mono text-xs text-kumo-danger">
                  {entry.suite ? `${entry.suite} > ${entry.name}` : entry.name}
                </li>
              ))}
            </ul>
          )}
          {row.rollup.kind === 'none' && <span className="text-xs text-kumo-subtle">{t('tests.file.noResult')}</span>}
        </span>
        <Counts rollup={row.rollup} t={t} />
      </div>
      <CommandLine command={row.command} t={t} className="mx-3 mb-2.5 w-auto max-w-[560px]" />
    </li>
  );
}

function DirectoryGroup({ directory, rows, t }: { readonly directory: string; readonly rows: readonly FileRow[]; readonly t: OperatorTranslate }) {
  return (
    <section aria-label={directory} className="flex min-w-0 flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5" data-test-directory={directory}>
      <SectionTitle count={rows.length}><span className="font-mono">{directory}</span></SectionTitle>
      <ul className="flex flex-col divide-y divide-kumo-hairline">
        {rows.map(row => <FileRowView key={row.file} row={row} t={t} />)}
      </ul>
    </section>
  );
}

/** Why a whole section of the snapshot has nothing to show. */
type SectionReason = 'projection_missing' | 'projection_invalid' | 'junit_missing' | 'junit_invalid';

function SectionNotice({ reason, t }: { readonly reason: SectionReason; readonly t: OperatorTranslate }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-kumo-warning" data-tests-section-reason={reason}>
      <StatusDot tone="warn" />{t(`tests.section.reason.${reason}`)}
    </p>
  );
}

function RunLine({ snapshot, now, t }: { readonly snapshot: TestsSnapshotV1; readonly now: number; readonly t: OperatorTranslate }) {
  const { run } = snapshot;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" data-tests-run={run.id}>
      <span className="font-semibold text-kumo-strong">{t('tests.run.heading')}</span>
      <span className="font-mono text-xs text-kumo-subtle">#{run.id}</span>
      {run.attempt > 1 && <span className="text-xs text-kumo-subtle">{t('tests.run.attempt', { count: run.attempt })}</span>}
      <span className="font-mono text-xs text-kumo-subtle">{run.head_sha.slice(0, 7)}</span>
      <span className="font-mono text-xs text-kumo-subtle" data-tests-channel={run.channel}>{run.channel}</span>
      {run.conclusion !== null && run.conclusion !== 'success' && <span className="font-mono text-xs text-kumo-warning">{run.conclusion}</span>}
      <span className="text-xs text-kumo-subtle"><Age at={run.created_at} now={now} t={t} bare /></span>
      <span className="text-xs text-kumo-subtle" data-tests-collected>{t('status.observedAgo', { age: ageWords(snapshot.collected_at, now, t) })}</span>
    </div>
  );
}

function TestsBody({ snapshot, now, t }: { readonly snapshot: TestsSnapshotV1; readonly now: number; readonly t: OperatorTranslate }) {
  const rows = fileRows(snapshot);
  const counts = { passed: 0, failed: 0, noResult: 0 };
  for (const row of rows) {
    if (row.rollup.kind === 'passed') counts.passed += 1;
    else if (row.rollup.kind === 'failed') counts.failed += 1;
    else counts.noResult += 1;
  }
  const groups = new Map<string, FileRow[]>();
  for (const row of rows) {
    const directory = directoryOf(row.file);
    const list = groups.get(directory) ?? [];
    list.push(row);
    groups.set(directory, list);
  }
  return (
    <>
      <RunLine snapshot={snapshot} now={now} t={t} />
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-kumo-default" data-tests-summary>
        <span className="flex items-center gap-1.5"><StatusDot tone="ok" />{t('tests.count.passed', { count: counts.passed })}</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="danger" />{t('tests.count.failed', { count: counts.failed })}</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="unknown" />{t('tests.count.noResult', { count: counts.noResult })}</span>
      </p>
      {snapshot.projection.state === 'unavailable' && <SectionNotice reason={snapshot.projection.reason} t={t} />}
      {snapshot.results.state === 'unavailable' && <SectionNotice reason={snapshot.results.reason} t={t} />}
      {[...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([directory, list]) => (
        <DirectoryGroup key={directory} directory={directory} rows={list} t={t} />
      ))}
    </>
  );
}

/** Why the whole page has nothing to show. A waiting reason warns; a broken one fails. */
const WAITING_REASONS: readonly string[] = ['tests_pending', 'registry_unavailable', 'repository_not_found', 'default_branch_unknown', 'no_daily_run', 'artifacts_missing', 'artifacts_expired'];

function TestsRefusal({ read, t }: { readonly read: Extract<TestsRead, { readonly state: 'unavailable' }>; readonly t: OperatorTranslate }) {
  const waiting = WAITING_REASONS.includes(read.reason);
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5" data-tests-unavailable={read.reason}>
      <p className="flex items-center gap-2 text-sm text-kumo-default">
        <StatusDot tone={waiting ? 'warn' : 'danger'} />{t(`tests.reason.${read.reason}`)}
      </p>
    </section>
  );
}

/**
 * The read-only tests page: one repository's test inventory with its
 * test-to-capability projection and the latest daily run's per-case results
 * (G20, G21). The page copies commands; it never runs a test, and a file with
 * no result never renders as a pass.
 */
export function TestsPage({ repositoryId, readTests, generation, now, t }: TestsPageProps) {
  const read = useTestsSnapshot(readTests, repositoryId, generation, repositoryId !== null);
  return (
    <div className="flex min-w-0 flex-col gap-5" data-tests-page>
      <header className="flex flex-col gap-1 border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.tests')}</h1>
        <p className="text-sm text-kumo-subtle">{t('tests.boundary')}</p>
      </header>
      {repositoryId === null ? <p role="status" className="text-sm text-kumo-subtle">{t('repository.select')}</p>
        : read === null ? <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle" data-tests-loading><Loader size={12} />{t('tests.loading')}</p>
        : read.state === 'unavailable' ? <TestsRefusal read={read} t={t} />
        : <TestsBody snapshot={read.snapshot} now={now} t={t} />}
    </div>
  );
}

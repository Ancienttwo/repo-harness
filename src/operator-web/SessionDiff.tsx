import { cn } from '@cloudflare/kumo';
import type { DocSessionChangeStatus, OperatorDocSessionDiffV1 } from '../core/operator/doc-session-changes';
import { DocsMarkdown } from './DocsMarkdown';
import type { OperatorTranslate } from './i18n';
import type { ThemeMode } from './theme';
import type { WorkspaceLocation } from './workspace-location';

export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed';
  readonly text: string;
  readonly old: number | null;
  readonly new: number | null;
}

export interface DiffHunk {
  /** First line of the range on each side; for an empty range, the line after the insertion point. */
  readonly oldFirst: number;
  readonly newFirst: number;
  /** Unchanged lines between the previous hunk, or the file start, and this hunk. */
  readonly unchangedBefore: number;
  readonly lines: readonly DiffLine[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const GIT_HEADER = 'diff --git a/';

/** `a/X b/X` with the same X on both sides, so a path with spaces still splits. */
function headerPath(line: string): string | null {
  const rest = line.slice(GIT_HEADER.length);
  const length = (rest.length - 3) / 2;
  if (!Number.isInteger(length) || length < 1) return null;
  const path = rest.slice(0, length);
  return rest.slice(length) === ` b/${path}` ? path : null;
}

// Git ends a ---/+++ name that holds a space with a tab.
const sidePath = (line: string, prefix: string): string | null => line.startsWith(prefix) ? line.slice(prefix.length).replace(/\t$/u, '') : null;

/**
 * Splits a unified git patch into files and hunks. Each hunk consumes exactly
 * the line counts of its header, so a content line that looks like a header
 * stays content. Only the hunk headers give unchanged-line counts; the patch
 * does not carry the file length, so nothing after the last hunk is counted.
 */
export function parseSessionPatch(patch: string): ReadonlyMap<string, readonly DiffHunk[]> {
  const files = new Map<string, DiffHunk[]>();
  const lines = patch.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.startsWith(GIT_HEADER)) { index += 1; continue; }
    let path = headerPath(line);
    let minus: string | null = null;
    index += 1;
    while (index < lines.length && !lines[index]!.startsWith('@@') && !lines[index]!.startsWith(GIT_HEADER)) {
      const header = lines[index]!;
      minus = sidePath(header, '--- a/') ?? minus;
      const plus = sidePath(header, '+++ b/');
      path = plus ?? (header === '+++ /dev/null' ? minus : null) ?? path;
      index += 1;
    }
    const hunks: DiffHunk[] = [];
    let oldEnd = 1;
    while (index < lines.length && lines[index]!.startsWith('@@')) {
      const match = HUNK.exec(lines[index]!);
      if (match === null) break;
      index += 1;
      const [oldStart, oldCount, newStart, newCount] = [match[1], match[2] ?? '1', match[3], match[4] ?? '1'].map(Number) as [number, number, number, number];
      const oldFirst = oldCount === 0 ? oldStart + 1 : oldStart;
      const newFirst = newCount === 0 ? newStart + 1 : newStart;
      const body: DiffLine[] = [];
      let oldLeft = oldCount, newLeft = newCount, oldLine = oldFirst, newLine = newFirst;
      while (index < lines.length && (oldLeft > 0 || newLeft > 0 || lines[index]!.startsWith('\\'))) {
        const text = lines[index]!;
        index += 1;
        if (text.startsWith('\\')) continue;
        if (text.startsWith('+')) { body.push({ kind: 'added', text: text.slice(1), old: null, new: newLine++ }); newLeft -= 1; }
        else if (text.startsWith('-')) { body.push({ kind: 'removed', text: text.slice(1), old: oldLine++, new: null }); oldLeft -= 1; }
        else { body.push({ kind: 'context', text: text.slice(1), old: oldLine++, new: newLine++ }); oldLeft -= 1; newLeft -= 1; }
      }
      hunks.push({ oldFirst, newFirst, unchangedBefore: Math.max(0, oldFirst - oldEnd), lines: body });
      oldEnd = oldFirst + oldCount;
    }
    if (path !== null) files.set(path, hunks);
  }
  return files;
}

export type SessionDiffMode = 'diff' | 'reading';

const STATUS_TONE: Readonly<Record<DocSessionChangeStatus, string>> = {
  added: 'text-kumo-success', modified: 'text-kumo-warning', deleted: 'text-kumo-danger', type_changed: 'text-kumo-warning',
};
const MARKDOWN = /\.(?:md|markdown)$/iu;

function Unchanged({ count, t }: { readonly count: number; readonly t: OperatorTranslate }) {
  return count > 0
    ? <p className="type-caption border-y border-kumo-hairline bg-kumo-recessed px-3 py-1 text-kumo-subtle" data-unchanged={count}>{t('docSession.diff.unchanged', { count })}</p>
    : null;
}

const ROW: Readonly<Record<DiffLine['kind'], string>> = { context: '', added: 'bg-kumo-success-tint', removed: 'bg-kumo-danger-tint' };
const MARK: Readonly<Record<DiffLine['kind'], string>> = { context: ' ', added: '+', removed: '-' };

function HunkLines({ hunk }: { readonly hunk: DiffHunk }) {
  return (
    <table className="w-full border-collapse font-mono text-[12.5px] leading-5" data-hunk={`${hunk.oldFirst},${hunk.newFirst}`}>
      <tbody>
        {hunk.lines.map((line, index) => (
          <tr key={index} className={ROW[line.kind]} data-line-kind={line.kind}>
            <td className="w-10 select-none px-2 text-right align-top text-kumo-subtle tabular-nums">{line.old ?? ''}</td>
            <td className="w-10 select-none px-2 text-right align-top text-kumo-subtle tabular-nums">{line.new ?? ''}</td>
            <td className="w-4 select-none align-top text-kumo-subtle" aria-hidden="true">{MARK[line.kind]}</td>
            <td className="whitespace-pre-wrap pr-3 [overflow-wrap:anywhere]">{line.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The new side of one hunk. Leading blank lines keep the markdown line gutter on the file's own line numbers. */
function HunkReading({ hunk, path, mode, onOpen, t }: {
  readonly hunk: DiffHunk; readonly path: string; readonly mode: ThemeMode; readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const text = hunk.lines.filter(line => line.kind !== 'removed').map(line => line.text).join('\n');
  if (!MARKDOWN.test(path)) return <pre className="whitespace-pre-wrap px-3 py-2 font-mono text-[12.5px] leading-5 [overflow-wrap:anywhere]" data-hunk-reading>{text}</pre>;
  return <div className="py-3 pr-3 pl-12" data-hunk-reading><DocsMarkdown text={`${'\n'.repeat(hunk.newFirst - 1)}${text}`} path={path} mode={mode} onOpen={onOpen} t={t} /></div>;
}

/**
 * The session's changes against its base (`4-DSES-P1`): only changed hunks,
 * with the unchanged line count between them. Reading mode shows the new side
 * of each hunk; markdown renders through the docs renderer.
 */
export function SessionDiff({ diff, view, mode, onOpen, t }: {
  readonly diff: OperatorDocSessionDiffV1; readonly view: SessionDiffMode; readonly mode: ThemeMode;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  if (diff.files.length === 0) return <p className="text-sm text-kumo-subtle" data-diff-empty>{t('docSession.diff.empty')}</p>;
  const hunks = parseSessionPatch(diff.patch);
  return (
    <div className="flex flex-col gap-4" data-session-diff={view}>
      <ul className="flex flex-col gap-1 text-sm" data-diff-files>
        {diff.files.map(file => (
          <li key={file.path} className="flex min-w-0 items-baseline gap-2" data-diff-file={file.path} data-diff-status={file.status}>
            <span className={cn('shrink-0 text-xs font-medium', STATUS_TONE[file.status])}>{t(`docSession.change.${file.status}`)}</span>
            <code className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{file.path}</code>
            {!file.tracked && <span className="shrink-0 text-xs text-kumo-subtle">{t('docSession.diff.untracked')}</span>}
          </li>
        ))}
      </ul>
      {diff.files.map(file => {
        const fileHunks = hunks.get(file.path) ?? [];
        return (
          <section key={file.path} className="overflow-hidden rounded-lg border border-kumo-line bg-kumo-base" data-diff-section={file.path}>
            <h3 className="border-b border-kumo-hairline bg-kumo-recessed px-3 py-2 font-mono text-xs text-kumo-strong [overflow-wrap:anywhere]">{file.path}</h3>
            {file.binary ? <p className="px-3 py-2 text-sm text-kumo-subtle" data-diff-binary>{t('docSession.diff.binary')}</p>
              : view === 'reading' && file.status === 'deleted' ? <p className="px-3 py-2 text-sm text-kumo-subtle" data-diff-deleted>{t('docSession.diff.deleted')}</p>
                : fileHunks.length === 0 ? <p className="px-3 py-2 text-sm text-kumo-subtle" data-diff-no-text>{t('docSession.diff.noText')}</p>
                  : fileHunks.map(hunk => (
                    <div key={`${hunk.oldFirst},${hunk.newFirst}`}>
                      <Unchanged count={hunk.unchangedBefore} t={t} />
                      {view === 'diff' ? <HunkLines hunk={hunk} /> : <HunkReading hunk={hunk} path={file.path} mode={mode} onOpen={onOpen} t={t} />}
                    </div>
                  ))}
          </section>
        );
      })}
    </div>
  );
}

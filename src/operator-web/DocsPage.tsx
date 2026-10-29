import { useState } from 'react';
import { Loader, cn } from '@cloudflare/kumo';
import { CaretRightIcon, FileTextIcon } from '@phosphor-icons/react';
import type { DocsFileV1, DocsTreeV1 } from '../core/operator/docs';
import { DocsMarkdown, type MermaidRenderer } from './DocsMarkdown';
import type { OperatorTranslate } from './i18n';
import { ageWords } from './labels';
import { useDocsFile, useDocsTree, type DocsFileReader, type DocsReason, type DocsTreeReader } from './repository-reads';
import type { DocSessionCreateWriter, DocSessions } from './doc-sessions';
import type { AgentsSettingsReader } from './settings';
import type { ThemeMode } from './theme';
import { PageLink, StatusDot } from './ui';
import type { WorkspaceLocation } from './workspace-location';

export interface DocsPageProps {
  /** The repository the page reads; the page names itself when none is selected. */
  readonly repositoryId: string | null;
  /** The repository-relative path in `#docs/<path>`, or null for the tree alone. */
  readonly path: string | null;
  readonly readTree: DocsTreeReader;
  readonly readFile: DocsFileReader;
  readonly generation: number;
  readonly mode: ThemeMode;
  readonly now: number;
  readonly onOpen: (next: WorkspaceLocation) => void;
  readonly renderMermaid?: MermaidRenderer;
  /** The doc session list; citing and starting a session show only when it lists `docs`. */
  readonly docSessions?: DocSessions;
  readonly readAgentsSettings?: AgentsSettingsReader;
  readonly createDocSession?: DocSessionCreateWriter;
  readonly t: OperatorTranslate;
}

interface Directory {
  readonly path: string;
  readonly name: string;
  readonly directories: Map<string, Directory>;
  readonly files: string[];
  count: number;
}

/** Nests the flat listing under `docs`; each directory counts every file below it. */
function directoryTree(tree: DocsTreeV1): Directory {
  const root: Directory = { path: 'docs', name: 'docs', directories: new Map(), files: [], count: 0 };
  for (const { path } of tree.files) {
    const parts = path.split('/');
    let directory = root;
    directory.count += 1;
    for (let index = 1; index < parts.length - 1; index += 1) {
      const name = parts[index]!;
      let next = directory.directories.get(name);
      if (next === undefined) {
        next = { path: parts.slice(0, index + 1).join('/'), name, directories: new Map(), files: [], count: 0 };
        directory.directories.set(name, next);
      }
      next.count += 1;
      directory = next;
    }
    directory.files.push(path);
  }
  return root;
}

const byName = (left: string, right: string) => left.localeCompare(right);
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
/** `refs/remotes/origin/main` reads as `origin/main`. */
const refName = (ref: string) => ref.replace(/^refs\/(?:remotes|heads)\//u, '');

function DirectoryRows({ directory, depth, selected, toggled, onToggle, onOpen }: {
  readonly directory: Directory; readonly depth: number; readonly selected: string | null;
  readonly toggled: Readonly<Record<string, boolean>>; readonly onToggle: (path: string, open: boolean) => void;
  readonly onOpen: (next: WorkspaceLocation) => void;
}) {
  const indent = { paddingInlineStart: `${0.5 + depth * 0.875}rem` };
  return (
    <>
      {[...directory.directories.values()].sort((left, right) => byName(left.name, right.name)).map(child => {
        // A directory opens by hand, or because the open file is inside it.
        const open = toggled[child.path] ?? (selected?.startsWith(`${child.path}/`) ?? false);
        return (
          <li key={child.path} data-docs-directory={child.path}>
            <button type="button" aria-expanded={open} onClick={() => onToggle(child.path, !open)} style={indent}
              className="docs-tree__row w-full cursor-pointer text-kumo-strong">
              <CaretRightIcon size={12} aria-hidden="true" className={cn('shrink-0 text-kumo-subtle transition-transform', open && 'rotate-90')} />
              <span className="min-w-0 flex-1 truncate">{child.name}</span>
              <span className="docs-tree__count" data-docs-count>{child.count}</span>
            </button>
            {open && (
              <ul>
                <DirectoryRows directory={child} depth={depth + 1} selected={selected} toggled={toggled} onToggle={onToggle} onOpen={onOpen} />
              </ul>
            )}
          </li>
        );
      })}
      {[...directory.files].sort(byName).map(path => (
        <li key={path}>
          <PageLink to={{ workspace: 'docs', module: null, item: path }} onOpen={onOpen} data-docs-file={path} title={path}
            aria-current={path === selected ? 'page' : undefined} style={{ paddingInlineStart: `${1.25 + depth * 0.875}rem` }}
            className={cn('docs-tree__row', path === selected ? 'bg-kumo-tint font-medium text-kumo-strong' : 'text-kumo-default')}>
            <span className="min-w-0 flex-1 truncate">{fileName(path)}</span>
          </PageLink>
        </li>
      ))}
    </>
  );
}

function DocsTree({ tree, selected, now, onOpen, t }: {
  readonly tree: DocsTreeV1; readonly selected: string | null; readonly now: number;
  readonly onOpen: (next: WorkspaceLocation) => void; readonly t: OperatorTranslate;
}) {
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});
  const root = directoryTree(tree);
  return (
    <nav aria-label={t('docs.tree')} className="docs-tree" data-docs-tree={tree.files.length}>
      <div className="flex flex-col gap-0.5 border-b border-kumo-hairline px-3 py-2.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-kumo-strong">docs/</span>
          <span className="text-xs tabular-nums text-kumo-subtle">{t('docs.tree.count', { count: tree.files.length })}</span>
        </span>
        <span className="truncate font-mono text-xs text-kumo-subtle" title={tree.commit}>{refName(tree.ref)} @ {tree.commit.slice(0, 7)}</span>
        <span className="text-xs text-kumo-subtle">{t('docs.tree.read', { age: ageWords(tree.collected_at, now, t) })}</span>
      </div>
      {tree.files.length === 0
        ? <p className="px-3 py-3 text-sm text-kumo-subtle">{t('docs.tree.empty')}</p>
        : <ul className="docs-tree__list">
          <DirectoryRows directory={root} depth={0} selected={selected} toggled={toggled}
            onToggle={(path, open) => setToggled(current => ({ ...current, [path]: open }))} onOpen={onOpen} />
        </ul>}
    </nav>
  );
}

/** A refusal shows the route's reason and nothing of the file (1-DOCS-F1). */
function Refusal({ reason, t }: { readonly reason: DocsReason; readonly t: OperatorTranslate }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-kumo-line bg-kumo-base p-4 text-sm text-kumo-default" role="alert" data-docs-refusal={reason}>
      <StatusDot tone={reason === 'docs_pending' || reason === 'docs_busy' ? 'warn' : 'danger'} className="mt-1.5" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{t(`docs.reason.${reason}`)}</span>
        <code className="text-xs text-kumo-subtle">{reason}</code>
      </span>
    </p>
  );
}

const MARKDOWN = /\.(?:md|markdown)$/iu;

/** A non-markdown text file shows its numbered lines as they are. */
function SourceLines({ file }: { readonly file: DocsFileV1 }) {
  return (
    <ol className="docs-source" data-docs-source>
      {file.lines.map(line => (
        <li key={line.number} data-line={line.number}>{line.text.replace(/\r?\n$/u, '')}</li>
      ))}
    </ol>
  );
}

function FileView({ file, mode, onOpen, renderMermaid, t }: {
  readonly file: DocsFileV1; readonly mode: ThemeMode; readonly onOpen: (next: WorkspaceLocation) => void;
  readonly renderMermaid?: MermaidRenderer; readonly t: OperatorTranslate;
}) {
  return (
    <>
      <header className="flex flex-col gap-1.5 border-b border-kumo-hairline pb-3" data-docs-file-header>
        <h2 className="font-mono text-sm font-semibold text-kumo-strong [overflow-wrap:anywhere]">{file.path}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-kumo-subtle">
          <span title={file.commit} data-docs-commit={file.commit}>{refName(file.ref)} @ {file.commit.slice(0, 7)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={file.committed_at} title={file.committed_at} data-docs-committed>{file.committed_at.slice(0, 10)}</time>
          <span aria-hidden="true">·</span>
          <span data-docs-lines={file.lines.length}>{t('docs.lines', { count: file.lines.length })}</span>
          {file.worktree_differs && (
            <span className="operator-badge bg-kumo-warning-tint font-sans text-kumo-default" title={t('docs.dirty.title')} data-docs-dirty>
              <StatusDot tone="warn" />{t('docs.dirty')}
            </span>
          )}
        </p>
      </header>
      {MARKDOWN.test(file.path)
        ? <DocsMarkdown text={file.text} path={file.path} mode={mode} onOpen={onOpen} renderMermaid={renderMermaid} t={t} />
        : <SourceLines file={file} />}
    </>
  );
}

function Reader({ repositoryId, path, commit, readFile, generation, mode, onOpen, renderMermaid, t }: {
  readonly repositoryId: string; readonly path: string; readonly commit: string; readonly readFile: DocsFileReader;
  readonly generation: number; readonly mode: ThemeMode; readonly onOpen: (next: WorkspaceLocation) => void;
  readonly renderMermaid?: MermaidRenderer; readonly t: OperatorTranslate;
}) {
  const read = useDocsFile(readFile, repositoryId, path, commit, generation);
  if (read === null) return <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle" data-docs-file-loading><Loader size={12} />{t('docs.file.loading')}</p>;
  if (read.state === 'unavailable') {
    return (
      <>
        <h2 className="font-mono text-sm font-semibold text-kumo-strong [overflow-wrap:anywhere]">{path}</h2>
        <Refusal reason={read.reason} t={t} />
      </>
    );
  }
  return <FileView file={read.value} mode={mode} onOpen={onOpen} renderMermaid={renderMermaid} t={t} />;
}

/**
 * The read-only docs page (G7): the `docs/` tree of one repository's default
 * branch and one rendered file, with the commit it came from. It has no
 * citation or session control in this phase.
 */
export function DocsPage({ repositoryId, path, readTree, readFile, generation, mode, now, onOpen, renderMermaid, t }: DocsPageProps) {
  const tree = useDocsTree(readTree, repositoryId, generation);
  return (
    <div className="flex min-w-0 flex-col gap-5" data-docs-page>
      <header className="border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.docs')}</h1>
      </header>
      {repositoryId === null ? <p role="status" className="text-sm text-kumo-subtle">{t('repository.select')}</p>
        : tree === null ? <p role="status" className="flex items-center gap-1.5 text-sm text-kumo-subtle" data-docs-loading><Loader size={12} />{t('docs.loading')}</p>
        : tree.state === 'unavailable' ? <Refusal reason={tree.reason} t={t} />
        : (
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] lg:items-start">
            <DocsTree tree={tree.value} selected={path} now={now} onOpen={onOpen} t={t} />
            <article className="docs-reader" data-docs-reader={path ?? ''}>
              {path === null
                ? <p className="flex items-center gap-2 text-sm text-kumo-subtle"><FileTextIcon size={16} aria-hidden="true" />{t('docs.choose')}</p>
                : <Reader repositoryId={repositoryId} path={path} commit={tree.value.commit} readFile={readFile} generation={generation}
                  mode={mode} onOpen={onOpen} renderMermaid={renderMermaid} t={t} />}
            </article>
          </div>
        )}
    </div>
  );
}

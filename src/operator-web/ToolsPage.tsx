import { useRef, type ReactNode } from 'react';
import { Badge } from '@cloudflare/kumo';
import { XIcon } from '@phosphor-icons/react';
import {
  EXTERNAL_TOOLING_DOC_URL,
  TOOL_CATALOG,
  toolStatus,
  type ToolCatalogEntry,
  type ToolKind,
} from '../core/tools/catalog';
import { DrawerFrame, useModalFocus } from './Drawer';
import type { OperatorLocale, OperatorTranslate } from './i18n';
import { CommandLine, ExternalLink, SectionTitle, StatusDot } from './ui';

/** The read-only detector report. The page shows the command; it never runs it. */
const TOOLING_REPORT_COMMAND = 'repo-harness run check-agent-tooling';

interface PageProps {
  /** `#tools/<id>`: the catalog entry open in the drawer. */
  readonly toolId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onClose: () => void;
  readonly locale: OperatorLocale;
  readonly t: OperatorTranslate;
}

function Status({ tool, t }: { readonly tool: ToolCatalogEntry; readonly t: OperatorTranslate }) {
  const status = toolStatus(tool);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-kumo-default" data-tool-status={status}>
      <StatusDot tone="neutral" />{t(`tools.status.${status}`)}
    </span>
  );
}

function ToolRow({ tool, onOpen, t }: { readonly tool: ToolCatalogEntry; readonly onOpen: (id: string) => void; readonly t: OperatorTranslate }) {
  return (
    <li data-tool={tool.id}>
      <button type="button" onClick={() => onOpen(tool.id)}
        className="grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none md:grid-cols-[minmax(0,1fr)_10rem_7rem_7rem]">
        <span className="min-w-0 truncate text-sm font-medium text-kumo-strong">{tool.name}</span>
        <span className="justify-self-end md:justify-self-start"><Status tool={tool} t={t} /></span>
        <span className="text-xs text-kumo-subtle md:order-first md:col-start-2 md:row-start-1">{t(`tools.category.${tool.category}`)}</span>
        <span className="justify-self-end text-xs text-kumo-subtle md:justify-self-start">{tool.license ?? t('tools.licenseUnknown')}</span>
      </button>
    </li>
  );
}

function ToolGroup({ kind, onOpen, t, children }: {
  readonly kind: ToolKind; readonly onOpen: (id: string) => void; readonly t: OperatorTranslate; readonly children?: ReactNode;
}) {
  const tools = TOOL_CATALOG.tools.filter(tool => tool.kind === kind);
  const headingId = `tools-${kind}-heading`;
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-xl border border-kumo-line bg-kumo-base p-4 sm:p-5" data-tool-group={kind}>
      <SectionTitle id={headingId} count={tools.length}>{t(`tools.group.${kind}`)}</SectionTitle>
      {children}
      <div aria-hidden="true" className="hidden gap-3 border-b border-kumo-hairline px-3 pb-2 text-xs font-medium text-kumo-subtle md:grid md:grid-cols-[minmax(0,1fr)_10rem_7rem_7rem]">
        <span>{t('tools.column.name')}</span><span>{t('tools.column.category')}</span><span>{t('tools.column.status')}</span><span>{t('tools.column.license')}</span>
      </div>
      <ul className="flex flex-col divide-y divide-kumo-hairline">
        {tools.map(tool => <ToolRow key={tool.id} tool={tool} onOpen={onOpen} t={t} />)}
      </ul>
    </section>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <><dt className="text-kumo-subtle">{label}</dt><dd className="min-w-0 break-words text-kumo-default">{children}</dd></>;
}

/** Read-only detail for one catalog entry. Esc closes and returns focus to its row. */
function ToolDrawer({ tool, onClose, locale, t }: {
  readonly tool: ToolCatalogEntry; readonly onClose: () => void; readonly locale: OperatorLocale; readonly t: OperatorTranslate;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus({ dialogRef, closeRef, identity: tool.id, onClose });
  const status = toolStatus(tool);
  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-kumo-hairline px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="text-xs text-kumo-subtle">{t(`tools.group.${tool.kind}`)}</p>
        <h2 id="tool-drawer-title" className="text-lg font-semibold leading-snug break-words text-kumo-strong">{tool.name}</h2>
      </div>
      <button ref={closeRef} type="button" aria-label={t('drawer.close')} onClick={onClose}
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none">
        <XIcon size={18} />
      </button>
    </div>
  );
  return (
    <DrawerFrame dialogRef={dialogRef} labelledBy="tool-drawer-title" className="tool-drawer max-w-[min(560px,100vw)]" closeLabel={t('drawer.close')} onClose={onClose} header={header}>
      <div className="flex flex-col gap-4 py-4" data-tool-drawer={tool.id}>
        <p className="text-sm text-kumo-default">{tool.summary[locale]}</p>
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Fact label={t('tools.column.category')}><Badge variant="secondary">{t(`tools.category.${tool.category}`)}</Badge></Fact>
          <Fact label={t('tools.column.license')}>{tool.license ?? t('tools.licenseUnknown')}</Fact>
          <Fact label={t('tools.column.status')}><Status tool={tool} t={t} /></Fact>
        </dl>
        <p className="text-xs text-kumo-subtle" data-tool-status-reason>
          {status === 'unknown' ? t('tools.reason.unknown') : tool.kind === 'resource' ? t('tools.reason.resource') : t('tools.reason.noDetector')}
        </p>
        <div className="flex flex-col gap-1.5 text-sm">
          <ExternalLink href={tool.url} className="w-fit">{t('tools.link.upstream')}</ExternalLink>
          {tool.docs_anchor && <ExternalLink href={`${EXTERNAL_TOOLING_DOC_URL}${tool.docs_anchor}`} className="w-fit">{t('tools.link.docs')}</ExternalLink>}
        </div>
      </div>
    </DrawerFrame>
  );
}

/**
 * The recommended tool list from the packaged catalog. Every action copies a
 * command or opens a link; nothing here installs, updates or probes a tool.
 */
export function ToolsPage({ toolId, onOpen, onClose, locale, t }: PageProps) {
  const selected = toolId === null ? null : TOOL_CATALOG.tools.find(tool => tool.id === toolId) ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-5" data-tools-page>
      <header className="flex flex-col gap-1 border-b border-kumo-hairline pb-4">
        <h1 className="text-xl font-semibold text-kumo-strong">{t('nav.tools')}</h1>
        <p className="text-sm text-kumo-subtle">{t('tools.boundary')}</p>
      </header>
      <ToolGroup kind="local_tool" onOpen={onOpen} t={t}>
        <div className="flex flex-col gap-1.5 text-xs text-kumo-subtle">
          <p>{t('tools.local.statusNote')}</p>
          <CommandLine command={TOOLING_REPORT_COMMAND} t={t} className="w-fit max-w-full" />
        </div>
      </ToolGroup>
      <ToolGroup kind="resource" onOpen={onOpen} t={t} />
      {selected && <ToolDrawer tool={selected} onClose={onClose} locale={locale} t={t} />}
    </div>
  );
}

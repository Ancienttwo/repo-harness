import { useState } from 'react';
import { cn } from '@cloudflare/kumo';
import { CaretRightIcon } from '@phosphor-icons/react';
import type { DocSessionCitationView } from '../core/operator/doc-session-api';
import type { DocSessionEventV1, DocSessionToolStatus } from '../core/operator/doc-session-events';
import { citationLabel } from './doc-citation';
import { isOperatorMessageKey, type OperatorTranslate } from './i18n';
import { StatusDot, type DotTone } from './ui';

type MessageEvent = Extract<DocSessionEventV1, { readonly type: 'message' }>;
type ToolEvent = Extract<DocSessionEventV1, { readonly type: 'tool' }>;
type FailureEvent = Extract<DocSessionEventV1, { readonly type: 'failure' }>;

type Row =
  | { readonly kind: 'user'; readonly event: MessageEvent; readonly first: boolean }
  | { readonly kind: 'agent'; readonly event: MessageEvent; readonly named: boolean }
  | { readonly kind: 'tools'; readonly events: readonly ToolEvent[] }
  | { readonly kind: 'turn'; readonly event: DocSessionEventV1; readonly number: number; readonly running: boolean }
  | { readonly kind: 'failure'; readonly event: FailureEvent };

const key = (event: DocSessionEventV1) => `${event.epoch}.${event.seq}`;

/**
 * Consecutive tool events fold into one box. A turn start becomes a divider
 * that says whether the turn has ended; the end boundary itself draws nothing.
 * The agent name goes before its first reply of each turn.
 */
function rows(events: readonly DocSessionEventV1[]): readonly Row[] {
  const out: Row[] = [];
  let turns = 0;
  let open: { index: number } | null = null;
  let named = false;
  let sawUser = false;
  for (const event of events) {
    if (event.type === 'tool') {
      const previous = out.at(-1);
      if (previous?.kind === 'tools') out[out.length - 1] = { kind: 'tools', events: [...previous.events, event] };
      else out.push({ kind: 'tools', events: [event] });
    } else if (event.type === 'turn') {
      if (event.boundary === 'started') {
        turns += 1;
        named = false;
        open = { index: out.length };
        out.push({ kind: 'turn', event, number: turns, running: true });
      } else if (open !== null) {
        const divider = out[open.index] as Extract<Row, { readonly kind: 'turn' }>;
        out[open.index] = { ...divider, running: false };
        open = null;
      }
    } else if (event.type === 'failure') {
      out.push({ kind: 'failure', event });
    } else if (event.role === 'user') {
      out.push({ kind: 'user', event, first: !sawUser });
      sawUser = true;
      named = false;
    } else {
      out.push({ kind: 'agent', event, named: !named });
      named = true;
    }
  }
  return out;
}

const TOOL_TONE: Readonly<Record<DocSessionToolStatus, DotTone>> = { started: 'active', succeeded: 'ok', failed: 'danger' };

// Literal class names, so the stylesheet build sees them.
const AGENT_SQUARE: Readonly<Record<string, string>> = { codex: 'bg-(--rh-agent-codex)', claude: 'bg-(--rh-agent-claude)' };

/** The runtime's identity colour; a runtime without one, or not read yet, has a neutral square. */
function AgentName({ runtime, t }: { readonly runtime: string | null; readonly t: OperatorTranslate }) {
  const name = `setup.host.${runtime}`;
  return (
    <p className="type-caption flex items-center gap-1.5 font-medium text-kumo-strong" data-agent-name={runtime ?? ''}>
      <span aria-hidden="true" className={cn('size-2.5 rounded-[3px]', runtime !== null && Object.hasOwn(AGENT_SQUARE, runtime) ? AGENT_SQUARE[runtime] : 'bg-kumo-fill')} />
      {runtime === null ? t('docSession.agent') : isOperatorMessageKey(name) ? t(name) : runtime}
    </p>
  );
}

const circled = (index: number) => index < 20 ? String.fromCodePoint(0x2460 + index) : `(${index + 1})`;

function Citations({ citations, t }: { readonly citations: readonly DocSessionCitationView[]; readonly t: OperatorTranslate }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" data-citations>
      {citations.map((citation, index) => (
        <li key={`${citation.path}:${citation.start_line}`} data-citation={citationLabel(citation)}
          className="inline-flex items-center gap-1 rounded-full bg-kumo-base px-2 py-0.5 font-mono text-xs text-kumo-default">
          <span aria-hidden="true">{circled(index)}</span>{citationLabel(citation)}
          {citation.relocated && <span className="font-sans text-kumo-warning" data-citation-relocated>· {t('docSession.citation.relocated')}</span>}
        </li>
      ))}
    </ul>
  );
}

function Text({ event, t }: { readonly event: MessageEvent; readonly t: OperatorTranslate }) {
  return (
    <>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{event.text}</p>
      {event.truncated && <p className="type-caption mt-1 text-kumo-subtle" data-message-truncated>{t('docSession.message.truncated')}</p>}
    </>
  );
}

function ToolFold({ events, t }: { readonly events: readonly ToolEvent[]; readonly t: OperatorTranslate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-kumo-recessed text-sm" data-tool-fold={events.length}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-kumo-subtle hover:text-kumo-default">
        <CaretRightIcon size={12} aria-hidden="true" className={cn('transition-transform', open && 'rotate-90')} />
        {t('docSession.tools.count', { count: events.length })}
      </button>
      {open && (
        <ul className="flex flex-col gap-1 px-3 pb-2">
          {events.map(event => (
            <li key={key(event)} className="flex min-w-0 items-baseline gap-2" data-tool={event.category} data-tool-status={event.status}>
              <StatusDot tone={TOOL_TONE[event.status]} className="self-center" />
              <span className="sr-only">{t(`docSession.tool.status.${event.status}`)}</span>
              <span className="shrink-0 font-medium text-kumo-default">{t(`docSession.tool.${event.category}`)}</span>
              <span className="min-w-0 font-mono text-xs text-kumo-subtle [overflow-wrap:anywhere]">
                {event.paths.map((path, index) => <code key={`${index}:${path}`} className="mr-2">{path}</code>)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const clock = (at: string) => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * The session record stream (`Conversation.md`): message text, tool category,
 * repository-relative paths, run state, turn boundaries and the failure
 * category (D2). The event type has no field for arguments, commands or
 * output, so none can show here.
 */
export function Conversation({ events, runtime, citations, t }: {
  readonly events: readonly DocSessionEventV1[];
  /** The session's runtime id; null while it is not known. */
  readonly runtime: string | null;
  /** Numbered pills on the first message you sent. */
  readonly citations?: readonly DocSessionCitationView[];
  readonly t: OperatorTranslate;
}) {
  return (
    <ol className="mx-auto flex w-full max-w-[672px] flex-col gap-6" data-conversation>
      {rows(events).map(row => {
        if (row.kind === 'user') {
          return (
            <li key={key(row.event)} className="ml-auto max-w-[85%] rounded-lg bg-(--rh-accent-tint) px-4 py-3 text-kumo-default" data-message="user">
              {row.first && citations !== undefined && citations.length > 0 && <Citations citations={citations} t={t} />}
              <Text event={row.event} t={t} />
            </li>
          );
        }
        if (row.kind === 'agent') {
          return (
            <li key={key(row.event)} className="flex flex-col gap-1.5" data-message="agent">
              {row.named && <AgentName runtime={runtime} t={t} />}
              <div className="type-reading text-kumo-default"><Text event={row.event} t={t} /></div>
            </li>
          );
        }
        if (row.kind === 'tools') return <li key={key(row.events[0]!)}><ToolFold events={row.events} t={t} /></li>;
        if (row.kind === 'turn') {
          return (
            <li key={key(row.event)} className="type-caption flex items-center gap-3 text-kumo-subtle" data-turn={row.number} data-turn-state={row.running ? 'running' : 'ended'}>
              <span aria-hidden="true" className="h-px flex-1 bg-kumo-hairline" />
              <span><time dateTime={row.event.at} title={row.event.at}>{clock(row.event.at)}</time>{' · '}{t('docSession.turn', { number: row.number })}{' · '}
                {t(row.running ? 'docSession.turn.running' : 'docSession.turn.ended')}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-kumo-hairline" />
            </li>
          );
        }
        return (
          <li key={key(row.event)} className="flex items-center gap-2 rounded-lg border border-kumo-line px-3 py-2 text-sm text-kumo-danger" data-failure={row.event.category}>
            <StatusDot tone="danger" />{t(`docSession.failure.${row.event.category}`)}
          </li>
        );
      })}
    </ol>
  );
}

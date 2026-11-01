import type { ComponentType } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { GUARD_DENIALS_KEY, type GuardDenial } from './protocol';

/**
 * DSH web client half of the repo-harness plugin: one right-sidebar tab that
 * lists the calls the guard denied in the current session. It reads only the
 * host projection `repo-harness-guard-denials`; DSH's own tool cards keep
 * showing each denial reason in place.
 *
 * DSH serves this file as `dist/dsh/client.js`. Its client packages are not
 * installed in this repository, so the services below are typed here by the
 * members this plugin calls (DSH 0.2.1-rc.5).
 */

const NS = 'repo-harness-dsh';
const TAB_ID = 'repo-harness-dsh/guard-denials';
const TAB_KIND = 'repo-harness-guard-denials';

const en = {
  'tab.title': 'Guard denials',
  'guide.description': 'Writes and commands the repo-harness guard denied in this session',
  'empty': 'No denied calls in this session.',
  'absent': 'The repo-harness host plugin is not loaded.',
  'tool.unknown': 'unknown tool',
};
const zh: Record<keyof typeof en, string> = {
  'tab.title': 'Guard 拒绝记录',
  'guide.description': '本会话中被 repo-harness guard 拒绝的写入和命令',
  'empty': '本会话没有被拒绝的调用。',
  'absent': 'repo-harness host 插件没有加载。',
  'tool.unknown': '未知工具',
};

type MessageKey = keyof typeof en;
type Translate = (key: MessageKey) => string;

interface TabDefinition {
  readonly id: string;
  readonly kind: string;
  readonly title: () => string;
  readonly guide: readonly { readonly id: string; readonly order: number; readonly title: () => string; readonly description: () => string }[];
}

interface DshClientContext extends Context {
  readonly locale: {
    register(ns: string, dicts: { readonly en: typeof en; readonly zh: typeof zh }): () => void;
    bind(ns: string): Translate;
  };
  readonly sidebarRightTabs: { register(definition: TabDefinition): () => void };
  readonly slots: {
    inject(name: string, register: () => () => void): void;
    register(spec: { readonly name: string; readonly key: string; readonly locale: string }, component: ComponentType<TabBodyProps>): () => void;
  };
}

interface TabBodyProps {
  readonly t: Translate;
  /** Session standard prop: the host projection value, absent while no host unit is registered. */
  readonly useProjection: (key: typeof GUARD_DENIALS_KEY) => readonly GuardDenial[] | undefined;
}

function GuardDenialsBody({ t, useProjection }: TabBodyProps) {
  const denials = useProjection(GUARD_DENIALS_KEY);
  if (denials === undefined) return <p style={{ padding: 12, opacity: 0.7 }}>{t('absent')}</p>;
  if (denials.length === 0) return <p style={{ padding: 12, opacity: 0.7 }}>{t('empty')}</p>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 12, display: 'grid', gap: 12 }}>
      {denials.map((denial) => (
        <li key={denial.call_id} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <strong>{denial.tool ?? t('tool.unknown')}</strong>
            <code style={{ opacity: 0.6, fontSize: '0.85em' }}>{denial.call_id}</code>
          </div>
          {denial.reason === null ? null : <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{denial.reason}</div>}
        </li>
      ))}
    </ol>
  );
}

export const name = NS;
export const inject = ['slots', 'locale', 'sidebarRightTabs'];

export function apply(ctx: DshClientContext): void {
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), `${NS}: dictionaries`);
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    title: () => t('tab.title'),
    guide: [{ id: 'guard-denials', order: 900, title: () => t('tab.title'), description: () => t('guide.description') }],
  }), `${NS}: guard denials tab`);
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
  }, GuardDenialsBody));
}

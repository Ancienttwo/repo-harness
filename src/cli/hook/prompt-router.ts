export type ExplicitWorkflowAction = 'setup' | 'plan' | 'execute' | 'verify' | 'handoff';

export type PromptRoute =
  | { readonly kind: 'explicit'; readonly action: ExplicitWorkflowAction; readonly command: string }
  | { readonly kind: 'active-task'; readonly action: 'execute' | 'verify' }
  | { readonly kind: 'bypass' };

const EXPLICIT_COMMANDS: Readonly<Record<string, ExplicitWorkflowAction>> = Object.freeze({
  '/setup': 'setup',
  '/init': 'setup',
  '/plan': 'plan',
  '/execute': 'execute',
  '/run': 'execute',
  '/check': 'verify',
  '/verify': 'verify',
  '/handoff': 'handoff',
});

const ACTIVE_EXECUTION_UTTERANCES = new Set([
  '开始执行',
  '执行',
  '继续执行',
  '完成这个任务',
  '完成当前任务',
  '继续',
  '开工',
  'execute',
  'continue',
  'go on',
]);

const ACTIVE_VERIFY_UTTERANCES = new Set([
  '检查',
  '验证',
  '验收',
  'check',
  'verify',
  'done',
  '完成了',
  '任务完成了，结束吧',
]);

function normalizeShortUtterance(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > 80 || trimmed.includes('\n')) return null;
  if (/[`"“”‘’]/u.test(trimmed)) return null;
  return trimmed
    .toLowerCase()
    .replace(/[。！!？?]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Route only explicit workflow actions and bounded active-task continuations.
 * All other text bypasses the historical prompt classifier entirely.
 */
export function routePromptExplicitFirst(
  prompt: string,
  state: { readonly hasActiveTask: boolean },
): PromptRoute {
  const trimmed = prompt.trimStart();
  const commandMatch = /^\/(setup|init|plan|execute|run|check|verify|handoff)(?=\s|$)/u.exec(trimmed);
  if (commandMatch) {
    const command = `/${commandMatch[1]}`;
    return { kind: 'explicit', action: EXPLICIT_COMMANDS[command], command };
  }

  if (!state.hasActiveTask) return { kind: 'bypass' };
  const utterance = normalizeShortUtterance(prompt);
  if (!utterance) return { kind: 'bypass' };
  if (ACTIVE_EXECUTION_UTTERANCES.has(utterance)) return { kind: 'active-task', action: 'execute' };
  if (ACTIVE_VERIFY_UTTERANCES.has(utterance)) return { kind: 'active-task', action: 'verify' };
  return { kind: 'bypass' };
}

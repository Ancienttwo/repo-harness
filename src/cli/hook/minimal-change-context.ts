import type { MinimalChangePolicy } from './minimal-change-policy';

export const MINIMAL_CHANGE_EXECUTION_INTENTS = Object.freeze([
  'embedded_approved_plan',
  'bug_fix_execution',
  'plan_execution_projection',
  'general_execution',
] as const);

const SESSION_CONTEXT = [
  'Minimal-change policy:',
  '1. Confirm new code is necessary.',
  '2. Prefer platform or standard library features, then an already-installed dependency.',
  '3. Prefer the smallest direct implementation over new wrappers or extension points.',
  '4. Delete or shrink obsolete code before adding layers.',
  '5. Preserve explicit requirements, security, validation, data safety, error handling, accessibility, and runnable tests.',
  '6. No compatibility fallbacks in product code: do not re-derive an LLM/provider/authority-owned value with local rules or regexes; if the authoritative value is missing or malformed, fail closed with a clear error instead of synthesizing a replacement.',
  'Before completion, justify each new dependency, file, and abstraction.',
].join('\n');

const PROMPT_ADVICE = [
  'Minimal-change execution advice: implement only the approved requirement.',
  'Prefer deletion, platform/stdlib support, or existing dependencies before adding files, dependencies, wrappers, or extension points.',
  'Do not weaken explicit requirements, security, validation, data safety, error handling, accessibility, or runnable tests.',
].join(' ');

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function withinBudget(value: string, maxWords: number): string {
  if (countWords(value) <= maxWords) return value;
  return value.split(/\s+/).slice(0, maxWords).join(' ');
}

export function renderMinimalChangeSessionContext(policy: MinimalChangePolicy): string {
  if (policy.mode === 'off' || !policy.session_context) return '';
  return withinBudget(SESSION_CONTEXT, policy.max_context_words);
}

export function isMinimalChangeExecutionIntent(intent: string): boolean {
  return MINIMAL_CHANGE_EXECUTION_INTENTS.includes(
    intent as (typeof MINIMAL_CHANGE_EXECUTION_INTENTS)[number],
  );
}

export function renderMinimalChangePromptAdvice(
  policy: MinimalChangePolicy,
  intent: string,
): string {
  if (policy.mode === 'off' || !policy.prompt_advice) return '';
  if (!isMinimalChangeExecutionIntent(intent)) return '';
  return PROMPT_ADVICE;
}

export function minimalChangeContextWordCount(value: string): number {
  return countWords(value);
}

/** Closed model-family table: the single family authority. A routing provider
 * prefix (`magpie/`, `cursor/`) is a gateway label, so only the last `/`
 * segment is matched. An unmatched model has no family. */
const MODEL_FAMILY_PREFIXES: readonly (readonly [string, string])[] = [
  ['claude-', 'anthropic'], ['opus', 'anthropic'], ['sonnet', 'anthropic'], ['haiku', 'anthropic'],
  ['gpt-', 'openai'], ['o3', 'openai'], ['o4', 'openai'],
  ['deepseek-', 'deepseek'],
  ['gemini-', 'google'],
  ['grok-', 'xai'],
  ['kimi-', 'moonshot'],
  ['qwen', 'alibaba'],
];

export function modelFamily(model: string): string | null {
  const name = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
  return MODEL_FAMILY_PREFIXES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null;
}

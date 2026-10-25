import { readText } from '../state/collect-state-inputs';

const POLICY_PATH = '.ai/harness/policy.json';
const DEFAULT_CANONICAL_TARGET_REF = 'main';

/** Read the repository policy target without loading a task, Sprint, or lease. */
export function readCanonicalTargetRef(cwd: string): string {
  const text = readText(cwd, POLICY_PATH);
  if (text === null) return DEFAULT_CANONICAL_TARGET_REF;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`invalid workflow policy JSON: ${POLICY_PATH}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid workflow policy object: ${POLICY_PATH}`);
  }
  let current: unknown = parsed;
  for (const segment of ['worktree_strategy', 'merge_back', 'target']) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return DEFAULT_CANONICAL_TARGET_REF;
    }
    if (!Object.hasOwn(current as Record<string, unknown>, segment)) {
      return DEFAULT_CANONICAL_TARGET_REF;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === undefined || current === null) return DEFAULT_CANONICAL_TARGET_REF;
  if (typeof current !== 'string' || current.trim().length === 0) {
    throw new Error(
      `invalid workflow policy string .worktree_strategy.merge_back.target: ${POLICY_PATH}`,
    );
  }
  return current.trim();
}

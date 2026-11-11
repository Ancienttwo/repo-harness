// Aliased: the standalone capability helper inlines this file beside other `fs` and `path` imports.
import { readFileSync as readPolicyFileSync } from 'fs';
import { join as joinPolicyPath } from 'path';
import { POLICY_PATH, decodeWorkflowPolicy, type DecodedWorkflowPolicy } from '../../core/workflow/policy-schema';

/** The file text, or null when the file is absent. */
function readPolicyText(repoRoot: string): string | null {
  try {
    return readPolicyFileSync(joinPolicyPath(repoRoot, POLICY_PATH), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * The one reader of `.ai/harness/policy.json` from disk. It validates no key:
 * each reader takes its keys through `policyValue` and keeps its own message.
 * The state resolver passes `readSource` to read through its contained-path
 * check and to observe one read per state pass.
 */
export function readWorkflowPolicyFile(
  repoRoot: string,
  readSource: (path: string) => string | null = () => readPolicyText(repoRoot),
): DecodedWorkflowPolicy {
  return decodeWorkflowPolicy(readSource(POLICY_PATH));
}

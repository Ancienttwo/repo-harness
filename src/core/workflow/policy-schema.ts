/**
 * The one key tree of `.ai/harness/policy.json` that a reader under `src/` or
 * `scripts/` uses. The tree lists keys; it does not validate values, because
 * each reader keeps its own error text for a malformed value.
 *
 * A key outside the tree is ignored, not rejected: adopted repositories still
 * hold retired keys until `init` removes them.
 *
 * A leaf is `true`. An empty object `{}` is a declared section whose children
 * belong to one reader's own contract (for example `external_sources`, owned by
 * `readExternalSourcesPolicy`), so `unknownPolicyKeys` names the section key and
 * does not descend into it.
 */
export type PolicyKeyTree = {
  readonly [key: string]: true | PolicyKeyTree;
};

export const WORKFLOW_POLICY_KEYS: PolicyKeyTree = {
  tasks: { research_dir: true },
  external_sources: {},
  operations: { agent_writable_private_dirs: true, deploy_sql: {} },
  context: { map_file: true, capability_source: true, capability_registry_file: true },
  harness: { runs_dir: true },
  information_lifecycle: {
    retention: {},
    external_knowledge: { manifest_file: true, project_path: true, sync_script: true },
  },
  documentation: { language: true },
  planning: { pending_orchestration_file: true },
  worktree_strategy: {
    base_branch: true,
    review_base: true,
    merge_back: { target: true },
    worktree_dir_template: true,
    branch_prefix: true,
  },
  publication: {
    acceptance_merge: true,
    merge_queue: {},
    required_check_coverage: {},
    generated_artifacts: {},
  },
  tooling: { codegraph: { enabled: true } },
  external_tooling: { agent_fleet: { managed_agents: true, install_mode: true } },
  security: { reviewed_findings: {} },
  minimal_change: { mode: true },
  upgrade: { strategy_version: true },
  guards: {},
  enforcement: {},
  merge_gate: {},
  internal_pr_authors: {},
};

export const POLICY_PATH = '.ai/harness/policy.json';

/** A policy that a reader found on disk; null when the file is absent. */
export type WorkflowPolicyDocument = Readonly<Record<string, unknown>> | null;

/**
 * Decode the policy text into the object that the field readers consume. A key
 * outside the tree stays in the object; the tree only classifies the keys.
 * `null` text means the file is absent. The two errors are the loader's own
 * messages; callers keep them unchanged.
 */
export function decodeWorkflowPolicy(text: string | null): WorkflowPolicyDocument {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`invalid workflow policy JSON: ${POLICY_PATH}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid workflow policy object: ${POLICY_PATH}`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

/** Dotted paths of the keys that no reader uses, sorted. */
export function unknownPolicyKeys(policy: WorkflowPolicyDocument): readonly string[] {
  if (policy === null) return [];
  const unknown: string[] = [];
  collectUnknownKeys(policy, WORKFLOW_POLICY_KEYS, '', unknown);
  return unknown.sort();
}

function collectUnknownKeys(
  value: Readonly<Record<string, unknown>>,
  tree: PolicyKeyTree,
  prefix: string,
  unknown: string[],
): void {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const node = Object.hasOwn(tree, key) ? tree[key]! : undefined;
    if (node === undefined) { unknown.push(path); continue; }
    // A leaf needs no children; a declared section owns its own children.
    if (node === true || Object.keys(node).length === 0) continue;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      collectUnknownKeys(child as Readonly<Record<string, unknown>>, node, path, unknown);
    }
  }
}

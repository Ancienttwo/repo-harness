/**
 * The one key tree of `.ai/harness/policy.json` that a reader under `src/` or
 * `scripts/` uses. The tree lists keys; it does not validate values, because
 * each reader keeps its own error text for a malformed value.
 *
 * A key outside the tree is ignored, not rejected: adopted repositories still
 * hold retired keys until `init` removes them with `pruneUnknownPolicyKeys`.
 *
 * A leaf is `true`. An empty object `{}` is a declared section whose children
 * belong to one reader's own contract (for example `external_sources`, owned by
 * `readExternalSourcesPolicy`), so `unknownPolicyKeys` names the section key and
 * does not descend into it.
 */
export type PolicyKeyTree = {
  readonly [key: string]: true | PolicyKeyTree;
};

export const WORKFLOW_POLICY_KEYS = {
  tasks: { research_dir: true },
  external_sources: {},
  operations: { agent_writable_private_dirs: true, deploy_sql: {} },
  context: { map_file: true, capability_source: true },
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
    branch_prefix: true,
  },
  publication: {
    acceptance_merge: true,
    required_check_coverage: {},
    generated_artifacts: {},
  },
  tooling: { codegraph: { enabled: true } },
  external_tooling: { agent_fleet: { managed_agents: true, install_mode: true } },
  security: { reviewed_findings: {} },
  internal_pr_authors: {},
} as const satisfies PolicyKeyTree;

type PolicyPathsOf<Tree, Prefix extends string> = {
  [Key in keyof Tree & string]:
    | `${Prefix}${Key}`
    | (Tree[Key] extends true ? never : PolicyPathsOf<Tree[Key], `${Prefix}${Key}.`>);
}[keyof Tree & string];

/** The dotted path of every leaf and every section in the tree. A reader can take only these paths. */
export type PolicyPath = PolicyPathsOf<typeof WORKFLOW_POLICY_KEYS, ''>;

export const POLICY_PATH = '.ai/harness/policy.json';

/** A decoded root that is a JSON object. */
export type WorkflowPolicyObject = Readonly<Record<string, unknown>>;

// Module-private: a reader takes a value only through `policyValue`.
const POLICY_ROOT = Symbol('workflow-policy-root');

/** The value of `policyValue` when the file or a key on the path is absent. */
export const POLICY_ABSENT = Symbol('workflow-policy-absent');

/**
 * The file as decoded. `present` is false when the file is absent.
 * `rootIsObject` is false also for a `[]` or `null` root: a reader with its own
 * message for that root checks it; `policyValue` throws for it.
 */
export interface DecodedWorkflowPolicy {
  readonly present: boolean;
  readonly rootIsObject: boolean;
  readonly [POLICY_ROOT]: unknown;
}

/**
 * Decode the policy text. The decoder owns the JSON syntax only. It rejects
 * neither a key outside the tree nor a value of a key, because each reader
 * keeps its own message for the keys it reads.
 */
export function decodeWorkflowPolicy(text: string | null): DecodedWorkflowPolicy {
  if (text === null) return { present: false, rootIsObject: false, [POLICY_ROOT]: undefined };
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (cause) {
    throw new Error(`invalid workflow policy JSON: ${POLICY_PATH}`, { cause });
  }
  return { present: true, rootIsObject: isPolicyObject(root), [POLICY_ROOT]: root };
}

/**
 * The value at `path`, or `POLICY_ABSENT` when the file or a key is absent. A
 * non-object parent on the path (the root included) throws. A reader that
 * treats such a parent as absent reads the parent section first.
 */
export function policyValue(document: DecodedWorkflowPolicy, path: PolicyPath): unknown {
  if (!document.present) return POLICY_ABSENT;
  let current: unknown = document[POLICY_ROOT];
  for (const segment of path.split('.')) {
    if (!isPolicyObject(current)) throw new Error(`invalid workflow policy field .${path}: non-object parent`);
    if (!Object.hasOwn(current, segment)) return POLICY_ABSENT;
    current = current[segment];
  }
  return current;
}

/**
 * True for a JSON object; false for an array, `null` and a scalar. The same
 * shape as `core/evidence/is-record`; the standalone helper inlines this file
 * and cannot import that module.
 */
export function isPolicyObject(value: unknown): value is WorkflowPolicyObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Dotted paths of the keys that no reader uses, sorted. */
export function unknownPolicyKeys(policy: WorkflowPolicyObject | null): readonly string[] {
  return policy === null ? [] : pruneUnknownPolicyKeys(policy).removed;
}

/** The policy without the keys that no reader uses, and their dotted leaf paths, sorted. Schema sections stay. */
export function pruneUnknownPolicyKeys(policy: WorkflowPolicyObject): {
  readonly policy: Record<string, unknown>;
  readonly removed: readonly string[];
} {
  const removed: string[] = [];
  const kept = keepKnownKeys(policy, WORKFLOW_POLICY_KEYS, '', removed);
  return { policy: kept, removed: removed.sort() };
}

function keepKnownKeys(
  value: WorkflowPolicyObject,
  tree: PolicyKeyTree,
  prefix: string,
  unknown: string[],
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const node = Object.hasOwn(tree, key) ? tree[key]! : undefined;
    if (node === undefined) { collectLeafPaths(child, path, unknown); continue; }
    // A leaf needs no children; a declared section owns its own children.
    if (node === true || Object.keys(node).length === 0 || !isPolicyObject(child)) {
      kept[key] = child;
      continue;
    }
    // A schema-declared section stays, also when it held only unknown keys.
    kept[key] = keepKnownKeys(child, node, path, unknown);
  }
  return kept;
}

/** Under an unknown key every leaf is unknown. An array, a scalar or an empty object is a leaf. */
function collectLeafPaths(value: unknown, path: string, unknown: string[]): void {
  if (!isPolicyObject(value) || Object.keys(value).length === 0) {
    unknown.push(path);
    return;
  }
  for (const [key, child] of Object.entries(value)) collectLeafPaths(child, `${path}.${key}`, unknown);
}

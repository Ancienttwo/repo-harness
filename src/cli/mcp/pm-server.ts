import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createHash } from 'crypto';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'fs';
import { dirname, isAbsolute, join, relative, sep } from 'path';
import { PM_OPERATIONS, PM_OPERATION_SCHEMAS, PmError, type PmOperation } from '../../core/pm/protocol';
import { canonicalRepoPath, isRepoHarnessAdoptedPath, readRepoHarnessRegistryStrictSnapshot, repoHarnessHome, repoHarnessRepoIdFor } from '../../effects/repo-registry';
import { runPmJson } from '../commands/pm';
import { readWorktreeTopology } from '../../effects/git/worktree-topology';
import { repoHarnessPackageVersion } from './version';

interface PmMcpScope {
  protocol: 1;
  repo_id: string;
  authorization_revision: number;
  allowed_operations: PmOperation[];
}

/** Local operator configuration narrows existing authority. It is never a tool input or an approval. */
function readScope(env: NodeJS.ProcessEnv): { scope: PmMcpScope; bytes: string } {
  const path = join(repoHarnessHome(env), 'pm-mcp.json');
  let fd: number | undefined;
  try {
    for (const entry of [dirname(path), path]) {
      const stat = lstatSync(entry);
      if (stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0
        || (entry === path ? !stat.isFile() : !stat.isDirectory())) throw new PmError('pm_mcp_configuration_unsafe');
    }
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd), published = lstatSync(path);
    if (!opened.isFile() || opened.size > 16 * 1024 || opened.dev !== published.dev || opened.ino !== published.ino
      || opened.uid !== process.getuid?.() || (opened.mode & 0o022) !== 0) throw new PmError('pm_mcp_configuration_unsafe');
    const bytes = readFileSync(fd, 'utf8');
    const scope = JSON.parse(bytes) as PmMcpScope;
    if (!scope || Object.keys(scope).sort().join(',') !== 'allowed_operations,authorization_revision,protocol,repo_id'
      || scope.protocol !== 1 || typeof scope.repo_id !== 'string' || !/^repo_[0-9a-f]{16}$/.test(scope.repo_id)
      || !Number.isSafeInteger(scope.authorization_revision) || scope.authorization_revision < 0
      || !Array.isArray(scope.allowed_operations) || scope.allowed_operations.length < 1
      || new Set(scope.allowed_operations).size !== scope.allowed_operations.length
      || scope.allowed_operations.some(operation => !PM_OPERATIONS.includes(operation))) throw new PmError('pm_mcp_configuration_invalid');
    const registry = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false });
    if (scope.authorization_revision !== registry.authorizationRevision) throw new PmError('pm_authorization_stale');
    const repo = registry.repos.find(entry => entry.id === scope.repo_id);
    if (!repo || canonicalRepoPath(repo.path) !== repo.path || repoHarnessRepoIdFor(repo.path) !== repo.id
      || !isRepoHarnessAdoptedPath(repo.path)) throw new PmError('pm_repo_unavailable');
    for (const root of [repo.path, ...readWorktreeTopology(repo.path).worktrees.map(entry => canonicalRepoPath(entry.path))]) {
      const rest = relative(root, realpathSync(path));
      if (rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`))) throw new PmError('pm_mcp_configuration_unsafe');
    }
    return { scope, bytes };
  } finally { if (fd !== undefined) closeSync(fd); }
}

const RESERVED = new Set(['protocol', 'operation', 'repo_id', 'authorization_revision']);
export function createPmMcpBinding(env: NodeJS.ProcessEnv = { ...process.env }) {
  const initial = readScope(env);
  const check = () => {
    const current = readScope(env);
    if (current.bytes !== initial.bytes) throw new PmError('pm_mcp_configuration_changed');
    return current.scope;
  };
  const tools = () => check().allowed_operations.map(operation => {
    const source = PM_OPERATION_SCHEMAS[operation];
    const properties = Object.fromEntries(Object.entries(source.properties).filter(([name]) => !RESERVED.has(name)));
    return { name: `pm_${operation.replace('-', '_')}`, description: `Canonical PM ${operation} in the server-bound repository.`,
      inputSchema: { type: 'object' as const, additionalProperties: false, properties, required: Object.keys(properties) } };
  });
  const fingerprint = () => {
    const scope = check();
    return createHash('sha256').update(JSON.stringify({ protocol: scope.protocol, repo_id: scope.repo_id,
      authorization_revision: scope.authorization_revision, allowed_operations: [...scope.allowed_operations].sort() })).digest('hex');
  };
  return { check, tools, fingerprint };
}

export interface PmMcpAuthorization {
  authorizationId: string;
  verify: (token: string, authorizationId: string) => void;
}
export function createPmMcpServer(env: NodeJS.ProcessEnv = { ...process.env }, options: {
  binding?: ReturnType<typeof createPmMcpBinding>;
  authorization?: PmMcpAuthorization;
} = {}): Server {
  const binding = options.binding ?? createPmMcpBinding(env);
  const authorize = (token: string | undefined) => {
    if (!options.authorization) return;
    if (!token || !options.authorization.authorizationId.trim()) throw new PmError('pm_mcp_authentication_required');
    options.authorization.verify(token, options.authorization.authorizationId);
  };
  const server = new Server({ name: 'repo-harness-pm-mcp', version: repoHarnessPackageVersion() }, {
    capabilities: { tools: {} },
    instructions: 'Use canonical PM task and claim IDs. The operator owns acquisition and admission. Reconcile unknown delivery by the same request ID. Tool availability is not approval, provider acceptance, or an event wake-up connection.',
  });
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    authorize(extra.authInfo?.token);
    return { tools: binding.tools() };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      authorize(extra.authInfo?.token);
      const scope = binding.check();
      const operation = scope.allowed_operations.find(operation => `pm_${operation.replace('-', '_')}` === request.params.name);
      if (!operation) throw new PmError('pm_mcp_operation_denied');
      const args = request.params.arguments ?? {};
      if (Object.keys(args).some(key => RESERVED.has(key))) throw new PmError('pm_request_fields_invalid');
      // Captured server authority, never a model-supplied request field.
      const guard = () => {
        authorize(extra.authInfo?.token);
        if (!binding.check().allowed_operations.includes(operation)) throw new PmError('pm_mcp_operation_denied');
      };
      const response = await runPmJson(JSON.stringify({ ...args, protocol: 1, operation,
        ...(operation === 'capabilities' ? {} : { repo_id: scope.repo_id }),
        ...(['dispatch', 'follow-up', 'collect'].includes(operation) ? { authorization_revision: scope.authorization_revision } : {}),
      }), env, guard);
      authorize(extra.authInfo?.token);
      binding.check();
      return { isError: !response.ok, content: [{ type: 'text', text: JSON.stringify(response) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ protocol: 1, kind: 'repo-harness-pm-response',
        operation: null, ok: false, error: { code: error instanceof PmError ? error.code : 'pm_mcp_failed',
          message: error instanceof Error ? error.message : String(error) } }) }] };
    }
  });
  return server;
}

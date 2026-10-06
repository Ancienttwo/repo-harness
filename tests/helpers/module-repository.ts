import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const MODULE_ID = 'capability.test.module';
export const MODULE_DOC = 'docs/architecture/modules/test/module.md';
export const MODULE_NODE = '.archcontext/model/nodes/capability.test.module.yaml';
export const MODULE_FLOW = '.archcontext/model/flows/flow.module.primary.yaml';
export function fixtureGit(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
}
export function fixtureWrite(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
}
export function fixtureCommit(root: string): string {
  fixtureGit(root, ['add', '.']); fixtureGit(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture']);
  return fixtureGit(root, ['rev-parse', 'HEAD']);
}
/** A real committed Git repository. No subprocess, schema or source reads are mocked. */
export function moduleRepository(options: { section3?: string; budget?: number; include?: string; flow?: boolean; capabilityId?: string; flowId?: string } = {}): string {
  const root = mkdtempSync('/tmp/rh-module-');
  const capabilityId = options.capabilityId ?? MODULE_ID;
  const [, domain, name] = capabilityId.split('.');
  fixtureGit(root, ['init', '-q']);
  fixtureWrite(root, '.archcontext/manifest.yaml', Bun.YAML.stringify({ runtime: { contextBudgetBytes: options.budget ?? 12288 } }));
  const node = { schemaVersion: 'archcontext.node/v2', id: capabilityId, kind: 'capability', name: 'Test Module', status: 'active', summary: 'Read a committed module.',
    responsibilities: ['Keep committed content separate from worktree observations.'],
    source: { include: [options.include ?? 'src/module/**'], entrypoints: [{ id: 'entrypoint.module.read', path: 'src/module/read.ts', symbols: [{ name: 'read', sinks: [{ id: 'sink.module.core', path: 'src/module/core.ts', symbol: 'project' }] }] }] },
    extensions: { contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' }, lspProfile: 'typescript-lsp', verification: ['bun run check:type'] } };
  fixtureWrite(root, MODULE_NODE, Bun.YAML.stringify(node));
  fixtureWrite(root, '.archcontext/model/nodes/component.module.core.yaml', Bun.YAML.stringify({ schemaVersion: 'archcontext.node/v2', id: 'component.module.core', kind: 'component', name: 'Module Core', status: 'active', summary: 'Project facts.', parent: capabilityId }));
  fixtureWrite(root, '.archcontext/model/relations/relation.module.core.yaml', Bun.YAML.stringify({ schemaVersion: 'archcontext.relation/v1', id: 'relation.module.core', kind: 'calls', source: capabilityId, target: 'component.module.core', intent: 'Project the module.' }));
  mkdirSync(join(root, '.archcontext/model/flows'), { recursive: true });
  // Git does not store empty directories. Keep a non-YAML file for the no-flow case.
  fixtureWrite(root, '.archcontext/model/flows/.keep', '');
  if (options.flow !== false) {
    const step = { id: 'read', from: 'module', to: 'core', label: 'Read facts', evidence: { entrypointId: 'entrypoint.module.read', sourceSymbol: 'read', sinkId: 'sink.module.core' } };
    fixtureWrite(root, MODULE_FLOW, Bun.YAML.stringify({ schemaVersion: 'archcontext.flow/v1', id: options.flowId ?? 'flow.module.primary', capabilityId, name: 'Read module facts', applicability: 'required',
      participants: [{ id: 'module', nodeId: capabilityId }, { id: 'core', nodeId: 'component.module.core' }], steps: [step],
      outcomes: ['success', 'error'].map(kind => ({ id: kind, kind, label: kind, steps: [step], terminal: { participant: 'module', label: kind } })) }));
  }
  fixtureWrite(root, `docs/architecture/modules/${domain}/${name}.md`, `## 1. Generated summary\nCommitted summary.\n\n## 3. Decisions\n${options.section3 ?? 'Keep one model authority.'}\n\n## 4. History\nNot part of section 3.\n`);
  fixtureWrite(root, 'plans/plan-test.md', `> **Capability ID**: ${capabilityId}\n> **Status**: Approved\n\nPrivate plan body is not prompt input.\n`);
  fixtureWrite(root, 'tasks/contracts/test.contract.md', `> **Capability ID**: ${capabilityId}\n> **Status**: Active\n\ntokens: null\n`);
  fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 1;\n'); fixtureWrite(root, 'src/module/core.ts', 'export const project = () => 1;\n');
  fixtureWrite(root, 'AGENTS.md', 'Fixture rules.\n'); fixtureWrite(root, 'CLAUDE.md', 'Fixture rules.\n');
  fixtureCommit(root); return root;
}

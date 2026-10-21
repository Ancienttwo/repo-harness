import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { moduleRepository, fixtureWrite, fixtureGit, fixtureCommit, MODULE_ID, MODULE_DOC } from './module-repository';

const NOTICE_IGNORE = '.ai/harness/state/\n.ai/harness/runs/\n.ai/harness/handoff/\n.ai/harness/journal/\n.ai/harness/checks/\n.ai/harness/events.jsonl\nhome/\n';
const NOTICE_GLOBAL_CONFIG = JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: 'manual', projection_timeout_ms: 120000 } });

/** A JSON capability registry that owns `src/module/` only. */
export function writeNoticeRegistry(root: string): void {
  fixtureWrite(root, '.ai/context/capabilities.json', JSON.stringify({ version: 1, capabilities: [{
    id: 'test-module', domain: 'test', name: 'module', prefixes: ['src/module'],
    contract_files: { agents: 'src/module/AGENTS.md', claude: 'src/module/CLAUDE.md' },
    architecture_module: MODULE_DOC, workstream_dir: 'tasks/workstreams/test/module', lsp_profile: 'typescript-lsp', verification_hints: ['bun test'],
  }] }));
}

/**
 * A registry consumer: the JSON registry owns `src/module/` only, and the
 * repository has no ArchContext model and no CodeGraph index. The feature
 * branch adds one path that no capability owns.
 */
export function registryNoticeFixture(): string {
  const root = mkdtempSync('/tmp/rh-notice-registry-');
  fixtureGit(root, ['init', '-q']);
  fixtureGit(root, ['config', 'maintenance.auto', 'false']);
  fixtureGit(root, ['config', 'gc.auto', '0']);
  fixtureWrite(root, '.ai/harness/workflow-contract.json', '{}\n');
  fixtureWrite(root, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'registry' } }));
  writeNoticeRegistry(root);
  fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 1;\n');
  fixtureWrite(root, '.gitignore', NOTICE_IGNORE);
  fixtureWrite(root, 'home/.repo-harness/config.json', NOTICE_GLOBAL_CONFIG);
  fixtureCommit(root);
  fixtureGit(root, ['branch', '-M', 'main']);
  fixtureGit(root, ['checkout', '-qb', 'feature']);
  fixtureWrite(root, 'packages/new-core/index.ts', 'export const core = 1;\n');
  return root;
}

/** Real native model and broken human citation. Checkpoint needs no index. */
export function agentNoticeFixture(): string {
  const root = moduleRepository({ section3: 'Read `src/module/read.ts:999`.', flow: false });
  fixtureGit(root, ['branch', '-M', 'main']);
  fixtureWrite(root, '.archcontext/product.yaml', 'schemaVersion: archcontext.product/v1\nid: product.test\nname: Test\n');
  fixtureWrite(root, 'docs/architecture/.projection-manifest.json', JSON.stringify({ profile: 'repo-harness/v1' }));
  fixtureWrite(root, '.ai/harness/workflow-contract.json', '{}\n');
  fixtureWrite(root, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
  fixtureWrite(root, '.gitignore', NOTICE_IGNORE);
  fixtureWrite(root, 'home/.repo-harness/config.json', NOTICE_GLOBAL_CONFIG);
  fixtureCommit(root);
  fixtureGit(root, ['checkout', '-qb', 'feature']);
  fixtureWrite(root, 'src/module/read.ts', 'export const read = () => 2;\n');
  return root;
}

export function noticeOwnership(root: string) {
  return {
    review_base: fixtureGit(root, ['rev-parse', 'main']), capability_ids: ['test-module'],
    capabilities: [{ id: 'test-module', module_document: MODULE_DOC, paths: ['src/module/read.ts'] }], unowned_paths: [],
  };
}

export const NOTICE_CAPABILITY = MODULE_ID;
export const noticeEnv = (root: string) => ({ ...process.env, HOME: join(root, 'home') });

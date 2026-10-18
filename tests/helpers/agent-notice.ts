import { join } from 'node:path';
import { moduleRepository, fixtureWrite, fixtureGit, fixtureCommit, MODULE_ID, MODULE_DOC } from './module-repository';

/** Real native model and broken human citation. Checkpoint needs no index. */
export function agentNoticeFixture(): string {
  const root = moduleRepository({ section3: 'Read `src/module/read.ts:999`.', flow: false });
  fixtureGit(root, ['branch', '-M', 'main']);
  fixtureWrite(root, '.archcontext/product.yaml', 'schemaVersion: archcontext.product/v1\nid: product.test\nname: Test\n');
  fixtureWrite(root, 'docs/architecture/.projection-manifest.json', JSON.stringify({ profile: 'repo-harness/v1' }));
  fixtureWrite(root, '.ai/harness/workflow-contract.json', '{}\n');
  fixtureWrite(root, '.ai/harness/policy.json', JSON.stringify({ context: { capability_source: 'archcontext' } }));
  fixtureWrite(root, '.gitignore', '.ai/harness/state/\n.ai/harness/runs/\n.ai/harness/handoff/\n.ai/harness/journal/\n.ai/harness/checks/\n.ai/harness/events.jsonl\nhome/\n');
  fixtureWrite(root, 'home/.repo-harness/config.json', JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: 'manual', projection_timeout_ms: 120000 } }));
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

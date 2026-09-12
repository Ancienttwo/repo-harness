import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '../..');

test('ships browser engine docs', () => {
  const guide = join(ROOT, 'docs/repo-harness-chatgpt-browser-engine.md');
  expect(readFileSync(guide, 'utf-8')).toContain('repo-harness chatgpt browser-consult');
  expect(readFileSync(guide, 'utf-8')).toContain('--provider native');
  expect(readFileSync(guide, 'utf-8')).not.toContain('--provider bridge');
  expect(readFileSync(guide, 'utf-8')).toContain('--browser-channel chrome');
  expect(readFileSync(guide, 'utf-8')).toContain('.ai/harness/handoff/gptpro/chatgpt-review-${stamp}.md');
  expect(readFileSync(guide, 'utf-8')).toContain('docs/researches/YYYYMMDD-<topic>.md');
  expect(readFileSync(guide, 'utf-8')).toContain('not `oracle-mcp`');
  expect(readFileSync(join(ROOT, 'docs/researches/README.md'), 'utf-8')).toContain('.ai/harness/handoff/gptpro/');
  expect(readFileSync(guide, 'utf-8')).toContain('Oracle CLI package currently requires `node >=24`');
  expect(readFileSync(guide, 'utf-8')).toContain('agent_actions');
  expect(readFileSync(guide, 'utf-8')).toContain('chatgpt-oracle-install-pinned');
  expect(readFileSync(guide, 'utf-8')).toContain('--chatgpt-app <serverName>');
  expect(readFileSync(guide, 'utf-8')).toContain('chatgpt install-skill --target both');
  expect(readFileSync(guide, 'utf-8')).toContain('PROMPT_SECRET_SCAN_FAILED');
  expect(readFileSync(guide, 'utf-8')).toContain('meta.security.promptSecretScan');
  expect(readFileSync(guide, 'utf-8')).toContain('immutable staged paths');
});

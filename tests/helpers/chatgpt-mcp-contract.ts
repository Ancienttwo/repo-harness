import { expect } from 'bun:test';

export function assertChatGptMcpContract(text: string): void {
  const lower = text.toLowerCase();
  expect(text).toContain('chatgpt.serverName');
  expect(text).toContain('Refresh');
  expect(text).toContain('Action');
  expect(text).toContain('fresh chat');
  expect(text).toContain('Called tool');
  expect(text).toContain('captured tool-call transcript');
  expect(text).toContain('assistant self-report');
  expect(text).toContain('sandbox');
  expect(text).toContain('app_unavailable');
  expect(text).toContain('surface_blocked');
  expect(text).toContain('bundle_fallback');
  expect(text).toContain('source: local_repo_harness_bundle');
  expect(text).toContain('pro_invoked_mcp: false');
  expect(lower).toContain('repo-scope');
  expect(lower).toContain('user-scope');
  expect(text).not.toMatch(/asdk_app_[a-f0-9]{32}/);
  expect(text).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
}

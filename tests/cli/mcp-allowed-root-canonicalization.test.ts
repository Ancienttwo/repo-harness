import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { getMcpPolicy, sensitiveAllowedRootReason } from '../../src/cli/mcp/policy';
import { WorkspaceManager } from '../../src/cli/mcp/workspaces';

describe('MCP allowed-root canonicalization', () => {
  test('system canonicalization prefixes are not treated as a sensitive "private" root', () => {
    // realpath of a macOS per-user temp dir; already carved out today.
    expect(sensitiveAllowedRootReason('/private/var/folders/ab/T/repo-harness-guard')).toBeUndefined();
    // realpath of /tmp on macOS; a filesystem artifact, not a user-owned "private" directory.
    expect(sensitiveAllowedRootReason('/private/tmp/repo-harness-guard')).toBeUndefined();
  });

  test('a real user-owned sensitive directory is still denied as an allowed root', () => {
    expect(sensitiveAllowedRootReason('/Users/example/private/repo')).toBe('private/**');
    expect(sensitiveAllowedRootReason('/Users/example/secrets/repo')).toBe('secrets/**');
    expect(sensitiveAllowedRootReason('/Users/example/repo/node_modules/pkg')).toBe('node_modules/**');
  });

  test('a workspace root under a symlinked system temp dir stays readable and counted', () => {
    // On macOS /tmp is a symlink to /private/tmp, so realpathSync injects a "private" segment
    // that the caller never wrote. Skip where the platform has no such symlink.
    if (process.platform !== 'darwin') return;
    const repoRoot = mkdtempSync(join('/tmp', 'repo-harness-allowed-root-guard-'));
    try {
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
      const roots = new WorkspaceManager({ allowedRoots: [repoRoot], policy }).listAllowedRoots();
      expect(roots).toHaveLength(1);
      expect(roots[0].readable).toBe(true);
      // Mirrors reader-tools.ts:222 configured_root_count.
      expect(roots.filter((root) => root.readable).length).toBe(1);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readArchitectureNativeContext } from '../src/effects/architecture/archctx-provider';
import { readArchcontextCapabilityAuthority, resolveArchcontextCapabilityPaths } from '../src/effects/capabilities/archcontext-owners';
import { buildArchContextNodesV2, findMatch, type ArchContextNodeV2 } from '../scripts/capability-resolver';
import { archcontextIncludeAnchor, capabilityRegistryFromArchcontextNodes, type Capability, type CapabilityRegistry } from '../src/core/capabilities/registry';

const ROOT = join(import.meta.dir, '..');
const capability = (id: string, domain: string, name: string, prefixes: string[]): Capability => ({
  id, domain, name, prefixes,
  contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
  architecture_module: `docs/architecture/modules/${domain}/${name}.md`,
  workstream_dir: `tasks/workstreams/${domain}/${name}`,
  lsp_profile: 'typescript-lsp',
  verification_hints: [`bun test ${id}`],
});
const web = capability('apps-web-web', 'apps-web', 'web', ['apps/web']);
const account = capability('apps-web-account', 'apps-web', 'account', ['apps/web/src/routes/account']);
const rootRouter = capability('public-surface-root-router', 'public-surface', 'root-router', ['AGENTS.md', 'CLAUDE.md']);
const registry: CapabilityRegistry = { version: 1, capabilities: [web, account, rootRouter] };
const directory = (path: string) => path === 'apps/web' || path === 'apps/web/src/routes/account';

function prefixFromNode(node: ArchContextNodeV2, inputPath: string): string | null {
  // Exported includes are `dir/**` or file paths, so the anchor is the old prefix.
  const matches = node.source.include.flatMap((include) => {
    const anchor = archcontextIncludeAnchor(include);
    return anchor !== null && (inputPath === anchor || inputPath.startsWith(`${anchor}/`)) ? [anchor] : [];
  });
  return matches.sort((left, right) => right.length - left.length)[0] ?? null;
}

describe('capability-resolver archcontext-nodes-v2 export', () => {
  test('emits required node/v2 base fields and directory /** selectors', () => {
    const nodes = buildArchContextNodesV2(registry, { isExistingDirectory: directory });
    expect(nodes.map((node) => node.id)).toEqual([
      'capability.apps-web.account',
      'capability.apps-web.web',
      'capability.public-surface.root-router',
    ]);
    const webNode = nodes.find((node) => node.id === 'capability.apps-web.web')!;
    expect(webNode.schemaVersion).toBe('archcontext.node/v2');
    expect(webNode.name).toBe('Web');
    expect(webNode.status).toBe('active');
    expect(webNode.summary).toContain('apps-web/web');
    expect(webNode.responsibilities).toHaveLength(1);
    expect(webNode.source.include).toEqual(['apps/web/**']);
    expect(webNode.extensions.contractFiles).toEqual(web.contract_files);
    expect(nodes.find((node) => node.id === 'capability.public-surface.root-router')!.source.include).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });

  test('round-trips representative matches through archctx', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'capability-native-roundtrip-'));
    try {
      const nodes = buildArchContextNodesV2(registry, { isExistingDirectory: directory });
      mkdirSync(join(cwd, '.archcontext/model/nodes'), { recursive: true });
      copyFileSync(join(ROOT, '.archcontext/manifest.yaml'), join(cwd, '.archcontext/manifest.yaml'));
      for (const node of nodes) writeFileSync(join(cwd, `.archcontext/model/nodes/${node.id}.yaml`), JSON.stringify(node));
      execFileSync('git', ['init', '-q'], { cwd });
      execFileSync('git', ['add', '.'], { cwd });
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-q', '-m', 'model'], { cwd });
      const roundTrip = readArchcontextCapabilityAuthority(cwd);
      expect(roundTrip.status, JSON.stringify(roundTrip.diagnostics)).toBe('valid');
      if (roundTrip.status !== 'valid') throw new Error('round trip failed');
      expect(roundTrip.registry.capabilities).toEqual([...registry.capabilities].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      const paths = ['apps/web/src/routes/account/page.tsx', 'apps/web/other.ts', 'AGENTS.md', 'README.md'];
      const resolved = resolveArchcontextCapabilityPaths(cwd, roundTrip.owners, paths);
      expect(resolved.status).toBe('valid');
      for (const path of paths) {
        const legacy = findMatch(registry, cwd, path);
        const match = resolved.matches.find((entry) => entry.filePath === path);
        if (!legacy.matched) expect(resolved.unmappedPaths).toContain(path);
        else {
          expect(match?.capability.id).toBe(legacy.capability_id);
          expect(match?.prefix).toBe(`capability.${legacy.architecture_domain}.${legacy.architecture_capability}`);
        }
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test('CLI exports every self-host capability node as v2 without v1 compatibility output', () => {
    const result = spawnSync('bun', ['scripts/capability-resolver.ts', 'export', '--format', 'archcontext-nodes-v2', '--repo', '.'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const nodes = JSON.parse(result.stdout) as ArchContextNodeV2[];
    const modelIds = readArchitectureNativeContext(ROOT, { kind: 'worktree' }).capabilityProfiles
      .filter(profile => profile.status === 'active').map(profile => profile.nodeId).sort();
    expect(nodes.map(node => node.id).sort()).toEqual(modelIds);
    expect(nodes.every((node) => node.schemaVersion === 'archcontext.node/v2')).toBe(true);
    expect(nodes.flatMap((node) => node.source.include).some((include) => include.endsWith('/**'))).toBe(true);
    const rejected = spawnSync('bun', ['scripts/capability-resolver.ts', 'export', '--format', 'archcontext-boundaries-v1', '--repo', '.'], { cwd: ROOT, encoding: 'utf8' });
    expect(rejected.status).not.toBe(0);
  });
});

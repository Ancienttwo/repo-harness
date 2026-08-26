import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildArchContextNodesV2, findMatch, type ArchContextNodeV2 } from '../scripts/capability-resolver';
import { archcontextIncludeToPrefix, capabilityRegistryFromArchcontextNodes, type Capability, type CapabilityRegistry } from '../src/core/capabilities/registry';

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
  const matches = node.source.include.flatMap((include) => {
    const translated = archcontextIncludeToPrefix(include, { isExistingDirectory: directory });
    return translated.status === 'prefix' && (inputPath === translated.prefix || inputPath.startsWith(`${translated.prefix}/`)) ? [translated.prefix] : [];
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

  test('round-trips representative longest-prefix matches', () => {
    const nodes = buildArchContextNodesV2(registry, { isExistingDirectory: directory });
    const roundTrip = capabilityRegistryFromArchcontextNodes(nodes.map((value, index) => ({ path: `${index}.yaml`, value })), { repoRoot: ROOT, isExistingDirectory: directory });
    expect(roundTrip.status).toBe('valid');
    if (roundTrip.status === 'valid') expect(roundTrip.registry.capabilities).toEqual([...registry.capabilities].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    for (const path of ['apps/web/src/routes/account/page.tsx', 'apps/web/other.ts', 'AGENTS.md', 'README.md']) {
      const legacy = findMatch(registry, ROOT, path);
      const matches = nodes.flatMap((node) => {
        const prefix = prefixFromNode(node, path);
        return prefix ? [{ node, prefix }] : [];
      }).sort((left, right) => right.prefix.length - left.prefix.length);
      if (!legacy.matched) expect(matches).toHaveLength(0);
      else {
        expect(matches[0]!.node.id).toBe(`capability.${legacy.architecture_domain}.${legacy.architecture_capability}`);
        expect(matches[0]!.prefix).toBe(legacy.matched_prefix);
      }
    }
  });

  test('CLI exports all twenty self-host nodes as v2 without v1 compatibility output', () => {
    const result = spawnSync('bun', ['scripts/capability-resolver.ts', 'export', '--format', 'archcontext-nodes-v2', '--repo', '.'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const nodes = JSON.parse(result.stdout) as ArchContextNodeV2[];
    expect(nodes).toHaveLength(20);
    expect(nodes.every((node) => node.schemaVersion === 'archcontext.node/v2')).toBe(true);
    expect(nodes.flatMap((node) => node.source.include).some((include) => include.endsWith('/**'))).toBe(true);
    const rejected = spawnSync('bun', ['scripts/capability-resolver.ts', 'export', '--format', 'archcontext-boundaries-v1', '--repo', '.'], { cwd: ROOT, encoding: 'utf8' });
    expect(rejected.status).not.toBe(0);
  });
});

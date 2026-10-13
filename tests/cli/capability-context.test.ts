import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  runCapabilityContextStatus,
  runCapabilityContextSync,
} from '../../src/cli/commands/capability-context';
import type { Capability } from '../../src/core/capabilities/registry';

function tmpWorkspace(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)));
}

function writeRegistry(cwd: string, capabilities: Capability[]): void {
  fs.mkdirSync(path.join(cwd, '.ai/context'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, '.ai/context/capabilities.json'),
    `${JSON.stringify({ version: 1, capabilities }, null, 2)}\n`,
  );
}

const rootCapability: Capability = {
  id: 'public-surface-root-router',
  domain: 'public-surface',
  name: 'root-router',
  prefixes: ['AGENTS.md', 'CLAUDE.md'],
  contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
  architecture_module: 'docs/architecture/modules/public-surface/root-router.md',
  workstream_dir: 'tasks/workstreams/public-surface/root-router',
  lsp_profile: 'typescript-lsp',
  verification_hints: ['root check'],
};

const webCapability: Capability = {
  id: 'apps-web',
  domain: 'apps-web',
  name: 'web',
  prefixes: ['apps/web'],
  contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
  architecture_module: 'docs/architecture/modules/apps-web/web.md',
  workstream_dir: 'tasks/workstreams/apps-web/web',
  lsp_profile: 'typescript-lsp',
  verification_hints: ['bun test apps/web'],
};

const scriptCapability: Capability = {
  id: 'verification-codegraph-readiness',
  domain: 'verification',
  name: 'codegraph-readiness',
  prefixes: ['scripts/ensure-codegraph.sh'],
  contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
  architecture_module: 'docs/architecture/modules/verification/codegraph-readiness.md',
  workstream_dir: 'tasks/workstreams/verification/codegraph-readiness',
  lsp_profile: 'typescript-lsp',
  verification_hints: ['bash scripts/ensure-codegraph.sh --check --json'],
};

describe('capability-context command', () => {
  test('status reports normalized target paths', () => {
    const cwd = tmpWorkspace('capability-context-status');
    try {
      fs.mkdirSync(path.join(cwd, 'apps/web'), { recursive: true });
      writeRegistry(cwd, [rootCapability, webCapability]);

      const status = runCapabilityContextStatus(cwd);
      const web = status.capabilities.find((entry) => entry.id === 'apps-web')!;
      expect(web.target_contract_files).toEqual({
        agents: 'apps/web/AGENTS.md',
        claude: 'apps/web/CLAUDE.md',
      });
      expect(web.normalized).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('sync fails when no registered capability matches the path', () => {
    const cwd = tmpWorkspace('capability-context-unmatched');
    try {
      writeRegistry(cwd, [rootCapability]);
      expect(() => runCapabilityContextSync({ repo: cwd, inputPath: 'src/unowned.ts' })).toThrow(
        'no capability matches path: src/unowned.ts',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('sync applies manifest content, preserves manual text, and normalizes registry', () => {
    const cwd = tmpWorkspace('capability-context-sync');
    try {
      fs.mkdirSync(path.join(cwd, 'apps/web'), { recursive: true });
      writeRegistry(cwd, [rootCapability, webCapability]);
      fs.writeFileSync(
        path.join(cwd, '.ai/context/capability-source-map.json'),
        JSON.stringify(
          {
            version: 1,
            capabilities: {
              'apps-web': {
                positioning: 'Owns the web app routing and rendering surface.',
                source_map: [{ label: 'Routes', path: 'apps/web/src/routes', role: 'entrypoint' }],
                refresh_hints: ['bun test apps/web'],
              },
            },
          },
          null,
          2,
        ) + '\n',
      );
      fs.writeFileSync(
        path.join(cwd, 'apps/web/AGENTS.md'),
        [
          '# Existing Web Contract',
          '',
          '- Keep this manual rule.',
          '',
          '<!-- BEGIN ARCHITECTURE CONTRACT -->',
          'architecture block stays',
          '<!-- END ARCHITECTURE CONTRACT -->',
          '',
        ].join('\n'),
      );

      const result = runCapabilityContextSync({ repo: cwd, inputPath: 'apps/web/page.tsx', apply: true });
      expect(result.changes.map((change) => change.capability_id)).toEqual(['apps-web']);
      const agents = fs.readFileSync(path.join(cwd, 'apps/web/AGENTS.md'), 'utf-8');
      const claude = fs.readFileSync(path.join(cwd, 'apps/web/CLAUDE.md'), 'utf-8');
      expect(agents).toBe(claude);
      expect(agents).toContain('Keep this manual rule.');
      expect(agents).toContain('architecture block stays');
      expect(agents).toContain('Owns the web app routing and rendering surface.');
      expect(agents).toContain('<!-- BEGIN CAPABILITY CONTEXT -->');

      const registry = JSON.parse(fs.readFileSync(path.join(cwd, '.ai/context/capabilities.json'), 'utf-8'));
      expect(registry.capabilities.find((entry: Capability) => entry.id === 'apps-web').contract_files).toEqual({
        agents: 'apps/web/AGENTS.md',
        claude: 'apps/web/CLAUDE.md',
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('file prefixes target their directory and auto-fill writes a manifest fallback only when explicit', () => {
    const cwd = tmpWorkspace('capability-context-file-prefix');
    try {
      fs.mkdirSync(path.join(cwd, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'scripts/ensure-codegraph.sh'), '#!/bin/bash\n');
      writeRegistry(cwd, [rootCapability, scriptCapability]);

      const dryRun = runCapabilityContextSync({
        repo: cwd,
        capabilityId: 'verification-codegraph-readiness',
        apply: false,
        autoFillPositioning: true,
      });
      expect(dryRun.changes[0].target_contract_files).toEqual({
        agents: 'scripts/AGENTS.md',
        claude: 'scripts/CLAUDE.md',
      });
      expect(fs.existsSync(path.join(cwd, '.ai/context/capability-source-map.json'))).toBe(false);

      runCapabilityContextSync({
        repo: cwd,
        capabilityId: 'verification-codegraph-readiness',
        apply: true,
        autoFillPositioning: true,
      });
      expect(fs.existsSync(path.join(cwd, 'scripts/AGENTS.md'))).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(cwd, '.ai/context/capability-source-map.json'), 'utf-8'));
      expect(manifest.capabilities['verification-codegraph-readiness'].positioning).toContain(
        'verification-codegraph-readiness',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('archcontext sync writes an anchorless capability only to its declared files and refuses one without them', () => {
    const cwd = tmpWorkspace('capability-context-anchorless');
    try {
      fs.mkdirSync(path.join(cwd, '.ai/harness'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.ai/harness/policy.json'), JSON.stringify({ context: { capability_source: 'archcontext' } }));
      fs.mkdirSync(path.join(cwd, '.archcontext/model/nodes'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.archcontext/model/nodes/capability.probe.anchorless.yaml'), [
        'schemaVersion: archcontext.node/v2',
        'id: capability.probe.anchorless',
        'kind: capability',
        'name: Probe',
        'status: active',
        'summary: Probe files',
        'responsibilities:',
        '  - Own the probe files',
        'source:',
        '  include:',
        '    - "**/*.probe"',
        'extensions:',
        '  contractFiles:',
        '    agents: probes/AGENTS.md',
        '    claude: probes/CLAUDE.md',
        '  lspProfile: typescript-lsp',
        '  verification: []',
        '',
      ].join('\n'));
      const rootContext = '# Root Agent Context\n\nRepository-wide rules.\n';
      fs.writeFileSync(path.join(cwd, 'AGENTS.md'), rootContext);
      fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), rootContext);

      // The target is the declared contract files, not an anchor: the root files stay unchanged.
      runCapabilityContextSync({ repo: cwd, capabilityId: 'probe-anchorless', apply: true });
      expect(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf-8')).toBe(rootContext);
      expect(fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf-8')).toBe(rootContext);
      expect(fs.readFileSync(path.join(cwd, 'probes/AGENTS.md'), 'utf-8')).toContain('Probe files');

      // A node that declares no contract files is refused before any write.
      const nodePath = path.join(cwd, '.archcontext/model/nodes/capability.probe.anchorless.yaml');
      fs.writeFileSync(nodePath, fs.readFileSync(nodePath, 'utf-8').replace(/  contractFiles:\n    agents: probes\/AGENTS\.md\n    claude: probes\/CLAUDE\.md\n/, ''));
      fs.rmSync(path.join(cwd, 'probes'), { recursive: true, force: true });
      expect(() => runCapabilityContextSync({ repo: cwd, capabilityId: 'probe-anchorless', apply: true }))
        .toThrow('extensions.contractFiles.agents and extensions.contractFiles.claude are required');
      expect(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf-8')).toBe(rootContext);
      expect(fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf-8')).toBe(rootContext);
      expect(fs.existsSync(path.join(cwd, 'probes'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('CLI entrypoint registers capability-context status', () => {
    const cwd = tmpWorkspace('capability-context-entrypoint');
    try {
      writeRegistry(cwd, [rootCapability]);
      const res = spawnSync(
        'bun',
        [path.join(import.meta.dir, '../../src/cli/index.ts'), 'capability-context', 'status', '--repo', cwd, '--json'],
        { cwd, encoding: 'utf-8' },
      );
      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout).capabilities[0].id).toBe('public-surface-root-router');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('archcontext mode targets declared contract files and renders the node summary', () => {
    const cwd = archcontextWorkspace('capability-context-archcontext', [
      { id: 'capability.apps.web', include: 'apps/web/**', contractFiles: { agents: 'apps/web/AGENTS.md', claude: 'apps/web/CLAUDE.md' } },
    ]);
    try {
      const status = runCapabilityContextStatus(cwd);
      expect(status.registry_file).toBe('.archcontext/model/nodes');
      expect(status.capabilities[0]).toMatchObject({
        id: 'apps-web',
        target_contract_files: { agents: 'apps/web/AGENTS.md', claude: 'apps/web/CLAUDE.md' },
        normalized: true,
      });
      const result = runCapabilityContextSync({ repo: cwd, capabilityId: 'apps-web', apply: true });
      expect(result.changes[0]).toMatchObject({ registry_normalized: true, wrote_contracts: true });
      const agents = fs.readFileSync(path.join(cwd, 'apps/web/AGENTS.md'), 'utf-8');
      expect(agents).toBe(fs.readFileSync(path.join(cwd, 'apps/web/CLAUDE.md'), 'utf-8'));
      expect(agents).toContain('Summary of capability.apps.web.');
      expect(fs.existsSync(path.join(cwd, '.ai/context/capabilities.json'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('archcontext sync refuses a shared declared contract before it writes and the CLI prints why', () => {
    const cwd = archcontextWorkspace('capability-context-shared', [
      { id: 'capability.runtime.operator', include: 'src/core/operator/**', contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' } },
      { id: 'capability.runtime.other', include: 'src/core/other/**', contractFiles: { agents: 'AGENTS.md', claude: 'CLAUDE.md' } },
    ]);
    try {
      expect(() => runCapabilityContextSync({ repo: cwd, capabilityId: 'runtime-operator', apply: true })).toThrow('declares shared contract files AGENTS.md, CLAUDE.md');
      const res = spawnSync(
        'bun',
        [path.join(import.meta.dir, '../../src/cli/index.ts'), 'capability-context', 'sync', '--repo', cwd, '--capability', 'runtime-operator', '--apply'],
        { cwd, encoding: 'utf-8' },
      );
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('declares shared contract files AGENTS.md, CLAUDE.md');
      expect(res.stderr).toContain('No file was written.');
      for (const file of ['AGENTS.md', 'CLAUDE.md', 'src/core/operator/AGENTS.md', 'src/core/operator/CLAUDE.md']) {
        expect(fs.existsSync(path.join(cwd, file))).toBe(false);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test('archcontext sync refuses a contract file that another capability declares in the other slot', () => {
    const cwd = archcontextWorkspace('capability-context-cross-slot', [
      { id: 'capability.apps.web', include: 'apps/web/**', contractFiles: { agents: 'apps/web/AGENTS.md', claude: 'apps/web/CLAUDE.md' } },
      { id: 'capability.apps.docs', include: 'apps/docs/**', contractFiles: { agents: 'apps/docs/AGENTS.md', claude: 'apps/web/AGENTS.md' } },
    ]);
    try {
      const shared = '# Web contract\n';
      fs.writeFileSync(path.join(cwd, 'apps/web/AGENTS.md'), shared);
      for (const capabilityId of ['apps-web', 'apps-docs']) {
        expect(() => runCapabilityContextSync({ repo: cwd, capabilityId, apply: true })).toThrow('declares shared contract files');
      }
      expect(fs.readFileSync(path.join(cwd, 'apps/web/AGENTS.md'), 'utf-8')).toBe(shared);
      for (const file of ['apps/web/CLAUDE.md', 'apps/docs/AGENTS.md']) expect(fs.existsSync(path.join(cwd, file))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('CLI prints the message of a capability source error before it exits 2', () => {
    const cwd = archcontextWorkspace('capability-context-broken-node', []);
    try {
      fs.writeFileSync(path.join(cwd, '.archcontext/model/nodes/broken.yaml'), 'not: [valid\n');
      const res = spawnSync(
        'bun',
        [path.join(import.meta.dir, '../../src/cli/index.ts'), 'capability-context', 'status', '--repo', cwd],
        { cwd, encoding: 'utf-8' },
      );
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('.archcontext/model/nodes/broken.yaml');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

function archcontextWorkspace(
  prefix: string,
  nodes: Array<{ id: string; include: string; contractFiles: { agents: string; claude: string } }>,
): string {
  const cwd = tmpWorkspace(prefix);
  fs.mkdirSync(path.join(cwd, '.ai/harness'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({ context: { capability_source: 'archcontext' } })}\n`);
  fs.mkdirSync(path.join(cwd, '.archcontext/model/nodes'), { recursive: true });
  for (const node of nodes) {
    fs.mkdirSync(path.join(cwd, node.include.replace('/**', '')), { recursive: true });
    fs.writeFileSync(path.join(cwd, `.archcontext/model/nodes/${node.id}.yaml`), `${JSON.stringify({
      schemaVersion: 'archcontext.node/v2', id: node.id, kind: 'capability', name: node.id, status: 'active',
      summary: `Summary of ${node.id}.`, responsibilities: ['Own the fixture.'], source: { include: [node.include] },
      extensions: { contractFiles: node.contractFiles, lspProfile: 'typescript-lsp', verification: ['bun test'] },
    }, null, 2)}\n`);
  }
  return cwd;
}

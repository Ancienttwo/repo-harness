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
});

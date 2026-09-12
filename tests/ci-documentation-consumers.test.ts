import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverDocumentationConsumers } from '../scripts/ci-documentation-consumers';

const ROOT = join(import.meta.dir, '..');

describe('documentation consumer discovery', () => {
  test('follows checkout path aliases, relative reads, loops, wrappers and helper imports while excluding fixtures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-documentation-discovery-'));
    const fixtures: Record<string, string> = {
      'two-step.test.ts': `import { join } from 'path'; import { readFileSync as read } from 'fs'; const ROOT = join(import.meta.dir, '..'); const guide = join(ROOT, 'docs/guide.md'); read(guide);`,
      'cwd.test.ts': `const ROOT = process.cwd(); const guide = resolve(ROOT, 'tasks/todos.md'); readFileSync(guide);`,
      'named-guide.test.ts': `const CLI = join(import.meta.dir, '..', 'src/main.ts'); const temp = mkdtempSync('fixture'); readFileSync(join(temp, 'docs/existing.md'));`,
      'named-ledger-fixture.test.ts': `const CLI = join(import.meta.dir, '..', 'src/main.ts'); const temp = mkdtempSync('fixture'); readFileSync(join(temp, 'tasks/todos.md'));`,
      'generated-guide.test.ts': `const CLI = join(import.meta.dir, '..', 'src/main.ts'); const temp = mkdtempSync('fixture'); writeFileSync(join(temp, 'docs/existing.md'), '# Generated'); readFileSync(join(temp, 'docs/existing.md'));`,
      'checkout-write-read.test.ts': `const ROOT = join(import.meta.dir, '..'); writeFileSync(join(ROOT, 'docs/existing.md'), '# Changed'); readFileSync(join(ROOT, 'docs/existing.md'));`,
      'relative.test.ts': `readFileSync('plans/prds/example.md');`,
      'loop.test.ts': `const ROOT = join(import.meta.dir, '..'); const paths = ['README.md', 'docs/guide.md']; for (const file of paths) readFileSync(join(ROOT, file));`,
      'wrapper.test.ts': `const ROOT = join(import.meta.dir, '..'); function read(path: string) { return readFileSync(path); } read(join(ROOT, 'docs/guide.md'));`,
      'dynamic.test.ts': `const ROOT = join(import.meta.dir, '..'); const documentedFamily = 'docs/guide.md'; readFileSync(join(ROOT, selectedPath));`,
      'helpers/doc.ts': `readFileSync('docs/guide.md');`,
      'indirect.test.ts': `import { readGuide } from './helpers/doc'; readGuide();`,
      'fixture.test.ts': `const ROOT = join(import.meta.dir, '..'); readFileSync(join(ROOT, 'src/main.ts')); const dir = mkdtempSync('fixture'); readFileSync(join(dir, 'docs/guide.md'));`,
      'shadow.test.ts': `const ROOT = join(import.meta.dir, '..'); readFileSync(join(ROOT, 'src/main.ts')); function fixture() { const ROOT = mkdtempSync('fixture'); readFileSync(join(ROOT, 'docs/guide.md')); }`,
      'outside.test.ts': `const ROOT = join(import.meta.dir, '../..'); readFileSync(join(ROOT, 'docs/guide.md'));`,
      'comment.test.ts': `// readFileSync('docs/guide.md');\nreadFileSync('src/main.ts');`,
    };
    try {
      mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/existing.md'), '# Guide');
      writeFileSync(join(root, 'docs/guide.md'), '# Ignored local fixture document');
      mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/main.ts'), 'export {};');
      writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true }, include: ['tests/**/*.ts'] }));
      for (const [name, text] of Object.entries(fixtures)) {
        const path = join(root, 'tests', name); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text);
      }
      expect(await discoverDocumentationConsumers(root, new Set(['docs/existing.md', 'tasks/todos.md']))).toEqual([
        'tests/checkout-write-read.test.ts', 'tests/cwd.test.ts', 'tests/dynamic.test.ts', 'tests/indirect.test.ts', 'tests/loop.test.ts',
        'tests/named-guide.test.ts', 'tests/relative.test.ts', 'tests/two-step.test.ts', 'tests/wrapper.test.ts',
      ]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('workflow whole-file documentation coverage is exactly the discovered projection', async () => {
    const files = await discoverDocumentationConsumers(ROOT);
    const workflow = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as any;
    const command = workflow.jobs.documentation.steps.find((step: any) => step.name === 'Check documentation consumers')?.run;
    expect(typeof command).toBe('string');
    expect(command).not.toMatch(/(?:^|\s)(?:-t|--test-name-pattern)(?:\s|=)/);
    expect([...command.matchAll(/tests\/[\w/.-]+\.test\.tsx?/g)].map(match => match[0]).sort()).toEqual(files);
    for (const regression of [
      'tests/action-command-skills.test.ts', 'tests/archive-evidence-gates.test.ts',
      'tests/characterization/repair-campaign-authority-freeze.test.ts', 'tests/cli/documentation-contracts.test.ts',
      'tests/cli/mcp-setup.test.ts', 'tests/evidence-residue-scan.test.ts', 'tests/readme-dx.test.ts', 'tests/retired-planning-provider.test.ts',
      'tests/skill-surface/retired-names-scan.test.ts', 'tests/unit/collaboration-admission.test.ts',
      'tests/unit/collaboration-authority-baseline.test.ts', 'tests/unit/issue-282-automation-budget-prd-drift.test.ts',
    ]) expect(files).toContain(regression);
  }, 60_000);
});

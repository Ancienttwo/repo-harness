import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectCoverage } from '../scripts/select-ci-coverage';

const ROOT = resolve(import.meta.dir, '..');
const workflow = Bun.YAML.parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as any;

function runLane(lane: string, governanceExit: number, testExit: number) {
  const bin = mkdtempSync(join(tmpdir(), 'rh-ci-lane-'));
  try {
    writeFileSync(join(bin, 'bun'), `#!/bin/bash\nif [[ "$1" == test ]]; then echo FUNCTIONAL_TEST_EXECUTED; exit ${testExit}; fi\nexit 0\n`, { mode: 0o755 });
    writeFileSync(join(bin, 'npm'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'bash'), `#!/bin/bash\nif [[ "$1" == scripts/check-task-sync.sh ]]; then echo GOVERNANCE_EXECUTED; exit ${governanceExit}; fi\nexit 0\n`, { mode: 0o755 });
    return spawnSync('/bin/bash', ['scripts/check-ci.sh', lane], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUN_TEST_ISOLATE_FILES: '0', REPO_HARNESS_DIFF_BASE: 'HEAD' },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test('pure selector rejects malformed raw records and nonregular modes', () => {
  const sha = '1'.repeat(40);
  const input = { eventName: 'push', event: { before: sha }, headSha: sha, actualHead: sha };
  const record = `:100644 100644 ${sha} ${sha} M\0docs/example.md\0`;
  expect(selectCoverage({ ...input, diffRaw: record }).mode).toBe('docs');
  for (const diffRaw of [null, '', record.slice(0, -1), record + '\0', record.replace(' M\0', ' R100\0'), record.replace(sha, 'bad'), record.replace(':100644', ':120000'), record.replace(':100644', ':100755'), record.replace(':100644', ':160000'), record.replace(' M\0', ' A\0'), record.replace('docs/example.md', 'docs/../src/code.md')]) {
    expect(selectCoverage({ ...input, diffRaw }).mode).toBe('full');
  }
});

describe('CI independent governance and functional lanes', () => {
  test('a governance failure does not suppress the separate functional invocation', () => {
    const governance = runLane('governance', 19, 23);
    const functional = runLane('functional', 19, 23);
    expect(governance.status).toBe(19);
    expect(governance.stdout).not.toContain('FUNCTIONAL_TEST_EXECUTED');
    expect(functional.stdout).toContain('FUNCTIONAL_TEST_EXECUTED');
    expect(functional.stdout).not.toContain('GOVERNANCE_EXECUTED');
    expect(functional.status).toBe(23);
  });

  test('successful functional lane includes package smoke without governance', () => {
    const result = runLane('functional', 19, 0);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('FUNCTIONAL_TEST_EXECUTED');
    expect(result.stdout).toContain('[ci] package dry-run');
    expect(result.stdout).not.toContain('GOVERNANCE_EXECUTED');
  });

  test('invalid lane fails before installing or checking anything', () => {
    const result = runLane('typo', 0, 0);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain('[ci] install');
  });

  test('selection cannot make Governance suppress functional failure visibility', () => {
    const { jobs } = workflow;
    expect(jobs.governance.needs).toBeUndefined();
    expect(jobs.governance.if).toBeUndefined();
    for (const id of ['test', 'mcp-path-matrix', 'documentation']) {
      expect(jobs[id].needs).toBe('selection');
      expect(jobs[id].if).toBe(`needs.selection.outputs.mode == '${id === 'documentation' ? 'docs' : 'full'}'`);
      expect(jobs[id]['continue-on-error']).toBeUndefined();
    }
    for (const [id, lane] of [['governance', 'governance'], ['test', 'functional']]) {
      expect(jobs[id].steps.some((step: any) => step.run === `bash scripts/check-ci.sh ${lane}`)).toBe(true);
    }
    expect(jobs.selection.outputs.mode).toBe('${{ steps.select.outputs.mode }}');
    expect(jobs.selection.steps.find((step: any) => step.uses === 'actions/checkout@v4').with['fetch-depth']).toBe(0);
    expect(workflow.on.pull_request.types).toEqual(['opened', 'synchronize', 'reopened', 'ready_for_review', 'converted_to_draft']);
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(jobs.required.name).toBe('Required / CI');
    expect(jobs.required.if).toBe('always()');
    expect([...jobs.required.needs].sort()).toEqual(Object.keys(jobs).filter(id => id !== 'required').sort());
  });

  test('actual aggregate shell rejects every failed, cancelled or unintended omitted coverage combination', () => {
    const step = workflow.jobs.required.steps[0];
    expect(step.env).toEqual({
      SELECTION_RESULT: '${{ needs.selection.result }}',
      COVERAGE_MODE: '${{ needs.selection.outputs.mode }}',
      GOVERNANCE_RESULT: '${{ needs.governance.result }}',
      TEST_RESULT: '${{ needs.test.result }}',
      MATRIX_RESULT: '${{ needs.mcp-path-matrix.result }}',
      DOCUMENTATION_RESULT: '${{ needs.documentation.result }}',
      IS_DRAFT: "${{ github.event_name == 'pull_request' && github.event.pull_request.draft }}",
    });
    const statuses = ['success', 'failure', 'cancelled', 'skipped'];
    const lines = [`aggregate() {\n${step.run}\n}`];
    let cases = 0;
    // Exhaust the four coverage dispositions for each valid mode. Selection
    // failure is orthogonal and checked separately against valid coverage.
    const selection = 'success';
    for (const mode of ['full', 'docs'])
      for (const governance of statuses)
        for (const functional of statuses) for (const matrix of statuses) for (const docs of statuses) {
          const valid = selection === 'success' && governance === 'success' && (
            (mode === 'full' && functional === 'success' && matrix === 'success' && docs === 'skipped') ||
            (mode === 'docs' && functional === 'skipped' && matrix === 'skipped' && docs === 'success'));
          lines.push(`SELECTION_RESULT=${selection} GOVERNANCE_RESULT=${governance} TEST_RESULT=${functional} MATRIX_RESULT=${matrix} DOCUMENTATION_RESULT=${docs} COVERAGE_MODE='${mode}' IS_DRAFT=false`);
          lines.push(`if (aggregate) >/dev/null; then actual=0; else actual=1; fi; [ "$actual" = ${valid ? 0 : 1} ] || { echo 'case ${cases}'; exit 1; }`);
          cases++;
        }
    for (const selection of ['failure', 'cancelled', 'skipped', '']) {
      lines.push(`SELECTION_RESULT='${selection}' GOVERNANCE_RESULT=success TEST_RESULT=success MATRIX_RESULT=success DOCUMENTATION_RESULT=skipped COVERAGE_MODE=full IS_DRAFT=false`);
      lines.push('if (aggregate) >/dev/null; then echo selection-failure-accepted; exit 1; fi');
    }
    for (const mode of ['draft', '', 'unknown']) {
      lines.push(`SELECTION_RESULT=success GOVERNANCE_RESULT=success TEST_RESULT=success MATRIX_RESULT=success DOCUMENTATION_RESULT=success COVERAGE_MODE='${mode}' IS_DRAFT=false`);
      lines.push('if (aggregate) >/dev/null; then echo invalid-mode-accepted; exit 1; fi');
    }
    // A bad selector must not turn a draft into an accepted full/docs run.
    for (const [mode, functional, docs] of [['full', 'success', 'skipped'], ['docs', 'skipped', 'success']]) {
      lines.push(`SELECTION_RESULT=success GOVERNANCE_RESULT=success TEST_RESULT=${functional} MATRIX_RESULT=${functional} DOCUMENTATION_RESULT=${docs} COVERAGE_MODE=${mode} IS_DRAFT=true`);
      lines.push('if (aggregate) >/dev/null; then echo draft-accepted; exit 1; fi');
    }
    lines.push(`echo checked-${cases + 9}`);
    const result = spawnSync('/bin/bash', ['-s'], { input: lines.join('\n'), encoding: 'utf8', timeout: 60000 });
    expect(result.stdout.trim()).toBe('checked-521');
    expect(result.status).toBe(0);
  }, 60000);

  test('actual selector classifies complete PR and multi-commit push diffs conservatively', () => {
    const repo = mkdtempSync(join(tmpdir(), 'rh-ci-selection-'));
    const write = (path: string, content = 'text') => {
      mkdirSync(resolve(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), content);
    };
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    let checks = 0;
    try {
      git('init', '-q');
      git('config', 'user.name', 'CI fixture');
      git('config', 'user.email', 'ci@example.invalid');
      git('config', 'commit.gpgsign', 'false');
      write('docs/researches/base.md');
      write('src/base.ts');
      git('add', '.'); git('commit', '-qm', 'base');
      const base = git('rev-parse', 'HEAD');
      const commit = () => { git('add', '.'); git('commit', '-qm', 'change'); return git('rev-parse', 'HEAD'); };
      const select = (eventName: string, event: unknown, expected: string, head = git('rev-parse', 'HEAD')) => {
        const eventFile = join(repo, '.git/event.json');
        const outputFile = join(repo, '.git/output');
        writeFileSync(eventFile, JSON.stringify(event));
        writeFileSync(outputFile, '');
        const command = workflow.jobs.selection.steps.find((step: any) => step.id === 'select').run;
        const result = spawnSync('/bin/bash', ['-c', command.replace('scripts/select-ci-coverage.ts', `${ROOT}/scripts/select-ci-coverage.ts`)], {
          cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: eventName,
            GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputFile, GITHUB_SHA: head },
        });
        expect(result.status).toBe(0);
        expect(readFileSync(outputFile, 'utf8')).toBe(`mode=${expected}\n`);
        if (expected === 'draft') expect(result.stdout).toContain('Mark ready for review');
        expect(result.stdout).toContain('reason=');
        checks++;
      };
      const pr = (sha = base, draft: unknown = false) => ({ pull_request: { draft, base: { sha } } });
      select('pull_request', pr(), 'full'); // Empty diff is not a coverage waiver.
      for (const path of ['docs/researches/base.md', 'docs/architecture/modules/example.md', 'docs/architecture/index.md', 'docs/CHANGELOG.md']) write(path, 'updated');
      const docsHead = commit();
      select('pull_request', pr(), 'docs');
      select('push', { before: base }, 'docs');
      select('workflow_dispatch', {}, 'full');
      select('unexpected-event', {}, 'full');
      select('pull_request', pr(base, true), 'draft');
      select('pull_request', pr(base, 'false'), 'full');
      select('pull_request', {}, 'full');
      select('push', { before: '0'.repeat(40) }, 'full');
      select('push', { before: '1'.repeat(40) }, 'full');
      select('push', { before: '--invalid-option' }, 'full');
      select('push', { before: base }, 'full', base); // Checkout mismatch.
      rmSync(join(repo, 'docs/researches/base.md'));
      const deletionHead = commit();
      select('push', { before: docsHead }, 'docs');
      renameSync(join(repo, 'src/base.ts'), join(repo, 'docs/researches/moved.md'));
      const renameHead = commit();
      select('push', { before: deletionHead }, 'full');
      write('docs/researches/followup.md'); commit();
      select('push', { before: deletionHead }, 'full'); // Earlier code deletion in a multi-commit push.
      select('push', { before: renameHead }, 'docs');
      for (const path of ['.ai/harness/policy.json', 'agents/engineers/profiles/example.json', '.claude/templates/contract.md', 'assets/template.md', 'docs/reference-configs/policy.md', '.github/workflows/ci.yml', 'tests/example.test.ts', 'unknown/new-file', 'docs/researches/tool.ts', '.archcontext/model/node.yaml', 'deploy/runbook.md', 'AGENTS.md', 'CLAUDE.md']) {
        const before = git('rev-parse', 'HEAD');
        write(path); commit();
        select('push', { before }, 'full');
      }
      for (const path of ['plans/archive/old.md', 'tasks/archive/old.md', 'docs/architecture/requests/active.md', 'docs/architecture/snapshots/old.md', 'docs/researches/README.md', 'docs/repo-harness-chatgpt-browser-engine.md', 'docs/repo-harness-chatgpt-mcp-setup.md', 'README.md', 'docs/architecture/.projection-manifest.json', '.ai/harness/handoff/current.md']) {
        const before = git('rev-parse', 'HEAD');
        write(path); commit();
        select('push', { before }, 'docs');
      }
      git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
      const replay = spawnSync(process.execPath, [join(ROOT, 'scripts/replay-ci-coverage.ts'), '--since', '2000-01-01'], { cwd: repo, encoding: 'utf8' });
      expect(replay.status).toBe(0);
      const replayLines = replay.stdout.trim().split('\n');
      const summary = JSON.parse(replayLines.pop()!);
      expect(summary.refSha).toBe(git('rev-parse', 'origin/main'));
      expect(summary.commits).toBe(Number(git('rev-list', '--first-parent', '--count', 'origin/main')));
      expect(replayLines).toHaveLength(summary.commits);
      expect(summary.modes.docs).toBeGreaterThan(0);
      expect(summary.modes.full).toBeGreaterThan(0);
      expect(summary.reasons['invalid-diff-endpoint']).toBe(1);
      expect(replayLines.some(line => line.startsWith(`${renameHead}\tfull\tunclassified-path`))).toBe(true);
      const beforeLink = git('rev-parse', 'HEAD');
      symlinkSync('followup.md', join(repo, 'docs/researches/link.md')); commit();
      select('push', { before: beforeLink }, 'full');
      expect(checks).toBe(40);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

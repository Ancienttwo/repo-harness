import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.join(import.meta.dir, '..', '..');

function runHeartbeat(inbox: string, driftDir: string, workflowCmd: string, sprintCmd: string, sprintDir?: string) {
  return spawnSync('bash', ['scripts/maintenance-triage.sh', '--heartbeat', '--inbox', inbox], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      REPO_HARNESS_HEARTBEAT_WORKFLOW_CMD: workflowCmd,
      REPO_HARNESS_HEARTBEAT_SPRINT_CMD: sprintCmd,
      REPO_HARNESS_HEARTBEAT_DRIFT_DIR: driftDir,
      ...(sprintDir ? { REPO_HARNESS_HEARTBEAT_SPRINT_DIR: sprintDir } : {}),
    },
  });
}

describe('heartbeat triage', () => {
  test('appends one inbox entry per heartbeat run with workflow, sprint, drift, and adoption review fields', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'heartbeat-triage-'));
    try {
      const inbox = path.join(root, 'inbox.md');
      const driftDir = path.join(root, 'drift');
      mkdirSync(driftDir, { recursive: true });
      writeFileSync(path.join(driftDir, '20260612-a.md'), '# drift A\n');
      writeFileSync(path.join(driftDir, '20260612-b.md'), '# drift B\n');

      for (let i = 0; i < 3; i++) {
        const res = runHeartbeat(
          inbox,
          driftDir,
          "printf '[workflow] OK\\n'",
          "printf 'index: 6\\ntask: loop-engine-06-heartbeat-v0\\nmode: contract\\n'",
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('wrote triage entry');
      }

      const body = readFileSync(inbox, 'utf-8');
      expect((body.match(/^## Heartbeat/gm) ?? []).length).toBe(3);
      expect(body).toContain('- Workflow check: pass');
      expect(body).toContain('- Sprint next: loop-engine-06-heartbeat-v0');
      expect(body).toContain('- Drift requests: 2');
      expect(body).toContain('- Adoption review: scheduled for');
      expect(body).toContain('20260612-a.md');
      expect(body).toContain('20260612-b.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records failed probes without failing the heartbeat command', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'heartbeat-triage-fail-'));
    try {
      const inbox = path.join(root, 'inbox.md');
      const driftDir = path.join(root, 'drift');
      const sprintDir = path.join(root, 'sprints');
      mkdirSync(driftDir, { recursive: true });
      mkdirSync(sprintDir, { recursive: true });

      const res = runHeartbeat(
        inbox,
        driftDir,
        "printf 'workflow bad\\n'; exit 7",
        "printf 'no active sprint\\n'; exit 3",
        sprintDir,
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('workflow=fail');
      const body = readFileSync(inbox, 'utf-8');
      expect(body).toContain('- Workflow check: fail');
      expect(body).toContain('- Sprint next: (unavailable)');
      expect(body).toContain('workflow bad');
      expect(body).toContain('no active sprint');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('falls back to scanning executing sprint files when sprint-backlog next has no marker', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'heartbeat-triage-fallback-'));
    try {
      const inbox = path.join(root, 'inbox.md');
      const driftDir = path.join(root, 'drift');
      const sprintDir = path.join(root, 'sprints');
      mkdirSync(driftDir, { recursive: true });
      mkdirSync(sprintDir, { recursive: true });
      writeFileSync(
        path.join(sprintDir, '20260612-demo.sprint.md'),
        [
          '# Sprint: demo',
          '',
          '> **Status**: Executing',
          '',
          '## Backlog',
          '',
          '| # | Status | Task | Mode | Acceptance | Plan |',
          '|---|--------|------|------|------------|------|',
          '| 1 | [x] | done-task | contract | done | `plans/archive/done.md` |',
          '| 2 | [ ] | next-heartbeat-task | contract | next | (pending) |',
          '',
        ].join('\n'),
      );

      const res = runHeartbeat(
        inbox,
        driftDir,
        "printf '[workflow] OK\\n'",
        "printf 'sprint: (none)\\n'; exit 1",
        sprintDir,
      );

      expect(res.status).toBe(0);
      const body = readFileSync(inbox, 'utf-8');
      expect(body).toContain('- Sprint next: next-heartbeat-task');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('documents cron and loop scheduling surfaces', () => {
    const doc = readFileSync(path.join(ROOT, 'docs/reference-configs/heartbeat.md'), 'utf-8');
    const asset = readFileSync(path.join(ROOT, 'assets/reference-configs/heartbeat.md'), 'utf-8');
    expect(doc).toContain('Cron example');
    expect(doc).toContain('Loop example');
    expect(doc).toContain('adoption review');
    expect(asset).toBe(doc);
  });
});

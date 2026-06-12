import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';
import { ROUTES } from '../../src/cli/hook/route-registry';

const ROOT = path.join(import.meta.dir, '..', '..');

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('loop-engine row8 hook diet stretch', () => {
  test('keeps route-dispatched hook scripts at or below eight', () => {
    const dispatchedScripts = ROUTES.flatMap((route) => route.scripts);
    expect(dispatchedScripts).toHaveLength(8);
    expect(dispatchedScripts).toContain('session-start-context.sh');
    expect(dispatchedScripts).not.toContain('security-sentinel.sh');
  });

  test('keeps security sentinel as an internal SessionStart phase', () => {
    const sessionStart = read('assets/hooks/session-start-context.sh');
    expect(sessionStart).toContain('security_sentinel_context');
    expect(sessionStart).toContain('security-sentinel.sh');
    expect(sessionStart).toContain('REPO_HARNESS_SESSION_START_SECURITY');

    const settings = read('assets/hooks/settings.template.json');
    const codex = read('assets/hooks/codex.hooks.template.json');
    expect(settings.match(/session-start-context\.sh/g)?.length).toBe(1);
    expect(codex.match(/session-start-context\.sh/g)?.length).toBe(1);
    expect(settings).not.toContain('security-sentinel.sh');
    expect(codex).not.toContain('security-sentinel.sh');
  });

  test('keeps self-host and generated SessionStart hooks mirrored', () => {
    expect(read('.ai/hooks/session-start-context.sh')).toBe(
      read('assets/hooks/session-start-context.sh'),
    );
  });
});

import { lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { CHATGPT_CANONICAL_SKILL_NAME, validateCanonicalChatgptSkillRoot } from './source';

export type ChatgptSkillHost = 'codex' | 'claude';
export type ChatgptSkillTarget = ChatgptSkillHost | 'both';

export interface ChatgptSkillProjectionResult {
  status: 'ok';
  action: 'install' | 'uninstall';
  source: string;
  changed: string[];
  lines: string[];
}

interface Projection {
  host: ChatgptSkillHost;
  destination: string;
  state: 'missing' | 'owned';
}

function hosts(target: ChatgptSkillTarget): ChatgptSkillHost[] {
  if (target === 'both') return ['claude', 'codex'];
  return [target];
}

function lstatIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function symlinkTarget(destination: string): string {
  const raw = readlinkSync(destination);
  return realpathSync(resolve(dirname(destination), raw));
}

function assertOwnedProjection(destination: string, sourceReal: string): void {
  const stat = lstatIfPresent(destination);
  if (!stat?.isSymbolicLink()) {
    throw new Error(`refusing unowned ChatGPT Skill destination: ${destination}`);
  }
  let targetReal: string;
  try {
    targetReal = symlinkTarget(destination);
  } catch {
    throw new Error(`refusing broken or unreadable ChatGPT Skill symlink: ${destination}`);
  }
  if (targetReal !== sourceReal) {
    throw new Error(`refusing ChatGPT Skill symlink owned by another source: ${destination}`);
  }
}

function preflight(target: ChatgptSkillTarget, home: string, source: string): Projection[] {
  const sourceReal = realpathSync(source);
  return hosts(target).map((host) => {
    const root = join(home, host === 'codex' ? '.codex' : '.claude', 'skills');
    const destination = join(root, CHATGPT_CANONICAL_SKILL_NAME);
    const stat = lstatIfPresent(destination);
    if (!stat) return { host, destination, state: 'missing' };
    assertOwnedProjection(destination, sourceReal);
    return { host, destination, state: 'owned' };
  });
}

export function runChatgptSkillProjection(opts: {
  action: 'install' | 'uninstall';
  target?: ChatgptSkillTarget;
  dryRun?: boolean;
  home?: string;
}): ChatgptSkillProjectionResult {
  const source = validateCanonicalChatgptSkillRoot();
  const home = opts.home ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  if (!home) throw new Error('HOME is required to resolve ChatGPT Skill host roots');
  const target = opts.target ?? 'both';
  const projections = preflight(target, home, source);
  const changed: string[] = [];
  const lines: string[] = [];

  if (opts.dryRun) {
    for (const projection of projections) {
      const mutation = opts.action === 'install'
        ? (projection.state === 'owned' ? 'already installed' : 'would install')
        : (projection.state === 'owned' ? 'would uninstall' : 'already absent');
      lines.push(`[${projection.host}] ${mutation}: ${projection.destination}`);
    }
    return { status: 'ok', action: opts.action, source, changed, lines };
  }

  const applied: Projection[] = [];
  try {
    for (const projection of projections) {
      if (opts.action === 'install') {
        if (projection.state === 'owned') {
          lines.push(`[${projection.host}] already installed: ${projection.destination}`);
          continue;
        }
        mkdirSync(dirname(projection.destination), { recursive: true });
        symlinkSync(source, projection.destination, process.platform === 'win32' ? 'junction' : 'dir');
        applied.push(projection);
        changed.push(projection.destination);
        lines.push(`[${projection.host}] installed: ${projection.destination}`);
        continue;
      }
      if (projection.state === 'missing') {
        lines.push(`[${projection.host}] already absent: ${projection.destination}`);
        continue;
      }
      assertOwnedProjection(projection.destination, realpathSync(source));
      unlinkSync(projection.destination);
      applied.push(projection);
      changed.push(projection.destination);
      lines.push(`[${projection.host}] uninstalled: ${projection.destination}`);
    }
  } catch (error) {
    for (const projection of applied.reverse()) {
      if (opts.action === 'install') {
        try { unlinkSync(projection.destination); } catch { /* preserve original failure */ }
      } else {
        try { symlinkSync(source, projection.destination, process.platform === 'win32' ? 'junction' : 'dir'); } catch { /* preserve original failure */ }
      }
    }
    throw error;
  }

  return { status: 'ok', action: opts.action, source, changed, lines };
}

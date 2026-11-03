import { SESSION_OBSERVATION_MAX_BYTES, type SessionObservationFailure } from '../../core/sessions/session-selector';
import { gitExecFileSync } from '../git/runner';

export class SessionObservationError extends Error {
  constructor(readonly code: SessionObservationFailure) { super(code); }
}
export const refuseSessionObservation = (code: SessionObservationFailure): never => { throw new SessionObservationError(code); };

export function runSessionObservationGit(cwd: string, args: string[], allowNoMatch = false): string {
  try {
    const bytes = gitExecFileSync(['--no-pager', '-c', 'core.fsmonitor=false', ...args], {
      cwd, timeout: 5000, maxBuffer: SESSION_OBSERVATION_MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
    });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text;
  } catch (error) {
    if (allowNoMatch && (error as { status?: number }).status === 1) return '';
    if ((error as NodeJS.ErrnoException).code === 'ENOBUFS') return refuseSessionObservation('too_large');
    return refuseSessionObservation('unavailable');
  }
}

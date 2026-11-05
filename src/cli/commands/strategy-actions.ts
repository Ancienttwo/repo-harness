import { collectStrategyContext, validateStrategyRequest, strategyStatus, StrategySourceDriftError, REPOSITORY_PILOT_DOCUMENT, REPOSITORY_PILOT_READ_LIMITS } from '../../effects/strategy/context';
import { projectStrategySkill } from '../../effects/strategy/skill';
import type { StrategyCommandOptions } from './strategy';

function run(action: () => unknown): void {
  try { process.stdout.write(`${JSON.stringify(action())}\n`); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ status: error instanceof StrategySourceDriftError ? 'stale' : 'invalid', executionAuthorized: false, error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}

export function status(o: StrategyCommandOptions): void {
  run(() => strategyStatus(o.repo));
}

export function pilot(path: string | undefined, o: StrategyCommandOptions): void {
  run(() => {
    const options = { documentPath: REPOSITORY_PILOT_DOCUMENT,
      load: o.load, topics: o.topic, limits: REPOSITORY_PILOT_READ_LIMITS };
    if (!path) return collectStrategyContext(o.repo, options);
    const result = validateStrategyRequest(o.repo, path, options);
    if (result.status !== 'reviewable') process.exitCode = 1;
    return result;
  });
}

export function context(o: StrategyCommandOptions): void {
  run(() => collectStrategyContext(o.repo, { load: o.load, topics: o.topic }));
}

export function validate(path: string, o: StrategyCommandOptions): void {
  run(() => {
    const result = validateStrategyRequest(o.repo, path, { documentPath: o.document, load: o.load, topics: o.topic });
    if (result.status !== 'reviewable') process.exitCode = 1;
    return result;
  });
}

export function projectSkill(action: 'install' | 'uninstall', o: StrategyCommandOptions): void {
  run(() => projectStrategySkill({ action, target: o.target, dryRun: o.dryRun }));
}

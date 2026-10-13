import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { ArchitectureModelReader } from '../../effects/architecture/model-reader';
import { ModuleReadError } from '../../core/review/module-review-prompt';
import { decodeDocsAnchorsReport, decodeProjectionCheckFreshness } from '../../core/architecture/projection';

function output(json: boolean, read: () => { value: unknown; text: string }): void {
  try {
    const result = read();
    console.log(json ? JSON.stringify(result.value) : result.text);
  } catch (error) {
    const failure = error instanceof ModuleReadError ? error : new ModuleReadError('module_read_failed');
    console.log(JSON.stringify({ error: { code: failure.code, ...(failure.path ? { path: failure.path } : {}) } }));
    process.exitCode = 1;
  }
}

/** Reads one saved JSON result. Any read, parse or contract failure has the given code. */
function savedResult<T>(path: string | undefined, code: string, decode: (value: unknown) => T): T | undefined {
  if (path === undefined) return undefined;
  try { return decode(JSON.parse(readFileSync(path, 'utf8'))); }
  catch { throw new ModuleReadError(code); }
}

export function buildModuleCommand(): Command {
  const command = new Command('module').description('Read committed architecture facts and export a review prompt.');
  command.command('list').option('--json', 'Output JSON')
    .option('--projection-check <file>', 'Saved `architecture-projection check --json` output for HEAD; sets generated_summary')
    .action((options: { json?: boolean; projectionCheck?: string }) => output(options.json === true, () => {
      const freshness = savedResult(options.projectionCheck, 'projection_check_invalid', decodeProjectionCheckFreshness);
      const value = new ArchitectureModelReader(process.cwd()).list({ freshness });
      return { value, text: value.modules.map(module => `${module.id}\t${module.state.model_valid}\t${module.state.generated_summary}\t${module.state.section3}`).join('\n') };
    }));
  command.command('review-prompt').argument('<capability-id>').option('--json', 'Output JSON')
    .option('--shard <n>', 'Select one input shard', '1').option('--base <rev>', 'Diff base commit or ref').option('--head <rev>', 'Diff head commit or ref')
    .option('--projection-check <file>', 'Saved `architecture-projection check --json` output for HEAD; sets generated_summary')
    .option('--anchors <file>', 'Saved `architecture-projection anchors --json` output; adds a STALE CITATIONS section')
    .action((id: string, options: { json?: boolean; shard: string; base?: string; head?: string; projectionCheck?: string; anchors?: string }) => output(options.json === true, () => {
      if (!/^[1-9][0-9]*$/.test(options.shard)) throw new ModuleReadError('shard_out_of_range');
      if ((options.base === undefined) !== (options.head === undefined)) throw new ModuleReadError('diff_refs_required');
      for (const rev of [options.base, options.head]) if (rev?.startsWith('-')) throw new ModuleReadError('revision_invalid');
      const freshness = savedResult(options.projectionCheck, 'projection_check_invalid', decodeProjectionCheckFreshness);
      const anchors = savedResult(options.anchors, 'anchors_invalid', decodeDocsAnchorsReport);
      const value = new ArchitectureModelReader(process.cwd()).reviewPrompt(id, { shard: Number(options.shard), base: options.base, head: options.head, freshness, anchors });
      return { value, text: value.prompt };
    }));
  return command;
}

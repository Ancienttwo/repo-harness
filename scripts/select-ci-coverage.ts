import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export type CoverageInput = {
  eventName: string;
  event: unknown;
  headSha: string;
  actualHead: string;
  diffRaw: string | null;
};
export type CoverageSelection = { mode: 'full' | 'docs' | 'draft'; reason: string };
const shaPattern = /^[0-9a-f]{40}$/;
export function validSha(value: unknown): value is string {
  return typeof value === 'string' && shaPattern.test(value) && value !== '0'.repeat(40);
}

/** The documentation lane owns these paths; every other path keeps full coverage. */
export function isDocumentationPath(path: string): boolean {
  if (path.split('/').some(part => !part || part === '.' || part === '..')) return false;
  if (path.startsWith('docs/reference-configs/')) return false;
  return path === 'README.md'
    || path === 'docs/architecture/.projection-manifest.json'
    || path.startsWith('tasks/') || path.startsWith('plans/')
    || path.startsWith('.ai/harness/handoff/')
    || (path.startsWith('docs/') && path.endsWith('.md'));
}

export function diffBase(eventName: string, event: unknown): unknown {
  const payload = event as any;
  return eventName === 'pull_request' ? payload?.pull_request?.base?.sha : payload?.before;
}

export function selectCoverage(input: CoverageInput): CoverageSelection {
  const full = (reason: string): CoverageSelection => ({ mode: 'full', reason });
  const { eventName, event, headSha, actualHead, diffRaw } = input;
  if (eventName === 'workflow_dispatch') return full('manual-dispatch');
  if (!['pull_request', 'push'].includes(eventName)) return full('unknown-event');
  if (eventName === 'pull_request') {
    const draft = (event as any)?.pull_request?.draft;
    if (draft === true) return { mode: 'draft', reason: 'deferred-until-ready' };
    if (draft !== false) return full('invalid-draft-state');
  }
  if (!validSha(diffBase(eventName, event)) || !validSha(headSha)) return full('invalid-diff-endpoint');
  if (actualHead !== headSha) return full('checkout-mismatch');
  if (diffRaw === null) return full('diff-unavailable');
  if (!diffRaw) return full('empty-diff');
  if (!diffRaw.endsWith('\0')) return full('invalid-diff');
  const records = diffRaw.slice(0, -1).split('\0');
  if (records.length % 2) return full('invalid-diff');
  for (let index = 0; index < records.length; index += 2) {
    const metadata = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMD])$/.exec(records[index]!);
    if (!metadata) return full('invalid-diff');
    const [, oldMode, newMode, oldSha, newSha, status] = metadata;
    if (![oldMode, newMode].every(mode => mode === '100644' || mode === '000000')) return full('non-document-file-mode');
    if ((oldMode === '100644' && oldSha === '0'.repeat(40)) || (newMode === '100644' && newSha === '0'.repeat(40))) return full('invalid-diff');
    if ((status === 'A' && (oldMode !== '000000' || newMode !== '100644' || oldSha !== '0'.repeat(40)))
      || (status === 'D' && (oldMode !== '100644' || newMode !== '000000' || newSha !== '0'.repeat(40)))
      || (status === 'M' && (oldMode !== '100644' || newMode !== '100644')))
      return full('invalid-diff');
    if (!isDocumentationPath(records[index + 1]!)) return full('unclassified-path');
  }
  return { mode: 'docs', reason: 'documentation-only' };
}

function git(args: string[]): string | null {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

if (import.meta.main) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const headSha = process.env.GITHUB_SHA ?? '';
  let event: unknown;
  try { event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')); } catch { event = null; }
  const base = diffBase(eventName, event);
  const actualHead = git(['rev-parse', 'HEAD'])?.trim() ?? '';
  const diffRaw = validSha(base) && validSha(headSha) && actualHead === headSha
    ? git(['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base, headSha, '--']) : null;
  const result = selectCoverage({ eventName, event, headSha, actualHead, diffRaw });
  console.log(`mode=${result.mode}\nreason=${result.reason}`);
  if (result.mode === 'draft') console.log('Draft PR: expensive checks are deferred. Mark ready for review to run coverage; Required / CI remains blocked until then.');
  appendFileSync(process.env.GITHUB_OUTPUT!, `mode=${result.mode}\n`);
}

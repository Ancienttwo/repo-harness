import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { lstatSync } from 'node:fs';
import { assertObservationPath, observationReadFileSync, observationExecFileSync, currentReadonlyObservation, rejectObservation } from '../state/readonly-observation';

/** Git object identity only. No index, object store, ledger or code is written. */
function objectHash(type: 'blob' | 'tree', body: Buffer): Buffer {
  return createHash('sha1').update(`${type} ${body.length}\0`).update(body).digest();
}
interface Tree { entries: Map<string, Tree | { mode: string; hash: Buffer }> }
function hashTree(tree: Tree): Buffer {
  const entries = [...tree.entries].sort(([a, x], [b, y]) => Buffer.compare(Buffer.from(a + ('entries' in x ? '/' : '')), Buffer.from(b + ('entries' in y ? '/' : ''))));
  const parts = entries.map(([name, entry]) => {
    const mode = 'entries' in entry ? '40000' : entry.mode;
    const hash = 'entries' in entry ? hashTree(entry) : entry.hash;
    return Buffer.concat([Buffer.from(`${mode} ${name}\0`), hash]);
  });
  return objectHash('tree', Buffer.concat(parts));
}
export function captureReadonlyGitTree(root: string): string {
  const io = currentReadonlyObservation(); if (!io) throw new Error('Readonly Git tree requires an observation scope');
  const git = (args: string[]) => observationExecFileSync('git', ['-C', root, '--literal-pathspecs', ...args]) as Buffer;
  const format = git(['rev-parse', '--show-object-format']).toString().trim();
  if (format !== 'sha1') rejectObservation('Unsupported Git object format for bounded observation');
  // Transforming content without running repository filters needs a separate owner
  // adapter. Reject it rather than hash a different virtual tree.
  for (const key of ['core.autocrlf', 'core.symlinks']) {
    let value = '';
    try { value = git(['config', '--get', key]).toString().trim(); } catch {}
    if (key === 'core.autocrlf' && value && value !== 'false') rejectObservation('Git content conversion is unsupported in bounded observation');
    if (key === 'core.symlinks' && value === 'false') rejectObservation('Git symlink emulation is unsupported in bounded observation');
  }
  const text = (bytes: Buffer): string => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return rejectObservation('Unsupported Git path encoding'); }
  };
  const head = text(git(['ls-tree', '-rz', '--full-tree', 'HEAD']));
  const headModes = new Map<string, string>();
  for (const row of head.split('\0').filter(Boolean)) {
    const match = /^([0-9]+) \w+ [a-f0-9]+\t([\s\S]+)$/.exec(row);
    if (!match) rejectObservation('Malformed Git tree entry');
    headModes.set(match[2]!, match[1]!);
  }
  const paths = new Set([...headModes.keys(), ...text(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)]);
  let filemode = 'true'; try { filemode = git(['config', '--get', 'core.filemode']).toString().trim(); } catch {}
  const tree: Tree = { entries: new Map() };
  for (const path of [...paths].sort()) {
    assertObservationPath(join(root, path));
    let stat;
    try { stat = lstatSync(join(root, path)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (!stat.isFile()) rejectObservation('Unsupported Git source type in bounded observation');
    if (!headModes.has(path)) {
      try { git(['check-ignore', '--no-index', '-q', '--', path]); continue; }
      catch (error) { if ((error as {status?: number}).status !== 1) throw error; }
    }
    const attrs = git(['check-attr', '-z', 'filter', 'working-tree-encoding', 'text', 'eol', 'ident', '--', path]).toString().split('\0');
    for (let i = 2; i < attrs.length - 1; i += 3) if (attrs[i] !== 'unspecified' && attrs[i] !== 'unset') rejectObservation('Git attributes require a bounded conversion adapter');
    const hash = objectHash('blob', observationReadFileSync(join(root, path)));
    const mode = filemode === 'false' ? headModes.get(path) ?? '100644' : stat.mode & 0o111 ? '100755' : '100644';
    const segments = path.split('/'); let parent = tree;
    for (const segment of segments.slice(0, -1)) {
      let child = parent.entries.get(segment);
      if (!child) { child = { entries: new Map() }; parent.entries.set(segment, child); }
      if (!('entries' in child)) rejectObservation('Conflicting Git tree paths');
      parent = child;
    }
    parent.entries.set(segments.at(-1)!, { mode, hash });
  }
  return hashTree(tree).toString('hex');
}

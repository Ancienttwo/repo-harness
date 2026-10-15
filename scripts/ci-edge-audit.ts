import { posix } from 'node:path';
import { discoverPathReferences, sourceKey, sourceEvidence } from './ci-path-consumers';

type Graph = ReadonlyMap<string, ReadonlySet<string>>;
export type RemovedEdge = { dependency: string; consumer: string; reason: string };
export type DroppedWitness = { test: string; path: string[]; removedEdge: number; reason: string };

function matches(dependency: string, file: string, raw: string): boolean {
  const value = raw.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  const relative = posix.normalize(posix.join(posix.dirname(file), raw.replaceAll('\\', '/')));
  return value === dependency || dependency.startsWith(value + '/')
    || (dependency.split('/').at(-1)!.includes('.') && dependency.endsWith('/' + value))
    || [relative, `${relative}.ts`, `${relative}.tsx`, `${relative}/index.ts`, `${relative}/index.tsx`].includes(dependency);
}

/** Audit every boundary edge and retain one baseline path per dropped test. */
export async function auditDroppedTests(
  roots: readonly string[], dropped: readonly string[], baseline: Graph,
  current: { reverse: Graph; data: Graph },
  sources: ReadonlyMap<string, string>, previous: ReadonlyMap<string, string>,
): Promise<{ witnesses: DroppedWitness[]; edges: RemovedEdge[] }> {
  const parents = new Map<string, string | null>(roots.map(path => [path, null]));
  const queue = [...roots];
  for (let i = 0; i < queue.length; i++) {
    for (const next of baseline.get(queue[i]!) ?? []) if (!parents.has(next)) {
      parents.set(next, queue[i]!); queue.push(next);
    }
  }
  const references = await discoverPathReferences([...sources, ...previous]);
  const reasons = new Map<string, string>();
  const explain = (dependency: string, consumer: string): string => {
    const key = dependency + '\0' + consumer;
    if (reasons.has(key)) return reasons.get(key)!;
    const variants = [sources.get(consumer), previous.get(consumer)].filter((x): x is string => x !== undefined);
    let reason = 'unclassified';
    const candidates: string[] = [];
    for (const source of variants) {
      const refs = references.get(sourceKey(consumer, source)) ?? [];
      if (refs.some(ref => ref.operation === 'constructed' && dependency.startsWith(ref.path.replace(/\/$/, '') + '/'))) {
        candidates.push('directory-construction-only');
      }
      for (const match of source.matchAll(/['"`]([^'"`\r\n]+)['"`]/g)) {
        const raw = match[1]!;
        if (!matches(dependency, consumer, raw)) continue;
        const evidence = sourceEvidence.get(sourceKey(consumer, source))?.find(item => item.start <= match.index && item.end >= match.index + match[0].length);
        if (evidence) candidates.push(evidence.reason);
        else if (!/[\/\\]/.test(raw) && !/^[\w.-]+\.[\w]+$/.test(raw)) candidates.push('bare-fragment-not-path');
        else if (consumer.startsWith('src/') && !/import\.meta\.(?:dir|url)|__dirname/.test(source)) candidates.push('product-path-without-module-anchor');
        else candidates.push('unclassified');
      }
    }
    // One unexplained old edge source is enough to retain the review blocker.
    if (candidates.length && candidates.every(value => value !== 'unclassified')) reason = [...new Set(candidates)].sort().join('+');
    reasons.set(key, reason);
    return reason;
  };
  // Enumerate the complete cut from current reachability to excluded consumers.
  // Every old root-to-dropped-test path must cross this boundary. Checking all cut
  // edges prevents a harmless shortest path from hiding another real consumer.
  const reachable = new Set(roots), currentQueue = [...roots];
  for (const root of roots) for (const consumer of current.data.get(root) ?? []) {
    if (!reachable.has(consumer)) { reachable.add(consumer); currentQueue.push(consumer); }
  }
  for (let i = 0; i < currentQueue.length; i++) for (const consumer of current.reverse.get(currentQueue[i]!) ?? []) {
    if (!reachable.has(consumer)) { reachable.add(consumer); currentQueue.push(consumer); }
  }
  const forward = new Map<string, Set<string>>();
  for (const [dependency, consumers] of baseline) for (const consumer of consumers) {
    const entries = forward.get(consumer) ?? new Set<string>(); entries.add(dependency); forward.set(consumer, entries);
  }
  const ancestors = new Set(dropped), backward = [...dropped];
  for (let i = 0; i < backward.length; i++) for (const dependency of forward.get(backward[i]!) ?? []) {
    if (!ancestors.has(dependency)) { ancestors.add(dependency); backward.push(dependency); }
  }
  const rootSet = new Set(roots), edges: RemovedEdge[] = [];
  for (const [dependency, consumers] of baseline) {
    if (!reachable.has(dependency)) continue;
    for (const consumer of consumers) {
      if (!ancestors.has(consumer) || reachable.has(consumer)) continue;
      if (current.data.get(dependency)?.has(consumer)) {
        if (!rootSet.has(dependency)) edges.push({ dependency, consumer, reason: 'directory-data-not-transitive' });
      } else edges.push({ dependency, consumer, reason: explain(dependency, consumer) });
    }
  }
  const witnesses = dropped.map(test => {
    const path = [test];
    let node = test;
    while (parents.get(node)) { node = parents.get(node)!; path.unshift(node); }
    if (!parents.has(test) || reachable.has(test)) return { test, path, removedEdge: -1, reason: 'unclassified' };
    for (let i = 0; i + 1 < path.length; i++) {
      const dependency = path[i]!, consumer = path[i + 1]!;
      if (!reachable.has(dependency) || reachable.has(consumer)) continue;
      if (current.data.get(dependency)?.has(consumer)) {
        if (i === 0) continue;
        return { test, path, removedEdge: i, reason: 'directory-data-not-transitive' };
      }
      return { test, path, removedEdge: i, reason: explain(dependency, consumer) };
    }
    return { test, path, removedEdge: -1, reason: 'unclassified' };
  });
  return { witnesses, edges };
}

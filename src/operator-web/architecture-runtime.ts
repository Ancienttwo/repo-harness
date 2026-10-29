// Where a model node runs, read from the model's runtime topology on the map.
// A process node runs as itself; an external system runs outside the
// repository; any other node runs in the process that its nearest
// self-or-ancestor `deployed-on` relation names. The sequence and topology
// base maps share this one reading. It adds no fact to the map.

import type { ArchitectureMapV1 } from '../core/operator/architecture-map';

/** `deployment_undeclared`: no node on the parent chain is deployed on a process; `deployment_ambiguous`: the nearest one is deployed on two or more. */
export type RuntimePlacementReason = 'deployment_undeclared' | 'deployment_ambiguous';
export type RuntimePlacement =
  | { readonly kind: 'process'; readonly process: string }
  | { readonly kind: 'external' }
  | { readonly kind: 'unknown'; readonly reason: RuntimePlacementReason };

export function runtimePlacement(map: ArchitectureMapV1): (nodeId: string) => RuntimePlacement {
  const nodes = new Map(map.nodes.map(node => [node.id, node]));
  const deployed = new Map<string, Set<string>>();
  for (const relation of map.relations) {
    if (relation.kind !== 'deployed-on' || nodes.get(relation.target)?.kind !== 'process') continue;
    deployed.set(relation.source, (deployed.get(relation.source) ?? new Set()).add(relation.target));
  }
  const cache = new Map<string, RuntimePlacement>();
  return nodeId => {
    const cached = cache.get(nodeId);
    if (cached) return cached;
    const kind = nodes.get(nodeId)?.kind;
    let placement: RuntimePlacement = { kind: 'unknown', reason: 'deployment_undeclared' };
    if (kind === 'process') placement = { kind: 'process', process: nodeId };
    else if (kind === 'external-system') placement = { kind: 'external' };
    else {
      // The decoder refuses parent cycles, so the walk ends at a top-level node.
      for (let cursor: string | null = nodeId; cursor !== null; cursor = nodes.get(cursor)?.parent ?? null) {
        const targets = deployed.get(cursor);
        if (targets === undefined) continue;
        placement = targets.size === 1 ? { kind: 'process', process: [...targets][0]! } : { kind: 'unknown', reason: 'deployment_ambiguous' };
        break;
      }
    }
    cache.set(nodeId, placement);
    return placement;
  };
}

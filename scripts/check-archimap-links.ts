#!/usr/bin/env bun
/**
 * Checks the module document links of the committed architecture map.
 *
 * measure.ts gives `modules[].docs` from the projection manifest; this check reads
 * that output and does not parse the model again. A link under docs/architecture/modules/
 * whose file is gone is dead. A `modules[].docs` path without a link is missing.
 * Stdout: `{"dead":[...],"missing":[...]}`. Exit 0 when both lists are empty,
 * 1 when one is not, 2 when the map or the measure output cannot be read.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

const MAP = 'docs/architecture/archimap.html';
const MODULE_DOCS = 'docs/architecture/modules/';
const MEASURE = 'assets/skills/repo-harness-archimap/scripts/measure.ts';
const MODEL = '.archcontext/model/nodes';

export interface ArchimapLinkDrift { dead: string[]; missing: string[] }

/** Paths are repository-relative. `exists` answers for a repository-relative path. */
export function archimapLinkDrift(html: string, docs: string[], exists: (path: string) => boolean): ArchimapLinkDrift {
  const links = new Set<string>();
  // Bun's HTML parser reads every attribute spelling: quotes, spaces around =, case.
  new HTMLRewriter().on('a[href]', { element(anchor) {
    const href = anchor.getAttribute('href')!.trim();
    if (/^[a-z][a-z0-9+.-]*:|^[#/]/i.test(href)) return;
    const path = posix.normalize(posix.join(posix.dirname(MAP), href.split(/[?#]/)[0]!));
    if (path.startsWith(MODULE_DOCS)) links.add(path);
  } }).transform(html);
  return {
    dead: [...links].filter(path => !exists(path)).sort(),
    missing: [...new Set(docs)].filter(path => !links.has(path)).sort(),
  };
}

function measuredDocs(): string[] {
  const run = spawnSync(process.execPath, [MEASURE, '--map', MAP, '--model', MODEL], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`measure.ts exited ${run.status}: ${run.stderr.trim()}`);
  const modules: unknown = JSON.parse(run.stdout).modules;
  if (!Array.isArray(modules)) throw new Error('measure.ts output has no modules array');
  return modules.flatMap((module, i) => {
    const docs: unknown = module?.docs;
    if (!Array.isArray(docs) || docs.some(path => typeof path !== 'string')) throw new Error(`measure.ts modules[${i}].docs is not a string array`);
    return docs as string[];
  });
}

if (import.meta.main) {
  try {
    const drift = archimapLinkDrift(readFileSync(MAP, 'utf8'), measuredDocs(), existsSync);
    console.log(JSON.stringify(drift));
    for (const path of drift.dead) console.error(`[archimap] dead module document link: ${path}`);
    for (const path of drift.missing) console.error(`[archimap] modules[].docs path has no link in ${MAP}: ${path}`);
    process.exit(drift.dead.length + drift.missing.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(`[archimap] link check gave no result: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

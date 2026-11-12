#!/usr/bin/env bun
/**
 * One changelog fragment for each PR: `docs/changelog.d/<issue>.<category>.md`. (#2660)
 *
 * Two PRs write two different paths, so `docs/CHANGELOG.md` cannot make a PR conflict. This
 * module owns the path form, the parser and the section renderer. Two consumers share them:
 * `assemble` writes the released section at the release prep and deletes the fragments, and
 * `check-changelog-released-sections.ts` fails a merge result that keeps an `## [Unreleased]`
 * heading or holds a path under the fragment directory that does not parse.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CHANGELOG = 'docs/CHANGELOG.md';
export const FRAGMENT_DIR = 'docs/changelog.d';
/** The path form that every error names, so a writer who follows the old practice gets the instruction. */
export const FRAGMENT_PATH_FORM = 'docs/changelog.d/<issue>.<category>.md';
/** The sub-headings of a released section, in the order that `assemble` writes them. */
export const CATEGORIES = ['breaking', 'added', 'changed', 'fixed', 'removed', 'documentation', 'tests', 'upgrade', 'rollback'] as const;
export type ChangelogCategory = (typeof CATEGORIES)[number];

const HEADINGS: Record<ChangelogCategory, string> = {
  breaking: 'Breaking', added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed',
  documentation: 'Documentation', tests: 'Tests', upgrade: 'Upgrade', rollback: 'Rollback',
};

/** A released section heading `## [x.y.z]`, from the start of its line to the end of that line. */
export const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\][^\r\n]*/gm;

export interface ChangelogFragment {
  /** The path form of the fragment, relative to the repository root. */
  readonly path: string;
  readonly issue: number;
  readonly category: ChangelogCategory;
  /** The bullet block, byte for byte, without its trailing newlines. */
  readonly block: string;
}

function fragmentPathFault(path: string): Error {
  return new Error(`${path} is not a changelog fragment: the path form is ${FRAGMENT_PATH_FORM}, with <issue> the issue number of the PR and <category> one of ${CATEGORIES.join(', ')}`);
}

/** Parses one fragment. The bullet bytes are kept as they are: the assembler rewrites nothing. */
export function parseFragment(path: string, text: string): ChangelogFragment {
  const match = /^docs\/changelog\.d\/(\d+)\.([a-z]+)\.md$/u.exec(path);
  if (!match || !(CATEGORIES as readonly string[]).includes(match[2]!)) throw fragmentPathFault(path);
  const block = text.replace(/\n+$/u, '');
  if (!block.startsWith('- ')) throw new Error(`${path} has no "- " bullet line: write each entry as one "- " line (the path form is ${FRAGMENT_PATH_FORM})`);
  return { path, issue: Number(match[1]!), category: match[2] as ChangelogCategory, block };
}

/** The fragment paths that a root holds, sorted. A missing directory holds none. */
export function fragmentPaths(root: string): string[] {
  const dir = join(root, FRAGMENT_DIR);
  return existsSync(dir) ? readdirSync(dir).sort().map((name) => `${FRAGMENT_DIR}/${name}`) : [];
}

/**
 * The released section of one version: its categories in the constant order, and issue order inside a category.
 * A section writes its bullets on consecutive lines, as every section of `docs/CHANGELOG.md` already does.
 */
export function renderSection(version: string, date: string, fragments: readonly ChangelogFragment[]): string {
  const blocks = CATEGORIES.flatMap((category) => {
    const entries = fragments.filter((fragment) => fragment.category === category).sort((left, right) => left.issue - right.issue);
    return entries.length === 0 ? [] : [`### ${HEADINGS[category]}\n\n${entries.map((entry) => entry.block).join('\n')}\n`];
  });
  return `## [${version}] - ${date}\n\n${blocks.join('\n')}\n`;
}

export interface AssembleResult {
  readonly version: string;
  readonly section: string;
  readonly removed: readonly string[];
}

/**
 * Writes `## [<version>] - <date>` above the newest released section from the fragments, then deletes
 * them. It fails with no fragment, with a fragment that does not parse, and with a section that already
 * exists. It reads no clock: the date is an input.
 */
export function assemble(input: { readonly version: string; readonly date: string; readonly root?: string }): AssembleResult {
  const { version, date } = input;
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error(`the version must be x.y.z, not ${JSON.stringify(version)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error(`the date must be YYYY-MM-DD, not ${JSON.stringify(date)}`);
  const root = resolve(input.root ?? process.cwd());
  const file = join(root, CHANGELOG);
  const text = readFileSync(file, 'utf8');
  const headings = [...text.matchAll(VERSION_HEADING)];
  if (headings.some((heading) => heading[1] === version)) throw new Error(`${CHANGELOG} already has a section for ${version}`);
  const paths = fragmentPaths(root);
  if (paths.length === 0) throw new Error(`${FRAGMENT_DIR} holds no fragment for ${version}: each PR writes its entry in ${FRAGMENT_PATH_FORM}`);
  const fragments = paths.map((path) => parseFragment(path, readFileSync(join(root, path), 'utf8')));
  const section = renderSection(version, date, fragments);
  const at = headings[0]?.index;
  if (at === undefined) throw new Error(`${CHANGELOG} has no "## [x.y.z]" heading to put the ${version} section above`);
  writeFileSync(file, `${text.slice(0, at)}${section}${text.slice(at)}`);
  for (const path of paths) unlinkSync(join(root, path));
  return { version, section, removed: paths };
}

const USAGE = 'Usage: bun scripts/changelog-fragments.ts assemble --version <x.y.z> --date <YYYY-MM-DD>';

if (import.meta.main) {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  const refuse = (message: string): never => {
    process.stderr.write(`${message}\n`);
    process.exit(2);
  };
  let fault: string | null = args[0] === 'assemble' && args.length % 2 === 1 ? null : USAGE;
  for (let index = 1; fault === null && index < args.length; index += 2) {
    const name = args[index]!;
    const value = args[index + 1]!;
    if (!['--version', '--date'].includes(name) || value.startsWith('-') || values.has(name)) fault = USAGE;
    else values.set(name, value);
  }
  const version = values.get('--version') ?? refuse(fault ?? USAGE);
  const date = values.get('--date') ?? refuse(fault ?? USAGE);
  try {
    const result = assemble({ version, date });
    console.log(`[changelog] wrote ## [${result.version}] from ${result.removed.length} fragment(s) and deleted them: ${result.removed.join(', ')}`);
  } catch (thrown) {
    process.stderr.write(`[changelog] ${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    process.exit(1);
  }
}

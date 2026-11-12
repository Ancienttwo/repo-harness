#!/usr/bin/env bun
/**
 * Fails when a PR changes the bytes of a released `docs/CHANGELOG.md` section. (#2622)
 *
 * The check reads the merge result of the PR base and the head, not the merge
 * base of the branch. A branch that started before a release commit keeps its
 * `[Unreleased]` entry in context lines that git now places inside the released
 * section: that merge is clean, `Required / CI` is green, and main then claims a
 * release holds a change it does not hold. A new version section (release PR)
 * passes. There is no bypass switch.
 *
 * The same merge result must follow the fragment form (#2660): no `## [Unreleased]`
 * heading, and every path under `docs/changelog.d/` parses. Each PR writes its entry
 * in `docs/changelog.d/<issue>.<category>.md`, so the changelog cannot make two PRs
 * conflict, and the error text here is the instruction that reaches a writer who
 * still adds an `[Unreleased]` entry.
 */
import { spawnSync } from 'node:child_process';
import { CHANGELOG, FRAGMENT_DIR, FRAGMENT_PATH_FORM, parseFragment } from './changelog-fragments';

// A released section starts at its version heading and ends at the next version heading.
const SECTION_HEADING = /^## \[(\d+\.\d+\.\d+)\][^\r\n]*/gm;
const UNRELEASED_HEADING = /^## \[Unreleased\]/m;
const TREE_OID = /^[0-9a-f]{40}$/;
const MAX_BUFFER = 64 * 1024 * 1024;

/** The bytes of each released section, keyed by its version. */
export type ReleasedSections = ReadonlyMap<string, string>;

/** How a released section of the base differs from the merge result. */
export type SectionDrift = { readonly version: string; readonly reason: 'changed' | 'removed' };

export interface ReleasedSectionReport {
  readonly baseSha: string;
  readonly headSha: string;
  readonly mergeTree: string;
  readonly sectionsAtBase: number;
  readonly drift: readonly SectionDrift[];
  /** The merge result keeps an `## [Unreleased]` heading, or a path under the fragment directory does not parse. */
  readonly fragmentFaults: readonly string[];
}

function git(repoRoot: string, args: readonly string[]) {
  return spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: repoRoot, encoding: 'utf8', maxBuffer: MAX_BUFFER });
}

function gitOrFail(repoRoot: string, args: readonly string[]): string {
  const result = git(repoRoot, args);
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr?.trim() || `exit ${result.status}`}`);
  return result.stdout ?? '';
}

const commitOf = (repoRoot: string, ref: string): string | null =>
  git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).stdout?.trim() || null;

/** The bytes of every released section: from its heading to the next version heading, or to the end of the file. */
export function releasedSections(text: string): ReleasedSections {
  const headings = [...text.matchAll(SECTION_HEADING)];
  const sections = new Map<string, string>();
  for (const [index, heading] of headings.entries()) {
    const version = heading[1]!;
    // Two sections for one version make "the bytes of that section" ambiguous, so the check fails closed.
    if (sections.has(version)) throw new Error(`${CHANGELOG} has two sections for version ${version}`);
    sections.set(version, text.slice(heading.index!, headings[index + 1]?.index ?? text.length));
  }
  return sections;
}

/** The base sections that the merge result does not hold with the same bytes. */
export function sectionDrift(baseText: string, mergedText: string): SectionDrift[] {
  const merged = releasedSections(mergedText);
  const drift: SectionDrift[] = [];
  for (const [version, bytes] of releasedSections(baseText)) {
    const after = merged.get(version);
    if (after === undefined) drift.push({ version, reason: 'removed' });
    else if (after !== bytes) drift.push({ version, reason: 'changed' });
  }
  return drift;
}

/**
 * The tree of `git merge-tree --write-tree --name-only`: tree OID, conflicted paths, a blank line, then messages.
 * A conflicted merge fails closed: no section of a partial tree is evidence, and a conflict anywhere can move the
 * CHANGELOG hunk, so the check never compares against a conflict result.
 */
function mergeResult(repoRoot: string, baseSha: string, headSha: string): { tree: string } {
  const result = git(repoRoot, ['merge-tree', '--write-tree', '--name-only', baseSha, headSha]);
  if (result.error) throw new Error(`git merge-tree failed: ${result.error.message}`);
  if (result.status !== 0 && result.status !== 1) throw new Error(`git merge-tree ${baseSha} ${headSha} failed: ${result.stderr?.trim() || `exit ${result.status}`}`);
  const lines = (result.stdout ?? '').replace(/\n$/u, '').split('\n');
  const tree = lines[0] ?? '';
  if (!TREE_OID.test(tree)) throw new Error(`git merge-tree ${baseSha} ${headSha} printed no tree OID`);
  if (result.status === 0) return { tree };
  const separator = lines.indexOf('', 1);
  if (separator < 0) throw new Error(`git merge-tree ${baseSha} ${headSha} reported a conflict without a message separator, so its conflicted paths are unknown`);
  const conflicts = lines.slice(1, separator);
  // Exit 1 with no named path is still a conflict result: the paths are unknown, not empty.
  if (conflicts.length === 0) throw new Error(`git merge-tree ${baseSha} ${headSha} reported a conflict and named no path`);
  throw new Error(`the merge result of ${baseSha} and ${headSha} conflicts in ${conflicts.join(', ')}; resolve the branch and push it again`);
}

/** The committed bytes of one path, or null when that revision does not hold it. */
function fileAt(repoRoot: string, revision: string, path: string): string | null {
  if (!gitOrFail(repoRoot, ['ls-tree', '--name-only', revision, '--', path]).trim()) return null;
  return gitOrFail(repoRoot, ['cat-file', '-p', `${revision}:${path}`]);
}

/**
 * The fragment faults of the merge result: an `## [Unreleased]` heading, and each path under the
 * fragment directory that does not parse. A path outside that form is the old practice, so the
 * parser's error names the path form and this text repeats it.
 */
function fragmentFaults(repoRoot: string, tree: string, changelog: string): string[] {
  const faults: string[] = [];
  if (UNRELEASED_HEADING.test(changelog)) {
    faults.push(`${CHANGELOG} keeps an "## [Unreleased]" heading; each PR writes its entry in ${FRAGMENT_PATH_FORM} and the release prep assembles the section`);
  }
  const listing = gitOrFail(repoRoot, ['ls-tree', '-r', '--name-only', tree, '--', FRAGMENT_DIR]).split('\n').filter(Boolean);
  for (const path of listing) {
    try {
      parseFragment(path, fileAt(repoRoot, tree, path) ?? '');
    } catch (thrown) {
      faults.push(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }
  return faults;
}

/** Compares every released section at the base with the merge result of the base and the head. */
export function checkReleasedSections(base: string, head = 'HEAD', repoRoot = process.cwd()): ReleasedSectionReport {
  const baseSha = commitOf(repoRoot, base);
  if (!baseSha) throw new Error(`base ${JSON.stringify(base)} is not a commit in ${repoRoot}; fetch it before this check`);
  const headSha = commitOf(repoRoot, head);
  if (!headSha) throw new Error(`head ${JSON.stringify(head)} is not a commit in ${repoRoot}`);
  const { tree } = mergeResult(repoRoot, baseSha, headSha);
  const mergedText = fileAt(repoRoot, tree, CHANGELOG) ?? '';
  const faults = fragmentFaults(repoRoot, tree, mergedText);
  const baseText = fileAt(repoRoot, baseSha, CHANGELOG);
  if (baseText === null) return { baseSha, headSha, mergeTree: tree, sectionsAtBase: 0, drift: [], fragmentFaults: faults };
  const drift = sectionDrift(baseText, mergedText);
  return { baseSha, headSha, mergeTree: tree, sectionsAtBase: releasedSections(baseText).size, drift, fragmentFaults: faults };
}

/** The error text that names the fault and the fix. */
export function driftMessage(report: ReleasedSectionReport): string {
  const sections = report.drift.map(({ version, reason }) => `${version} (${reason})`).join(', ');
  return `the merge result of ${report.baseSha} and ${report.headSha} does not keep the bytes of the ${CHANGELOG} section(s) released at the base: ${sections}.`
    + ' A git merge placed an entry inside a released section, most often an [Unreleased] entry of a branch that started before a release commit.'
    + ` Rebase the branch on the base and move the entry into ${FRAGMENT_PATH_FORM}. A correction of released notes goes through a release PR or a fragment that names the correction.`;
}

/** The error text of each fragment fault, one message. */
export function fragmentMessage(report: ReleasedSectionReport): string {
  return `the merge result of ${report.baseSha} and ${report.headSha} does not follow the changelog fragment form: ${report.fragmentFaults.join('; ')}.`;
}

const USAGE = 'Usage: bun scripts/check-changelog-released-sections.ts --base <git-ref> [--head <git-ref>]';

if (import.meta.main) {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  let error: string | null = args.length === 0 || args.length % 2 === 1 ? USAGE : null;
  for (let index = 0; !error && index < args.length; index += 2) {
    const name = args[index]!;
    const value = args[index + 1]!;
    if (!['--base', '--head'].includes(name) || value.startsWith('-') || values.has(name)) error = USAGE;
    else values.set(name, value);
  }
  const base = values.get('--base');
  if (!base) error ??= USAGE;
  if (!base || error) {
    process.stderr.write(`${error ?? USAGE}\n`);
    process.exit(2);
  }
  try {
    const report = checkReleasedSections(base, values.get('--head') ?? 'HEAD');
    if (report.drift.length > 0) process.stderr.write(`[changelog] ${driftMessage(report)}\n`);
    if (report.fragmentFaults.length > 0) process.stderr.write(`[changelog] ${fragmentMessage(report)}\n`);
    if (report.drift.length > 0 || report.fragmentFaults.length > 0) process.exit(1);
    console.log(`[changelog] all ${report.sectionsAtBase} released sections of ${CHANGELOG} keep their bytes in the merge result ${report.mergeTree}, and its fragments follow ${FRAGMENT_PATH_FORM}.`);
  } catch (thrown) {
    process.stderr.write(`[changelog] ${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    process.exit(1);
  }
}

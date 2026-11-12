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
import { CHANGELOG, FRAGMENT_DIR, FRAGMENT_PATH_FORM, parseFragment, VERSION_HEADING } from './changelog-fragments';

// A released section starts at its version heading and ends at the next version heading.
const SECTION_HEADING = VERSION_HEADING;
/**
 * The text above the first released section. A file with no version heading is all preamble, which is
 * how a file that holds only the title reads.
 */
export function changelogPreamble(text: string): string {
  const first = [...text.matchAll(VERSION_HEADING)][0];
  return text.slice(0, first?.index ?? text.length);
}

/**
 * The preamble with the retired `## [Unreleased]` block removed. A base that still holds the heading is
 * the one difference the byte rule allows: the cutover that retires it deletes the heading and its
 * entries, which move into fragments. Every other byte, prose included, is compared as it stands.
 */
export function withoutUnreleasedSection(preamble: string): string {
  const kept: string[] = [];
  let inside = false;
  for (const line of preamble.split('\n')) {
    if (/^## \[/u.test(line)) inside = line.startsWith('## [Unreleased]');
    if (!inside) kept.push(line);
  }
  // The cutover deletes the block and keeps the blank line that separates the preamble from the first
  // released section. Those kept lines always end with that blank line, so normalizing the trailing
  // newlines to one blank separator gives exactly the bytes the cutover produces. A base with no
  // `[Unreleased]` block gives back its own bytes.
  return kept.join('\n').replace(/\n+$/u, '\n\n');
}
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
  /** Text above the first released section other than the preamble, or a path under the fragment directory that does not parse. */
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
 * The fragment faults of the merge result. Two rules:
 *
 * 1. The text above the first released section must be byte-equal to the same text at the base, or to
 *    that text with the retired `## [Unreleased]` block removed. Both allowed forms come from the base,
 *    so every other byte, prose included, must match. This one rule replaces a list of rejected line
 *    prefixes: an added sentence, a `* ` bullet or an indented heading all change bytes.
 * 2. Each path under the fragment directory must parse.
 */
function fragmentFaults(repoRoot: string, tree: string, changelog: string, baseText: string | null): string[] {
  const faults: string[] = [];
  const merged = changelogPreamble(changelog);
  const base = baseText === null ? '' : changelogPreamble(baseText);
  // One rule, two allowed forms, both taken from the base: the text is unchanged, or it is the base with
  // the retired `## [Unreleased]` block removed by the cutover. Any other text is an authoring act, so an
  // added sentence, a `* ` bullet, an indented heading or a re-created `[Unreleased]` heading all fail.
  if (merged !== base && merged !== withoutUnreleasedSection(base)) {
    faults.push(`${CHANGELOG} changes the text above its first released section, and each PR writes its entry in ${FRAGMENT_PATH_FORM} instead; the release prep assembles the section`);
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
  const baseText = fileAt(repoRoot, baseSha, CHANGELOG);
  const faults = fragmentFaults(repoRoot, tree, mergedText, baseText);
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

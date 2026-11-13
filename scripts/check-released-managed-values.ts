#!/usr/bin/env bun
/**
 * Rebuilds the released managed values from the release tags and fails when
 * `assets/released-managed-values.v1.json` differs. (#2708)
 *
 * update and upgrade may change a managed value only when it equals a value
 * that a release rendered. This list is that proof. The tags are the only
 * authority: the script reads each renderer at its tag and the file is a
 * projection of it. `--write` regenerates the file.
 *
 * Bash renderers run from a scratch copy of the tag (`scripts/lib` and the
 * assets they read), so their output is the released output. TypeScript
 * renderers are read statically: each one must match a pinned source shape,
 * and an unknown shape fails closed until the extractor learns it.
 *
 * Fingerprint: `sha256:` + hex SHA-256 of the UTF-8 text. A whole file is its
 * bytes. A marker block is its BEGIN line through its END line joined by "\n",
 * with no trailing newline (the unit that `upsertManagedBlock` compares).
 */
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const RELEASED_MANAGED_VALUES_PATH = 'assets/released-managed-values.v1.json';
const SCHEMA = 'repo-harness.released-managed-values.v1';
const FIRST_RELEASE = 'v0.1.2';
const MAX_BUFFER = 256 * 1024 * 1024;

export const MANAGED_PACKAGE_SCRIPT_KEYS = ['check:brain', 'check:context-files', 'check:deploy-sql', 'sync:brain'] as const;
/** A valid custom reporting instruction that no released template contains. */
export const CUSTOM_INSTRUCTION_SENTINEL = '{{custom-reporting-instruction}}';
const FOLLOW_INSTRUCTION = "Use the user's language for reports; keep technical terms in English.";
const PRESET_INSTRUCTIONS = {
  follow: FOLLOW_INSTRUCTION,
  'zh-CN': 'Use Chinese to report to user.',
  en: 'Use English to report to user.',
} as const;
const LANGUAGE_LINE = /^- Use the user's language for reports; keep technical terms in English\.$/m;

export interface ReleasedManagedValues {
  readonly schema: typeof SCHEMA;
  readonly releases: readonly string[];
  /** Exact values per managed key in package.json `scripts`. */
  readonly packageScripts: Readonly<Record<string, readonly string[]>>;
  /** Whole-file fingerprints of `docs/reference-configs/<doc id>.md`: stubs and the pre-stub full copies. */
  readonly referenceConfigs: Readonly<Record<string, readonly string[]>>;
  readonly projectGitignoreBlock: {
    readonly blocks: readonly string[];
    /**
     * A block whose content ends with "\n\n" + header + "\n" + a non-empty, in-order
     * subset of `rules` is managed when the block without that section is in `bases`.
     */
    readonly retiredSection: { readonly header: string; readonly rules: readonly string[]; readonly bases: readonly string[] } | null;
  };
  readonly userExcludesBlock: { readonly blocks: readonly string[] };
  readonly globalRulesBlock: {
    /** Blocks rendered for the presets follow, zh-CN and en. */
    readonly blocks: readonly string[];
    /** Blocks that record a custom instruction, rendered with `customInstructionSentinel` as that instruction. */
    readonly customInstructionSentinel: string;
    readonly customInstructionBlocks: readonly string[];
    /**
     * Unmarked sections of the released template, keyed by heading line. A `#` section runs to
     * the next heading; a `##` section runs to the next `#` or `##` heading; headings inside
     * fences do not count; trailing blank lines are dropped.
     */
    readonly legacySections: Readonly<Record<string, readonly string[]>>;
  };
}

export function fingerprint(text: string | Buffer): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function blockFingerprint(rendered: string): string {
  return fingerprint(rendered.replace(/\n+$/, ''));
}

function git(repoRoot: string, args: readonly string[], input?: Buffer) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: repoRoot, maxBuffer: MAX_BUFFER, input });
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim() || `exit ${result.status}`}`);
  return result.stdout;
}

function semver(tag: string): readonly number[] {
  return tag.slice(1).split('.').map(Number);
}

function compareTags(a: string, b: string): number {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}

/** Stable release tags `vX.Y.Z` from the first release that renders a managed value. */
export function releaseTags(repoRoot: string): string[] {
  const tags = git(repoRoot, ['tag', '--list', 'v*']).toString().split('\n').filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  if (!tags.includes(FIRST_RELEASE)) throw new Error(`release tag ${FIRST_RELEASE} is missing; fetch the tags (git fetch --tags)`);
  return tags.filter((tag) => compareTags(tag, FIRST_RELEASE) >= 0).sort(compareTags);
}

class TagTree {
  private readonly files: ReadonlySet<string>;

  constructor(private readonly repoRoot: string, readonly tag: string) {
    this.files = new Set(git(repoRoot, ['ls-tree', '-r', '--name-only', tag]).toString().split('\n').filter(Boolean));
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  private readonly blobs = new Map<string, Buffer>();

  readBytes(path: string): Buffer {
    if (!this.blobs.has(path)) this.blobs.set(path, git(this.repoRoot, ['cat-file', 'blob', `${this.tag}:${path}`]));
    return this.blobs.get(path)!;
  }

  read(path: string): string {
    return this.readBytes(path).toString('utf8');
  }

  first(paths: readonly string[]): string | null {
    return paths.find((path) => this.has(path)) ?? null;
  }

  markdownNames(dir: string): string[] {
    return [...this.files].filter((path) => path.startsWith(`${dir}/`) && path.endsWith('.md') && !path.slice(dir.length + 1).includes('/'))
      .map((path) => path.slice(dir.length + 1)).sort();
  }

  /** Writes the listed paths of the tag below `dir`, with their repository layout. */
  materialize(dir: string, paths: readonly string[]): void {
    const present = paths.filter((path) => this.has(path) || [...this.files].some((file) => file.startsWith(`${path}/`)));
    if (present.length === 0) return;
    const archive = git(this.repoRoot, ['archive', '--format=tar', this.tag, '--', ...present]);
    const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive, maxBuffer: MAX_BUFFER });
    if (tar.status !== 0) throw new Error(`tar failed for ${this.tag}: ${tar.stderr.toString().trim()}`);
  }
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** The source of a top-level function, from its declaration line to the first line that is exactly `}`. */
function functionSource(source: string, name: string): string | null {
  const start = source.search(new RegExp(`^(?:export )?function ${name}\\(`, 'm'));
  if (start < 0) return null;
  const end = source.indexOf('\n}\n', start);
  return end < 0 ? null : source.slice(start, end + 2);
}

function stringConstant(source: string, name: string): string | null {
  const match = source.match(new RegExp(`^(?:export )?const ${name}(?:: string)? =\\s*(['"])(.*?)\\1;$`, 'm'));
  return match ? match[2]! : null;
}

function requireValue<T>(value: T | null | undefined, tag: string, what: string): T {
  if (value === null || value === undefined) throw new Error(`${tag}: ${what} not found; extend ${RELEASED_MANAGED_VALUES_PATH} extraction`);
  return value;
}

function requirePinned(tag: string, what: string, source: string, pins: ReadonlySet<string>): void {
  const digest = sha(source);
  if (!pins.has(digest)) throw new Error(`${tag}: unknown ${what} source (sha256 ${digest}); teach scripts/check-released-managed-values.ts this renderer`);
}

// ---------------------------------------------------------------------------
// Package scripts
// ---------------------------------------------------------------------------

const PACKAGE_SCRIPT_RENDERERS = ['scripts/lib/project-init-lib.sh', 'src/core/adoption/standard-plan.ts', 'src/effects/adoption/standard-plan.ts'];

function packageScriptValues(tree: TagTree, into: Map<string, Set<string>>): void {
  for (const path of PACKAGE_SCRIPT_RENDERERS) {
    if (!tree.has(path)) continue;
    const source = tree.read(path);
    for (const key of MANAGED_PACKAGE_SCRIPT_KEYS) {
      // `"key": "value"` in an object literal or heredoc, `["key"] = "value"` in an assignment.
      const pattern = new RegExp(`"${key}"(?:\\s*:|\\]\\s*=)\\s*"([^"]*)"`, 'g');
      for (const match of source.matchAll(pattern)) into.get(key)!.add(match[1]!);
    }
  }
}

// ---------------------------------------------------------------------------
// Bash renderers, run from a scratch copy of the tag
// ---------------------------------------------------------------------------

const BASH_PATHS = ['scripts/lib', 'assets/templates/runtime.gitignore', 'assets/skill-version.json', 'assets/reference-configs', 'assets/workflow-contract.v1.json'];

/**
 * The extras follow the callers of `pi_ensure_gitignore_block`: the factor-factory entry when the plan
 * enables it, and in the helper-wrapper releases the helper entries unless the repo is the source repo or
 * pins the helper source. Stubs cover every name a full documentation profile renders.
 */
const BASH_DRIVER = String.raw`
set -u
. scripts/lib/project-init-lib.sh >/dev/null 2>&1
declare -F pi_default_runtime_block >/dev/null || exit 90
mkdir -p out/gitignore out/stubs
factor="$(pi_factor_factory_gitignore_entries)" || exit 91
[ -n "$factor" ] || exit 91
pi_default_runtime_block "" > out/gitignore/plain || exit 92
pi_default_runtime_block "$factor" > out/gitignore/factor || exit 92
if declare -F pi_helper_wrapper_gitignore_entries >/dev/null; then
  helper="$(pi_helper_wrapper_gitignore_entries assets/workflow-contract.v1.json)" || exit 93
  [ -n "$helper" ] || exit 93
  pi_default_runtime_block "$helper" > out/gitignore/helper || exit 92
  pi_default_runtime_block "$factor"$'\n'"$helper" > out/gitignore/factor-helper || exit 92
fi
if declare -F pi_write_reference_config_stub >/dev/null; then
  for file in assets/reference-configs/*.md; do
    name="\${file##*/}"
    case "$name" in AGENTS.md|CLAUDE.md) continue ;; esac
    pi_write_reference_config_stub "out/stubs/$name" "$name" "$PWD/assets/reference-configs" >/dev/null || exit 94
  done
fi
`.replace(/\\\$\{/g, '${');

interface BashRenders {
  readonly gitignoreBlocks: readonly string[];
  /** Stub text per file name; null when the tag predates stubs. */
  readonly stubs: ReadonlyMap<string, string> | null;
}

function runBash(dir: string): Promise<{ readonly status: number | null; readonly stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn('bash', ['-c', BASH_DRIVER], { cwd: dir, env: { PATH: process.env.PATH ?? '', HOME: dir }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', fail);
    child.on('close', (status) => done({ status, stderr }));
  });
}

async function runBashRenderers(tree: TagTree, scratch: string): Promise<BashRenders> {
  const dir = join(scratch, tree.tag);
  mkdirSync(dir, { recursive: true });
  tree.materialize(dir, BASH_PATHS);
  const result = await runBash(dir);
  if (result.status !== 0) throw new Error(`${tree.tag}: bash renderer driver failed with exit ${result.status}: ${result.stderr.trim()}`);
  const gitignoreDir = join(dir, 'out/gitignore');
  const gitignoreBlocks = readdirSync(gitignoreDir).sort().map((name) => readFileSync(join(gitignoreDir, name), 'utf8'));
  const stubDir = join(dir, 'out/stubs');
  const stubNames = readdirSync(stubDir).sort();
  const stubs = stubNames.length === 0 ? null : new Map(stubNames.map((name) => [name, readFileSync(join(stubDir, name), 'utf8')]));
  rmSync(dir, { recursive: true, force: true });
  return { gitignoreBlocks, stubs };
}

// ---------------------------------------------------------------------------
// TypeScript renderers, read statically with pinned source shapes
// ---------------------------------------------------------------------------

const STANDARD_PLAN_PATHS = ['src/effects/adoption/standard-plan.ts', 'src/core/adoption/standard-plan.ts'];
const REFERENCE_STUB_PINS = new Set<string>([
  '29b009a2c44a9af4281aca4262e344212bce313b9fa2988cb01d0070d79e7071', // v0.10.0 to v0.32.0
]);

function referenceStubRenderer(tree: TagTree): ((docId: string) => string) | null {
  const path = tree.first(STANDARD_PLAN_PATHS);
  if (!path) return null;
  const source = functionSource(tree.read(path), 'referenceStub');
  if (!source) return null;
  requirePinned(tree.tag, 'referenceStub', source, REFERENCE_STUB_PINS);
  const literal = requireValue(source.match(/return (`[\s\S]*`);\n\}/)?.[1], tree.tag, 'referenceStub template');
  // The pinned function body is `const docId = name.replace(/\.md$/, ""); return <template literal>;`.
  return new Function('docId', `return ${literal};`) as (docId: string) => string;
}

const MANAGED_BLOCK_PATHS = ['src/core/adoption/managed-block.ts', 'src/effects/managed-block.ts'];
const GITIGNORE_PLAN_PATHS = ['src/effects/adoption/gitignore-plan.ts', 'src/core/adoption/gitignore-plan.ts'];
const RENDER_MANAGED_BLOCK_PINS = new Set<string>(['8c07c726f7f9ae9f54043a2695208c593646330078cca596d2dfe82d22dc1a57']); // v0.6.0 to v0.32.0
const MANAGED_BLOCK_MARKER_PINS = new Set<string>(['46f2c52a082bacb96b98a41581cff06f052246ec9b8c7b5b942693b482a471c3']); // v0.6.0 to v0.32.0
const GITIGNORE_CONTENT_PINS = new Set<string>([
  '09b13d3a2a5e6f03e2c1c3c003d88889fe610d8b1b8dbf35f7417054137a2ae9', // v0.6.0 to v0.25.0: [base, extra]
  '0c251fe179d1848983f348d441f3518bb64b99c70746ec78f69180a1ae1f7f23', // v0.25.1 to v0.32.0: [base, retired, extra]
]);
const HELPER_GITIGNORE_PINS = new Set<string>(['ae7eda2820f24b88f5f15794d81d56be55289edd81ff65a4ec26f60973f28f6b']); // v0.6.0 to v0.8.2

function renderManagedBlockFor(tree: TagTree): ((marker: string, content: string) => string) | null {
  const path = tree.first(MANAGED_BLOCK_PATHS);
  if (!path) return null;
  const source = tree.read(path);
  requirePinned(tree.tag, 'renderManagedBlock', requireValue(functionSource(source, 'renderManagedBlock'), tree.tag, 'renderManagedBlock'), RENDER_MANAGED_BLOCK_PINS);
  requirePinned(tree.tag, 'managedBlockMarker', requireValue(functionSource(source, 'managedBlockMarker'), tree.tag, 'managedBlockMarker'), MANAGED_BLOCK_MARKER_PINS);
  return (marker, content) => [`# BEGIN: ${marker}`, content.trimEnd(), `# END: ${marker}`].join('\n');
}

/** `GITIGNORE_MANAGED_BLOCK_CONTENT`: an inline string array joined by "\n", or the runtime.gitignore asset. */
function gitignoreBaseContent(tree: TagTree, source: string): string {
  const inline = source.match(/^export const GITIGNORE_MANAGED_BLOCK_CONTENT = \[\n([\s\S]*?)\n\]\.join\("\\n"\);$/m);
  if (inline) {
    const items = JSON.parse(`[${inline[1]!.replace(/,\s*$/, '')}]`) as unknown;
    if (!Array.isArray(items) || !items.every((item) => typeof item === 'string')) throw new Error(`${tree.tag}: GITIGNORE_MANAGED_BLOCK_CONTENT is not a string array`);
    return items.join('\n');
  }
  const asset = /^export const GITIGNORE_MANAGED_BLOCK_CONTENT = readFileSync\(\n {2}join\(import\.meta\.dir, "(?:\.\.\/)+assets\/templates\/runtime\.gitignore"\), "utf8",\n\)\.trimEnd\(\);$/m;
  if (asset.test(source)) return tree.read('assets/templates/runtime.gitignore').trimEnd();
  throw new Error(`${tree.tag}: unknown GITIGNORE_MANAGED_BLOCK_CONTENT shape`);
}

/** The helper-wrapper extra content of `repo-harness adopt`, from the tag's workflow contract. */
function helperGitignoreContent(tree: TagTree): string | null {
  const path = 'src/core/adoption/helper-wrapper-plan.ts';
  if (!tree.has(path)) return null;
  const source = requireValue(functionSource(tree.read(path), 'helperWrapperGitignoreContent'), tree.tag, 'helperWrapperGitignoreContent');
  requirePinned(tree.tag, 'helperWrapperGitignoreContent', source, HELPER_GITIGNORE_PINS);
  const contract = JSON.parse(tree.read('assets/workflow-contract.v1.json')) as { helpers: { compatibilityDirectory?: string; scripts: string[] } };
  const directory = contract.helpers.compatibilityDirectory ?? 'scripts';
  return ['# repo-harness generated helper wrappers', ...contract.helpers.scripts.map((name) => `${directory}/${name}`), `${directory}/repo-harness/`].join('\n');
}

interface TsGitignore {
  readonly blocks: readonly string[];
  readonly retired: { readonly header: string; readonly rules: readonly string[] } | null;
  readonly userExcludesBlock: string | null;
}

function retiredRules(tree: TagTree): readonly string[] {
  const source = tree.read('src/effects/upgrade/legacy-inventory.ts');
  const list = requireValue(source.match(/^export const RETIRED_RUNTIME_IGNORE_RULES: readonly string\[\] = \[\n([\s\S]*?)\n\];$/m)?.[1], tree.tag, 'RETIRED_RUNTIME_IGNORE_RULES');
  const rules = JSON.parse(`[${list.replace(/'/g, '"').replace(/,\s*$/, '')}]`) as unknown;
  if (!Array.isArray(rules) || !rules.every((rule) => typeof rule === 'string')) throw new Error(`${tree.tag}: RETIRED_RUNTIME_IGNORE_RULES is not a string array`);
  return rules;
}

function tsGitignore(tree: TagTree): TsGitignore | null {
  const path = tree.first(GITIGNORE_PLAN_PATHS);
  if (!path) return null;
  const render = requireValue(renderManagedBlockFor(tree), tree.tag, 'renderManagedBlock');
  const source = tree.read(path);
  const marker = requireValue(stringConstant(source, 'GITIGNORE_MANAGED_BLOCK_MARKER'), tree.tag, 'GITIGNORE_MANAGED_BLOCK_MARKER');
  const contentSource = requireValue(functionSource(source, 'gitignoreManagedBlockContent'), tree.tag, 'gitignoreManagedBlockContent');
  requirePinned(tree.tag, 'gitignoreManagedBlockContent', contentSource, GITIGNORE_CONTENT_PINS);
  const base = gitignoreBaseContent(tree, source);
  const helper = helperGitignoreContent(tree);
  const blocks = [render(marker, base)];
  if (helper !== null) blocks.push(render(marker, [base, helper].join('\n\n')));
  const retired = contentSource.includes('RETIRED_RUNTIME_HEADER')
    ? { header: requireValue(stringConstant(source, 'RETIRED_RUNTIME_HEADER'), tree.tag, 'RETIRED_RUNTIME_HEADER'), rules: retiredRules(tree) }
    : null;
  let userExcludesBlock: string | null = null;
  const excludesMarker = stringConstant(source, 'RUNTIME_STATE_IGNORE_MARKER');
  if (excludesMarker !== null) {
    const asset = /^export const RUNTIME_STATE_IGNORE_CONTENT = readFileSync\(\n {2}join\(import\.meta\.dir, "(?:\.\.\/)+assets\/templates\/runtime-state\.gitignore"\), "utf8",\n\)\.trimEnd\(\);$/m;
    if (!asset.test(source) || !/^ {4}content: RUNTIME_STATE_IGNORE_CONTENT,$/m.test(source)) throw new Error(`${tree.tag}: unknown runtime-state ignore block shape`);
    userExcludesBlock = render(excludesMarker, tree.read('assets/templates/runtime-state.gitignore').trimEnd());
  }
  return { blocks, retired, userExcludesBlock };
}

// ---------------------------------------------------------------------------
// Global rules block
// ---------------------------------------------------------------------------

type RulesRecipe = 'plain' | 'self-note' | 'self-note-label' | 'encoded';
const GLOBAL_RULES_PATHS = ['src/cli/installer/global-context.ts', 'src/cli/commands/init.ts'];
const GLOBAL_RULES_TEMPLATE = 'assets/reference-configs/global-working-rules.md';
/** sha256 of the joined renderer functions -> recipe. */
const GLOBAL_RULES_PINS = new Map<string, RulesRecipe>([
  ['cd25bf3ee55960081d0b0fee4f965831cf6f6aca2176fbed7f2908e77a5fd97b', 'plain'], // v0.2.0 to v0.8.4
  ['2e1909c2d21b7e27e71bfde5deb96938113851a99e7aa295690a8b6b1e2b2158', 'self-note'], // v0.8.5 to v0.18.0
  ['cad35faf2f0c0a6225751574c67f3e1bf47af82b1c9f50147851ef37ace0890c', 'self-note-label'], // v0.19.0 to v0.23.1
  ['786ef373e9441dea24e8201e98fa5cc4b1bbc9eacdd743df07773fda1b2696d8', 'encoded'], // v0.24.0 to v0.32.0
]);
const RULES_FUNCTIONS = ['languageInstruction', 'readGlobalRulesTemplate', 'renderCompletionSummaryLabel', 'encodeReportingLanguage', 'renderGlobalRules', 'renderGlobalRulesBlock'];

function readTemplate(raw: string): string {
  return raw.match(/```md\n([\s\S]*?)\n```/)?.[1] ?? raw;
}

interface RulesRenders {
  readonly blocks: readonly string[];
  readonly customInstructionBlock: string | null;
}

function globalRulesRenders(tree: TagTree): RulesRenders | null {
  const path = GLOBAL_RULES_PATHS.find((candidate) => tree.has(candidate) && tree.read(candidate).includes('BEGIN: repo-harness global-working-rules'));
  if (!path) return null;
  const source = tree.read(path);
  const joined = RULES_FUNCTIONS.map((name) => functionSource(source, name)).filter((text): text is string => text !== null).join('\n');
  const recipe = GLOBAL_RULES_PINS.get(sha(joined));
  if (!recipe) throw new Error(`${tree.tag}: unknown global rules renderer (sha256 ${sha(joined)}); teach scripts/check-released-managed-values.ts this renderer`);
  const begin = requireValue(stringConstant(source, 'GLOBAL_RULES_BEGIN'), tree.tag, 'GLOBAL_RULES_BEGIN');
  const end = requireValue(stringConstant(source, 'GLOBAL_RULES_END'), tree.tag, 'GLOBAL_RULES_END');
  const selfNote = recipe === 'plain' ? null
    : requireValue(source.match(/^const GLOBAL_RULES_SELF_NOTE =\s*(['"])(.*?)\1;$/m)?.[2], tree.tag, 'GLOBAL_RULES_SELF_NOTE');
  const labels = recipe === 'self-note-label' || recipe === 'encoded'
    ? [requireValue(stringConstant(source, 'COMPLETION_SUMMARY_LABEL_EN'), tree.tag, 'COMPLETION_SUMMARY_LABEL_EN'),
      requireValue(stringConstant(source, 'COMPLETION_SUMMARY_LABEL_ZH'), tree.tag, 'COMPLETION_SUMMARY_LABEL_ZH')] as const
    : null;
  const encoding = recipe === 'encoded'
    ? [requireValue(stringConstant(source, 'REPORTING_LANGUAGE_PREFIX'), tree.tag, 'REPORTING_LANGUAGE_PREFIX'),
      requireValue(stringConstant(source, 'REPORTING_LANGUAGE_SUFFIX'), tree.tag, 'REPORTING_LANGUAGE_SUFFIX')] as const
    : null;
  const template = readTemplate(tree.read(GLOBAL_RULES_TEMPLATE));
  const render = (preset: string, instruction: string): string => {
    const labelled = labels && preset === 'zh-CN' ? template.replaceAll(labels[0], labels[1]) : template;
    const rendered = labelled.replace(LANGUAGE_LINE, () => `- ${instruction}`).trim();
    const header = encoding ? `${encoding[0]}${JSON.stringify({ preset, instruction }).replaceAll('>', '\\u003e')}${encoding[1]}` : null;
    return [begin, selfNote, header, rendered, end].filter((line): line is string => line !== null).join('\n');
  };
  return {
    blocks: Object.entries(PRESET_INSTRUCTIONS).map(([preset, instruction]) => render(preset, instruction)),
    customInstructionBlock: encoding ? render('custom', CUSTOM_INSTRUCTION_SENTINEL) : null,
  };
}

/** Splits released template text into the spans that the legacy-section scan replaces. */
export function legacySections(template: string): Array<readonly [string, string]> {
  const lines = template.split('\n').map((line) => line.replace(/\r$/, ''));
  const sections: Array<[string, string[]]> = [];
  let current: [string, string[]] | null = null;
  let level = 0;
  let fence: { readonly char: string; readonly length: number } | null = null;
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    let fenceLine = false;
    if (fence === null && marker) {
      fence = { char: marker[1]![0]!, length: marker[1]!.length };
      fenceLine = true;
    } else if (fence !== null && marker && marker[1]![0] === fence.char && marker[1]!.length >= fence.length && marker[2]!.trim() === '') {
      fence = null;
      fenceLine = true;
    }
    const heading = fence === null && !fenceLine ? line.match(/^(#{1,6}) (.+?)\s*$/) : null;
    if (heading) {
      const headingLevel = heading[1]!.length;
      if (headingLevel <= 2) {
        current = [`${heading[1]} ${heading[2]}`, []];
        level = headingLevel;
        sections.push(current);
      } else if (level === 1) {
        current = null;
      }
    }
    current?.[1].push(line);
  }
  return sections.map(([key, body]) => [key, body.join('\n').replace(/\n+$/, '')] as const);
}

// ---------------------------------------------------------------------------
// Build, compare, write
// ---------------------------------------------------------------------------

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(value);
}

function record(map: Map<string, Set<string>>): Record<string, string[]> {
  return Object.fromEntries([...map.keys()].sort().map((key) => [key, sorted(map.get(key)!)]));
}

async function inPool<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function buildReleasedManagedValues(repoRoot: string): Promise<ReleasedManagedValues> {
  const releases = releaseTags(repoRoot);
  const scratch = mkdtempSync(join(tmpdir(), 'released-managed-values-'));
  const packageScripts = new Map(MANAGED_PACKAGE_SCRIPT_KEYS.map((key) => [key, new Set<string>()] as [string, Set<string>]));
  const referenceConfigs = new Map<string, Set<string>>();
  const gitignoreBlocks = new Set<string>();
  const retiredBases = new Set<string>();
  let retiredSection: { header: string; rules: readonly string[] } | null = null;
  const userExcludesBlocks = new Set<string>();
  const rulesBlocks = new Set<string>();
  const customRulesBlocks = new Set<string>();
  const legacy = new Map<string, Set<string>>();
  try {
    const trees = releases.map((tag) => new TagTree(repoRoot, tag));
    const bashRenders = await inPool(trees, availableParallelism(), (tree) => runBashRenderers(tree, scratch));
    for (const [index, tree] of trees.entries()) {
      const tag = tree.tag;
      packageScriptValues(tree, packageScripts);

      const bash = bashRenders[index]!;
      for (const block of bash.gitignoreBlocks) gitignoreBlocks.add(blockFingerprint(block));
      if (bash.stubs) {
        for (const [name, text] of bash.stubs) addTo(referenceConfigs, name.replace(/\.md$/, ''), fingerprint(text));
      } else {
        // Before stubs, init copied each reference config whole.
        for (const name of tree.markdownNames('assets/reference-configs')) {
          addTo(referenceConfigs, name.replace(/\.md$/, ''), fingerprint(tree.readBytes(`assets/reference-configs/${name}`)));
        }
      }
      const stub = referenceStubRenderer(tree);
      if (stub) {
        for (const name of tree.markdownNames('assets/reference-configs')) {
          const docId = name.replace(/\.md$/, '');
          addTo(referenceConfigs, docId, fingerprint(stub(docId)));
        }
      }

      const ts = tsGitignore(tree);
      for (const block of ts?.blocks ?? []) {
        gitignoreBlocks.add(blockFingerprint(block));
        if (ts?.retired) retiredBases.add(blockFingerprint(block));
      }
      if (ts?.retired) {
        if (retiredSection && JSON.stringify(retiredSection) !== JSON.stringify(ts.retired)) {
          throw new Error(`${tag}: the retired runtime section changed; record one retired section per base`);
        }
        retiredSection = ts.retired;
      }
      if (ts?.userExcludesBlock) userExcludesBlocks.add(blockFingerprint(ts.userExcludesBlock));

      const rules = globalRulesRenders(tree);
      for (const block of rules?.blocks ?? []) rulesBlocks.add(blockFingerprint(block));
      if (rules?.customInstructionBlock) customRulesBlocks.add(blockFingerprint(rules.customInstructionBlock));
      if (tree.has(GLOBAL_RULES_TEMPLATE)) {
        for (const [heading, text] of legacySections(readTemplate(tree.read(GLOBAL_RULES_TEMPLATE)))) addTo(legacy, heading, fingerprint(text));
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    schema: SCHEMA,
    releases,
    packageScripts: record(packageScripts),
    referenceConfigs: record(referenceConfigs),
    projectGitignoreBlock: {
      blocks: sorted(gitignoreBlocks),
      retiredSection: retiredSection ? { ...retiredSection, bases: sorted(retiredBases) } : null,
    },
    userExcludesBlock: { blocks: sorted(userExcludesBlocks) },
    globalRulesBlock: {
      blocks: sorted(rulesBlocks),
      customInstructionSentinel: CUSTOM_INSTRUCTION_SENTINEL,
      customInstructionBlocks: sorted(customRulesBlocks),
      legacySections: record(legacy),
    },
  };
}

export function renderReleasedManagedValues(values: ReleasedManagedValues): string {
  return `${JSON.stringify(values, null, 2)}\n`;
}

/** JSON paths whose values differ, with added and removed entries named. */
export function diffReleasedManagedValues(expected: unknown, actual: unknown, path = '$'): string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const [want, have] = [new Set(expected.map((item) => JSON.stringify(item))), new Set(actual.map((item) => JSON.stringify(item)))];
    return [
      ...[...want].filter((item) => !have.has(item)).map((item) => `${path}: missing ${item}`),
      ...[...have].filter((item) => !want.has(item)).map((item) => `${path}: unexpected ${item}`),
    ];
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual)) {
    const keys = sorted([...Object.keys(expected), ...Object.keys(actual)]);
    return keys.flatMap((key) => diffReleasedManagedValues((expected as Record<string, unknown>)[key], (actual as Record<string, unknown>)[key], `${path}.${key}`));
  }
  return JSON.stringify(expected) === JSON.stringify(actual) ? [] : [`${path}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`];
}

async function main(argv: readonly string[]): Promise<number> {
  const write = argv.includes('--write');
  const unknown = argv.filter((arg) => arg !== '--write');
  if (unknown.length > 0) {
    console.error(`usage: bun scripts/check-released-managed-values.ts [--write]; unknown argument ${unknown[0]}`);
    return 2;
  }
  const repoRoot = resolve(import.meta.dir, '..');
  const built = await buildReleasedManagedValues(repoRoot);
  const rendered = renderReleasedManagedValues(built);
  const file = join(repoRoot, RELEASED_MANAGED_VALUES_PATH);
  if (write) {
    writeFileSync(file, rendered);
    console.log(`wrote ${RELEASED_MANAGED_VALUES_PATH} from ${built.releases.length} release tags`);
    return 0;
  }
  const committed = readFileSync(file, 'utf8');
  if (committed !== rendered) {
    const drift = diffReleasedManagedValues(built, JSON.parse(committed) as unknown);
    console.error(`${RELEASED_MANAGED_VALUES_PATH} differs from the release tags; run bun scripts/check-released-managed-values.ts --write`);
    for (const line of drift.length > 0 ? drift : ['the values match; the file layout differs']) console.error(`  ${line}`);
    return 1;
  }
  console.log(`${RELEASED_MANAGED_VALUES_PATH} matches ${built.releases.length} release tags`);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));

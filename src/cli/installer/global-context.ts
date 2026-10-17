/**
 * The repo-harness managed Global Working Rules block in the user-level host
 * instruction files (`~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`).
 *
 * Init writes the block, install and update refresh it, setup check compares
 * it, and uninstall removes it. All of them use the markers and the render
 * here. The block records its own reporting-language inputs, so install and
 * update can render it again without a prompt. Repo-harness rules are
 * overwritten; user rules are kept. Outside the markers, sync removes only
 * legacy copies of sections that repo-harness shipped.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const GLOBAL_RULES_BEGIN = '<!-- BEGIN: repo-harness global-working-rules -->';
export const GLOBAL_RULES_END = '<!-- END: repo-harness global-working-rules -->';
const GLOBAL_RULES_SELF_NOTE =
  '<!-- repo-harness manages this block; edits inside are overwritten on sync. Keep personal rules outside the markers. -->';
const REPORTING_LANGUAGE_PREFIX = '<!-- repo-harness reporting-language: ';
const REPORTING_LANGUAGE_SUFFIX = ' -->';
const COMPLETION_SUMMARY_LABEL_EN = 'Next cut';
const COMPLETION_SUMMARY_LABEL_ZH = '下一刀';
const DEFAULT_REPORTING_INSTRUCTION = "Use the user's language for reports; keep technical terms in English.";

export type ReportingLanguagePreset = 'follow' | 'zh-CN' | 'en' | 'custom';
const REPORTING_LANGUAGE_PRESETS: readonly ReportingLanguagePreset[] = ['follow', 'zh-CN', 'en', 'custom'];

/** The `--report-language` values. A custom sentence comes only from interactive init. */
export type ReportLanguageFlag = Exclude<ReportingLanguagePreset, 'custom'>;
export const REPORT_LANGUAGE_FLAG_VALUES: readonly ReportLanguageFlag[] = ['follow', 'zh-CN', 'en'];

export interface ReportingLanguage {
  readonly preset: ReportingLanguagePreset;
  readonly instruction: string;
}

export type GlobalContextHost = 'codex' | 'claude';

/** One state per file. Only the two managed states with recorded inputs sync without a flag. */
export type GlobalContextState =
  | 'missing-file'
  | 'no-rules'
  | 'legacy-unmanaged'
  | 'unbalanced'
  | 'managed-unrecorded'
  | 'managed-stale'
  | 'managed-current';

export const GLOBAL_RULES_FLAG_HINT = 'pass --report-language follow|zh-CN|en';
export const GLOBAL_RULES_UNBALANCED = 'unbalanced repo-harness markers; repair manually, then re-run';

/**
 * Every section title that repo-harness ever shipped in
 * `assets/reference-configs/global-working-rules.md`. Outside the markers, a
 * section with one of these exact titles is a legacy repo-harness copy and is
 * replaced on sync. Every other section is user content and is kept.
 */
export const SHIPPED_GLOBAL_RULES_H1 = 'Global Working Rules';
export const SHIPPED_GLOBAL_RULES_SECTIONS: readonly string[] = [
  'Sufficiency and Stop Boundaries',
  'Progressive Due Diligence',
  'Code Optimization Principles',
  'No Compatibility Fallbacks in Product Code',
  'Reporting',
  'Artifact Hygiene',
  'Completion Summary Rule',
  'Research Delegation',
  'Sub-agent Delegation',
  'Peer Harness Collaboration',
  'Review Trigger Discipline',
];

export function languageInstruction(preset: ReportingLanguagePreset, custom?: string): string {
  if (preset === 'zh-CN') return 'Use Chinese to report to user.';
  if (preset === 'en') return 'Use English to report to user.';
  if (preset === 'custom') return custom?.trim() || DEFAULT_REPORTING_INSTRUCTION;
  return DEFAULT_REPORTING_INSTRUCTION;
}

export function reportLanguageFromFlag(flag: ReportLanguageFlag): ReportingLanguage {
  return { preset: flag, instruction: languageInstruction(flag) };
}

export function parseReportLanguageFlag(value: string): ReportLanguageFlag {
  if (!REPORT_LANGUAGE_FLAG_VALUES.includes(value as ReportLanguageFlag)) {
    throw new Error(`invalid --report-language ${value}; expected ${REPORT_LANGUAGE_FLAG_VALUES.join('|')}`);
  }
  return value as ReportLanguageFlag;
}

export function globalContextPath(home: string, host: GlobalContextHost): string {
  return host === 'codex' ? join(home, '.codex', 'AGENTS.md') : join(home, '.claude', 'CLAUDE.md');
}

function readGlobalRulesTemplate(sourceRoot: string): string {
  const file = join(sourceRoot, 'assets', 'reference-configs', 'global-working-rules.md');
  const raw = readFileSync(file, 'utf-8');
  const match = raw.match(/```md\n([\s\S]*?)\n```/);
  return match?.[1] ?? raw;
}

/**
 * The completion-summary label is the one phrase in the managed block that a
 * Chinese-reporting user reads as a literal section title, so it is rendered in
 * the reporting language while the rest of the template stays English.
 */
function renderCompletionSummaryLabel(template: string, preset: ReportingLanguagePreset): string {
  if (preset !== 'zh-CN') return template;
  return template.replaceAll(COMPLETION_SUMMARY_LABEL_EN, COMPLETION_SUMMARY_LABEL_ZH);
}

/** JSON in an HTML comment; `>` is escaped so the value cannot end the comment. */
function encodeReportingLanguage(language: ReportingLanguage): string {
  const json = JSON.stringify({ preset: language.preset, instruction: language.instruction }).replaceAll('>', '\\u003e');
  return `${REPORTING_LANGUAGE_PREFIX}${json}${REPORTING_LANGUAGE_SUFFIX}`;
}

/** Returns null for any header that is absent or does not validate. It never guesses. */
function decodeReportingLanguage(line: string | undefined): ReportingLanguage | null {
  if (!line?.startsWith(REPORTING_LANGUAGE_PREFIX) || !line.endsWith(REPORTING_LANGUAGE_SUFFIX)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(REPORTING_LANGUAGE_PREFIX.length, line.length - REPORTING_LANGUAGE_SUFFIX.length));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 2) return null;
  const { preset, instruction } = record;
  if (typeof preset !== 'string' || !REPORTING_LANGUAGE_PRESETS.includes(preset as ReportingLanguagePreset)) return null;
  if (typeof instruction !== 'string') return null;
  // A preset instruction must equal its fixed sentence; a custom one must be a
  // trimmed, non-empty sentence. languageInstruction states both rules.
  if (instruction !== languageInstruction(preset as ReportingLanguagePreset, instruction)) return null;
  return { preset: preset as ReportingLanguagePreset, instruction };
}

export function renderGlobalRulesBlock(sourceRoot: string, language: ReportingLanguage): string {
  // Write only inputs that decodeReportingLanguage accepts, so a block that
  // repo-harness writes can always be refreshed later.
  if (language.instruction !== languageInstruction(language.preset, language.instruction)) {
    throw new Error(`reporting-language instruction does not match preset ${language.preset}: ${language.instruction}`);
  }
  const template = readGlobalRulesTemplate(sourceRoot);
  const rendered = renderCompletionSummaryLabel(template, language.preset).replace(
    /^- Use the user's language for reports; keep technical terms in English\.$/m,
    `- ${language.instruction}`,
  );
  return [
    GLOBAL_RULES_BEGIN,
    GLOBAL_RULES_SELF_NOTE,
    encodeReportingLanguage(language),
    rendered.trim(),
    GLOBAL_RULES_END,
    '',
  ].join('\n');
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

type MarkerLayout =
  | { readonly kind: 'none' }
  | { readonly kind: 'unbalanced' }
  | { readonly kind: 'balanced'; readonly start: number; readonly end: number };

function markerLayout(content: string): MarkerLayout {
  const beginCount = countOccurrences(content, GLOBAL_RULES_BEGIN);
  const endCount = countOccurrences(content, GLOBAL_RULES_END);
  if (beginCount === 0 && endCount === 0) return { kind: 'none' };
  const start = content.indexOf(GLOBAL_RULES_BEGIN);
  const end = content.indexOf(GLOBAL_RULES_END);
  if (beginCount !== 1 || endCount !== 1 || end < start) return { kind: 'unbalanced' };
  return { kind: 'balanced', start, end };
}

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

interface LegacyScan {
  /** Line indexes of the legacy repo-harness span. */
  readonly removed: ReadonlySet<number>;
  /** Index of the legacy H1, else of the first removed line; null for no span. */
  readonly anchor: number | null;
  readonly replaced: readonly string[];
  readonly kept: readonly string[];
}

/**
 * Finds the legacy repo-harness span in text outside the markers: the shipped
 * H1 with its preamble up to the next heading, and each shipped `##` section
 * with its subsections up to the next `#` or `##` heading. Headings inside
 * fenced code do not count.
 */
function scanLegacySpan(lines: readonly string[]): LegacyScan {
  const removed = new Set<number>();
  const replaced: string[] = [];
  const kept: string[] = [];
  let h1Anchor: number | null = null;
  let mode: 'keep' | 'h1-preamble' | 'section' = 'keep';
  let inFence = false;
  lines.forEach((line, index) => {
    const bare = line.replace(/\r?\n$/, '');
    const fence = /^\s*(```|~~~)/.test(bare);
    const heading = !inFence && !fence ? bare.match(/^(#{1,6}) (.+?)\s*$/) : null;
    if (fence) inFence = !inFence;
    if (heading) {
      const level = heading[1].length;
      const title = heading[2];
      if (level === 1 && title === SHIPPED_GLOBAL_RULES_H1) {
        mode = 'h1-preamble';
        h1Anchor ??= index;
        replaced.push(title);
      } else if (level === 2 && SHIPPED_GLOBAL_RULES_SECTIONS.includes(title)) {
        mode = 'section';
        replaced.push(title);
      } else if (level <= 2 || mode === 'h1-preamble') {
        mode = 'keep';
        if (level <= 2) kept.push(title);
      }
    }
    if (mode !== 'keep') removed.add(index);
  });
  const first = removed.size > 0 ? Math.min(...removed) : null;
  return { removed, anchor: h1Anchor ?? first, replaced: [...new Set(replaced)], kept };
}

function keptText(lines: readonly string[], scan: LegacyScan, from: number, to: number): string {
  return lines.slice(from, to).filter((_, offset) => !scan.removed.has(from + offset)).join('');
}

export type ManagedBlockStatus = 'written' | 'blocked-unbalanced';

export interface MergedManagedBlock {
  readonly content: string;
  readonly status: ManagedBlockStatus;
  /** Shipped titles removed from outside the markers. */
  readonly replaced: readonly string[];
  /** User section titles kept outside the markers. */
  readonly kept: readonly string[];
}

/**
 * Repo-harness rules are overwritten; user rules are kept. The legacy span
 * outside the markers is removed. An existing block is refreshed in place;
 * otherwise the block goes where the legacy H1 was, or at the end of a file
 * without a legacy span. Every other line keeps its bytes and order.
 */
export function mergeManagedBlock(current: string, block: string): MergedManagedBlock {
  const layout = markerLayout(current);
  if (layout.kind === 'unbalanced') return { content: current, status: 'blocked-unbalanced', replaced: [], kept: [] };
  if (layout.kind === 'balanced') {
    const beforeLines = splitLines(current.slice(0, layout.start));
    const afterLines = splitLines(current.slice(layout.end + GLOBAL_RULES_END.length));
    const before = scanLegacySpan(beforeLines);
    const after = scanLegacySpan(afterLines);
    const merged = `${keptText(beforeLines, before, 0, beforeLines.length)}${block.trimEnd()}${
      keptText(afterLines, after, 0, afterLines.length).replace(/^\n?/, '\n')}`;
    return {
      content: merged,
      status: 'written',
      replaced: [...new Set([...before.replaced, ...after.replaced])],
      kept: [...before.kept, ...after.kept],
    };
  }
  const lines = splitLines(current);
  const scan = scanLegacySpan(lines);
  if (scan.anchor === null) {
    const trimmed = current.trimEnd();
    return { content: `${trimmed}${trimmed ? '\n\n' : ''}${block}`, status: 'written', replaced: [], kept: scan.kept };
  }
  const before = keptText(lines, scan, 0, scan.anchor);
  const after = keptText(lines, scan, scan.anchor, lines.length);
  return {
    content: `${before}${block}${after ? `\n${after}` : ''}`,
    status: 'written',
    replaced: scan.replaced,
    kept: scan.kept,
  };
}

/** True when text outside the markers holds a legacy repo-harness span. */
function hasLegacySpan(content: string, layout: MarkerLayout): boolean {
  if (layout.kind === 'unbalanced') return false;
  if (layout.kind === 'none') return scanLegacySpan(splitLines(content)).anchor !== null;
  return scanLegacySpan(splitLines(content.slice(0, layout.start))).anchor !== null
    || scanLegacySpan(splitLines(content.slice(layout.end + GLOBAL_RULES_END.length))).anchor !== null;
}

export function formatMigratedLegacy(path: string, merged: MergedManagedBlock): string {
  return `migrated-legacy:${path} (replaced: ${merged.replaced.join(', ')}; kept user sections: ${merged.kept.join(', ') || 'none'})`;
}

export interface GlobalContextInspection {
  readonly state: GlobalContextState;
  /** The recorded render inputs; present only for managed-stale and managed-current. */
  readonly language: ReportingLanguage | null;
  /** True when text outside the markers holds a legacy repo-harness span. */
  readonly legacySpan: boolean;
  /** The sync with the recorded inputs; present with `language`. */
  readonly synced: MergedManagedBlock | null;
}

/**
 * Classifies one file. `content` is null when the file does not exist. The
 * template is read only for a block with valid recorded inputs; a read error
 * there propagates to the caller. A balanced block with a legacy span outside
 * it is managed; the span makes a recorded block stale.
 */
export function inspectGlobalContext(content: string | null, sourceRoot: string): GlobalContextInspection {
  if (content === null) return { state: 'missing-file', language: null, legacySpan: false, synced: null };
  const layout = markerLayout(content);
  const legacySpan = hasLegacySpan(content, layout);
  const unsynced = (state: GlobalContextState): GlobalContextInspection => ({ state, language: null, legacySpan, synced: null });
  if (layout.kind === 'unbalanced') return unsynced('unbalanced');
  if (layout.kind === 'none') return unsynced(legacySpan ? 'legacy-unmanaged' : 'no-rules');
  const blockLines = content.slice(layout.start, layout.end).split('\n');
  const language = blockLines[1] === GLOBAL_RULES_SELF_NOTE ? decodeReportingLanguage(blockLines[2]) : null;
  if (language === null) return unsynced('managed-unrecorded');
  const synced = mergeManagedBlock(content, renderGlobalRulesBlock(sourceRoot, language));
  return { state: synced.content === content ? 'managed-current' : 'managed-stale', language, legacySpan, synced };
}

export interface GlobalContextFilePlan {
  readonly path: string;
  readonly state: GlobalContextState | 'unreadable';
  readonly outcome: 'write' | 'unchanged' | 'skipped' | 'failed';
  /** The file content at preflight; null when the file did not exist. */
  readonly current: string | null;
  /** The content to write; set only when `outcome` is `write`. */
  readonly next: string | null;
  readonly detail: string;
}

/** The per-file write detail. A removed legacy span is named with the kept user sections. */
export function formatGlobalContextWrite(path: string, current: string | null, merged: MergedManagedBlock): string {
  if (merged.replaced.length > 0) return formatMigratedLegacy(path, merged);
  if (merged.content === current) return `unchanged:${path}`;
  return `${current === null ? 'created' : current.includes(GLOBAL_RULES_BEGIN) ? 'updated' : 'appended'}:${path}`;
}

/**
 * Plans one file for install or update. A valid recorded header wins over the
 * flag. Without a header, the flag supplies the inputs; without both, a file
 * that holds rules fails and a file without rules is skipped.
 */
export function planGlobalContextFile(
  path: string,
  sourceRoot: string,
  flag: ReportLanguageFlag | undefined,
): GlobalContextFilePlan {
  let current: string | null = null;
  const failed = (detail: string): GlobalContextFilePlan => ({ path, state: 'unreadable', outcome: 'failed', current, next: null, detail });
  try {
    current = existsSync(path) ? readFileSync(path, 'utf-8') : null;
  } catch (error) {
    return failed(`failed:${path} (${(error as Error).message})`);
  }
  try {
    const inspection = inspectGlobalContext(current, sourceRoot);
    const plan = (outcome: GlobalContextFilePlan['outcome'], detail: string, next: string | null = null): GlobalContextFilePlan => (
      { path, state: inspection.state, outcome, current, next, detail }
    );
    const write = (merged: MergedManagedBlock): GlobalContextFilePlan => plan('write', formatGlobalContextWrite(path, current, merged), merged.content);
    const withFlag = (): MergedManagedBlock => mergeManagedBlock(current ?? '', renderGlobalRulesBlock(sourceRoot, reportLanguageFromFlag(flag!)));
    switch (inspection.state) {
      case 'managed-current':
        return plan('unchanged', `unchanged:${path}`);
      case 'managed-stale':
        return write(inspection.synced!);
      case 'unbalanced':
        return plan('failed', `blocked:${path} (${GLOBAL_RULES_UNBALANCED})`);
      case 'managed-unrecorded':
        return flag
          ? write(withFlag())
          : plan('failed', `blocked:${path} (managed block has no recorded reporting language; ${GLOBAL_RULES_FLAG_HINT})`);
      case 'legacy-unmanaged':
        return flag
          ? write(withFlag())
          : plan('failed', `blocked:${path} (legacy repo-harness rules without markers; ${GLOBAL_RULES_FLAG_HINT} to replace them; user sections are kept)`);
      case 'no-rules':
      case 'missing-file':
        return flag
          ? write(withFlag())
          : plan('skipped', `skipped-not-opted-in:${path} (not opted in; pass --report-language to install the rules)`);
    }
  } catch (error) {
    return failed(`failed:${path} (${(error as Error).message})`);
  }
}

export interface GlobalContextRefreshPlan {
  readonly status: 'ok' | 'failed';
  readonly detail: string;
  readonly files: readonly GlobalContextFilePlan[];
}

/** Read-only. It runs before any host write, so a failure stops the run first. */
export function preflightGlobalContextRefresh(
  sourceRoot: string,
  home: string,
  hosts: readonly GlobalContextHost[],
  flag: ReportLanguageFlag | undefined,
): GlobalContextRefreshPlan {
  const files = hosts.map((host) => planGlobalContextFile(globalContextPath(home, host), sourceRoot, flag));
  return {
    status: files.some((file) => file.outcome === 'failed') ? 'failed' : 'ok',
    detail: files.map((file) => file.detail).join(', '),
    files,
  };
}

export interface GlobalContextRefresh {
  readonly status: 'ok' | 'skipped' | 'failed';
  readonly detail: string;
}

/** Writes a passed preflight plan. A file that changed after preflight fails closed. */
export function applyGlobalContextRefresh(plan: GlobalContextRefreshPlan): GlobalContextRefresh {
  if (plan.status === 'failed') return { status: 'failed', detail: plan.detail };
  const details: string[] = [];
  let failed = false;
  for (const file of plan.files) {
    if (file.outcome !== 'write') {
      details.push(file.detail);
      continue;
    }
    try {
      const now = existsSync(file.path) ? readFileSync(file.path, 'utf-8') : null;
      if (now !== file.current) {
        failed = true;
        details.push(`failed:${file.path} (changed after preflight; re-run)`);
        continue;
      }
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.next!, 'utf-8');
      details.push(file.detail);
    } catch (error) {
      failed = true;
      details.push(`failed:${file.path} (${(error as Error).message})`);
    }
  }
  const skipped = plan.files.some((file) => file.outcome === 'skipped');
  return { status: failed ? 'failed' : skipped ? 'skipped' : 'ok', detail: details.join(', ') };
}

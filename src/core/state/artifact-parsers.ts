import type { SnapshotPlanState } from './types';

const EVIDENCE_LABELS = [
  'State/progress path',
  'Verification evidence',
  'Evaluator rubric',
  'Stop condition',
  'Rollback surface',
] as const;

export function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function markdownHeader(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+?)\\s*$`, 'mi'));
  return match ? stripWrappingQuotes(match[1].replace(/^`|`$/g, '').trim()) : null;
}

export function markdownBullet(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^- ${escaped}:\\s*(.+?)\\s*$`, 'mi'));
  return match ? match[1].replace(/^`|`$/g, '').trim() : null;
}

export function markdownSection(content: string, heading: string): string | null {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return null;
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section.join('\n');
}

export function markdownSectionHeader(content: string, heading: string, label: string): string | null {
  const section = markdownSection(content, heading);
  return section ? markdownHeader(section, label) : null;
}

export function parseAllowedPaths(contractText: string | null): string[] {
  if (!contractText) return [];
  const lines = contractText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Allowed Paths\s*$/.test(line));
  if (start < 0) return [];
  const sectionLines: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /.test(lines[index])) break;
    sectionLines.push(lines[index]);
  }
  const section = sectionLines.join('\n');
  const fenced = section.match(/```ya?ml\s*([\s\S]*?)```/i)?.[1] ?? section;
  const paths: string[] = [];
  let inAllowedPaths = false;
  for (const line of fenced.split(/\r?\n/)) {
    if (/^allowed_paths:\s*$/.test(line.trim())) {
      inAllowedPaths = true;
      continue;
    }
    if (!inAllowedPaths) continue;
    const item = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (item) paths.push(stripWrappingQuotes(item[1]));
    else if (line.trim() && !/^\s/.test(line)) break;
  }
  return paths;
}

export function firstOpenTask(planText: string | null): string | null {
  if (!planText) return null;
  const match = planText.match(/^\s*- \[ \]\s+(.+?)\s*$/m);
  return match?.[1] ?? null;
}

export function parseIsoOrLocalTimestamp(value: string | null): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T')
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function planStatusFromText(planText: string | null): SnapshotPlanState {
  if (!planText) return 'unknown';
  const statusLine = planText.split(/\r?\n/).find((line) => line.includes('**Status**:'));
  const status = statusLine?.replace(/^.*\*\*Status\*\*:\s*/, '').trim();
  switch (status) {
    case 'Draft': return 'draft';
    case 'Annotating': return 'annotating';
    case 'Approved': return 'approved';
    case 'Executing': return 'executing';
    default: return 'unknown';
  }
}

export function planSlugFromPath(planPath: string): string | null {
  const base = planPath.split('/').pop() ?? '';
  return /^plan-\d{8}-\d{4}-(.+)\.md$/.exec(base)?.[1] ?? null;
}

export function artifactStemFromPlan(planPath: string, planText: string | null): string | null {
  const base = planPath.split('/').pop() ?? '';
  const stem = /^plan-(.+)\.md$/.exec(base)?.[1] ?? null;
  const slug = planSlugFromPath(planPath);
  if (!stem || !slug) return null;
  const stamp = /^(\d{8}-\d{4})-.+$/.exec(stem)?.[1];
  if (!stamp || !/^(think-plan-\d+|codex-plan-\d+|approved-plan-\d+)$/.test(slug)) return stem;
  const title = planText?.split(/\r?\n/).find((line) => line.startsWith('# Plan: '))
    ?.replace(/^# Plan:\s*/, '').trim();
  const titleSlug = title
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return titleSlug && titleSlug !== slug ? `${stamp}-${titleSlug}` : stem;
}

export function evidenceContractComplete(planText: string | null): boolean {
  if (!planText) return false;
  const allLines = planText.split(/\r?\n/);
  const start = allLines.findIndex((line) => /^## Evidence Contract\s*$/.test(line));
  if (start < 0) return false;
  const lines: string[] = [];
  for (let index = start + 1; index < allLines.length; index += 1) {
    if (/^## /.test(allLines[index])) break;
    lines.push(allLines[index]);
  }
  if (!lines.join('').trim()) return false;
  return EVIDENCE_LABELS.every((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = lines.find((candidate) => new RegExp(
      `^\\s*-\\s*(\\*\\*)?${escaped}(\\*\\*)?\\s*:`,
      'i',
    ).test(candidate));
    if (!line) return false;
    const value = line.slice(line.indexOf(':') + 1).trim();
    return Boolean(value) && !/^(tbd|todo|n\/a|none|unknown|\.\.\.)$/i.test(value);
  });
}

export function planContractRelationshipConflicts(
  planPath: string | null,
  contractPath: string | null,
  planText: string | null,
  contractText: string | null,
): string[] {
  if (!planPath) return [];
  const conflicts: string[] = [];
  const contractPlan = contractText ? markdownHeader(contractText, 'Plan') : null;
  const planContract = planText ? markdownHeader(planText, 'Task Contract') : null;
  if (contractText && contractPlan && contractPlan !== planPath) {
    conflicts.push('contract_plan_relationship');
  }
  if (contractPath && planContract && planContract !== contractPath) {
    conflicts.push('plan_contract_relationship');
  }
  return conflicts;
}

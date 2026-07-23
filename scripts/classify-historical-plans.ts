#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, realpathSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

export type HistoricalPlanDecision = 'AUTO' | 'HOLD' | 'EXCLUDE';

export interface HistoricalPlanClassification {
  readonly plan: string;
  readonly plan_status: string | null;
  readonly contract: string | null;
  readonly contract_status: string | null;
  readonly review: string | null;
  readonly review_recommendation: string | null;
  readonly receipt_recorded: boolean;
  readonly decision: HistoricalPlanDecision;
  readonly reason: string;
}

export interface HistoricalPlanReport {
  readonly protocol: 1;
  readonly kind: 'repo-harness-historical-plan-classification';
  readonly repo_root: string;
  readonly root_plan_count: number;
  readonly historical_plan_count: number;
  readonly counts: Readonly<Record<HistoricalPlanDecision, number>>;
  readonly rows: readonly HistoricalPlanClassification[];
}

export interface SealedTerminalEvidenceResult {
  readonly ok: boolean;
  readonly reason: string;
  readonly contract_status: string | null;
  readonly review_recommendation: string | null;
  readonly receipt_recorded: boolean;
}

function header(text: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.*?)\\s*$`, 'mi'));
  if (!match) return null;
  const value = match[1]!.replace(/^`|`$/g, '').trim();
  return value.length > 0 ? value : null;
}

function markdownSection(text: string, title: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return null;
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n');
}

export function hasRecordedAcceptanceReceipt(reviewText: string): boolean {
  const receipt = markdownSection(reviewText, 'Acceptance Receipt Projection');
  if (!receipt) return false;
  const disposition = header(receipt, 'Disposition');
  const reviewer = header(receipt, 'Reviewer');
  const source = header(receipt, 'Source');
  const subject = header(receipt, 'Reviewed Subject SHA256');
  const scope = header(receipt, 'Reviewed Subject Scope');
  const target = header(receipt, 'Reviewed Target Revision');
  const verification = header(receipt, 'Verification Evidence SHA256');
  const issuedAt = header(receipt, 'Issued At');
  const summary = receipt.match(/^- Summary:\s*(.+?)\s*$/mi)?.[1]?.trim() ?? '';
  const findings = receipt.match(/^- Findings:\s*(.+?)\s*$/mi)?.[1]?.trim() ?? '';
  const identityValid = (
    disposition === 'external_pass'
    && ((reviewer === 'Claude' && source === 'claude-review') || (reviewer === 'Codex' && source === 'codex-review'))
  ) || (disposition === 'user_waiver' && reviewer === 'User' && source === 'user-waiver');
  return identityValid
    && /^sha256:[0-9a-f]{64}$/.test(subject ?? '')
    && scope === 'normalized-final-content'
    && /^[0-9a-f]{40,64}$/.test(target ?? '')
    && /^sha256:[0-9a-f]{64}$/.test(verification ?? '')
    && issuedAt !== null
    && issuedAt !== 'pending'
    && !Number.isNaN(Date.parse(issuedAt))
    && summary.length > 0
    && summary !== 'pending'
    && findings.length > 0
    && findings !== 'pending';
}

export function evaluateSealedTerminalEvidence(contractText: string, reviewText: string): SealedTerminalEvidenceResult {
  const contractStatus = header(contractText, 'Status');
  const recommendation = header(reviewText, 'Recommendation');
  const receiptRecorded = hasRecordedAcceptanceReceipt(reviewText);
  if (contractStatus !== 'Fulfilled') {
    return { ok: false, reason: `contract status is ${contractStatus ?? 'missing'}, not Fulfilled`, contract_status: contractStatus, review_recommendation: recommendation, receipt_recorded: receiptRecorded };
  }
  if (recommendation !== 'pass') {
    return { ok: false, reason: `review recommendation is ${recommendation ?? 'missing'}, not pass`, contract_status: contractStatus, review_recommendation: recommendation, receipt_recorded: receiptRecorded };
  }
  if (!receiptRecorded) {
    return { ok: false, reason: 'typed Acceptance Receipt Projection missing or incomplete', contract_status: contractStatus, review_recommendation: recommendation, receipt_recorded: false };
  }
  return { ok: true, reason: 'sealed terminal triple verified', contract_status: contractStatus, review_recommendation: recommendation, receipt_recorded: true };
}

function safeDeclaredPath(root: string, value: string | null, prefix: string): string | null {
  if (!value || isAbsolute(value) || value.includes('\0')) return null;
  const absolute = resolve(root, value);
  const rel = relative(root, absolute).replaceAll('\\', '/');
  if (rel === '..' || rel.startsWith('../') || !rel.startsWith(prefix)) return null;
  return existsSync(absolute) ? rel : null;
}

function firstExisting(root: string, values: readonly (string | null)[], prefix: string): string | null {
  for (const value of values) {
    const safe = safeDeclaredPath(root, value, prefix);
    if (safe) return safe;
  }
  return null;
}

function planParts(plan: string): { stem: string; slug: string } {
  const base = plan.replace(/^plans\//, '').replace(/\.md$/, '').replace(/^plan-/, '');
  const slug = base.replace(/^[0-9]{8}-[0-9]{4}-/, '');
  return { stem: base, slug };
}

function resolveArtifacts(root: string, plan: string, planText: string): { contract: string | null; review: string | null; error: string | null } {
  const { stem, slug } = planParts(plan);
  const declaredContract = header(planText, 'Task Contract') ?? header(planText, 'Sprint Contract');
  const contract = declaredContract
    ? safeDeclaredPath(root, declaredContract, 'tasks/contracts/')
    : firstExisting(root, [`tasks/contracts/${stem}.contract.md`, `tasks/contracts/${slug}.contract.md`], 'tasks/contracts/');
  if (declaredContract && !contract) return { contract: null, review: null, error: `declared contract is invalid or missing: ${declaredContract}` };
  const contractText = contract ? readFileSync(join(root, contract), 'utf8') : '';
  const declaredReview = header(planText, 'Task Review') ?? header(contractText, 'Review File');
  const review = declaredReview
    ? safeDeclaredPath(root, declaredReview, 'tasks/reviews/')
    : firstExisting(root, [
      contract?.replace(/^tasks\/contracts\//, 'tasks/reviews/').replace(/\.contract\.md$/, '.review.md') ?? null,
      `tasks/reviews/${stem}.review.md`,
      `tasks/reviews/${slug}.review.md`,
    ], 'tasks/reviews/');
  if (declaredReview && !review) return { contract, review: null, error: `declared review is invalid or missing: ${declaredReview}` };
  return { contract, review, error: null };
}

export function classifyHistoricalPlans(repoRoot: string): HistoricalPlanReport {
  const root = realpathSync(repoRoot);
  const markerPath = join(root, '.ai/harness/active-plan');
  const activePlan = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim().replace(/^\.\//, '') : '';
  const plans = readdirSync(join(root, 'plans'))
    .filter((name) => /^plan-.*\.md$/.test(name))
    .map((name) => `plans/${name}`)
    .sort();
  const rows = plans.map<HistoricalPlanClassification>((plan) => {
    const planText = readFileSync(join(root, plan), 'utf8');
    const planStatus = header(planText, 'Status');
    const { contract, review, error: artifactError } = resolveArtifacts(root, plan, planText);
    const contractText = contract ? readFileSync(join(root, contract), 'utf8') : '';
    const reviewText = review ? readFileSync(join(root, review), 'utf8') : '';
    const contractStatus = contract ? header(contractText, 'Status') : null;
    const recommendation = review ? header(reviewText, 'Recommendation') : null;
    const receiptRecorded = review ? hasRecordedAcceptanceReceipt(reviewText) : false;
    if (plan === activePlan) {
      return { plan, plan_status: planStatus, contract, contract_status: contractStatus, review, review_recommendation: recommendation, receipt_recorded: receiptRecorded, decision: 'EXCLUDE', reason: 'current active plan' };
    }
    if (artifactError) {
      return { plan, plan_status: planStatus, contract, contract_status: contractStatus, review, review_recommendation: recommendation, receipt_recorded: receiptRecorded, decision: 'HOLD', reason: artifactError };
    }
    if (!contract) {
      return { plan, plan_status: planStatus, contract, contract_status: contractStatus, review, review_recommendation: recommendation, receipt_recorded: receiptRecorded, decision: 'HOLD', reason: 'contract missing or ambiguous' };
    }
    if (!review) {
      return { plan, plan_status: planStatus, contract, contract_status: contractStatus, review, review_recommendation: recommendation, receipt_recorded: receiptRecorded, decision: 'HOLD', reason: 'review missing or ambiguous' };
    }
    const sealed = evaluateSealedTerminalEvidence(contractText, reviewText);
    return {
      plan,
      plan_status: planStatus,
      contract,
      contract_status: sealed.contract_status,
      review,
      review_recommendation: sealed.review_recommendation,
      receipt_recorded: sealed.receipt_recorded,
      decision: sealed.ok ? 'AUTO' : 'HOLD',
      reason: sealed.reason,
    };
  });
  const counts = { AUTO: 0, HOLD: 0, EXCLUDE: 0 } satisfies Record<HistoricalPlanDecision, number>;
  for (const row of rows) counts[row.decision] += 1;
  return {
    protocol: 1,
    kind: 'repo-harness-historical-plan-classification',
    repo_root: root,
    root_plan_count: rows.length,
    historical_plan_count: rows.length - counts.EXCLUDE,
    counts,
    rows,
  };
}

function renderTsv(report: HistoricalPlanReport): string {
  const clean = (value: string | null | boolean) => String(value ?? '-').replace(/[\t\r\n]+/g, ' ');
  const lines = [
    ['plan', 'plan_status', 'contract', 'contract_status', 'review', 'review_recommendation', 'receipt_recorded', 'decision', 'reason'].join('\t'),
    ...report.rows.map((row) => [row.plan, row.plan_status, row.contract, row.contract_status, row.review, row.review_recommendation, row.receipt_recorded, row.decision, row.reason].map(clean).join('\t')),
  ];
  return `${lines.join('\n')}\n`;
}

if (import.meta.main) {
  let repo = '.';
  let format: 'json' | 'tsv' = 'json';
  let verifyContract = '';
  let verifyReview = '';
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === '--repo') repo = process.argv[++index] ?? '';
    else if (arg === '--format') {
      const value = process.argv[++index];
      if (value !== 'json' && value !== 'tsv') throw new Error(`unsupported format: ${value ?? 'missing'}`);
      format = value;
    } else if (arg === '--verify-sealed-contract') {
      verifyContract = process.argv[++index] ?? '';
    } else if (arg === '--verify-sealed-review') {
      verifyReview = process.argv[++index] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: bun scripts/classify-historical-plans.ts [--repo <path>] [--format json|tsv]');
      console.log('       bun scripts/classify-historical-plans.ts --verify-sealed-contract <path> --verify-sealed-review <path>');
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (verifyContract || verifyReview) {
    if (!verifyContract || !verifyReview || !existsSync(verifyContract) || !existsSync(verifyReview)) {
      console.error('sealed terminal verification requires existing --verify-sealed-contract and --verify-sealed-review files');
      process.exit(2);
    }
    const result = evaluateSealedTerminalEvidence(readFileSync(verifyContract, 'utf8'), readFileSync(verifyReview, 'utf8'));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  const report = classifyHistoricalPlans(repo);
  process.stdout.write(format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderTsv(report));
}

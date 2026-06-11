import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export type ContractRunOptions = {
  repo?: string;
  contract?: string;
  review?: string;
  runner: string;
  packageDir?: string;
};

export type ContractRunResult = {
  exitCode: number;
  lines: string[];
  repoRoot: string;
  contractPath?: string;
  reviewPath?: string;
  packageDir?: string;
  workerPackage?: string;
  verifierPackage?: string;
};

type DelegationBudget = {
  tokens: number | null;
  tool_calls: number | null;
  wall_time_minutes: number | null;
};

type DelegationMetadata = {
  budget: DelegationBudget;
  permission_scope: Record<string, string>;
  roles: Record<string, string>;
};

function normalizeRepoPath(repo?: string): string {
  return path.resolve(repo ?? process.cwd());
}

function resolveRepoFile(repoRoot: string, filePath: string): { abs: string; rel: string } {
  const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`path escapes repo: ${filePath}`);
  }
  return { abs, rel };
}

function yamlBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let inBlock = false;
  let current: string[] = [];
  for (const line of lines) {
    if (/^```yaml\s*$/.test(line)) {
      inBlock = true;
      current = [];
      continue;
    }
    if (/^```\s*$/.test(line) && inBlock) {
      blocks.push(current.join('\n'));
      inBlock = false;
      current = [];
      continue;
    }
    if (inBlock) current.push(line);
  }
  return blocks;
}

function blockContaining(markdown: string, key: string): string {
  return yamlBlocks(markdown).find((block) => new RegExp(`^\\s*${key}:\\s*$`, 'm').test(block)) ?? '';
}

function readListSection(block: string, sectionName: string): string[] {
  const values: string[] = [];
  let inSection = false;
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed === `${sectionName}:`) {
      inSection = true;
      continue;
    }
    if (inSection && /^[a-zA-Z_][a-zA-Z0-9_]*:\s*$/.test(trimmed)) {
      break;
    }
    const match = inSection ? trimmed.match(/^-\s*(.+)$/) : null;
    if (match) values.push(stripQuotes(match[1]));
  }
  return values;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readBudgetNumber(block: string, key: keyof DelegationBudget): number | null {
  const match = block.match(new RegExp(`^\\s*${key}:\\s*(null|[0-9]+)\\s*$`, 'm'));
  if (!match || match[1] === 'null') return null;
  return Number(match[1]);
}

function readNestedStrings(block: string, sectionName: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  let inSection = false;
  let sectionIndent = 0;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === `${sectionName}:`) {
      inSection = true;
      sectionIndent = rawLine.search(/\S/);
      continue;
    }
    if (!inSection || trimmed === '') continue;
    const indent = rawLine.search(/\S/);
    if (indent <= sectionIndent && /^[a-zA-Z_][a-zA-Z0-9_]*:\s*$/.test(trimmed)) break;
    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+)$/);
    if (match) values[match[1]] = stripQuotes(match[2]);
  }
  return values;
}

function parseDelegation(markdown: string): DelegationMetadata {
  const block = blockContaining(markdown, 'delegation');
  return {
    budget: {
      tokens: readBudgetNumber(block, 'tokens'),
      tool_calls: readBudgetNumber(block, 'tool_calls'),
      wall_time_minutes: readBudgetNumber(block, 'wall_time_minutes'),
    },
    permission_scope: {
      filesystem: 'allowed_paths',
      network: 'none',
      approvals: 'owner',
      ...readNestedStrings(block, 'permission_scope'),
    },
    roles: {
      parent: 'narrate_only',
      worker: 'implement_within_contract',
      verifier: 'verify_exit_criteria',
      ...readNestedStrings(block, 'roles'),
    },
  };
}

function activePlanFromMarker(repoRoot: string): string | null {
  const marker = path.join(repoRoot, '.ai/harness/active-plan');
  if (!existsSync(marker)) return null;
  const plan = readFileSync(marker, 'utf-8').trim();
  return plan.length > 0 ? plan : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function backtickPathFromPlan(repoRoot: string, planRel: string, label: string): string | null {
  const planAbs = path.resolve(repoRoot, planRel);
  if (!existsSync(planAbs)) return null;
  const planText = readFileSync(planAbs, 'utf-8');
  const match = planText.match(new RegExp('> \\*\\*' + escapeRegExp(label) + '\\*\\*:\\s+`([^`]+)`'));
  return match?.[1] ?? null;
}

function defaultPackageDir(repoRoot: string): string {
  const runsDir = path.join(repoRoot, '.ai/harness/runs');
  try {
    mkdirSync(runsDir, { recursive: true });
    return mkdtempSync(path.join(runsDir, 'contract-run-'));
  } catch (_error) {
    return mkdtempSync(path.join(tmpdir(), 'repo-harness-contract-run-'));
  }
}

function buildPackage(args: {
  phase: 'worker' | 'verifier';
  repoRoot: string;
  contract: { abs: string; rel: string };
  review: { abs: string; rel: string };
  allowedPaths: string[];
  exitCriteria: string;
  delegation: DelegationMetadata;
}) {
  const role = args.phase === 'worker' ? args.delegation.roles.worker : args.delegation.roles.verifier;
  return {
    kind: 'repo-harness-contract-run-task',
    phase: args.phase,
    repo: args.repoRoot,
    contract: { path: args.contract.rel, abs_path: args.contract.abs },
    review: { path: args.review.rel, abs_path: args.review.abs },
    allowed_paths: args.allowedPaths,
    exit_criteria: args.exitCriteria,
    delegation: args.delegation,
    parent_role: args.delegation.roles.parent,
    role,
    verifier_rubric_source: 'contract.exit_criteria',
  };
}

function runChild(args: {
  runner: string;
  phase: 'worker' | 'verifier';
  packagePath: string;
  repoRoot: string;
  contractRel: string;
  reviewRel: string;
}): { ok: boolean; message?: string } {
  const child = spawnSync(args.runner, [args.phase, args.packagePath], {
    cwd: args.repoRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      REPO_HARNESS_CONTRACT_RUN_PHASE: args.phase,
      REPO_HARNESS_CONTRACT_RUN_PACKAGE: args.packagePath,
      REPO_HARNESS_CONTRACT_RUN_CONTRACT: args.contractRel,
      REPO_HARNESS_CONTRACT_RUN_REVIEW: args.reviewRel,
      REPO_HARNESS_CONTRACT_RUN_RUBRIC_SOURCE: 'contract.exit_criteria',
    },
  });
  if (child.error) return { ok: false, message: child.error.message };
  if ((child.status ?? 1) !== 0) {
    const detail = child.stderr?.trim() || child.stdout?.trim() || `exit ${child.status ?? 1}`;
    return { ok: false, message: detail };
  }
  return { ok: true };
}

function reviewRecommendsPass(reviewAbs: string): boolean {
  if (!existsSync(reviewAbs)) return false;
  const text = readFileSync(reviewAbs, 'utf-8');
  return /^> \*\*Recommendation\*\*:\s*pass\s*$/im.test(text);
}

export function runContractRun(options: ContractRunOptions): ContractRunResult {
  const lines: string[] = [];
  const repoRoot = normalizeRepoPath(options.repo);

  try {
    const activePlan = activePlanFromMarker(repoRoot);
    const contractInput = options.contract ?? (activePlan ? backtickPathFromPlan(repoRoot, activePlan, 'Sprint Contract') : null);
    const reviewInput = options.review ?? (activePlan ? backtickPathFromPlan(repoRoot, activePlan, 'Sprint Review') : null);
    if (!contractInput) {
      return { exitCode: 2, lines: ['[ContractRun] missing --contract and no active plan contract found'], repoRoot };
    }
    if (!reviewInput) {
      return { exitCode: 2, lines: ['[ContractRun] missing --review and no active plan review found'], repoRoot };
    }

    const contract = resolveRepoFile(repoRoot, contractInput);
    const review = resolveRepoFile(repoRoot, reviewInput);
    if (!existsSync(contract.abs)) {
      return { exitCode: 2, lines: [`[ContractRun] contract not found: ${contract.rel}`], repoRoot, contractPath: contract.rel };
    }

    const contractText = readFileSync(contract.abs, 'utf-8');
    const delegation = parseDelegation(contractText);
    const requiredToolCalls = 2;
    if (delegation.budget.tool_calls !== null && delegation.budget.tool_calls < requiredToolCalls) {
      return {
        exitCode: 1,
        lines: [
          `[ContractRun] budget exceeded: tool_calls ${delegation.budget.tool_calls} < required ${requiredToolCalls}`,
          '[ContractRun] no child runner was invoked',
        ],
        repoRoot,
        contractPath: contract.rel,
        reviewPath: review.rel,
      };
    }

    const allowedBlock = blockContaining(contractText, 'allowed_paths');
    const exitCriteria = blockContaining(contractText, 'exit_criteria');
    const allowedPaths = readListSection(allowedBlock, 'allowed_paths');
    const packageDir = path.resolve(repoRoot, options.packageDir ?? defaultPackageDir(repoRoot));
    mkdirSync(packageDir, { recursive: true });

    const workerPackage = path.join(packageDir, 'worker-package.json');
    const verifierPackage = path.join(packageDir, 'verifier-package.json');
    writeFileSync(
      workerPackage,
      `${JSON.stringify(buildPackage({
        phase: 'worker',
        repoRoot,
        contract,
        review,
        allowedPaths,
        exitCriteria,
        delegation,
      }), null, 2)}\n`,
    );
    writeFileSync(
      verifierPackage,
      `${JSON.stringify(buildPackage({
        phase: 'verifier',
        repoRoot,
        contract,
        review,
        allowedPaths,
        exitCriteria,
        delegation,
      }), null, 2)}\n`,
    );

    lines.push(`[ContractRun] parent role: ${delegation.roles.parent}`);
    lines.push(`[ContractRun] worker package: ${path.relative(repoRoot, workerPackage)}`);
    const worker = runChild({
      runner: options.runner,
      phase: 'worker',
      packagePath: workerPackage,
      repoRoot,
      contractRel: contract.rel,
      reviewRel: review.rel,
    });
    if (!worker.ok) {
      return {
        exitCode: 1,
        lines: [...lines, `[ContractRun] worker failed: ${worker.message ?? 'unknown error'}`],
        repoRoot,
        contractPath: contract.rel,
        reviewPath: review.rel,
        packageDir,
        workerPackage,
        verifierPackage,
      };
    }
    lines.push('[ContractRun] worker complete');
    lines.push(`[ContractRun] verifier rubric: contract.exit_criteria`);
    const verifier = runChild({
      runner: options.runner,
      phase: 'verifier',
      packagePath: verifierPackage,
      repoRoot,
      contractRel: contract.rel,
      reviewRel: review.rel,
    });
    if (!verifier.ok) {
      return {
        exitCode: 1,
        lines: [...lines, `[ContractRun] verifier failed: ${verifier.message ?? 'unknown error'}`],
        repoRoot,
        contractPath: contract.rel,
        reviewPath: review.rel,
        packageDir,
        workerPackage,
        verifierPackage,
      };
    }
    if (!reviewRecommendsPass(review.abs)) {
      return {
        exitCode: 1,
        lines: [...lines, `[ContractRun] verifier did not write a passing review: ${review.rel}`],
        repoRoot,
        contractPath: contract.rel,
        reviewPath: review.rel,
        packageDir,
        workerPackage,
        verifierPackage,
      };
    }
    lines.push('[ContractRun] verifier complete');
    lines.push(`[ContractRun] review: ${review.rel}`);

    return {
      exitCode: 0,
      lines,
      repoRoot,
      contractPath: contract.rel,
      reviewPath: review.rel,
      packageDir,
      workerPackage,
      verifierPackage,
    };
  } catch (error) {
    return {
      exitCode: 2,
      lines: [`[ContractRun] ${(error as Error).message}`],
      repoRoot,
    };
  }
}

export function formatContractRunResult(result: ContractRunResult, asJson = false): string {
  if (asJson) return JSON.stringify(result, null, 2);
  return result.lines.join('\n');
}

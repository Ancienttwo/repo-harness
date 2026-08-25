import { Command } from 'commander';
import { lstatSync, readFileSync, realpathSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

import {
  canonicalAcceptanceMatrixBytes,
  canonicalIntegrationContractBytes,
  canonicalIntegrationEnvelopeBytes,
  canonicalProductAcceptanceProjectionBytes,
  type AcceptanceMatrixResult,
} from '../../core/integration/product-acceptance';
import {
  IntegrationAcceptanceError,
  createAcceptanceMatrix,
  createIntegrationContract,
  createIntegrationEnvelope,
  createProductAcceptanceProjection,
  readAcceptanceMatrix,
  readIntegrationContract,
  readIntegrationEnvelope,
  readProductAcceptanceProjection,
  type CreateAcceptanceMatrixInput,
  type CreateIntegrationContractInput,
} from '../../effects/integration/product-acceptance';

type Format = 'json' | 'text';
type BuildInputOptions = { input: string; format: Format };
type EnvelopeOptions = { contract: string; base: string; head: string; format: Format };
type MatrixOptions = { contract: string; envelope: string; input: string; format: Format };
type AcceptOptions = { contract: string; envelope: string; matrix: string; workflowContract?: string; verification?: string; format: Format };
type ReadOptions = { kind: string; digest: string; format: Format };

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) throw new Error(`${label} fields are invalid: expected ${canonical.join(', ')}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function repoRelativeJson(path: string): unknown {
  if (isAbsolute(path)) throw new Error('input path must be repository-relative');
  const root = realpathSync(process.cwd());
  const lexical = resolve(root, path);
  const rel = relative(root, lexical);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('input path escapes the repository');
  const lexicalStat = lstatSync(lexical);
  if (lexicalStat.isSymbolicLink() || !lexicalStat.isFile()) throw new Error('input path must be a repository-owned regular file');
  const actual = realpathSync(lexical);
  const actualRel = relative(root, actual);
  if (actualRel.startsWith('..') || isAbsolute(actualRel)) throw new Error('input path resolves outside the repository');
  const stat = lstatSync(actual);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('input path must be a regular file');
  return JSON.parse(readFileSync(actual, 'utf-8'));
}

function parseContractInput(path: string): CreateIntegrationContractInput {
  const record = asRecord(repoRelativeJson(path), 'contract input');
  requireExactKeys(record, ['approved_prd_ref', 'source_spec_ref', 'integration_group', 'required_work_packages', 'required_constraints'], 'contract input');
  if (!Array.isArray(record.required_work_packages) || !Array.isArray(record.required_constraints)) throw new Error('contract input arrays are invalid');
  return {
    approved_prd_ref: record.approved_prd_ref as string,
    source_spec_ref: record.source_spec_ref as string,
    integration_group: record.integration_group as string,
    required_work_packages: record.required_work_packages.map((item) => {
      const workPackage = asRecord(item, 'required work package');
      requireExactKeys(workPackage, ['work_package_id', 'work_package_revision'], 'required work package');
      return {
        work_package_id: workPackage.work_package_id as string,
        work_package_revision: workPackage.work_package_revision as string,
      };
    }),
    required_constraints: record.required_constraints as string[],
  };
}

function parseMatrixInput(path: string, contract: string, envelope: string): CreateAcceptanceMatrixInput {
  const record = asRecord(repoRelativeJson(path), 'matrix input');
  requireExactKeys(record, ['rows', 'verifier_receipt_ref'], 'matrix input');
  if (!Array.isArray(record.rows)) throw new Error('matrix input rows must be an array');
  return {
    contract_sha256: contract,
    envelope_sha256: envelope,
    verifier_receipt_ref: record.verifier_receipt_ref as string,
    rows: record.rows.map((item) => {
      const row = asRecord(item, 'matrix row');
      requireExactKeys(row, ['constraint_id', 'evidence_ref', 'result'], 'matrix row');
      return {
        constraint_id: row.constraint_id as string,
        evidence_ref: row.evidence_ref as string,
        result: row.result as AcceptanceMatrixResult,
      };
    }),
  };
}

function formatValue(kind: string, digest: string, canonical: string, format: Format): string {
  if (format !== 'json' && format !== 'text') throw new Error('--format must be json or text');
  if (format === 'json') return canonical;
  return `${kind}\n  digest: ${digest}`;
}

function outputError(error: unknown): void {
  const code = error instanceof IntegrationAcceptanceError ? error.code : 'integration_invalid';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
  process.exitCode = 1;
}

function addFormat(command: Command): Command {
  return command.option('--format <format>', 'json or text', 'json');
}

export function buildIntegrationCommand(): Command {
  const integration = new Command('integration')
    .description('Build and verify exact combined-candidate product acceptance evidence');

  addFormat(integration.command('contract').description('Build an immutable IntegrationContract from an exact input file')
    .requiredOption('--input <path>', 'Repository-relative JSON input'))
    .action((options: BuildInputOptions) => {
      try {
        const value = createIntegrationContract({ repo_root: process.cwd() }, parseContractInput(options.input));
        process.stdout.write(`${formatValue('IntegrationContractV1', value.contract_sha256, canonicalIntegrationContractBytes(value), options.format)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  addFormat(integration.command('envelope').description('Freeze current publications into one exact existing Git candidate')
    .requiredOption('--contract <sha256>', 'IntegrationContract digest')
    .requiredOption('--base <sha>', 'Exact candidate base commit')
    .requiredOption('--head <sha>', 'Exact current candidate head commit'))
    .action((options: EnvelopeOptions) => {
      try {
        const value = createIntegrationEnvelope({ repo_root: process.cwd() }, {
          contract_sha256: options.contract,
          base_sha: options.base,
          final_head_sha: options.head,
        });
        process.stdout.write(`${formatValue('IntegrationEnvelopeV1', value.envelope_sha256, canonicalIntegrationEnvelopeBytes(value), options.format)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  addFormat(integration.command('matrix').description('Build a complete exact-evidence AcceptanceMatrix')
    .requiredOption('--contract <sha256>', 'IntegrationContract digest')
    .requiredOption('--envelope <sha256>', 'IntegrationEnvelope digest')
    .requiredOption('--input <path>', 'Repository-relative JSON matrix input'))
    .action((options: MatrixOptions) => {
      try {
        const value = createAcceptanceMatrix({ repo_root: process.cwd() }, parseMatrixInput(options.input, options.contract, options.envelope));
        process.stdout.write(`${formatValue('AcceptanceMatrixV1', value.matrix_sha256, canonicalAcceptanceMatrixBytes(value), options.format)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  addFormat(integration.command('accept').description('Project the existing verified AcceptanceReceipt onto an exact envelope and matrix')
    .requiredOption('--contract <sha256>', 'IntegrationContract digest')
    .requiredOption('--envelope <sha256>', 'IntegrationEnvelope digest')
    .requiredOption('--matrix <sha256>', 'AcceptanceMatrix digest')
    .option('--workflow-contract <path>', 'Exact workflow contract passed to AcceptanceReceipt verification')
    .option('--verification <path>', 'Exact verification evidence passed to AcceptanceReceipt verification'))
    .action(async (options: AcceptOptions) => {
      try {
        const value = await createProductAcceptanceProjection({ repo_root: process.cwd() }, {
          contract_sha256: options.contract,
          envelope_sha256: options.envelope,
          matrix_sha256: options.matrix,
          workflow_contract_ref: options.workflowContract,
          verification_ref: options.verification,
        });
        process.stdout.write(`${formatValue('ProductAcceptanceProjectionV1', value.projection_sha256, canonicalProductAcceptanceProjectionBytes(value), options.format)}\n`);
      } catch (error) {
        outputError(error);
      }
    });

  addFormat(integration.command('read').description('Read one immutable integration evidence object by digest')
    .requiredOption('--kind <kind>', 'contract, envelope, matrix or product')
    .requiredOption('--digest <sha256>', 'Content-addressed evidence digest'))
    .action((options: ReadOptions) => {
      try {
        if (options.kind === 'contract') {
          const value = readIntegrationContract(process.cwd(), options.digest);
          process.stdout.write(`${formatValue('IntegrationContractV1', value.contract_sha256, canonicalIntegrationContractBytes(value), options.format)}\n`);
          return;
        }
        if (options.kind === 'envelope') {
          const value = readIntegrationEnvelope(process.cwd(), options.digest);
          process.stdout.write(`${formatValue('IntegrationEnvelopeV1', value.envelope_sha256, canonicalIntegrationEnvelopeBytes(value), options.format)}\n`);
          return;
        }
        if (options.kind === 'matrix') {
          const value = readAcceptanceMatrix(process.cwd(), options.digest);
          process.stdout.write(`${formatValue('AcceptanceMatrixV1', value.matrix_sha256, canonicalAcceptanceMatrixBytes(value), options.format)}\n`);
          return;
        }
        if (options.kind === 'product') {
          const value = readProductAcceptanceProjection(process.cwd(), options.digest);
          process.stdout.write(`${formatValue('ProductAcceptanceProjectionV1', value.projection_sha256, canonicalProductAcceptanceProjectionBytes(value), options.format)}\n`);
          return;
        }
        throw new Error(`unknown integration evidence kind: ${options.kind}`);
      } catch (error) {
        outputError(error);
      }
    });

  return integration;
}

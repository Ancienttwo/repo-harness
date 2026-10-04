#!/usr/bin/env bun
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  reportByteBindingPath,
  validateHarnessBenchmarkReport,
} from './run-harness-profile-benchmark';

function usage(): never {
  process.stderr.write('Usage: validate-harness-profile-benchmark.ts --report <path> [--require-authoritative] [--format json]\n');
  process.exit(2);
}

const argv = process.argv.slice(2);
const reportIndex = argv.indexOf('--report');
if (reportIndex < 0 || !argv[reportIndex + 1]) usage();
const formatIndex = argv.indexOf('--format');
if (formatIndex >= 0 && argv[formatIndex + 1] !== 'json') usage();
const reportPath = argv[reportIndex + 1];
const requireAuthoritative = argv.includes('--require-authoritative');

try {
  const report = validateHarnessBenchmarkReport(reportPath, requireAuthoritative);
  const bindingPath = reportByteBindingPath(reportPath);
  const reportEvidenceSha256 = `sha256:${createHash('sha256').update(readFileSync(bindingPath)).digest('hex')}`;
  process.stdout.write(`${JSON.stringify({
    status: 'pass',
    benchmark_subject_sha256: report.benchmark_subject_sha256,
    report_evidence_sha256: reportEvidenceSha256,
    report_path: reportPath,
    binding_path: bindingPath,
    authoritative: report.authoritative,
    profile_base_count: report.provenance.profile_base_count,
    arm_count: report.provenance.arm_count,
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

/**
 * Test-level execution source for required-check revalidation (#1256).
 *
 * The rerun attempt's JUnit reports are the defined source. GitHub exposes run
 * artifacts, not their content, so the collector lists the run's artifacts,
 * selects the ones whose name carries the attempt suffix, downloads them with
 * the GitHub CLI and reads the XML. Any provider or parse failure becomes
 * `unavailable`; it never becomes a passing test-level set.
 */

import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  projectTestExecution,
  selectAttemptTestArtifacts,
  type RequiredCheckTestExecutionV1,
  type TestExecutionFileV1,
} from '../../core/evidence/test-execution-evidence';

export interface TestExecutionReadInput {
  readonly repository: string;
  readonly run_id: number;
  readonly attempt: number;
  readonly repo_root: string;
  readonly gh_bin?: string;
  /** Test seam for the artifact listing read. */
  readonly gh_runner?: (args: readonly string[]) => { readonly status: number; readonly stdout: string; readonly stderr?: string };
  /** Test seam for one artifact download; the real default runs `gh run download`. */
  readonly download?: (name: string, directory: string) => boolean;
}

interface ListedArtifact {
  readonly name: string;
}

const UNAVAILABLE: RequiredCheckTestExecutionV1 = Object.freeze({ status: 'unavailable' });
const ARTIFACT_PAGE = 100;
const ARTIFACT_PAGE_LIMIT = 10;

function ghEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, GH_HOST: 'github.com' };
}

function ghBinary(input: TestExecutionReadInput): string {
  return input.gh_bin ?? process.env.REPO_HARNESS_GH_BIN ?? 'gh';
}

function artifactPage(value: unknown): { artifacts: ListedArtifact[]; total: number } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.total_count) || Number(record.total_count) < 0 || !Array.isArray(record.artifacts)) return null;
  const artifacts: ListedArtifact[] = [];
  for (const entry of record.artifacts) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const artifact = entry as Record<string, unknown>;
    if (!Number.isSafeInteger(artifact.id) || Number(artifact.id) < 1
      || typeof artifact.name !== 'string' || artifact.name.trim() === '') return null;
    if (artifact.expired !== true) artifacts.push(Object.freeze({ name: artifact.name }));
  }
  return { artifacts, total: Number(record.total_count) };
}

function listArtifactsSync(input: TestExecutionReadInput): ListedArtifact[] | null {
  const artifacts: ListedArtifact[] = [];
  for (let page = 1; page <= ARTIFACT_PAGE_LIMIT; page++) {
    const path = `repos/${input.repository}/actions/runs/${input.run_id}/artifacts?per_page=${ARTIFACT_PAGE}&page=${page}`;
    const args = ['api', path, '--hostname', 'github.com'];
    const result = input.gh_runner?.(args) ?? spawnSync(ghBinary(input), args, {
      cwd: input.repo_root,
      env: ghEnvironment(),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) return null;
    let parsed: ReturnType<typeof artifactPage>;
    try { parsed = artifactPage(JSON.parse(result.stdout)); } catch { return null; }
    if (parsed === null) return null;
    artifacts.push(...parsed.artifacts);
    if (artifacts.length >= parsed.total) return artifacts;
  }
  return null;
}

function readTree(directory: string, files: TestExecutionFileV1[]): void {
  for (const entry of readdirSync(directory)) {
    const target = join(directory, entry);
    const stat = statSync(target);
    if (stat.isDirectory()) readTree(target, files);
    else if (stat.isFile() && entry.endsWith('.xml')) files.push({ path: target, text: readFileSync(target, 'utf8') });
  }
}

function downloadDefault(input: TestExecutionReadInput, name: string, directory: string): boolean {
  const result = spawnSync(ghBinary(input),
    ['run', 'download', String(input.run_id), '--repo', input.repository, '--name', name, '--dir', directory], {
      cwd: input.repo_root,
      env: ghEnvironment(),
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return result.status === 0;
}

function collectTestFiles(
  input: TestExecutionReadInput,
  artifacts: readonly ListedArtifact[],
): TestExecutionFileV1[] | null {
  const selected = selectAttemptTestArtifacts(artifacts, input.attempt);
  if (selected.length === 0) return null;
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-test-execution-'));
  try {
    const files: TestExecutionFileV1[] = [];
    for (const artifact of selected) {
      const directory = mkdtempSync(join(root, `${basename(artifact.name)}-`));
      const downloaded = input.download?.(artifact.name, directory) ?? downloadDefault(input, artifact.name, directory);
      if (!downloaded) return null;
      readTree(directory, files);
    }
    return files;
  } catch {
    return null;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Reads the rerun attempt's test-level execution results from JUnit artifacts. */
export function readTestExecutionEvidence(input: TestExecutionReadInput): RequiredCheckTestExecutionV1 {
  const artifacts = listArtifactsSync(input);
  if (artifacts === null) return UNAVAILABLE;
  const files = collectTestFiles(input, artifacts);
  return files === null ? UNAVAILABLE : projectTestExecution(files);
}

function runAsync(
  bin: string,
  args: readonly string[],
  input: TestExecutionReadInput,
  signal: AbortSignal | undefined,
): Promise<{ status: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(bin, [...args], {
      cwd: input.repo_root,
      env: ghEnvironment(),
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      signal,
    }, (error, stdout) => {
      if (error) resolve({ status: 1, stdout: stdout ?? '' });
      else resolve({ status: 0, stdout: stdout ?? '' });
    });
  });
}

/** Abortable variant of the artifact read for the asynchronous readiness path. */
export async function readTestExecutionEvidenceAbortable(
  input: TestExecutionReadInput,
  signal: AbortSignal | undefined,
): Promise<RequiredCheckTestExecutionV1> {
  const artifacts: ListedArtifact[] = [];
  try {
    let complete = false;
    for (let page = 1; page <= ARTIFACT_PAGE_LIMIT; page++) {
      const path = `repos/${input.repository}/actions/runs/${input.run_id}/artifacts?per_page=${ARTIFACT_PAGE}&page=${page}`;
      const result = input.gh_runner
        ? input.gh_runner(['api', path, '--hostname', 'github.com'])
        : await runAsync(ghBinary(input), ['api', path, '--hostname', 'github.com'], input, signal);
      if (result.status !== 0) return UNAVAILABLE;
      const parsed = artifactPage(JSON.parse(result.stdout));
      if (parsed === null) return UNAVAILABLE;
      artifacts.push(...parsed.artifacts);
      if (artifacts.length >= parsed.total) { complete = true; break; }
    }
    if (!complete) return UNAVAILABLE;
    const selected = selectAttemptTestArtifacts(artifacts, input.attempt);
    if (selected.length === 0) return UNAVAILABLE;
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-test-execution-'));
    try {
      const files: TestExecutionFileV1[] = [];
      for (const artifact of selected) {
        const directory = mkdtempSync(join(root, `${basename(artifact.name)}-`));
        const downloaded = input.download !== undefined
          ? input.download(artifact.name, directory)
          : (await runAsync(ghBinary(input),
            ['run', 'download', String(input.run_id), '--repo', input.repository, '--name', artifact.name, '--dir', directory],
            input, signal)).status === 0;
        if (!downloaded) return UNAVAILABLE;
        readTree(directory, files);
      }
      return projectTestExecution(files);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Existing-repo harness bootstrap/update implementation.
 *
 * This backs the public `repo-harness adopt` command and the legacy
 * `repo-harness-init` skill facade: default the target repo to cwd,
 * install/refresh the machine runtime pieces, apply the repo-local workflow
 * migration, then verify the installed harness.
 */

import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { homedir } from "os";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { runInstall, type InstallTargetSpec } from "./install";
import { runBrain } from "./brain";
import {
  defaultBrainRootChoice,
  discoverBrainRootChoices,
  expandHomePath,
  type BrainRootChoice,
} from "./brain-root";
import { configureCodegraph, ensureCodegraph } from "../tools/codegraph";
import { runProcess as runBoundedProcess } from "../../effects/process-runner";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..");
const WAZA_SKILLS = ["think", "hunt", "check", "health"];
const GBRAIN_INSTALL_ARGS = ["install", "-g", "github:garrytan/gbrain"] as const;
const GLOBAL_RULES_BEGIN = "<!-- BEGIN: repo-harness global-working-rules -->";
const GLOBAL_RULES_END = "<!-- END: repo-harness global-working-rules -->";

export type InitBrainMode = "manifest-only" | "install-gbrain-cli" | "skip";
export type ReportingLanguagePreset = "follow" | "zh-CN" | "en" | "custom";

export interface GlobalContextOptions {
  reportLanguageInstruction: string;
}

/**
 * Cross-review skills bundled in this package under `assets/skills/<skill>` and
 * installed host-aware: `codex-review` (Claude host) lets a Claude session get an
 * independent Codex review; `claude-review` (Codex host) lets a Codex session get
 * an independent Claude review. They are self-contained (no gstack runtime), so
 * init bootstraps them as workflow-owned runtime skills alongside Waza and
 * Mermaid, not as an unrelated plugin marketplace stack.
 */
const CROSS_REVIEW_SKILLS: ReadonlyArray<{ skill: string; host: "claude" | "codex" }> = [
  { skill: "codex-review", host: "claude" },
  { skill: "claude-review", host: "codex" },
];

export interface InitCommandOptions {
  repo?: string;
  sourceRoot?: string;
  apply?: boolean;
  verify?: boolean;
  syncSkill?: boolean;
  hostAdapters?: boolean;
  externalSkills?: boolean;
  codegraph?: boolean;
  configureCodegraphMcp?: boolean;
  syncCodegraph?: boolean;
  globalContext?: GlobalContextOptions;
  brainRoot?: string;
  brainMode?: InitBrainMode;
  target?: InstallTargetSpec;
  env?: NodeJS.ProcessEnv;
}

export interface InitStep {
  step: string;
  status: "ok" | "skipped" | "failed";
  command?: string[];
  detail?: string;
  stdout?: string;
  stderr?: string;
}

export interface InitCommandResult {
  exitCode: number;
  repoRoot: string;
  steps: InitStep[];
  lines: string[];
}

export interface InteractiveInitOptions extends InitCommandOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

interface Choice<T> {
  label: string;
  value: T;
  detail?: string;
}

function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): InitStep {
  const result = runBoundedProcess(command, args, { cwd, env });

  return {
    step: "",
    status: result.ok ? "ok" : "failed",
    command: [...result.command],
    stdout: result.stdout,
    stderr: result.stderr || result.error,
  };
}

function isNpxCacheSource(sourceRoot: string): boolean {
  return /[\\/]_npx[\\/]/.test(sourceRoot);
}

function initCommandEnv(sourceRoot: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
  if (!isNpxCacheSource(sourceRoot)) return env;
  if (env?.AGENTIC_DEV_LINK_INSTALLED_COPIES !== undefined) return env;
  return { ...(env ?? {}), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" };
}

function withStepName(step: InitStep, name: string, detail?: string): InitStep {
  return { ...step, step: name, detail: detail ?? step.detail };
}

function renderStep(step: InitStep): string[] {
  const lines = [`[init] ${step.status}: ${step.step}${step.detail ? ` - ${step.detail}` : ""}`];
  if (step.status === "failed" && step.stderr?.trim()) {
    lines.push(step.stderr.trim());
  }
  return lines;
}

function withProcessEnv<T>(env: NodeJS.ProcessEnv | undefined, fn: () => T): T {
  if (!env) return fn();
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function hostAgents(target: InstallTargetSpec): string[] {
  if (target === "codex") return ["codex"];
  if (target === "claude") return ["claude-code"];
  return ["claude-code", "codex"];
}

function homeDir(env?: NodeJS.ProcessEnv): string | null {
  return env?.HOME ?? env?.USERPROFILE ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? null;
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function isGitWorkTree(repoRoot: string, env?: NodeJS.ProcessEnv): boolean {
  const result = runBoundedProcess("git", ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"], { env });
  return result.ok && result.stdout.trim() === "true";
}

export function validateRepoAdoptionTarget(
  repoRoot: string,
  explicitRepo: boolean,
  env?: NodeJS.ProcessEnv,
): InitStep | null {
  const home = homeDir(env);
  if (home && samePath(repoRoot, home)) {
    return {
      step: "validate repo target",
      status: "failed",
      detail:
        `refusing to apply repo harness to HOME (${repoRoot}); run repo-harness adopt --repo <git-repo> from an intended project`,
    };
  }

  if (!explicitRepo && !isGitWorkTree(repoRoot, env)) {
    return {
      step: "validate repo target",
      status: "failed",
      detail:
        `cwd is not inside a git work tree (${repoRoot}); pass --repo <project-path> explicitly for non-git scaffolds`,
    };
  }

  return null;
}

function languageInstruction(preset: ReportingLanguagePreset, custom?: string): string {
  if (preset === "zh-CN") return "Use Chinese to report to user.";
  if (preset === "en") return "Use English to report to user.";
  if (preset === "custom") return custom?.trim() || "Use the user's language for reports; keep technical terms in English.";
  return "Use the user's language for reports; keep technical terms in English.";
}

function readGlobalRulesTemplate(sourceRoot: string): string {
  const file = join(sourceRoot, "assets", "reference-configs", "global-working-rules.md");
  const raw = readFileSync(file, "utf-8");
  const match = raw.match(/```md\n([\s\S]*?)\n```/);
  return match?.[1] ?? raw;
}

function renderGlobalRules(sourceRoot: string, instruction: string): string {
  const template = readGlobalRulesTemplate(sourceRoot);
  const rendered = template.replace(
    /^- Use the user's language for reports; keep technical terms in English\.$/m,
    `- ${instruction}`,
  );
  return `${GLOBAL_RULES_BEGIN}\n${rendered.trim()}\n${GLOBAL_RULES_END}\n`;
}

function mergeManagedBlock(current: string, block: string): string {
  const start = current.indexOf(GLOBAL_RULES_BEGIN);
  const end = current.indexOf(GLOBAL_RULES_END);
  if (start >= 0 && end >= start) {
    const afterEnd = end + GLOBAL_RULES_END.length;
    return `${current.slice(0, start)}${block.trimEnd()}${current.slice(afterEnd).replace(/^\n?/, "\n")}`;
  }
  if (
    /^# Global Working Rules\s*$/m.test(current) ||
    (
      current.includes("## Progressive Due Diligence") &&
      current.includes("### P1: Architecture Map") &&
      current.includes("### P2: Concrete Trace") &&
      current.includes("### P3: Design Decision")
    )
  ) {
    return current;
  }
  const trimmed = current.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${block}`;
}

export function writeGlobalContextFiles(
  sourceRoot: string,
  target: InstallTargetSpec,
  opts: GlobalContextOptions,
  env?: NodeJS.ProcessEnv,
): InitStep {
  const home = homeDir(env);
  if (!home) {
    return { step: "global working rules", status: "failed", detail: "HOME is required to resolve host context files" };
  }

  const block = renderGlobalRules(sourceRoot, opts.reportLanguageInstruction);
  const targets: string[] = [];
  if (target === "codex" || target === "both") targets.push(join(home, ".codex", "AGENTS.md"));
  if (target === "claude" || target === "both") targets.push(join(home, ".claude", "CLAUDE.md"));

  const changes: string[] = [];
  for (const filePath of targets) {
    mkdirSync(dirname(filePath), { recursive: true });
    const current = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
    const next = mergeManagedBlock(current, block);
    if (next === current) {
      changes.push(`unchanged:${filePath}`);
      continue;
    }
    writeFileSync(filePath, next, "utf-8");
    changes.push(`${current ? "updated" : "created"}:${filePath}`);
  }

  return { step: "global working rules", status: "ok", detail: changes.join(", ") };
}

/**
 * Install the bundled cross-review skills, each into the host where it is useful:
 * `codex-review` → `~/.claude/skills` (Claude calls Codex), `claude-review` →
 * `~/.codex/skills` (Codex calls Claude). Respects `target`, is idempotent
 * (identical SKILL.md → "already present"), and treats a missing bundled source
 * as `skipped` (never fails init).
 */
export function syncCrossReviewSkills(
  sourceRoot: string,
  target: InstallTargetSpec,
  env?: NodeJS.ProcessEnv,
): InitStep[] {
  const home = homeDir(env);
  const steps: InitStep[] = [];
  for (const { skill, host } of CROSS_REVIEW_SKILLS) {
    const step = `cross-review skill ${skill}`;
    if (target !== "both" && target !== host) continue;
    if (!home) {
      steps.push({ step, status: "failed", detail: "HOME is required to resolve host skill roots" });
      continue;
    }
    const source = join(sourceRoot, "assets", "skills", skill);
    const srcSkill = join(source, "SKILL.md");
    if (!existsSync(srcSkill)) {
      steps.push({ step, status: "skipped", detail: `bundled source not found at ${source}` });
      continue;
    }
    const root = join(home, host === "claude" ? ".claude" : ".codex", "skills");
    const dest = join(root, skill);
    const destSkill = join(dest, "SKILL.md");
    mkdirSync(root, { recursive: true });
    if (
      existsSync(dest) &&
      (samePath(source, dest) ||
        (existsSync(destSkill) && readFileSync(destSkill, "utf-8") === readFileSync(srcSkill, "utf-8")))
    ) {
      steps.push({ step, status: "ok", detail: "already present" });
      continue;
    }
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    cpSync(source, dest, { recursive: true });
    steps.push({ step, status: "ok", detail: `synced ${dest}` });
  }
  return steps;
}

function installExternalSkills(sourceRoot: string, target: InstallTargetSpec, env?: NodeJS.ProcessEnv): InitStep[] {
  const steps: InitStep[] = [];
  const agents = hostAgents(target);
  const waza = runProcess(
    "npx",
    [
      "-y",
      "skills",
      "add",
      "tw93/Waza",
      "-g",
      "-a",
      ...agents,
      "-s",
      ...WAZA_SKILLS,
      "-y",
    ],
    sourceRoot,
    env,
  );
  steps.push(withStepName(waza, "external skills Waza", `target=${target}`));
  const mermaid = runProcess(
    "npx",
    [
      "-y",
      "skills",
      "add",
      "BfdCampos/dotfiles",
      "-g",
      "-a",
      ...agents,
      "-s",
      "mermaid",
      "-y",
    ],
    sourceRoot,
    env,
  );
  steps.push(withStepName(mermaid, "external skill mermaid", `target=${target}`));
  steps.push(...syncCrossReviewSkills(sourceRoot, target, env));
  return steps;
}

export function runInit(opts: InitCommandOptions = {}): InitCommandResult {
  const sourceRoot = resolve(opts.sourceRoot ?? REPO_ROOT);
  const repoRoot = resolve(opts.repo ?? process.cwd());
  let commandEnv = initCommandEnv(sourceRoot, opts.env);
  const apply = opts.apply !== false;
  const verify = opts.verify !== false;
  const syncSkill = opts.syncSkill !== false;
  const hostAdapters = opts.hostAdapters !== false;
  const externalSkills = opts.externalSkills !== false;
  const codegraph = opts.codegraph !== false;
  const configureCgMcp = opts.configureCodegraphMcp === true;
  const syncCodegraph = opts.syncCodegraph === true;
  const brainMode = opts.brainMode ?? "skip";
  const target = opts.target ?? "both";
  const steps: InitStep[] = [];

  if (opts.brainRoot) {
    commandEnv = { ...(commandEnv ?? {}), REPO_HARNESS_BRAIN_ROOT: opts.brainRoot };
  }

  const targetError = validateRepoAdoptionTarget(repoRoot, opts.repo !== undefined, commandEnv);
  if (targetError) {
    const steps = [targetError];
    return {
      exitCode: 2,
      repoRoot,
      steps,
      lines: steps.flatMap(renderStep),
    };
  }

  if (syncSkill && apply) {
    const step = runProcess("bash", [join(sourceRoot, "scripts", "sync-codex-installed-copies.sh")], sourceRoot, commandEnv);
    steps.push(withStepName(step, "sync repo-harness skills", `target=${target}`));
  } else {
    steps.push({
      step: "sync repo-harness skills",
      status: "skipped",
      detail: syncSkill ? "dry-run" : "disabled",
    });
  }

  if (hostAdapters && apply) {
    const installed = withProcessEnv(commandEnv, () => runInstall({ target, location: "global" }));
    steps.push({
      step: "install host adapters",
      status: installed.exitCode === 0 ? "ok" : "failed",
      detail: installed.lines.join("; "),
    });
  } else {
    steps.push({
      step: "install host adapters",
      status: "skipped",
      detail: hostAdapters ? "dry-run" : "disabled",
    });
  }

  if (opts.globalContext && apply) {
    steps.push(writeGlobalContextFiles(sourceRoot, target, opts.globalContext, commandEnv));
  } else {
    steps.push({
      step: "global working rules",
      status: "skipped",
      detail: opts.globalContext ? "dry-run" : "disabled",
    });
  }

  const inspect = runProcess(
    process.execPath,
    [join(sourceRoot, "scripts", "inspect-project-state.ts"), "--repo", repoRoot, "--format", "text"],
    sourceRoot,
    commandEnv,
  );
  steps.push(withStepName(inspect, "inspect repo", repoRoot));

  const migrate = runProcess(
    "bash",
    [
      join(sourceRoot, "scripts", "migrate-project-template.sh"),
      "--repo",
      repoRoot,
      apply ? "--apply" : "--dry-run",
    ],
    sourceRoot,
    commandEnv,
  );
  steps.push(withStepName(migrate, apply ? "apply repo harness" : "plan repo harness", repoRoot));

  if (externalSkills && apply && migrate.status === "ok") {
    steps.push(...installExternalSkills(sourceRoot, target, commandEnv));
  } else {
    steps.push({
      step: "external skills",
      status: "skipped",
      detail: !externalSkills
        ? "disabled"
        : apply
          ? "repo harness did not apply cleanly"
          : "dry-run",
    });
  }

  if (codegraph && apply) {
    try {
      const cg = ensureCodegraph({ repoRoot, init: true, sync: syncCodegraph, env: commandEnv, host: target });
      const cgFailed = cg.actions.some((entry) => entry.status === "failed");
      steps.push({
        step: "ensure codegraph index",
        status: cg.actions.length === 0 ? "skipped" : cgFailed ? "failed" : "ok",
        detail:
          cg.resolution.source === "missing"
            ? "codegraph CLI not found; skipped (install via: repo-harness tools ensure codegraph)"
            : cg.actions.length > 0
              ? cg.actions.map((entry) => `${entry.action}:${entry.status}`).join(", ")
              : `index ${cg.status}`,
      });

      const mcpHosts =
        (cg.raw as { mcp_hosts?: Record<string, { status?: string }> }).mcp_hosts ?? {};
      const mcpConfigured =
        cg.resolution.source !== "missing" &&
        ["codex", "claude"].every((host) => mcpHosts[host]?.status === "configured");

      if (cg.resolution.source !== "missing" && !mcpConfigured) {
        if (configureCgMcp) {
          const conf = configureCodegraph({ repoRoot, target, location: "global", env: commandEnv });
          steps.push({
            step: "configure codegraph mcp",
            status: conf.actions.some((entry) => entry.status === "failed") ? "failed" : "ok",
            detail: conf.actions.map((entry) => `${entry.action}:${entry.status}`).join(", "),
          });
        } else {
          steps.push({
            step: "codegraph mcp",
            status: "skipped",
            detail:
              "not registered; run: repo-harness tools configure codegraph --target both --location global",
          });
        }
      }
    } catch (error) {
      steps.push({
        step: "ensure codegraph index",
        status: "failed",
        detail: "CodeGraph readiness check failed",
        stderr: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    steps.push({
      step: "ensure codegraph index",
      status: "skipped",
      detail: codegraph ? "dry-run" : "disabled",
    });
  }

  if (brainMode !== "skip" && apply && migrate.status === "ok") {
    const root = opts.brainRoot ?? commandEnv?.REPO_HARNESS_BRAIN_ROOT;
    if (root) {
      mkdirSync(root, { recursive: true });
      steps.push({ step: "ensure brain root", status: "ok", detail: root });
    }
    if (brainMode === "install-gbrain-cli") {
      const gbrain = runProcess("bun", [...GBRAIN_INSTALL_ARGS], sourceRoot, commandEnv);
      steps.push(withStepName(gbrain, "install gbrain CLI"));
    }
    try {
      const result = withProcessEnv(commandEnv, () => runBrain("sync", { repo: repoRoot }));
      const hasErrors = result.issues.some((entry) => entry.level === "error");
      steps.push({
        step: "sync brain docs",
        status: hasErrors ? "failed" : "ok",
        detail: `root=${result.brainRoot}; synced=${result.synced.length}; skipped=${result.skipped.length}; issues=${result.issues.length}`,
      });
    } catch (error) {
      steps.push({
        step: "sync brain docs",
        status: "failed",
        detail: (error as Error).message,
      });
    }
  } else {
    steps.push({
      step: "sync brain docs",
      status: "skipped",
      detail: brainMode === "skip" ? "disabled" : apply ? "repo harness did not apply cleanly" : "dry-run",
    });
  }

  if (apply && verify) {
    const verifyEnv = { ...(commandEnv ?? {}), REPO_HARNESS_SOURCE_ROOT: sourceRoot };
    if (migrate.status === "ok") {
      if (existsSync(join(repoRoot, "scripts", "prepare-codex-handoff.sh"))) {
        const handoff = runProcess(
          "bash",
          ["scripts/prepare-codex-handoff.sh", "--reason", "repo-harness-adopt-verify"],
          repoRoot,
          verifyEnv,
        );
        steps.push(
          withStepName(
            handoff,
            "refresh handoff packet",
            "scripts/prepare-codex-handoff.sh --reason repo-harness-adopt-verify",
          ),
        );
      } else {
        steps.push({
          step: "refresh handoff packet",
          status: "skipped",
          detail: "scripts/prepare-codex-handoff.sh missing",
        });
      }
    }
    const verifyStep = runProcess("bash", ["scripts/check-task-workflow.sh", "--strict"], repoRoot, verifyEnv);
    steps.push(withStepName(verifyStep, "verify repo harness", "scripts/check-task-workflow.sh --strict"));
  } else {
    steps.push({ step: "verify repo harness", status: "skipped" });
  }

  const failed = steps.some((step) => step.status === "failed");
  return {
    exitCode: failed ? 1 : 0,
    repoRoot,
    steps,
    lines: steps.flatMap(renderStep),
  };
}

function writeLine(output: NodeJS.WritableStream, line = ""): void {
  output.write(`${line}\n`);
}

function selectedIndex(answer: string, count: number, defaultIndex: number): number | null {
  const trimmed = answer.trim();
  if (!trimmed) return defaultIndex;
  const parsed = Number(trimmed);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= count) return parsed - 1;
  return null;
}

async function askChoice<T>(
  rl: ReturnType<typeof createInterface>,
  output: NodeJS.WritableStream,
  title: string,
  choices: Choice<T>[],
  defaultIndex: number,
): Promise<T> {
  while (true) {
    writeLine(output, title);
    choices.forEach((choice, index) => {
      const defaultMarker = index === defaultIndex ? " (default)" : "";
      const detail = choice.detail ? ` - ${choice.detail}` : "";
      writeLine(output, `  ${index + 1}. ${choice.label}${defaultMarker}${detail}`);
    });
    const answer = await rl.question(`Select [${defaultIndex + 1}]: `);
    const index = selectedIndex(answer, choices.length, defaultIndex);
    if (index !== null) {
      writeLine(output);
      return choices[index].value;
    }
    writeLine(output, `Enter a number from 1 to ${choices.length}.`);
  }
}

async function askText(
  rl: ReturnType<typeof createInterface>,
  output: NodeJS.WritableStream,
  question: string,
  fallback: string,
): Promise<string> {
  const answer = await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `);
  writeLine(output);
  return answer.trim() || fallback;
}

async function askConfirm(
  rl: ReturnType<typeof createInterface>,
  output: NodeJS.WritableStream,
  question: string,
): Promise<boolean> {
  while (true) {
    const answer = (await rl.question(`${question} [Y/n]: `)).trim().toLowerCase();
    writeLine(output);
    if (!answer || answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    writeLine(output, "Enter y or n.");
  }
}

function brainChoiceLabel(choice: BrainRootChoice): string {
  return choice.available ? choice.label : `${choice.label} (not found)`;
}

function brainLocationChoices(env?: NodeJS.ProcessEnv, customPath?: string): Array<Choice<BrainRootChoice | "custom">> {
  const discovered = discoverBrainRootChoices({ env, customPath });
  const choices: Array<Choice<BrainRootChoice | "custom">> = discovered.map((choice) => ({
    label: brainChoiceLabel(choice),
    value: choice,
    detail: choice.detail,
  }));
  if (!customPath) {
    choices.push({ label: "Custom path", value: "custom", detail: "Use an explicit brain root path" });
  }
  return choices;
}

function defaultBrainChoiceIndex(
  choices: Array<Choice<BrainRootChoice | "custom">>,
  env?: NodeJS.ProcessEnv,
  preferCustom = false,
): number {
  if (preferCustom) {
    const customIndex = choices.findIndex((choice) => choice.value !== "custom" && choice.value.kind === "custom");
    if (customIndex >= 0) return customIndex;
  }
  const fallback = defaultBrainRootChoice({ env });
  const index = choices.findIndex((choice) => choice.value !== "custom" && choice.value.kind === fallback.kind);
  return index >= 0 ? index : 0;
}

function renderInteractivePlan(lines: string[]): string {
  return [
    "Install plan:",
    ...lines.map((line) => `  - ${line}`),
  ].join("\n");
}

export async function runInteractiveInit(opts: InteractiveInitOptions = {}): Promise<InitCommandResult> {
  const sourceRoot = resolve(opts.sourceRoot ?? REPO_ROOT);
  const repoRoot = resolve(opts.repo ?? process.cwd());
  const output = opts.output ?? stdout;
  const rl = createInterface({
    input: opts.input ?? stdin,
    output,
    terminal: false,
  });

  try {
    const targetDefault = opts.target === "codex" ? 1 : opts.target === "claude" ? 2 : 0;
    const target = await askChoice<InstallTargetSpec>(
      rl,
      output,
      "Host target",
      [
        { label: "both", value: "both", detail: "Install Codex and Claude adapters/skills" },
        { label: "codex", value: "codex", detail: "Install Codex only" },
        { label: "claude", value: "claude", detail: "Install Claude only" },
      ],
      targetDefault,
    );

    const languagePreset = await askChoice<ReportingLanguagePreset>(
      rl,
      output,
      "Reporting language",
      [
        { label: "Follow user's language", value: "follow", detail: "Keep technical terms in English" },
        { label: "中文", value: "zh-CN", detail: "Write reports in Chinese" },
        { label: "English", value: "en", detail: "Write reports in English" },
        { label: "Custom instruction", value: "custom", detail: "Write an exact sentence" },
      ],
      0,
    );
    const customInstruction =
      languagePreset === "custom"
        ? await askText(
            rl,
            output,
            "Reporting language instruction",
            "Use the user's language for reports; keep technical terms in English.",
          )
        : undefined;
    const reportLanguageInstruction = languageInstruction(languagePreset, customInstruction);

    let customBrainPath = opts.brainRoot;
    let brainChoices = brainLocationChoices(opts.env, customBrainPath);
    let brainChoice = await askChoice<BrainRootChoice | "custom">(
      rl,
      output,
      "Brain location",
      brainChoices,
      defaultBrainChoiceIndex(brainChoices, opts.env, Boolean(customBrainPath)),
    );
    if (brainChoice === "custom") {
      customBrainPath = await askText(rl, output, "Custom brain root", "~/Documents/brain");
      brainChoices = brainLocationChoices(opts.env, customBrainPath);
      brainChoice = brainChoices.find((choice) => choice.value !== "custom" && choice.value.kind === "custom")?.value
        ?? {
          kind: "custom",
          label: "Custom",
          root: resolve(expandHomePath(customBrainPath, opts.env)),
          available: true,
          detail: resolve(expandHomePath(customBrainPath, opts.env)),
        };
    }

    const brainMode = await askChoice<InitBrainMode>(
      rl,
      output,
      "Brain mode",
      [
        { label: "manifest only", value: "manifest-only", detail: "Use file-vault manifest/check/sync" },
        { label: "install gbrain CLI", value: "install-gbrain-cli", detail: "Install GitHub GBrain CLI, but do not enable MCP" },
        { label: "skip brain sync", value: "skip", detail: "Do not create or sync a brain root" },
      ],
      0,
    );

    writeLine(output, renderInteractivePlan([
      `repo=${repoRoot}`,
      `target=${target}`,
      `reporting=${reportLanguageInstruction}`,
      `brainRoot=${brainChoice.root}`,
      `brainMode=${brainMode}`,
      "CodeGraph=required ensure --init --sync plus global MCP configure",
      `apply=${opts.apply === false ? "false" : "true"}`,
      `verify=${opts.verify === false ? "false" : "true"}`,
    ]));
    writeLine(output);

    const confirmed = await askConfirm(rl, output, "Proceed");
    if (!confirmed) {
      const steps: InitStep[] = [{ step: "interactive confirmation", status: "skipped", detail: "cancelled" }];
      return {
        exitCode: 0,
        repoRoot,
        steps,
        lines: steps.flatMap(renderStep),
      };
    }

    return runInit({
      ...opts,
      repo: repoRoot,
      sourceRoot,
      target,
      codegraph: true,
      configureCodegraphMcp: true,
      syncCodegraph: true,
      globalContext: { reportLanguageInstruction },
      brainRoot: brainChoice.root,
      brainMode,
    });
  } finally {
    rl.close();
  }
}

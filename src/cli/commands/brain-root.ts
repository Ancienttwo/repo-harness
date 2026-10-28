import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { globalConfigurationPath, mutateGlobalConfiguration } from "../../effects/configuration/global-configuration";
import type { RuntimeTransactionContext } from "../../effects/locking/runtime-transaction-lock";

export type BrainLocationKind = "icloud" | "google-drive" | "documents" | "custom";

export interface BrainRootChoice {
  kind: BrainLocationKind;
  label: string;
  root: string;
  available: boolean;
  detail: string;
}

export interface ResolveBrainRootOptions {
  env?: NodeJS.ProcessEnv;
  customPath?: string;
}

export interface RepoHarnessUserConfig {
  brainRoot?: string;
}

function homeDir(env?: NodeJS.ProcessEnv): string {
  return env?.HOME ?? process.env.HOME ?? os.homedir();
}

export function expandHomePath(value: string, env?: NodeJS.ProcessEnv): string {
  if (value === "~") return homeDir(env);
  if (value.startsWith("~/")) return path.join(homeDir(env), value.slice(2));
  return value;
}

export function repoHarnessConfigPath(env?: NodeJS.ProcessEnv): string {
  return globalConfigurationPath(env);
}

function readUserConfig(env?: NodeJS.ProcessEnv): RepoHarnessUserConfig {
  try {
    const raw = fs.readFileSync(repoHarnessConfigPath(env), "utf-8");
    const parsed = JSON.parse(raw) as RepoHarnessUserConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

export function configureBrainRoot(root: string, env: NodeJS.ProcessEnv = process.env, runtimeLock?: RuntimeTransactionContext): { path: string; root: string } {
  const resolved = path.resolve(expandHomePath(root, env));
  const result = mutateGlobalConfiguration(env, (current) => {
    fs.mkdirSync(resolved, { recursive: true });
    return { config: { ...current, brainRoot: resolved }, value: resolved };
  }, { runtimeLock });
  return { path: result.path, root: result.value };
}

function googleDriveRoot(home: string): string | null {
  const cloudStorage = path.join(home, "Library", "CloudStorage");
  if (!fs.existsSync(cloudStorage)) return null;
  const driveDir = fs
    .readdirSync(cloudStorage, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("GoogleDrive"))
    .map((entry) => path.join(cloudStorage, entry.name))
    .sort()[0];
  if (!driveDir) return null;
  const myDrive = path.join(driveDir, "My Drive");
  return fs.existsSync(myDrive) ? myDrive : driveDir;
}

export function discoverBrainRootChoices(opts: ResolveBrainRootOptions = {}): BrainRootChoice[] {
  const home = homeDir(opts.env);
  const iCloudBase = path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs");
  const documentsBase = path.join(home, "Documents");
  const googleBase = googleDriveRoot(home);
  const choices: BrainRootChoice[] = [
    {
      kind: "icloud",
      label: "System iCloud",
      root: path.join(iCloudBase, "brain"),
      available: fs.existsSync(iCloudBase),
      detail: path.join(iCloudBase, "brain"),
    },
  ];

  if (googleBase) {
    choices.push({
      kind: "google-drive",
      label: "Google Drive",
      root: path.join(googleBase, "brain"),
      available: true,
      detail: path.join(googleBase, "brain"),
    });
  }

  choices.push({
    kind: "documents",
    label: "~/Documents",
    root: path.join(documentsBase, "brain"),
    available: fs.existsSync(documentsBase),
    detail: path.join(documentsBase, "brain"),
  });

  if (opts.customPath) {
    const root = path.resolve(expandHomePath(opts.customPath, opts.env));
    choices.push({
      kind: "custom",
      label: "Custom",
      root,
      available: true,
      detail: root,
    });
  }

  return choices;
}

export function defaultBrainRootChoice(opts: ResolveBrainRootOptions = {}): BrainRootChoice {
  const choices = discoverBrainRootChoices(opts);
  return (
    choices.find((choice) => choice.kind === "icloud" && choice.available) ??
    choices.find((choice) => choice.kind === "documents") ??
    choices[0]
  );
}

export function configuredBrainRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.REPO_HARNESS_BRAIN_ROOT) return path.resolve(expandHomePath(env.REPO_HARNESS_BRAIN_ROOT, env));
  const configured = readUserConfig(env).brainRoot;
  if (configured) return path.resolve(expandHomePath(configured, env));
  return defaultBrainRootChoice({ env }).root;
}

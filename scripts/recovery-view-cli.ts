#!/usr/bin/env bun
// Materializes the handoff/resume recovery views (and optionally the
// Codex-global packet) from the last-published checkpoint plus live workflow
// context. This file is only the command-line adapter: every view comes from
// src/effects/evidence/recovery-materializer.ts, the same module Stop renders
// with. scripts/sync-helper-sources.ts projects this adapter to
// assets/templates/helpers/recovery-view-cli.ts.
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  extractResumePrompt,
  materializeRecoveryViews,
  renderGlobalHandoffSection,
  repoKeyFor,
  updateGlobalHandoffFile,
} from "../src/effects/evidence/recovery-materializer";

function resolveActivePlanMarker(repoRoot: string): string | null {
  try {
    const marker = readFileSync(join(repoRoot, ".ai/harness/active-plan"), "utf8").trim();
    if (marker && existsSync(join(repoRoot, marker))) return marker;
    return null;
  } catch {
    return null;
  }
}

function writeFileDurable(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
}

function resolveRepoRoot(cwdOption: string | undefined): string {
  if (process.env.REPO_HARNESS_TARGET_REPO_ROOT) return process.env.REPO_HARNESS_TARGET_REPO_ROOT;
  const cwd = cwdOption ?? process.cwd();
  try {
    const out = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    return out || cwd;
  } catch {
    return cwd;
  }
}

interface Options {
  reason: string;
  cwd?: string;
  printPrompt: boolean;
  withGlobalPacket: boolean;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { reason: "manual", printPrompt: false, withGlobalPacket: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reason") {
      options.reason = argv[i + 1] ?? "manual";
      i += 1;
    } else if (arg === "--cwd") {
      options.cwd = argv[i + 1];
      i += 1;
    } else if (arg === "--print-prompt") {
      options.printPrompt = true;
    } else if (arg === "--with-global-packet") {
      options.withGlobalPacket = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    }
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot(options.cwd);
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || "", ".codex");
  const views = materializeRecoveryViews(repoRoot, resolveActivePlanMarker(repoRoot), process.env, {
    reason: options.reason,
    codexHome,
  });

  writeFileDurable(join(repoRoot, views.context.paths.handoff), views.handoff);
  writeFileDurable(join(repoRoot, views.context.paths.resume), views.resume);

  let globalFile = "";
  if (options.withGlobalPacket) {
    const repoKey = repoKeyFor(repoRoot);
    const section = renderGlobalHandoffSection({
      repoPath: repoRoot,
      repoKey,
      reason: options.reason,
      repoHandoffRelative: views.context.paths.handoff,
      resumeFileRelative: views.context.paths.resume,
      handoffText: views.handoff,
      resumeText: views.resume,
      now: new Date(),
    });
    globalFile = updateGlobalHandoffFile(codexHome, repoKey, section);
  }

  if (options.printPrompt) {
    process.stdout.write(extractResumePrompt(views.resume));
    return;
  }

  if (options.withGlobalPacket && globalFile) {
    console.log(globalFile);
  }
  if (!options.quiet) {
    console.log(`Updated ${views.context.paths.resume}`);
  }
}

main();

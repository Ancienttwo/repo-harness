import { describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildRunPlan,
  runEvaluation,
  validateEvaluation,
} from "../scripts/run-bdd2-evals";

const ROOT = join(import.meta.dir, "..");

function tempRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  cpSync(join(ROOT, "evals/bdd2"), join(root, "evals/bdd2"), { recursive: true });
  return root;
}

function readManifest(root: string): any {
  return JSON.parse(readFileSync(join(root, "evals/bdd2/evaluation-manifest.json"), "utf-8"));
}

function writeManifest(root: string, manifest: unknown): void {
  writeFileSync(
    join(root, "evals/bdd2/evaluation-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8"
  );
}

describe("run-bdd2-evals validation and planning", () => {
  test("builds stable opaque coordinates", () => {
    const evaluation = validateEvaluation(ROOT);
    const options = {
      experiment: "S" as const,
      partition: "development" as const,
      taskIds: ["S-D-01"],
      repetitions: 2,
    };
    const first = buildRunPlan(evaluation, options);
    const second = buildRunPlan(evaluation, options);

    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(first.every((entry) => /^[a-f0-9]{16}$/.test(entry.packetId))).toBe(true);
    expect(new Set(first.map((entry) => entry.packetId)).size).toBe(4);
    expect(() =>
      buildRunPlan(evaluation, {
        ...options,
        conditions: ["baseline", "baseline"],
      })
    ).toThrow("must not contain duplicates");
  });

  test("fails closed when a frozen prompt drifts", () => {
    const root = tempRepo("bdd2-drift");
    try {
      writeFileSync(join(root, "evals/bdd2/prompts/shape-baseline.md"), "changed\n", "utf-8");
      expect(() => validateEvaluation(root)).toThrow("sha256 drift");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects truth fields placed in an agent-visible task set", () => {
    const root = tempRepo("bdd2-leak");
    try {
      const taskPath = join(root, "evals/bdd2/tasks/development.json");
      const tasks = JSON.parse(readFileSync(taskPath, "utf-8"));
      tasks.tasks[0].truth = "must not reach the agent";
      writeFileSync(taskPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf-8");

      const manifest = readManifest(root);
      const hash = spawnSync("shasum", ["-a", "256", taskPath], { encoding: "utf-8" }).stdout.split(/\s+/)[0];
      manifest.partitions.development.tasks_sha256 = hash;
      writeManifest(root, manifest);

      expect(() => validateEvaluation(root)).toThrow("keys must be exactly");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a frozen authority file that is a symlink", () => {
    const root = tempRepo("bdd2-symlink");
    const external = join(tmpdir(), `bdd2-external-${Date.now()}.md`);
    try {
      writeFileSync(external, "external prompt\n", "utf-8");
      const link = join(root, "evals/bdd2/prompts/escape.md");
      symlinkSync(external, link);
      const manifest = readManifest(root);
      manifest.experiments.S.conditions.baseline.prompt = "evals/bdd2/prompts/escape.md";
      manifest.experiments.S.conditions.baseline.sha256 = spawnSync(
        "shasum",
        ["-a", "256", external],
        { encoding: "utf-8" }
      ).stdout.split(/\s+/)[0];
      writeManifest(root, manifest);

      expect(() => validateEvaluation(root)).toThrow("must not be a symbolic link");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { force: true });
    }
  });

  test("foundation authority cannot execute a model command", () => {
    const evaluation = validateEvaluation(ROOT);
    expect(() =>
      runEvaluation(evaluation, {
        experiment: "S",
        partition: "development",
        taskIds: ["S-D-01"],
        conditions: ["baseline"],
        repetitions: 1,
        agent: "stub",
      })
    ).toThrow("foundation-only");
  });
});

describe("run-bdd2-evals sealed execution", () => {
  test("captures private coordinates separately from blind response packets", () => {
    const root = tempRepo("bdd2-run");
    try {
      const stub = join(root, "agent-stub.sh");
      writeFileSync(
        stub,
        "#!/usr/bin/env bash\nset -euo pipefail\nprompt_path=\"$1\"\nresponse_path=\"$2\"\nmodel=\"$3\"\ntemperature=\"$4\"\ntest \"$model\" = \"stub-model-v1\"\ntest \"$temperature\" = \"0\"\nprintf 'stub response from %s\\n' \"$(basename \"$prompt_path\")\" > \"$response_path\"\n",
        "utf-8"
      );
      spawnSync("chmod", ["+x", stub]);

      const manifest = readManifest(root);
      manifest.freeze = {
        id: "bdd2-test-sealed-v1",
        state: "sealed",
        sealed_at: "2026-07-12T00:00:00Z",
      };
      manifest.experiments.S.held_out_task_count = 2;
      manifest.experiments.A.held_out_task_count = 2;
      manifest.agents = {
        stub: {
          command: stub,
          args: ["{prompt_path}", "{response_path}", "{model}", "{sampling.temperature}"],
          model: "stub-model-v1",
          sampling: { temperature: 0 },
          response_source: "file",
        },
      };
      writeManifest(root, manifest);
      for (const args of [
        ["init"],
        ["config", "user.name", "BDD2 Test"],
        ["config", "user.email", "bdd2-test@example.com"],
        ["add", "."],
        ["commit", "-m", "sealed evaluation fixture"],
      ]) {
        const result = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
        expect(result.status).toBe(0);
      }

      const evaluation = validateEvaluation(root);
      const report = runEvaluation(evaluation, {
        experiment: "A",
        partition: "held_out",
        taskIds: ["A-H-01"],
        conditions: ["treatment"],
        repetitions: 1,
        agent: "stub",
        outputPath: ".ai/harness/runs/bdd2/test-run",
      });

      expect(report.packets).toHaveLength(1);
      const packetId = report.packets[0].packet_id;
      const blind = JSON.parse(
        readFileSync(join(root, ".ai/harness/runs/bdd2/test-run/blind", `${packetId}.json`), "utf-8")
      );
      const privateCoordinate = JSON.parse(
        readFileSync(join(root, ".ai/harness/runs/bdd2/test-run/private", `${packetId}.json`), "utf-8")
      );

      expect(blind).toEqual({
        schema: "repo-harness-bdd2-blind-packet.v1",
        packet_id: packetId,
        task_id: "A-H-01",
        experiment: "A",
        response: "stub response from agent-prompt.md\n",
      });
      expect(JSON.stringify(blind)).not.toContain("treatment");
      expect(Object.keys(blind)).not.toContain("model");
      expect(privateCoordinate.condition).toBe("treatment");
      expect(privateCoordinate.model).toBe("stub-model-v1");
      expect(privateCoordinate.sampling).toEqual({ temperature: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

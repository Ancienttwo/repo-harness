import { describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildIsolatedAgentEnv,
  buildRunPlan,
  projectHistoricalShapeEvidence,
  runEvaluation,
  sha256File,
  summarizeShape,
  validateEvaluation,
  validateShapeScores,
} from "../scripts/run-bdd2-evals";

const ROOT = join(import.meta.dir, "..");

function tempRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  cpSync(join(ROOT, "evals/bdd2"), join(root, "evals/bdd2"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts/run-bdd2-evals.ts"), join(root, "scripts/run-bdd2-evals.ts"));
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
  test("isolated agent environment drops caller secrets and config toggles", () => {
    const env = buildIsolatedAgentEnv("/tmp/bdd2-home", {
      PATH: "/usr/bin:/bin",
      OPENAI_API_KEY: "must-not-leak",
      HTTPS_PROXY: "must-not-leak",
      CODEX_CONFIG: "must-not-leak",
    });
    expect(Object.keys(env).sort()).toEqual([
      "CODEX_HOME",
      "HOME",
      "LANG",
      "LC_ALL",
      "NO_COLOR",
      "PATH",
      "TERM",
      "TMPDIR",
    ]);
    expect(env.HOME).toBe("/tmp/bdd2-home");
    expect(env.CODEX_HOME).toBe("/tmp/bdd2-home");
    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
    expect(env).not.toHaveProperty("HTTPS_PROXY");
    expect(env).not.toHaveProperty("CODEX_CONFIG");
    expect(() => buildIsolatedAgentEnv("/tmp/bdd2-home", {})).toThrow("requires an explicit PATH");
  });

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
    expect(first.every((entry) => /^[a-f0-9]{16}$/.test(entry.coordinateId))).toBe(true);
    expect(new Set(first.map((entry) => entry.coordinateId)).size).toBe(4);
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

  test("fails closed when the frozen runner drifts", () => {
    const root = tempRepo("bdd2-runner-drift");
    try {
      writeFileSync(join(root, "scripts/run-bdd2-evals.ts"), "changed runner\n", "utf-8");
      expect(() => validateEvaluation(root)).toThrow("runner sha256 drift");
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

  test("foundation experiments cannot execute before a new revision is sealed", () => {
    const evaluation = validateEvaluation(ROOT);
    for (const [experiment, taskId] of [["S", "S-D-01"], ["A", "A-D-01"]] as const) {
      expect(() =>
        runEvaluation(evaluation, {
          experiment,
          partition: "development",
          taskIds: [taskId],
          conditions: ["baseline"],
          repetitions: 1,
          agent: "codex-gpt-5.6-sol-xhigh",
        })
      ).toThrow(`Experiment ${experiment} is foundation-only`);
    }
  });
});

describe("run-bdd2-evals sealed execution", () => {
  test("captures private coordinates separately from blind response packets", () => {
    const root = tempRepo("bdd2-run");
    try {
      const stub = join(root, "agent-stub.sh");
      writeFileSync(
        stub,
        "#!/usr/bin/env bash\nset -euo pipefail\nif [[ \"${1:-}\" == \"--version\" ]]; then test -z \"${BDD2_CALLER_SECRET:-}\"; test \"${HOME:-}\" = \"${CODEX_HOME:-}\"; printf 'bdd2-stub 1.0\\n'; exit 0; fi\nmodel=\"$1\"\ntemperature=\"$2\"\ntest \"$model\" = \"stub-model-v1\"\ntest \"$temperature\" = \"0\"\nprompt=\"$(cat)\"\n[[ \"$prompt\" == *\"Task ID: S-H-01\"* ]]\nprintf 'stub response cwd=%s\\n' \"$PWD\"\n",
        "utf-8"
      );
      spawnSync("chmod", ["+x", stub]);

      const manifest = readManifest(root);
      manifest.experiments.S.freeze = {
        id: "bdd2-test-s-sealed",
        state: "sealed",
        sealed_at: "2026-07-12T00:00:00Z",
      };
      manifest.agents = {
        stub: {
          command: stub,
          args: ["{model}", "{sampling.temperature}"],
          version_args: ["--version"],
          expected_version: "bdd2-stub 1.0",
          model: "stub-model-v1",
          sampling: { temperature: 0 },
          input_source: "stdin",
          response_source: "stdout",
          workspace_mode: "isolated",
          credential_mode: "none",
        },
      };
      writeManifest(root, manifest);
      writeFileSync(join(root, ".gitignore"), ".ai/\n.ignored/\n", "utf-8");
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
      const privateCoordinateId = buildRunPlan(evaluation, {
        experiment: "S",
        partition: "held_out",
        taskIds: ["S-H-01"],
        conditions: ["treatment"],
        repetitions: 1,
      })[0].coordinateId;
      const previousCallerSecret = process.env.BDD2_CALLER_SECRET;
      process.env.BDD2_CALLER_SECRET = "must-not-reach-version-probe";
      let report;
      try {
        report = runEvaluation(evaluation, {
          experiment: "S",
          partition: "held_out",
          taskIds: ["S-H-01"],
          conditions: ["treatment"],
          repetitions: 1,
          agent: "stub",
          outputPath: ".ai/harness/runs/bdd2/test-run",
        });
      } finally {
        if (previousCallerSecret === undefined) delete process.env.BDD2_CALLER_SECRET;
        else process.env.BDD2_CALLER_SECRET = previousCallerSecret;
      }

      expect(report.packets).toHaveLength(1);
      const packetId = report.packets[0].packet_id;
      expect(packetId).toMatch(/^[a-f0-9]{32}$/);
      expect(packetId).not.toBe(privateCoordinateId);
      const blind = JSON.parse(
        readFileSync(join(root, ".ai/harness/runs/bdd2/test-run/blind", `${packetId}.json`), "utf-8")
      );
      const privateCoordinate = JSON.parse(
        readFileSync(join(root, ".ai/harness/runs/bdd2/test-run/private", `${packetId}.json`), "utf-8")
      );

      expect(blind).toEqual({
        schema: "repo-harness-bdd2-blind-packet.v2",
        packet_id: packetId,
        task_id: "S-H-01",
        experiment: "S",
        task_input: expect.stringContaining("CSV import"),
        response: expect.stringContaining("stub response cwd=/"),
      });
      expect(blind.response).not.toContain(root);
      expect(JSON.stringify(blind)).not.toContain("treatment");
      expect(Object.keys(blind)).not.toContain("model");
      expect(privateCoordinate.schema).toBe("repo-harness-bdd2-private-coordinate.v2");
      expect(privateCoordinate.condition).toBe("treatment");
      expect(privateCoordinate.coordinate_id).toBe(privateCoordinateId);
      expect(privateCoordinate.model).toBe("stub-model-v1");
      expect(privateCoordinate.sampling).toEqual({ temperature: 0 });

      mkdirSync(join(root, ".ignored"), { recursive: true });
      writeFileSync(
        join(root, ".ignored/evaluation-manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf-8"
      );
      const ignoredEvaluation = validateEvaluation(root, ".ignored/evaluation-manifest.json");
      expect(() =>
        runEvaluation(ignoredEvaluation, {
          experiment: "S",
          partition: "held_out",
          taskIds: ["S-H-01"],
          conditions: ["treatment"],
          repetitions: 1,
          agent: "stub",
          outputPath: ".ai/harness/runs/bdd2/ignored-manifest-run",
        })
      ).toThrow("must be tracked at HEAD");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("validates complete blind scores and reproduces the pre-registered Shape gate", () => {
    const root = tempRepo("bdd2-shape-summary");
    try {
      const stub = join(root, "shape-agent-stub.sh");
      writeFileSync(
        stub,
        "#!/usr/bin/env bash\nset -euo pipefail\nif [[ \"${1:-}\" == \"--version\" ]]; then printf 'bdd2-stub 1.0\\n'; exit 0; fi\ncat >/dev/null\nprintf 'shape proposal\\n'\n",
        "utf-8"
      );
      spawnSync("chmod", ["+x", stub]);

      const taskPath = join(root, "evals/bdd2/tasks/held-out.json");
      const truthPath = join(root, "evals/bdd2/truth/held-out.json");
      const tasks = JSON.parse(readFileSync(taskPath, "utf-8"));
      tasks.tasks = tasks.tasks.filter((task: any) => task.id === "S-H-01" || task.experiment === "A");
      writeFileSync(taskPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf-8");
      const truth = JSON.parse(readFileSync(truthPath, "utf-8"));
      truth.shape_tasks = { "S-H-01": truth.shape_tasks["S-H-01"] };
      writeFileSync(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf-8");

      const manifest = readManifest(root);
      manifest.experiments.S.freeze = {
        id: "bdd2-test-s-sealed",
        state: "sealed",
        sealed_at: "2026-07-12T00:00:00Z",
      };
      manifest.experiments.S.held_out_task_count = 1;
      manifest.partitions.held_out.tasks_sha256 = sha256File(taskPath);
      manifest.partitions.held_out.truth_sha256 = sha256File(truthPath);
      manifest.agents = {
        stub: {
          command: stub,
          args: ["{model}", "{sampling.temperature}"],
          version_args: ["--version"],
          expected_version: "bdd2-stub 1.0",
          model: "stub-model-v1",
          sampling: { temperature: 0 },
          input_source: "stdin",
          response_source: "stdout",
          workspace_mode: "isolated",
          credential_mode: "none",
        },
      };
      writeManifest(root, manifest);
      writeFileSync(join(root, ".gitignore"), ".ai/\n", "utf-8");
      for (const args of [
        ["init"],
        ["config", "user.name", "BDD2 Test"],
        ["config", "user.email", "bdd2-test@example.com"],
        ["add", "."],
        ["commit", "-m", "shape evaluation fixture"],
      ]) {
        expect(spawnSync("git", args, { cwd: root, encoding: "utf-8" }).status).toBe(0);
      }

      const evaluation = validateEvaluation(root);
      const runRelativePath = ".ai/harness/runs/bdd2/shape-summary";
      const report = runEvaluation(evaluation, {
        experiment: "S",
        partition: "held_out",
        repetitions: 3,
        agent: "stub",
        outputPath: runRelativePath,
      });
      expect(report.packets).toHaveLength(6);
      const scoreDir = join(root, runRelativePath, "scores");
      mkdirSync(scoreDir, { recursive: true });
      const coordinates = new Map<string, any>();
      for (const packet of report.packets) {
        const coordinate = JSON.parse(
          readFileSync(join(root, runRelativePath, "private", `${packet.packet_id}.json`), "utf-8")
        );
        coordinates.set(packet.packet_id, coordinate);
        writeFileSync(
          join(scoreDir, `${packet.packet_id}.json`),
          `${JSON.stringify({
            schema: "repo-harness-bdd2-score.v2",
            packet_id: packet.packet_id,
            task_id: packet.task_id,
            experiment: "S",
            reviewer_id: "blind-panel-final",
            locked_at: "2026-07-12T00:00:00Z",
            score: {
              kind: "shape",
              unsupported_expansion: coordinate.condition === "baseline" ? 2 : 1,
              required_behavior_omission: 0,
              protected_concern_omissions: [],
              authority_fit: "inline",
              escalation_correct: true,
              unnecessary_tracked_artifact_count: 0,
              correction_minutes: 10,
              notes: "locked synthetic fixture score",
            },
          }, null, 2)}\n`,
          "utf-8"
        );
      }

      const projected = projectHistoricalShapeEvidence(root, runRelativePath, "shape-evidence.json") as any;
      expect(projected.schema).toBe("repo-harness-bdd2-shape-evidence.v1");
      expect(projected.projector_sha256).toBe(sha256File(join(root, "scripts/run-bdd2-evals.ts")));
      expect(projected.rows).toHaveLength(6);
      expect(JSON.parse(readFileSync(join(root, "shape-evidence.json"), "utf-8"))).toEqual(projected);

      expect(validateShapeScores(evaluation, runRelativePath).scores.size).toBe(6);
      const summary = summarizeShape(evaluation, runRelativePath, "shape-report.md");
      expect(summary.metrics.unsupported_expansion.relative_reduction).toBe(0.5);
      expect(summary.metrics.unsupported_expansion.wins).toBe(3);
      expect(summary.decision).toBe("Pass");
      expect(readFileSync(join(root, "shape-report.md"), "utf-8")).toContain("**Decision**: Pass");

      const rewriteScores = (mutate: (score: any, coordinate: any) => void) => {
        for (const packet of report.packets) {
          const path = join(scoreDir, `${packet.packet_id}.json`);
          const locked = JSON.parse(readFileSync(path, "utf-8"));
          mutate(locked.score, coordinates.get(packet.packet_id));
          writeFileSync(path, `${JSON.stringify(locked, null, 2)}\n`, "utf-8");
        }
      };

      rewriteScores((score, coordinate) => {
        score.unsupported_expansion = coordinate.condition === "baseline" ? 0 : 1;
      });
      const zeroBaseline = summarizeShape(evaluation, runRelativePath);
      expect(zeroBaseline.metrics.unsupported_expansion.relative_reduction).toBeNull();
      expect(zeroBaseline.decision).toBe("Kill");

      rewriteScores((score, coordinate) => {
        score.unsupported_expansion = coordinate.condition === "baseline" ? 2 : 1;
        const newSevereOmission = coordinate.condition === "treatment" && coordinate.repetition <= 2;
        score.required_behavior_omission = newSevereOmission ? 1 : 0;
        score.protected_concern_omissions = newSevereOmission
          ? [{ concern: "recovery", severity: "P1", summary: "missing recovery" }]
          : [];
      });
      const regression = summarizeShape(evaluation, runRelativePath);
      expect(regression.metrics.required_behavior_omission.stable_new_task_ids).toEqual(["S-H-01"]);
      expect(regression.metrics.protected_concern.new_treatment_p0_p1_pairs).toBe(2);
      expect(regression.decision).toBe("Kill");

      rmSync(join(scoreDir, `${report.packets[0].packet_id}.json`));
      expect(() => validateShapeScores(evaluation, runRelativePath)).toThrow("requires exactly 6 score files");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

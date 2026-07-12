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
import { createHash } from "crypto";
import {
  buildIsolatedAgentEnv,
  buildRunPlan,
  evaluateAuditGates,
  projectAuditEvidence,
  projectHistoricalAuditEvidence,
  projectHistoricalShapeEvidence,
  runEvaluation,
  sha256File,
  summarizeAudit,
  summarizeHistoricalAudit,
  summarizeShape,
  validateAuditScores,
  validateHistoricalAuditScores,
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

  test("foundation Shape cannot execute before a new revision is sealed", () => {
    const evaluation = validateEvaluation(ROOT);
    expect(() =>
      runEvaluation(evaluation, {
        experiment: "S",
        partition: "development",
        taskIds: ["S-D-01"],
        conditions: ["baseline"],
        repetitions: 1,
        agent: "codex-gpt-5.6-sol-xhigh",
      })
    ).toThrow("Experiment S is foundation-only");
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

      expect(() => projectHistoricalShapeEvidence(root, runRelativePath, "shape-evidence.json"))
        .toThrow("Historical run does not match a sealed Shape authority");
      const runJsonPath = join(root, runRelativePath, "run.json");
      const currentRunText = readFileSync(runJsonPath, "utf-8");
      const historicalManifest = structuredClone(manifest);
      historicalManifest.schema = "repo-harness-bdd2-evaluation.v2";
      historicalManifest.adjudication = {
        rubric: manifest.adjudication.rubric,
        rubric_sha256: manifest.adjudication.rubric_sha256,
        score_schema: manifest.adjudication.experiments.S.score_schema,
        score_schema_sha256: manifest.adjudication.experiments.S.score_schema_sha256,
        shape_metrics: manifest.adjudication.experiments.S.metrics,
        shape_metrics_sha256: manifest.adjudication.experiments.S.metrics_sha256,
      };
      const historicalManifestText = `${JSON.stringify(historicalManifest, null, 2)}\n`;
      const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: root,
        encoding: "utf-8",
        input: historicalManifestText,
      }).stdout.trim();
      const historicalIndex = join(root, "historical-shape.index");
      const historicalEnv = { ...process.env, GIT_INDEX_FILE: historicalIndex };
      expect(spawnSync("git", ["read-tree", "HEAD"], { cwd: root, env: historicalEnv }).status).toBe(0);
      expect(spawnSync("git", ["update-index", "--add", "--cacheinfo", `100644,${blob},evals/bdd2/evaluation-manifest.json`], { cwd: root, env: historicalEnv }).status).toBe(0);
      const tree = spawnSync("git", ["write-tree"], { cwd: root, env: historicalEnv, encoding: "utf-8" }).stdout.trim();
      const historicalCommit = spawnSync("git", ["commit-tree", tree, "-p", "HEAD"], {
        cwd: root,
        env: historicalEnv,
        encoding: "utf-8",
        input: "historical v2 Shape authority\n",
      }).stdout.trim();
      rmSync(historicalIndex, { force: true });
      const historicalRun = JSON.parse(currentRunText);
      historicalRun.source_commit = historicalCommit;
      historicalRun.manifest_sha256 = createHash("sha256").update(historicalManifestText).digest("hex");
      writeFileSync(runJsonPath, `${JSON.stringify(historicalRun, null, 2)}\n`, "utf-8");

      const projected = projectHistoricalShapeEvidence(root, runRelativePath, "shape-evidence.json") as any;
      expect(projected.schema).toBe("repo-harness-bdd2-shape-evidence.v1");
      expect(projected.projector_sha256).toBe(sha256File(join(root, "scripts/run-bdd2-evals.ts")));
      expect(projected.rows).toHaveLength(6);
      expect(JSON.parse(readFileSync(join(root, "shape-evidence.json"), "utf-8"))).toEqual(projected);

      const firstPacket = report.packets[0];
      const secondPacket = report.packets[1];
      const firstPrivatePath = join(root, runRelativePath, "private", `${firstPacket.packet_id}.json`);
      const firstPrivate = JSON.parse(readFileSync(firstPrivatePath, "utf-8"));
      const secondPrivate = JSON.parse(
        readFileSync(join(root, runRelativePath, "private", `${secondPacket.packet_id}.json`), "utf-8")
      );
      writeFileSync(
        firstPrivatePath,
        `${JSON.stringify({
          ...firstPrivate,
          coordinate_id: secondPrivate.coordinate_id,
          condition: secondPrivate.condition,
          repetition: secondPrivate.repetition,
          prompt_sha256: secondPrivate.prompt_sha256,
        }, null, 2)}\n`,
        "utf-8"
      );
      expect(() => projectHistoricalShapeEvidence(root, runRelativePath, "shape-evidence.json"))
        .toThrow("Historical coordinate is missing, duplicated, or unexpected");

      writeFileSync(firstPrivatePath, `${JSON.stringify(firstPrivate, null, 2)}\n`, "utf-8");
      writeFileSync(
        firstPrivatePath,
        `${JSON.stringify({ ...firstPrivate, prompt_sha256: "0".repeat(64) }, null, 2)}\n`,
        "utf-8"
      );
      expect(() => projectHistoricalShapeEvidence(root, runRelativePath, "shape-evidence.json"))
        .toThrow("Historical coordinate prompt hash drift");
      writeFileSync(firstPrivatePath, `${JSON.stringify(firstPrivate, null, 2)}\n`, "utf-8");
      writeFileSync(runJsonPath, currentRunText, "utf-8");

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

describe("run-bdd2-evals Audit adjudication", () => {
  test("validates exact coordinates, projects evidence, and applies every Pass gate", () => {
    const root = tempRepo("bdd2-audit-score");
    try {
      const taskPath = join(root, "evals/bdd2/tasks/held-out.json");
      const truthPath = join(root, "evals/bdd2/truth/held-out.json");
      const tasks = JSON.parse(readFileSync(taskPath, "utf-8"));
      tasks.tasks = tasks.tasks.filter((task: any) => task.experiment === "S" || ["A-H-02", "A-H-09"].includes(task.id));
      writeFileSync(taskPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf-8");
      const truth = JSON.parse(readFileSync(truthPath, "utf-8"));
      truth.audit_tasks = { "A-H-02": truth.audit_tasks["A-H-02"], "A-H-09": truth.audit_tasks["A-H-09"] };
      writeFileSync(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf-8");
      const manifest = readManifest(root);
      manifest.experiments.A.freeze = {
        id: "bdd2-test-a-sealed",
        state: "sealed",
        sealed_at: "2026-07-12T00:00:00Z",
      };
      manifest.experiments.A.held_out_task_count = 2;
      manifest.partitions.held_out.tasks_sha256 = sha256File(taskPath);
      manifest.partitions.held_out.truth_sha256 = sha256File(truthPath);
      manifest.agents = {
        stub: {
          command: "/bin/echo",
          args: ["{model}", "{sampling.temperature}"],
          version_args: ["--version"],
          expected_version: "unused",
          model: "stub-model-v1",
          sampling: { temperature: 0 },
          input_source: "stdin",
          response_source: "stdout",
          workspace_mode: "isolated",
          credential_mode: "none",
        },
      };
      writeManifest(root, manifest);
      writeFileSync(join(root, ".gitignore"), ".ai/\naudit-evidence.json\n", "utf-8");
      for (const args of [
        ["init"],
        ["config", "user.name", "BDD2 Test"],
        ["config", "user.email", "bdd2-test@example.com"],
        ["add", "."],
        ["commit", "-m", "sealed Audit authority fixture"],
      ]) {
        expect(spawnSync("git", args, { cwd: root, encoding: "utf-8" }).status).toBe(0);
      }
      const sourceCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf-8" }).stdout.trim();
      const evaluation = validateEvaluation(root);
      const runRelativePath = ".ai/harness/runs/bdd2/audit-summary";
      const runPath = join(root, runRelativePath);
      for (const subdir of ["blind", "private", "scores"]) mkdirSync(join(runPath, subdir), { recursive: true });
      const coordinates = buildRunPlan(evaluation, { experiment: "A", partition: "held_out" });
      const packets: Array<{ packet_id: string; task_id: string; status: "success" }> = [];
      for (const [index, coordinate] of coordinates.entries()) {
        const packetId = (index + 1).toString(16).padStart(32, "0");
        packets.push({ packet_id: packetId, task_id: coordinate.taskId, status: "success" });
        const task = evaluation.tasks.held_out.find((entry) => entry.id === coordinate.taskId)!;
        writeFileSync(join(runPath, "blind", `${packetId}.json`), `${JSON.stringify({
          schema: "repo-harness-bdd2-blind-packet.v2",
          packet_id: packetId,
          task_id: coordinate.taskId,
          experiment: "A",
          task_input: task.agent_input,
          response: "synthetic blind audit response",
        }, null, 2)}\n`, "utf-8");
        writeFileSync(join(runPath, "private", `${packetId}.json`), `${JSON.stringify({
          schema: "repo-harness-bdd2-private-coordinate.v2",
          packet_id: packetId,
          coordinate_id: coordinate.coordinateId,
          task_id: coordinate.taskId,
          condition: coordinate.condition,
          repetition: coordinate.repetition,
          prompt_sha256: evaluation.manifest.experiments.A.conditions[coordinate.condition].sha256,
          agent: "stub",
          model: "stub-model-v1",
          sampling: { temperature: 0 },
          exit_code: 0,
        }, null, 2)}\n`, "utf-8");
        const isSeeded = coordinate.taskId === "A-H-09";
        const isTreatment = coordinate.condition === "treatment";
        const findings = isTreatment && isSeeded
          ? [
              { ref: "F1", reported_severity: "P0", matched_truth_issue_id: "A-H-09-I1", match_notes: "direct match" },
            ]
          : !isTreatment && !isSeeded
            ? [{ ref: "F1", reported_severity: "P3", matched_truth_issue_id: null, match_notes: "baseline false positive" }]
            : [];
        writeFileSync(join(runPath, "scores", `${packetId}.json`), `${JSON.stringify({
          schema: "repo-harness-bdd2-audit-score.v1",
          packet_id: packetId,
          task_id: coordinate.taskId,
          experiment: "A",
          reviewer_id: "blind-agent-panel-final",
          locked_at: "2026-07-12T12:00:00Z",
          score: {
            kind: "audit",
            verdict: findings.length > 0 ? "findings" : isTreatment || !isSeeded ? "pass" : "inconclusive",
            findings,
            correction_minutes: isTreatment ? 1 : 5,
            notes: "locked synthetic Audit score",
          },
        }, null, 2)}\n`, "utf-8");
      }
      const runJsonPath = join(runPath, "run.json");
      const runJson = {
        schema: "repo-harness-bdd2-run.v2",
        freeze_id: evaluation.manifest.experiments.A.freeze.id,
        source_commit: sourceCommit,
        manifest_sha256: sha256File(join(root, "evals/bdd2/evaluation-manifest.json")),
        agent: "stub",
        model: "stub-model-v1",
        sampling: { temperature: 0 },
        experiment: "A",
        partition: "held_out",
        output_path: runRelativePath,
        packets,
      };
      writeFileSync(runJsonPath, `${JSON.stringify(runJson, null, 2)}\n`, "utf-8");

      expect(validateAuditScores(evaluation, runRelativePath).scores.size).toBe(8);
      const firstBlindPath = join(runPath, "blind", `${packets[0].packet_id}.json`);
      const firstBlindText = readFileSync(firstBlindPath, "utf-8");
      const externalBlind = join(tmpdir(), `bdd2-audit-blind-${Date.now()}.json`);
      writeFileSync(externalBlind, firstBlindText, "utf-8");
      rmSync(firstBlindPath);
      symlinkSync(externalBlind, firstBlindPath);
      expect(() => validateAuditScores(evaluation, runRelativePath))
        .toThrow("must be a regular non-symlink file");
      rmSync(firstBlindPath);
      writeFileSync(firstBlindPath, firstBlindText, "utf-8");
      rmSync(externalBlind, { force: true });
      const externalRunRoot = mkdtempSync(join(tmpdir(), "bdd2-audit-external-"));
      cpSync(runPath, join(externalRunRoot, "run"), { recursive: true });
      symlinkSync(externalRunRoot, join(root, "linked-run-parent"));
      expect(() => validateAuditScores(evaluation, "linked-run-parent/run"))
        .toThrow("resolves outside repository root");
      rmSync(join(root, "linked-run-parent"));
      rmSync(externalRunRoot, { recursive: true, force: true });
      writeFileSync(runJsonPath, `${JSON.stringify({ ...runJson, source_commit: "a".repeat(40) }, null, 2)}\n`, "utf-8");
      expect(() => validateAuditScores(evaluation, runRelativePath)).toThrow("Cannot read evals/bdd2/evaluation-manifest.json at source commit");
      writeFileSync(runJsonPath, `${JSON.stringify(runJson, null, 2)}\n`, "utf-8");
      const extraPrivatePath = join(runPath, "private", `${"f".repeat(32)}.json`);
      writeFileSync(extraPrivatePath, "{}\n", "utf-8");
      expect(() => validateAuditScores(evaluation, runRelativePath)).toThrow("private packet files must match run packet ids exactly");
      rmSync(extraPrivatePath);
      const projection = projectAuditEvidence(evaluation, runRelativePath, "audit-evidence.json") as any;
      expect(projection.packet_count).toBe(8);
      expect(projection.evidence_grade).toBe("condition-blind-agent-panel-proxy");
      const externalEvidence = join(tmpdir(), `bdd2-audit-evidence-${Date.now()}.json`);
      writeFileSync(externalEvidence, "external\n", "utf-8");
      symlinkSync(externalEvidence, join(root, "audit-evidence-link.json"));
      expect(() => projectAuditEvidence(evaluation, runRelativePath, "audit-evidence-link.json"))
        .toThrow("must not be a symbolic link");
      rmSync(join(root, "audit-evidence-link.json"));
      rmSync(externalEvidence, { force: true });
      const summary = summarizeAudit(evaluation, runRelativePath);
      expect(summary.decision).toBe("Pass");
      expect(Object.values(summary.gates).every(Boolean)).toBe(true);
      expect(summary.metrics.treatment.precision).toBe(1);
      expect(summary.metrics.treatment.correct_no_findings_rate).toBe(1);
      const gateCases: Array<[keyof typeof summary.gates, Partial<typeof summary.metrics.treatment>]> = [
        ["precision", { precision: 0.69 }],
        ["seeded_recall", { seeded_recall: 0.79 }],
        ["severe_seeded_recall", { severe_seeded_recall: 0.99 }],
        ["clean_false_positive_rate", { clean_false_positive_rate: 0.21 }],
        ["correct_no_findings_rate", { correct_no_findings_rate: 0.79 }],
        ["severity_agreement_rate", { severity_agreement_rate: 0.84 }],
        ["no_severe_underestimation", { severe_underestimations: 1 }],
      ];
      for (const [gate, mutation] of gateCases) {
        const gates = evaluateAuditGates({ ...summary.metrics.treatment, ...mutation });
        expect(gates[gate]).toBe(false);
        expect(Object.values(gates).every(Boolean)).toBe(false);
      }
      const summaryPath = join(runPath, "audit-summary.json");
      const externalSummary = join(tmpdir(), `bdd2-audit-summary-${Date.now()}.json`);
      rmSync(summaryPath);
      writeFileSync(externalSummary, "external\n", "utf-8");
      symlinkSync(externalSummary, summaryPath);
      expect(() => summarizeAudit(evaluation, runRelativePath))
        .toThrow("Output path must not be a symbolic link");
      rmSync(summaryPath);
      rmSync(externalSummary, { force: true });
      expect(validateHistoricalAuditScores(root, runRelativePath).scores.size).toBe(8);
      const historicalProjection = projectHistoricalAuditEvidence(root, runRelativePath, "historical-audit-evidence.json") as any;
      expect(historicalProjection.schema).toBe("repo-harness-bdd2-audit-evidence.v2");
      expect(historicalProjection.rows).toHaveLength(8);
      expect(summarizeHistoricalAudit(root, runRelativePath).decision).toBe("Pass");

      const seededTreatment = coordinates.findIndex((coordinate) => coordinate.taskId === "A-H-09" && coordinate.condition === "treatment");
      const duplicatePath = join(runPath, "scores", `${(seededTreatment + 1).toString(16).padStart(32, "0")}.json`);
      const duplicate = JSON.parse(readFileSync(duplicatePath, "utf-8"));
      const validScoreText = readFileSync(duplicatePath, "utf-8");
      duplicate.locked_at = "2026-07-12";
      writeFileSync(duplicatePath, `${JSON.stringify(duplicate, null, 2)}\n`, "utf-8");
      expect(() => validateAuditScores(evaluation, runRelativePath)).toThrow("locked_at must be an ISO date-time");
      writeFileSync(duplicatePath, validScoreText, "utf-8");
      const underestimated = JSON.parse(validScoreText);
      underestimated.score.findings[0].reported_severity = "P2";
      writeFileSync(duplicatePath, `${JSON.stringify(underestimated, null, 2)}\n`, "utf-8");
      const killed = summarizeAudit(evaluation, runRelativePath);
      expect(killed.decision).toBe("Kill");
      expect(killed.gates.no_severe_underestimation).toBe(false);
      writeFileSync(duplicatePath, validScoreText, "utf-8");
      Object.assign(duplicate, JSON.parse(validScoreText));
      duplicate.score.findings.push({ ref: "F2", reported_severity: "P0", matched_truth_issue_id: "A-H-09-I1", match_notes: "duplicate" });
      writeFileSync(duplicatePath, `${JSON.stringify(duplicate, null, 2)}\n`, "utf-8");
      expect(() => validateAuditScores(evaluation, runRelativePath)).toThrow("matches one truth issue more than once");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

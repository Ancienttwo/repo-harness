import { describe, test, expect } from "bun:test";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadHookConfig,
  isValidEvent,
  getHookDefinition,
  runHooks,
  executeHookScript,
  rethrowNonEpipeStdinError,
  VALID_EVENTS,
} from "../scripts/run-skill-hook";

const REPO_ROOT = join(import.meta.dir, "..");

describe("skill-hooks.json Structure", () => {
  const config = JSON.parse(
    readFileSync(join(REPO_ROOT, "assets", "skill-hooks.json"), "utf-8")
  );

  test("has events object", () => {
    expect(config.events).toBeDefined();
    expect(typeof config.events).toBe("object");
    expect(config.status).toBe("deprecated-zero-overhead");
  });

  test("all expected events are defined", () => {
    for (const event of VALID_EVENTS) {
      expect(config.events[event]).toBeDefined();
    }
  });

  test("all pre-* hooks are sync type", () => {
    for (const [name, def] of Object.entries(config.events) as [string, any][]) {
      if (name.startsWith("pre-")) {
        expect(def.type).toBe("sync");
      }
    }
  });

  test("all post-* hooks are advisory type", () => {
    for (const [name, def] of Object.entries(config.events) as [string, any][]) {
      if (name.startsWith("post-")) {
        expect(def.type).toBe("advisory");
      }
    }
  });

  test("on-version-change is advisory type", () => {
    expect(config.events["on-version-change"].type).toBe("advisory");
  });

  test("each event has description and scripts array", () => {
    for (const [, def] of Object.entries(config.events) as [string, any][]) {
      expect(typeof def.description).toBe("string");
      expect(Array.isArray(def.scripts)).toBe(true);
    }
  });

  test("default scripts arrays are empty (zero overhead)", () => {
    for (const [, def] of Object.entries(config.events) as [string, any][]) {
      expect(def.scripts.length).toBe(0);
    }
  });
});

describe("loadHookConfig()", () => {
  test("loads config from default path", () => {
    const config = loadHookConfig();
    expect(config.events).toBeDefined();
    expect(Object.keys(config.events).length).toBeGreaterThan(0);
  });

  test("throws for missing file", () => {
    expect(() => loadHookConfig("/nonexistent/path.json")).toThrow();
  });
});

describe("isValidEvent()", () => {
  test("returns true for valid events", () => {
    expect(isValidEvent("pre-init")).toBe(true);
    expect(isValidEvent("post-init")).toBe(true);
    expect(isValidEvent("pre-assemble")).toBe(true);
    expect(isValidEvent("post-assemble")).toBe(true);
    expect(isValidEvent("pre-migrate")).toBe(true);
    expect(isValidEvent("post-migrate")).toBe(true);
    expect(isValidEvent("on-version-change")).toBe(true);
  });

  test("returns false for invalid events", () => {
    expect(isValidEvent("invalid")).toBe(false);
    expect(isValidEvent("")).toBe(false);
    expect(isValidEvent("pre-deploy")).toBe(false);
  });
});

describe("getHookDefinition()", () => {
  const config = loadHookConfig();

  test("returns definition for valid event", () => {
    const def = getHookDefinition(config, "pre-init");
    expect(def).not.toBeNull();
    expect(def!.type).toBe("sync");
  });

  test("returns null for invalid event", () => {
    const def = getHookDefinition(config, "not-a-real-event");
    expect(def).toBeNull();
  });
});

describe("runHooks() with empty scripts", () => {
  test("short-circuits with success for empty scripts array", async () => {
    const result = await runHooks("pre-init");
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  }, 30_000);
});

describe("Hook Execution (temp directory)", () => {
  const tmpBase = join(tmpdir(), `skill-hooks-test-${Date.now()}`);
  const tmpHooksConfig = join(tmpBase, "skill-hooks.json");
  const tmpSuccessScript = join(tmpBase, "success.sh");
  const tmpFailScript = join(tmpBase, "fail.sh");
  const tmpContextScript = join(tmpBase, "context.sh");
  const tmpClosedStdinScript = join(tmpBase, "closed-stdin.sh");

  // Setup temp files
  mkdirSync(tmpBase, { recursive: true });

  writeFileSync(tmpSuccessScript, '#!/bin/bash\necho "hook ran successfully"');
  writeFileSync(tmpFailScript, "#!/bin/bash\nexit 1");
  writeFileSync(
    tmpContextScript,
    '#!/bin/bash\nread -r ctx\necho "event=$SKILL_HOOK_EVENT"\necho "context=$ctx"'
  );
  writeFileSync(
    tmpClosedStdinScript,
    '#!/bin/bash\nexec 0<&-\necho "declined the stdin offer"'
  );

  // Make scripts executable
  Bun.spawnSync([
    "chmod",
    "+x",
    tmpSuccessScript,
    tmpFailScript,
    tmpContextScript,
    tmpClosedStdinScript,
  ]);

  test("executeHookScript runs a successful script", async () => {
    const result = await executeHookScript(tmpSuccessScript, "pre-init");
    expect(result.success).toBe(true);
    expect(result.output).toContain("hook ran successfully");
  }, 30_000);

  test("executeHookScript reports failure for failing script", async () => {
    const result = await executeHookScript(tmpFailScript, "pre-init");
    expect(result.success).toBe(false);
  }, 30_000);

  test("executeHookScript passes context via stdin and env", async () => {
    const result = await executeHookScript(tmpContextScript, "pre-assemble", {
      planType: "C",
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("event=pre-assemble");
    expect(result.output).toContain('"planType":"C"');
  }, 30_000);

  // Regression: Bun 1.4 on Linux surfaces the stdin-write EPIPE that 1.3 swallowed.
  // The context offer is optional, so a script that closes stdin and exits 0 is a
  // successful hook. Payload exceeds the 64KiB pipe buffer so the write cannot be
  // absorbed by the kernel and must actually hit the closed pipe.
  test("executeHookScript succeeds when the script closes stdin without reading", async () => {
    const result = await executeHookScript(tmpClosedStdinScript, "pre-init", {
      payload: "x".repeat(128 * 1024),
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("declined the stdin offer");
  }, 30_000);

  // Scoping guard for the tolerance above: only EPIPE is absorbed.
  test("rethrowNonEpipeStdinError absorbs EPIPE and propagates every other code", () => {
    const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    expect(() => rethrowNonEpipeStdinError(epipe)).not.toThrow();

    const econnreset = Object.assign(new Error("write ECONNRESET"), {
      code: "ECONNRESET",
    });
    expect(() => rethrowNonEpipeStdinError(econnreset)).toThrow("write ECONNRESET");

    const codeless = new Error("stream blew up");
    expect(() => rethrowNonEpipeStdinError(codeless)).toThrow("stream blew up");
  });

  test("executeHookScript returns error for missing script", async () => {
    const result = await executeHookScript("/nonexistent/script.sh", "pre-init");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  }, 30_000);

  test("sync hook failure aborts remaining hooks", async () => {
    const config = {
      events: {
        "pre-init": {
          type: "sync" as const,
          description: "test",
          scripts: [tmpFailScript, tmpSuccessScript],
        },
      },
    };
    writeFileSync(tmpHooksConfig, JSON.stringify(config));

    const result = await runHooks("pre-init", {}, tmpHooksConfig);
    expect(result.success).toBe(false);
    // Only the first (failing) script should have run
    expect(result.results.length).toBe(1);
    expect(result.results[0].success).toBe(false);
  }, 30_000);

  test("advisory hook failure does not abort remaining hooks", async () => {
    const config = {
      events: {
        "post-init": {
          type: "advisory" as const,
          description: "test",
          scripts: [tmpFailScript, tmpSuccessScript],
        },
      },
    };
    writeFileSync(tmpHooksConfig, JSON.stringify(config));

    const result = await runHooks("post-init", {}, tmpHooksConfig);
    expect(result.success).toBe(true);
    // Both scripts should have run
    expect(result.results.length).toBe(2);
    expect(result.results[0].success).toBe(false);
    expect(result.results[1].success).toBe(true);
  }, 30_000);

  // Cleanup
  test("cleanup temp directory", () => {
    rmSync(tmpBase, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});

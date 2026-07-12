import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getAiNativeTemplateVariables,
  getWebappRenderingTemplateVariables,
  getPlanTier,
  isCorePlan,
  loadPlanMap,
} from "../scripts/assemble-template";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Plan map consistency", () => {
  test("plan-map should define canonical A..K plans", () => {
    const planMap = loadPlanMap();
    const planCodes = Object.keys(planMap.plans).sort();
    expect(planCodes).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
  });

  test("AI-native profiles stay as overlays, not plan codes", () => {
    const planMap = loadPlanMap();
    const planCodes = Object.keys(planMap.plans).sort();
    const overlayDefaults = Object.fromEntries(
      planCodes.map((code) => [code, planMap.plans[code].aiNativeOverlayDefaults])
    );

    expect(planCodes).not.toContain("L");
    expect(overlayDefaults.C?.defaultProfile).toBe("none");
    expect(overlayDefaults.C?.recommendedProfiles).toContain("runtime-console");
    expect(overlayDefaults.C?.recommendedProfiles).toContain("collaborative-editor");
    expect(overlayDefaults.D?.recommendedProfiles).toContain("sidecar-kernel");
    expect(overlayDefaults.E?.recommendedProfiles).toContain("product-copilot");
  });

  test("webapp rendering models stay as overlays, not plan codes", () => {
    const planMap = loadPlanMap();
    const planCodes = Object.keys(planMap.plans).sort();

    expect(planCodes).not.toContain("L");
    expect(planMap.plans.B.webappRenderingDefaults?.defaultModel).toBe("client-only");
    expect(planMap.plans.C.webappRenderingDefaults?.defaultModel).toBe("start-workers");
    expect(planMap.plans.C.webappRenderingDefaults?.recommendedModels).toContain("start-workers");
    expect(planMap.plans.D.webappRenderingDefaults?.recommendedModels).toContain("start-workers");
    expect(planMap.plans.E.defaultTemplateVariables?.TECH_STACK_TABLE).toContain("Workers for SSR React webapps");
  });

  test("AI-native template variables only activate when explicitly selected", () => {
    const defaultOverlay = getAiNativeTemplateVariables("C", {
      PROJECT_STRUCTURE: "base structure",
    });
    expect(defaultOverlay.enabled).toBe(false);
    expect(defaultOverlay.variables.AI_NATIVE_TECH_STACK_SECTION).toBe("");

    const runtimeConsoleOverlay = getAiNativeTemplateVariables("C", {
      PROJECT_STRUCTURE: "base structure",
      AI_NATIVE_PROFILE: "runtime-console",
    });
    expect(runtimeConsoleOverlay.enabled).toBe(true);
    expect(runtimeConsoleOverlay.variables.PROJECT_STRUCTURE).toContain(
      "AI-native Runtime Console Overlay"
    );
    expect(runtimeConsoleOverlay.variables.AI_NATIVE_TECH_STACK_TABLE).toContain("AG-UI");
    expect(runtimeConsoleOverlay.variables.AI_NATIVE_TECH_STACK_SECTION).toContain(
      "assistant-ui"
    );
  });

  test("webapp rendering variables follow plan defaults and explicit overrides", () => {
    const startWorkers = getWebappRenderingTemplateVariables("C", {
      PROJECT_STRUCTURE: "base structure",
    });
    expect(startWorkers.enabled).toBe(true);
    expect(startWorkers.modelId).toBe("start-workers");
    expect(startWorkers.variables.PROJECT_STRUCTURE).toContain("TanStack Start + Cloudflare Workers Webapp Structure");
    expect(startWorkers.variables.WEBAPP_RENDERING_TECH_STACK_TABLE).toContain("wrangler deploy");

    const clientOnly = getWebappRenderingTemplateVariables("B", {
      PROJECT_STRUCTURE: "base structure",
    });
    expect(clientOnly.enabled).toBe(true);
    expect(clientOnly.modelId).toBe("client-only");
    expect(clientOnly.variables.WEBAPP_RENDERING_TECH_STACK_SECTION).not.toContain("ssr: false");
  });

  test("plan tiers should enforce core A-F and preset/custom G-K model", () => {
    const planMap = loadPlanMap();

    expect(planMap.planTiers?.core).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(planMap.planTiers?.presets).toEqual(["G", "H", "I", "J"]);
    expect(planMap.planTiers?.custom).toEqual(["K"]);

    expect(getPlanTier("A", planMap)).toBe("core");
    expect(getPlanTier("F", planMap)).toBe("core");
    expect(getPlanTier("G", planMap)).toBe("preset");
    expect(getPlanTier("J", planMap)).toBe("preset");
    expect(getPlanTier("K", planMap)).toBe("custom");
    expect(isCorePlan("C", planMap)).toBe(true);
    expect(isCorePlan("H", planMap)).toBe(false);
  });

  test("docs should not reference deprecated plan labels", () => {
    const skill = read("SKILL.md");
    const techStacks = read("references/tech-stacks.md");
    const planMap = read("assets/plan-map.json");

    expect(planMap).not.toContain("Remix + React");
    expect(planMap).not.toContain("UmiJS");
    expect(planMap).not.toContain("Web3 DApp");
    expect(planMap).not.toContain("Financial Trading");
    expect(skill).not.toContain("Plan C+");
    expect(skill).not.toContain("Plan L");
    expect(techStacks).not.toContain("Plan C+");
    expect(techStacks).not.toContain("Plan L");
  });

  test("plan-map routes codes as stack families", () => {
    const planMap = loadPlanMap();

    expect(planMap.plans.A.name).toBe("Astro-first SSR/content shell");
    expect(planMap.plans.B.name).toBe("Vite 8 client-only app shell");
    expect(planMap.plans.C.name).toBe("TanStack Start Workers webapp");
    expect(planMap.plans.C.stack).toContain("Cloudflare Workers");
    expect(planMap.plans.D.stack).toContain("Bun Workspaces");
    expect(planMap.plans.E.stack).toContain("Cloudflare");
    expect(planMap.plans.E.defaultTemplateVariables?.TECH_STACK_TABLE).toContain("D1 is opt-in only");
    expect(planMap.plans.H.defaultLsp).toBe("gopls-lsp");
    expect(planMap.plans.J.defaultLsp).toBe("rust-analyzer-lsp");
  });

  test("canonical plan labels live in on-demand stack docs, not the root router", () => {
    const skill = read("SKILL.md");
    const techStacks = read("references/tech-stacks.md");

    for (const plan of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]) {
      expect(skill).not.toContain(`Plan ${plan}`);
      expect(techStacks).toContain(`Plan ${plan}`);
    }

    expect(skill).not.toContain("Core Plans (A-F)");
    expect(skill).not.toContain("Custom Presets (G-K)");
    expect(techStacks).toContain("Core Plans (A-F)");
    expect(techStacks).toContain("Custom Presets (G-K)");
  });
});

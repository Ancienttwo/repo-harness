import { describe, expect, test } from "bun:test";
import {
  assembleTemplate,
  getWebappRenderingTemplateVariables,
  loadPlanMap,
} from "../../scripts/assemble-template";
import { loadQuestionPack, InitializerQuestionPackV4 } from "../../scripts/initializer-question-pack";

describe("webapp Start/Workers scaffold refresh", () => {
  test("keeps webapp rendering as an overlay on the A-K plan catalog", () => {
    const planMap = loadPlanMap();

    expect(Object.keys(planMap.plans).sort()).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
    ]);
    expect(planMap.plans.B.webappRenderingDefaults?.defaultModel).toBe("client-only");
    expect(planMap.plans.C.webappRenderingDefaults?.defaultModel).toBe("start-workers");
    expect(planMap.plans.E.defaultTemplateVariables?.TECH_STACK_TABLE).toContain(
      "Workers for SSR React webapps"
    );
  });

  test("documents Start Workers route and deploy boundaries in the question pack", () => {
    const pack = loadQuestionPack() as InitializerQuestionPackV4;

    expect(pack.inferredDefaults.webappRenderingModel).toBe("none");
    expect(pack.webappRenderingModels["start-workers"].frontend).toBe(
      "TanStack Start + Vite + React"
    );
    expect(pack.webappRenderingModels["start-workers"].deployment).toContain(
      "wrangler deploy"
    );
    expect(pack.webappRenderingModels["start-workers"].appRoute).toContain(
      "ssr: false"
    );
  });

  test("Plan C emits one apps/web Start Workers frontend by default", () => {
    const output = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "SeoWorkspace" },
    });

    expect(output).toContain("TanStack Start + Cloudflare Workers Webapp Structure");
    expect(output).toContain("one `apps/web` Worker");
    expect(output).toContain("`/` SSR/prerender-capable landing route");
    expect(output).toContain("`/app` client-only route boundary");
    expect(output).toContain("route-level `ssr: false`");
    expect(output).toContain("Worker assets");
    expect(output).toContain("wrangler deploy");
    expect(output).toContain("do not use `wrangler pages deploy`");
    expect(output).toContain("Start SSR app");
  });

  test("Plan B remains client-only and points SSR needs to Plan C", () => {
    const output = assembleTemplate({
      planType: "B",
      variables: { PROJECT_NAME: "InternalTool" },
    });

    expect(output).toContain("Client-only Vite + TanStack Router/Query");
    expect(output).toContain("No SSR guarantee");
    expect(output).toContain("Use this structure for dense interactive apps");
    expect(output).toContain("choose the TanStack Start + Cloudflare");
    expect(output).not.toContain("TanStack Start + Cloudflare Workers Webapp Structure");
  });

  test("explicit none disables webapp rendering output", () => {
    const model = getWebappRenderingTemplateVariables("C", {
      WEBAPP_RENDERING_MODEL: "none",
    });

    expect(model.enabled).toBe(false);
    expect(model.variables.WEBAPP_RENDERING_TECH_STACK_SECTION).toBe("");
  });
});

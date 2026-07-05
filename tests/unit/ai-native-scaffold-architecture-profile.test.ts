import { describe, expect, test } from "bun:test";
import { assembleTemplate, getAiNativeTemplateVariables, loadPlanMap } from "../../scripts/assemble-template";
import { loadQuestionPack, InitializerQuestionPackV4 } from "../../scripts/initializer-question-pack";

describe("AI-native scaffold architecture profile", () => {
  test("keeps AI-native profile as an overlay on the A-K plan catalog", () => {
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
    expect(planMap.plans.C.aiNativeOverlayDefaults?.recommendedProfiles).toContain(
      "runtime-console"
    );
    expect(planMap.plans.C.aiNativeOverlayDefaults?.recommendedProfiles).toContain(
      "collaborative-editor"
    );
    expect(planMap.plans.D.aiNativeOverlayDefaults?.recommendedProfiles).toContain(
      "sidecar-kernel"
    );
  });

  test("documents runtime-console defaults without making them global defaults", () => {
    const pack = loadQuestionPack() as InitializerQuestionPackV4;

    expect(pack.inferredDefaults.aiNativeProfile).toBe("none");
    expect(pack.aiNativeProfiles["runtime-console"].backend).toBe("Bun/Hono agent gateway");
    expect(pack.aiNativeProfiles["runtime-console"].runtimeProtocol).toBe("AG-UI required");
    expect(pack.aiNativeProfiles["runtime-console"].uiSchema).toContain("A2UI optional");
    expect(pack.aiNativeProfiles["collaborative-editor"].projectStructureFile).toBe(
      "assets/project-structures/ai-native-collaborative-editor.txt"
    );
  });

  test("emits runtime-console project and tech-stack overlay only when selected", () => {
    const plainOutput = assembleTemplate({
      planType: "C",
      variables: { PROJECT_NAME: "Plain" },
    });
    const consoleOutput = assembleTemplate({
      planType: "C",
      variables: {
        PROJECT_NAME: "Console",
        AI_NATIVE_PROFILE: "runtime-console",
      },
    });

    expect(plainOutput).not.toContain("AI-native Runtime Console Overlay");
    expect(consoleOutput).toContain("AI-native Runtime Console Overlay");
    expect(consoleOutput).toContain("AG-UI required");
    expect(consoleOutput).toContain("OpenTelemetry spans/log events");
  });

  test("rejects unknown AI-native profile names", () => {
    expect(() =>
      getAiNativeTemplateVariables("C", {
        AI_NATIVE_PROFILE: "unknown-profile",
      })
    ).toThrow("Unsupported AI-native profile");
  });
});

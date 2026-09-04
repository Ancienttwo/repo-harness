import { readFileSync } from "fs";

type CaseRule = {
  mode: "stress-test" | "bypass";
  status: "Draft" | "Ready";
  frontier: RegExp[];
  deferred: RegExp[];
  persistence: RegExp[];
  questions: { min: number; max: number };
};

const RULES: Record<string, CaseRule> = {
  "architecture-event-identity": {
    mode: "stress-test",
    status: "Draft",
    frontier: [/semantic (event )?identity|normalized fields|idempotency key/i],
    deferred: [/lock/i, /recovery/i],
    persistence: [/Plan/i, /Contract/i],
    questions: { min: 1, max: 3 },
  },
  "oauth-active-token": {
    mode: "stress-test",
    status: "Draft",
    frontier: [/active token|token liveness/i, /expired access|dangling refresh|anti-zombie|zombie/i],
    deferred: [/cleanup|storage|rotation/i],
    persistence: [/Plan/i, /Contract/i],
    questions: { min: 1, max: 3 },
  },
  "human-decision-authority": {
    mode: "stress-test",
    status: "Draft",
    frontier: [/which actor|actor.*authority|who may answer/i],
    deferred: [/schema/i, /CAS/i, /recovery/i],
    persistence: [/Plan/i, /Contract/i],
    questions: { min: 1, max: 3 },
  },
  "answered-authority-mapping": {
    mode: "stress-test",
    status: "Ready",
    frontier: [/none|empty/i],
    deferred: [],
    persistence: [/Plan/i, /Contract/i, /Out.of.scope|Non.Goal|scope.fidelity/i],
    questions: { min: 0, max: 0 },
  },
  "simple-rename": {
    mode: "bypass",
    status: "Ready",
    frontier: [/none|empty/i],
    deferred: [],
    persistence: [/documentation|heading|rename/i],
    questions: { min: 0, max: 0 },
  },
};

function fail(message: string): never {
  throw new Error(message);
}

function field(text: string, name: string): string {
  const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  return match?.[1].trim() ?? fail(`missing ${name} field`);
}

function section(text: string, name: string, next: string): string {
  const match = text.match(new RegExp(`^${name}:\\s*\\n([\\s\\S]*?)(?=^${next}:|(?![\\s\\S]))`, "m"));
  return match?.[1].trim() ?? fail(`missing ${name} section`);
}

export function validateFrontierOutput(caseName: string, text: string): void {
  const rule = RULES[caseName] ?? fail(`unknown frontier case: ${caseName}`);
  const allowedLine = /^(?:Mode: .+|Status: .+|Current frontier:|Deferred:|Persistence:|- .+|  Recommended default: .+|  Option [A-C]: .+|\s*)$/;
  for (const line of text.split(/\r?\n/)) {
    if (!allowedLine.test(line)) fail(`unexpected output line: ${line}`);
  }
  for (const label of ["Mode", "Status", "Current frontier", "Deferred", "Persistence"]) {
    const count = (text.match(new RegExp(`^${label}:`, "gm")) ?? []).length;
    if (count !== 1) fail(`${label} must appear exactly once`);
  }
  if (!/^Mode: .+\nStatus: .+\nCurrent frontier:/m.test(text)) {
    fail("fields and sections are out of order");
  }
  if (field(text, "Mode") !== rule.mode) fail(`Mode must equal ${rule.mode}`);
  if (field(text, "Status") !== rule.status) fail(`Status must equal ${rule.status}`);

  const current = section(text, "Current frontier", "Deferred");
  const deferred = section(text, "Deferred", "Persistence");
  const persistence = text.match(/^Persistence:\s*\n([\s\S]*)$/m)?.[1].trim()
    ?? fail("missing Persistence section");
  const questionCount = (text.match(/\?/g) ?? []).length;
  if (questionCount < rule.questions.min || questionCount > rule.questions.max) {
    fail(`question count ${questionCount} is outside ${rule.questions.min}-${rule.questions.max}`);
  }
  if (rule.status === "Draft" && !current.includes("[UNKNOWN:BLOCKING]")) {
    fail("Draft frontier must remain UNKNOWN:BLOCKING");
  }
  if (rule.status === "Draft") {
    const blocks = current.split(/(?=^- \[UNKNOWN:BLOCKING\])/m).filter(Boolean);
    if (blocks.length !== questionCount) fail("every question must be one UNKNOWN:BLOCKING frontier bullet");
    for (const block of blocks) {
      if (!/^- \[UNKNOWN:BLOCKING\].*\?$/m.test(block)) fail("frontier bullet must end in a question");
      if (!/^  Recommended default: .+$/m.test(block)) fail("frontier question misses a recommended default");
      const options = block.match(/^  Option [A-C]: .+$/gm) ?? [];
      if (options.length < 2 || options.length > 3) fail("frontier question must have 2-3 option effects");
    }
  }
  if (deferred.includes("?")) fail("deferred decisions must not be asked in this round");
  for (const pattern of rule.frontier) if (!pattern.test(current)) fail(`frontier misses ${pattern}`);
  for (const pattern of rule.deferred) if (!pattern.test(deferred)) fail(`deferred misses ${pattern}`);
  for (const pattern of rule.persistence) if (!pattern.test(persistence)) fail(`persistence misses ${pattern}`);

  if (/Status:\s*Approved|begin implementation|started implementation/i.test(text)) {
    fail("output crosses the planning boundary");
  }
  if (/CONTEXT\.md|docs\/adr\/|decision-tree\.md|grill-session\.md/i.test(text)) {
    fail("output names a forbidden authority artifact");
  }
}

if (import.meta.main) {
  const caseName = process.argv[2] ?? fail("case name is required");
  const path = process.argv[3] ?? "final-response.md";
  validateFrontierOutput(caseName, readFileSync(path, "utf-8"));
}

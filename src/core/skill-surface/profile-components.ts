// Profile -> InstallComponent closed-vocabulary mapping, owned by the pure
// skill-surface core so every caller that needs the crossref reads the same
// single source of truth. src/cli/installer/install-profile.ts re-exports
// PROFILE_COMPONENTS and InstallComponent unchanged at their former
// definition site, so every existing `from '../installer/install-profile'`
// import keeps working. scripts/skill-surface-select.ts imports this file
// directly (bypassing install-profile.ts) so a fail-closed crossref check
// doesn't have to pull the full installer module into a thin shell-facing
// adapter. Reuses SkillSurfaceProfile as the key type (identical closed
// vocabulary to install-profile.ts's own InstallProfile) via a type-only
// import, so this file carries zero runtime dependency, matching
// ./catalog.ts's zero-imports pattern.
import type { SkillSurfaceProfile } from "./catalog";

export type InstallComponent =
  | "cli"
  | "effective-state"
  | "scope-worktree-check-guards"
  | "handoff"
  | "host-adapters"
  | "adaptive-workflow"
  | "codegraph-conditional"
  | "planning-integrations"
  | "agent-fleet"
  | "verifier"
  | "cross-model-acceptance"
  | "release-deployment-gates";

export const PROFILE_COMPONENTS: Readonly<Record<SkillSurfaceProfile, readonly InstallComponent[]>> = Object.freeze({
  minimal: [
    "cli", "effective-state", "scope-worktree-check-guards", "handoff", "host-adapters",
    "adaptive-workflow", "codegraph-conditional",
  ],
  full: [
    "cli", "effective-state", "scope-worktree-check-guards", "handoff", "host-adapters",
    "adaptive-workflow", "codegraph-conditional", "planning-integrations", "agent-fleet",
    "verifier", "cross-model-acceptance", "release-deployment-gates",
  ],
});

import { readFileSync } from "node:fs";

export function activeRelease(): string {
  const artifact = new URL("../state/active-release.json", import.meta.url);
  return JSON.parse(readFileSync(artifact, "utf-8")).release;
}

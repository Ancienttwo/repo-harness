export const ADOPTION_MODES = ["minimal", "standard", "self-host"] as const;

export type AdoptionMode = (typeof ADOPTION_MODES)[number];

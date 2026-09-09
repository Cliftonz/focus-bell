export type TierName = "primary" | "secondary" | "tertiary";

export type TierConfig = {
  theme: string | null;
  repeat: boolean;
  respectFocusMute: boolean;
};

export type Settings = {
  tiers: Record<TierName, TierConfig>;
  defaultTier: TierName;
  idleMinutes: number;
  debug: boolean;
};

export const DEFAULT_TIERS: Record<TierName, TierConfig> = {
  primary: { theme: "loud", repeat: true, respectFocusMute: false },
  secondary: { theme: "plain", repeat: false, respectFocusMute: true },
  tertiary: { theme: null, repeat: false, respectFocusMute: true },
};

const TIER_NAMES: TierName[] = ["primary", "secondary", "tertiary"];

export function readSettings(get: (key: string) => unknown): Settings {
  const userTiers = (get("tiers") ?? {}) as Partial<Record<TierName, Partial<TierConfig>>>;
  const tiers = {} as Record<TierName, TierConfig>;
  for (const name of TIER_NAMES) {
    tiers[name] = { ...DEFAULT_TIERS[name], ...userTiers[name] };
  }
  return {
    tiers,
    defaultTier: (get("defaultTier") ?? "secondary") as TierName,
    idleMinutes: (get("idleMinutes") ?? 10) as number,
    debug: (get("debug") ?? false) as boolean,
  };
}

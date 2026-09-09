import * as fs from "fs";
import * as path from "path";

export type Tier = "primary" | "secondary" | "tertiary";

export type TierRecord = { tier: Tier; set_at: string; workspace: string };

export type Tiers = Record<string, TierRecord>;

export function readTiers(filePath: string): Tiers {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeTiers(filePath: string, tiers: Tiers): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(tiers, null, 2) + "\n");
}

export function setTier(filePath: string, key: string, tier: Tier, workspace: string, now: string): void {
  const tiers = readTiers(filePath);
  tiers[key] = { tier, set_at: now, workspace };
  writeTiers(filePath, tiers);
}

export function clearTier(filePath: string, key: string): void {
  const tiers = readTiers(filePath);
  delete tiers[key];
  writeTiers(filePath, tiers);
}

import { WORKSPACE_KEY_PREFIX } from "../commands";
import { normalizeFolder } from "./active";
import { readTiers, setTier } from "./tiers";
import { openEntry, type TimeStore } from "./time";

export function applyWorkspaceDefault(
  tiersPath: string,
  timeStore: TimeStore,
  event: { conversation_id: string; workspace_roots: string[] },
  now: string,
): void {
  const tiers = readTiers(tiersPath);
  if (tiers[event.conversation_id] !== undefined) return;
  const root = event.workspace_roots.find(
    (r) => tiers[WORKSPACE_KEY_PREFIX + normalizeFolder(r)] !== undefined,
  );
  if (root === undefined) return;
  const tier = tiers[WORKSPACE_KEY_PREFIX + normalizeFolder(root)].tier;
  setTier(tiersPath, event.conversation_id, tier, root, now);
  openEntry(timeStore, { conversation_id: event.conversation_id, tier, mode: "local", workspace: root, start: now });
}

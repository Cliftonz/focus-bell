import { normalizeFolder } from "./state/active";
import { clearTier, readTiers, setTier, type Tier } from "./state/tiers";
import { closeEntry, openEntry, readOpen, writeOpen, type TimeStore } from "./state/time";
import { PICK_TIER_COMMAND } from "./ui/statusBar";

export type CommandDeps = {
  tiersPath: string;
  timeStore: TimeStore;
  eventsPath: string;
  defaultTier: Tier;
  now(): string;
  activeConversationId(): string | undefined;
  workspaceFolder(): string | undefined;
  repeater: { stop(id: string): void };
  playTest(tier: Tier, slot: string): void;
  openFile(path: string): void;
  showDoctor(): void;
  warn(message: string): void;
  pickTier(): Promise<Tier | "clear" | undefined>;
};

export const WORKSPACE_KEY_PREFIX = "workspace:";

export function registerCommands(
  register: (id: string, handler: (...args: unknown[]) => unknown) => void,
  deps: CommandDeps,
): void {
  const NO_FOLDER = "Focus Bell: open a folder to set a workspace default.";
  const workspaceKey = (folder: string) => WORKSPACE_KEY_PREFIX + normalizeFolder(folder);

  function tag(tier: Tier): void {
    const id = deps.activeConversationId();
    const folder = deps.workspaceFolder();
    if (id === undefined) {
      if (folder === undefined) {
        deps.warn(NO_FOLDER);
        return;
      }
      setTier(deps.tiersPath, workspaceKey(folder), tier, folder, deps.now());
      return;
    }
    setTier(deps.tiersPath, id, tier, folder!, deps.now());
    openEntry(deps.timeStore, {
      conversation_id: id,
      tier,
      mode: "local",
      workspace: folder!,
      start: deps.now(),
    });
  }

  function clear(): void {
    const id = deps.activeConversationId();
    if (id === undefined) {
      const folder = deps.workspaceFolder();
      if (folder === undefined) {
        deps.warn(NO_FOLDER);
        return;
      }
      clearTier(deps.tiersPath, workspaceKey(folder));
      return;
    }
    clearTier(deps.tiersPath, id);
    if (readOpen(deps.timeStore).entries[id]) closeEntry(deps.timeStore, id, deps.now());
  }

  register("focusBell.setPrimary", () => tag("primary"));
  register("focusBell.setSecondary", () => tag("secondary"));
  register("focusBell.setTertiary", () => tag("tertiary"));
  register("focusBell.clearTier", clear);

  register("focusBell.acknowledge", () => {
    const id = deps.activeConversationId();
    if (id !== undefined) deps.repeater.stop(id);
  });

  register("focusBell.markCloud", () => {
    const id = deps.activeConversationId();
    const state = readOpen(deps.timeStore);
    if (id === undefined || !state.entries[id]) {
      deps.warn("Focus Bell: no open time entry for the active conversation.");
      return;
    }
    state.entries[id].mode = "cloud";
    writeOpen(deps.timeStore, state);
  });

  register("focusBell.testSound", (tier, slot) => {
    const id = deps.activeConversationId();
    const tagged = id === undefined ? undefined : readTiers(deps.tiersPath)[id]?.tier;
    deps.playTest((tier as Tier | undefined) ?? tagged ?? deps.defaultTier, (slot as string | undefined) ?? "notification");
  });

  register("focusBell.showLog", () => deps.openFile(deps.eventsPath));
  register("focusBell.doctor", () => deps.showDoctor());

  register(PICK_TIER_COMMAND, async () => {
    const choice = await deps.pickTier();
    if (choice === undefined) return;
    if (choice === "clear") clear();
    else tag(choice);
  });
}

import * as path from "path";

export type ActiveEvent = {
  event: string;
  conversation_id: string;
  workspace_roots: string[];
};

export function normalizeFolder(folder: string, platform: NodeJS.Platform = process.platform): string {
  const api = platform === "win32" ? path.win32 : path.posix;
  let normalized = api.normalize(folder);
  if (normalized.length > api.parse(normalized).root.length && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return platform === "win32" || platform === "darwin" ? normalized.toLowerCase() : normalized;
}

export function createActiveTracker(workspaceFolders: string[], platform: NodeJS.Platform = process.platform) {
  const folders = workspaceFolders.map((f) => normalizeFolder(f, platform));
  let active: string | undefined;
  return {
    onEvent(e: ActiveEvent): void {
      if (e.event !== "beforeSubmitPrompt") return;
      if (!e.workspace_roots.some((root) => folders.includes(normalizeFolder(root, platform)))) return;
      active = e.conversation_id;
    },
    current(): string | undefined {
      return active;
    },
  };
}

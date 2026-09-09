export const HOOK_EVENTS: string[];
export const HOOK_MARKER: string;
export function mergeHookEntry(
  text: null,
  entry: { command: string; timeout: number },
): { ok: true; merged: string; changed: boolean };
export function mergeHookEntry(
  text: string | null,
  entry: { command: string; timeout: number },
): { ok: true; merged: string; changed: boolean } | { ok: false; reason: "invalid_json" };

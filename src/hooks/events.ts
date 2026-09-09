import { readFileSync } from "node:fs";

export type HookEvent = {
  ts: string;
  conversation_id: string;
  generation_id: string;
  event: string;
  state: string;
  workspace_roots: string[];
  transcript_path: string;
  model: string;
  cursor_version: string;
  is_interrupt?: boolean;
};

export function parseEvent(line: string): HookEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  return typeof value === "object" && value !== null ? (value as HookEvent) : undefined;
}

export function readEvents(filePath: string): HookEvent[] {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map(parseEvent)
    .filter((event): event is HookEvent => event !== undefined);
}

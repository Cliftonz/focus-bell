import * as fs from "node:fs";
import * as path from "node:path";

export type Mode = "local" | "cloud";

export type OpenEntry = {
  tier: string;
  mode: Mode;
  workspace: string;
  start: string;
  idle_seconds: number;
};

export type OpenState = {
  last_activity: string | null;
  idle_since?: string;
  entries: Record<string, OpenEntry>;
};

export type TimeStore = { openPath: string; logPath: string };

const MS_PER_MINUTE = 60000;

export function createTimeStore(dir: string): TimeStore {
  return {
    openPath: path.join(dir, "open.json"),
    logPath: path.join(dir, "time.jsonl"),
  };
}

export function readOpen(store: TimeStore): OpenState {
  if (!fs.existsSync(store.openPath)) {
    return { last_activity: null, entries: {} };
  }
  return JSON.parse(fs.readFileSync(store.openPath, "utf8"));
}

export function writeOpen(store: TimeStore, state: OpenState): void {
  fs.mkdirSync(path.dirname(store.openPath), { recursive: true });
  fs.writeFileSync(store.openPath, JSON.stringify(state, null, 2) + "\n");
}

export function openEntry(
  store: TimeStore,
  input: {
    conversation_id: string;
    tier: string;
    mode: Mode;
    workspace: string;
    start: string;
  },
): void {
  const existing = readOpen(store).entries[input.conversation_id];
  if (existing?.tier === input.tier) return;
  if (existing) closeEntry(store, input.conversation_id, input.start);
  const state = readOpen(store);
  state.entries[input.conversation_id] = {
    tier: input.tier,
    mode: input.mode,
    workspace: input.workspace,
    start: input.start,
    idle_seconds: 0,
  };
  writeOpen(store, state);
}

export function closeEntry(
  store: TimeStore,
  conversation_id: string,
  end: string,
): void {
  const state = readOpen(store);
  const entry = state.entries[conversation_id];
  if (!entry) throw new Error(`no open entry for ${conversation_id}`);
  delete state.entries[conversation_id];
  writeOpen(store, state);
  const total = secondsBetween(entry.start, end);
  const idle_seconds =
    entry.idle_seconds +
    (state.idle_since ? Math.max(0, secondsBetween(state.idle_since, end)) : 0);
  const line = {
    conversation_id,
    tier: entry.tier,
    mode: entry.mode,
    workspace: entry.workspace,
    start: entry.start,
    end,
    active_seconds: total - idle_seconds,
    idle_seconds,
  };
  fs.mkdirSync(path.dirname(store.logPath), { recursive: true });
  fs.appendFileSync(store.logPath, JSON.stringify(line) + "\n");
}

export function markActivity(store: TimeStore, now: string): void {
  const state = readOpen(store);
  if (state.idle_since) {
    const idle = secondsBetween(state.idle_since, now);
    for (const entry of Object.values(state.entries)) {
      entry.idle_seconds += idle;
    }
    delete state.idle_since;
  }
  state.last_activity = now;
  writeOpen(store, state);
}

export function tick(store: TimeStore, now: string, idleMinutes: number): void {
  const state = readOpen(store);
  if (state.last_activity === null || state.idle_since) return;
  if (Object.keys(state.entries).length === 0) return;
  const threshold = Date.parse(state.last_activity) + idleMinutes * MS_PER_MINUTE;
  if (Date.parse(now) < threshold) return;
  state.idle_since = new Date(threshold).toISOString();
  writeOpen(store, state);
}

export function closeIdle(
  store: TimeStore,
  lastEventTs: Record<string, string>,
  now: string,
  idleMinutes: number,
): void {
  const open = readOpen(store);
  for (const [id, entry] of Object.entries(open.entries)) {
    const last = latest(
      [lastEventTs[id], entry.start, open.last_activity].filter(
        (ts): ts is string => typeof ts === "string",
      ),
    );
    if (Date.parse(now) - Date.parse(last) < idleMinutes * MS_PER_MINUTE) continue;
    closeEntry(store, id, last);
  }
  const state = readOpen(store);
  if (Object.keys(state.entries).length > 0) return;
  delete state.idle_since;
  writeOpen(store, state);
}

function latest(timestamps: string[]): string {
  return timestamps.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

function secondsBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 1000);
}

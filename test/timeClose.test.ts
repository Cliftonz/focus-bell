import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  closeIdle,
  createTimeStore,
  markActivity,
  openEntry,
  readOpen,
  tick,
  type TimeStore,
} from "../src/state/time.js";

const t0 = "2026-09-09T10:00:00.000Z";
const min = (minutes: number) =>
  new Date(Date.parse(t0) + minutes * 60000).toISOString();
const idleMinutes = 10;

let dir: string;
let store: TimeStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-close-"));
  store = createTimeStore(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const open = (conversation_id: string, start: string) =>
  openEntry(store, {
    conversation_id,
    tier: "primary",
    mode: "local",
    workspace: "/ws",
    start,
  });

const logLines = () =>
  fs
    .readFileSync(store.logPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

describe("closing idle entries", () => {
  it("closes only entries idle past the threshold, at their last event", () => {
    open("c1", min(0));
    open("c2", min(0));
    closeIdle(store, { c1: min(0), c2: min(25) }, min(30), idleMinutes);

    expect(Object.keys(readOpen(store).entries)).toEqual(["c2"]);
    const lines = logLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ conversation_id: "c1", end: min(0) });
  });

  it("never ends an entry before its start", () => {
    open("c1", min(10));
    closeIdle(store, { c1: min(5) }, min(30), idleMinutes);

    expect(readOpen(store).entries).toEqual({});
    expect(logLines()[0]).toMatchObject({ end: min(10), active_seconds: 0 });
  });

  it("with nothing open writes no log", () => {
    const before = readOpen(store);
    closeIdle(store, {}, min(30), idleMinutes);

    expect(fs.existsSync(store.logPath)).toBe(false);
    expect(readOpen(store)).toEqual(before);
  });

  it("closing the last entry at its last event charges no idle and clears idle_since", () => {
    open("c1", min(0));
    markActivity(store, min(0));
    tick(store, min(20), idleMinutes);
    closeIdle(store, { c1: min(0) }, min(30), idleMinutes);

    expect(readOpen(store).entries).toEqual({});
    expect(logLines()[0]).toMatchObject({
      end: min(0),
      active_seconds: 0,
      idle_seconds: 0,
    });
    expect(readOpen(store)).not.toHaveProperty("idle_since");
  });

  it("counts editor activity as the entry's last event", () => {
    open("c1", min(0));
    markActivity(store, min(9));
    tick(store, min(20), idleMinutes);
    closeIdle(store, {}, min(30), idleMinutes);

    expect(readOpen(store).entries).toEqual({});
    expect(logLines()[0]).toMatchObject({
      end: min(9),
      active_seconds: 540,
      idle_seconds: 0,
    });
  });

  it("leaves a recently active entry and idle_since untouched", () => {
    open("c1", min(0));
    markActivity(store, min(0));
    tick(store, min(20), idleMinutes);
    const before = fs.readFileSync(store.openPath);
    closeIdle(store, { c1: min(25) }, min(30), idleMinutes);

    expect(fs.existsSync(store.logPath)).toBe(false);
    expect(readOpen(store).idle_since).toBe(min(10));
    expect(fs.readFileSync(store.openPath).equals(before)).toBe(true);
  });
});

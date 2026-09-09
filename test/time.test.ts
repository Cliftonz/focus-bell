import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  closeEntry,
  createTimeStore,
  openEntry,
  readOpen,
  type TimeStore,
} from "../src/state/time.js";

const t0 = "2026-09-09T10:00:00.000Z";
const plus = (seconds: number) =>
  new Date(Date.parse(t0) + seconds * 1000).toISOString();

let dir: string;
let store: TimeStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-time-"));
  store = createTimeStore(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const logLines = () =>
  fs
    .readFileSync(store.logPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

describe("time store", () => {
  it("points at open.json and time.jsonl in the given dir", () => {
    expect(store).toEqual({
      openPath: path.join(dir, "open.json"),
      logPath: path.join(dir, "time.jsonl"),
    });
    expect(readOpen(store)).toEqual({ last_activity: null, entries: {} });
  });

  it("closes an open entry into one log line with active seconds", () => {
    openEntry(store, {
      conversation_id: "c1",
      tier: "primary",
      mode: "local",
      workspace: "/ws",
      start: t0,
    });
    closeEntry(store, "c1", plus(90));

    expect(readOpen(store).entries).toEqual({});
    const raw = fs.readFileSync(store.logPath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const lines = logLines();
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0])).toEqual([
      "conversation_id",
      "tier",
      "mode",
      "workspace",
      "start",
      "end",
      "active_seconds",
      "idle_seconds",
    ]);
    expect(lines[0]).toEqual({
      conversation_id: "c1",
      tier: "primary",
      mode: "local",
      workspace: "/ws",
      start: t0,
      end: plus(90),
      active_seconds: 90,
      idle_seconds: 0,
    });
  });

  it("switching tier closes the old entry and opens the new one", () => {
    openEntry(store, {
      conversation_id: "c1",
      tier: "primary",
      mode: "local",
      workspace: "/ws",
      start: t0,
    });
    openEntry(store, {
      conversation_id: "c1",
      tier: "secondary",
      mode: "local",
      workspace: "/ws",
      start: plus(60),
    });

    const lines = logLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe("primary");
    expect(lines[0].active_seconds).toBe(60);
    expect(readOpen(store).entries).toEqual({
      c1: {
        tier: "secondary",
        mode: "local",
        workspace: "/ws",
        start: plus(60),
        idle_seconds: 0,
      },
    });
  });

  it("reopening with the same tier is a no-op", () => {
    openEntry(store, {
      conversation_id: "c1",
      tier: "primary",
      mode: "local",
      workspace: "/ws",
      start: t0,
    });
    openEntry(store, {
      conversation_id: "c1",
      tier: "primary",
      mode: "local",
      workspace: "/ws",
      start: plus(30),
    });

    const entries = readOpen(store).entries;
    expect(Object.keys(entries)).toEqual(["c1"]);
    expect(entries.c1.start).toBe(t0);
    expect(fs.existsSync(store.logPath)).toBe(false);
  });

  it("closing one conversation leaves another open", () => {
    openEntry(store, {
      conversation_id: "c1",
      tier: "primary",
      mode: "local",
      workspace: "/ws",
      start: t0,
    });
    openEntry(store, {
      conversation_id: "c2",
      tier: "secondary",
      mode: "cloud",
      workspace: "/other",
      start: t0,
    });
    closeEntry(store, "c1", plus(10));

    expect(Object.keys(readOpen(store).entries)).toEqual(["c2"]);
    expect(logLines().map((l) => l.conversation_id)).toEqual(["c1"]);
  });

  it("closing an unknown conversation throws", () => {
    expect(() => closeEntry(store, "nope", t0)).toThrow();
  });
});

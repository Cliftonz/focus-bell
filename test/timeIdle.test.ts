import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  closeEntry,
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-idle-"));
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

describe("global idle accounting", () => {
  it("credits idle time back to the entry when activity resumes", () => {
    open("c1", min(0));
    markActivity(store, min(0));
    tick(store, min(20), idleMinutes);
    markActivity(store, min(20));
    closeEntry(store, "c1", min(21));

    expect(logLines()[0]).toMatchObject({
      active_seconds: 660,
      idle_seconds: 600,
    });
  });

  it("tick before the idle threshold does not write", () => {
    open("c1", min(0));
    markActivity(store, min(0));
    const before = fs.readFileSync(store.openPath);
    tick(store, min(5), idleMinutes);

    expect(readOpen(store)).not.toHaveProperty("idle_since");
    expect(fs.readFileSync(store.openPath).equals(before)).toBe(true);
  });

  it("a changed idleMinutes does not move an existing idle_since", () => {
    open("c1", min(0));
    markActivity(store, min(0));
    tick(store, min(20), 10);
    tick(store, min(40), 15);

    expect(readOpen(store).idle_since).toBe(min(10));
  });

  it("idle is global across every open entry", () => {
    open("c1", min(0));
    open("c2", min(0));
    markActivity(store, min(0));
    tick(store, min(20), idleMinutes);
    markActivity(store, min(30));

    const entries = readOpen(store).entries;
    expect(entries.c1.idle_seconds).toBe(1200);
    expect(entries.c2.idle_seconds).toBe(1200);
  });

  it("closing while idle charges the idle span to the closed entry", () => {
    open("c1", min(0));
    markActivity(store, min(0));
    tick(store, min(20), idleMinutes);
    closeEntry(store, "c1", min(25));

    expect(logLines()[0]).toMatchObject({
      idle_seconds: 900,
      active_seconds: 600,
    });
  });

  it("markActivity with nothing open only sets last_activity", () => {
    markActivity(store, min(3));

    expect(readOpen(store)).toEqual({ last_activity: min(3), entries: {} });
  });

  it("tick with nothing open does not write", () => {
    markActivity(store, min(0));
    const before = fs.readFileSync(store.openPath);
    tick(store, min(20), idleMinutes);

    expect(readOpen(store)).not.toHaveProperty("idle_since");
    expect(fs.readFileSync(store.openPath).equals(before)).toBe(true);
  });

  it("tick with no last_activity does nothing", () => {
    tick(store, min(20), idleMinutes);

    expect(fs.existsSync(store.openPath)).toBe(false);
  });
});

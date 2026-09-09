import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readTiers } from "../src/state/tiers";
import { createTimeStore, readOpen, type TimeStore } from "../src/state/time";
import { PICK_TIER_COMMAND } from "../src/ui/statusBar";
import { normalizeFolder } from "../src/state/active";
import { registerCommands, WORKSPACE_KEY_PREFIX, type CommandDeps } from "../src/commands";
import type { Tier } from "../src/state/tiers";

const EXPECTED_IDS = [
  "focusBell.setPrimary",
  "focusBell.setSecondary",
  "focusBell.setTertiary",
  "focusBell.clearTier",
  "focusBell.acknowledge",
  "focusBell.markCloud",
  "focusBell.testSound",
  "focusBell.showLog",
  "focusBell.doctor",
  PICK_TIER_COMMAND,
];

let dir: string;
let tiersPath: string;
let timeStore: TimeStore;
let handlers: Map<string, (...args: unknown[]) => unknown>;
let active: string | undefined;
let folder: string | undefined;
let clock: string;
let pick: Tier | "clear" | undefined;
let stopped: string[];
let played: [Tier, string][];
let opened: string[];
let doctorCalls: number;
let warnings: string[];

const run = (id: string, ...args: unknown[]) => handlers.get(id)!(...args);
const workspaceKey = () => WORKSPACE_KEY_PREFIX + normalizeFolder("/W/");

const logLines = () =>
  fs
    .readFileSync(timeStore.logPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "focusbell-commands-"));
  tiersPath = path.join(dir, "tiers.json");
  timeStore = createTimeStore(dir);
  handlers = new Map();
  active = "c1";
  folder = "/W/";
  clock = "2026-09-09T10:00:00.000Z";
  pick = undefined;
  stopped = [];
  played = [];
  opened = [];
  doctorCalls = 0;
  warnings = [];
  const deps: CommandDeps = {
    tiersPath,
    timeStore,
    eventsPath: path.join(dir, "events.jsonl"),
    defaultTier: "secondary",
    now: () => clock,
    activeConversationId: () => active,
    workspaceFolder: () => folder,
    repeater: { stop: (id) => stopped.push(id) },
    playTest: (tier, slot) => played.push([tier, slot]),
    openFile: (p) => opened.push(p),
    showDoctor: () => doctorCalls++,
    warn: (m) => warnings.push(m),
    pickTier: async () => pick,
  };
  registerCommands((id, handler) => handlers.set(id, handler), deps);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("registerCommands", () => {
  it("registers exactly the ten command ids", () => {
    expect([...handlers.keys()].sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("setPrimary tags the active conversation and opens a local time entry", () => {
    run("focusBell.setPrimary");
    expect(readTiers(tiersPath).c1).toEqual({ tier: "primary", set_at: clock, workspace: "/W/" });
    expect(readOpen(timeStore).entries.c1).toMatchObject({ tier: "primary", mode: "local", workspace: "/W/", start: clock });
  });

  it("retagging closes the previous entry and opens a new one", () => {
    run("focusBell.setSecondary");
    clock = "2026-09-09T10:05:00.000Z";
    run("focusBell.setPrimary");
    expect(readOpen(timeStore).entries.c1.tier).toBe("primary");
    const lines = logLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe("secondary");
  });

  it("setPrimary with no active conversation sets the workspace default only", () => {
    active = undefined;
    run("focusBell.setPrimary");
    expect(readTiers(tiersPath)[workspaceKey()]).toEqual({ tier: "primary", set_at: clock, workspace: "/W/" });
    expect(readOpen(timeStore).entries).toEqual({});
  });

  it("clearTier removes the active tag and closes its entry", () => {
    run("focusBell.setPrimary");
    clock = "2026-09-09T10:05:00.000Z";
    run("focusBell.clearTier");
    expect(readTiers(tiersPath)).not.toHaveProperty("c1");
    expect(readOpen(timeStore).entries).toEqual({});
    expect(logLines()).toHaveLength(1);
  });

  it("clearTier with no active conversation removes the workspace key", () => {
    active = undefined;
    run("focusBell.setPrimary");
    expect(readTiers(tiersPath)).toHaveProperty(workspaceKey());
    run("focusBell.clearTier");
    expect(readTiers(tiersPath)).toEqual({});
  });

  it("clearTier on a tagged conversation with no open entry drops the tag without touching the log", () => {
    run("focusBell.setPrimary");
    fs.unlinkSync(timeStore.openPath);
    run("focusBell.clearTier");
    expect(readTiers(tiersPath)).toEqual({});
    expect(fs.existsSync(timeStore.logPath)).toBe(false);
  });

  it("setPrimary with no active conversation and no folder warns and writes nothing", () => {
    active = undefined;
    folder = undefined;
    run("focusBell.setPrimary");
    expect(warnings).toEqual(["Focus Bell: open a folder to set a workspace default."]);
    expect(fs.existsSync(tiersPath)).toBe(false);
    expect(fs.existsSync(timeStore.openPath)).toBe(false);
  });

  it("clearTier with no active conversation and no folder warns and writes nothing", () => {
    active = undefined;
    folder = undefined;
    run("focusBell.clearTier");
    expect(warnings).toEqual(["Focus Bell: open a folder to set a workspace default."]);
    expect(fs.existsSync(tiersPath)).toBe(false);
  });

  it("acknowledge stops the repeater for the active conversation", () => {
    run("focusBell.acknowledge");
    expect(stopped).toEqual(["c1"]);
  });

  it("acknowledge with no active conversation does nothing", () => {
    active = undefined;
    run("focusBell.acknowledge");
    expect(stopped).toEqual([]);
  });

  it("markCloud sets the open entry mode to cloud", () => {
    run("focusBell.setPrimary");
    run("focusBell.markCloud");
    expect(readOpen(timeStore).entries.c1.mode).toBe("cloud");
    expect(warnings).toEqual([]);
  });

  it("markCloud without an open entry warns once", () => {
    run("focusBell.markCloud");
    expect(warnings).toEqual(["Focus Bell: no open time entry for the active conversation."]);
  });

  it("testSound uses the active tier and the notification slot", () => {
    run("focusBell.setTertiary");
    run("focusBell.testSound");
    expect(played).toEqual([["tertiary", "notification"]]);
  });

  it("testSound falls back to the default tier when untagged", () => {
    run("focusBell.testSound");
    expect(played).toEqual([["secondary", "notification"]]);
  });

  it("testSound passes explicit tier and slot through", () => {
    run("focusBell.testSound", "tertiary", "done");
    expect(played).toEqual([["tertiary", "done"]]);
  });

  it("showLog opens the events file", () => {
    run("focusBell.showLog");
    expect(opened).toEqual([path.join(dir, "events.jsonl")]);
  });

  it("doctor shows the doctor", () => {
    run("focusBell.doctor");
    expect(doctorCalls).toBe(1);
  });

  it("pickTier resolving a tier tags the active conversation", async () => {
    pick = "secondary";
    await run(PICK_TIER_COMMAND);
    expect(readTiers(tiersPath).c1.tier).toBe("secondary");
    expect(readOpen(timeStore).entries.c1.tier).toBe("secondary");
  });

  it("pickTier resolving clear clears the active conversation", async () => {
    run("focusBell.setPrimary");
    pick = "clear";
    await run(PICK_TIER_COMMAND);
    expect(readTiers(tiersPath)).toEqual({});
    expect(readOpen(timeStore).entries).toEqual({});
  });

  it("pickTier resolving undefined changes nothing", async () => {
    run("focusBell.setPrimary");
    pick = undefined;
    await run(PICK_TIER_COMMAND);
    expect(readTiers(tiersPath).c1.tier).toBe("primary");
    expect(readOpen(timeStore).entries.c1.tier).toBe("primary");
  });
});

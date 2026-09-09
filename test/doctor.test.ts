import { describe, expect, it } from "vitest";
import { HOOK_EVENTS, HOOK_MARKER } from "../cli/merge";
import { diagnose, formatReport, type DoctorInput, type DoctorLine } from "../src/ui/doctor";

const registeredHooks = (events: readonly string[]) =>
  JSON.stringify({
    hooks: Object.fromEntries(
      events.map((event) => [event, [{ command: `node ~/${HOOK_MARKER}` }]]),
    ),
  });

const healthy = (): DoctorInput => ({
  hooksPath: "/home/u/.cursor/hooks.json",
  hooksText: registeredHooks(HOOK_EVENTS),
  hookScriptPath: "/home/u/.focus-bell/hook.js",
  installedHookChecksum: "abc",
  bundledHookChecksum: "abc",
  nodeVersion: "v22.1.0",
  enterpriseHooksPath: "/etc/cursor/hooks.json",
  enterpriseExists: false,
  projectHooksExists: false,
  recentEvents: [{ ts: "2026-09-09T10:00:00Z", conversation_id: "c1", event: "stop", state: "idle" }],
  playerCmd: "afplay",
  activeConversationId: "c1",
  activeTier: "primary",
  openEntries: [{ conversation_id: "c1", tier: "primary", start: "2026-09-09T09:00:00Z" }],
  missingThemeFiles: [],
});

const levels = (lines: DoctorLine[]) => lines.map((l) => l.level);
const messages = (lines: DoctorLine[]) => lines.map((l) => l.message);

describe("diagnose", () => {
  it("yields only ok lines for a healthy input", () => {
    const lines = diagnose(healthy());
    expect(levels(lines).every((l) => l === "ok")).toBe(true);
    expect(lines).toHaveLength(HOOK_EVENTS.length + 7);
    expect(messages(lines)).toEqual([
      ...HOOK_EVENTS.map((e) => `${e}: registered`),
      "hook script up to date",
      "node v22.1.0",
      "no enterprise hooks file",
      "2026-09-09T10:00:00Z stop idle c1",
      "audio player: afplay",
      "active conversation: c1 tier primary",
      "open: c1 primary since 2026-09-09T09:00:00Z",
    ]);
  });

  it("reports a missing hooks file and no per-event lines", () => {
    const lines = diagnose({ ...healthy(), hooksText: null });
    expect(lines[0]).toEqual({ level: "error", message: "hooks file missing: /home/u/.cursor/hooks.json" });
    expect(messages(lines).some((m) => m.endsWith("registered"))).toBe(false);
  });

  it("reports invalid JSON in the hooks file", () => {
    const lines = diagnose({ ...healthy(), hooksText: "{bad" });
    expect(lines[0]).toEqual({ level: "error", message: "hooks file is not valid JSON: /home/u/.cursor/hooks.json" });
    expect(messages(lines).some((m) => m.endsWith("registered"))).toBe(false);
  });

  it("reports an unexpected shape when the top level is an array", () => {
    const lines = diagnose({ ...healthy(), hooksText: "[]" });
    expect(lines[0]).toEqual({ level: "error", message: "hooks file has unexpected shape: /home/u/.cursor/hooks.json" });
    expect(messages(lines).some((m) => m.endsWith("registered"))).toBe(false);
  });

  it("reports an unexpected shape when an event entry is not an array", () => {
    const lines = diagnose({ ...healthy(), hooksText: '{"hooks":{"stop":{}}}' });
    expect(lines[0]).toEqual({ level: "error", message: "hooks file has unexpected shape: /home/u/.cursor/hooks.json" });
    expect(messages(lines).some((m) => m.endsWith("registered"))).toBe(false);
  });

  it("reports an unexpected shape when hooks is not an object", () => {
    for (const hooksText of ['{"hooks":"x"}', '{"hooks":[]}']) {
      const lines = diagnose({ ...healthy(), hooksText });
      expect(lines[0]).toEqual({ level: "error", message: "hooks file has unexpected shape: /home/u/.cursor/hooks.json" });
      expect(messages(lines).some((m) => m.endsWith("registered"))).toBe(false);
    }
  });

  it("reports each unregistered hook event", () => {
    const lines = diagnose({ ...healthy(), hooksText: registeredHooks(["stop"]) }).slice(0, HOOK_EVENTS.length);
    expect(lines.filter((l) => l.level === "error")).toHaveLength(5);
    expect(lines.filter((l) => l.level === "ok")).toEqual([{ level: "ok", message: "stop: registered" }]);
    expect(lines[0]).toEqual({ level: "error", message: "beforeSubmitPrompt: not registered" });
  });

  it("reports every event unregistered when the hooks key is absent", () => {
    const lines = diagnose({ ...healthy(), hooksText: "{}" }).slice(0, HOOK_EVENTS.length);
    expect(lines).toEqual(HOOK_EVENTS.map((e) => ({ level: "error", message: `${e}: not registered` })));
  });

  it("ignores entries without a command field", () => {
    const hooksText = JSON.stringify({
      hooks: {
        beforeShellExecution: [{ type: "prompt", prompt: "x" }],
        stop: [{ command: `node ~/${HOOK_MARKER}` }],
      },
    });
    const lines = diagnose({ ...healthy(), hooksText });
    expect(lines).toContainEqual({ level: "error", message: "beforeShellExecution: not registered" });
    expect(lines).toContainEqual({ level: "ok", message: "stop: registered" });
  });

  it("reports a missing hook script", () => {
    expect(diagnose({ ...healthy(), installedHookChecksum: null })).toContainEqual({
      level: "error",
      message: "hook script missing: /home/u/.focus-bell/hook.js",
    });
  });

  it("reports an out of date hook script", () => {
    expect(diagnose({ ...healthy(), installedHookChecksum: "old" })).toContainEqual({
      level: "warn",
      message: "hook script out of date",
    });
  });

  it("reports node missing from PATH", () => {
    expect(diagnose({ ...healthy(), nodeVersion: null })).toContainEqual({
      level: "error",
      message: "node not found on PATH",
    });
  });

  it("warns about an enterprise hooks file", () => {
    expect(diagnose({ ...healthy(), enterpriseExists: true })).toContainEqual({
      level: "warn",
      message: "enterprise hooks file present, may override: /etc/cursor/hooks.json",
    });
  });

  it("warns about a project hooks file", () => {
    expect(diagnose({ ...healthy(), projectHooksExists: true })).toContainEqual({
      level: "warn",
      message: "project .cursor/hooks.json present, may shadow user hooks",
    });
  });

  it("warns when there are no events", () => {
    expect(diagnose({ ...healthy(), recentEvents: [] })).toContainEqual({ level: "warn", message: "no events yet" });
  });

  it("lists at most the last five events", () => {
    const recentEvents = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      ts: `t${n}`,
      conversation_id: "c1",
      event: "stop",
      state: "idle",
    }));
    const eventLines = messages(diagnose({ ...healthy(), recentEvents })).filter((m) => m.startsWith("t"));
    expect(eventLines).toEqual(["t3 stop idle c1", "t4 stop idle c1", "t5 stop idle c1", "t6 stop idle c1", "t7 stop idle c1"]);
  });

  it("reports a missing audio player", () => {
    expect(diagnose({ ...healthy(), playerCmd: undefined })).toContainEqual({
      level: "error",
      message: "no audio player found",
    });
  });

  it("warns when there is no active conversation", () => {
    expect(diagnose({ ...healthy(), activeConversationId: undefined })).toContainEqual({
      level: "warn",
      message: "no active conversation",
    });
  });

  it("shows untagged for an active conversation without a tier", () => {
    expect(diagnose({ ...healthy(), activeTier: undefined })).toContainEqual({
      level: "ok",
      message: "active conversation: c1 tier untagged",
    });
  });

  it("reports no open time entries", () => {
    expect(diagnose({ ...healthy(), openEntries: [] })).toContainEqual({ level: "ok", message: "no open time entries" });
  });

  it("warns per theme with missing files", () => {
    const lines = diagnose({
      ...healthy(),
      missingThemeFiles: [{ theme: "loud", missing: ["stop.wav", "fail.wav"] }],
    });
    expect(lines[lines.length - 1]).toEqual({
      level: "warn",
      message: "theme loud missing stop.wav, fail.wav, using plain",
    });
  });
});

describe("formatReport", () => {
  it("prefixes each line with its level tag", () => {
    expect(
      formatReport([
        { level: "ok", message: "a" },
        { level: "warn", message: "b" },
        { level: "error", message: "c" },
      ]),
    ).toBe("[OK] a\n[WARN] b\n[ERROR] c");
  });
});

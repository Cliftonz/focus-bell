import { HOOK_EVENTS, HOOK_MARKER } from "../../cli/merge";

export type DoctorInput = {
  hooksPath: string;
  hooksText: string | null;
  hookScriptPath: string;
  installedHookChecksum: string | null;
  bundledHookChecksum: string;
  nodeVersion: string | null;
  enterpriseHooksPath: string;
  enterpriseExists: boolean;
  projectHooksExists: boolean;
  recentEvents: { ts: string; conversation_id: string; event: string; state?: string }[];
  playerCmd: string | undefined;
  activeConversationId: string | undefined;
  activeTier: string | undefined;
  openEntries: { conversation_id: string; tier: string; start: string }[];
  missingThemeFiles: { theme: string; missing: string[] }[];
};

export type DoctorLine = { level: "ok" | "warn" | "error"; message: string };

const ok = (message: string): DoctorLine => ({ level: "ok", message });
const warn = (message: string): DoctorLine => ({ level: "warn", message });
const error = (message: string): DoctorLine => ({ level: "error", message });

type HookEntries = Record<string, { command?: unknown }[] | undefined>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function hookEntries(parsed: unknown): HookEntries | null {
  if (!isPlainObject(parsed)) return null;
  const hooks = parsed.hooks ?? {};
  if (!isPlainObject(hooks)) return null;
  if (HOOK_EVENTS.some((event) => hooks[event] !== undefined && !Array.isArray(hooks[event]))) return null;
  return hooks as HookEntries;
}

function hookLines(input: DoctorInput): DoctorLine[] {
  if (input.hooksText === null) return [error(`hooks file missing: ${input.hooksPath}`)];
  const parsed = parseJson(input.hooksText);
  if (parsed === undefined) return [error(`hooks file is not valid JSON: ${input.hooksPath}`)];
  const hooks = hookEntries(parsed);
  if (hooks === null) return [error(`hooks file has unexpected shape: ${input.hooksPath}`)];
  return HOOK_EVENTS.map((event) =>
    (hooks[event] ?? []).some((entry) => typeof entry.command === "string" && entry.command.includes(HOOK_MARKER))
      ? ok(`${event}: registered`)
      : error(`${event}: not registered`),
  );
}

function hookScriptLine(input: DoctorInput): DoctorLine {
  if (input.installedHookChecksum === null) return error(`hook script missing: ${input.hookScriptPath}`);
  if (input.installedHookChecksum !== input.bundledHookChecksum) return warn("hook script out of date");
  return ok("hook script up to date");
}

function eventLines(input: DoctorInput): DoctorLine[] {
  if (input.recentEvents.length === 0) return [warn("no events yet")];
  return input.recentEvents
    .slice(-5)
    .map((e) => ok(`${e.ts} ${e.event} ${e.state} ${e.conversation_id}`));
}

export function diagnose(input: DoctorInput): DoctorLine[] {
  return [
    ...hookLines(input),
    hookScriptLine(input),
    input.nodeVersion === null ? error("node not found on PATH") : ok(`node ${input.nodeVersion}`),
    input.enterpriseExists
      ? warn(`enterprise hooks file present, may override: ${input.enterpriseHooksPath}`)
      : ok("no enterprise hooks file"),
    ...(input.projectHooksExists ? [warn("project .cursor/hooks.json present, may shadow user hooks")] : []),
    ...eventLines(input),
    input.playerCmd === undefined ? error("no audio player found") : ok(`audio player: ${input.playerCmd}`),
    input.activeConversationId === undefined
      ? warn("no active conversation")
      : ok(`active conversation: ${input.activeConversationId} tier ${input.activeTier ?? "untagged"}`),
    ...(input.openEntries.length === 0
      ? [ok("no open time entries")]
      : input.openEntries.map((e) => ok(`open: ${e.conversation_id} ${e.tier} since ${e.start}`))),
    ...input.missingThemeFiles.map((t) => warn(`theme ${t.theme} missing ${t.missing.join(", ")}, using plain`)),
  ];
}

const TAGS = { ok: "[OK]", warn: "[WARN]", error: "[ERROR]" };

export function formatReport(lines: DoctorLine[]): string {
  return lines.map((l) => `${TAGS[l.level]} ${l.message}`).join("\n");
}

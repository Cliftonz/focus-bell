import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readSettings, type Settings } from "./config";
import { readTiers, type Tier } from "./state/tiers";
import { closeIdle, createTimeStore, markActivity, readOpen, tick, type TimeStore } from "./state/time";
import { createActiveTracker } from "./state/active";
import { createApprovalGate } from "./state/approval";
import { applyWorkspaceDefault } from "./state/workspaceDefault";
import { createRepeater } from "./sound/repeat";
import { routeAlert, type RouterEvent } from "./sound/router";
import { resolveTheme, type ResolvedTheme, type ThemeFiles } from "./sound/themes";
import { buildPlayCommand, LINUX_PLAYERS, play } from "./sound/player";
import { createTail } from "./hooks/tail";
import { parseEvent, readEvents, type HookEvent } from "./hooks/events";
import {
  applyInstall,
  cursorHooksPath,
  ENTERPRISE_HOOKS_PATH,
  installedHookPath,
  planInstall,
  projectHooksExist,
  type InstallPlan,
} from "./hooks/install";
import { createStatusBar, type StatusItem } from "./ui/statusBar";
import { diagnose, formatReport } from "./ui/doctor";
import { registerCommands } from "./commands";

const APPROVAL_DELAY_MS = 1500;
const IDLE_TICK_MS = 60000;
const EDIT_COALESCE_MS = 30000;
const INSTALLED_KEY = "focusBell.installed";
const TIER_CHOICES: (Tier | "clear")[] = ["primary", "secondary", "tertiary", "clear"];

type Paths = {
  dataDir: string;
  userThemes: string;
  eventsPath: string;
  tiersPath: string;
  bundledThemes: string;
  bundledHook: string;
};

type Session = {
  paths: Paths;
  timeStore: TimeStore;
  output: vscode.OutputChannel;
  settings: Settings;
  tracker: ReturnType<typeof createActiveTracker>;
  repeater: ReturnType<typeof createRepeater>;
  gate: ReturnType<typeof createApprovalGate>;
  statusBar: ReturnType<typeof createStatusBar>;
  lastState: Map<string, string>;
  warned: Set<string>;
  available: string[];
};

type ApplyPlan = Extract<InstallPlan, { kind: "apply" }>;

let session: Session;

export function activate(context: vscode.ExtensionContext): void {
  const paths = createPaths(context);
  const output = vscode.window.createOutputChannel("Focus Bell");
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  const timers = { setTimer: setTimeout, clearTimer: (handle: unknown) => clearTimeout(handle as NodeJS.Timeout) };
  session = {
    paths,
    output,
    timeStore: createTimeStore(paths.dataDir),
    settings: readSettings(getSetting),
    tracker: createActiveTracker(workspaceFolders()),
    repeater: createRepeater({ ...timers, play: (id) => playSlot(tierOf(id), "notification", false) }),
    gate: createApprovalGate({ delayMs: APPROVAL_DELAY_MS, ...timers, emit: alert }),
    statusBar: createStatusBar(statusItem as StatusItem),
    lastState: new Map(),
    warned: new Set(),
    available: LINUX_PLAYERS.filter((name) =>
      process.env.PATH!.split(path.delimiter).some((dir) => existsSync(path.join(dir, name))),
    ),
  };
  syncDebugFlag();
  if (process.env.FOCUS_BELL_SKIP_INSTALL !== "1") runInstall(context);
  const tail = wireTail();
  closeIdle(session.timeStore, lastEventTs(), now(), session.settings.idleMinutes);
  markActivity(session.timeStore, now());
  wireCommands(context);
  context.subscriptions.push(statusItem, output, wireSettings(), wireEditing(), tail, wireIdleTick());
  refreshStatus();
}

export function deactivate(): void {
  closeIdle(session.timeStore, lastEventTs(), now(), session.settings.idleMinutes);
}

const now = () => new Date().toISOString();

const getSetting = (key: string) => vscode.workspace.getConfiguration("focusBell").get(key);

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function workspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

function once(key: string, action: () => void): void {
  if (session.warned.has(key)) return;
  session.warned.add(key);
  action();
}

function createPaths(context: vscode.ExtensionContext): Paths {
  const dataDir = process.env.FOCUS_BELL_HOME || path.join(os.homedir(), ".focus-bell");
  const userThemes = path.join(dataDir, "themes");
  mkdirSync(userThemes, { recursive: true });
  const eventsPath = path.join(dataDir, "events.jsonl");
  if (!existsSync(eventsPath)) writeFileSync(eventsPath, "");
  return {
    dataDir,
    userThemes,
    eventsPath,
    tiersPath: path.join(dataDir, "tiers.json"),
    bundledThemes: path.join(context.extensionPath, "dist", "themes"),
    bundledHook: path.join(context.extensionPath, "dist", "hook", "hook.js"),
  };
}

function syncDebugFlag(): void {
  const flag = path.join(session.paths.dataDir, "debug");
  if (session.settings.debug) writeFileSync(flag, "");
  else rmSync(flag, { force: true });
}

function wireSettings(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration("focusBell")) return;
    session.settings = readSettings(getSetting);
    syncDebugFlag();
  });
}

function wireEditing(): vscode.Disposable {
  let lastMark = 0;
  return vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.scheme !== "file" || Date.now() - lastMark < EDIT_COALESCE_MS) return;
    lastMark = Date.now();
    markActivity(session.timeStore, now());
  });
}

function wireIdleTick(): vscode.Disposable {
  const interval = setInterval(() => {
    tick(session.timeStore, now(), session.settings.idleMinutes);
    closeIdle(session.timeStore, lastEventTs(), now(), session.settings.idleMinutes);
  }, IDLE_TICK_MS);
  return new vscode.Disposable(() => clearInterval(interval));
}

function wireTail(): vscode.Disposable {
  const tail = createTail(session.paths.eventsPath, (line) => {
    const event = parseEvent(line);
    if (event === undefined) {
      once("events", () => session.output.appendLine("Focus Bell: skipped an unreadable line in events.jsonl."));
      return;
    }
    handle(event);
  });
  return new vscode.Disposable(() => tail.close());
}

function lastEventTs(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const event of readEvents(session.paths.eventsPath)) result[event.conversation_id] = event.ts;
  return result;
}

function handle(event: HookEvent): void {
  const { tracker, repeater, lastState, gate, timeStore, paths } = session;
  tracker.onEvent(event);
  repeater.stop(event.conversation_id);
  lastState.set(event.conversation_id, event.state);
  if (event.event === "beforeSubmitPrompt") {
    const ts = now();
    markActivity(timeStore, ts);
    applyWorkspaceDefault(paths.tiersPath, timeStore, event, ts);
  }
  gate.onEvent(event);
  if (event.state !== "needs_approval") alert(event);
  refreshStatus();
}

function tierOf(id: string): Tier {
  return readTiers(session.paths.tiersPath)[id]?.tier ?? session.settings.defaultTier;
}

function themeFor(tier: Tier): ResolvedTheme | null {
  const name = session.settings.tiers[tier].theme;
  if (name === null) return null;
  const resolved = resolveTheme(name, session.paths.bundledThemes, session.paths.userThemes);
  if (resolved.missing.length > 0) {
    once("theme:" + name, () =>
      vscode.window.showWarningMessage(
        "Focus Bell: theme " + name + " missing " + resolved.missing.join(", ") + ", using plain.",
      ),
    );
  }
  return resolved;
}

function alert(event: RouterEvent): void {
  const tier = tierOf(event.conversation_id);
  const theme = themeFor(tier);
  if (theme === null) return;
  const routed = routeAlert({
    event,
    tierConfig: session.settings.tiers[tier],
    theme,
    windowFocused: vscode.window.state.focused,
    activeConversationId: session.tracker.current(),
  });
  if (routed === null) return;
  playFile(routed.file, theme.volume);
  if (routed.repeat) session.repeater.start(event.conversation_id);
}

function playSlot(tier: Tier, slot: keyof ThemeFiles, warnMissing: boolean): void {
  const theme = themeFor(tier);
  if (theme === null) return;
  const file = theme.files[slot];
  if (file !== undefined) {
    playFile(file, theme.volume);
    return;
  }
  if (!warnMissing) return;
  once("slot:" + theme.name + "/" + slot, () =>
    vscode.window.showWarningMessage("Focus Bell: theme " + theme.name + " has no " + slot + ".wav."),
  );
}

function playFile(file: string, volume: number): void {
  const command = buildPlayCommand(process.platform, file, volume, session.available);
  if (command === undefined) {
    once("player", () => session.output.appendLine("Focus Bell: no audio player found."));
    return;
  }
  play(command, spawn, (err) => session.output.appendLine("Focus Bell: player error: " + err.message + "."));
}

function refreshStatus(): void {
  const active = session.tracker.current();
  session.statusBar.update(
    active === undefined ? undefined : readTiers(session.paths.tiersPath)[active]?.tier,
    active === undefined ? undefined : session.lastState.get(active),
  );
}

function wireCommands(context: vscode.ExtensionContext): void {
  const { paths, timeStore, settings, repeater, tracker } = session;
  registerCommands(
    (id, handler) =>
      context.subscriptions.push(
        vscode.commands.registerCommand(id, async (...args: unknown[]) => {
          markActivity(timeStore, now());
          await handler(...args);
          refreshStatus();
        }),
      ),
    {
      tiersPath: paths.tiersPath,
      timeStore,
      eventsPath: paths.eventsPath,
      defaultTier: settings.defaultTier,
      now,
      activeConversationId: tracker.current,
      workspaceFolder: () => workspaceFolders()[0],
      repeater,
      playTest: (tier, slot) => playSlot(tier, slot as keyof ThemeFiles, true),
      openFile: (p) => vscode.workspace.openTextDocument(p).then((doc) => vscode.window.showTextDocument(doc)),
      showDoctor,
      warn: (m) => vscode.window.showWarningMessage(m),
      pickTier: async () =>
        (await vscode.window.showQuickPick(TIER_CHOICES, {
          placeHolder: "Focus Bell: tier for the active conversation, or the workspace default when none is active.",
        })) as Tier | "clear" | undefined,
    },
  );
}

function showDoctor(): void {
  const { paths, tracker, timeStore, output, available } = session;
  const hooksPath = cursorHooksPath(os.homedir());
  const hookScriptPath = installedHookPath(os.homedir());
  const enterpriseHooksPath = ENTERPRISE_HOOKS_PATH[process.platform];
  const active = tracker.current();
  const report = diagnose({
    hooksPath,
    hookScriptPath,
    hooksText: existsSync(hooksPath) ? readFileSync(hooksPath, "utf8") : null,
    installedHookChecksum: existsSync(hookScriptPath) ? sha256(hookScriptPath) : null,
    bundledHookChecksum: sha256(paths.bundledHook),
    nodeVersion: nodeVersion(),
    enterpriseHooksPath,
    enterpriseExists: existsSync(enterpriseHooksPath),
    projectHooksExists: projectHooksExist(workspaceFolders()),
    recentEvents: readEvents(paths.eventsPath),
    playerCmd: buildPlayCommand(process.platform, "x.wav", 1, available)?.cmd,
    activeConversationId: active,
    activeTier: active === undefined ? undefined : readTiers(paths.tiersPath)[active]?.tier,
    openEntries: Object.entries(readOpen(timeStore).entries).map(([conversation_id, entry]) => ({
      conversation_id,
      tier: entry.tier,
      start: entry.start,
    })),
    missingThemeFiles: missingThemeFiles(),
  });
  output.clear();
  output.appendLine(formatReport(report));
  output.show(true);
}

function nodeVersion(): string | null {
  const result = spawnSync("node", ["-v"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function missingThemeFiles(): { theme: string; missing: string[] }[] {
  const { settings, paths } = session;
  return Object.values(settings.tiers)
    .flatMap((cfg) => (cfg.theme === null ? [] : [resolveTheme(cfg.theme, paths.bundledThemes, paths.userThemes)]))
    .filter((theme) => theme.missing.length > 0)
    .map((theme) => ({ theme: theme.name, missing: theme.missing }));
}

function runInstall(context: vscode.ExtensionContext): void {
  const plan = planInstall({
    homeDir: os.homedir(),
    bundledHookPath: session.paths.bundledHook,
    platform: process.platform,
    workspaceFolders: workspaceFolders(),
    now: now(),
  });
  const version: string = context.extension.packageJSON.version;
  const firstRun = context.globalState.get(INSTALLED_KEY) !== version;
  if (firstRun && plan.enterpriseExists) {
    vscode.window.showWarningMessage(
      "Focus Bell: enterprise hooks file present, it may take precedence. Run Focus Bell: Doctor.",
    );
  }
  if (plan.kind === "invalid") promptInvalid(plan);
  else if (plan.kind === "apply" && firstRun) promptFirstInstall(context, plan, version);
  else if (plan.kind === "apply") promptReinstall(plan);
}

function promptInvalid(plan: Extract<InstallPlan, { kind: "invalid" }>): void {
  vscode.window
    .showErrorMessage("Focus Bell: ~/.cursor/hooks.json is not valid JSON, nothing was changed.", "Show me what to add")
    .then(async (choice) => {
      if (choice !== "Show me what to add") return;
      const doc = await vscode.workspace.openTextDocument({ content: plan.suggestedEntry, language: "json" });
      await vscode.window.showTextDocument(doc);
    });
}

function promptFirstInstall(context: vscode.ExtensionContext, plan: ApplyPlan, version: string): void {
  vscode.window
    .showInformationMessage(
      "Focus Bell: register its hook in ~/.cursor/hooks.json?",
      { modal: true, detail: plan.after },
      "Install hooks",
      "I'll do it manually",
    )
    .then((choice) => {
      if (choice === undefined) return;
      if (choice === "Install hooks") install(plan);
      context.globalState.update(INSTALLED_KEY, version);
    });
}

function promptReinstall(plan: ApplyPlan): void {
  vscode.window
    .showWarningMessage("Focus Bell: hook entry missing from ~/.cursor/hooks.json.", "Reinstall")
    .then((choice) => {
      if (choice === "Reinstall") install(plan);
    });
}

function install(plan: ApplyPlan): void {
  applyInstall(plan);
  vscode.window.showInformationMessage("Focus Bell: hooks installed, restart Cursor to load them.");
}

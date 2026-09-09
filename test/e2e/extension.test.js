const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const COMMAND_IDS = [
  "focusBell.setPrimary",
  "focusBell.setSecondary",
  "focusBell.setTertiary",
  "focusBell.clearTier",
  "focusBell.doctor",
  "focusBell.testSound",
  "focusBell.showLog",
  "focusBell.acknowledge",
  "focusBell.markCloud",
  "focusBell.pickTier",
];

suite("focus-bell", () => {
  test("registers all commands", async () => {
    const ext = vscode.extensions.getExtension("zacclifton.focus-bell");
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of COMMAND_IDS) {
      assert.ok(commands.includes(id), id + " not registered");
    }
  });

  test("setPrimary without an active conversation writes a workspace default", async () => {
    await vscode.commands.executeCommand("focusBell.setPrimary");
    const tiers = JSON.parse(fs.readFileSync(path.join(process.env.FOCUS_BELL_HOME, "tiers.json"), "utf8"));
    const key = Object.keys(tiers).find((k) => k.startsWith("workspace:"));
    assert.ok(key, "no workspace key in tiers.json");
    assert.strictEqual(tiers[key].tier, "primary");
  });

  test("doctor runs", async () => {
    await vscode.commands.executeCommand("focusBell.doctor");
  });

  test("doctor runs with a corrupt events line", async () => {
    const lines = fs.readFileSync(path.join(process.env.FOCUS_BELL_HOME, "events.jsonl"), "utf8").split("\n");
    assert.strictEqual(lines[0], "{partial");
    assert.strictEqual(JSON.parse(lines[1]).event, "stop");
    await vscode.commands.executeCommand("focusBell.doctor");
  });
});

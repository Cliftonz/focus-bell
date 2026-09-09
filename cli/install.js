#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mergeHookEntry } = require("./merge.js");

function main() {
  const subcommand = process.argv[2] || "install";
  if (subcommand !== "install") {
    console.log("usage: focus-bell install");
    process.exitCode = 1;
    return;
  }

  const home = process.env.FOCUS_BELL_TEST_HOME || os.homedir();
  const installedHook = path.join(home, ".focus-bell", "hook.js");
  fs.mkdirSync(path.dirname(installedHook), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "..", "hook", "hook.js"), installedHook);

  const hooksPath = path.join(home, ".cursor", "hooks.json");
  const existing = fs.existsSync(hooksPath) ? fs.readFileSync(hooksPath, "utf8") : null;
  const entry = { command: 'node "' + installedHook.split(path.sep).join("/") + '"', timeout: 5 };
  const result = mergeHookEntry(existing, entry);

  if (!result.ok) {
    console.log("hooks.json is not valid JSON: " + hooksPath);
    console.log("Add this entry by hand:");
    process.stdout.write(mergeHookEntry(null, entry).merged);
    process.exitCode = 1;
    return;
  }

  if (!result.changed) {
    console.log("focus-bell hook already installed in " + hooksPath);
    return;
  }

  if (existing !== null) {
    const backupPath = hooksPath + ".bak." + new Date().toISOString().replace(/:/g, "-");
    fs.copyFileSync(hooksPath, backupPath);
    console.log("backup: " + backupPath);
  }
  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  fs.writeFileSync(hooksPath, result.merged);
  console.log("installed focus-bell hook into " + hooksPath);
  console.log("restart Cursor to load it");
}

main();

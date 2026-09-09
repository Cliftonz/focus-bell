const fs = require("fs");
const os = require("os");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "focus-bell-e2e-"));
const workspace = path.join(sandbox, "ws");
const home = path.join(sandbox, "home");
fs.mkdirSync(workspace);
fs.mkdirSync(home);

const stopEvent = {
  ts: new Date().toISOString(),
  conversation_id: "c1",
  generation_id: "g1",
  event: "stop",
  state: "done",
  workspace_roots: [workspace],
};
fs.writeFileSync(path.join(home, "events.jsonl"), "{partial\n" + JSON.stringify(stopEvent) + "\n");

runTests({
  extensionDevelopmentPath: path.join(__dirname, "..", ".."),
  extensionTestsPath: path.join(__dirname, "suite", "index.js"),
  launchArgs: [workspace, "--disable-extensions"],
  extensionTestsEnv: {
    FOCUS_BELL_HOME: home,
    FOCUS_BELL_SKIP_INSTALL: "1",
  },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

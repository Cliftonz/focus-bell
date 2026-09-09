const fs = require("fs");
const path = require("path");
const os = require("os");

const states = {
  beforeSubmitPrompt: "thinking",
  beforeShellExecution: "needs_approval",
  afterShellExecution: "thinking",
  afterAgentResponse: "responded",
  postToolUseFailure: "error",
};

function stateFor(payload) {
  if (payload.hook_event_name === "stop") {
    return payload.status === "completed" ? "done" : "error";
  }
  return states[payload.hook_event_name] || "unknown";
}

const raw = fs.readFileSync(0, "utf8");
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const home = process.env.FOCUS_BELL_HOME || path.join(os.homedir(), ".focus-bell");
fs.mkdirSync(home, { recursive: true });

if (fs.existsSync(path.join(home, "debug"))) {
  fs.appendFileSync(path.join(home, "hook.log"), raw + "\n");
}

const line = {
  ts: new Date().toISOString(),
  conversation_id: payload.conversation_id,
  generation_id: payload.generation_id,
  event: payload.hook_event_name,
  state: stateFor(payload),
};
if (payload.is_interrupt === true) line.is_interrupt = true;
line.workspace_roots = payload.workspace_roots;
line.transcript_path = payload.transcript_path;
line.model = payload.model;
line.cursor_version = payload.cursor_version;

fs.appendFileSync(path.join(home, "events.jsonl"), JSON.stringify(line) + "\n");

if (payload.hook_event_name === "beforeShellExecution") {
  process.stdout.write('{"permission":"allow"}\n');
}

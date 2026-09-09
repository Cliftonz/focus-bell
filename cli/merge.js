const HOOK_EVENTS = [
  "beforeSubmitPrompt",
  "beforeShellExecution",
  "afterShellExecution",
  "afterAgentResponse",
  "postToolUseFailure",
  "stop",
];

const HOOK_MARKER = ".focus-bell/hook.js";

const INVALID = { ok: false, reason: "invalid_json" };

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasHook(entries) {
  return entries.some(
    (existing) => typeof existing.command === "string" && existing.command.includes(HOOK_MARKER),
  );
}

function mergeHookEntry(text, entry) {
  let config = {};
  if (text !== null) {
    try {
      config = JSON.parse(text);
    } catch {
      return INVALID;
    }
  }
  if (!isPlainObject(config) || Array.isArray(config.hooks)) return INVALID;
  if (config.version === undefined) config.version = 1;
  if (!isPlainObject(config.hooks)) config.hooks = {};
  for (const event of HOOK_EVENTS) {
    if (config.hooks[event] !== undefined && !Array.isArray(config.hooks[event])) return INVALID;
  }

  let changed = false;
  for (const event of HOOK_EVENTS) {
    const entries = config.hooks[event] || (config.hooks[event] = []);
    if (hasHook(entries)) continue;
    entries.push(entry);
    changed = true;
  }

  return { ok: true, merged: JSON.stringify(config, null, 2) + "\n", changed };
}

module.exports = { HOOK_EVENTS, HOOK_MARKER, mergeHookEntry };

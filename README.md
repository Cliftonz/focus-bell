# Focus Bell

A Cursor extension that tags agent chats as primary, secondary or tertiary, plays a distinct sound per tier when a chat needs approval, finishes or errors, and keeps a time log per tier.

It is built on Cursor hooks. The hook appends one line per event to a file and the extension tails that file. No terminal scraping, no polling.

## Install

1. Install the `.vsix`.
2. Accept the hook modal.
3. Restart Cursor.

To install the hook only, without the extension: `npx focus-bell install`.

Either path copies the hook to `~/.focus-bell/hook.js` and registers it in `~/.cursor/hooks.json`. If `hooks.json` already exists and the install changes it, a `hooks.json.bak.<timestamp>` copy is written first. The hook runs with `node`, so `node` must be on `PATH`.

## Commands

| Command | Keybinding | macOS |
| --- | --- | --- |
| Focus Bell: Set Primary | `ctrl+alt+1` | `cmd+alt+1` |
| Focus Bell: Set Secondary | `ctrl+alt+2` | `cmd+alt+2` |
| Focus Bell: Set Tertiary | `ctrl+alt+3` | `cmd+alt+3` |
| Focus Bell: Clear Tier | `ctrl+alt+0` | `cmd+alt+0` |
| Focus Bell: Doctor | | |
| Focus Bell: Test Sound | | |
| Focus Bell: Show Event Log | | |
| Focus Bell: Acknowledge | | |
| Focus Bell: Mark Conversation As Cloud | | |
| Status bar item (click opens the tier quick pick) | | |

Acknowledge stops the repeat alert for the active conversation.

Doctor writes a report to the Focus Bell output channel, one line each, in this order: hook entry per event, hook script checksum against the bundled copy, `node` on `PATH`, enterprise hooks file, project `.cursor/hooks.json`, last 5 events, audio player, active conversation and its tier, open time entries, missing theme files.

### Workspace defaults

Pressing a tier key with no active conversation stores a default for the open folder. The next new conversation in that folder is tagged with it at its first prompt and a time entry opens.

## Settings

`focusBell.tiers` default:

```json
{
  "primary": { "theme": "loud", "repeat": true, "respectFocusMute": false },
  "secondary": { "theme": "plain", "repeat": false, "respectFocusMute": true },
  "tertiary": { "theme": null, "repeat": false, "respectFocusMute": true }
}
```

`theme: null` means silent. `respectFocusMute` suppresses the sound when the window is focused and the event is from the active conversation.

The needs-approval sound fires 1.5 s after a shell command is proposed, unless the command already finished in that window (auto-approved). For tiers with `repeat: true` it re-plays at 15s, 30s, 60s and then every minute for up to 10 minutes, or until Acknowledge.

- `focusBell.defaultTier` (default `secondary`): tier used for every alert, and for Test Sound, when the conversation is untagged.
- `focusBell.idleMinutes` (default `10`): two rules use it. Idle starts after `idleMinutes` without a submitted prompt, an edit to a file document, or a Focus Bell command; other hook events do not reset it, and open entries count the time from then as idle seconds. Separately, an open entry is closed once its latest known activity (any hook event for it, its start, or the global last activity) is older than `idleMinutes`, and it closes at that point. This check runs on activate, every minute, and on window close.
- `focusBell.debug` (default `false`): writes raw hook payloads to `~/.focus-bell/hook.log`.

## Sounds

A theme is a folder:

```
<name>/
  theme.json        {"name": "<name>", "volume": 0.6}
  notification.wav  required; needs approval, error
  done.wav          required; done
  prompt.wav        optional; prompt submitted only
  response.wav      optional; agent responded
```

`volume` is applied on macOS only; Windows and Linux ignore it.

`plain` and `loud` are bundled. User themes live in `~/.focus-bell/themes/<name>` and take precedence over a bundled theme of the same name. A user theme missing a required file falls back to `plain`; Doctor reports the missing files.

Playback: macOS `afplay`; Windows PowerShell `Media.SoundPlayer` (wav only); Linux `paplay`, `aplay` or `play`, whichever is found first, silent if none.

## Files in `~/.focus-bell`

- `events.jsonl`: one line per hook event, written by the hook.
- `tiers.json`: conversation id (or workspace key) to tier.
- `open.json`: currently open time entries and idle state.
- `time.jsonl`: closed time entries with `active_seconds` and `idle_seconds`.
- `hook.log`: raw hook payloads when `focusBell.debug` is on.
- `debug`: presence of this file turns on `hook.log`.
- `themes/`: user themes.

The field names in `time.jsonl` and `tiers.json` are a contract for the rollup command. Do not rename them.

Two Cursor windows share the same files. Entries are only closed once they have been idle for `focusBell.idleMinutes`, so a live window's entries survive another window closing.

## Cloud agents

Cursor docs say user-level hooks do not run for cloud agents. Coverage is unverified in v0.1. To flag a time entry as cloud work, run Focus Bell: Mark Conversation As Cloud; it sets `mode` to `cloud` on the open entry for the active conversation.

## Development

```
npm install
npm test            # vitest
npm run build       # esbuild to dist/, copies hook and themes
npm run test:e2e    # extension host tests, downloads VS Code stable
npm run package     # build and vsce package
```

CI runs typecheck, tests and build on ubuntu, macOS and Windows.

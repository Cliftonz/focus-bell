export type PlayCommand = { cmd: string; args: string[] };

export const LINUX_PLAYERS = ["paplay", "aplay", "play"];

export const KILL_AFTER_MS = 10000;

export function buildPlayCommand(
  platform: NodeJS.Platform,
  file: string,
  volume: number,
  available: string[],
): PlayCommand | undefined {
  if (platform === "darwin") {
    return { cmd: "afplay", args: ["-v", String(volume), file] };
  }
  if (platform === "win32") {
    return {
      cmd: "powershell",
      args: [
        "-NoProfile",
        "-c",
        "(New-Object Media.SoundPlayer '" + file.replaceAll("'", "''") + "').PlaySync()",
      ],
    };
  }
  const cmd = LINUX_PLAYERS.find((name) => available.includes(name));
  return cmd === undefined ? undefined : { cmd, args: [file] };
}

export type Spawner = (
  cmd: string,
  args: string[],
  opts: { detached: true; stdio: "ignore"; windowsHide: true },
) => {
  unref(): void;
  kill(): void;
  on(event: "error", listener: (err: Error) => void): unknown;
};

export function play(command: PlayCommand, spawn: Spawner, onError: (err: Error) => void): void {
  const child = spawn(command.cmd, command.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", onError);
  child.unref();
  setTimeout(() => child.kill(), KILL_AFTER_MS);
}

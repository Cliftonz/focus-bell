import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

describe("package.json scaffold", () => {
  it("targets vscode ^1.90.0", () => {
    expect(pkg.engines.vscode).toBe("^1.90.0");
  });

  it("declares exactly the nine commands", () => {
    const ids = pkg.contributes.commands.map((c: { command: string }) => c.command).sort();
    expect(ids).toEqual(
      [
        "focusBell.setPrimary",
        "focusBell.setSecondary",
        "focusBell.setTertiary",
        "focusBell.clearTier",
        "focusBell.doctor",
        "focusBell.testSound",
        "focusBell.showLog",
        "focusBell.acknowledge",
        "focusBell.markCloud",
      ].sort()
    );
  });

  it("binds the four tier keys with mac variants", () => {
    const byCommand = Object.fromEntries(
      pkg.contributes.keybindings.map((k: { command: string; key: string; mac: string }) => [
        k.command,
        { key: k.key, mac: k.mac },
      ])
    );
    expect(byCommand).toEqual({
      "focusBell.setPrimary": { key: "ctrl+alt+1", mac: "cmd+alt+1" },
      "focusBell.setSecondary": { key: "ctrl+alt+2", mac: "cmd+alt+2" },
      "focusBell.setTertiary": { key: "ctrl+alt+3", mac: "cmd+alt+3" },
      "focusBell.clearTier": { key: "ctrl+alt+0", mac: "cmd+alt+0" },
    });
  });

  it("ships configuration defaults", () => {
    const props = pkg.contributes.configuration.properties;
    expect(props["focusBell.tiers"].default).toEqual({
      primary: { theme: "loud", repeat: true, respectFocusMute: false },
      secondary: { theme: "plain", repeat: false, respectFocusMute: true },
      tertiary: { theme: null, repeat: false, respectFocusMute: true },
    });
    expect(props["focusBell.defaultTier"].default).toBe("secondary");
    expect(props["focusBell.idleMinutes"].default).toBe(10);
    expect(props["focusBell.idleMinutes"].minimum).toBe(1);
    expect(props["focusBell.debug"].default).toBe(false);
  });

  it("defines the build, test, e2e and package scripts", () => {
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts["test:e2e"]).toBe("npm run build && node test/e2e/runTest.js");
    expect(pkg.scripts.package).toBe("npm run build && vsce package --allow-missing-repository");
  });

  it("exposes the installer binary", () => {
    expect(pkg.bin["focus-bell"]).toBe("cli/install.js");
  });
});

describe("build", () => {
  it("cleans dist before bundling", () => {
    const root = join(__dirname, "..");
    const dist = join(root, "dist");
    const stale = join(dist, "stale.txt");
    mkdirSync(dist, { recursive: true });
    writeFileSync(stale, "");
    spawnSync(process.execPath, [join(root, "esbuild.mjs")], { cwd: root });
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(join(dist, "extension.js"))).toBe(true);
  });
});

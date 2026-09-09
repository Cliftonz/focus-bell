import { build } from "esbuild";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
});

if (existsSync("hook/hook.js")) {
  mkdirSync("dist/hook", { recursive: true });
  copyFileSync("hook/hook.js", "dist/hook/hook.js");
}

if (existsSync("themes")) {
  cpSync("themes", "dist/themes", { recursive: true });
}

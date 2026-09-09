import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

describe("ci workflow", () => {
  const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");

  it("runs on ubuntu, macos and windows", () => {
    expect(ci).toContain("ubuntu-latest");
    expect(ci).toContain("macos-latest");
    expect(ci).toContain("windows-latest");
  });

  it("typechecks, tests and builds", () => {
    expect(ci).toContain("npx tsc --noEmit");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run build");
  });
});

describe("gitattributes", () => {
  it("marks wav files binary", () => {
    expect(readFileSync(join(root, ".gitattributes"), "utf8")).toContain("*.wav binary");
  });
});

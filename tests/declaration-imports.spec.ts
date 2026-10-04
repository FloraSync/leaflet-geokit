import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(
    join(
      process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir(),
      "geokit-declarations-",
    ),
  );
  directories.push(directory);
  return directory;
}
const script = resolve("scripts/resolve-declaration-imports.mjs");
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("declaration import normalization", () => {
  it("resolves imports, re-exports and import types without changing string types", () => {
    const directory = fixture();
    mkdirSync(join(directory, "nested"));
    writeFileSync(
      join(directory, "dep.d.ts"),
      "export interface Value { id: string }\n",
    );
    writeFileSync(
      join(directory, "nested/index.d.ts"),
      "export interface Nested {}\n",
    );
    writeFileSync(
      join(directory, "index.d.ts"),
      'import type { Value } from "./dep";\nexport * from "./nested";\nexport type V = import("./dep").Value;\nexport type Literal = "./dep";\nexport type Existing = import("./dep.js").Value;\n',
    );
    execFileSync(process.execPath, [script, directory]);
    const result = readFileSync(join(directory, "index.d.ts"), "utf8");
    expect(result).toContain('from "./dep.js"');
    expect(result).toContain('from "./nested/index.js"');
    expect(result).toContain('V = import("./dep.js").Value');
    expect(result).toContain('Literal = "./dep"');
    execFileSync(process.execPath, [script, directory]);
    expect(readFileSync(join(directory, "index.d.ts"), "utf8")).toBe(result);
  });
  it("fails closed for a missing declaration target", () => {
    const directory = fixture();
    writeFileSync(
      join(directory, "index.d.ts"),
      'export * from "./missing";\n',
    );
    expect(() =>
      execFileSync(process.execPath, [script, directory], { stdio: "pipe" }),
    ).toThrow();
  });
});

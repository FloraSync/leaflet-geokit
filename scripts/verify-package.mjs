import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run after build. Never publish or install packages, and never modify node_modules.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(
  join(process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir(), "geokit-consumer-"),
);
try {
  const output = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch],
    { cwd: root, encoding: "utf8", env: { ...process.env, HUSKY: "0" } },
  );
  // npm versions that still run prepare can prefix --json with Husky output.
  const jsonStart = output.indexOf("[\n");
  assert.ok(jsonStart >= 0, "npm pack did not return its JSON file manifest");
  const [pack] = JSON.parse(output.slice(jsonStart));
  const files = new Set(pack.files.map(({ path }) => path));
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const [name, conditions] of Object.entries(manifest.exports)) {
    assert.ok(conditions.types, `${name}: missing types condition`);
    for (const target of Object.values(conditions)) {
      assert.ok(
        files.has(target.replace(/^\.\//, "")),
        `${name}: missing packed target ${target}`,
      );
    }
  }
  assert.ok(
    ![...files].some((file) => /(?:\.spec|\.test)\.d\.ts$/.test(file)),
    "test declarations leaked into package",
  );
  for (const file of [
    "ARCHITECTURE.md",
    "docs/api-reference.md",
    "docs/custom-toolbar.md",
    "docs/diagnostics.md",
    "docs/integration-recipes.md",
    "docs/release-verification.md",
    "custom-toolbar.html",
  ]) {
    assert.ok(files.has(file), `missing consumer documentation: ${file}`);
  }
  const modules = join(scratch, "node_modules");
  mkdirSync(join(modules, "@florasync", "leaflet-geokit"), { recursive: true });
  execFileSync("tar", [
    "-xzf",
    join(scratch, pack.filename),
    "--strip-components=1",
    "-C",
    join(modules, "@florasync", "leaflet-geokit"),
  ]);
  // Reuse installed compiler/peer dependencies without linking the source package.
  for (const entry of readdirSync(join(root, "node_modules"))) {
    if (entry.startsWith(".") || entry === "@florasync") continue;
    symlinkSync(join(root, "node_modules", entry), join(modules, entry), "dir");
  }
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  const imports = Object.keys(manifest.exports)
    .map((subpath, index) => {
      const name = manifest.name + (subpath === "." ? "" : subpath.slice(1));
      return `import type * as Entry${index} from ${JSON.stringify(name)};\nexport type Consumer${index} = typeof Entry${index};`;
    })
    .join("\n");
  writeFileSync(join(scratch, "consumer.ts"), imports);
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ["ES2022", "DOM"],
        types: ["node"],
      },
      files: ["consumer.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "-p",
      join(scratch, "tsconfig.json"),
    ],
    { cwd: scratch, stdio: "inherit" },
  );
  console.log(
    `Packed consumer passed: ${Object.keys(manifest.exports).length} export paths; ${files.size} packed files; strict NodeNext declaration compilation.`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

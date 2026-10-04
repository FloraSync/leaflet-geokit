import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

// tsc-alias versions differ in whether rewritten declaration imports gain .js.
// Normalize only actual relative module specifiers, never arbitrary string types.
const root = resolve(process.argv[2] || "dist/types");
let changed = 0;
function visitDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      visitDirectory(file);
      continue;
    }
    if (!file.endsWith(".d.ts")) continue;
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const edits = [];
    function visit(node) {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : undefined;
      if (
        specifier &&
        ts.isStringLiteral(specifier) &&
        specifier.text.startsWith(".") &&
        !/\.(?:[cm]?js|json)$/.test(specifier.text)
      ) {
        const target = resolve(dirname(file), specifier.text);
        const suffix = existsSync(`${target}.d.ts`)
          ? ".js"
          : existsSync(join(target, "index.d.ts"))
            ? "/index.js"
            : null;
        if (!suffix)
          throw new Error(
            `Unresolved declaration import ${specifier.text} in ${file}`,
          );
        edits.push({
          start: specifier.getStart(source),
          end: specifier.end,
          text: JSON.stringify(specifier.text + suffix),
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (edits.length) {
      let output = text;
      for (const edit of edits.sort((a, b) => b.start - a.start))
        output =
          output.slice(0, edit.start) + edit.text + output.slice(edit.end);
      writeFileSync(file, output);
      changed += edits.length;
    }
  }
}
visitDirectory(root);
console.log(`Normalized ${changed} relative declaration import(s).`);

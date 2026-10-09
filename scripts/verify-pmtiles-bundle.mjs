// Run after npm run build. Assert optionality from real emitted artifacts.
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const peers = ["maplibre-gl", "@maplibre/maplibre-gl-leaflet", "pmtiles"];
const pkg = JSON.parse(await read("package.json"));
for (const peer of peers) {
  assert.equal(pkg.peerDependenciesMeta[peer].optional, true);
  assert.equal(pkg.dependencies[peer], undefined);
}
for (const name of ["es", "umd", "external.es"]) {
  const map = JSON.parse(await read(`dist/leaflet-geokit.${name}.js.map`));
  const leaked = map.sources.filter((source) =>
    /(?:maplibre|pmtiles)/i.test(source),
  );
  assert.deepEqual(
    leaked,
    [],
    `${name} must not bundle optional renderer code`,
  );
  console.log(
    `${name}: ${map.sources.length} sources, no MapLibre/PMTiles modules`,
  );
}
const entry = pkg.exports["./pmtiles"];
const code = await read(entry.import);
for (const peer of ["leaflet", ...peers]) {
  assert.ok(code.includes(`from "${peer}"`), `${peer} must remain external`);
}
await stat(new URL(entry.types, root));
console.log(
  `Optional entrypoint: ${Buffer.byteLength(code)} bytes; all peers external; declarations present`,
);

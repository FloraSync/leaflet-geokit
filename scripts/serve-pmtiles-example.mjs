import { createServer as createHTTPServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
const bytes = await readFile(
  new URL("../test-data/pmtiles/fields.pmtiles", import.meta.url),
);
const archiveServer = createHTTPServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5197");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, ETag");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", "application/vnd.pmtiles");
  res.setHeader("ETag", '"geokit-fields-v1"');
  if (req.url !== "/fields.pmtiles") {
    res.writeHead(404);
    res.end("Missing archive");
    return;
  }
  const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
  if (!match) {
    res.writeHead(400);
    res.end("Range required");
    return;
  }
  const start = Number(match[1]);
  const end = Math.min(Number(match[2]), bytes.length - 1);
  if (start > end) {
    res.writeHead(416, { "Content-Range": `bytes */${bytes.length}` });
    res.end();
    return;
  }
  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
    "Content-Length": end - start + 1,
  });
  res.end(bytes.subarray(start, end + 1));
});
await new Promise((resolve) =>
  archiveServer.listen(5198, "127.0.0.1", resolve),
);
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: true,
    hmr: false,
    watch: { usePolling: true },
  },
});
await vite.listen();
async function close() {
  await vite.close();
  archiveServer.close();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);

/**
 * Static file server for the headless smokes.
 *
 * The smokes need the dogfood page and the generated reports over HTTP: a report
 * opened from `file://` cannot fetch its own widgets. In the zero-design-system
 * monorepo that job belongs to `scripts/stands/ensure.py`, but this repository
 * stands on its own — hence forty lines here rather than a dependency, or a
 * `python -m http.server` the kit would have to assume is installed.
 *
 * Not a general-purpose server: no directory listing, no range requests, no
 * caching. Serving the report correctly needs exactly two things beyond reading a
 * file — an `index.html` for a directory, and a content type the browser accepts
 * for ES modules.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

async function resolveTarget(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  // `normalize` collapses `..` before the prefix check, so a crafted path cannot
  // walk out of the served directory.
  const candidate = resolve(root, `.${normalize(decoded)}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return undefined;
  }

  const found = await stat(candidate).catch(() => undefined);
  if (found?.isDirectory()) {
    const index = join(candidate, "index.html");
    return (await stat(index).catch(() => undefined))?.isFile() ? index : undefined;
  }
  return found?.isFile() ? candidate : undefined;
}

/**
 * @param {{ root: string, port: number }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startStatic({ root, port }) {
  const base = resolve(root);

  const server = createServer(async (request, response) => {
    const target = await resolveTarget(base, request.url ?? "/");
    if (!target) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections?.();
        server.close(() => done());
      }),
  };
}
